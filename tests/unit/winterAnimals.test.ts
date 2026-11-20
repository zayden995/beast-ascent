import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { WINTER_LAYOUT, WINTER_SPAWNS } from '../../src/data/winter.ts';
import { createHeight } from '../../src/logic/heightfield.ts';
import { mountainSpot, onTrail } from '../../src/logic/mountain.ts';
import { groundSprintSpeed } from '../../src/logic/stats.ts';
import { waveHits } from '../../src/logic/wave.ts';

const L = WINTER_LAYOUT;
const m = L.mountain!;
const zonesOf = (id: string) => WINTER_SPAWNS.filter((z) => z.enemyId === id);
const onMountain = (z: { x: number; z: number }) => {
  const spot = mountainSpot(m, z.x, z.z);
  return spot !== null && spot.shelf >= 0 && spot.shelf < m.laps;
};
const inIce = (x: number, z: number) => L.waters.some((w) => w.frozen && w.surfaceY === undefined && Math.hypot(x - w.x, z - w.z) < w.radius);

test('winter animals: hares, foxes, an arctic wolf pack and two polar bears below; goats and snow leopards on the mountain', () => {
  const count = (id: string) => zonesOf(id).reduce((n, z) => n + z.count, 0);
  assert.equal(count('arctic_hare'), 8);
  assert.equal(zonesOf('arctic_hare').length, 2);
  assert.equal(count('arctic_fox'), 4);
  assert.equal(count('arctic_wolf'), 3);
  assert.equal(count('polar_bear'), 2);
  assert.equal(count('mountain_goat'), 6);
  assert.equal(zonesOf('mountain_goat').length, 2);
  assert.equal(count('snow_leopard'), 3);
  for (const zone of WINTER_SPAWNS) assert.ok(ENEMIES[zone.enemyId], `${zone.enemyId} exists`);
});

test('winter animals: levels 24 to 28 below the mountain and 28 to 34 on it, above the Plains\' 16 to 23', () => {
  for (const zone of WINTER_SPAWNS) {
    if (onMountain(zone)) assert.ok(zone.levelMin >= 28 && zone.levelMax <= 34, `${zone.enemyId} on the mountain: ${zone.levelMin}-${zone.levelMax}`);
    else assert.ok(zone.levelMin >= 24 && zone.levelMax <= 28, `${zone.enemyId} below: ${zone.levelMin}-${zone.levelMax}`);
  }
  for (const id of ['mountain_goat', 'snow_leopard']) for (const zone of zonesOf(id)) assert.ok(onMountain(zone), `${id} lives on the mountain`);
  for (const id of ['arctic_hare', 'arctic_fox', 'arctic_wolf', 'polar_bear']) for (const zone of zonesOf(id)) assert.ok(!onMountain(zone), `${id} lives below`);
  for (const zone of zonesOf('polar_bear')) assert.ok(inIce(zone.x, zone.z), 'the polar bears roam the ice');
});

test('winter animals: the snow leopards each lie alone on a ledge beside the trail, waking at 10 m, far enough apart to wake one at a time', () => {
  const leopards = zonesOf('snow_leopard');
  const h = createHeight(L, []);
  for (const z of leopards) {
    assert.equal(z.count, 1);
    assert.equal(z.lair, true);
    assert.equal(z.wakeNear, 10);
    assert.equal(onTrail(m, z.x, z.z), false, 'beside the trail, not on it');
    // A ledge: flat enough to lie on.
    const s = Math.hypot(h(z.x + 0.5, z.z) - h(z.x - 0.5, z.z), h(z.x, z.z + 0.5) - h(z.x, z.z - 0.5));
    assert.ok(s < 0.6, `a leopard's ledge is too steep (${s.toFixed(2)})`);
  }
  for (let i = 0; i < leopards.length; i++) {
    for (let j = i + 1; j < leopards.length; j++) {
      assert.ok(Math.hypot(leopards[i].x - leopards[j].x, leopards[i].z - leopards[j].z) > 24, 'a waking lair wakes every calm guard within 24 m');
    }
  }
});

test('winter animals: the rivals are three arctic wolves and two polar bears: five, the limit', () => {
  const rivals = WINTER_SPAWNS.filter((z) => z.rivalOf);
  assert.equal(rivals.reduce((n, z) => n + z.count, 0), 5);
  assert.deepEqual([...new Set(rivals.map((z) => z.rivalOf))].sort(), ['bear', 'wolf']);
});

