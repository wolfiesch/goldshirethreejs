import * as THREE from 'three';
import { registerNightLight } from '../core/daynight';
import { mat } from '../gen/materials';
import { barrel, box, crate, cylinder, fireEffect, sack, splitRailFence, spokedWheel, taperedPost } from '../gen/prims';
import { jitter, makeRng, range } from '../gen/rng';
import { FENCE_RUNS, TORCH_POSTS, scatterAround } from '../world/layout';
import { groundY } from '../world/terrain';

/**
 * Outdoor dressing: the loose props that make the clearing look inhabited.
 * Every builder returns a Group whose local origin is the centre of its
 * footprint with ground at y = 0; only `buildVillageProps` knows world
 * coordinates, and only because scatter is placement, not architecture.
 */

/** Iron cresset on a timber post. Lit only after dark. */
export function buildTorchPost(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const timber = mat('timberDark');
  const iron = mat('metalDark');

  const postH = 2.6;
  const post = box(0.14, postH, 0.14, timber, { pos: [0, postH / 2, 0], uvScale: 1.1 });
  post.rotation.y = range(rng, 0, Math.PI / 2);
  post.rotation.z = jitter(rng, (1.5 * Math.PI) / 180);
  g.add(post);

  // Collar where the basket meets the post.
  g.add(cylinder(0.11, 0.08, 8, iron, { pos: [0, postH + 0.02, 0], uvScale: 0.3 }));
  // Basket floor.
  g.add(cylinder(0.17, 0.04, 8, iron, { pos: [0, postH + 0.08, 0], uvScale: 0.3 }));

  const barLen = 0.34;
  const tilt = (16 * Math.PI) / 180;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rMid = 0.175 + Math.sin(tilt) * barLen * 0.5;
    const bar = box(0.03, barLen, 0.03, iron, {
      pos: [Math.cos(a) * rMid, postH + 0.08 + Math.cos(tilt) * barLen * 0.5, Math.sin(a) * rMid],
      uvScale: 0.3,
    });
    bar.rotation.y = -a;
    bar.rotation.z = -tilt;
    g.add(bar);
  }

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175 + Math.sin(tilt) * barLen, 0.024, 4, 12), iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = postH + 0.08 + Math.cos(tilt) * barLen;
  rim.castShadow = true;
  g.add(rim);

  // Fuel bed plus the flame sitting in the basket.
  g.add(cylinder(0.15, 0.06, 6, mat('coal'), { pos: [0, postH + 0.12, 0], uvScale: 0.3, collide: false }));
  const fire = fireEffect(0.4, 0.5, seed ^ 0x5f3a);
  fire.position.set(0, postH + 0.14, 0);
  g.add(fire);

  const light = new THREE.PointLight(0xff9a3c, 1.1, 14, 2);
  light.position.set(0, postH + 0.32, 0);
  light.castShadow = false;
  registerNightLight(light, 1.1);
  g.add(light);

  return g;
}

/** Conical stack on a low timber ring, with straw spilled around the foot. */
export function buildHaystack(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const hay = mat('hay', 2, 2);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.11, 4, 14), mat('bark'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 9), hay);
  cone.position.y = 1.12;
  cone.rotation.y = range(rng, 0, Math.PI * 2);
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);

  for (let i = 0; i < 8; i++) {
    const a = range(rng, 0, Math.PI * 2);
    const r = range(rng, 1.35, 2.1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(range(rng, 0.4, 0.8), range(rng, 0.22, 0.4)), hay);
    quad.position.set(Math.cos(a) * r, range(rng, 0.02, 0.09), Math.sin(a) * r);
    quad.rotation.set(-Math.PI / 2 + jitter(rng, 0.35), range(rng, 0, Math.PI * 2), 0);
    quad.castShadow = false;
    quad.receiveShadow = false;
    quad.userData.collide = false;
    g.add(quad);
  }
  return g;
}

