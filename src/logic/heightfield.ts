import { fbm2, lerp, smoothstep } from '../core/math.ts';
import { FOREST_LAYOUT } from '../data/biomes.ts';

export type HeightFn = (x: number, z: number) => number;

/** Pulls `h` toward `target` inside `radius`, blending back to natural terrain over `blend` metres. */
function flatten(h: number, dist: number, radius: number, blend: number, target: number): number {
  return lerp(h, target, 1 - smoothstep(radius, radius + blend, dist));
}

/**
 * Forest terrain height. Rolling hills, with flat ground at the den, the boss arena and the
 * gate, a bowl for the pond, and steep slopes at the world edge.
 */
export function createForestHeight(layout = FOREST_LAYOUT): HeightFn {
  const { seed, den, arena, gate, pond, worldRadius } = layout;
  const base: HeightFn = (x, z) =>
    1.6 + fbm2(x * 0.02, z * 0.02, seed, 3) * 4.4 + fbm2(x * 0.09, z * 0.09, seed + 7, 2) * 0.45;

  const denH = base(den.x, den.z);
  const arenaH = base(arena.x, arena.z);
  const shoreH = pond.waterY + 0.5;

  return (x, z) => {
    let h = base(x, z);
    h = flatten(h, Math.hypot(x - den.x, z - den.z), den.radius, 8, denH);
    h = flatten(h, Math.hypot(x - arena.x, z - arena.z), arena.radius + 2, 10, arenaH);
    h = flatten(h, Math.hypot(x - gate.x, z - gate.z), gate.radius, 8, arenaH);

    const dp = Math.hypot(x - pond.x, z - pond.z);
    h = flatten(h, dp, pond.radius, 9, shoreH);
    if (dp < pond.radius) {
      const t = 1 - dp / pond.radius;
      h = shoreH - smoothstep(0, 0.75, t) * (pond.depth + 0.5);
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
