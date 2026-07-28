/**
 * Dimensions shared by the inn shell, its two floors and its cellar. Kept in
 * its own module so `inn.ts` can import the floors without a cycle.
 *
 * All values are inn-local metres: origin at the centre of the main block's
 * footprint, ground at y = 0, long axis along X, porch facing +Z (south).
 */
export const INN = {
  halfX: 8.0,
  halfZ: 5.0,
  wallT: 0.6,
  innerX: 7.4,
  innerZ: 4.4,
  /** Ground-floor deck level. */
  floorG: 0.5,
  /** Ground-floor ceiling underside. */
  ceilG: 3.9,
  /** Upper-floor deck level. */
  floorU: 4.3,
  /**
   * Eaves plate. Deliberately below the plan's 7.2: the roof sags 0.33 m at
   * mid-span, so a 7.2 plate is cut through by its own roof there and the
   * shingles show from inside the upper hallway. 6.85 keeps the wall under
   * the roof surface everywhere, at the cost of 0.35 m of wall headroom.
   */
  eaves: 6.85,
  ridge: 12.4,
  /** Roof eave line, 1.0 m outboard of the long walls. */
  eaveY: 6.2,
  /** Flat collar ceiling over the upper floor. */
  collarY: 9.0,
  collarHalfZ: 1.75,
  cellarFloor: -2.5,
  cellarSoffit: 0.1,
} as const;

/** Cellar stairwell void cut through the ground-floor deck. */
export const CELLAR_WELL = { x0: -7.4, x1: -3.2, z0: 1.6, z1: 3.0 };

/** Main stairwell void cut through the upper-floor deck. */
export const STAIR_WELL = { x0: 5.8, x1: 7.4, z0: -2.2, z1: 3.6 };
