/** The living foxes within `range` metres of a raided reserve: they all attack. */
export function foxesToProvoke<T extends { x: number; z: number; alive: boolean }>(foxes: readonly T[], at: { x: number; z: number }, range: number): T[] {
  return foxes.filter((f) => f.alive && Math.hypot(f.x - at.x, f.z - at.z) <= range);
}

/**
 * How far a guard of a fox food reserve wanders from the middle of its reserve: its usual roam, but never more
 * than the guard zone and a little beyond, so that a raid (which reaches farther than that) angers every guard.
 */
export function guardWanderRadius(usual: number, zoneRadius: number): number {
  return Math.min(usual, zoneRadius + 2);
}
