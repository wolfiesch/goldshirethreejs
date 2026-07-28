import type * as THREE from 'three';

/**
 * The single source of truth for every world coordinate. No other module
 * hard-codes a world position: changing the village means editing this file.
 *
 * World contract: 1 unit = 1 metre, +X east, +Y up, +Z south (north is -Z).
 * The origin is the centre of the Goldshire crossroads at ground level.
 */

export type Vec2 = [number, number];

export interface PlacementSpec {
  id: string;
  pos: [number, number, number];
  rotY: number;
  /** Footprint (X x Z) consumed by the terrain flatness mask and foliage exclusion. */
  pad: [number, number];
}

export interface Placement extends PlacementSpec {
  build: () => THREE.Group;
}

/**
 * Inn orientation is a decision, not a verified fact: it sits in the NE
 * quadrant, long axis east-west, porch facing south onto the east-west road.
 * Porch front lands at z = -9.8 against a road edge at z = -5.5.
 */
export const PLACEMENTS: PlacementSpec[] = [
  { id: 'inn', pos: [20, 0, -18], rotY: 0, pad: [22, 20] },
  { id: 'smithy', pos: [-22, 0, 14], rotY: 0, pad: [16, 13] },
  { id: 'stable', pos: [44, 0, -14], rotY: 0, pad: [14, 10] },
  { id: 'cottageA', pos: [26, 0, 18], rotY: Math.PI, pad: [13, 11] },
  { id: 'cottageB', pos: [-48, 0, -11], rotY: Math.PI / 2, pad: [12, 10] },
  { id: 'roost', pos: [40, 0, -34], rotY: 0, pad: [9, 9] },
  { id: 'stall', pos: [-8, 0, 8], rotY: -0.35, pad: [6, 5] },
  { id: 'wagon', pos: [6, 0, 12], rotY: 1.1, pad: [6, 3] },
  { id: 'well', pos: [-44, 0, -4], rotY: 0, pad: [4, 4] },
  { id: 'signpost', pos: [-6, 0, -6], rotY: 0, pad: [1, 1] },
  { id: 'mailbox', pos: [14, 0, -10], rotY: -0.3, pad: [1, 1] },
];

export type RoadSurface = 'cobble' | 'dirt';

export interface RoadSegment {
  a: Vec2;
  b: Vec2;
  width: number;
  surface: RoadSurface;
}

export interface RoadRect {
  centre: Vec2;
  size: Vec2;
  surface: RoadSurface;
  /**
   * Bearing of the rect's long axis. `size` is measured in the rect's own
   * frame, so a forecourt meeting an oblique road turns with it rather than
   * growing a loose axis-aligned bounding box that over-flattens the terrain
   * on both diagonals.
   */
  rotY?: number;
}

/**
 * Road topology from the wiki: Stormwind/Northshire north, Westfall west,
 * Redridge east. Cobble across the junction apron and the first 20 m of each
 * arm beyond it, dirt further out.
 */
export const APRON: RoadRect = { centre: [0, 0], size: [34, 26], surface: 'cobble' };

/** Cobbled forecourt sweeping off the road up to the inn porch. */
export const INN_FORECOURT: RoadRect = { centre: [21.5, -7.6], size: [13, 6.4], surface: 'cobble' };

export const ROADS: RoadSegment[] = [
  // East-west road (Westfall <-> Redridge), centreline z = 0, width 11.
  { a: [-160, 0], b: [-37, 0], width: 11, surface: 'dirt' },
  { a: [-37, 0], b: [-16, 0], width: 11, surface: 'cobble' },
  { a: [16, 0], b: [37, 0], width: 11, surface: 'cobble' },
  { a: [37, 0], b: [160, 0], width: 11, surface: 'dirt' },
  // North road stem (to Stormwind / Northshire), centreline x = 0, width 9.
  { a: [0, -12], b: [0, -33], width: 9, surface: 'cobble' },
  { a: [0, -33], b: [0, -70], width: 9, surface: 'dirt' },
  // Fork at z = -70.
  { a: [0, -70], b: [-45, -160], width: 9, surface: 'dirt' },
  { a: [0, -70], b: [40, -160], width: 9, surface: 'dirt' },
];

/** 2.5 m dirt verge flanking every cobbled section. */
export const VERGE_WIDTH = 2.5;

