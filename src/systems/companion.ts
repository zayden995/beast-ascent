import type * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import { dampAngle } from '../core/math.ts';
import { PETS, PET_TUNING } from '../data/pets.ts';
import type { PetDef, PetKind } from '../data/pets.ts';
import { TUNING } from '../data/tuning.ts';
import { followPlan, newPetCare, petStats, pickPetTarget, stepPetCare } from '../logic/pet.ts';
import type { PetCare, PetCareEvent, PetPhase } from '../logic/pet.ts';
import type { BiomeWorld } from '../world/world.ts';
import { Actor, integrate } from './actor.ts';
import type { EnemyActor } from './ai.ts';
import { disposeEgg, makeEgg } from './eggs.ts';
import type { Combat } from './combat.ts';
import type { Fx } from './fx.ts';

/** What the pet needs from the game each step. */
export interface CompanionContext {
  player: Actor;
  enemies: EnemyActor[];
  world: BiomeWorld;
  combat: Combat;
  fx: Fx;
  now: number;
  /** The player is holding E beside it (while it is injured). */
  tending: boolean;
  /** The player was hit since the last step (it breaks off the tending). */
  playerHit: boolean;
}

/** How far the death pose goes for an injured pet: lying on its side (the full pose, not yet fading). */
const LYING = 0.4;
/** Seconds a dead pet takes to fade. */
const FADE_SECONDS = 1.8;

/** How often (seconds) the pet looks again for something to fight. */
const RETHINK_SECONDS = 0.25;

/**
 * The player's pet (M3, the bible's "M3, the pet: design"): on the player's team, so the player's hits pass through it. It follows
 * the player, appears beside it when left far behind, and bites what the player is fighting. Its strength follows the player's.
 */
export class CompanionActor extends Actor {
  readonly def: PetDef;
  care: PetCare;
  /** The id of the animal it is fighting, or null while it follows. */
  targetId: number | null = null;
  /** For the browser test: bites that landed, and animals it killed. */
  hits = 0;
  kills = 0;

  private player: Actor;
  /** While it is an egg: the egg beside the player, which wobbles more and more until it hatches. */
  private egg: THREE.Group | null = null;
  private biteCooldown = 0;
  private rethink = 0;
  private statKey = '';

  constructor(kind: PetKind, player: Actor, phase: PetPhase = 'healthy') {
    const def = PETS[kind];
    super('player', createAnimalModel({ body: def.body, colors: def.colors, features: def.features, size: def.size, headScale: 1 }),
      () => ({ base: petStats(player.stats, def), sizeScale: 1, powerMult: 1, levelBonus: 0, mods: [] }));
    this.def = def;
    this.player = player;
    this.care = newPetCare(phase);
    this.name = def.name;
    this.statKey = this.keyOf();
    if (phase === 'egg') {
      // Until it hatches it is an egg: the cub is hidden, and nothing can hit it.
      this.egg = makeEgg(kind);
      this.model.root.visible = false;
      this.untargetable = true;
    } else if (phase === 'injured') this.goDown();
  }

  /** The player woke at its den (after a death): the pet is there too. A healthy pet is at full health; an injured one stays injured. */
  wakeBeside(world: BiomeWorld): void {
    if (this.care.phase === 'healthy') {
      this.alive = true;
      this.clearStatuses();
      this.hp = this.stats.maxHealth;
      this.targetId = null;
    }
    this.placeBeside(world);
  }

  dispose(): void {
    this.model.dispose();
    if (this.egg) disposeEgg(this.egg);
    this.egg = null;
  }

  /** Puts it beside the player (on arrival, or when it has fallen far behind): behind and to one side, on open ground if there is any. */
  placeBeside(world: BiomeWorld): void {
    const p = this.player;
    const spots = [[-1.4, -2.2], [1.4, -2.2], [-2.2, 0], [2.2, 0], [0, -2.5]];
    let x = p.pos.x;
    let z = p.pos.z;
    for (const [side, back] of spots) {
      const cx = p.pos.x + Math.cos(p.yaw) * side + Math.sin(p.yaw) * back;
      const cz = p.pos.z - Math.sin(p.yaw) * side + Math.cos(p.yaw) * back;
      if (world.colliders.blocked(cx, cz, this.radius + 0.2) || world.waterDepth(cx, cz) > 0.4) continue;
      x = cx;
      z = cz;
      break;
    }
    this.pos.set(x, world.heightAt(x, z), z);
    this.vx = this.vz = this.vy = 0;
    this.knock.set(0, 0, 0);
    this.yaw = p.yaw;
  }

