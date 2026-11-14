import type { AbilityDef, StageId, StatMod } from '../core/types.ts';
import { ABILITIES } from '../data/abilities.ts';
import { ABILITY_POINTS_PER_LEVEL, STAGES, STAGE_ORDER, XP_CURVE, nextStage, previousStage } from '../data/stages.ts';
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
  /** Set by a death. Dying again before gaining a level costs a whole life stage. */
  wounded: boolean;
}

export function newProgress(abilityIds: string[]): Progress {
  const ranks: Record<string, number> = {};
  for (const id of abilityIds) if (ABILITIES[id]?.signature) ranks[id] = 1;
  return { level: 1, xp: 0, abilityPoints: 0, stage: 'juvenile', growth: 0, abilityRanks: ranks, wounded: false };
}

// ---------- Track 1: XP -> levels -> ability points ----------

export function xpToNext(level: number): number {
  return Math.round(XP_CURVE.base + XP_CURVE.step * Math.pow(Math.max(0, level - 1), XP_CURVE.exponent));
}

/** All the XP an animal has earned by the moment it reaches `level` (525 for level 8, 3632 for level 18). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** All the XP the animal has earned so far: the steps behind its level plus its progress towards the next one. */
export function totalXp(p: Progress): number {
  return xpForLevel(p.level) + p.xp;
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
  // Making progress heals the wound: the next death is a first death again.
  if (gained > 0) p.wounded = false;
  return gained;
}

export function enemyXp(baseXp: number, level: number): number {
  return Math.round(baseXp * (1 + TUNING.enemies.levelXpPct * (level - 1)));
}

/** What a death did to the animal, for the death screen and the wake-up message. */
export interface DeathOutcome {
  /** True when the animal also fell back a life stage. */
  dropped: boolean;
  from: StageId;
  stage: StageId;
  level: number;
  /** Whether another death before the next level would cost a stage. */
  wounded: boolean;
}

/**
 * Death costs levels, and a second death in a row costs a life stage.
 * - First death: the animal keeps its stage but falls to that stage's first level (Juvenile 1,
 *   Adult 8, Alpha 18). It loses its XP progress and is marked wounded.
 * - Death while still wounded (no level gained since): it falls back one stage, to that stage's
 *   first level, and its growth meter empties. It stays wounded until it gains a level.
 * Bought abilities are always refunded as ability points (one per level above 1), so the animal
 * never holds more than its level earned. Food already eaten stays while the stage is kept.
 * Changes `p` in place (the save and the systems hold on to it). Ruled biomes live in the profile,
 * not here, so they survive.
 */
export function applyDeath(p: Progress, abilityIds: string[]): DeathOutcome {
  const from = p.stage;
  const lower = p.wounded ? previousStage(from) : null;
  const stage = lower ?? from;
  const dropped = lower !== null;

  // Never raise a level that was already below its stage's floor.
  p.level = Math.min(p.level, STAGES[stage].levelRequired);
  p.xp = 0;
  p.abilityPoints = (p.level - 1) * ABILITY_POINTS_PER_LEVEL;
  p.abilityRanks = newProgress(abilityIds).abilityRanks;
  p.stage = stage;
  p.growth = dropped ? 0 : Math.min(p.growth, growthNeeded(stage) ?? 0);
  p.wounded = stage !== 'juvenile';
  return { dropped, from, stage, level: p.level, wounded: p.wounded };
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
  /** Mods that only apply while the player is unseen (the Tiger's Stalk). */
  unseenMods: StatMod[];
  lowHealthBonus: { threshold: number; pct: number } | null;
  swimSpeedPct: number;
  foodBonus: Partial<Record<string, number>>;
  /** Extra damage while the animal stands in water (0.35 = +35%). */
  waterDamagePct: number;
  /** How far away enemy level tags are shown (0 = the normal range). */
  revealRange: number;
}

export function summarizePassives(p: Progress, abilityIds: string[]): PassiveSummary {
  const out: PassiveSummary = {
    mods: [], unseenMods: [], lowHealthBonus: null, swimSpeedPct: 0, foodBonus: {}, waterDamagePct: 0, revealRange: 0,
  };
  for (const id of abilityIds) {
    const def = ABILITIES[id];
    const rank = abilityRank(p, id);
    if (!def || rank <= 0 || def.effect.kind !== 'passive') continue;
    const power = abilityPower(def, rank);
    const fx = def.effect;
    for (const m of fx.mods ?? []) {
      (fx.whileUnseen ? out.unseenMods : out.mods).push({
        stat: m.stat,
        pct: m.pct !== undefined ? m.pct * power : undefined,
        flat: m.flat !== undefined ? m.flat * power : undefined,
      });
    }
    if (fx.lowHealthBonus) {
      out.lowHealthBonus = { threshold: fx.lowHealthBonus.threshold, pct: fx.lowHealthBonus.pct * power };
    }
    if (fx.swim) out.swimSpeedPct += fx.swim.speedPct * power;
    if (fx.waterDamage) out.waterDamagePct += fx.waterDamage * power;
    if (fx.reveal) out.revealRange = Math.max(out.revealRange, fx.reveal);
    if (fx.foodBonus) {
      out.foodBonus[fx.foodBonus.kind] = (out.foodBonus[fx.foodBonus.kind] ?? 0) + fx.foodBonus.pct * power;
    }
  }
  return out;
}
