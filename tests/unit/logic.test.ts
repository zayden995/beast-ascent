import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAbility } from '../../src/data/abilities.ts';
import { FOREST_LAYOUT } from '../../src/data/biomes.ts';
import { STAGES, previousStage } from '../../src/data/stages.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { getSpecies, getVariant } from '../../src/data/species.ts';
import { activeBiomeMods, describeMod, toStatMods } from '../../src/logic/biome.ts';
import { isBehind, lowHealthMultiplier, mitigate, withinVerticalReach } from '../../src/logic/damage.ts';
import { clampAltitude, stepVerticalSpeed } from '../../src/logic/flight.ts';
import { describeDeath } from '../../src/logic/deathText.ts';
import { createForestHeight } from '../../src/logic/heightfield.ts';
import { noticeMultiplier } from '../../src/logic/senses.ts';
import { withArticle } from '../../src/logic/text.ts';
import { ColliderGrid } from '../../src/world/colliders.ts';
import { playerIsUnseen } from '../../src/logic/stealth.ts';
import {
  abilityPower, addGrowth, addXp, applyDeath, evolve, evolveStatus, newProgress,
  summarizePassives, threatLevel, upgradeAbility, xpToNext,
} from '../../src/logic/progression.ts';
import { advanceDay, dayState, wrapDay } from '../../src/logic/dayNight.ts';
import { computeStats, groundSprintSpeed, groundWalkSpeed, swimSpeedFactor } from '../../src/logic/stats.ts';

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

test('damage: a hit lands from behind only when the attacker is in the rear arc of the target', () => {
  // Yaw 0 faces +z, yaw PI faces -z (see Actor.faceToward).
  assert.equal(isBehind(0, 0, 0, 0, -2), true, 'directly behind');
  assert.equal(isBehind(0, 0, 0, 0, 2), false, 'directly in front');
  assert.equal(isBehind(0, 0, 0, 2, 0), false, 'level with the target is a flank, not behind');
  const deg = (d: number) => (d * Math.PI) / 180;
  assert.equal(isBehind(0, 0, 0, 2 * Math.sin(deg(115)), 2 * Math.cos(deg(115))), false, '115 degrees from its facing is still a flank');
  assert.equal(isBehind(0, 0, 0, 2 * Math.sin(deg(125)), 2 * Math.cos(deg(125))), true, '125 degrees from its facing is inside the rear arc');
  assert.equal(isBehind(0, 0, 0, 2 * Math.sin(deg(-125)), 2 * Math.cos(deg(-125))), true, 'the arc is symmetric');
  assert.equal(isBehind(Math.PI, 5, 5, 5, 8), true, 'a target facing -z has its back to +z');
  assert.equal(isBehind(Math.PI / 2, 0, 0, -3, 0), true, 'a target facing +x has its back to -x');
  assert.equal(isBehind(0, 3, 3, 3, 3), false, 'standing on the target is not behind it');
});

test('senses: an animal sees best straight ahead and worst straight behind, with a blend on the sides', () => {
  const cone = { frontHalfDeg: 60, rearHalfDeg: 30 };
  const normal = { front: 1, rear: 0.25 };
  const deg = (d: number) => (d * Math.PI) / 180;
  // The animal faces yaw 0 (+z). `look(d)` is a thing d degrees to its right of where it faces.
  const look = (ranges: { front: number; rear: number }, d: number, yaw = 0) =>
    noticeMultiplier(yaw, Math.sin(deg(d) + yaw) * 5, Math.cos(deg(d) + yaw) * 5, ranges, cone);
  assert.equal(look(normal, 0), 1, 'straight ahead: full range');
  assert.equal(look(normal, 59), 1, 'anywhere in the front cone: full range');
  assert.ok(Math.abs(look(normal, 105) - 0.625) < 1e-9, 'halfway between the cones: halfway between the ranges');
  assert.equal(look(normal, 160), 0.25, 'in the rear cone: short range');
  assert.equal(look(normal, 180), 0.25, 'straight behind: short range');
  assert.ok(Math.abs(look(normal, -105) - look(normal, 105)) < 1e-9, 'left and right are the same');
  assert.equal(look(normal, 0, Math.PI / 2), 1, 'it works whichever way the animal faces');
  assert.equal(look(normal, 180, Math.PI / 2), 0.25);
  assert.equal(noticeMultiplier(0, 0, 0, normal, cone), 1, 'standing on top of the animal counts as ahead');

  const prey = { front: 1.35, rear: 0.25 };
  assert.equal(look(prey, 0), 1.35, 'prey that faces you sees you farther than its normal range');
  assert.equal(look(prey, 180), 0.25, 'but it still cannot see behind itself');
  for (const d of [0, 30, 60, 90, 120, 150, 180]) {
    assert.ok(look(prey, d) >= look(normal, d), 'prey never sees worse than a predator at the same angle');
    assert.ok(look(normal, d) >= look(normal, d + 10) - 1e-9 || d + 10 > 180, 'turning away never helps an animal see');
  }
});

