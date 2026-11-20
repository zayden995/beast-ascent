import type * as THREE from 'three';
import { EventBus } from '../core/events.ts';
import type { BiomeId, BossDef, FoodKind, SpawnZoneDef } from '../core/types.ts';
import { PETS, PET_TUNING } from '../data/pets.ts';
import type { PetKind } from '../data/pets.ts';
import type { PetPhase } from '../logic/pet.ts';
import { mulberry32 } from '../core/math.ts';
import { iceWeight, sealDue, sealLeaves } from '../logic/ice.ts';
import { waveHits } from '../logic/wave.ts';
import type { IceStander } from '../logic/ice.ts';
import { BIOMES, BIOME_LAYOUTS, biomeName, nextBiome, previousBiome, spawnsOf } from '../data/biomes.ts';
import { getBoss } from '../data/bosses.ts';
import { CAVE_FOOD, FOODS, TREE_FOOD, canEat } from '../data/food.ts';
import { TUNING } from '../data/tuning.ts';
import { describeMod } from '../logic/biome.ts';
import { withinEatingHeight } from '../logic/flight.ts';
import { foxesToProvoke } from '../logic/foxReserve.ts';
import { lairWakes } from '../logic/lair.ts';
import { newSummonState, stepSummon } from '../logic/summon.ts';
import { newPoolSealState, stepPoolSeals } from '../logic/seal.ts';
import { nightVisionFactor } from '../logic/vision.ts';
import { enemyXp, growthNeeded } from '../logic/progression.ts';
import { playerIsUnseen } from '../logic/stealth.ts';
import { withArticle } from '../logic/text.ts';
import type { Actor } from '../systems/actor.ts';
import { EnemyActor, updateEnemy } from '../systems/ai.ts';
import type { Wave } from '../systems/ai.ts';
import type { ThirdPersonCamera } from '../systems/camera.ts';
import { Combat } from '../systems/combat.ts';
import { CompanionActor } from '../systems/companion.ts';
import { EggSystem } from '../systems/eggs.ts';
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
import { isPoolSeal, makePoolSeal, sealInWater, sealMind } from '../systems/seal.ts';
import { TreeFoodSystem } from '../systems/treeFood.ts';
import { Hud } from '../ui/hud.ts';
import { WorldLabels } from '../ui/worldLabels.ts';
import type { BiomeWorld } from '../world/world.ts';
import type { Sky } from '../world/sky.ts';

/** Where a new pet comes from, said when the pet dies. */
const NEW_EGG = "Beat the guards of a den on the Plains for a new egg.";

