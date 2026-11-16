// Rivers: a winding channel of flowing water. Pure maths, no three.js, so the rules can be unit-tested.

/** One point on a river's course: where it is, how wide the water is there and how deep the middle is. */
export interface RiverPoint {
  x: number;
  z: number;
  /** Width of the water from bank to bank, in metres. */
  width: number;
  /** Depth of the middle of the channel below the surface, in metres. */
  depth: number;
}

/** A river as it is written in a biome's layout. It flows from its first point to its last. */
export interface RiverDef {
  id: string;
  points: RiverPoint[];
  /** Speed of the water in the middle of the channel, in m/s. */
  current: number;
  /** Height of the water surface. Left out: the biome's usual water level. */
  surfaceY?: number;
}

/** A river made ready for questions: its course smoothed into many short straight pieces. */
export interface River {
  id: string;
  current: number;
  surfaceY: number;
  /** True for water that lies on raised ground (a stream on a hill): the terrain carves it after the hill is built. */
  raised: boolean;
  points: RiverPoint[];
  /** Distance along the river to each point, in metres. */
  along: number[];
  length: number;
  /** A box around the river, wide enough for every question asked with a margin up to `boundsMargin`. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** How far outside its banks a river can still matter (bank shaping, "near water", drinking). */
const BOUNDS_MARGIN = 34;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

/**
 * Smooths a river's few hand-placed points into a curve of short pieces (about `step` metres each), so that
 * the water, the channel in the ground and the current all follow the same bends.
 */
export function buildRiver(def: RiverDef, waterY: number, step = 1.5): River {
  const src = def.points;
  if (src.length < 2) throw new Error(`River ${def.id} needs at least two points`);
  const points: RiverPoint[] = [];
  for (let i = 0; i < src.length - 1; i++) {
    const p0 = src[Math.max(0, i - 1)];
    const p1 = src[i];
    const p2 = src[i + 1];
    const p3 = src[Math.min(src.length - 1, i + 2)];
    const pieces = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < pieces; k++) {
      const t = k / pieces;
      points.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
        width: p1.width + (p2.width - p1.width) * t,
        depth: p1.depth + (p2.depth - p1.depth) * t,
      });
    }
  }
  points.push({ ...src[src.length - 1] });

  const along = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const reach = Math.max(...points.map((p) => p.width / 2)) + BOUNDS_MARGIN;
  const surfaceY = def.surfaceY ?? waterY;
  return {
    id: def.id,
    current: def.current,
    surfaceY,
    raised: def.surfaceY !== undefined && def.surfaceY !== waterY,
    points,
    along,
    length: along[along.length - 1],
    minX: Math.min(...points.map((p) => p.x)) - reach,
    maxX: Math.max(...points.map((p) => p.x)) + reach,
    minZ: Math.min(...points.map((p) => p.z)) - reach,
    maxZ: Math.max(...points.map((p) => p.z)) + reach,
  };
}

/** Where a point is compared with a river: the nearest spot on its centreline and what the river is like there. */
export interface RiverSample {
  river: River;
  /** Distance from the centreline, in metres. */
  dist: number;
  /** Half the width of the water at the nearest spot. */
  halfWidth: number;
  /** Depth of the middle of the channel at the nearest spot. */
  depth: number;
  /** Metres from the river's source to the nearest spot. */
  along: number;
  /** The nearest spot on the centreline. */
  nearX: number;
  nearZ: number;
  /** The way the water flows there (a unit vector). */
  dirX: number;
  dirZ: number;
  /** True past either end of the river: upstream of its source or downstream of its last point. */
  beyond: boolean;
}

