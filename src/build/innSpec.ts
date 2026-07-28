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
  /**
   * Roof eave line, at the outer edge of a 1.5 m overhang.
   *
   * This is derived, not chosen. The roof surface interpolates linearly from
   * `ridge` at z = 0 to `eaveY` at z = D, where D = halfZ + overhangZ, so the
   * wall face at z = halfZ samples it at v = halfZ / D. Deepening the overhang
   * raises D, which lowers v, which lifts the surface off the wall top:
   *
   *   D          = 5.0 + 1.5 = 6.5
   *   v_wall     = 5.0 / 6.5 = 0.7692
   *   sag_wall   = 0.45 + (0.30 - 0.45) * v_wall = 0.3346
   *   y_wall     = 12.4 + (eaveY - 12.4) * v_wall - sag_wall
   *
   * Holding y_wall at the 6.91 the old 1.0 m overhang produced, which clears
   * `eaves` by 6 cm, gives eaveY = 5.70. Left at 6.2 the underside would rise
   * to 7.30 and open a 45 cm slot of daylight along both long walls.
   */
  eaveY: 5.7,
  /** Flat collar ceiling over the upper floor. */
  collarY: 9.0,
  collarHalfZ: 1.75,
  cellarFloor: -2.5,
  cellarSoffit: 0.1,
} as const;

/**
 * The one description of the inn's roof surface. Two things read it: the roof
 * itself (`swaybackRoof`) and everything that has to tuck under the roof -
 * gable walls, rake trim, king posts - through `swaybackHeightFn`. They used to
 * be two hand-copied argument lists, so changing the overhang moved the
 * shingles without moving the gable that meets them.
 */
export const INN_ROOF = {
  /** Wall-to-wall length along the ridge. */
  spanX: 16.0,
  /** Wall-to-ridge half span across the slope. */
  halfDepth: INN.halfZ,
  ridgeY: INN.ridge,
  eaveY: INN.eaveY,
  /** Ridge overhang past each gable. */
  overhangX: 1.5,
  /** Eave overhang past each long wall. */
  overhangZ: 1.5,
  sagRidge: 0.45,
  sagEave: 0.3,
  /**
   * Upturn added over the outer 14% of each slope.
   *
   * 0.65 rather than the earlier 0.35 because below about 0.6 the flare only
   * slows the descent instead of reversing it: the slope loses 6.55 m of height
   * per unit v, and the quadratic gives back 2 * flare / 0.14 at the tip. Under
   * 0.46 the eave is still falling where it ends, which is a softened edge and
   * not the upward flick the references show.
   */
  flare: 0.65,
} as const;

/**
 * `INN_ROOF` as the positional argument list both `swaybackRoof` and
 * `swaybackHeightFn` take, so callers spread one value instead of retyping nine.
 */
export const INN_ROOF_ARGS = [
  INN_ROOF.spanX,
  INN_ROOF.halfDepth,
  INN_ROOF.ridgeY,
  INN_ROOF.eaveY,
  INN_ROOF.overhangX,
  INN_ROOF.overhangZ,
  INN_ROOF.sagRidge,
  INN_ROOF.sagEave,
  INN_ROOF.flare,
] as const;

/**
 * Footprint of the undercroft, in inn-local metres. It lives here rather than
 * in `innCellar.ts` because `layout.ts` derives the terrain void from it: a
 * hole hard-coded in world space detaches from the inn the moment the inn
 * moves, and the symptom is a grass floor inside the cellar rather than an
 * error anyone would notice.
 */
export const CELLAR_ROOM = { x0: -7.4, x1: 0.6, z0: -3.0, z1: 3.4 };

/** Cellar stairwell void cut through the ground-floor deck. */
export const CELLAR_WELL = { x0: -7.4, x1: -3.2, z0: 1.6, z1: 3.0 };

/** Main stairwell void cut through the upper-floor deck. */
export const STAIR_WELL = { x0: 5.8, x1: 7.4, z0: -2.2, z1: 3.6 };
