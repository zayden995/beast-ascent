import type * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import type { EventBus } from '../core/events.ts';
import { damp, dampAngle } from '../core/math.ts';
import type { BiomeModDef } from '../core/types.ts';
import { STAGES } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { activeBiomeMods, toStatMods } from '../logic/biome.ts';
import { describeDeath } from '../logic/deathText.ts';
import { stepVerticalSpeed } from '../logic/flight.ts';
import { abilityRank } from '../logic/progression.ts';
import type { DeathOutcome } from '../logic/progression.ts';
import { swimSpeedFactor } from '../logic/stats.ts';
import type { StatInputs } from '../logic/stats.ts';
import type { BiomeWorld } from '../world/world.ts';
import { AbilitySystem } from './abilities.ts';
import { Actor, integrate } from './actor.ts';
import type { ThirdPersonCamera } from './camera.ts';
import type { Combat } from './combat.ts';
import type { Fx } from './fx.ts';
import type { GameEvents } from './gameEvents.ts';
import type { Growth } from './growth.ts';
import type { Input } from './input.ts';

const T = TUNING.player;

export interface PlayerDeps {
  scene: THREE.Scene;
  world: BiomeWorld;
  input: Input;
  cam: ThirdPersonCamera;
  combat: Combat;
  fx: Fx;
  growth: Growth;
  events: EventBus<GameEvents>;
  clock: { time: number };
  /** Where the animal starts (the den's spawn point, or just inside a gate it came through). */
  start: { x: number; z: number; yaw: number };
}

/** Turns input into movement, attacks, dodges and ability use for the player's animal. */
export class PlayerController {
  readonly actor: Actor;
  readonly abilities: AbilitySystem;
  dead = false;
  /** Biome buffs/nerfs applying right now (shown on the HUD). */
  activeMods: BiomeModDef[] = [];
  sprinting = false;
  /** No wild animal has noticed the player (set by the game each frame). Powers the Tiger's Stalk. */
  unseen = true;

  private d: PlayerDeps;
  private swing: { t: number; duration: number; hit: boolean } | null = null;
  private dodge: { t: number; dx: number; dz: number } | null = null;
  private attackCooldown = 0;
  private dodgeCooldown = 0;
  private staminaDelay = 0;
  private exhausted = false;
  private respawnTimer = 0;
  /** Out of stamina in flight: no flapping until it has recovered a little. */
  private flapExhausted = false;
  private lastDeath: DeathOutcome | null = null;
  private modKey = '';

  constructor(deps: PlayerDeps) {
    this.d = deps;
    const { growth, world, events } = deps;
    this.activeMods = activeBiomeMods(growth.variant.biomeMods, world.biome.id, { nearWater: false });

    this.actor = new Actor('player', this.buildModel(), () => this.statInputs());
    this.actor.name = growth.species.name;
    this.actor.level = growth.progress.level;
    deps.scene.add(this.actor.model.root);

    this.abilities = new AbilitySystem(
      this.actor, deps.combat, deps.fx,
      (id) => abilityRank(growth.progress, id),
      () => growth.getPassives(),
    );
    this.abilities.setLoadout(growth.variant.abilities);

    const spawn = deps.start;
    this.actor.pos.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
    this.actor.yaw = spawn.yaw;

    events.on('progress', () => {
      this.actor.level = growth.progress.level;
      this.actor.refreshStats();
    });
    events.on('evolved', () => this.rebuildModel());
  }

  /** True while a Stalk-style passive is boosting the animal because nobody has noticed it. */
  get stalking(): boolean {
    return this.unseen && this.d.growth.getPassives().unseenMods.length > 0;
  }

  setUnseen(unseen: boolean): void {
    if (unseen === this.unseen) return;
    this.unseen = unseen;
    if (this.d.growth.getPassives().unseenMods.length > 0) this.actor.refreshStats();
  }

