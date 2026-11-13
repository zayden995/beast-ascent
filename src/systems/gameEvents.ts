import type { BiomeId, FoodKind, StageId } from '../core/types.ts';
import type { Actor } from './actor.ts';

export type Tone = 'good' | 'bad' | 'info';

/** Everything systems announce to each other and to the UI. */
export interface GameEvents {
  damage: { target: Actor; attacker: Actor | null; amount: number; kind: 'hit' | 'bleed' };
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
  playerDied: null;
  playerRespawned: null;
}