/** Nine split logs stacked 4/3/2 on a pair of bearers, lying along X. */
export function buildLogPile(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const bark = mat('bark');
  const timber = mat('timberDark');

  const logR = 0.16;
  const logLen = 2.2;
  const bearerY = 0.07;
  for (const bx of [-0.78, 0.78]) {
    g.add(box(0.16, bearerY * 2, 1.5, timber, { pos: [bx, bearerY, 0], uvScale: 0.8 }));
  }

  const rows = [4, 3, 2];
  const step = logR * 2 * 0.99;
  let y = bearerY * 2 + logR;
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r];
    const z0 = -((n - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      const log = cylinder(logR, logLen, 8, bark, {
        pos: [jitter(rng, 0.06), y, z0 + i * step],
        uvScale: 0.9,
      });
      log.rotation.z = Math.PI / 2;
      log.rotation.x = jitter(rng, 0.06);
      g.add(log);
      // End grain so the stack does not read as a bundle of pipes.
      for (const sx of [-1, 1]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(logR * 0.94, 8), mat('timberLight'));
        face.position.set(sx * (logLen / 2 + 0.004) + jitter(rng, 0.02), y, z0 + i * step);
        face.rotation.y = sx > 0 ? 0 : Math.PI;
        face.receiveShadow = false;
        face.userData.collide = false;
        g.add(face);
      }
    }
    y += step * Math.sin(Math.PI / 3) * 1.02;
  }
  return g;
}

/** Single-wheel barrow: tilted plank tray on two long handles. */
export function buildWheelbarrow(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const light = mat('timberLight');
  const dark = mat('timberDark');

  // Handles double as the frame rails: they run under the tray and out the back.
  for (const sz of [-0.24, 0.24]) {
    const rail = box(2.0, 0.07, 0.07, light, { pos: [-0.1, 0.37, sz], uvScale: 0.9 });
    rail.rotation.z = 0.06;
    g.add(rail);
    // Grip end.
    g.add(cylinder(0.045, 0.2, 6, dark, { pos: [-1.02, 0.44, sz], uvScale: 0.3, rot: [0, 0, Math.PI / 2] }));
  }

  const tray = new THREE.Group();
  tray.position.set(0.06, 0.43, 0);
  tray.rotation.z = -0.11;
  tray.add(box(1.0, 0.05, 0.5, light, { pos: [0, 0, 0], uvScale: 0.7 }));
  for (const sz of [-1, 1]) {
    tray.add(box(1.0, 0.3, 0.05, light, { pos: [0, 0.15, sz * 0.225], uvScale: 0.7 }));
  }
  tray.add(box(0.05, 0.3, 0.5, light, { pos: [0.475, 0.15, 0], uvScale: 0.7 }));
  tray.add(box(0.05, 0.22, 0.5, light, { pos: [-0.475, 0.11, 0], uvScale: 0.7 }));
  tray.rotation.y = jitter(rng, 0.02);
  g.add(tray);

  const wheel = spokedWheel(0.28, 0.05, 6);
  wheel.position.set(0.85, 0.28, 0);
  wheel.rotation.z = range(rng, 0, Math.PI);
  g.add(wheel);
  g.add(cylinder(0.035, 0.5, 6, dark, { pos: [0.85, 0.28, 0], uvScale: 0.3, rot: [Math.PI / 2, 0, 0] }));

  // Rear leg strut the barrow rests on.
  g.add(box(0.07, 0.4, 0.07, dark, { pos: [-0.55, 0.2, 0], uvScale: 0.4 }));

  g.rotation.y = jitter(rng, 0.05);
  return g;
}

