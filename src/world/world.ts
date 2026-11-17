import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flatShade, toonMaterial } from '../animals/toon.ts';
import { TAU, fbm2, mulberry32 } from '../core/math.ts';
import type { BiomeLayout, CaveDef, GateDef } from '../core/layout.ts';
import type { BiomeDef, BiomeId } from '../core/types.ts';
import { BIOMES, layoutOf } from '../data/biomes.ts';
import { buildRivers, createHeight, slopeAt, surfaceOf } from '../logic/heightfield.ts';
import type { HeightFn } from '../logic/heightfield.ts';
import { caveKeepsClear, caveRoof, caveWalls, inAnyCave, mouthHalfDeg } from '../logic/cave.ts';
import type { CaveStone } from '../logic/cave.ts';
import { currentAt, sampleRiver } from '../logic/river.ts';
import type { River } from '../logic/river.ts';
import { drinkSpot, nearAnyWater, surfaceAt } from '../logic/water.ts';
import type { WaterSet } from '../logic/water.ts';
import { holdInLakeZone, inLakeZone } from '../logic/waterBound.ts';
import { waterfallOf } from '../logic/waterfall.ts';
import type { Waterfall } from '../logic/waterfall.ts';
import { ColliderGrid } from './colliders.ts';
import { buildTerrainMesh } from './terrain.ts';

interface Placement {
  x: number;
  z: number;
  s: number;
}

type Instance = { matrix: THREE.Matrix4; color: THREE.Color };

/** A tree: where it stands, how big it is, which of the biome's two kinds it is, and what blocks an animal. */
export interface TreeSpot {
  x: number;
  z: number;
  s: number;
  tall: number;
  /** The biome's second kind of tree, the one that bears nuts: a pine in the Forest, a palm in the Jungle. */
  pine: boolean;
  /** Height of the ground at its foot. */
  y: number;
  /** Radius of its trunk. */
  r: number;
  /** The way it is turned (a leaning palm's crown is off to one side). */
  yaw: number;
}

/** Where fruit or nuts hang on a tree, in the tree's own size: a ring of this radius at this height. */
export interface MarkerRing {
  r0: number;
  rSpan: number;
  h0: number;
  hSpan: number;
  /** The crown is this far to one side of the trunk's foot (a leaning palm). */
  lean: number;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Where each gate lets an animal out, and which way it then faces (0 faces +z, south). */
const GATE_STEP = 10;

/**
 * One biome's world, built from its layout: terrain, vegetation, ponds and rivers, den, boss arena and the
 * gates to the neighbouring biomes. The Forest and the Jungle are both made here; what differs is data
 * (`BiomeLayout`) and the look of the plants (`layout.style`).
 */
export class BiomeWorld {
  readonly group = new THREE.Group();
  readonly layout: BiomeLayout;
  readonly biome: BiomeDef;
  readonly heightAt: HeightFn;
  readonly colliders = new ColliderGrid();
  readonly rivers: River[];
  readonly waterfall: Waterfall | null;
  /** Every tree (where it stands, how big it is, its kind, and the height of the ground at its foot). */
  readonly treeSpots: TreeSpot[] = [];
  /** Where fruit and nuts hang on this biome's trees. */
  readonly treeMarkers: { fruit: MarkerRing; nut: MarkerRing };
  /** Players and animals are kept inside this radius. */
  readonly boundary: number;

  private rand: () => number;
  private water: WaterSet;
  private waters: { mesh: THREE.Mesh; y: number }[] = [];
  private flows: { texture: THREE.Texture; speed: number }[] = [];
  private mist: { mesh: THREE.Mesh; y: number; phase: number; scale: number }[] = [];
  /** Unlit materials, which the sky tints so that they darken at night (with the colour each has by day). */
  private unlit: { material: THREE.MeshBasicMaterial; day: THREE.Color }[] = [];
  private gateBarrier = new THREE.Group();
  private gatePortal!: THREE.Mesh;
  private grassChunks: { mesh: THREE.InstancedMesh; x: number; z: number }[] = [];
  private gateOpen = false;

  constructor(scene: THREE.Scene, biomeId: BiomeId = 'forest') {
    this.layout = layoutOf(biomeId);
    this.biome = BIOMES[biomeId];
    this.rand = mulberry32(this.layout.seed);
    this.rivers = buildRivers(this.layout);
    this.water = { waters: this.layout.waters, rivers: this.rivers, waterY: this.layout.waterY };
    this.waterfall = waterfallOf(this.layout, this.rivers);
    this.heightAt = createHeight(this.layout, this.rivers);
    this.boundary = this.layout.worldRadius - 3;
    const jungle = this.layout.style === 'jungle';
    this.treeMarkers = jungle
      ? {
          // Fruit hangs under the wide crown of a canopy tree; coconuts cluster at the top of a palm.
          fruit: { r0: 1.2, rSpan: 1.4, h0: 6.1, hSpan: 0.7, lean: 0 },
          nut: { r0: 0.3, rSpan: 0.15, h0: 5.45, hSpan: 0.25, lean: 1.0 },
        }
      : {
          // Fruit hangs among the round crown; nuts (cones) hang from the lowest tier of a pine.
          fruit: { r0: 1.5, rSpan: 0.5, h0: 3.5, hSpan: 1.5, lean: 0 },
          nut: { r0: 1.3, rSpan: 0.35, h0: 2.5, hSpan: 0.9, lean: 0 },
        };

    this.group.add(buildTerrainMesh(this.heightAt, this.layout, this.biome.palette, this.rivers));
    this.buildWater();
    this.buildTrees();
    this.buildRocks();
    this.buildGrass();
    this.buildBushes();
    this.buildDen();
    this.buildCaves();
    this.buildGate(this.layout.gate, 1, true);
    if (this.layout.returnGate) this.buildGate(this.layout.returnGate, -1, false);
    // Everything below has its own random sequence, so that adding to it never moves a tree or a rock.
    this.buildRivers();
    this.buildWaterfall();
    this.buildLilyPads();
    if (jungle) {
      this.buildUndergrowth();
      this.buildVines();
    }
    scene.add(this.group);
  }

