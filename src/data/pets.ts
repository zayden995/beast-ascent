import type { BodyColors, BodyPlan, FeatureId } from '../core/types.ts';
import { ENEMIES } from './enemies.ts';
import { getSpecies } from './species.ts';

// The pet (M3, agreed with the user on 2026-11-19; the bible's Decisions Log, "M3, the pet: design"). One pet per save slot: an
// egg from a beaten den of the Plains hatches into a baby that follows the player and fights beside it. It stays a baby, and its
// strength follows the player's. Every number here is a first guess.

export type PetKind = 'liger' | 'hyena';

export interface PetDef {
  kind: PetKind;
  /** What the HUD and the messages call it. */
  name: string;
  /** Its health and damage as shares of the player's current ones. */
  healthPct: number;
  damagePct: number;
  /** Its walk and sprint as a multiple of the player's (1: it keeps pace). */
  speedMult: number;
  /** Model size (an adult lion or hyena is about 1). */
  size: number;
  body: BodyPlan;
  colors: BodyColors;
  features: FeatureId[];
  /** The egg's shell and its speckles. */
  eggColor: number;
  eggSpots: number;
}

const lion = getSpecies('lion');

export const PETS: Record<PetKind, PetDef> = {
  // From the lion's den: the harder den gives the harder hitter. A lion's body without a mane, tawny, with faint tiger stripes.
  liger: {
    kind: 'liger', name: 'Liger cub', healthPct: 0.35, damagePct: 0.3, speedMult: 1, size: 0.55,
    body: { ...lion.body, headSize: lion.body.headSize * 1.15, legLength: lion.body.legLength * 0.95 },
    colors: { body: 0xd99a4e, belly: 0xf3dcb0, accent: 0x9a5a2a },
    features: ['stripes'],
    eggColor: 0xf1e6cf, eggSpots: 0xb08a5a,
  },
  // From the hyena's den: the easier den gives the sturdier, quicker pup (it hits less hard).
  hyena: {
    kind: 'hyena', name: 'Hyena pup', healthPct: 0.4, damagePct: 0.2, speedMult: 1.06, size: 0.55,
    body: { ...ENEMIES.hyena.body, headSize: ENEMIES.hyena.body.headSize * 1.15 },
    colors: { body: 0x9c8158, belly: 0xc9b58c, accent: 0x3e3020 },
    features: ['slope', 'spots', 'tailTipDark'],
    eggColor: 0xd9c08f, eggSpots: 0x5a4630,
  },
};

export const PET_TUNING = {
  /** Seconds from taking the egg to the hatch. */
  hatchSeconds: 10,
  /** Seconds an injured pet lasts before it dies, unless it is tended. */
  injuredSeconds: 60,
  /** Seconds of holding E, within `tendRange` metres, that bring it back on its feet with `reviveHealthPct` of its health. */
  tendSeconds: 3,
  tendRange: 2.5,
  reviveHealthPct: 0.4,
  /** It stays about this far from the player, walks beyond it, runs beyond `runBeyond`, and appears beside it beyond `warpBeyond`. */
  followDistance: 2.5,
  runBeyond: 8,
  warpBeyond: 35,
  /** It joins a fight against an animal the player hit within this many seconds (or one that is fighting either of them). */
  assistSeconds: 8,
  /** It picks a target only within this distance of the player, and gives it up beyond `breakOffRange`. */
  fightRange: 15,
  breakOffRange: 20,
  /** Its bite: reach in metres (times its size, beyond both bodies), arc, seconds between bites, knockback. */
  biteReach: 1.2,
  biteArcDeg: 100,
  biteCooldown: 1.1,
  biteKnockback: 2,
} as const;
