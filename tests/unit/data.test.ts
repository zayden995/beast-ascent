import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITIES } from '../../src/data/abilities.ts';
import { BIOMES, BIOME_ORDER, FOREST_LAYOUT, FOREST_SPAWNS } from '../../src/data/biomes.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { FOODS, canEat } from '../../src/data/food.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { STAGES } from '../../src/data/stages.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { withinEatingHeight } from '../../src/logic/flight.ts';
import { parseSave, sanitizeSave } from '../../src/logic/saveData.ts';
import { newProgress } from '../../src/logic/progression.ts';
import { groundSprintSpeed, groundWalkSpeed, swimSpeedFactor } from '../../src/logic/stats.ts';

test('data: all seven species are defined; wolf, lion and bear are the ones playable in Milestone 1', () => {
  assert.deepEqual(
    SPECIES.map((s) => s.id).sort(),
    ['bear', 'crocodile', 'eagle', 'elephant', 'lion', 'tiger', 'wolf'],
  );
  assert.deepEqual(SPECIES.filter((s) => isPlayable(s, 1)).map((s) => s.id).sort(), ['bear', 'lion', 'wolf']);
  const bear = SPECIES.find((s) => s.id === 'bear');
  assert.deepEqual(bear?.variants.map((v) => v.id), ['brown', 'polar']);
});

// Update this list as each Milestone 2 species is finished (see PLAN.md).
test('data: Milestone 2 is complete: all seven species are playable and none is marked unfinished', () => {
  assert.equal(TUNING.currentMilestone, 2);
  const now = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone)).map((s) => s.id).sort();
  assert.deepEqual(now, ['bear', 'crocodile', 'eagle', 'elephant', 'lion', 'tiger', 'wolf']);
  assert.ok(SPECIES.every((s) => !s.unfinished));
});

test('data: the Tiger has stripes at every stage, and Ambush Strike and Stalk have real effects', () => {
  const tiger = SPECIES.find((s) => s.id === 'tiger');
  assert.ok(tiger);
  for (const stage of ['juvenile', 'adult', 'alpha'] as const) {
    assert.ok(tiger.stageFeatures[stage].includes('stripes'), `a ${stage} Tiger has stripes`);
  }
  assert.deepEqual(tiger.variants[0].abilities, ['tiger_ambush_strike', 'tiger_rend', 'tiger_double_claw', 'tiger_stalk']);
  const ambush = ABILITIES.tiger_ambush_strike.effect;
  assert.ok(ambush.kind === 'melee' && (ambush.behindBonus ?? 0) > 0, 'Ambush Strike hits harder from behind');
  const stalk = ABILITIES.tiger_stalk.effect;
  assert.ok(stalk.kind === 'passive' && stalk.whileUnseen === true && (stalk.mods?.length ?? 0) > 0, 'Stalk only works while unseen');
});

test('data: the Elephant has a trunk at every stage, eats plants, and Charge is a real ground dash', () => {
  const elephant = SPECIES.find((s) => s.id === 'elephant');
  assert.ok(elephant);
  for (const stage of ['juvenile', 'adult', 'alpha'] as const) {
    assert.ok(elephant.stageFeatures[stage].includes('trunk'), `a ${stage} Elephant has a trunk`);
  }
  assert.ok(elephant.stageFeatures.adult.includes('tusks'));
  assert.equal(elephant.diet, 'herbivore');
  assert.deepEqual(elephant.variants[0].abilities, ['elephant_charge', 'elephant_stomp', 'elephant_trunk_whip', 'elephant_thick_skin']);
  assert.equal(ABILITIES.elephant_charge.effect.kind, 'charge');
  // A herbivore must be able to grow: one sweep of the Forest's plants and berries fills an Adult meter.
  const sweep = FOREST_LAYOUT.plants * FOODS.plant.growth + FOREST_LAYOUT.berryBushes.length * FOODS.fruit.growth;
  assert.ok(FOREST_LAYOUT.plantsAtDen > 0 && FOREST_LAYOUT.plantsAtDen < FOREST_LAYOUT.plants);
  assert.ok(sweep >= STAGES.juvenile.growthToNext! * 2, `the Forest offers ${sweep} growth in a sweep`);
});

