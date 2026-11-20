import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IceSheet, iceWeight, sealDue, sealLeaves, wearRate } from '../../src/logic/ice.ts';
import type { IceStander, IceTuning } from '../../src/logic/ice.ts';

const T: IceTuning = {
  cellSize: 2, slowSpeed: 2, breakSeconds: 5, crackAt: 0.6, healSeconds: 60, refreezeSeconds: 60, holeMargin: 0.5,
  coldPctPerSecond: 0.02, iceThickness: 0.15, refRadius: 0.45, sealAfterSeconds: 8, sealLeaveSeconds: 4,
};
/** A frozen lake of radius 30 round the middle. */
const lake = () => new IceSheet([{ x: 0, z: 0, radius: 30 }], T);
const adult = (x = 1, z = 1, speed = 0): IceStander => ({ x, z, radius: 0.45, weight: 1, speed, exempt: false });
/** Steps the sheet `seconds` long in steps of 0.05 s with the same standers, and returns every event. */
function run(sheet: IceSheet, standers: IceStander[], seconds: number) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) events.push(...sheet.step(standers, 0.05));
  return events;
}

test('ice: an animal\'s weight on the ice follows its size: an Adult of a middling animal is 1, small ones far less, huge ones up to 3', () => {
  assert.equal(iceWeight(0.45, T), 1);
  assert.ok(iceWeight(0.2, T) < 0.3, 'a hare');
  assert.equal(iceWeight(0.05, T), 0.15, 'never less than 0.15');
  assert.equal(iceWeight(3, T), 3, 'never more than 3');
  assert.ok(iceWeight(0.9, T) > iceWeight(0.6, T));
});

test('ice: walking or running across never wears it; standing, fighting or creeping does', () => {
  assert.equal(wearRate(1, 2, T), 0, 'at the walking limit');
  assert.equal(wearRate(1, 6, T), 0);
  assert.equal(wearRate(1, 0, T), 1 / 5);
  assert.equal(wearRate(3, 1, T), 3 / 5);
  const sheet = lake();
  run(sheet, [adult(1, 1, 2.5)], 20);
  assert.equal(sheet.wearAt(1, 1), 0);
  assert.equal(sheet.state(1, 1), 'ice');
});

test('ice: an Adult standing still cracks the ice after 3 s and breaks it after 5 s', () => {
  const sheet = lake();
  let events = run(sheet, [adult()], 2.9);
  assert.equal(sheet.state(1, 1), 'ice');
  events = run(sheet, [adult()], 0.3);
  assert.equal(sheet.state(1, 1), 'cracked');
  assert.ok(events.some((e) => e.kind === 'crack'));
  events = run(sheet, [adult()], 1.7);
  assert.equal(sheet.state(1, 1), 'cracked', 'still holding at 4.9 s');
  events = run(sheet, [adult()], 0.2);
  assert.equal(sheet.state(1, 1), 'hole', 'broken at 5.1 s');
  assert.ok(events.some((e) => e.kind === 'break'));
});

test('ice: heavy animals break it sooner, and a hare hardly ever', () => {
  const heavy = lake();
  run(heavy, [{ ...adult(), weight: 3 }], 1.8);
  assert.equal(heavy.state(1, 1), 'hole');
  const hare = lake();
  run(hare, [{ ...adult(), radius: 0.2, weight: 0.15 }], 20);
  assert.notEqual(hare.state(1, 1), 'hole');
});

test('ice: a break opens the animal\'s circle plus half a metre, and nothing beyond', () => {
  const sheet = lake();
  run(sheet, [{ ...adult(5, 5), radius: 1 }], 5.1);
  assert.equal(sheet.state(5, 5), 'hole');
  assert.equal(sheet.state(6.4, 5), 'hole', 'within the radius plus 0.5 m');
  assert.equal(sheet.state(5 + 1.5 + 2.5, 5), 'ice', 'beyond it');
});

