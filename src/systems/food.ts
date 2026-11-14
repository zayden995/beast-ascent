import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import type { FoodKind } from '../core/types.ts';
import { FOODS } from '../data/food.ts';
import { TUNING } from '../data/tuning.ts';
import type { ForestWorld } from '../world/forest.ts';

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
  /** Fish only: circle they swim around. */
  swim?: { cx: number; cz: number; radius: number; phase: number };
}

/** Food in the world: carcasses dropped by animals, fish in the pond, berries on bushes, leafy plants. */
export class FoodSystem {
  items: FoodItem[] = [];
  private scene: THREE.Scene;
  private world: ForestWorld;
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
  };

  constructor(scene: THREE.Scene, world: ForestWorld, rand: () => number, clock: { time: number }) {
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

    const { pond, fishSpots } = world.layout;
    for (let i = 0; i < fishSpots; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.geos.fishBody, this.fishMat);
      body.scale.set(0.12, 0.16, 0.36);
      const tail = new THREE.Mesh(this.geos.fishTail, this.fishMat);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = -0.42;
      tail.scale.set(0.5, 1, 1.4);
      g.add(body, tail);
      const a = (i / fishSpots) * Math.PI * 2;
      const d = pond.radius * 0.38;
      const item = this.add({ kind: 'fish', growth: FOODS.fish.growth, mesh: g, respawnSeconds: TUNING.food.fishRespawnSeconds });
      item.swim = { cx: pond.x + Math.cos(a) * d, cz: pond.z + Math.sin(a) * d, radius: 1.6 + rand() * 1.4, phase: rand() * 6 };
    }
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

  /** Leaves a carcass where an animal died. */
  dropCarcass(pos: THREE.Vector3, growth: number, size: number): void {
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

  update(): void {
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
        const a = now * 0.6 + s.phase;
        item.mesh.position.set(s.cx + Math.cos(a) * s.radius, this.world.layout.pond.waterY - 0.3, s.cz + Math.sin(a) * s.radius);
        item.mesh.rotation.y = -a;
      }
    }
  }

  dispose(): void {
    for (const item of this.items) item.mesh.removeFromParent();
    this.items = [];
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of [this.meat, this.bone, this.berry, this.fishMat, this.leaf, this.leafDark]) m.dispose();
  }
}
