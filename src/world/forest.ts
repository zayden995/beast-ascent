import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flatShade, toonMaterial } from '../animals/toon.ts';
import { TAU, fbm2, mulberry32 } from '../core/math.ts';
import { BIOMES, FOREST_LAYOUT } from '../data/biomes.ts';
import { createForestHeight } from '../logic/heightfield.ts';
import type { HeightFn } from '../logic/heightfield.ts';
import { ColliderGrid } from './colliders.ts';
import { buildTerrainMesh } from './terrain.ts';

interface Placement {
  x: number;
  z: number;
  s: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** The Forest biome: terrain, vegetation, pond, den, boss arena and the gate to the next biome. */
export class ForestWorld {
  readonly group = new THREE.Group();
  readonly layout = FOREST_LAYOUT;
  readonly biome = BIOMES.forest;
  readonly heightAt: HeightFn;
  readonly colliders = new ColliderGrid();
  /** Players and animals are kept inside this radius. */
  readonly boundary: number;

  private rand = mulberry32(FOREST_LAYOUT.seed);
  private water!: THREE.Mesh;
  private gateBarrier = new THREE.Group();
  private gatePortal!: THREE.Mesh;
  private grassChunks: { mesh: THREE.InstancedMesh; x: number; z: number }[] = [];
  private grassMaterial: THREE.MeshBasicMaterial | null = null;
  private gateOpen = false;

  constructor(scene: THREE.Scene) {
    this.heightAt = createForestHeight(this.layout);
    this.boundary = this.layout.worldRadius - 3;

    this.group.add(buildTerrainMesh(this.heightAt, this.layout, this.biome.palette));
    this.buildWater();
    this.buildTrees();
    this.buildRocks();
    this.buildGrass();
    this.buildBushes();
    this.buildDen();
    this.buildGate();
    scene.add(this.group);
  }

  // ---------- Queries used by gameplay ----------

  /** Depth of water at a point (0 on dry land). */
  waterDepth(x: number, z: number): number {
    const { pond } = this.layout;
    if (Math.hypot(x - pond.x, z - pond.z) > pond.radius) return 0;
    return Math.max(0, pond.waterY - this.heightAt(x, z));
  }

