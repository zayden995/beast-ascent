import type { BiomeDef, BiomeId, SpawnZoneDef, TitleAnimalDef, TitleViewDef, WaterBody } from '../core/types.ts';

/** Order in which biomes unlock (bible section 4.5, tunable). */
export const BIOME_ORDER: BiomeId[] = ['forest', 'jungle', 'plains', 'winter'];

export const BIOMES: Record<BiomeId, BiomeDef> = {
  forest: {
    id: 'forest', name: 'Forest', order: 0, implemented: true, bossId: 'ancient_stag',
    palette: {
      ground: 0x6fa246, groundAlt: 0x8bb552, dirt: 0x8a6b45, rock: 0x8d8f8a,
      foliage: 0x3f8f3c, foliageAlt: 0x5aa33e, trunk: 0x6b4a2e, water: 0x4fb3c8,
      skyTop: 0x4d9be0, skyHorizon: 0xcfe9ef, fog: 0xbfe0d8, sun: 0xfff1cf,
    },
    fogNear: 45, fogFar: 190,
  },
  // TODO(M3): these three biomes are palette stubs only. No terrain, enemies or bosses yet.
  jungle: {
    id: 'jungle', name: 'Jungle', order: 1, implemented: false, bossId: null,
    palette: {
      ground: 0x3f7f3a, groundAlt: 0x2f6b35, dirt: 0x5b4a33, rock: 0x6f7468,
      foliage: 0x1f6b33, foliageAlt: 0x2f8040, trunk: 0x4f3b28, water: 0x3d8f7f,
      skyTop: 0x5fa8c8, skyHorizon: 0xcfe6d2, fog: 0xa9d2b8, sun: 0xfff3d6,
    },
    fogNear: 25, fogFar: 120,
  },
  plains: {
    id: 'plains', name: 'Plains', order: 2, implemented: false, bossId: null,
    palette: {
      ground: 0xd6b45a, groundAlt: 0xe2c66c, dirt: 0xb08a52, rock: 0xa39a86,
      foliage: 0x8fa043, foliageAlt: 0xa3ad4f, trunk: 0x6f5435, water: 0x5fb0c8,
      skyTop: 0x4f9fe6, skyHorizon: 0xf7e6c2, fog: 0xf0e2bf, sun: 0xffe9b8,
    },
    fogNear: 70, fogFar: 260,
  },
  winter: {
    id: 'winter', name: 'Winter', order: 3, implemented: false, bossId: null,
    palette: {
      ground: 0xeef4f8, groundAlt: 0xdde9f2, dirt: 0xa9b4bd, rock: 0x8c98a3,
      foliage: 0x3f6f5f, foliageAlt: 0x4f8070, trunk: 0x5b4636, water: 0x9fd0e6,
      skyTop: 0x7fb2dc, skyHorizon: 0xeaf4fa, fog: 0xdcebf5, sun: 0xffffff,
    },
    fogNear: 35, fogFar: 160,
  },
};

export function nextBiome(id: BiomeId): BiomeId | null {
  const i = BIOME_ORDER.indexOf(id);
  return i >= 0 && i < BIOME_ORDER.length - 1 ? BIOME_ORDER[i + 1] : null;
}

/** Forest map layout. North is -Z. All positions in metres. */
export const FOREST_LAYOUT = {
  seed: 1337,
  worldRadius: 108,
  // Wild animals never enter `refugeRadius`, and ignore a player who is inside it. It was 18 m
  // until the user found it too big (2026-11-14, Milestone 2). The player spawns 9 m from the den.
  den: { x: 0, z: 52, radius: 8, refugeRadius: 12 },
  playerSpawn: { x: 0, z: 43, yaw: Math.PI },
  /** Height of the water surface, the same for every pond. */
  waterY: 0,
  /**
   * The ponds. The first is the original pond (kept where it was). The other three were added in the M2
   * review: each sits in a natural low spot (chosen from the terrain), clear of the den, the spawn point,
   * the arena, the gate, the berry bushes and each other (a unit test checks all of that).
   */
  waters: [
    { x: 46, z: 12, radius: 15, depth: 2.4, fish: 4 },
    { x: -56, z: 16, radius: 11, depth: 2.0, fish: 3 },
    { x: -26, z: -26, radius: 9, depth: 1.8, fish: 2 },
    { x: 56, z: -74, radius: 7, depth: 1.6, fish: 2 },
  ] as WaterBody[],
  arena: { x: 0, z: -58, radius: 18 },
  gate: { x: 0, z: -101, radius: 6 },
  trees: 430,
  rocks: 80,
  grassTufts: 15000,
  berryBushes: [
    [-14, 30], [18, 34], [-32, 14], [22, -6], [-52, -18], [-10, -24], [62, -22], [30, 44],
  ] as [number, number][],
  /**
   * Two fox food reserves (fruit and vegetables, guarded by foxes that stay calm until it is raided). On open
   * ground found by scanning the Forest, clear of water, the den, the arena and the gate (a unit test checks).
   */
  foxReserves: [{ x: -24, z: 8 }, { x: 48, z: -32 }],
  /** Leafy plants for herbivores to eat (4 of them inside the den refuge). */
  plants: 30,
  plantsAtDen: 4,
  /** Distance from the shore of any pond that still counts as "near water". */
  nearWaterMargin: 8,
};

