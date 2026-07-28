import * as THREE from 'three';
import { mat } from '../gen/materials';
import { barrel, bottle, bowedBeam, box, candle, candleRingChandelier, crate, cylinder, fireEffect, jar, tankard, taperedPost } from '../gen/prims';
import { makeRng, range, type Rng } from '../gen/rng';
import {
  barrelPyramid,
  benchSeat,
  candelabra,
  caskRack,
  highBackChair,
  plankTable,
  potRack,
  roundTable,
  sackPile,
  shelfWithClutter,
  stool,
} from './furniture';
import { framedPicture, railing, sconce, straightStair } from './innParts';
import { CELLAR_WELL, INN, STAIR_WELL } from './innSpec';

/**
 * The common room. Everything here is grounded in the interior reference:
 * plank floor, heavy hand-hewn beams with joists perpendicular above, a brick
 * firebox inside a pale carved-stone surround with a scrolled lintel, a
 * straight boxed-stringer stair against a wall with sacks at its foot, a
 * horizontal cask rack, long plank tables and candle-ring chandeliers.
 */

const FLOOR = INN.floorG;
const CEIL = INN.ceilG;
const IX = INN.innerX;
const IZ = INN.innerZ;


export function buildInnGround(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'innGround';
  const rng = makeRng(0x11a5);
  const plankFloor = mat('plankFloor');
  const plankWall = mat('plankWall');
  const dark = mat('timberDark');
  const light = mat('timberLight');
  const brick = mat('brick');
  const carved = mat('carvedStone');
  const stone = mat('stoneBlock');

  // ---- floor deck, cellar well cut out ------------------------------------
  const deckY = (0.1 + FLOOR) / 2;
  const deckH = FLOOR - 0.1;
  g.add(box(CELLAR_WELL.x1 - (-IX), deckH, CELLAR_WELL.z0 - (-IZ), plankFloor, {
    pos: [(-IX + CELLAR_WELL.x1) / 2, deckY, (-IZ + CELLAR_WELL.z0) / 2], uvScale: 1.4,
  }));
  g.add(box(CELLAR_WELL.x1 - (-IX), deckH, IZ - CELLAR_WELL.z1, plankFloor, {
    pos: [(-IX + CELLAR_WELL.x1) / 2, deckY, (CELLAR_WELL.z1 + IZ) / 2], uvScale: 1.4,
  }));
  g.add(box(IX - CELLAR_WELL.x1, deckH, IZ * 2, plankFloor, {
    pos: [(CELLAR_WELL.x1 + IX) / 2, deckY, 0], uvScale: 1.4,
  }));

  // ---- ceiling frame: primaries N-S, joists E-W, posts under the primaries -
  for (const px of [-2.5, 2.5]) {
    // Bowed, not boxed: every interior reference shows the primaries sagging
    // under the floor above. The post below meets the beam at its lowest point.
    g.add(bowedBeam([px, 3.775, -IZ], [px, 3.775, IZ], 0.35, 0.45, 0.09, dark));
    const post = taperedPost(3.05 - 0.09, 0.2, 0.26, 8, light);
    post.position.set(px, FLOOR, 0);
    g.add(post);
    g.add(box(0.5, 0.14, 0.5, dark, { pos: [px, 3.39, 0], uvScale: 0.4 }));
  }
  // Joists stop at the stairwell trimmer: run them full width and they cross
  // the opening at head height, capping the stair four steps up.
  for (let z = -IZ + 0.4; z <= IZ - 0.3; z += 0.8) {
    const overWell = z > STAIR_WELL.z0 - 0.2 && z < STAIR_WELL.z1 + 0.2;
    const x1 = overWell ? STAIR_WELL.x0 : IX;
    g.add(box(x1 + IX, 0.22, 0.16, dark, { pos: [(-IX + x1) / 2, 3.83, z], uvScale: 1.4 }));
  }
  // Trimmer beam closing the joist ends along the stairwell's west edge.
  g.add(box(0.2, 0.28, STAIR_WELL.z1 - STAIR_WELL.z0, dark, {
    pos: [STAIR_WELL.x0 - 0.1, 3.8, (STAIR_WELL.z0 + STAIR_WELL.z1) / 2], uvScale: 1.0,
  }));

  // ---- interior wall lining ----------------------------------------------
  // Wainscot on the north and east walls, plus a rail course all round.
  g.add(box(IX * 2, 1.0, 0.05, plankWall, { pos: [0, FLOOR + 0.5, -IZ + 0.025], uvScale: 1.2 }));
  g.add(box(0.05, 1.0, IZ * 2, plankWall, { pos: [IX - 0.025, FLOOR + 0.5, 0], uvScale: 1.2 }));
  g.add(box(IX * 2, 0.1, 0.1, dark, { pos: [0, FLOOR + 1.03, -IZ + 0.05], uvScale: 1.0 }));
  // The south rail stops either side of the front door: run it straight
  // through and it bars the only entrance at chest height.
  for (const [x0, x1] of [
    [-IX, 0.4],
    [2.6, IX],
  ]) {
    g.add(box(x1 - x0, 0.1, 0.1, dark, { pos: [(x0 + x1) / 2, FLOOR + 1.03, IZ - 0.05], uvScale: 1.0 }));
  }
  for (const sz of [-1, 1]) {
    g.add(box(IX * 2, 0.12, 0.12, dark, { pos: [0, CEIL - 0.2, sz * (IZ - 0.06)], uvScale: 1.0 }));
  }
  // East wall runs clean; the west rail is split around the chimney breast so
  // it does not cut straight across the open firebox.
  g.add(box(0.1, 0.1, IZ * 2, dark, { pos: [IX - 0.05, FLOOR + 1.03, 0], uvScale: 1.0 }));
  for (const [z0, z1] of [
    [-IZ, -2.75],
    [0.75, IZ],
  ]) {
    g.add(box(0.1, 0.1, z1 - z0, dark, { pos: [-IX + 0.05, FLOOR + 1.03, (z0 + z1) / 2], uvScale: 1.0 }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.12, 0.12, IZ * 2, dark, { pos: [sx * (IX - 0.06), CEIL - 0.2, 0], uvScale: 1.0 }));
  }
  // Vertical studs on the inside face, echoing the exterior rhythm.
  for (const x of [-6.0, -4.4, 0.0, 4.4, 6.0]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.16, CEIL - FLOOR - 1.2, 0.08, dark, { pos: [x, FLOOR + 1.13 + (CEIL - FLOOR - 1.2) / 2, sz * (IZ - 0.04)], uvScale: 0.8 }));
    }
  }

  g.add(buildHearth(rng, brick, carved, stone, dark));
  g.add(buildBar(rng, plankWall, light, dark));
  g.add(buildMainStair(plankFloor, plankWall, light));
  g.add(buildFurniture(rng, light, dark));
  g.add(buildLighting());

  return g;
}

