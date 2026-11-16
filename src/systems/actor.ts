import * as THREE from 'three';
import { createAnimState } from '../animals/AnimalModel.ts';
import type { AnimalModel, AnimState } from '../animals/AnimalModel.ts';
import type { StatMod, Stats } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import { climbStep, slideStep } from '../logic/climb.ts';
import { depthGrip } from '../logic/river.ts';
import { computeStats } from '../logic/stats.ts';
import type { StatInputs } from '../logic/stats.ts';
import type { BiomeWorld } from '../world/world.ts';

export type Team = 'player' | 'wild';

interface Buff {
  id: string;
  mods: StatMod[];
  time: number;
}

export interface Bleed {
  dps: number;
  time: number;
  acc: number;
}

/** Anything alive in the world: the player, wild animals and bosses share this. */
export class Actor {
  private static nextId = 1;
  readonly id = Actor.nextId++;
  readonly team: Team;
  name = '';
  level = 1;

  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** Intended horizontal velocity; knockback is added on top. */
  vx = 0;
  vz = 0;
  vy = 0;
  readonly knock = new THREE.Vector3();
  grounded = true;
  swimming = false;
  /** In flight (winged animals only): gravity is off and `vy` is set by the flight controls. */
  flying = false;
  /** Standing in water of any depth (the Crocodile's Water Ambush). */
  wet = false;
  /** Height above the ground (or the water) while flying, 0 otherwise. */
  altitude = 0;

  stats: Stats;
  hp: number;
  stamina: number;
  alive = true;
  deathTime = 0;

  /** Seconds of invulnerability left (dodge roll). */
  invuln = 0;
  stun = 0;
  slowTime = 0;
  slowPct = 0;
  bleeds: Bleed[] = [];
  buffs: Buff[] = [];
  /** Game time of the last damage taken. */
  lastHitTime = -999;
  /** Bosses: barely knocked back, shorter stuns, not pushed around. */
  heavy = false;
  /** Standing at the water's edge with its head down. */
  drinking = false;
  /** Mid-charge: shoves other animals aside without being slowed by them (the Elephant's Charge). */
  plowing = false;

  model: AnimalModel;
  readonly anim: AnimState = createAnimState();
  private statSource: () => StatInputs;

  constructor(team: Team, model: AnimalModel, statSource: () => StatInputs) {
    this.team = team;
    this.model = model;
    this.statSource = statSource;
    this.stats = this.compute();
    this.hp = this.stats.maxHealth;
    this.stamina = this.stats.stamina;
  }

  get radius(): number {
    return this.model.radius;
  }

  private compute(): Stats {
    const input = this.statSource();
    const mods = [...input.mods];
    for (const buff of this.buffs) mods.push(...buff.mods);
    if (this.slowTime > 0) mods.push({ stat: 'speed', pct: -this.slowPct });
    return computeStats({ ...input, mods });
  }

  /** Recomputes stats. Health keeps its fraction of the maximum unless `heal` is set. */
  refreshStats(heal = false): void {
    const hpFrac = this.stats.maxHealth > 0 ? this.hp / this.stats.maxHealth : 1;
    const stFrac = this.stats.stamina > 0 ? this.stamina / this.stats.stamina : 1;
    this.stats = this.compute();
    this.hp = heal ? this.stats.maxHealth : Math.min(this.stats.maxHealth, hpFrac * this.stats.maxHealth);
    this.stamina = heal ? this.stats.stamina : Math.min(this.stats.stamina, stFrac * this.stats.stamina);
  }

  setModel(model: AnimalModel): void {
    this.model = model;
  }

  addBuff(id: string, mods: StatMod[], duration: number): void {
    this.buffs = this.buffs.filter((b) => b.id !== id);
    this.buffs.push({ id, mods, time: duration });
    this.refreshStats();
  }

  buffTime(id: string): number {
    return this.buffs.find((b) => b.id === id)?.time ?? 0;
  }

  applySlow(pct: number, duration: number): void {
    this.slowPct = Math.max(this.slowTime > 0 ? this.slowPct : 0, pct);
    this.slowTime = Math.max(this.slowTime, duration);
    this.refreshStats();
  }

  applyStun(duration: number): void {
    this.stun = Math.max(this.stun, this.heavy ? duration * 0.5 : duration);
  }

  clearStatuses(): void {
    this.stun = 0;
    this.slowTime = 0;
    this.slowPct = 0;
    this.invuln = 0;
    this.bleeds = [];
    this.buffs = [];
    this.knock.set(0, 0, 0);
  }

