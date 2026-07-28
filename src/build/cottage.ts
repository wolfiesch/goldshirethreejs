import * as THREE from 'three';
import { glassMat, mat } from '../gen/materials';
import { barrel, box, cylinder, kneeBrace, smokePlume, splitRailFence, swaybackRoof, taperedPost } from '../gen/prims';
import { makeRng, range } from '../gen/rng';

/**
 * Elwynn peasant cottage. One parameterised builder, two configs: the larger
 * dormered croft with its vegetable plot, and the smaller cottage with a
 * washing line. Both share the plinth / plaster / dark-frame / swayback recipe
 * so they read as the same village.
 */

interface CottageSpec {
  /** Footprint along X. */
  w: number;
  /** Footprint along Z. */
  d: number;
  eaves: number;
  ridge: number;
  /** -1 = west gable, +1 = east gable. */
  chimneySide: -1 | 1;
  chimneyTop: number;
  dormer: boolean;
  doorX: number;
  /** Window centres on the south (+Z) facade. */
  southWindows: number[];
  /** Window centres on the north (-Z) facade. */
  northWindows: number[];
  seed: number;
}

const SPECS: Record<'a' | 'b', CottageSpec> = {
  a: {
    w: 9,
    d: 7,
    eaves: 3.6,
    ridge: 7.2,
    chimneySide: 1,
    chimneyTop: 8.6,
    dormer: true,
    doorX: -2.2,
    southWindows: [0.8, 3.0],
    northWindows: [-2.2, 2.2],
    seed: 0xc07a9e,
  },
  b: {
    w: 8,
    d: 6,
    eaves: 3.2,
    ridge: 6.2,
    chimneySide: -1,
    chimneyTop: 7.6,
    dormer: false,
    doorX: -1.8,
    southWindows: [1.4],
    northWindows: [0],
    seed: 0xc07b17,
  },
};

const PLINTH = 0.4;
const WALL = 0.3;
/** Shutters are pinned back past square, the way a working cottage keeps them. */
const SHUTTER_OPEN = (105 * Math.PI) / 180;

function gableInfill(halfSpan: number, rise: number, thickness: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, 0);
  shape.lineTo(halfSpan, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Leaded pane, dark frame, projecting light sill. Built facing +Z. */
function leadedWindow(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat());
  pane.userData.collide = false;
  pane.castShadow = false;
  pane.receiveShadow = false;
  g.add(pane);

  const t = 0.12;
  const dark = mat('timberDark');
  g.add(box(w + t * 2, t, 0.14, dark, { pos: [0, h / 2 + t / 2, 0.03], uvScale: 0.5 }));
  g.add(box(w + t * 2, t, 0.14, dark, { pos: [0, -h / 2 - t / 2, 0.03], uvScale: 0.5 }));
  for (const sx of [-1, 1]) {
    g.add(box(t, h + t * 2, 0.14, dark, { pos: [sx * (w / 2 + t / 2), 0, 0.03], uvScale: 0.5 }));
  }
  g.add(box(0.06, h, 0.1, dark, { pos: [0, 0, 0.03], uvScale: 0.4 }));
  g.add(box(w + 0.34, 0.09, 0.2, mat('timberLight'), { pos: [0, -h / 2 - t - 0.045, 0.06], uvScale: 0.6 }));
  return g;
}

/** Window plus two board shutters swung back flat against the wall. */
function shutteredWindow(w: number, h: number): THREE.Group {
  const g = leadedWindow(w, h);
  const sw = w / 2 + 0.04;
  const sh = h + 0.1;
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(sx * (w / 2 + 0.14), 0, 0.05);
    hinge.rotation.y = -sx * SHUTTER_OPEN;
    const panel = box(sw, sh, 0.05, mat('timberLight'), { pos: [sx * (sw / 2), 0, 0], uvScale: 0.6 });
    hinge.add(panel);
    for (const y of [sh * 0.3, -sh * 0.3]) {
      hinge.add(box(sw - 0.04, 0.07, 0.03, mat('timberDark'), { pos: [sx * (sw / 2), y, 0.04], uvScale: 0.3 }));
    }
    g.add(hinge);
  }
  return g;
}