/** West-wall fireplace: brick firebox, segmental arch, carved-stone surround. */
function buildHearth(
  rng: Rng,
  brick: THREE.Material,
  carved: THREE.Material,
  stone: THREE.Material,
  dark: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const cz = -1.0;
  const breastFront = -6.7; // 0.7 m projection into the room
  const wallFace = -IX;
  const openW = 2.2;
  const openZ0 = cz - openW / 2;
  const openZ1 = cz + openW / 2;
  const hearthTop = FLOOR + 0.35;
  const archSpring = hearthTop + 1.35;
  const archRise = 0.32;
  const breastZ0 = cz - 1.7;
  const breastZ1 = cz + 1.7;

  // Raised hearth apron projecting east into the room.
  g.add(box(0.8, 0.35, 2.8, stone, { pos: [wallFace + 0.4, FLOOR + 0.175, cz], uvScale: 2.2 }));

  // Breast piers either side of the opening. Pale carved ashlar, matching the
  // reference: the brick only shows inside the firebox reveal.
  for (const [z0, z1] of [
    [breastZ0, openZ0],
    [openZ1, breastZ1],
  ]) {
    g.add(box(0.7, CEIL - FLOOR, z1 - z0, carved, {
      pos: [wallFace + 0.35, (FLOOR + CEIL) / 2, (z0 + z1) / 2], uvScale: 1.1,
    }));
  }
  // Head above the arch.
  g.add(box(0.7, CEIL - (archSpring + archRise), openW, carved, {
    pos: [wallFace + 0.35, (archSpring + archRise + CEIL) / 2, cz], uvScale: 1.1,
  }));
  // Below the opening, behind the apron.
  g.add(box(0.7, 0.35, openW, brick, { pos: [wallFace + 0.35, FLOOR + 0.175, cz], uvScale: 0.8 }));

  // Segmental arch head, 18 voussoirs so the curve reads smooth.
  const segs = 18;
  const R = (openW * openW / 4 + archRise * archRise) / (2 * archRise);
  const centreY = archSpring + archRise - R;
  const halfAngle = Math.asin(openW / 2 / R);
  for (let i = 0; i < segs; i++) {
    const a = -halfAngle + ((i + 0.5) / segs) * halfAngle * 2;
    const vz = cz + Math.sin(a) * (R + 0.11);
    const vy = centreY + Math.cos(a) * (R + 0.11);
    const v = box(0.7, 0.24, (2 * Math.PI * R) / segs * (halfAngle / Math.PI) * 2.6 + 0.09, brick, {
      pos: [wallFace + 0.35, vy, vz], uvScale: 0.5,
    });
    v.rotation.x = -a;
    g.add(v);
  }

  // Blackened firebox rear and cheeks.
  g.add(box(0.06, archSpring + archRise - hearthTop, openW, mat('coal'), {
    pos: [wallFace + 0.03, (hearthTop + archSpring + archRise) / 2, cz], uvScale: 1,
  }));
  for (const s of [-1, 1]) {
    g.add(box(0.7, archSpring + archRise - hearthTop, 0.05, mat('coal'), {
      pos: [wallFace + 0.35, (hearthTop + archSpring + archRise) / 2, cz + s * (openW / 2 - 0.02)], uvScale: 1,
    }));
  }

  // Carved-stone surround: jambs, scrolled lintel and projecting mantel.
  for (const s of [-1, 1]) {
    g.add(box(0.14, 2.05, 0.5, carved, { pos: [breastFront - 0.07, hearthTop + 1.025, cz + s * (openW / 2 + 0.25)], uvScale: 1.2 }));
  }
  g.add(box(0.16, 0.45, 3.4, carved, { pos: [breastFront - 0.08, archSpring + archRise + 0.26, cz], uvScale: 1.6 }));
  g.add(box(0.42, 0.14, 3.6, carved, { pos: [breastFront - 0.15, archSpring + archRise + 0.55, cz], uvScale: 1.6 }));
  // Breast tapers back above the mantel.
  g.add(box(0.52, CEIL - (archSpring + archRise + 0.62), 2.6, carved, {
    pos: [wallFace + 0.26, (archSpring + archRise + 0.62 + CEIL) / 2, cz], uvScale: 1.4,
  }));

  // Mantel props.
  const mantelY = archSpring + archRise + 0.62;
  const mantelX = breastFront - 0.2;
  for (const [dz, kind] of [
    [-1.35, 'jar'], [-1.0, 'jar'], [-0.4, 'bottle'], [-0.1, 'bottle'], [0.2, 'bottle'], [1.1, 'cask'],
  ] as Array<[number, string]>) {
    let prop: THREE.Object3D;
    if (kind === 'jar') prop = jar(0.2, 0.08);
    else if (kind === 'bottle') prop = bottle(0.26, 0.036);
    else {
      prop = barrel(0.17, 0.34, mat('timberDark'), mat('metalDark'));
      prop.rotation.x = Math.PI / 2;
      prop.position.z = 0.17;
    }
    const holder = new THREE.Group();
    holder.add(prop);
    holder.position.set(mantelX, mantelY, cz + dz);
    g.add(holder);
  }

  // Logs and fire.
  for (let i = 0; i < 4; i++) {
    const log = cylinder(0.075, range(rng, 0.7, 0.95), 7, mat('bark'), {
      pos: [wallFace + 0.36 + range(rng, -0.05, 0.05), hearthTop + 0.08 + (i % 2) * 0.14, cz + range(rng, -0.12, 0.12)],
    });
    log.rotation.z = Math.PI / 2;
    log.rotation.y = range(rng, -0.35, 0.35) + (i < 2 ? 0 : 0.5);
    g.add(log);
  }
  const fire = fireEffect(1.6, 1.1, 4242);
  fire.position.set(wallFace + 0.4, hearthTop + 0.05, cz);
  g.add(fire);

  const fireLight = new THREE.PointLight(0xff8a3c, 2.2, 14, 2);
  fireLight.position.set(-6.6, 1.1, cz);
  fireLight.castShadow = false;
  fireLight.userData.interior = true;
  fireLight.userData.tick = (_dt: number, elapsed: number) => {
    fireLight.intensity = 2.2 * (1 + Math.sin(elapsed * 7.3) * 0.07 + Math.sin(elapsed * 3.1) * 0.05);
  };
  g.add(fireLight);

  // Fire irons leaning on the jamb.
  for (let i = 0; i < 2; i++) {
    const iron = cylinder(0.016, 1.0, 5, mat('metalDark'), { pos: [breastFront - 0.16, FLOOR + 0.5, cz + 1.5 + i * 0.12] });
    iron.rotation.x = 0.16;
    iron.rotation.z = 0.1;
    g.add(iron);
  }
  g.add(box(0.06, 0.9, 0.06, dark, { pos: [breastFront - 0.2, FLOOR + 0.45, cz - 1.55], uvScale: 0.4 }));
  return g;
}

