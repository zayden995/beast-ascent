import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, BIOME_LAYOUTS, BIOME_SPAWNS, layoutOf, nextBiome, previousBiome, spawnsOf } from '../../src/data/biomes.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { JUNGLE_SPAWNS } from '../../src/data/jungle.ts';
import { PLAINS_LAYOUT, PLAINS_SPAWNS } from '../../src/data/plains.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { WALL_OFFSET, caveSpot } from '../../src/logic/cave.ts';
import { createHeight, slopeAt, surfaceOf } from '../../src/logic/heightfield.ts';
import { groundSprintSpeed } from '../../src/logic/stats.ts';
import { surfaceAt } from '../../src/logic/water.ts';
import { inLakeZone } from '../../src/logic/waterBound.ts';

const L = PLAINS_LAYOUT;
const h = createHeight(L, []);
const water = { waters: L.waters, rivers: [], waterY: L.waterY };
const [northWestLake, southEastLake] = L.waters;
// The hyena's den is the first cave (in the west), the lion's den the second (on the rise in the east).
const [hyenaDen, lionDen] = L.caves!;
const hill = L.hill!;

const placeholder = (z: { enemyId: string }) => z.enemyId;

test('plains: the Plains are built, with a map, animals and the Hyena Matriarch; Winter is not yet', () => {
  assert.ok(BIOMES.plains.implemented);
  assert.ok(BIOME_LAYOUTS.plains && BIOME_SPAWNS.plains);
  assert.equal(BIOMES.plains.bossId, 'hyena_matriarch');
  assert.equal(BOSSES.hyena_matriarch.biome, 'plains');
  assert.equal(layoutOf('plains'), PLAINS_LAYOUT);
  assert.equal(spawnsOf('plains'), PLAINS_SPAWNS);
  assert.equal(BIOMES.winter.implemented, false);
  assert.throws(() => layoutOf('winter'));
  assert.equal(nextBiome('jungle'), 'plains');
  assert.equal(nextBiome('plains'), 'winter');
  assert.equal(previousBiome('plains'), 'jungle');
});

test('plains: wide and open: far fewer trees than the Forest, gentle ground with no cliffs, and the gates at the north and south edges', () => {
  const forest = layoutOf('forest');
  assert.equal(L.style, 'plains');
  assert.ok(L.trees <= forest.trees * 0.4, `${L.trees} trees against the Forest's ${forest.trees}`);
  assert.ok(L.terrain.rollHeight < forest.terrain.rollHeight, 'gentler rolls');
  assert.equal(L.terrain.maxClimbSlope, undefined, 'no cliffs');
  assert.ok(L.returnGate && L.returnGate.z > 0 && L.gate.z < 0, 'the gate back is at the south edge, the gate onward at the north edge');
  assert.ok(Math.hypot(L.returnGate!.x, L.returnGate!.z) < L.worldRadius - 3 && Math.hypot(L.gate.x, L.gate.z) < L.worldRadius - 3);
  assert.ok(L.worldRadius >= 105);
});

test('plains: two lakes, one in the north-west and one in the south-east, deep in the middle with a dry shore and fish', () => {
  assert.equal(L.waters.length, 2);
  assert.ok(northWestLake.x < -30 && northWestLake.z < -15, 'the north-west lake');
  assert.ok(southEastLake.x > 30 && southEastLake.z > 15, 'the south-east lake');
  for (const w of L.waters) {
    assert.ok(w.radius >= 12, 'big enough to be a lake');
    assert.ok(h(w.x, w.z) < surfaceOf(w, L.waterY) - 1, 'the middle is deep');
    assert.ok(w.fish >= 3, 'fish in every lake');
    assert.equal(surfaceAt(water, w.x + w.radius + 3, w.z), null, 'a dry shore');
  }
});

test('plains: the lakes are clear of the den, the spawn point, the arena, the gates and the dens', () => {
  const { den, playerSpawn, arena, gate, returnGate, worldRadius } = L;
  const places: [string, { x: number; z: number }, number][] = [
    ['den refuge', den, den.refugeRadius + 6],
    ['spawn point', playerSpawn, 8],
    ['arena', arena, arena.radius + 14],
    ['gate', gate, gate.radius + 10],
    ['gate back', returnGate!, returnGate!.radius + 10],
    ['hyena\'s den', hyenaDen, hyenaDen.radius + 12],
    ['lion\'s den', lionDen, lionDen.radius + 12],
    ['foot of the rise', hill, hill.footRadius - 8],
  ];
  for (const w of L.waters) {
    assert.ok(Math.hypot(w.x, w.z) + w.radius + 8 <= worldRadius, 'every lake is well inside the world');
    for (const [name, p, clear] of places) assert.ok(Math.hypot(w.x - p.x, w.z - p.z) >= w.radius + clear, `a lake is too close to the ${name}`);
  }
  assert.ok(Math.hypot(northWestLake.x - southEastLake.x, northWestLake.z - southEastLake.z) > 90, 'the lakes are far apart');
});