test('data: an ability that grabs holds its target in place: it must not knock the target away', () => {
  const grabbing = Object.values(ABILITIES).filter((a) => a.effect.kind === 'melee' && (a.effect.grab ?? 0) > 0);
  assert.ok(grabbing.length >= 2, 'the Death Roll and the Talon Grab');
  for (const a of grabbing) {
    assert.ok(a.effect.kind === 'melee' && a.effect.knockback === 0, `${a.id} pushes its target out of its own jaws or talons`);
  }
});

test('data: the Crocodile has a jaw, splayed legs and a heavy tail, and its abilities hold, roll and bite in water', () => {
  const croc = SPECIES.find((s) => s.id === 'crocodile');
  assert.ok(croc);
  assert.equal(croc.body.tail, 'heavy');
  for (const stage of ['juvenile', 'adult', 'alpha'] as const) {
    assert.ok(croc.stageFeatures[stage].includes('jaw') && croc.stageFeatures[stage].includes('sprawl'), `a ${stage} Crocodile has a jaw and splayed legs`);
  }
  assert.deepEqual(croc.variants.map((v) => v.id), ['default', 'alligator']);
  const roll = ABILITIES.croc_death_roll.effect;
  assert.ok(roll.kind === 'melee' && (roll.grab ?? 0) >= (roll.hits ?? 1) * (roll.hitInterval ?? 0), 'the grab lasts as long as the roll');
  const ambush = ABILITIES.croc_water_ambush.effect;
  assert.ok(ambush.kind === 'passive' && (ambush.waterDamage ?? 0) > 0);
  assert.equal(ambush.kind === 'passive' ? ambush.swim : undefined, undefined, 'the Crocodile swims fast by nature (swimSpeedMult), not by buying Water Ambush');
  const sweep = ABILITIES.croc_tail_sweep.effect;
  assert.ok(sweep.kind === 'melee' && sweep.arcDeg >= 360, 'the tail sweep is a full circle: no blind spot straight behind the animal');
});

test('data: the Eagle abilities: a dive that grows with height, a grab, a gust and a long-range eye', () => {
  const dive = ABILITIES.eagle_dive_strike.effect;
  assert.ok(dive.kind === 'leap' && (dive.dive?.bonusPerMetre ?? 0) > 0);
  const grab = ABILITIES.eagle_talon_grab.effect;
  assert.ok(grab.kind === 'melee' && (grab.grab ?? 0) > 0);
  const eye = ABILITIES.eagle_eye.effect;
  assert.ok(eye.kind === 'passive' && (eye.reveal ?? 0) > 42, 'it must see beyond the normal tag range of 42 m');
  assert.ok(TUNING.flight.ceiling > 12 && TUNING.flight.glideSink > 0 && TUNING.flight.climbSpeed > TUNING.flight.glideSink);
  // If animals noticed a flier from higher than the height they give up at, a chase would start and stop every frame.
  assert.ok(TUNING.flight.noticeAltitude <= TUNING.flight.giveUpAltitude, 'animals only start chasing a flier they would not give up on');
});

test('data: every ability a species lists exists, with exactly one signature', () => {
  for (const species of SPECIES) {
    for (const variant of species.variants) {
      const defs = variant.abilities.map((id) => {
        assert.ok(ABILITIES[id], `${species.id}/${variant.id} lists unknown ability ${id}`);
        return ABILITIES[id];
      });
      assert.equal(defs.filter((d) => d.signature).length, 1, `${species.id}/${variant.id} signature count`);
      assert.ok(defs[0].signature, `${species.id}/${variant.id}: signature must be first (key 1)`);
      const actives = defs.filter((d) => d.effect.kind !== 'passive');
      assert.ok(actives.length <= 3, `${species.id}/${variant.id} has more actives than keys`);
    }
  }
});

test('data: playable species have at least 3 unlockable abilities with no TODO effects', () => {
  for (const species of SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone))) {
    for (const variant of species.variants) {
      const unlockable = variant.abilities.map((id) => ABILITIES[id]).filter((d) => !d.signature);
      assert.ok(unlockable.length >= 3, `${species.id}/${variant.id} has ${unlockable.length} unlockables`);
      for (const id of variant.abilities) assert.equal(ABILITIES[id].todo, undefined, `${id} is a stub`);
    }
  }
});

