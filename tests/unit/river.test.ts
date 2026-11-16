import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRiver, currentAt, depthGrip, nearRiver, riverAt, riverBankPoint, sampleRiver } from '../../src/logic/river.ts';

// A straight river flowing east along z = 0, 8 m wide, from x = 0 to x = 40.
const straight = buildRiver({
  id: 'straight', current: 1.2,
  points: [{ x: 0, z: 0, width: 8, depth: 1.6 }, { x: 40, z: 0, width: 8, depth: 1.6 }],
}, 0);

// A river with a bend, a shallow wide ford in the middle, on raised ground.
const bent = buildRiver({
  id: 'bent', current: 1, surfaceY: 12,
  points: [
    { x: 0, z: 100, width: 6, depth: 1.5 },
    { x: 20, z: 100, width: 10, depth: 0.4 },
    { x: 20, z: 130, width: 6, depth: 1.5 },
  ],
}, 0);

test('river: its course is smoothed into short pieces that still pass through every placed point', () => {
  assert.ok(straight.points.length >= 20, 'pieces of about 1.5 m');
  assert.ok(Math.abs(straight.length - 40) < 1e-6);
  for (const p of [{ x: 0, z: 100 }, { x: 20, z: 100 }, { x: 20, z: 130 }]) {
    assert.ok(bent.points.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-6), `passes through ${p.x}, ${p.z}`);
  }
  for (let i = 1; i < bent.points.length; i++) {
    const step = Math.hypot(bent.points[i].x - bent.points[i - 1].x, bent.points[i].z - bent.points[i - 1].z);
    assert.ok(step < 2.6, `no long straight piece (${step.toFixed(2)} m)`);
  }
  assert.ok(bent.length > 50, 'a bend is longer than the straight line between its ends');
});

test('river: the surface is the biome water level unless the river says otherwise', () => {
  assert.equal(straight.surfaceY, 0);
  assert.equal(straight.raised, false);
  assert.equal(bent.surfaceY, 12);
  assert.equal(bent.raised, true);
});

test('river: a point is in the river between its banks, and on dry land outside them', () => {
  assert.ok(riverAt([straight], 20, 0), 'the middle');
  assert.ok(riverAt([straight], 20, 3.9), 'just inside the bank');
  assert.ok(riverAt([straight], 20, 4), 'the bank line counts as water');
  assert.equal(riverAt([straight], 20, 4.1), null, 'just outside the bank');
  assert.equal(riverAt([straight], 20, -9), null);
  assert.equal(riverAt([straight], 200, 0), null, 'far away');
  assert.equal(riverAt([], 20, 0), null, 'no rivers at all');
  assert.equal(riverAt([straight, bent], 10, 100)?.river.id, 'bent', 'the second river');
});

test('river: it is cut off square at both ends: no water before its source or past its last point', () => {
  assert.ok(riverAt([straight], 0.2, 0), 'just inside the source');
  assert.equal(riverAt([straight], -0.5, 0), null, 'upstream of the source');
  assert.equal(riverAt([straight], -3, 3), null);
  assert.ok(riverAt([straight], 39.8, 3), 'just inside the end');
  assert.equal(riverAt([straight], 40.5, 0), null, 'past the end (where a stream goes over a cliff)');
  assert.deepEqual(currentAt([straight], 41, 0), { x: 0, z: 0 }, 'and no current there either');
  // The channel in the ground is still rounded off at the ends, so the sample still knows how near the end is.
  assert.ok(sampleRiver(straight, 41, 0)!.beyond && Math.abs(sampleRiver(straight, 41, 0)!.dist - 1) < 1e-6);
  assert.equal(sampleRiver(straight, 20, 2)!.beyond, false);
});

