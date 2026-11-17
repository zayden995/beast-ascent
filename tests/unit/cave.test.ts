import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAnimalModel, createAnimState } from '../../src/animals/AnimalModel.ts';
import { ColliderGrid } from '../../src/world/colliders.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { JUNGLE_LAYOUT, JUNGLE_SPAWNS } from '../../src/data/jungle.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { STAGES } from '../../src/data/stages.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { TRAIL_HALF_WIDTH, WALL_OFFSET, caveBaitSpots, caveKeepsClear, caveRoof, caveSpot, caveTrail, caveWalls, distanceToTrail, inAnyCave, inCave, mouthHalfDeg } from '../../src/logic/cave.ts';
import type { CaveDef } from '../../src/core/layout.ts';
import { isGuardZone } from '../../src/logic/foxReserve.ts';
import { buildRivers, createHeight, slopeAt } from '../../src/logic/heightfield.ts';
import { groundSprintSpeed } from '../../src/logic/stats.ts';
import { surfaceAt } from '../../src/logic/water.ts';

const L = JUNGLE_LAYOUT;
const cave = L.caves![0];
const rivers = buildRivers(L);
const h = createHeight(L, rivers);
const water = { waters: L.waters, rivers, waterY: L.waterY };

/** The cave's walls as the game builds them: circle colliders in a grid. */
function wallGrid(): ColliderGrid {
  const grid = new ColliderGrid();
  for (const w of caveWalls(cave, L.seed + 809)) grid.add(w.x, w.z, w.r, 6.5);
  return grid;
}

// ---------- A layout holds a list of caves (the Plains have two) ----------

test('caves: the Jungle has exactly one cave, and it has its trail', () => {
  assert.equal(L.caves!.length, 1);
  assert.equal(cave.trail, true);
});

test('caves: ground near every cave is kept clear, a trail is kept clear only for a cave that has one, and a cave is found in any of them', () => {
  const arena = { x: 0, z: -60, radius: 18 };
  const withTrail: CaveDef = { x: 60, z: -60, radius: 6, mouthDeg: 180, bait: 2, trail: true };
  const noTrail: CaveDef = { x: -60, z: 20, radius: 6, mouthDeg: 0, bait: 2 };
  const caves = [withTrail, noTrail];
  // Bare ground all round each cave.
  assert.equal(caveKeepsClear(caves, arena, 60, -60, 0), true, 'inside the first cave');
  assert.equal(caveKeepsClear(caves, arena, -60 - 8, 20, 0), true, 'a few metres outside the second cave');
  assert.equal(caveKeepsClear(caves, arena, -60 - 30, 20, 0), false, 'far from both');
  // The first cave's trail runs west from its mouth to the arena: ground on it is kept clear; the second cave has none.
  const trail = caveTrail(withTrail, arena);
  assert.equal(caveKeepsClear(caves, arena, (trail.x0 + trail.x1) / 2, (trail.z0 + trail.z1) / 2, 0), true, 'on the first cave\'s trail');
  const toArena = caveTrail({ ...noTrail, trail: true }, arena);
  const mid = { x: (toArena.x0 + toArena.x1) / 2, z: (toArena.z0 + toArena.z1) / 2 };
  assert.equal(caveKeepsClear(caves, arena, mid.x, mid.z, 0), false, 'no trail leads to a cave that has none');
  // Several caves, none, or the Forest's missing list.
  assert.equal(inAnyCave(caves, -60, 20), true);
  assert.equal(inAnyCave(caves, 60, -60), true);
  assert.equal(inAnyCave(caves, 0, 0), false);
  assert.equal(inAnyCave([], 60, -60), false);
  assert.equal(inAnyCave(undefined, 60, -60), false);
  assert.equal(caveKeepsClear(undefined, arena, 60, -60, 0), false);
});

// ---------- The cave's shape ----------

