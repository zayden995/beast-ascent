import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAnimalModel, createAnimState } from '../../src/animals/AnimalModel.ts';
import type { Stats } from '../../src/core/types.ts';
import { PETS, PET_TUNING } from '../../src/data/pets.ts';
import type { PetKind } from '../../src/data/pets.ts';
import { chooseFoe, eggAppears, followPlan, newPetCare, petStats, pickPetTarget, stepPetCare } from '../../src/logic/pet.ts';
import type { PetCandidate, PetCare, PetCareEvent } from '../../src/logic/pet.ts';

// The pet step, agreed with the user on 2026-11-19 (the bible's Decisions Log, "M3, the pet: design").

const KINDS: PetKind[] = ['liger', 'hyena'];

const player: Stats = {
  maxHealth: 600, stamina: 120, staminaRegen: 18, damage: 50, moveSpeed: 5.6, sprintSpeed: 9.6,
  attackSpeed: 1.5, defense: 12, size: 1.4,
};

// ---------- The data ----------

test('pet data: a liger cub and a hyena pup, small, with the agreed shares of the player\'s strength', () => {
  assert.equal(PETS.liger.name, 'Liger cub');
  assert.equal(PETS.hyena.name, 'Hyena pup');
  assert.equal(PETS.liger.healthPct, 0.35);
  assert.equal(PETS.liger.damagePct, 0.30);
  assert.equal(PETS.hyena.healthPct, 0.40);
  assert.equal(PETS.hyena.damagePct, 0.20);
  assert.ok(PETS.hyena.speedMult > PETS.liger.speedMult, 'the pup is a little quicker');
  for (const k of KINDS) assert.ok(PETS[k].size > 0.4 && PETS[k].size < 0.7, `${k} is a baby (about 0.55)`);
});

test('pet data: the timings and distances of the design', () => {
  const T = PET_TUNING;
  assert.equal(T.hatchSeconds, 10);
  assert.equal(T.injuredSeconds, 60);
  assert.equal(T.tendSeconds, 3);
  assert.equal(T.tendRange, 2.5);
  assert.equal(T.reviveHealthPct, 0.4);
  assert.equal(T.warpBeyond, 35);
  assert.equal(T.assistSeconds, 8);
  assert.equal(T.fightRange, 15);
  assert.equal(T.breakOffRange, 20);
});

test('pet data: both pets build and animate as models (no number that is not a number)', () => {
  for (const k of KINDS) {
    const p = PETS[k];
    const model = createAnimalModel({ body: p.body, colors: p.colors, features: p.features, size: p.size, headScale: 1 });
    for (let i = 0; i < 10; i++) model.update(1 / 30, { ...createAnimState(), speed: 2 });
    const box = new THREE.Box3().setFromObject(model.root);
    assert.ok(Number.isFinite(box.max.y) && box.max.y > 0.2, `${k} has a body`);
    assert.ok(!p.features.includes('mane') && !p.features.includes('maneSmall'), `${k} has no mane: it is a baby`);
    model.dispose();
  }
  assert.ok(PETS.liger.features.includes('stripes'), 'a liger has faint tiger stripes');
});

// ---------- Its strength follows the player's ----------

test('petStats: health and damage are the agreed shares of the player\'s; defense is the same; size is the pet\'s own', () => {
  for (const k of KINDS) {
    const def = PETS[k];
    const s = petStats(player, def);
    assert.equal(s.maxHealth, Math.round(600 * def.healthPct));
    assert.ok(Math.abs(s.damage - 50 * def.damagePct) < 1e-9);
    assert.equal(s.defense, 12);
    assert.equal(s.size, def.size);
    assert.ok(Math.abs(s.moveSpeed - 5.6 * def.speedMult) < 1e-9);
    assert.ok(Math.abs(s.sprintSpeed - 9.6 * def.speedMult) < 1e-9, 'it keeps up with the player');
  }
});

test('petStats: a stronger player has a stronger pet', () => {
  const weak = petStats({ ...player, maxHealth: 200, damage: 20 }, PETS.liger);
  const strong = petStats(player, PETS.liger);
  assert.ok(strong.maxHealth > weak.maxHealth && strong.damage > weak.damage);
});

// ---------- The egg ----------

