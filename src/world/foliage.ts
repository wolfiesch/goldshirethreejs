import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coneMat, leafMat, mat } from '../gen/materials';
import { taperedPost } from '../gen/prims';
import { clamp, makeRng, poissonDisc, range, type Rng } from '../gen/rng';
import { PLACEMENTS, ROADS, SPECIMEN_TREES, distanceToSegment, flatInset, rotateOffset } from './layout';
import { groundY } from './terrain';

/**
 * Every tree, bush and grass tuft in the 320 x 320 m world, as a handful of
 * InstancedMeshes. Crowns are crossed alpha cards: a broad rounded canopy that
 * reads from any angle for a fraction of the cost of real leaf geometry.
 *
 * Wind sway lives in leafMat()/coneMat() via onBeforeCompile; nothing here
 * touches a shader.
 */

const FOLIAGE_SEED = 0x0f01ace;

/** Canonical heights. Per-tree height is applied as a uniform instance scale,
 *  so a taller tree also carries a proportionally larger crown.
 *
 *  Elwynn is closed canopy: the references show 2 to 4 m trunks with the first
 *  branch 15 to 20 m up and the crowns meeting overhead, which is why the
 *  village reads as a clearing cut into a forest rather than a field with
 *  shrubs around it. */
const BROADLEAF_H = 22;
const CONIFER_H = 26;

/**
 * Crown and trunk dimensions as fractions of tree height.
 *
 * They used to be absolute metres, which quietly coupled them to whatever
 * `*_H` happened to be: raising the height alone would have left a sapling's
 * canopy perched on a mature trunk.
 */
const BROADLEAF = { crownW: 0.652, crownH: 0.565, crownY: 0.72, skirtY: 0.55, trunkH: 0.42, rBase: 0.045, rTop: 0.028 };
const CONIFER = { tierW0: 0.356, tierW1: 0.141, tierH0: 0.341, tierH1: 0.193, trunkH: 0.78, rBase: 0.026, rTop: 0.0105 };

const CONIFER_SHARE = 0.12;
const RING_TARGET = 420;
const RING_INNER = 78;
/** Beyond this radius the ring thins linearly so the far edge dissolves into
 *  fog rather than ending in a hard line. */
const THIN_START = 130;
const THIN_END = 190;
/** Trees past this radius stop casting shadows; they live in their own
 *  InstancedMesh because castShadow is per-object, not per-instance. */
const SHADOW_CUTOFF = 90;

const BUSH_COUNT = 260;
const GRASS_COUNT = 1400;

const TAU = Math.PI * 2;

interface TreeInstance {
  matrix: THREE.Matrix4;
  conifer: boolean;
  far: boolean;
}

/* ------------------------------------------------------------------ parts */

/** Three crossed cards at 0/60/120 degrees plus one horizontal card below. */
function broadleafCrownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = BROADLEAF_H * BROADLEAF.crownW;
  const h = BROADLEAF_H * BROADLEAF.crownH;
  for (let i = 0; i < 3; i++) {
    const card = new THREE.PlaneGeometry(w, h);
    card.rotateY((i / 3) * Math.PI);
    card.translate(0, BROADLEAF_H * BROADLEAF.crownY, 0);
    parts.push(card);
  }
  const flat = new THREE.PlaneGeometry(w * 0.8, h * 0.8);
  flat.rotateX(-Math.PI / 2);
  flat.translate(0, BROADLEAF_H * BROADLEAF.skirtY, 0);
  parts.push(flat);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Four stacked skirt tiers, each a crossed pair of cone cards. */
function coniferCardGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const w = CONIFER_H * (CONIFER.tierW0 + (CONIFER.tierW1 - CONIFER.tierW0) * t);
    const h = CONIFER_H * (CONIFER.tierH0 + (CONIFER.tierH1 - CONIFER.tierH0) * t);
    const y = CONIFER_H * (0.2 + 0.52 * t);
    for (let k = 0; k < 2; k++) {
      const card = new THREE.PlaneGeometry(w, h);
      card.rotateY((k * Math.PI) / 2);
      card.translate(0, y, 0);
      parts.push(card);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Crossed cards on a unit footprint; instance scale sets the real size. */
function crossedCardGeometry(cards: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < cards; i++) {
    const card = new THREE.PlaneGeometry(1, 1);
    card.rotateY((i / cards) * Math.PI);
    card.translate(0, 0.5, 0);
    parts.push(card);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/* -------------------------------------------------------------- placement */

function onRoad(x: number, z: number): boolean {
  for (const r of ROADS) {
    if (distanceToSegment(x, z, r.a, r.b) < 9) return true;
  }
  return false;
}

/** A tree may stand here: clear of the lake, of every road corridor, and 4 m
 *  clear of every flattened road polygon or building pad. */
function treeAllowed(x: number, z: number): boolean {
  if (x > 96) return false;
  if (flatInset(x, z) > -4) return false;
  return !onRoad(x, z);
}

/**
 * Weighted top-k selection (Efraimidis-Spirakis): key = u^(1/w), keep the
 * largest `RING_TARGET` keys. Deterministic, and the thinning weight makes the
 * far edge fade out instead of stopping dead.
 */
function selectForestRing(rng: Rng, candidates: Array<[number, number]>): Array<[number, number]> {
  const scored: Array<{ p: [number, number]; key: number }> = [];
  for (const p of candidates) {
    const radius = Math.hypot(p[0], p[1]);
    if (radius <= RING_INNER) continue;
    const w = radius <= THIN_START ? 1 : clamp(1 - (radius - THIN_START) / (THIN_END - THIN_START), 0, 1);
    if (w <= 0) continue;
    scored.push({ p, key: Math.pow(rng(), 1 / w) });
  }
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, RING_TARGET).map((s) => s.p);
}

function makeTreeInstance(rng: Rng, x: number, z: number): TreeInstance {
  const conifer = rng() < CONIFER_SHARE;
  const height = conifer ? range(rng, 21, 30) : range(rng, 18, 25);
  const scale = height / (conifer ? CONIFER_H : BROADLEAF_H);
  const spin = range(rng, 0, TAU);
  const leanDir = range(rng, 0, TAU);
  const lean = ((6 * Math.PI) / 180) * range(rng, 0.35, 1);

  const euler = new THREE.Euler(Math.sin(leanDir) * lean, spin, Math.cos(leanDir) * lean, 'YXZ');
  // The lift belongs in the instance matrix, not in a later pass:
  // buildTrunkCollision bakes this same matrix, so the collision proxy follows
  // the terrain for free and cannot drift from what you see.
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, groundY(x, z), z),
    new THREE.Quaternion().setFromEuler(euler),
    new THREE.Vector3(scale, scale, scale),
  );
  return { matrix, conifer, far: Math.hypot(x, z) > SHADOW_CUTOFF };
}

/* ---------------------------------------------------------------- builders */

interface InstanceSpec {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
  castShadow: boolean;
  collide: boolean;
  /** Uniform tint applied to every instance, used to darken the conifers. */
  tint?: THREE.Color;
}

function makeInstanced(spec: InstanceSpec): THREE.InstancedMesh | null {
  if (spec.matrices.length === 0) return null;
  const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, spec.matrices.length);
  mesh.name = spec.name;
  for (let i = 0; i < spec.matrices.length; i++) mesh.setMatrixAt(i, spec.matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  if (spec.tint) {
    for (let i = 0; i < spec.matrices.length; i++) mesh.setColorAt(i, spec.tint);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  mesh.castShadow = spec.castShadow;
  mesh.receiveShadow = false;
  if (!spec.collide) mesh.userData.collide = false;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * buildCollider skips InstancedMesh, so trunk collision is baked here into a
 * single merged mesh: one 5-sided cylinder per tree at its world transform.
 *
 * `buildCollider` unhides invisible meshes for the bake and restores them
 * afterwards (StaticGeometryGenerator walks with `traverseVisible`), so the
 * proxy is simply `visible = false` and costs nothing to render.
 */
function buildTrunkCollision(trees: TreeInstance[]): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (const t of trees) {
    const H = t.conifer ? CONIFER_H : BROADLEAF_H;
    const spec = t.conifer ? CONIFER : BROADLEAF;
    const h = H * spec.trunkH * 0.98;
    // 0.9x matches the inradius of the visual 7-gon/6-gon trunks.
    const rBase = H * spec.rBase * 0.9;
    const rTop = H * spec.rTop * 0.9;
    const geo = new THREE.CylinderGeometry(rTop, rBase, h, 5, 1, true);
    geo.translate(0, h / 2, 0);
    geo.applyMatrix4(t.matrix);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  const mesh = new THREE.Mesh(merged, mat('bark'));
  mesh.name = 'trunkCollision';
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Bushes hug the treeline edge and the outside of building pads. */
function placeBushes(rng: Rng): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const pads = PLACEMENTS.filter((p) => p.pad[0] * p.pad[1] >= 18);
  const edgeTarget = Math.round(BUSH_COUNT * 0.65);

  const push = (x: number, z: number): void => {
    const size = range(rng, 1.2, 2.0);
    out.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, groundY(x, z), z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, range(rng, 0, TAU), 0)),
        new THREE.Vector3(size, size * range(rng, 0.8, 1.1), size),
      ),
    );
  };

  for (let guard = 0; out.length < edgeTarget && guard < 40000; guard++) {
    const a = range(rng, 0, TAU);
    const r = range(rng, 60, 90);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (x > 96 || flatInset(x, z) > -1.5 || onRoad(x, z)) continue;
    push(x, z);
  }

  for (let guard = 0; out.length < BUSH_COUNT && guard < 40000; guard++) {
    const p = pads[Math.min(pads.length - 1, Math.floor(rng() * pads.length))];
    const a = range(rng, 0, TAU);
    // The ring is laid out in the pad's own frame and then turned with it, so a
    // building facing the oblique road keeps its bushes against its walls.
    const lx = Math.cos(a) * (p.pad[0] / 2 + range(rng, 0.5, 2.4));
    const lz = Math.sin(a) * (p.pad[1] / 2 + range(rng, 0.5, 2.4));
    const [ox, oz] = rotateOffset(lx, lz, p.rotY);
    const x = p.pos[0] + ox;
    const z = p.pos[2] + oz;
    if (x > 96 || flatInset(x, z) > -0.2) continue;
    push(x, z);
  }
  return out;
}

