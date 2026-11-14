import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOREST_LAYOUT, FOREST_TITLE } from '../../src/data/biomes.ts';
import { bodyAt } from '../../src/logic/water.ts';
import { titleCameraPose } from '../../src/logic/titleView.ts';

const pond = FOREST_LAYOUT.waters[0];
const sector = (x: number, z: number) => Math.floor((((Math.atan2(z - pond.z, x - pond.x) * 180) / Math.PI + 360) % 360) / 45);

test('title: the animals stand all around the pond, not only in front of the camera', () => {
  const groups = FOREST_TITLE.animals;
  const sectors = new Set(groups.map((g) => sector(g.x, g.z)));
  assert.ok(sectors.size >= 6, `the groups are spread over ${sectors.size} of the 8 sides of the pond`);
  for (const g of groups) {
    const d = Math.hypot(g.x - pond.x, g.z - pond.z);
    assert.ok(d <= pond.radius + 8 && d >= pond.radius - 12, `a group of ${g.enemyId ?? g.speciesId} is by the water (${d.toFixed(1)} m from its middle)`);
  }
});

test('title: only the wading animals stand in the water', () => {
  for (const g of FOREST_TITLE.animals) {
    const inWater = !!bodyAt(FOREST_LAYOUT.waters, g.x, g.z);
    assert.equal(inWater, !!g.wades, `${g.enemyId ?? g.speciesId} at ${g.x}, ${g.z}`);
  }
});

test('title: the same cast as before, with every species but the Eagle', () => {
  const count = (pick: (g: (typeof FOREST_TITLE.animals)[number]) => boolean) => FOREST_TITLE.animals.filter(pick).reduce((n, g) => n + g.count, 0);
  assert.equal(count(() => true), 13);
  for (const s of ['bear', 'wolf', 'lion', 'tiger', 'elephant', 'crocodile']) assert.ok(count((g) => g.speciesId === s) >= 1, s);
  assert.ok(count((g) => g.enemyId === 'deer') >= 3 && count((g) => g.enemyId === 'fox') >= 2 && count((g) => g.enemyId === 'boar') >= 1);
  assert.equal(count((g) => g.speciesId === 'eagle'), 0, 'the title scene has no flight');
});

test('title: the camera circles the pond at a fixed distance, close to the ground, and always looks toward the water', () => {
  const v = FOREST_TITLE.view;
  assert.ok(v.height >= 1.5 && v.height <= 4, 'low, like a wildlife film');
  assert.ok(v.radius > pond.radius + 8, 'outside the sandy shore');
  for (const k of [0, 0.25, 0.5, 0.75, 1]) {
    const pose = titleCameraPose(v, k * v.period / 2, (x, z) => 0);
    assert.ok(Math.abs(Math.hypot(pose.x - v.centre.x, pose.z - v.centre.z) - v.radius) < 1e-9, 'a circle around the pond');
    const toMiddle = Math.hypot(v.centre.x - pose.lookX, v.centre.z - pose.lookZ);
    assert.ok(toMiddle <= v.shift + 1e-9, 'it looks at the pond, a little to one side');
  }
});

test('title: the camera goes there and back along its arc, and rests at both ends', () => {
  const v = FOREST_TITLE.view;
  const start = titleCameraPose(v, 0, () => 0);
  const end = titleCameraPose(v, v.period / 2, () => 0);
  const again = titleCameraPose(v, v.period, () => 0);
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) > v.radius, 'the two ends of the arc are far apart');
  assert.ok(Math.hypot(start.x - again.x, start.z - again.z) < 1e-6, 'back where it started after one period');
  assert.ok(Math.abs(v.toDeg - v.fromDeg) >= 75, 'the arc covers at least 75 degrees of the shore (the forest around the pond is too dense for more)');
});