/** Sawn stump with a pale cut face and three growth rings. */
export function buildStump(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);

  const trunk = taperedPost(0.5, 0.42, 0.36, 8, mat('bark'));
  trunk.rotation.y = range(rng, 0, Math.PI * 2);
  g.add(trunk);

  const face = new THREE.Mesh(new THREE.CircleGeometry(0.355, 8), mat('timberLight'));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.502;
  face.receiveShadow = true;
  g.add(face);

  const ringMat = mat('bark');
  for (let i = 0; i < 3; i++) {
    const outer = 0.115 + i * 0.09;
    const ring = new THREE.Mesh(new THREE.RingGeometry(outer - 0.014, outer, 10), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.504 + i * 0.001;
    ring.receiveShadow = false;
    ring.userData.collide = false;
    g.add(ring);
  }

  g.rotation.z = jitter(rng, (4 * Math.PI) / 180);
  g.rotation.x = jitter(rng, (4 * Math.PI) / 180);
  return g;
}

/** Half-log bench with a low back rail. */
export function buildBench(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const bark = mat('bark');

  for (const sx of [-0.7, 0.7]) {
    const leg = cylinder(0.21, 0.38, 8, bark, { pos: [sx, 0.19, 0], uvScale: 0.6 });
    leg.scale.z = 0.55;
    leg.rotation.y = range(rng, 0, Math.PI);
    g.add(leg);
  }

  const seat = box(1.9, 0.14, 0.45, bark, { pos: [0, 0.38, 0], uvScale: 1.1 });
  seat.rotation.z = jitter(rng, (1.2 * Math.PI) / 180);
  g.add(seat);

  for (const sx of [-0.76, 0.76]) {
    g.add(box(0.09, 0.5, 0.09, bark, { pos: [sx, 0.65, -0.18], uvScale: 0.5 }));
  }
  const backRail = box(1.9, 0.13, 0.1, bark, { pos: [0, 0.82, -0.18], uvScale: 1.1 });
  backRail.rotation.z = jitter(rng, (1.2 * Math.PI) / 180);
  g.add(backRail);

  return g;
}

/** Four grain sacks slumped against each other. */
export function buildSackPile(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const layout: Array<[number, number, number, number]> = [
    [-0.24, 0, -0.12, 0.52],
    [0.26, 0, -0.04, 0.47],
    [0.0, 0, 0.27, 0.55],
    [0.02, 0.46, 0.05, 0.44],
  ];
  for (let i = 0; i < layout.length; i++) {
    const [x, y, z, w] = layout[i];
    const s = sack(w, w * 0.8, seed + i * 31);
    s.position.set(x, y, z);
    s.rotation.y = range(rng, 0, Math.PI * 2);
    if (i === layout.length - 1) s.rotation.z = jitter(rng, 0.28);
    g.add(s);
  }
  return g;
}

/**
 * Where each kind of clutter belongs, and how much of it there is.
 *
 * These were seven tables of hand-typed world coordinates, and the comment
 * above them stated the rule they all obeyed: at least `PROP_CLEARANCE` clear
 * of every road polygon and every building pad. Nothing enforced it. With
 * `mergeStatic` baking transforms and the BVH swallowing the result into one
 * mesh, a barrel standing inside a wall raises no error anywhere, and every
 * re-typed coordinate was another chance to write one.
 *
 * `scatterAround` executes the rule instead. Weight comes from repetition: the
 * inn drinks, the smithy burns wood, the stable eats hay.
 */
type PropBuilder = (seed: number) => THREE.Object3D;

interface ClutterSpec {
  build: PropBuilder;
  count: number;
  /** Metres beyond the pad edge, near and far. */
  gap: [number, number];
  pads: string[];
}

function clutter(): ClutterSpec[] {
  return [
    {
      build: () => barrel(0.36, 0.86, mat('timberDark'), mat('metalDark')),
      count: 13,
      gap: [0.5, 2.6],
      pads: ['inn', 'inn', 'inn', 'stable', 'smithy', 'cottageB'],
    },
    {
      build: () => crate(0.7, mat('timberLight')),
      count: 9,
      gap: [0.5, 2.6],
      pads: ['inn', 'stall', 'smithy', 'cottageA', 'cottageB'],
    },
    { build: buildSackPile, count: 6, gap: [0.5, 2.4], pads: ['inn', 'stall', 'cottageA', 'cottageB'] },
    { build: buildHaystack, count: 5, gap: [0.8, 3.4], pads: ['stable', 'stable', 'cottageA', 'roost'] },
    { build: buildLogPile, count: 4, gap: [0.8, 3.0], pads: ['smithy', 'smithy', 'cottageB'] },
    { build: buildWheelbarrow, count: 3, gap: [1.0, 3.6], pads: ['smithy', 'cottageA', 'stable'] },
    {
      build: buildStump,
      count: 12,
      gap: [2.0, 9.0],
      pads: ['inn', 'smithy', 'cottageA', 'cottageB', 'roost', 'stable', 'well'],
    },
  ];
}

