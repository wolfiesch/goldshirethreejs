import type * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { getTime, setTime } from '../core/daynight';

export interface Hud {
  stats: Stats;
  setLockPrompt(visible: boolean): void;
  setAutoAdvance(on: boolean): void;
  syncTime(): void;
  update(renderer: THREE.WebGLRenderer, position: THREE.Vector3): void;
}

const HELP_TEXT = `
<b>Goldshire</b><br>
WASD / arrows — walk<br>
Shift — sprint<br>
Space — jump<br>
Mouse — look (click to lock)<br>
O — orbit camera (exterior review)<br>
T — toggle time auto-advance<br>
H — toggle this panel<br>
Esc — release mouse
`;

function panel(css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    color: '#e8e0cb',
    font: '12px/1.5 ui-monospace, Menlo, monospace',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(el.style, css);
  return el;
}

export function createHud(host: HTMLElement, opts: { showLockPrompt: boolean; autoAdvance: boolean }): Hud {
  const stats = new Stats();
  stats.dom.style.position = 'absolute';
  stats.dom.style.left = '8px';
  stats.dom.style.top = '8px';
  host.appendChild(stats.dom);

  const crosshair = panel({ left: '50%', top: '50%', width: '6px', height: '6px', marginLeft: '-3px', marginTop: '-3px', borderRadius: '50%', background: 'rgba(255,255,255,0.75)', boxShadow: '0 0 3px rgba(0,0,0,0.9)' });
  host.appendChild(crosshair);

  const readout = panel({ left: '8px', bottom: '8px', background: 'rgba(11,15,20,0.55)', padding: '6px 9px', borderRadius: '4px' });
  host.appendChild(readout);

  const help = panel({ right: '8px', top: '8px', background: 'rgba(11,15,20,0.62)', padding: '10px 13px', borderRadius: '4px', maxWidth: '260px' });
  help.innerHTML = HELP_TEXT;
  host.appendChild(help);

  const clock = panel({ right: '8px', bottom: '8px', background: 'rgba(11,15,20,0.62)', padding: '8px 11px', borderRadius: '4px', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '8px' });
  const clockLabel = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '24';
  slider.step = '0.1';
  slider.value = String(getTime());
  slider.style.width = '150px';
  slider.style.pointerEvents = 'auto';
  let autoAdvance = opts.autoAdvance;
  slider.addEventListener('input', () => {
    autoAdvance = false;
    setTime(Number(slider.value));
  });
  clock.appendChild(clockLabel);
  clock.appendChild(slider);
  host.appendChild(clock);

  const lockPrompt = panel({
    left: '50%',
    top: '58%',
    transform: 'translateX(-50%)',
    background: 'rgba(11,15,20,0.72)',
    padding: '14px 22px',
    borderRadius: '6px',
    font: '15px/1.4 ui-monospace, Menlo, monospace',
    letterSpacing: '0.04em',
  });
  lockPrompt.textContent = 'Click to play';
  lockPrompt.style.display = opts.showLockPrompt ? 'block' : 'none';
  host.appendChild(lockPrompt);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') help.style.display = help.style.display === 'none' ? 'block' : 'none';
  });

  let acc = 0;
  return {
    stats,
    setLockPrompt(visible) {
      lockPrompt.style.display = visible ? 'block' : 'none';
    },
    setAutoAdvance(on) {
      autoAdvance = on;
    },
    syncTime() {
      slider.value = String(getTime());
    },
    update(renderer, position) {
      const t = getTime();
      const hh = Math.floor(t);
      const mm = Math.floor((t - hh) * 60);
      clockLabel.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${autoAdvance ? ' >' : ''}`;
      if (autoAdvance) slider.value = String(t);
      acc++;
      if (acc % 12 === 0) {
        const info = renderer.info.render;
        readout.textContent =
          `draws ${info.calls}  tris ${info.triangles.toLocaleString('en-US')}  ` +
          `pos ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`;
      }
    },
  };
}
