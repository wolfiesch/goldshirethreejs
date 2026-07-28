import * as THREE from 'three';
import { tex } from '../gen/textures';
import type { SkyTarget } from './daynight';

const SKY_RADIUS = 420;
const BODY_RADIUS = 320;

const VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
varying vec3 vWorldPos;
void main() {
  float h = normalize(vWorldPos).y;
  float t = smoothstep(-0.08, 0.42, h);
  gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
}
`;

export interface Sky extends SkyTarget {
  group: THREE.Group;
}

/**
 * Sky dome plus sun and moon billboards. The dome writes no depth and renders
 * first, so everything else draws over it regardless of the 420 m radius.
 */
export function createSky(): Sky {
  const group = new THREE.Group();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(0x3f7fd0) },
      horizon: { value: new THREE.Color(0xc8dcef) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.userData.collide = false;
  group.add(dome);

  const discTex = tex('softDot');
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: discTex, color: 0xfff4d6, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  sun.scale.setScalar(64);
  sun.renderOrder = 0;
  sun.userData.collide = false;
  group.add(sun);

  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: discTex, color: 0xd6e2f2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  moon.scale.setScalar(40);
  moon.renderOrder = 0;
  moon.userData.collide = false;
  group.add(moon);

  return {
    group,
    setColors(zenith, horizon) {
      (material.uniforms.zenith.value as THREE.Color).copy(zenith);
      (material.uniforms.horizon.value as THREE.Color).copy(horizon);
    },
    setSun(direction, elevation) {
      sun.position.copy(direction).multiplyScalar(BODY_RADIUS);
      moon.position.copy(direction).multiplyScalar(-BODY_RADIUS);
      sun.material.opacity = THREE.MathUtils.clamp(elevation * 6 + 0.4, 0, 1);
      sun.visible = sun.material.opacity > 0.01;
      moon.material.opacity = THREE.MathUtils.clamp(-elevation * 6 + 0.4, 0, 1);
      moon.visible = moon.material.opacity > 0.01;
    },
  };
}
