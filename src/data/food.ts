import type { Diet, FoodDef, FoodKind } from '../core/types.ts';

/** What each diet can eat (bible section 4.2). */
export const DIET_FOODS: Record<Diet, FoodKind[]> = {
  carnivore: ['carcass', 'fish'],
  herbivore: ['fruit', 'plant'],
  omnivore: ['carcass', 'fish', 'fruit', 'plant'],
};

export const FOODS: Record<FoodKind, FoodDef> = {
  carcass: { kind: 'carcass', name: 'Carcass', growth: 12, healPct: 0.2 },
  fish: { kind: 'fish', name: 'Fish', growth: 10, healPct: 0.12 },
  fruit: { kind: 'fruit', name: 'Berries', growth: 6, healPct: 0.08 },
  // Leafy plants scattered through the Forest, for herbivores (the Elephant). 30 plants and 8 berry
  // bushes give about 258 growth in one sweep, enough for one full Adult meter; they grow back.
  plant: { kind: 'plant', name: 'Plants', growth: 7, healPct: 0.07 },
};

export function canEat(diet: Diet, kind: FoodKind): boolean {
  return DIET_FOODS[diet].includes(kind);
}