test('data: stage table matches the bible', () => {
  assert.deepEqual(
    [STAGES.juvenile, STAGES.adult, STAGES.alpha].map((s) => [s.levelRequired, s.sizeScale, s.powerMult]),
    [[1, 0.6, 1.0], [8, 1.0, 1.8], [18, 1.4, 3.0]],
  );
});

test('data: biome order, forest boss and spawn zones are consistent', () => {
  assert.deepEqual(BIOME_ORDER, ['forest', 'jungle', 'plains', 'winter']);
  assert.ok(BIOMES.forest.implemented);
  assert.ok(BIOMES.forest.bossId && BOSSES[BIOMES.forest.bossId]);
  const kinds = new Set(FOREST_SPAWNS.map((z) => z.enemyId));
  assert.ok(kinds.size >= 3, 'at least 3 wild enemy types');
  for (const zone of FOREST_SPAWNS) {
    assert.ok(ENEMIES[zone.enemyId], `unknown enemy ${zone.enemyId}`);
    assert.ok(Math.hypot(zone.x, zone.z) + zone.radius < FOREST_LAYOUT.worldRadius, 'zone inside the world');
    assert.ok(zone.levelMin <= zone.levelMax);
  }
});

// Prey may out-sprint the slowest predators (the Elephant and the Crocodile are slow on purpose), but
// it only bolts for a few seconds and then tires, so every playable species can still catch it.
test('data: every animal that flees tires out, and a tired one can be walked down by every playable species', () => {
  const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
  const slowestWalk = Math.min(...playable.map((s) => groundWalkSpeed(s)));
  const runners = Object.values(ENEMIES).filter((e) => e.behavior.fleeOnSight || e.behavior.fleeHealthPct > 0);
  assert.ok(runners.length >= 2, 'deer and fox both flee');
  for (const e of runners) {
    const b = e.behavior;
    assert.ok(b.fleeBurst > 0 && b.windedSeconds > 0, `${e.id} never tires`);
    const tired = e.baseStats.sprintSpeed * b.windedSpeedMult;
    assert.ok(tired <= slowestWalk * 0.85, `a winded ${e.id} (${tired.toFixed(2)} m/s) must be clearly slower than the slowest walker (${slowestWalk} m/s)`);
    assert.ok(b.woundedSpeedMult > 0 && b.woundedSpeedMult <= 1);
  }
});

test('data: the heavy animals are the slow ones on land: the Elephant, then the Crocodile, then the Bear', () => {
  const by = (id: string) => SPECIES.find((s) => s.id === id)!.baseStats;
  assert.ok(by('elephant').moveSpeed < by('crocodile').moveSpeed && by('crocodile').moveSpeed < by('bear').moveSpeed, 'walking pace');
  assert.ok(by('elephant').sprintSpeed < by('crocodile').sprintSpeed && by('crocodile').sprintSpeed < by('bear').sprintSpeed, 'sprinting pace');
});

test('data: the Crocodile swims faster than it sprints on land; every other animal swims slower than it walks', () => {
  for (const s of SPECIES) {
    const water = s.baseStats.moveSpeed * swimSpeedFactor(s.swimSpeedMult, 0);
    if (s.id === 'crocodile') assert.ok(water > s.baseStats.sprintSpeed, `a Crocodile swims at ${water.toFixed(1)} m/s, a land sprint is ${s.baseStats.sprintSpeed}`);
    else assert.ok(water < s.baseStats.moveSpeed, `a ${s.id} swims at ${water.toFixed(1)} m/s, a walk is ${s.baseStats.moveSpeed}`);
  }
});

