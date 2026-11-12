import type { AbilityDef, StageId, StatMod } from '../core/types.ts';
import { ABILITIES } from '../data/abilities.ts';
import { ABILITY_POINTS_PER_LEVEL, STAGES, STAGE_ORDER, XP_CURVE, nextStage } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';

/** Everything about the player's growth that is saved. */
export interface Progress {
  level: number;
  /** XP toward the next level. */
  xp: number;
  abilityPoints: number;
  stage: StageId;
  /** Growth meter fill for the current stage. */
  growth: number;
  /** Ability id -> rank (0 or missing = locked). */
  abilityRanks: Record<string, number>;
}

export function newProgress(abilityIds: string[]): Progress {
  const ranks: Record<string, number> = {};
  for (const id of abilityIds) if (ABILITIES[id]?.signature) ranks[id] = 1;
  return { level: 1, xp: 0, abilityPoints: 0, stage: 'juvenile', growth: 0, abilityRanks: ranks };
}

// ---------- Track 1: XP -> levels -> ability points ----------

export function xpToNext(level: number): number {
  return Math.round(XP_CURVE.base + XP_CURVE.step * Math.pow(Math.max(0, level - 1), XP_CURVE.exponent));
}

/** Adds XP and returns how many levels were gained. */
export function addXp(p: Progress, amount: number): number {
  if (!(amount > 0)) return 0;
  p.xp += amount;
  let gained = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.abilityPoints += ABILITY_POINTS_PER_LEVEL;
    gained += 1;
  }
  return gained;
}

export function enemyXp(baseXp: number, level: number): number {
  return Math.round(baseXp * (1 + TUNING.enemies.levelXpPct * (level - 1)));
}

/** Death never removes a level or a life stage, only progress toward the next level. */
export function applyDeathPenalty(p: Progress): number {
  const lost = Math.floor(p.xp * TUNING.death.xpProgressLossPct);
  p.xp -= lost;
  return lost;
}

export type Threat = 'trivial' | 'easy' | 'even' | 'hard' | 'deadly';

/** Colour bucket for an enemy level tag, relative to the player. */
export function threatLevel(playerLevel: number, enemyLevel: number): Threat {
  const diff = enemyLevel - playerLevel;
  if (diff <= -4) return 'trivial';
  if (diff <= -1) return 'easy';
  if (diff <= 1) return 'even';
  if (diff <= 3) return 'hard';
  return 'deadly';
}

// ---------- Track 2: food -> growth meter -> life stage ----------

export function growthNeeded(stage: StageId): number | null {
  return STAGES[stage].growthToNext;
}

/** Adds growth (capped at the meter size) and returns how much was actually added. */
export function addGrowth(p: Progress, amount: number): number {
  const needed = growthNeeded(p.stage);
  if (needed === null || !(amount > 0)) return 0;
  const before = p.growth;
  p.growth = Math.min(needed, p.growth + amount);
  return p.growth - before;
}

export interface EvolveStatus {
  next: StageId | null;
  growthOk: boolean;
  levelOk: boolean;
  /** The next stage exists in data but is not built in this milestone. */
  locked: boolean;
  canEvolve: boolean;
}

export function evolveStatus(p: Progress, maxStage: StageId = TUNING.maxPlayableStage): EvolveStatus {
  const next = nextStage(p.stage);
  if (!next) return { next: null, growthOk: false, levelOk: false, locked: false, canEvolve: false };
  const needed = growthNeeded(p.stage) ?? Infinity;
  const growthOk = p.growth >= needed;
  const levelOk = p.level >= STAGES[next].levelRequired;
  const locked = STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(maxStage);
  return { next, growthOk, levelOk, locked, canEvolve: growthOk && levelOk && !locked };
}

export function evolve(p: Progress, maxStage: StageId = TUNING.maxPlayableStage): boolean {
  const status = evolveStatus(p, maxStage);
  if (!status.canEvolve || !status.next) return false;
  p.stage = status.next;
  p.growth = 0;
  return true;
}

// ---------- Abilities ----------

export function abilityRank(p: Progress, id: string): number {
  return p.abilityRanks[id] ?? 0;
}

export function canUpgradeAbility(p: Progress, def: AbilityDef): boolean {
  return p.abilityPoints > 0 && abilityRank(p, def.id) < def.maxRank;
}

export function upgradeAbility(p: Progress, def: AbilityDef): boolean {
  if (!canUpgradeAbility(p, def)) return false;
  p.abilityPoints -= 1;
  p.abilityRanks[def.id] = abilityRank(p, def.id) + 1;
  return true;
}

/** Effect multiplier for a rank: rank 1 = 1.0, each further rank adds rankScale. */
export function abilityPower(def: AbilityDef, rank: number): number {
  return 1 + def.rankScale * Math.max(0, rank - 1);
}

/** What unlocked passives contribute, summed over an ability list. */
export interface PassiveSummary {
  mods: StatMod[];
  lowHealthBonus: { threshold: number; pct: number } | null;
  swimSpeedPct: number;
  foodBonus: Partial<Record<string, number>>;
}

export function summarizePassives(p: Progress, abilityIds: string[]): PassiveSummary {
  const out: PassiveSummary = { mods: [], lowHealthBonus: null, swimSpeedPct: 0, foodBonus: {} };
  for (const id of abilityIds) {
    const def = ABILITIES[id];
    const rank = abilityRank(p, id);
    if (!def || rank <= 0 || def.effect.kind !== 'passive') continue;
    const power = abilityPower(def, rank);
    const fx = def.effect;
    for (const m of fx.mods ?? []) {
      out.mods.push({
        stat: m.stat,
        pct: m.pct !== undefined ? m.pct * power : undefined,
        flat: m.flat !== undefined ? m.flat * power : undefined,
      });
    }
    if (fx.lowHealthBonus) {
      out.lowHealthBonus = { threshold: fx.lowHealthBonus.threshold, pct: fx.lowHealthBonus.pct * power };
    }
    if (fx.swim) out.swimSpeedPct += fx.swim.speedPct * power;
    if (fx.foodBonus) {
      out.foodBonus[fx.foodBonus.kind] = (out.foodBonus[fx.foodBonus.kind] ?? 0) + fx.foodBonus.pct * power;
    }
  }
  return out;
}
