import type { StatKey, StatMod, Stats } from '../core/types.ts';

export interface StatInputs {
  base: Stats;
  /** Life-stage (or enemy) size multiplier. */
  sizeScale: number;
  /** Multiplier on max health and damage (life stage, enemy level). */
  powerMult: number;
  /** Extra fraction on max health and damage from player level. */
  levelBonus: number;
  mods: StatMod[];
}

const KEYS: StatKey[] = [
  'maxHealth', 'stamina', 'staminaRegen', 'damage', 'moveSpeed', 'sprintSpeed', 'attackSpeed', 'defense', 'size',
];

function targets(stat: StatMod['stat']): StatKey[] {
  return stat === 'speed' ? ['moveSpeed', 'sprintSpeed'] : [stat];
}

/**
 * Final stats = base x stage power x level bonus, then modifiers.
 * Percent modifiers on the same stat add together; flat modifiers are added last.
 */
export function computeStats(input: StatInputs): Stats {
  const out: Stats = { ...input.base };
  const power = input.powerMult * (1 + input.levelBonus);
  out.maxHealth *= power;
  out.damage *= power;
  out.size *= input.sizeScale;

  const pct: Partial<Record<StatKey, number>> = {};
  const flat: Partial<Record<StatKey, number>> = {};
  for (const mod of input.mods) {
    for (const key of targets(mod.stat)) {
      if (mod.pct) pct[key] = (pct[key] ?? 0) + mod.pct;
      if (mod.flat) flat[key] = (flat[key] ?? 0) + mod.flat;
    }
  }
  for (const key of KEYS) {
    // A stat can be reduced, but never below 10% of its value.
    const scale = Math.max(0.1, 1 + (pct[key] ?? 0));
    out[key] = Math.max(0, out[key] * scale + (flat[key] ?? 0));
  }
  return out;
}
