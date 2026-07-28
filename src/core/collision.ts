import * as THREE from 'three';
import { MeshBVH, StaticGeometryGenerator, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Patch once at module load so every geometry can carry a bounds tree.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const CAPSULE_RADIUS = 0.35;
export const CAPSULE_BOTTOM = 0.35;
export const CAPSULE_TOP = 1.45;

const SUBSTEPS = 5;

/**
 * Collidable is the default. A mesh opts out with `userData.collide = false`
 * (foliage, flames, glass, rugs, hanging props, water, sky).
 */
function isCollidable(o: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = o;
  while (node) {
    if (node.userData.collide === false) return false;
    node = node.parent;
  }
  return true;
}

/** Merges every collidable mesh in the subtree into one static BVH mesh. */
export function buildCollider(root: THREE.Object3D): THREE.Mesh {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (!isCollidable(m)) return;
    if (!m.geometry.attributes.position) return;
    meshes.push(m);
  });

  // StaticGeometryGenerator walks with `traverseVisible`, so a hidden collision
  // proxy would contribute zero triangles. Unhide for the bake, then restore.
  const hidden = meshes.filter((m) => !m.visible);
  for (const m of hidden) m.visible = true;
  const generator = new StaticGeometryGenerator(meshes);
  generator.attributes = ['position'];
  generator.useGroups = false;
  const merged = generator.generate();
  for (const m of hidden) m.visible = false;
  merged.boundsTree = new MeshBVH(merged, { targetLeafSize: 12 });

  const collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff88 }));
  collider.name = 'collider';
  collider.visible = false;
  collider.userData.collide = false;
  collider.matrixAutoUpdate = false;
  return collider;
}

export interface MoveResult {
  position: THREE.Vector3;
  grounded: boolean;
}

const tmpBox = new THREE.Box3();
const tmpSegment = new THREE.Line3();
const tmpVec = new THREE.Vector3();
const triPoint = new THREE.Vector3();
const capsulePoint = new THREE.Vector3();
const totalPush = new THREE.Vector3();
const result: MoveResult = { position: new THREE.Vector3(), grounded: false };

/**
 * Capsule sweep against the merged BVH, five substeps per frame. Pushing the
 * capsule out along the shortest separation resolves 0.2 m stair risers as
 * ramps, so no explicit step-up logic is needed.
 */
export function moveCapsule(pos: THREE.Vector3, vel: THREE.Vector3, dt: number, collider: THREE.Mesh): MoveResult {
  const bvh = collider.geometry.boundsTree as MeshBVH | undefined;
  result.position.copy(pos);
  result.grounded = false;
  if (!bvh) {
    result.position.addScaledVector(vel, dt);
    return result;
  }

  const step = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    result.position.addScaledVector(vel, step);

    tmpSegment.start.set(result.position.x, result.position.y + CAPSULE_BOTTOM, result.position.z);
    tmpSegment.end.set(result.position.x, result.position.y + CAPSULE_TOP, result.position.z);
    tmpBox.makeEmpty();
    tmpBox.expandByPoint(tmpSegment.start);
    tmpBox.expandByPoint(tmpSegment.end);
    tmpBox.min.addScalar(-CAPSULE_RADIUS);
    tmpBox.max.addScalar(CAPSULE_RADIUS);

    totalPush.set(0, 0, 0);
    bvh.shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(tmpBox),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(tmpSegment, triPoint, capsulePoint);
        if (distance < CAPSULE_RADIUS) {
          const depth = CAPSULE_RADIUS - distance;
          tmpVec.copy(capsulePoint).sub(triPoint);
          if (tmpVec.lengthSq() < 1e-12) tri.getNormal(tmpVec);
          tmpVec.normalize();
          tmpSegment.start.addScaledVector(tmpVec, depth);
          tmpSegment.end.addScaledVector(tmpVec, depth);
          totalPush.addScaledVector(tmpVec, depth);
        }
      },
    });

    if (totalPush.lengthSq() > 0) {
      const len = totalPush.length();
      if (totalPush.y > 0.15 * len) result.grounded = true;
      result.position.set(tmpSegment.start.x, tmpSegment.start.y - CAPSULE_BOTTOM, tmpSegment.start.z);
      // Kill the velocity component driving into the surface.
      tmpVec.copy(totalPush).normalize();
      const into = vel.dot(tmpVec);
      if (into < 0) vel.addScaledVector(tmpVec, -into);
    }
  }

  return result;
}
