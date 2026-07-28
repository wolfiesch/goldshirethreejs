import * as THREE from 'three';
import { flameMat, mat, smokeMat } from './materials';
import { jitter, makeRng, range, smoothstep, type Rng } from './rng';
import type { TickFn } from '../core/types';

/**
 * Shared geometry vocabulary. Every builder speaks this language so the
 * silhouette stays consistent: the flared post and the swayback roof are what
 * make a building read as Azeroth rather than generic medieval.
 */

export type Vec3Like = [number, number, number];
export type Vec2 = [number, number];

export interface BoxOpts {
  pos?: Vec3Like;
  rot?: Vec3Like;
  rotY?: number;
  /** Metres of surface per texture tile. Lower = denser detail. */
  uvScale?: number;
  collide?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Deterministic source for the small imperfections (plank twist, post lean). */
const primRng = makeRng(0x9e3779b9);

/**
 * Rescales BoxGeometry UVs so each face tiles proportionally to its real size.
 * Without this a 16 m wall and a 0.2 m stud show the same texture density.
 */
function proportionalBoxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number, metresPerTile: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const t = metresPerTile;
  // BoxGeometry vertex order: +X, -X, +Y, -Y, +Z, -Z, four vertices each.
  const spans: Array<[number, number]> = [
    [d / t, h / t],
    [d / t, h / t],
    [w / t, d / t],
    [w / t, d / t],
    [w / t, h / t],
    [w / t, h / t],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
}

function applyOpts(mesh: THREE.Mesh, opts?: BoxOpts): THREE.Mesh {
  if (opts?.pos) mesh.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  if (opts?.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts?.rotY !== undefined) mesh.rotation.y = opts.rotY;
  mesh.castShadow = opts?.castShadow ?? true;
  mesh.receiveShadow = opts?.receiveShadow ?? true;
  if (opts?.collide === false) mesh.userData.collide = false;
  return mesh;
}

export function box(w: number, h: number, d: number, material: THREE.Material, opts?: BoxOpts): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  proportionalBoxUV(geo, w, h, d, opts?.uvScale ?? 2);
  return applyOpts(new THREE.Mesh(geo, material), opts);
}

/** A sawn board: box with a slight twist and a chamfered top edge. */
export function plank(len: number, w: number, thick: number, material: THREE.Material, opts?: BoxOpts): THREE.Mesh {
  const geo = new THREE.BoxGeometry(len, thick, w);
  proportionalBoxUV(geo, len, thick, w, opts?.uvScale ?? 1.2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const chamfer = Math.min(thick * 0.3, w * 0.12);
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * (1 - (chamfer * 2) / w));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = applyOpts(new THREE.Mesh(geo, material), opts);
  mesh.rotation.x += jitter(primRng, (2 * Math.PI) / 180);
  return mesh;
}

/**
 * The flared "tree-trunk" post from the reference: wider at the head than the
 * foot. `rTop > rBase` is the WoW look; passing them equal gives a plain post.
 */
export function taperedPost(h: number, rBase: number, rTop: number, sides: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBase, h, sides, 1);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Radius of a `flutedPost` at height fraction `t`, so anything mounted on the
 * post can find its surface. Exported because a lozenge run placed against a
 * straight taper would float away from the waist.
 */
export function flutedRadius(t: number, rBase: number, rTop: number): number {
  const foot = 1 - smoothstep(0, 0.16, t);
  const head = smoothstep(0.5, 1, t);
  return rBase * (1 + 0.5 * foot) + (rTop - rBase) * head;
}

/**
 * The corner post as the references actually draw it: a splayed foot, a waist
 * around a third of the way up, and a head that flares out under the eave.
 * `taperedPost` gives a straight cone, which reads as a column rather than a
 * dressed tree.
 *
 * The surface is scalloped into `sides` shallow flutes. The ridge between two
 * flutes lands exactly on every multiple of 2*pi/sides, which is where the
 * lozenge runs are mounted, so a post is never rotated to meet its trim.
 *
 * Open-ended: both ends are buried, in the plinth below and under the eave
 * above, and caps would only add triangles nobody can see.
 */