function chimney(top: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const brick = mat('brick');
  g.add(box(1.1, top, 0.9, brick, { pos: [0, top / 2, 0], uvScale: 1.2 }));
  g.add(box(1.35, 0.28, 1.15, brick, { pos: [0, top + 0.14, 0], uvScale: 1 }));
  g.add(box(1.5, 0.12, 1.3, mat('carvedStone'), { pos: [0, top + 0.34, 0], uvScale: 1 }));
  const smoke = smokePlume(20, 4.6, 0.4, seed, 0.75);
  smoke.position.y = top + 0.5;
  g.add(smoke);
  return g;
}

/** Plank door with strap hinges under a small gabled hood on brackets. */
function doorway(faceZ: number): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  const iron = mat('metalDark');
  const dw = 0.95;
  const dh = 2.05;

  for (const sx of [-1, 1]) {
    g.add(box(0.16, dh + 0.24, 0.2, dark, { pos: [sx * (dw / 2 + 0.08), PLINTH + (dh + 0.24) / 2, faceZ], uvScale: 0.7 }));
  }
  g.add(box(dw + 0.32, 0.2, 0.2, dark, { pos: [0, PLINTH + dh + 0.1, faceZ], uvScale: 0.7 }));
  g.add(box(dw, dh, 0.09, mat('plankWall'), { pos: [0, PLINTH + dh / 2, faceZ + 0.02], uvScale: 0.6 }));
  for (const y of [0.4, 1.65]) {
    g.add(box(dw - 0.06, 0.08, 0.03, iron, { pos: [0, PLINTH + y, faceZ + 0.08], uvScale: 0.3 }));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 10), iron);
  ring.position.set(0.3, PLINTH + 1.05, faceZ + 0.09);
  g.add(ring);
  // Stone step.
  g.add(box(1.3, PLINTH, 0.42, mat('stoneBlock'), { pos: [0, PLINTH / 2, faceZ + 0.32], uvScale: 0.8 }));

  const hood = swaybackRoof(1.75, 0.62, 3.02, 2.64, 0.12, 0.16, 0.04, 0.03, 0.1, mat('shingleBlue', 1.5, 1, THREE.DoubleSide), {
    ridgeCap: false,
  });
  hood.position.set(0, 0, faceZ + 0.4);
  g.add(hood);
  for (const sx of [-1, 1]) {
    const bracket = kneeBrace(0.5, 0.16, dark);
    bracket.position.set(sx * 0.66, 2.58, faceZ + 0.03);
    bracket.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
    g.add(bracket);
  }
  return g;
}

function woodpile(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const bark = mat('bark');
  const rows = [5, 5, 4];
  let level = 0;
  for (const count of rows) {
    for (let i = 0; i < count; i++) {
      const log = cylinder(0.11, range(rng, 0.85, 1.0), 7, bark, {
        pos: [0, 0.12 + level * 0.21, (i - (count - 1) / 2) * 0.235],
        rot: [0, range(rng, -0.05, 0.05), Math.PI / 2],
        uvScale: 0.5,
      });
      g.add(log);
    }
    level++;
  }
  // Two stakes keeping the stack honest.
  for (const sz of [-1, 1]) {
    g.add(box(0.09, 0.85, 0.09, mat('timberDark'), { pos: [0.2, 0.42, sz * 0.72], uvScale: 0.4 }));
  }
  return g;
}

function vegetableGarden(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  // 6 x 5 plot, local coordinates, sitting south of the cottage.
  const x0 = -1.6;
  const x1 = 4.4;
  const z0 = 4.4;
  const z1 = 9.4;
  g.add(splitRailFence([x0, z0], [x1, z0], { rng }));
  g.add(splitRailFence([x1, z0], [x1, z1], { rng }));
  g.add(splitRailFence([x1, z1], [x0, z1], { rng }));
  g.add(splitRailFence([x0, z1], [x0, z0], { rng }));

  const cabbage = mat('grass');
  const pumpkin = mat('clay');
  let n = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), n % 2 === 0 ? cabbage : pumpkin);
      blob.scale.set(1 + range(rng, -0.12, 0.18), 0.62, 1 + range(rng, -0.12, 0.18));
      blob.position.set(-0.85 + col * 0.94 + range(rng, -0.06, 0.06), 0.1, 5.2 + row * 1.0 + range(rng, -0.08, 0.08));
      blob.castShadow = true;
      blob.receiveShadow = true;
      g.add(blob);
      n++;
    }
  }
  // Turned earth under the rows.
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.0), mat('dirt', 4, 3));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(1.4, 0.02, 6.9);
  bed.receiveShadow = true;
  bed.userData.collide = false;
  g.add(bed);
  return g;
}