test('text: "a" or "an" goes in front of a species name', () => {
  assert.equal(withArticle('Elephant'), 'an Elephant');
  assert.equal(withArticle('Eagle'), 'an Eagle');
  assert.equal(withArticle('Tiger'), 'a Tiger');
  assert.equal(withArticle('crocodile'), 'a crocodile');
});

const FLIGHT = { climbSpeed: 5, verticalLambda: 6, glideSink: 2.2, ceiling: 25 };

test('flight: flapping climbs, letting go glides down gently, and neither passes its limit', () => {
  let vy = 0;
  for (let i = 0; i < 60; i++) vy = stepVerticalSpeed(vy, true, 3, 1 / 60, FLIGHT);
  assert.ok(vy > 0 && vy <= FLIGHT.climbSpeed, `after a second of flapping vy is ${vy.toFixed(2)}`);
  assert.ok(vy > FLIGHT.climbSpeed * 0.9, 'it is close to the climb speed within a second');
  for (let i = 0; i < 120; i++) vy = stepVerticalSpeed(vy, false, 10, 1 / 60, FLIGHT);
  assert.ok(vy < 0 && vy >= -FLIGHT.glideSink - 1e-9, `gliding sinks at ${vy.toFixed(2)} m/s, no faster than the glide speed`);
  assert.ok(Math.abs(vy + FLIGHT.glideSink) < 0.05, 'and it settles at the glide speed');
});

test('flight: at the ceiling flapping stops helping, and the altitude is clamped', () => {
  let vy = FLIGHT.climbSpeed;
  for (let i = 0; i < 120; i++) vy = stepVerticalSpeed(vy, true, FLIGHT.ceiling, 1 / 60, FLIGHT);
  assert.ok(vy < 0, 'flapping at the ceiling cannot climb any further');
  assert.equal(clampAltitude(40, FLIGHT), 25);
  assert.equal(clampAltitude(12, FLIGHT), 12);
  assert.equal(clampAltitude(-3, FLIGHT), 0, 'never below the ground');
});

test('flight: the same step size or a huge one gives the same kind of answer (no overshoot)', () => {
  const small = stepVerticalSpeed(0, true, 1, 1 / 60, FLIGHT);
  const huge = stepVerticalSpeed(0, true, 1, 5, FLIGHT);
  assert.ok(small > 0 && small < huge);
  assert.ok(huge <= FLIGHT.climbSpeed + 1e-9, 'a long frame cannot push the climb past its speed');
});

test('combat: a hit reaches across a big height gap only between animals that are both on the ground', () => {
  assert.equal(withinVerticalReach(3.5, 1.2, false), true, 'ground animals keep the generous window: 3 m plus their height');
  assert.equal(withinVerticalReach(5, 1.2, false), false);
  assert.equal(withinVerticalReach(2.3, 1.2, true), true, 'against a flier the window is the attacker height plus 1.2 m');
  assert.equal(withinVerticalReach(3, 1.2, true), false, 'a boar cannot hit an eagle 3 m above it');
  assert.equal(withinVerticalReach(-3, 1.2, true), false, 'or one 3 m below it');
  assert.equal(withinVerticalReach(1.6, 0.5, true), true, 'an eagle has to come down to about 1.7 m to bite');
  assert.equal(withinVerticalReach(2.5, 0.5, true), false);
});