  private statInputs(): StatInputs {
    const { growth } = this.d;
    const stage = STAGES[growth.progress.stage];
    return {
      base: growth.species.baseStats,
      sizeScale: stage.sizeScale,
      powerMult: stage.powerMult,
      levelBonus: T.levelBonusPct * (growth.progress.level - 1),
      mods: [
        ...toStatMods(this.activeMods),
        ...growth.getPassives().mods,
        ...(this.unseen ? growth.getPassives().unseenMods : []),
      ],
    };
  }

  private buildModel() {
    const { growth } = this.d;
    const stage = STAGES[growth.progress.stage];
    return createAnimalModel({
      body: growth.species.body,
      colors: growth.variant.colors,
      features: growth.species.stageFeatures[growth.progress.stage],
      rig: growth.species.rig,
      size: stage.sizeScale * growth.species.baseStats.size,
      headScale: stage.headScale,
    });
  }

  /** Swaps in the model for the current life stage and heals to full. */
  private rebuildModel(celebrate = true): void {
    this.actor.model.dispose();
    const model = this.buildModel();
    this.actor.setModel(model);
    this.d.scene.add(model.root);
    this.actor.refreshStats(true);
    if (celebrate) this.d.fx.ring(this.actor.pos, 6, 0xfff2b0, 0.9);
  }

  /** Called by the game when the player's actor dies, after the death has been applied to the progress. */
  onDeath(outcome: DeathOutcome): void {
    this.dead = true;
    this.lastDeath = outcome;
    this.respawnTimer = TUNING.death.respawnSeconds;
    this.swing = null;
    this.dodge = null;
    this.abilities.cancel();
    // A bird that dies in the air falls.
    this.actor.flying = false;
    this.flapExhausted = false;
    // Buffs and cooldowns die with the animal; its abilities are reset along with its level.
    this.abilities.setLoadout(this.d.growth.variant.abilities);
    this.actor.buffs = [];
    this.actor.vx = 0;
    this.actor.vz = 0;
    this.actor.anim.dodgeT = -1;
    this.actor.anim.hitFlash = 0;
    this.d.events.emit('playerDied', outcome);
  }

  private respawn(): void {
    const { world, growth, cam, events } = this.d;
    const a = this.actor;
    const spawn = world.layout.playerSpawn;
    a.alive = true;
    a.clearStatuses();
    // The death was applied to the progress when the animal died (see Game); wake up in the body
    // of the stage it fell to.
    this.rebuildModel(false);
    a.pos.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
    a.yaw = spawn.yaw;
    a.vx = a.vz = a.vy = 0;
    a.flying = false;
    a.altitude = 0;
    a.anim.deathT = -1;
    this.dead = false;
    this.exhausted = false;
    cam.snap(spawn.yaw);
    events.emit('playerRespawned', null);
    if (this.lastDeath) {
      events.emit('toast', { text: describeDeath(this.lastDeath, growth.variant.name).wake, tone: 'bad' });
    }
  }

  /** Turn toward the nearest enemy roughly in front of the camera, so attacks connect. */
  private aimAssist(extraReach = 0): void {
    const a = this.actor;
    const { combat, cam, growth } = this.d;
    const reach = growth.species.attack.range * a.stats.size + T.aimAssistRange + extraReach;
    const facing = a.yaw;
    a.yaw = cam.yaw;
    let candidates = combat.targetsInArc(a, reach, T.aimAssistArcDeg);
    a.yaw = facing;
    if (candidates.length === 0) candidates = combat.targetsInArc(a, reach, T.aimAssistArcDeg);
    if (candidates.length === 0) return;
    candidates.sort((p, q) => a.distanceTo(p) - a.distanceTo(q));
    a.faceToward(candidates[0].pos.x, candidates[0].pos.z);
  }