export const LAKE = {
  centre: [132, 10] as Vec2,
  size: [60, 150] as Vec2,
  surfaceY: -0.35,
  bedY: -1.6,
  /** Terrain drops to `bedY` beyond `shoreEnd`, ramping from `shoreStart`. */
  shoreStart: 90,
  shoreEnd: 104,
};

/**
 * Rectangles where the ground plane must be removed entirely: anything with a
 * walkable room below grade. Without this the terrain sheet at y = 0 slices
 * straight through the inn's cellar and the player walks on it instead of the
 * cellar stair. Each rect is world-space [minX, minZ, maxX, maxZ] and is
 * covered from above by the building's plinth and floor deck.
 */
export const TERRAIN_VOIDS: Array<[number, number, number, number]> = [
  // Lion's Pride Inn cellar room, inn at (20, 0, -18), local X [-7.4, 0.6], Z [-3.0, 3.4].
  [12.6, -21.0, 20.6, -14.6],
];

export const FENCE_RUNS: Array<{ from: Vec2; to: Vec2 }> = [
  { from: [-70, -7], to: [-34, -7] },
  { from: [34, 7], to: [62, 7] },
  // Stable paddock, gate gap at (44, -8).
  { from: [34, -26], to: [54, -26] },
  { from: [54, -26], to: [54, -8] },
  { from: [54, -8], to: [45.5, -8] },
  { from: [42.5, -8], to: [34, -8] },
  { from: [34, -8], to: [34, -26] },
];

export const TORCH_POSTS: Vec2[] = [
  [-9, -9],
  [9, -9],
  [-9, 9],
  [9, 9],
];

/** Hand-placed specimen trees inside the clearing so the composition matches
 *  the references: dense treeline behind every building, a few big specimens
 *  standing in the open. */
export const SPECIMEN_TREES: Vec2[] = [
  [-14, -6], [-30, 2], [-38, -14], [-8, -30], [6, -34], [34, -6],
  [52, -24], [62, 4], [48, 20], [30, 32], [10, 30], [-6, 26],
  [-20, 28], [-36, 20], [-54, 8], [-58, -24], [-16, -40], [22, -44],
  [58, -40], [70, -10], [68, 24], [-66, -6],
];

export const BENCHES: Array<{ pos: Vec2; rotY: number }> = [
  { pos: [-11, 3], rotY: 0.2 },
  { pos: [12, 4], rotY: -0.35 },
];

export const SPAWN: [number, number, number] = [0, 1.8, 16];

/** Distance from a point to a road centreline segment, in metres. */
export function distanceToSegment(x: number, z: number, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const lenSq = abx * abx + abz * abz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lenSq));
  const px = a[0] + abx * t;
  const pz = a[1] + abz * t;
  return Math.hypot(x - px, z - pz);
}

/**
 * Signed inset: > 0 inside the rect, in metres from the nearest edge.
 *
 * `rotY` is the rect's own bearing, matching a placement's `rotY`. The query
 * point is rotated into the rect's frame before the abs, so `size` always
 * means the same thing whichever way the rect faces.
 */
export function insetInRect(x: number, z: number, centre: Vec2, size: Vec2, rotY = 0): number {
  let dx = x - centre[0];
  let dz = z - centre[1];
  if (rotY !== 0) {
    // Inverse of three.js's Y rotation, which sends local +X to (cos, 0, -sin).
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
  }
  return Math.min(size[0] / 2 - Math.abs(dx), size[1] / 2 - Math.abs(dz));
}

/** Rect-local offset -> world offset, the forward direction of the above. */
export function rotateOffset(lx: number, lz: number, rotY: number): Vec2 {
  if (rotY === 0) return [lx, lz];
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/**
 * How far inside flat ground a point is, in metres (negative = outside).
 * Roads and building pads are both flattened; terrain sits at exactly y = 0
 * under every road and every building.
 */
export function flatInset(x: number, z: number): number {
  let best = -Infinity;
  for (const r of ROADS) {
    best = Math.max(best, r.width / 2 - distanceToSegment(x, z, r.a, r.b));
  }
  for (const r of [APRON, INN_FORECOURT]) {
    best = Math.max(best, insetInRect(x, z, r.centre, r.size, r.rotY ?? 0));
  }
  for (const p of PLACEMENTS) {
    best = Math.max(best, insetInRect(x, z, [p.pos[0], p.pos[2]], p.pad, p.rotY));
  }
  return best;
}