/** L-shaped bar on the north wall with the back-bar cask rack behind it. */
function buildBar(
  rng: Rng,
  plankWall: THREE.Material,
  light: THREE.Material,
  dark: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const topY = FLOOR + 1.1;
  const carcassH = 1.1 - 0.06;

  // Main run: front face at z = -3.0, 0.7 deep, leaving service space behind.
  g.add(box(6.0, carcassH, 0.7, plankWall, { pos: [0, FLOOR + carcassH / 2, -3.35], uvScale: 1.0 }));
  g.add(box(6.24, 0.07, 0.86, light, { pos: [0, topY, -3.35], uvScale: 1.1 }));
  g.add(box(6.0, 0.09, 0.09, dark, { pos: [0, FLOOR + 0.18, -2.96], uvScale: 0.8 }));
  // Return leg heading south from the east end.
  g.add(box(0.7, carcassH, 1.4, plankWall, { pos: [2.65, FLOOR + carcassH / 2, -2.3], uvScale: 1.0 }));
  g.add(box(0.86, 0.07, 1.55, light, { pos: [2.65, topY, -2.33], uvScale: 1.1 }));
  g.add(box(0.09, 0.09, 1.4, dark, { pos: [2.26, FLOOR + 0.18, -2.3], uvScale: 0.8 }));

  // Back-bar shelving against the north wall. The lower shelf is short: the
  // cask rack occupies the west half of that band.
  const upper = shelfWithClutter(5.6, 0.3, 0x8b2e);
  upper.position.set(-0.2, FLOOR + 2.3, -IZ + 0.2);
  g.add(upper);
  const lower = shelfWithClutter(2.2, 0.3, 0x8b1d);
  lower.position.set(1.5, FLOOR + 1.75, -IZ + 0.2);
  g.add(lower);
  g.add(box(5.8, 2.5, 0.06, plankWall, { pos: [-0.2, FLOOR + 1.25, -IZ + 0.05], uvScale: 1.2 }));

  // The horizontal cask rack, straight from the reference: raised on a stand
  // so the casks clear the counter top and read from the far side of the bar.
  g.add(box(3.0, 0.75, 0.85, plankWall, { pos: [-1.5, FLOOR + 0.375, -IZ + 0.5], uvScale: 1.0 }));
  const rack = caskRack(4);
  rack.position.set(-1.5, FLOOR + 0.75, -IZ + 0.5);
  rack.rotation.y = Math.PI;
  g.add(rack);

  // Counter clutter.
  for (let i = 0; i < 6; i++) {
    const t = tankard();
    t.position.set(range(rng, -2.6, 2.4), topY + 0.035, range(rng, -3.6, -3.15));
    g.add(t);
  }
  for (let i = 0; i < 8; i++) {
    const b = bottle(range(rng, 0.22, 0.3), 0.036);
    b.position.set(range(rng, -2.7, 2.3), FLOOR + 0.9, -IZ + 0.22);
    g.add(b);
  }
  const cheese = cylinder(0.19, 0.12, 12, mat('wax'), { pos: [2.0, topY + 0.095, -3.45] });
  g.add(cheese);

  for (const px of [-2.2, 1.6]) {
    const pots = potRack(1.5, 5, 0x77 + px * 10);
    pots.position.set(px, 3.4, -3.9);
    pots.userData.collide = false;
    g.add(pots);
  }

  // Upright barrels stacked west of the bar.
  for (let i = 0; i < 3; i++) {
    const b = barrel(0.36, 0.86, dark, mat('metalDark'));
    b.position.set(-3.6 + (i % 2) * 0.05, FLOOR + (i === 2 ? 0.86 : 0), -4.0 + (i === 1 ? 0.78 : 0));
    g.add(b);
  }
  return g;
}

