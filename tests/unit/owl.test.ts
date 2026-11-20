import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENEMIES } from '../../src/data/enemies.ts';
import { SPECIES } from '../../src/data/species.ts';
import { WINTER_SPAWNS } from '../../src/data/winter.ts';
import { owlTarget } from '../../src/logic/owl.ts';
import type { OwlCandidate } from '../../src/logic/owl.ts';

const owl = ENEMIES.snowy_owl;
const b = owl.behavior.flier!;
const home = { x: 0, y: 8, z: 0, homeX: 0, homeZ: 0 };
const eagle = (x: number, y: number, z: number): OwlCandidate => ({ id: 1, x, y, z, flying: true, untargetable: false });
const wolf = (x: number, z: number): OwlCandidate => ({ id: 2, x, y: 0, z, flying: false, untargetable: false });

test('owl: the snowy owl is a winged animal of Winter that flies slower than the Eagle, so an Eagle can always out-fly it', () => {
  assert.equal(owl.rig, 'winged');
  const eagleSpecies = SPECIES.find((s) => s.id === 'eagle')!;
  assert.ok(b.flySpeed < eagleSpecies.baseStats.sprintSpeed, `${b.flySpeed} against the Eagle's ${eagleSpecies.baseStats.sprintSpeed}`);
  assert.equal(b.huntRange, 30);
  assert.equal(b.pesterRange, 10);
  const zones = WINTER_SPAWNS.filter((z) => z.enemyId === 'snowy_owl');
  assert.ok(zones.length >= 3 && zones.length <= 4);
  for (const z of zones) assert.ok(z.levelMin >= 24 && z.levelMax <= 28, 'below the mountain');
});

test('owl: an Eagle in the air within 30 m is hunted, at any height', () => {
  assert.deepEqual(owlTarget(home, [eagle(20, 25, 0)], b, false), { id: 1, mode: 'hunt' });
  assert.deepEqual(owlTarget(home, [eagle(10, 8, 5)], b, false), { id: 1, mode: 'hunt' });
  assert.equal(owlTarget(home, [eagle(40, 8, 0)], b, true), null, 'too far');
});

test('owl: an animal on the ground near its tree is only pestered, and only when the owl is ready again', () => {
  assert.deepEqual(owlTarget(home, [wolf(8, 0)], b, true), { id: 2, mode: 'pester' });
  assert.equal(owlTarget(home, [wolf(12, 0)], b, true), null, 'beyond 10 m of the tree');
  assert.equal(owlTarget(home, [wolf(8, 0)], b, false), null, 'still resting from the last peck');
});

test('owl: a flier comes first; an injured pet is never chosen; and it never goes beyond its home range', () => {
  assert.deepEqual(owlTarget(home, [wolf(5, 0), eagle(25, 20, 0)], b, true), { id: 1, mode: 'hunt' });
  assert.equal(owlTarget(home, [{ ...wolf(5, 0), untargetable: true }], b, true), null);
  const far = { ...home, x: b.homeRange + 10 };
  assert.equal(owlTarget(far, [eagle(b.homeRange + 15, 10, 0)], b, true), null, 'the Eagle is beyond its home range');
});