const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
/** An animal's sprint on foot in Winter, with Winter's speed buff or nerf (its first variant's). */
const winterSpeed = (id: string) => {
  const s = SPECIES.find((x) => x.id === id)!;
  const mod = s.variants[0].biomeMods.find((b) => b.biome === 'winter' && b.stat === 'speed');
  return groundSprintSpeed(s) * (1 + (mod?.pct ?? 0));
};

test('winter animals: every fighter sprints slower than the slowest species normally does (7.2 m/s)', () => {
  const slowest = Math.min(...playable.map((s) => (s.rig === 'winged' ? s.baseStats.sprintSpeed : groundSprintSpeed(s))));
  for (const zone of WINTER_SPAWNS) {
    const def = ENEMIES[zone.enemyId];
    if (def.behavior.aggressive) assert.ok(def.baseStats.sprintSpeed < slowest, `${def.id} sprints ${def.baseStats.sprintSpeed}`);
  }
});

test('winter animals: the exception the user accepted: slowed by Winter, the Elephant and the Crocodile cannot outrun its fighters', () => {
  const fastest = Math.max(...WINTER_SPAWNS.map((z) => ENEMIES[z.enemyId]).filter((d) => d.behavior.aggressive).map((d) => d.baseStats.sprintSpeed));
  assert.ok(winterSpeed('elephant') < fastest, `Elephant ${winterSpeed('elephant').toFixed(2)} against ${fastest}`);
  assert.ok(winterSpeed('crocodile') < fastest, `Crocodile ${winterSpeed('crocodile').toFixed(2)} against ${fastest}`);
  for (const s of playable) {
    if (s.id === 'elephant' || s.id === 'crocodile' || s.rig === 'winged') continue;
    assert.ok(winterSpeed(s.id) > fastest, `${s.id} ${winterSpeed(s.id).toFixed(2)} must out-sprint ${fastest}`);
  }
});

test('woolly mammoth: level 40, 5000 health, a tusk sweep, a trunk slam, a charge and the ice shockwave; it calls no helpers', () => {
  const boss = BOSSES.woolly_mammoth;
  assert.equal(boss.level, 40);
  assert.equal(boss.enemy.baseStats.maxHealth, 5000);
  assert.equal(boss.summon, undefined);
  assert.deepEqual(boss.enemy.attacks.map((a) => a.kind).sort(), ['aoe', 'charge', 'melee', 'wave']);
  const wave = boss.enemy.attacks.find((a) => a.kind === 'wave')!;
  assert.equal(wave.iceWear, 0.5);
  assert.ok(wave.radius! <= L.arena.radius + 2 && wave.radius! >= 9, 'the ring crosses the pool and stops at the rim');
  const charge = boss.enemy.attacks.find((a) => a.kind === 'charge')!;
  assert.ok(charge.range <= m.topRadius * 2 && charge.speed! * charge.duration! < 2 * L.arena.radius, 'the charge fits on the peak');
  assert.ok(boss.enemy.features.includes('longTusks') && boss.enemy.features.includes('shaggy') && boss.enemy.features.includes('hump'));
  assert.equal(boss.enemy.xp, 1500);
  assert.equal(boss.repeatXp, 100);
});

test('woolly mammoth: a frozen pool lies in the middle of the peak, at the peak\'s own height', () => {
  const pool = L.waters.find((w) => w.frozen && w.surfaceY !== undefined)!;
  assert.ok(pool, 'a raised frozen pool');
  assert.ok(Math.hypot(pool.x - m.x, pool.z - m.z) < 0.5);
  assert.equal(pool.radius, 9);
  const h = createHeight(L, []);
  const peak = h(m.x + m.topRadius - 2, m.z);
  assert.ok(Math.abs(pool.surfaceY! - (peak - 0.5)) < 0.1, `the pool's surface ${pool.surfaceY} sits half a metre under the peak's ground ${peak.toFixed(2)}`);
  assert.ok(h(pool.x, pool.z) < pool.surfaceY! - 1, 'deep enough to swim in a hole');
});

test('wave: the ring hits an animal on the ground once as it passes; a jump or a dodge lets it pass', () => {
  // The ring's band this step runs from (prev - width) to radius.
  assert.equal(waveHits(4, 5, 1.5, 4.5, true, false), true, 'passing over it');
  assert.equal(waveHits(4, 5, 1.5, 3.2, true, false), true, 'still inside the band');
  assert.equal(waveHits(4, 5, 1.5, 2, true, false), false, 'already past');
  assert.equal(waveHits(4, 5, 1.5, 6, true, false), false, 'not reached yet');
  assert.equal(waveHits(4, 5, 1.5, 4.5, false, false), false, 'in the air');
  assert.equal(waveHits(4, 5, 1.5, 4.5, true, true), false, 'in a dodge roll');
});
