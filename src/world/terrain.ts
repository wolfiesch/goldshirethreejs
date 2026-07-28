import * as THREE from 'three';
import { leafMat, mat, waterMat } from '../gen/materials';
import { clamp, fbm, makeRng, range, smoothstep, valueNoise2D } from '../gen/rng';
import type { TickFn } from '../core/types';
import { APRON, INN_FORECOURT, ROADS, type RoadRect, type RoadSegment, TERRAIN_VOIDS, type Vec2, VERGE_WIDTH, WATER, type WaterBody, flatInset, outsideRect, rotateOffset } from './layout';

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

/** Rolling ground, levelled under roads and pads, dropping into a water bed. */
export function heightAt(x: number, z: number): number {
  const rolling = (fbm(terrainNoise, x * 0.012, z * 0.012, 3, 0.5) * 2 - 1) * 1.2;
  const flat = smoothstep(-9, -3, flatInset(x, z));
  let y = rolling * (1 - flat);
  for (const w of WATER) y = Math.min(y, basinY(w, x, z, y));
  return y;
}

/**
 * Distance out from a waterline, negative in the water. The rectangle is the
 * authored shape and the noise is what stops it looking authored: a lake whose
 * edge is exactly a rectangle reads as a swimming pool from any angle low
 * enough to see the shore. Everything that cares where the water ends goes
 * through this, so reeds and the foliage clamp wobble with it.
 */
export function shoreDistance(w: WaterBody, x: number, z: number): number {
  const amp = shoreWobble(w);
  // Frequency scales with the body too, so a pond gets two or three
  // undulations along each edge rather than one lazy bulge.
  const freq = 0.9 / Math.max(7, amp * 3);
  return outsideRect(x, z, w.centre, w.size) + (edgeNoise(x * freq, z * freq) - 0.5) * amp;
}

/**
 * Peak-to-peak wander of a waterline. Scaled to the body: an amplitude that
 * reads as a ragged lake edge punches islands through a pond a fifth the size.
 */
function shoreWobble(w: WaterBody): number {
  return Math.min(5, Math.min(w.size[0], w.size[1]) * 0.16);
}

/**
 * Ground under and around one water body: grade at the outer edge of the shore
 * band, exactly `surfaceY` on the waterline, `bedY` once `depthRun` inside.
 * Returns `grade` untouched beyond the band, so `heightAt` can take the
 * minimum across bodies and let the deeper one win where two ever meet.
 */
function basinY(w: WaterBody, x: number, z: number, grade: number): number {
  const d = shoreDistance(w, x, z);
  if (d > w.shoreBand) return grade;
  if (d >= 0) {
    // The beach starts from a lip guaranteed to clear the waterline. Blending
    // straight from `grade` leaves the whole band under water wherever the
    // rolling ground happens to dip below `surfaceY`, and the sheet then ends
    // on open grass with a dead straight edge.
    const lip = Math.max(grade, w.surfaceY + 0.4);
    return lip + (w.surfaceY - lip) * smoothstep(0, 1, 1 - d / w.shoreBand);
  }
  return w.surfaceY + (w.bedY - w.surfaceY) * smoothstep(0, 1, Math.min(1, -d / w.depthRun));
}

const CELL = SIZE / SEGS;
const HALF = SIZE / 2;

/**
 * Ground height as the surface you actually stand on, which is not `heightAt`.
 *
 * The ground is a `PlaneGeometry` sampled at `CELL` spacing, so the real
 * surface is the piecewise-linear interpolation of `heightAt` across those
 * triangles. Chord versus arc over a 2 m cell differs by up to about 5 cm,
 * which is exactly the gap between a barrel resting on the ground and a barrel
 * hovering above it, so every placement has to sample the chord.
 *
 * The triangulation below mirrors `PlaneGeometry`'s: each cell splits into
 * (a, b, d) and (b, c, d) with a at the low corner, so the diagonal runs from
 * (x0, z1) to (x1, z0).
 *
 * Inside a `TERRAIN_VOIDS` rectangle there is no ground at all and this returns
 * the height the ground would have had. Nothing is placed in one: they exist
 * to make room for the cellar.
 */
