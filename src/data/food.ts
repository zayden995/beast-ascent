import type { Diet, FoodDef, FoodKind } from '../core/types.ts';

/** What each diet can eat (bible section 4.2). */
export const DIET_FOODS: Record<Diet, FoodKind[]> = {
  carnivore: ['carcass', 'fish'],
  herbivore: ['fruit', 'plant', 'leaf', 'nut'],
  omnivore: ['carcass', 'fish', 'fruit', 'plant', 'leaf', 'nut'],
};

export const FOODS: Record<FoodKind, FoodDef> = {
  carcass: { kind: 'carcass', name: 'Carcass', growth: 12, healPct: 0.2 },
  fish: { kind: 'fish', name: 'Fish', growth: 10, healPct: 0.12 },
  fruit: { kind: 'fruit', name: 'Berries', growth: 6, healPct: 0.08 },
  // Leafy plants scattered through the Forest, for herbivores (the Elephant). 30 plants and 8 berry
  // bushes give about 258 growth in one sweep, enough for one full Adult meter; they grow back.
  plant: { kind: 'plant', name: 'Plants', growth: 7, healPct: 0.07 },
  // Browsed from trees by plant-eaters (the Elephant and the Bear), see TREE_FOOD.
  leaf: { kind: 'leaf', name: 'Leaves', growth: 3, healPct: 0.04 },
  nut: { kind: 'nut', name: 'Nuts', growth: 10, healPct: 0.1 },
};

/**
 * Food on the trees and in the foxes' reserves (added in the M2 review). Every tree has leaves, some broadleaf
 * trees bear fruit and some pines bear nuts, and a bare tree grows its food back after `regrowSeconds`. Leaves give
 * the least growth. A fox food reserve is worth more, and eating from it angers every fox within `provokeRange`.
 */
export const TREE_FOOD = {
  leaf: { growth: 3 },
  fruit: { growth: 8 },
  nut: { growth: 10 },
  regrowSeconds: 60,
  /** The share of broadleaf trees that bear fruit, and of pines that bear nuts. */
  fruitTreeShare: 0.125,
  nutTreeShare: 0.25,
  reserveGrowth: 12,
  reserveRespawnSeconds: 120,
  provokeRange: 15,
};

/** What a fox food reserve holds: one of each. Vegetables count as plants and fruit as fruit for diets. */
export const RESERVE_PRODUCE: { name: string; kind: FoodKind; color: number; shape: 'cone' | 'long' | 'cob' | 'ball' | 'cluster' | 'small' }[] = [
  { name: 'carrot', kind: 'plant', color: 0xf08a24, shape: 'cone' },
  { name: 'sweet potato', kind: 'plant', color: 0x9b5a52, shape: 'long' },
  { name: 'corn', kind: 'plant', color: 0xf0d23c, shape: 'cob' },
  { name: 'apple', kind: 'fruit', color: 0xc8262b, shape: 'ball' },
  { name: 'berries', kind: 'fruit', color: 0x7b1f4e, shape: 'cluster' },
  { name: 'cherry tomato', kind: 'fruit', color: 0xe3342f, shape: 'small' },
];

export function canEat(diet: Diet, kind: FoodKind): boolean {
  return DIET_FOODS[diet].includes(kind);
}