test('colliders: a trunk only blocks an animal that is below its top, so an eagle can fly over', () => {
  const grid = new ColliderGrid();
  grid.add(0, 0, 1, 4); // a trunk 4 m tall
  const low = { x: 0.5, z: 0 };
  grid.resolve(low, 0.5, 0);
  assert.ok(Math.hypot(low.x, low.z) >= 1.5 - 1e-6, 'on the ground it is pushed out');
  const high = { x: 0.5, z: 0 };
  grid.resolve(high, 0.5, 5);
  assert.equal(high.x, 0.5, 'above the top it passes over');
  assert.equal(grid.blocked(0.5, 0, 0.5, 5), false);
  assert.equal(grid.blocked(0.5, 0, 0.5, 1), true);
  grid.add(10, 0, 1); // no height given: solid at every altitude, like a wall
  const wall = { x: 10.5, z: 0 };
  grid.resolve(wall, 0.5, 30);
  assert.ok(Math.hypot(wall.x - 10, wall.z) >= 1.5 - 1e-6, 'a collider without a height always blocks');
});

test('passives: Water Ambush adds damage in water and grows with rank', () => {
  const croc = getVariant(getSpecies('crocodile'), 'default');
  const p = newProgress(croc.abilities);
  assert.equal(summarizePassives(p, croc.abilities).waterDamagePct, 0, 'locked: nothing');
  p.abilityRanks.croc_water_ambush = 1;
  const rank1 = summarizePassives(p, croc.abilities);
  assert.ok(rank1.waterDamagePct > 0);
  p.abilityRanks.croc_water_ambush = 3;
  assert.ok(Math.abs(summarizePassives(p, croc.abilities).waterDamagePct - rank1.waterDamagePct * 1.4) < 1e-9);
});

test('stealth: the player is unseen only while no animal is chasing, fighting or fleeing from it', () => {
  assert.equal(playerIsUnseen([]), true);
  assert.equal(playerIsUnseen(['idle', 'wander', 'return']), true, 'animals that have not noticed you, or gave up');
  for (const reacting of ['chase', 'windup', 'charging', 'recover', 'flee']) {
    assert.equal(playerIsUnseen(['idle', reacting, 'wander']), false, `an animal in "${reacting}" has noticed you`);
  }
});

