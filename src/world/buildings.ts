import type * as THREE from 'three';
import { buildCottage } from '../build/cottage';
import { buildHitchingRail } from '../build/horses';
import { buildInn } from '../build/inn';
import { buildRoost } from '../build/roost';
import { buildSmithy } from '../build/smithy';
import { buildStable } from '../build/stable';
import {
  buildAwning,
  buildMailbox,
  buildMarketStall,
  buildNoticeBoard,
  buildSignpost,
  buildWagon,
  buildWell,
} from '../build/streetFurniture';
import { PLACEMENTS, type Placement } from './layout';

/**
 * Pairs each layout placement with its builder. Builders never read layout
 * data; layout never knows how a building is made.
 *
 * There is no town hall. Goldshire has never had one: Marshal Dughan gives his
 * orders standing in the road. `build/townhall.ts` stays on disk unimported
 * because it is the only jettied half-timber construction in the repo and
 * worth keeping as a reference, and `tsc --noEmit` still typechecks it.
 */
const BUILDERS: Record<string, () => THREE.Group> = {
  inn: buildInn,
  smithy: buildSmithy,
  stable: buildStable,
  cottageA: () => buildCottage('a'),
  cottageB: () => buildCottage('b'),
  roost: buildRoost,
  stall: buildMarketStall,
  wagon: buildWagon,
  awning: buildAwning,
  well: buildWell,
  signpost: buildSignpost,
  signpostFork: buildSignpost,
  noticeBoard: buildNoticeBoard,
  mailbox: buildMailbox,
  hitch: buildHitchingRail,
};

export const LAYOUT: Placement[] = PLACEMENTS.map((spec) => {
  const build = BUILDERS[spec.id];
  if (!build) throw new Error(`no builder registered for placement "${spec.id}"`);
  return { ...spec, build };
});
