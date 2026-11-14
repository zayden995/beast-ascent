import { mulberry32 } from '../core/math.ts';

/** What a tree bears besides leaves. */
export type TreeKind = 'fruit' | 'nut' | 'plain';

/** What a plant-eater can take from a tree right now. */
export type TreePick = 'fruit' | 'nut' | 'leaf';

/**
 * Decides which trees bear fruit and which bear nuts, the same way every time for the same forest: exactly the
 * given share of the broadleaf trees bear fruit, exactly the given share of the pines bear nuts, and the rest
 * only have leaves. The trees are picked at random (from the seed), so they are spread through the forest.
 */
export function assignTreeFood(spots: readonly { pine: boolean }[], seed: number, fruitShare: number, nutShare: number): TreeKind[] {
  const rand = mulberry32(seed + 5150);
  const kinds: TreeKind[] = spots.map(() => 'plain');
  const choose = (pine: boolean, share: number, kind: TreeKind): void => {
    const indices = spots.flatMap((t, i) => (t.pine === pine ? [i] : []));
    // Shuffle (Fisher-Yates), then the first ones in the shuffled order get the food.
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (const i of indices.slice(0, Math.round(indices.length * share))) kinds[i] = kind;
  };
  choose(false, fruitShare, 'fruit');
  choose(true, nutShare, 'nut');
  return kinds;
}

/** One tree's food: what it bears, and when its leaves and its fruit or nuts are ready again. */
export interface TreeFoodState {
  kind: TreeKind;
  leafAt: number;
  treatAt: number;
}

export function newTreeState(kind: TreeKind): TreeFoodState {
  return { kind, leafAt: 0, treatAt: 0 };
}

/** The best food on offer: fruit or nuts first, then leaves, or null when the tree is bare. */
export function availableFood(t: TreeFoodState, now: number): TreePick | null {
  if (t.kind !== 'plain' && now >= t.treatAt) return t.kind;
  if (now >= t.leafAt) return 'leaf';
  return null;
}

/** Takes the food: the leaves, or the fruit or nuts, are gone for `regrowSeconds`. The other stays. */
export function takeFood(t: TreeFoodState, pick: TreePick, now: number, regrowSeconds: number): void {
  if (pick === 'leaf') t.leafAt = now + regrowSeconds;
  else t.treatAt = now + regrowSeconds;
}
