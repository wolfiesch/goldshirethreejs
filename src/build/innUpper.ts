import * as THREE from 'three';
import { mat } from '../gen/materials';
import { box, candle, candleRingChandelier, cylinder } from '../gen/prims';
import { makeRng, range, type Rng } from '../gen/rng';
import { bed, bookshelf, candelabra, chest, highBackChair, roundTable, sideTable, stool, washStand } from './furniture';
import { buildWall, framedPicture, railing } from './innParts';
import { INN, STAIR_WELL } from './innSpec';

/**
 * Guest storey under the roof. The rafters are exposed outboard of a flat
 * collar ceiling, so headroom runs 2.9 m at the walls and 4.7 m in the middle.
 */

const FLOOR = INN.floorU;
const IX = INN.innerX;
const IZ = INN.innerZ;
const COLLAR = INN.collarY;
const COLLAR_HALF = INN.collarHalfZ;
const SLOPE = (COLLAR - INN.eaves) / (IZ - COLLAR_HALF);

/** Underside of the finished ceiling at a given z: flat collar, then rafters. */
function ceilingY(z: number): number {
  const a = Math.abs(z);
  return a <= COLLAR_HALF ? COLLAR : COLLAR - (a - COLLAR_HALF) * SLOPE;
}

interface DoorHole {
  /** Centre along the partition axis. */
  a: number;
  w: number;
  h: number;
}

/**
 * Partition running along Z at a fixed x, its head following the sloped
 * ceiling. Built as an extruded profile so the wall meets the rafters cleanly.
 */