/**
 * The props that are composition rather than clutter, aimed by hand at a
 * specific spot. They read as intent precisely because the scatter around them
 * does not, and several sit inside a building pad on purpose: a barrel beside
 * the porch steps is the one place the sampler is forbidden to put one.
 */
const PROP_ANCHORS: Array<{ build: PropBuilder; pos: [number, number] }> = [
  { build: () => barrel(0.36, 0.86, mat('timberDark'), mat('metalDark')), pos: [45.4, -13.4] },
  { build: () => barrel(0.36, 0.86, mat('timberDark'), mat('metalDark')), pos: [53.2, -13.4] },
  // Tharynn's stock, in the shade of the awning rather than beside it.
  { build: () => crate(0.7, mat('timberLight')), pos: [-21.0, 10.7] },
  { build: () => crate(0.7, mat('timberLight')), pos: [-22.3, 12.1] },
  { build: buildSackPile, pos: [-20.7, 12.3] },
  // Fuel stacked outside the forge, where Argus can reach it.
  { build: buildLogPile, pos: [-16.0, -24.0] },
  { build: buildLogPile, pos: [-15.0, -30.5] },
  { build: buildWheelbarrow, pos: [-13.0, -26.0] },
  // Feed by the paddock gate.
  { build: buildHaystack, pos: [31.0, -13.5] },
  { build: buildHaystack, pos: [24.0, -33.5] },
  { build: buildStump, pos: [3.5, 17.5] },
];

/** Benches sit against a wall facing out, so the ring sample sets the facing. */
const BENCH_COUNT = 3;

const PROP_SEED = 0x517e5;

/** Fences, torches, benches and the hand-placed clutter, in world space. */
export function buildVillageProps(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'villageProps';
  const rng = makeRng(PROP_SEED);
  let seed = PROP_SEED;
  const nextSeed = (): number => (seed = (seed + 0x9e37) | 0);

  for (const run of FENCE_RUNS) {
    root.add(splitRailFence(run.from, run.to, { groundAt: groundY }));
  }

  for (const [x, z] of TORCH_POSTS) {
    const torch = buildTorchPost(nextSeed());
    torch.position.set(x, groundY(x, z), z);
    root.add(torch);
  }

  for (const s of scatterAround(rng, ['inn', 'inn', 'cottageA'], BENCH_COUNT, 0.3, 1.6)) {
    const bench = buildBench(nextSeed());
    bench.position.set(s.pos[0], groundY(s.pos[0], s.pos[1]), s.pos[1]);
    // The bench's back is its local -Z, so aiming local +Z outward puts its
    // back to the wall it was sampled against.
    bench.rotation.y = Math.atan2(s.outward[0], s.outward[1]);
    root.add(bench);
  }

  for (const spec of clutter()) {
    for (const s of scatterAround(rng, spec.pads, spec.count, spec.gap[0], spec.gap[1])) {
      const prop = spec.build(nextSeed());
      prop.position.set(s.pos[0], groundY(s.pos[0], s.pos[1]), s.pos[1]);
      prop.rotation.y = range(rng, 0, Math.PI * 2);
      root.add(prop);
    }
  }

  for (const anchor of PROP_ANCHORS) {
    const [x, z] = anchor.pos;
    const prop = anchor.build(nextSeed());
    prop.position.set(x, groundY(x, z), z);
    prop.rotation.y = range(rng, 0, Math.PI * 2);
    root.add(prop);
  }

  return root;
}
