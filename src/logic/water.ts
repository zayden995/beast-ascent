import type { WaterBody } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';

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
  return { x: sx, z: sz, yaw: Math.atan2(best.x - sx, best.z - sz) };
}