  // ---------- Queries used by gameplay ----------

  /** Height of the water surface over a point (the pond or river it lies in), or null on dry land. */
  waterSurface(x: number, z: number): number | null {
    return surfaceAt(this.water, x, z);
  }

  /** Depth of water at a point (0 on dry land). */
  waterDepth(x: number, z: number): number {
    const surface = surfaceAt(this.water, x, z);
    return surface === null ? 0 : Math.max(0, surface - this.heightAt(x, z));
  }

  /** True in the water or within `strip` metres of its shore: the zone of a lake-bound animal (see `logic/waterBound.ts`). */
  inLakeZone(x: number, z: number, strip: number): boolean {
    return inLakeZone(this.water, x, z, strip);
  }

  /** The velocity a lake-bound animal may use: stopped if the step would take it out of its zone. */
  holdInLakeZone(strip: number, x: number, z: number, vx: number, vz: number, dt: number): { vx: number; vz: number } {
    return holdInLakeZone(this.water, strip, x, z, vx, vz, dt);
  }

  /** True within a few metres of the shore of any pond or the bank of any river (or in the water). */
  nearWater(x: number, z: number): boolean {
    return nearAnyWater(this.water, x, z, this.layout.nearWaterMargin);
  }

  /** The speed and direction a river carries an animal at a point, in m/s (nothing on land or in a pond). */
  currentAt(x: number, z: number): { x: number; z: number } {
    return this.rivers.length ? currentAt(this.rivers, x, z) : STILL;
  }

  /** Where an animal near here would stand to drink, at the nearest shore or river bank, or null. */
  drinkSpot(x: number, z: number, reach: number): { x: number; z: number; yaw: number } | null {
    return drinkSpot(this.water, x, z, reach);
  }

  /** True inside the cave and its walls (`margin` widens it), where only the cave's own animals are placed. */
  inCave(x: number, z: number, margin = 0): boolean {
    return inAnyCave(this.layout.caves, x, z, margin);
  }

  /** True inside the den's refuge, where wild animals never go (`margin` widens it). */
  inRefuge(x: number, z: number, margin = 0): boolean {
    const { den } = this.layout;
    return Math.hypot(x - den.x, z - den.z) < den.refugeRadius + margin;
  }

  /** Moves a wild animal that has strayed into the den's refuge back out to its edge. */
  keepOutOfRefuge(pos: { x: number; z: number }, radius: number): void {
    const { den } = this.layout;
    const dx = pos.x - den.x;
    const dz = pos.z - den.z;
    const d = Math.hypot(dx, dz);
    const min = den.refugeRadius + radius;
    if (d >= min) return;
    if (d < 1e-4) {
      pos.z = den.z - min;
      return;
    }
    pos.x = den.x + (dx / d) * min;
    pos.z = den.z + (dz / d) * min;
  }

  /** Pushes a position out of trees/rocks and back inside the world boundary. */
  constrain(pos: { x: number; z: number }, radius: number, height = 0): void {
    this.colliders.resolve(pos, radius, height);
    const r = Math.hypot(pos.x, pos.z);
    const max = this.boundary - radius;
    if (r > max) {
      pos.x *= max / r;
      pos.z *= max / r;
    }
  }

  /** True if nothing is built or planted at this spot. */
  isOpenGround(x: number, z: number, margin: number): boolean {
    const { den, arena, waters, gate, returnGate, playerSpawn, caves } = this.layout;
    if (Math.hypot(x - den.x, z - den.z) < den.radius + margin) return false;
    // Each cave, its walls and a few metres of bare ground all round, and the trail that leads to it from the arena (if it has one).
    if (caveKeepsClear(caves, arena, x, z, margin)) return false;
    if (Math.hypot(x - playerSpawn.x, z - playerSpawn.z) < 5 + margin) return false;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.radius + 3 + margin) return false;
    for (const w of waters) if (Math.hypot(x - w.x, z - w.z) < w.radius - 1 + margin) return false;
    for (const river of this.rivers) {
      const s = sampleRiver(river, x, z);
      if (s && s.dist < s.halfWidth - 1 + margin) return false;
    }
    if (Math.hypot(x - gate.x, z - gate.z) < gate.radius + margin) return false;
    if (Math.abs(x - gate.x) < 4 + margin * 0.5 && z < arena.z && z > gate.z - 2) return false;
    if (returnGate) {
      if (Math.hypot(x - returnGate.x, z - returnGate.z) < returnGate.radius + margin) return false;
      // The way in from the gate back to the last biome is kept clear.
      if (Math.abs(x - returnGate.x) < 4 + margin * 0.5 && z > returnGate.z - 16 && z < returnGate.z + 2) return false;
    }
    const fall = this.waterfall;
    if (fall && Math.hypot(x - fall.bottomX, z - fall.bottomZ) < 4 + margin) return false;
    return true;
  }

