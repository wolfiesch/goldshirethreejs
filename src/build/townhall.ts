import * as THREE from 'three';
import { glassMat, mat } from '../gen/materials';
import { box, cylinder, kneeBrace, smokePlume, swaybackRoof, taperedPost } from '../gen/prims';

/**
 * Goldshire town hall: a two-storey jettied hall, heavy dark framing over
 * plaster, big swayback roof and one brick stack on the east gable.
 * Exterior only by design -- the door stays shut and the shell is sealed, so
 * the lit leaded windows do all the work at village distance.
 */

const HALF_X = 6.5; // 13 m
const HALF_Z = 4.5; // 9 m
const WALL = 0.35;
const PLINTH = 0.6;
const FIRST_FLOOR = 4.6; // top of the ground-storey posts
const EAVE = 6.0;
const RIDGE = 10.5;
const JETTY = 0.25; // south face only

const BELT_A = 4.45;
const BELT_B = 4.8;

const CHIMNEY_TOP = 12.0;

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

/**
 * Leaded pane in a dark frame with a light projecting sill. Built facing +Z
 * with the wall plane at z = 0; rotate the group to hang it on another face.
 */
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
  // Sill projects 0.1 beyond the frame face.
  g.add(box(w + 0.36, 0.09, 0.2, mat('timberLight'), { pos: [0, -h / 2 - t - 0.045, 0.06], uvScale: 0.6 }));
  return g;
}

/** Brick stack with a corbelled cap and a carved capstone. */
function chimney(w: number, d: number, top: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, top, d, mat('brick'), { pos: [0, top / 2, 0], uvScale: 1.4 }));
  g.add(box(w + 0.3, 0.34, d + 0.3, mat('brick'), { pos: [0, top + 0.17, 0], uvScale: 1.2 }));
  g.add(box(w + 0.45, 0.14, d + 0.45, mat('carvedStone'), { pos: [0, top + 0.41, 0], uvScale: 1.2 }));
  const smoke = smokePlume(24, 6.0, 0.5, 0x7a11, 0.8);
  smoke.position.y = top + 0.6;
  g.add(smoke);
  return g;
}

/** The shut double door plus its stoop and gabled hood. */
function entrance(): THREE.Group {
  const g = new THREE.Group();
  const planks = mat('plankWall');
  const dark = mat('timberDark');
  const iron = mat('metalDark');
  const stone = mat('stoneBlock');

  const doorW = 1.8;
  const doorH = 2.4;
  const face = HALF_Z;

  // Frame.
  for (const sx of [-1, 1]) {
    g.add(box(0.2, doorH + 0.3, 0.24, dark, { pos: [sx * (doorW / 2 + 0.1), PLINTH + (doorH + 0.3) / 2, face], uvScale: 0.8 }));
  }
  g.add(box(doorW + 0.4, 0.24, 0.24, dark, { pos: [0, PLINTH + doorH + 0.12, face], uvScale: 0.8 }));

  // Two shut leaves.
  for (const sx of [-1, 1]) {
    const leaf = box(doorW / 2 - 0.02, doorH, 0.1, planks, {
      pos: [sx * (doorW / 4), PLINTH + doorH / 2, face + 0.02],
      uvScale: 0.7,
    });
    g.add(leaf);
    for (const y of [0.45, 1.2, 1.95]) {
      g.add(box(doorW / 2 - 0.06, 0.09, 0.03, iron, { pos: [sx * (doorW / 4), PLINTH + y, face + 0.08], uvScale: 0.3 }));
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 4, 10), iron);
    ring.position.set(sx * 0.2, PLINTH + 1.3, face + 0.09);
    g.add(ring);
  }

  // Three-step stoop down to grade.
  const stoopW = 2.6;
  g.add(box(stoopW, PLINTH, 0.5, stone, { pos: [0, PLINTH / 2, HALF_Z + 0.3 + 0.25], uvScale: 1 }));
  g.add(box(stoopW, 0.4, 0.34, stone, { pos: [0, 0.2, HALF_Z + 0.3 + 0.67], uvScale: 1 }));
  g.add(box(stoopW, 0.2, 0.34, stone, { pos: [0, 0.1, HALF_Z + 0.3 + 1.01], uvScale: 1 }));

  // Gabled hood on two brackets.
  const hood = swaybackRoof(2.8, 0.85, 4.2, 3.55, 0.15, 0.22, 0.06, 0.04, 0.12, mat('shingleBlue', 2, 1, THREE.DoubleSide), {
    ridgeCap: false,
  });
  hood.position.set(0, 0, face + 0.55);
  g.add(hood);
  for (const sx of [-1, 1]) {
    const bracket = kneeBrace(0.72, 0.2, dark);
    bracket.position.set(sx * 1.15, 3.45, face + 0.04);
    // Rz first, then Ry: legs end up pointing down the wall and out under the hood.
    bracket.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
    g.add(bracket);
  }
  return g;
}

