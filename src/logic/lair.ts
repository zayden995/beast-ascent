/**
 * Whether an animal at `player` wakes a lair by coming near it: the lair names a `wakeNear` distance (a den of the
 * Plains), the animal is alive, and it is within that many metres of the zone's middle and not in its own den's
 * refuge (wild animals ignore an animal there). A lair without a distance (the Jungle's cave) wakes only by its
 * bait or a wound.
 */
export function lairWakes(
  zone: { x: number; z: number; wakeNear?: number },
  player: { x: number; z: number },
  playerAlive: boolean,
  inRefuge: boolean,
): boolean {
  if (zone.wakeNear === undefined || !playerAlive || inRefuge) return false;
  return Math.hypot(player.x - zone.x, player.z - zone.z) <= zone.wakeNear;
}