test('eggAppears: only at a den that gives eggs, only once all its guards are dead, only for a slot with no pet', () => {
  assert.equal(eggAppears({ eggOf: 'liger', guardsAlive: 0, hasPet: false }), true);
  assert.equal(eggAppears({ eggOf: 'hyena', guardsAlive: 0, hasPet: false }), true);
  assert.equal(eggAppears({ eggOf: 'liger', guardsAlive: 1, hasPet: false }), false, 'one guard still alive');
  assert.equal(eggAppears({ eggOf: 'liger', guardsAlive: 0, hasPet: true }), false, 'one pet per slot');
  assert.equal(eggAppears({ eggOf: undefined, guardsAlive: 0, hasPet: false }), false, 'the Jungle cave gives no egg');
});

// ---------- Hatching, injury, tending and death ----------

/**
 * Runs the care for `seconds` in steps, with the same inputs each step; returns every event. Like the game, it gives a revived
 * pet its health back (40 of 100), so a revived pet is not injured again on the next step.
 */
function run(care: PetCare, seconds: number, input: { hp: number; tending: boolean; playerHit?: boolean }, dt = 0.1): PetCareEvent[] {
  const events: PetCareEvent[] = [];
  let hp = input.hp;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const e = stepPetCare(care, { hp, tending: input.tending, playerHit: input.playerHit ?? false }, dt);
    if (e === 'revived') hp = 40;
    if (e !== 'none') events.push(e);
  }
  return events;
}

test('pet care: an egg hatches after 10 s, and only once', () => {
  const care = newPetCare('egg');
  assert.deepEqual(run(care, 9.5, { hp: 100, tending: false }), []);
  assert.deepEqual(run(care, 1, { hp: 100, tending: false }), ['hatched']);
  assert.equal(care.phase, 'healthy');
  assert.deepEqual(run(care, 30, { hp: 100, tending: false }), []);
});

test('pet care: at 0 health a healthy pet becomes injured, not dead', () => {
  const care = newPetCare('healthy');
  assert.equal(stepPetCare(care, { hp: 0, tending: false, playerHit: false }, 0.016), 'injured');
  assert.equal(care.phase, 'injured');
  assert.ok(Math.abs(care.injuredLeft - 60) < 0.1);
});

test('pet care: an injured pet that is not tended dies when the 60 s run out', () => {
  const care = newPetCare('injured');
  assert.deepEqual(run(care, 59.5, { hp: 0, tending: false }), []);
  assert.deepEqual(run(care, 1, { hp: 0, tending: false }), ['died']);
  assert.equal(care.phase, 'dead');
  assert.deepEqual(run(care, 30, { hp: 0, tending: true }), [], 'a dead pet cannot be tended back');
});

test('pet care: holding E beside it for 3 s brings it back', () => {
  const care = newPetCare('injured');
  run(care, 20, { hp: 0, tending: false });
  assert.deepEqual(run(care, 2.8, { hp: 0, tending: true }), [], 'not yet at 2.8 s');
  assert.deepEqual(run(care, 0.3, { hp: 0, tending: true }), ['revived']);
  assert.equal(care.phase, 'healthy');
});

test('pet care: letting go of E starts the 3 s again', () => {
  const care = newPetCare('injured');
  run(care, 2.5, { hp: 0, tending: true });
  run(care, 0.2, { hp: 0, tending: false });
  assert.deepEqual(run(care, 2.5, { hp: 0, tending: true }), [], 'the first 2.5 s were lost');
  assert.deepEqual(run(care, 0.6, { hp: 0, tending: true }), ['revived']);
});

test('pet care: a hit on the player while tending starts the 3 s again', () => {
  const care = newPetCare('injured');
  run(care, 2.5, { hp: 0, tending: true });
  assert.equal(stepPetCare(care, { hp: 0, tending: true, playerHit: true }, 0.1), 'none');
  assert.ok(care.tendHeld < 0.2, 'the hold was reset');
  assert.deepEqual(run(care, 2.5, { hp: 0, tending: true }), []);
  assert.deepEqual(run(care, 0.6, { hp: 0, tending: true }), ['revived']);
});

test('pet care: tending reports how far the hold has got (for the ring on the prompt)', () => {
  const care = newPetCare('injured');
  run(care, 1.5, { hp: 0, tending: true });
  assert.ok(Math.abs(care.tendHeld - 1.5) < 0.11);
});

