// The pet's rules (M3, the bible's Decisions Log, "M3, the pet: design"). Pure logic: no three.js, unit-tested in Node.
import type { Stats } from '../core/types.ts';
import { PET_TUNING } from '../data/pets.ts';
import type { PetDef, PetKind } from '../data/pets.ts';

/** The pet's strength follows the player's: shares of its health and damage, the same defense, its pace, and its own size. */
export function petStats(player: Stats, def: PetDef): Stats {
  return {
    maxHealth: Math.round(player.maxHealth * def.healthPct),
    stamina: player.stamina,
    staminaRegen: player.staminaRegen,
    damage: player.damage * def.damagePct,
    moveSpeed: player.moveSpeed * def.speedMult,
    sprintSpeed: player.sprintSpeed * def.speedMult,
    attackSpeed: player.attackSpeed,
    defense: player.defense,
    size: def.size,
  };
}

/** A den gives an egg only if it is a den that gives one, all its guards are dead, and the slot has no pet (one per slot). */
export function eggAppears(input: { eggOf: PetKind | undefined; guardsAlive: number; hasPet: boolean }): boolean {
  return input.eggOf !== undefined && input.guardsAlive === 0 && !input.hasPet;
}

export type PetPhase = 'egg' | 'healthy' | 'injured' | 'dead';

export interface PetCare {
  phase: PetPhase;
  /** Seconds until the egg hatches. */
  hatchLeft: number;
  /** Seconds an injured pet has left. */
  injuredLeft: number;
  /** Seconds E has been held beside the injured pet without a break or a hit on the player. */
  tendHeld: number;
}

export type PetCareEvent = 'none' | 'hatched' | 'injured' | 'revived' | 'died';

/** A fresh care state: an egg with its whole hatch time, or an injured pet with the whole countdown. */
export function newPetCare(phase: PetPhase): PetCare {
  return { phase, hatchLeft: PET_TUNING.hatchSeconds, injuredLeft: PET_TUNING.injuredSeconds, tendHeld: 0 };
}

/**
 * One step of the pet's life: the egg hatches; at 0 health the pet is injured (not dead); an injured pet is brought back by
 * `tendSeconds` of tending without a break and without the player being hit, and dies when its countdown runs out.
 * The caller sets the health (`reviveHealthPct`) on 'revived'.
 */
export function stepPetCare(care: PetCare, input: { hp: number; tending: boolean; playerHit: boolean }, dt: number): PetCareEvent {
  const T = PET_TUNING;
  switch (care.phase) {
    case 'egg':
      care.hatchLeft -= dt;
      if (care.hatchLeft > 0) return 'none';
      care.phase = 'healthy';
      return 'hatched';
    case 'healthy':
      if (input.hp > 0) return 'none';
      care.phase = 'injured';
      care.injuredLeft = T.injuredSeconds;
      care.tendHeld = 0;
      return 'injured';
    case 'injured':
      care.injuredLeft -= dt;
      care.tendHeld = input.tending && !input.playerHit ? care.tendHeld + dt : 0;
      if (care.tendHeld >= T.tendSeconds - 1e-9) {
        care.phase = 'healthy';
        care.tendHeld = 0;
        return 'revived';
      }
      if (care.injuredLeft > 0) return 'none';
      care.phase = 'dead';
      return 'died';
    case 'dead':
      return 'none';
  }
}

/**
 * Who a fighting wild animal goes for: the pet only while it can be fought (hatched, healthy, within reach); then whichever of
 * the two hit the animal last; if neither has, the nearer one.
 */
export function chooseFoe(input: { petAvailable: boolean; lastHitBy: 'player' | 'pet' | null; distPlayer: number; distPet: number }): 'player' | 'pet' {
  if (!input.petAvailable) return 'player';
  if (input.lastHitBy) return input.lastHitBy;
  return input.distPet < input.distPlayer ? 'pet' : 'player';
}

/** How the pet follows, by its distance from the player. */
export function followPlan(dist: number): 'stay' | 'walk' | 'run' | 'warp' {
  const T = PET_TUNING;
  if (dist > T.warpBeyond) return 'warp';
  if (dist > T.runBeyond) return 'run';
  if (dist > T.followDistance + 0.5) return 'walk';
  return 'stay';
}

export interface PetCandidate {
  id: number;
  alive: boolean;
  /** A calm guard (a den, a fox reserve): never touched until it wakes. */
  calm: boolean;
  /** Fighting (chasing or attacking): wild animals fight only the player or the pet. */
  engaged: boolean;
  /** Game time the player last hit it. */
  lastPlayerHitAt: number;
  distToPlayer: number;
  distToPet: number;
}

/**
 * What the pet attacks: an animal that is fighting the player or the pet, or one the player hit within `assistSeconds`, within
 * `fightRange` of the player; the nearest to the pet. It never starts a fight and never touches a calm guard. It keeps its
 * `current` target while that is still fair game and within `breakOffRange` of the player. Returns the id, or null.
 */
export function pickPetTarget(candidates: PetCandidate[], now: number, current: number | null): number | null {
  const T = PET_TUNING;
  const fair = (c: PetCandidate) => c.alive && !c.calm && (c.engaged || now - c.lastPlayerHitAt <= T.assistSeconds);
  const kept = current === null ? undefined : candidates.find((c) => c.id === current);
  if (kept && fair(kept) && kept.distToPlayer <= T.breakOffRange) return kept.id;
  let best: PetCandidate | null = null;
  for (const c of candidates) {
    if (!fair(c) || c.distToPlayer > T.fightRange) continue;
    if (!best || c.distToPet < best.distToPet) best = c;
  }
  return best ? best.id : null;
}
