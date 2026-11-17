import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, BIOME_LAYOUTS, BIOME_SPAWNS, layoutOf, nextBiome, previousBiome, spawnsOf } from '../../src/data/biomes.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { JUNGLE_LAYOUT, JUNGLE_SPAWNS } from '../../src/data/jungle.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { CLIMB_PROBE, climbStep, slideStep, tooSteep } from '../../src/logic/climb.ts';
import { buildRivers, createHeight, hillWeight, slopeAt, surfaceOf } from '../../src/logic/heightfield.ts';
import { currentAt, riverAt, sampleRiver } from '../../src/logic/river.ts';
import { groundSprintSpeed, groundWalkSpeed, swimSpeedFactor } from '../../src/logic/stats.ts';
import { bodyAt, drinkSpot, nearAnyWater, surfaceAt } from '../../src/logic/water.ts';
import { waterfallOf } from '../../src/logic/waterfall.ts';

const L = JUNGLE_LAYOUT;
const rivers = buildRivers(L);
const h = createHeight(L, rivers);
const water = { waters: L.waters, rivers, waterY: L.waterY };
const stream = rivers.find((r) => r.id === 'stream')!;
const river = rivers.find((r) => r.id === 'river')!;
const [pool, lagoon, spring] = L.waters;
const hill = L.hill!;
const fall = waterfallOf(L, rivers)!;
const maxSlope = L.terrain.maxClimbSlope!;

// ---------- The rules ----------

test('climb: ground that rises too steeply ahead stops an animal; ground that falls away never does', () => {
  assert.equal(tooSteep(0, 0.2, 0.4, 1.6), false, 'a gentle rise');
  assert.equal(tooSteep(0, 0.7, 0.4, 1.6), true, 'a wall');
  assert.equal(tooSteep(5, 0, 0.4, 1.6), false, 'a drop');
  assert.equal(tooSteep(3, 2.5, 0.4, 1.6), false, 'in the air above the ground ahead');
});

test('climb: an animal walks a slope it can climb, is stopped by a cliff, and slides along its foot', () => {
  // A wall along x = 10: flat ground west of it, 8 m higher east of it.
  const wall = (x: number) => (x < 10 ? 0 : 8);
  assert.deepEqual(climbStep(wall, 5, 0, 0, 0.3, 0.1, 1.6), { dx: 0.3, dz: 0.1 }, 'open ground');
  assert.deepEqual(climbStep(wall, 9.9, 0, 0, 0.3, 0, 1.6), { dx: 0, dz: 0 }, 'straight into the wall');
  assert.deepEqual(climbStep(wall, 9.9, 0, 0, 0.3, 0.2, 1.6), { dx: 0, dz: 0.2 }, 'at an angle: it slides along');
  assert.deepEqual(climbStep(wall, 10.5, 0, 8, -0.3, 0, 1.6), { dx: -0.3, dz: 0 }, 'walking off the top is allowed');
  // A slow animal takes tiny steps, and must not creep up the wall that way.
  assert.deepEqual(climbStep(wall, 10 - CLIMB_PROBE * 0.5, 0, 0, 0.01, 0, 1.6), { dx: 0, dz: 0 });
  const ramp = (x: number) => x * 0.8;
  assert.deepEqual(climbStep(ramp, 0, 0, 0, 0.3, 0, 1.6), { dx: 0.3, dz: 0 }, 'a slope under the limit');
});

test('climb: an animal on a cliff face slides down it; on ground it could walk up, it stays put', () => {
  const face = (x: number) => -x * 4;
  const slide = slideStep(face, 0, 0, 1.6, 7, 0.1)!;
  assert.ok(slide.dx > 0.69 && slide.dx < 0.71 && Math.abs(slide.dz) < 1e-9, 'straight down the slope, at the sliding speed');
  assert.equal(slideStep((x) => -x * 1.5, 0, 0, 1.6, 7, 0.1), null, 'a slope that can be climbed');
  assert.equal(slideStep((x) => -x * 1.9, 0, 0, 1.6, 7, 0.1), null, 'a little steeper than can be climbed: still no slide');
  assert.equal(slideStep(() => 3, 0, 0, 1.6, 7, 0.1), null, 'flat ground');
});