  /** Counts down timers. Returns nothing; stats refresh themselves when a buff or slow ends. */
  tickStatus(dt: number): void {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.stun > 0) this.stun -= dt;
    let dirty = false;
    if (this.slowTime > 0) {
      this.slowTime -= dt;
      if (this.slowTime <= 0) dirty = true;
    }
    if (this.buffs.length) {
      for (const buff of this.buffs) buff.time -= dt;
      const kept = this.buffs.filter((b) => b.time > 0);
      if (kept.length !== this.buffs.length) {
        this.buffs = kept;
        dirty = true;
      }
    }
    if (dirty) this.refreshStats();
    this.anim.stunned = this.stun > 0;
    if (this.anim.hitFlash > 0) this.anim.hitFlash = Math.max(0, this.anim.hitFlash - dt / TUNING.combat.hitFlashSeconds);
  }

  faceToward(x: number, z: number): void {
    this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  distanceTo(other: Actor): number {
    return Math.hypot(other.pos.x - this.pos.x, other.pos.z - this.pos.z);
  }

  /** Pushes position and facing to the model and advances its animation. */
  syncModel(dt: number): void {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.anim.grounded = this.grounded;
    this.anim.swimming = this.swimming;
    this.anim.flying = this.flying;
    this.anim.drinking = this.drinking && this.alive;
    this.anim.climb = this.flying ? Math.max(-1, Math.min(1, this.vy / TUNING.flight.climbSpeed)) : 0;
    this.model.update(dt, this.anim);
  }
}

/**
 * Moves an actor by its velocity, keeps it out of obstacles and inside the world,
 * and resolves ground, gravity and swimming. Large steps are split so nothing tunnels.
 * A river's current carries an animal that is in its water, and (in a biome with cliffs) ground too steep
 * to climb stops one that walks into it.
 */
export function integrate(a: Actor, dt: number, world: BiomeWorld): void {
  let mx = (a.vx + a.knock.x) * dt;
  let mz = (a.vz + a.knock.z) * dt;
  if (world.rivers.length && !a.flying) {
    // The current pushes whatever is in the river: fully in deep water, barely where it only paddles.
    const surface = world.waterSurface(a.pos.x, a.pos.z);
    if (surface !== null && a.pos.y < surface + 0.2) {
      const grip = depthGrip(surface - world.heightAt(a.pos.x, a.pos.z), TUNING.river.fullCurrentDepth);
      if (grip > 0) {
        const flow = world.currentAt(a.pos.x, a.pos.z);
        mx += flow.x * grip * dt;
        mz += flow.z * grip * dt;
      }
    }
  }
  const steps = Math.min(6, Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.35)));
  // A flier passes over every trunk and rock that is lower than it is.
  const height = a.flying ? a.pos.y - world.heightAt(a.pos.x, a.pos.z) : 0;
  const maxSlope = a.flying ? undefined : world.layout.terrain.maxClimbSlope;
  for (let i = 0; i < steps; i++) {
    let sx = mx / steps;
    let sz = mz / steps;
    if (maxSlope !== undefined) {
      const feet = Math.max(a.pos.y, world.heightAt(a.pos.x, a.pos.z));
      const step = climbStep(world.heightAt, a.pos.x, a.pos.z, feet, sx, sz, maxSlope);
      sx = step.dx;
      sz = step.dz;
    }
    a.pos.x += sx;
    a.pos.z += sz;
    world.constrain(a.pos, a.radius, height);
  }
  // Nothing can stand on a cliff face: whatever lands there (over the waterfall, off the top) slides to the bottom.
  if (maxSlope !== undefined && a.grounded && !a.swimming) {
    const slide = slideStep(world.heightAt, a.pos.x, a.pos.z, maxSlope, TUNING.cliff.slideSpeed, dt);
    if (slide) {
      a.pos.x += slide.dx;
      a.pos.z += slide.dz;
      world.constrain(a.pos, a.radius, height);
    }
  }
  a.knock.multiplyScalar(Math.exp(-TUNING.combat.knockbackDecay * dt));

  const ground = world.heightAt(a.pos.x, a.pos.z);
  const surface = world.waterSurface(a.pos.x, a.pos.z);
  const floatY = (surface ?? world.layout.waterY) - a.model.height * 0.5;
  const depth = surface === null ? 0 : Math.max(0, surface - ground);
  a.wet = depth > 0;
  const canFloat = depth > 0 && ground < floatY;
  const floor = canFloat ? floatY : ground;

  if (a.flying) {
    a.pos.y = Math.min(floor + TUNING.flight.ceiling, a.pos.y + a.vy * dt);
    if (a.pos.y <= floor) {
      // Touching the ground ends the flight: the landing is automatic.
      a.pos.y = floor;
      a.vy = 0;
      a.flying = false;
      a.grounded = true;
      a.swimming = canFloat;
      a.altitude = 0;
    } else {
      a.grounded = false;
      a.swimming = false;
      a.altitude = a.pos.y - floor;
    }
    return;
  }
  a.altitude = 0;

  const wasGrounded = a.grounded;
  a.vy -= TUNING.player.gravity * dt;
  a.pos.y += a.vy * dt;
  // Stick to the ground when walking downhill instead of briefly "falling".
  if (a.pos.y <= floor || (wasGrounded && a.vy <= 0 && a.pos.y - floor < 0.6)) {
    a.pos.y = floor;
    a.vy = 0;
    a.grounded = true;
  } else {
    a.grounded = false;
  }
  a.swimming = canFloat && a.grounded;
}
