import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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

interface CamPreset {
  pos: [number, number, number];
  look: [number, number, number];
  /**
   * Placement id this pose is measured against. With an anchor, `pos` and
   * `look` are building-local metres, so the shot keeps its framing when the
   * building moves or turns. Without one they are world coordinates.
   */
  anchor?: string;
}

/**
 * Named camera poses used for review and screenshot verification. These are the
 * measuring instrument for every visual change, so they are anchored to
 * placements rather than to the world wherever a placement is what the shot is
 * actually of.
 *
 * The five world-anchored road shots (`crossroads`, `eseRoad`, `fork`,
 * `lakeShore`, `nightSquare`) are of the road network and the clearing, which
 * are not placements; they are re-aimed by hand whenever `ROADS` moves.
 */
const CAM_PRESETS: Record<string, CamPreset> = {
  road: { anchor: 'inn', pos: [-1.0, 2.6, 24.0], look: [1.0, 6.5, 5.0] },
  porch: { anchor: 'inn', pos: [-0.5, 1.9, 14.5], look: [-0.4, 4.6, 5.5] },
  hall: { anchor: 'inn', pos: [1.5, 2.2, 3.4], look: [-5.5, 1.6, -3.0] },
  hearth: { anchor: 'inn', pos: [-3.0, 1.7, -1.6], look: [-7.2, 2.0, -1.0] },
  bar: { anchor: 'inn', pos: [1.0, 1.7, 1.8], look: [-1.5, 1.35, -4.0] },
  stair: { anchor: 'inn', pos: [-3.0, 1.7, 1.5], look: [6.5, 2.5, 0.0] },
  upstairs: { anchor: 'inn', pos: [6.2, 6.0, 3.0], look: [-6.5, 5.7, 2.5] },
  cellar: { anchor: 'inn', pos: [-6.8, -1.5, 0.0], look: [0.4, -1.85, 0.0] },
  crossroads: { pos: [12.0, 2.2, 2.0], look: [-20.0, 2.0, -1.0] },
  // Close enough to read the arm boards; `crossroads` is the wide establishing shot.
  signpost: { anchor: 'signpost', pos: [3.6, 2.0, 3.1], look: [-0.4, 1.85, -0.3] },
  smithy: { anchor: 'smithy', pos: [8.0, 2.0, -8.0], look: [0.0, 3.5, 0.0] },
  aerial: { pos: [-40, 60, 70], look: [6, 0, -8] },
  // Inside the shed, past the anvil, onto the forge and its flue.
  smithyInterior: { anchor: 'smithy', pos: [3.8, 1.7, 2.2], look: [-2.6, 1.5, -0.4] },
  eseRoad: { pos: [42.0, 2.3, 1.5], look: [4.0, 2.6, -2.0] },
  fork: { pos: [4.0, 2.4, -58.0], look: [-4.0, 2.6, -76.0] },
  lakeShore: { pos: [92.0, 2.4, 8.0], look: [126.0, 0.0, 12.0] },
  nightSquare: { pos: [16.0, 2.6, 16.0], look: [-10.0, 4.0, -10.0] },
};

const UP = new THREE.Vector3(0, 1, 0);

function placement(id: string): (typeof LAYOUT)[number] {
  const found = LAYOUT.find((p) => p.id === id);
  if (!found) throw new Error(`no placement "${id}" in LAYOUT`);
  return found;
}

/** Anchor-local pose -> world pose. Unanchored presets pass through unchanged. */
function resolvePreset(preset: CamPreset): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const pos = new THREE.Vector3(...preset.pos);
  const look = new THREE.Vector3(...preset.look);
  if (preset.anchor) {
    const place = placement(preset.anchor);
    const origin = new THREE.Vector3(place.pos[0], place.pos[1], place.pos[2]);
    for (const v of [pos, look]) v.applyAxisAngle(UP, place.rotY).add(origin);
  }
  return { pos, look };
}

/**
 * Pivot for the orbit camera and the gate for the inn's interior point lights.
 * Derived from the placement: hard-coding it means the taproom goes dark the
 * moment the inn moves.
 */
const INN_CENTRE = (() => {
  const inn = placement('inn');
  return new THREE.Vector3(inn.pos[0], inn.pos[1] + 3, inn.pos[2]);
})();
/** Frozen animation phase for the `?cam=` presets, so screenshots are stable. */
const FROZEN_ELAPSED = 3.7;
/** Beyond this, an interior point light is switched off rather than uploaded. */
const LIGHT_CULL = 30;

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

/**
 * Bloom on the forge, the lit windows and the torches, as the references show.
 *
 * `OutputPass` is not optional. The composer's buffers are linear half-float,
 * so without a pass that applies the renderer's colour space at the end the
 * frame reaches the canvas unencoded and the whole scene washes out.
 *
 * The threshold is a luminance cut and it has to clear sunlit plaster, which
 * lands near 1.5 at the current sun and hemisphere intensities. Rather than
 * hunt for a threshold that separates a lit window from a white wall - there
 * isn't one - everything meant to glow is driven well above that ceiling in
 * `materials.ts`. Note that the cut is luminance, not brightness: the forge's
 * near-pure red needs roughly three times the drive of a warm window to pass.
 */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 1.55),
);
composer.addPass(new OutputPass());

// The composer renders several passes per frame. Left on auto, `info` resets
// at each of them and the HUD reports the output pass's single draw call
// instead of the scene's, which makes it useless as a budget instrument.
renderer.info.autoReset = false;

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
  const { pos, look } = resolvePreset(preset);
  player.frozen = true;
  camera.position.copy(pos);
  camera.lookAt(look);
  player.position.set(pos.x, pos.y - EYE_HEIGHT, pos.z);
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
  composer.setSize(window.innerWidth, window.innerHeight);
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
  renderer.info.reset();
  elapsed += dt;
  const animTime = camPreset ? FROZEN_ELAPSED : elapsed;

  updateDayNight(dt, autoAdvance && !camPreset);
  player.update(dt, collider);

  const eye = camPreset ? camera.position : player.position;
  setShadowFollowPoint(eye);
  windUniforms.time.value = animTime;

  for (const tick of world.tickables) tick(camPreset ? 0 : dt, animTime);

  /*
   * Interior point lights cull against their own position, not the inn's.
   * three.js uploads every visible light to every material's uniform arrays,
   * so a light costs shader work on every lit fragment in the frame whether or
   * not anything near it is on screen. Gating the lot on one building meant
   * the smithy forge either lit the whole world or went out indoors.
   */
  for (const light of world.interiorLights) {
    light.visible = eye.distanceToSquared(light.userData.worldPos as THREE.Vector3) < LIGHT_CULL * LIGHT_CULL;
  }

  if (!camPreset && player.position.y < -20) player.teleport(SPAWN[0], SPAWN[1], SPAWN[2]);

  composer.render();
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
      groundY: (x: number, z: number) => number;
      THREE: typeof THREE;
    };
  }
}

window.__goldshire = {
  scene,
  camera,
  renderer,
  setTime,
  getTime,
  LAYOUT,
  collider,
  player,
  step,
  groundY: world.groundY,
  THREE,
};