  nearWater(x: number, z: number): boolean {
    const { pond, nearWaterMargin } = this.layout;
    return Math.hypot(x - pond.x, z - pond.z) < pond.radius + nearWaterMargin;
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
    const { den, arena, pond, gate, playerSpawn } = this.layout;
    if (Math.hypot(x - den.x, z - den.z) < den.radius + margin) return false;
    if (Math.hypot(x - playerSpawn.x, z - playerSpawn.z) < 5 + margin) return false;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.radius + 3 + margin) return false;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.radius - 1 + margin) return false;
    if (Math.hypot(x - gate.x, z - gate.z) < gate.radius + margin) return false;
    if (Math.abs(x - gate.x) < 4 + margin * 0.5 && z < arena.z && z > gate.z - 2) return false;
    return true;
  }

  setGateOpen(open: boolean): void {
    this.gateOpen = open;
    this.gateBarrier.visible = !open;
    (this.gatePortal.material as THREE.MeshBasicMaterial).color.set(open ? 0xdfffb5 : 0x0e140d);
  }

  isGateOpen(): boolean {
    return this.gateOpen;
  }

  /** Grass blades are unlit, so the sky hands them the colour of the current light (day and night). */
  setUnlitTint(tint: THREE.Color): void {
    this.grassMaterial?.color.copy(tint);
  }

  update(time: number, cameraPos: THREE.Vector3): void {
    this.water.position.y = this.layout.pond.waterY + Math.sin(time * 0.8) * 0.03;
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
    this.group.removeFromParent();
  }

  // ---------- Construction ----------

  private buildWater(): void {
    const { pond } = this.layout;
    const geo = new THREE.CircleGeometry(pond.radius, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = toonMaterial({ color: this.biome.palette.water, transparent: true, opacity: 0.8 });
    mat.depthWrite = false;
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.set(pond.x, pond.waterY, pond.z);
    this.water.renderOrder = 1;
    this.group.add(this.water);
  }

  private instanced(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    items: { matrix: THREE.Matrix4; color: THREE.Color }[],
    shadows: boolean,
  ): THREE.InstancedMesh {
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
    const placed: (Placement & { pine: boolean })[] = [];
    const maxR = worldRadius + 18;
    for (let attempts = 0; placed.length < trees && attempts < trees * 14; attempts++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * maxR;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, 3)) continue;
      // Leave open meadows inside the playable area.
      if (d < worldRadius && fbm2(x * 0.03, z * 0.03, seed + 33, 2) > 0.3) continue;
      if (placed.some((t) => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
      placed.push({ x, z, s: 0.85 + this.rand() * 0.7, pine: this.rand() < 0.4 });
    }

    const leafGeo = flatShade(mergeGeometries([
      new THREE.IcosahedronGeometry(1.95, 1).translate(0, 4.5, 0),
      new THREE.IcosahedronGeometry(1.35, 1).translate(1.0, 3.7, 0.4),
      new THREE.IcosahedronGeometry(1.45, 1).translate(-0.9, 3.9, -0.5),
    ]));
    const pineGeo = flatShade(mergeGeometries([
      new THREE.ConeGeometry(1.95, 2.9, 8).translate(0, 3.3, 0),
      new THREE.ConeGeometry(1.5, 2.6, 8).translate(0, 4.9, 0),
      new THREE.ConeGeometry(1.0, 2.3, 8).translate(0, 6.4, 0),
    ]));
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 3.6, 7).translate(0, 1.6, 0);

    const leaves: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const pines: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const trunks: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    for (const t of placed) {
      const y = this.heightAt(t.x, t.z) - 0.2;
      _q.setFromEuler(_e.set(0, this.rand() * TAU, 0));
      const tall = t.s * (0.9 + this.rand() * 0.35);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), _q, new THREE.Vector3(t.s, tall, t.s));
      const shade = 0.85 + this.rand() * 0.3;
      if (t.pine) {
        pines.push({ matrix, color: new THREE.Color(0x2f7245).multiplyScalar(shade) });
      } else {
        const color = new THREE.Color(p.foliage).lerp(_c.set(p.foliageAlt), this.rand()).multiplyScalar(shade);
        leaves.push({ matrix, color });
      }
      trunks.push({ matrix, color: new THREE.Color(p.trunk).multiplyScalar(0.85 + this.rand() * 0.3) });
      // The trunk blocks up to its top; a flier passes through the foliage above it.
      this.colliders.add(t.x, t.z, 0.4 * t.s, 3.4 * tall);
    }
    this.instanced(leafGeo, toonMaterial(), leaves, true);
    this.instanced(pineGeo, toonMaterial(), pines, true);
    this.instanced(trunkGeo, toonMaterial(), trunks, true);
  }

  private buildRocks(): void {
    const { rocks, worldRadius, arena, gate } = this.layout;
    const p = this.biome.palette;
    const items: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
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

    this.instanced(new THREE.DodecahedronGeometry(1, 0), toonMaterial(), items, true);
  }

  private buildGrass(): void {
    const { grassTufts, worldRadius, pond } = this.layout;
    const p = this.biome.palette;

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
    this.grassMaterial = material;

    const chunkSize = 54;
    const buckets = new Map<string, { matrix: THREE.Matrix4; color: THREE.Color }[]>();
    for (let i = 0; i < grassTufts; i++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * (worldRadius + 4);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isOpenGround(x, z, -1)) continue;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.radius + 1.5) continue;
      const s = 0.5 + this.rand() * 0.6;
      _q.setFromEuler(_e.set(0, this.rand() * TAU, 0));
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x, this.heightAt(x, z) - 0.03, z), _q, new THREE.Vector3(s, s * (0.8 + this.rand() * 0.6), s),
      );
      const color = new THREE.Color(p.groundAlt).lerp(_c.set(0xb9d463), this.rand() * 0.6);
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
    const stones: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
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

  private buildGate(): void {
    const { gate } = this.layout;
    const p = this.biome.palette;
    const y = this.heightAt(gate.x, gate.z);
    const g = new THREE.Group();
    g.position.set(gate.x, y, gate.z);

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

    this.gatePortal = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 6.4),
      new THREE.MeshBasicMaterial({ color: 0x0e140d }),
    );
    this.gatePortal.position.set(0, 3.1, -0.6);
    g.add(this.gatePortal);

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
    this.group.add(g);
    // The barrier itself: a row of small colliders across the opening, removed logically by setGateOpen
    // is not needed because nothing lies beyond the gate in this milestone (TODO(M3): real passage).
    for (const dx of [-1.6, 0, 1.6]) this.colliders.add(gate.x + dx, gate.z - 0.4, 1.0);
  }
}
