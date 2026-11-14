/** Numbers that shape flight (they live in `TUNING.flight`). */
export interface FlightTuning {
  /** Metres per second climbed while flapping. */
  climbSpeed: number;
  /** How quickly vertical speed follows its target, per second. */
  verticalLambda: number;
  /** Metres per second sunk while gliding. */
  glideSink: number;
  /** Highest altitude above the ground, in metres. */
  ceiling: number;
}

/** Vertical speed the animal is heading for: flapping climbs (until the ceiling), anything else glides down. */
export function targetVerticalSpeed(flapping: boolean, altitude: number, tuning: FlightTuning): number {
  return flapping && altitude < tuning.ceiling ? tuning.climbSpeed : -tuning.glideSink;
}

/** One step of vertical speed toward its target. It eases in, so a long frame cannot overshoot. */
export function stepVerticalSpeed(vy: number, flapping: boolean, altitude: number, dt: number, tuning: FlightTuning): number {
  const target = targetVerticalSpeed(flapping, altitude, tuning);
  return vy + (target - vy) * (1 - Math.exp(-tuning.verticalLambda * dt));
}

/** Altitude above the ground kept between the ground (landing) and the ceiling. */
export function clampAltitude(altitude: number, tuning: FlightTuning): number {
  return Math.min(tuning.ceiling, Math.max(0, altitude));
}