function crossPartition(x: number, z0: number, z1: number, thickness: number, doors: DoorHole[]): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(z0, FLOOR);
  shape.lineTo(z1, FLOOR);
  const steps = Math.max(2, Math.ceil((z1 - z0) / 0.25));
  for (let i = steps; i >= 0; i--) {
    const z = z0 + ((z1 - z0) * i) / steps;
    shape.lineTo(z, ceilingY(z));
  }
  shape.closePath();
  for (const d of doors) {
    const p = new THREE.Path();
    p.moveTo(d.a - d.w / 2, FLOOR);
    p.lineTo(d.a + d.w / 2, FLOOR);
    p.lineTo(d.a + d.w / 2, FLOOR + d.h);
    p.lineTo(d.a - d.w / 2, FLOOR + d.h);
    p.closePath();
    shape.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  const mesh = new THREE.Mesh(geo, mat('plaster'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Profile is authored in (z, y). Rotating by -PI/2 maps the shape's first
  // axis onto +Z; +PI/2 would mirror it and drop the wall across the hallway.
  mesh.rotation.y = -Math.PI / 2;
  mesh.position.x = x;
  g.add(mesh);

  // Timber framing on the room side.
  const dark = mat('timberDark');
  for (const d of doors) {
    for (const s of [-1, 1]) {
      g.add(box(thickness + 0.06, d.h + 0.1, 0.1, dark, { pos: [x, FLOOR + (d.h + 0.1) / 2, d.a + s * (d.w / 2 + 0.05)], uvScale: 0.5 }));
    }
    g.add(box(thickness + 0.06, 0.12, d.w + 0.2, dark, { pos: [x, FLOOR + d.h + 0.06, d.a], uvScale: 0.5 }));
  }
  return g;
}

/** Plank door leaf hinged open at 80 degrees; static, like the front door. */
function openDoor(hingeX: number, hingeZ: number, width: number, height: number, axis: 'x' | 'z', swing: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, FLOOR, hingeZ);
  pivot.rotation.y = (axis === 'x' ? 0 : Math.PI / 2) + swing;
  const leaf = box(width, height, 0.06, mat('plankWall'), { pos: [width / 2, height / 2, 0], uvScale: 0.8 });
  pivot.add(leaf);
  for (const hy of [0.25, height - 0.25]) {
    pivot.add(box(width * 0.75, 0.06, 0.025, mat('metalDark'), { pos: [width / 2, hy, 0.043], uvScale: 0.3 }));
  }
  return pivot;
}

export function buildInnUpper(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'innUpper';
  const rng = makeRng(0x2f10);
  const plankFloor = mat('plankFloor');
  const plankWall = mat('plankWall');
  const dark = mat('timberDark');

  // ---- floor deck (3.9 -> 4.3) with the stairwell void cut out ------------
  const deckY = (INN.ceilG + FLOOR) / 2;
  const deckH = FLOOR - INN.ceilG;
  g.add(box(STAIR_WELL.x0 + IX, deckH, IZ * 2, plankFloor, { pos: [(-IX + STAIR_WELL.x0) / 2, deckY, 0], uvScale: 1.4 }));
  g.add(box(IX - STAIR_WELL.x0, deckH, STAIR_WELL.z0 + IZ, plankFloor, {
    pos: [(STAIR_WELL.x0 + IX) / 2, deckY, (-IZ + STAIR_WELL.z0) / 2], uvScale: 1.4,
  }));
  g.add(box(IX - STAIR_WELL.x0, deckH, IZ - STAIR_WELL.z1, plankFloor, {
    pos: [(STAIR_WELL.x0 + IX) / 2, deckY, (STAIR_WELL.z1 + IZ) / 2], uvScale: 1.4,
  }));

  // ---- sloped rafter ceiling and flat collar ------------------------------
  const slopeLen = Math.hypot(IZ - COLLAR_HALF, COLLAR - INN.eaves);
  const slopeAngle = Math.atan2(COLLAR - INN.eaves, IZ - COLLAR_HALF);
  for (const s of [-1, 1]) {
    const panel = box(IX * 2, 0.08, slopeLen, plankWall, { uvScale: 1.6 });
    panel.position.set(0, (INN.eaves + COLLAR) / 2, (s * (IZ + COLLAR_HALF)) / 2);
    // Rotating about +X sends local +Z to (0, -sin a, cos a): the panel must
    // fall away from the collar toward the eaves, so the sign follows `s`.
    panel.rotation.x = s * slopeAngle;
    g.add(panel);
    for (let x = -IX + 0.45; x <= IX - 0.3; x += 0.9) {
      const rafter = box(0.14, 0.2, slopeLen, dark, { uvScale: 0.8 });
      rafter.position.set(x, (INN.eaves + COLLAR) / 2 - 0.13, (s * (IZ + COLLAR_HALF)) / 2);
      rafter.rotation.x = s * slopeAngle;
      g.add(rafter);
    }
  }
  g.add(box(IX * 2, 0.08, COLLAR_HALF * 2, plankWall, { pos: [0, COLLAR - 0.04, 0], uvScale: 1.6 }));
  for (let x = -IX + 0.45; x <= IX - 0.3; x += 0.9) {
    g.add(box(0.16, 0.24, COLLAR_HALF * 2 + 0.4, dark, { pos: [x, COLLAR - 0.2, 0], uvScale: 0.8 }));
  }

  // ---- partitions ---------------------------------------------------------
  const doorH = 2.1;
  const doorW = 0.9;
  // Hallway wall at z = 1.4, one door per guest room.
  g.add(
    buildWall({
      axis: 'x', from: -IX, to: 4.6, offset: 1.4, y0: FLOOR, y1: COLLAR,
      thickness: 0.2, material: mat('plaster'), uvScale: 2.0,
      openings: [-5.4, -1.0, 2.9].map((a) => ({ a, w: doorW, y0: FLOOR, y1: FLOOR + doorH })),
    }),
  );
  for (const a of [-5.4, -1.0, 2.9]) {
    for (const s of [-1, 1]) {
      g.add(box(0.26, doorH + 0.1, 0.1, dark, { pos: [a + s * (doorW / 2 + 0.05), FLOOR + (doorH + 0.1) / 2, 1.4], uvScale: 0.5 }));
    }
    g.add(box(doorW + 0.2, 0.12, 0.26, dark, { pos: [a, FLOOR + doorH + 0.06, 1.4], uvScale: 0.5 }));
    g.add(openDoor(a - doorW / 2, 1.36, doorW, doorH, 'x', -THREE.MathUtils.degToRad(80)));
  }
  g.add(crossPartition(-3.2, -IZ, 1.4, 0.2, []));
  g.add(crossPartition(1.2, -IZ, 1.4, 0.2, []));
  g.add(crossPartition(4.5, -IZ, 1.4, 0.2, []));

  // ---- stairwell guarding -------------------------------------------------
  g.add(
    railing(
      [
        new THREE.Vector3(STAIR_WELL.x0, FLOOR, STAIR_WELL.z0),
        new THREE.Vector3(STAIR_WELL.x0, FLOOR, STAIR_WELL.z1),
        new THREE.Vector3(IX, FLOOR, STAIR_WELL.z1),
      ],
      { height: 0.95, postSpacing: 1.2, postSize: 0.12 },
    ),
  );

  // ---- guest rooms --------------------------------------------------------
  // West room: the chimney breast fills part of its west wall.
  g.add(box(1.0, ceilingY(-1.0) - FLOOR, 1.2, mat('brick'), { pos: [-6.9, (FLOOR + ceilingY(-1.0)) / 2, -1.0], uvScale: 1.2 }));
  g.add(roomWest(rng));
  g.add(roomCentre(rng));
  g.add(roomEast(rng));

  // ---- trainer nook at the stair head -------------------------------------
  const nook = new THREE.Group();
  const nookTable = roundTable(1.0);
  nookTable.position.set(6.0, FLOOR, -3.4);
  nook.add(nookTable);
  for (const [cx, cz, ry] of [
    [5.2, -3.4, Math.PI / 2],
    [6.8, -3.4, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const chair = highBackChair();
    chair.position.set(cx, FLOOR, cz);
    chair.rotation.y = ry;
    nook.add(chair);
  }
  const shelf = bookshelf(1.3, 1.8, 0.32, 0x3311);
  shelf.position.set(6.4, FLOOR, -IZ + 0.2);
  nook.add(shelf);
  const nookCand = candelabra(3);
  nookCand.position.set(6.0, FLOOR + 0.78, -3.4);
  nook.add(nookCand);
  const banner = box(1.0, 1.8, 0.03, mat('clothRed'), { pos: [4.9, FLOOR + 1.9, -IZ + 0.06], uvScale: 1.4, collide: false });
  nook.add(banner);
  g.add(nook);

  // ---- hallway furnishings ------------------------------------------------
  const hallTable = sideTable(0.9, 0.42);
  hallTable.position.set(-5.5, FLOOR, 3.6);
  hallTable.rotation.y = Math.PI;
  g.add(hallTable);
  const hallCand = candelabra(3);
  hallCand.position.set(-5.5, FLOOR + 0.7, 3.6);
  g.add(hallCand);
  const hallShelf = bookshelf(1.1, 2.0, 0.34, 0x77aa);
  hallShelf.position.set(0.5, FLOOR, IZ - 0.22);
  hallShelf.rotation.y = Math.PI;
  g.add(hallShelf);
  for (const px of [-4.2, -1.8, 3.2]) {
    const pic = framedPicture(0.8, 0.6);
    pic.position.set(px, 6.3, 1.52);
    pic.userData.collide = false;
    g.add(pic);
  }

  // ---- lighting -----------------------------------------------------------
  const chandelier = candleRingChandelier(0.45, 5, 1.6, 0.7);
  chandelier.position.set(-1.0, 6.6, 2.9);
  chandelier.userData.collide = false;
  const cl = chandelier.children.find((c) => (c as THREE.PointLight).isPointLight);
  if (cl) cl.userData.interior = true;
  g.add(chandelier);

  return g;
}

/** Emissive-only bedside candle on a saucer: light without a point-light slot. */
function bedsideCandle(x: number, z: number, y: number): THREE.Group {
  const holder = new THREE.Group();
  holder.add(cylinder(0.06, 0.015, 8, mat('metalDark'), { pos: [0, 0.008, 0] }));
  const c = candle(0.15);
  c.position.y = 0.015;
  holder.add(c);
  holder.position.set(x, y, z);
  return holder;
}

function roomWest(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const b = bed(2.0, 1.0);
  b.position.set(-5.6, FLOOR, -3.3);
  b.rotation.y = -Math.PI / 2;
  g.add(b);
  const table = sideTable(0.6, 0.4);
  table.position.set(-4.2, FLOOR, -4.0);
  g.add(table);
  g.add(bedsideCandle(-4.2, -4.0, FLOOR + 0.7));
  const c = chest();
  c.position.set(-6.6, FLOOR, 0.6);
  c.rotation.y = 0.2 + range(rng, -0.1, 0.1);
  g.add(c);
  const stand = washStand();
  stand.position.set(-4.0, FLOOR, 0.7);
  stand.rotation.y = -Math.PI / 2;
  g.add(stand);
  g.add(box(2.2, 0.02, 1.5, mat('rugRed', 1, 1), { pos: [-5.4, FLOOR + 0.012, -1.1], uvScale: 2.4, collide: false, castShadow: false }));
  return g;
}

function roomCentre(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const b = bed(2.0, 0.95);
  b.position.set(0.1, FLOOR, -3.35);
  b.rotation.y = -Math.PI / 2;
  g.add(b);
  const c = chest(0.7, 0.5, 0.45);
  c.position.set(-2.3, FLOOR, -3.6);
  c.rotation.y = range(rng, -0.15, 0.15);
  g.add(c);
  const s = stool();
  s.position.set(-1.9, FLOOR, -1.4);
  g.add(s);
  const table = sideTable(0.55, 0.38);
  table.position.set(-2.4, FLOOR, 0.5);
  g.add(table);
  g.add(bedsideCandle(-2.4, 0.5, FLOOR + 0.7));
  return g;
}

function roomEast(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const bx of [2.1, 3.6]) {
    const b = bed(1.9, 0.8);
    b.position.set(bx, FLOOR, -3.4);
    b.rotation.y = -Math.PI / 2;
    g.add(b);
  }
  const table = sideTable(0.6, 0.4);
  table.position.set(2.9, FLOOR, 0.5);
  table.rotation.y = range(rng, -0.1, 0.1);
  g.add(table);
  g.add(bedsideCandle(2.9, 0.5, FLOOR + 0.7));
  const c = chest(0.65, 0.45, 0.4);
  c.position.set(4.0, FLOOR, 0.7);
  c.rotation.y = -0.4;
  g.add(c);
  return g;
}
