import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, BIOME_LAYOUTS, BIOME_SPAWNS, layoutOf, nextBiome, previousBiome } from '../../src/data/biomes.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { WINTER_LAYOUT } from '../../src/data/winter.ts';
import { climbStep, slideStep } from '../../src/logic/climb.ts';
import { createHeight, slopeAt } from '../../src/logic/heightfield.ts';
import { mountainHeight, mountainOuterRadius, mountainSpot, onTrail, trailPoint } from '../../src/logic/mountain.ts';

const L = WINTER_LAYOUT;
const m = L.mountain!;
const h = createHeight(L, []);
const maxSlope = L.terrain.maxClimbSlope!;
// The frozen lake (at the biome's water level); the frozen pool on the peak is the mammoth's, and is tested with it.
const frozen = L.waters.filter((w) => w.frozen && w.surfaceY === undefined);
const pool = L.waters.find((w) => w.frozen && w.surfaceY !== undefined)!;
const inPool = (x: number, z: number) => Math.hypot(x - pool.x, z - pool.z) < pool.radius;
const inIce = (x: number, z: number) => frozen.some((w) => Math.hypot(x - w.x, z - w.z) < w.radius);
/** Where an animal's feet are: on the ice over the frozen lake, on the ground everywhere else. */
const feet = (x: number, z: number) => (inIce(x, z) ? Math.max(h(x, z), L.waterY + 0.15) : inPool(x, z) ? Math.max(h(x, z), pool.surfaceY! + 0.15) : h(x, z));

test('winter: Winter is built, with a map and the Woolly Mammoth, and it is the last biome', () => {
  assert.ok(BIOMES.winter.implemented);
  assert.ok(BIOME_LAYOUTS.winter && BIOME_SPAWNS.winter);
  assert.equal(layoutOf('winter'), WINTER_LAYOUT);
  assert.equal(BIOMES.winter.bossId, 'woolly_mammoth');
  assert.equal(BOSSES.woolly_mammoth.biome, 'winter');
  assert.equal(nextBiome('winter'), null);
  assert.equal(previousBiome('winter'), 'plains');
  assert.equal(L.style, 'winter');
  assert.equal(L.gate.unused, true, 'the last biome has no gate onward');
  assert.ok(L.returnGate && L.returnGate.z > 90, 'the gate back to the Plains is at the south edge');
});

// ---------- The mountain ----------

test('mountain: a flat peak at the top, nothing beyond the foot, and the whole mountain inside the world', () => {
  assert.equal(mountainHeight(m, m.x, m.z), m.top);
  assert.equal(mountainHeight(m, m.x + m.topRadius - 0.5, m.z), m.top);
  assert.equal(mountainHeight(m, m.x + mountainOuterRadius(m) + 1, m.z), null);
  assert.ok(Math.hypot(m.x, m.z) + mountainOuterRadius(m) < L.worldRadius - 3, 'the trail never runs into the world edge');
  assert.ok(m.top >= 35, 'a real climb');
});

test('mountain: the trail starts at the west foot and climbs steadily, about twice round, to the peak', () => {
  const start = trailPoint(m, 0);
  const end = trailPoint(m, 1);
  assert.ok(Math.abs(start.y) < 1e-9 && Math.abs(end.y - m.top) < 1e-9);
  assert.ok(start.x < m.x - 40 && Math.abs(start.z - m.z) < 1, 'it starts on the west side');
  assert.ok(Math.hypot(end.x - m.x, end.z - m.z) <= m.topRadius + m.trailWidth / 2 + 1e-6, 'it ends at the edge of the peak');
  assert.equal(m.laps, 2);
  let length = 0;
  let prev = start;
  for (let i = 1; i <= 400; i++) {
    const p = trailPoint(m, i / 400);
    const run = Math.hypot(p.x - prev.x, p.z - prev.z);
    length += run;
    assert.ok((p.y - prev.y) / run < 0.3, 'never steep');
    prev = p;
  }
  assert.ok(length > 380 && length < 650, `about 500 m long (${length.toFixed(0)} m)`);
  // Clockwise seen from above with north up: from the west it goes north first.
  assert.ok(trailPoint(m, 0.125).z < m.z - 30, 'a quarter of the first lap later it is north of the peak');
});

test('mountain: the ground on the trail is the trail\'s height, and the trail band is known', () => {
  for (const along of [0.1, 0.3, 0.55, 0.8, 0.95]) {
    const p = trailPoint(m, along);
    assert.ok(Math.abs(mountainHeight(m, p.x, p.z)! - p.y) < 0.05, `at ${along}`);
    assert.ok(onTrail(m, p.x, p.z));
    assert.equal(mountainSpot(m, p.x, p.z)!.along.toFixed(3), along.toFixed(3));
  }
  assert.equal(onTrail(m, m.x, m.z), false, 'the peak is not the trail');
});

