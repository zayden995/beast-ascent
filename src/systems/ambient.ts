import type * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import { dampAngle, mulberry32 } from '../core/math.ts';
import type { TitleAnimalDef } from '../core/types.ts';
import { getEnemy } from '../data/enemies.ts';
import { getSpecies, getVariant } from '../data/species.ts';
import { STAGES } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { shoreStandPoint } from '../logic/water.ts';
import type { ForestWorld } from '../world/forest.ts';
import { Actor, integrate } from './actor.ts';

interface Roamer {
  actor: Actor;
  def: TitleAnimalDef;
  predator: boolean;
  walking: boolean;
  /** Trotting away from a predator. */
  wary: boolean;
  timer: number;
  targetX: number;
  targetZ: number;
  stroll: number;
  speed: number;
  /** Set while the walk is to the water's edge: the way to face when it gets there. */
  drinkYaw: number | null;
  /** Standing at the water's edge with its head down. */
  drinking: boolean;
}

/** Calm walking pace, whatever the animal's real speed is. */
const STROLL = 2.2;

/**
 * Animals going about their day behind the title screen: they wander their patch, stop, and move on.
 * Nobody fights; prey only keeps its distance from predators. This is scenery, not the game's AI.
 */
export class AmbientLife {
  private roamers: Roamer[] = [];
  private world: ForestWorld;
  private rand = mulberry32(4242);
  private shyDistance: number;

  constructor(scene: THREE.Scene, world: ForestWorld, animals: TitleAnimalDef[], shyDistance: number) {
    this.world = world;
    this.shyDistance = shyDistance;
    for (const def of animals) {
      for (let i = 0; i < def.count; i++) {
        const actor = this.createActor(def);
        scene.add(actor.model.root);
        const r: Roamer = {
          actor, def, predator: !!def.speciesId, walking: false, wary: false,
          timer: 0, targetX: def.x, targetZ: def.z,
          stroll: STROLL * (0.8 + this.rand() * 0.35), speed: 0, drinkYaw: null, drinking: false,
        };
        // Start on a free spot in the patch (never at a pond: the animal has no position yet), then stand for a
        // moment before the first walk.
        this.pickTarget(r, false);
        actor.pos.set(r.targetX, world.heightAt(r.targetX, r.targetZ), r.targetZ);
        actor.yaw = this.rand() * Math.PI * 2;
        r.walking = false;
        r.timer = this.rand() * 4;
        this.roamers.push(r);
      }
    }
    this.update(0);
  }

  private createActor(def: TitleAnimalDef): Actor {
    if (def.speciesId) {
      const species = getSpecies(def.speciesId);
      const variant = getVariant(species, def.variantId ?? '');
      const stage = STAGES.adult;
      const model = createAnimalModel({
        body: species.body, colors: variant.colors, features: species.stageFeatures.adult,
        size: stage.sizeScale * species.baseStats.size, headScale: stage.headScale,
      });
      return new Actor('wild', model, () => ({
        base: species.baseStats, sizeScale: stage.sizeScale, powerMult: stage.powerMult, levelBonus: 0, mods: [],
      }));
    }
    const enemy = getEnemy(def.enemyId ?? '');
    const model = createAnimalModel({
      body: enemy.body, colors: enemy.colors, features: enemy.features, size: enemy.baseStats.size, headScale: 1,
    });
    return new Actor('wild', model, () => ({ base: enemy.baseStats, sizeScale: 1, powerMult: 1, levelBonus: 0, mods: [] }));
  }

