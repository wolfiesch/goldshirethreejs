import * as THREE from 'three';
import { MeshBVHHelper } from 'three-mesh-bvh';
import {
  getTime,
  initDayNight,
  setShadowFollowPoint,
  setTime,
  updateDayNight,
} from './core/daynight';
import { buildCollider } from './core/collision';
import { EYE_HEIGHT, createPlayer } from './core/controls';
import { createRenderer } from './core/renderer';
import { createSky } from './core/sky';
import { windUniforms } from './gen/materials';
import { createHud } from './ui/hud';
import { LAYOUT } from './world/buildings';
import { SPAWN } from './world/layout';
import { buildWorld } from './world/world';

/** Named camera poses used for review and screenshot verification. */
const CAM_PRESETS: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  road: { pos: [19.0, 2.6, 6.0], look: [21.0, 6.5, -13.0] },
  porch: { pos: [19.5, 1.9, -3.5], look: [19.6, 4.6, -12.5] },
  hall: { pos: [21.5, 2.2, -14.6], look: [14.5, 1.6, -21.0] },
  hearth: { pos: [17.0, 1.7, -19.6], look: [12.8, 2.0, -19.0] },
  bar: { pos: [21.0, 1.7, -16.2], look: [18.5, 1.35, -22.0] },
  stair: { pos: [17.0, 1.7, -16.5], look: [26.5, 2.5, -18.0] },
  upstairs: { pos: [26.2, 6.0, -15.0], look: [13.5, 5.7, -15.5] },
  cellar: { pos: [13.2, -1.5, -18.0], look: [20.4, -1.85, -18.0] },
  crossroads: { pos: [12.0, 2.2, 2.0], look: [-20.0, 2.0, -1.0] },
  // Close enough to read the arm boards; `crossroads` is the wide establishing shot.
  signpost: { pos: [-2.4, 2.0, -2.9], look: [-6.4, 1.85, -6.3] },
  smithy: { pos: [-14.0, 2.0, 6.0], look: [-22.0, 3.5, 14.0] },
  aerial: { pos: [-40, 60, 70], look: [6, 0, -8] },
};

const INN_CENTRE = new THREE.Vector3(20, 3, -18);
/** Frozen animation phase for the `?cam=` presets, so screenshots are stable. */
const FROZEN_ELAPSED = 3.7;

const host = document.getElementById('app');
if (!host) throw new Error('#app host element missing');
host.style.position = 'absolute';
host.style.inset = '0';

const params = new URLSearchParams(location.search);
const camPreset = params.get('cam');
const timeParam = params.get('time');
const wireframe = params.get('wire') === '1';
const showCollider = params.get('collider') === '1';

const { renderer, camera, scene } = createRenderer(host);

const sky = createSky();
scene.add(sky.group);

const sun = new THREE.DirectionalLight(0xffffff, 1.4);
const hemi = new THREE.HemisphereLight(0xa8cef0, 0x55552f, 0.85);
scene.add(sun, hemi);
initDayNight(scene, sun, hemi, sky);

let autoAdvance = true;
if (timeParam !== null) {
  setTime(Number(timeParam));
  autoAdvance = false;
} else {
  setTime(13);
}

const world = buildWorld();
scene.add(world.root);

const collider = buildCollider(world.root);
scene.add(collider);
if (showCollider) {
  const helper = new MeshBVHHelper(collider, 12);
  helper.userData.collide = false;
  scene.add(helper);
}

if (wireframe) {
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const one of Array.isArray(m) ? m : [m]) {
      if ('wireframe' in one) (one as THREE.MeshLambertMaterial).wireframe = true;
    }
  });
}

const player = createPlayer(camera, renderer.domElement, INN_CENTRE);
player.teleport(SPAWN[0], SPAWN[1], SPAWN[2]);
camera.lookAt(INN_CENTRE.x - 6, 4, INN_CENTRE.z);

const hud = createHud(host, { showLockPrompt: camPreset === null, autoAdvance });
hud.setAutoAdvance(autoAdvance);

if (camPreset) {
  const preset = CAM_PRESETS[camPreset];
  if (!preset) throw new Error(`unknown cam preset "${camPreset}" (have: ${Object.keys(CAM_PRESETS).join(', ')})`);
  player.frozen = true;
  camera.position.set(preset.pos[0], preset.pos[1], preset.pos[2]);
  camera.lookAt(preset.look[0], preset.look[1], preset.look[2]);
  player.position.set(preset.pos[0], preset.pos[1] - EYE_HEIGHT, preset.pos[2]);
  hud.setLockPrompt(false);
} else {
  renderer.domElement.addEventListener('click', () => {
    if (!player.orbitMode) player.controls.lock();
  });
  player.controls.addEventListener('lock', () => hud.setLockPrompt(false));
  player.controls.addEventListener('unlock', () => hud.setLockPrompt(true));
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (camPreset) return;
  if (e.code === 'KeyO') {
    player.orbitMode = !player.orbitMode;
    player.orbit.enabled = player.orbitMode;
    if (player.orbitMode) {
      player.controls.unlock();
      const dir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
      camera.position.copy(INN_CENTRE).addScaledVector(dir, 45);
      player.orbit.target.copy(INN_CENTRE);
      player.orbit.update();
      hud.setLockPrompt(false);
    } else {
      camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
      hud.setLockPrompt(true);
    }
  }
  if (e.code === 'KeyT') {
    autoAdvance = !autoAdvance;
    hud.setAutoAdvance(autoAdvance);
  }
});

const clock = new THREE.Clock();
let elapsed = 0;

/**
 * One simulation + render step. Split out of the RAF callback so the first
 * frame is guaranteed even when the tab is backgrounded and RAF is throttled,
 * and so screenshot verification can drive frames deterministically.
 */
function step(dt: number): void {
  elapsed += dt;
  const animTime = camPreset ? FROZEN_ELAPSED : elapsed;

  updateDayNight(dt, autoAdvance && !camPreset);
  player.update(dt, collider);

  const eye = camPreset ? camera.position : player.position;
  setShadowFollowPoint(eye);
  windUniforms.time.value = animTime;

  for (const tick of world.tickables) tick(camPreset ? 0 : dt, animTime);

  // Interior point lights only matter when the player is near the inn.
  const nearInn = eye.distanceTo(INN_CENTRE) < 30;
  for (const light of world.interiorLights) light.visible = nearInn;

  if (!camPreset && player.position.y < -20) player.teleport(SPAWN[0], SPAWN[1], SPAWN[2]);

  renderer.render(scene, camera);
  hud.stats.update();
  hud.update(renderer, camPreset ? camera.position : player.position);
}

function frame(): void {
  step(Math.min(clock.getDelta(), 0.1));
  requestAnimationFrame(frame);
}

step(0);
clock.getDelta();
requestAnimationFrame(frame);

declare global {
  interface Window {
    __goldshire: {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
      setTime: (h: number) => void;
      getTime: () => number;
      LAYOUT: typeof LAYOUT;
      collider: THREE.Mesh;
      player: typeof player;
      step: (dt: number) => void;
      THREE: typeof THREE;
    };
  }
}

window.__goldshire = { scene, camera, renderer, setTime, getTime, LAYOUT, collider, player, step, THREE };