test('mountain: between two laps the ground is a cliff about half the mountain high', () => {
  // Half way round the first lap (the east side), walk straight in toward the peak.
  const a = Math.PI + (m.startDeg * Math.PI) / 180;
  let steepest = 0;
  for (let r = mountainOuterRadius(m) - 2; r > m.topRadius + 1; r -= 0.25) {
    const x = m.x + Math.cos(a) * r;
    const z = m.z + Math.sin(a) * r;
    const x2 = m.x + Math.cos(a) * (r - 0.25);
    const z2 = m.z + Math.sin(a) * (r - 0.25);
    const rise = mountainHeight(m, x2, z2)! - mountainHeight(m, x, z)!;
    steepest = Math.max(steepest, rise / 0.25);
  }
  assert.ok(steepest > maxSlope * 2, `the step up to the next lap is a cliff (${steepest.toFixed(1)})`);
  // On this side the second lap passes straight inward of the first, half the mountain higher.
  const lap1 = trailPoint(m, 0.25);
  const lap2 = trailPoint(m, 0.75);
  assert.ok(Math.abs(Math.atan2(lap1.z - m.z, lap1.x - m.x) - Math.atan2(lap2.z - m.z, lap2.x - m.x)) < 1e-6, 'the same side');
  assert.ok(Math.abs(lap2.y - lap1.y - m.top / m.laps) < 1, `${lap1.y.toFixed(1)} then ${lap2.y.toFixed(1)}`);
  assert.ok(Math.hypot(lap2.x - m.x, lap2.z - m.z) < Math.hypot(lap1.x - m.x, lap1.z - m.z) - 15, 'well inside it');
});

// ---------- The map ----------

/** The share of the world (on a 1 m grid) for which `inside` is true. */
function share(inside: (x: number, z: number) => boolean): number {
  let n = 0;
  let hits = 0;
  const R = L.worldRadius;
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      if (Math.hypot(x, z) > R) continue;
      n++;
      if (inside(x, z)) hits++;
    }
  }
  return hits / n;
}

test('winter: about a fifth of the map is ice and about a third is mountain; the rest is snow', () => {
  const ice = share(inIce);
  const mountain = share((x, z) => mountainHeight(m, x, z) !== null);
  assert.ok(ice >= 0.17 && ice <= 0.28, `ice ${ice.toFixed(3)}`);
  assert.ok(mountain >= 0.28 && mountain <= 0.42, `mountain ${mountain.toFixed(3)}`);
  assert.equal(share((x, z) => inIce(x, z) && mountainHeight(m, x, z) !== null), 0, 'no ice on the mountain');
});

test('winter: the frozen lake is one lake in the south-west, deep under the ice with no land inside, and without fish', () => {
  assert.ok(frozen.length >= 3);
  for (const w of frozen) {
    assert.equal(w.fish, 0, 'nothing fishes through the ice');
    assert.ok(w.x < 10, 'in the west half');
    assert.ok(Math.hypot(w.x, w.z) + w.radius <= L.worldRadius - 2, 'inside the world');
  }
  // Every point 3 m or more inside the lake's outline is under water (no ridge where two circles overlap).
  const deepInside = (x: number, z: number) => frozen.some((w) => Math.hypot(x - w.x, z - w.z) < w.radius - 3);
  for (let x = -112; x <= 112; x += 1) {
    for (let z = -112; z <= 112; z += 1) {
      if (deepInside(x, z)) assert.ok(h(x, z) < L.waterY, `land inside the lake at (${x}, ${z})`);
    }
  }
  // The circles make one lake: a flood over the ice from the first circle reaches every circle.
  const key = (x: number, z: number) => `${x},${z}`;
  const seen = new Set<string>([key(Math.round(frozen[0].x), Math.round(frozen[0].z))]);
  const queue = [[Math.round(frozen[0].x), Math.round(frozen[0].z)]];
  while (queue.length) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inIce(nx, nz) || seen.has(key(nx, nz))) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  for (const w of frozen) assert.ok(seen.has(key(Math.round(w.x), Math.round(w.z))), `a circle at (${w.x}, ${w.z}) is cut off`);
});

test('winter: the ice keeps clear of the mountain, the den\'s refuge, the spawn point and the gate back', () => {
  const { den, playerSpawn, returnGate } = L;
  for (const w of frozen) {
    assert.ok(Math.hypot(w.x - m.x, w.z - m.z) >= w.radius + mountainOuterRadius(m), 'clear of the mountain');
    assert.ok(Math.hypot(w.x - den.x, w.z - den.z) >= w.radius + den.refugeRadius + 3, 'clear of the den\'s refuge');
    assert.ok(Math.hypot(w.x - playerSpawn.x, w.z - playerSpawn.z) >= w.radius + 4, 'clear of the spawn point');
    assert.ok(Math.hypot(w.x - returnGate!.x, w.z - returnGate!.z) >= w.radius + returnGate!.radius + 4, 'clear of the gate back');
  }
  // The ice lies right beside the den's shore, to its west and north.
  const nearest = Math.min(...frozen.map((w) => Math.hypot(w.x - den.x, w.z - den.z) - w.radius - den.refugeRadius));
  assert.ok(nearest <= 6, `the ice is ${nearest.toFixed(1)} m from the den's refuge`);
});

