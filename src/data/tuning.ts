import type { StageId } from '../core/types.ts';

/** Global tunables. Everything here is a starting value. */
export const TUNING = {
  player: {
    sprintStaminaPerSec: 14,
    staminaRegenDelay: 0.8,
    jumpVelocity: 8,
    jumpStaminaCost: 6,
    gravity: 24,
    accel: 12,
    turnRate: 12,
    dodge: { staminaCost: 25, duration: 0.45, speed: 13, iframes: 0.35, cooldown: 0.25 },
    /** Fraction of the swing at which a basic attack lands. */
    attackHitPoint: 0.35,
    /** While swinging, movement speed is multiplied by this. */
    attackMoveMult: 0.45,
    aimAssistRange: 3,
    aimAssistArcDeg: 150,
    swimSpeedMult: 0.6,
    /** Each level above 1 adds this fraction to max health and damage. */
    levelBonusPct: 0.03,
    regenDelay: 6,
    regenPctPerSec: 0.02,
  },
  combat: {
    /** Damage taken = raw * k / (k + defense). */
    defenseK: 50,
    knockbackDecay: 7,
    hitFlashSeconds: 0.14,
  },
  camera: {
    sensitivity: 0.0024,
    minPitch: -0.25,
    maxPitch: 1.25,
    startPitch: 0.32,
    /** Distance = base + perSize * animal size. */
    baseDistance: 3.2,
    distancePerSize: 3.6,
    followLambda: 10,
    fov: 62,
  },
  enemies: {
    respawnSeconds: 30,
    /** Enemies farther than this from the player are hidden and stop thinking. */
    sleepDistance: 95,
    levelHealthPct: 0.12,
    levelDamagePct: 0.1,
    levelXpPct: 0.2,
    regenPctPerSec: 0.08,
  },
  food: {
    eatRange: 2.4,
    carcassSeconds: 90,
    fishRespawnSeconds: 40,
    berryRespawnSeconds: 60,
  },
  death: {
    /** Fraction of XP progress toward the next level lost on death. */
    xpProgressLossPct: 0.25,
    respawnSeconds: 2.5,
  },
  save: {
    key: 'beastAscent.save.v1',
    version: 1,
    autosaveSeconds: 20,
  },
  /** TODO(M2): raise to 'alpha' when the Alpha stage is built. */
  maxPlayableStage: 'adult' as StageId,
  currentMilestone: 1,
};
