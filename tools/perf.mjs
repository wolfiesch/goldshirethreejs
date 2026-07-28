// Frame cost per preset, read off the running page rather than estimated.
//
// The HUD reports draw calls and triangles for the scene rather than for the
// composer's final blit, because `renderer.info.autoReset` is off and the
// counters are reset at the top of `step()`. Frame time is measured here from
// requestAnimationFrame deltas after a warm-up, with the median reported: a
// mean is dominated by the first few frames, which are still compiling shaders.
//
// Run: node tools/perf.mjs [preset ...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 5181;
const shots = process.argv.slice(2);
const presets = shots.length ? shots : ['aerial', 'crossroads', 'road', 'nightSquare'];

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'pipe',
});
await new Promise((res) => {
  vite.stdout.on('data', (d) => {
    if (String(d).includes('ready in') || String(d).includes('Local:')) res();
  });
  setTimeout(res, 6000);
});

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const preset of presets) {
  await page.goto(`http://localhost:${PORT}/?cam=${preset}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
  await page.waitForTimeout(2500);
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        let last = performance.now();
        let n = 0;
        const tick = () => {
          const now = performance.now();
          if (n > 20) frames.push(now - last);
          last = now;
          n++;
          if (frames.length < 120) requestAnimationFrame(tick);
          else {
            frames.sort((a, b) => a - b);
            const text = document.querySelectorAll('div');
            let readout = '';
            for (const d of text) {
              if (d.textContent && d.textContent.startsWith('draws ')) readout = d.textContent;
            }
            resolve({ median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)], readout });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const counts = result.readout.replace(/ pos .*/, '') || 'no HUD readout';
  console.log(`${preset.padEnd(14)} ${result.median.toFixed(2)} ms median  ${result.p95.toFixed(2)} ms p95   ${counts}`);
}

await browser.close();
vite.kill();