test('biomes: the Forest, the Jungle and the Plains are built, each with a map, animals and a boss; Winter is not yet', () => {
  for (const id of ['forest', 'jungle', 'plains'] as const) {
    assert.ok(BIOMES[id].implemented, `${id} is built`);
    assert.ok(BIOME_LAYOUTS[id] && BIOME_SPAWNS[id], `${id} has a map and animals`);
    const boss = BIOMES[id].bossId;
    assert.ok(boss && BOSSES[boss] && BOSSES[boss].biome === id, `${id} has its own boss`);
  }
  assert.equal(BIOME_LAYOUTS.winter, undefined);
  assert.throws(() => layoutOf('winter'));
  assert.deepEqual(spawnsOf('winter'), []);
  assert.equal(nextBiome('forest'), 'jungle');
  assert.equal(previousBiome('jungle'), 'forest');
  assert.equal(previousBiome('forest'), null);
});

// ---------- The Jungle's map ----------

test('jungle: bigger bumps than the Forest, more trees, and a gate back to the Forest', () => {
  const forest = layoutOf('forest');
  assert.ok(L.terrain.bumpHeight >= forest.terrain.bumpHeight * 2, 'bumpier ground');
  assert.ok(L.trees > forest.trees * 1.3, 'more trees');
  assert.ok(L.returnGate, 'a gate back');
  assert.equal(forest.returnGate, undefined, 'the first biome has none');
  assert.ok(L.returnGate!.z > 0 && L.gate.z < 0, 'the gate back is at the south edge, the gate onward at the north edge');
  assert.ok(Math.hypot(L.returnGate!.x, L.returnGate!.z) < L.worldRadius - 3 && Math.hypot(L.gate.x, L.gate.z) < L.worldRadius - 3);
});

test('jungle: the hill has a flat top well above the land, with a cliff on one side and slopes that can be walked on the others', () => {
  assert.ok(Math.abs(h(hill.x, hill.z + 9) - hill.top) < 1, `the top is flat at about ${hill.top} m`);
  assert.ok(hill.top > 10, 'a real hill');
  const cliff = hill.cliff!;
  const at = (deg: number, dist: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: hill.x + Math.cos(a) * dist, z: hill.z + Math.sin(a) * dist };
  };
  // On the cliff side the ground reaches the bottom within a few metres of the edge of the top.
  const foot = at(cliff.towardDeg + 20, hill.plateauRadius + cliff.width + 1.5);
  assert.ok(hillWeight(hill, foot.x, foot.z) === 0 && h(foot.x, foot.z) < 2.5, `the foot of the cliff is low (${h(foot.x, foot.z).toFixed(1)} m)`);
  for (const off of [-30, -15, 15, 30]) {
    const mid = at(cliff.towardDeg + off, hill.plateauRadius + cliff.width / 2);
    assert.ok(slopeAt(h, mid.x, mid.z) > maxSlope * 1.5, `the cliff face is far too steep to climb at ${off} degrees (${slopeAt(h, mid.x, mid.z).toFixed(1)})`);
  }
  // On the far side it is an ordinary hillside.
  for (let d = hill.plateauRadius + 1; d < hill.footRadius; d += 2) {
    const p = at(cliff.towardDeg + 180, d);
    assert.ok(slopeAt(h, p.x, p.z) < maxSlope * 0.8, `the back of the hill can be walked at ${d} m (${slopeAt(h, p.x, p.z).toFixed(2)})`);
  }
});

test('jungle: a stream crosses the top of the hill from the spring to the lip of the cliff', () => {
  assert.equal(stream.raised, true);
  assert.equal(surfaceOf(spring, L.waterY), stream.surfaceY, 'the spring and the stream are one sheet of water');
  const first = stream.points[0];
  const last = stream.points[stream.points.length - 1];
  assert.ok(bodyAt([spring], first.x, first.z), 'it starts in the spring');
  const fromMiddle = Math.hypot(last.x - hill.x, last.z - hill.z);
  assert.ok(Math.abs(fromMiddle - hill.plateauRadius) < 1, `it ends at the edge of the top (${fromMiddle.toFixed(1)} m out, the top is ${hill.plateauRadius})`);
  // The water ends at its last point: past the lip there is only air.
  assert.notEqual(surfaceAt(water, last.x + fall.dirX * 0.6, last.z + fall.dirZ * 0.6), stream.surfaceY, 'the stream does not carry on past the lip');
  for (const p of stream.points.slice(4, -4)) {
    const depth = stream.surfaceY - h(p.x, p.z);
    assert.ok(depth > 0.2 && depth < 0.8, `the stream can be waded (${depth.toFixed(2)} m)`);
  }
  assert.ok(stream.current > 0);
});

