import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import type { FoodKind, WaterBody } from '../core/types.ts';
import { CAVE_FOOD, FOODS, RESERVE_PRODUCE, TREE_FOOD } from '../data/food.ts';
import { TUNING } from '../data/tuning.ts';
import { newFish, stepFish } from '../logic/fish.ts';
import { caveBaitSpots } from '../logic/cave.ts';
import { surfaceOf } from '../logic/heightfield.ts';
import type { FishState } from '../logic/fish.ts';
import type { BiomeWorld } from '../world/world.ts';

export interface FoodItem {
  kind: FoodKind;
  growth: number;
  readonly pos: THREE.Vector3;
  mesh: THREE.Object3D;
  available: boolean;
  /** Carcasses rot away at this time; -1 for permanent sources. */
  expiresAt: number;
  /** Bushes and fish come back this long after being eaten; 0 = never. */
  respawnSeconds: number;
  respawnAt: number;
  /** What to call it when it is not the usual name of its kind (a reserve's carrots and apples). */
  label?: string;
  /** The food reserve it belongs to (an index into the layout's `foxReserves`), if any: eating it angers its guards. */
  reserve?: number;
  /** A carcass in the cave: it stays until eaten, comes back later, and eating it wakes the nest. */
  bait?: boolean;
  /**
   * Fish only: the circle they swim around, a clock for it (it stops while the fish flees), how far a wading
   * animal has pushed the fish off its circle, and the pond it lives in.
   */
  swim?: { cx: number; cz: number; radius: number; phase: number; clock: number; fish: FishState; water: WaterBody };
}

