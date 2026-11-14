// Shared data types. Pure TypeScript: no three.js imports, so data and logic can be unit-tested in Node.

export type StatKey =
  | 'maxHealth'
  | 'stamina'
  | 'staminaRegen'
  | 'damage'
  | 'moveSpeed'
  | 'sprintSpeed'
  | 'attackSpeed'
  | 'defense'
  | 'size';

export type Stats = Record<StatKey, number>;

/** 'speed' is shorthand for both moveSpeed and sprintSpeed. */
export type ModStat = StatKey | 'speed';

export interface StatMod {
  stat: ModStat;
  /** Fractional change, e.g. 0.2 = +20%. Percentages on the same stat add together. */
  pct?: number;
  /** Flat amount added after percentages. */
  flat?: number;
}

export type StageId = 'juvenile' | 'adult' | 'alpha';
export type BiomeId = 'forest' | 'jungle' | 'plains' | 'winter';
export type Diet = 'carnivore' | 'herbivore' | 'omnivore';
export type FoodKind = 'carcass' | 'fish' | 'fruit' | 'plant';

export interface StageDef {
  id: StageId;
  name: string;
  levelRequired: number;
  sizeScale: number;
  /** Multiplier on max health and damage. */
  powerMult: number;
  /** Growth meter needed to leave this stage; null for the final stage. */
  growthToNext: number | null;
  /** Head size multiplier so juveniles read as young animals. */
  headScale: number;
}

export interface BiomeModDef {
  biome: BiomeId;
  stat: ModStat;
  pct: number;
  /** Only active when the condition holds. */
  condition?: 'nearWater';
}

// ---------- Animal appearance ----------

export type FeatureId =
  | 'maneSmall'
  | 'mane'
  | 'ruff'
  | 'scar'
  | 'hump'
  | 'antlersSmall'
  | 'antlers'
  | 'tusks'
  | 'ridge'
  | 'stripes'
  | 'trunk'
  | 'jaw'
  | 'sprawl'
  | 'tailTipLight'
  | 'tailTipDark';

export interface BodyColors {
  body: number;
  belly: number;
  accent: number;
  /** Head and neck, if different from the body (the Bald Eagle's white head). */
  head?: number;
  /** Tail feathers, if different from the body (the Bald Eagle's white tail). */
  tail?: number;
}

/** Parametric quadruped proportions, in metres at size 1.0. */
export interface BodyPlan {
  bodyLength: number;
  bodyHeight: number;
  bodyWidth: number;
  legLength: number;
  legThickness: number;
  neckLength: number;
  /** Radians above horizontal. */
  neckAngle: number;
  headSize: number;
  snoutLength: number;
  ears: 'pointed' | 'round' | 'long' | 'none';
  earSize: number;
  tail: 'bushy' | 'tuft' | 'stub' | 'thin' | 'heavy';
  tailLength: number;
  /** Front torso bulk multiplier (1 = same as the middle). */
  chestBulk: number;
}

// ---------- Abilities ----------

export type AbilityEffect =
  | {
      kind: 'leap';
      distance: number;
      duration: number;
      damageMult: number;
      radius: number;
      knockback: number;
      stun?: number;
      /** Flying animals dive from where they are: +`bonusPerMetre` damage for every metre of height. */
      dive?: { bonusPerMetre: number };
    }
  | {
      /** A run along the ground that hits everything on the way, once each (the Elephant's Charge). */
      kind: 'charge';
      distance: number;
      duration: number;
      damageMult: number;
      radius: number;
      knockback: number;
      stun?: number;
    }
  | {
      kind: 'melee';
      windup: number;
      damageMult: number;
      range: number;
      arcDeg: number;
      knockback: number;
      hits?: number;
      hitInterval?: number;
      bleed?: { dpsMult: number; duration: number };
      selfRoot?: boolean;
      /** Extra damage (0.75 = +75%) against a target that has its back to the attacker. */
      behindBonus?: number;
      /** Seconds the first hit holds a target helpless (the Death Roll and the Talon Grab). */
      grab?: number;
    }
  | {
      kind: 'aoe';
      windup: number;
      radius: number;
      damageMult: number;
      knockback: number;
      stun?: number;
      slow?: { pct: number; duration: number };
    }
  | { kind: 'buff'; duration: number; mods: StatMod[] }
  | {
      kind: 'passive';
      mods?: StatMod[];
      /** The mods only apply while no wild animal has noticed the player (see `playerIsUnseen`). */
      whileUnseen?: boolean;
      /** Bonus damage against targets below a health fraction. */
      lowHealthBonus?: { threshold: number; pct: number };
      swim?: { speedPct: number };
      foodBonus?: { kind: FoodKind; pct: number };
      /** Extra damage (0.35 = +35%) while the animal itself stands in water. */
      waterDamage?: number;
      /** Enemy level tags are shown this far away (metres). */
      reveal?: number;
    };

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  signature?: boolean;
  maxRank: number;
  /** Each rank after the first multiplies the effect by (1 + rankScale). */
  rankScale: number;
  cooldown: number;
  staminaCost: number;
  effect: AbilityEffect;
  /** Set when the effect is a placeholder for a later milestone. */
  todo?: string;
}

// ---------- Species ----------

export interface BasicAttackDef {
  range: number;
  arcDeg: number;
  knockback: number;
}

