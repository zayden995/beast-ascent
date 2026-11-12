import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAbility } from '../../src/data/abilities.ts';
import { FOREST_LAYOUT } from '../../src/data/biomes.ts';
import { STAGES } from '../../src/data/stages.ts';
import { getSpecies, getVariant } from '../../src/data/species.ts';
import { activeBiomeMods, describeMod, toStatMods } from '../../src/logic/biome.ts';
import { lowHealthMultiplier, mitigate } from '../../src/logic/damage.ts';
import { createForestHeight } from '../../src/logic/heightfield.ts';
import {
  abilityPower, addGrowth, addXp, applyDeathPenalty, evolve, evolveStatus, newProgress,
  summarizePassives, threatLevel, upgradeAbility, xpToNext,
} from '../../src/logic/progression.ts';
import { computeStats } from '../../src/logic/stats.ts';

const wolf = getSpecies('wolf');
const wolfVariant = getVariant(wolf, 'default');

test('stats: stage multiplies health, damage and size', () => {
  const adult = STAGES.adult;
  const s = computeStats({
    base: wolf.baseStats, sizeScale: adult.sizeScale, powerMult: adult.powerMult, levelBonus: 0, mods: [],
  });
  assert.equal(s.maxHealth, 90 * 1.8);
  assert.equal(s.damage, 11 * 1.8);
  assert.equal(s.size, 1.0);
  assert.equal(s.moveSpeed, 6.2);
});

test('stats: "speed" modifier hits move and sprint speed; percentages add', () => {
  const s = computeStats({
    base: wolf.baseStats, sizeScale: 0.6, powerMult: 1, levelBonus: 0,
    mods: [{ stat: 'speed', pct: 0.2 }, { stat: 'speed', pct: 0.25 }, { stat: 'defense', flat: 8 }],
  });
  assert.ok(Math.abs(s.moveSpeed - 6.2 * 1.45) < 1e-9);
  assert.ok(Math.abs(s.sprintSpeed - 10.5 * 1.45) < 1e-9);
  assert.equal(s.defense, 12);
  assert.equal(s.size, 0.6);
});

test('stats: a huge nerf cannot push a stat to zero or below', () => {
  const s = computeStats({
    base: wolf.baseStats, sizeScale: 1, powerMult: 1, levelBonus: 0, mods: [{ stat: 'speed', pct: -5 }],
  });
  assert.ok(s.moveSpeed > 0);
});

test('biome: wolf is buffed in forest, nerfed in jungle, neutral in plains', () => {
  const forest = activeBiomeMods(wolfVariant.biomeMods, 'forest', { nearWater: false });
  assert.deepEqual(toStatMods(forest), [{ stat: 'speed', pct: 0.2 }]);
  assert.equal(describeMod(forest[0]), '+20% Speed');
  const jungle = activeBiomeMods(wolfVariant.biomeMods, 'jungle', { nearWater: false });
  assert.equal(describeMod(jungle[0]), '-15% Speed');
  assert.equal(activeBiomeMods(wolfVariant.biomeMods, 'plains', { nearWater: false }).length, 0);
});

test('biome: crocodile jungle buff needs water nearby', () => {
  const croc = getVariant(getSpecies('crocodile'), 'default');
  assert.equal(activeBiomeMods(croc.biomeMods, 'jungle', { nearWater: false }).length, 0);
  const wet = activeBiomeMods(croc.biomeMods, 'jungle', { nearWater: true });
  assert.equal(describeMod(wet[0]), '+25% Damage near water');
});

test('biome: bear variants differ', () => {
  const bear = getSpecies('bear');
  const brown = activeBiomeMods(getVariant(bear, 'brown').biomeMods, 'forest', { nearWater: false });
  const polar = activeBiomeMods(getVariant(bear, 'polar').biomeMods, 'forest', { nearWater: false });
  assert.equal(describeMod(brown[0]), '+20% Max Health');
  assert.equal(polar.length, 0);
});

test('damage: defense reduces damage but never below 1', () => {
  assert.equal(mitigate(100, 0, 50), 100);
  assert.equal(mitigate(100, 50, 50), 50);
  assert.equal(mitigate(1, 500, 50), 1);
  assert.equal(mitigate(0, 10, 50), 0);
  assert.equal(lowHealthMultiplier(0.3, { threshold: 0.4, pct: 0.25 }), 1.25);
  assert.equal(lowHealthMultiplier(0.5, { threshold: 0.4, pct: 0.25 }), 1);
  assert.equal(lowHealthMultiplier(0.1, null), 1);
});

test('progression: new game starts as a level 1 juvenile with only the signature ability', () => {
  const p = newProgress(wolfVariant.abilities);
  assert.equal(p.level, 1);
  assert.equal(p.stage, 'juvenile');
  assert.deepEqual(p.abilityRanks, { wolf_pounce: 1 });
});

test('progression: XP levels up, carries the remainder and grants ability points', () => {
  const p = newProgress(wolfVariant.abilities);
  assert.equal(xpToNext(1), 20);
  assert.equal(addXp(p, 19), 0);
  assert.equal(addXp(p, 1 + xpToNext(2) + 5), 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 5);
  assert.equal(p.abilityPoints, 2);
  assert.equal(addXp(p, -10), 0);
  assert.equal(addXp(p, Number.NaN), 0);
  assert.equal(p.xp, 5);
});

