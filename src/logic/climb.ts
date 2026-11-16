/** How far ahead of an animal the ground is tested for steepness, in metres. */
export const CLIMB_PROBE = 0.4;

/**
 * True if the ground ahead is too steep to walk onto: it stands higher above the animal's feet than the
 * steepest slope it can climb would rise over that distance. Ground that falls away never blocks (an animal
 * can always walk or drop down), and an animal in the air is only stopped by ground higher than it is.
 */
export function tooSteep(feetY: number, groundAhead: number, run: number, maxSlope: number): boolean {
  return groundAhead - feetY > maxSlope * run;
}

/**
 * Ground far too steep to stand on throws an animal off: returns how far it slides this step, straight down
 * the slope, or null where the ground can be stood on. "Far too steep" is a quarter steeper than the
 * steepest slope that can be climbed, so that nothing slides on ground it was able to walk up.
 */
export function slideStep(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  maxSlope: number,
  speed: number,
  dt: number,
): { dx: number; dz: number } | null {
  const e = 0.3;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const slope = Math.hypot(gx, gz);
  if (slope <= maxSlope * 1.25) return null;
  return { dx: (-gx / slope) * speed * dt, dz: (-gz / slope) * speed * dt };
}

/**
 * Tries to move from (`x`, `z`) by (`dx`, `dz`) over ground that cannot be climbed where it is steeper than
 * `maxSlope`. Returns the step that is allowed: all of it, only its x or z part (the animal slides along
 * the foot of the slope), or nothing.
 */
export function climbStep(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  feetY: number,
  dx: number,
  dz: number,
  maxSlope: number,
): { dx: number; dz: number } {
  const blocked = (sx: number, sz: number): boolean => {
    const len = Math.hypot(sx, sz);
    if (len < 1e-9) return false;
    // Look a fixed distance ahead, so that a slow animal cannot creep up a cliff in tiny steps.
    const k = Math.max(len, CLIMB_PROBE) / len;
    return tooSteep(feetY, heightAt(x + sx * k, z + sz * k), len * k, maxSlope);
  };
  if (!blocked(dx, dz)) return { dx, dz };
  if (Math.abs(dx) >= Math.abs(dz)) {
    if (!blocked(dx, 0)) return { dx, dz: 0 };
    if (!blocked(0, dz)) return { dx: 0, dz };
  } else {
    if (!blocked(0, dz)) return { dx: 0, dz };
    if (!blocked(dx, 0)) return { dx, dz: 0 };
  }
  return { dx: 0, dz: 0 };
}
