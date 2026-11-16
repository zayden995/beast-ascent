import type { BiomeLayout } from '../core/layout.ts';
import type { River } from './river.ts';

/** A waterfall: where the stream leaves the cliff, which way the water is thrown, and where it lands. */
export interface Waterfall {
  topX: number;
  topZ: number;
  topY: number;
  bottomX: number;
  bottomZ: number;
  bottomY: number;
  /** The way the water goes over the edge (a unit vector). */
  dirX: number;
  dirZ: number;
  /** Width of the falling water at the lip, in metres. */
  width: number;
  /** How far out from the lip it lands. */
  run: number;
}

/**
 * A layout's waterfall, worked out from the stream that feeds it: the water leaves at the stream's last
 * point, carries on the way the stream was flowing, and lands `run` metres out at the biome's water level.
 */
export function waterfallOf(layout: BiomeLayout, rivers: readonly River[]): Waterfall | null {
  const def = layout.waterfall;
  if (!def) return null;
  const river = rivers.find((r) => r.id === def.river);
  if (!river) throw new Error(`The waterfall's stream "${def.river}" is not one of the biome's rivers`);
  const end = river.points[river.points.length - 1];
  const before = river.points[river.points.length - 2];
  const len = Math.hypot(end.x - before.x, end.z - before.z) || 1;
  const dirX = (end.x - before.x) / len;
  const dirZ = (end.z - before.z) / len;
  return {
    topX: end.x, topZ: end.z, topY: river.surfaceY,
    bottomX: end.x + dirX * def.run, bottomZ: end.z + dirZ * def.run, bottomY: layout.waterY,
    dirX, dirZ, width: end.width, run: def.run,
  };
}