test('cave: the mouth is wide enough for the biggest animal, and the walls leave no other way in or out', () => {
  assert.ok(mouthHalfDeg(cave) > 25 && mouthHalfDeg(cave) < 45, `half the mouth is ${mouthHalfDeg(cave).toFixed(1)} degrees`);
  const grid = wallGrid();
  // An Alpha Elephant is the widest animal that can come in: about 1.4 m across each way from its middle.
  for (let d = 0; d <= cave.radius + 8; d += 0.25) {
    const p = caveSpot(cave, cave.mouthDeg, d);
    assert.equal(grid.blocked(p.x, p.z, 1.4), false, `the way in is blocked ${d.toFixed(1)} m from the middle`);
  }
  // Everywhere else round the wall is sealed.
  const half = mouthHalfDeg(cave);
  for (let deg = 0; deg < 360; deg += 2) {
    const off = Math.abs(((deg - cave.mouthDeg + 540) % 360) - 180);
    // The sealed part is everything outside the mouth and its two jamb stones.
    if (off < 180 - (half + 9 - 8)) continue;
    const p = caveSpot(cave, deg, cave.radius + WALL_OFFSET);
    assert.equal(grid.blocked(p.x, p.z, 0.2), true, `a gap in the wall at ${deg} degrees`);
  }
});

test('cave: there is room inside for the bait and the nest, reachable from the mouth', () => {
  const grid = wallGrid();
  const inside = [...caveBaitSpots(cave), ...[JUNGLE_SPAWNS.find((z) => z.lair)!].map((z) => ({ x: z.x, z: z.z }))];
  for (const p of inside) {
    assert.equal(grid.blocked(p.x, p.z, 0.8), false, `${p.x.toFixed(1)}, ${p.z.toFixed(1)} is inside a wall`);
    assert.ok(Math.hypot(p.x - cave.x, p.z - cave.z) < cave.radius - 1, 'well inside the floor');
    // Walk in a straight line from the mouth: nothing in the way for an animal about a metre wide.
    const mouth = caveSpot(cave, cave.mouthDeg, cave.radius + 3);
    for (let k = 0; k <= 1; k += 0.05) {
      assert.equal(grid.blocked(mouth.x + (p.x - mouth.x) * k, mouth.z + (p.z - mouth.z) * k, 0.8), false, 'the straight way in from the mouth is open');
    }
  }
  const baits = caveBaitSpots(cave);
  assert.equal(baits.length, cave.bait);
  assert.ok(baits.length >= 3);
  baits.forEach((a, i) => baits.slice(i + 1).forEach((b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.8, 'carcasses lie apart')));
  // They lie at the back, opposite the mouth.
  for (const p of baits) assert.ok((p.x - cave.x) * Math.cos((cave.mouthDeg * Math.PI) / 180) + (p.z - cave.z) * Math.sin((cave.mouthDeg * Math.PI) / 180) < 0);
});