/** Straight flight against the east wall, boxed stringer, sacks at its foot. */
function buildMainStair(plankFloor: THREE.Material, plankWall: THREE.Material, light: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const stair = straightStair({
    steps: 19,
    rise: 0.2,
    going: 0.305,
    width: 1.6,
    treadMaterial: plankFloor,
    closedStringer: true,
    stringerMaterial: plankWall,
  });
  stair.position.set(6.6, FLOOR, 3.6);
  stair.rotation.y = Math.PI / 2;
  g.add(stair);

  // Handrail on the open (west) side only.
  g.add(
    railing(
      [new THREE.Vector3(5.72, FLOOR + 0.2, 3.35), new THREE.Vector3(5.72, FLOOR + 3.8, -2.2)],
      { height: 0.95, postSpacing: 0.61, postSize: 0.07, material: light },
    ),
  );

  // Sacks and crates dumped at the foot.
  // Beside the flight, not across its foot: props on the bottom tread wall the
  // stair off entirely for a 0.35 m capsule.
  const pile = sackPile(0x5ac, 3);
  pile.position.set(4.9, FLOOR, 3.85);
  g.add(pile);
  for (const [cx, cz, ry] of [
    [4.2, 4.0, 0.3],
    [5.5, 3.4, -0.5],
  ] as Array<[number, number, number]>) {
    const c = crate(0.62, light);
    c.position.set(cx, FLOOR, cz);
    c.rotation.y = ry;
    g.add(c);
  }
  return g;
}