test('ice: an animal standing on the line between two squares wears both', () => {
  const sheet = lake();
  run(sheet, [adult(2, 1)], 1);
  assert.ok(sheet.wearAt(1.5, 1) > 0 && sheet.wearAt(2.5, 1) > 0);
});

test('ice: wear heals once nothing stands on it', () => {
  const sheet = lake();
  run(sheet, [adult()], 2.5);
  assert.ok(Math.abs(sheet.wearAt(1, 1) - 0.5) < 0.02);
  run(sheet, [], 31);
  assert.equal(sheet.wearAt(1, 1), 0);
});

test('ice: a hole freezes over 60 s after it is left empty, never while an animal is in it', () => {
  const sheet = lake();
  run(sheet, [adult()], 5.1);
  run(sheet, [adult()], 120);
  assert.equal(sheet.state(1, 1), 'hole', 'occupied the whole time');
  let events = run(sheet, [adult(20, 20, 3)], 59);
  assert.equal(sheet.state(1, 1), 'hole');
  events = run(sheet, [adult(20, 20, 3)], 1.1);
  assert.equal(sheet.state(1, 1), 'ice');
  assert.equal(sheet.wearAt(1, 1), 0);
  assert.ok(events.some((e) => e.kind === 'refreeze'));
});

test('ice: an exempt animal (flying, an injured pet, the mammoth) wears nothing, but still keeps a hole open', () => {
  const sheet = lake();
  run(sheet, [{ ...adult(), exempt: true, weight: 3 }], 20);
  assert.equal(sheet.wearAt(1, 1), 0);
  run(sheet, [adult()], 5.1);
  run(sheet, [{ ...adult(), exempt: true }], 90);
  assert.equal(sheet.state(1, 1), 'hole');
});

test('ice: the mammoth\'s shockwave wears only the squares inside its ring', () => {
  const sheet = lake();
  sheet.ringWear(0, 0, 6, 8, 0.5);
  assert.ok(Math.abs(sheet.wearAt(7, 0) - 0.5) < 1e-9);
  assert.equal(sheet.wearAt(3, 0), 0);
  assert.equal(sheet.wearAt(11, 0), 0);
  const events = sheet.ringWear(0, 0, 6, 8, 0.6);
  assert.equal(sheet.state(7, 0), 'hole', 'a second wave breaks it');
  assert.ok(events.some((e) => e.kind === 'break'));
});

test('ice: off the lake there is no ice; the nearest footing from a hole is whole ice or the shore', () => {
  const sheet = lake();
  assert.equal(sheet.state(40, 0), null);
  assert.equal(sheet.state(0, 31), null);
  run(sheet, [{ ...adult(), radius: 1 }], 5.1);
  const foot = sheet.nearestFooting(1, 1)!;
  assert.ok(foot && sheet.state(foot.x, foot.z) !== 'hole');
  assert.ok(Math.hypot(foot.x - 1, foot.z - 1) < 5);
});

test('seal: a leopard seal comes for an animal 8 s in the freezing water, and sinks away 4 s after its hole is empty', () => {
  assert.equal(sealDue(7.9, false, T), false);
  assert.equal(sealDue(8, false, T), true);
  assert.equal(sealDue(20, true, T), false, 'one is up already');
  assert.equal(sealLeaves(3.9, T), false);
  assert.equal(sealLeaves(4, T), true);
});

test('ice: the holes in a circle can be listed (the mammoth pool counts its own holes, not the lake\'s)', () => {
  const ice = new IceSheet([{ x: 0, z: 0, radius: 10 }, { x: 60, z: 0, radius: 10 }], T);
  assert.deepEqual(ice.holeSpotsIn(0, 0, 10), []);
  ice.addWear(60, 0, 1.5, 1);
  assert.equal(ice.holeSpotsIn(0, 0, 10).length, 0, 'a hole in the other pool does not count');
  ice.addWear(2, 2, 1.5, 1);
  const spots = ice.holeSpotsIn(0, 0, 10);
  assert.ok(spots.length > 0);
  for (const s of spots) assert.equal(ice.state(s.x, s.z), 'hole');
});
