import type { EventBus } from '../core/events.ts';
import { angleDelta } from '../core/math.ts';
import { TUNING } from '../data/tuning.ts';
import { isBehind, lowHealthMultiplier, mitigate } from '../logic/damage.ts';
import type { Actor } from './actor.ts';
import type { GameEvents } from './gameEvents.ts';

export interface HitOptions {
  /** Raw damage before the target's defense. */
  damage: number;
  knockback: number;
  stun?: number;
  slow?: { pct: number; duration: number };
  bleed?: { dps: number; duration: number };
  lowHealthBonus?: { threshold: number; pct: number } | null;
  /** Extra damage (0.75 = +75%) when the target has its back to the attacker. */
  behindBonus?: number;
}

const BLEED_TICK = 0.5;

/** Hit detection and damage. Works on any Actors, so the player, enemies and bosses share it. */
export class Combat {
  private actors: () => Actor[];
  private events: EventBus<GameEvents>;
  private clock: { time: number };

  constructor(actors: () => Actor[], events: EventBus<GameEvents>, clock: { time: number }) {
    this.actors = actors;
    this.events = events;
    this.clock = clock;
  }

  /** Hostile, living actors within `reach` (beyond both body radii) and inside the arc in front. */
  targetsInArc(attacker: Actor, reach: number, arcDeg: number): Actor[] {
    const half = (arcDeg * Math.PI) / 360;
    return this.actors().filter((t) => {
      if (t === attacker || !t.alive || t.team === attacker.team) return false;
      const dx = t.pos.x - attacker.pos.x;
      const dz = t.pos.z - attacker.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + attacker.radius + t.radius) return false;
      if (Math.abs(t.pos.y - attacker.pos.y) > 3 + attacker.model.height) return false;
      // A target standing on top of the attacker is always "in front".
      if (dist < attacker.radius + t.radius * 0.5) return true;
      return Math.abs(angleDelta(attacker.yaw, Math.atan2(dx, dz))) <= half;
    });
  }

  hitArc(attacker: Actor, reach: number, arcDeg: number, opts: HitOptions): Actor[] {
    const hit = this.targetsInArc(attacker, reach, arcDeg);
    for (const t of hit) this.damage(attacker, t, opts);
    return hit;
  }

  hitRadius(attacker: Actor, x: number, z: number, radius: number, opts: HitOptions): Actor[] {
    const hit = this.actors().filter(
      (t) => t !== attacker && t.alive && t.team !== attacker.team && Math.hypot(t.pos.x - x, t.pos.z - z) <= radius + t.radius,
    );
    for (const t of hit) this.damage(attacker, t, opts, x, z);
    return hit;
  }

  /** Applies one hit. Returns the damage dealt (0 if dodged). */
  damage(attacker: Actor, target: Actor, opts: HitOptions, fromX = attacker.pos.x, fromZ = attacker.pos.z): number {
    if (!target.alive) return 0;
    if (target.invuln > 0) {
      this.events.emit('dodged', { target });
      return 0;
    }
    const ambush = !!opts.behindBonus && isBehind(target.yaw, target.pos.x, target.pos.z, fromX, fromZ);
    const bonus = lowHealthMultiplier(target.hp / target.stats.maxHealth, opts.lowHealthBonus ?? null) * (ambush ? 1 + (opts.behindBonus ?? 0) : 1);
    const amount = mitigate(opts.damage * bonus, target.stats.defense, TUNING.combat.defenseK);
    if (amount <= 0) return 0;

    let dx = target.pos.x - fromX;
    let dz = target.pos.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      dx = Math.sin(attacker.yaw);
      dz = Math.cos(attacker.yaw);
    } else {
      dx /= d;
      dz /= d;
    }
    const kb = opts.knockback * (target.heavy ? 0.2 : 1);
    target.knock.x += dx * kb;
    target.knock.z += dz * kb;

    if (opts.stun) target.applyStun(opts.stun);
    if (opts.slow) target.applySlow(opts.slow.pct, opts.slow.duration);
    if (opts.bleed) target.bleeds.push({ dps: opts.bleed.dps, time: opts.bleed.duration, acc: 0 });

    this.applyRaw(attacker, target, amount, 'hit', ambush);
    return amount;
  }

  private applyRaw(attacker: Actor | null, target: Actor, amount: number, kind: 'hit' | 'bleed', ambush = false): void {
    target.hp = Math.max(0, target.hp - amount);
    target.lastHitTime = this.clock.time;
    target.anim.hitFlash = 1;
    this.events.emit('damage', { target, attacker, amount, kind, ambush });
    if (target.hp <= 0) {
      target.alive = false;
      target.deathTime = this.clock.time;
      target.bleeds = [];
      this.events.emit('death', { actor: target, killer: attacker });
    }
  }

  /** Bleed damage ticks (ignores defense). */
  update(dt: number, bleedSource: Actor | null): void {
    for (const a of this.actors()) {
      if (!a.alive || a.bleeds.length === 0) continue;
      for (const b of a.bleeds) {
        b.time -= dt;
        b.acc += dt;
        if (b.acc >= BLEED_TICK) {
          b.acc -= BLEED_TICK;
          this.applyRaw(bleedSource, a, Math.max(1, Math.round(b.dps * BLEED_TICK)), 'bleed');
          if (!a.alive) break;
        }
      }
      a.bleeds = a.bleeds.filter((b) => b.time > 0);
    }
  }
}
