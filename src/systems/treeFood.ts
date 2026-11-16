import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import { TAU, mulberry32 } from '../core/math.ts';
import { TREE_FOOD } from '../data/food.ts';
import { assignTreeFood, availableFood, newTreeState, takeFood } from '../logic/treeFood.ts';
import type { TreeFoodState, TreeKind, TreePick } from '../logic/treeFood.ts';
import type { BiomeWorld, TreeSpot } from '../world/world.ts';

const MARKERS = 6;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Food on a biome's trees: every tree has leaves, some trees of the first kind bear fruit (red dots among the
 * leaves) and some of the second kind bear nuts (a pine's cones in the Forest, a palm's coconuts in the Jungle).
 * Plant-eaters take it with E at the trunk; a bare tree grows it back after a minute. Which trees bear what is
 * decided once from the biome's seed (`assignTreeFood`).
 */
export class TreeFoodSystem {
  private spots: TreeSpot[];
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

  constructor(scene: THREE.Scene, world: BiomeWorld, clock: { time: number }) {
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
      // Where the food hangs depends on the biome's trees (see `BiomeWorld.treeMarkers`): among a round crown,
      // under a pine's lowest tier, or at the top of a leaning palm (whose crown is off to one side).
      const ring = world.treeMarkers[kind];
      const cx = t.x + Math.cos(t.yaw) * ring.lean * t.s;
      const cz = t.z - Math.sin(t.yaw) * ring.lean * t.s;
      for (let k = 0; k < MARKERS; k++) {
        const a = rand() * TAU;
        const r = (ring.r0 + rand() * ring.rSpan) * t.s;
        const h = (ring.h0 + rand() * ring.hSpan) * t.tall;
        matrices.push(new THREE.Matrix4().makeTranslation(cx + Math.cos(a) * r, t.y + h, cz + Math.sin(a) * r));
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
      const d = Math.hypot(t.x - pos.x, t.z - pos.z) - t.r;
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
