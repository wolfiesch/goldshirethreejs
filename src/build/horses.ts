import * as THREE from 'three';
import { mat } from '../gen/materials';
import { box, cylinder } from '../gen/prims';
import { jitter, makeRng, range } from '../gen/rng';

/**
 * The hitching rail on the inn forecourt and the two horses tied to it. Every
 * reference shot of Goldshire from the road has an animal standing at the
 * Lion's Pride, and its absence is what made the forecourt read as a car park.
 *
 * The horse is blocked out from boxes rather than sculpted: at the range this
 * is seen from, silhouette and stance carry it, and a shared-material box
 * horse merges into the same static draw call as the fence it is tied to.
 */

/** Nose at local +X, ground at y = 0, withers about 1.55 m. */
function horse(seed: number, saddled: boolean): THREE.Group {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const hide = mat('hide');
  // Mane, tail and hooves. Flat near-black, with no wood grain in it.
  const dark = mat('coal');

  const barrelY = 1.12;
  g.add(box(1.3, 0.8, 0.62, hide, { pos: [0, barrelY, 0], uvScale: 1.0 }));
  g.add(box(0.5, 0.84, 0.66, hide, { pos: [0.72, barrelY + 0.02, 0], uvScale: 1.0 }));
  g.add(box(0.58, 0.9, 0.68, hide, { pos: [-0.74, barrelY + 0.04, 0], uvScale: 1.0 }));

  // Legs: cannon bone is thinner than the forearm, and the hoof is the only
  // part that touches the ground, so it is what sets the standing height.
  for (const sx of [0.62, -0.62]) {
    for (const sz of [-0.23, 0.23]) {
      const splay = jitter(rng, 0.05);
      const upper = cylinder(0.085, 0.66, 6, hide, { pos: [sx, 0.79, sz], uvScale: 0.5 });
      upper.rotation.x = splay;
      g.add(upper);
      g.add(cylinder(0.055, 0.5, 6, hide, { pos: [sx + splay * 0.2, 0.29, sz], uvScale: 0.4 }));
      g.add(cylinder(0.072, 0.11, 6, dark, { pos: [sx + splay * 0.2, 0.055, sz], uvScale: 0.2 }));
    }
  }

  // Neck and head. The lean is applied about Z, so local +Y carries forward
  // and up together and the head lands ahead of the chest, not on top of it.
  const neckLean = 0.55 + jitter(rng, 0.06);
  const neck = box(0.36, 0.9, 0.46, hide, { pos: [0.93, 1.8, 0], uvScale: 0.8 });
  neck.rotation.z = -neckLean;
  g.add(neck);

  const headX = 0.93 + Math.sin(neckLean) * 0.5;
  const headY = 1.8 + Math.cos(neckLean) * 0.5;
  const head = box(0.54, 0.3, 0.26, hide, { pos: [headX, headY, 0], uvScale: 0.5 });
  head.rotation.z = -0.5;
  g.add(head);
  g.add(box(0.2, 0.21, 0.22, hide, { pos: [headX + 0.26, headY - 0.14, 0], uvScale: 0.3 }));
  for (const sz of [-0.09, 0.09]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 5), hide);
    ear.position.set(headX - 0.12, headY + 0.2, sz);
    ear.rotation.z = -0.3;
    ear.castShadow = true;
    g.add(ear);
  }

  // Mane down the crest of the neck, then the tail.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const tuft = box(0.08, 0.26, 0.1, dark, {
      pos: [0.93 + Math.sin(neckLean) * (t - 0.5) * 0.9, 1.8 + Math.cos(neckLean) * (t - 0.5) * 0.9 + 0.2, 0],
      uvScale: 0.2,
      collide: false,
    });
    tuft.rotation.z = -neckLean + jitter(rng, 0.12);
    g.add(tuft);
  }
  // Tapered and hung near-vertical off the dock. Swung further back it reads
  // as a fifth leg from every angle that matters.
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.042, 0.78, 6), dark);
  tail.position.set(-1.04, 0.98, 0);
  tail.rotation.z = 2.92;
  tail.castShadow = true;
  tail.userData.collide = false;
  g.add(tail);

  if (saddled) {
    g.add(box(0.66, 0.05, 0.7, mat('clothRed'), { pos: [0.13, 1.5, 0], uvScale: 0.5 }));
    g.add(box(0.5, 0.14, 0.58, mat('timberDark'), { pos: [0.13, 1.57, 0], uvScale: 0.4 }));
    for (const sz of [-0.31, 0.31]) {
      g.add(cylinder(0.02, 0.42, 4, mat('timberDark'), { pos: [0.13, 1.34, sz], uvScale: 0.2, collide: false }));
    }
  }

  // Bridle: cheek strap and noseband, so the tie rope has something to end at.
  g.add(box(0.05, 0.3, 0.05, mat('timberDark'), { pos: [headX + 0.1, headY - 0.02, 0.13], uvScale: 0.1, collide: false }));
  g.add(box(0.05, 0.3, 0.05, mat('timberDark'), { pos: [headX + 0.1, headY - 0.02, -0.13], uvScale: 0.1, collide: false }));
  g.add(box(0.09, 0.06, 0.29, mat('timberDark'), { pos: [headX + 0.24, headY - 0.14, 0], uvScale: 0.1, collide: false }));

  g.userData.muzzle = new THREE.Vector3(headX + 0.3, headY - 0.16, 0);
  g.rotation.y = range(rng, -0.05, 0.05);
  return g;
}

/** Slack rope between two points in the parent's frame. */
function tieRope(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, dir.length(), 5), mat('linen'));
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  rope.position.copy(a).addScaledVector(dir, 0.5);
  rope.userData.collide = false;
  rope.castShadow = false;
  return rope;
}

/**
 * Rail along local X, horses standing on the local -Z side facing back into
 * it. Both facts matter to the placement: the rail is set along the forecourt
 * so the animals stand broadside to anyone coming up the road.
 */
export function buildHitchingRail(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hitchingRail';
  const timber = mat('timberDark');
  const light = mat('timberLight');

  const railLen = 4.2;
  const postH = 1.18;
  for (const x of [-railLen / 2, 0, railLen / 2]) {
    const post = box(0.15, postH, 0.15, timber, { pos: [x, postH / 2, 0], uvScale: 0.9 });
    post.rotation.z = jitter(makeRng(0x40453 + Math.round(x * 10)), 0.02);
    g.add(post);
  }
  for (const y of [1.02, 0.64]) {
    g.add(box(railLen + 0.3, 0.12, 0.1, light, { pos: [0, y, 0], uvScale: 1.2 }));
  }

  for (const [x, saddled, seed] of [
    [-1.08, true, 0x480f5e],
    [1.12, false, 0x480f61],
  ] as Array<[number, boolean, number]>) {
    const h = horse(seed, saddled);
    h.position.set(x, 0, -1.78);
    // Nose is local +X; sending it to local +Z turns the horse into the rail.
    h.rotation.y = -Math.PI / 2 + h.rotation.y;
    g.add(h);

    const muzzle = h.userData.muzzle as THREE.Vector3;
    const nose = muzzle.clone().applyEuler(h.rotation).add(h.position);
    g.add(tieRope(nose, new THREE.Vector3(x + 0.16, 1.02, 0.01)));
  }
  return g;
}
