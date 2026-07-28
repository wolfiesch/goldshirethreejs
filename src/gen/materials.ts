import * as THREE from 'three';
import { registerNightEmissive } from '../core/daynight';
import { tex } from './textures';

/**
 * Memoised material registry. Builders never construct a THREE.Material inline:
 * shared instances are what keep the draw-call count down and what lets the
 * step-11 static merge group geometry by material.
 */

export type MatKey =
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
  | 'bark'
  | 'rugRed'
  | 'clothRed'
  | 'hay'
  | 'noticeBoard'
  | 'metalDark'
  | 'metalGrey'
  | 'metalBrass'
  | 'wax'
  | 'clay'
  | 'copper'
  | 'bottleGreen'
  | 'linen'
  | 'sackcloth'
  | 'coal'
  | 'parchment'
  | 'painting'
  | 'banner'
  | 'hide';

interface MatSpec {
  map: Parameters<typeof tex>[0] | null;
  color: number;
}

const SPECS: Record<MatKey, MatSpec> = {
  plaster: { map: 'plaster', color: 0xffffff },
  timberDark: { map: 'timberDark', color: 0xffffff },
  timberLight: { map: 'timberLight', color: 0xffffff },
  shingleBlue: { map: 'shingleBlue', color: 0xffffff },
  stoneBlock: { map: 'stoneBlock', color: 0xffffff },
  cobble: { map: 'cobble', color: 0xffffff },
  dirt: { map: 'dirt', color: 0xffffff },
  grass: { map: 'grass', color: 0xffffff },
  plankFloor: { map: 'plankFloor', color: 0xffffff },
  plankWall: { map: 'plankWall', color: 0xffffff },
  brick: { map: 'brick', color: 0xffffff },
  carvedStone: { map: 'carvedStone', color: 0xffffff },
  thatch: { map: 'thatch', color: 0xffffff },
  bark: { map: 'bark', color: 0xffffff },
  rugRed: { map: 'rugRed', color: 0xffffff },
  clothRed: { map: 'clothRed', color: 0xffffff },
  hay: { map: 'hay', color: 0xffffff },
  noticeBoard: { map: 'noticeBoard', color: 0xffffff },
  parchment: { map: 'parchment', color: 0xffffff },
  painting: { map: 'painting', color: 0xffffff },
  banner: { map: 'banner', color: 0xffffff },
  hide: { map: 'hide', color: 0xffffff },
  metalDark: { map: null, color: 0x3a3a3e },
  // Pale blue-grey plate iron, the smithy flue hood. Distinct from metalDark,
  // which is the near-black of tools and hoops and disappears against shadow.
  metalGrey: { map: null, color: 0x8b9199 },
  metalBrass: { map: null, color: 0x8a6b32 },
  coal: { map: null, color: 0x1c1512 },
  wax: { map: null, color: 0xece0c0 },
  clay: { map: null, color: 0xa9764f },
  copper: { map: null, color: 0xa5612c },
  bottleGreen: { map: null, color: 0x2f5d3a },
  linen: { map: null, color: 0xd8cfba },
  sackcloth: { map: 'hay', color: 0xa89a7c },
};

const cache = new Map<string, THREE.MeshLambertMaterial>();

/**
 * Diffuse-only Lambert throughout: WoW's art is flat and warm, and Lambert is
 * roughly 2x cheaper than Standard with a dozen point lights in the scene.
 */
export function mat(key: MatKey, rx = 1, ry = 1, side: THREE.Side = THREE.FrontSide): THREE.MeshLambertMaterial {
  const id = `${key}:${rx}:${ry}:${side}`;
  let m = cache.get(id);
  if (!m) {
    const spec = SPECS[key];
    m = new THREE.MeshLambertMaterial({
      map: spec.map ? tex(spec.map, rx, ry) : null,
      color: spec.color,
      side,
    });
    m.name = id;
    cache.set(id, m);
  }
  return m;
}

let glass: THREE.MeshLambertMaterial | null = null;
let leaf: THREE.MeshLambertMaterial | null = null;
let cone: THREE.MeshLambertMaterial | null = null;
let cobweb: THREE.MeshLambertMaterial | null = null;
let rune: THREE.MeshLambertMaterial | null = null;
let lantern: THREE.MeshLambertMaterial | null = null;
let forgeGlow: THREE.MeshLambertMaterial | null = null;
let water: THREE.MeshPhongMaterial | null = null;
let flame: THREE.MeshBasicMaterial | null = null;
let smoke: THREE.PointsMaterial | null = null;

/** Shared wind uniform driven once per frame from the main loop. */
export const windUniforms = { time: { value: 0 } };