/** What the E prompt calls each kind of tree food. */
/** The cold of a hole in the ice is dealt in ticks this long (seconds), like a bleed. */
const COLD_TICK = 0.5;
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
  /** For a key that is held (tending the pet): how far the hold has got, 0 to 1. */
  progress?: number;
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
  /** The player's pet, or null (one per save slot; see the bible's "M3, the pet: design"). */
  pet: CompanionActor | null = null;
  /** The eggs in the dens (a den whose guards are all dead gives one, while the slot has no pet). */
  readonly eggs: EggSystem;
  /** What the E key would do right now (shown on the HUD). */
  prompt: Prompt | null = null;
  /** How much of its daytime sight the player has right now (1 = all of it): the tag range and the fog distance. */
  readonly vision = { sight: 1, fog: 1 };

  private ctx: GameContext;
  private actors: Actor[] = [];
  private rand = mulberry32((Date.now() & 0xffff) + 17);
  private bossDef: BossDef | null = null;
  /** Where the boss is in calling its pack (a boss with a `summon` rule only). */
  private summonState = newSummonState();
  private dirty = false;
  /** The player is holding E beside its injured pet (read by the pet's next step). */
  private tending = false;
  /** The player was hit since the pet's last step (a hit breaks off the tending). */
  private playerHit = false;
  private lastSave = 0;
  private lastCrackWarning = -999;
  private waves: Wave[] = [];
  private seals: { seal: EnemyActor; empty: number }[] = [];
  /** The mammoth's frozen pool: whether its next break brings seals up (see `logic/seal.ts`). */
  private poolSeals = newPoolSealState();
  /** Seconds since the mammoth last fought (its pool's seals go 2 s after the fight ends). */
  private poolFightOff = 0;

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
    // Every wild animal of the biome is met, rivals of the player's own species included (changed on 2026-11-18).
    this.spawner.spawnZones(spawnsOf(world.biome.id));
    this.food = new FoodSystem(scene, world, this.rand, this.clock);
    this.trees = new TreeFoodSystem(scene, world, this.clock);
    this.eggs = new EggSystem(scene, world, spawnsOf(world.biome.id));
    // The slot's pet comes along, beside the player; an injured one (saved on quitting) lies there with a fresh countdown.
    if (profile.pet) this.createPet(profile.pet.kind, profile.pet.injured ? 'injured' : 'healthy');

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
        title: biomeName(world.biome.id, true),
        subtitle: mods.length > 0 ? `${this.growth.variant.name}: ${mods.map(describeMod).join(', ')}` : 'Your kind has no advantage or weakness here.',
      });
    }
  }

  private wireEvents(): void {
    const ev = this.events;
    const cam = this.ctx.cam.camera;
    const playerActor = this.player.actor;

    ev.on('damage', ({ target, attacker, amount, kind, ambush }) => {
      if (target instanceof EnemyActor) target.onDamaged();
      // The pet joins a fight the player started; an animal remembers which of the two hit it last.
      if (target instanceof EnemyActor && attacker === playerActor) {
        target.lastPlayerHitAt = this.clock.time;
        target.lastHitBy = 'player';
      }
      if (target instanceof EnemyActor && attacker && attacker === this.pet) target.lastHitBy = 'pet';
      if (target === playerActor) this.playerHit = true;
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
      // A flier (a snowy owl) killed in the air falls to the ground.
      if (actor.flying) {
        actor.flying = false;
        actor.pos.y = this.world.heightAt(actor.pos.x, actor.pos.z);
      }
      this.spawner.onDeath(actor);
      // A boss's called pack gives no XP and leaves no carcass, so that it cannot be farmed.
      if (actor.summoned) return;
      // Some animals leave nothing to eat (a leopard seal sinks).
      if (actor.def.carcassGrowth > 0) this.food.dropCarcass(actor.pos, actor.def.carcassGrowth, actor.stats.size);
      // Only the first win over a boss pays its full XP; later wins pay the small repeat amount.
      const repeatWin = actor.isBoss && this.growth.profile.ruledBiomes.includes(this.world.biome.id);
      const xp = repeatWin && this.bossDef ? this.bossDef.repeatXp : enemyXp(actor.def.xp, actor.isBoss ? 1 : actor.level);
      this.growth.gainXp(xp);
      if (actor.isBoss) this.bossDefeated(actor, repeatWin, xp);
    });

    ev.on('progress', () => (this.dirty = true));
    // The pet wakes at the den with the player.
    ev.on('playerRespawned', () => this.pet?.wakeBeside(this.world));
  }

  private bossDefeated(boss: EnemyActor, repeatWin: boolean, xp: number): void {
    const biome = this.world.biome;
    if (repeatWin) {
      // The biome is already ruled, so there is nothing new to unlock.
      this.events.emit('toast', { text: `${boss.name} defeated again: +${xp} XP. It will be back when you return to ${biomeName(biome.id)}.`, tone: 'good' });
      return;
    }
    const next = nextBiome(biome.id);
    this.growth.ruleBiome(biome.id, next);
    this.world.setGateOpen(true);
    this.events.emit('biomeRuled', { biome: biome.id });
    this.events.emit('banner', {
      title: `${biome.name} Ruled`,
      // TODO(ending): when the last biome is ruled, the ending (a poacher, then credits) is still to be designed with the user.
      subtitle: next ? `The gate to ${biomeName(next)} is open.` : 'Every biome is yours.',
    });
    this.save();
  }

  private refreshActors(): void {
    this.actors = this.pet ? [this.player.actor, this.pet, ...this.spawner.enemies] : [this.player.actor, ...this.spawner.enemies];
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
    this.updatePet(dt);
    this.wakeLairsByCloseness();
    this.updateSummons(dt);

    const pet = this.pet && this.pet.alive && !this.pet.untargetable ? this.pet : null;
    const ai = { waves: this.waves, player: pa, pet, world, combat: this.combat, fx: this.fx, rand: this.rand };
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
    this.updateWaves(dt);
    this.updateIce(dt);
    this.updateSeals(dt);
    this.combat.update(dt, pa);
    this.spawner.update(pa.pos);
    // A fish swims away from the player only when the player is wading or swimming (a flier skimming the pond does not scare it).
    this.food.update(dt, pa.wet && pa.alive && !pa.flying ? pa.pos : null);
    this.trees.update();
    this.eggs.update(this.spawner.enemies, !!this.growth.profile.pet);
    this.fx.update(dt);
    this.interact();

    pa.syncModel(dt);
    this.pet?.syncModel(dt);
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
        if (!b.alive || a.untargetable || b.untargetable) continue;
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
    this.tending = false;

    // Beside the injured pet, E is held to tend to it (this comes before food and gates).
    const pet = this.pet;
    if (pet && pet.care.phase === 'injured' && pa.distanceTo(pet) <= PET_TUNING.tendRange + pa.radius + pet.radius) {
      this.tending = this.ctx.input.isDown('KeyE');
      this.prompt = { key: 'E', text: `Hold: tend to your ${pet.def.kind === 'hyena' ? 'pup' : 'cub'}`, progress: pet.care.tendHeld / PET_TUNING.tendSeconds };
      return;
    }

    // Swimming in a hole in the ice, near its edge: a jump climbs out (the user, 2026-11-21).
    if (pa.swimming && this.world.iceHoleAt(pa.pos.x, pa.pos.z)) {
      const foot = this.world.iceFooting(pa.pos.x, pa.pos.z);
      if (foot && Math.hypot(foot.x - pa.pos.x, foot.z - pa.pos.z) < 2.6) {
        this.prompt = { key: 'Space', text: this.growth.species.rig === 'winged' ? 'Take off to get out' : 'Jump to climb out' };
        return;
      }
    }

    // An egg in a beaten den (only while the slot has no pet).
    const egg = this.growth.profile.pet ? null : this.eggs.nearest(pa.pos.x, pa.pos.z, PET_TUNING.tendRange + pa.radius);
    if (egg) {
      this.prompt = { key: 'E', text: 'Take the egg' };
      if (pressed) {
        this.setPet(this.eggs.take(egg), 'egg');
        this.events.emit('toast', { text: 'You take the egg. Something is moving inside...', tone: 'good' });
      }
      return;
    }

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
      if (!this.world.isGateOpen()) {
        this.prompt = { key: '', text: `Sealed. Defeat the ${here.name} boss to open this gate.` };
      } else if (BIOME_LAYOUTS[next]) {
        this.prompt = { key: 'E', text: this.leaveBehindWarning(`enter ${biomeName(next)}`) ?? `Enter ${biomeName(next)}` };
        // An animal that goes on arrives through the next biome's gate back.
        if (pressed) {
          this.leavePetBehind();
          this.ctx.travel(next, 'return');
        }
      } else {
        this.prompt = { key: 'E', text: `Enter ${biomeName(next)}` };
        if (pressed) {
          // A biome without a map (none since Winter was built on 2026-11-20).
          this.events.emit('toast', { text: `The way to ${biomeName(next)} is not open yet. ${biomeName(here.id, true)} is yours for now.`, tone: 'info' });
        }
      }
    } else if (at === 'return') {
      const back = previousBiome(here.id);
      if (!back) return;
      this.prompt = { key: 'E', text: this.leaveBehindWarning(`return to ${biomeName(back)}`) ?? `Return to ${biomeName(back)}` };
      // An animal that goes back arrives at the gate it once left by.
      if (pressed) {
        this.leavePetBehind();
        this.ctx.travel(back, 'onward');
      }
    }
  }

  private eat(item: FoodItem): void {
    this.eatKind(item.kind, item.growth, item.label ?? FOODS[item.kind].name);
    this.food.consume(item);
    if (item.reserve !== undefined) this.raidReserve(item);
    if (item.bait) this.wakeLair(item.pos, 'The snakes of the cave rear up: you took their bait!');
  }

  /** True while the biome's boss is fighting the player: alive, engaged, and the player alive, near its arena and not in the den. */
  private bossFighting(): boolean {
    const boss = this.spawner.boss;
    const pa = this.player.actor;
    if (!boss) return false;
    const fromHome = Math.hypot(pa.pos.x - boss.homeX, pa.pos.z - boss.homeZ);
    return boss.alive && boss.engaged && pa.alive && fromHome <= boss.def.behavior.leashRadius + 6 && !this.world.inRefuge(pa.pos.x, pa.pos.z);
  }

  /**
   * A boss with a `summon` rule calls its pack when the fight starts, calls the next one `waitSeconds` after the last of a pack
   * has died, and loses the pack when the fight ends: the boss dies, the player dies, or the player is out of its reach
   * (beyond the distance at which the boss itself gives up the chase, or inside the player's den).
   */
  private updateSummons(dt: number): void {
    const rule = this.bossDef?.summon;
    const boss = this.spawner.boss;
    const fighting = !!rule && this.bossFighting();
    const action = stepSummon(this.summonState, { fighting, summonsAlive: this.spawner.summonsAlive() }, { waitSeconds: rule?.waitSeconds ?? 0 }, dt);
    if (action === 'dismiss') this.spawner.dismissSummons();
    else if (action === 'call' && rule) {
      if (this.spawner.callSummons(rule).length > 0) this.events.emit('toast', { text: rule.text ?? `${boss?.name ?? 'The boss'} calls its pack!`, tone: 'bad' });
    }
  }

  /** The guards of a den (a lair zone with `wakeNear`) all wake, together, when the player comes near the den. */
  private wakeLairsByCloseness(): void {
    const pa = this.player.actor;
    const refuge = this.world.inRefuge(pa.pos.x, pa.pos.z);
    const done = new Set<SpawnZoneDef>();
    for (const e of this.spawner.enemies) {
      const zone = e.zone;
      if (!zone || !zone.lair || zone.wakeNear === undefined || !e.alive || !e.calm || done.has(zone)) continue;
      done.add(zone);
      if (lairWakes(zone, pa.pos, pa.alive, refuge)) this.wakeLair(zone, `The ${e.def.name.toLowerCase()}s of the den rise and rush at you!`);
    }
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
    this.labels.update(this.ctx.cam.camera, this.spawner.enemies, this.player.actor, this.growth.progress.level, this.growth.getPassives().revealRange, this.vision.sight, this.pet);
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

  /** The pet's step, and what follows from it: injured, back on its feet, or dead (the slot then has no pet). */
  /**
   * The Woolly Mammoth's shockwaves: each ring spreads out, hits the player and the pet once as it passes (unless they are in the
   * air or rolling), and wears every ice square it crosses.
   */
  private updateWaves(dt: number): void {
    const targets = [this.player.actor, this.pet].filter((a): a is Actor => !!a && a.alive && !a.untargetable);
    for (const w of this.waves) {
      const prev = w.radius;
      w.radius = Math.min(w.max, w.radius + w.speed * dt);
      for (const a of targets) {
        if (w.hit.has(a)) continue;
        const dist = Math.hypot(a.pos.x - w.x, a.pos.z - w.z);
        if (!waveHits(prev, w.radius, w.width, dist, a.grounded && !a.flying, a.invuln > 0)) continue;
        w.hit.add(a);
        this.combat.damage(w.source, a, { damage: w.damage, knockback: w.knockback }, w.x, w.z);
      }
      if (w.iceWear > 0) this.world.ice?.ringWear(w.x, w.z, prev, w.radius, w.iceWear);
    }
    this.waves = this.waves.filter((w) => w.radius < w.max && w.source.alive);
  }

  /**
   * Winter's ice: every animal on the lake wears the squares under it while it stands, fights or creeps (not the mammoth, a flier
   * or an injured pet), and every animal swimming in a hole loses a little health to the cold, dealt in small ticks.
   */
  private updateIce(dt: number): void {
    const ice = this.world.ice;
    if (!ice) return;
    const T = TUNING.ice;
    const standers: IceStander[] = [];
    let playerCracked = false;
    for (const a of this.actors) {
      // A leopard seal belongs in the freezing water: it feels no cold, wears nothing and does not keep a hole open.
      const seal = a instanceof EnemyActor && !!a.def.behavior.holeBound;
      if (!a.alive || seal || ice.index(a.pos.x, a.pos.z) < 0) {
        a.coldSeconds = 0;
        a.coldAcc = 0;
        continue;
      }
      const boss = (a as { isBoss?: boolean }).isBoss === true;
      standers.push({
        x: a.pos.x, z: a.pos.z, radius: a.radius, weight: iceWeight(a.radius, T), speed: Math.hypot(a.vx, a.vz),
        exempt: a.flying || a.untargetable || boss,
      });
      // The mammoth feels no cold either (the user, 2026-11-21): only the player, the pet and the ordinary wild animals do.
      const coldProof = boss;
      if (a.swimming && this.world.iceHoleAt(a.pos.x, a.pos.z) && !a.untargetable && !coldProof) {
        a.coldSeconds += dt;
        a.coldAcc += dt;
        if (a.coldAcc >= COLD_TICK) {
          a.coldAcc -= COLD_TICK;
          this.combat.applyCold(a, Math.max(1, Math.round(a.stats.maxHealth * T.coldPctPerSecond * COLD_TICK)));
        }
      } else {
        a.coldSeconds = 0;
        a.coldAcc = 0;
      }
    }
    const pa = this.player.actor;
    for (const ev of ice.step(standers, dt)) {
      if (ev.kind === 'crack' && Math.hypot(ev.x - pa.pos.x, ev.z - pa.pos.z) < pa.radius + 2) playerCracked = true;
    }
    // Warn once per stretch of standing: the ice under the player has started to crack.
    if (playerCracked && this.clock.time - this.lastCrackWarning > 8) {
      this.lastCrackWarning = this.clock.time;
      this.events.emit('toast', { text: 'The ice cracks under you! Keep moving.', tone: 'bad' });
    }
  }

  /**
   * Leopard seals. In the lake (and the pool when the mammoth is not fighting), a player or pet that has been swimming in the
   * freezing water of a hole for `sealAfterSeconds` brings one up into that hole; it chases once onto the ice, and sinks away (no
   * death) once it is back in the water and nobody has been in its hole for `sealLeaveSeconds`. During the mammoth's fight, the
   * frozen pool brings up `poolCount` seals the first time it breaks, and again only once every hole in it has frozen over and it
   * breaks once more (the user, 2026-11-21); they stay until their hole freezes over or the fight ends, give no XP and leave no
   * carcass. Any seal whose hole has frozen over sinks away.
   */
  private updateSeals(dt: number): void {
    if (!this.world.ice) return;
    const T = TUNING.ice;
    const victims = [this.player.actor, this.pet].filter((a): a is Actor => !!a && a.alive && !a.untargetable);
    const near = (s: EnemyActor, v: Actor) => Math.hypot(s.pos.x - v.pos.x, s.pos.z - v.pos.z) < 6;
    const arena = this.world.layout.arena;
    const pool = this.world.layout.waters.find((w) => w.frozen && Math.hypot(w.x - arena.x, w.z - arena.z) < arena.radius);
    const fighting = !!pool && this.bossFighting();
    this.poolFightOff = fighting ? 0 : this.poolFightOff + dt;
    const inPool = (v: Actor) => !!pool && Math.hypot(v.pos.x - pool.x, v.pos.z - pool.z) < pool.radius + 1;
    let changed = false;
    for (const v of victims) {
      // In the pool during the fight the pool's own rule brings the seals up.
      if (fighting && inPool(v)) {
        v.coldSeconds = 0;
        continue;
      }
      const up = this.seals.some((s) => s.seal.alive && near(s.seal, v));
      if (!sealDue(v.coldSeconds, up, T)) continue;
      // It comes up in the same hole, a couple of metres from the animal.
      let x = v.pos.x;
      let z = v.pos.z;
      for (let k = 0; k < 8; k++) {
        const cx = v.pos.x + Math.cos((k * Math.PI) / 4) * 1.8;
        const cz = v.pos.z + Math.sin((k * Math.PI) / 4) * 1.8;
        if (this.world.iceHoleAt(cx, cz)) {
          x = cx;
          z = cz;
          break;
        }
      }
      const seal = this.spawner.spawnLoose('leopard_seal', x, z, 30);
      this.seals.push({ seal, empty: 0 });
      v.coldSeconds = 0;
      changed = true;
      this.events.emit('toast', { text: 'A leopard seal rises from under the ice! Get out of the water!', tone: 'bad' });
    }
    if (pool) {
      const spots = this.world.ice.holeSpotsIn(pool.x, pool.z, pool.radius);
      const count = stepPoolSeals(this.poolSeals, spots.length, fighting, TUNING.seal);
      if (count > 0) {
        // Spread out over the pool's holes: the first at random, each next one as far as it can be from those before.
        const picked: { x: number; z: number }[] = [];
        for (let n = 0; n < count; n++) {
          let best = spots[Math.floor(Math.random() * spots.length)];
          if (picked.length) {
            let bestD = -1;
            for (const p of spots) {
              const d = Math.min(...picked.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));
              if (d > bestD) {
                bestD = d;
                best = p;
              }
            }
          }
          picked.push(best);
          const seal = this.spawner.spawnLoose('leopard_seal', best.x, best.z, 30);
          seal.summoned = true;
          makePoolSeal(seal);
          this.seals.push({ seal, empty: 0 });
        }
        changed = true;
        this.events.emit('toast', { text: 'The broken ice stirs: leopard seals rise in the pool!', tone: 'bad' });
      }
    }
    for (const s of this.seals) {
      const used = sealMind(s.seal).mode !== 'water' || victims.some((v) => v.swimming && this.world.iceHoleAt(v.pos.x, v.pos.z) && near(s.seal, v));
      s.empty = used ? 0 : s.empty + dt;
    }
    const goes = (s: { seal: EnemyActor; empty: number }): boolean => {
      const e = s.seal;
      if (!e.alive || !this.spawner.enemies.includes(e)) return true;
      const mind = sealMind(e);
      // Its hole froze over: under it while in the water, or the hole it got out of while out on the ice.
      if (mind.mode === 'water' && !sealInWater(e, this) && !this.world.iceHoleAt(e.pos.x, e.pos.z)) return true;
      if (mind.mode !== 'water' && !this.world.iceHoleAt(mind.exitX, mind.exitZ)) return true;
      // A seal kept out of the water far longer than a chase (held up on its way back) slips away all the same.
      if (mind.mode !== 'water' && mind.outT > TUNING.seal.chaseSeconds + 10) return true;
      // The pool's seals go when the fight is over, wherever they are (like a boss's called pack).
      if (isPoolSeal(e)) return this.poolFightOff >= 2;
      return mind.mode === 'water' && sealLeaves(s.empty, T);
    };
    const gone = this.seals.filter(goes);
    for (const s of gone) if (s.seal.alive && this.spawner.enemies.includes(s.seal)) this.spawner.remove(s.seal);
    if (gone.length) {
      this.seals = this.seals.filter((s) => !gone.includes(s));
      changed = true;
    }
    if (changed) this.refreshActors();
  }

  private updatePet(dt: number): void {
    const pet = this.pet;
    if (!pet) return;
    const event = pet.update(dt, {
      player: this.player.actor, enemies: this.spawner.enemies, world: this.world, combat: this.combat, fx: this.fx, now: this.clock.time,
      tending: this.tending, playerHit: this.playerHit,
    });
    this.playerHit = false;
    const name = PETS[pet.def.kind].name.toLowerCase();
    const saved = this.growth.profile.pet;
    if (event === 'hatched') {
      this.events.emit('toast', { text: `Your egg has hatched: a ${name}!`, tone: 'good' });
    } else if (event === 'injured') {
      if (saved) saved.injured = true;
      this.dirty = true;
      this.events.emit('toast', { text: `Your ${name} is injured! Hold E beside it within ${PET_TUNING.injuredSeconds} s, or it will die.`, tone: 'bad' });
    } else if (event === 'revived') {
      if (saved) saved.injured = false;
      this.dirty = true;
      this.events.emit('toast', { text: `Your ${name} is back on its feet.`, tone: 'good' });
    } else if (event === 'died') {
      this.growth.profile.pet = null;
      this.save();
      this.events.emit('toast', { text: `Your ${name} has died. ${NEW_EGG}`, tone: 'bad' });
    }
    // A dead pet lies a moment, then is gone.
    if (pet.care.phase === 'dead' && this.clock.time - pet.deathTime > 1.8) {
      pet.dispose();
      this.pet = null;
      this.refreshActors();
    }
  }

  /** The gate's warning while the pet is injured (going through leaves it behind), or null. */
  private leaveBehindWarning(going: string): string | null {
    const pet = this.pet;
    if (!pet || pet.care.phase !== 'injured') return null;
    return `Your ${PETS[pet.def.kind].name.toLowerCase()} is injured. Leave it behind and ${going}?`;
  }

  /** Going through a gate while the pet is injured leaves it behind: it dies, and the slot has no pet. */
  private leavePetBehind(): void {
    const pet = this.pet;
    if (!pet || pet.care.phase !== 'injured') return;
    const name = PETS[pet.def.kind].name.toLowerCase();
    pet.dispose();
    this.pet = null;
    this.refreshActors();
    this.growth.profile.pet = null;
    this.save();
    this.events.emit('toast', { text: `You left your ${name} behind, and it died. ${NEW_EGG}`, tone: 'bad' });
  }

  /** Admin sandbox only: knocks the pet down, to see the injury and the tending. */
  adminInjurePet(): void {
    if (this.pet && this.pet.care.phase === 'healthy') this.pet.hp = 0;
  }

  /** Makes the pet of this kind and puts it beside the player (replacing any pet there was). */
  private createPet(kind: PetKind, phase: PetPhase = 'healthy'): void {
    this.pet?.dispose();
    const pet = new CompanionActor(kind, this.player.actor, phase);
    pet.placeBeside(this.world);
    pet.addTo(this.ctx.scene);
    pet.syncModel(0);
    this.pet = pet;
    this.refreshActors();
  }

  /** Gives the animal this pet, or takes its pet away (the admin panel's Pet row; the egg in step 3e). */
  setPet(kind: PetKind | null, phase: PetPhase = 'healthy'): void {
    if (kind) this.createPet(kind, phase);
    else {
      this.pet?.dispose();
      this.pet = null;
      this.refreshActors();
    }
    this.growth.profile.pet = kind ? { kind, injured: false } : null;
    this.dirty = true;
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
    this.pet?.dispose();
    this.eggs.dispose();
    this.spawner.dispose();
    this.food.dispose();
    this.trees.dispose();
    this.fx.dispose();
  }
}
