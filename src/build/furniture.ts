import * as THREE from 'three';
import { cobwebMat, mat } from '../gen/materials';
import { barrel, bottle, box, candle, cylinder, jar, sack, tankard } from '../gen/prims';
import { makeRng, range, rangeInt } from '../gen/rng';

/**
 * Interior furniture. Everything sits on the floor plane at local y = 0 so a
 * caller only supplies (x, floorY, z).
 */

const TABLE_H = 0.78;
const SEAT_H = 0.45;
const STOOL_H = 0.48;

/** Long plank table with trestle legs and a stretcher, long axis along X. */
export function plankTable(len: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  g.add(box(len, 0.07, depth, timber, { pos: [0, TABLE_H - 0.035, 0], uvScale: 1.1 }));
  g.add(box(len - 0.3, 0.05, depth - 0.18, dark, { pos: [0, TABLE_H - 0.095, 0], uvScale: 1.1 }));
  for (const s of [-1, 1]) {
    const x = s * (len / 2 - 0.35);
    g.add(box(0.12, TABLE_H - 0.09, depth - 0.16, dark, { pos: [x, (TABLE_H - 0.09) / 2, 0], uvScale: 0.7 }));
    g.add(box(0.4, 0.09, depth, dark, { pos: [x, 0.045, 0], uvScale: 0.6 }));
  }
  g.add(box(len - 0.9, 0.09, 0.09, dark, { pos: [0, 0.3, 0], uvScale: 0.7 }));
  return g;
}

export function roundTable(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  g.add(cylinder(diameter / 2, 0.07, 14, timber, { pos: [0, TABLE_H - 0.035, 0], uvScale: 0.9 }));
  g.add(cylinder(0.09, TABLE_H - 0.1, 8, dark, { pos: [0, (TABLE_H - 0.1) / 2, 0], uvScale: 0.5 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = box(diameter * 0.42, 0.08, 0.11, dark, {
      pos: [(Math.cos(a) * diameter) / 5, 0.04, (Math.sin(a) * diameter) / 5],
      rotY: -a,
      uvScale: 0.6,
    });
    g.add(foot);
  }
  return g;
}

/** Tall solid-back chair from the interior reference. Back faces -Z. */
export function highBackChair(): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  g.add(box(0.46, 0.06, 0.44, timber, { pos: [0, SEAT_H, 0], uvScale: 0.7 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.07, SEAT_H, 0.07, dark, { pos: [sx * 0.185, SEAT_H / 2, sz * 0.175], uvScale: 0.5 }));
    }
  }
  g.add(box(0.46, 0.66, 0.055, timber, { pos: [0, SEAT_H + 0.36, -0.2], uvScale: 0.7 }));
  g.add(box(0.5, 0.08, 0.09, dark, { pos: [0, SEAT_H + 0.7, -0.2], uvScale: 0.5 }));
  return g;
}

export function stool(): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const dark = mat('timberDark');
  g.add(cylinder(0.19, 0.055, 10, timber, { pos: [0, STOOL_H, 0], uvScale: 0.5 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = box(0.055, STOOL_H, 0.055, dark, {
      pos: [Math.cos(a) * 0.13, STOOL_H / 2, Math.sin(a) * 0.13],
      uvScale: 0.4,
    });
    leg.rotation.z = -Math.cos(a) * 0.13;
    leg.rotation.x = Math.sin(a) * 0.13;
    g.add(leg);
  }
  return g;
}

/** Backless bench, long axis along X. */
export function benchSeat(len: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  g.add(box(len, 0.07, 0.34, timber, { pos: [0, SEAT_H, 0], uvScale: 0.9 }));
  for (const s of [-1, 1]) {
    g.add(box(0.08, SEAT_H, 0.3, mat('timberDark'), { pos: [s * (len / 2 - 0.24), SEAT_H / 2, 0], uvScale: 0.5 }));
  }
  return g;
}

export function bed(len: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  const frameH = 0.34;
  g.add(box(len, 0.12, width, dark, { pos: [0, frameH, 0], uvScale: 0.9 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.1, frameH, 0.1, dark, { pos: [sx * (len / 2 - 0.07), frameH / 2, sz * (width / 2 - 0.07)], uvScale: 0.5 }));
    }
  }
  g.add(box(0.09, 0.7, width, dark, { pos: [-len / 2 + 0.045, 0.5, 0], uvScale: 0.7 }));
  g.add(box(0.09, 0.34, width, dark, { pos: [len / 2 - 0.045, 0.42, 0], uvScale: 0.7 }));
  // Straw mattress and a folded blanket.
  g.add(box(len - 0.16, 0.17, width - 0.12, mat('hay'), { pos: [0, frameH + 0.145, 0], uvScale: 0.7 }));
  g.add(box(len * 0.52, 0.06, width - 0.14, mat('linen'), { pos: [len * 0.2, frameH + 0.26, 0], uvScale: 0.7 }));
  g.add(box(0.4, 0.13, width - 0.3, mat('linen'), { pos: [-len / 2 + 0.34, frameH + 0.3, 0], uvScale: 0.4 }));
  return g;
}