function buildFurniture(rng: Rng, light: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();

  const longTables: Array<[number, number]> = [
    // Kept off the hearth axis so the fireplace reads clear from the doorway.
    [-4.2, -2.55],
    [-1.0, 2.6],
  ];
  for (const [tx, tz] of longTables) {
    const table = plankTable(2.4, 0.9);
    table.position.set(tx, FLOOR, tz);
    g.add(table);
    const rug = box(2.9, 0.02, 1.9, mat('rugRed', 1, 1), { pos: [tx, FLOOR + 0.012, tz], uvScale: 3.0, collide: false, castShadow: false });
    g.add(rug);
    for (const [dx, dz, ry] of [
      [-0.75, 0.78, 0],
      [0.75, 0.78, 0],
      [-0.75, -0.78, Math.PI],
      [0.75, -0.78, Math.PI],
    ] as Array<[number, number, number]>) {
      const chair = highBackChair();
      chair.position.set(tx + dx, FLOOR, tz + dz);
      chair.rotation.y = ry + range(rng, -0.14, 0.14);
      g.add(chair);
    }
    const cand = candelabra(3);
    cand.position.set(tx, FLOOR + 0.78, tz);
    g.add(cand);
  }

  const roundTables: Array<[number, number]> = [
    [4.2, 2.4],
    [2.6, -1.4],
    [-5.6, 3.7],
  ];
  for (const [tx, tz] of roundTables) {
    const table = roundTable(1.1);
    table.position.set(tx, FLOOR, tz);
    g.add(table);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + range(rng, -0.3, 0.3);
      const s = stool();
      s.position.set(tx + Math.cos(a) * 0.86, FLOOR, tz + Math.sin(a) * 0.86);
      g.add(s);
    }
    const mug = tankard();
    mug.position.set(tx + range(rng, -0.25, 0.25), FLOOR + 0.815, tz + range(rng, -0.25, 0.25));
    g.add(mug);
  }
  const roundRug = box(2.4, 0.02, 2.4, mat('rugRed', 1, 1), { pos: [4.2, FLOOR + 0.012, 2.4], uvScale: 2.6, collide: false, castShadow: false });
  g.add(roundRug);

  // Long table with a bench, rotated 90 degrees against the east wall.
  const sideTableGroup = plankTable(2.0, 0.85);
  sideTableGroup.position.set(5.0, FLOOR, -1.0);
  sideTableGroup.rotation.y = Math.PI / 2;
  g.add(sideTableGroup);
  const bench = benchSeat(1.9);
  bench.position.set(4.1, FLOOR, -1.0);
  bench.rotation.y = Math.PI / 2;
  g.add(bench);

  // Floor cask rack on the west wall and the barrel pyramid by the bar.
  const westRack = caskRack(4);
  westRack.position.set(-6.9, FLOOR, -3.6);
  westRack.rotation.y = Math.PI / 2;
  g.add(westRack);

  const pyramid = barrelPyramid();
  pyramid.position.set(4.6, FLOOR, -3.4);
  g.add(pyramid);

  // South-west corner, clear of the cellar well (X -7.4..-3.2, Z 1.6..3.0).
  const cornerSacks = sackPile(0x9e1, 3);
  cornerSacks.position.set(-6.9, FLOOR, 3.95);
  g.add(cornerSacks);

  // Framed pictures.
  const pics: Array<[number, number, number, number]> = [
    // Clear of the bar run (x -3..3), which would bury them behind shelving.
    [-6.0, 2.2, -IZ + 0.07, 0],
    [5.6, 2.2, -IZ + 0.07, 0],
    [IX - 0.07, 2.2, 1.5, -Math.PI / 2],
    [5.0, 2.2, IZ - 0.07, Math.PI],
  ];
  for (const [px, py, pz, ry] of pics) {
    const pic = framedPicture(0.8, 0.6);
    pic.position.set(px, py, pz);
    pic.rotation.y = ry;
    pic.userData.collide = false;
    g.add(pic);
  }

  // Firewood by the hearth.
  for (let i = 0; i < 7; i++) {
    const log = cylinder(0.08, 0.55, 6, mat('bark'), {
      pos: [-6.95 + (i % 3) * 0.17, FLOOR + 0.09 + Math.floor(i / 3) * 0.17, 1.0],
    });
    log.rotation.x = Math.PI / 2;
    g.add(log);
  }
  g.add(box(0.9, 0.12, 0.7, dark, { pos: [-6.9, FLOOR + 0.03, 1.0], uvScale: 0.6 }));
  return g;
}

