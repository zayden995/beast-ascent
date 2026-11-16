import type { BiomeId, FoodKind, StageId } from '../core/types.ts';
import type { DeathOutcome } from '../logic/progression.ts';
import type { Actor } from './actor.ts';

export type Tone = 'good' | 'bad' | 'info';

/** Everything systems announce to each other and to the UI. */
export interface GameEvents {
  /** `ambush` is set when a hit from behind earned its bonus damage. */
  damage: { target: Actor; attacker: Actor | null; amount: number; kind: 'hit' | 'bleed'; ambush?: boolean };
  dodged: { target: Actor };
  death: { actor: Actor; killer: Actor | null };
  heal: { target: Actor; amount: number };
  xp: { amount: number };
  levelUp: { level: number };
  ate: { kind: FoodKind; growth: number };
  evolved: { stage: StageId };
  /** Any change to saved progress (XP, growth, abilities, biomes). */
  progress: null;
  toast: { text: string; tone: Tone };
  banner: { title: string; subtitle: string };
  biomeRuled: { biome: BiomeId };
  /** The player's animal died; the payload says what the death cost (already applied and saved). */
  playerDied: DeathOutcome;
  playerRespawned: null;
}

/** How an animal comes into a biome: waking at its den, or through one of its two gates. */
export type Arrival = 'den' | 'onward' | 'return';
