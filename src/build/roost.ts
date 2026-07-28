import * as THREE from 'three';
import { mat } from '../gen/materials';
import { box, cylinder, taperedPost } from '../gen/prims';

/**
 * Flight-master roost: four flared legs, a cross-braced timber frame, a plank
 * platform at 6 m under a thatched cone, and a switchback stair up the south
 * face that the player can actually walk.
 *
 * The stair is sized from the platform height rather than from a fixed riser
 * count: two flights of 14 risers at 0.214 m reach exactly 6.0 m, where the
 * 8-riser flights of the original sketch would have stopped in mid-air at 3.5.
 */

const LEG = 2.2; // 4.4 m square
const DECK_TOP = 6.0;
const DECK_T = 0.25;
const DECK_HALF = 2.5; // 5 x 5 platform

const STEPS_PER_FLIGHT = 14;
const RISE = DECK_TOP / (STEPS_PER_FLIGHT * 2);
const GOING = 0.3;
const STAIR_W = 1.2;

const FLIGHT1_Z = 4.6;
const FLIGHT2_Z = 3.4;
const FLIGHT_X0 = -2.6;
const TURN_X = FLIGHT_X0 + STEPS_PER_FLIGHT * GOING; // 1.6

/** Two crossed diagonals plus a mid girt, drawn in the XY plane at z = 0. */
function crossBrace(halfSpan: number, y0: number, y1: number): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  const dx = halfSpan * 2;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  for (const s of [-1, 1]) {
    const d = box(len, 0.16, 0.16, dark, { pos: [0, (y0 + y1) / 2, 0], uvScale: 1.2 });
    d.rotation.z = s * angle;
    g.add(d);
  }
  g.add(box(dx, 0.16, 0.16, dark, { pos: [0, (y0 + y1) / 2, 0], uvScale: 1.2 }));
  return g;
}

/**
 * One flight ascending toward +X, foot of the first riser at the local origin.
 * Closed risers and solid treads so the collision capsule meets a continuous
 * surface rather than a comb of floating boards.
 *
 * `railSteps` stops the handrail short of the head of the flight, which is how
 * the upper flight leaves a gap to step sideways onto the deck bridge.
 */
function stairFlight(steps: number, railSide: number, railSteps = steps): THREE.Group {
  const g = new THREE.Group();
  const treadMat = mat('plankFloor');
  const dark = mat('timberDark');
  const light = mat('timberLight');

  for (let i = 1; i <= steps; i++) {
    g.add(
      box(GOING + 0.04, 0.1, STAIR_W, treadMat, {
        pos: [(i - 1) * GOING + GOING / 2, i * RISE - 0.05, 0],
        uvScale: 0.7,
      }),
    );
    g.add(
      box(0.05, RISE, STAIR_W, dark, {
        pos: [(i - 1) * GOING + 0.025, i * RISE - RISE / 2, 0],
        uvScale: 0.5,
      }),
    );
  }

  const run = steps * GOING;
  const climb = steps * RISE;
  const slope = Math.atan2(RISE, GOING);
  const stringerLen = Math.hypot(run, climb) + 0.3;
  for (const sz of [-1, 1]) {
    const stringer = box(stringerLen, 0.3, 0.1, dark, {
      pos: [run / 2, climb / 2 - 0.16, sz * (STAIR_W / 2 + 0.05)],
      uvScale: 1.2,
    });
    stringer.rotation.z = slope;
    g.add(stringer);
  }

  // Handrail on the outer side only; the inner side runs against the next flight.
  const railZ = railSide * (STAIR_W / 2 + 0.06);
  const railRun = railSteps * GOING;
  const railClimb = railSteps * RISE;
  const postEvery = Math.max(1, Math.ceil(railSteps / 3));
  for (let k = 0; k <= railSteps; k += postEvery) {
    g.add(box(0.09, 0.98, 0.09, light, { pos: [k * GOING, k * RISE + 0.49, railZ], uvScale: 0.5 }));
  }
  g.add(box(0.09, 0.98, 0.09, light, { pos: [railRun, railClimb + 0.49, railZ], uvScale: 0.5 }));
  const rail = box(Math.hypot(railRun, railClimb) + 0.2, 0.09, 0.09, light, {
    pos: [railRun / 2, railClimb / 2 + 0.95, railZ],
    uvScale: 1.2,
  });
  rail.rotation.z = slope;
  g.add(rail);
  return g;
}

/** Post-and-two-rail guard along a straight edge, running along local X. */
function guardRail(length: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const light = mat('timberLight');
  const count = Math.max(2, Math.round(length / 1.25));
  for (let i = 0; i <= count; i++) {
    g.add(box(0.12, height, 0.12, light, { pos: [-length / 2 + (i / count) * length, height / 2, 0], uvScale: 0.6 }));
  }
  g.add(box(length, 0.09, 0.11, light, { pos: [0, height - 0.05, 0], uvScale: 1.4 }));
  g.add(box(length, 0.08, 0.09, light, { pos: [0, height * 0.5, 0], uvScale: 1.4 }));
  return g;
}