export function chest(w = 0.85, h = 0.55, d = 0.5): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const iron = mat('metalDark');
  g.add(box(w, h - 0.12, d, timber, { pos: [0, (h - 0.12) / 2, 0], uvScale: 0.6 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI), timber);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = h - 0.12;
  lid.castShadow = true;
  g.add(lid);
  for (const s of [-1, 1]) {
    g.add(box(0.05, h - 0.1, d + 0.02, iron, { pos: [s * w * 0.3, (h - 0.1) / 2, 0], uvScale: 0.3 }));
  }
  g.add(box(0.12, 0.14, 0.05, iron, { pos: [0, h - 0.22, d / 2 + 0.02], uvScale: 0.2 }));
  return g;
}

export function bookshelf(w: number, h: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  const rng = makeRng(seed);
  const shelves = Math.max(2, Math.floor(h / 0.42));
  g.add(box(0.06, h, d, timber, { pos: [-w / 2 + 0.03, h / 2, 0], uvScale: 0.7 }));
  g.add(box(0.06, h, d, timber, { pos: [w / 2 - 0.03, h / 2, 0], uvScale: 0.7 }));
  g.add(box(w, 0.05, d, timber, { pos: [0, h - 0.025, 0], uvScale: 0.7 }));
  g.add(box(w, h, 0.04, mat('plankWall'), { pos: [0, h / 2, -d / 2 + 0.02], uvScale: 0.9 }));
  const covers = ['bottleGreen', 'clay', 'rugRed', 'timberDark'] as const;
  for (let s = 0; s < shelves; s++) {
    const y = ((s + 1) / (shelves + 1)) * h;
    g.add(box(w - 0.12, 0.04, d, timber, { pos: [0, y, 0], uvScale: 0.7 }));
    let x = -w / 2 + 0.1;
    while (x < w / 2 - 0.14) {
      const bw = range(rng, 0.035, 0.07);
      const bh = range(rng, 0.2, 0.32);
      g.add(box(bw, bh, d * 0.72, mat(covers[rangeInt(rng, 0, covers.length - 1)]), { pos: [x + bw / 2, y + 0.02 + bh / 2, 0], uvScale: 0.2 }));
      x += bw + 0.008;
    }
  }
  return g;
}

/** Horizontal casks on a timber cradle: the back-bar rack from the reference. */
export function caskRack(count: number, caskRadius = 0.3, caskLength = 0.66): THREE.Group {
  const g = new THREE.Group();
  const dark = mat('timberDark');
  const spacing = caskRadius * 2 + 0.1;
  const width = count * spacing;
  const cradleY = caskRadius + 0.34;
  for (const s of [-1, 1]) {
    g.add(box(0.1, cradleY + caskRadius, caskLength + 0.1, dark, { pos: [s * (width / 2), (cradleY + caskRadius) / 2, 0], uvScale: 0.6 }));
  }
  g.add(box(width, 0.08, caskLength + 0.1, dark, { pos: [0, 0.04, 0], uvScale: 0.7 }));
  g.add(box(width, 0.08, caskLength + 0.1, dark, { pos: [0, cradleY - caskRadius - 0.04, 0], uvScale: 0.7 }));
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + spacing * (i + 0.5);
    const cask = barrel(caskRadius, caskLength, mat('timberDark'), mat('metalDark'));
    cask.rotation.x = Math.PI / 2;
    cask.position.set(x, cradleY, caskLength / 2);
    g.add(cask);
    // spigot
    g.add(cylinder(0.022, 0.12, 6, mat('metalDark'), { pos: [x, cradleY, -caskLength / 2 - 0.06], rot: [Math.PI / 2, 0, 0] }));
  }
  return g;
}

/** 3 + 2 + 1 stacked barrels. */
export function barrelPyramid(r = 0.36, h = 0.86): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = mat('timberDark');
  const hoopMat = mat('metalDark');
  const rows = [3, 2, 1];
  for (let row = 0; row < rows.length; row++) {
    const n = rows[row];
    for (let i = 0; i < n; i++) {
      const b = barrel(r, h, bodyMat, hoopMat);
      b.position.set((i - (n - 1) / 2) * (r * 2 + 0.03), row * (h + 0.02), row * 0.02);
      g.add(b);
    }
  }
  return g;
}

export function wineRack(w: number, d: number, h: number, bottles: number): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberDark');
  const cols = Math.ceil(bottles / 4);
  g.add(box(w, 0.06, d, timber, { pos: [0, 0.03, 0], uvScale: 0.7 }));
  g.add(box(w, 0.06, d, timber, { pos: [0, h - 0.03, 0], uvScale: 0.7 }));
  for (const s of [-1, 1]) g.add(box(0.06, h, d, timber, { pos: [s * (w / 2 - 0.03), h / 2, 0], uvScale: 0.7 }));
  for (let r = 0; r < 4; r++) {
    const y = 0.06 + ((r + 0.5) * (h - 0.12)) / 4;
    g.add(box(w - 0.12, 0.04, d, timber, { pos: [0, y - (h - 0.12) / 8, 0], uvScale: 0.7 }));
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 0.12 + ((c + 0.5) * (w - 0.24)) / cols;
      const b = bottle(0.28, 0.038);
      b.rotation.z = Math.PI / 2;
      b.position.set(x, y, -0.02);
      b.rotation.y = Math.PI / 2;
      g.add(b);
    }
  }
  return g;
}

