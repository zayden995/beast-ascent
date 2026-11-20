// Leopard seals (Winter), the rules the user set on 2026-11-21 after playing Winter. Pure functions, no three.js.
//
// A seal lives in a hole in the ice. It bites what swims in its hole, and when the player or the pet is on the ice near it, it
// hops out and chases for about 5 m (or a few seconds) before it goes back and dives in.
// - A lake seal (one that came up for an animal left in the water) goes out after its prey once, then sinks away when its hole
//   has been empty for a few seconds.
// - A pool seal (one of the two the mammoth's frozen pool brings up when it breaks during the fight) stays for the fight: it
//   lunges out again and again, resting between lunges, and goes only when its hole freezes over or the fight ends.

export interface SealTuning {
  /** How far (metres) a seal goes from the point where it left the water before it turns back. */
  chaseMetres: number;
  /** The longest a seal stays out of the water on one chase (seconds). */
  chaseSeconds: number;
  /** How fast it shuffles over the ice (m/s): a walking animal is caught, a sprinting one gets away. */
  landSpeed: number;
  /** A pool seal rests this long in the water between chases (seconds). */
  restSeconds: number;
  /** How many seals the pool brings up each time it breaks during the fight. */
  poolCount: number;
}

/** In the water of its hole, out on the ice chasing, or on its way back to the water. */
export type SealMode = 'water' | 'out' | 'back';

export interface SealMind {
  mode: SealMode;
  /** Seconds out of the water on this chase. */
  outT: number;
  /** Where it left the water (it comes back here). */
  exitX: number;
  exitZ: number;
  /** Seconds before a pool seal may chase again. */
  rest: number;
  /** Chases made so far. */
  outings: number;
}

export function newSealMind(): SealMind {
  return { mode: 'water', outT: 0, exitX: 0, exitZ: 0, rest: 0, outings: 0 };
}

/**
 * True when a seal in the water goes out after an animal on the ice `preyDist` metres away (null: none). A lake seal goes out once;
 * a pool seal whenever it has rested.
 */
export function sealGoesOut(mind: SealMind, preyDist: number | null, pool: boolean, t: SealTuning): boolean {
  if (mind.mode !== 'water' || preyDist === null || preyDist > t.chaseMetres) return false;
  return pool ? mind.rest <= 0 : mind.outings === 0;
}

/** True when a seal out on the ice turns back to the water: too far from where it got out, out too long, or its prey gone. */
export function sealTurnsBack(mind: SealMind, fromExit: number, preyGone: boolean, t: SealTuning): boolean {
  return mind.mode === 'out' && (preyGone || fromExit >= t.chaseMetres || mind.outT >= t.chaseSeconds);
}

/** The frozen pool of the mammoth's arena: it brings seals up once per break. */
export interface PoolSealState {
  /** True while the pool may bring seals up: at first, and again once every hole in it has frozen over. */
  armed: boolean;
}

export function newPoolSealState(): PoolSealState {
  return { armed: true };
}

/**
 * One step for the pool: `poolHoles` is how many of its squares are holes, `fighting` whether the mammoth is fighting. Returns how
 * many seals to bring up now (0 or `poolCount`). The pool brings them up the first time it is broken during the fight, and again
 * only after every hole in it has frozen over and it breaks once more.
 */
export function stepPoolSeals(state: PoolSealState, poolHoles: number, fighting: boolean, t: SealTuning): number {
  if (poolHoles === 0) {
    state.armed = true;
    return 0;
  }
  if (!fighting || !state.armed) return 0;
  state.armed = false;
  return t.poolCount;
}