test('progression: ability points unlock and upgrade up to max rank', () => {
  const p = newProgress(wolfVariant.abilities);
  const howl = getAbility('wolf_howl');
  assert.equal(upgradeAbility(p, howl), false, 'no points yet');
  p.abilityPoints = 5;
  assert.equal(upgradeAbility(p, howl), true);
  assert.equal(upgradeAbility(p, howl), true);
  assert.equal(upgradeAbility(p, howl), true);
  assert.equal(upgradeAbility(p, howl), false, 'already max rank');
  assert.equal(p.abilityRanks.wolf_howl, 3);
  assert.equal(p.abilityPoints, 2);
  assert.ok(Math.abs(abilityPower(howl, 3) - 1.4) < 1e-9);
});

test('progression: evolving needs BOTH a full growth meter and the level', () => {
  const p = newProgress(wolfVariant.abilities);
  assert.equal(addGrowth(p, 60), 60);
  assert.equal(addGrowth(p, 60), 40, 'meter is capped');
  assert.equal(evolveStatus(p).canEvolve, false, 'growth full but level too low');
  assert.equal(evolve(p), false);
  p.level = 8;
  p.growth = 50;
  assert.equal(evolveStatus(p).canEvolve, false, 'level ok but meter not full');
  p.growth = 100;
  assert.equal(evolve(p), true);
  assert.equal(p.stage, 'adult');
  assert.equal(p.growth, 0);
});

test('progression: Alpha is locked in milestone 1 even when requirements are met', () => {
  const p = newProgress(wolfVariant.abilities);
  p.stage = 'adult';
  p.level = 30;
  p.growth = 250;
  const status = evolveStatus(p, 'adult');
  assert.equal(status.locked, true);
  assert.equal(status.canEvolve, false);
  assert.equal(evolve(p, 'adult'), false);
  assert.equal(evolve(p, 'alpha'), true, 'unlocks once the milestone allows it');
  assert.equal(addGrowth(p, 10), 0, 'final stage has no meter');
});

test('progression: death costs XP progress only', () => {
  const p = newProgress(wolfVariant.abilities);
  p.level = 5;
  p.xp = 40;
  p.stage = 'adult';
  p.growth = 30;
  assert.equal(applyDeathPenalty(p), 10);
  assert.equal(p.xp, 30);
  assert.equal(p.level, 5);
  assert.equal(p.stage, 'adult');
  assert.equal(p.growth, 30);
});

test('progression: passives scale with rank', () => {
  const p = newProgress(wolfVariant.abilities);
  assert.equal(summarizePassives(p, wolfVariant.abilities).lowHealthBonus, null);
  p.abilityRanks.wolf_pack_hunter = 2;
  const s = summarizePassives(p, wolfVariant.abilities);
  assert.ok(s.lowHealthBonus);
  assert.ok(Math.abs(s.lowHealthBonus.pct - 0.3) < 1e-9);

  const polar = getVariant(getSpecies('bear'), 'polar');
  const bp = newProgress(polar.abilities);
  bp.abilityRanks.bear_thick_hide = 1;
  bp.abilityRanks.bear_arctic_swimmer = 1;
  const bs = summarizePassives(bp, polar.abilities);
  assert.deepEqual(bs.mods, [{ stat: 'defense', pct: undefined, flat: 8 }]);
  assert.equal(bs.swimSpeedPct, 0.5);
  assert.equal(bs.foodBonus.fish, 0.5);
});

test('progression: threat colour buckets', () => {
  assert.equal(threatLevel(10, 3), 'trivial');
  assert.equal(threatLevel(5, 4), 'easy');
  assert.equal(threatLevel(5, 6), 'even');
  assert.equal(threatLevel(5, 8), 'hard');
  assert.equal(threatLevel(1, 10), 'deadly');
});

test('terrain: arena and den are flat, the pond is below water, the edge rises', () => {
  const h = createForestHeight();
  const { arena, den, pond, worldRadius } = FOREST_LAYOUT;
  assert.ok(Math.abs(h(arena.x, arena.z) - h(arena.x + 12, arena.z - 9)) < 1e-6);
  assert.ok(Math.abs(h(den.x, den.z) - h(den.x + 5, den.z)) < 1e-6);
  assert.ok(h(pond.x, pond.z) < pond.waterY - 2);
  assert.ok(h(pond.x + pond.radius + 1, pond.z) > pond.waterY, 'shore is dry');
  assert.ok(h(worldRadius + 12, 0) > h(worldRadius - 10, 0) + 8);
});

test('terrain: no cliffs inside the playable area (walkable everywhere)', () => {
  const h = createForestHeight();
  const R = FOREST_LAYOUT.worldRadius - 4;
  let worst = 0;
  for (let x = -R; x <= R; x += 1.5) {
    for (let z = -R; z <= R; z += 1.5) {
      if (Math.hypot(x, z) > R) continue;
      const here = h(x, z);
      assert.ok(Number.isFinite(here));
      worst = Math.max(worst, Math.abs(h(x + 0.5, z) - here), Math.abs(h(x, z + 0.5) - here));
    }
  }
  assert.ok(worst < 0.6, `steepest 0.5 m step was ${worst.toFixed(2)} m`);
});
