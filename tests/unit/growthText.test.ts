import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STAGES } from '../../src/data/stages.ts';
import { meterLabel } from '../../src/logic/growthText.ts';
import { newProgress, totalXp, xpForLevel, xpToNext } from '../../src/logic/progression.ts';

function wolfProgress(stage: 'juvenile' | 'adult' | 'alpha', level: number, growth: number, xp = 0) {
  const p = newProgress(['wolf_pounce']);
  p.stage = stage;
  p.level = level;
  p.growth = growth;
  p.xp = xp;
  return p;
}

test('xp totals: the XP needed to reach a level is the sum of the steps before it', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), xpToNext(1));
  let sum = 0;
  for (let l = 1; l < 8; l++) sum += xpToNext(l);
  assert.equal(xpForLevel(8), sum);
  assert.equal(xpForLevel(8), 525, 'level 8, the Adult requirement, takes 525 XP in all');
  assert.equal(xpForLevel(18), 3632, 'level 18, the Alpha requirement, takes 3632 XP in all');
});

test('xp totals: an animal\'s total is the steps behind it plus the XP towards its next level', () => {
  assert.equal(totalXp(wolfProgress('juvenile', 1, 0, 7)), 7);
  assert.equal(totalXp(wolfProgress('juvenile', 3, 0, 10)), xpToNext(1) + xpToNext(2) + 10);
});

test('meter label: a meter that is filling shows how far it has got', () => {
  assert.equal(meterLabel(wolfProgress('juvenile', 2, 40)), 'Growth 40 / 100');
  assert.equal(meterLabel(wolfProgress('adult', 9, 120.7)), 'Growth 120 / 250');
});

test('meter label: a full meter that is waiting for a level says which level and how much XP is left', () => {
  const p = wolfProgress('juvenile', 4, STAGES.juvenile.growthToNext!, 20);
  const done = totalXp(p);
  assert.equal(meterLabel(p), `Fully fed, level 8 needed (${done}/525 XP)`);
  const adult = wolfProgress('adult', 12, STAGES.adult.growthToNext!, 0);
  assert.equal(meterLabel(adult), `Fully fed, level 18 needed (${totalXp(adult)}/3632 XP)`);
});

test('meter label: full meter and enough level means ready to evolve', () => {
  assert.equal(meterLabel(wolfProgress('juvenile', 8, 100)), 'Ready to evolve (Tab)');
  assert.equal(meterLabel(wolfProgress('adult', 30, 250)), 'Ready to evolve (Tab)');
});

test('meter label: an Alpha has no meter', () => {
  assert.equal(meterLabel(wolfProgress('alpha', 20, 0)), 'Fully grown');
});

test('meter label: a stage the game does not allow yet is said to be unavailable', () => {
  assert.equal(meterLabel(wolfProgress('adult', 30, 250), 'adult'), 'Growth full. Alpha is not available yet');
});