  /**
   * Flight (winged animals): hold Space to take off and climb, let go to glide down; touching the
   * ground lands the bird. Climbing costs stamina, gliding is free, and with no stamina left the
   * bird can only glide until it has recovered a little.
   */
  private updateFlight(dt: number, stunned: boolean, busy: boolean): void {
    const a = this.actor;
    const F = TUNING.flight;
    const wants = this.d.input.isDown('Space') && !stunned && !this.dodge;
    if (this.flapExhausted && a.stamina >= a.stats.stamina * 0.2) this.flapExhausted = false;
    if (!a.flying) {
      if (wants && !busy && !this.flapExhausted && a.stamina >= F.takeoffStaminaCost) {
        a.flying = true;
        a.grounded = false;
        a.vy = F.takeoffSpeed;
        a.stamina -= F.takeoffStaminaCost;
        this.staminaDelay = T.staminaRegenDelay;
      }
      return;
    }
    // A dive owns the vertical speed while it plays.
    if (this.abilities.leaping) return;
    const flapping = wants && !this.flapExhausted && a.stamina > 0;
    a.vy = stepVerticalSpeed(a.vy, flapping, a.altitude, dt, F);
    if (flapping) {
      a.stamina -= F.flapStaminaPerSec * dt;
      this.staminaDelay = T.staminaRegenDelay;
      if (a.stamina <= 0) {
        a.stamina = 0;
        this.flapExhausted = true;
      }
    }
  }

  private refreshBiomeMods(): void {
    const { growth, world } = this.d;
    const a = this.actor;
    const mods = activeBiomeMods(growth.variant.biomeMods, world.biome.id, { nearWater: world.nearWater(a.pos.x, a.pos.z) });
    const key = mods.map((m) => `${m.stat}:${m.pct}`).join('|');
    if (key !== this.modKey) {
      this.modKey = key;
      this.activeMods = mods;
      a.refreshStats();
    }
  }

