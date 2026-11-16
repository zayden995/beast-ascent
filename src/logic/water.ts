import type { WaterBody } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import { nearRiver, riverAt, riverBankPoint } from './river.ts';
import type { River } from './river.ts';

export type { WaterBody } from '../core/types.ts';

/** The body of water a point lies in (the shoreline counts as water), or null on dry land. */
export function bodyAt(waters: readonly WaterBody[], x: number, z: number): WaterBody | null {
  for (const w of waters) if (Math.hypot(x - w.x, z - w.z) <= w.radius) return w;
  return null;
}

/** True within `margin` metres of the shore of any body of water (or in it). */
export function nearWater(waters: readonly WaterBody[], x: number, z: number, margin: number): boolean {
  return waters.some((w) => Math.hypot(x - w.x, z - w.z) < w.radius + margin);
}

/**
 * Where an animal stands to drink: on dry ground just outside the shore of the nearest pond (the side it
 * is on), facing the water. Null if no pond's shore is within `reach` metres.
 */
export function shoreStandPoint(
  waters: readonly WaterBody[],
  x: number,
  z: number,
  reach: number,
): { x: number; z: number; yaw: number } | null {
  const spot = pondShorePoint(waters, x, z, reach);
  return spot ? { x: spot.x, z: spot.z, yaw: spot.yaw } : null;
}

/** `shoreStandPoint`, with how far away that shore is. */
function pondShorePoint(
  waters: readonly WaterBody[],
  x: number,
  z: number,
  reach: number,
): { x: number; z: number; yaw: number; distance: number } | null {
  let best: WaterBody | null = null;
  let bestDistance = Infinity;
  for (const w of waters) {
    const d = Math.hypot(x - w.x, z - w.z) - w.radius;
    if (d < bestDistance) {
      bestDistance = d;
      best = w;
    }
  }
  if (!best || bestDistance > reach) return null;
  let dx = x - best.x;
  let dz = z - best.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    dx = 1;
    dz = 0;
  } else {
    dx /= len;
    dz /= len;
  }
  const r = best.radius + TUNING.drink.standOff;
  const sx = best.x + dx * r;
  const sz = best.z + dz * r;
  return { x: sx, z: sz, yaw: Math.atan2(best.x - sx, best.z - sz), distance: bestDistance };
}

/** All the water of a biome: its ponds, its rivers and the height of the water that does not name its own. */
export interface WaterSet {
  waters: readonly WaterBody[];
  rivers: readonly River[];
  waterY: number;
}

/** The height of the water surface over a point (the pond or river it lies in), or null on dry land. */
export function surfaceAt(set: WaterSet, x: number, z: number): number | null {
  const pond = bodyAt(set.waters, x, z);
  if (pond) return pond.surfaceY ?? set.waterY;
  const river = riverAt(set.rivers, x, z);
  return river ? river.river.surfaceY : null;
}

/** True within `margin` metres of the shore of any pond or the bank of any river (or in the water). */
export function nearAnyWater(set: WaterSet, x: number, z: number, margin: number): boolean {
  return nearWater(set.waters, x, z, margin) || nearRiver(set.rivers, x, z, margin);
}

/**
 * Where an animal stands to drink: on dry ground at the nearest water's edge, a pond's shore or a river's
 * bank, facing the water. Null if no water's edge is within `reach` metres.
 */
export function drinkSpot(set: WaterSet, x: number, z: number, reach: number): { x: number; z: number; yaw: number } | null {
  const pond = pondShorePoint(set.waters, x, z, reach);
  const bank = riverBankPoint(set.rivers, x, z, reach, TUNING.drink.standOff);
  const best = pond && bank ? (pond.distance <= bank.distance ? pond : bank) : pond ?? bank;
  return best ? { x: best.x, z: best.z, yaw: best.yaw } : null;
}
