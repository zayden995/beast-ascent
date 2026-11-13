import type { BiomeDef, BiomeId, SpawnZoneDef } from '../core/types.ts';

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
  den: { x: 0, z: 52, radius: 8 },
  playerSpawn: { x: 0, z: 43, yaw: Math.PI },
  pond: { x: 46, z: 12, radius: 15, depth: 2.4, waterY: 0 },
  arena: { x: 0, z: -58, radius: 18 },
  gate: { x: 0, z: -101, radius: 6 },
  trees: 430,
  rocks: 80,
  grassTufts: 15000,
  berryBushes: [
    [-14, 30], [18, 34], [-32, 14], [22, -6], [-52, -18], [-10, -24], [62, -22], [30, 44],
  ] as [number, number][],
  fishSpots: 4,
  /** Distance from the pond centre that still counts as "near water". */
  nearWaterMargin: 8,
};

export const FOREST_SPAWNS: SpawnZoneDef[] = [
  { enemyId: 'deer', count: 4, x: -42, z: 12, radius: 22, levelMin: 1, levelMax: 3 },
  { enemyId: 'deer', count: 3, x: 44, z: -40, radius: 20, levelMin: 2, levelMax: 4 },
  { enemyId: 'fox', count: 3, x: 14, z: 14, radius: 26, levelMin: 1, levelMax: 2 },
  { enemyId: 'fox', count: 2, x: -60, z: -30, radius: 20, levelMin: 2, levelMax: 4 },
  { enemyId: 'boar', count: 3, x: -32, z: -40, radius: 20, levelMin: 3, levelMax: 5 },
  { enemyId: 'boar', count: 2, x: 34, z: -14, radius: 16, levelMin: 4, levelMax: 6 },
];
