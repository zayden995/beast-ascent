// The Woolly Mammoth's ice shockwave: a ring that spreads out from its stamp. Pure rule, no three.js.

/**
 * True if the ring hits an animal this step: the band the ring swept over (from `prevRadius - width` to `radius`) reaches the
 * animal's distance from the stamp, the animal is on the ground (a jump lets the ring pass under it) and not in a dodge roll.
 * The caller makes sure each animal is hit only once per wave.
 */
export function waveHits(prevRadius: number, radius: number, width: number, dist: number, grounded: boolean, invulnerable: boolean): boolean {
  if (!grounded || invulnerable) return false;
  return dist >= prevRadius - width && dist <= radius;
}