test('cave: a rock roof covers the whole floor, high enough for an animal to stand under, and blocks nothing', () => {
  const roof = caveRoof(cave, L.seed + 810);
  assert.ok(roof.length >= 6);
  for (const s of roof) {
    assert.equal(s.r, 0, 'the roof is overhead');
    assert.ok(s.y - s.sy > 2.0, `a roof stone hangs too low (${(s.y - s.sy).toFixed(1)} m)`);
  }
  // Every point of the floor has a roof stone overhead (a rough check: the stone's width covers it).
  for (let a = 0; a < 360; a += 30) {
    for (const d of [0, 2, 4]) {
      const p = caveSpot(cave, a, d);
      assert.ok(roof.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < Math.max(s.sx, s.sz) * 0.95), `no roof over ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    }
  }
});

// ---------- Where it is ----------

test('jungle: the cave is on the right of the boss arena as an animal comes in from the south, with its mouth toward the arena', () => {
  const { arena } = L;
  // North is -z, so east (+x) is on the right of an animal walking north into the arena.
  assert.ok(cave.x > arena.x + arena.radius + 10, 'east of the arena, outside its ring of standing stones');
  assert.ok(Math.abs(cave.z - arena.z) < 12, 'level with the arena, not off to a corner');
  const toArena = (Math.atan2(arena.z - cave.z, arena.x - cave.x) * 180) / Math.PI;
  const off = Math.abs(((toArena - cave.mouthDeg + 540) % 360) - 180);
  assert.ok(off < 20, `the mouth faces the arena (${off.toFixed(0)} degrees off)`);
  assert.ok(Math.hypot(cave.x, cave.z) + cave.radius + 14 < L.worldRadius, 'well inside the world');
  // The boss is kept in its arena, so it can never wander into the cave.
  assert.ok(BOSSES.silverback.enemy.behavior.leashRadius < cave.x - cave.radius - WALL_OFFSET - arena.x);
});

test('jungle: the cave stands clear of the gates, the den, the water, the fruit bushes and every other animal zone', () => {
  const { gate, returnGate, den, playerSpawn } = L;
  const clear = (p: { x: number; z: number }, d: number, what: string) => assert.ok(Math.hypot(p.x - cave.x, p.z - cave.z) > d, what);
  clear(gate, cave.radius + 20, 'the gate onward');
  clear(returnGate!, cave.radius + 20, 'the gate back');
  clear(den, cave.radius + 40, 'the den');
  clear(playerSpawn, cave.radius + 40, 'the spawn point');
  for (const w of L.waters) assert.ok(Math.hypot(w.x - cave.x, w.z - cave.z) > w.radius + cave.radius + 10, 'a pond');
  for (const r of rivers) for (const p of r.points) assert.ok(Math.hypot(p.x - cave.x, p.z - cave.z) > p.width / 2 + cave.radius + 10, `the ${r.id}`);
  for (const [bx, bz] of L.berryBushes) clear({ x: bx, z: bz }, cave.radius + 8, 'a fruit bush');
  for (const zone of JUNGLE_SPAWNS.filter((z) => !z.lair)) assert.ok(Math.hypot(zone.x - cave.x, zone.z - cave.z) > zone.radius + cave.radius + WALL_OFFSET + 3, `the ${zone.enemyId} zone`);
  // And nothing on the map is built where the cave is.
  assert.equal(inCave(cave, cave.x, cave.z), true);
  assert.equal(inCave(cave, L.arena.x, L.arena.z), false);
});

test('jungle: a trail kept clear of trees leads from the arena to the mouth of the cave, over ground that can be walked', () => {
  const trail = caveTrail(cave, L.arena);
  // It starts just outside the mouth, and ends just outside the arena's ring of standing stones.
  const mouth = caveSpot(cave, cave.mouthDeg, cave.radius + WALL_OFFSET + 2.5);
  assert.ok(Math.hypot(trail.x0 - mouth.x, trail.z0 - mouth.z) < 1e-6);
  assert.ok(Math.abs(Math.hypot(trail.x1 - L.arena.x, trail.z1 - L.arena.z) - (L.arena.radius + 5)) < 1e-6);
  const length = Math.hypot(trail.x1 - trail.x0, trail.z1 - trail.z0);
  assert.ok(length > 20 && length < 60, `a trail of ${length.toFixed(0)} m`);
  assert.equal(distanceToTrail(trail, (trail.x0 + trail.x1) / 2, (trail.z0 + trail.z1) / 2), 0);
  assert.ok(Math.abs(distanceToTrail(trail, trail.x0, trail.z0 + 3) - 3) < 1e-9, 'distance across the trail');
  assert.ok(Math.abs(distanceToTrail(trail, trail.x0 + 5, trail.z0) - 5) < 1e-9, 'past its end');
  assert.ok(TRAIL_HALF_WIDTH >= 2, 'wide enough for the widest animal to pass between the trees');
  const grid = wallGrid();
  const climb = L.terrain.maxClimbSlope!;
  for (let k = 0; k <= 1.0001; k += 0.02) {
    const x = trail.x0 + (trail.x1 - trail.x0) * k;
    const z = trail.z0 + (trail.z1 - trail.z0) * k;
    assert.equal(surfaceAt(water, x, z), null, `the trail runs through water at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    assert.ok(slopeAt(h, x, z) < climb * 0.4, `the trail is steep at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    assert.equal(grid.blocked(x, z, 1.4), false, 'a wall of the cave stands on the trail');
    assert.equal(Math.hypot(x, z) < L.worldRadius - 8, true, 'inside the world');
  }
});

test('jungle: the cave floor is dry and flat, and the ground round it can be walked', () => {
  const floor = h(cave.x, cave.z);
  assert.equal(surfaceAt(water, cave.x, cave.z), null);
  for (let a = 0; a < 360; a += 30) {
    for (const d of [0, 3, 6, 9]) {
      const p = caveSpot(cave, a, d);
      assert.ok(Math.abs(h(p.x, p.z) - floor) < 1e-6, `the floor is flat at ${d} m (${(h(p.x, p.z) - floor).toFixed(3)} m off)`);
    }
  }
  for (let a = 0; a < 360; a += 30) {
    const p = caveSpot(cave, a, 13);
    assert.ok(slopeAt(h, p.x, p.z) < TUNING.player.gravity, 'ground round the cave is ordinary');
  }
});

// ---------- The snakes ----------

test('snakes: they are drawn by the snake rig, are slow to chase, and every animal can outrun them', () => {
  for (const id of ['snake', 'cave_snake']) {
    const def = ENEMIES[id];
    assert.equal(def.rig, 'serpent', `${id} is drawn by the serpent rig`);
    assert.ok(def.behavior.aggressive && !def.behavior.fleeOnSight);
    assert.ok(def.attacks.some((a) => a.kind === 'melee') && def.attacks.some((a) => a.kind === 'charge'), `${id} bites and strikes`);
    // On foot, the slowest sprint of any playable animal (the Eagle's, 6.0) must beat theirs.
    const slowest = Math.min(...SPECIES.filter((s) => isPlayable(s, TUNING.currentMilestone)).map((s) => groundSprintSpeed(s)));
    assert.ok(def.baseStats.sprintSpeed < slowest, `${id} (${def.baseStats.sprintSpeed} m/s) must be outrun by every animal on foot (${slowest} m/s)`);
  }
  assert.ok(ENEMIES.cave_snake.baseStats.size > ENEMIES.snake.baseStats.size, 'the nest\'s snakes are bigger');
  assert.ok(ENEMIES.cave_snake.baseStats.damage > ENEMIES.snake.baseStats.damage && ENEMIES.cave_snake.xp > ENEMIES.snake.xp);
});

test('snakes: some lie about the Jungle, and a nest of them guards the cave at an Adult\'s level', () => {
  const loose = JUNGLE_SPAWNS.filter((z) => z.enemyId === 'snake');
  assert.ok(loose.length >= 2 && loose.reduce((n, z) => n + z.count, 0) >= 4);
  const nest = JUNGLE_SPAWNS.filter((z) => z.lair);
  assert.equal(nest.length, 1);
  const zone = nest[0];
  assert.equal(zone.enemyId, 'cave_snake');
  assert.ok(zone.count >= 2 && zone.count <= 4);
  const adult = STAGES.adult.levelRequired;
  const alpha = STAGES.alpha.levelRequired;
  assert.ok(zone.levelMin >= adult && zone.levelMax < alpha, `levels ${zone.levelMin} to ${zone.levelMax} are an Adult's (${adult} to ${alpha - 1})`);
  assert.ok(Math.hypot(zone.x - cave.x, zone.z - cave.z) + zone.radius < cave.radius - 1.5, 'the whole nest starts inside the cave');
  assert.ok((zone.respawnSeconds ?? 0) >= 120, 'they do not come back at once');
  assert.equal(isGuardZone(zone), true, 'they stay calm until the bait is eaten or one is hurt');
  assert.equal(isGuardZone({ guardOf: 0 }), true, 'a fox reserve\'s guards are guards too');
  assert.equal(isGuardZone({}), false);
  assert.equal(isGuardZone(null), false);
  assert.equal(isGuardZone(undefined), false);
});

test('snakes: a Bear, an Elephant or any other animal meets the nest: it is nobody\'s rival and is never left out', () => {
  assert.equal(JUNGLE_SPAWNS.find((z) => z.lair)!.rivalOf, undefined);
  assert.equal(JUNGLE_SPAWNS.filter((z) => z.enemyId === 'snake').some((z) => z.rivalOf !== undefined), false);
});

// ---------- The gorilla ----------

test('silverback: it is built as a gorilla, with a knuckle-walker\'s body and a gorilla\'s face', () => {
  const boss = BOSSES.silverback.enemy;
  for (const feature of ['knuckle', 'brow', 'saddle'] as const) assert.ok(boss.features.includes(feature), `has ${feature}`);
  assert.equal(boss.body.ears, 'round');
  assert.ok(boss.body.snoutLength <= 0.08, 'a flat face, not a bear\'s snout');
  assert.ok(boss.body.tailLength <= 0.03, 'no tail');
  assert.ok(boss.colors.saddle !== undefined && boss.colors.saddle !== boss.colors.body, 'a silver back');
});

// ---------- Every animal can be built and moved ----------

test('rigs: every wild animal and boss can be built, animated through every state and taken apart', () => {
  const states: Partial<ReturnType<typeof createAnimState>>[] = [
    {},
    { speed: 2, sprinting: false },
    { speed: 6, sprinting: true },
    { windupT: 0.5, warn: 0.5 },
    { attackT: 0.5, attackPower: 1 },
    { stunned: true, hitFlash: 1 },
    { swimming: true, speed: 1.5 },
    { drinking: true },
    { deathT: 0.3 },
    { deathT: 0.9 },
  ];
  const defs = [...Object.values(ENEMIES), ...Object.values(BOSSES).map((b) => b.enemy)];
  for (const def of defs) {
    const model = createAnimalModel({ body: def.body, colors: def.colors, features: def.features, size: def.baseStats.size, headScale: 1, rig: def.rig });
    assert.ok(model.height > 0 && Number.isFinite(model.height) && model.radius > 0 && Number.isFinite(model.radius), `${def.id} has a size`);
    for (const state of states) {
      model.update(1 / 30, { ...createAnimState(), ...state });
    }
    model.root.updateMatrixWorld(true);
    model.root.traverse((o) => {
      assert.ok([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z].every(Number.isFinite), `${def.id}: a part is at a place that is not a number`);
    });
    model.dispose();
  }
});

test('rigs: a snake lies along the ground, keeps its length, and rolls over when it dies', () => {
  const def = ENEMIES.snake;
  const model = createAnimalModel({ body: def.body, colors: def.colors, features: def.features, size: 1, headScale: 1, rig: def.rig });
  const box = () => new THREE.Box3().setFromObject(model.root);
  for (let i = 0; i < 20; i++) model.update(1 / 30, { ...createAnimState(), speed: 2 });
  const live = box();
  const length = live.max.z - live.min.z;
  assert.ok(length > def.body.bodyLength * 0.75 && length < def.body.bodyLength * 1.25, `its length is about ${def.body.bodyLength} m (${length.toFixed(2)})`);
  assert.ok(live.min.y > -0.02 && live.min.y < 0.03, `it lies on the ground (lowest point ${live.min.y.toFixed(3)})`);
  assert.ok(live.max.y - live.min.y < 0.6, 'low to the ground');
  // The wave moves: the pieces of the body are not in the same places a moment later.
  const shape = (): number[] => model.root.children[0].children.map((c) => c.position.x);
  const before = shape();
  for (let i = 0; i < 9; i++) model.update(1 / 30, { ...createAnimState(), speed: 2 });
  assert.ok(shape().some((x, i) => Math.abs(x - before[i]) > 0.02), 'the body ripples as the snake moves');
  // Dead: belly up, still on the ground.
  for (let i = 0; i < 30; i++) model.update(1 / 30, { ...createAnimState(), deathT: 0.45 });
  const dead = box();
  assert.ok(dead.min.y > -0.05, `a dead snake is not under the ground (${dead.min.y.toFixed(3)})`);
  model.dispose();
});
