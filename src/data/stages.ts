import type { StageDef, StageId } from '../core/types.ts';

export const STAGE_ORDER: StageId[] = ['juvenile', 'adult', 'alpha'];

/** Life stages (bible section 4.2). All values tunable. */
export const STAGES: Record<StageId, StageDef> = {
  juvenile: {
    id: 'juvenile',
    name: 'Juvenile',
    levelRequired: 1,
    sizeScale: 0.6,
    powerMult: 1.0,
    growthToNext: 100,
    headScale: 1.22,
  },
  adult: {
    id: 'adult',
    name: 'Adult',
    levelRequired: 8,
    sizeScale: 1.0,
    powerMult: 1.8,
    growthToNext: 250,
    headScale: 1.0,
  },
  alpha: {
    id: 'alpha',
    name: 'Alpha',
    levelRequired: 18,
    sizeScale: 1.4,
    powerMult: 3.0,
    growthToNext: null,
    headScale: 0.95,
  },
};

/** XP needed to go from `level` to `level + 1`: base + step * (level - 1) ^ exponent. */
export const XP_CURVE = { base: 20, step: 12, exponent: 1.3 };

export const ABILITY_POINTS_PER_LEVEL = 1;

export function nextStage(stage: StageId): StageId | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}
