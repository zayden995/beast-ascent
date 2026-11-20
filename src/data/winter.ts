import type { BiomeLayout } from '../core/layout.ts';
import type { SpawnZoneDef } from '../core/types.ts';

/**
 * Winter's map (Milestone 3, designed with the user on 2026-11-20 from their own drawing; made bigger on 2026-11-21 at their
 * request). North is -Z. All positions in metres; every number is a first guess.
 *
 * The user's map: the way in from the Plains at the south edge, where the den stands on a small snowy shore; a frozen lake in the
 * south-west, right beside the den; a band of snow from the north-west to the south-east, widest in the east (the safe way round
 * the ice); and the mountain in the north, climbed by a trail that spirals up it twice, clockwise, from its west foot to the flat
 * peak where the Woolly Mammoth waits. Between the trail's laps the ground is cliff, so the trail is the only way up on foot.
 * Sizes: the user asked for 1.5/4 ice and 1/2 mountain. Both do not fit in one circle with the den's shore and the snow band
 * round the ice (a round mountain of half the map leaves only a ring round it), so Winter was made bigger (radius 160, the other
 * biomes 112) and both were grown together as far as the layout allows: about 29% ice and 39% mountain (21% and 33% before).
 * See the Decisions Log, "M3, Winter: the user's playtest".
 */
export const WINTER_LAYOUT: BiomeLayout = {
  seed: 4242,
  style: 'winter',
  worldRadius: 160,
  // Gentle snowy rolls below the mountain. The mountain's cliffs need the climbing limit and a fine ground mesh.
  terrain: {
    base: 1.5, rollHeight: 2.0, rollScale: 0.014, rollOctaves: 2, bumpHeight: 0.35, bumpScale: 0.07, bumpOctaves: 2,
    segments: 360, maxClimbSlope: 1.6, rockSlope: 1.2,
  },
  den: { x: 48, z: 134, radius: 8, refugeRadius: 12 },
  playerSpawn: { x: 48, z: 125, yaw: Math.PI },
  waterY: 0,
  // The frozen lake: overlapping circles that make one lake (see `carveFrozen`), from beside the den round the west of the map
  // to the north-west, kept 12 m from the mountain (the snow band). Nothing fishes through the ice.
  waters: [
    { x: -1, z: 125, radius: 32, depth: 2.5, fish: 0, frozen: true },
    { x: -61, z: 104, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -97, z: 47, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -121, z: -1, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -118, z: -52, radius: 28, depth: 2.5, fish: 0, frozen: true },
    { x: -4, z: 104, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -103, z: -91, radius: 20, depth: 2.4, fish: 0, frozen: true },
    { x: -103, z: 65, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -58, z: 83, radius: 36, depth: 2.5, fish: 0, frozen: true },
    { x: -88, z: -109, radius: 16, depth: 2.3, fish: 0, frozen: true },
    { x: -121, z: 35, radius: 32, depth: 2.5, fish: 0, frozen: true },
    { x: -31, z: 122, radius: 32, depth: 2.5, fish: 0, frozen: true },
    { x: -73, z: -124, radius: 13, depth: 2.2, fish: 0, frozen: true },
    { x: -91, z: 98, radius: 24, depth: 2.5, fish: 0, frozen: true },
    // The frozen pool on the peak, for the mammoth's shockwave. Its surface is half a metre under the peak's ground (the land at the
    // trail's foot plus the mountain's 45; a unit test holds it there).
    { x: 22, z: -42, radius: 9, depth: 2.5, fish: 0, frozen: true, surfaceY: 45.61 },
  ],
  rivers: [],
  mountain: {
    x: 22, z: -42, top: 45, topRadius: 16, footRadius: 96, laps: 2, startDeg: 180, trailWidth: 8, cliffWidth: 3, apronShare: 0.4,
  },
  // The arena is the peak. Its rim of rocks has one gap, on the west, where the trail arrives.
  arena: { x: 22, z: -42, radius: 12, openDeg: [180] },
  // Winter is the last biome: its gate onward leads nowhere.
  gate: { x: 22, z: -150, radius: 6, unused: true },
  returnGate: { x: 34, z: 150, radius: 6 },
  trees: 380,
  rocks: 120,
  grassTufts: 5500,
  // Hardy shrubs on the snow band, for the plant-eaters.
  berryBushes: [
    [122, -6], [97, 33], [58, 58], [13, 64], [-31, 50], [-65, 19],
  ],
  foxReserves: [],
  plants: 36,
  plantsAtDen: 4,
  nearWaterMargin: 8,
};

/**
 * Winter's wild animals (levels 24 to 28 below, 28 to 34 on the mountain). Hares and foxes on the snow in the east, a pack of
 * arctic wolves in the south-east, two polar bears roaming the ice; mountain goats on the shelves beside the trail; three snow
 * leopards, each alone on a ledge beside the trail, waking when an animal comes within 10 m. Rivals: the wolves and the bears (5,
 * the limit).
 */
export const WINTER_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'arctic_hare', count: 4, x: 110, z: 40, radius: 14, levelMin: 24, levelMax: 26 },
  { enemyId: 'arctic_hare', count: 4, x: 95, z: 95, radius: 12, levelMin: 24, levelMax: 26 },
  { enemyId: 'arctic_fox', count: 4, x: 132, z: 10, radius: 16, levelMin: 24, levelMax: 27 },
  { enemyId: 'arctic_wolf', count: 3, x: 122, z: 72, radius: 12, levelMin: 26, levelMax: 28, rivalOf: 'wolf', respawnSeconds: 150 },
  { enemyId: 'polar_bear', count: 1, x: -61, z: 104, radius: 14, levelMin: 26, levelMax: 28, rivalOf: 'bear', respawnSeconds: 150 },
  { enemyId: 'polar_bear', count: 1, x: -121, z: -1, radius: 12, levelMin: 26, levelMax: 28, rivalOf: 'bear', respawnSeconds: 150 },
  // Snowy owls in the pines of the snow and at the mountain's foot.
  { enemyId: 'snowy_owl', count: 1, x: 100, z: 60, radius: 2, levelMin: 25, levelMax: 26, respawnSeconds: 180 },
  { enemyId: 'snowy_owl', count: 1, x: 118, z: -40, radius: 2, levelMin: 26, levelMax: 27, respawnSeconds: 180 },
  { enemyId: 'snowy_owl', count: 1, x: -80, z: -20, radius: 2, levelMin: 27, levelMax: 28, respawnSeconds: 180 },
  // The mountain: goats on the shelves, and the leopards' ledges beside the trail (on the first lap, and two on the second), at the
  // same places along the trail as on the first, smaller mountain.
  { enemyId: 'mountain_goat', count: 3, x: 81.4, z: -84.0, radius: 5, levelMin: 28, levelMax: 30 },
  { enemyId: 'mountain_goat', count: 3, x: 20.5, z: -82.7, radius: 5, levelMin: 29, levelMax: 31 },
  { enemyId: 'snow_leopard', count: 1, x: 61.0, z: 7.0, radius: 1.5, levelMin: 30, levelMax: 31, lair: true, wakeNear: 10, respawnSeconds: 240 },
  { enemyId: 'snow_leopard', count: 1, x: -23.7, z: -55.0, radius: 1.5, levelMin: 31, levelMax: 33, lair: true, wakeNear: 10, respawnSeconds: 240 },
  { enemyId: 'snow_leopard', count: 1, x: 53.3, z: -53.0, radius: 1.5, levelMin: 32, levelMax: 34, lair: true, wakeNear: 10, respawnSeconds: 240 },
];
