import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAnimalModel } from '../../src/animals/AnimalModel.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { SPECIES, getSpecies, getVariant, isPlayable } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { groundSprintSpeed } from '../../src/logic/stats.ts';
import type { BodyPlan, FeatureId } from '../../src/core/types.ts';

const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
const sprintOf = (id: string): number => groundSprintSpeed(playable.find((s) => s.id === id)!);
const slowestSprint = Math.min(...playable.map((s) => (s.rig === 'winged' ? s.baseStats.sprintSpeed : groundSprintSpeed(s))));

test('plains animals: every animal of the Plains exists in the data', () => {
  for (const id of ['antelope', 'buffalo', 'hyena', 'den_lion', 'rival_elephant', 'alligator']) assert.ok(ENEMIES[id], `${id} is missing`);
  assert.ok(BOSSES.hyena_matriarch, 'the Hyena Matriarch is missing');
  assert.equal(BOSSES.hyena_matriarch.biome, 'plains');
});

// ---------- The antelope: harder to catch (asked for by the user, 2026-11-18) ----------

test('antelope: it flees and tires like other prey, but only the fast hunters (Wolf, Tiger, Lion) can sprint it down', () => {
  const a = ENEMIES.antelope;
  assert.ok(a.behavior.fleeOnSight && !a.behavior.aggressive && a.attacks.length === 0, 'it is prey: it runs and never fights');
  assert.ok(a.behavior.fleeBurst > 0 && a.behavior.windedSeconds > 0, 'it still tires, so the fast hunters can win in the end');
  const burst = a.baseStats.sprintSpeed;
  const tired = burst * a.behavior.windedSpeedMult;
  // The slow hunters (the Bear, the Crocodile, the Elephant) never gain on it, even when it is tired: they must corner it.
  for (const id of ['bear', 'crocodile', 'elephant']) {
    assert.ok(tired > sprintOf(id), `a tired antelope (${tired.toFixed(2)} m/s) must outrun a ${id} (${sprintOf(id)} m/s)`);
  }
  // The fast hunters sprint faster than it does even in its burst, so they gain on it all the time.
  for (const id of ['wolf', 'tiger', 'lion']) {
    assert.ok(burst < sprintOf(id), `a ${id} (${sprintOf(id)} m/s) must be able to run down an antelope in its burst (${burst} m/s)`);
  }
  assert.ok(a.behavior.woundedSpeedMult < 1, 'a bitten antelope slows down, so each bite helps the next');
  // It is harder to catch than the deer in every way.
  const deer = ENEMIES.deer;
  assert.ok(burst > deer.baseStats.sprintSpeed && a.behavior.fleeBurst > deer.behavior.fleeBurst, 'faster, and for longer');
});

// ---------- The others ----------

test('plains animals: the fighters can be escaped on foot, and the buffalo and the hyena are real fighters', () => {
  for (const id of ['buffalo', 'hyena', 'den_lion', 'rival_elephant', 'alligator']) {
    const def = ENEMIES[id];
    assert.ok(def.behavior.aggressive && !def.behavior.fleeOnSight && def.attacks.length >= 2, `${id} must be a real fighter`);
    assert.ok(def.baseStats.sprintSpeed < slowestSprint, `${id} must be escapable by the slowest playable species (${def.baseStats.sprintSpeed} against ${slowestSprint})`);
  }
  assert.ok(ENEMIES.buffalo.attacks.some((x) => x.kind === 'charge'), 'the buffalo charges');
  assert.ok(ENEMIES.hyena.attacks.some((x) => x.kind === 'charge') && ENEMIES.hyena.attacks.some((x) => x.kind === 'melee'), 'the hyena bites and lunges');
});

test('plains animals: the den lions are stronger than the hyenas, and look like the playable Lion', () => {
  const lion = ENEMIES.den_lion;
  const hyena = ENEMIES.hyena;
  assert.ok(lion.baseStats.maxHealth > hyena.baseStats.maxHealth * 1.4, 'a lion has much more health than a hyena');
  assert.ok(lion.baseStats.damage > hyena.baseStats.damage, 'and hits harder');
  const species = getSpecies('lion');
  assert.deepEqual(lion.body, species.body);
  assert.deepEqual(lion.features, species.stageFeatures.adult);
});