test('winter: the den, the spawn point, the gate back and the peak\'s arena stand on flat ground, not ice', () => {
  const { den, playerSpawn, returnGate, arena } = L;
  // The arena's ground is the ring round the frozen pool in its middle.
  const arenaGround = { x: arena.x + pool.radius + 2, z: arena.z };
  for (const [name, p] of [['den', den], ['spawn', playerSpawn], ['gate back', { x: returnGate!.x, z: returnGate!.z - 8 }], ['arena', arenaGround]] as const) {
    assert.equal(inIce(p.x, p.z), false, `${name} is not on ice`);
    assert.ok(slopeAt(h, p.x, p.z) < 0.25, `${name} is flat`);
    assert.ok(h(p.x, p.z) > L.waterY, `${name} is dry`);
  }
  assert.ok(Math.hypot(arena.x - m.x, arena.z - m.z) < 0.5, 'the arena is on the peak');
  assert.ok(Math.abs(h(arenaGround.x, arenaGround.z) - h(trailPoint(m, 0.995).x, trailPoint(m, 0.995).z)) < 0.5, 'at the top of the trail');
  assert.ok(arena.radius + 2 < m.topRadius, 'the rim fits on the peak');
});

// ---------- Getting up the mountain ----------

/** Ground so steep that the game slides an animal off it (`slideStep`): nothing can stand there. */
const slides = (x: number, z: number) => slideStep(feet, x, z, maxSlope, 7, 0.1) !== null;

/**
 * Every place an animal can walk to from `start` on a 1 m grid by the game's own rules (it cannot step up ground too steep to
 * climb, and it cannot stand on ground so steep that it slides off), never stepping where `blocked`.
 */
function reachableFrom(start: { x: number; z: number }, blocked: (x: number, z: number) => boolean = () => false): Set<string> {
  const R = L.worldRadius - 4;
  const key = (x: number, z: number) => `${x},${z}`;
  const ground = (x: number, z: number) => feet(x, z);
  const seen = new Set<string>();
  const sx = Math.round(start.x);
  const sz = Math.round(start.z);
  const queue: [number, number][] = [[sx, sz]];
  seen.add(key(sx, sz));
  while (queue.length) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (Math.hypot(nx, nz) > R || seen.has(key(nx, nz)) || blocked(nx, nz)) continue;
      let ok = true;
      let fy = ground(x, z);
      for (let k = 1; k <= 2 && ok; k++) {
        const px = x + (dx * (k - 1)) / 2;
        const pz = z + (dz * (k - 1)) / 2;
        const step = climbStep(ground, px, pz, fy, dx / 2, dz / 2, maxSlope);
        ok = step.dx === dx / 2 && step.dz === dz / 2 && !slides(x + (dx * k) / 2, z + (dz * k) / 2);
        fy = ground(x + (dx * k) / 2, z + (dz * k) / 2);
      }
      if (!ok) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  return seen;
}

test('winter: from the den an animal can walk up the trail to the peak, and walk the whole map below it', () => {
  const reach = reachableFrom(L.playerSpawn);
  const can = (p: { x: number; z: number }) => reach.has(`${Math.round(p.x)},${Math.round(p.z)}`);
  assert.ok(can(L.arena), 'the peak');
  for (const along of [0.05, 0.25, 0.5, 0.75, 0.95]) assert.ok(can(trailPoint(m, along)), `the trail at ${along}`);
  assert.ok(can({ x: L.returnGate!.x, z: L.returnGate!.z - 8 }), 'the gate back');
  for (const w of frozen) assert.ok(can(w), 'the ice');
  for (const [bx, bz] of L.berryBushes) assert.ok(can({ x: bx, z: bz }), 'a shrub');
  for (const zone of BIOME_SPAWNS.winter!) assert.ok(can(zone), `the ${zone.enemyId} zone`);
});

test('winter: the only way up on foot is the trail: with its first stretch closed, the peak cannot be reached', () => {
  const closed = (x: number, z: number) => {
    const spot = mountainSpot(m, x, z);
    // The trail's first stretch (and the foothill beside it, where the step up to the trail is still low enough to climb).
    return spot !== null && spot.along < 0.16;
  };
  const reach = reachableFrom(L.playerSpawn, closed);
  assert.equal(reach.has(`${Math.round(L.arena.x)},${Math.round(L.arena.z)}`), false, 'the peak was reached without the trail');
  assert.equal(reach.has(`${Math.round(trailPoint(m, 0.5).x)},${Math.round(trailPoint(m, 0.5).z)}`), false, 'the second lap was reached');
});

test('winter: walking along the trail from the foot to the peak, the climbing rule never stops an animal', () => {
  let prev = trailPoint(m, 0);
  for (let i = 1; i <= 2000; i++) {
    const p = trailPoint(m, i / 2000);
    const step = climbStep(feet, prev.x, prev.z, feet(prev.x, prev.z), p.x - prev.x, p.z - prev.z, maxSlope);
    assert.ok(Math.abs(step.dx - (p.x - prev.x)) < 1e-9 && Math.abs(step.dz - (p.z - prev.z)) < 1e-9, `stopped at ${(i / 2000).toFixed(3)}`);
    prev = p;
  }
});
