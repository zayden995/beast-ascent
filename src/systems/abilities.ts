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

  /** The cast owns the actor's movement (mid-leap). */
  get leaping(): boolean {
    return this.cast?.def.effect.kind === 'leap';
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
    this.cast = { def, power, t: 0, hitsDone: 0, dirX: Math.sin(o.yaw), dirZ: Math.cos(o.yaw) };
    if (fx.kind === 'leap') {
      // Launch so that gravity brings the actor back down when the leap ends.
      o.vy = (TUNING.player.gravity * fx.duration) / 2;
      o.grounded = false;
    }
    return true;
  }

  cancel(): void {
    this.cast = null;
    this.owner.anim.attackT = -1;
    this.owner.anim.windupT = -1;
  }

  resetCooldowns(): void {
    for (const s of this.slots) s.cooldown = 0;
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

      if (c.hitsDone < hits && c.t >= nextHit) {
        c.hitsDone++;
        const reach = fx.range * size;
        this.fx.slash(o.pos, o.yaw, reach + o.radius, fx.arcDeg, o.model.height * 0.5, 0xffffff);
        this.combat.hitArc(o, reach, fx.arcDeg, {
          damage: o.stats.damage * fx.damageMult * c.power,
          knockback: fx.knockback,
          bleed: fx.bleed ? { dps: o.stats.damage * fx.bleed.dpsMult * c.power, duration: fx.bleed.duration } : undefined,
          lowHealthBonus,
        });
      }
      if (c.t >= fx.windup + (hits - 1) * interval + SWING - LEAD) this.finish();
    } else if (fx.kind === 'aoe') {
      o.anim.windupT = c.hitsDone === 0 ? Math.min(1, c.t / fx.windup) : -1;
      if (c.hitsDone === 0 && c.t >= fx.windup) {
        c.hitsDone = 1;
        this.fx.ring(o.pos, fx.radius, 0xffe9a8, 0.5);
        this.combat.hitRadius(o, o.pos.x, o.pos.z, fx.radius, {
          damage: o.stats.damage * fx.damageMult * c.power,
          knockback: fx.knockback,
          stun: fx.stun ? fx.stun * c.power : undefined,
          slow: fx.slow ? { pct: fx.slow.pct, duration: fx.slow.duration * c.power } : undefined,
          lowHealthBonus,
        });
      }
      if (c.hitsDone > 0) o.anim.attackT = Math.min(1, (c.t - fx.windup) / SWING);
      if (c.t >= fx.windup + SWING) this.finish();
    } else if (fx.kind === 'leap') {
      const speed = fx.distance / fx.duration;
      o.vx = c.dirX * speed;
      o.vz = c.dirZ * speed;
      o.anim.attackT = Math.min(1, c.t / fx.duration);
      if (c.t >= fx.duration) {
        o.vx = 0;
        o.vz = 0;
        const radius = fx.radius * Math.max(0.75, size);
        this.fx.ring(o.pos, radius, 0xffffff, 0.4);
        this.combat.hitRadius(o, o.pos.x, o.pos.z, radius, {
          damage: o.stats.damage * fx.damageMult * c.power,
          knockback: fx.knockback,
          stun: fx.stun ? fx.stun * c.power : undefined,
          lowHealthBonus,
        });
        this.finish();
      }
    }
  }

  private finish(): void {
    this.cast = null;
    this.owner.anim.attackT = -1;
    this.owner.anim.windupT = -1;
    this.owner.anim.attackPower = 1;
  }
}