  update(dt: number): void {
    const a = this.actor;
    const { input, cam, world, combat, fx, growth, clock } = this.d;

    if (this.dead) {
      // The player's body stays visible; only wild animals fade out.
      a.anim.deathT = Math.min(0.55, (clock.time - a.deathTime) / 1.6);
      a.vx = a.vz = 0;
      integrate(a, dt, world);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    a.tickStatus(dt);
    this.attackCooldown -= dt;
    this.dodgeCooldown -= dt;
    this.staminaDelay -= dt;
    this.refreshBiomeMods();
    const stunned = a.stun > 0;

    // Camera-relative movement direction.
    let ix = 0;
    let iz = 0;
    if (!stunned) {
      ix = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      iz = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    }
    const sin = Math.sin(cam.yaw);
    const cos = Math.cos(cam.yaw);
    let mx = sin * iz - cos * ix;
    let mz = cos * iz + sin * ix;
    const len = Math.hypot(mx, mz);
    const moving = len > 0;
    if (moving) {
      mx /= len;
      mz /= len;
    }

    // Abilities on 1 / 2 / 3.
    for (let i = 0; i < 3; i++) {
      if (!input.consume(`Digit${i + 1}`) || stunned || this.dodge) continue;
      if (this.abilities.blockedReason(i) === null) {
        this.aimAssist(4);
        this.swing = null;
        this.abilities.use(i);
        this.staminaDelay = T.staminaRegenDelay;
      }
    }
    this.abilities.update(dt);
    const busy = this.abilities.busy;

    // Dodge roll: brief invulnerability, costs stamina.
    if (input.consume('KeyQ') && !stunned && !this.dodge && !busy && this.dodgeCooldown <= 0 && a.stamina >= T.dodge.staminaCost) {
      a.stamina -= T.dodge.staminaCost;
      this.staminaDelay = T.staminaRegenDelay;
      this.dodge = { t: 0, dx: moving ? mx : Math.sin(a.yaw), dz: moving ? mz : Math.cos(a.yaw) };
      this.swing = null;
      a.anim.attackT = -1;
      a.invuln = T.dodge.iframes;
      a.yaw = Math.atan2(this.dodge.dx, this.dodge.dz);
    }

    if (growth.species.rig === 'winged') {
      this.updateFlight(dt, stunned, busy);
    } else if (input.consume('Space') && !stunned && a.grounded && !a.swimming && !this.dodge && !busy && a.stamina >= T.jumpStaminaCost) {
      a.vy = T.jumpVelocity;
      a.grounded = false;
      a.stamina -= T.jumpStaminaCost;
      this.staminaDelay = T.staminaRegenDelay;
    }

    // Basic attack: hold the button to keep attacking.
    if (input.isDown('Mouse0') && !stunned && !this.swing && !this.dodge && !busy && this.attackCooldown <= 0) {
      this.aimAssist();
      const interval = 1 / a.stats.attackSpeed;
      this.attackCooldown = interval;
      this.swing = { t: 0, duration: Math.min(0.42, interval * 0.8), hit: false };
      a.anim.attackPower = 1;
    }
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      const k = s.t / s.duration;
      a.anim.attackT = Math.min(1, k);
      if (!s.hit && k >= T.attackHitPoint) {
        s.hit = true;
        const atk = growth.species.attack;
        const reach = atk.range * a.stats.size;
        fx.slash(a.pos, a.yaw, reach + a.radius, atk.arcDeg, a.model.height * 0.5, 0xffffff);
        combat.hitArc(a, reach, atk.arcDeg, {
          damage: a.stats.damage * (a.wet ? 1 + growth.getPassives().waterDamagePct : 1),
          knockback: atk.knockback,
          lowHealthBonus: growth.getPassives().lowHealthBonus,
        });
      }
      if (k >= 1) {
        this.swing = null;
        a.anim.attackT = -1;
      }
    }

    // Movement.
    this.sprinting = false;
    if (this.dodge) {
      const dg = this.dodge;
      dg.t += dt;
      a.vx = dg.dx * T.dodge.speed;
      a.vz = dg.dz * T.dodge.speed;
      a.anim.dodgeT = Math.min(1, dg.t / T.dodge.duration);
      if (dg.t >= T.dodge.duration) {
        this.dodge = null;
        this.dodgeCooldown = T.dodge.cooldown;
        a.anim.dodgeT = -1;
      }
    } else if (!this.abilities.leaping) {
      if (this.exhausted && a.stamina >= a.stats.stamina * 0.2) this.exhausted = false;
      this.sprinting = input.isDown('ShiftLeft') && moving && !this.exhausted && !a.swimming && !this.swing && !busy;
      if (this.sprinting) {
        a.stamina -= T.sprintStaminaPerSec * dt;
        this.staminaDelay = T.staminaRegenDelay;
        if (a.stamina <= 0) {
          a.stamina = 0;
          this.exhausted = true;
        }
      }
      // A winged animal is slower on foot than in the air, both walking and sprinting (the Eagle).
      const onFoot = !a.flying;
      let speed = this.sprinting
        ? a.stats.sprintSpeed * (onFoot ? growth.species.groundSprintMult ?? 1 : 1)
        : a.stats.moveSpeed * (onFoot ? growth.species.groundWalkMult ?? 1 : 1);
      if (a.swimming) speed *= swimSpeedFactor(growth.species.swimSpeedMult, growth.getPassives().swimSpeedPct);
      if (this.swing) speed *= T.attackMoveMult;
      if (stunned || this.abilities.rooted) speed = 0;
      a.vx = damp(a.vx, mx * speed, T.accel, dt);
      a.vz = damp(a.vz, mz * speed, T.accel, dt);
      if (moving && speed > 0 && !this.swing) a.yaw = dampAngle(a.yaw, Math.atan2(mx, mz), T.turnRate, dt);
    }

    if (this.staminaDelay <= 0 && a.stamina < a.stats.stamina) {
      a.stamina = Math.min(a.stats.stamina, a.stamina + a.stats.staminaRegen * dt);
    }
    if (clock.time - a.lastHitTime > T.regenDelay && a.hp < a.stats.maxHealth) {
      a.hp = Math.min(a.stats.maxHealth, a.hp + a.stats.maxHealth * T.regenPctPerSec * dt);
    }

    integrate(a, dt, world);
    a.anim.speed = Math.hypot(a.vx, a.vz);
    a.anim.sprinting = this.sprinting;
  }

  dispose(): void {
    this.actor.model.dispose();
  }
}
