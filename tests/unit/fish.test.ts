import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPECIES } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { newFish, stepFish } from '../../src/logic/fish.ts';
import { shoreStandPoint } from '../../src/logic/water.ts';
import { swimSpeedFactor } from '../../src/logic/stats.ts';

const T = TUNING.fish;
const pond = { x: 0, z: 0, radius: 10 };
const at = (f: ReturnType<typeof newFish>, base: { x: number; z: number }) => ({ x: base.x + f.ox, z: base.z + f.oz });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('fish: with nothing in the water they carry on, and any offset from their circle fades away', () => {
  const f = newFish();
  const base = { x: 2, z: 0 };
  assert.equal(stepFish(f, base, null, pond, 0.1, T), false, 'no threat, not alarmed');
  assert.deepEqual([f.ox, f.oz], [0, 0]);
  f.ox = 3;
  f.oz = -2;
  const start = Math.hypot(f.ox, f.oz);
  for (let i = 0; i < Math.ceil((start / T.returnSpeed) * 10) + 5; i++) stepFish(f, base, null, pond, 0.1, T);
  assert.ok(Math.hypot(f.ox, f.oz) < 1e-9, 'back on its circle');
});

test('fish: an animal farther than the alarm range does not bother them', () => {
  const f = newFish();
  assert.equal(stepFish(f, { x: 0, z: 0 }, { x: T.alarmRange + 1, z: 0 }, pond, 0.1, T), false);
  assert.deepEqual([f.ox, f.oz], [0, 0]);
});

test('fish: a wading animal inside the alarm range makes them swim away from it, at the fleeing speed', () => {
  const f = newFish();
  const base = { x: 0, z: 0 };
  const threat = { x: -4, z: 0 };
  assert.equal(stepFish(f, base, threat, pond, 0.1, T), true);
  assert.ok(f.ox > 0, 'swims away from the animal (the animal is to the west)');
  assert.ok(Math.abs(f.oz) < 1e-9);
  assert.ok(Math.abs(Math.hypot(f.ox, f.oz) - T.fleeSpeed * 0.1) < 1e-9, 'moves at the fleeing speed');
});

test('fish: a fish the animal gets close to darts, then cannot dart again until it has recovered', () => {
  const f = newFish();
  const base = { x: 0, z: 0 };
  const close = () => ({ x: at(f, base).x - T.dartRange * 0.5, z: at(f, base).z });
  stepFish(f, base, close(), pond, 0.05, T);
  const first = Math.hypot(f.ox, f.oz);
  assert.ok(Math.abs(first - T.dartSpeed * 0.05) < 1e-9, 'the first step is a dart');
  // The dart lasts dartSeconds, then it swims at the fleeing speed while the cooldown runs.
  let t = 0.05;
  let dartSteps = 1;
  let darts = 1;
  while (t < T.dartCooldown - 0.1) {
    const before = { ox: f.ox, oz: f.oz };
    stepFish(f, base, close(), pond, 0.05, T);
    const step = Math.hypot(f.ox - before.ox, f.oz - before.oz);
    if (step > T.fleeSpeed * 0.05 + 1e-9) {
      dartSteps++;
      if (t > T.dartSeconds + 0.1) darts++;
    }
    t += 0.05;
  }
  assert.equal(darts, 1, 'no second dart before the cooldown ends');
  assert.ok(Math.abs(dartSteps * 0.05 - T.dartSeconds) < 0.11, 'the dart lasts about dartSeconds');
});

test('fish: they never leave the water, and slide along the shore when they are cornered', () => {
  const f = newFish();
  const base = { x: 6, z: 0 };
  let moved = 0;
  for (let i = 0; i < 400; i++) {
    // The animal keeps 2 m behind the fish and a little to one side, pushing it toward the shore.
    const here = at(f, base);
    stepFish(f, base, { x: here.x - 2, z: here.z + 0.5 }, pond, 0.05, T);
    const p = at(f, base);
    assert.ok(dist(p, pond) <= pond.radius - T.shoreMargin + 1e-9, 'inside the pond');
    moved = Math.max(moved, Math.abs(f.oz));
  }
  assert.ok(moved > 1, 'it slid sideways along the shore instead of stopping dead');
});

test('fish: even the slowest swimmer that eats fish gains on them, so every fish-eater can catch one', () => {
  const eaters = SPECIES.filter((s) => s.rig !== 'winged' && (s.diet === 'carnivore' || s.diet === 'omnivore'));
  const slowestSwim = Math.min(...eaters.map((s) => s.baseStats.moveSpeed * swimSpeedFactor(s.swimSpeedMult, 0)));
  const cycle = T.dartCooldown;
  const average = (T.dartSpeed * T.dartSeconds + T.fleeSpeed * (cycle - T.dartSeconds)) / cycle;
  assert.ok(T.fleeSpeed < slowestSwim, `a fish flees at ${T.fleeSpeed} m/s, the slowest swimmer does ${slowestSwim.toFixed(2)}`);
  assert.ok(average < slowestSwim, `on average a fish moves at ${average.toFixed(2)} m/s`);
  assert.ok(T.dartSpeed > T.fleeSpeed, 'a dart is faster than a flee, so it is a little challenge');
});

test('water: an animal drinks at the nearest shore, standing on dry ground and facing the water', () => {
  const waters = [{ x: 0, z: 0, radius: 10, depth: 2, fish: 2 }, { x: 100, z: 0, radius: 5, depth: 2, fish: 2 }];
  const spot = shoreStandPoint(waters, 30, 0, 25)!;
  assert.ok(Math.abs(spot.x - (10 + TUNING.drink.standOff)) < 1e-9 && Math.abs(spot.z) < 1e-9, 'on the near side, just outside the shore');
  assert.ok(Math.abs(Math.hypot(spot.x, spot.z) - (10 + TUNING.drink.standOff)) < 1e-9);
  assert.ok(Math.abs(spot.yaw - Math.atan2(-spot.x, -spot.z)) < 1e-9, 'facing the middle of the pond');
  assert.equal(shoreStandPoint(waters, 30, 0, 15), null, 'too far from any shore');
  assert.equal(shoreStandPoint(waters, 90, 0, 15)?.x! > 100 - 5 - 3, true, 'the nearer pond is chosen');
  assert.equal(shoreStandPoint([], 30, 0, 100), null, 'no water, nowhere to drink');
});

test('data: drinking is short and rare enough to be a pleasant surprise, not a habit', () => {
  const D = TUNING.drink;
  assert.ok(D.chance > 0 && D.chance <= 0.5, 'at most half of the walks lead to water');
  assert.ok(D.minSeconds >= 2 && D.maxSeconds <= 10 && D.minSeconds < D.maxSeconds);
  assert.ok(D.standOff >= 1, 'it stands on dry ground');
});
