import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOODS, RESERVE_PRODUCE, TREE_FOOD, canEat } from '../../src/data/food.ts';
import { assignTreeFood, availableFood, newTreeState, takeFood } from '../../src/logic/treeFood.ts';

const spots = (n: number, pineEvery = 3) => Array.from({ length: n }, (_, i) => ({ pine: i % pineEvery === 0 }));

test('tree food: every tree has leaves, broadleaf trees may bear fruit and pines may bear nuts', () => {
  const trees = spots(2000);
  const kinds = assignTreeFood(trees, 1337, TREE_FOOD.fruitTreeShare, TREE_FOOD.nutTreeShare);
  assert.equal(kinds.length, trees.length);
  trees.forEach((t, i) => {
    if (t.pine) assert.ok(kinds[i] === 'nut' || kinds[i] === 'plain', 'a pine bears nuts or nothing');
    else assert.ok(kinds[i] === 'fruit' || kinds[i] === 'plain', 'a broadleaf tree bears fruit or nothing');
  });
  const broadleaf = trees.filter((t) => !t.pine).length;
  const pines = trees.filter((t) => t.pine).length;
  const fruit = kinds.filter((k) => k === 'fruit').length;
  const nuts = kinds.filter((k) => k === 'nut').length;
  assert.ok(Math.abs(fruit / broadleaf - TREE_FOOD.fruitTreeShare) < 0.002, `fruit trees: ${(fruit / broadleaf).toFixed(3)} of broadleaf trees`);
  assert.ok(Math.abs(nuts / pines - TREE_FOOD.nutTreeShare) < 0.002, `nut trees: ${(nuts / pines).toFixed(3)} of pines`);
});

test('tree food: the same forest always gets the same fruit and nut trees', () => {
  const trees = spots(300);
  const a = assignTreeFood(trees, 1337, 0.125, 0.25);
  const b = assignTreeFood(trees, 1337, 0.125, 0.25);
  const c = assignTreeFood(trees, 99, 0.125, 0.25);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c, 'another seed gives another forest');
});

test('tree food: a fruit tree offers its fruit first, then its leaves, then nothing until they grow back', () => {
  const t = newTreeState('fruit');
  assert.equal(availableFood(t, 0), 'fruit');
  takeFood(t, 'fruit', 0, 60);
  assert.equal(availableFood(t, 1), 'leaf', 'the fruit is gone, the leaves are not');
  takeFood(t, 'leaf', 1, 60);
  assert.equal(availableFood(t, 2), null, 'bare');
  assert.equal(availableFood(t, 60.5), 'fruit', 'the fruit is back after a minute');
  assert.equal(availableFood(t, 61.5), 'fruit');
  takeFood(t, 'fruit', 62, 60);
  assert.equal(availableFood(t, 62.5), 'leaf', 'the leaves grew back too');
});

test('tree food: a nut tree offers nuts, a plain tree only leaves', () => {
  const nut = newTreeState('nut');
  assert.equal(availableFood(nut, 0), 'nut');
  takeFood(nut, 'nut', 0, 60);
  assert.equal(availableFood(nut, 1), 'leaf');
  const plain = newTreeState('plain');
  assert.equal(availableFood(plain, 0), 'leaf');
  takeFood(plain, 'leaf', 0, 60);
  assert.equal(availableFood(plain, 30), null);
  assert.equal(availableFood(plain, 61), 'leaf');
});

test('tree food: eating the fruit does not strip the leaves, and the other way round', () => {
  const t = newTreeState('fruit');
  takeFood(t, 'leaf', 0, 60);
  assert.equal(availableFood(t, 1), 'fruit', 'the fruit is still there');
  takeFood(t, 'fruit', 1, 60);
  assert.equal(availableFood(t, 2), null);
});

test('data: leaves are the poorest food, nuts the richest tree food, and only plant-eaters can eat them', () => {
  assert.ok(TREE_FOOD.leaf.growth < FOODS.plant.growth && TREE_FOOD.leaf.growth < FOODS.fruit.growth, 'leaves give less growth than plants or berries');
  assert.ok(TREE_FOOD.leaf.growth < TREE_FOOD.fruit.growth && TREE_FOOD.fruit.growth < TREE_FOOD.nut.growth);
  for (const kind of ['leaf', 'nut', 'fruit', 'plant'] as const) {
    assert.equal(canEat('herbivore', kind), true, `an Elephant eats ${kind}`);
    assert.equal(canEat('omnivore', kind), true, `a Bear eats ${kind}`);
    if (kind === 'leaf' || kind === 'nut') assert.equal(canEat('carnivore', kind), false, `a carnivore does not eat ${kind}`);
  }
  assert.equal(canEat('herbivore', 'carcass'), false);
  assert.ok(TREE_FOOD.regrowSeconds >= 30, 'a bare tree stays bare for a while');
});

test('data: the fox food reserve holds six kinds of fruit and vegetable, worth more than anything growing wild', () => {
  assert.equal(RESERVE_PRODUCE.length, 6);
  const names = RESERVE_PRODUCE.map((p) => p.name);
  for (const n of ['carrot', 'sweet potato', 'corn', 'apple', 'berries', 'cherry tomato']) assert.ok(names.includes(n), n);
  assert.ok(RESERVE_PRODUCE.every((p) => p.kind === 'plant' || p.kind === 'fruit'), 'plant-eaters can eat all of it');
  assert.ok(RESERVE_PRODUCE.some((p) => p.kind === 'plant') && RESERVE_PRODUCE.some((p) => p.kind === 'fruit'));
  assert.ok(TREE_FOOD.reserveGrowth > TREE_FOOD.nut.growth && TREE_FOOD.reserveGrowth > FOODS.plant.growth, 'worth the risk');
  assert.ok(TREE_FOOD.reserveRespawnSeconds >= 60);
});
