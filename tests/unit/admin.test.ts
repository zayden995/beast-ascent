import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITIES } from '../../src/data/abilities.ts';
import { getSpecies, getVariant } from '../../src/data/species.ts';
import { STAGES } from '../../src/data/stages.ts';
import {
  ADMIN_MAX_LEVEL,
  adminEnabled,
  adminProgress,
  setAbilityPoints,
  setAbilityRank,
  setGrowth,
  setLevel,
  setStage,
  setWounded,
} from '../../src/logic/admin.ts';

const wolfAbilities = getVariant(getSpecies('wolf'), 'default').abilities;
const signature = wolfAbilities.find((id) => ABILITIES[id].signature)!;
const optional = wolfAbilities.find((id) => !ABILITIES[id].signature && ABILITIES[id].effect.kind !== 'passive')!;

test('admin: the sandbox opens with ?admin on the dev server only, never on the published site', () => {
  assert.equal(adminEnabled('?admin', true), true);
  assert.equal(adminEnabled('', true), false);
  assert.equal(adminEnabled('?admin', false), false);
  assert.equal(adminEnabled('?admin&debug', false), false);
});

test('admin: an animal made for a life stage starts at that stage\'s first level with its points to spend', () => {
  const juvenile = adminProgress(wolfAbilities, 'juvenile');
  assert.equal(juvenile.level, 1);
  assert.equal(juvenile.abilityPoints, 0);
  const adult = adminProgress(wolfAbilities, 'adult');
  assert.equal(adult.stage, 'adult');
  assert.equal(adult.level, STAGES.adult.levelRequired);
  assert.equal(adult.abilityPoints, STAGES.adult.levelRequired - 1, 'one point for every level above 1');
  const alpha = adminProgress(wolfAbilities, 'alpha');
  assert.equal(alpha.level, STAGES.alpha.levelRequired);
  assert.equal(alpha.abilityPoints, STAGES.alpha.levelRequired - 1);
  for (const p of [juvenile, adult, alpha]) {
    assert.equal(p.growth, 0);
    assert.equal(p.xp, 0);
    assert.equal(p.wounded, false);
    assert.deepEqual(p.abilityRanks, { [signature]: 1 }, 'only the free signature ability is unlocked');
  }
});

test('admin: raising the life stage lifts the level to that stage\'s first level, and never lowers a higher level', () => {
  const p = adminProgress(wolfAbilities, 'juvenile');
  p.level = 3;
  p.growth = 40;
  setStage(p, 'adult', wolfAbilities);
  assert.equal(p.stage, 'adult');
  assert.equal(p.level, STAGES.adult.levelRequired);
  assert.equal(p.growth, 0, 'the meter belongs to the stage, so it starts empty');

  const high = adminProgress(wolfAbilities, 'juvenile');
  high.level = 12;
  setStage(high, 'adult', wolfAbilities);
  assert.equal(high.level, 12);
});

test('admin: going back to Juvenile clears the wounded mark, because a Juvenile has nothing left to lose', () => {
  const p = adminProgress(wolfAbilities, 'alpha');
  p.wounded = true;
  setStage(p, 'juvenile', wolfAbilities);
  assert.equal(p.stage, 'juvenile');
  assert.equal(p.wounded, false);
  assert.equal(p.level, STAGES.alpha.levelRequired, 'the level is kept');
});

test('admin: a level is kept between its stage\'s first level and the limit, and points follow the game\'s rule', () => {
  const p = adminProgress(wolfAbilities, 'adult');
  setLevel(p, 3, wolfAbilities);
  assert.equal(p.level, STAGES.adult.levelRequired, 'an Adult cannot be below level 8');
  setLevel(p, 10_000, wolfAbilities);
  assert.equal(p.level, ADMIN_MAX_LEVEL);
  setLevel(p, 12.9, wolfAbilities);
  assert.equal(p.level, 12);
  assert.equal(p.xp, 0);
  assert.equal(p.abilityPoints, 11, 'level 12 earns 11 points and nothing has been spent');
});

test('admin: points left after a level change are what has not been spent on abilities', () => {
  const p = adminProgress(wolfAbilities, 'juvenile');
  setAbilityRank(p, ABILITIES[optional], 2);
  setLevel(p, 10, wolfAbilities);
  assert.equal(p.abilityPoints, 9 - 2, 'nine points earned, two spent on ranks above zero');
  setLevel(p, 2, wolfAbilities);
  assert.equal(p.abilityPoints, 0, 'points never go below zero');
});

test('admin: ability ranks stay between their limits, and the signature ability is always unlocked', () => {
  const p = adminProgress(wolfAbilities, 'juvenile');
  setAbilityRank(p, ABILITIES[signature], 0);
  assert.equal(p.abilityRanks[signature], 1);
  setAbilityRank(p, ABILITIES[optional], 99);
  assert.equal(p.abilityRanks[optional], ABILITIES[optional].maxRank);
  setAbilityRank(p, ABILITIES[optional], 2);
  assert.equal(p.abilityRanks[optional], 2);
  setAbilityRank(p, ABILITIES[optional], 0);
  assert.equal(optional in p.abilityRanks, false, 'rank 0 means locked');
});

test('admin: changing a rank does not touch the ability points', () => {
  const p = adminProgress(wolfAbilities, 'adult');
  const before = p.abilityPoints;
  setAbilityRank(p, ABILITIES[optional], 3);
  assert.equal(p.abilityPoints, before);
});

test('admin: ability points are a whole number, never negative', () => {
  const p = adminProgress(wolfAbilities, 'juvenile');
  setAbilityPoints(p, 7.8);
  assert.equal(p.abilityPoints, 7);
  setAbilityPoints(p, -5);
  assert.equal(p.abilityPoints, 0);
  setAbilityPoints(p, Number.NaN);
  assert.equal(p.abilityPoints, 0);
});

test('admin: the growth meter is kept between empty and the size of the current stage\'s meter', () => {
  const p = adminProgress(wolfAbilities, 'juvenile');
  setGrowth(p, 60);
  assert.equal(p.growth, 60);
  setGrowth(p, 1e6);
  assert.equal(p.growth, STAGES.juvenile.growthToNext);
  setGrowth(p, -3);
  assert.equal(p.growth, 0);
  const alpha = adminProgress(wolfAbilities, 'alpha');
  setGrowth(alpha, 50);
  assert.equal(alpha.growth, 0, 'an Alpha has no growth meter');
});

test('admin: only an Adult or Alpha can be wounded', () => {
  const juvenile = adminProgress(wolfAbilities, 'juvenile');
  setWounded(juvenile, true);
  assert.equal(juvenile.wounded, false);
  const adult = adminProgress(wolfAbilities, 'adult');
  setWounded(adult, true);
  assert.equal(adult.wounded, true);
  setWounded(adult, false);
  assert.equal(adult.wounded, false);
});
