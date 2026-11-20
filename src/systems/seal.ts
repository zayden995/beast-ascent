// A leopard seal's brain (Winter): it stays in its hole in the ice and bites the player or the pet while they swim in it.
import { integrate } from './actor.ts';
import type { Actor } from './actor.ts';
import type { AiContext, EnemyActor } from './ai.ts';

/** Seconds between bites, and how close (beyond both bodies) it must be to bite. */
const BITE_EVERY = 1.3;
const BITE_REACH = 0.9;

const biteIn = new WeakMap<EnemyActor, number>();

/** The animal it goes for: the player or the pet, swimming in a hole in the ice within reach of the seal's hole, the nearer first. */
function preyOf(e: EnemyActor, ctx: AiContext): Actor | null {
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

export function updateSeal(e: EnemyActor, dt: number, ctx: AiContext): void {
  const prey = e.stun > 0 ? null : preyOf(e, ctx);
  let wait = (biteIn.get(e) ?? 0.6) - dt;
  if (prey) {
    e.state = 'chase';
    const dx = prey.pos.x - e.pos.x;
    const dz = prey.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    e.yaw = Math.atan2(dx, dz);
    const reach = e.radius + prey.radius + BITE_REACH;
    if (d > reach * 0.8) {
      e.vx = (dx / d) * e.stats.moveSpeed;
      e.vz = (dz / d) * e.stats.moveSpeed;
    } else {
      e.vx = e.vz = 0;
    }
    if (d <= reach && wait <= 0) {
      ctx.combat.damage(e, prey, { damage: e.stats.damage, knockback: 1.5 });
      e.anim.attackT = 0;
      wait = BITE_EVERY;
    }
  } else {
    e.state = 'idle';
    e.vx = e.vz = 0;
  }
  biteIn.set(e, wait);
  // It never leaves the water of the hole.
  const nx = e.pos.x + e.vx * dt;
  const nz = e.pos.z + e.vz * dt;
  if (!ctx.world.iceHoleAt(nx, nz)) e.vx = e.vz = 0;
  integrate(e, dt, ctx.world);
  e.anim.speed = Math.hypot(e.vx, e.vz);
}
