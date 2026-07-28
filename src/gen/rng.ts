/**
 * Deterministic randomness. Nothing in this project may call Math.random():
 * the world must be byte-identical across reloads so screenshots are comparable.
 */

export type Rng = () => number;
export type Noise2D = (x: number, y: number) => number;

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATTICE = 256;
const MASK = LATTICE - 1;

/** Bilinear-interpolated value noise over a 256x256 lattice; wraps every 256 units. */
export function valueNoise2D(rng: Rng): Noise2D {
  const lattice = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  return function sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = xi & MASK;
    const x1 = (xi + 1) & MASK;
    const y0 = (yi & MASK) * LATTICE;
    const y1 = ((yi + 1) & MASK) * LATTICE;
    const n00 = lattice[y0 + x0];
    const n10 = lattice[y0 + x1];
    const n01 = lattice[y1 + x0];
    const n11 = lattice[y1 + x1];
    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;
    return a + (b - a) * sy;
  };
}

/** Fractal Brownian motion over a value-noise sampler; result normalised to 0..1. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/** Uniform value in [lo, hi). */
export function range(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Integer in [lo, hi]. */
export function rangeInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Uniform element from a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Element from a weighted table; weights need not sum to 1. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Symmetric jitter: value +/- amount. */
export function jitter(rng: Rng, amount: number): number {
  return (rng() * 2 - 1) * amount;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hermite smoothstep; tolerates edge0 > edge1 (returns a falling ramp). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Poisson-disc sampling (Bridson) over an axis-aligned rectangle.
 * Deterministic given `rng`. Used for the forest ring and scatter props.
 */
export function poissonDisc(
  rng: Rng,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  minDist: number,
  tries = 20,
): Array<[number, number]> {
  const cell = minDist / Math.SQRT2;
  const cols = Math.ceil((maxX - minX) / cell);
  const rows = Math.ceil((maxZ - minZ) / cell);
  const grid = new Int32Array(cols * rows).fill(-1);
  const pts: Array<[number, number]> = [];
  const active: number[] = [];

  const insert = (x: number, z: number): number => {
    const idx = pts.length;
    pts.push([x, z]);
    const cx = Math.min(cols - 1, Math.floor((x - minX) / cell));
    const cz = Math.min(rows - 1, Math.floor((z - minZ) / cell));
    grid[cz * cols + cx] = idx;
    active.push(idx);
    return idx;
  };

  const fits = (x: number, z: number): boolean => {
    if (x < minX || x >= maxX || z < minZ || z >= maxZ) return false;
    const cx = Math.floor((x - minX) / cell);
    const cz = Math.floor((z - minZ) / cell);
    for (let j = Math.max(0, cz - 2); j <= Math.min(rows - 1, cz + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(cols - 1, cx + 2); i++) {
        const other = grid[j * cols + i];
        if (other < 0) continue;
        const p = pts[other];
        const dx = p[0] - x;
        const dz = p[1] - z;
        if (dx * dx + dz * dz < minDist * minDist) return false;
      }
    }
    return true;
  };

  insert(range(rng, minX, maxX), range(rng, minZ, maxZ));

  while (active.length > 0) {
    const ai = Math.floor(rng() * active.length);
    const seed = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < tries; t++) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist * (1 + rng());
      const x = seed[0] + Math.cos(angle) * dist;
      const z = seed[1] + Math.sin(angle) * dist;
      if (fits(x, z)) {
        insert(x, z);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(ai, 1);
  }

  return pts;
}
