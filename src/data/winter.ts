import type { BiomeLayout } from '../core/layout.ts';
import type { SpawnZoneDef } from '../core/types.ts';

/**
 * Winter's map (Milestone 3, designed with the user on 2026-11-20 from their own drawing). North is -Z. All positions in metres;
 * every number is a first guess.
 *
 * The user's map: the way in from the Plains at the south edge, where the den stands on a small snowy shore; a frozen lake in the
 * south-west, right beside the den; a band of snow from the north-west to the south-east, widest in the east (the safe way round
 * the ice); and the mountain in the north, climbed by a trail that spirals up it twice, clockwise, from its west foot to the flat
 * peak where the Woolly Mammoth waits. Between the trail's laps the ground is cliff, so the trail is the only way up on foot.
 * Sizes: about a fifth of the map is ice and a third mountain (the user asked for 1.5/4 and 1/2; both do not fit in the same circle
 * with a den and a way round, so they were scaled down together, keeping the user's layout: see the Decisions Log).
 */
export const WINTER_LAYOUT: BiomeLayout = {
  seed: 4242,
  style: 'winter',
  worldRadius: 112,
  // Gentle snowy rolls below the mountain. The mountain's cliffs need the climbing limit and a fine ground mesh.
  terrain: {
    base: 1.5, rollHeight: 2.0, rollScale: 0.014, rollOctaves: 2, bumpHeight: 0.35, bumpScale: 0.07, bumpOctaves: 2,
    segments: 300, maxClimbSlope: 1.6, rockSlope: 1.2,
  },
  den: { x: 14, z: 88, radius: 8, refugeRadius: 12 },
  playerSpawn: { x: 14, z: 79, yaw: Math.PI },
  waterY: 0,
  // The frozen lake: overlapping circles that make one lake (see `carveFrozen`). Nothing fishes through the ice.
  waters: [
    { x: -62, z: 40, radius: 32, depth: 2.5, fish: 0, frozen: true },
    { x: -30, z: 72, radius: 26, depth: 2.5, fish: 0, frozen: true },
    { x: -84, z: 4, radius: 18, depth: 2.5, fish: 0, frozen: true },
    { x: -12, z: 46, radius: 16, depth: 2.5, fish: 0, frozen: true },
    { x: -60, z: 80, radius: 8, depth: 2.2, fish: 0, frozen: true },
    { x: -36, z: 40, radius: 20, depth: 2.5, fish: 0, frozen: true },
    { x: -80, z: -22, radius: 12, depth: 2.3, fish: 0, frozen: true },
    { x: -14, z: 90, radius: 7, depth: 2.2, fish: 0, frozen: true },
    { x: 4, z: 63, radius: 9.5, depth: 2.2, fish: 0, frozen: true },
    { x: -50, z: 6, radius: 7, depth: 2.2, fish: 0, frozen: true },
    // The frozen pool on the peak, for the mammoth's shockwave. Its surface is half a metre under the peak's ground (46.19: the
    // land at the trail's foot, 1.19, plus the mountain's 45; a unit test holds it there).
    { x: 8, z: -36, radius: 9, depth: 2.5, fish: 0, frozen: true, surfaceY: 45.69 },
  ],
  rivers: [],
  mountain: {
    x: 8, z: -36, top: 45, topRadius: 16, footRadius: 60, laps: 2, startDeg: 180, trailWidth: 8, cliffWidth: 3, apronShare: 0.4,
  },
  // The arena is the peak. Its rim of rocks has one gap, on the west, where the trail arrives.
  arena: { x: 8, z: -36, radius: 12, openDeg: [180] },
  // Winter is the last biome: its gate onward leads nowhere.
  gate: { x: 0, z: -105, radius: 6, unused: true },
  returnGate: { x: 0, z: 105, radius: 6 },
  trees: 220,
  rocks: 70,
  grassTufts: 3000,
  // Hardy shrubs on the snow band, for the plant-eaters.
  berryBushes: [
    [40, 60], [56, 20], [30, 40], [64, 50], [26, 74], [78, 0],
  ],
  foxReserves: [],
  plants: 20,
  plantsAtDen: 4,
  nearWaterMargin: 8,
};

/**
 * Winter's wild animals (levels 24 to 28 below, 28 to 34 on the mountain). Hares and foxes on the snow band, a pack of arctic wolves in
 * the east, two polar bears roaming the ice; mountain goats on the shelves beside the trail; three snow leopards, each alone on a
 * ledge beside the trail, waking when an animal comes within 10 m. Rivals: the wolves and the bears (5, the limit).
 */
export const WINTER_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'arctic_hare', count: 4, x: 40, z: 30, radius: 14, levelMin: 24, levelMax: 26 },
  { enemyId: 'arctic_hare', count: 4, x: 62, z: 62, radius: 12, levelMin: 24, levelMax: 26 },
  { enemyId: 'arctic_fox', count: 4, x: 60, z: 10, radius: 16, levelMin: 24, levelMax: 27 },
  { enemyId: 'arctic_wolf', count: 3, x: 78, z: 40, radius: 12, levelMin: 26, levelMax: 28, rivalOf: 'wolf', respawnSeconds: 150 },
  { enemyId: 'polar_bear', count: 1, x: -62, z: 40, radius: 14, levelMin: 26, levelMax: 28, rivalOf: 'bear', respawnSeconds: 150 },
  { enemyId: 'polar_bear', count: 1, x: -30, z: 72, radius: 10, levelMin: 26, levelMax: 28, rivalOf: 'bear', respawnSeconds: 150 },
  // Snowy owls in the pines of the snow band and at the mountain's foot.
  { enemyId: 'snowy_owl', count: 1, x: 55, z: 35, radius: 2, levelMin: 25, levelMax: 26, respawnSeconds: 180 },
  { enemyId: 'snowy_owl', count: 1, x: 70, z: -20, radius: 2, levelMin: 26, levelMax: 27, respawnSeconds: 180 },
  { enemyId: 'snowy_owl', count: 1, x: -40, z: -10, radius: 2, levelMin: 27, levelMax: 28, respawnSeconds: 180 },
  // The mountain: goats on the shelves, and the leopards' ledges beside the trail (on the first lap, and two on the second).
  { enemyId: 'mountain_goat', count: 3, x: 43.6, z: -61.9, radius: 5, levelMin: 28, levelMax: 30 },
  { enemyId: 'mountain_goat', count: 3, x: 6.3, z: -63.1, radius: 5, levelMin: 29, levelMax: 31 },
  { enemyId: 'snow_leopard', count: 1, x: 32.3, z: -6.6, radius: 1.5, levelMin: 30, levelMax: 31, lair: true, wakeNear: 10, respawnSeconds: 240 },
  { enemyId: 'snow_leopard', count: 1, x: -21.3, z: -43.5, radius: 1.5, levelMin: 31, levelMax: 33, lair: true, wakeNear: 10, respawnSeconds: 240 },
  { enemyId: 'snow_leopard', count: 1, x: 29.6, z: -44.5, radius: 1.5, levelMin: 32, levelMax: 34, lair: true, wakeNear: 10, respawnSeconds: 240 },
];