function noticeBoard(): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 1.55, 0.1, dark, { pos: [sx * 0.42, 0.775, 0], uvScale: 0.6 }));
  }
  g.add(box(1.0, 0.8, 0.07, mat('noticeBoard'), { pos: [0, 1.35, 0.05], uvScale: 1 }));
  g.add(box(1.12, 0.1, 0.12, dark, { pos: [0, 1.8, 0.04], uvScale: 0.5 }));
  return g;
}

export function buildTownHall(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'townhall';

  const stone = mat('stoneBlock');
  const plaster = mat('plaster');
  const dark = mat('timberDark');

  // Plinth.
  g.add(box(HALF_X * 2 + 0.6, PLINTH, HALF_Z * 2 + 0.6, stone, { pos: [0, PLINTH / 2, 0], uvScale: 1.6 }));

  // ---- Ground storey shell (sealed) ----
  const groundH = FIRST_FLOOR - PLINTH;
  const groundY = PLINTH + groundH / 2;
  const southFaceZ = HALF_Z - WALL / 2;
  const sideFaceX = HALF_X - WALL / 2;
  const spanX = HALF_X * 2 - WALL * 2;

  for (const sz of [-1, 1]) {
    g.add(box(spanX, groundH, WALL, plaster, { pos: [0, groundY, sz * southFaceZ] }));
  }
  for (const sx of [-1, 1]) {
    g.add(box(WALL, groundH, HALF_Z * 2, plaster, { pos: [sx * sideFaceX, groundY, 0] }));
  }

  // ---- Upper storey, jettied 0.25 on the south face ----
  const upperH = EAVE - FIRST_FLOOR;
  const upperY = FIRST_FLOOR + upperH / 2;
  g.add(box(spanX, upperH, WALL, plaster, { pos: [0, upperY, HALF_Z + JETTY - WALL / 2] }));
  g.add(box(spanX, upperH, WALL, plaster, { pos: [0, upperY, -southFaceZ] }));
  for (const sx of [-1, 1]) {
    g.add(box(WALL, upperH, HALF_Z * 2 + JETTY, plaster, { pos: [sx * sideFaceX, upperY, JETTY / 2] }));
  }
  // Jetty soffit closing the overhang.
  g.add(box(spanX, 0.14, JETTY + WALL, mat('timberLight'), { pos: [0, FIRST_FLOOR - 0.07, HALF_Z + JETTY / 2 - WALL / 2 + 0.02], uvScale: 1 }));

  // ---- Gables ----
  for (const sx of [-1, 1]) {
    const gable = gableInfill(HALF_Z, RIDGE - EAVE, WALL, mat('plaster', 0.5, 0.5));
    gable.position.set(sx * sideFaceX, EAVE, 0);
    g.add(gable);
    g.add(box(WALL + 0.06, 0.22, HALF_Z * 1.5, dark, { pos: [sx * sideFaceX, EAVE + 1.5, 0], uvScale: 1.2 }));
    g.add(box(WALL + 0.06, RIDGE - EAVE - 0.2, 0.24, dark, { pos: [sx * sideFaceX, EAVE + (RIDGE - EAVE) / 2, 0], uvScale: 1.2 }));
  }

  // ---- Heavy ground-storey framing ----
  const postY = PLINTH;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = taperedPost(groundH, 0.26, 0.34, 8, dark);
      post.position.set(sx * sideFaceX, postY, sz * southFaceZ);
      g.add(post);
    }
    // Mid posts on the gable walls.
    const midSide = taperedPost(groundH, 0.24, 0.3, 8, dark);
    midSide.position.set(sx * sideFaceX, postY, 0);
    g.add(midSide);
  }
  for (const x of [-3.3, 3.3]) {
    for (const sz of [-1, 1]) {
      const post = taperedPost(groundH, 0.24, 0.3, 8, dark);
      post.position.set(x, postY, sz * southFaceZ);
      g.add(post);
    }
  }
  // Sill rails and diagonal braces.
  for (const sz of [-1, 1]) {
    g.add(box(spanX + 0.3, 0.24, WALL + 0.14, dark, { pos: [0, PLINTH + 0.14, sz * southFaceZ], uvScale: 1.6 }));
    for (const x of [-4.9, -1.7, 1.7, 4.9]) {
      const brace = box(1.4, 0.18, WALL + 0.1, dark, { pos: [x, PLINTH + 0.65, sz * southFaceZ], uvScale: 1.2 });
      brace.rotation.z = x < 0 ? Math.PI / 4 : -Math.PI / 4;
      g.add(brace);
    }
  }
  for (const sx of [-1, 1]) {
    g.add(box(WALL + 0.14, 0.24, HALF_Z * 2, dark, { pos: [sx * sideFaceX, PLINTH + 0.14, 0], uvScale: 1.6 }));
    for (const z of [-2.2, 2.2]) {
      const brace = box(WALL + 0.1, 0.18, 1.4, dark, { pos: [sx * sideFaceX, PLINTH + 0.65, z], uvScale: 1.2 });
      brace.rotation.x = z < 0 ? -Math.PI / 4 : Math.PI / 4;
      g.add(brace);
    }
  }

  // ---- Doubled belt course at the first-floor line ----
  const southBeltZ = HALF_Z + JETTY + 0.15 - 0.125;
  for (const y of [BELT_A, BELT_B]) {
    g.add(box(HALF_X * 2 + 0.7, 0.22, 0.25, dark, { pos: [0, y, southBeltZ], uvScale: 1.6 }));
    g.add(box(HALF_X * 2 + 0.7, 0.22, 0.25, dark, { pos: [0, y, -(HALF_Z + 0.025)], uvScale: 1.6 }));
    for (const sx of [-1, 1]) {
      g.add(box(0.25, 0.22, HALF_Z * 2 + JETTY, dark, { pos: [sx * (HALF_X + 0.025), y, JETTY / 2], uvScale: 1.6 }));
    }
  }

  // ---- Upper-storey studs ----
  const studBottom = BELT_B + 0.11;
  const studH = EAVE - studBottom;
  for (const x of [-5.4, -3.6, -1.8, 1.8, 3.6, 5.4]) {
    g.add(box(0.2, studH, WALL + 0.08, dark, { pos: [x, studBottom + studH / 2, HALF_Z + JETTY - WALL / 2], uvScale: 1 }));
    g.add(box(0.2, studH, WALL + 0.08, dark, { pos: [x, studBottom + studH / 2, -southFaceZ], uvScale: 1 }));
  }
  for (const sx of [-1, 1]) {
    for (const z of [-3.0, -1.0, 1.0, 3.0]) {
      g.add(box(WALL + 0.08, studH, 0.2, dark, { pos: [sx * sideFaceX, studBottom + studH / 2, z], uvScale: 1 }));
    }
    g.add(box(WALL + 0.12, 0.22, HALF_Z * 2 + JETTY, dark, { pos: [sx * sideFaceX, EAVE - 0.11, JETTY / 2], uvScale: 1.4 }));
  }
  g.add(box(spanX + 0.2, 0.22, WALL + 0.12, dark, { pos: [0, EAVE - 0.11, HALF_Z + JETTY - WALL / 2], uvScale: 1.4 }));
  g.add(box(spanX + 0.2, 0.22, WALL + 0.12, dark, { pos: [0, EAVE - 0.11, -southFaceZ], uvScale: 1.4 }));

  // ---- Roof ----
  g.add(
    swaybackRoof(
      HALF_X * 2,
      HALF_Z,
      RIDGE,
      EAVE,
      0.8,
      1.0,
      0.35,
      0.22,
      0.32,
      mat('shingleBlue', 7, 4, THREE.DoubleSide),
      { bargeboards: true },
    ),
  );
  // Finials at both gable apexes.
  for (const sx of [-1, 1]) {
    g.add(cylinder(0.1, 0.7, 6, mat('timberLight'), { pos: [sx * (HALF_X + 0.6), RIDGE + 0.35, 0] }));
  }

  // ---- Chimney on the east gable ----
  const stack = chimney(1.4, 1.2, CHIMNEY_TOP);
  stack.position.set(HALF_X + 0.6, 0, 0);
  g.add(stack);

  // ---- Windows: three per storey on the south facade, two per gable ----
  for (const x of [-4.8, -2.4, 4.4]) {
    const w = leadedWindow(1.2, 1.4);
    w.position.set(x, 2.0 + 0.7, HALF_Z + 0.02);
    g.add(w);
  }
  for (const x of [-4.4, 0, 4.4]) {
    const w = leadedWindow(1.0, 0.65);
    w.position.set(x, 5.2 + 0.325, HALF_Z + JETTY + 0.02);
    g.add(w);
  }
  for (const sx of [-1, 1]) {
    for (const z of [-2.6, 2.6]) {
      const w = leadedWindow(0.9, 1.1);
      w.position.set(sx * (HALF_X + 0.02), 6.55, z);
      w.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(w);
    }
  }

  g.add(entrance());

  const board = noticeBoard();
  board.position.set(2.0, 0, HALF_Z + 0.75);
  board.rotation.y = -0.28;
  g.add(board);

  return g;
}