/** Rope with a catenary droop, four garments pegged along it. */
function laundryLine(seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const span = 3.2;
  const topY = 2.2;
  const sag = 0.38;
  const ropeY = (x: number): number => topY - sag * (1 - (x / span) * (x / span));

  for (const sx of [-1, 1]) {
    g.add(cylinder(0.08, topY, 7, mat('timberDark'), { pos: [sx * span, topY / 2, 0], uvScale: 0.5 }));
    g.add(box(0.7, 0.08, 0.08, mat('timberDark'), { pos: [sx * (span - 0.1), topY - 0.12, 0], uvScale: 0.3 }));
  }

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = -span + (i / 12) * span * 2;
    pts.push(new THREE.Vector3(x, ropeY(x), 0));
  }
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 5, false),
    mat('linen'),
  );
  rope.userData.collide = false;
  rope.castShadow = true;
  g.add(rope);

  const cloths: Array<[number, THREE.MeshLambertMaterial]> = [
    [-2.0, mat('clothRed', 1, 1, THREE.DoubleSide)],
    [-0.7, mat('linen', 1, 1, THREE.DoubleSide)],
    [0.6, mat('clothRed', 1, 1, THREE.DoubleSide)],
    [1.9, mat('linen', 1, 1, THREE.DoubleSide)],
  ];
  for (const [x, material] of cloths) {
    const h = range(rng, 0.7, 0.95);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, h, 4, 3), material);
    const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h;
      pos.setZ(i, Math.sin(pos.getX(i) * 5.5) * 0.035 * (1 - t));
    }
    pos.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    cloth.position.set(x, ropeY(x) - h / 2 - 0.02, 0);
    cloth.rotation.y = range(rng, -0.12, 0.12);
    cloth.userData.collide = false;
    cloth.castShadow = false;
    g.add(cloth);
  }
  return g;
}

function dormer(): THREE.Group {
  const g = new THREE.Group();
  const plaster = mat('plaster', 0.6, 0.6);
  const frontZ = -2.92;

  g.add(box(2.0, 1.35, 0.16, mat('plaster'), { pos: [0, 4.42, frontZ], uvScale: 1 }));
  const tri = gableInfill(1.0, 0.8, 0.16, plaster);
  tri.rotation.y = -Math.PI / 2; // back to spanning X, thickness across Z
  tri.position.set(0, 5.1, frontZ);
  g.add(tri);
  for (const sx of [-1, 1]) {
    g.add(box(0.14, 1.6, 1.9, mat('plaster'), { pos: [sx * 1.0, 4.4, -2.0], uvScale: 1 }));
  }
  // Cheek and head timbers.
  g.add(box(2.1, 0.14, 0.2, mat('timberDark'), { pos: [0, 5.08, frontZ - 0.04], uvScale: 0.8 }));

  const win = leadedWindow(0.7, 0.8);
  win.position.set(0, 4.6, frontZ - 0.09);
  win.rotation.y = Math.PI;
  g.add(win);

  const roof = swaybackRoof(1.4, 1.0, 5.9, 5.1, 0.25, 0.3, 0.08, 0.05, 0.12, mat('shingleBlue', 1.5, 1, THREE.DoubleSide), {
    ridgeCap: true,
  });
  roof.rotation.y = Math.PI / 2;
  roof.position.z = -2.05;
  g.add(roof);
  return g;
}

