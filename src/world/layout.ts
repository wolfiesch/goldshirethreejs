import type * as THREE from 'three';
import { CELLAR_ROOM } from '../build/innSpec';
import { type Rng, range } from '../gen/rng';

/**
 * The single source of truth for every world coordinate. No other module
 * hard-codes a world position: changing the village means editing this file.
 *
 * World contract: 1 unit = 1 metre, +X east, +Y up, +Z south (north is -Z).
 * The origin is the centre of the Goldshire crossroads at ground level.
 *
 * Positions come from the vanilla client's own data rather than from memory:
 * `WorldMapArea.dbc` for the coordinate rectangle, the Classic world database
 * for spawn positions, and orthographic minimap tiles at roughly 1 px per yard
 * for the roads and footprints. World units are already yards, and the frame
 * below is that data rotated onto the junction:
 *
 *     sceneX = 68 - worldY        sceneZ = -worldX - 9487
 *
 * Road bearings measured off `refs/map/gs_zoom_marked.png` by walking circles
 * of road pixels around the junction: 271 degrees west, 120 degrees east,
 * 5 degrees north to the fork, then 321 and 23 out of it.
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
 * Both roof-bearing buildings sit north of the road with their long axis
 * east-west, which the minimap gives directly: the roof blobs there measure
 * 88 and 90 degrees.
 *
 * The 59 x 33 m blob at (49.3, -21.1) is not one building. The minimap cannot
 * separate adjoining blue roofs, so it merges the inn, the stable and a
 * neighbour into a single mass; growing the inn to fill it would mean
 * re-authoring three hand-fitted interiors. The authored 16 x 10 m inn keeps
 * its dimensions and takes the centroid, and the stable takes Erma's spawn at
 * the blob's west end, so the pair spans the blob instead of one lie filling it.
 *
 * The east road leaves the junction at 120 degrees, east *and* south, so the
 * inn ends up about 40 m back from it. That gap is not an error: it is the
 * common that everyone stands in.
 */
export const PLACEMENTS: PlacementSpec[] = [
  { id: 'inn', pos: [49.3, 0, -21.1], rotY: 0, pad: [22, 20] },
  { id: 'stable', pos: [19.9, 0, -21.0], rotY: 0, pad: [14, 10] },
  // Forge marker at (-26.2, -27.0); the forge sits at inn-local (-2.6, -0.4).
  { id: 'smithy', pos: [-26.0, 0, -27.0], rotY: 0, pad: [16, 13] },
  { id: 'cottageA', pos: [-8.0, 0, 30.0], rotY: Math.PI, pad: [13, 11] },
  { id: 'cottageB', pos: [-46.0, 0, 17.0], rotY: Math.PI / 2, pad: [12, 10] },
  { id: 'roost', pos: [18.0, 0, -48.0], rotY: 0, pad: [9, 9] },
  // Remy's pitch, just off the south verge.
  { id: 'stall', pos: [-4.8, 0, 9.3], rotY: -0.35, pad: [6, 5] },
  // Tharynn Bouden's cart.
  { id: 'wagon', pos: [-15.9, 0, 8.2], rotY: 1.1, pad: [6, 3] },
  { id: 'well', pos: [-41.0, 0, -14.0], rotY: 0, pad: [4, 4] },
  { id: 'signpost', pos: [1.0, 0, 13.1], rotY: 0, pad: [1, 1] },
  // Second board where the north road splits for Stormwind and Northshire.
  { id: 'signpostFork', pos: [11.0, 0, -53.0], rotY: -0.25, pad: [1, 1] },
  { id: 'mailbox', pos: [22.2, 0, -31.0], rotY: -0.3, pad: [1, 1] },
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
 * Goldshire is a three-way, not a crossroads: Westfall west, Redridge east,
 * Stormwind and Northshire sharing a stem north that forks 56 m out. Cobble
 * across the junction apron and the first stretch of each arm, dirt beyond.
 */
export const APRON: RoadRect = { centre: [0, 0], size: [34, 26], surface: 'cobble' };

/** Cobbled forecourt sweeping off the inn track up to the porch steps. */
export const INN_FORECOURT: RoadRect = { centre: [50.0, -10.7], size: [18, 6.4], surface: 'cobble' };

export const ROADS: RoadSegment[] = [
  // West to Westfall, bearing 271 degrees: within 3 m of due west over the
  // whole run, so it stays on z = 0 and the arithmetic stays legible.
  { a: [-160, 0], b: [-37, 0], width: 11, surface: 'dirt' },
  { a: [-37, 0], b: [-16, 0], width: 11, surface: 'cobble' },
  // East to Redridge, bearing 120 degrees.
  { a: [16.0, 9.2], b: [32.0, 18.5], width: 11, surface: 'cobble' },
  { a: [32.0, 18.5], b: [166.3, 96.0], width: 11, surface: 'dirt' },
  // North stem, bearing 5 degrees to the fork at (4.5, -56).
  { a: [1.0, -12.5], b: [2.7, -33.0], width: 9, surface: 'cobble' },
  { a: [2.7, -33.0], b: [4.5, -56.0], width: 9, surface: 'dirt' },
  // Fork: Stormwind at 321 degrees, Northshire at 23.
  { a: [4.5, -56.0], b: [-83.8, -165.0], width: 9, surface: 'dirt' },
  { a: [4.5, -56.0], b: [50.8, -165.0], width: 9, surface: 'dirt' },
  // Track across the common from the junction to the inn forecourt. The
  // minimap shows the worn ground; without it the inn has no approach.
  { a: [0, 0], b: [43.0, -10.5], width: 8, surface: 'dirt' },
];

/** 2.5 m dirt verge flanking every cobbled section. */
export const VERGE_WIDTH = 2.5;

/**
 * Crystal Lake. The minimap puts its west shore about 130 m east of the
 * junction and its body north of the east road, which is why the road can run
 * to the map edge without ever crossing water.
 */
export const LAKE = {
  centre: [148, -55] as Vec2,
  size: [46, 170] as Vec2,
  surfaceY: -0.35,
  bedY: -1.6,
  /** Terrain drops to `bedY` beyond `shoreEnd`, ramping from `shoreStart`. */
  shoreStart: 116,
  shoreEnd: 130,
};

/**
 * Rectangles where the ground plane must be removed entirely: anything with a
 * walkable room below grade. Without this the terrain sheet at y = 0 slices
 * straight through the inn's cellar and the player walks on it instead of the
 * cellar stair. Each rect is world-space [minX, minZ, maxX, maxZ] and is
 * covered from above by the building's plinth and floor deck.
 *
 * Derived from the placement rather than typed. A literal rect tracks the inn
 * only until someone moves the inn, and then the cellar quietly grows a lawn.
 */
export const TERRAIN_VOIDS: Array<[number, number, number, number]> = [voidUnder('inn', CELLAR_ROOM)];

/** World-space bounds of a building-local rect, including its rotation. */
function voidUnder(id: string, room: { x0: number; x1: number; z0: number; z1: number }): [number, number, number, number] {
  const p = placementById(id);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of [
    [room.x0, room.z0],
    [room.x1, room.z0],
    [room.x1, room.z1],
    [room.x0, room.z1],
  ] as Vec2[]) {
    const [ox, oz] = rotateOffset(lx, lz, p.rotY);
    minX = Math.min(minX, p.pos[0] + ox);
    maxX = Math.max(maxX, p.pos[0] + ox);
    minZ = Math.min(minZ, p.pos[2] + oz);
    maxZ = Math.max(maxZ, p.pos[2] + oz);
  }
  return [minX, minZ, maxX, maxZ];
}

