import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOREST_LAYOUT, FOREST_SPAWNS } from '../../src/data/biomes.ts';
import { TREE_FOOD } from '../../src/data/food.ts';
import { foxesToProvoke, guardWanderRadius } from '../../src/logic/foxReserve.ts';
import { bodyAt } from '../../src/logic/water.ts';

test('fox reserve: eating from it angers every living fox within range, and only those', () => {
  const foxes = [
    { id: 1, x: 0, z: 0, alive: true },
    { id: 2, x: 14, z: 0, alive: true },
    { id: 3, x: 16, z: 0, alive: true },
    { id: 4, x: 3, z: 3, alive: false },
    { id: 5, x: -10, z: 9, alive: true },
  ];
  assert.deepEqual(foxesToProvoke(foxes, { x: 0, z: 0 }, 15).map((f) => f.id), [1, 2, 5]);
  assert.deepEqual(foxesToProvoke(foxes, { x: 100, z: 100 }, 15), [], 'nobody near');
  assert.deepEqual(foxesToProvoke([], { x: 0, z: 0 }, 15), []);
});

test('fox reserve: there are two, away from the water, den, arena, gate, spawn and each other', () => {
  const { foxReserves, waters, den, arena, gate, playerSpawn, worldRadius } = FOREST_LAYOUT;
  assert.equal(foxReserves.length, 2);
  foxReserves.forEach((r, i) => {
    const d = (p: { x: number; z: number }) => Math.hypot(r.x - p.x, r.z - p.z);
    assert.ok(Math.hypot(r.x, r.z) + 10 < worldRadius, `reserve ${i} is well inside the world`);
    assert.ok(waters.every((w) => d(w) >= w.radius + 14), `reserve ${i} is clear of the ponds and their sandy shores`);
    assert.equal(bodyAt(waters, r.x, r.z), null);
    assert.ok(d(den) >= den.refugeRadius + 25, `reserve ${i} is far from the den, where a hungry herbivore would feed in safety`);
    assert.ok(d(playerSpawn) >= 35, `reserve ${i} is not by the spawn point`);
    assert.ok(d(arena) >= arena.radius + 20 && d(gate) >= gate.radius + 20);
    foxReserves.slice(i + 1).forEach((o) => assert.ok(Math.hypot(r.x - o.x, r.z - o.z) >= 50, 'the two reserves are far apart'));
  });
});

test('fox reserve: each is guarded by a few foxes that stay calm until it is raided, besides the foxes elsewhere', () => {
  const guards = FOREST_SPAWNS.filter((z) => z.guardOf !== undefined);
  assert.equal(guards.length, 2);
  guards.forEach((z, i) => {
    assert.equal(z.enemyId, 'fox');
    assert.ok(z.count >= 3 && z.count <= 4, 'three or four guards');
    assert.equal(z.guardOf, i);
    const r = FOREST_LAYOUT.foxReserves[z.guardOf!];
    assert.ok(Math.hypot(z.x - r.x, z.z - r.z) < 1.5 && z.radius <= 8, 'the guards stay close to their reserve');
    assert.ok(z.radius * 2 < TREE_FOOD.provokeRange + 4, 'they are all within reach of the raiders');
  });
  const wild = FOREST_SPAWNS.filter((z) => z.enemyId === 'fox' && z.guardOf === undefined);
  assert.ok(wild.length >= 2 && wild.reduce((n, z) => n + z.count, 0) >= 5, 'the foxes spread through the Forest are still there');
});

test('fox reserve: the range that angers the foxes is big enough to include the guards and small enough to be fair', () => {
  assert.ok(TREE_FOOD.provokeRange >= 12 && TREE_FOOD.provokeRange <= 20);
});

test('fox reserve: guards wander close to their food, never farther than the range a raid reaches', () => {
  assert.equal(guardWanderRadius(14, 6), 8, 'a fox that would roam 14 m stays within the guard zone and a little more');
  assert.equal(guardWanderRadius(5, 6), 5, 'a shorter roam is kept');
  for (const z of FOREST_SPAWNS.filter((s) => s.guardOf !== undefined)) {
    const farthest = guardWanderRadius(14, z.radius) + 1.5;
    assert.ok(farthest < TREE_FOOD.provokeRange, `a guard can be ${farthest} m from the produce, a raid reaches ${TREE_FOOD.provokeRange} m`);
  }
});
