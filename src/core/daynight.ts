import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../gen/rng';

/**
 * Single owner of world time. Sky colour, fog, sun/hemisphere lighting, every
 * lit window and every torch read from here. Nothing animates its own emissive.
 */

export interface NightEmissive {
  material: THREE.MeshLambertMaterial;
  day: number;
  night: number;
}

export interface NightLight {
  light: THREE.PointLight;
  night: number;
}

/** A flame card that is only alight after dark. Basic materials have no emissive. */
export interface NightFlame {
  material: THREE.Material;
  night: number;
}

export interface SkyTarget {
  setColors(zenith: THREE.Color, horizon: THREE.Color): void;
  setSun(direction: THREE.Vector3, elevation: number): void;
}

interface Keyframe {
  t: number;
  zenith: number;
  horizon: number;
  fog: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogDensity: number;
}

/**
 * Palette keyframes; `t` in hours. Interpolated cyclically, 20 -> 24 wraps to
 * the t=0 row.
 *
 * Elwynn is a closed-canopy forest, so daylight arrives filtered rather than
 * straight off an open sky: the hemisphere is green, the ground bounce is warm
 * olive off grass and leaf litter, and the distance haze is green-grey. A pure
 * sky-blue hemisphere and blue fog read as open moorland, which is the single
 * largest reason the clearing looked like the wrong continent.
 *
 * The zeniths stay blue. What sky you do see through the canopy is still sky.
 */
const KEYS: Keyframe[] = [
  { t: 0, zenith: 0x0a1020, horizon: 0x1b2740, fog: 0x121c26, sunColor: 0x8fa8d0, sunIntensity: 0.12, hemiSky: 0x2e4a5e, hemiGround: 0x1c2216, hemiIntensity: 0.42, fogDensity: 0.011 },
  { t: 5, zenith: 0x2c3f66, horizon: 0xc98a5e, fog: 0x7d7a63, sunColor: 0xe0a070, sunIntensity: 0.58, hemiSky: 0x66836e, hemiGround: 0x2e2c1c, hemiIntensity: 0.6, fogDensity: 0.009 },
  { t: 8, zenith: 0x5f92cd, horizon: 0xbcd3e6, fog: 0xb2c7a8, sunColor: 0xfff2d8, sunIntensity: 1.4, hemiSky: 0xb6cfa6, hemiGround: 0x7c7844, hemiIntensity: 0.83, fogDensity: 0.0055 },
  { t: 13, zenith: 0x3f7fd0, horizon: 0xc6d9bb, fog: 0xbdd2ae, sunColor: 0xfff4d4, sunIntensity: 1.6, hemiSky: 0xbcd6a8, hemiGround: 0x8a8248, hemiIntensity: 0.88, fogDensity: 0.0042 },
  { t: 18, zenith: 0x4a6fae, horizon: 0xe2a367, fog: 0xb59a72, sunColor: 0xffc487, sunIntensity: 1.0, hemiSky: 0x8ba888, hemiGround: 0x4c4526, hemiIntensity: 0.72, fogDensity: 0.0068 },
  { t: 20, zenith: 0x1d2b4c, horizon: 0x8a5a52, fog: 0x424a44, sunColor: 0xa88a90, sunIntensity: 0.32, hemiSky: 0x4f6a63, hemiGround: 0x2a2820, hemiIntensity: 0.52, fogDensity: 0.0095 },
];

const emissives: NightEmissive[] = [];
const nightLights: NightLight[] = [];
const nightFlames: NightFlame[] = [];

let time = 13;
let sceneRef: THREE.Scene | null = null;
let sunRef: THREE.DirectionalLight | null = null;
let hemiRef: THREE.HemisphereLight | null = null;
let skyRef: SkyTarget | null = null;

const sunTarget = new THREE.Object3D();
const sunDirection = new THREE.Vector3(0, 1, 0);
const followPoint = new THREE.Vector3();

const zenithColor = new THREE.Color();
const horizonColor = new THREE.Color();
const fogColor = new THREE.Color();
const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

let sunElevation = 1;
let nightFactor = 0;

export function setTime(hours: number): void {
  time = ((hours % 24) + 24) % 24;
}

export function getTime(): number {
  return time;
}

export function getNightFactor(): number {
  return nightFactor;
}

export function getSunDirection(): THREE.Vector3 {
  return sunDirection;
}

export function registerNightEmissive(material: THREE.MeshLambertMaterial, day: number, night: number): void {
  emissives.push({ material, day, night });
}

/** Outdoor torches: intensity scales with darkness so they cost nothing at noon. */
export function registerNightLight(light: THREE.PointLight, night: number): void {
  nightLights.push({ light, night });
}

/**
 * The flame card that goes with such a light. The cresset's point light was
 * already scaled by darkness, but the card was not, so a torch at noon threw
 * no light and still burned, and burned brightly enough to trip the bloom
 * threshold. The forge keeps the always-lit material: it is worked all day.
 */
export function registerNightFlame(material: THREE.Material, night: number): void {
  nightFlames.push({ material, night });
}

