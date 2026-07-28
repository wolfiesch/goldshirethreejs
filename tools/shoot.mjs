#!/usr/bin/env node
/**
 * Deterministic screenshot harness.
 *
 * Every `?cam=` preset freezes the player, the clock and the animation phase
 * (main.ts: `player.frozen`, `autoAdvance && !camPreset`, `FROZEN_ELAPSED`), so
 * a shot of the canvas is reproducible byte-for-byte across runs. Only the
 * canvas is captured, never the HUD: the stats panel and the draw counter
 * change every frame and would defeat the comparison.
 *
 * Usage:
 *   node tools/shoot.mjs --out refs/before                 # every preset
 *   node tools/shoot.mjs --out /tmp/x road porch aerial    # a subset
 *   node tools/shoot.mjs --out /tmp/x 'night=nightSquare&time=21'
 *
 * A bare name is shot as `?cam=<name>`. A `label=query` pair is shot as
 * `?<query>` and written to `<label>.png`.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 5178;
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1280, height: 720 };

/** Presets shot by default, in the order they appear in main.ts. */
const DEFAULT_SHOTS = [
  'road', 'porch', 'hall', 'hearth', 'bar', 'stair', 'upstairs', 'cellar',
  'crossroads', 'signpost', 'smithy', 'aerial',
];

function parseArgs(argv) {
  const out = { dir: 'refs/before', shots: [], manifest: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out.dir = argv[++i];
    else if (argv[i] === '--no-manifest') out.manifest = false;
    else out.shots.push(argv[i]);
  }
  if (out.shots.length === 0) out.shots = DEFAULT_SHOTS;
  return out;
}

/** `name` -> {label, query}; `label=query` -> {label, query}. */
function toShot(spec) {
  const eq = spec.indexOf('=');
  // A bare `cam=foo` style spec has no label; treat the whole thing as query.
  if (eq === -1) return { label: spec, query: `cam=${spec}` };
  const label = spec.slice(0, eq);
  const query = spec.slice(eq + 1);
  if (query.includes('=')) return { label, query };
  // `time=21` — no label, the whole spec is the query.
  return { label: spec.replace(/[^a-z0-9]+/gi, '_'), query: spec };
}

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server never came up at ${url}`);
}

async function main() {
  const { dir, shots, manifest } = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, dir);
  await mkdir(outDir, { recursive: true });

  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += d));
  vite.stderr.on('data', (d) => (viteLog += d));

  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      // The page ships no favicon; its 404 is noise, not a regression.
      const from = `${m.text()} ${m.location()?.url ?? ''}`;
      if (m.type() === 'error' && !from.includes('favicon')) errors.push(m.text());
    });
    page.on('requestfailed', (r) => {
      if (!r.url().includes('favicon')) errors.push(`request failed: ${r.url()}`);
    });

    const hashes = {};
    for (const spec of shots) {
      const { label, query } = toShot(spec);
      const before = errors.length;
      await page.goto(`${BASE}/?${query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.__goldshire !== 'undefined', null, { timeout: 60000 });
      // Two extra steps: the first frame runs before shadow maps have been
      // rendered once, so a single frame can ship an unshadowed scene.
      await page.evaluate(() => {
        window.__goldshire.step(0);
        window.__goldshire.step(0);
      });
      // The HUD overlays the canvas, and an element screenshot captures
      // whatever is painted over the region. The stats panel shows a live FPS
      // graph, so leaving it visible makes every shot differ from every other.
      await page.addStyleTag({
        content: '#app > *:not(canvas[data-engine]) { visibility: hidden !important; }',
      });
      // `canvas[data-engine]` is the three.js drawing buffer; the other three
      // canvases on the page belong to the stats panel.
      const buf = await page.locator('canvas[data-engine]').screenshot();
      const file = path.join(outDir, `${label}.png`);
      await writeFile(file, buf);
      hashes[label] = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      const failed = errors.slice(before);
      console.log(
        `${label.padEnd(16)} ${hashes[label]} ${(buf.length / 1024).toFixed(0)}kB` +
          (failed.length ? `  ERRORS: ${failed.join(' | ')}` : ''),
      );
    }

    if (manifest) {
      await writeFile(path.join(outDir, 'hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
    }
    if (errors.length) {
      console.error(`\n${errors.length} page error(s):`);
      for (const e of errors) console.error(`  ${e}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err);
    console.error(`--- vite output ---\n${viteLog}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

/** `node tools/shoot.mjs --compare a b` prints per-shot identity. */
if (process.argv.includes('--compare')) {
  const [a, b] = process.argv.slice(process.argv.indexOf('--compare') + 1);
  const load = async (d) => JSON.parse(await readFile(path.resolve(ROOT, d, 'hashes.json'), 'utf8'));
  const [ha, hb] = await Promise.all([load(a), load(b)]);
  let same = 0;
  let diff = 0;
  for (const k of Object.keys(ha)) {
    const equal = ha[k] === hb[k];
    if (equal) same++;
    else diff++;
    console.log(`${equal ? 'same' : 'DIFF'}  ${k}`);
  }
  console.log(`\n${same} identical, ${diff} changed`);
  // Surface shots present in one set only.
  const extra = Object.keys(hb).filter((k) => !(k in ha));
  if (extra.length) console.log(`only in ${b}: ${extra.join(', ')}`);
  await readdir(path.resolve(ROOT, a));
} else {
  await main();
}
