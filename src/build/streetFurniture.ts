import * as THREE from 'three';
import { mat, runeMat } from '../gen/materials';
import { barrel, box, crate, cylinder, sack, spokedWheel, swaybackRoof, taperedPost } from '../gen/prims';
import { makeRng, range } from '../gen/rng';
import { textTexture } from '../gen/textures';

/**
 * Crossroads dressing: market stall, wagon, well, signpost and the Alliance
 * mailbox. Each returns a group centred on its own footprint with ground at
 * y = 0; placement lives in `src/world/layout.ts`.
 */

/**
 * Canvas panel with a catenary sag applied per vertex. Cloth is never
 * collidable: the player should be able to duck under an awning.
 */
function saggedCloth(w: number, d: number, sag: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, 8, 6);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    const v = pos.getZ(i) / d + 0.5;
    const bell = (1 - (2 * u - 1) * (2 * u - 1)) * (1 - (2 * v - 1) * (2 * v - 1));
    pos.setY(i, pos.getY(i) - sag * bell);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.collide = false;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

export function buildMarketStall(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'marketStall';
  const rng = makeRng(0x5741);
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  const w = 3.5;
  const d = 2.5;
  const postH = 2.4;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = taperedPost(postH, 0.1, 0.12, 6, timber);
      post.position.set((sx * w) / 2, 0, (sz * d) / 2);
      g.add(post);
    }
    g.add(box(0.1, 0.1, d, dark, { pos: [(sx * w) / 2, postH - 0.06, 0], uvScale: 0.8 }));
  }
  g.add(box(w, 0.1, 0.1, dark, { pos: [0, postH + 0.06, 0], uvScale: 0.9 }));

  const awning = saggedCloth(3.6, 2.6, 0.25, mat('clothRed', 1, 1, THREE.DoubleSide));
  awning.position.y = postH + 0.14;
  g.add(awning);

  // Trestle table across the front.
  g.add(box(2.4, 0.07, 0.8, timber, { pos: [0, 0.8, d / 2 - 0.55], uvScale: 1.0 }));
  for (const sx of [-1, 1]) {
    for (const s of [-1, 1]) {
      const leg = box(0.07, 0.82, 0.07, dark, { pos: [sx * 1.0, 0.41, d / 2 - 0.55 + s * 0.3], uvScale: 0.4 });
      leg.rotation.x = s * 0.14;
      g.add(leg);
    }
  }

  const goods: Array<[number, number, number]> = [
    [-1.5, -0.9, 0.3], [-0.9, -0.95, -0.2], [1.4, -0.85, 0.7],
    [1.5, -0.2, -0.4], [-1.6, -0.2, 0.1], [0.6, -1.0, 0.9],
  ];
  for (const [cx, cz, ry] of goods) {
    const c = crate(range(rng, 0.42, 0.62), timber);
    c.position.set(cx, 0, cz);
    c.rotation.y = ry;
    g.add(c);
  }
  for (let i = 0; i < 4; i++) {
    const s = sack(range(rng, 0.34, 0.46), range(rng, 0.3, 0.42), 0x5741 + i);
    s.position.set(range(rng, -1.5, 1.5), 0, range(rng, -1.1, -0.4));
    s.rotation.y = range(rng, 0, Math.PI);
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const b = barrel(0.3, 0.7, dark, mat('metalDark'));
    b.position.set(-1.55 + i * 0.66, 0, 0.55);
    g.add(b);
  }
  // Herb bundles hung from the ridge beam.
  for (let i = 0; i < 6; i++) {
    const bundle = cylinder(0.055, 0.3, 5, mat('hay'), { pos: [-1.4 + i * 0.56, postH - 0.22, -0.1], collide: false });
    bundle.rotation.z = range(rng, -0.16, 0.16);
    g.add(bundle);
  }
  return g;
}

