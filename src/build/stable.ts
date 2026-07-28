import * as THREE from 'three';
import { mat } from '../gen/materials';
import { box, cylinder, kneeBrace, swaybackRoof, taperedPost } from '../gen/prims';
import { makeRng, range } from '../gen/rng';

/**
 * Open-sided stable shed: closed on the south and both gables, wide open to
 * the north road so the three stalls, the hay and the tack all read from it.
 */

const HALF_X = 5; // 10 m
const HALF_Z = 3; // 6 m
const EAVE = 3.2;
const RIDGE = 5.0;
const WALL = 0.16;
const POST_Z = HALF_Z - 0.15;

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

function waterTrough(): THREE.Group {
  const g = new THREE.Group();
  const planks = mat('plankWall');
  g.add(box(1.7, 0.09, 0.68, planks, { pos: [0, 0.3, 0], uvScale: 0.8 }));
  for (const sz of [-1, 1]) {
    g.add(box(1.7, 0.5, 0.09, planks, { pos: [0, 0.55, sz * 0.34], uvScale: 0.8 }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.09, 0.5, 0.68, planks, { pos: [sx * 0.85, 0.55, 0], uvScale: 0.8 }));
    g.add(box(0.14, 0.3, 0.14, mat('timberDark'), { pos: [sx * 0.66, 0.15, 0], uvScale: 0.4 }));
  }
  for (const y of [0.4, 0.72]) {
    g.add(box(1.76, 0.05, 0.05, mat('metalDark'), { pos: [0, y, 0.36], uvScale: 0.4 }));
  }
  return g;
}

/** Bridles, a folded saddle blanket and coiled rope on the rear wall. */
function tack(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  const leather = mat('timberDark');

  for (const x of [-1.2, 0.9]) {
    g.add(box(0.06, 0.06, 0.14, iron, { pos: [x, 2.05, 0.08], uvScale: 0.2 }));
    const strap = box(0.05, 0.62, 0.03, leather, { pos: [x, 1.74, 0.1], uvScale: 0.3 });
    strap.rotation.z = 0.09;
    g.add(strap);
    const cheek = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 4, 12), leather);
    cheek.position.set(x + 0.05, 1.4, 0.1);
    cheek.castShadow = true;
    g.add(cheek);
    const bit = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 8), iron);
    bit.position.set(x + 0.05, 1.26, 0.1);
    g.add(bit);
  }

  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.72), mat('clothRed', 1, 1, THREE.DoubleSide));
  blanket.position.set(-0.1, 1.62, 0.12);
  blanket.rotation.x = -0.06;
  blanket.userData.collide = false;
  blanket.castShadow = false;
  g.add(blanket);
  g.add(box(1.0, 0.07, 0.12, leather, { pos: [-0.1, 1.99, 0.1], uvScale: 0.4 }));

  for (const [x, y] of [
    [2.1, 1.85],
    [2.35, 1.5],
  ] as Array<[number, number]>) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 14), mat('linen'));
    coil.position.set(x, y, 0.12);
    coil.castShadow = true;
    g.add(coil);
    g.add(box(0.05, 0.05, 0.12, iron, { pos: [x, y + 0.2, 0.08], uvScale: 0.2 }));
  }
  return g;
}

