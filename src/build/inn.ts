import * as THREE from 'three';
import { lanternMat, mat } from '../gen/materials';
import { registerNightLight } from '../core/daynight';
import { barrel, box, crate, cylinder, flutedPost, flutedRadius, kneeBrace, smokePlume, sweptPrism, swaybackHeightFn, swaybackRoof, taperedPost } from '../gen/prims';
import { buildWall, gableWall, type Opening, windowUnit } from './innParts';
import { buildInnCellar } from './innCellar';
import { buildInnGround } from './innGround';
import { INN, INN_ROOF_ARGS } from './innSpec';
import { buildInnUpper } from './innUpper';

/**
 * The Lion's Pride Inn. Local origin is the centre of the main block's
 * footprint, ground at y = 0, long axis along X, porch facing +Z (south).
 *
 * Massing follows the day reference: W:D:ridge of roughly 1 : 0.6 : 0.72,
 * flared tree-trunk corner posts, a doubled belt course at the first-floor
 * line, dark diamond lozenges in the upper plaster, a swayback blue shingle
 * roof with flared eaves, and a single red-brick chimney at the west gable.
 */

export { INN } from './innSpec';

const SOUTH_Z = INN.halfZ - INN.wallT / 2; // 4.7
const EAST_X = INN.halfX - INN.wallT / 2; // 7.7

interface WindowPlace {
  facade: 'south' | 'north' | 'east' | 'west';
  /** Position along the wall axis. */
  a: number;
  /** Vertical centre of the opening. */
  y: number;
  w: number;
  h: number;
  arched?: boolean;
}

/**
 * The arched head sits at sill 4.95 rather than 5.30: a 2.2 m opening on a
 * 5.30 sill would break through the 7.2 m eaves plate.
 */
const WINDOWS: WindowPlace[] = [
  { facade: 'south', a: -4.5, y: 2.2, w: 1.2, h: 1.0 },
  { facade: 'south', a: 6.0, y: 2.2, w: 1.2, h: 1.0 },
  { facade: 'south', a: -2.0, y: 5.8, w: 1.6, h: 1.9, arched: true },
  { facade: 'south', a: 5.5, y: 6.25, w: 0.7, h: 0.7 },
  { facade: 'north', a: -4.0, y: 2.2, w: 1.2, h: 1.0 },
  { facade: 'north', a: 4.0, y: 2.2, w: 1.2, h: 1.0 },
  { facade: 'north', a: -4.0, y: 5.95, w: 1.0, h: 1.3 },
  { facade: 'north', a: -1.0, y: 5.95, w: 1.0, h: 1.3 },
  { facade: 'north', a: 4.0, y: 5.95, w: 1.0, h: 1.3 },
  { facade: 'east', a: 1.0, y: 5.95, w: 1.0, h: 1.3 },
  { facade: 'west', a: -2.5, y: 5.95, w: 1.0, h: 1.3 },
];

const FACADE: Record<WindowPlace['facade'], { axis: 'x' | 'z'; offset: number; rotY: number }> = {
  south: { axis: 'x', offset: SOUTH_Z, rotY: Math.PI },
  north: { axis: 'x', offset: -SOUTH_Z, rotY: 0 },
  east: { axis: 'z', offset: EAST_X, rotY: -Math.PI / 2 },
  west: { axis: 'z', offset: -EAST_X, rotY: Math.PI / 2 },
};

const DOOR = { a: 1.5, w: 2.0, y0: INN.floorG, y1: 3.1 };

/** Studs every 1.6 m. */
const STUD_X = [-7.2, -5.6, -4.0, -2.4, -0.8, 0.8, 2.4, 4.0, 5.6, 7.2];
const STUD_Z = [-3.6, -2.0, -0.4, 1.2, 2.8];