export function buildCottage(variant: 'a' | 'b'): THREE.Group {
  const spec = SPECS[variant];
  const g = new THREE.Group();
  g.name = `cottage${variant.toUpperCase()}`;

  const halfX = spec.w / 2;
  const halfZ = spec.d / 2;
  const plaster = mat('plaster');
  const dark = mat('timberDark');
  const wallH = spec.eaves - PLINTH;
  const wallY = PLINTH + wallH / 2;
  const faceZ = halfZ - WALL / 2;
  const faceX = halfX - WALL / 2;

  // Plinth.
  g.add(box(spec.w + 0.5, PLINTH, spec.d + 0.5, mat('stoneBlock'), { pos: [0, PLINTH / 2, 0], uvScale: 1.4 }));

  // Walls.
  for (const sz of [-1, 1]) {
    g.add(box(spec.w - WALL * 2, wallH, WALL, plaster, { pos: [0, wallY, sz * faceZ] }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(WALL, wallH, spec.d, plaster, { pos: [sx * faceX, wallY, 0] }));
    const gable = gableInfill(halfZ, spec.ridge - spec.eaves, WALL, mat('plaster', 0.5, 0.5));
    gable.position.set(sx * faceX, spec.eaves, 0);
    g.add(gable);
    g.add(box(WALL + 0.05, 0.18, halfZ * 1.3, dark, { pos: [sx * faceX, spec.eaves + 1.0, 0], uvScale: 1 }));
  }

  // Corner posts, sill and head rails, corner braces.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = taperedPost(wallH, 0.2, 0.26, 8, dark);
      post.position.set(sx * faceX, PLINTH, sz * faceZ);
      g.add(post);
    }
    g.add(box(WALL + 0.1, 0.2, spec.d, dark, { pos: [sx * faceX, PLINTH + 0.11, 0], uvScale: 1.4 }));
    g.add(box(WALL + 0.1, 0.22, spec.d, dark, { pos: [sx * faceX, spec.eaves - 0.11, 0], uvScale: 1.4 }));
  }
  for (const sz of [-1, 1]) {
    g.add(box(spec.w + 0.1, 0.2, WALL + 0.1, dark, { pos: [0, PLINTH + 0.11, sz * faceZ], uvScale: 1.4 }));
    g.add(box(spec.w + 0.1, 0.22, WALL + 0.1, dark, { pos: [0, spec.eaves - 0.11, sz * faceZ], uvScale: 1.4 }));
    for (const sx of [-1, 1]) {
      const brace = box(1.25, 0.16, WALL + 0.06, dark, {
        pos: [sx * (halfX - 0.75), PLINTH + 0.62, sz * faceZ],
        uvScale: 1,
      });
      brace.rotation.z = sx < 0 ? Math.PI / 4 : -Math.PI / 4;
      g.add(brace);
    }
  }

  // Roof.
  g.add(
    swaybackRoof(
      spec.w,
      halfZ,
      spec.ridge,
      spec.eaves,
      0.6,
      0.8,
      0.28,
      0.18,
      0.28,
      mat('shingleBlue', Math.round(spec.w / 1.6), 3, THREE.DoubleSide),
      { bargeboards: true },
    ),
  );

  // Gable chimney.
  const stack = chimney(spec.chimneyTop, spec.seed ^ 0x3f1);
  stack.position.set(spec.chimneySide * (halfX + 0.45), 0, 0);
  g.add(stack);

  // Door on the south facade.
  const door = doorway(halfZ);
  door.position.x = spec.doorX;
  g.add(door);

  // Windows.
  for (const x of spec.southWindows) {
    const w = shutteredWindow(1.0, 1.0);
    w.position.set(x, 1.65, halfZ + 0.02);
    g.add(w);
  }
  for (const x of spec.northWindows) {
    const w = shutteredWindow(1.0, 1.0);
    w.position.set(x, 1.65, -(halfZ + 0.02));
    w.rotation.y = Math.PI;
    g.add(w);
  }
  // Gable window on the side without the chimney.
  const gableWinSide = -spec.chimneySide;
  const gw = shutteredWindow(0.9, 1.0);
  gw.position.set(gableWinSide * (halfX + 0.02), 1.65, 0);
  gw.rotation.y = (gableWinSide * Math.PI) / 2;
  g.add(gw);

  if (spec.dormer) g.add(dormer());

  // Yard.
  const pile = woodpile(spec.seed ^ 0x77);
  if (variant === 'a') {
    pile.position.set(-(halfX + 0.9), 0, 0.6);
    g.add(pile);
    g.add(vegetableGarden(spec.seed ^ 0x1234));
  } else {
    pile.position.set(halfX + 0.9, 0, -0.4);
    pile.rotation.y = 0.2;
    g.add(pile);

    const cask = mat('timberLight');
    const hoop = mat('metalDark');
    for (const [x, z, r, h] of [
      [-(halfX + 0.7), -1.9, 0.33, 0.82],
      [-(halfX + 0.75), -0.95, 0.29, 0.72],
      [-(halfX + 1.4), -1.6, 0.31, 0.78],
    ] as Array<[number, number, number, number]>) {
      const b = barrel(r, h, cask, hoop);
      b.position.set(x, 0, z);
      g.add(b);
    }

    const line = laundryLine(spec.seed ^ 0x9a);
    line.position.set(0.4, 0, halfZ + 1.6);
    g.add(line);
  }

  return g;
}