test('data: the Eagle is a bald eagle: the most fragile animal, with a longer reach and a white head and tail', () => {
  const eagle = SPECIES.find((s) => s.id === 'eagle')!;
  const others = SPECIES.filter((s) => s.id !== 'eagle');
  assert.ok(others.every((s) => eagle.baseStats.maxHealth < s.baseStats.maxHealth * 0.6), 'the Eagle has at most 60% of anyone else\'s health');
  assert.ok(eagle.attack.range >= 2, 'a basic attack reaches at least 2 m');
  const grab = ABILITIES.eagle_talon_grab.effect;
  assert.ok(grab.kind === 'melee' && grab.range >= eagle.attack.range, 'Talon Grab reaches at least as far as a basic attack');
  const variant = eagle.variants[0];
  assert.equal(eagle.variants.length, 1);
  assert.equal(variant.name, 'Bald Eagle');
  const pale = (c: number | undefined) => c !== undefined && [(c >> 16) & 255, (c >> 8) & 255, c & 255].every((ch) => ch >= 0xe0);
  assert.ok(pale(variant.colors.head) && pale(variant.colors.tail), 'white head and white tail');
  assert.ok(!pale(variant.colors.body), 'a dark body');
  const buffs = variant.biomeMods.map((m) => `${m.biome}:${m.stat}:${m.pct}`);
  assert.ok(buffs.includes('winter:speed:0.2'), 'faster in Winter');
  assert.ok(buffs.includes('jungle:speed:-0.2'), 'slower in the dense Jungle');
  assert.ok(!variant.biomeMods.some((m) => m.biome === 'plains'), 'no modifier on the Plains any more');
});

test('data: an animal can only eat from the air when it is low enough to reach the food', () => {
  assert.ok(TUNING.flight.eatAltitude > 0 && TUNING.flight.eatAltitude < TUNING.flight.noticeAltitude);
  assert.equal(withinEatingHeight(0, TUNING.flight.eatAltitude), true);
  assert.equal(withinEatingHeight(TUNING.flight.eatAltitude, TUNING.flight.eatAltitude), true);
  assert.equal(withinEatingHeight(TUNING.flight.eatAltitude + 0.1, TUNING.flight.eatAltitude), false);
  assert.equal(withinEatingHeight(20, TUNING.flight.eatAltitude), false);
});

// The user raised the limit from 3 to 5 so that the four Milestone 2 species can meet every rival.
const MAX_RIVALS_MET = 5;

// Since 2026-11-18 a player also meets wild animals of their own species, so every species meets every rival.
test('data: rival predators: every playable species meets 1 to 5 rivals, its own kind included, and can outrun them', () => {
  const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
  // A fight against a rival can always be escaped: by running, or for a winged animal by flying (see the Eagle test).
  const slowestSprint = Math.min(...playable.map((s) => (s.rig === 'winged' ? s.baseStats.sprintSpeed : groundSprintSpeed(s))));
  const rivalZones = FOREST_SPAWNS.filter((z) => z.rivalOf);
  assert.ok(rivalZones.length >= 2);
  for (const zone of rivalZones) {
    const def = ENEMIES[zone.enemyId];
    assert.ok(playable.some((s) => s.id === zone.rivalOf), `${zone.enemyId} is a rival of an unknown species`);
    assert.ok(def.behavior.aggressive && !def.behavior.fleeOnSight && def.attacks.length >= 2, `${def.id} must be a real fighter`);
    assert.ok(def.baseStats.sprintSpeed < slowestSprint, `${def.id} must be escapable by the slowest playable species`);
  }
  for (const species of playable) {
    const count = rivalZones.reduce((n, z) => n + z.count, 0);
    assert.ok(count >= 1 && count <= MAX_RIVALS_MET, `a ${species.id} meets ${count} rival predators`);
  }
});

test('data: wild animals see best ahead and worst behind, and the deer watches ahead farthest', () => {
  const sense = TUNING.enemies.senses;
  assert.ok(sense.frontHalfDeg > 0 && sense.rearHalfDeg > 0 && sense.frontHalfDeg + sense.rearHalfDeg < 180, 'the cones must not overlap');
  for (const e of Object.values(ENEMIES)) {
    const front = e.behavior.senses?.front ?? sense.front;
    const rear = e.behavior.senses?.rear ?? sense.rear;
    assert.ok(front >= 1, `${e.id} must see at least its normal range when it faces you`);
    assert.ok(rear > 0 && rear <= 0.5, `${e.id} must notice a hunter behind it at under half its range, but not never`);
  }
  const deer = ENEMIES.deer;
  const deerFront = deer.behavior.aggroRadius * (deer.behavior.senses?.front ?? sense.front);
  assert.ok(deerFront >= 13, `a deer facing a hunter should bolt from about 13 m or more (it sees ${deerFront.toFixed(1)} m)`);
  // Bosses ignore all of this (they notice anyone in their arena), so nothing here may rely on them.
  assert.ok(BOSSES.ancient_stag.enemy.behavior.aggroRadius > 0);
});

