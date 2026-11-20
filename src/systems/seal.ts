// A leopard seal's brain (Winter). It lives in a hole in the ice: it bites the player or the pet while they swim in its hole, and
// when one of them is on the ice within 5 m it hops out and chases for about 5 m (or 3 s), then goes back and dives in (the user's
// playtest, 2026-11-21). The rules are in `logic/seal.ts`; when it comes and goes is `Game.updateSeals`.
import { integrate } from './actor.ts';
import type { Actor } from './actor.ts';
import type { AiContext, EnemyActor } from './ai.ts';
import { TUNING } from '../data/tuning.ts';
import { newSealMind, sealGoesOut, sealTurnsBack } from '../logic/seal.ts';
import type { SealMind } from '../logic/seal.ts';

/** Seconds between bites, and how close (beyond both bodies) it must be to bite. */
const BITE_EVERY = 1.3;
const BITE_REACH = 0.9;

const biteIn = new WeakMap<EnemyActor, number>();
const pool = new WeakSet<EnemyActor>();

/** The seal's state of mind, kept on the animal (the game and the browser test read it). */
export function sealMind(e: EnemyActor): SealMind {
  if (!e.sealMind) e.sealMind = newSealMind();
  return e.sealMind;
}

/** Marks a seal as one of the mammoth's pool: it stays for the fight and chases again after resting. */
export function makePoolSeal(e: EnemyActor): void {
  pool.add(e);
}

export function isPoolSeal(e: EnemyActor): boolean {
  return pool.has(e);
}

/** True while the seal is back in the water of a hole. */
export function sealInWater(e: EnemyActor, ctx: Pick<AiContext, 'world'>): boolean {
  return e.swimming && ctx.world.iceHoleAt(e.pos.x, e.pos.z);
}

/** The player or the pet swimming in a hole in the ice within reach of the seal, the nearer first. */
function swimmerNear(e: EnemyActor, ctx: AiContext): Actor | null {
  let best: Actor | null = null;
  let bestD = 6;
  for (const a of [ctx.player, ctx.pet]) {
    if (!a || !a.alive || a.untargetable || !a.swimming || !ctx.world.iceHoleAt(a.pos.x, a.pos.z)) continue;
    const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** The player or the pet out of the water (on the ice or the shore, not flying) within `reach` of the seal, the nearer first. */
function walkerNear(e: EnemyActor, ctx: AiContext, reach: number): { a: Actor; d: number } | null {
  let best: { a: Actor; d: number } | null = null;
  for (const a of [ctx.player, ctx.pet]) {
    if (!a || !a.alive || a.untargetable || a.flying || a.swimming) continue;
    const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
    if (d <= reach && (!best || d < best.d)) best = { a, d };
  }
  return best;
}

/** Heads for `prey` at `speed` and bites it when close enough. */
function goFor(e: EnemyActor, prey: Actor, speed: number, wait: number, ctx: AiContext): number {
  const dx = prey.pos.x - e.pos.x;
  const dz = prey.pos.z - e.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  e.yaw = Math.atan2(dx, dz);
  const reach = e.radius + prey.radius + BITE_REACH;
  if (d > reach * 0.8) {
    e.vx = (dx / d) * speed;
    e.vz = (dz / d) * speed;
  } else {
    e.vx = e.vz = 0;
  }
  if (d <= reach && wait <= 0) {
    ctx.combat.damage(e, prey, { damage: e.stats.damage, knockback: 1.5 });
    e.anim.attackT = 0;
    return BITE_EVERY;
  }
  return wait;
}

export function updateSeal(e: EnemyActor, dt: number, ctx: AiContext): void {
  const T = TUNING.seal;
  const mind = sealMind(e);
  if (mind.rest > 0) mind.rest -= dt;
  let wait = (biteIn.get(e) ?? 0.6) - dt;
  e.vx = e.vz = 0;

  if (e.stun > 0) {
    // Stunned: it does nothing (out on the ice, the clock of its chase still runs).
    if (mind.mode === 'out') mind.outT += dt;
  } else if (mind.mode === 'water') {
    const swimmer = swimmerNear(e, ctx);
    const walker = swimmer ? null : walkerNear(e, ctx, T.chaseMetres);
    if (swimmer) {
      e.state = 'chase';
      wait = goFor(e, swimmer, e.stats.moveSpeed, wait, ctx);
    } else if (sealGoesOut(mind, walker ? walker.d : null, isPoolSeal(e), T)) {
      // It hops out after the animal on the ice.
      mind.mode = 'out';
      mind.outT = 0;
      mind.exitX = e.pos.x;
      mind.exitZ = e.pos.z;
      mind.outings++;
      e.state = 'chase';
    } else {
      e.state = 'idle';
    }
    // In the water it never leaves its hole (only a chase takes it out).
    if (mind.mode === 'water') {
      if (!ctx.world.iceHoleAt(e.pos.x + e.vx * dt, e.pos.z + e.vz * dt)) e.vx = e.vz = 0;
    }
  } else if (mind.mode === 'out') {
    mind.outT += dt;
    const walker = walkerNear(e, ctx, T.chaseMetres + 4);
    const fromExit = Math.hypot(e.pos.x - mind.exitX, e.pos.z - mind.exitZ);
    if (sealTurnsBack(mind, fromExit, !walker, T)) {
      mind.mode = 'back';
    } else if (walker) {
      e.state = 'chase';
      wait = goFor(e, walker.a, T.landSpeed, wait, ctx);
    }
  }
  // The clock of time out of the water runs on the way back too (the game lets a seal held up out there slip away).
  if (mind.mode === 'back') mind.outT += dt;
  if (mind.mode === 'back' && e.stun <= 0) {
    // Back to the hole it came out of, and in.
    e.state = 'return';
    const dx = mind.exitX - e.pos.x;
    const dz = mind.exitZ - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      e.yaw = Math.atan2(dx, dz);
      const v = Math.min(T.landSpeed, d / Math.max(dt, 1e-3));
      e.vx = (dx / d) * v;
      e.vz = (dz / d) * v;
    }
  }
  biteIn.set(e, wait);
  integrate(e, dt, ctx.world);
  if (mind.mode === 'back' && sealInWater(e, ctx)) {
    mind.mode = 'water';
    mind.rest = T.restSeconds;
  }
  e.anim.speed = Math.hypot(e.vx, e.vz);
}
