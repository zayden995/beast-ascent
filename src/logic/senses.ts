import { angleDelta } from '../core/math.ts';

/** Multiples of an animal's aggro radius at which it notices the player ahead of it and behind it. */
export interface SenseRanges {
  front: number;
  rear: number;
}

/** How wide each cone is, in degrees on each side of straight ahead / straight behind. */
export interface SenseCone {
  frontHalfDeg: number;
  rearHalfDeg: number;
}

/**
 * How far an animal notices something, as a multiple of its aggro radius, by where that thing is
 * compared with the direction the animal faces. Inside the front cone it notices at the `front`
 * range, inside the cone straight behind it only at the `rear` range, and the range blends evenly
 * between the two on its sides. This is what lets a hunter creep up on an animal from behind, and
 * lets prey that faces a hunter bolt before the hunter is near.
 *
 * `dx` and `dz` point from the animal to the thing; `facingYaw` follows `Actor.faceToward`.
 */
export function noticeMultiplier(
  facingYaw: number,
  dx: number,
  dz: number,
  ranges: SenseRanges,
  cone: SenseCone,
): number {
  if (Math.hypot(dx, dz) < 1e-6) return ranges.front;
  const off = (Math.abs(angleDelta(facingYaw, Math.atan2(dx, dz))) * 180) / Math.PI;
  const frontEdge = cone.frontHalfDeg;
  const rearEdge = 180 - cone.rearHalfDeg;
  if (off <= frontEdge) return ranges.front;
  if (off >= rearEdge) return ranges.rear;
  return ranges.front + ((ranges.rear - ranges.front) * (off - frontEdge)) / (rearEdge - frontEdge);
}
