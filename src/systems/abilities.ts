import type { AbilityDef } from '../core/types.ts';
import { getAbility } from '../data/abilities.ts';
import { TUNING } from '../data/tuning.ts';
import { abilityPower } from '../logic/progression.ts';
import type { PassiveSummary } from '../logic/progression.ts';
import type { Actor } from './actor.ts';
import type { Combat } from './combat.ts';
import type { Fx } from './fx.ts';

export interface AbilitySlot {
  def: AbilityDef;
  cooldown: number;
}

interface Cast {
  def: AbilityDef;
  power: number;
  t: number;
  hitsDone: number;
  dirX: number;
  dirZ: number;
  /** How long a leap lasts (a dive from the air lasts as long as the fall). */
  dur: number;
  /** Leap: a dive from the air, with the damage bonus earned by the height it starts from. */
  dive: boolean;
  diveBonus: number;
  /** Charge: the animals already hit, so that each is hit once. */
  hitIds: Set<number>;
  /** The animal rolls over while it holds its target (the Death Roll). */
  spin: boolean;
}

const SWING = 0.3;
const LEAD = 0.1;

/**
 * Runs active abilities for one actor. Each ability is pure data (an effect kind plus numbers);
 * this class is the only place that knows how each effect kind plays out.
 */
export class AbilitySystem {
  /** Active abilities in key order (1, 2, 3). */
  slots: AbilitySlot[] = [];
  private owner: Actor;
  private combat: Combat;
  private fx: Fx;
  private getRank: (id: string) => number;
  private getPassives: () => PassiveSummary;
  private cast: Cast | null = null;

  constructor(owner: Actor, combat: Combat, fx: Fx, getRank: (id: string) => number, getPassives: () => PassiveSummary) {
    this.owner = owner;
    this.combat = combat;
    this.fx = fx;
    this.getRank = getRank;
    this.getPassives = getPassives;
  }

  setLoadout(abilityIds: string[]): void {
    this.slots = abilityIds
      .map(getAbility)
      .filter((d) => d.effect.kind !== 'passive')
      .slice(0, 3)
      .map((def) => ({ def, cooldown: 0 }));
  }

  get busy(): boolean {
    return this.cast !== null;
  }

  /** The cast owns the actor's movement (mid-leap, mid-charge). */
  get leaping(): boolean {
    const kind = this.cast?.def.effect.kind;
    return kind === 'leap' || kind === 'charge';
  }

  /** The actor cannot walk while this cast plays. */
  get rooted(): boolean {
    const fx = this.cast?.def.effect;
    if (!fx) return false;
    return fx.kind === 'aoe' || (fx.kind === 'melee' && (fx.selfRoot === true || this.cast!.t < fx.windup));
  }

  /** Why slot `i` cannot be used right now, or null if it can. */
  blockedReason(i: number): 'locked' | 'cooldown' | 'stamina' | 'busy' | null {
    const slot = this.slots[i];
    if (!slot || this.getRank(slot.def.id) <= 0) return 'locked';
    if (this.cast || !this.owner.alive || this.owner.stun > 0) return 'busy';
    if (slot.cooldown > 0) return 'cooldown';
    if (this.owner.stamina < slot.def.staminaCost) return 'stamina';
    return null;
  }

  use(i: number): boolean {
    if (this.blockedReason(i) !== null) return false;
    const slot = this.slots[i];
    const def = slot.def;
    const o = this.owner;
    const power = abilityPower(def, this.getRank(def.id));
    slot.cooldown = def.cooldown;
    o.stamina -= def.staminaCost;

    const fx = def.effect;
    if (fx.kind === 'buff') {
      o.addBuff(def.id, fx.mods.map((m) => ({ ...m, pct: m.pct !== undefined ? m.pct * power : undefined })), fx.duration);
      this.fx.ring(o.pos, 3.5, 0xfff2b0, 0.6);
      return true;
    }
    const cast: Cast = {
      def, power, t: 0, hitsDone: 0, dirX: Math.sin(o.yaw), dirZ: Math.cos(o.yaw), dur: 0, dive: false, diveBonus: 1,
      hitIds: new Set(), spin: fx.kind === 'melee' && !!fx.grab && (fx.hits ?? 1) > 1,
    };
    if (fx.kind === 'leap') {
      cast.dur = fx.duration;
      if (fx.dive && o.flying) {
        // A dive from the air: fall onto the target, harder from higher up.
        cast.dive = true;
        cast.dur = Math.max(fx.duration, Math.min(2, o.altitude / TUNING.flight.diveDrop));
        cast.diveBonus = 1 + Math.min(o.altitude, 20) * fx.dive.bonusPerMetre;
      } else {
        // Launch so that gravity brings the actor back down when the leap ends.
        o.vy = (TUNING.player.gravity * fx.duration) / 2;
        o.grounded = false;
      }
    }
    this.cast = cast;
    o.plowing = fx.kind === 'charge';
    return true;
  }

  cancel(): void {
    this.endCast();
    this.owner.anim.attackT = -1;
    this.owner.anim.windupT = -1;
  }

  resetCooldowns(): void {
    for (const s of this.slots) s.cooldown = 0;
  }

  /** Damage multiplier from standing in water (the Crocodile's Water Ambush). */
  private waterMult(): number {
    return this.owner.wet ? 1 + this.getPassives().waterDamagePct : 1;
  }