export const FENCE_RUNS: Array<{ from: Vec2; to: Vec2 }> = [
  // North verge of the west road, running out of town.
  { from: [-72, -9], to: [-38, -9] },
  // South verge of the west road. Nothing crosses the inn's approach: a rail
  // there reads as a barricade from every shot that matters.
  { from: [-66, 9], to: [-38, 9] },
  // Stable paddock between the shed and the inn, gate gap at (31, -14).
  { from: [28, -30], to: [37, -30] },
  { from: [37, -30], to: [37, -14] },
  { from: [37, -14], to: [32.5, -14] },
  { from: [29.5, -14], to: [28, -14] },
  { from: [28, -14], to: [28, -30] },
];

/** One per gap between road arms, standing on the apron's dirt shoulder. */
export const TORCH_POSTS: Vec2[] = [
  [-9.5, -9.5],
  [8.5, -10.5],
  [-9.5, 10.5],
  [-1.5, 14.5],
];

export const SPAWN: [number, number, number] = [-4, 1.8, 15];

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

/** Placement lookup that fails loudly; a typo would otherwise scatter at the origin. */
export function placementById(id: string): PlacementSpec {
  const found = PLACEMENTS.find((p) => p.id === id);
  if (!found) throw new Error(`no placement "${id}" in PLACEMENTS`);
  return found;
}

/**
 * Metres of clearance a scattered prop keeps from every road polygon and every
 * building pad. This used to be a sentence at the top of the prop tables,
 * asserted over 63 hand-typed positions and checked by nobody; below it is the
 * rule the sampler actually obeys.
 */
export const PROP_CLEARANCE = 1.6;

export interface RingSample {
  pos: Vec2;
  /** Unit vector from the pad centre out to the sample, in world space. */
  outward: Vec2;
}

/**
 * One position on the ring just outside a building pad, sampled in the pad's
 * own frame so a rotated building keeps its clutter along its walls instead of
 * inside them. Null when the sample landed somewhere it may not; callers loop.
 */
export function padRing(rng: Rng, pad: PlacementSpec, near: number, far: number): RingSample | null {
  const a = range(rng, 0, Math.PI * 2);
  const lx = Math.cos(a) * (pad.pad[0] / 2 + range(rng, near, far));
  const lz = Math.sin(a) * (pad.pad[1] / 2 + range(rng, near, far));
  const [ox, oz] = rotateOffset(lx, lz, pad.rotY);
  const x = pad.pos[0] + ox;
  const z = pad.pos[2] + oz;
  if (flatInset(x, z) > -PROP_CLEARANCE) return null;
  const len = Math.hypot(ox, oz) || 1;
  return { pos: [x, z], outward: [ox / len, oz / len] };
}

/**
 * `count` ring samples spread over the named pads, weighted by how often each
 * id appears in `pads`. Deterministic given `rng`, and it gives up rather than
 * spinning forever when a pad is boxed in by its neighbours.
 */
export function scatterAround(rng: Rng, pads: string[], count: number, near: number, far: number): RingSample[] {
  const specs = pads.map(placementById);
  const out: RingSample[] = [];
  // Each pass reaches further out. A pad hemmed in by a road would otherwise
  // quietly place fewer props than asked for, and a silent shortfall reads as
  // "the scatter is sparse here" rather than "the sampler gave up".
  for (let pass = 0; out.length < count && pass < 4; pass++) {
    const reach = far * (pass + 1);
    for (let guard = 0; out.length < count && guard < count * 80; guard++) {
      const spec = specs[Math.min(specs.length - 1, Math.floor(rng() * specs.length))];
      const sample = padRing(rng, spec, near, reach);
      if (sample) out.push(sample);
    }
  }
  return out;
}