export function washStand(): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  g.add(box(0.6, 0.05, 0.4, timber, { pos: [0, 0.82, 0], uvScale: 0.5 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.06, 0.82, 0.06, mat('timberDark'), { pos: [sx * 0.25, 0.41, sz * 0.15], uvScale: 0.4 }));
    }
  }
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.09, 12), mat('clay'));
  basin.position.set(-0.1, 0.89, 0);
  g.add(basin);
  const ewer = jar(0.24, 0.08);
  ewer.position.set(0.17, 0.845, 0);
  g.add(ewer);
  return g;
}

export function sideTable(w = 0.7, d = 0.45): THREE.Group {
  const g = new THREE.Group();
  const timber = mat('timberLight');
  g.add(box(w, 0.05, d, timber, { pos: [0, 0.7, 0], uvScale: 0.5 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.055, 0.7, 0.055, mat('timberDark'), { pos: [sx * (w / 2 - 0.06), 0.35, sz * (d / 2 - 0.06)], uvScale: 0.4 }));
    }
  }
  return g;
}

/** Branched iron candelabrum for tabletops. */
export function candelabra(arms = 3): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  g.add(cylinder(0.09, 0.03, 8, iron, { pos: [0, 0.015, 0] }));
  g.add(cylinder(0.022, 0.28, 6, iron, { pos: [0, 0.16, 0] }));
  const c = candle(0.16);
  c.position.y = 0.3;
  g.add(c);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 4, 8, Math.PI / 2), iron);
    arm.position.set(0, 0.19, 0);
    arm.rotation.y = -a;
    arm.rotation.z = Math.PI;
    g.add(arm);
    const cc = candle(0.14);
    cc.position.set(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1);
    g.add(cc);
    g.add(cylinder(0.032, 0.02, 6, iron, { pos: [Math.cos(a) * 0.1, 0.195, Math.sin(a) * 0.1] }));
  }
  return g;
}

/** Ceiling-hung rack of copper pots. */
export function potRack(len: number, pots: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  const rng = makeRng(seed);
  g.add(box(len, 0.05, 0.05, iron, { pos: [0, 0, 0], uvScale: 0.4 }));
  for (let i = 0; i < pots; i++) {
    const x = -len / 2 + ((i + 0.5) * len) / pots;
    const r = range(rng, 0.08, 0.14);
    const drop = range(rng, 0.1, 0.2);
    g.add(cylinder(0.008, drop, 4, iron, { pos: [x, -drop / 2, 0] }));
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, r * 1.2, 10), mat('copper'));
    pot.position.set(x, -drop - r * 0.6, 0);
    pot.castShadow = true;
    g.add(pot);
  }
  return g;
}

/** Wall shelf carrying assorted clutter. */
export function shelfWithClutter(len: number, depth: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  g.add(box(len, 0.05, depth, mat('timberLight'), { pos: [0, 0, 0], uvScale: 0.8 }));
  for (const s of [-0.4, 0.4]) {
    g.add(box(0.06, 0.16, depth * 0.7, mat('timberDark'), { pos: [s * len, -0.1, 0], uvScale: 0.3 }));
  }
  let x = -len / 2 + 0.12;
  while (x < len / 2 - 0.12) {
    const roll = rng();
    if (roll < 0.55) {
      const b = bottle(range(rng, 0.2, 0.3), 0.036);
      b.position.set(x, 0.025, range(rng, -depth * 0.2, depth * 0.2));
      g.add(b);
      x += 0.11;
    } else if (roll < 0.82) {
      const t = tankard();
      t.position.set(x, 0.025, range(rng, -depth * 0.2, depth * 0.2));
      g.add(t);
      x += 0.13;
    } else {
      const j = jar(range(rng, 0.16, 0.22), 0.07);
      j.position.set(x, 0.025, 0);
      g.add(j);
      x += 0.19;
    }
  }
  return g;
}

/** Loose sacks and crates dumped at a stair foot. */
export function sackPile(seed: number, count = 4): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const s = sack(range(rng, 0.42, 0.58), range(rng, 0.36, 0.5), seed + i * 17);
    s.position.set(range(rng, -0.45, 0.45), i < 2 ? 0 : 0.36, range(rng, -0.35, 0.35));
    s.rotation.y = range(rng, 0, Math.PI * 2);
    g.add(s);
  }
  return g;
}

/** Dusty alpha quad for cellar corners. Never collidable. */
export function cobweb(size: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), cobwebMat());
  m.userData.collide = false;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
