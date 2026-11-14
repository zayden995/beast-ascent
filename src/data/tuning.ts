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
    baseDistance: 2.4,
    distancePerSize: 3.4,
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
    /**
     * How far an animal notices the player, as a multiple of its aggro radius, by where the player
     * is compared with where it faces (see `noticeMultiplier`). Straight behind, an animal only
     * notices a hunter at a quarter of its range, so a hunter can creep up. Bosses ignore this.
     */
    senses: { frontHalfDeg: 60, rearHalfDeg: 30, front: 1, rear: 0.25 },
  },
  /**
   * Fish in the ponds. They swim away from an animal wading in within `alarmRange` and dart when it gets
   * close. All of it is slower than the slowest swimmer that eats fish (the Bear, about 2.9 m/s), so a
   * fish can always be caught, but it takes a little chase.
   */
  fish: {
    alarmRange: 6,
    fleeSpeed: 2.2,
    dartSpeed: 3.0,
    dartRange: 1.6,
    dartSeconds: 0.5,
    dartCooldown: 2.5,
    returnSpeed: 1.0,
    shoreMargin: 0.6,
  },
  /** Wild animals now and then walk to a pond and drink instead of just wandering. */
  drink: {
    /** The chance that a walk to a new spot is a walk to water (when a pond is within reach). */
    chance: 0.25,
    /** How far from its position an animal will look for a shore, in metres. */
    reach: 30,
    /** How far outside the shore it stands, so that it never wades in. */
    standOff: 1.3,
    minSeconds: 4,
    maxSeconds: 7,
  },
  /** Enemy level tags: how far away they can be seen, in metres. */
  labels: {
    range: 42,
    bossRange: 80,
  },
  food: {
    eatRange: 2.4,
    carcassSeconds: 90,
    fishRespawnSeconds: 40,
    berryRespawnSeconds: 60,
    plantRespawnSeconds: 45,
  },
  /** Flight (the Eagle). Hold Space to flap and climb, release to glide down; landing is automatic. */
  flight: {
    climbSpeed: 5.5,
    verticalLambda: 5,
    glideSink: 2.4,
    /** Highest altitude above the ground, in metres. */
    ceiling: 25,
    takeoffSpeed: 6,
    takeoffStaminaCost: 8,
    flapStaminaPerSec: 11,
    /** Wild animals notice a flier only below this height above the ground (never above the give-up height). */
    noticeAltitude: 5,
    /** A chasing animal gives up on a flier higher than this. */
    giveUpAltitude: 6,
    /** A flier can eat only from this height above the ground or water (an eagle skimming the pond can take a fish). */
    eatAltitude: 2.5,
    /** Dive Strike falls at this speed (m/s). */
    diveDrop: 16,
  },
  death: {
    // Dying drops the animal to the first level of its stage; a second death before it gains a
    // level costs a whole stage (see applyDeath). Ruled biomes are kept.
    respawnSeconds: 3.5,
  },
  dayNight: {
    /** Real seconds for one full day and night. */
    cycleSeconds: 360,
    /** Time of day a play session starts at: 0 = midnight, 0.25 = around sunrise, 0.5 = noon. */
    startAt: 0.34,
    /** Above 0 makes the day longer than the night (0.25 = about 58% day). */
    dayBias: 0.25,
    /** An animal with limited night vision is told so on the HUD while daylight is below this (0 = night, 1 = day). */
    limitedBelowDaylight: 0.5,
    sunIntensity: 2.6,
    moonIntensity: 0.8,
    dayAmbient: 1.7,
    /** Night is dim and blue, but the world must stay readable enough to play. */
    nightAmbient: 0.62,
    colors: {
      nightTop: 0x050818, nightHorizon: 0x18264a, nightFog: 0x131d38,
      twilightTop: 0x2c3a78, twilightHorizon: 0xff9a55, twilightFog: 0xc9906c, twilightSun: 0xff8a4a,
      moon: 0x9fb6ff,
      dayAmbientSky: 0xdcefff, dayAmbientGround: 0x6a7a4a,
      nightAmbientSky: 0x7088d0, nightAmbientGround: 0x2c3550,
      /** Unlit things (grass blades, clouds) are multiplied by these at night. */
      nightUnlit: 0x3a4670, nightCloud: 0x2a3350, twilightCloud: 0xffb48a,
    },
  },
  save: {
    /** How many animals the player can keep: one save slot each. */
    slots: 4,
    /** Slot n is stored under this prefix plus n (1 to 4). */
    slotKeyPrefix: 'beastAscent.save.slot',
    /** Where the single save of earlier versions lived. It moves into a slot the first time the game starts. */
    legacyKey: 'beastAscent.save.v1',
    version: 1,
    autosaveSeconds: 20,
  },
  /** The highest life stage the game allows: Alpha, built in Milestone 2. */
  maxPlayableStage: 'alpha' as StageId,
  /** Species also need to be finished (`unfinished` in species.ts) to be playable. */
  currentMilestone: 2,
};
