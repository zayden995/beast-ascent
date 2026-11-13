import type * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import type { BossDef, EnemyDef, SpawnZoneDef } from '../core/types.ts';
import { getEnemy } from '../data/enemies.ts';
import { TUNING } from '../data/tuning.ts';
import type { ForestWorld } from '../world/forest.ts';
import { EnemyActor } from './ai.ts';

const DEATH_SECONDS = 1.8;

/** Creates wild animals in their spawn zones, removes the dead and respawns them later. */
export class Spawner {
  enemies: EnemyActor[] = [];
  boss: EnemyActor | null = null;

  private scene: THREE.Scene;
  private world: ForestWorld;
  private rand: () => number;
  private clock: { time: number };
  private respawns: { zone: SpawnZoneDef; at: number }[] = [];

  constructor(scene: THREE.Scene, world: ForestWorld, rand: () => number, clock: { time: number }) {
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
    const model = createAnimalModel({ body: def.body, colors: def.colors, features: def.features, size, headScale: 1 });
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
      if (!this.world.isOpenGround(cx, cz, 1) || this.world.inRefuge(cx, cz, 2)) continue;
      x = cx;
      z = cz;
      if (!avoid || Math.hypot(cx - avoid.x, cz - avoid.z) > 28) break;
    }
    this.place(e, x, z);
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