test('plains: the den, the arena and both gates stand on flat, dry ground', () => {
  const { den, arena, gate, returnGate } = L;
  assert.ok(Math.abs(h(den.x, den.z) - h(den.x + 5, den.z)) < 1e-6);
  assert.ok(Math.abs(h(arena.x, arena.z) - h(arena.x + 12, arena.z - 9)) < 1e-6);
  assert.ok(Math.abs(h(gate.x, gate.z) - h(gate.x + 3, gate.z + 3)) < 1e-6);
  assert.ok(Math.abs(h(returnGate!.x, returnGate!.z) - h(returnGate!.x + 3, returnGate!.z - 3)) < 1e-6);
  for (const p of [den, arena, gate, returnGate!, L.playerSpawn]) assert.equal(surfaceAt(water, p.x, p.z), null, 'dry');
});

// ---------- The dens ----------

test('plains: the hyena\'s den is in the west and the lion\'s den on a rise in the east, each with its mouth toward the middle of the map and no trail', () => {
  assert.equal(L.caves!.length, 2);
  assert.ok(hyenaDen.x < -40 && lionDen.x > 40, 'west and east');
  for (const cave of [hyenaDen, lionDen]) {
    assert.ok(!cave.trail, 'a den of the open plain has no trail');
    assert.ok(cave.bait >= 2, 'carcasses inside');
    const mouth = caveSpot(cave, cave.mouthDeg, 1);
    const toMiddle = { x: -cave.x, z: -cave.z };
    const dot = (mouth.x - cave.x) * toMiddle.x + (mouth.z - cave.z) * toMiddle.z;
    assert.ok(dot > 0, 'the mouth faces the middle of the map');
    assert.equal(surfaceAt(water, cave.x, cave.z), null, 'a dry floor');
    for (let a = 0; a < 360; a += 45) {
      const p = caveSpot(cave, a, cave.radius - 1);
      assert.ok(Math.abs(h(p.x, p.z) - h(cave.x, cave.z)) < 0.25, 'a level floor');
    }
  }
  assert.ok(Math.hypot(hyenaDen.x - lionDen.x, hyenaDen.z - lionDen.z) > 100, 'far apart');
  // The lion's den stands on top of a low, flat-topped rise that an animal can walk up: no cliff.
  assert.ok(Math.hypot(lionDen.x - hill.x, lionDen.z - hill.z) < hill.plateauRadius - lionDen.radius - 2, 'on the flat top');
  assert.ok(hill.top >= 4 && hill.top <= 8, `the rise is ${hill.top} m high`);
  assert.equal(hill.cliff, undefined, 'a rise, not a cliff');
  for (let a = 0; a < 360; a += 15) {
    for (let d = hill.plateauRadius; d <= hill.footRadius; d += 3) {
      const x = hill.x + Math.cos((a * Math.PI) / 180) * d;
      const z = hill.z + Math.sin((a * Math.PI) / 180) * d;
      assert.ok(slopeAt(h, x, z) < 0.9, `the rise is steep at ${a} degrees, ${d} m out`);
    }
  }
});

test('plains: the lion\'s den is the harder one: four lions that together have far more health than the four hyenas of the other', () => {
  const lairs = PLAINS_SPAWNS.filter((z) => z.lair);
  assert.equal(lairs.length, 2);
  const health = (zone: (typeof lairs)[number]): number => {
    const level = (zone.levelMin + zone.levelMax) / 2;
    return zone.count * ENEMIES[zone.enemyId].baseStats.maxHealth * (1 + TUNING.enemies.levelHealthPct * (level - 1));
  };
  const lions = lairs.find((z) => z.enemyId === 'den_lion')!;
  const hyenas = lairs.find((z) => z.enemyId === 'hyena')!;
  assert.ok(lions && hyenas);
  assert.equal(lions.count, 4);
  assert.equal(hyenas.count, 4);
  assert.ok(health(lions) >= health(hyenas) * 1.8, `lions ${health(lions).toFixed(0)} against hyenas ${health(hyenas).toFixed(0)}`);
  assert.ok(lions.levelMin > hyenas.levelMax, 'the lions are of a higher level');
  // Each den's guards wake, all together, when an animal comes within 14 m, and come back later.
  for (const z of lairs) {
    assert.equal(z.wakeNear, 14);
    assert.ok((z.respawnSeconds ?? 0) >= 180, 'a den takes a while to refill');
  }
  assert.ok(Math.hypot(lions.x - lionDen.x, lions.z - lionDen.z) < lionDen.radius, 'the lions lie in the lion\'s den');
  assert.ok(Math.hypot(hyenas.x - hyenaDen.x, hyenas.z - hyenaDen.z) < hyenaDen.radius, 'the hyenas lie in the hyena\'s den');
});

// ---------- The animals ----------

