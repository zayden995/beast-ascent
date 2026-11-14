import { addGrowth } from '../logic/progression.ts';
import type { App } from './App.ts';

/**
 * Test hooks, installed only in dev or with ?debug in the URL.
 * They let the browser test step the simulation deterministically and read game state.
 */
export function installDebug(app: App): void {
  const api = {
    app,
    setAutoStep(on: boolean) {
      app.autoStep = on;
    },
    setRender(on: boolean) {
      app.renderEnabled = on;
    },
    /** Runs the simulation for `seconds` in fixed steps, without waiting for frames. */
    advance(seconds: number, dt = 1 / 60) {
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) app.step(dt);
    },
    teleport(x: number, z: number, yaw?: number) {
      const g = app.game;
      if (!g) return;
      const a = g.player.actor;
      a.pos.set(x, g.world.heightAt(x, z), z);
      a.vx = a.vz = a.vy = 0;
      // The spot is on the ground: a winged animal that was in the air is not any more.
      a.flying = false;
      a.altitude = 0;
      if (yaw !== undefined) {
        a.yaw = yaw;
        app.cam.snap(yaw);
      }
    },
    lookAt(x: number, z: number) {
      const g = app.game;
      if (!g) return;
      const a = g.player.actor;
      const yaw = Math.atan2(x - a.pos.x, z - a.pos.z);
      a.yaw = yaw;
      app.cam.snap(yaw);
    },
    grantXp(amount: number) {
      app.game?.growth.gainXp(amount);
    },
    addGrowth(amount: number) {
      const g = app.game;
      if (!g) return;
      addGrowth(g.growth.progress, amount);
      g.events.emit('progress', null);
    },
    /** The trees that bear fruit or nuts, with their positions. */
    treatTrees() {
      return app.game?.trees.treatTrees() ?? [];
    },
    /** The animals behind the title screen, or null while a game is running. */
    titleAnimals() {
      return app.titleLife?.snapshot() ?? null;
    },
    /** Runs the title-screen animals for `seconds` without waiting for frames. */
    advanceTitle(seconds: number, dt = 1 / 30) {
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) app.titleLife?.update(dt);
    },
    /** 0 = midnight, 0.5 = noon. */
    setTimeOfDay(time: number) {
      app.sky.setTime(time);
      app.world.setUnlitTint(app.sky.unlitTint);
    },
    setHp(hp: number) {
      const g = app.game;
      if (g) g.player.actor.hp = hp;
    },
    state() {
      const g = app.game;
      const sky = { timeOfDay: app.sky.time, phase: app.sky.state.phase, daylight: app.sky.state.daylight };
      if (!g) return { screen: app.screen, ...sky };
      const a = g.player.actor;
      const p = g.growth.progress;
      return {
        screen: app.screen,
        ...sky,
        time: g.clock.time,
        prompt: g.prompt,
        gateOpen: g.world.isGateOpen(),
        // How much of its daytime sight the player has (1 = all), and the fog's far distance in metres.
        vision: { sight: g.vision.sight, fog: g.vision.fog, fogFar: (app.scene.fog as { far?: number } | null)?.far ?? 0 },
        species: g.growth.profile.speciesId,
        variant: g.growth.profile.variantId,
        slot: g.slot,
        ruled: [...g.growth.profile.ruledBiomes],
        unlocked: [...g.growth.profile.unlockedBiomes],
        player: {
          x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw,
          hp: a.hp, maxHp: a.stats.maxHealth, stamina: a.stamina, maxStamina: a.stats.stamina,
          damage: a.stats.damage, moveSpeed: a.stats.moveSpeed, defense: a.stats.defense, size: a.stats.size,
          speed: Math.hypot(a.vx, a.vz), alive: a.alive, dead: g.player.dead, safe: g.world.inRefuge(a.pos.x, a.pos.z), grounded: a.grounded, swimming: a.swimming, wet: a.wet, flying: a.flying, altitude: a.altitude, vy: a.vy, invuln: a.invuln,
          level: p.level, xp: p.xp, abilityPoints: p.abilityPoints, stage: p.stage, growth: p.growth,
          ranks: { ...p.abilityRanks },
          mods: g.player.activeMods.map((m) => `${m.stat}:${m.pct}`),
          cooldowns: g.player.abilities.slots.map((s) => s.cooldown),
          abilities: g.player.abilities.slots.map((s) => s.def.id),
          buffs: a.buffs.map((b) => b.id),
        },
        enemies: g.spawner.enemies.map((e) => ({
          id: e.id, kind: e.def.id, level: e.level, x: e.pos.x, z: e.pos.z, hp: e.hp, maxHp: e.stats.maxHealth,
          state: e.state, drinking: e.drinking, calm: e.calm, provoked: e.provoked, alive: e.alive, boss: e.isBoss, stun: e.stun, slow: e.slowTime, bleeds: e.bleeds.length,
          dist: e.distanceTo(a),
        })),
        food: g.food.items.map((f) => ({ kind: f.kind, x: f.pos.x, z: f.pos.z, available: f.available, label: f.label, reserve: f.reserve })),
      };
    },
  };
  (window as unknown as { __beast: typeof api }).__beast = api;
}
