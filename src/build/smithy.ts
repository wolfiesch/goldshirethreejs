import * as THREE from 'three';
import { forgeGlowMat, mat, waterMat } from '../gen/materials';
import {
  barrel,
  box,
  cylinder,
  fireEffect,
  kneeBrace,
  smokePlume,
  swaybackRoof,
  taperedPost,
} from '../gen/prims';
import { jitter, makeRng } from '../gen/rng';

/**
 * The Goldshire smithy: pale ashlar to the eave, a steep swayback shingle
 * roof, the round stone chimney tower that reads as a silhouette from across
 * the crossroads, and the riveted iron flue hood over the coals. The north
 * side is wide open onto the road so the forge glow, the anvil and the racks
 * are all visible from it.
 *
 * Stone all the way up, not stone to waist height with plaster and
 * half-timbering above: every reference shows a stone shed, which is what a
 * building with an open fire in it would be.
 */

const HALF_X = 6; // 12 m along X
const HALF_Z = 4.5; // 9 m along Z
const WALL = 0.4;
const EAVE = 4.0;
const RIDGE = 7.2;

/** Tower is deliberately buried in the west wall so it reads as one mass. */
const TOWER_X = -5.4;
const TOWER_R = 1.6;
const TOWER_TOP = 9.0;

const FORGE_X = -2.6;
const FORGE_Z = -0.4;
const FORGE_TOP = 1.1;

/** Triangular wall infill closing a gable end; extruded across X. */
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

function forge(): THREE.Group {
  const g = new THREE.Group();
  const brick = mat('brick');

  g.add(box(2.0, FORGE_TOP, 1.4, brick, { pos: [0, FORGE_TOP / 2, 0], uvScale: 1.1 }));
  // Raised lip so the coal bed sits in a tray rather than on a slab.
  for (const sx of [-1, 1]) {
    g.add(box(0.16, 0.18, 1.4, brick, { pos: [sx * 0.92, FORGE_TOP + 0.09, 0], uvScale: 0.8 }));
  }
  g.add(box(2.0, 0.18, 0.16, brick, { pos: [0, FORGE_TOP + 0.09, 0.62], uvScale: 0.8 }));

  const coals = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), forgeGlowMat());
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = FORGE_TOP + 0.06;
  coals.userData.collide = false;
  coals.castShadow = false;
  coals.receiveShadow = false;
  g.add(coals);

  const fire = fireEffect(0.9, 0.7, 0xf09e);
  fire.position.y = FORGE_TOP + 0.07;
  g.add(fire);

  // The forge burns around the clock, so this one is not night-gated: the
  // reference shows a glowing hearth in the daylight shots too.
  const light = new THREE.PointLight(0xff7a28, 3.2, 16, 2);
  light.position.set(0, FORGE_TOP + 0.5, 0);
  light.castShadow = false;
  // Distance-culled with the rest. Untagged it was the one light in the scene
  // uploaded to every material's uniforms from anywhere in the world.
  light.userData.interior = true;
  g.add(light);

  g.add(flueHood());
  return g;
}

/**
 * The riveted plate hood over the coals, elbowing into the chimney tower.
 *
 * This is the smithy's loudest feature in every reference, and what was here
 * before was a 22 cm stove pipe. The mouth is sized to the widest bell that
 * still clears the tower: at 2.8 m between forge and tower centres against a
 * 1.6 m tower radius there is only about 1.25 m to give, so 1.15 m it is.
 *
 * Local to the forge group, so it moves with the forge.
 */