test('plains animals: the rival Elephant is built like the playable one, and the alligator has the Crocodile\'s Alligator skin', () => {
  const elephant = getSpecies('elephant');
  assert.deepEqual(ENEMIES.rival_elephant.body, elephant.body);
  assert.deepEqual(ENEMIES.rival_elephant.colors, getVariant(elephant, 'default').colors);
  const croc = getSpecies('crocodile');
  assert.deepEqual(ENEMIES.alligator.body, croc.body);
  assert.deepEqual(ENEMIES.alligator.colors, getVariant(croc, 'alligator').colors);
});

test('plains animals: the alligator lives in its lake: water plus an 8 m strip of shore', () => {
  const b = ENEMIES.alligator.behavior;
  assert.equal(b.waterBound, 8);
  assert.equal(b.aquatic, true);
  assert.ok(!('rivalOf' in ENEMIES.alligator), 'it is nobody\'s rival, so every animal meets it');
});

// ---------- The Hyena Matriarch ----------

test('hyena matriarch: the boss of the Plains calls packs of 3 hyenas, waits 6 s after the last one dies, and is stronger than the Silverback', () => {
  const boss = BOSSES.hyena_matriarch;
  assert.equal(boss.level, 30);
  assert.ok(boss.enemy.baseStats.maxHealth > BOSSES.silverback.enemy.baseStats.maxHealth, 'more health than the Jungle\'s boss');
  assert.ok(boss.enemy.baseStats.damage > BOSSES.silverback.enemy.baseStats.damage, 'and hits harder');
  assert.deepEqual(
    { enemyId: boss.summon?.enemyId, count: boss.summon?.count, waitSeconds: boss.summon?.waitSeconds },
    { enemyId: 'hyena', count: 3, waitSeconds: 6 },
  );
  assert.ok(ENEMIES[boss.summon!.enemyId], 'the pack is a real animal');
  assert.ok(boss.repeatXp > 0 && boss.repeatXp < boss.enemy.xp);
  assert.ok(boss.enemy.attacks.length >= 3, 'a bite, a lunge and an area attack');
  // The hyena look: a sloping back, spots, and a dark mane ridge.
  for (const f of ['slope', 'spots'] as FeatureId[]) assert.ok(boss.enemy.features.includes(f), `the boss is ${f}`);
});

test('hyena: a pack animal with a sloping back, spots and a dark ridge down its neck', () => {
  const h = ENEMIES.hyena;
  for (const f of ['slope', 'spots', 'ridge'] as FeatureId[]) assert.ok(h.features.includes(f), `the hyena has ${f}`);
  assert.equal(h.body.ears, 'round');
});

// ---------- The new rig markings ----------

function plainBody(): BodyPlan {
  return {
    bodyLength: 1.2, bodyHeight: 0.5, bodyWidth: 0.4, legLength: 0.55, legThickness: 0.09,
    neckLength: 0.3, neckAngle: 0.6, headSize: 0.34, snoutLength: 0.25, ears: 'round', earSize: 0.1, tail: 'thin', tailLength: 0.3, chestBulk: 1.1,
  };
}
const build = (features: FeatureId[]) =>
  createAnimalModel({ body: plainBody(), colors: { body: 0xb89a62, belly: 0xd9c79c, accent: 0x4a3a22 }, features, size: 1, headScale: 1 });
const vertices = (model: { root: THREE.Object3D }): number => {
  let n = 0;
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) n += mesh.geometry.attributes.position.count;
  });
  return n;
};

test('rig: a sloping back raises the shoulders and the head above the hips', () => {
  const flat = build([]);
  const sloped = build(['slope']);
  assert.ok(sloped.height > flat.height + 0.05, `sloped ${sloped.height.toFixed(2)} m against flat ${flat.height.toFixed(2)} m`);
  const lowSlope = build(['slope']);
  const gorilla = build(['knuckle']);
  assert.ok(gorilla.height > lowSlope.height, 'but the hyena\'s slope is gentler than the gorilla\'s knuckle-walking pitch');
});

test('rig: spots and horns add parts to the model', () => {
  const base = vertices(build([]));
  assert.ok(vertices(build(['spots'])) > base, 'spots');
  assert.ok(vertices(build(['horns'])) > base, 'horns');
  assert.ok(vertices(build(['bullHorns'])) > base, 'broad horns');
  assert.ok(vertices(build(['bullHorns'])) > vertices(build(['horns'])) * 0.8, 'broad horns are at least as heavy as thin ones');
});

test('rig: horns stand above the head', () => {
  const none = build([]);
  assert.ok(build(['horns']).height > none.height, 'long horns reach above the head');
});
