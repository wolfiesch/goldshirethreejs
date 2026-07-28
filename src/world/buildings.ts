import type * as THREE from 'three';
import { buildCottage } from '../build/cottage';
import { buildInn } from '../build/inn';
import { buildRoost } from '../build/roost';
import { buildSmithy } from '../build/smithy';
import { buildStable } from '../build/stable';
import {
  buildMailbox,
  buildMarketStall,
  buildSignpost,
  buildWagon,
  buildWell,
} from '../build/streetFurniture';
import { buildTownHall } from '../build/townhall';
import { PLACEMENTS, type Placement } from './layout';

/**
 * Pairs each layout placement with its builder. Builders never read layout
 * data; layout never knows how a building is made.
 */
const BUILDERS: Record<string, () => THREE.Group> = {
  inn: buildInn,
  smithy: buildSmithy,
  townhall: buildTownHall,
  stable: buildStable,
  cottageA: () => buildCottage('a'),
  cottageB: () => buildCottage('b'),
  roost: buildRoost,
  stall: buildMarketStall,
  wagon: buildWagon,
  well: buildWell,
  signpost: buildSignpost,
  mailbox: buildMailbox,
};

export const LAYOUT: Placement[] = PLACEMENTS.map((spec) => {
  const build = BUILDERS[spec.id];
  if (!build) throw new Error(`no builder registered for placement "${spec.id}"`);
  return { ...spec, build };
});