test('data: a boss pays full XP once, then a small repeat amount', () => {
  for (const boss of Object.values(BOSSES)) {
    assert.ok(boss.repeatXp > 0 && boss.repeatXp < boss.enemy.xp, `${boss.id}`);
  }
  assert.equal(BOSSES.ancient_stag.enemy.xp, 300);
  assert.equal(BOSSES.ancient_stag.repeatXp, 50);
});

test('data: the den refuge covers the spawn point and stays clear of spawn zones and the arena', () => {
  const { den, playerSpawn, arena } = FOREST_LAYOUT;
  const fromDen = (x: number, z: number) => Math.hypot(x - den.x, z - den.z);
  assert.ok(den.refugeRadius > den.radius);
  assert.ok(den.refugeRadius <= 12, 'the user found the first 18 m ring too big');
  // The spawn point stays where it is: moving it would reshuffle the Forest's trees, which are
  // placed from a seeded random sequence that depends on it.
  assert.ok(fromDen(playerSpawn.x, playerSpawn.z) < den.refugeRadius - 2, 'the player wakes inside the refuge, with room to spare');
  assert.ok(fromDen(arena.x, arena.z) > den.refugeRadius + arena.radius + 20);
  for (const zone of FOREST_SPAWNS) assert.ok(fromDen(zone.x, zone.z) > den.refugeRadius, `${zone.enemyId} zone is centred in the refuge`);
});

test('data: diets', () => {
  assert.ok(canEat('carnivore', 'carcass') && canEat('carnivore', 'fish'));
  assert.ok(!canEat('carnivore', 'fruit'));
  assert.ok(canEat('herbivore', 'fruit') && !canEat('herbivore', 'carcass'));
  assert.ok(canEat('omnivore', 'carcass') && canEat('omnivore', 'fruit') && canEat('omnivore', 'fish'));
});

const goodSave = () => ({
  version: 1,
  speciesId: 'bear',
  variantId: 'polar',
  progress: { ...newProgress(['bear_heavy_swipe']), level: 4, xp: 12, growth: 55 },
  unlockedBiomes: ['forest'],
  ruledBiomes: [],
});

test('save: a valid save round-trips through JSON', () => {
  const loaded = parseSave(JSON.stringify(goodSave()));
  assert.ok(loaded);
  assert.equal(loaded.speciesId, 'bear');
  assert.equal(loaded.variantId, 'polar');
  assert.equal(loaded.progress.level, 4);
  assert.equal(loaded.progress.growth, 55);
  assert.equal(loaded.progress.abilityRanks.bear_heavy_swipe, 1);
});

test('save: the wounded mark round-trips, and a save from before it existed loads as not wounded', () => {
  const adult = { ...goodSave().progress, stage: 'adult', level: 8, growth: 0 };
  assert.equal(parseSave(JSON.stringify({ ...goodSave(), progress: { ...adult, wounded: true } }))?.progress.wounded, true);
  assert.equal(parseSave(JSON.stringify({ ...goodSave(), progress: { ...adult, wounded: false } }))?.progress.wounded, false);

  const { wounded: _gone, ...oldStyle } = { ...adult, wounded: false };
  const old = parseSave(JSON.stringify({ ...goodSave(), progress: oldStyle }));
  assert.ok(old, 'a Milestone 1 save still loads');
  assert.equal(old.progress.wounded, false);

  assert.equal(parseSave(JSON.stringify({ ...goodSave(), progress: { ...adult, wounded: 'yes' } }))?.progress.wounded, false, 'only a real true counts');
  assert.equal(parseSave(JSON.stringify({ ...goodSave(), progress: { ...goodSave().progress, wounded: true } }))?.progress.wounded, false, 'a Juvenile is never wounded');
});