  private keyOf(): string {
    const s = this.player.stats;
    return `${s.maxHealth}|${s.damage}|${s.defense}|${s.moveSpeed}|${s.sprintSpeed}`;
  }

  /** One step. Returns what happened to it (injured, back on its feet, died) so that the game can say so and save it. */
  update(dt: number, ctx: CompanionContext): PetCareEvent {
    if (this.care.phase === 'dead') {
      this.anim.deathT = Math.min(1, LYING + ((ctx.now - this.deathTime) / FADE_SECONDS) * (1 - LYING));
      return 'none';
    }
    // At 0 health the pet is knocked down, not killed: the care rule decides what happens next.
    if (!this.alive && this.care.phase === 'healthy') {
      this.alive = true;
      this.hp = 0;
    }
    const event = stepPetCare(this.care, { hp: this.hp, tending: ctx.tending, playerHit: ctx.playerHit }, dt);
    if (event === 'hatched') this.hatch(ctx);
    else if (event === 'injured') this.goDown();
    else if (event === 'revived') {
      this.untargetable = false;
      this.anim.deathT = -1;
      this.hp = this.stats.maxHealth * PET_TUNING.reviveHealthPct;
      this.lastHitTime = ctx.now;
    } else if (event === 'died') {
      this.alive = false;
      this.deathTime = ctx.now;
    }
    if (this.care.phase === 'egg' && this.egg) {
      // The egg rocks, faster and harder as the hatch comes near.
      const k = 1 - Math.max(0, this.care.hatchLeft) / PET_TUNING.hatchSeconds;
      this.egg.position.copy(this.pos);
      this.egg.rotation.z = Math.sin(ctx.now * (4 + k * 14)) * (0.05 + k * 0.22);
      return event;
    }
    // Injured, it lies where it fell: it does not move, fight, heal, or drift with the water.
    if (this.care.phase !== 'healthy') return event;

    this.tickStatus(dt);
    // Its strength follows the player's (a level, a stage, a buff): its share of health is kept.
    const key = this.keyOf();
    if (key !== this.statKey) {
      this.statKey = key;
      this.refreshStats();
    }
    if (this.biteCooldown > 0) this.biteCooldown -= dt;
    if (this.anim.attackT >= 0) {
      this.anim.attackT += dt / 0.35;
      if (this.anim.attackT >= 1) this.anim.attackT = -1;
    }
    // It heals like the player: slowly, after a while without being hurt.
    const P = TUNING.player;
    if (ctx.now - this.lastHitTime > P.regenDelay && this.hp < this.stats.maxHealth) {
      this.hp = Math.min(this.stats.maxHealth, this.hp + this.stats.maxHealth * P.regenPctPerSec * dt);
    }

    if (this.stun > 0) {
      this.vx = this.vz = 0;
    } else {
      this.think(dt, ctx);
    }
    // In a hole in Winter's ice it swims out to the nearest whole ice or shore first.
    if (this.swimming && this.stun <= 0 && ctx.world.iceHoleAt(this.pos.x, this.pos.z)) {
      const foot = ctx.world.iceFooting(this.pos.x, this.pos.z);
      if (foot) {
        const fx = foot.x - this.pos.x;
        const fz = foot.z - this.pos.z;
        const d = Math.hypot(fx, fz) || 1;
        this.vx = (fx / d) * this.stats.moveSpeed;
        this.vz = (fz / d) * this.stats.moveSpeed;
        this.yaw = Math.atan2(fx, fz);
      }
    }
    // In water it swims at the land animals' pace.
    if (this.swimming) {
      this.vx *= P.swimSpeedMult;
      this.vz *= P.swimSpeedMult;
    }
    integrate(this, dt, ctx.world);
    this.anim.speed = Math.hypot(this.vx, this.vz);
    this.anim.sprinting = this.anim.speed > this.stats.moveSpeed * 1.3;
    return event;
  }