export function flutedPost(h: number, rBase: number, rTop: number, sides: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(1, 1, 1, sides * 2, 12, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    const theta = Math.atan2(pos.getX(i), pos.getZ(i));
    // Two radial segments per flute, so each lands on a ridge or a trough
    // rather than aliasing across the scallop.
    const flute = 1 - 0.06 * (0.5 - 0.5 * Math.cos(sides * theta));
    const r = flutedRadius(t, rBase, rTop) * flute;
    pos.setXYZ(i, Math.sin(theta) * r, t * h, Math.cos(theta) * r);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A hand-hewn ceiling beam, sagged along its length. Straight boxes read as
 * sawn steel; every interior reference shows the primaries bowing under the
 * floor above.
 */
export function bowedBeam(
  from: Vec3Like,
  to: Vec3Like,
  width: number,
  depth: number,
  sag: number,
  material: THREE.Material,
): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const SEGS = 12;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    const p = a.clone().lerp(b, t);
    p.y -= sag * (1 - (2 * t - 1) * (2 * t - 1));
    pts.push(p);
  }
  // Across the run and level, whichever way the run points.
  const across = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x);
  if (across.lengthSq() < 1e-9) across.set(1, 0, 0);
  return sweptPrism(pts, across.normalize(), width, depth, material);
}

export function cylinder(r: number, h: number, sides: number, material: THREE.Material, opts?: BoxOpts): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, h, sides, 1);
  return applyOpts(new THREE.Mesh(geo, material), opts);
}

export function beam(len: number, w: number, h: number, material: THREE.Material, axis: 'x' | 'y' | 'z', opts?: BoxOpts): THREE.Mesh {
  const dims: Record<'x' | 'y' | 'z', Vec3Like> = {
    x: [len, h, w],
    y: [w, len, h],
    z: [w, h, len],
  };
  const [dx, dy, dz] = dims[axis];
  return box(dx, dy, dz, material, opts);
}

