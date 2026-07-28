// Layout invariants, checked against the modules that ship rather than by eye.
// Run: node tools/lint-layout.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const vite = spawn('npx', ['vite', '--port', '5179', '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
await new Promise((res) => {
  vite.stdout.on('data', (d) => {
    if (String(d).includes('ready in') || String(d).includes('Local:')) res();
  });
  setTimeout(res, 6000);
});

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
page.on('console', (m) => console.log(m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await page.goto('http://localhost:5179/tools/lint-layout.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await browser.close();
vite.kill();
