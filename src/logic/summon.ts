// A boss that calls a pack (the Plains' Hyena Matriarch). The rule, as the user set it on 2026-11-18: a pack is called the moment
// the fight starts; once every one of the pack is dead the boss waits `waitSeconds`, then calls the next pack, and so on until
// the boss dies. When the fight ends (the boss dies, the player dies or leaves) the pack goes. Pure functions, so they can be
// tested without a browser.

export interface SummonRule {
  /** Seconds the boss waits after the last of a pack has died before it calls the next one. */
  waitSeconds: number;
}

/** idle: no fight. called: a pack is out. waiting: the pack is dead and the boss is counting down. */
export interface SummonState {
  phase: 'idle' | 'called' | 'waiting';
  /** Seconds waited so far in the `waiting` phase. */
  waited: number;
}

export type SummonAction = 'call' | 'dismiss' | 'none';

export function newSummonState(): SummonState {
  return { phase: 'idle', waited: 0 };
}

/**
 * One step of `dt` seconds. `fighting` is whether the boss is fighting the player right now; `summonsAlive` how many of its
 * pack are still alive. Returns what to do: call a pack, dismiss the pack, or nothing.
 */
export function stepSummon(state: SummonState, input: { fighting: boolean; summonsAlive: number }, rule: SummonRule, dt: number): SummonAction {
  if (!input.fighting) {
    if (state.phase === 'idle') return 'none';
    state.phase = 'idle';
    state.waited = 0;
    return 'dismiss';
  }
  switch (state.phase) {
    case 'idle':
      state.phase = 'called';
      return 'call';
    case 'called':
      if (input.summonsAlive === 0) {
        state.phase = 'waiting';
        state.waited = 0;
      }
      return 'none';
    case 'waiting':
      // A pack that is out again (the boss has just called one) ends the countdown.
      if (input.summonsAlive > 0) {
        state.phase = 'called';
        state.waited = 0;
        return 'none';
      }
      state.waited += dt;
      if (state.waited >= rule.waitSeconds) {
        state.phase = 'called';
        state.waited = 0;
        return 'call';
      }
      return 'none';
  }
}