test('passives: Stalk speeds the Tiger up only while unseen, and grows with rank', () => {
  const tiger = getVariant(getSpecies('tiger'), 'default');
  const p = newProgress(tiger.abilities);
  assert.deepEqual(summarizePassives(p, tiger.abilities).unseenMods, [], 'locked: nothing');
  p.abilityRanks.tiger_stalk = 1;
  const rank1 = summarizePassives(p, tiger.abilities);
  assert.deepEqual(rank1.mods, [], 'it must never be an always-on bonus');
  assert.equal(rank1.unseenMods.length, 1);
  assert.equal(rank1.unseenMods[0].stat, 'speed');
  p.abilityRanks.tiger_stalk = 3;
  const rank3 = summarizePassives(p, tiger.abilities);
  assert.ok((rank3.unseenMods[0].pct ?? 0) > (rank1.unseenMods[0].pct ?? 0), 'a higher rank is faster');
  assert.ok(Math.abs((rank3.unseenMods[0].pct ?? 0) - (rank1.unseenMods[0].pct ?? 0) * 1.4) < 1e-9);
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

test('progression: a stage the game does not allow yet stays locked even when the requirements are met', () => {
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

/** A grown wolf with some abilities bought, for the death tests. */
function grownWolf(stage: 'juvenile' | 'adult' | 'alpha', level: number) {
  const p = newProgress(wolfVariant.abilities);
  p.stage = stage;
  p.level = level;
  p.xp = 40;
  p.abilityPoints = 3;
  p.growth = stage === 'alpha' ? 0 : 30;
  p.abilityRanks.wolf_howl = 2;
  p.abilityRanks.wolf_pounce = 3;
  p.abilityRanks.wolf_pack_hunter = 1;
  return p;
}

test('stages: previousStage steps back one life stage and stops at Juvenile', () => {
  assert.equal(previousStage('alpha'), 'adult');
  assert.equal(previousStage('adult'), 'juvenile');
  assert.equal(previousStage('juvenile'), null);
});

test('progression: a new animal is not wounded', () => {
  assert.equal(newProgress(wolfVariant.abilities).wounded, false);
});

test('progression: a first death keeps the life stage, drops to its first level and wounds the animal', () => {
  const p = grownWolf('adult', 12);
  const same = p;
  const out = applyDeath(p, wolfVariant.abilities);
  assert.equal(p, same, 'the same object is kept, because the save and the systems hold on to it');
  assert.deepEqual(out, { dropped: false, from: 'adult', stage: 'adult', level: STAGES.adult.levelRequired, wounded: true });
  assert.equal(p.stage, 'adult');
  assert.equal(p.level, 8, 'an Adult starts again at level 8, where it evolved');
  assert.equal(p.xp, 0);
  assert.equal(p.growth, 30, 'food already eaten is not lost while the stage is kept');
  assert.equal(p.wounded, true);
});

test('progression: death refunds bought abilities as points, so a level never holds more than it earned', () => {
  const p = grownWolf('adult', 12);
  applyDeath(p, wolfVariant.abilities);
  assert.deepEqual(p.abilityRanks, { wolf_pounce: 1 }, 'only the free signature ability stays, at rank 1');
  assert.equal(p.abilityPoints, 7, 'one point for each level above 1, all of them unspent');
  assert.equal(summarizePassives(p, wolfVariant.abilities).lowHealthBonus, null);
});

test('progression: dying again before gaining a level drops one life stage, down to Juvenile', () => {
  const p = grownWolf('alpha', 25);
  assert.equal(applyDeath(p, wolfVariant.abilities).dropped, false);
  assert.equal(p.stage, 'alpha');
  assert.equal(p.level, 18);

  const second = applyDeath(p, wolfVariant.abilities);
  assert.deepEqual(second, { dropped: true, from: 'alpha', stage: 'adult', level: 8, wounded: true });
  assert.equal(p.stage, 'adult');
  assert.equal(p.level, 8);
  assert.equal(p.abilityPoints, 7);
  assert.equal(p.growth, 0, 'falling a stage empties the growth meter: the animal has to eat its way up again');
  assert.equal(p.wounded, true, 'still wounded, so another death keeps costing stages');

  const third = applyDeath(p, wolfVariant.abilities);
  assert.deepEqual(third, { dropped: true, from: 'adult', stage: 'juvenile', level: 1, wounded: false });
  assert.equal(p.level, 1);
  assert.equal(p.abilityPoints, 0);
  assert.equal(p.wounded, false, 'a Juvenile has nothing left to lose, so it is not marked wounded');

  const fourth = applyDeath(p, wolfVariant.abilities);
  assert.equal(fourth.dropped, false);
  assert.equal(p.stage, 'juvenile');
  assert.equal(p.level, 1);
});

test('progression: gaining a level heals the wound, so the next death is a first death again', () => {
  const p = grownWolf('adult', 12);
  applyDeath(p, wolfVariant.abilities);
  assert.equal(p.wounded, true);
  assert.equal(addXp(p, xpToNext(p.level) - 1), 0);
  assert.equal(p.wounded, true, 'XP that does not make a level changes nothing');
  assert.equal(addXp(p, 1), 1);
  assert.equal(p.wounded, false);
  const out = applyDeath(p, wolfVariant.abilities);
  assert.equal(out.dropped, false);
  assert.equal(p.stage, 'adult');
});

test('progression: a Juvenile dies back to level 1 and is never marked wounded', () => {
  const p = grownWolf('juvenile', 5);
  const out = applyDeath(p, wolfVariant.abilities);
  assert.deepEqual(out, { dropped: false, from: 'juvenile', stage: 'juvenile', level: 1, wounded: false });
  assert.equal(p.abilityPoints, 0);
  assert.deepEqual(p.abilityRanks, { wolf_pounce: 1 });
});

test('death text: says what was lost, where the animal wakes and whether it is wounded', () => {
  const kept = describeDeath({ dropped: false, from: 'adult', stage: 'adult', level: 8, wounded: true }, 'Grey Wolf');
  assert.match(kept.lost, /keep your life stage/i);
  assert.match(kept.wake, /level 8 Adult Grey Wolf/);
  assert.match(kept.wake, /wounded/i, 'a wounded animal is warned that another death costs a stage');

  const fell = describeDeath({ dropped: true, from: 'alpha', stage: 'adult', level: 8, wounded: true }, 'Grey Wolf');
  assert.match(fell.lost, /Alpha to Adult/);
  assert.match(fell.wake, /level 8 Adult Grey Wolf/);
  assert.match(fell.wake, /wounded/i);

  const juvenile = describeDeath({ dropped: false, from: 'juvenile', stage: 'juvenile', level: 1, wounded: false }, 'Grey Wolf');
  assert.match(juvenile.wake, /level 1 Juvenile Grey Wolf/);
  assert.doesNotMatch(juvenile.wake, /wounded/i, 'a Juvenile has nothing left to lose, so there is no warning');
});

test('progression: death never raises a level that was already below its stage floor', () => {
  const p = grownWolf('adult', 3);
  applyDeath(p, wolfVariant.abilities);
  assert.equal(p.level, 3);
  assert.equal(p.abilityPoints, 2);
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

test('day and night: noon is bright, midnight is dark, the horizon glows in between', () => {
  const bias = TUNING.dayNight.dayBias;
  const noon = dayState(0.5, bias);
  assert.equal(noon.phase, 'day');
  assert.ok(Math.abs(noon.elevation - 1) < 1e-9 && noon.daylight === 1 && noon.twilight === 0);
  const midnight = dayState(0, bias);
  assert.equal(midnight.phase, 'night');
  assert.ok(midnight.elevation < 0 && midnight.daylight === 0 && midnight.twilight === 0);

  // One full day passes through dawn, day, dusk and night, in that order, exactly once each.
  const order: string[] = [];
  let sunUp = 0;
  const steps = 2000;
  for (let i = 0; i < steps; i++) {
    const s = dayState(i / steps, bias);
    if (order[order.length - 1] !== s.phase) order.push(s.phase);
    if (s.elevation > 0) sunUp++;
    assert.ok(s.daylight >= 0 && s.daylight <= 1 && s.twilight >= 0 && s.twilight <= 1);
  }
  assert.deepEqual(order, ['night', 'dawn', 'day', 'dusk', 'night']);
  assert.ok(sunUp / steps > 0.5, 'the day is longer than the night');
  // With this bias the sun crosses the horizon at about 0.21 and 0.79.
  assert.ok(dayState(0.21, bias).twilight > 0.9 && dayState(0.79, bias).twilight > 0.9, 'sunrise and sunset glow');
});

test('day and night: time advances with the cycle length and wraps around', () => {
  assert.ok(Math.abs(advanceDay(0.5, 120, 480) - 0.75) < 1e-9);
  assert.ok(Math.abs(advanceDay(0.9, 96, 480) - 0.1) < 1e-9, 'wraps past midnight');
  assert.ok(Math.abs(wrapDay(-0.25) - 0.75) < 1e-9);
  assert.equal(dayState(1.5, 0).phase, dayState(0.5, 0).phase);
  assert.equal(dayState(TUNING.dayNight.startAt, TUNING.dayNight.dayBias).phase, 'day', 'a session starts in daylight');
});

test('swimming: an animal swims at the standard fraction of its pace unless its species or a passive says otherwise', () => {
  assert.equal(swimSpeedFactor(undefined, 0), TUNING.player.swimSpeedMult, 'the standard fraction, 60% for now');
  assert.equal(swimSpeedFactor(1.8, 0), 1.8, 'a species can swim faster than it walks');
  assert.ok(Math.abs(swimSpeedFactor(undefined, 0.5) - TUNING.player.swimSpeedMult * 1.5) < 1e-9, 'a passive adds to the standard fraction');
  assert.ok(Math.abs(swimSpeedFactor(1.8, 0.25) - 1.8 * 1.25) < 1e-9);
});

test('running on foot: a species sprints at its sprint speed unless it has a slower foot pace', () => {
  assert.equal(groundSprintSpeed({ baseStats: { sprintSpeed: 10 } }), 10);
  assert.equal(groundSprintSpeed({ baseStats: { sprintSpeed: 12 }, groundSprintMult: 0.5 }), 6);
});

test('walking on foot: a species walks at its walking pace unless it has a slower foot pace', () => {
  assert.equal(groundWalkSpeed({ baseStats: { moveSpeed: 6 } }), 6);
  assert.equal(groundWalkSpeed({ baseStats: { moveSpeed: 6.5 }, groundWalkMult: 0.5 }), 3.25);
});
