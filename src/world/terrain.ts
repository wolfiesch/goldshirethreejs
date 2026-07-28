import * as THREE from 'three';
import { leafMat, mat, waterMat } from '../gen/materials';
import { fbm, makeRng, range, smoothstep, valueNoise2D } from '../gen/rng';
import type { TickFn } from '../core/types';
import { APRON, INN_FORECOURT, LAKE, ROADS, type RoadRect, type RoadSegment, TERRAIN_VOIDS, type Vec2, VERGE_WIDTH, flatInset } from './layout';

/**
 * Ground, roads and Crystal Lake. Terrain is forced to exactly y = 0 under
 * every road and every building pad, feathered out over the next 6 m, so
 * nothing has to be re-levelled per building.
 */

const SIZE = 320;
const SEGS = 160;

const terrainNoise = valueNoise2D(makeRng(0xf00d));
const edgeNoise = valueNoise2D(makeRng(0xbead));

export interface Terrain {
  group: THREE.Group;
  heightAt(x: number, z: number): number;
}

/** Rolling ground, levelled under roads and pads, dropping into the lake bed. */
export function heightAt(x: number, z: number): number {
  const rolling = (fbm(terrainNoise, x * 0.012, z * 0.012, 3, 0.5) * 2 - 1) * 1.2;
  const flat = smoothstep(-9, -3, flatInset(x, z));
  let y = rolling * (1 - flat);
  const shore = smoothstep(LAKE.shoreStart, LAKE.shoreEnd, x);
  if (shore > 0) y = y * (1 - shore) + LAKE.bedY * shore;
  return y;
}