/**
 * Heights of the lozenge run up each post. The gap is not decoration: the knee
 * braces occupy 2.95 to 4.05 and the doubled belt course 4.10 to 4.56, so a
 * diamond anywhere between them would be half-buried in timber.
 */
const LOZENGE_Y = [1.45, 2.35, 4.85, 5.7, 6.55];
const LOZENGE_SIZE = 0.34;

/** Corner posts: rBase, rTop and side count, shared with the lozenge fitting. */
const POST = { rBase: 0.28, rTop: 0.375, sides: 8 };

function openingsFor(facade: WindowPlace['facade']): Opening[] {
  const out: Opening[] = WINDOWS.filter((wd) => wd.facade === facade).map((wd) => ({
    a: wd.a,
    w: wd.w,
    y0: wd.y - wd.h / 2,
    y1: wd.y + wd.h / 2,
  }));
  if (facade === 'south') out.push({ a: DOOR.a, w: DOOR.w, y0: DOOR.y0, y1: DOOR.y1 });
  return out;
}

/**
 * The dark diamonds, running vertically up the outward face of a flared post.
 *
 * Every reference puts them here rather than scattered across the plaster: the
 * run reads as a stripe carved into the timber, and it is what makes a corner
 * post look like a corner post rather than a column.
 *
 * `bearing` is measured from +Z toward +X, which is both the direction the run
 * faces and the Y rotation that turns the panel to face it.
 */
function postLozenges(bearing: number): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  for (const y of LOZENGE_Y) {
    const panel = box(LOZENGE_SIZE, LOZENGE_SIZE, 0.07, dark, { uvScale: 0.35 });
    // The post has a waist, so its radius here is not a straight interpolation
    // between foot and head. Read it from the same function that shapes it.
    const d = flutedRadius(y / INN.eaves, POST.rBase, POST.rTop) + 0.015;
    panel.position.set(Math.sin(bearing) * d, y, Math.cos(bearing) * d);
    // Euler order is XYZ, so Z runs first: it spins the square onto its corner
    // while the face normal is still +Z, then Y turns that normal outward.
    panel.rotation.z = Math.PI / 4;
    panel.rotation.y = bearing;
    g.add(panel);
  }
  return g;
}

/**
 * Which way a post faces. A post on a corner faces the diagonal; one along a
 * wall faces that wall's normal.
 */
function postBearing(px: number, pz: number): number {
  const ox = Math.abs(px) === INN.halfX ? Math.sign(px) : 0;
  const oz = Math.abs(pz) === INN.halfZ ? Math.sign(pz) : 0;
  return Math.atan2(ox, oz);
}

function framingFor(
  facade: WindowPlace['facade'],
  studs: number[],
  axis: 'x' | 'z',
  offset: number,
  outward: number,
): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  const blocked = openingsFor(facade).filter((o) => o.y1 > 4.56);
  for (const a of studs) {
    if (blocked.some((o) => Math.abs(o.a - a) < o.w / 2 + 0.13)) continue;
    const h = INN.eaves - 4.56;
    const stud = box(axis === 'x' ? 0.22 : 0.14, h, axis === 'x' ? 0.14 : 0.22, dark, { uvScale: 0.5 });
    const depth = offset + outward * (INN.wallT / 2 + 0.03);
    stud.position.set(axis === 'x' ? a : depth, 4.56 + h / 2, axis === 'x' ? depth : a);
    g.add(stud);
  }
  return g;
}

