import type * as THREE from 'three';
import { EventBus } from '../core/events.ts';
import type { BiomeId, BossDef, FoodKind } from '../core/types.ts';
import { mulberry32 } from '../core/math.ts';
import { BIOMES, BIOME_LAYOUTS, nextBiome, previousBiome, spawnsOf } from '../data/biomes.ts';
import { getBoss } from '../data/bosses.ts';
import { CAVE_FOOD, FOODS, TREE_FOOD, canEat } from '../data/food.ts';
import { TUNING } from '../data/tuning.ts';
import { describeMod } from '../logic/biome.ts';
import { withinEatingHeight } from '../logic/flight.ts';
import { foxesToProvoke } from '../logic/foxReserve.ts';
import { nightVisionFactor } from '../logic/vision.ts';
import { enemyXp, growthNeeded } from '../logic/progression.ts';
import { playerIsUnseen } from '../logic/stealth.ts';
import { withArticle } from '../logic/text.ts';
import type { Actor } from '../systems/actor.ts';
import { EnemyActor, updateEnemy } from '../systems/ai.ts';
import type { ThirdPersonCamera } from '../systems/camera.ts';
import { Combat } from '../systems/combat.ts';
import { FoodSystem } from '../systems/food.ts';
import type { FoodItem } from '../systems/food.ts';
import { Fx } from '../systems/fx.ts';
import type { Arrival, GameEvents } from '../systems/gameEvents.ts';
import { Growth } from '../systems/growth.ts';
import type { Profile } from '../systems/growth.ts';
import type { Input } from '../systems/input.ts';
import { PlayerController } from '../systems/player.ts';
import { writeSave } from '../systems/save.ts';
import { Spawner } from '../systems/spawner.ts';
import { TreeFoodSystem } from '../systems/treeFood.ts';
import { Hud } from '../ui/hud.ts';
import { WorldLabels } from '../ui/worldLabels.ts';
import type { BiomeWorld } from '../world/world.ts';
import type { Sky } from '../world/sky.ts';

/** What the E prompt calls each kind of tree food. */
const TREE_LABELS = { leaf: 'leaves', fruit: 'fruit', nut: 'nuts' } as const;

export interface GameContext {
  scene: THREE.Scene;
  world: BiomeWorld;
  sky: Sky;
  cam: ThirdPersonCamera;
  input: Input;
  ui: HTMLElement;
  /** Takes the animal to another biome, arriving through that biome's gate (the app builds the new world). */
  travel: (biome: BiomeId, arrival: Arrival) => void;
}

export interface Prompt {
  key: string;
  text: string;
}

