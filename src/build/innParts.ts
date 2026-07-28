import * as THREE from 'three';
import { glassMat, mat } from '../gen/materials';
import { box, cylinder } from '../gen/prims';

/**
 * Architectural elements shared by the inn's shell, its floors and its cellar.
 * Wall openings are composed from boxes (below / above / left / right) rather
 * than cut with CSG: the result is watertight for the collider and cheap.
 */

export interface Opening {
  /** Centre position along the wall axis. */
  a: number;
  /** Opening width along the wall axis. */
  w: number;
  y0: number;
  y1: number;
}

export interface WallSpec {
  /** Axis the wall runs along. */
  axis: 'x' | 'z';
  from: number;
  to: number;
  /** Centre-line position on the perpendicular horizontal axis. */
  offset: number;
  y0: number;
  y1: number;
  thickness: number;
  material: THREE.Material;
  openings?: Opening[];
  uvScale?: number;
}

export function buildWall(spec: WallSpec): THREE.Group {
  const g = new THREE.Group();
  const uvScale = spec.uvScale ?? 2;
  const place = (alongMid: number, alongLen: number, yMid: number, yLen: number): void => {
    if (alongLen <= 1e-4 || yLen <= 1e-4) return;
    const pos: [number, number, number] =
      spec.axis === 'x' ? [alongMid, yMid, spec.offset] : [spec.offset, yMid, alongMid];
    const w = spec.axis === 'x' ? alongLen : spec.thickness;
    const d = spec.axis === 'x' ? spec.thickness : alongLen;
    g.add(box(w, yLen, d, spec.material, { pos, uvScale }));
  };

  const openings = [...(spec.openings ?? [])].sort((p, q) => p.a - q.a);
  let cursor = spec.from;
  for (const o of openings) {
    const left = o.a - o.w / 2;
    const right = o.a + o.w / 2;
    if (left > cursor) place((cursor + left) / 2, left - cursor, (spec.y0 + spec.y1) / 2, spec.y1 - spec.y0);
    if (o.y0 > spec.y0) place((left + right) / 2, o.w, (spec.y0 + o.y0) / 2, o.y0 - spec.y0);
    if (o.y1 < spec.y1) place((left + right) / 2, o.w, (o.y1 + spec.y1) / 2, spec.y1 - o.y1);
    cursor = Math.max(cursor, right);
  }
  if (spec.to > cursor) place((cursor + spec.to) / 2, spec.to - cursor, (spec.y0 + spec.y1) / 2, spec.y1 - spec.y0);
  return g;
}

/**
 * Gable wall above the eaves plate, extruded across the wall thickness.
 *
 * `topAt(a)` samples the underside of the real roof at each across-position.
 * A straight rake to the full ridge height would poke a sliver of plaster out
 * above the sagged roof along the whole slope.
 *
 * `holes` are rectangles in local (across, height) space, measured from the
 * wall centre and from ground level.
 */
export function gableWall(
  halfSpan: number,
  baseY: number,
  topAt: (a: number) => number,
  thickness: number,
  material: THREE.Material,
  holes: Array<{ a: number; y: number; w: number; h: number; diamond?: boolean }> = [],
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, baseY);
  shape.lineTo(halfSpan, baseY);
  const steps = 24;
  for (let i = steps; i >= 0; i--) {
    const a = -halfSpan + (2 * halfSpan * i) / steps;
    shape.lineTo(a, Math.max(baseY, topAt(a)));
  }
  shape.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    if (h.diamond) {
      const r = h.w / 2;
      path.moveTo(h.a, h.y + r);
      path.lineTo(h.a + r, h.y);
      path.lineTo(h.a, h.y - r);
      path.lineTo(h.a - r, h.y);
    } else {
      path.moveTo(h.a - h.w / 2, h.y - h.h / 2);
      path.lineTo(h.a + h.w / 2, h.y - h.h / 2);
      path.lineTo(h.a + h.w / 2, h.y + h.h / 2);
      path.lineTo(h.a - h.w / 2, h.y + h.h / 2);
    }
    path.closePath();
    shape.holes.push(path);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  // Extrusion lies in XY; the caller rotates it into the correct wall plane.
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface WindowOpts {
  /** Semicircular head of radius w/2 above a shaft; total height stays `h`. */
  arched?: boolean;
  diamond?: boolean;
  /** Wall thickness the unit has to fill; drives the spandrel depth. */
  wallThickness?: number;
  /** Sill projection outward (-Z in local space). */
  sill?: boolean;
  mullions?: boolean;
}