/** The point the shadow frustum tracks; main.ts feeds the player position here. */
export function setShadowFollowPoint(p: THREE.Vector3): void {
  followPoint.copy(p);
}

export function initDayNight(
  scene: THREE.Scene,
  sun: THREE.DirectionalLight,
  hemi: THREE.HemisphereLight,
  sky?: SkyTarget,
): void {
  sceneRef = scene;
  sunRef = sun;
  hemiRef = hemi;
  skyRef = sky ?? null;

  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -55;
  cam.right = 55;
  cam.top = 55;
  cam.bottom = -55;
  cam.near = 1;
  cam.far = 260;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.target = sunTarget;
  scene.add(sunTarget);
}

function sampleKeys(t: number): { a: Keyframe; b: Keyframe; f: number } {
  const first = KEYS[0];
  const last = KEYS[KEYS.length - 1];
  if (t < first.t) {
    // wrap segment: last key (20h) -> first key (24h == 0h)
    const span = 24 - last.t + first.t;
    return { a: last, b: first, f: (t + 24 - last.t) / span };
  }
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (t >= a.t && t <= b.t) return { a, b, f: (t - a.t) / (b.t - a.t) };
  }
  const span = 24 - last.t + first.t;
  return { a: last, b: first, f: (t - last.t) / span };
}

/** Auto-advance runs at one in-game hour per 20 real seconds. */
export function updateDayNight(dt: number, autoAdvance: boolean): void {
  if (autoAdvance) setTime(time + dt / 20);

  const { a, b, f } = sampleKeys(time);

  const hourAngle = ((time - 6) / 24) * Math.PI * 2;
  // Peak elevation is capped at ~55 degrees. A true overhead noon leaves every
  // vertical facade lit only by the blue hemisphere, which reads cold and grey;
  // a lower arc puts warm sun on the walls and lengthens the shadows.
  const sinEl = Math.sin(hourAngle) * 0.82;
  sunElevation = sinEl;
  const el = Math.asin(clamp(sinEl, -1, 1));
  const az = ((time - 6) / 12) * Math.PI;
  const cosEl = Math.cos(el);
  sunDirection.set(Math.cos(az) * cosEl, sinEl, Math.sin(az) * cosEl).normalize();

  nightFactor = smoothstep(0.15, -0.05, sunElevation);

  zenithColor.lerpColors(scratchA.setHex(a.zenith, THREE.SRGBColorSpace), scratchB.setHex(b.zenith, THREE.SRGBColorSpace), f);
  horizonColor.lerpColors(scratchA.setHex(a.horizon, THREE.SRGBColorSpace), scratchB.setHex(b.horizon, THREE.SRGBColorSpace), f);
  fogColor.lerpColors(scratchA.setHex(a.fog, THREE.SRGBColorSpace), scratchB.setHex(b.fog, THREE.SRGBColorSpace), f);

  if (sceneRef?.fog instanceof THREE.FogExp2) {
    sceneRef.fog.color.copy(fogColor);
    sceneRef.fog.density = lerp(a.fogDensity, b.fogDensity, f);
  }
  if (sceneRef) sceneRef.background = fogColor;

  if (sunRef) {
    const dayFactor = smoothstep(-0.12, 0.06, sunElevation);
    sunRef.color.lerpColors(scratchA.setHex(a.sunColor, THREE.SRGBColorSpace), scratchB.setHex(b.sunColor, THREE.SRGBColorSpace), f);
    // Below the horizon the same light becomes the moon: cast from the
    // opposite bearing at a low, cool intensity so night keeps its shadows
    // instead of collapsing into flat hemisphere ambient.
    const moonFactor = 1 - dayFactor;
    sunRef.intensity = lerp(a.sunIntensity, b.sunIntensity, f) * dayFactor + 0.3 * moonFactor;
    sunTarget.position.copy(followPoint);
    sunTarget.updateMatrixWorld();
    const bearing = sunElevation >= 0 ? 1 : -1;
    sunRef.position.copy(followPoint).addScaledVector(sunDirection, 120 * bearing);
    sunRef.castShadow = sunRef.intensity > 0.02;
  }

  if (hemiRef) {
    hemiRef.color.lerpColors(scratchA.setHex(a.hemiSky, THREE.SRGBColorSpace), scratchB.setHex(b.hemiSky, THREE.SRGBColorSpace), f);
    hemiRef.groundColor.lerpColors(scratchA.setHex(a.hemiGround, THREE.SRGBColorSpace), scratchB.setHex(b.hemiGround, THREE.SRGBColorSpace), f);
    hemiRef.intensity = lerp(a.hemiIntensity, b.hemiIntensity, f);
  }

  skyRef?.setColors(zenithColor, horizonColor);
  skyRef?.setSun(sunDirection, sunElevation);

  for (const e of emissives) e.material.emissiveIntensity = lerp(e.day, e.night, nightFactor);
  for (const l of nightLights) {
    l.light.intensity = l.night * nightFactor;
    l.light.visible = l.light.intensity > 0.01;
  }
  for (const f of nightFlames) f.material.opacity = f.night * nightFactor;
}