test('pet care: a revived pet that is hurt to 0 again is injured again, with a fresh 60 s', () => {
  const care = newPetCare('injured');
  run(care, 40, { hp: 0, tending: false });
  run(care, 3.1, { hp: 0, tending: true });
  assert.equal(care.phase, 'healthy');
  assert.equal(stepPetCare(care, { hp: 0, tending: false, playerHit: false }, 0.016), 'injured');
  assert.ok(care.injuredLeft > 59.9);
});

// ---------- Who a wild animal fights ----------

test('chooseFoe: with no pet to fight, an animal fights the player', () => {
  assert.equal(chooseFoe({ petAvailable: false, lastHitBy: 'pet', distPlayer: 9, distPet: 1 }), 'player');
});

test('chooseFoe: otherwise it fights whichever of them hit it last', () => {
  assert.equal(chooseFoe({ petAvailable: true, lastHitBy: 'pet', distPlayer: 1, distPet: 9 }), 'pet');
  assert.equal(chooseFoe({ petAvailable: true, lastHitBy: 'player', distPlayer: 9, distPet: 1 }), 'player');
});

test('chooseFoe: if neither has hit it, the nearer one', () => {
  assert.equal(chooseFoe({ petAvailable: true, lastHitBy: null, distPlayer: 6, distPet: 3 }), 'pet');
  assert.equal(chooseFoe({ petAvailable: true, lastHitBy: null, distPlayer: 3, distPet: 6 }), 'player');
});

// ---------- Following ----------

test('followPlan: stays close, walks, runs when far behind, and appears beside the player beyond 35 m', () => {
  assert.equal(followPlan(2), 'stay');
  assert.equal(followPlan(5), 'walk');
  assert.equal(followPlan(12), 'run');
  assert.equal(followPlan(34), 'run');
  assert.equal(followPlan(36), 'warp');
});

// ---------- What the pet attacks ----------

function cand(over: Partial<PetCandidate>): PetCandidate {
  return { id: 1, alive: true, calm: false, engaged: false, lastPlayerHitAt: -999, distToPlayer: 5, distToPet: 5, ...over };
}

test('pickPetTarget: an animal that is fighting the player or the pet', () => {
  assert.equal(pickPetTarget([cand({ id: 7, engaged: true })], 100, null), 7);
});

test('pickPetTarget: an animal the player hit in the last 8 s (the pet follows the player\'s lead)', () => {
  assert.equal(pickPetTarget([cand({ id: 7, lastPlayerHitAt: 95 })], 100, null), 7);
  assert.equal(pickPetTarget([cand({ id: 7, lastPlayerHitAt: 91 })], 100, null), null, '9 s ago is too long');
});

test('pickPetTarget: never starts a fight, never wakes a calm guard, never a dead animal', () => {
  assert.equal(pickPetTarget([cand({ id: 7 })], 100, null), null, 'an animal minding its own business');
  assert.equal(pickPetTarget([cand({ id: 7, calm: true, lastPlayerHitAt: 99 })], 100, null), null, 'a calm den guard');
  assert.equal(pickPetTarget([cand({ id: 7, alive: false, engaged: true })], 100, null), null);
});

test('pickPetTarget: only within 15 m of the player; the nearest to the pet', () => {
  assert.equal(pickPetTarget([cand({ id: 7, engaged: true, distToPlayer: 16 })], 100, null), null);
  const pick = pickPetTarget([cand({ id: 7, engaged: true, distToPet: 6 }), cand({ id: 8, engaged: true, distToPet: 2 })], 100, null);
  assert.equal(pick, 8);
});

test('pickPetTarget: keeps its target out to 20 m from the player, then breaks off', () => {
  const near = cand({ id: 7, engaged: true, distToPlayer: 18, distToPet: 9 });
  const other = cand({ id: 8, engaged: true, distToPlayer: 4, distToPet: 1 });
  assert.equal(pickPetTarget([near, other], 100, 7), 7, 'it does not switch while its target is within 20 m');
  assert.equal(pickPetTarget([{ ...near, distToPlayer: 21 }], 100, 7), null, 'beyond 20 m it comes back');
});