/**
 * Leaded window in the local XY plane, glass at z = 0, exterior facing -Z.
 * Frame `timberDark`, sill `timberLight`, panes `glassMat` (never collidable).
 */
export function windowUnit(w: number, h: number, opts: WindowOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const frameMat = mat('timberDark');
  const frameT = 0.12;
  const frameW = 0.09;

  const addGlass = (geo: THREE.BufferGeometry, parent: THREE.Object3D = g): void => {
    const pane = new THREE.Mesh(geo, glassMat());
    pane.userData.collide = false;
    pane.castShadow = false;
    pane.receiveShadow = false;
    parent.add(pane);
  };

  if (opts.diamond) {
    const shape = new THREE.Shape();
    const r = w / 2;
    shape.moveTo(0, r);
    shape.lineTo(r, 0);
    shape.lineTo(0, -r);
    shape.lineTo(-r, 0);
    shape.closePath();
    addGlass(new THREE.ShapeGeometry(shape));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const bar = box(w * 0.78, frameW, frameT, frameMat, { uvScale: 0.4 });
      bar.position.set(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0);
      bar.rotation.z = a + Math.PI / 2;
      g.add(bar);
    }
    return g;
  }

  if (opts.arched) {
    const arch = new THREE.Group();
    // Built sill-relative, then dropped so the group origin is the opening centre.
    arch.position.y = -h / 2;
    g.add(arch);
    const r = w / 2;
    const shaft = h - r;
    const shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, shaft);
    shape.absarc(0, shaft, r, 0, Math.PI, false);
    shape.lineTo(-r, 0);
    addGlass(new THREE.ShapeGeometry(shape, 16), arch);

    // Fill the rectangular opening's top corners so the arch reads as masonry.
    const depth = opts.wallThickness ?? 0.6;
    for (const s of [-1, 1]) {
      const sp = new THREE.Shape();
      sp.moveTo(s * r, shaft);
      sp.lineTo(s * r, shaft + r);
      sp.lineTo(0, shaft + r);
      sp.absarc(0, shaft, r, Math.PI / 2, s < 0 ? Math.PI : 0, s > 0);
      sp.closePath();
      const geo = new THREE.ExtrudeGeometry(sp, { depth, bevelEnabled: false, curveSegments: 10 });
      geo.translate(0, 0, -depth / 2);
      const fillMesh = new THREE.Mesh(geo, mat('plaster'));
      fillMesh.castShadow = true;
      fillMesh.receiveShadow = true;
      arch.add(fillMesh);
    }

    // Arch ring plus jambs.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - frameW / 2, frameW / 2, 4, 16, Math.PI), frameMat);
    ring.position.y = shaft;
    ring.scale.z = frameT / frameW;
    arch.add(ring);
    for (const s of [-1, 1]) {
      arch.add(box(frameW, shaft, frameT, frameMat, { pos: [s * (r - frameW / 2), shaft / 2, 0], uvScale: 0.5 }));
    }
    arch.add(box(w, frameW, frameT, frameMat, { pos: [0, frameW / 2, 0], uvScale: 0.5 }));
    arch.add(box(w * 0.1, shaft + r * 0.9, frameT * 0.8, frameMat, { pos: [0, (shaft + r * 0.9) / 2, 0], uvScale: 0.5 }));
    arch.add(box(w * 0.92, frameW * 0.8, frameT * 0.8, frameMat, { pos: [0, shaft * 0.55, 0], uvScale: 0.5 }));
    if (opts.sill !== false) {
      arch.add(box(w + 0.24, 0.09, (opts.wallThickness ?? 0.6) * 0.5 + 0.18, mat('timberLight'), { pos: [0, -0.045, -0.1], uvScale: 0.6 }));
    }
    return g;
  }

  addGlass(new THREE.PlaneGeometry(w, h));
  g.add(box(w + frameW * 2, frameW, frameT, frameMat, { pos: [0, -h / 2 - frameW / 2, 0], uvScale: 0.5 }));
  g.add(box(w + frameW * 2, frameW, frameT, frameMat, { pos: [0, h / 2 + frameW / 2, 0], uvScale: 0.5 }));
  for (const s of [-1, 1]) {
    g.add(box(frameW, h, frameT, frameMat, { pos: [s * (w / 2 + frameW / 2), 0, 0], uvScale: 0.5 }));
  }
  if (opts.mullions !== false) {
    g.add(box(0.055, h, frameT * 0.8, frameMat, { pos: [0, 0, 0], uvScale: 0.4 }));
    g.add(box(w, 0.05, frameT * 0.8, frameMat, { pos: [0, 0, 0], uvScale: 0.4 }));
  }
  if (opts.sill !== false) {
    g.add(box(w + 0.3, 0.09, (opts.wallThickness ?? 0.6) * 0.5 + 0.18, mat('timberLight'), { pos: [0, -h / 2 - 0.09, -0.1], uvScale: 0.6 }));
  }
  return g;
}