export function groundY(x: number, z: number): number {
  const fx = clamp((x + HALF) / CELL, 0, SEGS);
  const fz = clamp((z + HALF) / CELL, 0, SEGS);
  const ix = Math.min(SEGS - 1, Math.floor(fx));
  const iz = Math.min(SEGS - 1, Math.floor(fz));
  const u = fx - ix;
  const v = fz - iz;
  const x0 = -HALF + ix * CELL;
  const z0 = -HALF + iz * CELL;
  const x1 = x0 + CELL;
  const z1 = z0 + CELL;
  const ha = heightAt(x0, z0);
  const hb = heightAt(x0, z1);
  const hd = heightAt(x1, z0);
  if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
  const hc = heightAt(x1, z1);
  return hb + (hc - hb) * (u + v - 1) + (hd - hb) * (1 - v);
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
  const rotY = rect.rotY ?? 0;
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
    // The superellipse is built in the rect's own frame and rotated out to
    // world. The edge wobble is sampled in world space either way, so the
    // ground noise does not spin with the apron.
    const [ex, ez] = rotateOffset(ct * k * (sx / 2), st * k * (sz / 2), rotY);
    const wobble = (edgeNoise((cx + ex) * 0.1, (cz + ez) * 0.1) - 0.5) * 1.1;
    const [wx, wz] = rotateOffset(ct * k * (sx / 2 + wobble), st * k * (sz / 2 + wobble), rotY);
    const ox = cx + wx;
    const oz = cz + wz;
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
  /*
   * Each apron gets its own height. Every cobble ribbon and both aprons used
   * to sit at 0.022 and already overlapped about a metre at the junction;
   * oblique arms turn that into large overlap lozenges, and coplanar surfaces
   * z-fight into a flickering moire that no amount of renderOrder fixes.
   */
  for (const [rect, vergeY, surfaceY] of [
    [APRON, 0.012, 0.024],
    [INN_FORECOURT, 0.013, 0.026],
  ] as Array<[RoadRect, number, number]>) {
    group.add(
      apronMesh({ ...rect, size: [rect.size[0] + VERGE_WIDTH * 2, rect.size[1] + VERGE_WIDTH * 2] }, vergeY, dirt, 4),
    );
    group.add(apronMesh(rect, surfaceY, cobble, 3));
  }

  // ---- standing water -----------------------------------------------------
  // One tick drives every surface: the material is shared, so scrolling its
  // map once per frame moves all of them.
  const scrollTick: TickFn = (_dt, elapsed) => {
    const m = waterMat().map;
    if (m) m.offset.set((elapsed * 0.012) % 1, (elapsed * 0.008) % 1);
  };
  for (const w of WATER) {
    // Just past the furthest the waterline can wander, and no further. The
    // wobble is plus or minus half the amplitude, so half of it plus a little
    // slack covers the outermost shore; give it a whole amplitude and the
    // sheet's straight edge ends up over dry grass, reading as a laid tarp.
    const margin = shoreWobble(w) * 0.5 + 0.8;
    const waterGeo = new THREE.PlaneGeometry(w.size[0] + margin * 2, w.size[1] + margin * 2);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat());
    water.position.set(w.centre[0], w.surfaceY, w.centre[1]);
    water.userData.collide = false;
    water.receiveShadow = false;
    water.castShadow = false;
    water.userData.tick = w === WATER[0] ? scrollTick : undefined;
    group.add(water);
    group.add(buildReeds(w));
  }

  return { group, heightAt };
}

/**
 * Reed clumps standing in the shallows of one water body: three crossed alpha
 * quads per clump. Sampled across the whole waterline rather than along a band
 * of x, so the reeds follow the shore wherever the shore happens to be.
 */
function buildReeds(w: WaterBody): THREE.InstancedMesh {
  const rng = makeRng(0x5eed + Math.round(w.centre[0]));
  const clumps: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const p = new THREE.Vector3();
  const reach = 5;
  const halfX = w.size[0] / 2 + reach;
  const halfZ = w.size[1] / 2 + reach;
  const target = Math.round((w.size[0] + w.size[1]) * 1.2);
  for (let guard = 0; clumps.length < target && guard < target * 40; guard++) {
    const x = w.centre[0] + range(rng, -halfX, halfX);
    const z = w.centre[1] + range(rng, -halfZ, halfZ);
    // Only the fringe: knee deep on one side, just dry on the other.
    const d = shoreDistance(w, x, z);
    if (d > reach || d < -6) continue;
    const y = groundY(x, z);
    if (y > w.surfaceY + 0.35 || y < w.surfaceY - 0.9) continue;
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