function buildLighting(): THREE.Group {
  const g = new THREE.Group();
  for (const px of [-3.5, 3.5]) {
    const chandelier = candleRingChandelier(0.55, 7, 0.55, 1.25);
    chandelier.position.set(px, 3.0, 0);
    chandelier.userData.collide = false;
    const light = chandelier.children.find((c) => (c as THREE.PointLight).isPointLight);
    if (light) light.userData.interior = true;
    g.add(chandelier);
  }
  const sconces: Array<[number, number, number]> = [
    [-5.0, -IZ + 0.05, 0],
    [5.0, -IZ + 0.05, 0],
    [IX - 0.05, 3.0, -Math.PI / 2],
    [IX - 0.05, -3.0, -Math.PI / 2],
  ];
  // Sconces carry lit candles but no point light: the scene-wide budget is 12
  // real-time point lights and the chandeliers plus the fire already cover the
  // room. Their candle flames are additive quads, so they still read as lit.
  for (const [a, b, ry] of sconces) {
    const s = sconce();
    s.position.set(a, 2.1, b);
    s.rotation.y = ry;
    s.userData.collide = false;
    g.add(s);
    const flame = candle(0.13);
    flame.position.set(a + Math.sin(ry) * 0.2, 2.22, b + Math.cos(ry) * 0.2);
    flame.userData.collide = false;
    g.add(flame);
  }
  return g;
}
