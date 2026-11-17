import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdInLakeZone, inLakeZone } from '../../src/logic/waterBound.ts';
import type { WaterSet } from '../../src/logic/water.ts';

// A lake of radius 10 at the origin and no rivers. Its zone, with an 8 m strip of shore, reaches 18 m from its middle.
const set: WaterSet = { waters: [{ x: 0, z: 0, radius: 10, depth: 2, fish: 0 }], rivers: [], waterY: 0 };
const STRIP = 8;

test('lake-bound: the zone is the water and an 8 m strip of shore, and nothing beyond it', () => {
  assert.equal(inLakeZone(set, 0, 0, STRIP), true, 'the middle of the lake');
  assert.equal(inLakeZone(set, 9, 0, STRIP), true, 'in the water near the shore');
  assert.equal(inLakeZone(set, 17, 0, STRIP), true, '7 m from the shore');
  assert.equal(inLakeZone(set, 0, -17.9, STRIP), true, 'just inside the strip, on the other side');
  assert.equal(inLakeZone(set, 18.5, 0, STRIP), false, 'just beyond the strip');
  assert.equal(inLakeZone(set, 40, 40, STRIP), false, 'far away on dry land');
});

test('lake-bound: a step that stays in the zone is left alone', () => {
  const v = holdInLakeZone(set, STRIP, 5, 0, 3, 0, 0.1);
  assert.deepEqual(v, { vx: 3, vz: 0 });
  const along = holdInLakeZone(set, STRIP, 17, 0, 0, 3, 0.1);
  assert.deepEqual(along, { vx: 0, vz: 3 }, 'walking along the edge of the strip is allowed');
});

test('lake-bound: a step that would leave the zone is held, so the animal stops at the edge', () => {
  const v = holdInLakeZone(set, STRIP, 17.9, 0, 6, 0, 0.1);
  assert.deepEqual(v, { vx: 0, vz: 0 });
  const v2 = holdInLakeZone(set, STRIP, 0, -17.9, 0, -6, 0.1);
  assert.deepEqual(v2, { vx: 0, vz: 0 });
});

test('lake-bound: an animal that is already outside the zone (knocked out) is free to walk back in', () => {
  const v = holdInLakeZone(set, STRIP, 22, 0, -4, 0, 0.1);
  assert.deepEqual(v, { vx: -4, vz: 0 });
  const away = holdInLakeZone(set, STRIP, 22, 0, 4, 0, 0.1);
  assert.deepEqual(away, { vx: 4, vz: 0 }, 'it is not pinned: holding only ever stops a step from the inside out');
});
