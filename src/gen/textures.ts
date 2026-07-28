import * as THREE from 'three';
import { fbm, jitter, makeRng, pickWeighted, range, rangeInt, valueNoise2D, type Noise2D, type Rng } from './rng';

/**
 * Every texture in the world is painted here at runtime. No image files, no
 * downloaded art. Each generator gets its own seeded Rng so adding a texture
 * never shifts the appearance of the others.
 */

export type TexKey =
  | 'plaster'
  | 'timberDark'
  | 'timberLight'
  | 'shingleBlue'
  | 'stoneBlock'
  | 'cobble'
  | 'dirt'
  | 'grass'
  | 'plankFloor'
  | 'plankWall'
  | 'brick'
  | 'carvedStone'
  | 'thatch'
  | 'leadedGlass'
  | 'bark'
  | 'leafCard'
  | 'coneCard'
  | 'rugRed'
  | 'clothRed'
  | 'hay'
  | 'painting'
  | 'waterSurf'
  | 'noticeBoard'
  | 'softDot'
  | 'flameCard'
  | 'cobwebNet'
  | 'smoke'
  | 'parchment';

const SIZE = 512;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

interface Surface {
  canvas: AnyCanvas;
  ctx: CanvasRenderingContext2D;
}

function surface(w = SIZE, h = SIZE): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  return { canvas, ctx };
}

/** Draws `paint` at (x,y) plus every wrapped copy, so scattered detail tiles seamlessly. */
function wrapped(ctx: CanvasRenderingContext2D, x: number, y: number, reach: number, paint: (px: number, py: number) => void): void {
  paint(x, y);
  const left = x - reach < 0;
  const right = x + reach > SIZE;
  const top = y - reach < 0;
  const bottom = y + reach > SIZE;
  if (left) paint(x + SIZE, y);
  if (right) paint(x - SIZE, y);
  if (top) paint(x, y + SIZE);
  if (bottom) paint(x, y - SIZE);
  if (left && top) paint(x + SIZE, y + SIZE);
  if (right && top) paint(x - SIZE, y + SIZE);
  if (left && bottom) paint(x + SIZE, y - SIZE);
  if (right && bottom) paint(x - SIZE, y - SIZE);
}

