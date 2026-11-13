import type * as THREE from 'three';
import { EventBus } from '../core/events.ts';
import { mulberry32 } from '../core/math.ts';
import { BIOMES, FOREST_SPAWNS, nextBiome } from '../data/biomes.ts';
import { getBoss } from '../data/bosses.ts';
import { FOODS, canEat } from '../data/food.ts';
import { TUNING } from '../data/tuning.ts';
import { enemyXp, evolveStatus } from '../logic/progression.ts';
import type { Actor } from '../systems/actor.ts';
import { EnemyActor, updateEnemy } from '../systems/ai.ts';
import type { ThirdPersonCamera } from '../systems/camera.ts';
import { Combat } from '../systems/combat.ts';
import { FoodSystem } from '../systems/food.ts';
import type { FoodItem } from '../systems/food.ts';
import { Fx } from '../systems/fx.ts';
import type { GameEvents } from '../systems/gameEvents.ts';
import { Growth } from '../systems/growth.ts';
import type { Profile } from '../systems/growth.ts';
import type { Input } from '../systems/input.ts';
import { PlayerController } from '../systems/player.ts';
import { writeSave } from '../systems/save.ts';
import { Spawner } from '../systems/spawner.ts';
import { Hud } from '../ui/hud.ts';
import { WorldLabels } from '../ui/worldLabels.ts';
import type { ForestWorld } from '../world/forest.ts';
import type { Sky } from '../world/sky.ts';

export interface GameContext {
  scene: THREE.Scene;
  world: ForestWorld;
  sky: Sky;
  cam: ThirdPersonCamera;
  input: Input;
  ui: HTMLElement;
}

export interface Prompt {
  key: string;
  text: string;
}

