import { fbm2, lerp, smoothstep } from '../core/math.ts';
import type { BiomeLayout, HillDef } from '../core/layout.ts';
import type { WaterBody } from '../core/types.ts';
import { FOREST_LAYOUT } from '../data/biomes.ts';
import { mountainHeight, trailPoint } from './mountain.ts';
import { buildRiver, sampleRiver } from './river.ts';
import type { River } from './river.ts';

export type HeightFn = (x: number, z: number) => number;

/** How far above the water the ground stands at the shore of a pond. */
const POND_SHORE = 0.5;
/** How far above the water the ground stands at the bank of a river. */
export const RIVER_BANK = 0.35;
/** The ground eases down to a river's bank over this many metres either side of it. */
const RIVER_BLEND = 8;

/** Pulls `h` toward `target` inside `radius`, blending back to natural terrain over `blend` metres. */
function flatten(h: number, dist: number, radius: number, blend: number, target: number): number {
  return lerp(h, target, 1 - smoothstep(radius, radius + blend, dist));
}

/** The surface of a pond: its own height if it has one (a pond on a hill), otherwise the biome's water level. */
export function surfaceOf(w: WaterBody, waterY: number): number {
  return w.surfaceY ?? waterY;
}

/** The rivers of a layout, made ready for questions (see `buildRiver`). */
export function buildRivers(layout: BiomeLayout): River[] {
  return layout.rivers.map((r) => buildRiver(r, layout.waterY));
}

/**
 * How much of a hill's height a point has: 1 on the flat top, falling to 0 at the foot. On the cliff side
 * the foot is only a few metres out from the top, so the ground drops almost straight down.
 */
export function hillWeight(hill: HillDef, x: number, z: number): number {
  const dx = x - hill.x;
  const dz = z - hill.z;
  const d = Math.hypot(dx, dz);
  if (d <= hill.plateauRadius) return 1;
  let reach = hill.footRadius - hill.plateauRadius;
  if (hill.cliff) {
    const c = hill.cliff;
    const toward = (c.towardDeg * Math.PI) / 180;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - toward), Math.cos(Math.atan2(dz, dx) - toward))) * (180 / Math.PI);
    reach = lerp(c.width, reach, smoothstep(c.halfDeg, c.halfDeg + c.taperDeg, off));
  }
  return 1 - smoothstep(hill.plateauRadius, hill.plateauRadius + reach, d);
}

/**
 * A biome's terrain height. Rolling ground with small bumps; flat ground at the den, the boss arena and the
 * gates; a bowl for each pond; a channel for each river; an optional flat-topped hill (with a cliff on one
 * side) that can carry its own pond and stream; and steep slopes at the world edge.
 */
