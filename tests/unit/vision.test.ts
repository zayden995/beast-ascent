import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES } from '../../src/data/biomes.ts';
import { SPECIES } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { dayState } from '../../src/logic/dayNight.ts';
import { nightVisionFactor, tagRange, visionLimited } from '../../src/logic/vision.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('night vision: by day nothing changes, at midnight the animal sees its night fraction, and dusk fades between', () => {
  assert.equal(nightVisionFactor(0.5, 1), 1);
  assert.equal(nightVisionFactor(0.5, 0), 0.5);
  assert.ok(near(nightVisionFactor(0.5, 0.5), 0.75), 'halfway through dusk');
  assert.equal(nightVisionFactor(0.6, 0), 0.6);
  assert.equal(nightVisionFactor(1, 0), 1, 'an animal with no night debuff always sees the same');
});

test('night vision: daylight outside 0 to 1 is kept inside it', () => {
  assert.equal(nightVisionFactor(0.5, -3), 0.5);
  assert.equal(nightVisionFactor(0.5, 7), 1);
});

test('night vision: the HUD says "limited vision" only for an animal with the debuff, and only once it is dark', () => {
  const eagle = { sight: 0.5, fog: 0.6 };
  assert.equal(visionLimited(eagle, 1), false, 'noon');
  assert.equal(visionLimited(eagle, 0.6), false, 'early dusk');
  assert.equal(visionLimited(eagle, 0.4), true, 'late dusk');
  assert.equal(visionLimited(eagle, 0), true, 'midnight');
  assert.equal(visionLimited(undefined, 0), false, 'no debuff, no label');
});

test('night vision: it follows the real day and night cycle', () => {
  const noon = dayState(0.5, TUNING.dayNight.dayBias).daylight;
  const midnight = dayState(0, TUNING.dayNight.dayBias).daylight;
  assert.equal(nightVisionFactor(0.5, noon), 1);
  assert.equal(nightVisionFactor(0.5, midnight), 0.5);
  assert.equal(visionLimited({ sight: 0.5, fog: 0.6 }, noon), false);
  assert.equal(visionLimited({ sight: 0.5, fog: 0.6 }, midnight), true);
});

test('level tags: the usual range is 42 m, Eagle Eye reaches farther, a boss shows from 80 m', () => {
  assert.equal(tagRange(false, 0, 1), 42);
  assert.equal(tagRange(false, 90, 1), 90);
  assert.equal(tagRange(true, 0, 1), 80);
});

test('level tags: at night the range shrinks by the sight fraction, Eagle Eye included', () => {
  assert.equal(tagRange(false, 0, 0.5), 21);
  assert.equal(tagRange(false, 90, 0.5), 45);
  assert.equal(tagRange(true, 0, 0.5), 40);
});

test('data: only the Bald Eagle has limited vision at night: half the tag range and 60% of the fog distance', () => {
  for (const s of SPECIES) {
    for (const v of s.variants) {
      if (s.id === 'eagle') {
        assert.ok(v.nightVision, 'the Bald Eagle has the debuff');
        assert.equal(v.nightVision.sight, 0.5);
        assert.equal(v.nightVision.fog, 0.6);
      } else {
        assert.equal(v.nightVision, undefined, `${v.name} sees as well at night as by day`);
      }
    }
  }
  const nv = SPECIES.find((s) => s.id === 'eagle')!.variants[0].nightVision!;
  assert.ok(nv.sight > 0 && nv.sight < 1 && nv.fog > 0 && nv.fog < 1);
});

test('data: closing the fog in at night still leaves the Forest a usable view', () => {
  const forest = BIOMES.forest;
  const nv = SPECIES.find((s) => s.id === 'eagle')!.variants[0].nightVision!;
  assert.ok(forest.fogFar * nv.fog > 80, 'the fog never closes in closer than 80 m');
  assert.ok(forest.fogNear * nv.fog < forest.fogFar * nv.fog);
});
