import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSummonState, stepSummon } from '../../src/logic/summon.ts';
import type { SummonAction, SummonState } from '../../src/logic/summon.ts';

// The user's rule (2026-11-18): the boss calls a pack of 3 when the fight starts; once all 3 are dead it waits 6 seconds,
// then calls another 3, and so on until the boss dies. The pack goes when the fight ends (the boss dies, the player dies or leaves).
const RULE = { waitSeconds: 6 };

/** Runs the state for `seconds` in small steps, with the same inputs each step; returns every action taken. */
function run(state: SummonState, seconds: number, fighting: boolean, alive: () => number, dt = 0.1): SummonAction[] {
  const actions: SummonAction[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const a = stepSummon(state, { fighting, summonsAlive: alive() }, RULE, dt);
    if (a !== 'none') actions.push(a);
  }
  return actions;
}

test('summon: nothing happens while the boss is not fighting', () => {
  const state = newSummonState();
  assert.deepEqual(run(state, 30, false, () => 0), []);
});

test('summon: the first pack is called the moment the fight starts, and only once while the pack lives', () => {
  const state = newSummonState();
  assert.equal(stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016), 'call');
  assert.deepEqual(run(state, 60, true, () => 3), [], 'no second pack while any of the first lives');
  assert.deepEqual(run(state, 60, true, () => 1), [], 'even one survivor keeps the boss from calling again');
});

test('summon: after all of the pack are dead the boss waits 6 seconds, then calls the next pack', () => {
  const state = newSummonState();
  stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016); // the first call
  run(state, 2, true, () => 3);
  // The last of the pack dies: the wait begins.
  assert.deepEqual(run(state, 5.5, true, () => 0), [], 'not yet at 5.5 s');
  assert.deepEqual(run(state, 1.0, true, () => 0), ['call'], 'called by 6.5 s, and only once');
  assert.deepEqual(run(state, 20, true, () => 3), [], 'and then it waits for that pack too');
});

test('summon: the 6 seconds count from the death of the last one, not of the first', () => {
  const state = newSummonState();
  stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016);
  run(state, 10, true, () => 2); // two dead for a long time, one still alive: no wait has begun
  assert.deepEqual(run(state, 5, true, () => 0), [], 'the wait starts only now');
  assert.deepEqual(run(state, 2, true, () => 0), ['call']);
});

test('summon: when the fight ends the pack is dismissed once, and the wait is forgotten', () => {
  const state = newSummonState();
  stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016);
  run(state, 1, true, () => 3);
  assert.deepEqual(run(state, 3, false, () => 3), ['dismiss'], 'dismissed once, not every step');
  assert.deepEqual(run(state, 10, false, () => 0), [], 'quiet afterwards');
  // A new fight starts afresh with a pack at once.
  assert.equal(stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016), 'call');
});

test('summon: ending the fight in the middle of the wait cancels it', () => {
  const state = newSummonState();
  stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016);
  run(state, 4, true, () => 0); // 4 of the 6 seconds gone
  assert.deepEqual(run(state, 1, false, () => 0), ['dismiss']);
  // The next fight gets its pack immediately, not after the 2 seconds that were left.
  assert.equal(stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, 0.016), 'call');
  assert.deepEqual(run(state, 5, true, () => 0), [], 'and the wait for the next one starts from the new pack\'s death');
});

test('summon: it works with big and small time steps alike', () => {
  for (const dt of [1 / 60, 0.5, 2]) {
    const state = newSummonState();
    assert.equal(stepSummon(state, { fighting: true, summonsAlive: 0 }, RULE, dt), 'call');
    const actions = run(state, 20, true, () => 0, dt);
    assert.deepEqual(actions.slice(0, 1), ['call'], `a second call comes after the wait with dt ${dt}`);
  }
});