/** 45-degree brace with a concave quarter-round inner edge. */
export function kneeBrace(len: number, thick: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(len, 0);
  shape.quadraticCurveTo(len * 0.42, len * 0.42, 0, len);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -thick / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Rectangular-section tube swept along a polyline. Used for the roof ridge cap
 * and the raking bargeboards, both of which must follow the sagged roof line.
 */
export function sweptPrism(
  points: THREE.Vector3[],
  acrossDir: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const n = points.length;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const tangent = new THREE.Vector3();
  const bino = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let runLength = 0;

  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    tangent.subVectors(next, prev).normalize();
    bino.copy(acrossDir).addScaledVector(tangent, -acrossDir.dot(tangent)).normalize();
    normal.crossVectors(tangent, bino).normalize();
    if (i > 0) runLength += points[i].distanceTo(points[i - 1]);
    const corners: Array<[number, number]> = [
      [-0.5, 0.5],
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, -0.5],
    ];
    for (const [b, nn] of corners) {
      verts.push(
        points[i].x + bino.x * b * width + normal.x * nn * depth,
        points[i].y + bino.y * b * width + normal.y * nn * depth,
        points[i].z + bino.z * b * width + normal.z * nn * depth,
      );
      uvs.push(runLength, b + 0.5);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let e = 0; e < 4; e++) {
      const e2 = (e + 1) % 4;
      idx.push(a + e, b + e, b + e2, a + e, b + e2, a + e2);
    }
  }
  // end caps
  const last = (n - 1) * 4;
  idx.push(0, 2, 1, 0, 3, 2);
  idx.push(last, last + 1, last + 2, last, last + 2, last + 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface SwaybackOpts {
  /** Ridge-cap timber; omit for a bare roof (dormers, porch). */
  ridgeCap?: boolean;
  /** Raking bargeboards on both gable ends. */
  bargeboards?: boolean;
  bargeboardMaterial?: THREE.Material;
  ridgeMaterial?: THREE.Material;
}

/**
 * The roof surface as a world-space sampler, so anything that has to tuck
 * under the roof (gable walls, dormers, rake trim) can follow the real sagged
 * line instead of a straight rake. Arguments match `swaybackRoof`.
 */
export function swaybackHeightFn(
  spanX: number,
  halfDepth: number,
  ridgeY: number,
  eaveY: number,
  overhangX: number,
  overhangZ: number,
  sagRidge: number,
  sagEave: number,
  flare: number,
): (x: number, z: number) => number {
  const L = spanX + overhangX * 2;
  const D = halfDepth + overhangZ;
  return (x, z) => {
    const u = Math.min(1, Math.max(0, x / L + 0.5));
    const v = Math.min(1, Math.abs(z) / D);
    const bell = 1 - (2 * u - 1) * (2 * u - 1);
    const sag = (sagRidge + (sagEave - sagRidge) * v) * bell;
    let y = ridgeY + (eaveY - ridgeY) * v - sag;
    if (v > 0.86) {
      const k = (v - 0.86) / 0.14;
      y += flare * k * k;
    }
    return y;
  };
}

/**
 * THE signature shape. A WoW roof is not two flat planes: it sags along the
 * ridge like a catenary and its eaves flick upward in a bell cast. Both slopes
 * are explicit 24x8 grids so the curvature is real geometry, visible in
 * silhouette from any angle.
 *
 * @param spanX      wall-to-wall length along the ridge
 * @param halfDepth  wall-to-ridge half span across the slope
 * @param ridgeY     height of the ridge line at the gable ends
 * @param eaveY      height of the eave line at the gable ends
 * @param overhangX  ridge overhang past each gable
 * @param overhangZ  eave overhang past each long wall
 * @param sagRidge   mid-span droop of the ridge line
 * @param sagEave    mid-span droop of the eave line
 * @param flare      upturn added over the outer 14% of each slope
 */
export function swaybackRoof(
  spanX: number,
  halfDepth: number,
  ridgeY: number,
  eaveY: number,
  overhangX: number,
  overhangZ: number,
  sagRidge: number,
  sagEave: number,
  flare: number,
  material: THREE.Material,
  opts: SwaybackOpts = {},
): THREE.Group {
  const group = new THREE.Group();
  const L = spanX + overhangX * 2;
  const D = halfDepth + overhangZ;
  const SEG_U = 24;
  const SEG_V = 8;

  const height = (u: number, v: number): number => {
    const bell = 1 - (2 * u - 1) * (2 * u - 1);
    const sag = (sagRidge + (sagEave - sagRidge) * v) * bell;
    let y = ridgeY + (eaveY - ridgeY) * v - sag;
    if (v > 0.86) {
      const k = (v - 0.86) / 0.14;
      y += flare * k * k;
    }
    return y;
  };

  for (const s of [1, -1]) {
    const geo = new THREE.PlaneGeometry(1, 1, SEG_U, SEG_V);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;
      const v = 0.5 - pos.getY(i);
      pos.setXYZ(i, -L / 2 + u * L, height(u, v), s * v * D);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const slope = new THREE.Mesh(geo, material);
    slope.castShadow = true;
    slope.receiveShadow = true;
    group.add(slope);
  }

  if (opts.ridgeCap !== false) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEG_U; i++) {
      const u = i / SEG_U;
      pts.push(new THREE.Vector3(-L / 2 + u * L, height(u, 0) + 0.08, 0));
    }
    group.add(sweptPrism(pts, new THREE.Vector3(0, 0, 1), 0.35, 0.25, opts.ridgeMaterial ?? mat('timberDark')));
  }

  if (opts.bargeboards) {
    const bmat = opts.bargeboardMaterial ?? mat('timberLight');
    for (const end of [-1, 1]) {
      const u = end < 0 ? 0.02 : 0.98;
      const x = -L / 2 + u * L;
      const pts: THREE.Vector3[] = [];
      for (let i = SEG_V; i >= -SEG_V; i--) {
        const v = Math.abs(i) / SEG_V;
        const side = i >= 0 ? 1 : -1;
        pts.push(new THREE.Vector3(x, height(u, v) - 0.1, side * v * D));
      }
      group.add(sweptPrism(pts, new THREE.Vector3(1, 0, 0), 0.22, 0.28, bmat));
    }
  }

  return group;
}

