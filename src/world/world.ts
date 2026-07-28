import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVillageProps } from '../build/props';
import type { TickFn } from '../core/types';
import { LAYOUT } from './buildings';
import { buildFoliage } from './foliage';
import { buildTerrain, groundY } from './terrain';

export interface World {
  root: THREE.Group;
  tickables: TickFn[];
  interiorLights: THREE.PointLight[];
  /**
   * Height of the walkable surface. This is `groundY` and not `heightAt`: the
   * two differ by up to about 5 cm, and anything placed against the ideal
   * height field rather than the mesh hovers or sinks.
   */
  groundY(x: number, z: number): number;
}

/**
 * Assembles the village: terrain, every LAYOUT entry, outdoor props and
 * foliage, then merges the static geometry per building so the draw-call
 * count stays flat as detail is added.
 */
export function buildWorld(): World {
  const root = new THREE.Group();
  root.name = 'world';

  const terrain = buildTerrain();
  root.add(terrain.group);

  for (const place of LAYOUT) {
    const group = place.build();
    group.name = place.id;
    group.position.set(place.pos[0], place.pos[1], place.pos[2]);
    group.rotation.y = place.rotY;
    mergeStatic(group);
    root.add(group);
  }

  const props = buildVillageProps();
  props.name = 'props';
  mergeStatic(props);
  root.add(props);
  root.add(buildFoliage());

  root.updateMatrixWorld(true);

  const tickables: TickFn[] = [];
  const interiorLights: THREE.PointLight[] = [];
  root.traverse((o) => {
    const tick = o.userData.tick as TickFn | undefined;
    if (typeof tick === 'function') tickables.push(tick);
    const light = o as THREE.PointLight;
    if (light.isPointLight && light.userData.interior) {
      // Stashed once, here, because `root.updateMatrixWorld` has just run and
      // none of these lights ever moves again. The render loop culls against
      // this rather than recomputing a world position every frame.
      light.userData.worldPos = light.getWorldPosition(new THREE.Vector3());
      interiorLights.push(light);
    }
  });

  return { root, tickables, interiorLights, groundY };
}

/**
 * Materials whose meshes must stay unmerged. Glass and flame are safe to merge
 * because every pane and every candle shares one material instance, so the
 * merged mesh keeps the same blend state and sort position; water and cobwebs
 * move or need to sort against each other.
 */
const UNMERGEABLE = new Set(['water', 'smoke', 'cobweb']);

/**
 * Merges a building's static meshes in place, grouped by material. Geometry is
 * baked into the group's local space first: `mergeGeometries` does not apply
 * transforms, and skipping that collapses everything onto the group origin.
 */
function mergeStatic(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; castShadow: boolean; receiveShadow: boolean }>();
  const doomed: THREE.Mesh[] = [];

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(mesh.material)) return;
    const material = mesh.material as THREE.Material;
    if (UNMERGEABLE.has(material.name)) return;
    // Anything animated keeps its own transform.
    let node: THREE.Object3D | null = mesh;
    while (node && node !== group) {
      if (node.userData.tick) return;
      node = node.parent;
    }
    if (!mesh.geometry.attributes.position || !mesh.geometry.attributes.uv) return;

    const geo = mesh.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    for (const attr of Object.keys(geo.attributes)) {
      if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') geo.deleteAttribute(attr);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.getIndex()) {
      const count = geo.attributes.position.count;
      geo.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    let bucket = buckets.get(material);
    if (!bucket) {
      bucket = { geos: [], castShadow: false, receiveShadow: false };
      buckets.set(material, bucket);
    }
    bucket.geos.push(geo);
    bucket.castShadow ||= mesh.castShadow;
    bucket.receiveShadow ||= mesh.receiveShadow;
    doomed.push(mesh);
  });

  for (const mesh of doomed) mesh.removeFromParent();

  for (const [material, bucket] of buckets) {
    if (bucket.geos.length === 0) continue;
    const merged = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    if (!merged) {
      // Attribute mismatch: fall back to keeping them separate.
      for (const geo of bucket.geos) group.add(new THREE.Mesh(geo, material));
      continue;
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    mesh.name = `${group.name}:${material.name}`;
    group.add(mesh);
    if (bucket.geos.length > 1) for (const geo of bucket.geos) geo.dispose();
  }
}
