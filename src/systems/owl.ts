// The snowy owl's flying brain (Winter): it perches in a pine, hunts an Eagle in the air, and pesters an animal on the ground.
import { owlTarget } from '../logic/owl.ts';
import type { OwlCandidate } from '../logic/owl.ts';
import { integrate } from './actor.ts';
import type { Actor } from './actor.ts';
import type { AiContext, EnemyActor } from './ai.ts';

type OwlPhase = 'perch' | 'return' | 'chase' | 'swoop' | 'climb';

/** What an owl remembers between steps. */
interface OwlMind {
  phase: OwlPhase;
  target: Actor | null;
  mode: 'hunt' | 'pester';
  timer: number;
  /** Seconds before it may pester again. */
  pesterIn: number;
  perch: { x: number; y: number; z: number } | null;
}

const minds = new WeakMap<EnemyActor, OwlMind>();

/** How high above the ground an owl keeps when it swoops on an animal there (so it does not land). */
const LOWEST = 0.7;

/** Where an owl perches: the top of the pine nearest its home, or a hover above the ground there if no tree is near. */
function perchFor(e: EnemyActor, ctx: AiContext, height: number): { x: number; y: number; z: number } {
  let best: { x: number; z: number; y: number } | null = null;
  let bestD = 18;
  for (const t of ctx.world.treeSpots) {
    const d = Math.hypot(t.x - e.homeX, t.z - e.homeZ);
    if (d < bestD) {
      bestD = d;
      // The top of a Winter tree is about 6.8 m up at size 1.
      best = { x: t.x, z: t.z, y: t.y + 6.9 * t.tall };
    }
  }
  return best ?? { x: e.homeX, z: e.homeZ, y: ctx.world.heightAt(e.homeX, e.homeZ) + height };
}

/** Sets the owl flying toward a point at a speed (it slows down as it arrives). */
function flyToward(e: EnemyActor, x: number, y: number, z: number, speed: number): number {
  const dx = x - e.pos.x;
  const dy = y - e.pos.y;
  const dz = z - e.pos.z;
  const d = Math.hypot(dx, dy, dz);
  const v = d < 0.05 ? 0 : Math.min(speed, d * 3) / d;
  e.vx = dx * v;
  e.vz = dz * v;
  e.vy = dy * v;
  if (Math.hypot(dx, dz) > 0.2) e.yaw = Math.atan2(dx, dz);
  return d;
}

export function updateOwl(e: EnemyActor, dt: number, ctx: AiContext): void {
  const b = e.def.behavior.flier!;
  let mind = minds.get(e);
  if (!mind) {
    mind = { phase: 'return', target: null, mode: 'hunt', timer: 0, pesterIn: 0, perch: null };
    minds.set(e, mind);
  }
  if (!mind.perch) {
    // When it first wakes, it is already up on its perch (it was placed on the ground like every animal).
    mind.perch = perchFor(e, ctx, b.perchHeight);
    e.pos.set(mind.perch.x, mind.perch.y, mind.perch.z);
    mind.phase = 'perch';
  }
  const perch = mind.perch;
  e.flying = true;
  mind.pesterIn = Math.max(0, mind.pesterIn - dt);

  const actors = [ctx.player, ctx.pet].filter((a): a is Actor => !!a && a.alive);
  const asCandidate = (a: Actor, id: number): OwlCandidate => ({ id, x: a.pos.x, y: a.pos.y, z: a.pos.z, flying: a.flying, untargetable: a.untargetable });
  const valid = (a: Actor | null) => !!a && a.alive && !a.untargetable && Math.hypot(a.pos.x - e.homeX, a.pos.z - e.homeZ) <= b.homeRange;

  if (e.stun > 0) {
    e.vx = e.vz = 0;
    e.vy = -2;
  } else {
    if (mind.phase === 'perch' || mind.phase === 'return') {
      const pick = owlTarget({ x: e.pos.x, y: e.pos.y, z: e.pos.z, homeX: e.homeX, homeZ: e.homeZ }, actors.map(asCandidate), b, mind.pesterIn <= 0);
      if (pick) {
        mind.target = actors[pick.id];
        mind.mode = pick.mode;
        mind.phase = 'chase';
      }
    }
    const t = mind.target;
    switch (mind.phase) {
      case 'perch':
        flyToward(e, perch.x, perch.y, perch.z, b.flySpeed);
        e.state = 'idle';
        break;
      case 'return':
        e.state = 'return';
        if (flyToward(e, perch.x, perch.y, perch.z, b.flySpeed) < 0.6) mind.phase = 'perch';
        break;
      case 'chase': {
        if (!valid(t)) {
          mind.phase = 'return';
          break;
        }
        e.state = 'chase';
        // Come in above it, then drop on it.
        const above = t!.pos.y + 3;
        flyToward(e, t!.pos.x, above, t!.pos.z, b.flySpeed);
        if (Math.hypot(t!.pos.x - e.pos.x, t!.pos.z - e.pos.z) < 6) {
          mind.phase = 'swoop';
          mind.timer = 1.4;
          e.anim.windupT = 0;
        }
        break;
      }
      case 'swoop': {
        if (!valid(t)) {
          mind.phase = 'return';
          break;
        }
        e.state = 'charging';
        mind.timer -= dt;
        const ground = ctx.world.heightAt(t!.pos.x, t!.pos.z);
        const aimY = Math.max(ground + LOWEST, t!.pos.y + t!.model.height * 0.5);
        const d = flyToward(e, t!.pos.x, aimY, t!.pos.z, b.swoopSpeed);
        if (d < e.radius + t!.radius + 0.9) {
          ctx.combat.damage(e, t!, { damage: e.stats.damage, knockback: 2 });
          e.anim.attackT = 0;
          mind.phase = 'climb';
          mind.timer = 1.1;
          if (mind.mode === 'pester') mind.pesterIn = b.pesterCooldown;
        } else if (mind.timer <= 0) {
          mind.phase = 'climb';
          mind.timer = 0.8;
        }
        break;
      }
      case 'climb': {
        e.state = 'recover';
        mind.timer -= dt;
        // Up and away from what it struck, then round again (a hunt) or home (a peck).
        const away = t ? Math.atan2(e.pos.x - t.pos.x, e.pos.z - t.pos.z) : e.yaw;
        e.vx = Math.sin(away) * b.flySpeed * 0.8;
        e.vz = Math.cos(away) * b.flySpeed * 0.8;
        e.vy = 4;
        e.yaw = away;
        if (mind.timer <= 0) mind.phase = mind.mode === 'hunt' && valid(t) && t!.flying ? 'chase' : 'return';
        break;
      }
    }
  }
  integrate(e, dt, ctx.world);
  // An owl never lands: it keeps a little above the ground.
  const floor = ctx.world.heightAt(e.pos.x, e.pos.z) + LOWEST * 0.6;
  if (!e.flying || e.pos.y < floor) {
    e.pos.y = Math.max(e.pos.y, floor);
    e.flying = true;
    e.grounded = false;
  }
  e.anim.speed = Math.hypot(e.vx, e.vz);
}
