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