/** Food in the world: carcasses dropped by animals, fish in the ponds, berries on bushes, leafy plants. */
export class FoodSystem {
  items: FoodItem[] = [];
  private scene: THREE.Scene;
  private world: BiomeWorld;
  private clock: { time: number };
  private meat = toonMaterial({ color: 0xb0483c });
  private bone = toonMaterial({ color: 0xf1ead2 });
  private berry = toonMaterial({ color: 0xc2264b });
  private fishMat = toonMaterial({ color: 0xf29a4a });
  private leaf = toonMaterial({ color: 0x4fa83d });
  private leafDark = toonMaterial({ color: 0x2f7d34 });
  private geos = {
    blob: new THREE.SphereGeometry(1, 10, 8),
    rib: new THREE.TorusGeometry(0.28, 0.035, 5, 10, Math.PI),
    berry: new THREE.SphereGeometry(0.11, 8, 6),
    fishBody: new THREE.SphereGeometry(1, 10, 8),
    fishTail: new THREE.ConeGeometry(0.16, 0.3, 4),
    leaf: new THREE.ConeGeometry(0.1, 0.8, 5),
    soil: new THREE.CylinderGeometry(1.9, 1.9, 0.08, 20),
    stone: new THREE.IcosahedronGeometry(0.22, 0),
  };
  private soil = toonMaterial({ color: 0x4a3524 });
  private stone = toonMaterial({ color: 0xa9a59b });
  private green = toonMaterial({ color: 0x3f8f3c });
  /** Models and materials made for the fox reserves' produce, and the soil and stones around them. */
  private produceGeos: THREE.BufferGeometry[] = [];
  private produceMats = new Map<number, THREE.Material>();
  private reserveDecor: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, world: BiomeWorld, rand: () => number, clock: { time: number }) {
    this.scene = scene;
    this.world = world;
    this.clock = clock;

    for (const [x, z] of world.layout.berryBushes) {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(this.geos.berry, this.berry);
        const a = rand() * Math.PI * 2;
        b.position.set(Math.cos(a) * (0.5 + rand() * 0.45), 0.55 + rand() * 0.6, Math.sin(a) * (0.5 + rand() * 0.45));
        g.add(b);
      }
      g.position.set(x, world.heightAt(x, z), z);
      this.add({ kind: 'fruit', growth: FOODS.fruit.growth, mesh: g, respawnSeconds: TUNING.food.berryRespawnSeconds });
    }

    this.growPlants(rand);
    this.buildReserves();
    if (world.layout.cave) for (const spot of caveBaitSpots(world.layout.cave)) this.addBait(spot.x, spot.z, rand);

    // Fish swim in every pond, in circles around spots spread across it.
    for (const water of world.layout.waters) {
      for (let i = 0; i < water.fish; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.geos.fishBody, this.fishMat);
        body.scale.set(0.12, 0.16, 0.36);
        const tail = new THREE.Mesh(this.geos.fishTail, this.fishMat);
        tail.rotation.x = Math.PI / 2;
        tail.position.z = -0.42;
        tail.scale.set(0.5, 1, 1.4);
        g.add(body, tail);
        const a = (i / water.fish) * Math.PI * 2;
        const d = water.radius * 0.38;
        const item = this.add({ kind: 'fish', growth: FOODS.fish.growth, mesh: g, respawnSeconds: TUNING.food.fishRespawnSeconds });
        item.swim = { cx: water.x + Math.cos(a) * d, cz: water.z + Math.sin(a) * d, radius: 1.6 + rand() * 1.4, phase: rand() * 6, clock: 0, fish: newFish(), water };
      }
    }
  }

  /** The fox food reserves: a patch of dark earth with a ring of stones and one of each fruit and vegetable on it. */
  private buildReserves(): void {
    this.world.layout.foxReserves.forEach((reserve, index) => {
      const ground = this.world.heightAt(reserve.x, reserve.z);
      const patch = new THREE.Mesh(this.geos.soil, this.soil);
      patch.position.set(reserve.x, ground + 0.04, reserve.z);
      patch.receiveShadow = true;
      this.scene.add(patch);
      this.reserveDecor.push(patch);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rock = new THREE.Mesh(this.geos.stone, this.stone);
        rock.position.set(reserve.x + Math.cos(a) * 2.05, ground + 0.1, reserve.z + Math.sin(a) * 2.05);
        rock.scale.set(1, 0.8 + (k % 3) * 0.25, 1);
        this.scene.add(rock);
        this.reserveDecor.push(rock);
      }
      RESERVE_PRODUCE.forEach((produce, k) => {
        const a = (k / RESERVE_PRODUCE.length) * Math.PI * 2 + 0.3;
        const g = this.produceMesh(produce);
        g.position.set(reserve.x + Math.cos(a) * 1.1, ground + 0.16, reserve.z + Math.sin(a) * 1.1);
        g.rotation.y = a * 2;
        const item = this.add({ kind: produce.kind, growth: TREE_FOOD.reserveGrowth, mesh: g, respawnSeconds: TREE_FOOD.reserveRespawnSeconds });
        item.label = produce.name;
        item.reserve = index;
      });
    });
  }

  /** A small model of one reserve fruit or vegetable. */
  private produceMesh(p: (typeof RESERVE_PRODUCE)[number]): THREE.Group {
    const g = new THREE.Group();
    let mat = this.produceMats.get(p.color);
    if (!mat) {
      mat = toonMaterial({ color: p.color });
      this.produceMats.set(p.color, mat);
    }
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, sx = 1, sy = 1, sz = 1): void => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.scale.set(sx, sy, sz);
      g.add(m);
      this.produceGeos.push(geo);
    };
    switch (p.shape) {
      case 'cone':
        add(new THREE.ConeGeometry(0.1, 0.42, 7), mat, 0, 0.1, 0, Math.PI / 2);
        add(new THREE.ConeGeometry(0.07, 0.16, 5), this.green, 0, 0.1, -0.27, -Math.PI / 2);
        break;
      case 'long':
        add(new THREE.IcosahedronGeometry(0.13, 1), mat, 0, 0.1, 0, 0, 1, 0.8, 2.2);
        break;
      case 'cob':
        add(new THREE.CylinderGeometry(0.075, 0.07, 0.34, 8), mat, 0, 0.09, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.085, 0.07, 0.18, 8), this.green, 0, 0.09, -0.2, Math.PI / 2);
        break;
      case 'ball':
        add(new THREE.IcosahedronGeometry(0.15, 1), mat, 0, 0.14, 0);
        break;
      case 'cluster':
        for (const [x, z] of [[0, 0], [0.11, 0.05], [-0.06, 0.1]]) add(new THREE.IcosahedronGeometry(0.08, 1), mat, x, 0.09, z);
        break;
      default:
        add(new THREE.IcosahedronGeometry(0.09, 1), mat, 0, 0.1, 0);
    }
    return g;
  }

  /** Leafy plants for herbivores: a few inside the den's refuge, the rest scattered through the Forest. */
  private growPlants(rand: () => number): void {
    const { plants, plantsAtDen, den, worldRadius, playerSpawn } = this.world.layout;
    const w = this.world;
    for (let i = 0; i < plants; i++) {
      let x = 0;
      let z = 0;
      let found = false;
      for (let tries = 0; tries < 60 && !found; tries++) {
        if (i < plantsAtDen) {
          const a = rand() * Math.PI * 2;
          const d = 5.5 + rand() * 4.5;
          x = den.x + Math.cos(a) * d;
          z = den.z + Math.sin(a) * d;
          found = Math.hypot(x - playerSpawn.x, z - playerSpawn.z) > 3 && !w.colliders.blocked(x, z, 1.2);
        } else {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(rand()) * (worldRadius - 14);
          x = Math.cos(a) * d;
          z = Math.sin(a) * d;
          found = w.isOpenGround(x, z, 1.5) && !w.inRefuge(x, z, 1) && w.waterDepth(x, z) <= 0 && !w.colliders.blocked(x, z, 1.2);
        }
      }
      if (!found) continue;
      const g = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const blade = new THREE.Mesh(this.geos.leaf, k % 2 ? this.leafDark : this.leaf);
        const a = (k / 7) * Math.PI * 2 + rand();
        const lean = 0.25 + rand() * 0.45;
        blade.position.set(Math.cos(a) * 0.18, 0.38, Math.sin(a) * 0.18);
        blade.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
        blade.scale.y = 0.8 + rand() * 0.6;
        g.add(blade);
      }
      g.position.set(x, w.heightAt(x, z), z);
      this.add({ kind: 'plant', growth: FOODS.plant.growth, mesh: g, respawnSeconds: TUNING.food.plantRespawnSeconds });
    }
  }

  private add(init: { kind: FoodKind; growth: number; mesh: THREE.Object3D; respawnSeconds: number }): FoodItem {
    const item: FoodItem = {
      ...init, pos: init.mesh.position, available: true, expiresAt: -1, respawnAt: 0,
    };
    this.scene.add(init.mesh);
    this.items.push(item);
    return item;
  }

  /** A carcass lying in the cave as bait. It never rots, and it comes back a while after it has been eaten. */
  private addBait(x: number, z: number, rand: () => number): void {
    const g = this.carcassMesh(1.5);
    g.position.set(x, this.world.heightAt(x, z), z);
    g.rotation.y = rand() * Math.PI * 2;
    const item = this.add({ kind: 'carcass', growth: CAVE_FOOD.baitGrowth, mesh: g, respawnSeconds: CAVE_FOOD.respawnSeconds });
    item.bait = true;
  }

  /** The model of a carcass: a body and three ribs. */
  private carcassMesh(size: number): THREE.Group {
    const g = new THREE.Group();
    const s = Math.max(0.5, size);
    const body = new THREE.Mesh(this.geos.blob, this.meat);
    body.scale.set(0.55 * s, 0.26 * s, 0.38 * s);
    body.position.y = 0.2 * s;
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(this.geos.rib, this.bone);
      rib.position.set((i - 1) * 0.24 * s, 0.26 * s, 0);
      rib.rotation.y = Math.PI / 2;
      rib.scale.setScalar(s);
      g.add(rib);
    }
    return g;
  }

  /** Leaves a carcass where an animal died. */
  dropCarcass(pos: THREE.Vector3, growth: number, size: number): void {
    const g = this.carcassMesh(size);
    g.position.set(pos.x, this.world.heightAt(pos.x, pos.z), pos.z);
    const item = this.add({ kind: 'carcass', growth, mesh: g, respawnSeconds: 0 });
    item.expiresAt = this.clock.time + TUNING.food.carcassSeconds;
  }

  /** Closest available food within reach of a position. */
  nearest(pos: THREE.Vector3, range: number): FoodItem | null {
    let best: FoodItem | null = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (!item.available) continue;
      const d = Math.hypot(item.pos.x - pos.x, item.pos.z - pos.z);
      if (d <= range && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return best;
  }

  consume(item: FoodItem): void {
    item.available = false;
    item.mesh.visible = false;
    if (item.respawnSeconds > 0) item.respawnAt = this.clock.time + item.respawnSeconds;
    else this.removeItem(item);
  }

  private removeItem(item: FoodItem): void {
    item.mesh.removeFromParent();
    this.items = this.items.filter((i) => i !== item);
  }

  /** `wader` is where an animal is wading in a pond (the player, in the water), which fish swim away from. */
  update(dt: number, wader: { x: number; z: number } | null = null): void {
    const now = this.clock.time;
    for (const item of this.items) {
      if (!item.available) {
        if (item.respawnSeconds > 0 && now >= item.respawnAt) {
          item.available = true;
          item.mesh.visible = true;
        }
        continue;
      }
      if (item.expiresAt > 0 && now >= item.expiresAt) {
        this.removeItem(item);
        continue;
      }
      if (item.swim) {
        const s = item.swim;
        const a = s.clock * 0.6 + s.phase;
        const base = { x: s.cx + Math.cos(a) * s.radius, z: s.cz + Math.sin(a) * s.radius };
        const before = { x: s.fish.ox, z: s.fish.oz };
        const alarmed = stepFish(s.fish, base, wader, s.water, dt, TUNING.fish);
        // The calm circle only turns while the fish is left alone; an alarmed fish swims straight away.
        if (!alarmed) s.clock += dt;
        item.mesh.position.set(base.x + s.fish.ox, surfaceOf(s.water, this.world.layout.waterY) - 0.3, base.z + s.fish.oz);
        const heading = Math.hypot(s.fish.ox - before.x, s.fish.oz - before.z) > 1e-6 && alarmed ? Math.atan2(s.fish.ox - before.x, s.fish.oz - before.z) : -a;
        item.mesh.rotation.y = heading;
      }
    }
  }

  dispose(): void {
    for (const item of this.items) item.mesh.removeFromParent();
    this.items = [];
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of [this.meat, this.bone, this.berry, this.fishMat, this.leaf, this.leafDark, this.soil, this.stone, this.green]) m.dispose();
    for (const decor of this.reserveDecor) decor.removeFromParent();
    this.reserveDecor = [];
    for (const g of this.produceGeos) g.dispose();
    for (const m of this.produceMats.values()) m.dispose();
  }
}
