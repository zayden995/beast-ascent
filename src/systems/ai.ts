import type { AnimalModel } from '../animals/AnimalModel.ts';
import { dampAngle, lerp } from '../core/math.ts';
import type { EnemyAttackDef, EnemyDef, SpawnZoneDef } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import { guardWanderRadius, isGuardZone } from '../logic/foxReserve.ts';
import { noticeMultiplier } from '../logic/senses.ts';
import type { StatInputs } from '../logic/stats.ts';
import type { BiomeWorld } from '../world/world.ts';
import { Actor, integrate } from './actor.ts';
import type { Combat } from './combat.ts';
import type { Fx } from './fx.ts';

export type AiState = 'idle' | 'wander' | 'chase' | 'windup' | 'charging' | 'recover' | 'flee' | 'return';

/** A wild animal or boss: an Actor plus the state its AI needs. */
export class EnemyActor extends Actor {
  readonly def: EnemyDef;
  readonly isBoss: boolean;
  readonly zone: SpawnZoneDef | null;
  homeX = 0;
  homeZ = 0;
  /** Set while the current walk is to a drinking spot: the way to face once there (null for an ordinary walk). */
  drinkYaw: number | null = null;

  state: AiState = 'idle';
  timer = 1;
  targetX = 0;
  targetZ = 0;
  attack: EnemyAttackDef | null = null;
  cooldowns: Record<string, number> = {};
  /** Was attacked: fights back even if it is not aggressive by nature. */
  provoked = false;
  /** A guard of a fox food reserve: ignores the player until the reserve is raided (or it is attacked). */
  calm = false;
  fleeTime = 0;
  chargeHit = false;
  chargeX = 0;
  chargeZ = 0;
  /** Seconds since death animation started being removed (managed by the spawner). */
  removeAt = 0;

  constructor(def: EnemyDef, model: AnimalModel, statSource: () => StatInputs, isBoss: boolean, zone: SpawnZoneDef | null) {
    super('wild', model, statSource);
    this.def = def;
    this.isBoss = isBoss;
    this.zone = zone;
    this.name = def.name;
    this.heavy = isBoss;
  }

  /** True while the animal is actively fighting (used for the boss bar). */
  get engaged(): boolean {
    return this.alive && (this.state === 'chase' || this.state === 'windup' || this.state === 'charging' || this.state === 'recover');
  }

  /** Reaction to being hit. */
  onDamaged(): void {
    if (!this.alive) return;
    const b = this.def.behavior;
    if (b.fleeOnSight || (b.fleeHealthPct > 0 && this.hp / this.stats.maxHealth < b.fleeHealthPct)) {
      if (this.state !== 'flee') this.startFlee();
      return;
    }
    this.provoked = true;
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') this.state = 'chase';
  }

  startFlee(): void {
    this.state = 'flee';
    this.fleeTime = 0;
    this.attack = null;
    this.anim.windupT = -1;
    this.anim.warn = 0;
  }
}

export interface AiContext {
  player: Actor;
  world: BiomeWorld;
  combat: Combat;
  fx: Fx;
  rand: () => number;
}

function moveToward(e: EnemyActor, x: number, z: number, speed: number, dt: number): number {
  const dx = x - e.pos.x;
  const dz = z - e.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) {
    e.vx = e.vz = 0;
    return d;
  }
  e.vx = (dx / d) * speed;
  e.vz = (dz / d) * speed;
  e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), 9, dt);
  return d;
}

