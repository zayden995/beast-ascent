import type { BiomeLayout } from '../core/layout.ts';
import type { SpawnZoneDef } from '../core/types.ts';

/**
 * Plains map layout (Milestone 3, designed with the user on 2026-11-18). North is -Z. All positions in metres; every number is a
 * first guess.
 *
 * Wide, open golden grass with long gentle rolls, no cliffs and few trees. Two lakes: one in the north-west, one in the south-east.
 * Two dens, each a cave with a nest of guards that wake when an animal comes near: the hyena's in the west, and the lion's, harder,
 * on top of a low rise in the east. The gate back to the Jungle is at the south edge, the gate onward (to Winter, not built yet)
 * north of the boss's arena.
 */
export const PLAINS_LAYOUT: BiomeLayout = {
  seed: 3141,
  style: 'plains',
  worldRadius: 112,
  // Long, gentle rolls and hardly any bumps: no slope can stop an animal, so there is no `maxClimbSlope`.
  terrain: { base: 1.5, rollHeight: 2.4, rollScale: 0.012, rollOctaves: 2, bumpHeight: 0.3, bumpScale: 0.06, bumpOctaves: 2, segments: 220 },
  den: { x: 16, z: 84, radius: 8, refugeRadius: 12 },
  playerSpawn: { x: 16, z: 75, yaw: Math.PI },
  waterY: 0,
  waters: [
    // The north-west lake (two alligators).
    { x: -58, z: -36, radius: 15, depth: 2.2, fish: 4 },
    // The south-east lake (one alligator).
    { x: 52, z: 44, radius: 14, depth: 2.2, fish: 4 },
  ],
  rivers: [],
  // The lion's rise: a low, flat-topped hill that an animal can walk up from every side. The lion's den stands on top of it.
  hill: { x: 66, z: -18, top: 5.5, plateauRadius: 13, footRadius: 32, bumpHeight: 0.3 },
  arena: { x: 0, z: -62, radius: 18 },
  caves: [
    // The hyena's den, in the west (dark earth), its mouth toward the middle of the map. No trail: it stands in the open.
    { x: -68, z: 14, radius: 6, mouthDeg: 0, bait: 3, rockColor: 0x6e5a40 },
    // The lion's den on top of the rise in the east (pale stone), its mouth toward the middle of the map.
    { x: 66, z: -18, radius: 6, mouthDeg: 180, bait: 4, rockColor: 0xcdbb92 },
  ],
  gate: { x: 0, z: -105, radius: 6 },
  returnGate: { x: 0, z: 105, radius: 6 },
  trees: 90,
  rocks: 60,
  grassTufts: 14000,
  berryBushes: [
    [-20, 66], [44, 70], [-30, 30], [10, 10], [-14, -20], [22, -34], [44, -62], [34, 12],
  ],
  foxReserves: [],
  plants: 32,
  plantsAtDen: 4,
  nearWaterMargin: 8,
};

/**
 * The Plains' wild animals. Levels 16 to 23: a step up from the Jungle (8 to 15), for Alphas. Antelope herds (hard to catch), buffalo
 * (charge), roaming hyena packs; rivals are two Elephants and a lion, each alone in its territory; three alligators live in the
 * lakes; and each den holds four guards that wake together when an animal comes within 14 m (`wakeNear`).
 */
export const PLAINS_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'antelope', count: 5, x: -26, z: -6, radius: 16, levelMin: 16, levelMax: 18 },
  { enemyId: 'antelope', count: 5, x: 26, z: 26, radius: 14, levelMin: 16, levelMax: 18 },
  { enemyId: 'antelope', count: 4, x: -34, z: 50, radius: 14, levelMin: 16, levelMax: 17 },
  { enemyId: 'buffalo', count: 3, x: -8, z: 30, radius: 12, levelMin: 17, levelMax: 19 },
  { enemyId: 'buffalo', count: 3, x: 38, z: -48, radius: 12, levelMin: 18, levelMax: 20 },
  { enemyId: 'hyena', count: 3, x: 30, z: 0, radius: 12, levelMin: 17, levelMax: 19 },
  { enemyId: 'hyena', count: 3, x: -40, z: -16, radius: 12, levelMin: 17, levelMax: 19 },
  // The two dens: calm until an animal comes within 14 m, then all four attack. The lion's den is the harder one.
  { enemyId: 'hyena', count: 4, x: -68, z: 14, radius: 3, levelMin: 18, levelMax: 19, lair: true, wakeNear: 14, respawnSeconds: 240 },
  { enemyId: 'den_lion', count: 4, x: 66, z: -18, radius: 3, levelMin: 21, levelMax: 23, lair: true, wakeNear: 14, respawnSeconds: 240 },
  { enemyId: 'rival_elephant', count: 1, x: -38, z: 56, radius: 10, levelMin: 20, levelMax: 21, rivalOf: 'elephant', respawnSeconds: 150 },
  { enemyId: 'rival_elephant', count: 1, x: 6, z: 34, radius: 10, levelMin: 21, levelMax: 22, rivalOf: 'elephant', respawnSeconds: 150 },
  { enemyId: 'rival_lion', count: 1, x: -12, z: -30, radius: 10, levelMin: 19, levelMax: 20, rivalOf: 'lion', respawnSeconds: 150 },
  { enemyId: 'alligator', count: 2, x: -58, z: -36, radius: 7, levelMin: 20, levelMax: 22, respawnSeconds: 150 },
  { enemyId: 'alligator', count: 1, x: 52, z: 44, radius: 7, levelMin: 20, levelMax: 22, respawnSeconds: 150 },
];