/** A debuff for the dark: how much of its daytime sight an animal keeps at full night (1 = all of it). */
export interface NightVision {
  /** Level-tag range, and Eagle Eye, as a fraction of the daytime range. */
  sight: number;
  /** Fog distance as a fraction of the daytime distance: the world fades out closer by. */
  fog: number;
}

export interface SpeciesVariant {
  id: string;
  name: string;
  colors: BodyColors;
  biomeMods: BiomeModDef[];
  /** Limited vision at night (the Bald Eagle). Left out: the animal sees as well at night as by day. */
  nightVision?: NightVision;
  /** Ability ids in menu order. Active abilities map to keys 1, 2, 3 in this order. */
  abilities: string[];
}

export interface SpeciesDef {
  id: string;
  name: string;
  role: string;
  diet: Diet;
  /** Milestone in which the species becomes playable. */
  playableFrom: number;
  /** Set while the species' own build step is not finished: it stays "Coming soon" even in its milestone. */
  unfinished?: boolean;
  rig: 'quadruped' | 'winged';
  /** Swim pace as a multiple of the walking pace. Left out: the standard fraction (`TUNING.player.swimSpeedMult`). */
  swimSpeedMult?: number;
  baseStats: Stats;
  body: BodyPlan;
  stageFeatures: Record<StageId, FeatureId[]>;
  attack: BasicAttackDef;
  variants: SpeciesVariant[];
}

// ---------- Enemies ----------

export interface EnemyAttackDef {
  id: string;
  kind: 'melee' | 'charge' | 'aoe';
  /** Melee/aoe: reach in metres beyond both body radii. Charge: maximum start distance. */
  range: number;
  windup: number;
  recover: number;
  damageMult: number;
  knockback: number;
  cooldown: number;
  arcDeg?: number;
  /** Charge only. */
  minRange?: number;
  speed?: number;
  duration?: number;
  /** Aoe only. */
  radius?: number;
}

export interface EnemyBehavior {
  /** Distance at which the animal notices the player. */
  aggroRadius: number;
  /** Attacks on sight. */
  aggressive: boolean;
  /** Runs on sight (prey). */
  fleeOnSight: boolean;
  /** Runs when health drops below this fraction (0 = never). */
  fleeHealthPct: number;
  /** Gives up the chase beyond this distance from home. */
  leashRadius: number;
  wanderRadius: number;
  /** Seconds of full-speed fleeing before the animal is winded (0 = never tires). */
  fleeBurst: number;
  /** Seconds it stays winded before it can sprint again. */
  windedSeconds: number;
  windedSpeedMult: number;
  /** Flee speed multiplier at zero health; a wounded animal slows toward this as it loses health (1 = no effect). */
  woundedSpeedMult: number;
  /** Overrides `TUNING.enemies.senses.front` / `.rear`: how far it notices the player ahead and behind (x aggro radius). */
  senses?: { front?: number; rear?: number };
}

export interface EnemyDef {
  id: string;
  name: string;
  baseStats: Stats;
  body: BodyPlan;
  colors: BodyColors;
  features: FeatureId[];
  behavior: EnemyBehavior;
  attacks: EnemyAttackDef[];
  /** XP at level 1. */
  xp: number;
  /** Growth given by its carcass. */
  carcassGrowth: number;
}

export interface BossDef {
  id: string;
  biome: BiomeId;
  title: string;
  level: number;
  /** XP for beating it again once its biome is already ruled (the first win pays `enemy.xp`). */
  repeatXp: number;
  enemy: EnemyDef;
}

// ---------- Biomes ----------

/** A group of animals that roam peacefully behind the title screen. */
export interface TitleAnimalDef {
  /** Either a wild animal (enemy id) or a playable species, shown as an adult. */
  enemyId?: string;
  speciesId?: string;
  variantId?: string;
  count: number;
  /** Centre and radius of the patch the group wanders in. */
  x: number;
  z: number;
  radius: number;
  /** Walks into water instead of avoiding it (a bear at the pond). */
  wades?: boolean;
}

/** Title screen camera: a slow pan from `from` to `to` and back, always looking at `lookAt`. */
export interface TitleViewDef {
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Camera height above the ground. */
  height: number;
  lookAt: { x: number; z: number; height: number };
  /** Seconds for one pan there and back. */
  period: number;
}

export interface SpawnZoneDef {
  enemyId: string;
  count: number;
  x: number;
  z: number;
  radius: number;
  levelMin: number;
  levelMax: number;
  /** A rival predator: this zone is left out when the player is this species. */
  rivalOf?: string;
  /** Seconds before a dead animal from this zone comes back (default: TUNING.enemies.respawnSeconds). */
  respawnSeconds?: number;
}

export interface BiomePalette {
  ground: number;
  groundAlt: number;
  dirt: number;
  rock: number;
  foliage: number;
  foliageAlt: number;
  trunk: number;
  water: number;
  skyTop: number;
  skyHorizon: number;
  fog: number;
  sun: number;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  order: number;
  /** False for biomes that arrive in a later milestone. */
  implemented: boolean;
  bossId: string | null;
  palette: BiomePalette;
  fogNear: number;
  fogFar: number;
}

export interface FoodDef {
  kind: FoodKind;
  name: string;
  /** Default growth value (carcasses use the enemy's own value). */
  growth: number;
  /** Fraction of max health restored. */
  healPct: number;
}