function pickWanderTarget(e: EnemyActor, ctx: AiContext): void {
  e.drinkYaw = null;
  // Now and then the walk is to the nearest water, to drink (never for a boss or a guard of a fox food reserve,
  // which stays with its food, never for an animal that lives in the water, and never far from home).
  if (!e.isBoss && !e.def.behavior.aquatic && !isGuardZone(e.zone) && ctx.rand() < TUNING.drink.chance) {
    const spot = ctx.world.drinkSpot(e.pos.x, e.pos.z, TUNING.drink.reach);
    if (
      spot
      && Math.hypot(spot.x - e.homeX, spot.z - e.homeZ) <= e.def.behavior.leashRadius * 0.8
      && Math.hypot(spot.x, spot.z) < ctx.world.boundary - 3
      && ctx.world.waterDepth(spot.x, spot.z) <= 0.2
      && !ctx.world.inRefuge(spot.x, spot.z, 2)
      && !ctx.world.colliders.blocked(spot.x, spot.z, 0.8)
    ) {
      e.targetX = spot.x;
      e.targetZ = spot.z;
      e.drinkYaw = spot.yaw;
      return;
    }
  }
  // A guard of a fox food reserve stays near its food, so that a raid angers all of them.
  const r = e.zone && isGuardZone(e.zone) ? guardWanderRadius(e.def.behavior.wanderRadius, e.zone.radius) : e.def.behavior.wanderRadius;
  for (let i = 0; i < 6; i++) {
    const a = ctx.rand() * Math.PI * 2;
    const d = Math.sqrt(ctx.rand()) * r;
    const x = e.homeX + Math.cos(a) * d;
    const z = e.homeZ + Math.sin(a) * d;
    if (Math.hypot(x, z) > ctx.world.boundary - 3) continue;
    // Land animals keep to dry ground; one that lives in the water (the wild crocodile) wanders into it.
    if (!e.def.behavior.aquatic && ctx.world.waterDepth(x, z) > 0.2) continue;
    // A lake-bound animal wanders only in its zone.
    const lake = e.def.behavior.waterBound;
    if (lake !== undefined && !ctx.world.inLakeZone(x, z, lake)) continue;
    if (ctx.world.inRefuge(x, z, 2)) continue;
    e.targetX = x;
    e.targetZ = z;
    return;
  }
  e.targetX = e.homeX;
  e.targetZ = e.homeZ;
}

/** Picks the first attack that is off cooldown and in range. Charges are preferred at distance. */
function chooseAttack(e: EnemyActor, dist: number, player: Actor): EnemyAttackDef | null {
  const gap = dist - e.radius - player.radius;
  let best: EnemyAttackDef | null = null;
  for (const atk of e.def.attacks) {
    if ((e.cooldowns[atk.id] ?? 0) > 0) continue;
    if (atk.kind === 'charge') {
      if (dist >= (atk.minRange ?? 0) && dist <= atk.range && !e.swimming) return atk;
    } else if (gap <= atk.range) {
      // Area attacks are saved for when the player is close; otherwise take the first melee option.
      if (!best || atk.kind === 'aoe') best = atk;
    }
  }
  return best;
}

function strike(e: EnemyActor, atk: EnemyAttackDef, ctx: AiContext): void {
  const damage = e.stats.damage * atk.damageMult;
  e.cooldowns[atk.id] = atk.cooldown;
  e.anim.windupT = -1;
  e.anim.warn = 0;
  if (atk.kind === 'melee') {
    const reach = atk.range + 0.5;
    ctx.fx.slash(e.pos, e.yaw, reach + e.radius, atk.arcDeg ?? 90, e.model.height * 0.4, 0xffb0a0);
    ctx.combat.hitArc(e, reach, atk.arcDeg ?? 90, { damage, knockback: atk.knockback });
    e.state = 'recover';
    e.timer = atk.recover;
    e.anim.attackT = 0;
  } else if (atk.kind === 'aoe') {
    const radius = atk.radius ?? 4;
    ctx.fx.ring(e.pos, radius, 0xffb0a0, 0.5);
    ctx.combat.hitRadius(e, e.pos.x, e.pos.z, radius, { damage, knockback: atk.knockback });
    e.state = 'recover';
    e.timer = atk.recover;
    e.anim.attackT = 0;
  } else {
    e.state = 'charging';
    e.timer = atk.duration ?? 0.8;
    e.chargeHit = false;
    e.chargeX = Math.sin(e.yaw);
    e.chargeZ = Math.cos(e.yaw);
  }
}