function flueHood(): THREE.Group {
  const g = new THREE.Group();
  const plate = mat('metalGrey');
  const dark = mat('metalDark');

  const MOUTH_R = 1.15;
  const THROAT_R = 0.62;
  const mouthY = 1.95;
  const throatY = 2.95;
  const runY = 3.35;

  // Twelve sides so it reads as folded plate rather than a turned pipe. Open
  // at both ends: the throat above and the sooted disc below close it off.
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(THROAT_R, MOUTH_R, throatY - mouthY, 12, 1, true),
    plate,
  );
  bell.position.y = (mouthY + throatY) / 2;
  bell.castShadow = true;
  bell.receiveShadow = true;
  g.add(bell);

  // Looking up into the hood should find soot, not the sky through a backface.
  const soot = new THREE.Mesh(new THREE.CircleGeometry(THROAT_R, 12), mat('coal'));
  soot.rotation.x = Math.PI / 2;
  soot.position.y = throatY - 0.01;
  soot.userData.collide = false;
  g.add(soot);

  g.add(cylinder(THROAT_R, runY - throatY + 0.3, 12, plate, { pos: [0, (throatY + runY) / 2 + 0.15, 0] }));

  // Elbow knuckle, then the run west into the tower.
  g.add(cylinder(THROAT_R + 0.07, 0.36, 12, plate, { pos: [0, runY, 0] }));
  const towerFace = TOWER_X + Math.sqrt(TOWER_R * TOWER_R - FORGE_Z * FORGE_Z);
  const runLen = FORGE_X - towerFace + 0.4;
  g.add(
    cylinder(THROAT_R, runLen, 12, plate, {
      pos: [-runLen / 2, runY, 0],
      rot: [0, 0, Math.PI / 2],
    }),
  );

  // Rolled rim on the mouth, plus rivets around it.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(MOUTH_R, 0.075, 5, 20), dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = mouthY + 0.04;
  rim.castShadow = true;
  g.add(rim);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(
      box(0.09, 0.09, 0.09, dark, {
        pos: [Math.cos(a) * (MOUTH_R + 0.02), mouthY + 0.24, Math.sin(a) * (MOUTH_R + 0.02)],
        uvScale: 0.1,
      }),
    );
  }

  // Seams up the bell: four folded plates, not one spun cone.
  const slant = Math.hypot(MOUTH_R - THROAT_R, throatY - mouthY);
  const rMid = (MOUTH_R + THROAT_R) * 0.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const seam = box(0.1, slant, 0.1, dark, {
      pos: [Math.sin(a) * rMid, (mouthY + throatY) / 2, Math.cos(a) * rMid],
      uvScale: 0.3,
    });
    // YXZ so the lean is applied before the spin. Under the default XYZ the
    // spin runs first and the lean then tilts in world axes, which throws
    // three of the four seams off the cone entirely.
    seam.rotation.order = 'YXZ';
    seam.rotation.y = a + Math.PI;
    seam.rotation.x = Math.atan2(MOUTH_R - THROAT_R, throatY - mouthY);
    g.add(seam);
  }

  // Banding along the horizontal run.
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(THROAT_R + 0.04, 0.05, 5, 12), dark);
    band.rotation.y = Math.PI / 2;
    band.position.set(-0.4 - i * 0.45, runY, 0);
    g.add(band);
  }
  return g;
}

function anvil(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  g.add(cylinder(0.33, 0.6, 10, mat('bark'), { pos: [0, 0.3, 0], uvScale: 0.7 }));
  g.add(box(0.5, 0.1, 0.32, iron, { pos: [0, 0.65, 0], uvScale: 0.4 }));
  g.add(box(0.24, 0.16, 0.22, iron, { pos: [0, 0.78, 0], uvScale: 0.4 }));
  g.add(box(0.66, 0.16, 0.3, iron, { pos: [0, 0.94, 0], uvScale: 0.4 }));
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 8), iron);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.5, 0.94, 0);
  horn.castShadow = true;
  g.add(horn);
  // A hammer left lying on the face sells the scene from the road.
  g.add(box(0.09, 0.09, 0.2, iron, { pos: [-0.14, 1.07, 0.02], uvScale: 0.3 }));
  g.add(cylinder(0.028, 0.34, 6, mat('timberLight'), { pos: [0.06, 1.07, 0.02], rot: [0, 0, Math.PI / 2] }));
  return g;
}