test('save: a Tiger save loads, and keeps the free signature ability', () => {
  const loaded = sanitizeSave({ ...goodSave(), speciesId: 'tiger', variantId: 'default' });
  assert.ok(loaded);
  assert.equal(loaded.speciesId, 'tiger');
  assert.equal(loaded.progress.abilityRanks.tiger_ambush_strike, 1);
  assert.equal(loaded.progress.abilityRanks.bear_heavy_swipe, undefined, 'abilities of another species are dropped');
});

test('save: corrupt, empty, old-version or locked-species saves are rejected', () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave(''), null);
  assert.equal(parseSave('{not json'), null);
  assert.equal(parseSave('[]'), null);
  assert.equal(parseSave('"hello"'), null);
  assert.equal(sanitizeSave({ ...goodSave(), version: 0 }), null);
  assert.equal(sanitizeSave({ ...goodSave(), speciesId: 'dragon' }), null);
  assert.equal(sanitizeSave({ ...goodSave(), progress: null }), null);
  assert.equal(sanitizeSave({ ...goodSave(), progress: { ...goodSave().progress, stage: 'elder' } }), null);
});

test('save: out-of-range values are clamped instead of trusted', () => {
  const s = sanitizeSave({
    ...goodSave(),
    variantId: 'purple',
    progress: {
      level: -3, xp: 1e9, abilityPoints: -2, stage: 'alpha', growth: 1e9,
      abilityRanks: { bear_heavy_swipe: 0, bear_maul: 99, hacked_ability: 3 },
    },
    unlockedBiomes: ['winter', 'moon'],
    ruledBiomes: 'all',
  });
  assert.ok(s);
  assert.equal(s.variantId, 'brown', 'unknown variant falls back to the first');
  assert.equal(s.progress.level, 1);
  assert.ok(s.progress.xp < 20);
  assert.equal(s.progress.abilityPoints, 0);
  assert.equal(s.progress.stage, 'alpha', 'Alpha is playable from Milestone 2');
  assert.equal(s.progress.growth, 0, 'Alpha has no growth meter, so nothing can be stored in it');
  assert.deepEqual(s.progress.abilityRanks, { bear_heavy_swipe: 1, bear_maul: 3 });
  assert.deepEqual(s.unlockedBiomes, ['forest', 'winter']);
  assert.deepEqual(s.ruledBiomes, []);
});

test('data: on foot the Eagle walks at about 4.2 m/s and sprints at 6, but still flies fast; everyone else is unchanged', () => {
  const eagle = SPECIES.find((s) => s.id === 'eagle')!;
  const elephant = SPECIES.find((s) => s.id === 'elephant')!;
  assert.ok(Math.abs(groundSprintSpeed(eagle) - 6) < 0.05, `a sprint on foot is 6 m/s (it is ${groundSprintSpeed(eagle)})`);
  assert.ok(groundWalkSpeed(eagle) >= elephant.baseStats.moveSpeed && groundWalkSpeed(eagle) < 4.3, 'on foot it walks about as slowly as the Elephant');
  assert.ok(groundSprintSpeed(eagle) > groundWalkSpeed(eagle) * 1.3, 'a sprint on foot is clearly faster than a walk');
  assert.ok(eagle.baseStats.sprintSpeed >= 12 && eagle.baseStats.moveSpeed >= 6.5, 'its flight is as fast as it was');
  for (const s of SPECIES.filter((sp) => sp.id !== 'eagle')) {
    assert.equal(groundSprintSpeed(s), s.baseStats.sprintSpeed, `${s.id} runs at its sprint speed`);
    assert.equal(groundWalkSpeed(s), s.baseStats.moveSpeed, `${s.id} walks at its walking speed`);
  }
});

test('data: the Eagle escapes a rival by flying: it is faster in the air, and a rival cannot follow it up', () => {
  const eagle = SPECIES.find((s) => s.id === 'eagle')!;
  const rivals = Object.values(ENEMIES).filter((e) => e.id.startsWith('rival_'));
  assert.ok(rivals.every((r) => eagle.baseStats.sprintSpeed > r.baseStats.sprintSpeed), 'it out-flies every rival');
  assert.ok(TUNING.flight.giveUpAltitude < TUNING.flight.ceiling, 'there is height to climb above the point where a chase is given up');
});
