import { angleDelta } from '../core/math.ts';

/** Damage after defense: raw * k / (k + defense). Always at least 1. */
export function mitigate(raw: number, defense: number, k: number): number {
  if (raw <= 0) return 0;
  const reduced = raw * (k / (k + Math.max(0, defense)));
  return Math.max(1, Math.round(reduced));
}

/** Multiplier from "bonus damage to low-health targets" passives. */
export function lowHealthMultiplier(
  targetHealthFraction: number,
  bonus: { threshold: number; pct: number } | null,
): number {
  if (!bonus) return 1;
  return targetHealthFraction < bonus.threshold ? 1 + bonus.pct : 1;
}

/**
 * True when the attacker stands behind the target: inside the rear `arcDeg` of the direction the
 * target faces. `targetYaw` follows `Actor.faceToward` (it faces (sin yaw, cos yaw)). An attacker
 * standing exactly on the target is never behind it.
 */
export function isBehind(
  targetYaw: number,
  targetX: number,
  targetZ: number,
  attackerX: number,
  attackerZ: number,
  arcDeg = 120,
): boolean {
  const dx = attackerX - targetX;
  const dz = attackerZ - targetZ;
  if (Math.hypot(dx, dz) < 1e-6) return false;
  const away = Math.abs(angleDelta(targetYaw, Math.atan2(dx, dz)));
  return away >= Math.PI - (arcDeg * Math.PI) / 360;
}

/**
 * Can a hit reach a target `dy` metres above (+) or below (-) the attacker's feet? Two animals on
 * the ground keep the generous old window (3 m plus the attacker's height, which covers slopes and
 * jumps). Once either one flies, only a hit within the attacker's own height plus 1.2 m can land:
 * a boar cannot hit an eagle high above it, and an eagle must come down to bite.
 */
export function withinVerticalReach(dy: number, attackerHeight: number, flying: boolean): boolean {
  const window = flying ? attackerHeight + 1.2 : 3 + attackerHeight;
  return Math.abs(dy) <= window;
}
