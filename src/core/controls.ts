import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { moveCapsule } from './collision';

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.5;
const AIR_CONTROL = 0.25;
const GRAVITY = -22;
const JUMP_SPEED = 6.2;
export const EYE_HEIGHT = 1.68;

export interface Player {
  controls: PointerLockControls;
  orbit: OrbitControls;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  frozen: boolean;
  orbitMode: boolean;
  update(dt: number, collider: THREE.Mesh | null): void;
  teleport(x: number, y: number, z: number): void;
  dispose(): void;
}

const KEY_MAP: Record<string, 'forward' | 'back' | 'left' | 'right'> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export function createPlayer(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  orbitTarget: THREE.Vector3,
): Player {
  const controls = new PointerLockControls(camera, domElement);
  const orbit = new OrbitControls(camera, domElement);
  orbit.target.copy(orbitTarget);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.enabled = false;

  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };
  const forwardDir = new THREE.Vector3();
  const rightDir = new THREE.Vector3();
  const wish = new THREE.Vector3();
  let grounded = false;

  const player: Player = {
    controls,
    orbit,
    position,
    velocity,
    frozen: false,
    orbitMode: false,
    update(dt, collider) {
      if (player.frozen) return;
      if (player.orbitMode) {
        orbit.update();
        return;
      }

      camera.getWorldDirection(forwardDir);
      forwardDir.y = 0;
      if (forwardDir.lengthSq() < 1e-6) forwardDir.set(0, 0, -1);
      forwardDir.normalize();
      rightDir.set(-forwardDir.z, 0, forwardDir.x);

      wish.set(0, 0, 0);
      if (input.forward) wish.add(forwardDir);
      if (input.back) wish.sub(forwardDir);
      if (input.right) wish.add(rightDir);
      if (input.left) wish.sub(rightDir);
      if (wish.lengthSq() > 0) wish.normalize();

      const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
      const control = grounded ? 1 : AIR_CONTROL;
      // Horizontal velocity is driven directly on the ground and blended in the air.
      velocity.x += (wish.x * speed - velocity.x) * Math.min(1, control * dt * 16);
      velocity.z += (wish.z * speed - velocity.z) * Math.min(1, control * dt * 16);
      velocity.y += GRAVITY * dt;

      if (input.jump && grounded) {
        velocity.y = JUMP_SPEED;
        grounded = false;
      }
      input.jump = false;

      if (collider) {
        const res = moveCapsule(position, velocity, dt, collider);
        position.copy(res.position);
        grounded = res.grounded;
        if (grounded && velocity.y < 0) velocity.y = 0;
      } else {
        position.addScaledVector(velocity, dt);
        if (position.y < 0) {
          position.y = 0;
          velocity.y = 0;
          grounded = true;
        }
      }

      camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);
    },
    teleport(x, y, z) {
      position.set(x, y, z);
      velocity.set(0, 0, 0);
      camera.position.set(x, y + EYE_HEIGHT, z);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.disconnect();
      orbit.disconnect();
    },
  };

  function onKeyDown(e: KeyboardEvent): void {
    const action = KEY_MAP[e.code];
    if (action) input[action] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    if (e.code === 'Space') {
      input.jump = true;
      e.preventDefault();
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    const action = KEY_MAP[e.code];
    if (action) input[action] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return player;
}