/** Grass only near the player's usual haunts, and never on a road or a pad. */
function placeGrass(rng: Rng): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  for (let guard = 0; out.length < GRASS_COUNT && guard < 400000; guard++) {
    const a = range(rng, 0, TAU);
    const r = Math.sqrt(rng()) * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // -3 clears the 2.5 m dirt verge flanking every cobbled section.
    if (flatInset(x, z) > -3) continue;
    const size = range(rng, 0.3, 0.6);
    out.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, groundY(x, z), z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, range(rng, 0, TAU), 0)),
        new THREE.Vector3(size, size * range(rng, 0.85, 1.25), size),
      ),
    );
  }
  return out;
}

export function buildFoliage(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'foliage';
  const rng = makeRng(FOLIAGE_SEED);

  const candidates = poissonDisc(rng, -160, -160, 160, 160, 5.5).filter(([x, z]) => treeAllowed(x, z));
  const ring = selectForestRing(rng, candidates);

  const trees: TreeInstance[] = [];
  for (const [x, z] of ring) trees.push(makeTreeInstance(rng, x, z));
  for (const [x, z] of SPECIMEN_TREES) trees.push(makeTreeInstance(rng, x, z));

  const broadNear: THREE.Matrix4[] = [];
  const broadFar: THREE.Matrix4[] = [];
  const coniNear: THREE.Matrix4[] = [];
  const coniFar: THREE.Matrix4[] = [];
  for (const t of trees) {
    if (t.conifer) (t.far ? coniFar : coniNear).push(t.matrix);
    else (t.far ? broadFar : broadNear).push(t.matrix);
  }

  const bark = mat('bark');
  const leaf = leafMat();
  const cone = coneMat();
  const broadTrunk = taperedPost(
    BROADLEAF_H * BROADLEAF.trunkH,
    BROADLEAF_H * BROADLEAF.rBase,
    BROADLEAF_H * BROADLEAF.rTop,
    7,
    bark,
  ).geometry;
  const broadCrown = broadleafCrownGeometry();
  const coniTrunk = taperedPost(
    CONIFER_H * CONIFER.trunkH,
    CONIFER_H * CONIFER.rBase,
    CONIFER_H * CONIFER.rTop,
    6,
    bark,
  ).geometry;
  const coniCard = coniferCardGeometry();
  const bushGeo = crossedCardGeometry(2);
  const grassGeo = crossedCardGeometry(3);
  const coniferTint = new THREE.Color(0.68, 0.74, 0.68);
  const grassTint = new THREE.Color(0.92, 1.0, 0.72);

  const specs: InstanceSpec[] = [
    { name: 'broadleafTrunkNear', geometry: broadTrunk, material: bark, matrices: broadNear, castShadow: true, collide: true },
    { name: 'broadleafTrunkFar', geometry: broadTrunk, material: bark, matrices: broadFar, castShadow: false, collide: true },
    { name: 'broadleafCrownNear', geometry: broadCrown, material: leaf, matrices: broadNear, castShadow: true, collide: false },
    { name: 'broadleafCrownFar', geometry: broadCrown, material: leaf, matrices: broadFar, castShadow: false, collide: false },
    { name: 'coniferTrunkNear', geometry: coniTrunk, material: bark, matrices: coniNear, castShadow: true, collide: true, tint: coniferTint },
    { name: 'coniferTrunkFar', geometry: coniTrunk, material: bark, matrices: coniFar, castShadow: false, collide: true, tint: coniferTint },
    { name: 'coniferCardNear', geometry: coniCard, material: cone, matrices: coniNear, castShadow: true, collide: false, tint: coniferTint },
    { name: 'coniferCardFar', geometry: coniCard, material: cone, matrices: coniFar, castShadow: false, collide: false, tint: coniferTint },
    { name: 'bushes', geometry: bushGeo, material: leaf, matrices: placeBushes(rng), castShadow: false, collide: false },
    { name: 'grassTufts', geometry: grassGeo, material: leaf, matrices: placeGrass(rng), castShadow: false, collide: false, tint: grassTint },
  ];

  for (const spec of specs) {
    const mesh = makeInstanced(spec);
    if (mesh) root.add(mesh);
  }

  root.add(buildTrunkCollision(trees));
  return root;
}