export function buildWagon(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wagon';
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  const bedY = 0.85;

  g.add(box(3.4, 0.12, 1.6, timber, { pos: [0, bedY, 0], uvScale: 1.0 }));
  for (const sz of [-1, 1]) {
    g.add(box(3.4, 0.35, 0.08, timber, { pos: [0, bedY + 0.2, sz * 0.8], uvScale: 0.8 }));
  }
  g.add(box(0.08, 0.35, 1.6, timber, { pos: [-1.7, bedY + 0.2, 0], uvScale: 0.8 }));
  g.add(box(3.5, 0.14, 0.16, dark, { pos: [0, bedY - 0.12, 0], uvScale: 0.9 }));

  // Six hoop ribs carrying a sagging canvas tilt.
  for (let i = 0; i < 6; i++) {
    const x = -1.5 + (i * 3.0) / 5;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.035, 4, 12, Math.PI), dark);
    hoop.position.set(x, bedY + 0.28, 0);
    hoop.rotation.y = Math.PI / 2;
    hoop.castShadow = true;
    g.add(hoop);
  }
  const tiltMat = mat('clothRed', 1, 1, THREE.DoubleSide);
  const tilt = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 3.2, 12, 4, true, 0, Math.PI), tiltMat);
  tilt.rotation.z = Math.PI / 2;
  const tiltPos = tilt.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tiltPos.count; i++) {
    const t = tiltPos.getY(i) / 3.2 + 0.5;
    const bell = 1 - (2 * t - 1) * (2 * t - 1);
    tiltPos.setX(i, tiltPos.getX(i) * (1 - bell * 0.07));
    tiltPos.setZ(i, tiltPos.getZ(i) * (1 - bell * 0.07));
  }
  tiltPos.needsUpdate = true;
  tilt.geometry.computeVertexNormals();
  tilt.position.set(0, bedY + 0.28, 0);
  tilt.userData.collide = false;
  tilt.castShadow = true;
  g.add(tilt);

  for (const sz of [-1, 1]) {
    const rear = spokedWheel(0.55, 0.07, 8);
    rear.position.set(-1.1, 0.55, sz * 0.92);
    rear.rotation.y = Math.PI / 2;
    g.add(rear);
    const front = spokedWheel(0.42, 0.06, 8);
    front.position.set(1.25, 0.42, sz * 0.88);
    front.rotation.y = Math.PI / 2;
    g.add(front);
  }
  g.add(box(0.12, 0.12, 0.12, dark, { pos: [-1.1, 0.55, 0], uvScale: 0.3 }));

  const bar = box(2.0, 0.1, 0.1, dark, { pos: [2.4, 0.28, 0], uvScale: 0.8 });
  bar.rotation.z = 0.18;
  g.add(bar);
  g.add(box(0.1, 0.1, 0.9, dark, { pos: [3.3, 0.06, 0], uvScale: 0.5 }));

  for (const [cx, cz] of [[-1.1, -0.35], [-1.1, 0.4], [-0.2, 0.0]] as Array<[number, number]>) {
    const c = crate(0.55, timber);
    c.position.set(cx, bedY + 0.06, cz);
    g.add(c);
  }
  return g;
}

export function buildWell(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'well';
  const stone = mat('stoneBlock');
  const dark = mat('timberDark');

  // Kerb ring: outer skin, inner skin and a top annulus.
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.9, 16, 1, true), stone);
  outer.position.y = 0.45;
  outer.castShadow = true;
  outer.receiveShadow = true;
  g.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.9, 16, 1, true), stone);
  inner.position.y = 0.45;
  inner.material = stone;
  inner.receiveShadow = true;
  g.add(inner);
  const top = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 16), stone);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.9;
  top.receiveShadow = true;
  g.add(top);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), mat('coal'));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.15;
  water.userData.collide = false;
  g.add(water);

  for (const sx of [-1, 1]) {
    g.add(box(0.16, 2.6, 0.16, dark, { pos: [sx * 0.95, 1.3, 0], uvScale: 0.8 }));
  }
  const roof = swaybackRoof(2.4, 0.9, 3.3, 2.6, 0.2, 0.25, 0.1, 0.06, 0.15, mat('shingleBlue', 2, 1, THREE.DoubleSide), {
    ridgeCap: true,
  });
  g.add(roof);

  const drum = cylinder(0.13, 1.5, 8, dark, { pos: [0, 2.1, 0] });
  drum.rotation.z = Math.PI / 2;
  g.add(drum);
  g.add(box(0.06, 0.34, 0.06, dark, { pos: [0.85, 2.28, 0], uvScale: 0.3 }));
  g.add(box(0.06, 0.06, 0.3, dark, { pos: [0.85, 2.44, 0.14], uvScale: 0.3 }));
  g.add(cylinder(0.018, 1.0, 4, mat('linen'), { pos: [0, 1.55, 0] }));
  const bucket = barrel(0.17, 0.28, dark, mat('metalDark'));
  bucket.position.set(0, 1.0, 0);
  g.add(bucket);
  return g;
}