/** One play session: owns every system and runs the update loop. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly clock = { time: 0 };
  readonly world: ForestWorld;
  readonly growth: Growth;
  readonly player: PlayerController;
  readonly spawner: Spawner;
  readonly food: FoodSystem;
  readonly combat: Combat;
  readonly fx: Fx;
  readonly hud: Hud;
  readonly labels: WorldLabels;
  /** What the E key would do right now (shown on the HUD). */
  prompt: Prompt | null = null;

  private ctx: GameContext;
  private actors: Actor[] = [];
  private rand = mulberry32((Date.now() & 0xffff) + 17);
  private dirty = false;
  private lastSave = 0;

  constructor(ctx: GameContext, profile: Profile) {
    this.ctx = ctx;
    this.world = ctx.world;
    const { scene, world, input, cam } = ctx;

    this.growth = new Growth(profile, this.events);
    this.combat = new Combat(() => this.actors, this.events, this.clock);
    this.fx = new Fx(scene);
    this.player = new PlayerController({
      scene, world, input, cam, combat: this.combat, fx: this.fx, growth: this.growth, events: this.events, clock: this.clock,
    });
    this.spawner = new Spawner(scene, world, this.rand, this.clock);
    this.spawner.spawnZones(FOREST_SPAWNS);
    this.food = new FoodSystem(scene, world, this.rand, this.clock);

    // The boss stays dead once its biome is ruled; the gate stays open.
    const ruled = profile.ruledBiomes.includes(world.biome.id);
    world.setGateOpen(ruled);
    if (!ruled && world.biome.bossId) this.spawner.spawnBoss(getBoss(world.biome.bossId));

    this.hud = new Hud(ctx.ui, this);
    this.labels = new WorldLabels(ctx.ui);
    this.wireEvents();

    cam.snap(world.layout.playerSpawn.yaw);
    this.refreshActors();
    this.player.actor.syncModel(0);
    this.events.emit('toast', { text: `You are a ${this.growth.variant.name}. Hunt, eat and grow.`, tone: 'info' });
  }

  private wireEvents(): void {
    const ev = this.events;
    const cam = this.ctx.cam.camera;
    const playerActor = this.player.actor;

    ev.on('damage', ({ target, amount, kind }) => {
      if (target instanceof EnemyActor) target.onDamaged();
      const cls = target === playerActor ? 'hurt' : kind === 'bleed' ? 'bleed' : '';
      this.labels.number(cam, target.pos, target.model.height, String(amount), cls);
    });
    ev.on('dodged', ({ target }) => this.labels.number(cam, target.pos, target.model.height, 'Dodged', 'miss'));
    ev.on('heal', ({ target, amount }) => this.labels.number(cam, target.pos, target.model.height, `+${amount}`, 'heal'));

    ev.on('death', ({ actor }) => {
      if (actor === playerActor) {
        this.player.onDeath();
        // Dying mid-fight resets the boss; the player never loses a level or life stage.
        this.spawner.resetBoss();
        return;
      }
      if (!(actor instanceof EnemyActor)) return;
      this.spawner.onDeath(actor);
      this.food.dropCarcass(actor.pos, actor.def.carcassGrowth, actor.stats.size);
      this.growth.gainXp(enemyXp(actor.def.xp, actor.isBoss ? 1 : actor.level));
      if (actor.isBoss) this.ruleBiome();
    });

    ev.on('progress', () => (this.dirty = true));
  }

  private ruleBiome(): void {
    const biome = this.world.biome;
    const next = nextBiome(biome.id);
    this.growth.ruleBiome(biome.id, next);
    this.world.setGateOpen(true);
    this.events.emit('biomeRuled', { biome: biome.id });
    this.events.emit('banner', {
      title: `${biome.name} Ruled`,
      subtitle: next ? `The gate to the ${BIOMES[next].name} is open.` : 'Every biome is yours.',
    });
    this.save();
  }

  private refreshActors(): void {
    this.actors = [this.player.actor, ...this.spawner.enemies];
  }

  /** Advances the simulation by `dt` seconds. */
  update(dt: number): void {
    const { input, cam, world, sky } = this.ctx;
    this.clock.time += dt;
    const pa = this.player.actor;

    const mouse = input.takeMouse();
    cam.applyMouse(mouse.dx, mouse.dy);

    this.refreshActors();
    this.player.update(dt);

    const ai = { player: pa, world, combat: this.combat, fx: this.fx, rand: this.rand };
    for (const e of this.spawner.enemies) {
      // Distant animals are hidden and stop thinking (the boss always stays awake).
      const awake = e.isBoss || e.distanceTo(pa) < TUNING.enemies.sleepDistance;
      e.model.root.visible = awake;
      if (awake) updateEnemy(e, dt, ai);
    }

    this.separate();
    this.combat.update(dt, pa);
    this.spawner.update(pa.pos);
    this.food.update();
    this.fx.update(dt);
    this.interact();

    pa.syncModel(dt);
    for (const e of this.spawner.enemies) if (e.model.root.visible) e.syncModel(dt);

    cam.update(dt, pa.pos, pa.model.height, pa.stats.size, world.heightAt);
    world.update(this.clock.time, cam.camera.position);
    sky.update(cam.camera.position, pa.pos);

    if (this.dirty && this.clock.time - this.lastSave > 1) this.save();
    else if (this.clock.time - this.lastSave > TUNING.save.autosaveSeconds) this.save();
    input.endStep();
  }

  /** Keeps animals from standing inside each other. */
  private separate(): void {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        const wa = a.heavy ? 0 : b.heavy ? 1 : 0.5;
        a.pos.x -= dx * push * wa;
        a.pos.z -= dz * push * wa;
        b.pos.x += dx * push * (1 - wa);
        b.pos.z += dz * push * (1 - wa);
      }
    }
  }

  /** Works out the current E-key prompt (food, gate) and handles the key. */
  private interact(): void {
    const pa = this.player.actor;
    this.prompt = null;
    if (this.player.dead) return;
    const pressed = this.ctx.input.consume('KeyE');

    const item = this.food.nearest(pa.pos, TUNING.food.eatRange + pa.radius);
    if (item) {
      const name = FOODS[item.kind].name.toLowerCase();
      if (canEat(this.growth.species.diet, item.kind)) {
        this.prompt = { key: 'E', text: `Eat ${name}` };
        if (pressed) this.eat(item);
      } else {
        this.prompt = { key: '', text: `A ${this.growth.species.name.toLowerCase()} cannot eat ${name}` };
      }
      return;
    }

    const { gate } = this.world.layout;
    if (Math.hypot(pa.pos.x - gate.x, pa.pos.z - (gate.z + 3)) < 6) {
      const next = nextBiome(this.world.biome.id);
      const nextName = next ? BIOMES[next].name : '';
      if (!this.world.isGateOpen()) {
        this.prompt = { key: '', text: `Sealed. Defeat the ${this.world.biome.name} boss to open this gate.` };
      } else {
        this.prompt = { key: 'E', text: `Enter the ${nextName}` };
        if (pressed) {
          // TODO(M3): travel to the next biome.
          this.events.emit('toast', { text: `The ${nextName} arrives in Milestone 3. The ${this.world.biome.name} is yours for now.`, tone: 'info' });
        }
      }
    }
  }

  private eat(item: FoodItem): void {
    const pa = this.player.actor;
    const before = this.growth.progress.growth;
    const healPct = this.growth.eat(item.kind, item.growth);
    const gained = Math.round(this.growth.progress.growth - before);
    this.food.consume(item);

    const heal = Math.round(Math.min(pa.stats.maxHealth - pa.hp, pa.stats.maxHealth * healPct));
    if (heal > 0) {
      pa.hp += heal;
      this.events.emit('heal', { target: pa, amount: heal });
    }
    const name = FOODS[item.kind].name;
    const evo = evolveStatus(this.growth.progress);
    let text = `${name}: +${gained} growth`;
    if (gained <= 0) text = evo.locked ? `${name} eaten. Alpha growth arrives in Milestone 2.` : `${name} eaten. Growth meter is full.`;
    this.events.emit('toast', { text, tone: 'good' });
  }

  /** Updates HUD and labels. Runs every frame, even while paused. */
  present(): void {
    this.hud.update();
    this.labels.update(this.ctx.cam.camera, this.spawner.enemies, this.player.actor, this.growth.progress.level);
  }

  save(): boolean {
    this.dirty = false;
    this.lastSave = this.clock.time;
    return writeSave(this.growth.profile);
  }

  dispose(): void {
    this.save();
    this.events.clear();
    this.hud.dispose();
    this.labels.dispose();
    this.player.dispose();
    this.spawner.dispose();
    this.food.dispose();
    this.fx.dispose();
  }
}
