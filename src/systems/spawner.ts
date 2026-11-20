import type * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import type { BossDef, BossSummon, EnemyDef, SpawnZoneDef } from '../core/types.ts';
import { getEnemy } from '../data/enemies.ts';
import { TUNING } from '../data/tuning.ts';
import { isGuardZone } from '../logic/foxReserve.ts';
import type { BiomeWorld } from '../world/world.ts';
import { EnemyActor } from './ai.ts';

const DEATH_SECONDS = 1.8;

/** Creates wild animals in their spawn zones, removes the dead and respawns them later. */
export class Spawner {
  enemies: EnemyActor[] = [];
  boss: EnemyActor | null = null;

  private scene: THREE.Scene;
  private world: BiomeWorld;
  private rand: () => number;
  private clock: { time: number };
  private respawns: { zone: SpawnZoneDef; at: number }[] = [];

  constructor(scene: THREE.Scene, world: BiomeWorld, rand: () => number, clock: { time: number }) {
    this.scene = scene;
    this.world = world;
    this.rand = rand;
    this.clock = clock;
  }

  spawnZones(zones: SpawnZoneDef[]): void {
    for (const zone of zones) for (let i = 0; i < zone.count; i++) this.spawnInZone(zone, null);
  }

  private create(def: EnemyDef, level: number, sizeScale: number, isBoss: boolean, zone: SpawnZoneDef | null): EnemyActor {
    const size = def.baseStats.size * sizeScale;
    const model = createAnimalModel({ body: def.body, colors: def.colors, features: def.features, size, headScale: 1, rig: def.rig });
    const E = TUNING.enemies;
    // Bosses use their listed stats as-is; wild animals scale with level.
    const mods = isBoss
      ? []
      : [
          { stat: 'maxHealth' as const, pct: E.levelHealthPct * (level - 1) },
          { stat: 'damage' as const, pct: E.levelDamagePct * (level - 1) },
        ];
    const enemy = new EnemyActor(def, model, () => ({ base: def.baseStats, sizeScale, powerMult: 1, levelBonus: 0, mods }), isBoss, zone);
    enemy.level = level;
    // The guards of a fox food reserve ignore the player until the reserve is raided.
    enemy.calm = isGuardZone(zone);
    this.scene.add(model.root);
    this.enemies.push(enemy);
    return enemy;
  }

  private place(e: EnemyActor, x: number, z: number): void {
    e.homeX = x;
    e.homeZ = z;
    e.pos.set(x, this.world.heightAt(x, z), z);
    e.yaw = this.rand() * Math.PI * 2;
    e.timer = this.rand() * 3;
    e.syncModel(0);
  }

