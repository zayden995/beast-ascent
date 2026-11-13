import { TAU, smoothstep } from '../core/math.ts';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export const PHASE_NAMES: Record<DayPhase, string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

export interface DayState {
  /** Where the sun is on its circle, in radians: 0 = rising in the east, PI/2 = noon. */
  angle: number;
  /** Sun height: 1 at noon, 0 on the horizon, negative below it. */
  elevation: number;
  /** 0 = full night, 1 = full day. */
  daylight: number;
  /** 0..1, strongest while the sun sits on the horizon (sunrise and sunset colours). */
  twilight: number;
  phase: DayPhase;
}

/** Wraps any number into [0, 1). */
export function wrapDay(time: number): number {
  return ((time % 1) + 1) % 1;
}

/**
 * The state of the sky at a time of day. `time` is a fraction of a full day:
 * 0 = midnight, 0.5 = noon. `dayBias` above 0 makes days longer than nights.
 */
export function dayState(time: number, dayBias: number): DayState {
  const t = wrapDay(time);
  const angle = (t - 0.25) * TAU;
  const elevation = (Math.sin(angle) + dayBias) / (1 + dayBias);
  let phase: DayPhase = 'day';
  if (elevation < -0.12) phase = 'night';
  else if (elevation < 0.22) phase = t < 0.5 ? 'dawn' : 'dusk';
  return {
    angle,
    elevation,
    daylight: smoothstep(-0.1, 0.3, elevation),
    twilight: 1 - smoothstep(0, 0.32, Math.abs(elevation)),
    phase,
  };
}

export function advanceDay(time: number, dt: number, cycleSeconds: number): number {
  return wrapDay(time + dt / cycleSeconds);
}