/** Ribbon of road between two points; edges wander so nothing looks stamped. */
function ribbon(a: Vec2, b: Vec2, width: number, y: number, material: THREE.Material, tile: number): THREE.Mesh {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.ceil(len / 4));
  const nx = -dz / len;
  const nz = dx / len;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = a[0] + dx * t;
    const pz = a[1] + dz * t;
    for (const s of [-1, 1]) {
      const wobble = (edgeNoise(px * 0.09, pz * 0.09 + (s > 0 ? 31 : 0)) - 0.5) * 1.0;
      const half = width / 2 + wobble;
      positions.push(px + nx * half * s, y, pz + nz * half * s);
      uvs.push((px + nx * half * s) / tile, (pz + nz * half * s) / tile);
    }
  }
  for (let i = 0; i < steps; i++) {
    const o = i * 2;
    // Wound so the face normal is +Y; the other order leaves every road
    // back-facing and therefore invisible from above.
    indices.push(o, o + 3, o + 2, o, o + 1, o + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Roads sit on flat ground; stop them fighting the terrain plane.
  mesh.renderOrder = 1;
  return mesh;
}

/** Rounded, wobbly rectangle laid flat: the junction apron and inn forecourt. */
function apronMesh(rect: RoadRect, y: number, material: THREE.Material, tile: number): THREE.Mesh {
  const [cx, cz] = rect.centre;
  const [sx, sz] = rect.size;
  const shape = new THREE.Shape();
  const steps = 64;
  const r = Math.min(sx, sz) * 0.28;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Superellipse gives square-ish corners with a soft radius.
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const p = 2 + (Math.min(sx, sz) / r) * 0.35;
    const k = Math.pow(Math.pow(Math.abs(ct), p) + Math.pow(Math.abs(st), p), -1 / p);
    const ex = cx + ct * k * (sx / 2);
    const ez = cz + st * k * (sz / 2);
    const wobble = (edgeNoise(ex * 0.1, ez * 0.1) - 0.5) * 1.1;
    const ox = cx + ct * k * (sx / 2 + wobble);
    const oz = cz + st * k * (sz / 2 + wobble);
    if (i === 0) shape.moveTo(ox, -oz);
    else shape.lineTo(ox, -oz);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

function roadY(surface: RoadSegment['surface'], verge: boolean): number {
  if (verge) return 0.012;
  return surface === 'cobble' ? 0.022 : 0.017;
}

/**
 * Drops every ground triangle that touches a `TERRAIN_VOIDS` rectangle. The
 * test is bounding-box overlap, not centroid-inside, so the hole is always at
 * least as large as the rect: a hole one grid cell too small would leave a
 * sheet of grass hanging inside the cellar.
 */
function cutVoids(geo: THREE.BufferGeometry): void {
  if (TERRAIN_VOIDS.length === 0) return;
  const index = geo.getIndex();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (!index) return;
  const kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    const minX = Math.min(pos.getX(a), pos.getX(b), pos.getX(c));
    const maxX = Math.max(pos.getX(a), pos.getX(b), pos.getX(c));
    const minZ = Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    const maxZ = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    let inVoid = false;
    for (const [vx0, vz0, vx1, vz1] of TERRAIN_VOIDS) {
      if (maxX > vx0 && minX < vx1 && maxZ > vz0 && minZ < vz1) {
        inVoid = true;
        break;
      }
    }
    if (!inVoid) kept.push(a, b, c);
  }
  geo.setIndex(kept);
}

export function buildTerrain(): Terrain {
  const group = new THREE.Group();
  group.name = 'terrain';

  // ---- ground -------------------------------------------------------------
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  cutVoids(geo);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, mat('grass', 64, 64));
  ground.receiveShadow = true;
  ground.castShadow = false;
  ground.name = 'ground';
  group.add(ground);

  // ---- roads: dirt verge, then the running surface ------------------------
  const dirt = mat('dirt');
  const cobble = mat('cobble');
  for (const seg of ROADS) {
    if (seg.surface === 'cobble') {
      group.add(ribbon(seg.a, seg.b, seg.width + VERGE_WIDTH * 2, roadY(seg.surface, true), dirt, 4));
    }
    group.add(ribbon(seg.a, seg.b, seg.width, roadY(seg.surface, false), seg.surface === 'cobble' ? cobble : dirt, seg.surface === 'cobble' ? 3 : 4));
  }
  for (const rect of [APRON, INN_FORECOURT]) {
    group.add(
      apronMesh({ ...rect, size: [rect.size[0] + VERGE_WIDTH * 2, rect.size[1] + VERGE_WIDTH * 2] }, roadY('cobble', true), dirt, 4),
    );
    group.add(apronMesh(rect, roadY('cobble', false), cobble, 3));
  }

  // ---- Crystal Lake -------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(LAKE.size[0], LAKE.size[1]);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat());
  water.position.set(LAKE.centre[0], LAKE.surfaceY, LAKE.centre[1]);
  water.userData.collide = false;
  water.receiveShadow = false;
  water.castShadow = false;
  const scrollTick: TickFn = (_dt, elapsed) => {
    const m = waterMat().map;
    if (m) m.offset.set((elapsed * 0.012) % 1, (elapsed * 0.008) % 1);
  };
  water.userData.tick = scrollTick;
  group.add(water);

  group.add(buildReeds());

  return { group, heightAt };
}

/** Reed clumps in the shallows: three crossed alpha quads per clump. */
function buildReeds(): THREE.InstancedMesh {
  const rng = makeRng(0x5eed);
  const clumps: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 260; i++) {
    const x = range(rng, 98, 108);
    const z = range(rng, -62, 82);
    const y = heightAt(x, z);
    if (y > 0.1) continue;
    const s = range(rng, 0.7, 1.5);
    p.set(x, y + s * 0.5, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(rng, 0, Math.PI));
    scale.set(s, s, s);
    clumps.push(m.clone().compose(p, q, scale));
  }

  const quad = new THREE.PlaneGeometry(1.0, 1.2);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const c = quad.clone();
    c.rotateY((i / 3) * Math.PI);
    parts.push(c);
  }
  const merged = mergeSimple(parts);
  const inst = new THREE.InstancedMesh(merged, leafMat(), clumps.length);
  inst.name = 'reeds';
  for (let i = 0; i < clumps.length; i++) inst.setMatrixAt(i, clumps[i]);
  inst.instanceMatrix.needsUpdate = true;
  inst.userData.collide = false;
  inst.castShadow = false;
  inst.receiveShadow = false;
  return inst;
}

/** Minimal position/normal/uv concatenation; avoids pulling in BufferGeometryUtils here. */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const p = part.attributes.position as THREE.BufferAttribute;
    const n = part.attributes.normal as THREE.BufferAttribute;
    const u = part.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(u.getX(i), u.getY(i));
    }
    const idx = part.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    offset += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}
