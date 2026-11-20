// Winter's mountain: a trail that spirals up to a flat peak, with cliffs between its laps. Pure functions, no three.js.
import { lerp, smoothstep } from '../core/math.ts';
import type { MountainDef } from '../core/layout.ts';

const TWO_PI = Math.PI * 2;

/** Where a point lies on the mountain: which lap's shelf (-1 the foothill outside the first lap, `laps` the peak) and how far along the trail that is (0 at the foot, 1 at the peak). */
export interface MountainSpot {
  shelf: number;
  along: number;
}

/** The radius of the mountain's outer edge, beyond which it is ordinary land. */
export function mountainOuterRadius(m: MountainDef): number {
  return m.footRadius + m.trailWidth / 2;
}

/** The whole spiral, in radians: `laps` turns. */
function span(m: MountainDef): number {
  return m.laps * TWO_PI;
}

/** The radius of the trail's middle after turning `phi` radians from its start: it ends with its inner edge at the peak's edge. */
function trailRadius(m: MountainDef, phi: number): number {
  const end = m.topRadius + m.trailWidth / 2;
  return m.footRadius - ((m.footRadius - end) * phi) / span(m);
}

/** The lowest cliff the mountain has once the trail has climbed above it: lower than this, an animal could walk up it. */
const MIN_CLIFF = 6;

/** The trail's height (above the foot) after turning `phi` radians. */
function trailHeight(m: MountainDef, phi: number): number {
  // The last stretch is a flat landing level with the peak, so the trail arrives on the peak without a step.
  return m.top * Math.min(1, phi / (span(m) - LANDING));
}

/** The trail's last stretch (radians of turn) is level with the peak. */
const LANDING = 0.35;

/** The angle of a point round the peak, measured clockwise (seen from above, north up) from the trail's start, 0 to 2π. */
function turnOf(m: MountainDef, dx: number, dz: number): number {
  // North is -z, so with x east and z south, atan2(dz, dx) already grows clockwise as seen from above.
  const a = Math.atan2(dz, dx) - (m.startDeg * Math.PI) / 180;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

/** The outer edge of a lap's shelf at a given turn (the trail's middle plus half its width). */
function shelfEdge(m: MountainDef, phi: number): number {
  return trailRadius(m, phi) + m.trailWidth / 2;
}

/**
 * Which shelf a point is on, and the turn of that shelf there. Shelf k holds the k-th lap of the trail; it runs from its outer
 * edge in to the outer edge of the next lap, where the ground rises as a cliff. Null outside the mountain.
 */
function locate(m: MountainDef, x: number, z: number): { shelf: number; phi: number; d: number; theta: number } | null {
  const dx = x - m.x;
  const dz = z - m.z;
  const d = Math.hypot(dx, dz);
  if (d > mountainOuterRadius(m)) return null;
  const theta = turnOf(m, dx, dz);
  if (d <= m.topRadius) return { shelf: m.laps, phi: span(m), d, theta };
  let shelf = -1;
  for (let k = 0; k < m.laps; k++) {
    if (d <= shelfEdge(m, theta + k * TWO_PI)) shelf = k;
  }
  return { shelf, phi: shelf < 0 ? theta : theta + shelf * TWO_PI, d, theta };
}

/** Where a point lies on the mountain, or null off it. */
export function mountainSpot(m: MountainDef, x: number, z: number): MountainSpot | null {
  const at = locate(m, x, z);
  if (!at) return null;
  return { shelf: at.shelf, along: Math.min(1, at.phi / span(m)) };
}

/**
 * The height of the mountain at a point, above the land at its foot, or null off the mountain. Each lap is a shelf that climbs
 * gently with the trail; between a shelf and the next lap inward the ground rises as a cliff `cliffWidth` wide; the peak is flat
 * at `top`. Outside the first lap a foothill rises to a share of the first shelf's height and stops at a cliff below it.
 */
export function mountainHeight(m: MountainDef, x: number, z: number): number | null {
  const at = locate(m, x, z);
  if (!at) return null;
  const { shelf, phi, d, theta } = at;
  if (shelf === m.laps) return m.top;
  if (shelf < 0) {
    // The foothill: from the land at the outer edge up to `apronShare` of the first shelf, then a cliff up to the shelf.
    const edge = shelfEdge(m, theta);
    const shelfTop = trailHeight(m, theta);
    const outer = mountainOuterRadius(m);
    // The foothill always stays a real cliff below the shelf, except at the trail's very start, where the shelf is still low.
    // It never rises more steeply than 0.8 (a walkable slope), so it is never a staircase up to the shelf.
    const ramp = Math.max(0, outer - edge - m.cliffWidth);
    const apronTop = Math.max(0, Math.min(shelfTop * m.apronShare, shelfTop - MIN_CLIFF, ramp * 0.8));
    if (d < edge + m.cliffWidth) return lerp(shelfTop, apronTop, smoothstep(edge, edge + m.cliffWidth, d));
    if (outer <= edge + m.cliffWidth) return 0;
    return apronTop * (1 - smoothstep(edge + m.cliffWidth, outer, d));
  }
  const here = trailHeight(m, phi);
  // The next lap inward, or the peak.
  const innerEdge = shelf + 1 < m.laps ? shelfEdge(m, phi + TWO_PI) : m.topRadius;
  const innerTop = shelf + 1 < m.laps ? trailHeight(m, phi + TWO_PI) : m.top;
  if (d < innerEdge + m.cliffWidth) return lerp(innerTop, here, smoothstep(innerEdge, innerEdge + m.cliffWidth, d));
  return here;
}

/** A point on the middle of the trail, `along` (0 at the foot, 1 at the peak), with its height above the foot. */
export function trailPoint(m: MountainDef, along: number): { x: number; z: number; y: number } {
  const phi = Math.max(0, Math.min(1, along)) * span(m);
  const a = (m.startDeg * Math.PI) / 180 + phi;
  const r = trailRadius(m, phi);
  return { x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r, y: trailHeight(m, phi) };
}

/** How far a point is from the middle of the trail on its own shelf, or null off the shelves (the foothill, the peak, the land). */
export function trailDistance(m: MountainDef, x: number, z: number): number | null {
  const at = locate(m, x, z);
  if (!at || at.shelf < 0 || at.shelf === m.laps) return null;
  return Math.abs(at.d - trailRadius(m, at.phi));
}

/** True on the trail itself (within half its width, plus `margin`, of its middle), where nothing is placed. */
export function onTrail(m: MountainDef, x: number, z: number, margin = 0): boolean {
  const d = trailDistance(m, x, z);
  return d !== null && d < m.trailWidth / 2 + margin;
}