function quenchTrough(): THREE.Group {
  const g = new THREE.Group();
  const planks = mat('plankWall');
  g.add(box(1.5, 0.08, 0.62, planks, { pos: [0, 0.24, 0], uvScale: 0.7 }));
  for (const sz of [-1, 1]) {
    g.add(box(1.5, 0.46, 0.08, planks, { pos: [0, 0.43, sz * 0.31], uvScale: 0.7 }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.46, 0.62, planks, { pos: [sx * 0.75, 0.43, 0], uvScale: 0.7 }));
    g.add(box(0.12, 0.24, 0.12, mat('timberDark'), { pos: [sx * 0.6, 0.12, 0], uvScale: 0.4 }));
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.46), waterMat());
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.57;
  water.userData.collide = false;
  water.castShadow = false;
  g.add(water);
  return g;
}

function grindstone(): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberDark');
  for (const sz of [-1, 1]) {
    g.add(box(0.14, 0.92, 0.14, timber, { pos: [0, 0.46, sz * 0.34], uvScale: 0.5 }));
    g.add(box(0.5, 0.1, 0.1, timber, { pos: [0, 0.1, sz * 0.34], uvScale: 0.4 }));
  }
  g.add(box(0.14, 0.12, 0.82, timber, { pos: [0, 0.86, 0], uvScale: 0.5 }));

  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.11, 16), mat('stoneBlock'));
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = 0.8;
  wheel.castShadow = true;
  wheel.receiveShadow = true;
  g.add(wheel);

  const iron = mat('metalDark');
  g.add(cylinder(0.05, 0.86, 8, iron, { pos: [0, 0.8, 0], rot: [Math.PI / 2, 0, 0] }));
  g.add(box(0.06, 0.28, 0.06, iron, { pos: [0, 0.92, 0.45], uvScale: 0.3 }));
  g.add(cylinder(0.03, 0.18, 6, mat('timberLight'), { pos: [0, 1.05, 0.53], rot: [Math.PI / 2, 0, 0] }));
  return g;
}

function toolRack(): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(0x700d5);
  const timber = mat('timberDark');
  const iron = mat('metalDark');
  g.add(box(2.0, 1.15, 0.07, mat('plankWall'), { pos: [0, 1.75, 0], uvScale: 0.9 }));
  g.add(box(2.1, 0.09, 0.14, timber, { pos: [0, 2.28, 0.04], uvScale: 0.5 }));

  for (let i = 0; i < 8; i++) {
    const x = -0.85 + i * 0.243;
    const y = 2.2 + jitter(rng, 0.03);
    g.add(box(0.05, 0.05, 0.12, iron, { pos: [x, y, 0.08], uvScale: 0.2 }));
    const kind = i % 4;
    if (kind === 0) {
      // Hammer: shaft plus a blocky head.
      g.add(cylinder(0.022, 0.44, 6, mat('timberLight'), { pos: [x, y - 0.22, 0.09] }));
      g.add(box(0.09, 0.08, 0.19, iron, { pos: [x, y - 0.46, 0.09], uvScale: 0.25 }));
    } else if (kind === 1) {
      // Tongs: two splayed arms.
      for (const s of [-1, 1]) {
        const arm = box(0.03, 0.52, 0.03, iron, { pos: [x + s * 0.03, y - 0.27, 0.09], uvScale: 0.2 });
        arm.rotation.z = s * 0.07;
        g.add(arm);
      }
    } else if (kind === 2) {
      g.add(box(0.035, 0.3, 0.035, iron, { pos: [x, y - 0.16, 0.09], uvScale: 0.2 }));
      g.add(cylinder(0.028, 0.14, 6, mat('timberLight'), { pos: [x, y - 0.36, 0.09] }));
    } else {
      // File / rasp.
      g.add(box(0.045, 0.42, 0.02, iron, { pos: [x, y - 0.22, 0.09], uvScale: 0.2 }));
    }
  }
  return g;
}

