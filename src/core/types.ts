/** Animation callback. Always written as a function of `elapsed` so that
 *  freezing the clock (the `?cam=` screenshot presets) yields a stable frame. */
export type TickFn = (dt: number, elapsed: number) => void;

export interface Tickable {
  tick: TickFn;
}
