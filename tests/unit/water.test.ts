import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOREST_LAYOUT } from '../../src/data/biomes.ts';
import { createForestHeight } from '../../src/logic/heightfield.ts';
import { bodyAt, nearWater } from '../../src/logic/water.ts';
import type { WaterBody } from '../../src/logic/water.ts';

const bodies: WaterBody[] = [
  { x: 0, z: 0, radius: 10, depth: 2, fish: 3 },
  { x: 40, z: 0, radius: 5, depth: 1.5, fish: 2 },
];

test('water: a point is in a body of water when it lies within its radius', () => {
  assert.equal(bodyAt(bodies, 0, 0), bodies[0]);
  assert.equal(bodyAt(bodies, 9.9, 0), bodies[0]);
  assert.equal(bodyAt(bodies, 10, 0), bodies[0], 'the shoreline counts as water');
  assert.equal(bodyAt(bodies, 10.1, 0), null);
  assert.equal(bodyAt(bodies, 42, 3), bodies[1], 'the second body');
  assert.equal(bodyAt(bodies, 20, 0), null, 'dry land between them');
  assert.equal(bodyAt([], 0, 0), null, 'no water at all');
});

test('water: "near water" is within a margin of the shore of any body', () => {
  assert.equal(nearWater(bodies, 0, 0, 8), true, 'in the water');
  assert.equal(nearWater(bodies, 17, 0, 8), true, '7 m from the shore of the first body');
  assert.equal(nearWater(bodies, 19, 0, 8), false, '9 m from the first shore, 21 from the second');
  assert.equal(nearWater(bodies, 40 + 5 + 7, 0, 8), true, '7 m from the shore of the second body');
  assert.equal(nearWater(bodies, 25, 30, 8), false);
});

test('forest: there are four bodies of water: the old pond, and three more of different sizes', () => {
  const { waters } = FOREST_LAYOUT;
  assert.equal(waters.length, 4);
  assert.deepEqual([waters[0].x, waters[0].z, waters[0].radius], [46, 12, 15], 'the old pond is where it was');
  assert.deepEqual(waters.slice(1).map((w) => w.radius).sort((a, b) => b - a), [11, 9, 7]);
  assert.ok(waters.every((w) => w.depth > 0.5), 'every one can be swum in');
});

test('forest: every body of water has fish, the big pond the most', () => {
  const { waters } = FOREST_LAYOUT;
  assert.ok(waters.every((w) => w.fish >= 2));
  assert.equal(waters[0].fish, 4, 'the old pond keeps its four fish');
  assert.ok(waters.slice(1).every((w) => w.fish <= waters[0].fish));
});

test('forest: the water is clear of the den, the spawn point, the arena, the gate, the bushes and each other', () => {
  const { waters, den, playerSpawn, arena, gate, berryBushes, worldRadius } = FOREST_LAYOUT;
  waters.forEach((w, i) => {
    const d = (p: { x: number; z: number }) => Math.hypot(w.x - p.x, w.z - p.z);
    assert.ok(Math.hypot(w.x, w.z) + w.radius + 8 <= worldRadius, `water ${i} is well inside the world`);
    assert.ok(d(den) >= w.radius + den.refugeRadius + 6, `water ${i} is away from the den`);
    assert.ok(d(playerSpawn) >= w.radius + 6, `water ${i} is away from the spawn point`);
    assert.ok(d(arena) >= w.radius + arena.radius + 14, `water ${i} is away from the boss arena and its flattened ring`);
    assert.ok(d(gate) >= w.radius + gate.radius + 10, `water ${i} is away from the gate`);
    for (const [bx, bz] of berryBushes) assert.ok(d({ x: bx, z: bz }) >= w.radius + 3, `a berry bush stands in or at the edge of water ${i}`);
    waters.slice(i + 1).forEach((o, j) => {
      assert.ok(Math.hypot(w.x - o.x, w.z - o.z) >= w.radius + o.radius + 12, `waters ${i} and ${i + 1 + j} are well apart`);
    });
  });
});

test('terrain: every body of water is a bowl below the water line, with dry ground all round it', () => {
  const h = createForestHeight();
  const { waters, waterY } = FOREST_LAYOUT;
  for (const w of waters) {
    assert.ok(h(w.x, w.z) < waterY - 1.5, 'the middle is deep');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = w.x + Math.cos(a) * (w.radius + 1.5);
      const z = w.z + Math.sin(a) * (w.radius + 1.5);
      assert.ok(h(x, z) > waterY, `the shore is dry at ${Math.round((a * 180) / Math.PI)} degrees`);
    }
  }
});