function weaponRack(): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberDark');
  const iron = mat('metalDark');
  g.add(box(1.7, 0.14, 0.52, timber, { pos: [0, 0.07, 0], uvScale: 0.8 }));
  for (const sx of [-1, 1]) {
    g.add(box(0.11, 1.24, 0.11, timber, { pos: [sx * 0.75, 0.62, -0.18], uvScale: 0.5 }));
  }
  for (const y of [0.6, 1.14]) {
    g.add(box(1.6, 0.09, 0.1, timber, { pos: [0, y, -0.18], uvScale: 0.6 }));
  }
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Group();
    blade.add(box(0.05, 0.94, 0.14, iron, { pos: [0, 0.62, 0], uvScale: 0.4 }));
    blade.add(box(0.07, 0.09, 0.3, iron, { pos: [0, 0.16, 0], uvScale: 0.25 }));
    blade.add(cylinder(0.032, 0.2, 6, mat('bark'), { pos: [0, 0.05, 0] }));
    blade.position.set(-0.6 + i * 0.3, 0.14, -0.02);
    blade.rotation.x = -0.08;
    g.add(blade);
  }
  return g;
}

function ingotStack(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat('copper');
  let row = 0;
  for (const count of [4, 3, 2]) {
    for (let i = 0; i < count; i++) {
      const ing = box(0.44, 0.09, 0.17, metal, {
        pos: [(i - (count - 1) / 2) * 0.2, 0.045 + row * 0.09, 0],
        uvScale: 0.3,
      });
      ing.rotation.y = row * 0.04;
      g.add(ing);
    }
    row++;
  }
  return g;
}