export function buildInn(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'inn';

  const plaster = mat('plaster');
  const dark = mat('timberDark');
  const light = mat('timberLight');
  const stone = mat('stoneBlock');
  const shingle = mat('shingleBlue', 6, 4, THREE.DoubleSide);

  // ---- plinth -------------------------------------------------------------
  // A ring, not a slab: a solid plinth top would be coplanar with the ground
  // floor deck at y = 0.5 and z-fight straight through the plank floor.
  for (const sz of [-1, 1]) {
    root.add(box(16.6, 0.5, 0.9, stone, { pos: [0, 0.25, sz * 4.85], uvScale: 1.6 }));
  }
  for (const sx of [-1, 1]) {
    root.add(box(0.9, 0.5, 8.8, stone, { pos: [sx * 7.85, 0.25, 0], uvScale: 1.6 }));
  }

  // ---- walls --------------------------------------------------------------
  root.add(
    buildWall({
      axis: 'x', from: -INN.halfX, to: INN.halfX, offset: SOUTH_Z,
      y0: INN.floorG, y1: INN.eaves, thickness: INN.wallT, material: plaster,
      openings: openingsFor('south'), uvScale: 2.4,
    }),
  );
  root.add(
    buildWall({
      axis: 'x', from: -INN.halfX, to: INN.halfX, offset: -SOUTH_Z,
      y0: INN.floorG, y1: INN.eaves, thickness: INN.wallT, material: plaster,
      openings: openingsFor('north'), uvScale: 2.4,
    }),
  );
  root.add(
    buildWall({
      axis: 'z', from: -INN.innerZ, to: INN.innerZ, offset: EAST_X,
      y0: INN.floorG, y1: INN.eaves, thickness: INN.wallT, material: plaster,
      openings: openingsFor('east'), uvScale: 2.4,
    }),
  );
  root.add(
    buildWall({
      axis: 'z', from: -INN.innerZ, to: INN.innerZ, offset: -EAST_X,
      y0: INN.floorG, y1: INN.eaves, thickness: INN.wallT, material: plaster,
      openings: openingsFor('west'), uvScale: 2.4,
    }),
  );

  // ---- gables -------------------------------------------------------------
  // The rake follows the real sagged roof surface; a straight line to the full
  // ridge height would leave a sliver of plaster proud of the shingles.
  const roofY = swaybackHeightFn(...INN_ROOF_ARGS);
  for (const sx of [-1, 1]) {
    const rakeAt = (z: number): number => roofY(sx * EAST_X, z) - 0.04;
    const gable = gableWall(
      INN.halfZ,
      INN.eaves,
      rakeAt,
      INN.wallT,
      plaster,
      sx > 0 ? [{ a: 0, y: 9.6, w: 0.6, h: 0.6, diamond: true }] : [],
    );
    gable.rotation.y = Math.PI / 2;
    gable.position.x = sx * EAST_X;
    root.add(gable);

    // Raking trim following the same line, plus a king post.
    for (const sz of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const z = sz * (INN.halfZ * i) / 10;
        pts.push(new THREE.Vector3(sx * (EAST_X + INN.wallT / 2 + 0.09), rakeAt(z) - 0.12, z));
      }
      root.add(sweptPrism(pts, new THREE.Vector3(1, 0, 0), 0.18, 0.22, dark));
    }
    root.add(
      box(0.2, rakeAt(0) - INN.eaves - 0.35, 0.2, dark, {
        pos: [sx * (EAST_X + INN.wallT / 2 + 0.05), (INN.eaves + rakeAt(0) - 0.35) / 2, 0],
        uvScale: 0.6,
      }),
    );
    if (sx > 0) {
      const diamond = windowUnit(0.6, 0.6, { diamond: true });
      diamond.position.set(sx * (EAST_X + 0.02), 9.6, 0);
      diamond.rotation.y = -Math.PI / 2;
      root.add(diamond);
    }
  }

  // ---- flared posts, belt course, studs, braces ---------------------------
  const postSpots: Array<[number, number]> = [
    [-INN.halfX, -INN.halfZ], [INN.halfX, -INN.halfZ], [-INN.halfX, INN.halfZ], [INN.halfX, INN.halfZ],
    [-2.7, INN.halfZ], [2.7, INN.halfZ], [-2.7, -INN.halfZ], [2.7, -INN.halfZ],
    [-INN.halfX, 0], [INN.halfX, 0],
  ];
  for (const [px, pz] of postSpots) {
    const bearing = postBearing(px, pz);
    const post = flutedPost(INN.eaves, POST.rBase, POST.rTop, POST.sides, light);
    post.position.set(px, 0, pz);
    root.add(post);

    const run = postLozenges(bearing);
    run.position.set(px, 0, pz);
    root.add(run);
  }

  for (const y of [4.1, 4.45]) {
    for (const sz of [-1, 1]) {
      root.add(box(16.6, 0.22, 0.25, dark, { pos: [0, y, sz * (INN.halfZ + 0.025)], uvScale: 1.2 }));
    }
    for (const sx of [-1, 1]) {
      root.add(box(0.25, 0.22, 10.6, dark, { pos: [sx * (INN.halfX + 0.025), y, 0], uvScale: 1.2 }));
    }
  }

  root.add(framingFor('south', STUD_X, 'x', SOUTH_Z, 1));
  root.add(framingFor('north', STUD_X, 'x', -SOUTH_Z, -1));
  root.add(framingFor('east', STUD_Z, 'z', EAST_X, 1));
  root.add(framingFor('west', STUD_Z, 'z', -EAST_X, -1));

  // Knee braces at every post-to-belt junction: two in the facade plane, and
  // two more in the perpendicular plane where the post turns a corner.
  for (const [px, pz] of postSpots) {
    const onGable = Math.abs(px) === INN.halfX;
    const onLong = Math.abs(pz) === INN.halfZ;
    const planes: Array<'x' | 'z'> = [];
    if (onLong) planes.push('x');
    if (onGable) planes.push('z');
    for (const plane of planes) {
      for (const s of [-1, 1]) {
        const brace = kneeBrace(1.1, 0.2, dark);
        brace.position.set(px, 2.95, pz);
        if (plane === 'x') {
          brace.rotation.y = s > 0 ? 0 : Math.PI;
          brace.position.z = pz + (pz > 0 ? 0.16 : -0.16);
        } else {
          brace.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
          brace.position.x = px + (px > 0 ? 0.16 : -0.16);
        }
        root.add(brace);
      }
    }
  }

  // Exposed purlin ends under the eaves.
  for (const sz of [-1, 1]) {
    for (const px of [-6.4, -3.2, 0, 3.2, 6.4]) {
      const purlin = box(0.22, 0.18, 0.55, light, { pos: [px, 6.45, sz * (INN.halfZ + 0.24)], uvScale: 0.4 });
      root.add(purlin);
    }
  }

  // ---- roof ---------------------------------------------------------------
  const roof = swaybackRoof(...INN_ROOF_ARGS, shingle, {
    ridgeCap: true,
    bargeboards: true,
  });
  root.add(roof);
  for (const sx of [-1, 1]) {
    const finial = taperedPost(0.9, 0.11, 0.05, 6, light);
    // Seated on the ridge cap rather than on `INN.ridge`: the cap follows the
    // sagged ridge line, and the sag at this x depends on the gable overhang.
    finial.position.set(sx * 8.4, roofY(sx * 8.4, 0) + 0.205, 0);
    root.add(finial);
  }

  // ---- chimney (west gable, external, aligned on the hearth) --------------
  /*
   * Wide enough to stand clear of the roof. The gable overhang reaches
   * x = -9.5, so a 1.6 m stack against the wall would be almost entirely
   * roofed over; the references show a broad brick mass with a metre of
   * brickwork proud of the shingles, so the stack runs from the wall face out
   * past the roof edge.
   */
  const CHIM = { w: 2.6, d: 1.6, z: -1.0 };
  const chimneyX = -INN.halfX - CHIM.w / 2;
  root.add(box(CHIM.w, 14.2, CHIM.d, mat('brick'), { pos: [chimneyX, 7.1, CHIM.z], uvScale: 1.4 }));
  root.add(box(CHIM.w + 0.3, 0.4, CHIM.d + 0.3, mat('brick'), { pos: [chimneyX, 14.4, CHIM.z], uvScale: 1.0 }));
  root.add(box(CHIM.w + 0.4, 0.15, CHIM.d + 0.4, mat('carvedStone'), { pos: [chimneyX, 14.675, CHIM.z], uvScale: 1.0 }));
  const smoke = smokePlume(40, 9, 0.45, 8801, 1.1);
  smoke.position.set(chimneyX, 14.8, CHIM.z);
  root.add(smoke);

  // ---- windows ------------------------------------------------------------
  for (const wd of WINDOWS) {
    const f = FACADE[wd.facade];
    const unit = windowUnit(wd.w, wd.h, { arched: wd.arched, wallThickness: INN.wallT });
    const outward = f.offset > 0 ? 1 : -1;
    const depth = f.offset + outward * (INN.wallT / 2 - 0.06);
    unit.position.set(f.axis === 'x' ? wd.a : depth, wd.y, f.axis === 'x' ? depth : wd.a);
    unit.rotation.y = f.rotY;
    root.add(unit);
  }

  // ---- front door: two leaves, permanently open at 100 degrees ------------
  const leafW = 0.98;
  const leafH = DOOR.y1 - DOOR.y0 - 0.05;
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(DOOR.a + s * (DOOR.w / 2), DOOR.y0, SOUTH_Z);
    pivot.rotation.y = -s * THREE.MathUtils.degToRad(100);
    const leaf = box(leafW, leafH, 0.08, mat('plankWall'), {
      pos: [(-s * leafW) / 2, leafH / 2, 0],
      uvScale: 0.9,
    });
    pivot.add(leaf);
    for (const hy of [0.28, leafH / 2, leafH - 0.28]) {
      pivot.add(box(leafW * 0.8, 0.075, 0.03, mat('metalDark'), { pos: [(-s * leafW) / 2, hy, 0.055], uvScale: 0.3 }));
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 4, 10), mat('metalDark'));
    ring.position.set(-s * (leafW - 0.16), leafH * 0.5, 0.06);
    pivot.add(ring);
    root.add(pivot);
  }

  // ---- porch --------------------------------------------------------------
  root.add(buildPorch());

  // ---- notice board and hitching rail -------------------------------------
  const board = new THREE.Group();
  board.add(box(1.4, 1.1, 0.09, mat('noticeBoard'), { pos: [0, 1.35, 0], uvScale: 1.4 }));
  for (const s of [-1, 1]) board.add(box(0.13, 1.9, 0.13, dark, { pos: [s * 0.6, 0.95, -0.06], uvScale: 0.6 }));
  board.add(box(1.55, 0.12, 0.2, dark, { pos: [0, 1.96, -0.02], uvScale: 0.5 }));
  board.position.set(7.5, 0, 8.6);
  board.rotation.y = THREE.MathUtils.degToRad(20);
  root.add(board);

  for (const px of [5.5, 11.5]) root.add(box(0.16, 1.25, 0.16, light, { pos: [px, 0.625, 7.2], uvScale: 0.6 }));
  root.add(box(6.1, 0.11, 0.11, light, { pos: [8.5, 1.05, 7.2], uvScale: 0.9 }));
  for (const px of [6.4, 7.3]) {
    const b = barrel(0.36, 0.86, dark, mat('metalDark'));
    b.position.set(px, 0, 8.1);
    root.add(b);
  }
  const box1 = crate(0.72, light);
  box1.position.set(10.3, 0, 8.0);
  box1.rotation.y = 0.4;
  root.add(box1);

  // ---- interiors ----------------------------------------------------------
  root.add(buildInnGround());
  root.add(buildInnUpper());
  root.add(buildInnCellar());

  return root;
}