test('river: width and depth change along its course (a ford is wide and shallow)', () => {
  const start = sampleRiver(bent, 0, 100)!;
  const ford = sampleRiver(bent, 20, 100)!;
  assert.ok(Math.abs(start.halfWidth - 3) < 1e-6 && Math.abs(start.depth - 1.5) < 1e-6);
  assert.ok(Math.abs(ford.halfWidth - 5) < 0.2 && ford.depth < 0.5, `ford: half width ${ford.halfWidth.toFixed(2)}, depth ${ford.depth.toFixed(2)}`);
  const between = sampleRiver(bent, 10, 100)!;
  assert.ok(between.depth < start.depth && between.depth > ford.depth);
});

test('river: the water flows from the first point to the last', () => {
  const s = sampleRiver(straight, 12, 1)!;
  assert.ok(Math.abs(s.dirX - 1) < 1e-6 && Math.abs(s.dirZ) < 1e-6, 'east');
  assert.ok(Math.abs(s.along - 12) < 1e-6 && Math.abs(s.dist - 1) < 1e-6);
  const afterBend = sampleRiver(bent, 20, 125)!;
  assert.ok(afterBend.dirZ > 0.9, 'south after the bend');
});

test('river: the current is strongest in the middle, fades to nothing at the banks, and is absent on land', () => {
  const mid = currentAt([straight], 20, 0);
  assert.ok(Math.abs(mid.x - 1.2) < 1e-6 && Math.abs(mid.z) < 1e-6, 'the full current, heading downstream');
  const half = currentAt([straight], 20, 2);
  assert.ok(half.x > 0.6 && half.x < 1.2, `halfway to the bank: ${half.x.toFixed(2)}`);
  const edge = currentAt([straight], 20, 3.98);
  assert.ok(edge.x < 0.05, 'almost still at the bank');
  assert.deepEqual(currentAt([straight], 20, 6), { x: 0, z: 0 });
  assert.deepEqual(currentAt([], 20, 0), { x: 0, z: 0 });
  const still = buildRiver({ id: 'still', current: 0, points: straight.points }, 0);
  assert.deepEqual(currentAt([still], 20, 0), { x: 0, z: 0 }, 'a river with no current');
});

test('river: shallow water pushes less than deep water, and dry ground not at all', () => {
  assert.equal(depthGrip(0, 1), 0);
  assert.equal(depthGrip(-0.2, 1), 0);
  assert.ok(depthGrip(0.1, 1) > 0.25 && depthGrip(0.1, 1) < 0.4, 'a paddling animal is barely moved');
  assert.ok(depthGrip(0.5, 1) > depthGrip(0.1, 1));
  assert.equal(depthGrip(1, 1), 1);
  assert.equal(depthGrip(3, 1), 1, 'never more than the full current');
});

test('river: "near a river" is within a margin of its bank', () => {
  assert.equal(nearRiver([straight], 20, 0, 8), true, 'in it');
  assert.equal(nearRiver([straight], 20, 11, 8), true, '7 m from the bank');
  assert.equal(nearRiver([straight], 20, 13, 8), false, '9 m from the bank');
  assert.equal(nearRiver([], 20, 0, 8), false);
});

test('river: an animal drinks from the bank it is on, on dry ground, facing the water', () => {
  const north = riverBankPoint([straight], 20, -15, 30, 1.3)!;
  assert.ok(Math.abs(north.x - 20) < 1e-6 && Math.abs(north.z - -5.3) < 1e-6, 'north bank, 1.3 m outside it');
  assert.ok(Math.abs(north.distance - 11) < 1e-6);
  // Yaw 0 faces +z: from the north bank the water is to the south.
  assert.ok(Math.abs(Math.sin(north.yaw)) < 1e-6 && Math.cos(north.yaw) > 0.99);
  const south = riverBankPoint([straight], 20, 9, 30, 1.3)!;
  assert.ok(Math.abs(south.z - 5.3) < 1e-6 && Math.cos(south.yaw) < -0.99, 'south bank, facing north');
  assert.equal(riverBankPoint([straight], 20, 50, 30, 1.3), null, 'too far to walk');
  assert.equal(riverBankPoint([], 20, 5, 30, 1.3), null);
  assert.equal(riverAt([straight], north.x, north.z), null, 'the drinking spot is not in the water');
});
