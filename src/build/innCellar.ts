import * as THREE from 'three';
import { lanternMat, mat } from '../gen/materials';
import { barrel, box, crate, cylinder } from '../gen/prims';
import { makeRng, range } from '../gen/rng';
import { cobweb, sackPile, wineRack } from './furniture';
import { railing, straightStair } from './innParts';
import { CELLAR_WELL, INN } from './innSpec';

/**
 * Undercroft. The whole flight is left open to the room above: a small hatch
 * would leave about a metre of clearance halfway down. Two shallow transverse
 * arches plus a flat soffit read as a vault without fouling the ground floor's
 * 0.4 m structure or the stair.
 */

const FLOOR = INN.cellarFloor;
const SOFFIT = INN.cellarSoffit;
const ROOM = { x0: -7.4, x1: 0.6, z0: -3.0, z1: 3.4 };
const WALL_T = 0.5;

export function buildInnCellar(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'innCellar';
  const rng = makeRng(0x0ce1);
  const stone = mat('stoneBlock', 1, 1);
  const dark = mat('timberDark');

  const w = ROOM.x1 - ROOM.x0;
  const d = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2;

  // ---- shell --------------------------------------------------------------
  g.add(box(w + WALL_T * 2, 0.3, d + WALL_T * 2, stone, { pos: [cx, FLOOR - 0.15, cz], uvScale: 1.5 }));
  for (const s of [-1, 1]) {
    g.add(box(WALL_T, SOFFIT - FLOOR, d + WALL_T * 2, stone, {
      pos: [cx + s * (w / 2 + WALL_T / 2), (FLOOR + SOFFIT) / 2, cz], uvScale: 1.5,
    }));
    g.add(box(w, SOFFIT - FLOOR, WALL_T, stone, {
      pos: [cx, (FLOOR + SOFFIT) / 2, cz + s * (d / 2 + WALL_T / 2)], uvScale: 1.5,
    }));
  }

  // ---- soffit, omitted over the stair footprint ---------------------------
  const soffitH = 0.06;
  const soffitY = SOFFIT - soffitH / 2;
  g.add(box(w, soffitH, CELLAR_WELL.z0 - ROOM.z0, stone, {
    pos: [cx, soffitY, (ROOM.z0 + CELLAR_WELL.z0) / 2], uvScale: 1.5,
  }));
  g.add(box(w, soffitH, ROOM.z1 - CELLAR_WELL.z1, stone, {
    pos: [cx, soffitY, (CELLAR_WELL.z1 + ROOM.z1) / 2], uvScale: 1.5,
  }));
  g.add(box(ROOM.x1 - CELLAR_WELL.x1, soffitH, CELLAR_WELL.z1 - CELLAR_WELL.z0, stone, {
    pos: [(CELLAR_WELL.x1 + ROOM.x1) / 2, soffitY, (CELLAR_WELL.z0 + CELLAR_WELL.z1) / 2], uvScale: 1.5,
  }));

  // ---- two shallow transverse arches --------------------------------------
  for (const ax of [-2.4, -0.6]) {
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const tm = (t0 + t1) / 2;
      const intrados = -0.5 + 0.35 * Math.sin(Math.PI * tm);
      const h = SOFFIT - soffitH - intrados;
      if (h <= 0.01) continue;
      g.add(box(0.4, h, d / segs + 0.01, stone, {
        pos: [ax, intrados + h / 2, ROOM.z0 + d * tm], uvScale: 0.8,
      }));
    }
  }

  // ---- stair: descends west to east, the whole run open above -------------
  const stair = straightStair({
    steps: 15,
    rise: 0.2,
    going: 0.28,
    width: 1.4,
    treadMaterial: stone,
    closedStringer: true,
    stringerMaterial: stone,
  });
  stair.position.set(-3.2, FLOOR, 2.3);
  stair.rotation.y = Math.PI;
  g.add(stair);

  // Guard the open edges of the floor void, leaving the top of the flight clear.
  g.add(
    railing(
      [
        new THREE.Vector3(-6.2, INN.floorG, CELLAR_WELL.z0),
        new THREE.Vector3(CELLAR_WELL.x1, INN.floorG, CELLAR_WELL.z0),
        new THREE.Vector3(CELLAR_WELL.x1, INN.floorG, CELLAR_WELL.z1),
        new THREE.Vector3(CELLAR_WELL.x0, INN.floorG, CELLAR_WELL.z1),
      ],
      { height: 0.95, postSpacing: 1.1, postSize: 0.1 },
    ),
  );

  // ---- stock --------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const cradleX = ROOM.x0 + 0.9 + i * 1.15;
    g.add(box(0.9, 0.22, 0.5, dark, { pos: [cradleX, FLOOR + 0.11, ROOM.z0 + 0.55], uvScale: 0.6 }));
    const cask = barrel(0.42, 1.0, dark, mat('metalDark'));
    cask.rotation.x = Math.PI / 2;
    cask.position.set(cradleX, FLOOR + 0.55, ROOM.z0 + 1.05);
    g.add(cask);
  }
  // Upright barrels moved to the south wall so the east wall is free for the
  // wine rack, where the plan places it.
  for (let i = 0; i < 4; i++) {
    const bx = ROOM.x0 + 1.9 + i * 1.0;
    const b = barrel(0.4, 0.94, dark, mat('metalDark'));
    b.position.set(bx, FLOOR, ROOM.z1 - 0.6);
    g.add(b);
  }

  const rack = wineRack(2.4, 0.4, 1.8, 24);
  rack.position.set(ROOM.x1 - 0.28, FLOOR, -0.6);
  rack.rotation.y = -Math.PI / 2;
  g.add(rack);

  for (const [px, pz, ry] of [
    [-5.6, -2.1, 0.2],
    [-4.9, -2.2, -0.35],
    [-5.2, -1.4, 0.6],
    [-6.5, -1.9, -0.1],
  ] as Array<[number, number, number]>) {
    const c = crate(0.68, mat('timberLight'));
    c.position.set(px, FLOOR, pz);
    c.rotation.y = ry;
    g.add(c);
  }
  const sacks = sackPile(0x0cea, 4);
  sacks.position.set(-6.4, FLOOR, 0.9);
  g.add(sacks);

  for (const [wx, wy, wz, ry] of [
    [ROOM.x0 + 0.5, -0.5, ROOM.z0 + 0.5, Math.PI / 4],
    [ROOM.x1 - 0.5, -0.6, ROOM.z1 - 0.5, -Math.PI / 4],
  ] as Array<[number, number, number, number]>) {
    const web = cobweb(1.1);
    web.position.set(wx, wy, wz);
    web.rotation.y = ry;
    web.rotation.x = -Math.PI / 5;
    g.add(web);
  }

  // ---- hanging lantern, lit around the clock ------------------------------
  const lantern = new THREE.Group();
  lantern.add(cylinder(0.012, 0.5, 4, mat('metalDark'), { pos: [0, 0.25, 0] }));
  lantern.add(box(0.2, 0.05, 0.2, mat('metalDark'), { pos: [0, 0.02, 0], uvScale: 0.2 }));
  lantern.add(box(0.2, 0.05, 0.2, mat('metalDark'), { pos: [0, -0.28, 0], uvScale: 0.2 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.24, 6), lanternMat());
  lens.position.y = -0.13;
  lantern.add(lens);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    lantern.add(cylinder(0.012, 0.3, 4, mat('metalDark'), { pos: [Math.cos(a) * 0.085, -0.13, Math.sin(a) * 0.085] }));
  }
  lantern.position.set(-1.5, -0.35, 0);
  lantern.userData.collide = false;
  g.add(lantern);

  const light = new THREE.PointLight(0xffb35c, 0.8, 8, 2);
  light.position.set(-1.5, -0.6, 0);
  light.castShadow = false;
  light.userData.interior = true;
  g.add(light);

  // A few loose bottles rolled into the corner.
  for (let i = 0; i < 5; i++) {
    const bottleMesh = cylinder(0.038, 0.26, 7, mat('bottleGreen'), {
      pos: [ROOM.x0 + 0.6 + range(rng, -0.2, 0.6), FLOOR + 0.038, ROOM.z1 - 0.6 - range(rng, 0, 0.5)],
    });
    bottleMesh.rotation.x = Math.PI / 2;
    bottleMesh.rotation.z = range(rng, -0.4, 0.4);
    g.add(bottleMesh);
  }

  return g;
}