  update(dt: number): void {
    for (const s of this.slots) if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
    const c = this.cast;
    if (!c) return;
    const o = this.owner;
    if (!o.alive || o.stun > 0) {
      this.cancel();
      return;
    }
    c.t += dt;
    const fx = c.def.effect;
    const size = o.stats.size;
    const lowHealthBonus = this.getPassives().lowHealthBonus;
    const water = this.waterMult();
    o.anim.attackPower = 1.5;

    if (fx.kind === 'melee') {
      const hits = fx.hits ?? 1;
      const interval = fx.hitInterval ?? 0;
      const nextHit = fx.windup + c.hitsDone * interval;
      o.anim.windupT = c.hitsDone === 0 && c.t < fx.windup - LEAD ? c.t / Math.max(0.01, fx.windup - LEAD) : -1;
      // One swing animation per hit, starting slightly before the hit lands.
      const swingIndex = Math.min(hits - 1, Math.max(0, Math.floor((c.t - (fx.windup - LEAD)) / Math.max(interval, 1e-3))));
      const swingStart = fx.windup + swingIndex * interval - LEAD;
      o.anim.attackT = c.t >= fx.windup - LEAD ? Math.min(1, Math.max(0, (c.t - swingStart) / SWING)) : -1;
      // The Death Roll rolls the whole body over while it holds on.
      if (c.spin) o.anim.dodgeT = Math.min(1, Math.max(0, (c.t - fx.windup) / ((hits - 1) * interval + SWING)));

      if (c.hitsDone < hits && c.t >= nextHit) {
        c.hitsDone++;
        const reach = fx.range * size;
        this.fx.slash(o.pos, o.yaw, reach + o.radius, fx.arcDeg, o.model.height * 0.5, 0xffffff);
        this.combat.hitArc(o, reach, fx.arcDeg, {
          damage: o.stats.damage * fx.damageMult * c.power * water,
          knockback: fx.knockback,
          bleed: fx.bleed ? { dps: o.stats.damage * fx.bleed.dpsMult * c.power, duration: fx.bleed.duration } : undefined,
          lowHealthBonus,
          behindBonus: fx.behindBonus,
          // The first hit takes hold: the target cannot act while the rest of the roll lands.
          stun: c.hitsDone === 1 && fx.grab ? fx.grab : undefined,
        });
      }
      if (c.t >= fx.windup + (hits - 1) * interval + SWING - LEAD) this.finish();
    } else if (fx.kind === 'aoe') {
      o.anim.windupT = c.hitsDone === 0 ? Math.min(1, c.t / fx.windup) : -1;
      if (c.hitsDone === 0 && c.t >= fx.windup) {
        c.hitsDone = 1;
        this.fx.ring(o.pos, fx.radius, 0xffe9a8, 0.5);
        this.combat.hitRadius(o, o.pos.x, o.pos.z, fx.radius, {
          damage: o.stats.damage * fx.damageMult * c.power * water,
          knockback: fx.knockback,
          stun: fx.stun ? fx.stun * c.power : undefined,
          slow: fx.slow ? { pct: fx.slow.pct, duration: fx.slow.duration * c.power } : undefined,
          lowHealthBonus,
        });
      }
      if (c.hitsDone > 0) o.anim.attackT = Math.min(1, (c.t - fx.windup) / SWING);
      if (c.t >= fx.windup + SWING) this.finish();
    } else if (fx.kind === 'leap') {
      // A dive from the air takes as long as the fall, but still covers the same distance along the ground.
      const speed = fx.distance / c.dur;
      o.vx = c.dirX * speed;
      o.vz = c.dirZ * speed;
      o.anim.attackT = Math.min(1, c.t / c.dur);
      if (c.dive) o.vy = -TUNING.flight.diveDrop;
      // A dive ends the moment it reaches the ground (the move into the ground clears `flying`).
      const grounded = c.dive && !o.flying && c.t > 0.05;
      if (c.t >= c.dur || grounded) {
        o.vx = 0;
        o.vz = 0;
        const radius = fx.radius * Math.max(0.75, size);
        this.fx.ring(o.pos, radius, 0xffffff, 0.4);
        this.combat.hitRadius(o, o.pos.x, o.pos.z, radius, {
          damage: o.stats.damage * fx.damageMult * c.power * c.diveBonus * water,
          knockback: fx.knockback,
          stun: fx.stun ? fx.stun * c.power : undefined,
          lowHealthBonus,
        });
        // After the strike the bird pulls up and is flying again.
        if (c.dive) {
          o.flying = true;
          o.grounded = false;
          o.vy = 4;
        }
        this.finish();
      }
    } else if (fx.kind === 'charge') {
      const speed = fx.distance / fx.duration;
      o.vx = c.dirX * speed;
      o.vz = c.dirZ * speed;
      o.anim.attackT = Math.min(1, c.t / fx.duration);
      // Everything the animal runs into is hit, once each.
      const radius = fx.radius * Math.max(0.75, size);
      for (const t of this.combat.targetsInRadius(o, o.pos.x, o.pos.z, radius)) {
        if (c.hitIds.has(t.id)) continue;
        c.hitIds.add(t.id);
        this.combat.damage(o, t, {
          damage: o.stats.damage * fx.damageMult * c.power * water,
          knockback: fx.knockback,
          stun: fx.stun ? fx.stun * c.power : undefined,
          lowHealthBonus,
        }, o.pos.x, o.pos.z);
      }
      if (c.t >= fx.duration) {
        o.vx = 0;
        o.vz = 0;
        this.fx.ring(o.pos, radius, 0xffffff, 0.4);
        this.finish();
      }
    }
  }

  private endCast(): void {
    if (this.cast?.spin) this.owner.anim.dodgeT = -1;
    this.cast = null;
    this.owner.plowing = false;
  }

  private finish(): void {
    this.endCast();
    this.owner.anim.attackT = -1;
    this.owner.anim.windupT = -1;
    this.owner.anim.attackPower = 1;
  }
}