function applyWind(m: THREE.Material): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.time = windUniforms.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float time;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 windWorld = modelMatrix * vec4(transformed, 1.0);
        float windSway = sin(time * 1.1 + windWorld.x * 0.35) * 0.06 * uv.y;
        transformed.x += windSway;
        transformed.z += windSway * 0.6;`,
      );
  };
  m.customProgramCacheKey = () => 'wind';
}

/** Leaded window glass. Warm at night, near-clear by day; never collidable. */
export function glassMat(): THREE.MeshLambertMaterial {
  if (!glass) {
    glass = new THREE.MeshLambertMaterial({
      map: tex('leadedGlass'),
      transparent: true,
      opacity: 0.86,
      emissive: new THREE.Color(0xffc46a),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    glass.name = 'glass';
    /*
     * Night drive is well above 1 so the bloom highpass can separate a lit
     * window from a sunlit wall. Output is clamped at 1 either way under
     * NoToneMapping, so the headroom costs nothing in the base image: it buys
     * the glow and nothing else.
     */
    registerNightEmissive(glass, 0.05, 3.2);
  }
  return glass;
}

export function leafMat(): THREE.MeshLambertMaterial {
  if (!leaf) {
    leaf = new THREE.MeshLambertMaterial({
      map: tex('leafCard'),
      alphaTest: 0.5,
      transparent: false,
      side: THREE.DoubleSide,
    });
    leaf.name = 'leaf';
    applyWind(leaf);
  }
  return leaf;
}

export function coneMat(): THREE.MeshLambertMaterial {
  if (!cone) {
    cone = new THREE.MeshLambertMaterial({
      map: tex('coneCard'),
      alphaTest: 0.5,
      transparent: false,
      side: THREE.DoubleSide,
    });
    cone.name = 'cone';
    applyWind(cone);
  }
  return cone;
}

export function waterMat(): THREE.MeshPhongMaterial {
  if (!water) {
    water = new THREE.MeshPhongMaterial({
      map: tex('waterSurf', 20, 50),
      transparent: true,
      opacity: 0.82,
      shininess: 90,
      specular: new THREE.Color(0x9fd0e0),
    });
    water.name = 'water';
  }
  return water;
}

export function flameMat(): THREE.MeshBasicMaterial {
  if (!flame) {
    flame = new THREE.MeshBasicMaterial({
      // Above 1 in the linear working space, which a Basic material's colour
      // is allowed to be. At 0xffa63a a torch sits under the bloom threshold
      // and stays a flat orange decal at night.
      color: new THREE.Color().setRGB(2.4, 1.5, 0.55),
      map: tex('flameCard'),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    flame.name = 'flame';
  }
  return flame;
}

export function smokeMat(): THREE.PointsMaterial {
  if (!smoke) {
    smoke = new THREE.PointsMaterial({
      map: tex('smoke'),
      color: 0x9aa3a8,
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    smoke.name = 'smoke';
  }
  return smoke;
}

/** Dusty cellar cobwebs. Separate from `linen` so nothing else turns translucent. */
export function cobwebMat(): THREE.MeshLambertMaterial {
  if (!cobweb) {
    cobweb = new THREE.MeshLambertMaterial({
      map: tex('cobwebNet'),
      color: 0xd8d4c8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    cobweb.name = 'cobweb';
  }
  return cobweb;
}

/**
 * Arcane rune plate (the Alliance mailbox glyph). Its own material so
 * registering the night glow does not light up every brass prop.
 */
export function runeMat(): THREE.MeshLambertMaterial {
  if (!rune) {
    rune = new THREE.MeshLambertMaterial({
      color: 0x2a3f5c,
      emissive: new THREE.Color(0x6ab4ff),
      emissiveIntensity: 0,
    });
    rune.name = 'rune';
    registerNightEmissive(rune, 0.1, 2.8);
  }
  return rune;
}

/**
 * Lantern lens: lit around the clock. The day value stays under the bloom
 * threshold on purpose - a lantern that halos at noon reads as a bug, and noon
 * is the frame where nothing but the sun disc should glow.
 */
export function lanternMat(): THREE.MeshLambertMaterial {
  if (!lantern) {
    lantern = new THREE.MeshLambertMaterial({
      color: 0xffd79a,
      emissive: new THREE.Color(0xffb35c),
      emissiveIntensity: 0,
    });
    lantern.name = 'lantern';
    registerNightEmissive(lantern, 1.2, 3.0);
  }
  return lantern;
}

/**
 * Glowing coal bed for the smithy forge. Distinct from `coal`, which is the
 * dead blackening inside the inn's firebox.
 */
export function forgeGlowMat(): THREE.MeshLambertMaterial {
  if (!forgeGlow) {
    forgeGlow = new THREE.MeshLambertMaterial({
      color: 0x4a1c0c,
      emissive: new THREE.Color(0xff5a14),
      emissiveIntensity: 0,
    });
    forgeGlow.name = 'forgeGlow';
    /*
     * Much higher than the warm-white emissives for the same apparent glow.
     * The bloom highpass is a luminance cut, and this colour is nearly pure
     * red: at Rec.709 weights it carries about a quarter of the luminance a
     * white of the same magnitude would.
     */
    registerNightEmissive(forgeGlow, 4.6, 6.2);
  }
  return forgeGlow;
}