test('plains: every animal exists, stands inside the world on dry ground (the alligators in their lakes), and is of a Plains level', () => {
  const kinds = new Set(PLAINS_SPAWNS.map(placeholder));
  for (const id of ['antelope', 'buffalo', 'hyena', 'den_lion', 'rival_elephant', 'rival_lion', 'alligator']) assert.ok(kinds.has(id), `no ${id} in the Plains`);
  const jungleMax = Math.max(...JUNGLE_SPAWNS.map((z) => z.levelMax));
  for (const zone of PLAINS_SPAWNS) {
    assert.ok(ENEMIES[zone.enemyId], `unknown enemy ${zone.enemyId}`);
    assert.ok(Math.hypot(zone.x, zone.z) + zone.radius < L.worldRadius - 3, `the ${zone.enemyId} zone is inside the world`);
    assert.ok(zone.levelMin <= zone.levelMax && zone.levelMin > jungleMax, `the ${zone.enemyId} zone is a step up in level from the Jungle`);
    if (zone.enemyId === 'alligator') {
      assert.ok(inLakeZone(water, zone.x, zone.z, 0), 'an alligator zone is in a lake');
    } else {
      assert.equal(surfaceAt(water, zone.x, zone.z), null, `the ${zone.enemyId} zone stands on dry ground`);
      assert.ok(Math.hypot(zone.x - L.den.x, zone.z - L.den.z) > L.den.refugeRadius + zone.radius, `the ${zone.enemyId} zone is clear of the den`);
      assert.ok(Math.hypot(zone.x - L.arena.x, zone.z - L.arena.z) > L.arena.radius + 2, `the ${zone.enemyId} zone is outside the arena`);
    }
    if (!zone.lair) {
      for (const cave of [hyenaDen, lionDen]) {
        assert.ok(Math.hypot(zone.x - cave.x, zone.z - cave.z) > zone.radius + cave.radius + WALL_OFFSET + 3, `the ${zone.enemyId} zone is clear of a den`);
      }
    }
  }
});

test('plains: antelope herds roam the grass, buffalo and hyena packs share it, and the lakes hold three alligators', () => {
  const zones = (id: string) => PLAINS_SPAWNS.filter((z) => z.enemyId === id);
  assert.ok(zones('antelope').length >= 3 && zones('antelope').every((z) => z.count >= 4), 'herds of antelope');
  assert.ok(zones('buffalo').length >= 2 && zones('buffalo').every((z) => z.count >= 2), 'buffalo');
  const packs = zones('hyena').filter((z) => !z.lair);
  assert.ok(packs.length >= 2 && packs.every((z) => z.count === 3), 'roaming hyena packs of 3');
  const gators = zones('alligator');
  assert.equal(gators.reduce((n, z) => n + z.count, 0), 3, 'three alligators');
  assert.equal(gators.filter((z) => Math.hypot(z.x - northWestLake.x, z.z - northWestLake.z) < northWestLake.radius).reduce((n, z) => n + z.count, 0), 2, 'two in the north-west lake');
  assert.equal(gators.filter((z) => Math.hypot(z.x - southEastLake.x, z.z - southEastLake.z) < southEastLake.radius).reduce((n, z) => n + z.count, 0), 1, 'one in the south-east lake');
  for (const z of gators) assert.equal(z.rivalOf, undefined, 'an alligator is nobody\'s rival');
});

test('plains: the rivals are two Elephants and a lion; every species meets 3, within the limit of 5, and can get away from them', () => {
  const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
  const slowestSprint = Math.min(...playable.map((s) => (s.rig === 'winged' ? s.baseStats.sprintSpeed : groundSprintSpeed(s))));
  const rivalZones = PLAINS_SPAWNS.filter((z) => z.rivalOf);
  assert.deepEqual(rivalZones.map((z) => z.rivalOf).sort(), ['elephant', 'elephant', 'lion']);
  for (const zone of rivalZones) {
    assert.equal(zone.count, 1, 'each alone in its territory');
    assert.ok(ENEMIES[zone.enemyId].baseStats.sprintSpeed < slowestSprint, `${zone.enemyId} can be outrun`);
    assert.ok(playable.some((s) => s.id === zone.rivalOf));
  }
  const met = rivalZones.reduce((n, z) => n + z.count, 0);
  assert.ok(met >= 1 && met <= 5, `${met} rivals`);
});

test('plains: the boss waits in the arena at the north and is stronger than the Jungle\'s', () => {
  assert.equal(L.arena.z < 0, true);
  assert.ok(BOSSES.hyena_matriarch.level > BOSSES.silverback.level);
  assert.ok(ENEMIES[BOSSES.hyena_matriarch.summon!.enemyId], 'its pack is a real animal');
});

test('plains: fruit bushes stand on dry open ground, away from the lakes and the dens', () => {
  assert.ok(L.berryBushes.length >= 6);
  for (const [bx, bz] of L.berryBushes) {
    assert.ok(Math.hypot(bx, bz) < L.worldRadius - 8, 'inside the world');
    assert.equal(surfaceAt(water, bx, bz), null, 'dry');
    for (const w of L.waters) assert.ok(Math.hypot(bx - w.x, bz - w.z) > w.radius + 3, 'clear of a lake');
    for (const cave of [hyenaDen, lionDen]) assert.ok(Math.hypot(bx - cave.x, bz - cave.z) > cave.radius + 8, 'clear of a den');
    assert.ok(Math.hypot(bx - L.arena.x, bz - L.arena.z) > L.arena.radius + 3, 'outside the arena');
  }
});
