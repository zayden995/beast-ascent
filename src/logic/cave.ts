import { mulberry32 } from '../core/math.ts';
import type { CaveDef } from '../core/layout.ts';

/** Half the width of the trail that leads to the cave, in metres. */
export const TRAIL_HALF_WIDTH = 2.0;

/** Half the width of the cave's mouth, in metres: wide enough for the biggest animal (an Alpha Elephant) to walk in. */
export const MOUTH_HALF_WIDTH = 3.2;
/** How far outside the floor's radius the rock walls stand (their middles). */
export const WALL_OFFSET = 1.2;

/** A rock of the cave: where it stands, how big it is, and (for a wall) how much room it takes up. */
export interface CaveStone {
  x: number;
  z: number;
  /** Height of its middle above the floor. */
  y: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  /** Walls block an animal with a circle of this radius; roof stones are well overhead and block nothing (0). */
  r: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The point `dist` metres from the middle of the cave in a direction (0 = east, 90 = south, 180 = west, 270 = north). */
export function caveSpot(cave: CaveDef, deg: number, dist: number): { x: number; z: number } {
  return { x: cave.x + Math.cos(rad(deg)) * dist, z: cave.z + Math.sin(rad(deg)) * dist };
}

/** Half the angle of the mouth, seen from the middle of the cave. */
export function mouthHalfDeg(cave: CaveDef): number {
  return (Math.asin(Math.min(1, MOUTH_HALF_WIDTH / cave.radius)) * 180) / Math.PI;
}

/** True inside the cave and its walls (`margin` widens it). */
export function inCave(cave: CaveDef, x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - cave.x, z - cave.z) < cave.radius + WALL_OFFSET + 1.8 + margin;
}

/**
 * The rock walls: a ring of boulders around the floor with a gap for the mouth. They overlap, so that nothing
 * can squeeze between them. The two that frame the mouth are the biggest.
 */
export function caveWalls(cave: CaveDef, seed: number): CaveStone[] {
  const rand = mulberry32(seed);
  const half = mouthHalfDeg(cave);
  const first = half + 9;
  const span = 360 - 2 * first;
  const count = Math.ceil(span / 21);
  const stones: CaveStone[] = [];
  for (let k = 0; k <= count; k++) {
    const deg = cave.mouthDeg + first + (span * k) / count;
    const jamb = k === 0 || k === count;
    const sx = (jamb ? 3.1 : 2.4) + rand() * 0.7;
    const sy = (jamb ? 3.4 : 2.6) + rand() * 0.9;
    const sz = (jamb ? 2.8 : 2.3) + rand() * 0.6;
    const at = caveSpot(cave, deg, cave.radius + WALL_OFFSET + (jamb ? 0.4 : 0));
    stones.push({ ...at, y: sy * 0.78, sx, sy, sz, yaw: rand() * Math.PI, r: Math.max(sx, sz) * 0.8 });
  }
  return stones;
}

/** The stones that roof the cave: a lintel over the mouth, a big slab in the middle and a ring of flatter ones. */
export function caveRoof(cave: CaveDef, seed: number): CaveStone[] {
  const rand = mulberry32(seed);
  const stones: CaveStone[] = [];
  const mouth = caveSpot(cave, cave.mouthDeg, cave.radius + 0.4);
  // The lintel lies across the mouth: its long side at right angles to the way in.
  const across = rad(cave.mouthDeg) + Math.PI / 2;
  stones.push({ ...mouth, y: 4.1, sx: 3.0, sy: 1.1, sz: 4.6, yaw: -across, r: 0 });
  stones.push({ x: cave.x, z: cave.z, y: 4.3, sx: 5.2, sy: 1.4, sz: 5.0, yaw: rand() * Math.PI, r: 0 });
  for (let k = 0; k < 6; k++) {
    const deg = cave.mouthDeg + 30 + k * 60;
    const at = caveSpot(cave, deg, cave.radius * 0.62);
    stones.push({ ...at, y: 3.9 + rand() * 0.4, sx: 3.2, sy: 1.2, sz: 3.0, yaw: rand() * Math.PI, r: 0 });
  }
  return stones;
}

/** The trail from the cave's mouth to the arena: a straight strip kept clear of trees, so that the cave can be found and reached. */
export interface CaveTrail {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function caveTrail(cave: CaveDef, arena: { x: number; z: number; radius: number }): CaveTrail {
  const from = caveSpot(cave, cave.mouthDeg, cave.radius + WALL_OFFSET + 2.5);
  const dx = arena.x - from.x;
  const dz = arena.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  // It ends just outside the arena's ring of standing stones.
  const stop = arena.radius + 5;
  return { x0: from.x, z0: from.z, x1: arena.x - (dx / len) * stop, z1: arena.z - (dz / len) * stop };
}

/** How far a point is from the trail's centre line (the nearest point on the strip, ends included). */
export function distanceToTrail(t: CaveTrail, x: number, z: number): number {
  const sx = t.x1 - t.x0;
  const sz = t.z1 - t.z0;
  const len2 = sx * sx + sz * sz;
  const k = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - t.x0) * sx + (z - t.z0) * sz) / len2)) : 0;
  return Math.hypot(x - (t.x0 + sx * k), z - (t.z0 + sz * k));
}

/** Where the bait carcasses lie: in an arc at the back of the cave, opposite the mouth. */
export function caveBaitSpots(cave: CaveDef): { x: number; z: number }[] {
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < cave.bait; i++) {
    const offset = (i - (cave.bait - 1) / 2) * 38;
    spots.push(caveSpot(cave, cave.mouthDeg + 180 + offset, cave.radius * 0.55));
  }
  return spots;
}