  /** The egg cracks open: the cub stands where the egg was, at full health. */
  private hatch(ctx: CompanionContext): void {
    if (this.egg) disposeEgg(this.egg);
    this.egg = null;
    this.model.root.visible = true;
    this.untargetable = false;
    this.hp = this.stats.maxHealth;
    this.yaw = ctx.player.yaw;
    ctx.fx.ring(this.pos, 1.4, 0xfff2b0, 0.7);
  }

  /** Injured: it lies down where it is, cannot be hit, and drops any fight. */
  private goDown(): void {
    this.hp = 0;
    this.clearStatuses();
    this.untargetable = true;
    this.targetId = null;
    this.vx = this.vz = this.vy = 0;
    this.anim.attackT = -1;
    this.anim.speed = 0;
    this.anim.deathT = LYING;
    // The blow that knocked it down started a white hit flash; lying still, nothing would fade it, so it would stay white.
    this.anim.hitFlash = 0;
  }

  private think(dt: number, ctx: CompanionContext): void {
    const p = ctx.player;
    const T = PET_TUNING;
    this.rethink -= dt;
    if (this.rethink <= 0) {
      this.rethink = RETHINK_SECONDS;
      this.targetId = pickPetTarget(
        ctx.enemies.map((e) => ({
          id: e.id, alive: e.alive, calm: e.calm, engaged: e.engaged, lastPlayerHitAt: e.lastPlayerHitAt,
          distToPlayer: e.distanceTo(p), distToPet: e.distanceTo(this),
        })),
        ctx.now,
        this.targetId,
      );
    }
    const target = this.targetId === null ? undefined : ctx.enemies.find((e) => e.id === this.targetId && e.alive);
    const distPlayer = this.distanceTo(p);

    // Left far behind (a flight, a fall, a long swim): it appears beside the player, and gives up any fight.
    if (followPlan(distPlayer) === 'warp') {
      this.targetId = null;
      this.placeBeside(ctx.world);
      return;
    }

    if (target) {
      const dist = this.distanceTo(target);
      const reach = T.biteReach * this.stats.size;
      if (dist > reach + this.radius + target.radius - 0.1) {
        this.moveToward(target.pos.x, target.pos.z, this.stats.sprintSpeed, dt);
        return;
      }
      this.vx = this.vz = 0;
      this.yaw = dampAngle(this.yaw, Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z), 12, dt);
      if (this.biteCooldown <= 0) {
        this.biteCooldown = T.biteCooldown;
        this.anim.attackT = 0;
        ctx.fx.slash(this.pos, this.yaw, reach + this.radius, T.biteArcDeg, this.model.height * 0.4, 0xfff0c0);
        const hit = ctx.combat.hitArc(this, reach, T.biteArcDeg, { damage: this.stats.damage, knockback: T.biteKnockback });
        this.hits += hit.length;
        this.kills += hit.filter((h) => !h.alive).length;
      }
      return;
    }

    // Following: a little behind and to one side of the player.
    const plan = followPlan(distPlayer);
    if (plan === 'stay') {
      this.vx = this.vz = 0;
      if (Math.hypot(p.vx, p.vz) < 0.3) this.yaw = dampAngle(this.yaw, p.yaw, 3, dt);
      return;
    }
    const side = 1.4;
    const back = -T.followDistance;
    const fx = p.pos.x + Math.cos(p.yaw) * side + Math.sin(p.yaw) * back;
    const fz = p.pos.z - Math.sin(p.yaw) * side + Math.cos(p.yaw) * back;
    this.moveToward(fx, fz, plan === 'run' ? this.stats.sprintSpeed : this.stats.moveSpeed * 1.2, dt);
  }

  private moveToward(x: number, z: number, speed: number, dt: number): void {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) {
      this.vx = this.vz = 0;
      return;
    }
    // Ease in at the end so it does not overshoot the spot.
    const v = Math.min(speed, d * 3);
    this.vx = (dx / d) * v;
    this.vz = (dz / d) * v;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.model.root);
    if (this.egg) {
      this.egg.position.copy(this.pos);
      scene.add(this.egg);
    }
  }
}
