import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lairWakes } from '../../src/logic/lair.ts';

// A den's guards wake when an animal comes within `wakeNear` metres of the middle of the den (the zone's x and z).
const den = { x: 40, z: 10, wakeNear: 14 };

test('lair: an animal that comes within the wake distance wakes the guards, and one that stays outside does not', () => {
  assert.equal(lairWakes(den, { x: 40, z: 10 }, true, false), true, 'standing in the den');
  assert.equal(lairWakes(den, { x: 50, z: 10 }, true, false), true, '10 m away');
  assert.equal(lairWakes(den, { x: 54, z: 10 }, true, false), true, 'exactly at the distance');
  assert.equal(lairWakes(den, { x: 54.5, z: 10 }, true, false), false, 'just outside');
  assert.equal(lairWakes(den, { x: 0, z: 0 }, true, false), false, 'far away');
});

test('lair: a dead animal, or one in its den refuge, wakes nothing', () => {
  assert.equal(lairWakes(den, { x: 45, z: 10 }, false, false), false, 'dead');
  assert.equal(lairWakes(den, { x: 45, z: 10 }, true, true), false, 'in the refuge: wild animals ignore it');
});

test('lair: a lair with no wake distance (the Jungle\'s cave) never wakes by closeness', () => {
  assert.equal(lairWakes({ x: 40, z: 10 }, { x: 40, z: 10 }, true, false), false);
});
