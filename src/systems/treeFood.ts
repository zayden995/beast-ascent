import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import { TAU, mulberry32 } from '../core/math.ts';
import { TREE_FOOD } from '../data/food.ts';
import { assignTreeFood, availableFood, newTreeState, takeFood } from '../logic/treeFood.ts';
import type { TreeFoodState, TreeKind, TreePick } from '../logic/treeFood.ts';
import type { ForestWorld } from '../world/forest.ts';

const MARKERS = 6;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Food on the Forest's trees: every tree has leaves, some broadleaf trees bear fruit (red dots among the
 * leaves) and some pines bear nuts (cones). Plant-eaters take it with E at the trunk; a bare tree grows it
 * back after a minute. Which trees bear what is decided once from the Forest's seed (`assignTreeFood`).
 */
export class TreeFoodSystem {
  private spots: ForestWorld['treeSpots'];
  private states: TreeFoodState[];
  private clock: { time: number };
  private scene: THREE.Scene;
  private fruitMesh: THREE.InstancedMesh;
  private nutMesh: THREE.InstancedMesh;
  /** Where each treat-bearing tree's markers live: its mesh, its first instance, and where each marker sits. */
  private slots = new Map<number, { mesh: THREE.InstancedMesh; first: number; matrices: THREE.Matrix4[] }>();
  /** Trees whose fruit or nuts are gone (their markers are hidden) until they grow back. */
  private bare = new Set<number>();
  private nextCheck = 0;

  constructor(scene: THREE.Scene, world: ForestWorld, clock: { time: number }) {
    this.scene = scene;
    this.clock = clock;
    this.spots = world.treeSpots;
    const kinds = assignTreeFood(this.spots, world.layout.seed, TREE_FOOD.fruitTreeShare, TREE_FOOD.nutTreeShare);
    this.states = kinds.map((k) => newTreeState(k));

    const geo = new THREE.IcosahedronGeometry(0.17, 1);
    const fruitCount = kinds.filter((k) => k === 'fruit').length;
    const nutCount = kinds.filter((k) => k === 'nut').length;
    this.fruitMesh = new THREE.InstancedMesh(geo, toonMaterial({ color: 0xc8262b }), Math.max(1, fruitCount * MARKERS));
    this.nutMesh = new THREE.InstancedMesh(geo.clone().scale(1.1, 1.5, 1.1), toonMaterial({ color: 0x7a5230 }), Math.max(1, nutCount * MARKERS));
    for (const m of [this.fruitMesh, this.nutMesh]) {
      // The instances are spread over the whole Forest, so the mesh's own bounds mean nothing.
      m.frustumCulled = false;
      m.count = 0;
    }

    const rand = mulberry32(world.layout.seed + 909);
    let fruitAt = 0;
    let nutAt = 0;
    kinds.forEach((kind, i) => {
      if (kind === 'plain') return;
      const t = this.spots[i];
      const mesh = kind === 'fruit' ? this.fruitMesh : this.nutMesh;
      const first = kind === 'fruit' ? fruitAt : nutAt;
      const matrices: THREE.Matrix4[] = [];
      for (let k = 0; k < MARKERS; k++) {
        const a = rand() * TAU;
        // Fruit hangs among the round crown; nuts (cones) hang from the lowest tier of a pine.
        const r = (kind === 'fruit' ? 1.5 + rand() * 0.5 : 1.3 + rand() * 0.35) * t.s;
        const h = (kind === 'fruit' ? 3.5 + rand() * 1.5 : 2.5 + rand() * 0.9) * t.tall;
        matrices.push(new THREE.Matrix4().makeTranslation(t.x + Math.cos(a) * r, t.y + h, t.z + Math.sin(a) * r));
      }
      this.slots.set(i, { mesh, first, matrices });
      matrices.forEach((m, k) => mesh.setMatrixAt(first + k, m));
      if (kind === 'fruit') fruitAt += MARKERS;
      else nutAt += MARKERS;
    });
    this.fruitMesh.count = fruitAt;
    this.nutMesh.count = nutAt;
    this.fruitMesh.instanceMatrix.needsUpdate = true;
    this.nutMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.fruitMesh, this.nutMesh);
  }

  /** The tree whose trunk is nearest to `pos` and within `range` metres, or -1. */
  nearest(pos: THREE.Vector3, range: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.spots.length; i++) {
      const t = this.spots[i];
      const d = Math.hypot(t.x - pos.x, t.z - pos.z) - 0.4 * t.s;
      if (d <= range && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  /** What the tree offers right now, or null if it is bare. */
  pick(i: number): TreePick | null {
    return availableFood(this.states[i], this.clock.time);
  }

  take(i: number, pick: TreePick): void {
    takeFood(this.states[i], pick, this.clock.time, TREE_FOOD.regrowSeconds);
    if (pick !== 'leaf') {
      this.setMarkers(i, false);
      this.bare.add(i);
    }
  }

  private setMarkers(i: number, shown: boolean): void {
    const slot = this.slots.get(i);
    if (!slot) return;
    slot.matrices.forEach((m, k) => slot.mesh.setMatrixAt(slot.first + k, shown ? m : HIDDEN));
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Brings the fruit and nuts back on trees that have had time to grow them (checked once a second). */
  update(): void {
    const now = this.clock.time;
    if (now < this.nextCheck) return;
    this.nextCheck = now + 1;
    for (const i of this.bare) {
      if (availableFood(this.states[i], now) === this.states[i].kind) {
        this.setMarkers(i, true);
        this.bare.delete(i);
      }
    }
  }

  /** The trees that bear fruit or nuts (read by the browser test). */
  treatTrees(): { index: number; x: number; z: number; kind: TreeKind }[] {
    return this.states.flatMap((s, i) => (s.kind === 'plain' ? [] : [{ index: i, x: this.spots[i].x, z: this.spots[i].z, kind: s.kind }]));
  }

  dispose(): void {
    this.scene.remove(this.fruitMesh, this.nutMesh);
    for (const m of [this.fruitMesh, this.nutMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