/** Projecting gabled porch box on the south facade, with plank steps. */
function buildPorch(): THREE.Group {
  const g = new THREE.Group();
  const light = mat('timberLight');
  const dark = mat('timberDark');
  const cx = 1.5;
  const z0 = INN.halfZ;
  const z1 = 8.2;
  const cz = (z0 + z1) / 2;

  g.add(box(5.4, 0.4, 3.4, mat('stoneBlock'), { pos: [cx, 0.2, cz], uvScale: 1.2 }));
  g.add(box(5.2, 0.1, 3.2, mat('plankFloor'), { pos: [cx, 0.45, cz], uvScale: 1.2 }));

  const postXs = [cx - 2.6, cx + 2.6];
  for (const px of postXs) {
    for (const pz of [z0 + 0.12, z1 - 0.12]) {
      const post = flutedPost(3.4, 0.22, 0.3, 8, light);
      post.position.set(px, 0.5, pz);
      g.add(post);
    }
    g.add(box(0.2, 0.2, 3.3, dark, { pos: [px, 3.99, cz], uvScale: 0.8 }));
  }

  // Ridge overhang is trimmed to 0.3 so the north end stops inside the wall
  // thickness instead of poking through into the upper-floor hallway.
  const roof = swaybackRoof(3.2, 2.6, 5.8, 3.6, 0.3, 0.6, 0.15, 0.1, 0.2, mat('shingleBlue', 3, 2, THREE.DoubleSide), {
    ridgeCap: true,
    bargeboards: true,
  });
  roof.rotation.y = Math.PI / 2;
  roof.position.set(cx, 0, cz + 0.15);
  g.add(roof);

  // Three treads down from the deck, 0.125 rise each.
  for (let i = 0; i < 3; i++) {
    const top = 0.5 - (i + 1) * 0.125;
    g.add(
      box(1.6, top, 0.32, mat('plankFloor'), {
        pos: [cx, top / 2, z1 + 0.16 + i * 0.32],
        uvScale: 0.7,
      }),
    );
  }

  // Porch lantern: the warm bay the night reference shows beside the entrance.
  const lantern = new THREE.Group();
  lantern.add(cylinder(0.012, 0.45, 4, mat('metalDark'), { pos: [0, 0.225, 0] }));
  lantern.add(box(0.19, 0.05, 0.19, mat('metalDark'), { pos: [0, 0.02, 0], uvScale: 0.2 }));
  lantern.add(box(0.19, 0.05, 0.19, mat('metalDark'), { pos: [0, -0.27, 0], uvScale: 0.2 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.23, 6), lanternMat());
  lens.position.y = -0.125;
  lens.userData.collide = false;
  lantern.add(lens);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    lantern.add(cylinder(0.011, 0.29, 4, mat('metalDark'), { pos: [Math.cos(a) * 0.08, -0.125, Math.sin(a) * 0.08] }));
  }
  lantern.position.set(cx - 1.9, 3.35, z1 - 0.5);
  lantern.userData.collide = false;
  g.add(lantern);
  const porchLight = new THREE.PointLight(0xffb35c, 1.4, 9, 2);
  porchLight.position.set(cx - 1.9, 3.1, z1 - 0.5);
  porchLight.castShadow = false;
  registerNightLight(porchLight, 1.4);
  g.add(porchLight);

  // Rail on the east side only; west and south stay open.
  const railX = cx + 2.6;
  g.add(box(0.11, 0.9, 0.11, dark, { pos: [railX, 0.95, z0 + 0.3], uvScale: 0.5 }));
  g.add(box(0.11, 0.9, 0.11, dark, { pos: [railX, 0.95, z1 - 0.3], uvScale: 0.5 }));
  g.add(box(0.09, 0.09, 3.0, dark, { pos: [railX, 1.4, cz], uvScale: 0.7 }));
  g.add(box(0.09, 0.09, 3.0, dark, { pos: [railX, 0.95, cz], uvScale: 0.7 }));

  return g;
}