  /** Where an animal stands after coming through a gate: just inside it, facing into the biome. */
  gateSpot(which: 'onward' | 'return'): { x: number; z: number; yaw: number } {
    const { gate, returnGate, playerSpawn } = this.layout;
    if (which === 'onward') return { x: gate.x, z: gate.z + GATE_STEP, yaw: 0 };
    return returnGate ? { x: returnGate.x, z: returnGate.z - GATE_STEP, yaw: Math.PI } : playerSpawn;
  }

  /** The gate an animal is standing at (within reach of its opening), or null. */
  gateAt(x: number, z: number): 'onward' | 'return' | null {
    const { gate, returnGate } = this.layout;
    if (Math.hypot(x - gate.x, z - (gate.z + 3)) < 6) return 'onward';
    if (returnGate && Math.hypot(x - returnGate.x, z - (returnGate.z - 3)) < 6) return 'return';
    return null;
  }

  setGateOpen(open: boolean): void {
    this.gateOpen = open;
    this.gateBarrier.visible = !open;
    (this.gatePortal.material as THREE.MeshBasicMaterial).color.set(open ? 0xdfffb5 : 0x0e140d);
  }

  isGateOpen(): boolean {
    return this.gateOpen;
  }

  /** Unlit things (grass blades, mist) are handed the colour of the current light, so they darken at night. */
  setUnlitTint(tint: THREE.Color): void {
    for (const u of this.unlit) u.material.color.copy(u.day).multiply(tint);
  }