/** 12-sided lathe belly with three iron hoops. */
export function barrel(r: number, h: number, material: THREE.Material, hoopMaterial: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const profile: THREE.Vector2[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const belly = Math.sin(t * Math.PI) * 0.18 + 0.82;
    profile.push(new THREE.Vector2(r * belly, t * h));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), material);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  for (const [y, cap] of [
    [0.001, true],
    [h - 0.001, true],
  ] as Array<[number, boolean]>) {
    if (!cap) continue;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 12), material);
    disc.rotation.x = y < h / 2 ? Math.PI / 2 : -Math.PI / 2;
    disc.position.y = y;
    disc.receiveShadow = true;
    g.add(disc);
  }

  for (const t of [0.14, 0.5, 0.86]) {
    const belly = Math.sin(t * Math.PI) * 0.18 + 0.82;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * belly + 0.012, 0.022, 4, 12), hoopMaterial);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = t * h;
    hoop.castShadow = true;
    g.add(hoop);
  }
  return g;
}

export function crate(size: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(box(size, size, size, material, { pos: [0, size / 2, 0], uvScale: size }));
  const t = size * 0.075;
  const battenMat = mat('timberDark');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(t, size, t, battenMat, { pos: [sx * (size / 2 - t / 2), size / 2, sz * (size / 2 - t / 2)], uvScale: size }));
    }
  }
  for (const y of [t / 2 + 0.01, size - t / 2 - 0.01]) {
    for (const sz of [-1, 1]) {
      g.add(box(size + 0.01, t, t, battenMat, { pos: [0, y, sz * (size / 2 - t / 2)], uvScale: size }));
    }
    for (const sx of [-1, 1]) {
      g.add(box(t, t, size + 0.01, battenMat, { pos: [sx * (size / 2 - t / 2), y, 0], uvScale: size }));
    }
  }
  return g;
}

export interface FenceOpts {
  postSpacing?: number;
  railHeights?: number[];
  postHeight?: number;
  rng?: Rng;
  /**
   * Ground height along the run. A fence is the only prop here with positions
   * of its own between its endpoints, so it cannot be lifted by its caller: the
   * posts have to sample the terrain individually or a run across a slope
   * either floats at one end or buries itself at the other.
   *
   * Passed in rather than imported so this module stays world-agnostic.
   */
  groundAt?: (x: number, z: number) => number;
}

/** Post-and-rail fence between two ground points; posts lean slightly. */
export function splitRailFence(from: Vec2, to: Vec2, opts: FenceOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const spacing = opts.postSpacing ?? 2.4;
  const rails = opts.railHeights ?? [0.55, 1.0];
  const postH = opts.postHeight ?? 1.25;
  const rng = opts.rng ?? makeRng(0x51ce);
  const groundAt = opts.groundAt ?? (() => 0);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len / spacing));
  const angle = Math.atan2(dz, dx);
  const timber = mat('timberLight');

  const at = (t: number): [number, number, number] => {
    const x = from[0] + dx * t;
    const z = from[1] + dz * t;
    return [x, groundAt(x, z), z];
  };

  for (let i = 0; i <= count; i++) {
    const [x, gy, z] = at(i / count);
    const post = box(0.16, postH, 0.16, timber, {
      pos: [x, gy + postH / 2, z],
      uvScale: 0.9,
    });
    post.rotation.z = jitter(rng, (3 * Math.PI) / 180);
    post.rotation.x = jitter(rng, (3 * Math.PI) / 180);
    post.rotation.y = angle;
    g.add(post);
  }
  const seg = len / count;
  for (const h of rails) {
    for (let i = 0; i < count; i++) {
      const [, gy0] = at(i / count);
      const [, gy1] = at((i + 1) / count);
      const [mx, mgy, mz] = at((i + 0.5) / count);
      const rail = box(seg + 0.06, 0.09, 0.13, timber, {
        pos: [mx, mgy + h + jitter(rng, 0.03), mz],
        uvScale: 1.4,
      });
      /*
       * Euler order is XYZ, so Z is applied first, in the box's own frame: it
       * pitches the long axis before Y swings it onto the run bearing. That
       * makes the rail follow the slope between its two posts instead of
       * cutting through the high one.
       */
      rail.rotation.y = -angle;
      rail.rotation.z = Math.atan2(gy1 - gy0, seg) + jitter(rng, (1.5 * Math.PI) / 180);
      g.add(rail);
    }
  }
  return g;
}