test('jungle: the waterfall drops from the lip into the plunge pool', () => {
  assert.equal(fall.topY, stream.surfaceY);
  assert.equal(fall.bottomY, L.waterY);
  assert.ok(fall.topY - fall.bottomY > 10, `a tall fall (${(fall.topY - fall.bottomY).toFixed(1)} m)`);
  assert.ok(bodyAt([pool], fall.bottomX, fall.bottomZ), 'the water lands inside the plunge pool');
  assert.ok(surfaceAt(water, fall.bottomX, fall.bottomZ) === L.waterY && h(fall.bottomX, fall.bottomZ) < L.waterY, 'and there is water there to land in');
  // The falling water clears the cliff face all the way down.
  for (let t = 0.1; t < 1; t += 0.1) {
    const y = fall.topY - (fall.topY - fall.bottomY) * t * t;
    const x = fall.topX + fall.dirX * fall.run * t;
    const z = fall.topZ + fall.dirZ * fall.run * t;
    assert.ok(y > h(x, z) - 0.6, `the sheet of water is not buried in the rock ${Math.round(t * 100)}% of the way out (${y.toFixed(1)} against ${h(x, z).toFixed(1)})`);
  }
});

test('jungle: a river runs from the plunge pool to the lagoon, deep enough to swim, with one ford', () => {
  const first = river.points[0];
  const last = river.points[river.points.length - 1];
  assert.ok(bodyAt([pool], first.x, first.z), 'it starts in the plunge pool');
  assert.ok(bodyAt([lagoon], last.x, last.z), 'it ends in the lagoon');
  assert.ok(river.length > 100, `a long river (${river.length.toFixed(0)} m)`);
  let shallow = 0;
  let deep = 0;
  for (const p of river.points) {
    if (bodyAt(L.waters, p.x, p.z)) continue;
    const depth = L.waterY - h(p.x, p.z);
    assert.ok(depth > 0.25, `water all along the middle of the river (${depth.toFixed(2)} m at ${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
    if (depth < 0.7) shallow++;
    if (depth > 1.4) deep++;
  }
  assert.ok(shallow >= 2 && shallow < river.points.length / 3, `one short ford (${shallow} shallow points)`);
  assert.ok(deep > river.points.length / 2, 'most of it is deep enough for any animal to swim');
});

test('jungle: river banks are dry and can be climbed out of everywhere', () => {
  for (const r of rivers) {
    for (let i = 3; i < r.points.length - 4; i += 2) {
      const a = r.points[i - 1];
      const b = r.points[i + 1];
      const p = r.points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = (b.z - a.z) / len;
      const nz = -(b.x - a.x) / len;
      for (const side of [1, -1]) {
        const bx = p.x + nx * side * (p.width / 2 + 1.2);
        const bz = p.z + nz * side * (p.width / 2 + 1.2);
        if (bodyAt(L.waters, bx, bz) || riverAt(rivers, bx, bz)) continue;
        // Near the lip of the waterfall the bank is the cliff edge itself.
        if (r === stream && Math.hypot(bx - hill.x, bz - hill.z) > hill.plateauRadius - 1) continue;
        assert.ok(h(bx, bz) > r.surfaceY, `the bank of the ${r.id} is dry at ${bx.toFixed(0)}, ${bz.toFixed(0)} (${(h(bx, bz) - r.surfaceY).toFixed(2)} m above the water)`);
        for (let k = 0; k <= 1.0001; k += 0.1) {
          const x = p.x + nx * side * (p.width / 2) * k;
          const z = p.z + nz * side * (p.width / 2) * k;
          assert.ok(slopeAt(h, x, z, 0.3) < maxSlope * 0.85, `the bank of the ${r.id} is gentle enough to climb (${slopeAt(h, x, z, 0.3).toFixed(2)} at ${x.toFixed(0)}, ${z.toFixed(0)})`);
        }
      }
    }
  }
});

test('jungle: every pond is a bowl of water with a dry shore, and the three are different', () => {
  assert.equal(L.waters.length, 3);
  for (const w of L.waters) {
    const surface = surfaceOf(w, L.waterY);
    assert.ok(h(w.x, w.z) < surface - 1, 'the middle is deep');
    assert.ok(w.fish >= 2, 'fish in every pond');
  }
  assert.equal(surfaceOf(pool, L.waterY), L.waterY);
  assert.equal(surfaceOf(lagoon, L.waterY), L.waterY);
  assert.ok(surfaceOf(spring, L.waterY) > 10, 'the spring is up on the hill');
  assert.ok((lagoon.lilyPads ?? 0) > 0, 'lily pads on the lagoon');
});

test('jungle: the water is clear of the den, the spawn point, the arena and the gates', () => {
  const { den, playerSpawn, arena, gate, returnGate, worldRadius } = L;
  const places: [string, { x: number; z: number }, number][] = [
    ['den refuge', den, den.refugeRadius + 6],
    ['spawn point', playerSpawn, 8],
    ['arena', arena, arena.radius + 14],
    ['gate', gate, gate.radius + 10],
    ['gate back', returnGate!, returnGate!.radius + 10],
  ];
  for (const w of L.waters) {
    assert.ok(Math.hypot(w.x, w.z) + w.radius + 8 <= worldRadius, 'every pond is well inside the world');
    for (const [name, p, clear] of places) assert.ok(Math.hypot(w.x - p.x, w.z - p.z) >= w.radius + clear, `a pond is too close to the ${name}`);
  }
  for (const r of rivers) {
    for (const p of r.points) {
      assert.ok(Math.hypot(p.x, p.z) + p.width / 2 + 8 <= worldRadius, `the ${r.id} stays well inside the world`);
      for (const [name, q, clear] of places) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= p.width / 2 + clear, `the ${r.id} is too close to the ${name}`);
    }
  }
});

test('jungle: the den, the arena and both gates stand on flat, dry ground', () => {
  const { den, arena, gate, returnGate } = L;
  assert.ok(Math.abs(h(den.x, den.z) - h(den.x + 5, den.z)) < 1e-6);
  assert.ok(Math.abs(h(arena.x, arena.z) - h(arena.x + 12, arena.z - 9)) < 1e-6);
  assert.ok(Math.abs(h(gate.x, gate.z) - h(gate.x + 3, gate.z + 3)) < 1e-6);
  assert.ok(Math.abs(h(returnGate!.x, returnGate!.z) - h(returnGate!.x + 3, returnGate!.z - 3)) < 1e-6);
  for (const p of [den, arena, gate, returnGate!, L.playerSpawn]) assert.equal(surfaceAt(water, p.x, p.z), null, 'dry');
});

test('jungle: "near water" and drinking spots work at the river as well as at the ponds', () => {
  const mid = river.points[Math.floor(river.points.length * 0.3)];
  assert.ok(nearAnyWater(water, mid.x, mid.z, L.nearWaterMargin), 'in the river');
  assert.ok(nearAnyWater(water, lagoon.x + lagoon.radius + 5, lagoon.z, L.nearWaterMargin), 'by the lagoon');
  assert.equal(nearAnyWater(water, L.den.x, L.den.z, L.nearWaterMargin), false, 'the den is not near water');
  const spot = drinkSpot(water, mid.x, mid.z - 12, 30)!;
  assert.ok(spot, 'an animal 12 m from the river finds a place to drink');
  assert.equal(surfaceAt(water, spot.x, spot.z), null, 'on dry ground');
  assert.ok(h(spot.x, spot.z) > L.waterY);
});

// ---------- Getting around ----------

/** Every place an animal can walk or swim to from `start`, on a 1 m grid, by the game's own climbing rule. */
function reachableFrom(start: { x: number; z: number }): Set<string> {
  const R = L.worldRadius - 4;
  const key = (x: number, z: number) => `${x},${z}`;
  // An animal about a metre tall floats with its feet half a metre under the surface.
  const feet = (x: number, z: number) => {
    const surface = surfaceAt(water, x, z);
    return surface === null ? h(x, z) : Math.max(h(x, z), surface - 0.5);
  };
  const seen = new Set<string>();
  const sx = Math.round(start.x);
  const sz = Math.round(start.z);
  const queue: [number, number][] = [[sx, sz]];
  seen.add(key(sx, sz));
  while (queue.length) {
    const [x, z] = queue.pop()!;
    const y = feet(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (Math.hypot(nx, nz) > R || seen.has(key(nx, nz))) continue;
      // Walk there in half-metre steps, as the game does.
      let ok = true;
      let fy = y;
      for (let k = 1; k <= 2 && ok; k++) {
        const px = x + (dx * (k - 1)) / 2;
        const pz = z + (dz * (k - 1)) / 2;
        const step = climbStep(h, px, pz, fy, dx / 2, dz / 2, maxSlope);
        ok = step.dx === dx / 2 && step.dz === dz / 2;
        fy = feet(x + (dx * k) / 2, z + (dz * k) / 2);
      }
      if (!ok) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  return seen;
}

test('jungle: from the den an animal can reach every place that matters, on foot and by swimming', () => {
  const reach = reachableFrom(L.playerSpawn);
  const can = (p: { x: number; z: number }) => reach.has(`${Math.round(p.x)},${Math.round(p.z)}`);
  const places: [string, { x: number; z: number }][] = [
    ['the boss arena', L.arena],
    ['the gate onward', { x: L.gate.x, z: L.gate.z + 7 }],
    ['the gate back', { x: L.returnGate!.x, z: L.returnGate!.z - 7 }],
    ['the top of the hill', { x: hill.x, z: hill.z + 9 }],
    ['the spring', { x: spring.x + spring.radius + 2, z: spring.z }],
    ['the foot of the waterfall', { x: fall.bottomX + fall.dirX * 6, z: fall.bottomZ + fall.dirZ * 6 }],
    ['the lagoon', { x: lagoon.x - lagoon.radius - 2, z: lagoon.z }],
    ['the middle of the river', river.points[Math.floor(river.points.length / 2)]],
  ];
  for (const zone of JUNGLE_SPAWNS) places.push([`the ${zone.enemyId} zone`, zone]);
  for (const [bx, bz] of L.berryBushes) places.push(['a fruit bush', { x: bx, z: bz }]);
  for (const [name, p] of places) assert.ok(can(p), `${name} cannot be reached from the den (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
});

test('jungle: the cliff cannot be climbed, so the top of the hill is reached the long way round', () => {
  // Start at the foot of the cliff and allow walking only inside the cliff's own sector, up to the edge of the top.
  const cliff = hill.cliff!;
  const toward = (cliff.towardDeg * Math.PI) / 180;
  let climbed = false;
  for (let off = -cliff.halfDeg + 5; off <= cliff.halfDeg - 5; off += 5) {
    const a = toward + (off * Math.PI) / 180;
    let d = hill.plateauRadius + cliff.width + 2;
    let y = h(hill.x + Math.cos(a) * d, hill.z + Math.sin(a) * d);
    for (let i = 0; i < 200 && d > hill.plateauRadius - 1; i++) {
      const x = hill.x + Math.cos(a) * d;
      const z = hill.z + Math.sin(a) * d;
      const step = climbStep(h, x, z, Math.max(y, h(x, z)), -Math.cos(a) * 0.2, -Math.sin(a) * 0.2, maxSlope);
      if (Math.hypot(step.dx, step.dz) < 0.19) break;
      d -= 0.2;
      y = h(hill.x + Math.cos(a) * d, hill.z + Math.sin(a) * d);
    }
    if (d <= hill.plateauRadius - 1) climbed = true;
  }
  assert.equal(climbed, false);
});

// ---------- The current ----------

test('jungle: the current is real but gentle: every animal can swim against it', () => {
  const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
  const slowestSwim = Math.min(...playable.map((s) => groundWalkSpeed(s) * swimSpeedFactor(s.swimSpeedMult, 0)));
  for (const r of rivers) {
    assert.ok(r.current >= 0.8, `the ${r.id} has a current you can feel (${r.current} m/s)`);
    assert.ok(r.current <= slowestSwim * 0.5, `the ${r.id} (${r.current} m/s) must be no more than half the slowest swimmer's pace (${slowestSwim.toFixed(2)} m/s)`);
  }
  const mid = river.points[Math.floor(river.points.length * 0.3)];
  const flow = currentAt(rivers, mid.x, mid.z);
  assert.ok(Math.abs(Math.hypot(flow.x, flow.z) - river.current) < 0.01, 'full strength in the middle');
  const s = sampleRiver(river, mid.x, mid.z)!;
  assert.ok(flow.x * s.dirX + flow.z * s.dirZ > 0, 'it flows downstream, toward the lagoon');
  assert.deepEqual(currentAt(rivers, lagoon.x + 5, lagoon.z + 5), { x: 0, z: 0 }, 'the lagoon is still water');
});

// ---------- The animals ----------

test('jungle: at least three kinds of wild animal besides the rivals, a step up in level from the Forest', () => {
  const kinds = new Set(JUNGLE_SPAWNS.filter((z) => !z.rivalOf).map((z) => z.enemyId));
  assert.ok(kinds.size >= 3);
  const forestTop = Math.max(...spawnsOf('forest').map((z) => z.levelMax));
  for (const zone of JUNGLE_SPAWNS) {
    assert.ok(ENEMIES[zone.enemyId], `unknown enemy ${zone.enemyId}`);
    assert.ok(Math.hypot(zone.x, zone.z) + zone.radius < L.worldRadius, `${zone.enemyId} zone inside the world`);
    assert.ok(zone.levelMin <= zone.levelMax && zone.levelMin > forestTop, `${zone.enemyId}: above the Forest's level ${forestTop}`);
    assert.ok(Math.hypot(zone.x - L.den.x, zone.z - L.den.z) > L.den.refugeRadius + zone.radius, `${zone.enemyId} zone keeps out of the den's refuge`);
  }
  assert.ok(JUNGLE_SPAWNS.some((z) => ENEMIES[z.enemyId].behavior.fleeOnSight), 'there is prey to hunt');
});

test('jungle: its rivals are tigers and crocodiles; every species meets 1 to 5 and can get away', () => {
  const playable = SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone));
  const slowestSprint = Math.min(...playable.map((s) => (s.rig === 'winged' ? s.baseStats.sprintSpeed : groundSprintSpeed(s))));
  const rivalZones = JUNGLE_SPAWNS.filter((z) => z.rivalOf);
  assert.deepEqual([...new Set(rivalZones.map((z) => z.rivalOf))].sort(), ['crocodile', 'tiger']);
  for (const zone of rivalZones) {
    const def = ENEMIES[zone.enemyId];
    assert.ok(def.behavior.aggressive && !def.behavior.fleeOnSight && def.attacks.length >= 2, `${def.id} must be a real fighter`);
    assert.ok(def.baseStats.sprintSpeed < slowestSprint, `${def.id} must be escapable by the slowest playable species`);
  }
  // Every species meets every rival, its own kind included (since 2026-11-18).
  const count = rivalZones.reduce((n, z) => n + z.count, 0);
  assert.ok(count >= 1 && count <= 5, `a player meets ${count} rival predators`);
  // The wild crocodile lives in the water: its territories are on the river and the lagoon.
  assert.equal(ENEMIES.rival_crocodile.behavior.aquatic, true);
  for (const zone of rivalZones.filter((z) => z.rivalOf === 'crocodile')) {
    assert.ok(nearAnyWater(water, zone.x, zone.z, 2), 'a crocodile territory is on the water');
  }
});

test('jungle: the boss is a giant silverback, stronger than the Forest\'s stag', () => {
  const boss = BOSSES.silverback;
  const stag = BOSSES.ancient_stag;
  assert.equal(BIOMES.jungle.bossId, 'silverback');
  assert.ok(boss.level > stag.level);
  assert.ok(boss.enemy.baseStats.maxHealth > stag.enemy.baseStats.maxHealth * 1.5 && boss.enemy.baseStats.damage > stag.enemy.baseStats.damage * 1.5);
  assert.ok(boss.enemy.attacks.length >= 3 && new Set(boss.enemy.attacks.map((a) => a.kind)).size === 3, 'a swing, a charge and an area attack');
  assert.ok(boss.enemy.xp > stag.enemy.xp && boss.repeatXp < boss.enemy.xp);
  // It guards its arena like the stag: it cannot be led far out of it.
  assert.ok(boss.enemy.behavior.leashRadius <= L.arena.radius + 6);
});