/** One AI step: idle / wander / chase / attack (wind-up, strike, recover) / flee / return home. */
export function updateEnemy(e: EnemyActor, dt: number, ctx: AiContext): void {
  if (!e.alive) return;
  e.tickStatus(dt);
  for (const id in e.cooldowns) if (e.cooldowns[id] > 0) e.cooldowns[id] -= dt;
  if (e.anim.attackT >= 0) {
    e.anim.attackT += dt / 0.35;
    if (e.anim.attackT >= 1) e.anim.attackT = -1;
  }

  const p = ctx.player;
  const b = e.def.behavior;
  const dx = p.pos.x - e.pos.x;
  const dz = p.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  const distHome = Math.hypot(e.pos.x - e.homeX, e.pos.z - e.homeZ);
  const playerFromHome = Math.hypot(p.pos.x - e.homeX, p.pos.z - e.homeZ);
  // Bosses guard their arena: they notice anyone who steps inside it.
  const noticeDist = e.isBoss ? playerFromHome : dist;
  // The den is a refuge: a player inside it is left alone, and any chase ends at its edge.
  const refuge = ctx.world.inRefuge(p.pos.x, p.pos.z);
  // Animals see best ahead and worst behind (bosses notice anyone in their arena), so a hunter can
  // creep up from behind, and prey that faces a hunter bolts before the hunter is near.
  const S = TUNING.enemies.senses;
  const reach = e.isBoss
    ? 1
    : noticeMultiplier(e.yaw, dx, dz, { front: b.senses?.front ?? S.front, rear: b.senses?.rear ?? S.rear }, S);
  // A flier high above the ground is out of sight, and a chase gives up on it (see TUNING.flight).
  const aloft = p.flying ? p.altitude : 0;
  // A lake-bound animal (the Plains' alligator) only cares about an animal in its zone: the water and a strip of shore.
  const lake = b.waterBound;
  const reachable = lake === undefined || ctx.world.inLakeZone(p.pos.x, p.pos.z, lake);
  const sees = p.alive && !refuge && reachable && aloft <= TUNING.flight.noticeAltitude && noticeDist < b.aggroRadius * reach;
  // A badly hurt animal stops picking fights and keeps its distance until it has recovered.
  const hurt = b.fleeHealthPct > 0 && e.hp / e.stats.maxHealth < b.fleeHealthPct;
  const walk = e.stats.moveSpeed;
  const run = e.stats.sprintSpeed;
  // Anything that interrupts the animal (a stun, a hunter coming near, a fight) ends the drink.
  if (e.drinking && e.state !== 'idle') e.drinking = false;

  if (e.stun > 0) {
    // A stun interrupts whatever the animal was doing.
    e.vx = e.vz = 0;
    if (e.state === 'windup' || e.state === 'charging') {
      e.state = 'chase';
      e.anim.windupT = -1;
      e.anim.warn = 0;
    }
  } else {
    switch (e.state) {
      case 'idle':
      case 'wander': {
        if (sees && (b.fleeOnSight || hurt)) {
          e.startFlee();
          break;
        }
        if (!hurt && ((sees && b.aggressive && !e.calm) || (e.provoked && p.alive && !refuge && reachable && dist < b.aggroRadius * 2))) {
          e.state = 'chase';
          break;
        }
        if (e.state === 'idle') {
          e.vx = e.vz = 0;
          if (e.drinking && e.drinkYaw !== null) e.yaw = dampAngle(e.yaw, e.drinkYaw, 6, dt);
          e.timer -= dt;
          if (e.timer <= 0) {
            e.drinking = false;
            pickWanderTarget(e, ctx);
            e.state = 'wander';
            // A walk to water can be a long one: give it the time it needs.
            e.timer = e.drinkYaw === null ? 7 : Math.min(30, Math.hypot(e.targetX - e.pos.x, e.targetZ - e.pos.z) / Math.max(0.5, walk) + 4);
          }
        } else {
          const d = moveToward(e, e.targetX, e.targetZ, walk, dt);
          e.timer -= dt;
          if (d < 0.6 || e.timer <= 0) {
            e.state = 'idle';
            if (e.drinkYaw !== null && d < 1.5) {
              // At the water's edge: stand facing the water with the head down for a few seconds.
              e.drinking = true;
              e.timer = TUNING.drink.minSeconds + ctx.rand() * (TUNING.drink.maxSeconds - TUNING.drink.minSeconds);
            } else {
              e.drinkYaw = null;
              e.timer = 1.5 + ctx.rand() * 3.5;
            }
          }
        }
        break;
      }
      case 'chase': {
        const tooFar = e.isBoss ? playerFromHome > b.leashRadius + 6 : distHome > b.leashRadius;
        if (!p.alive || tooFar || refuge || !reachable || aloft > TUNING.flight.giveUpAltitude) {
          e.state = 'return';
          e.provoked = false;
          break;
        }
        if (hurt) {
          e.startFlee();
          break;
        }
        const atk = chooseAttack(e, dist, p);
        if (atk) {
          e.attack = atk;
          e.state = 'windup';
          e.timer = atk.windup;
          e.vx = e.vz = 0;
          e.faceToward(p.pos.x, p.pos.z);
          if (atk.kind === 'charge') {
            const length = (atk.speed ?? 12) * (atk.duration ?? 0.8);
            ctx.fx.chargeWarning(e.pos, e.yaw, length, e.radius * 2.2, atk.windup);
          } else if (atk.kind === 'aoe') {
            ctx.fx.areaWarning(e.pos, atk.radius ?? 4, atk.windup);
          }
          break;
        }
        const stopAt = e.radius + p.radius + 0.3;
        if (dist > stopAt) moveToward(e, p.pos.x, p.pos.z, run, dt);
        else {
          e.vx = e.vz = 0;
          e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), 9, dt);
        }
        break;
      }
      case 'windup': {
        const atk = e.attack;
        if (!atk) {
          e.state = 'chase';
          break;
        }
        e.vx = e.vz = 0;
        // Melee tracks the player through the wind-up; a charge commits to its line early so it can be dodged.
        if (atk.kind === 'melee') e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), 5, dt);
        e.timer -= dt;
        const k = 1 - Math.max(0, e.timer) / atk.windup;
        e.anim.windupT = k;
        e.anim.warn = k;
        if (e.timer <= 0) strike(e, atk, ctx);
        break;
      }
      case 'charging': {
        const atk = e.attack;
        const speed = atk?.speed ?? 12;
        e.vx = e.chargeX * speed;
        e.vz = e.chargeZ * speed;
        if (atk && !e.chargeHit && p.alive && !refuge && dist < e.radius + p.radius + 0.5 && Math.abs(p.pos.y - e.pos.y) < 2 + e.model.height) {
          e.chargeHit = true;
          ctx.combat.damage(e, p, { damage: e.stats.damage * atk.damageMult, knockback: atk.knockback });
        }
        e.timer -= dt;
        // A boss never leaves its arena, even mid-charge.
        const leavingArena = e.isBoss && Math.hypot(e.pos.x + e.vx * 0.15 - e.homeX, e.pos.z + e.vz * 0.15 - e.homeZ) > b.leashRadius - 3;
        if (e.timer <= 0 || leavingArena) {
          e.state = 'recover';
          e.timer = atk?.recover ?? 1;
          e.vx = e.vz = 0;
        }
        break;
      }
      case 'recover': {
        e.vx = e.vz = 0;
        e.timer -= dt;
        if (e.timer <= 0) e.state = 'chase';
        break;
      }
      case 'flee': {
        e.fleeTime += dt;
        // Sprint in bursts, then tire: this is what lets a predator run prey down.
        const winded = b.fleeBurst > 0 && e.fleeTime % (b.fleeBurst + b.windedSeconds) > b.fleeBurst;
        // A wounded animal cannot keep its pace, so every bite makes the next one easier.
        const wounded = lerp(b.woundedSpeedMult, 1, e.hp / e.stats.maxHealth);
        let ax = -dx / (dist || 1);
        let az = -dz / (dist || 1);
        // Near the world edge, slide along it instead of running into the wall.
        const r = Math.hypot(e.pos.x, e.pos.z);
        if (r > ctx.world.boundary - 10) {
          const push = (r - (ctx.world.boundary - 10)) / 10;
          ax -= (e.pos.x / r) * push * 1.6;
          az -= (e.pos.z / r) * push * 1.6;
          const n = Math.hypot(ax, az) || 1;
          ax /= n;
          az /= n;
        }
        moveToward(e, e.pos.x + ax * 5, e.pos.z + az * 5, run * (winded ? b.windedSpeedMult : 1) * wounded, dt);
        if (!p.alive || dist > b.aggroRadius * 2.6) {
          e.state = 'return';
          e.provoked = false;
        }
        break;
      }
      case 'return': {
        if (sees && (b.fleeOnSight || hurt)) {
          e.startFlee();
          break;
        }
        if (!hurt && sees && b.aggressive && !e.calm && (e.isBoss || distHome < b.leashRadius * 0.5)) {
          e.state = 'chase';
          break;
        }
        const d = moveToward(e, e.homeX, e.homeZ, walk * 1.5, dt);
        // Animals that broke off a fight recover; a boss resets completely.
        const regen = e.isBoss ? 0.25 : TUNING.enemies.regenPctPerSec;
        e.hp = Math.min(e.stats.maxHealth, e.hp + e.stats.maxHealth * regen * dt);
        if (d < 1) {
          e.state = 'idle';
          e.timer = 1 + ctx.rand() * 2;
        }
        break;
      }
    }
  }

  // A lake-bound animal never walks out of its zone (a step from the inside out is stopped).
  if (lake !== undefined) {
    const held = ctx.world.holdInLakeZone(lake, e.pos.x, e.pos.z, e.vx, e.vz, dt);
    e.vx = held.vx;
    e.vz = held.vz;
  }
  integrate(e, dt, ctx.world);
  ctx.world.keepOutOfRefuge(e.pos, e.radius);
  e.anim.speed = Math.hypot(e.vx, e.vz);
  e.anim.sprinting = e.anim.speed > walk * 1.6;
}