export interface StairOpts {
  steps: number;
  rise: number;
  going: number;
  width: number;
  treadMaterial: THREE.Material;
  /** Solid wedge under the treads: the boxed stringer from the reference. */
  closedStringer?: boolean;
  stringerMaterial?: THREE.Material;
}

/**
 * Straight flight ascending along +X from the local origin. Tread `i` occupies
 * x in [i*going, (i+1)*going] and y in [i*rise, (i+1)*rise], so consecutive
 * treads share a face and the capsule sweep climbs them as a ramp.
 */
export function straightStair(opts: StairOpts): THREE.Group {
  const g = new THREE.Group();
  const { steps, rise, going, width } = opts;
  for (let i = 0; i < steps; i++) {
    g.add(
      box(going, rise, width, opts.treadMaterial, {
        pos: [i * going + going / 2, i * rise + rise / 2, 0],
        uvScale: 0.8,
      }),
    );
  }
  if (opts.closedStringer !== false) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(steps * going, 0);
    shape.lineTo(steps * going, steps * rise);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geo.translate(0, 0, -width / 2);
    const wedge = new THREE.Mesh(geo, opts.stringerMaterial ?? mat('plankWall'));
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    g.add(wedge);
  }
  return g;
}

export interface RailOpts {
  height?: number;
  postSpacing?: number;
  postSize?: number;
  material?: THREE.Material;
  midRail?: boolean;
  /** Square balusters instead of widely spaced posts. */
  balusters?: boolean;
}

/** Post-and-rail guarding along a polyline of floor-level points. */
export function railing(points: THREE.Vector3[], opts: RailOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const h = opts.height ?? 0.95;
  const spacing = opts.postSpacing ?? 1.2;
  const size = opts.postSize ?? 0.12;
  const material = opts.material ?? mat('timberLight');

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const count = Math.max(1, Math.round(len / spacing));
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    for (let k = 0; k <= count; k++) {
      if (k === count && i < points.length - 2) continue;
      const t = k / count;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const pz = a.z + (b.z - a.z) * t;
      g.add(box(size, h, size, material, { pos: [px, py + h / 2, pz], rotY: -angle, uvScale: 0.5 }));
    }
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    const railLen = len + size;
    for (const ry of opts.midRail === false ? [h] : [h, h * 0.52]) {
      const rail = box(railLen, 0.075, 0.075, material, { uvScale: 0.6 });
      rail.position.set(mid.x, mid.y + ry, mid.z);
      rail.rotation.y = -angle;
      rail.rotation.z = pitch;
      g.add(rail);
    }
  }
  return g;
}

/** Framed picture hung flat against a wall; plane is local XY, facing +Z. */
export function framedPicture(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat('timberDark');
  const t = 0.06;
  g.add(box(w + 0.1, 0.07, t, frame, { pos: [0, h / 2 + 0.035, 0], uvScale: 0.4 }));
  g.add(box(w + 0.1, 0.07, t, frame, { pos: [0, -h / 2 - 0.035, 0], uvScale: 0.4 }));
  for (const s of [-1, 1]) g.add(box(0.07, h, t, frame, { pos: [s * (w / 2 + 0.035), 0, 0], uvScale: 0.4 }));
  const canvasPanel = box(w, h, 0.025, mat('painting'), { pos: [0, 0, 0.01], uvScale: Math.max(w, h) });
  g.add(canvasPanel);
  return g;
}

/** Two-candle iron wall bracket. Caller supplies the point light budget. */
export function sconce(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat('metalDark');
  g.add(box(0.09, 0.34, 0.05, iron, { pos: [0, 0, 0.025], uvScale: 0.25 }));
  for (const s of [-1, 1]) {
    const arm = box(0.26, 0.035, 0.035, iron, { pos: [s * 0.12, 0.1, 0.14], uvScale: 0.25 });
    arm.rotation.y = s * 0.35;
    g.add(arm);
    const cup = cylinder(0.035, 0.03, 6, iron, { pos: [s * 0.2, 0.12, 0.2] });
    g.add(cup);
  }
  return g;
}