/** One play session: owns every system and runs the update loop. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly clock = { time: 0 };
  readonly world: BiomeWorld;
  readonly sky: Sky;
  readonly growth: Growth;
  readonly player: PlayerController;
  readonly spawner: Spawner;
  readonly food: FoodSystem;
  /** Leaves, fruit and nuts on the trees. */
  readonly trees: TreeFoodSystem;
  readonly combat: Combat;
  readonly fx: Fx;
  readonly hud: Hud;
  readonly labels: WorldLabels;
  /** What the E key would do right now (shown on the HUD). */
  prompt: Prompt | null = null;
  /** How much of its daytime sight the player has right now (1 = all of it): the tag range and the fog distance. */
  readonly vision = { sight: 1, fog: 1 };

  private ctx: GameContext;
  private actors: Actor[] = [];
  private rand = mulberry32((Date.now() & 0xffff) + 17);
  private bossDef: BossDef | null = null;
  private dirty = false;
  private lastSave = 0;

  /** The save slot (1 to 4) this animal lives in; every save goes there. null is the admin sandbox, which saves nothing. */
  readonly slot: number | null;

  /** `arrival` is how the animal comes into the biome: waking at the den, or through a gate from the biome next door. */
  constructor(ctx: GameContext, profile: Profile, slot: number | null, arrival: Arrival = 'den') {
    this.ctx = ctx;
    this.slot = slot;
    this.world = ctx.world;
    this.sky = ctx.sky;
    const { scene, world, input, cam } = ctx;

    this.growth = new Growth(profile, this.events);
    this.combat = new Combat(() => this.actors, this.events, this.clock);
    this.fx = new Fx(scene);
    const start = arrival === 'den' ? world.layout.playerSpawn : world.gateSpot(arrival);
    this.player = new PlayerController({
      scene, world, input, cam, combat: this.combat, fx: this.fx, growth: this.growth, events: this.events, clock: this.clock, start,
    });
    this.spawner = new Spawner(scene, world, this.rand, this.clock);
    // Rival predators of the player's own species are left out.
    this.spawner.spawnZones(spawnsOf(world.biome.id).filter((zone) => zone.rivalOf !== profile.speciesId));
    this.food = new FoodSystem(scene, world, this.rand, this.clock);
    this.trees = new TreeFoodSystem(scene, world, this.clock);

    // The boss is back every time the player enters the biome, even after it has been beaten.
    // A ruled biome stays ruled and its gate stays open.
    world.setGateOpen(profile.ruledBiomes.includes(world.biome.id));
    this.bossDef = world.biome.bossId ? getBoss(world.biome.bossId) : null;
    if (this.bossDef) this.spawner.spawnBoss(this.bossDef);

    this.hud = new Hud(ctx.ui, this);
    this.labels = new WorldLabels(ctx.ui);
    this.wireEvents();

    cam.snap(start.yaw);
    this.refreshActors();
    this.player.actor.syncModel(0);
    if (arrival === 'den') {
      this.events.emit('toast', { text: `You are a ${this.growth.variant.name}. Hunt, eat and grow.`, tone: 'info' });
    } else {
      // Through a gate: say where this is, and what the biome does to this kind of animal.
      const mods = this.player.activeMods;
      this.events.emit('banner', {
        title: `The ${world.biome.name}`,
        subtitle: mods.length > 0 ? `${this.growth.variant.name}: ${mods.map(describeMod).join(', ')}` : 'Your kind has no advantage or weakness here.',
      });
    }
  }

  private wireEvents(): void {
    const ev = this.events;
    const cam = this.ctx.cam.camera;
    const playerActor = this.player.actor;

    ev.on('damage', ({ target, amount, kind, ambush }) => {
      if (target instanceof EnemyActor) target.onDamaged();
      // Hurting one snake of the nest wakes all of them.
      if (target instanceof EnemyActor && target.zone?.lair) this.wakeLair(target.pos, 'The whole nest stirs!');
      const cls = target === playerActor ? 'hurt' : kind === 'bleed' ? 'bleed' : ambush ? 'ambush' : '';
      this.labels.number(cam, target.pos, target.model.height, ambush ? `${amount}!` : String(amount), cls);
    });
    ev.on('dodged', ({ target }) => this.labels.number(cam, target.pos, target.model.height, 'Dodged', 'miss'));
    ev.on('heal', ({ target, amount }) => this.labels.number(cam, target.pos, target.model.height, `+${amount}`, 'heal'));

    ev.on('death', ({ actor }) => {
      if (actor === playerActor) {
        // Dying costs levels, and a second death before the next level costs a life stage. It is
        // applied and saved right away, so closing the game on the death screen cannot undo it.
        // Ruled biomes are kept.
        this.player.onDeath(this.growth.penalizeDeath());
        this.save();
        // Dying mid-fight also sends the boss home at full health.
        this.spawner.resetBoss();
        return;
      }
      if (!(actor instanceof EnemyActor)) return;
      this.spawner.onDeath(actor);
      this.food.dropCarcass(actor.pos, actor.def.carcassGrowth, actor.stats.size);
      // Only the first win over a boss pays its full XP; later wins pay the small repeat amount.
      const repeatWin = actor.isBoss && this.growth.profile.ruledBiomes.includes(this.world.biome.id);
      const xp = repeatWin && this.bossDef ? this.bossDef.repeatXp : enemyXp(actor.def.xp, actor.isBoss ? 1 : actor.level);
      this.growth.gainXp(xp);
      if (actor.isBoss) this.bossDefeated(actor, repeatWin, xp);
    });

    ev.on('progress', () => (this.dirty = true));
  }

  private bossDefeated(boss: EnemyActor, repeatWin: boolean, xp: number): void {
    const biome = this.world.biome;
    if (repeatWin) {
      // The biome is already ruled, so there is nothing new to unlock.
      this.events.emit('toast', { text: `${boss.name} defeated again: +${xp} XP. It will be back when you return to the ${biome.name}.`, tone: 'good' });
      return;
    }
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
    const awakeStates: string[] = [];
    for (const e of this.spawner.enemies) {
      // Distant animals are hidden and stop thinking (the boss always stays awake).
      const awake = e.isBoss || e.distanceTo(pa) < TUNING.enemies.sleepDistance;
      e.model.root.visible = awake;
      if (awake) updateEnemy(e, dt, ai);
      if (awake && e.alive) awakeStates.push(e.state);
    }
    // The Tiger's Stalk works while no awake animal has noticed the player.
    this.player.setUnseen(playerIsUnseen(awakeStates));

    this.separate();
    this.combat.update(dt, pa);
    this.spawner.update(pa.pos);
    // A fish swims away from the player only when the player is wading or swimming (a flier skimming the pond does not scare it).
    this.food.update(dt, pa.wet && pa.alive && !pa.flying ? pa.pos : null);
    this.trees.update();
    this.fx.update(dt);
    this.interact();

    pa.syncModel(dt);
    for (const e of this.spawner.enemies) if (e.model.root.visible) e.syncModel(dt);

    cam.update(dt, pa.pos, pa.model.height, pa.stats.size, world.heightAt, world.colliders);
    world.update(this.clock.time, cam.camera.position);
    sky.advance(dt);
    world.setUnlitTint(sky.unlitTint);
    sky.update(cam.camera.position, pa.pos);
    // An animal with limited night vision (the Bald Eagle) sees less as it gets dark: the fog closes in
    // and the level tags reach less far.
    const nightVision = this.growth.variant.nightVision;
    this.vision.sight = nightVision ? nightVisionFactor(nightVision.sight, sky.state.daylight) : 1;
    this.vision.fog = nightVision ? nightVisionFactor(nightVision.fog, sky.state.daylight) : 1;
    sky.setVisibility(this.vision.fog);

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
        // Bosses, and animals in the middle of a charge, are not pushed by what they run into.
        const wa = a.heavy || a.plowing ? 0 : b.heavy || b.plowing ? 1 : 0.5;
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

    // A flier must come down to eat: an eagle can take a fish by skimming the water, not from 20 m up.
    const lowEnough = withinEatingHeight(pa.flying ? pa.altitude : 0, TUNING.flight.eatAltitude);
    const item = lowEnough ? this.food.nearest(pa.pos, TUNING.food.eatRange + pa.radius) : null;
    if (item) {
      const name = (item.label ?? FOODS[item.kind].name).toLowerCase();
      if (canEat(this.growth.species.diet, item.kind)) {
        this.prompt = { key: 'E', text: `Eat ${name}` };
        if (pressed) this.eat(item);
      } else {
        const who = withArticle(this.growth.species.name.toLowerCase());
        this.prompt = { key: '', text: `${who[0].toUpperCase()}${who.slice(1)} cannot eat ${name}` };
      }
      return;
    }

    // Leaves, fruit and nuts on the trees: only for plant-eaters (a wolf walking past gets no prompt at every tree).
    const tree = lowEnough ? this.trees.nearest(pa.pos, TUNING.food.eatRange + pa.radius) : -1;
    if (tree >= 0) {
      const pick = this.trees.pick(tree);
      if (pick && canEat(this.growth.species.diet, pick)) {
        // A palm's nuts are coconuts.
        const label = pick === 'nut' && this.world.layout.style === 'jungle' ? 'coconuts' : TREE_LABELS[pick];
        this.prompt = { key: 'E', text: `Eat ${label}` };
        if (pressed) {
          this.trees.take(tree, pick);
          this.eatKind(pick, TREE_FOOD[pick].growth, `${label[0].toUpperCase()}${label.slice(1)}`);
        }
        return;
      }
    }

    const here = this.world.biome;
    const at = this.world.gateAt(pa.pos.x, pa.pos.z);
    if (at === 'onward') {
      const next = nextBiome(here.id);
      if (!next) return;
      const nextName = BIOMES[next].name;
      if (!this.world.isGateOpen()) {
        this.prompt = { key: '', text: `Sealed. Defeat the ${here.name} boss to open this gate.` };
      } else if (BIOME_LAYOUTS[next]) {
        this.prompt = { key: 'E', text: `Enter the ${nextName}` };
        // An animal that goes on arrives through the next biome's gate back.
        if (pressed) this.ctx.travel(next, 'return');
      } else {
        this.prompt = { key: 'E', text: `Enter the ${nextName}` };
        if (pressed) {
          // TODO(M3): the Plains and Winter are not built yet.
          this.events.emit('toast', { text: `The way to the ${nextName} is not open yet. The ${here.name} is yours for now.`, tone: 'info' });
        }
      }
    } else if (at === 'return') {
      const back = previousBiome(here.id);
      if (!back) return;
      this.prompt = { key: 'E', text: `Return to the ${BIOMES[back].name}` };
      // An animal that goes back arrives at the gate it once left by.
      if (pressed) this.ctx.travel(back, 'onward');
    }
  }

  private eat(item: FoodItem): void {
    this.eatKind(item.kind, item.growth, item.label ?? FOODS[item.kind].name);
    this.food.consume(item);
    if (item.reserve !== undefined) this.raidReserve(item);
    if (item.bait) this.wakeLair(item.pos, 'The snakes of the cave rear up: you took their bait!');
  }

  /** Wakes every calm animal of a lair within range of `at`: they all attack. `text` is what the player is told. */
  private wakeLair(at: { x: number; z: number }, text: string): void {
    const guards = this.spawner.enemies.filter((e) => e.zone?.lair && e.calm).map((e) => ({ x: e.pos.x, z: e.pos.z, alive: e.alive, enemy: e }));
    const woken = foxesToProvoke(guards, at, CAVE_FOOD.provokeRange);
    for (const { enemy } of woken) {
      enemy.calm = false;
      enemy.provoked = true;
      if (enemy.state === 'idle' || enemy.state === 'wander' || enemy.state === 'return') enemy.state = 'chase';
    }
    if (woken.length > 0) this.events.emit('toast', { text, tone: 'bad' });
  }

  /** Eating from a fox food reserve angers every fox within range: they all attack. */
  private raidReserve(item: FoodItem): void {
    const foxes = this.spawner.enemies.filter((e) => e.def.id === 'fox').map((e) => ({ x: e.pos.x, z: e.pos.z, alive: e.alive, enemy: e }));
    const angry = foxesToProvoke(foxes, item.pos, TREE_FOOD.provokeRange);
    for (const { enemy } of angry) {
      enemy.calm = false;
      enemy.provoked = true;
      if (enemy.state === 'idle' || enemy.state === 'wander' || enemy.state === 'return') enemy.state = 'chase';
    }
    if (angry.length > 0) this.events.emit('toast', { text: 'The foxes guarding the food are furious!', tone: 'bad' });
  }

  /** Feeds the growth meter, heals, and says what was eaten. */
  private eatKind(kind: FoodKind, growth: number, name: string): void {
    const pa = this.player.actor;
    const before = this.growth.progress.growth;
    const healPct = this.growth.eat(kind, growth);
    const gained = Math.round(this.growth.progress.growth - before);

    const heal = Math.round(Math.min(pa.stats.maxHealth - pa.hp, pa.stats.maxHealth * healPct));
    if (heal > 0) {
      pa.hp += heal;
      this.events.emit('heal', { target: pa, amount: heal });
    }
    let text = `${name}: +${gained} growth`;
    // An Alpha is fully grown and has no growth meter to fill.
    if (gained <= 0) text = growthNeeded(this.growth.progress.stage) === null ? `${name} eaten.` : `${name} eaten. Growth meter is full.`;
    this.events.emit('toast', { text, tone: 'good' });
  }

  /** Updates HUD and labels. Runs every frame, even while paused. */
  present(): void {
    this.hud.update();
    this.labels.update(this.ctx.cam.camera, this.spawner.enemies, this.player.actor, this.growth.progress.level, this.growth.getPassives().revealRange, this.vision.sight);
  }

  save(): boolean {
    this.dirty = false;
    this.lastSave = this.clock.time;
    // The admin sandbox never touches the player's slots.
    if (this.slot === null) return true;
    return writeSave(this.slot, this.growth.profile);
  }

  /** True once the biome the player is in has been ruled (its gate is open). */
  get biomeRuled(): boolean {
    return this.growth.profile.ruledBiomes.includes(this.world.biome.id);
  }

  /** Admin sandbox only: rules the current biome (opening its gate) or takes the rule away. */
  adminSetRuled(ruled: boolean): void {
    const id = this.world.biome.id;
    this.growth.adminSetRuled(id, nextBiome(id), ruled);
    this.world.setGateOpen(ruled);
  }

  dispose(): void {
    this.save();
    // The sky is shared with the title screen and the next game: give it back its normal view distance.
    this.sky.setVisibility(1);
    this.events.clear();
    this.hud.dispose();
    this.labels.dispose();
    this.player.dispose();
    this.spawner.dispose();
    this.food.dispose();
    this.trees.dispose();
    this.fx.dispose();
  }
}
