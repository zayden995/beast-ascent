import { nearAnyWater } from './water.ts';
import type { WaterSet } from './water.ts';

// Rules for an animal that lives in a lake (the Plains' alligators): it stays in the water and an `strip`-metre
// strip of shore around it, attacks anything in that zone, and gives up on anything that leaves it.
// Pure functions, so they can be tested without a browser.

/** True in the water or within `strip` metres of its shore (a pond's rim or a river's bank). */
export function inLakeZone(set: WaterSet, x: number, z: number, strip: number): boolean {
  return nearAnyWater(set, x, z, strip);
}

/**
 * The velocity an animal bound to the lake may use for a step of `dt` seconds from (x, z): the same one,
 * unless the step would take it from inside the zone to outside it, in which case it stops. An animal that is
 * already outside (knocked out of the zone) is never held, so it can always walk back in.
 */
export function holdInLakeZone(
  set: WaterSet,
  strip: number,
  x: number,
  z: number,
  vx: number,
  vz: number,
  dt: number,
): { vx: number; vz: number } {
  if (!inLakeZone(set, x, z, strip)) return { vx, vz };
  return inLakeZone(set, x + vx * dt, z + vz * dt, strip) ? { vx, vz } : { vx: 0, vz: 0 };
}