  /** Spawns one animal in a zone, away from `avoid` (the player) when possible. */
  spawnInZone(zone: SpawnZoneDef, avoid: THREE.Vector3 | null): EnemyActor {
    const def = getEnemy(zone.enemyId);
    const level = zone.levelMin + Math.floor(this.rand() * (zone.levelMax - zone.levelMin + 1));
    const e = this.create(def, level, 1 + (level - zone.levelMin) * 0.04, false, zone);
    let x = zone.x;
    let z = zone.z;
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = Math.sqrt(this.rand()) * zone.radius;
      const cx = zone.x + Math.cos(a) * d;
      const cz = zone.z + Math.sin(a) * d;
      if (this.world.waterDepth(cx, cz) > 0 || this.world.colliders.blocked(cx, cz, 1)) continue;
      // The cave is built over, so only its own nest may stand inside it.
      const clear = this.world.isOpenGround(cx, cz, 1) || (zone.lair === true && this.world.inCave(cx, cz));
      if (!clear || this.world.inRefuge(cx, cz, 2)) continue;
      x = cx;
      z = cz;
      if (!avoid || Math.hypot(cx - avoid.x, cz - avoid.z) > 28) break;
    }
    this.place(e, x, z);
    // A guard of a fox food reserve (or a lair) calls the middle of it home, not the spot it happened to appear at.
    if (isGuardZone(zone)) {
      e.homeX = zone.x;
      e.homeZ = zone.z;
    }
    return e;
  }

  spawnBoss(def: BossDef): EnemyActor {
    const { arena } = this.world.layout;
    const boss = this.create(def.enemy, def.level, 1, true, null);
    boss.name = def.enemy.name;
    this.place(boss, arena.x, arena.z);
    boss.yaw = 0;
    this.boss = boss;
    return boss;
  }

  /** How many of the boss's called pack are alive. */
  summonsAlive(): number {
    return this.enemies.filter((e) => e.summoned && e.alive).length;
  }

  /**
   * The boss calls its pack: `rule.count` animals appear a few metres from it inside its arena and go straight for the player.
   * They belong to no zone, so none of them ever comes back, and they give no XP (see `Game`).
   */
  callSummons(rule: BossSummon): EnemyActor[] {
    const boss = this.boss;
    if (!boss) return [];
    const def = getEnemy(rule.enemyId);
    const { arena } = this.world.layout;
    const called: EnemyActor[] = [];
    for (let i = 0; i < rule.count; i++) {
      const level = rule.levelMin + Math.floor(this.rand() * (rule.levelMax - rule.levelMin + 1));
      const e = this.create(def, level, 1 + (level - rule.levelMin) * 0.04, false, null);
      // Spread round the boss, 5 to 9 m out, on open ground in the arena.
      let x = boss.pos.x;
      let z = boss.pos.z;
      const start = this.rand() * Math.PI * 2;
      for (let k = 0; k < 12; k++) {
        const a = start + (i / rule.count) * Math.PI * 2 + k * 0.5;
        const d = 5 + this.rand() * 4;
        const cx = boss.pos.x + Math.cos(a) * d;
        const cz = boss.pos.z + Math.sin(a) * d;
        if (Math.hypot(cx - arena.x, cz - arena.z) > arena.radius - 1) continue;
        if (this.world.waterDepth(cx, cz) > 0 || this.world.colliders.blocked(cx, cz, 1)) continue;
        x = cx;
        z = cz;
        break;
      }
      this.place(e, x, z);
      // They fight for the boss: home is the arena, and they chase the player from the start.
      e.homeX = boss.homeX;
      e.homeZ = boss.homeZ;
      e.summoned = true;
      e.calm = false;
      e.provoked = true;
      e.state = 'chase';
      called.push(e);
    }
    return called;
  }

  /** An animal that belongs to no zone (a leopard seal): it appears here and never comes back by itself once gone. */
  spawnLoose(enemyId: string, x: number, z: number, level: number): EnemyActor {
    const e = this.create(getEnemy(enemyId), level, 1, false, null);
    this.place(e, x, z);
    e.calm = false;
    return e;
  }

  /** Takes an animal away without a death (a leopard seal sinking back under the ice). */
  remove(e: EnemyActor): void {
    e.model.dispose();
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  /** The fight is over: the called pack goes at once (no death, no XP, no carcass). */
  dismissSummons(): void {
    for (const e of this.enemies) if (e.summoned) e.model.dispose();
    this.enemies = this.enemies.filter((e) => !e.summoned);
  }

  /** Sends the boss home at full health (after the player dies or leaves). */
  resetBoss(): void {
    const b = this.boss;
    if (!b || !b.alive) return;
    b.clearStatuses();
    b.refreshStats(true);
    b.state = 'return';
    b.attack = null;
    b.anim.windupT = -1;
    b.anim.warn = 0;
    b.cooldowns = {};
  }

  /** Call when an enemy dies: schedules its removal and (for zone animals) a respawn. */
  onDeath(e: EnemyActor): void {
    e.vx = e.vz = 0;
    e.anim.windupT = -1;
    e.anim.warn = 0;
    e.anim.hitFlash = 0;
    e.removeAt = this.clock.time + DEATH_SECONDS;
    if (e.zone) this.respawns.push({ zone: e.zone, at: this.clock.time + (e.zone.respawnSeconds ?? TUNING.enemies.respawnSeconds) });
  }

  update(playerPos: THREE.Vector3): void {
    const now = this.clock.time;
    let removed = false;
    for (const e of this.enemies) {
      if (e.alive) continue;
      e.anim.deathT = Math.min(1, (now - e.deathTime) / DEATH_SECONDS);
      if (now >= e.removeAt) {
        e.model.dispose();
        removed = true;
        if (e === this.boss) this.boss = null;
      }
    }
    if (removed) this.enemies = this.enemies.filter((e) => e.alive || now < e.removeAt);

    if (this.respawns.length && this.respawns.some((r) => now >= r.at)) {
      for (const r of this.respawns) if (now >= r.at) this.spawnInZone(r.zone, playerPos);
      this.respawns = this.respawns.filter((r) => now < r.at);
    }
  }

  dispose(): void {
    for (const e of this.enemies) e.model.dispose();
    this.enemies = [];
    this.boss = null;
    this.respawns = [];
  }
}
