import type { NightVision } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';

/**
 * How much of its daytime sight an animal keeps: all of it by day, its night fraction at full night,
 * and a straight blend through dusk and dawn (`daylight` is 0 at night and 1 by day).
 */
export function nightVisionFactor(atFullNight: number, daylight: number): number {
  const d = Math.min(1, Math.max(0, daylight));
  return atFullNight + (1 - atFullNight) * d;
}

/** True when the HUD should say "limited vision": the animal has the debuff and it is dark enough. */
export function visionLimited(nightVision: NightVision | undefined, daylight: number): boolean {
  return !!nightVision && nightVision.sight < 1 && daylight < TUNING.dayNight.limitedBelowDaylight;
}

/**
 * How far away an enemy's level tag can be seen. The usual range (or Eagle Eye's, if it is longer) applies
 * to animals, bosses show from farther away, and `sight` shrinks both in the dark.
 */
export function tagRange(isBoss: boolean, revealRange: number, sight: number): number {
  const base = isBoss ? TUNING.labels.bossRange : Math.max(TUNING.labels.range, revealRange);
  return base * sight;
}