/**
 * Three arm boards on a leaning post. `rotY` is 0 in LAYOUT precisely so the
 * bearings stay exact here: STORMWIND north (-Z), WESTFALL west (-X),
 * REDRIDGE east (+X).
 */
export function buildSignpost(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'signpost';
  const post = taperedPost(3.0, 0.13, 0.1, 7, mat('timberDark'));
  post.rotation.z = THREE.MathUtils.degToRad(4);
  g.add(post);
  g.add(box(0.34, 0.14, 0.34, mat('timberDark'), { pos: [0, 3.0, 0], uvScale: 0.3 }));

  const arms: Array<[string, number, number]> = [
    ['STORMWIND', 2.1, Math.PI / 2],
    ['WESTFALL', 1.75, Math.PI],
    ['REDRIDGE', 1.4, 0],
  ];
  for (const [label, y, rotY] of arms) {
    g.add(signArm(label, y, rotY));
  }
  return g;
}

function signArm(label: string, y: number, rotY: number): THREE.Group {
  const arm = new THREE.Group();
  const len = 1.1;
  const h = 0.28;
  const t = 0.06;

  const geo = new THREE.BoxGeometry(len, h, t);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) > 0) pos.setY(i, pos.getY(i) * 0.28);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const board = new THREE.Mesh(geo, mat('timberLight'));
  board.castShadow = true;
  board.receiveShadow = true;
  board.position.x = len / 2 + 0.08;
  arm.add(board);

  // The one place a per-object material is unavoidable: each sign needs its
  // own baked text map.
  const faceMat = new THREE.MeshLambertMaterial({ map: textTexture(label, 256, 64) });
  faceMat.name = `sign:${label}`;
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.86, h * 0.7), faceMat);
    face.position.set(len / 2 + 0.02, 0, s * (t / 2 + 0.004));
    face.rotation.y = s > 0 ? 0 : Math.PI;
    face.userData.collide = false;
    arm.add(face);
  }

  arm.position.y = y;
  arm.rotation.y = rotY;
  return arm;
}

export function buildMailbox(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'mailbox';
  const iron = mat('metalDark');
  g.add(box(0.5, 0.7, 0.5, mat('stoneBlock'), { pos: [0, 0.35, 0], uvScale: 0.6 }));
  g.add(box(0.7, 0.5, 0.6, iron, { pos: [0, 0.95, 0], uvScale: 0.4 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10, 1, false, 0, Math.PI), iron);
  lid.rotation.x = -Math.PI / 2;
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 1.2;
  lid.castShadow = true;
  g.add(lid);
  g.add(box(0.74, 0.05, 0.64, mat('metalBrass'), { pos: [0, 0.7, 0], uvScale: 0.3 }));

  // Flag on a wire.
  g.add(cylinder(0.012, 0.4, 4, iron, { pos: [0.36, 1.45, -0.22] }));
  const flag = box(0.22, 0.16, 0.015, mat('clothRed'), { pos: [0.47, 1.58, -0.22], uvScale: 0.2, collide: false });
  g.add(flag);

  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.24), runeMat());
  rune.position.set(0, 0.98, 0.302);
  rune.userData.collide = false;
  g.add(rune);
  const runeBack = rune.clone();
  runeBack.position.z = -0.302;
  runeBack.rotation.y = Math.PI;
  g.add(runeBack);
  return g;
}
