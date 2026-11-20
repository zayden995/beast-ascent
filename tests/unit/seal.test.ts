import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newPoolSealState, newSealMind, sealGoesOut, sealTurnsBack, stepPoolSeals } from '../../src/logic/seal.ts';
import type { SealTuning } from '../../src/logic/seal.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { sealDue } from '../../src/logic/ice.ts';

const T: SealTuning = { chaseMetres: 5, chaseSeconds: 3, landSpeed: 4, restSeconds: 4, poolCount: 2 };

test('seal: the game comes up after 5 s in the water and chases about 5 m at about 4 m/s (the user, 2026-11-21)', () => {
  assert.equal(TUNING.ice.sealAfterSeconds, 5);
  assert.equal(sealDue(4.9, false, TUNING.ice), false);
  assert.equal(sealDue(5, false, TUNING.ice), true);
  assert.equal(TUNING.seal.chaseMetres, 5);
  assert.equal(TUNING.seal.landSpeed, 4);
  assert.equal(TUNING.seal.poolCount, 2);
});

test('seal: a seal sprints slower on the ice than every playable species, so a sprinting animal gets away', () => {
  // The slowest sprint of any playable species on foot is 7.2 (5.18 for the Crocodile in Winter): all faster than 4.
  assert.ok(TUNING.seal.landSpeed < 5.18);
});

test('seal: it goes out after an animal on the ice within 5 m, not farther', () => {
  const m = newSealMind();
  assert.equal(sealGoesOut(m, 4.9, false, T), true);
  assert.equal(sealGoesOut(m, 5.1, false, T), false);
  assert.equal(sealGoesOut(m, null, false, T), false, 'nobody on the ice');
  m.mode = 'out';
  assert.equal(sealGoesOut(m, 2, false, T), false, 'already out');
});

test('seal: a lake seal chases once; a pool seal again after resting', () => {
  const m = newSealMind();
  m.outings = 1;
  assert.equal(sealGoesOut(m, 2, false, T), false, 'a lake seal has had its chase');
  m.rest = 1;
  assert.equal(sealGoesOut(m, 2, true, T), false, 'a pool seal still resting');
  m.rest = 0;
  assert.equal(sealGoesOut(m, 2, true, T), true, 'a rested pool seal goes again');
});

test('seal: out on the ice it turns back after 5 m, after 3 s, or when its prey is gone', () => {
  const m = newSealMind();
  m.mode = 'out';
  assert.equal(sealTurnsBack(m, 2, false, T), false);
  assert.equal(sealTurnsBack(m, 5, false, T), true, '5 m from where it got out');
  m.outT = 3;
  assert.equal(sealTurnsBack(m, 1, false, T), true, '3 s out');
  m.outT = 0;
  assert.equal(sealTurnsBack(m, 1, true, T), true, 'prey gone (back in the water, flying, dead)');
  m.mode = 'water';
  assert.equal(sealTurnsBack(m, 9, true, T), false, 'only a seal that is out turns back');
});

test('pool: during the fight, the first break brings 2 seals and further holes bring none', () => {
  const s = newPoolSealState();
  assert.equal(stepPoolSeals(s, 0, true, T), 0, 'whole ice');
  assert.equal(stepPoolSeals(s, 3, true, T), 2, 'the first break');
  assert.equal(stepPoolSeals(s, 3, true, T), 0);
  assert.equal(stepPoolSeals(s, 9, true, T), 0, 'more holes while some are still open bring none');
});

test('pool: only after every hole has frozen over does the next break bring 2 more', () => {
  const s = newPoolSealState();
  stepPoolSeals(s, 4, true, T);
  assert.equal(stepPoolSeals(s, 1, true, T), 0, 'one hole still open');
  assert.equal(stepPoolSeals(s, 0, true, T), 0, 'all frozen over');
  assert.equal(stepPoolSeals(s, 2, true, T), 2, 'broken again');
});

test('pool: no seals when the mammoth is not fighting; a pool broken before the fight brings them when it starts', () => {
  const s = newPoolSealState();
  assert.equal(stepPoolSeals(s, 4, false, T), 0);
  assert.equal(stepPoolSeals(s, 4, true, T), 2);
});