/** Single candle: wax stub, wick, additive flame quad. Optionally emissive-only. */
export function candle(height = 0.16, radius = 0.026): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(radius, height, 6, mat('wax'), { pos: [0, height / 2, 0] }));
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.13), flameMat());
  flame.position.y = height + 0.06;
  flame.userData.collide = false;
  flame.castShadow = false;
  flame.receiveShadow = false;
  g.add(flame);
  const flame2 = flame.clone();
  flame2.rotation.y = Math.PI / 2;
  g.add(flame2);
  return g;
}

/**
 * The iron candle-ring hung from a ceiling beam, straight from the interior
 * reference. Carries its own point light.
 */
export function candleRingChandelier(radius: number, candles: number, chainLength: number, lightIntensity = 0.9): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 5, 20), iron);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  g.add(ring);

  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.55, 0.014, 4, 16), iron);
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = box(radius * 0.5, 0.02, 0.02, iron, {
      pos: [Math.cos(a) * radius * 0.78, 0, Math.sin(a) * radius * 0.78],
      rotY: -a,
      uvScale: 0.5,
    });
    g.add(spoke);
  }

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const chain = box(0.022, chainLength, 0.022, iron, {
      pos: [Math.cos(a) * radius * 0.5, chainLength / 2, Math.sin(a) * radius * 0.5],
      uvScale: 0.4,
    });
    chain.rotation.z = -Math.cos(a) * 0.12;
    chain.rotation.x = Math.sin(a) * 0.12;
    g.add(chain);
  }
  g.add(box(0.06, 0.06, 0.06, iron, { pos: [0, chainLength, 0], uvScale: 0.2 }));

  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * Math.PI * 2;
    const c = candle(0.19);
    c.position.set(Math.cos(a) * radius, 0.03, Math.sin(a) * radius);
    g.add(c);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.03, 6), iron);
    cup.position.set(Math.cos(a) * radius, 0.02, Math.sin(a) * radius);
    g.add(cup);
  }

  const light = new THREE.PointLight(0xffcf8a, lightIntensity, 11, 2);
  light.position.y = 0.1;
  light.castShadow = false;
  g.add(light);
  return g;
}

/** Crossed additive quads. Animated purely as a function of elapsed time. */
export function fireEffect(w: number, h: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const quads: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, flameMat());
    m.rotation.y = (i / 3) * Math.PI;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.collide = false;
    quads.push(m);
    g.add(m);
  }
  const phases = quads.map(() => range(rng, 0, Math.PI * 2));
  const speeds = quads.map(() => range(rng, 3.2, 5.4));
  const tick: TickFn = (_dt, elapsed) => {
    for (let i = 0; i < quads.length; i++) {
      const s = 1 + Math.sin(elapsed * speeds[i] + phases[i]) * 0.13;
      quads[i].scale.set(1 + Math.sin(elapsed * speeds[i] * 0.7 + phases[i]) * 0.07, s, 1);
      quads[i].position.y = Math.sin(elapsed * speeds[i] * 1.3 + phases[i]) * h * 0.03;
    }
  };
  g.userData.tick = tick;
  g.userData.collide = false;
  return g;
}

