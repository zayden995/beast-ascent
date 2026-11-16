import type { BiomeLayout } from '../core/layout.ts';
import type { SpawnZoneDef } from '../core/types.ts';

/** Height of the flat top of the Jungle's hill, and of the stream that runs across it. */
const HILL_TOP = 14;
const STREAM_Y = HILL_TOP - 0.4;

/**
 * Jungle map layout (Milestone 3). North is -Z. All positions in metres.
 *
 * A flat-topped hill stands in the west. A spring on its top feeds a stream that runs to the hill's east
 * edge, which is a cliff, and drops over it as a waterfall into a plunge pool. From the pool a river winds
 * east and then south across the middle of the map to a lagoon in the south-east, so the way from the den
 * (south) to the boss arena (north) crosses the river (swim it, or wade the ford where it turns south) or goes
 * over the hill. The gate back to the Forest is at the south edge; the gate onward is north of the arena.
 */
export const JUNGLE_LAYOUT: BiomeLayout = {
  seed: 2718,
  style: 'jungle',
  worldRadius: 112,
  // Bumpier than the Forest: taller rolls and three times the small bumps. The cliff cannot be climbed
  // (ground steeper than `maxClimbSlope` stops an animal), and steep ground is drawn as bare rock.
  terrain: {
    base: 1.8, rollHeight: 5.0, rollScale: 0.022, rollOctaves: 3, bumpHeight: 1.0, bumpScale: 0.085, bumpOctaves: 3,
    segments: 260, maxClimbSlope: 1.6, rockSlope: 1.5,
  },
  den: { x: -16, z: 84, radius: 8, refugeRadius: 12 },
  playerSpawn: { x: -16, z: 75, yaw: Math.PI },
  waterY: 0,
  waters: [
    // The plunge pool at the foot of the waterfall.
    { x: -26.9, z: 2.7, radius: 9, depth: 2.6, fish: 4 },
    // The lagoon the river ends in.
    { x: 60, z: 62, radius: 14, depth: 2.2, fish: 5, lilyPads: 18 },
    // The spring on top of the hill.
    { x: -59, z: -7, radius: 5, depth: 1.3, fish: 2, surfaceY: STREAM_Y },
  ],
  rivers: [
    {
      // The stream across the top of the hill: shallow enough to wade, ending at the lip of the waterfall.
      id: 'stream', current: 1.0, surfaceY: STREAM_Y,
      points: [
        { x: -56, z: -6, width: 3.6, depth: 0.5 },
        { x: -49, z: -3.5, width: 3.6, depth: 0.5 },
        { x: -43, z: -1.5, width: 3.6, depth: 0.5 },
        // A step past the edge of the top, so that the current carries whatever is in it over the fall.
        { x: -35.77, z: 0.35, width: 3.6, depth: 0.5 },
      ],
    },
    {
      // The river from the plunge pool to the lagoon. It is deep enough to swim except at the ford (the fifth point).
      id: 'river', current: 1.2,
      points: [
        { x: -20.6, z: 4.4, width: 7, depth: 1.7 },
        { x: -9, z: 9, width: 7, depth: 1.7 },
        { x: 4, z: 4, width: 7, depth: 1.7 },
        { x: 18, z: 8, width: 8, depth: 1.8 },
        { x: 29, z: 20, width: 11, depth: 0.4 },
        { x: 30, z: 36, width: 7.5, depth: 1.7 },
        { x: 38, z: 49, width: 8, depth: 1.8 },
        { x: 46, z: 54, width: 8, depth: 1.8 },
        { x: 52, z: 57, width: 8, depth: 1.8 },
      ],
    },
  ],
  hill: {
    x: -52, z: -4, top: HILL_TOP, plateauRadius: 16, footRadius: 44, bumpHeight: 0.4,
    // The east side, facing the middle of the map, is a cliff about 22 m wide.
    cliff: { towardDeg: 15, halfDeg: 40, taperDeg: 25, width: 4 },
  },
  waterfall: { river: 'stream', run: 4.6 },
  arena: { x: 0, z: -62, radius: 18 },
  // The snakes' cave, deep in the trees on the right (east) of the boss's arena as an animal comes in from the south. Its
  // mouth faces the arena, 62 m away, and a trail kept clear of trees leads from the arena to it. Four carcasses lie inside as bait.
  cave: { x: 62, z: -62, radius: 6, mouthDeg: 180, bait: 4 },
  gate: { x: 0, z: -105, radius: 6 },
  returnGate: { x: 0, z: 105, radius: 6 },
  trees: 640,
  rocks: 90,
  grassTufts: 9000,
  // Fruit bushes on dry, open ground: two on top of the hill, the rest spread through the Jungle (a unit test checks them).
  berryBushes: [
    [-30, 62], [14, 60], [-48, 26], [10, 30], [48, 30], [-20, -30], [30, -20], [70, -20], [-52, 8], [-60, 4], [-34, -52], [44, -44],
  ],
  foxReserves: [],
  plants: 34,
  plantsAtDen: 4,
  nearWaterMargin: 8,
};

/**
 * The Jungle's wild animals. Levels 8 to 15: a step up from the Forest (1 to 7), for an Adult growing toward
 * Alpha. Rival predators are the Jungle's own: tigers, each alone in its territory, and crocodiles in the water.
 */
export const JUNGLE_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'capybara', count: 4, x: 36, z: 74, radius: 12, levelMin: 8, levelMax: 10 },
  { enemyId: 'capybara', count: 3, x: -2, z: 26, radius: 13, levelMin: 9, levelMax: 11 },
  { enemyId: 'monkey', count: 4, x: -42, z: 52, radius: 13, levelMin: 8, levelMax: 10 },
  { enemyId: 'monkey', count: 3, x: 42, z: -28, radius: 13, levelMin: 10, levelMax: 12 },
  { enemyId: 'snake', count: 3, x: -44, z: 30, radius: 12, levelMin: 8, levelMax: 10 },
  { enemyId: 'snake', count: 3, x: 20, z: -26, radius: 12, levelMin: 9, levelMax: 11 },
  { enemyId: 'tapir', count: 3, x: -16, z: -22, radius: 14, levelMin: 10, levelMax: 12 },
  { enemyId: 'tapir', count: 2, x: 64, z: 6, radius: 12, levelMin: 11, levelMax: 13 },
  // The nest in the cave: calm until the bait is eaten or one of them is hurt, then all of them attack (level 12 to 14: an Adult's fight).
  { enemyId: 'cave_snake', count: 3, x: 63, z: -62, radius: 2.2, levelMin: 12, levelMax: 14, lair: true, respawnSeconds: 180 },
  { enemyId: 'rival_tiger', count: 1, x: -66, z: 60, radius: 10, levelMin: 12, levelMax: 13, rivalOf: 'tiger', respawnSeconds: 150 },
  { enemyId: 'rival_tiger', count: 1, x: 72, z: -28, radius: 8, levelMin: 13, levelMax: 14, rivalOf: 'tiger', respawnSeconds: 150 },
  { enemyId: 'rival_crocodile', count: 1, x: 16, z: 8, radius: 8, levelMin: 13, levelMax: 14, rivalOf: 'crocodile', respawnSeconds: 150 },
  { enemyId: 'rival_crocodile', count: 1, x: 60, z: 62, radius: 10, levelMin: 14, levelMax: 15, rivalOf: 'crocodile', respawnSeconds: 150 },
];