export function buildSmithy(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'smithy';

  const stone = mat('stoneBlock');
  const carved = mat('carvedStone');
  const timber = mat('timberDark');

  // Beaten earth floor under the shed.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2), mat('dirt', 6, 4.5));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.015;
  floor.receiveShadow = true;
  floor.userData.collide = false;
  g.add(floor);

  const southZ = HALF_Z - WALL / 2;
  const sideX = HALF_X - WALL / 2;
  const southLen = HALF_X * 2 - WALL * 2;

  // Ashlar to the eave on all three closed sides, gables included.
  g.add(box(southLen, EAVE, WALL, stone, { pos: [0, EAVE / 2, southZ] }));
  for (const sx of [-1, 1]) {
    g.add(box(WALL, EAVE, HALF_Z * 2, stone, { pos: [sx * sideX, EAVE / 2, 0] }));
    const gable = gableInfill(HALF_Z, RIDGE - EAVE, WALL, mat('stoneBlock', 0.5, 0.5));
    gable.position.set(sx * sideX, EAVE, 0);
    g.add(gable);
    // Collar and king post, the only timber left on the shell.
    g.add(box(WALL + 0.06, 0.2, HALF_Z * 1.1, timber, { pos: [sx * sideX, EAVE + 1.2, 0], uvScale: 1 }));
    g.add(
      box(WALL + 0.06, RIDGE - EAVE - 0.2, 0.22, timber, {
        pos: [sx * sideX, EAVE + (RIDGE - EAVE) / 2, 0],
        uvScale: 1,
      }),
    );
  }

  // A dressed band at the eave line and a splayed plinth at grade, which is
  // what stops a plain ashlar box from reading as a shipping container.
  g.add(box(southLen + 0.5, 0.26, WALL + 0.22, carved, { pos: [0, EAVE - 0.13, southZ], uvScale: 1.4 }));
  g.add(box(southLen + 0.5, 0.34, WALL + 0.34, carved, { pos: [0, 0.17, southZ], uvScale: 1.4 }));
  for (const sx of [-1, 1]) {
    g.add(box(WALL + 0.22, 0.26, HALF_Z * 2 + 0.5, carved, { pos: [sx * sideX, EAVE - 0.13, 0], uvScale: 1.4 }));
    g.add(box(WALL + 0.34, 0.34, HALF_Z * 2 + 0.5, carved, { pos: [sx * sideX, 0.17, 0], uvScale: 1.4 }));
  }

  // Open north side: two flared posts and a braced head beam. No wall.
  const northZ = -(HALF_Z - WALL / 2);
  for (const sx of [-1, 1]) {
    const post = taperedPost(EAVE - 0.1, 0.26, 0.34, 8, mat('timberLight'));
    post.position.set(sx * sideX, 0, northZ);
    g.add(post);
    const brace = kneeBrace(0.95, 0.24, timber);
    brace.position.set(sx * sideX, EAVE - 1.05, northZ);
    brace.rotation.z = sx < 0 ? -Math.PI / 2 : Math.PI;
    g.add(brace);
  }
  g.add(box(HALF_X * 2, 0.34, 0.38, timber, { pos: [0, EAVE - 0.17, northZ], uvScale: 1.6 }));
  g.add(box(0.26, 0.9, 0.34, timber, { pos: [0, EAVE - 0.79, northZ], uvScale: 1 }));

  g.add(
    swaybackRoof(
      HALF_X * 2,
      HALF_Z,
      RIDGE,
      EAVE,
      0.7,
      0.9,
      0.25,
      0.18,
      0.3,
      mat('shingleBlue', 6, 4, THREE.DoubleSide),
      { bargeboards: true },
    ),
  );

  // Round chimney tower at the west end.
  const towerMat = mat('stoneBlock', 3, 3);
  g.add(cylinder(TOWER_R, TOWER_TOP, 16, towerMat, { pos: [TOWER_X, TOWER_TOP / 2, 0] }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, TOWER_R + 0.16, 0.95, 16), towerMat);
  cap.position.set(TOWER_X, TOWER_TOP + 0.47, 0);
  cap.castShadow = true;
  cap.receiveShadow = true;
  g.add(cap);
  for (const y of [5.6, 7.3]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(TOWER_R + 0.04, 0.075, 5, 16), mat('metalDark'));
    band.rotation.x = Math.PI / 2;
    band.position.set(TOWER_X, y, 0);
    band.castShadow = true;
    g.add(band);
  }
  const smoke = smokePlume(30, 5.6, 0.55, 0x51075, 0.85);
  smoke.position.set(TOWER_X, TOWER_TOP + 1.0, 0);
  g.add(smoke);

  const f = forge();
  f.position.set(FORGE_X, 0, FORGE_Z);
  g.add(f);

  const a = anvil();
  a.position.set(0.7, 0, -1.7);
  a.rotation.y = 0.22;
  g.add(a);

  const trough = quenchTrough();
  trough.position.set(2.5, 0, 1.1);
  trough.rotation.y = -0.1;
  g.add(trough);

  const grinder = grindstone();
  grinder.position.set(4.2, 0, -1.5);
  grinder.rotation.y = -0.5;
  g.add(grinder);

  const tools = toolRack();
  tools.position.set(0.6, 0, HALF_Z - WALL - 0.06);
  tools.rotation.y = Math.PI;
  g.add(tools);

  const weapons = weaponRack();
  weapons.position.set(4.3, 0, 2.6);
  weapons.rotation.y = Math.PI - 0.25;
  g.add(weapons);

  const ingots = ingotStack();
  ingots.position.set(-0.6, 0, 3.2);
  ingots.rotation.y = 0.3;
  g.add(ingots);

  const cask = mat('timberLight');
  const hoop = mat('metalDark');
  for (const [x, z, r, h] of [
    [5.0, -3.3, 0.34, 0.86],
    [5.05, -2.35, 0.3, 0.74],
    [-4.7, 3.4, 0.34, 0.86],
  ] as Array<[number, number, number, number]>) {
    const b = barrel(r, h, cask, hoop);
    b.position.set(x, 0, z);
    g.add(b);
  }

  return g;
}