export const FOREST_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'deer', count: 4, x: -42, z: 12, radius: 22, levelMin: 1, levelMax: 3 },
  { enemyId: 'deer', count: 3, x: 44, z: -40, radius: 20, levelMin: 2, levelMax: 4 },
  { enemyId: 'fox', count: 3, x: 14, z: 14, radius: 26, levelMin: 1, levelMax: 2 },
  { enemyId: 'fox', count: 2, x: -60, z: -30, radius: 20, levelMin: 2, levelMax: 4 },
  // The guards of the two fox food reserves: calm until the reserve is raided, then they all attack.
  { enemyId: 'fox', count: 3, x: -24, z: 8, radius: 6, levelMin: 1, levelMax: 3, guardOf: 0 },
  { enemyId: 'fox', count: 4, x: 48, z: -32, radius: 6, levelMin: 1, levelMax: 3, guardOf: 1 },
  { enemyId: 'boar', count: 3, x: -32, z: -40, radius: 20, levelMin: 3, levelMax: 5 },
  { enemyId: 'boar', count: 2, x: 34, z: -14, radius: 16, levelMin: 4, levelMax: 6 },
  // Rival predators: the playable species living wild, each in its own territory at the edge of
  // the Forest. The player never meets their own kind, so there are always 2 or 3 of them.
  { enemyId: 'rival_wolf', count: 2, x: -74, z: 40, radius: 12, levelMin: 4, levelMax: 5, rivalOf: 'wolf', respawnSeconds: 150 },
  { enemyId: 'rival_lion', count: 1, x: 74, z: 10, radius: 10, levelMin: 5, levelMax: 6, rivalOf: 'lion', respawnSeconds: 150 },
  { enemyId: 'rival_bear', count: 1, x: 56, z: 50, radius: 12, levelMin: 6, levelMax: 7, rivalOf: 'bear', respawnSeconds: 150 },
];

/**
 * Title screen: the animals of the forest gathered around the big pond (from Milestone 2 with a tiger, an
 * elephant and a crocodile, the Eagle excepted: the title scene has no flight), spread over all its shores.
 * The camera swings slowly around the pond, low among them, like a wildlife film. Nobody fights here; prey just
 * keeps its distance, and now and then an animal walks to the water's edge to drink.
 * Angles around the pond: 0 is east of it, 90 south, 180 west, 270 north.
 */
export const FOREST_TITLE: { view: TitleViewDef; animals: TitleAnimalDef[]; shyDistance: number } = {
  // The arc (west-south-west round to north-west: the longest stretch where the camera is 6 m from every tree
  // and rock and has a clear view of the pond, found by scanning the forest) is checked by a browser test that
  
  // camera looks a little to one side of the pond so that the animals sit to the right of the title lettering.
  view: {
    centre: { x: 46, z: 12 },
    radius: 26,
    fromDeg: 168,
    toDeg: 246,
    height: 2.2,
    lookHeight: 1.0,
    shift: 8,
    period: 120,
  },
  animals: [
    // West shore (180 degrees)
    { enemyId: 'deer', count: 3, x: 29, z: 12, radius: 4 },
    // South-west (135)
    { enemyId: 'fox', count: 2, x: 33, z: 25, radius: 3 },
    // South: the crocodile lies in the water (90)
    { speciesId: 'crocodile', count: 1, x: 46, z: 22, radius: 3, wades: true },
    // South-east (45)
    { enemyId: 'boar', count: 1, x: 59, z: 25, radius: 3 },
    // East: the bear wades at the water's edge (0)
    { speciesId: 'bear', variantId: 'brown', count: 1, x: 59, z: 12, radius: 3.5, wades: true },
    // North-east (330)
    { speciesId: 'elephant', count: 1, x: 62, z: 3, radius: 2.5 },
    // North, north-east (300)
    { speciesId: 'lion', count: 1, x: 55, z: -4, radius: 2.5 },
    // North (270)
    { speciesId: 'tiger', count: 1, x: 46, z: -5, radius: 2.5 },
    // North-west (225)
    { speciesId: 'wolf', count: 2, x: 33, z: -1, radius: 3.5 },
  ],
  /** Prey trots away when a predator comes closer than this. */
  shyDistance: 3.5,
};