/** Per-pixel lightness modulation from tiling fbm. `amount` is a fraction (0.06 = +/-6%). */
function mottle(ctx: CanvasRenderingContext2D, noise: Noise2D, scale: number, amount: number, octaves = 4): void {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(noise, (x / SIZE) * scale, (y / SIZE) * scale, octaves) * 2 - 1;
      const f = 1 + n * amount;
      const i = (y * SIZE + x) * 4;
      d[i] = Math.min(255, d[i] * f);
      d[i + 1] = Math.min(255, d[i + 1] * f);
      d[i + 2] = Math.min(255, d[i + 2] * f);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** `#rrggbb` shifted in lightness by `f` (1 = unchanged). */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function fill(ctx: CanvasRenderingContext2D, color: string, w = SIZE, h = SIZE): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/** Vertical wood grain running the full height, used by every timber variant. */
function woodGrain(ctx: CanvasRenderingContext2D, rng: Rng, streaks: number, from: string, to: string, x0: number, x1: number): void {
  ctx.save();
  ctx.lineWidth = 1.4;
  for (let i = 0; i < streaks; i++) {
    const x = range(rng, x0, x1);
    ctx.strokeStyle = rng() < 0.5 ? from : to;
    ctx.globalAlpha = range(rng, 0.18, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    let cx = x;
    for (let y = 0; y <= SIZE; y += 32) {
      cx += jitter(rng, 3.2);
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function knots(ctx: CanvasRenderingContext2D, rng: Rng, count: number, color: string, x0: number, x1: number, maxR = 9): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = range(rng, x0, x1);
    const y = range(rng, 0, SIZE);
    const r = range(rng, maxR * 0.45, maxR);
    wrapped(ctx, x, y, r * 2.2, (px, py) => {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.55, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.55 + ring * 2.4, r + ring * 3.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const GENERATORS: Record<TexKey, (s: Surface, rng: Rng, noise: Noise2D) => void> = {
  plaster(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#e8e0cb');
    mottle(ctx, noise, 5, 0.06);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = '#cfc6ae';
      ctx.globalAlpha = range(rng, 0.15, 0.45);
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const r = range(rng, 0.7, 2.4);
      wrapped(ctx, x, y, r + 1, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#b3a98f';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      let x = rng() * SIZE;
      let y = rng() * SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = rangeInt(rng, 4, 9);
      for (let k = 0; k < steps; k++) {
        x += jitter(rng, 26);
        y += range(rng, 6, 30);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  timberDark(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#4a3524');
    mottle(ctx, noise, 7, 0.09);
    woodGrain(ctx, rng, 40, '#3a2818', '#5c4430', 0, SIZE);
    knots(ctx, rng, 6, '#2c1d12', 0, SIZE);
    const grad = ctx.createLinearGradient(0, 0, SIZE * 0.06, 0);
    grad.addColorStop(0, 'rgba(106,82,56,0.85)');
    grad.addColorStop(1, 'rgba(106,82,56,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE * 0.06, SIZE);
  },

  timberLight(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#8a6a44');
    mottle(ctx, noise, 7, 0.09);
    woodGrain(ctx, rng, 40, '#6f5334', '#a58156', 0, SIZE);
    knots(ctx, rng, 6, '#5a3f24', 0, SIZE);
    const grad = ctx.createLinearGradient(0, 0, SIZE * 0.06, 0);
    grad.addColorStop(0, 'rgba(196,166,124,0.8)');
    grad.addColorStop(1, 'rgba(196,166,124,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE * 0.06, SIZE);
  },

  shingleBlue(s, rng) {
    const { ctx } = s;
    const rows = 8;
    const cols = 12;
    const rowH = SIZE / rows;
    const colW = SIZE / cols;
    fill(ctx, '#22405c');
    const palette = ['#3f6f9c', '#4a7fae', '#35608a', '#5d92bf'];
    const weights = [40, 30, 20, 10];
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = r % 2 === 0 ? 0 : -colW * 0.5;
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const roll = rng();
        let color = pickWeighted(rng, palette, weights);
        // Sparse accents only: a bright fleck rate above ~1% reads as snow.
        if (roll < 0.012) color = '#74a3c8';
        else if (roll < 0.03) color = '#b08c40';
        const w = colW - 1.5;
        const h = rowH - 1.5;
        const lip = h * 0.34;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - lip);
        ctx.quadraticCurveTo(x + w * 0.5, y + h + lip * 0.55, x, y + h - lip);
        ctx.closePath();
        ctx.fill();
        // Weathering along the exposed butt.
        const g = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
        g.addColorStop(0, 'rgba(20,38,56,0)');
        g.addColorStop(1, 'rgba(20,38,56,0.45)');
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
  },

  stoneBlock(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#5d5a53');
    const rows = 5;
    const rowH = SIZE / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const stagger = (r % 2) * 0.5;
      let x = -stagger * (SIZE / 4);
      while (x < SIZE) {
        const w = range(rng, SIZE / 5.6, SIZE / 3.2);
        const f = 1 + jitter(rng, 0.08);
        ctx.fillStyle = shade('#8e8b83', f);
        ctx.fillRect(x + 1.5, y + 1.5, w - 3, rowH - 3);
        // chiselled top-left highlight, shadowed bottom-right
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 1.5, y + 1.5, w - 3, 2.5);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(x + 1.5, y + rowH - 4, w - 3, 2.5);
        x += w;
      }
    }
    mottle(ctx, noise, 11, 0.07);
  },

  cobble(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#6a6459');
    const cols = 10;
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * (SIZE / cols) + jitter(rng, SIZE / cols * 0.22);
        const cy = (r + 0.5) * (SIZE / rows) + jitter(rng, SIZE / rows * 0.22);
        const rx = (SIZE / cols) * range(rng, 0.4, 0.54);
        const ry = (SIZE / rows) * range(rng, 0.4, 0.54);
        const sides = rangeInt(rng, 6, 9);
        const radii: number[] = [];
        for (let i = 0; i < sides; i++) radii.push(range(rng, 0.82, 1.0));
        const tone = shade('#a09a8d', 1 + jitter(rng, 0.1));
        wrapped(ctx, cx, cy, Math.max(rx, ry) + 4, (px, py) => {
          ctx.beginPath();
          for (let i = 0; i <= sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            const k = radii[i % sides];
            const vx = px + Math.cos(a) * rx * k;
            const vy = py + Math.sin(a) * ry * k;
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          ctx.fillStyle = tone;
          ctx.fill();
          ctx.strokeStyle = 'rgba(60,56,48,0.55)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        });
      }
    }
    mottle(ctx, noise, 6, 0.05);
    // dirt wash blotches
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#8a7a5f';
    for (let i = 0; i < 26; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const r = range(rng, 18, 58);
      wrapped(ctx, x, y, r + 2, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  },

  dirt(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#8a6b47');
    mottle(ctx, noise, 4, 0.1);
    for (let i = 0; i < 34; i++) {
      ctx.globalAlpha = range(rng, 0.12, 0.3);
      ctx.fillStyle = rng() < 0.5 ? '#6f5334' : '#a08059';
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const r = range(rng, 24, 78);
      wrapped(ctx, x, y, r + 2, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 200; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const r = range(rng, 1, 3.4);
      const tone = shade('#7d6b55', 1 + jitter(rng, 0.22));
      wrapped(ctx, x, y, r + 2, (px, py) => {
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  grass(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#5c7f38');
    mottle(ctx, noise, 4, 0.12);
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#4a6b2c' : '#74954a';
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const r = range(rng, 26, 84);
      wrapped(ctx, x, y, r + 2, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 600; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const len = range(rng, 4, 11);
      const lean = jitter(rng, 3.5);
      const tone = shade(rng() < 0.5 ? '#456b26' : '#7ba648', 1 + jitter(rng, 0.12));
      wrapped(ctx, x, y, len + 4, (px, py) => {
        ctx.strokeStyle = tone;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + lean * 0.5, py - len * 0.6, px + lean, py - len);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 30; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const tone = rng() < 0.6 ? '#e8d84a' : '#d8607a';
      wrapped(ctx, x, y, 5, (px, py) => {
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(px, py, range(rng, 1.4, 2.4), 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  plankFloor(s, rng, noise) {
    plankBoards(s, rng, noise, '#a67c4a', '#5a3f22', false);
  },

  plankWall(s, rng, noise) {
    plankBoards(s, rng, noise, '#7d5c38', '#4c3620', true);
  },

  brick(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#7d6a58');
    const courses = 12;
    const rowH = SIZE / courses;
    for (let r = 0; r < courses; r++) {
      const y = r * rowH;
      const offset = (r % 2) * -0.5;
      const brickW = SIZE / 5;
      for (let c = -1; c <= 5; c++) {
        const x = (c + offset) * brickW;
        ctx.fillStyle = shade('#a3462f', 1 + jitter(rng, 0.1));
        ctx.fillRect(x + 1, y + 1, brickW - 2, rowH - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 1, y + 1, brickW - 2, 1.6);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(x + 1, y + rowH - 3, brickW - 2, 1.8);
      }
    }
    mottle(ctx, noise, 9, 0.07);
  },

  carvedStone(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#cfc6b0');
    const rows = 4;
    const rowH = (SIZE - 64) / rows;
    for (let r = 0; r < rows; r++) {
      const y = 64 + r * rowH;
      let x = (r % 2) * -60;
      while (x < SIZE) {
        const w = range(rng, SIZE / 4.4, SIZE / 2.8);
        ctx.fillStyle = shade('#cfc6b0', 1 + jitter(rng, 0.05));
        ctx.fillRect(x + 2, y + 2, w - 4, rowH - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x + 2, y + 2, w - 4, 2);
        ctx.fillStyle = 'rgba(90,82,66,0.22)';
        ctx.fillRect(x + 2, y + rowH - 4, w - 4, 2);
        x += w;
      }
    }
    // Scrolled-vine relief band along the top edge, shaded to read as carved.
    ctx.fillStyle = '#c6bca4';
    ctx.fillRect(0, 0, SIZE, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 60, SIZE, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, SIZE, 3);
    for (let pass = 0; pass < 2; pass++) {
      // pass 0 = shadow offset down, pass 1 = highlight offset up
      const dy = pass === 0 ? 1.6 : -1.4;
      ctx.strokeStyle = pass === 0 ? 'rgba(96,86,66,0.75)' : 'rgba(255,252,240,0.75)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 4) {
        const y = 32 + Math.sin((x / SIZE) * Math.PI * 6) * 14 + dy;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * (SIZE / 12);
        const y = 32 + Math.sin((x / SIZE) * Math.PI * 6) * 14 + dy;
        ctx.beginPath();
        ctx.arc(x, y + (i % 2 === 0 ? -11 : 11), 7.5, 0, Math.PI * 1.75);
        ctx.stroke();
      }
    }
    mottle(ctx, noise, 12, 0.04);
  },

  thatch(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#b39555');
    mottle(ctx, noise, 6, 0.08);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const len = range(rng, 8, 22);
      const a = range(rng, 1.0, 1.5);
      const tone = shade(rng() < 0.5 ? '#8d7038' : '#d1b473', 1 + jitter(rng, 0.1));
      wrapped(ctx, x, y, len + 3, (px, py) => {
        ctx.strokeStyle = tone;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      });
    }
    const g = ctx.createLinearGradient(0, SIZE * 0.82, 0, SIZE);
    g.addColorStop(0, 'rgba(52,40,18,0)');
    g.addColorStop(1, 'rgba(52,40,18,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, SIZE * 0.82, SIZE, SIZE * 0.18);
  },

  leadedGlass(s) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const cols = 6;
    const rows = 8;
    const cw = SIZE / cols;
    const rh = SIZE / rows;
    ctx.fillStyle = 'rgba(207,227,236,0.55)';
    ctx.strokeStyle = '#2a3a30';
    ctx.lineWidth = 3;
    for (let r = -1; r <= rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const cx = (c + 0.5) * cw;
        const cy = (r + 0.5) * rh;
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh * 0.5);
        ctx.lineTo(cx + cw * 0.5, cy);
        ctx.lineTo(cx, cy + rh * 0.5);
        ctx.lineTo(cx - cw * 0.5, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  },

  bark(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#7a5f42');
    mottle(ctx, noise, 8, 0.13);
    for (let i = 0; i < 30; i++) {
      const x = rng() * SIZE;
      const w = range(rng, 4, 13);
      ctx.fillStyle = shade('#4e3a26', 1 + jitter(rng, 0.14));
      ctx.globalAlpha = range(rng, 0.4, 0.85);
      wrapped(ctx, x, SIZE / 2, w + 6, (px) => {
        ctx.beginPath();
        ctx.moveTo(px, 0);
        let cx = px;
        for (let y = 0; y <= SIZE; y += 26) {
          cx += jitter(rng, 4);
          ctx.lineTo(cx, y);
        }
        for (let y = SIZE; y >= 0; y -= 26) {
          cx -= jitter(rng, 3);
          ctx.lineTo(cx + w, y);
        }
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#9a7c58';
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const y = rng() * SIZE;
      const x = rng() * SIZE;
      const len = range(rng, 5, 16);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + jitter(rng, 1.5));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  leafCard(s, rng) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const tones = ['#4d7a2e', '#5f8f38', '#3d6425', '#7ba648'];
    // Bias leaves toward a rounded blob so the crossed cards read as a canopy.
    for (let i = 0; i < 140; i++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * SIZE * 0.46;
      const x = SIZE / 2 + Math.cos(a) * rad;
      const y = SIZE / 2 + Math.sin(a) * rad * 0.9;
      const rx = range(rng, 26, 58);
      const ry = rx * range(rng, 0.5, 0.78);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
      ctx.globalAlpha = range(rng, 0.82, 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = range(rng, 0.2, 0.4);
      ctx.strokeStyle = '#2f4f1c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.lineTo(rx, 0);
      ctx.stroke();
      ctx.restore();
    }
  },

  coneCard(s, rng) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const tones = ['#2f5326', '#274a20', '#3b6630', '#1f3d1a'];
    // Downward-drooping conifer skirt: dense at the top, tapering to a point.
    for (let i = 0; i < 190; i++) {
      const t = rng();
      const halfWidth = SIZE * 0.48 * t;
      const x = SIZE / 2 + (rng() * 2 - 1) * halfWidth;
      const y = 24 + t * (SIZE - 48);
      const len = range(rng, 20, 46) * (0.45 + t * 0.7);
      const droop = range(rng, 0.35, 0.8);
      ctx.strokeStyle = tones[Math.floor(rng() * tones.length)];
      ctx.lineWidth = range(rng, 4, 9);
      ctx.lineCap = 'round';
      ctx.globalAlpha = range(rng, 0.85, 1);
      const dir = x < SIZE / 2 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dir * len * 0.6, y + len * droop * 0.4, x + dir * len, y + len * droop);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  rugRed(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#8e2b26');
    mottle(ctx, noise, 8, 0.07);
    const b = 40;
    ctx.fillStyle = '#d9b45c';
    ctx.fillRect(0, 0, SIZE, b);
    ctx.fillRect(0, SIZE - b, SIZE, b);
    ctx.fillRect(0, 0, b, SIZE);
    ctx.fillRect(SIZE - b, 0, b, SIZE);
    ctx.strokeStyle = '#8e2b26';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= SIZE; x += 20) {
      const y = x % 40 === 0 ? 12 : 28;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let x = 0; x <= SIZE; x += 20) {
      const y = SIZE - (x % 40 === 0 ? 12 : 28);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20, SIZE - (x % 40 === 0 ? 28 : 12));
    }
    ctx.stroke();
    ctx.strokeStyle = '#d9b45c';
    ctx.lineWidth = 6;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-96, -96, 192, 192);
    ctx.strokeRect(-58, -58, 116, 116);
    ctx.restore();
    ctx.fillStyle = '#d9b45c';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(rng() * SIZE, rng() * SIZE, range(rng, 2, 8), range(rng, 1, 3));
    }
  },

  clothRed(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#a83a2c');
    mottle(ctx, noise, 5, 0.1);
    ctx.fillStyle = '#7a281c';
    ctx.fillRect(0, 0, SIZE, 6);
    ctx.fillRect(0, SIZE - 6, SIZE, 6);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
      ctx.fillRect(rng() * SIZE, rng() * SIZE, range(rng, 3, 22), 1.4);
    }
    ctx.globalAlpha = 1;
  },

  hay(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#c8a94e');
    mottle(ctx, noise, 6, 0.09);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 500; i++) {
      const x = rng() * SIZE;
      const y = rng() * SIZE;
      const len = range(rng, 8, 26);
      const a = rng() * Math.PI * 2;
      const tone = shade(rng() < 0.5 ? '#a4863a' : '#e2c877', 1 + jitter(rng, 0.1));
      wrapped(ctx, x, y, len + 3, (px, py) => {
        ctx.strokeStyle = tone;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      });
    }
  },

  waterSurf(s) {
    const { ctx } = s;
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = (x / SIZE) * Math.PI * 2;
        const v = (y / SIZE) * Math.PI * 2;
        const w =
          Math.sin(u * 3 + v * 2) * 0.5 +
          Math.sin(u * 5 - v * 4) * 0.3 +
          Math.sin(u * 11 + v * 9) * 0.2;
        const t = (w + 1) * 0.5;
        const i = (y * SIZE + x) * 4;
        d[i] = 62 + (127 - 62) * t;
        d[i + 1] = 109 + (182 - 109) * t;
        d[i + 2] = 132 + (201 - 132) * t;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  noticeBoard(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#6a4d2e');
    mottle(ctx, noise, 7, 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 5; i++) ctx.fillRect(0, (i * SIZE) / 5 - 2, SIZE, 4);
    woodGrain(ctx, rng, 26, '#583e24', '#7f5e3a', 0, SIZE);
    const notes: Array<[number, number, number, number]> = [
      [40, 46, 170, 130],
      [270, 30, 180, 160],
      [60, 250, 200, 150],
      [300, 270, 150, 190],
    ];
    for (const [x, y, w, h] of notes) {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(jitter(rng, 0.07));
      ctx.fillStyle = '#e3d8ba';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(120,102,70,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#463525';
      ctx.lineWidth = 2.2;
      const lines = Math.floor(h / 18);
      for (let l = 0; l < lines; l++) {
        const ly = -h / 2 + 14 + l * 16;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 10, ly);
        let cx = -w / 2 + 10;
        while (cx < w / 2 - range(rng, 12, 50)) {
          const step = range(rng, 6, 16);
          cx += step;
          ctx.lineTo(cx, ly + jitter(rng, 1.6));
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#5a4a38';
      ctx.beginPath();
      ctx.arc(0, -h / 2 + 8, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  softDot(s) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },

  /**
   * Teardrop flame with a white core. A plain radial dot reads as a glow blob;
   * a tapered silhouette is what makes an additive quad read as fire.
   */
  flameCard(s, _rng, noise) {
    const { ctx } = s;
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    for (let y = 0; y < SIZE; y++) {
      // v: 0 at the base of the flame, 1 at the tip.
      const v = 1 - y / SIZE;
      const taper = Math.pow(Math.max(0, 1 - v), 0.62);
      const foot = Math.min(1, v / 0.06);
      for (let x = 0; x < SIZE; x++) {
        const u = (x / SIZE - 0.5) * 2;
        // Licking edges: perturb the silhouette with a little noise.
        const wobble = 1 + (fbm(noise, v * 5, u * 2, 3) - 0.5) * 0.35;
        const halfWidth = Math.max(1e-4, 0.52 * taper * foot * wobble);
        const dist = Math.abs(u) / halfWidth;
        const i = (y * SIZE + x) * 4;
        if (dist >= 1) {
          d[i + 3] = 0;
          continue;
        }
        // sqrt keeps the body full instead of pinching to a thin spike.
        const core = Math.pow(1 - dist * dist, 0.55);
        // White at the base and centre, orange toward the tip and the edges.
        const heat = Math.max(0, core * (1 - v * 0.85));
        d[i] = 255;
        d[i + 1] = Math.round(110 + 145 * heat);
        d[i + 2] = Math.round(20 + 200 * heat * heat);
        d[i + 3] = Math.round(255 * core * (0.55 + 0.45 * (1 - v)));
      }
    }
    ctx.putImageData(img, 0, 0);
  },

/** Corner web: radial guys plus catch spiral, transparent everywhere else. */
  cobwebNet(s) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6;
    const cx = 0;
    const cy = 0;
    const spokes = 11;
    for (let i = 0; i < spokes; i++) {
      const a = (i / (spokes - 1)) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * SIZE * 1.45, cy + Math.sin(a) * SIZE * 1.45);
      ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    for (let ring = 1; ring <= 14; ring++) {
      const r = (ring / 14) * SIZE * 1.02;
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a = (i / (spokes - 1)) * (Math.PI / 2);
        const sagR = r * (0.9 + 0.1 * Math.cos((i / (spokes - 1)) * Math.PI * 2));
        const px = cx + Math.cos(a) * sagR;
        const py = cy + Math.sin(a) * sagR;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  },

  smoke(s, rng) {
    const { ctx } = s;
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * SIZE * 0.24;
      const x = SIZE / 2 + Math.cos(a) * rad;
      const y = SIZE / 2 + Math.sin(a) * rad;
      const r = range(rng, SIZE * 0.12, SIZE * 0.26);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.30)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  parchment(s, rng, noise) {
    const { ctx } = s;
    fill(ctx, '#e3d8ba');
    mottle(ctx, noise, 6, 0.06);
    ctx.strokeStyle = 'rgba(120,102,70,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, SIZE - 8, SIZE - 8);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#8a7047';
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc(rng() * SIZE, rng() * SIZE, range(rng, 10, 42), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  /** A dim Elwynn landscape, enough to stop framed pictures reading as blanks. */
  painting(s, rng, noise) {
    const { ctx } = s;
    const sky = ctx.createLinearGradient(0, 0, 0, SIZE * 0.62);
    sky.addColorStop(0, '#7d9dc0');
    sky.addColorStop(1, '#d8c79a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, SIZE, SIZE * 0.62);
    ctx.fillStyle = '#5c7f38';
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    ctx.lineTo(0, SIZE * 0.6);
    for (let x = 0; x <= SIZE; x += 16) {
      ctx.lineTo(x, SIZE * 0.6 + Math.sin(x * 0.012) * 18 + fbm(noise, x * 0.01, 0, 3) * 26);
    }
    ctx.lineTo(SIZE, SIZE);
    ctx.closePath();
    ctx.fill();
    // Rolling hills receding into haze.
    for (let band = 0; band < 3; band++) {
      ctx.fillStyle = ['#6f8f7a', '#8ba590', '#a8bcaa'][band];
      ctx.globalAlpha = 0.55 - band * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, SIZE * 0.62);
      for (let x = 0; x <= SIZE; x += 24) {
        ctx.lineTo(x, SIZE * (0.42 + band * 0.05) + Math.sin(x * 0.008 + band) * 22);
      }
      ctx.lineTo(SIZE, SIZE * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Tree silhouettes on the near ridge.
    for (let i = 0; i < 9; i++) {
      const x = range(rng, 20, SIZE - 20);
      const y = SIZE * 0.66 + range(rng, -18, 40);
      const h = range(rng, 45, 105);
      ctx.fillStyle = '#3d5c28';
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.6, h * 0.34, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(x - h * 0.05, y - h * 0.35, h * 0.1, h * 0.4);
    }
    mottle(ctx, noise, 9, 0.05);
    const vign = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.72);
    vign.addColorStop(0, 'rgba(60,44,26,0)');
    vign.addColorStop(1, 'rgba(60,44,26,0.45)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Aged varnish wash: raw greens read as a lit screen on a dark wall.
    ctx.fillStyle = 'rgba(152,128,88,0.38)';
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
};

/** Shared plank painter for `plankFloor` (horizontal) and `plankWall` (vertical). */
function plankBoards(s: Surface, rng: Rng, noise: Noise2D, base: string, gap: string, vertical: boolean): void {
  const { ctx } = s;
  fill(ctx, gap);
  const count = 10;
  const step = SIZE / count;
  ctx.save();
  if (vertical) {
    ctx.translate(SIZE, 0);
    ctx.rotate(Math.PI / 2);
  }
  for (let i = 0; i < count; i++) {
    const y = i * step;
    ctx.fillStyle = shade(base, 1 + jitter(rng, 0.07));
    ctx.fillRect(0, y + 1, SIZE, step - 2);
    // grain along the plank
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + 1, SIZE, step - 2);
    ctx.clip();
    ctx.lineWidth = 1.1;
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = rng() < 0.5 ? shade(base, 0.86) : shade(base, 1.12);
      ctx.globalAlpha = range(rng, 0.2, 0.5);
      const gy = y + range(rng, 2, step - 3);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      let cy = gy;
      for (let x = 0; x <= SIZE; x += 40) {
        cy += jitter(rng, 1.4);
        ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const kx = range(rng, 20, SIZE - 20);
      const ky = y + range(rng, 4, step - 4);
      const r = range(rng, 2.6, 5.2);
      ctx.fillStyle = shade(base, 0.62);
      ctx.beginPath();
      ctx.ellipse(kx, ky, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(base, 0.74);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 1.9, r * 1.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // board edge shading
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, y + 1, SIZE, 1.6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, y + step - 3, SIZE, 2);
  }
  ctx.restore();
  mottle(ctx, noise, 5, 0.05);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TEX_SEED: Record<TexKey, number> = {
  plaster: 1001,
  timberDark: 1002,
  timberLight: 1003,
  shingleBlue: 1004,
  stoneBlock: 1005,
  cobble: 1006,
  dirt: 1007,
  grass: 1008,
  plankFloor: 1009,
  plankWall: 1010,
  brick: 1011,
  carvedStone: 1012,
  thatch: 1013,
  leadedGlass: 1014,
  bark: 1015,
  leafCard: 1016,
  coneCard: 1017,
  rugRed: 1018,
  clothRed: 1019,
  hay: 1020,
  waterSurf: 1021,
  noticeBoard: 1022,
  softDot: 1023,
  flameCard: 1027,
  cobwebNet: 1028,
  smoke: 1024,
  parchment: 1025,
  painting: 1026,
};

const canvasCache = new Map<TexKey, AnyCanvas>();
const texCache = new Map<string, THREE.CanvasTexture>();

/** The painted canvas for a key, memoised so N repeat variants share one bitmap upload. */
export function texCanvas(key: TexKey): AnyCanvas {
  let canvas = canvasCache.get(key);
  if (!canvas) {
    const s = surface();
    const rng = makeRng(TEX_SEED[key]);
    GENERATORS[key](s, rng, valueNoise2D(makeRng(TEX_SEED[key] ^ 0x5f3a)));
    canvas = s.canvas;
    canvasCache.set(key, canvas);
  }
  return canvas;
}

export function tex(key: TexKey, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const id = `${key}:${repeatX}:${repeatY}`;
  let t = texCache.get(id);
  if (!t) {
    t = new THREE.CanvasTexture(texCanvas(key) as HTMLCanvasElement);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
    texCache.set(id, t);
  }
  return t;
}

/** One-off signage: serif text baked into its own texture (signpost arms, banners). */
export function textTexture(text: string, w = 256, h = 64, bg = '#8a6a44', fg = '#2c1d12'): THREE.CanvasTexture {
  const s = surface(w, h);
  const { ctx } = s;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(text.length * 977 + text.charCodeAt(0) * 31);
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#6f5334';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + jitter(rng, 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(h * 0.5)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1, w * 0.88);
  const t = new THREE.CanvasTexture(s.canvas as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