  /** Picks a free spot in the animal's patch and starts walking to it. */
  private pickTarget(r: Roamer, allowDrink = true): void {
    const { def } = r;
    // Now and then the walk is to the water's edge, to drink (not for the animals that wade in).
    if (allowDrink && !def.wades && this.rand() < TUNING.drink.chance) {
      const here = r.actor.pos;
      const spot = shoreStandPoint(this.world.layout.waters, here.x, here.z, TUNING.drink.reach);
      if (spot && !this.world.colliders.blocked(spot.x, spot.z, 1) && this.world.waterDepth(spot.x, spot.z) <= 0.1) {
        this.walkTo(r, spot.x, spot.z, r.stroll, false);
        r.drinkYaw = spot.yaw;
        r.timer = 18;
        return;
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = Math.sqrt(this.rand()) * def.radius;
      const x = def.x + Math.cos(a) * d;
      const z = def.z + Math.sin(a) * d;
      if (this.world.colliders.blocked(x, z, 1)) continue;
      if (!def.wades && this.world.waterDepth(x, z) > 0.1) continue;
      this.walkTo(r, x, z, r.stroll, false);
      return;
    }
    this.walkTo(r, def.x, def.z, r.stroll, false);
  }

  private walkTo(r: Roamer, x: number, z: number, speed: number, wary: boolean): void {
    r.targetX = x;
    r.targetZ = z;
    r.speed = speed;
    r.wary = wary;
    r.walking = true;
    r.timer = wary ? 3 : 10;
    // Any new walk (a hunter came near, say) ends a drink.
    r.drinking = false;
    r.drinkYaw = null;
  }

  /** Prey that finds a predator too close trots a few metres the other way. */
  private keepDistance(r: Roamer): void {
    if (r.predator || r.wary) return;
    const p = r.actor.pos;
    for (const other of this.roamers) {
      if (!other.predator) continue;
      const dx = p.x - other.actor.pos.x;
      const dz = p.z - other.actor.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= this.shyDistance || d < 1e-3) continue;
      let x = p.x + (dx / d) * 7;
      let z = p.z + (dz / d) * 7;
      // Never bolt into the pond or far out of its patch: head back to the middle of the patch instead.
      const tooFar = Math.hypot(x - r.def.x, z - r.def.z) > r.def.radius * 2;
      if (tooFar || this.world.waterDepth(x, z) > 0.1) {
        x = r.def.x;
        z = r.def.z;
      }
      this.walkTo(r, x, z, r.stroll * 2.1, true);
      return;
    }
  }

  update(dt: number): void {
    for (const r of this.roamers) {
      const a = r.actor;
      this.keepDistance(r);
      r.timer -= dt;
      if (r.walking) {
        const dx = r.targetX - a.pos.x;
        const dz = r.targetZ - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5 || r.timer <= 0) {
          r.walking = false;
          r.wary = false;
          if (r.drinkYaw !== null && d < 1.5) {
            r.drinking = true;
            r.timer = TUNING.drink.minSeconds + this.rand() * (TUNING.drink.maxSeconds - TUNING.drink.minSeconds);
          } else {
            r.drinkYaw = null;
            r.timer = 1.5 + this.rand() * 4;
          }
          a.vx = a.vz = 0;
        } else {
          a.vx = (dx / d) * r.speed;
          a.vz = (dz / d) * r.speed;
          a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 5, dt);
        }
      } else {
        a.vx = a.vz = 0;
        if (r.drinking && r.drinkYaw !== null) a.yaw = dampAngle(a.yaw, r.drinkYaw, 6, dt);
        if (r.timer <= 0) {
          r.drinking = false;
          r.drinkYaw = null;
          this.pickTarget(r);
        }
      }
    }

    // Keep animals from standing inside each other.
    const list = this.roamers;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].actor;
        const b = list[j].actor;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        a.pos.x -= dx * push;
        a.pos.z -= dz * push;
        b.pos.x += dx * push;
        b.pos.z += dz * push;
      }
    }

    for (const r of this.roamers) {
      const a = r.actor;
      integrate(a, dt, this.world);
      a.anim.speed = Math.hypot(a.vx, a.vz);
      a.anim.sprinting = false;
      a.drinking = r.drinking && !r.walking;
      a.syncModel(dt);
    }
  }

  /** Where everyone is and how fast they are moving (read by the browser test). */
  snapshot(): { kind: string; x: number; z: number; speed: number; predator: boolean; swimming: boolean; drinking: boolean }[] {
    return this.roamers.map((r) => ({
      kind: r.def.enemyId ?? r.def.speciesId ?? '?', x: r.actor.pos.x, z: r.actor.pos.z, speed: r.actor.anim.speed, predator: r.predator, swimming: r.actor.swimming, drinking: r.actor.drinking,
    }));
  }

  dispose(): void {
    for (const r of this.roamers) r.actor.model.dispose();
    this.roamers = [];
  }
}