export function createHeight(layout: BiomeLayout, rivers: River[] = buildRivers(layout)): HeightFn {
  const { seed, den, arena, gate, returnGate, waters, waterY, worldRadius, terrain: T, hill, mountain } = layout;
  const base: HeightFn = (x, z) =>
    T.base + fbm2(x * T.rollScale, z * T.rollScale, seed, T.rollOctaves) * T.rollHeight + fbm2(x * T.bumpScale, z * T.bumpScale, seed + 7, T.bumpOctaves) * T.bumpHeight;

  const denH = base(den.x, den.z);
  const arenaH = base(arena.x, arena.z);
  const returnH = returnGate ? base(returnGate.x, returnGate.z) : 0;
  const caveFloors = (layout.caves ?? []).map((cave) => ({ cave, floor: base(cave.x, cave.z) }));

  // The mountain stands on the land's own height where its trail starts, so the trail leaves the land without a step.
  const start = mountain ? trailPoint(mountain, 0) : null;
  const mountainBase = start ? base(start.x, start.z) : 0;

  const frozen = waters.filter((w) => w.frozen && surfaceOf(w, waterY) === waterY);
  const lowWaters = waters.filter((w) => !w.frozen && surfaceOf(w, waterY) === waterY);
  const highWaters = waters.filter((w) => !w.frozen && surfaceOf(w, waterY) !== waterY);
  // A frozen pool on raised ground (the pool on Winter's peak) is carved into the mountain once it is built.
  const raisedFrozen = waters.filter((w) => w.frozen && surfaceOf(w, waterY) !== waterY);
  const lowRivers = rivers.filter((r) => !r.raised);
  const highRivers = rivers.filter((r) => r.raised);

  /** Each pond is a bowl: the ground eases down to the shore, then sinks to its depth in the middle. */
  const carvePonds = (h: number, x: number, z: number, list: WaterBody[]): number => {
    for (const w of list) {
      const shoreH = surfaceOf(w, waterY) + POND_SHORE;
      const dp = Math.hypot(x - w.x, z - w.z);
      h = flatten(h, dp, w.radius, 9, shoreH);
      if (dp < w.radius) {
        const t = 1 - dp / w.radius;
        h = shoreH - smoothstep(0, 0.75, t) * (w.depth + POND_SHORE);
      }
    }
    return h;
  };

  /**
   * A frozen lake is several overlapping circles that make one lake: the land eases down to the shore outside all of them, and
   * inside, the bed is the deepest of the bowls the point lies in (so there is no ridge where two circles overlap).
   */
  const carveFrozen = (h: number, x: number, z: number): number => {
    let bowl = Infinity;
    let nearest = Infinity;
    let shoreH = waterY + POND_SHORE;
    for (const w of frozen) {
      const dp = Math.hypot(x - w.x, z - w.z);
      shoreH = surfaceOf(w, waterY) + POND_SHORE;
      nearest = Math.min(nearest, dp - w.radius);
      // The bed reaches its depth within about 8 m of the shore, so a hole in the ice anywhere but the very edge is deep water.
      if (dp < w.radius) bowl = Math.min(bowl, shoreH - smoothstep(0, Math.min(0.75, 8 / w.radius), 1 - dp / w.radius) * (w.depth + POND_SHORE));
    }
    if (bowl < Infinity) return bowl;
    return flatten(h, nearest, 0, 9, shoreH);
  };

  /** Each river is a channel: the ground eases down to the banks, then sinks to the river's depth in the middle. */
  const carveRivers = (h: number, x: number, z: number, list: River[], ponds: WaterBody[]): number => {
    for (const river of list) {
      const s = sampleRiver(river, x, z);
      if (!s || s.dist >= s.halfWidth + RIVER_BLEND) continue;
      const bankH = river.surfaceY + RIVER_BANK;
      let carved = flatten(h, s.dist, s.halfWidth, RIVER_BLEND, bankH);
      if (s.dist < s.halfWidth) carved = bankH - smoothstep(0, 1, 1 - s.dist / s.halfWidth) * (s.depth + RIVER_BANK);
      // Where a river runs into a pond, it never raises the pond's floor.
      const inPond = ponds.some((w) => Math.hypot(x - w.x, z - w.z) < w.radius);
      h = inPond ? Math.min(h, carved) : carved;
    }
    return h;
  };

  return (x, z) => {
    let h = base(x, z);
    h = flatten(h, Math.hypot(x - den.x, z - den.z), den.radius, 8, denH);
    h = flatten(h, Math.hypot(x - arena.x, z - arena.z), arena.radius + 2, 10, arenaH);
    if (!gate.unused) h = flatten(h, Math.hypot(x - gate.x, z - gate.z), gate.radius, 8, arenaH);
    if (returnGate) h = flatten(h, Math.hypot(x - returnGate.x, z - returnGate.z), returnGate.radius, 8, returnH);
    // Each cave stands on level ground: the land's own height at its middle, flattened over the floor and the walls.
    for (const { cave, floor } of caveFloors) h = flatten(h, Math.hypot(x - cave.x, z - cave.z), cave.radius + 3.5, 7, floor);

    if (frozen.length) h = carveFrozen(h, x, z);
    h = carvePonds(h, x, z, lowWaters);
    if (lowRivers.length) h = carveRivers(h, x, z, lowRivers, lowWaters);

    if (hill) {
      const w = hillWeight(hill, x, z);
      if (w > 0) {
        // Water on the hill is carved into the hill's own top, which is then blended into the land around it:
        // on the cliff side the stream's channel becomes a notch in the edge, where the waterfall pours out.
        let top = hill.top + fbm2(x * T.bumpScale, z * T.bumpScale, seed + 19, 2) * hill.bumpHeight;
        top = carvePonds(top, x, z, highWaters);
        if (highRivers.length) top = carveRivers(top, x, z, highRivers, highWaters);
        h = lerp(h, top, w);
      }
    }

    if (mountain) {
      const m = mountainHeight(mountain, x, z);
      if (m !== null) h = Math.max(h, mountainBase + m);
    }
    for (const w of raisedFrozen) {
      const dp = Math.hypot(x - w.x, z - w.z);
      if (dp >= w.radius) continue;
      const shoreH = surfaceOf(w, waterY) + POND_SHORE;
      h = Math.min(h, shoreH - smoothstep(0, Math.min(0.75, 8 / w.radius), 1 - dp / w.radius) * (w.depth + POND_SHORE));
    }

    const r = Math.hypot(x, z);
    const edge = worldRadius - 3;
    if (r > edge) {
      const t = (r - edge) / 8;
      h += Math.min(45, t * t * 9);
    }
    return h;
  };
}

/** The Forest's terrain (see `createHeight`). */
export function createForestHeight(layout: BiomeLayout = FOREST_LAYOUT): HeightFn {
  return createHeight(layout);
}

/** How steeply the ground rises or falls at a point, as rise over run (the steepest direction). */
export function slopeAt(heightAt: HeightFn, x: number, z: number, step = 0.5): number {
  const gx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
  const gz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  return Math.hypot(gx, gz);
}