  update(time: number, cameraPos: THREE.Vector3): void {
    const bob = Math.sin(time * 0.8) * 0.03;
    for (const water of this.waters) water.mesh.position.y = water.y + bob;
    // Rivers and the waterfall flow: their streaks slide downstream.
    for (const flow of this.flows) flow.texture.offset.y = -((time * flow.speed) % 1);
    for (const m of this.mist) {
      const k = Math.sin(time * 1.1 + m.phase);
      m.mesh.position.y = m.y + k * 0.3;
      m.mesh.scale.setScalar(m.scale * (1 + k * 0.18));
    }
    for (const chunk of this.grassChunks) {
      chunk.mesh.visible = Math.hypot(chunk.x - cameraPos.x, chunk.z - cameraPos.z) < 105;
    }
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) mat.dispose();
      }
    });
    for (const flow of this.flows) flow.texture.dispose();
    this.group.removeFromParent();
  }

  // ---------- Construction ----------

  private buildWater(): void {
    const mat = toonMaterial({ color: this.biome.palette.water, transparent: true, opacity: 0.8 });
    mat.depthWrite = false;
    for (const w of this.layout.waters) {
      const geo = new THREE.CircleGeometry(w.radius, 48);
      geo.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(geo, mat);
      const y = surfaceOf(w, this.layout.waterY);
      water.position.set(w.x, y, w.z);
      water.renderOrder = 1;
      this.waters.push({ mesh: water, y });
      this.group.add(water);
    }
  }

  private instanced(geo: THREE.BufferGeometry, material: THREE.Material, items: Instance[], shadows: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
      mesh.setColorAt(i, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    this.group.add(mesh);
    return mesh;
  }

  private buildTrees(): void {
    const { trees, worldRadius, seed } = this.layout;
    const p = this.biome.palette;
    const jungle = this.layout.style === 'jungle';
    // The Jungle is denser than the Forest: its trees stand closer and it has only a few small clearings.
    const spacing = jungle ? 3.1 : 3.6;
    const clearingAbove = jungle ? 0.52 : 0.3;
    const secondShare = jungle ? 0.3 : 0.4;
    const placed: (Placement & { pine: boolean })[] = [];
    const maxR = worldRadius + 18;
    for (let attempts = 0; placed.length < trees && attempts < trees * 14; attempts++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * maxR;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, 3)) continue;
      // Leave open meadows inside the playable area.
      if (d < worldRadius && fbm2(x * 0.03, z * 0.03, seed + 33, 2) > clearingAbove) continue;
      // No tree grows on a cliff.
      if (jungle && slopeAt(this.heightAt, x, z) > 1) continue;
      if (placed.some((t) => Math.hypot(t.x - x, t.z - z) < spacing)) continue;
      placed.push({ x, z, s: 0.85 + this.rand() * 0.7, pine: this.rand() < secondShare });
    }

    const look = jungle ? jungleTrees() : forestTrees();
    const crowns: Instance[] = [];
    const seconds: Instance[] = [];
    const trunks: Instance[] = [];
    const secondTrunks: Instance[] = [];
    for (const t of placed) {
      const y = this.heightAt(t.x, t.z) - 0.2;
      const yaw = this.rand() * TAU;
      _q.setFromEuler(_e.set(0, yaw, 0));
      const tall = t.s * (0.9 + this.rand() * 0.35);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), _q, new THREE.Vector3(t.s, tall, t.s));
      const shade = 0.85 + this.rand() * 0.3;
      const size = t.pine ? look.secondSize : look.size;
      this.treeSpots.push({ x: t.x, z: t.z, s: t.s, tall, pine: t.pine, y, r: size.radius * t.s, yaw });
      if (t.pine) {
        seconds.push({ matrix, color: new THREE.Color(look.secondColor).multiplyScalar(shade) });
      } else {
        const color = new THREE.Color(p.foliage).lerp(_c.set(p.foliageAlt), this.rand()).multiplyScalar(shade);
        crowns.push({ matrix, color });
      }
      const trunk = { matrix, color: new THREE.Color(p.trunk).multiplyScalar(0.85 + this.rand() * 0.3) };
      (t.pine && look.secondTrunk ? secondTrunks : trunks).push(trunk);
      // The trunk blocks up to its top; a flier passes through the foliage above it.
      this.colliders.add(t.x, t.z, size.radius * t.s, size.top * tall);
    }
    this.instanced(look.crown, toonMaterial(), crowns, true);
    this.instanced(look.second, toonMaterial(), seconds, true);
    this.instanced(look.trunk, toonMaterial(), trunks, true);
    if (look.secondTrunk) this.instanced(look.secondTrunk, toonMaterial(), secondTrunks, true);
  }

  private buildRocks(): void {
    const { rocks, worldRadius, arena, gate, returnGate } = this.layout;
    const p = this.biome.palette;
    const items: Instance[] = [];
    const addRock = (x: number, z: number, sx: number, sy: number, sz: number, collide: boolean) => {
      _q.setFromEuler(_e.set(this.rand() * 0.5, this.rand() * TAU, this.rand() * 0.5));
      const y = this.heightAt(x, z) + sy * 0.25;
      items.push({
        matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz)),
        color: new THREE.Color(p.rock).multiplyScalar(0.8 + this.rand() * 0.35),
      });
      if (collide) this.colliders.add(x, z, Math.max(sx, sz) * 0.8, sy * 1.3 + 0.3);
    };

    for (let placed = 0, attempts = 0; placed < rocks && attempts < rocks * 12; attempts++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * (worldRadius - 4);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, 2) || this.colliders.blocked(x, z, 1.5)) continue;
      const s = 0.35 + this.rand() * this.rand() * 1.7;
      addRock(x, z, s * 1.25, s * 0.8, s, s > 0.7);
      placed++;
    }

    // Standing stones ring the boss arena, with gaps at the south entrance and the north exit.
    const ring = 22;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * TAU;
      const fromSouth = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
      const fromNorth = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      if (fromSouth < 0.3 || fromNorth < 0.3) continue;
      const x = arena.x + Math.cos(a) * (arena.radius + 2);
      const z = arena.z + Math.sin(a) * (arena.radius + 2);
      addRock(x, z, 1.3, 2.6 + this.rand() * 1.4, 1.2, true);
    }

    // Boulders walling in the gate.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        addRock(gate.x + side * (6.5 + i * 3.4), gate.z - 0.5 + i * 0.9, 2.6, 3.2 + this.rand() * 1.5, 2.4, true);
      }
    }
    // The same at the gate back to the last biome, mirrored: it stands at the south edge.
    if (returnGate) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          addRock(returnGate.x + side * (6.5 + i * 3.4), returnGate.z + 0.5 - i * 0.9, 2.6, 3.2 + this.rand() * 1.5, 2.4, true);
        }
      }
    }

    this.instanced(new THREE.DodecahedronGeometry(1, 0), toonMaterial(), items, true);
  }

  private buildGrass(): void {
    const { grassTufts, worldRadius, waters } = this.layout;
    const p = this.biome.palette;
    const tip = p.grassTip ?? 0xb9d463;

    // One tuft = five leaning blades. Vertex colour darkens the base.
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.31;
      const bx = Math.cos(a) * 0.07;
      const bz = Math.sin(a) * 0.07;
      const px = -Math.sin(a) * 0.055;
      const pz = Math.cos(a) * 0.055;
      const h = 0.42 + (k % 3) * 0.1;
      positions.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * 0.2, h, bz + Math.sin(a) * 0.2);
      colors.push(0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1, 1, 1);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    // Unlit: a lit double-sided blade would shade its back face dark.
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.unlit.push({ material, day: new THREE.Color(0xffffff) });

    const chunkSize = 54;
    const buckets = new Map<string, Instance[]>();
    for (let i = 0; i < grassTufts; i++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * (worldRadius + 4);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, -1)) continue;
      if (waters.some((w) => Math.hypot(x - w.x, z - w.z) < w.radius + 1.5)) continue;
      if (this.rivers.some((river) => {
        const s = sampleRiver(river, x, z);
        return s !== null && s.dist < s.halfWidth + 1.5;
      })) continue;
      const s = 0.5 + this.rand() * 0.6;
      _q.setFromEuler(_e.set(0, this.rand() * TAU, 0));
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, this.heightAt(x, z) - 0.03, z), _q, new THREE.Vector3(s, s * (0.8 + this.rand() * 0.6), s),
      );
      const color = new THREE.Color(p.groundAlt).lerp(_c.set(tip), this.rand() * 0.6);
      const key = `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push({ matrix, color });
    }
    for (const [key, items] of buckets) {
      const [cx, cz] = key.split(',').map(Number);
      const mesh = this.instanced(geo, material, items, false);
      mesh.receiveShadow = false;
      this.grassChunks.push({ mesh, x: (cx + 0.5) * chunkSize, z: (cz + 0.5) * chunkSize });
    }
  }

  private buildBushes(): void {
    const geo = flatShade(mergeGeometries([
      new THREE.IcosahedronGeometry(0.75, 1).translate(0, 0.55, 0),
      new THREE.IcosahedronGeometry(0.55, 1).translate(0.6, 0.4, 0.2),
      new THREE.IcosahedronGeometry(0.6, 1).translate(-0.55, 0.42, -0.25),
    ]));
    const items = this.layout.berryBushes.map(([x, z]) => {
      _q.setFromEuler(_e.set(0, this.rand() * TAU, 0));
      return {
        matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, this.heightAt(x, z), z), _q, new THREE.Vector3(1.15, 1.15, 1.15)),
        color: new THREE.Color(0x3d8a44),
      };
    });
    this.instanced(geo, toonMaterial(), items, true);
  }

  private buildDen(): void {
    const { den } = this.layout;
    const p = this.biome.palette;
    const y = this.heightAt(den.x, den.z);
    const rockMat = toonMaterial({ color: new THREE.Color(p.rock).multiplyScalar(0.82).getHex() });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const den3d = new THREE.Group();
    den3d.position.set(den.x, y, den.z);
    const boulders: [number, number, number, number, number, number, number][] = [
      // x, y, z, sx, sy, sz, yaw
      [-2.5, 1.0, 0.2, 2.1, 2.5, 3.0, 0.3],
      [2.5, 1.0, 0.2, 2.1, 2.4, 3.0, 1.1],
      [0, 3.1, 0.4, 4.3, 1.5, 3.4, 0.5],
      [0, 1.2, 2.6, 3.6, 2.9, 2.2, 2.0],
    ];
    for (const [x, by, z, sx, sy, sz, yaw] of boulders) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.position.set(x, by, z);
      m.scale.set(sx, sy, sz);
      m.rotation.y = yaw;
      m.castShadow = true;
      m.receiveShadow = true;
      den3d.add(m);
    }
    const dark = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 3.2), new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    dark.position.set(0, 1.1, 0.5);
    den3d.add(dark);
    this.group.add(den3d);

    // A ring of pale stones marks the edge of the refuge. They are low enough to step over.
    const stoneRand = mulberry32(this.layout.seed + 71);
    const stones: Instance[] = [];
    // About one stone every 3.3 m of the ring, whatever its radius.
    const stoneCount = Math.round(den.refugeRadius * 1.9);
    for (let i = 0; i < stoneCount; i++) {
      const a = (i / stoneCount) * TAU;
      const x = den.x + Math.cos(a) * den.refugeRadius;
      const z = den.z + Math.sin(a) * den.refugeRadius;
      if (this.colliders.blocked(x, z, 0.6)) continue;
      const s = 0.42 + stoneRand() * 0.22;
      _q.setFromEuler(_e.set(stoneRand() * 0.4, stoneRand() * TAU, stoneRand() * 0.4));
      stones.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(x, this.heightAt(x, z) + s * 0.2, z), _q, new THREE.Vector3(s * 1.2, s * 0.75, s),
        ),
        color: new THREE.Color(0xe6dfc9).multiplyScalar(0.9 + stoneRand() * 0.15),
      });
    }
    this.instanced(rockGeo, toonMaterial(), stones, true);

    this.colliders.add(den.x - 2.6, den.z + 0.2, 2.3, 6);
    this.colliders.add(den.x + 2.6, den.z + 0.2, 2.3, 6);
    this.colliders.add(den.x, den.z + 2.4, 3.2, 6);
  }

  /**
   * The snakes' cave: a ring of boulders around the floor with a gap for the mouth, a roof of flat rock over it, a dark
   * floor, a dark ceiling that hides the gaps between the stones, and bones.
   */
  private buildCaves(): void {
    // The first cave keeps the random sequences it always had (+808, +809, +810), so the Jungle's cave is unchanged.
    this.layout.caves?.forEach((cave, i) => this.buildCave(cave, i * 10));
  }

  private buildCave(cave: CaveDef, seedStep: number): void {
    const floor = this.heightAt(cave.x, cave.z);
    const rand = mulberry32(this.layout.seed + 808 + seedStep);
    const rock = new THREE.Color(this.biome.palette.rock).multiplyScalar(0.72);
    const rocks: Instance[] = [];
    const place = (stone: CaveStone, wall: boolean): void => {
      _q.setFromEuler(_e.set(0, stone.yaw, 0));
      const y = (wall ? this.heightAt(stone.x, stone.z) : floor) + stone.y;
      rocks.push({
        matrix: new THREE.Matrix4().compose(new THREE.Vector3(stone.x, y, stone.z), _q, new THREE.Vector3(stone.sx, stone.sy, stone.sz)),
        color: rock.clone().multiplyScalar(0.8 + rand() * 0.35),
      });
      // The walls stop an animal; a flier clears them above 6.5 m. The roof is overhead and stops nothing.
      if (wall) this.colliders.add(stone.x, stone.z, stone.r, 6.5);
    };
    for (const wall of caveWalls(cave, this.layout.seed + 809 + seedStep)) place(wall, true);
    for (const slab of caveRoof(cave, this.layout.seed + 810 + seedStep)) place(slab, false);
    this.instanced(new THREE.DodecahedronGeometry(1, 0), toonMaterial(), rocks, true);

    const dark = new THREE.Mesh(new THREE.CircleGeometry(cave.radius + 0.7, 28).rotateX(-Math.PI / 2), toonMaterial({ color: 0x2a2018 }));
    dark.position.set(cave.x, floor + 0.05, cave.z);
    dark.receiveShadow = true;
    this.group.add(dark);

    // A dark, low dome inside the ring of rocks: anything seen between two stones is black, not daylight. Its gap faces
    // the mouth. (A sphere's angle runs from -x toward +z, so a direction of `deg` degrees is 180 - deg here.)
    const gap = ((mouthHalfDeg(cave) + 14) * Math.PI) / 180;
    const centre = ((180 - cave.mouthDeg) * Math.PI) / 180;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(cave.radius + 0.6, 28, 10, centre + gap, TAU - 2 * gap, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x120d0a, side: THREE.BackSide }),
    );
    dome.scale.y = 0.72;
    dome.position.set(cave.x, floor, cave.z);
    this.group.add(dome);

    // Bones scattered over the floor.
    const bones: Instance[] = [];
    for (let i = 0; i < 18; i++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * (cave.radius - 1);
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.3, rand() * TAU, (rand() - 0.5) * 0.3));
      const length = 0.35 + rand() * 0.45;
      bones.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(cave.x + Math.cos(a) * d, floor + 0.1, cave.z + Math.sin(a) * d), _q, new THREE.Vector3(1, length, 1),
        ),
        color: new THREE.Color(0xe6dfc9).multiplyScalar(0.8 + rand() * 0.25),
      });
    }
    const bone = mergeGeometries([
      new THREE.CylinderGeometry(0.035, 0.035, 1, 5).rotateZ(Math.PI / 2),
      new THREE.SphereGeometry(0.065, 6, 5).translate(0.5, 0, 0),
      new THREE.SphereGeometry(0.065, 6, 5).translate(-0.5, 0, 0),
    ]);
    this.instanced(bone, toonMaterial(), bones, false);
  }

  /**
   * A stone gateway. `inward` is +1 for a gate at the north edge (the way in from it is south, +z) and -1
   * for one at the south edge. The gate onward has a barrier of logs until the boss is beaten; the gate back
   * is always open.
   */
  private buildGate(gate: GateDef, inward: 1 | -1, barred: boolean): void {
    const p = this.biome.palette;
    const y = this.heightAt(gate.x, gate.z);
    const g = new THREE.Group();
    g.position.set(gate.x, y, gate.z);
    if (inward < 0) g.rotation.y = Math.PI;

    const stone = toonMaterial({ color: new THREE.Color(p.rock).multiplyScalar(0.9).getHex() });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 6.8, 1.7), stone);
      pillar.position.set(side * 3.5, 3.2, 0);
      pillar.castShadow = true;
      g.add(pillar);
      this.colliders.add(gate.x + side * 3.5, gate.z, 1.2);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.3, 2.0), stone);
    lintel.position.set(0, 6.9, 0);
    lintel.castShadow = true;
    g.add(lintel);

    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 6.4),
      new THREE.MeshBasicMaterial({ color: barred ? 0x0e140d : 0xdfffb5 }),
    );
    portal.position.set(0, 3.1, -0.6);
    g.add(portal);

    if (barred) {
      this.gatePortal = portal;
      const wood = toonMaterial({ color: p.trunk });
      for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.7, 7), wood);
        log.rotation.z = Math.PI / 2 + (i % 2 ? 0.06 : -0.05);
        log.position.set(0, 0.8 + i * 1.15, 0.35);
        log.castShadow = true;
        this.gateBarrier.add(log);
      }
      for (const side of [-1, 1]) {
        const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 6.2, 6), wood);
        brace.rotation.z = side * 0.75;
        brace.position.set(0, 2.5, 0.6);
        this.gateBarrier.add(brace);
      }
      g.add(this.gateBarrier);
    }
    this.group.add(g);
    // The opening itself is walled off: an animal travels by pressing E at the gate, not by walking through.
    for (const dx of [-1.6, 0, 1.6]) this.colliders.add(gate.x + dx, gate.z - 0.4 * inward, 1.0);
  }

  /** A ribbon of water along each river, with streaks that slide downstream. */
  private buildRivers(): void {
    for (const river of this.rivers) {
      const pts = river.points;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const tx = (b.x - a.x) / len;
        const tz = (b.z - a.z) / len;
        // A little wider than the water, so the edge is hidden in the bank.
        const hw = pts[i].width / 2 + 0.35;
        positions.push(pts[i].x + tz * hw, 0, pts[i].z - tx * hw, pts[i].x - tz * hw, 0, pts[i].z + tx * hw);
        const v = river.along[i] / FLOW_TILE;
        uvs.push(0, v, 1, v);
        if (i < pts.length - 1) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const texture = flowTexture(new THREE.Color(this.biome.palette.water), 0.2, 21);
      const mat = toonMaterial({ transparent: true, opacity: 0.84 });
      mat.map = texture;
      mat.depthWrite = false;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = river.surfaceY;
      mesh.renderOrder = 1;
      this.waters.push({ mesh, y: river.surfaceY });
      // The streaks move a little faster than the water carries an animal, so the flow reads at a glance.
      this.flows.push({ texture, speed: (river.current * 1.8) / FLOW_TILE });
      this.group.add(mesh);
    }
  }

  /** The waterfall: a sheet of falling water from the lip of the cliff to the pool, with mist and foam at its foot. */
  private buildWaterfall(): void {
    const fall = this.waterfall;
    if (!fall) return;
    const cols = 6;
    const rows = 12;
    const drop = fall.topY - fall.bottomY;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    // Across the fall: at right angles to the way the water goes.
    const ax = fall.dirZ;
    const az = -fall.dirX;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      // Thrown water: steady forward, faster and faster down. It starts a step back from the lip, on the stream.
      const out = -0.8 + (fall.run + 0.8) * t;
      const y = fall.topY - drop * t * t;
      const half = (fall.width / 2) * (1 + t * 0.25);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const across = (u - 0.5) * 2 * half;
        positions.push(fall.topX + fall.dirX * out + ax * across, y, fall.topZ + fall.dirZ * out + az * across);
        uvs.push(u, (t * drop) / FLOW_TILE);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * (cols + 1) + c;
        indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const texture = flowTexture(new THREE.Color(this.biome.palette.water).lerp(_c.set(0xffffff), 0.55), 0.55, 44);
    const mat = toonMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    mat.map = texture;
    const sheet = new THREE.Mesh(geo, mat);
    this.flows.push({ texture, speed: 9 / FLOW_TILE });
    this.group.add(sheet);

    // Foam where the water lands, and a few slow puffs of mist drifting above it.
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.unlit.push({ material: white, day: new THREE.Color(0xffffff) });
    const foam = new THREE.Mesh(new THREE.CircleGeometry(fall.width * 0.75, 20).rotateX(-Math.PI / 2), white);
    foam.position.set(fall.bottomX, fall.bottomY + 0.05, fall.bottomZ);
    foam.renderOrder = 2;
    this.waters.push({ mesh: foam, y: fall.bottomY + 0.05 });
    this.group.add(foam);

    const haze = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    this.unlit.push({ material: haze, day: new THREE.Color(0xffffff) });
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const rand = mulberry32(this.layout.seed + 404);
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(puff, haze);
      const a = rand() * TAU;
      const d = rand() * fall.width * 0.7;
      const y = fall.bottomY + 0.5 + rand() * 1.6;
      mesh.position.set(fall.bottomX + Math.cos(a) * d, y, fall.bottomZ + Math.sin(a) * d);
      mesh.renderOrder = 3;
      const scale = 0.9 + rand() * 1.1;
      this.mist.push({ mesh, y, phase: rand() * TAU, scale });
      this.group.add(mesh);
    }
  }

  /** Lily pads floating on the ponds that have them, a few of them in flower. */
  private buildLilyPads(): void {
    const pads: Instance[] = [];
    const flowers: Instance[] = [];
    const rand = mulberry32(this.layout.seed + 505);
    for (const w of this.layout.waters) {
      const surface = surfaceOf(w, this.layout.waterY);
      for (let i = 0; i < (w.lilyPads ?? 0); i++) {
        const a = rand() * TAU;
        const d = (0.25 + rand() * 0.6) * w.radius;
        const x = w.x + Math.cos(a) * d;
        const z = w.z + Math.sin(a) * d;
        const s = 0.45 + rand() * 0.4;
        _q.setFromEuler(_e.set(0, rand() * TAU, 0));
        pads.push({
          matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, surface + 0.045, z), _q, new THREE.Vector3(s, 1, s)),
          color: new THREE.Color(0x2f7d3a).multiplyScalar(0.85 + rand() * 0.3),
        });
        if (rand() < 0.35) {
          flowers.push({
            matrix: new THREE.Matrix4().compose(new THREE.Vector3(x + s * 0.2, surface + 0.14, z), _q, new THREE.Vector3(0.16, 0.12, 0.16)),
            color: new THREE.Color(rand() < 0.5 ? 0xf2a7c8 : 0xfff3f0),
          });
        }
      }
    }
    if (pads.length === 0) return;
    // A round leaf with a wedge cut out of it.
    this.instanced(new THREE.CircleGeometry(1, 10, 0.35, TAU - 0.7).rotateX(-Math.PI / 2), toonMaterial(), pads, false).renderOrder = 2;
    if (flowers.length) this.instanced(new THREE.IcosahedronGeometry(1, 0), toonMaterial(), flowers, false).renderOrder = 2;
  }

  /** Ferns and broad leaves over the jungle floor. Nothing here blocks an animal. */
  private buildUndergrowth(): void {
    const { worldRadius } = this.layout;
    const rand = mulberry32(this.layout.seed + 303);
    const blades: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const lean = 0.85 + (k % 3) * 0.16;
      // A frond: a long thin leaf, wide across and flat, arching outward from the middle of the plant.
      blades.push(new THREE.ConeGeometry(0.2, 1.5, 4).scale(0.16, 1, 1).translate(0, 0.75, 0).rotateZ(-lean).rotateY((k / 7) * TAU + 0.2));
    }
    const geo = flatShade(mergeGeometries(blades));
    const items: Instance[] = [];
    for (let i = 0; i < 1300; i++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * (worldRadius + 6);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, 0.5) || this.waterDepth(x, z) > 0 || this.inRefuge(x, z, -4)) continue;
      if (slopeAt(this.heightAt, x, z) > 1) continue;
      const s = 0.7 + rand() * 0.9;
      _q.setFromEuler(_e.set(0, rand() * TAU, 0));
      items.push({
        matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, this.heightAt(x, z) - 0.05, z), _q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s)),
        color: new THREE.Color(0x2f8a3a).lerp(_c.set(0x57a83c), rand()).multiplyScalar(0.8 + rand() * 0.35),
      });
    }
    const mat = toonMaterial({ side: THREE.DoubleSide });
    const mesh = this.instanced(geo, mat, items, false);
    mesh.receiveShadow = true;
  }

  /** Vines hanging from the crowns of the canopy trees. They stop well above the ground. */
  private buildVines(): void {
    const rand = mulberry32(this.layout.seed + 606);
    const items: Instance[] = [];
    for (const t of this.treeSpots) {
      if (t.pine || rand() > 0.45) continue;
      const count = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        const a = rand() * TAU;
        const d = (0.9 + rand() * 1.7) * t.s;
        const top = t.y + 6.7 * t.tall;
        const length = Math.min(top - (t.y + 2.4), 1.8 + rand() * 3.2);
        _q.setFromEuler(_e.set((rand() - 0.5) * 0.12, rand() * TAU, (rand() - 0.5) * 0.12));
        items.push({
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(t.x + Math.cos(a) * d, top, t.z + Math.sin(a) * d), _q, new THREE.Vector3(1, length, 1),
          ),
          color: new THREE.Color(0x3d6b2f).multiplyScalar(0.8 + rand() * 0.4),
        });
      }
    }
    // A thin cord hanging down from where it is tied, one unit long.
    this.instanced(new THREE.CylinderGeometry(0.04, 0.03, 1, 4).translate(0, -0.5, 0), toonMaterial(), items, false);
  }
}

const STILL = { x: 0, z: 0 };
/** Metres of river (or of falling water) that one copy of the streak texture covers. */
const FLOW_TILE = 10;

/** How one biome's two kinds of tree look, and what part of each blocks an animal. */
interface TreeLook {
  crown: THREE.BufferGeometry;
  second: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  /** The second kind's own trunk, if it is not the same as the first kind's (a palm's thin leaning trunk). */
  secondTrunk?: THREE.BufferGeometry;
  secondColor: number;
  /** Trunk radius and height of the top of the trunk, at size 1. */
  size: { radius: number; top: number };
  secondSize: { radius: number; top: number };
}

/** The Forest: round-crowned broadleaf trees and pines on short trunks. */
function forestTrees(): TreeLook {
  return {
    crown: flatShade(mergeGeometries([
      new THREE.IcosahedronGeometry(1.95, 1).translate(0, 4.5, 0),
      new THREE.IcosahedronGeometry(1.35, 1).translate(1.0, 3.7, 0.4),
      new THREE.IcosahedronGeometry(1.45, 1).translate(-0.9, 3.9, -0.5),
    ])),
    second: flatShade(mergeGeometries([
      new THREE.ConeGeometry(1.95, 2.9, 8).translate(0, 3.3, 0),
      new THREE.ConeGeometry(1.5, 2.6, 8).translate(0, 4.9, 0),
      new THREE.ConeGeometry(1.0, 2.3, 8).translate(0, 6.4, 0),
    ])),
    trunk: new THREE.CylinderGeometry(0.2, 0.36, 3.6, 7).translate(0, 1.6, 0),
    secondColor: 0x2f7245,
    size: { radius: 0.4, top: 3.4 },
    secondSize: { radius: 0.4, top: 3.4 },
  };
}

/** The Jungle: tall canopy trees with wide flat crowns and buttress roots, and leaning palms. */
function jungleTrees(): TreeLook {
  const trunkParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.28, 0.5, 7.2, 7).translate(0, 3.4, 0)];
  for (let k = 0; k < 3; k++) {
    // Buttress roots: thin fins flaring out at the foot.
    trunkParts.push(new THREE.ConeGeometry(0.5, 1.6, 4).scale(1, 1, 0.26).translate(0.45, 0.6, 0).rotateY((k / 3) * TAU + 0.4));
  }

  const segment = (r0: number, r1: number, length: number, x: number, y: number, tilt: number) =>
    new THREE.CylinderGeometry(r0, r1, length, 6).rotateZ(-tilt).translate(x, y, 0);
  const fronds: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.34, 6, 5).translate(1.0, 5.85, 0)];
  for (let k = 0; k < 8; k++) {
    const droop = 0.3 + (k % 3) * 0.14;
    fronds.push(
      new THREE.ConeGeometry(0.55, 3.3, 4).scale(0.14, 1, 1).translate(0, 1.65, 0)
        .rotateZ(-(Math.PI / 2 + droop)).rotateY((k / 8) * TAU).translate(1.0, 5.95, 0),
    );
  }

  return {
    crown: flatShade(mergeGeometries([
      new THREE.IcosahedronGeometry(3.0, 1).scale(1, 0.5, 1).translate(0, 7.7, 0),
      new THREE.IcosahedronGeometry(2.1, 1).scale(1, 0.55, 1).translate(1.7, 8.4, 0.8),
      new THREE.IcosahedronGeometry(2.3, 1).scale(1, 0.5, 1).translate(-1.5, 8.0, -1.1),
    ])),
    second: flatShade(mergeGeometries(fronds)),
    trunk: flatShade(mergeGeometries(trunkParts)),
    secondTrunk: mergeGeometries([
      segment(0.2, 0.27, 2.3, 0.05, 0.95, 0.06),
      segment(0.17, 0.2, 2.2, 0.3, 3.0, 0.16),
      segment(0.14, 0.17, 2.1, 0.75, 4.9, 0.26),
    ]),
    secondColor: 0x4a9a3a,
    size: { radius: 0.5, top: 6.6 },
    secondSize: { radius: 0.28, top: 5.6 },
  };
}

/**
 * A texture of flowing water: the water's colour with pale streaks along the flow. It repeats along its
 * height, so sliding it makes the streaks run downstream.
 */
function flowTexture(base: THREE.Color, strength: number, streaks: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, canvas.width, canvas.height);
    const rand = mulberry32(streaks * 31 + 5);
    for (let i = 0; i < streaks; i++) {
      const x = 6 + rand() * (canvas.width - 12);
      const y = rand() * canvas.height;
      const length = 22 + rand() * 62;
      const width = 1.5 + rand() * 3.5;
      g.fillStyle = `rgba(255, 255, 255, ${(strength * (0.5 + rand())).toFixed(3)})`;
      // Drawn three times so that a streak crossing the top edge carries on at the bottom.
      for (const wrap of [-canvas.height, 0, canvas.height]) {
        g.beginPath();
        g.ellipse(x, y + wrap, width, length / 2, 0, 0, TAU);
        g.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