/** Rising chimney/forge smoke. Positions are a pure function of elapsed time. */
export function smokePlume(count: number, height: number, radius: number, seed: number, rise = 0.9): THREE.Points {
  const rng = makeRng(seed);
  const offsets = new Float32Array(count);
  const drift = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    offsets[i] = rng();
    drift[i * 2] = range(rng, -1, 1);
    drift[i * 2 + 1] = range(rng, -1, 1);
  }
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, smokeMat());
  pts.frustumCulled = false;
  pts.userData.collide = false;
  const attr = geo.attributes.position as THREE.BufferAttribute;
  const tick: TickFn = (_dt, elapsed) => {
    for (let i = 0; i < count; i++) {
      const t = (offsets[i] + (elapsed * rise) / height) % 1;
      const spread = radius * (0.25 + t * 2.4);
      attr.setXYZ(
        i,
        drift[i * 2] * spread + Math.sin(elapsed * 0.5 + i) * 0.15 * t,
        t * height,
        drift[i * 2 + 1] * spread + Math.cos(elapsed * 0.4 + i) * 0.15 * t,
      );
    }
    attr.needsUpdate = true;
  };
  tick(0, 0);
  pts.userData.tick = tick;
  return pts;
}

/** Bottles, jars and tankards: the clutter that sells a bar or a mantelpiece. */
export function bottle(h = 0.26, r = 0.036): THREE.Mesh {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r, 0.01),
    new THREE.Vector2(r, h * 0.55),
    new THREE.Vector2(r * 0.42, h * 0.72),
    new THREE.Vector2(r * 0.3, h * 0.95),
    new THREE.Vector2(r * 0.36, h),
    new THREE.Vector2(0, h),
  ];
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), mat('bottleGreen'));
  m.castShadow = true;
  return m;
}

export function tankard(h = 0.13, r = 0.045): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(r, h, 8, mat('clay'), { pos: [0, h / 2, 0], uvScale: 0.3 }));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.012, 4, 10, Math.PI), mat('clay'));
  handle.position.set(r, h * 0.55, 0);
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

export function jar(h = 0.2, r = 0.08): THREE.Mesh {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.7, 0),
    new THREE.Vector2(r, h * 0.4),
    new THREE.Vector2(r * 0.85, h * 0.8),
    new THREE.Vector2(r * 0.55, h),
    new THREE.Vector2(0, h),
  ];
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile, 9), mat('clay'));
  m.castShadow = true;
  return m;
}

/**
 * Grain sack: bulging base pinched to a tied neck. The silhouette matters -
 * a squashed sphere just reads as a pale blob on the floor.
 */
export function sack(w = 0.5, h = 0.45, seed = 7): THREE.Mesh {
  const rng = makeRng(seed);
  const r = w / 2;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.86, 0.005),
    new THREE.Vector2(r * 1.04, h * 0.26),
    new THREE.Vector2(r * 0.94, h * 0.6),
    new THREE.Vector2(r * 0.58, h * 0.85),
    new THREE.Vector2(r * 0.3, h * 0.95),
    new THREE.Vector2(r * 0.42, h * 1.06),
    new THREE.Vector2(r * 0.2, h * 1.12),
    new THREE.Vector2(0, h * 1.13),
  ];
  const geo = new THREE.LatheGeometry(profile, 9);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // Slump: lean the upper half so no two sacks look stamped from one mould.
    const t = pos.getY(i) / (h * 1.13);
    pos.setX(i, pos.getX(i) * (1 + jitter(rng, 0.08)) + t * t * jitter(rng, 0.06));
    pos.setZ(i, pos.getZ(i) * (1 + jitter(rng, 0.08)) + t * t * jitter(rng, 0.06));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat('sackcloth'));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Cart / winch wheel: rim torus plus spokes. */
export function spokedWheel(r: number, thickness: number, spokes: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberDark');
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 5, 16), timber);
  rim.castShadow = true;
  g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, thickness * 3, 8), timber);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = box(thickness * 1.4, r * 2 - thickness, thickness * 1.4, timber, { uvScale: 0.4 });
    spoke.rotation.z = a;
    g.add(spoke);
  }
  return g;
}