export function buildStable(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stable';

  const rng = makeRng(0x57ab1e);
  const planks = mat('plankWall');
  const dark = mat('timberDark');
  const hay = mat('hay');

  // Hay-strewn floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2 - 0.3, HALF_Z * 2 - 0.3), mat('hay', 5, 3));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  floor.userData.collide = false;
  g.add(floor);

  const strawMat = mat('hay', 1, 1, THREE.DoubleSide);
  for (let i = 0; i < 30; i++) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(range(rng, 0.22, 0.42), range(rng, 0.05, 0.11)), strawMat);
    quad.position.set(range(rng, -4.5, 4.5), range(rng, 0.14, 0.22), range(rng, -2.7, 2.7));
    quad.rotation.set(range(rng, -1.35, -0.9), range(rng, 0, Math.PI), range(rng, -0.4, 0.4));
    quad.userData.collide = false;
    quad.castShadow = false;
    quad.receiveShadow = false;
    g.add(quad);
  }

  // Eight flared posts, four per long side.
  const postX = [-4.4, -1.5, 1.5, 4.4];
  for (const x of postX) {
    for (const sz of [-1, 1]) {
      const post = taperedPost(EAVE, 0.2, 0.26, 8, mat('timberLight'));
      post.position.set(x, 0, sz * POST_Z);
      g.add(post);
    }
  }
  // Wall plates along both long sides plus braces at the open north corners.
  for (const sz of [-1, 1]) {
    g.add(box(HALF_X * 2, 0.24, 0.28, dark, { pos: [0, EAVE - 0.12, sz * POST_Z], uvScale: 1.4 }));
  }
  for (const sx of [-1, 1]) {
    const brace = kneeBrace(0.75, 0.2, dark);
    brace.position.set(sx * 4.4, EAVE - 0.85, -POST_Z);
    brace.rotation.z = sx < 0 ? -Math.PI / 2 : Math.PI;
    g.add(brace);
  }

  // Rear (south) wall.
  g.add(box(HALF_X * 2, EAVE, WALL, planks, { pos: [0, EAVE / 2, HALF_Z - WALL / 2], uvScale: 1.1 }));
  for (const y of [0.5, 1.6, 2.7]) {
    g.add(box(HALF_X * 2, 0.12, 0.08, dark, { pos: [0, y, HALF_Z - WALL - 0.04], uvScale: 1.2 }));
  }

  // Gable walls, closed to the ridge.
  for (const sx of [-1, 1]) {
    g.add(box(WALL, EAVE, HALF_Z * 2, planks, { pos: [sx * (HALF_X - WALL / 2), EAVE / 2, 0], uvScale: 1.1 }));
    const gable = gableInfill(HALF_Z, RIDGE - EAVE, WALL, mat('plankWall', 0.7, 0.7));
    gable.position.set(sx * (HALF_X - WALL / 2), EAVE, 0);
    g.add(gable);
  }

  g.add(
    swaybackRoof(
      HALF_X * 2,
      HALF_Z,
      RIDGE,
      EAVE,
      0.6,
      0.8,
      0.2,
      0.14,
      0.25,
      mat('shingleBlue', 5, 3, THREE.DoubleSide),
      { bargeboards: true },
    ),
  );

  // Three stalls: partitions run across Z, leaving the north end open.
  for (const x of [-1.67, 1.67]) {
    g.add(box(0.1, 1.3, 3.2, planks, { pos: [x, 0.65, 1.1], uvScale: 0.9 }));
    g.add(box(0.16, 0.12, 3.2, dark, { pos: [x, 1.33, 1.1], uvScale: 0.9 }));
    g.add(box(0.16, 1.42, 0.16, dark, { pos: [x, 0.71, -0.48], uvScale: 0.6 }));
  }

  const trough = waterTrough();
  trough.position.set(3.6, 0, -1.7);
  trough.rotation.y = 0.12;
  g.add(trough);

  const t = tack();
  t.position.set(-0.4, 0, HALF_Z - WALL - 0.02);
  t.rotation.y = Math.PI;
  g.add(t);

  // Hay bales.
  for (const [x, y, z, rot] of [
    [-4.1, 0.35, 1.9, 0.1],
    [-4.1, 1.05, 1.85, -0.14],
    [-3.0, 0.35, 2.2, 0.42],
    [4.2, 0.35, 2.1, -0.3],
  ] as Array<[number, number, number, number]>) {
    const bale = box(1.0, 0.7, 0.7, hay, { pos: [x, y, z], rotY: rot, uvScale: 0.6 });
    g.add(bale);
    // Binding twine.
    for (const off of [-0.28, 0.28]) {
      const twine = box(1.02, 0.05, 0.05, mat('linen'), { pos: [x + off * Math.sin(rot), y + 0.36, z + off * Math.cos(rot)], rotY: rot, uvScale: 0.3 });
      g.add(twine);
    }
  }

  // Hitching posts out on the road side, set to one end so the frontage of the
  // shed stays walkable rather than being fenced off by its own rail.
  for (const x of [-4.3, -1.7]) {
    g.add(cylinder(0.11, 1.35, 8, mat('timberLight'), { pos: [x, 0.675, -HALF_Z - 1.2], uvScale: 0.6 }));
    g.add(box(0.26, 0.14, 0.26, dark, { pos: [x, 1.4, -HALF_Z - 1.2], uvScale: 0.3 }));
  }
  g.add(box(2.6, 0.11, 0.14, mat('timberLight'), { pos: [-3.0, 1.14, -HALF_Z - 1.2], uvScale: 1.4 }));

  return g;
}