export function buildRoost(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roost';

  const dark = mat('timberDark');
  const light = mat('timberLight');
  const deckMat = mat('plankFloor');

  // Four flared legs on a 4.4 m square.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = taperedPost(DECK_TOP, 0.26, 0.34, 8, light);
      leg.position.set(sx * LEG, 0, sz * LEG);
      g.add(leg);
    }
  }

  // Cross bracing on all four faces.
  for (const [px, pz, rotY] of [
    [0, LEG, 0],
    [0, -LEG, 0],
    [LEG, 0, Math.PI / 2],
    [-LEG, 0, Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const face = crossBrace(LEG, 0.9, 5.3);
    face.position.set(px, 0, pz);
    face.rotation.y = rotY;
    g.add(face);
  }

  // Platform: deck slab on two head beams and three joists.
  for (const sz of [-1, 1]) {
    g.add(box(LEG * 2 + 0.7, 0.3, 0.26, dark, { pos: [0, DECK_TOP - DECK_T - 0.15, sz * LEG], uvScale: 1.4 }));
  }
  for (const x of [-1.6, 0, 1.6]) {
    g.add(box(0.18, 0.22, DECK_HALF * 2, dark, { pos: [x, DECK_TOP - DECK_T - 0.11, 0], uvScale: 1.2 }));
  }
  g.add(box(DECK_HALF * 2, DECK_T, DECK_HALF * 2, deckMat, { pos: [0, DECK_TOP - DECK_T / 2, 0], uvScale: 1.1 }));

  // Guard rail on three sides; the south side stays open for the stair.
  const north = guardRail(DECK_HALF * 2, 1.0);
  north.position.set(0, DECK_TOP, -(DECK_HALF - 0.1));
  g.add(north);
  for (const sx of [-1, 1]) {
    const side = guardRail(DECK_HALF * 2 - 0.2, 1.0);
    side.position.set(sx * (DECK_HALF - 0.1), DECK_TOP, 0);
    side.rotation.y = Math.PI / 2;
    g.add(side);
  }

  // ---- Switchback stair up the south face ----
  const flight1 = stairFlight(STEPS_PER_FLIGHT, 1);
  flight1.position.set(FLIGHT_X0, 0, FLIGHT1_Z);
  g.add(flight1);

  // Half-landing at the turn: two 1.2 x 1.2 squares joined across both flights.
  const landingY = STEPS_PER_FLIGHT * RISE;
  const landingX = TURN_X + 0.6;
  const landingZ = (FLIGHT1_Z + FLIGHT2_Z) / 2;
  g.add(box(1.2, 0.22, 2.4, deckMat, { pos: [landingX, landingY - 0.11, landingZ], uvScale: 1 }));
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      g.add(
        cylinder(0.11, landingY - 0.22, 8, dark, {
          pos: [landingX + sx * 0.5, (landingY - 0.22) / 2, landingZ + sz * 1.0],
          uvScale: 0.6,
        }),
      );
    }
  }
  // Guard around the outer corner of the landing.
  g.add(box(0.09, 0.98, 0.09, light, { pos: [landingX + 0.54, landingY + 0.49, FLIGHT1_Z + 0.66], uvScale: 0.5 }));
  g.add(box(1.3, 0.09, 0.09, light, { pos: [landingX, landingY + 0.95, FLIGHT1_Z + 0.66], uvScale: 0.6 }));
  g.add(box(0.09, 0.09, 2.5, light, { pos: [landingX + 0.54, landingY + 0.95, landingZ], uvScale: 0.6 }));

  // Rail stops 5 steps short of the head so the player can step off northward.
  const flight2 = stairFlight(STEPS_PER_FLIGHT, 1, STEPS_PER_FLIGHT - 5);
  flight2.position.set(TURN_X, landingY, FLIGHT2_Z);
  flight2.rotation.y = Math.PI;
  g.add(flight2);

  // Bridge deck joining the head of the upper flight to the platform edge.
  // Kept north of the flight band so it never roofs over the treads below it.
  g.add(box(1.8, 0.22, 0.8, deckMat, { pos: [-1.7, DECK_TOP - 0.11, 2.55], uvScale: 1 }));
  g.add(box(0.1, 1.0, 0.9, light, { pos: [-2.65, DECK_TOP + 0.5, 2.55], uvScale: 0.5 }));

  // ---- Thatched cone over the north half of the platform ----
  for (const x of [-2.1, 2.1]) {
    for (const z of [-2.1, -0.1]) {
      g.add(box(0.15, 2.0, 0.15, light, { pos: [x, DECK_TOP + 1.0, z], uvScale: 0.7 }));
    }
  }
  g.add(box(4.5, 0.14, 2.4, dark, { pos: [0, DECK_TOP + 1.95, -1.1], uvScale: 1.4 }));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.75, 1.2, 8), mat('thatch'));
  cone.position.set(0, 8.6, -1.1);
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);

  // ---- Heavy perch beam across the open half ----
  // Carried at 2 m above the deck rather than 1 m: at 1 m the beam's underside
  // sat at 6.84 and walled off the south half of the platform to a 1.8 m capsule.
  for (const sx of [-1, 1]) {
    g.add(box(0.16, 2.0, 0.16, dark, { pos: [sx * 2.1, DECK_TOP + 1.0, 1.3], uvScale: 0.6 }));
  }
  g.add(cylinder(0.16, 4.6, 8, mat('bark'), { pos: [0, DECK_TOP + 2.0, 1.3], rot: [0, 0, Math.PI / 2], uvScale: 1.2 }));

  // ---- Banners hung from the north edge ----
  const bannerMat = mat('clothRed', 1, 2, THREE.DoubleSide);
  for (const sx of [-1, 1]) {
    g.add(box(1.0, 0.08, 0.08, dark, { pos: [sx * 1.5, DECK_TOP - 0.06, -(DECK_HALF + 0.05)], uvScale: 0.5 }));
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4, 3, 6), bannerMat);
    const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = 0.5 - pos.getY(i) / 2.4;
      pos.setZ(i, Math.sin(pos.getX(i) * 4.0) * 0.05 * t);
    }
    pos.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    cloth.position.set(sx * 1.5, DECK_TOP - 1.32, -(DECK_HALF + 0.08));
    cloth.userData.collide = false;
    cloth.castShadow = false;
    g.add(cloth);
  }

  return g;
}
