import type { AbilityDef, StageId } from '../core/types.ts';
import { ABILITIES } from '../data/abilities.ts';
import { ABILITY_POINTS_PER_LEVEL, STAGES } from '../data/stages.ts';
import { newProgress } from './progression.ts';
import type { Progress } from './progression.ts';

// Rules for the admin sandbox (opened with ?admin): edits that keep a hand-made animal consistent with
// what the game itself could produce. Pure functions on a Progress, so they can be tested without a browser.

/**
 * Whether the admin sandbox is offered: only with ?admin in the address and only on the dev server (`isDev`), so a
 * player on the published site cannot open it (decided with the user on 2026-11-18).
 */
export function adminEnabled(search: string, isDev: boolean): boolean {
  return isDev && new URLSearchParams(search).has('admin');
}

/** The highest level the admin panel can set. The game itself has no cap. */
export const ADMIN_MAX_LEVEL = 50;

function whole(n: number, fallback = 0): number {
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** An animal at the first level of a life stage, with every earned point still to spend. */
export function adminProgress(abilityIds: string[], stage: StageId): Progress {
  const p = newProgress(abilityIds);
  p.stage = stage;
  p.level = STAGES[stage].levelRequired;
  p.abilityPoints = (p.level - 1) * ABILITY_POINTS_PER_LEVEL;
  return p;
}

/** Points the animal has put into abilities: one per rank, except that the free first rank of a signature ability costs nothing. */
function pointsSpent(p: Progress, abilityIds: string[]): number {
  let spent = 0;
  for (const id of abilityIds) {
    const rank = p.abilityRanks[id] ?? 0;
    spent += ABILITIES[id]?.signature ? Math.max(0, rank - 1) : rank;
  }
  return spent;
}

/**
 * Sets the level (never below the first level of the animal's life stage), empties the XP towards
 * the next level, and gives back the points the level earns that have not been spent on abilities.
 */
export function setLevel(p: Progress, level: number, abilityIds: string[]): void {
  const floor = STAGES[p.stage].levelRequired;
  p.level = clamp(whole(level, floor), floor, ADMIN_MAX_LEVEL);
  p.xp = 0;
  p.abilityPoints = Math.max(0, (p.level - 1) * ABILITY_POINTS_PER_LEVEL - pointsSpent(p, abilityIds));
}

/**
 * Sets the life stage. The level rises to the stage's first level if it is below it (a higher level is
 * kept), the growth meter starts empty, and a Juvenile is never wounded.
 */
export function setStage(p: Progress, stage: StageId, abilityIds: string[]): void {
  p.stage = stage;
  p.growth = 0;
  if (stage === 'juvenile') p.wounded = false;
  setLevel(p, p.level, abilityIds);
}

/** Sets an ability's rank directly, without spending points. A signature ability is never locked. */
export function setAbilityRank(p: Progress, def: AbilityDef, rank: number): void {
  const r = clamp(whole(rank), def.signature ? 1 : 0, def.maxRank);
  if (r > 0) p.abilityRanks[def.id] = r;
  else delete p.abilityRanks[def.id];
}

export function setAbilityPoints(p: Progress, points: number): void {
  p.abilityPoints = Math.max(0, whole(points));
}

/** Sets the growth meter, between empty and the size of the current stage's meter (an Alpha has none). */
export function setGrowth(p: Progress, amount: number): void {
  const needed = STAGES[p.stage].growthToNext ?? 0;
  p.growth = clamp(Number.isFinite(amount) ? amount : 0, 0, needed);
}

export function setWounded(p: Progress, wounded: boolean): void {
  p.wounded = wounded && p.stage !== 'juvenile';
}
