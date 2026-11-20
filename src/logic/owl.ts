// The snowy owl (Winter): what it goes after. Pure logic, no three.js.
import type { FlierBehavior } from '../core/types.ts';

/** An animal the owl might go after. */
export interface OwlCandidate {
  id: number;
  x: number;
  y: number;
  z: number;
  flying: boolean;
  /** An injured pet lying where it fell: never chosen. */
  untargetable: boolean;
}

/**
 * Who the owl goes after, and how: an animal flying within `huntRange` of the owl (at any height) is hunted, the nearest first;
 * otherwise, once the owl is ready again (`pesterReady`), an animal on the ground within `pesterRange` of its tree is pestered
 * (one swoop and a peck). It never goes after anything beyond `homeRange` of its tree. Null: nothing to do.
 */
export function owlTarget(
  owl: { x: number; y: number; z: number; homeX: number; homeZ: number },
  candidates: readonly OwlCandidate[],
  b: FlierBehavior,
  pesterReady: boolean,
): { id: number; mode: 'hunt' | 'pester' } | null {
  const fromHome = (c: OwlCandidate) => Math.hypot(c.x - owl.homeX, c.z - owl.homeZ);
  const usable = candidates.filter((c) => !c.untargetable && fromHome(c) <= b.homeRange);
  let best: OwlCandidate | null = null;
  let bestD = Infinity;
  for (const c of usable) {
    if (!c.flying) continue;
    const d = Math.hypot(c.x - owl.x, c.y - owl.y, c.z - owl.z);
    if (d <= b.huntRange && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  if (best) return { id: best.id, mode: 'hunt' };
  if (!pesterReady) return null;
  for (const c of usable) {
    if (c.flying) continue;
    const d = fromHome(c);
    if (d <= b.pesterRange && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best ? { id: best.id, mode: 'pester' } : null;
}
