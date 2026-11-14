export interface FishTuning {
  /** A wading animal this close makes a fish swim away. */
  alarmRange: number;
  fleeSpeed: number;
  dartSpeed: number;
  /** A fish that an animal gets this close to darts. */
  dartRange: number;
  dartSeconds: number;
  /** Seconds before the same fish can dart again. */
  dartCooldown: number;
  /** How fast a fish drifts back to its circle once it is left alone. */
  returnSpeed: number;
  /** How close to the shore a fish dares to swim. */
  shoreMargin: number;
}

/** What a fish needs besides its circle: how far it has been pushed off it, and its dart timers. */
export interface FishState {
  ox: number;
  oz: number;
  dart: number;
  cooldown: number;
}

export function newFish(): FishState {
  return { ox: 0, oz: 0, dart: 0, cooldown: 0 };
}

/**
 * One step of a fish's behaviour. `base` is where its calm swimming circle has put it; the fish is at
 * `base + offset`. A wading animal within the alarm range pushes the offset away from itself (faster in
 * a dart when it gets close), always inside the water; left alone, the offset drifts back to zero.
 * Returns true while the fish is alarmed (the caller freezes its circle then).
 */
export function stepFish(
  f: FishState,
  base: { x: number; z: number },
  threat: { x: number; z: number } | null,
  water: { x: number; z: number; radius: number },
  dt: number,
  t: FishTuning,
): boolean {
  f.dart = Math.max(0, f.dart - dt);
  f.cooldown = Math.max(0, f.cooldown - dt);
  const px = base.x + f.ox;
  const pz = base.z + f.oz;
  if (threat) {
    let dx = px - threat.x;
    let dz = pz - threat.z;
    const d = Math.hypot(dx, dz);
    if (d <= t.alarmRange) {
      if (f.dart <= 0 && f.cooldown <= 0 && d <= t.dartRange) {
        f.dart = t.dartSeconds;
        f.cooldown = t.dartCooldown;
      }
      if (d < 1e-6) {
        dx = 1;
        dz = 0;
      } else {
        dx /= d;
        dz /= d;
      }
      const speed = f.dart > 0 ? t.dartSpeed : t.fleeSpeed;
      let nx = px + dx * speed * dt;
      let nz = pz + dz * speed * dt;
      // Never out of the water: at the shore the fish slides along it instead.
      const limit = water.radius - t.shoreMargin;
      const fromMiddle = Math.hypot(nx - water.x, nz - water.z);
      if (fromMiddle > limit) {
        nx = water.x + ((nx - water.x) / fromMiddle) * limit;
        nz = water.z + ((nz - water.z) / fromMiddle) * limit;
      }
      f.ox = nx - base.x;
      f.oz = nz - base.z;
      return true;
    }
  }
  const len = Math.hypot(f.ox, f.oz);
  const back = t.returnSpeed * dt;
  if (len <= back) {
    f.ox = 0;
    f.oz = 0;
  } else {
    f.ox -= (f.ox / len) * back;
    f.oz -= (f.oz / len) * back;
  }
  return false;
}