/** The nearest spot on one river's centreline, or null if the point is too far from the river to matter. */
export function sampleRiver(river: River, x: number, z: number): RiverSample | null {
  if (x < river.minX || x > river.maxX || z < river.minZ || z > river.maxZ) return null;
  const pts = river.points;
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  let beyond = false;
  const lastPiece = pts.length - 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const len2 = sx * sx + sz * sz;
    const raw = len2 > 1e-12 ? ((x - a.x) * sx + (z - a.z) * sz) / len2 : 0;
    const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    const dx = x - (a.x + sx * t);
    const dz = z - (a.z + sz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      bi = i;
      bt = t;
      beyond = (i === 0 && raw < 0) || (i === lastPiece && raw > 1);
    }
  }
  const a = pts[bi];
  const b = pts[bi + 1];
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const len = Math.hypot(sx, sz) || 1;
  return {
    river,
    dist: Math.sqrt(best),
    halfWidth: (a.width + (b.width - a.width) * bt) / 2,
    depth: a.depth + (b.depth - a.depth) * bt,
    along: river.along[bi] + len * bt,
    nearX: a.x + sx * bt,
    nearZ: a.z + sz * bt,
    dirX: sx / len,
    dirZ: sz / len,
    beyond,
  };
}

/**
 * The river a point lies in (between its banks; the bank line itself counts), or null on dry land. A river
 * is cut off square at both ends: there is no water past its last point (where a stream goes over a cliff,
 * the water ends at the lip).
 */
export function riverAt(rivers: readonly River[], x: number, z: number): RiverSample | null {
  for (const river of rivers) {
    const s = sampleRiver(river, x, z);
    if (s && !s.beyond && s.dist <= s.halfWidth) return s;
  }
  return null;
}

/** True within `margin` metres of the bank of any river (or in it). */
export function nearRiver(rivers: readonly River[], x: number, z: number, margin: number): boolean {
  for (const river of rivers) {
    const s = sampleRiver(river, x, z);
    if (s && s.dist < s.halfWidth + margin) return true;
  }
  return false;
}

/** How hard the current pushes in water this deep, compared with deep water: a paddling animal is barely moved. */
export function depthGrip(waterDepth: number, fullDepth: number): number {
  if (waterDepth <= 0) return 0;
  return Math.min(1, 0.25 + 0.75 * (waterDepth / fullDepth));
}

/**
 * The speed and direction the water carries an animal at a point: fastest in the middle of the channel,
 * nothing at the banks, and nothing at all on dry land. `x` and `z` of the result are in m/s.
 */
export function currentAt(rivers: readonly River[], x: number, z: number): { x: number; z: number } {
  const s = riverAt(rivers, x, z);
  if (!s || s.river.current <= 0) return { x: 0, z: 0 };
  const across = s.dist / s.halfWidth;
  const speed = s.river.current * (1 - across * across);
  return { x: s.dirX * speed, z: s.dirZ * speed };
}

/**
 * Where an animal stands to drink from a river: on dry ground just outside the nearest bank (the side it is
 * on), facing the water. Null if no bank is within `reach` metres. `distance` is how far away that bank is.
 */
export function riverBankPoint(
  rivers: readonly River[],
  x: number,
  z: number,
  reach: number,
  standOff: number,
): { x: number; z: number; yaw: number; distance: number } | null {
  let best: RiverSample | null = null;
  let bestDistance = Infinity;
  for (const river of rivers) {
    const s = sampleRiver(river, x, z);
    if (!s) continue;
    const d = s.dist - s.halfWidth;
    if (d < bestDistance) {
      bestDistance = d;
      best = s;
    }
  }
  if (!best || bestDistance > reach) return null;
  let nx = x - best.nearX;
  let nz = z - best.nearZ;
  const len = Math.hypot(nx, nz);
  if (len < 1e-6) {
    // Standing on the centreline: pick the bank to the right of the flow.
    nx = best.dirZ;
    nz = -best.dirX;
  } else {
    nx /= len;
    nz /= len;
  }
  const r = best.halfWidth + standOff;
  const sx = best.nearX + nx * r;
  const sz = best.nearZ + nz * r;
  return { x: sx, z: sz, yaw: Math.atan2(best.nearX - sx, best.nearZ - sz), distance: bestDistance };
}
