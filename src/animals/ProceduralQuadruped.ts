import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TAU, damp, lerp } from '../core/math.ts';
import type { AnimalAppearance, AnimalModel, AnimState } from './AnimalModel.ts';
import { toonMaterial } from './toon.ts';

type V3 = [number, number, number];

const DARK = 0x1c1a18;
const IVORY = 0xf1ead2;
const SCAR = 0x8a2f2a;

/** Collects primitives for one rigid part and bakes them into a single vertex-coloured mesh. */
class PartBuilder {
  private geos: THREE.BufferGeometry[] = [];
  private static m = new THREE.Matrix4();
  private static q = new THREE.Quaternion();
  private static e = new THREE.Euler();
  private static up = new THREE.Vector3(0, 1, 0);

  add(geo: THREE.BufferGeometry, color: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
    PartBuilder.q.setFromEuler(PartBuilder.e.set(rot[0], rot[1], rot[2]));
    this.push(geo, color, new THREE.Vector3(...pos), PartBuilder.q, new THREE.Vector3(...scale));
  }

  /** A tapered limb between two points. */
  segment(from: V3, to: V3, r0: number, r1: number, color: number): void {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    PartBuilder.q.setFromUnitVectors(PartBuilder.up, dir.normalize());
    const geo = new THREE.CylinderGeometry(r1, r0, len, 6);
    this.push(geo, color, a.add(b).multiplyScalar(0.5), PartBuilder.q, new THREE.Vector3(1, 1, 1));
  }

  private push(geo: THREE.BufferGeometry, color: number, pos: THREE.Vector3, q: THREE.Quaternion, scale: THREE.Vector3): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    g.applyMatrix4(PartBuilder.m.compose(pos, q, scale));
    const c = new THREE.Color(color);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
  }

  build(material: THREE.Material): THREE.Mesh {
    const merged = mergeGeometries(this.geos);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    return mesh;
  }
}

interface Leg {
  upper: THREE.Group;
  lower: THREE.Group;
  front: boolean;
  trot: number;
  gallop: number;
}

const sphere = (r: number) => new THREE.SphereGeometry(r, 10, 8);

/**
 * Parametric four-legged animal built from primitives, with procedural animation.
 * Model space: +Z forward, +Y up, origin on the ground between the feet.
 */
export class ProceduralQuadruped implements AnimalModel {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly radius: number;

  private material: THREE.MeshToonMaterial;
  private body = new THREE.Group();
  private torso!: THREE.Mesh;
  private neck = new THREE.Group();
  private legs: Leg[] = [];
  private tail: THREE.Group[] = [];
  private tailBase: number[] = [];

  private look: AnimalAppearance;
  private hip: number;
  private size: number;
  private phase = 0;
  private time = Math.random() * 10;
  private amp = 0;
  private run = 0;
  private air = 0;

  constructor(look: AnimalAppearance) {
    this.look = look;
    const p = look.body;
    this.size = look.size;
    this.hip = p.legLength + p.bodyHeight * 0.5;
    this.material = toonMaterial({ vertexColors: true, rim: 0.3 });

    this.root.add(this.body);
    this.body.position.y = this.hip;
    this.buildTorso();
    this.buildLegs();
    const headTop = this.buildNeckAndHead();
    this.buildTail();

    this.root.scale.setScalar(this.size);
    this.height = headTop * this.size;
    this.radius = (p.bodyWidth * 0.5 + p.bodyLength * 0.2) * this.size;
  }

  private has(feature: string): boolean {
    return (this.look.features as string[]).includes(feature);
  }

  private buildTorso(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const w = p.bodyWidth / p.bodyHeight;
    const b = new PartBuilder();

    b.add(new THREE.CapsuleGeometry(r, Math.max(0.01, p.bodyLength - 2 * r), 4, 10), c.body, [0, 0, 0], [Math.PI / 2, 0, 0], [w, 1, 1]);
    b.add(sphere(r * p.chestBulk), c.body, [0, r * 0.04, halfL - r * 0.95], [0, 0, 0], [w, 1, 1.1]);
    b.add(sphere(r * 1.03), c.body, [0, 0, -halfL + r * 0.95], [0, 0, 0], [w, 1, 1.05]);
    b.add(new THREE.CapsuleGeometry(r * 0.8, Math.max(0.01, p.bodyLength * 0.8 - 1.6 * r), 4, 10), c.belly, [0, -r * 0.3, 0], [Math.PI / 2, 0, 0], [w * 0.88, 1, 1]);

    if (this.has('hump')) {
      b.add(sphere(r * 0.78), c.accent, [0, r * 0.62, halfL * 0.42], [0, 0, 0], [w * 0.8, 0.8, 1.2]);
    }
    if (this.has('ridge')) {
      for (let i = 0; i < 6; i++) {
        const z = lerp(halfL * 0.75, -halfL * 0.55, i / 5);
        b.add(new THREE.ConeGeometry(r * 0.16, r * 0.5, 5), c.accent, [0, r * 1.05, z], [-0.5, 0, 0]);
      }
    }
    this.torso = b.build(this.material);
    this.body.add(this.torso);
  }

  private buildLegs(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const t = p.legThickness;
    const pivotY = -r * 0.25;
    const total = this.hip + pivotY;
    const upperLen = total * 0.5;
    const lowerLen = total - upperLen;

    const defs: { x: number; front: boolean; trot: number; gallop: number }[] = [
      { x: 1, front: true, trot: 0, gallop: 0 },
      { x: -1, front: true, trot: Math.PI, gallop: 0.55 },
      { x: 1, front: false, trot: Math.PI, gallop: Math.PI },
      { x: -1, front: false, trot: 0, gallop: Math.PI + 0.55 },
    ];
    for (const d of defs) {
      const upper = new THREE.Group();
      upper.position.set(d.x * p.bodyWidth * 0.31, pivotY, d.front ? halfL - r * 0.8 : -halfL + r * 0.8);
      const bulk = d.front ? 1.0 : 1.2;
      const ub = new PartBuilder();
      ub.add(sphere(t * 1.3 * bulk), c.body, [0, 0, 0], [0, 0, 0], [1, 1.25, 1.2]);
      ub.add(new THREE.CylinderGeometry(t * 1.3 * bulk, t * 0.92, upperLen, 8), c.body, [0, -upperLen / 2, 0]);
      upper.add(ub.build(this.material));

      const lower = new THREE.Group();
      lower.position.y = -upperLen;
      const lb = new PartBuilder();
      lb.add(sphere(t * 0.95), c.body, [0, 0, 0]);
      lb.add(new THREE.CylinderGeometry(t * 0.9, t * 0.72, lowerLen - t * 0.5, 8), c.body, [0, -(lowerLen - t * 0.5) / 2, 0]);
      lb.add(sphere(t * 1.1), c.accent, [0, -lowerLen + t * 0.6, t * 0.35], [0, 0, 0], [1, 0.55, 1.35]);
      lower.add(lb.build(this.material));
      upper.add(lower);

      this.body.add(upper);
      this.legs.push({ upper, lower, front: d.front, trot: d.trot, gallop: d.gallop });
    }
  }

  /** Returns the height of the top of the head in model space. */
  private buildNeckAndHead(): number {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const a = p.neckAngle;
    const hr = (p.headSize * this.look.headScale) / 2;
    const dir: V3 = [0, Math.sin(a), Math.cos(a)];

    this.neck.position.set(0, r * 0.3, halfL - r * 0.6);
    this.body.add(this.neck);

    const nb = new PartBuilder();
    nb.segment(
      [0, -dir[1] * r * 0.4, -dir[2] * r * 0.4],
      [0, dir[1] * p.neckLength, dir[2] * p.neckLength],
      r * 0.72, hr * 0.8, c.body,
    );
    if (this.has('ruff')) {
      nb.add(sphere(hr * 1.25), c.belly, [0, dir[1] * p.neckLength * 0.55 - hr * 0.25, dir[2] * p.neckLength * 0.55], [0, 0, 0], [1.2, 0.95, 0.9]);
    }
    this.neck.add(nb.build(this.material));

    const head = new THREE.Group();
    head.position.set(0, dir[1] * p.neckLength, dir[2] * p.neckLength);
    this.neck.add(head);

    const hb = new PartBuilder();
    const snout = p.snoutLength * this.look.headScale;
    hb.add(sphere(hr), c.body, [0, 0, 0], [0, 0, 0], [0.96, 0.9, 1.05]);
    hb.add(new THREE.CylinderGeometry(hr * 0.42, hr * 0.66, snout, 8), c.body, [0, -hr * 0.22, hr * 0.7 + snout / 2], [Math.PI / 2, 0, 0], [1, 1, 0.82]);
    hb.add(sphere(hr * 0.52), c.belly, [0, -hr * 0.42, hr * 0.62], [0, 0, 0], [0.9, 0.6, 1.2]);
    hb.add(sphere(hr * 0.2), DARK, [0, -hr * 0.14, hr * 0.7 + snout]);
    for (const s of [1, -1]) {
      hb.add(sphere(hr * 0.15), DARK, [s * hr * 0.52, hr * 0.22, hr * 0.7]);
      const e = p.earSize * this.look.headScale;
      if (p.ears === 'pointed') {
        hb.add(new THREE.ConeGeometry(e * 0.55, e * 1.5, 5), c.accent, [s * hr * 0.55, hr * 0.85 + e * 0.4, -hr * 0.15], [0, 0, -s * 0.22]);
      } else if (p.ears === 'round') {
        hb.add(sphere(e), c.accent, [s * hr * 0.72, hr * 0.72, -hr * 0.12], [0, 0, 0], [1, 1, 0.42]);
      } else if (p.ears === 'long') {
        hb.add(new THREE.ConeGeometry(e * 0.42, e * 1.9, 5), c.body, [s * (hr * 0.75 + e * 0.5), hr * 0.62 + e * 0.35, -hr * 0.3], [0, 0, -s * 0.95]);
      }
    }

    let top = hr;
    if (this.has('mane') || this.has('maneSmall')) {
      const k = this.has('mane') ? 1.8 : 1.35;
      hb.add(sphere(hr * k), c.accent, [0, -hr * 0.15, -hr * 0.85], [0, 0, 0], [1.05, 1.12, 0.85]);
      if (this.has('mane')) hb.add(sphere(hr * 1.2), c.accent, [0, -hr * 1.3, -hr * 0.2], [0, 0, 0], [0.9, 1, 0.8]);
      top = Math.max(top, hr * (k * 1.12 - 0.15));
    }
    if (this.has('antlers') || this.has('antlersSmall')) {
      const k = this.has('antlers') ? 1 : 0.42;
      for (const s of [1, -1]) {
        const base: V3 = [s * hr * 0.4, hr * 0.75, -hr * 0.25];
        const p1: V3 = [base[0] + s * 0.14 * k, base[1] + 0.26 * k, base[2] - 0.08 * k];
        const p2: V3 = [p1[0] + s * 0.17 * k, p1[1] + 0.25 * k, p1[2] + 0.02 * k];
        hb.segment(base, p1, 0.03 * k + 0.006, 0.024 * k + 0.004, c.accent);
        hb.segment(p1, p2, 0.024 * k + 0.004, 0.016 * k + 0.003, c.accent);
        hb.segment(p1, [p1[0] + s * 0.02 * k, p1[1] + 0.17 * k, p1[2] + 0.17 * k], 0.018 * k + 0.003, 0.004, c.accent);
        if (this.has('antlers')) {
          const p3: V3 = [p2[0] + s * 0.03, p2[1] + 0.24, p2[2] + 0.1];
          hb.segment(p2, p3, 0.02, 0.006, c.accent);
          hb.segment(p2, [p2[0] + s * 0.12, p2[1] + 0.14, p2[2] + 0.15], 0.016, 0.004, c.accent);
          hb.segment(base, [base[0] + s * 0.05, base[1] + 0.1, base[2] + 0.22], 0.02, 0.004, c.accent);
          hb.segment(p1, [p1[0] + s * 0.16, p1[1] + 0.06, p1[2] - 0.1], 0.016, 0.004, c.accent);
        }
        top = Math.max(top, p2[1] + (this.has('antlers') ? 0.24 : 0));
      }
    }
    if (this.has('tusks')) {
      for (const s of [1, -1]) {
        const from: V3 = [s * hr * 0.45, -hr * 0.4, hr * 0.7 + snout * 0.55];
        hb.segment(from, [from[0] + s * hr * 0.32, from[1] + hr * 0.75, from[2] + hr * 0.25], hr * 0.13, hr * 0.03, IVORY);
      }
    }
    if (this.has('scar')) {
      hb.add(new THREE.BoxGeometry(hr * 0.1, hr * 0.95, hr * 0.1), SCAR, [hr * 0.5, hr * 0.22, hr * 0.74], [0.25, 0, 0.3]);
    }
    head.add(hb.build(this.material));

    return this.hip + this.neck.position.y + head.position.y + top;
  }

  private buildTail(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const tipColor = this.has('tailTipLight') ? c.belly : this.has('tailTipDark') ? c.accent : c.body;
    const baseY = r * 0.3;
    const baseZ = -halfL + r * 0.12;

    if (p.tail === 'stub') {
      const g = new THREE.Group();
      g.position.set(0, baseY, baseZ);
      const b = new PartBuilder();
      b.add(sphere(p.tailLength * 0.7), tipColor, [0, 0, -p.tailLength * 0.4]);
      g.add(b.build(this.material));
      this.body.add(g);
      this.tail.push(g);
      this.tailBase.push(0);
      return;
    }

    const segments = 3;
    const segLen = p.tailLength / segments;
    const droop = p.tail === 'bushy' ? 0.55 : p.tail === 'tuft' ? 0.95 : 0.7;
    const curl = p.tail === 'tuft' ? 0.32 : p.tail === 'bushy' ? -0.08 : 0.12;
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < segments; i++) {
      const g = new THREE.Group();
      const baseRot = i === 0 ? -(Math.PI / 2 + droop) : curl;
      if (i === 0) g.position.set(0, baseY, baseZ);
      else g.position.y = segLen;
      g.rotation.x = baseRot;
      const b = new PartBuilder();
      const last = i === segments - 1;
      const color = last ? tipColor : c.body;
      if (p.tail === 'bushy') {
        const rad = p.bodyHeight * [0.17, 0.24, 0.19][i];
        b.add(sphere(1), color, [0, segLen * 0.5, 0], [0, 0, 0], [rad, segLen * 0.72, rad]);
      } else {
        const thick = p.legThickness * (p.tail === 'tuft' ? 0.3 : 0.42) * (1 - i * 0.22);
        b.add(new THREE.CylinderGeometry(thick * 0.8, thick, segLen, 6), c.body, [0, segLen / 2, 0]);
        if (last && p.tail === 'tuft') b.add(sphere(p.legThickness * 0.75), c.accent, [0, segLen, 0], [0, 0, 0], [1, 1.5, 1]);
      }
      g.add(b.build(this.material));
      parent.add(g);
      parent = g;
      this.tail.push(g);
      this.tailBase.push(baseRot);
    }
  }

  update(dt: number, s: AnimState): void {
    const p = this.look.body;
    this.time += dt;
    const dead = s.deathT >= 0;
    const moving = s.speed > 0.2 && !dead;

    // Gait: one full leg cycle per stride length travelled.
    const stride = Math.max(0.3, p.legLength * this.size * 2.4);
    let rate = (s.speed / stride) * TAU;
    if (s.swimming && !dead) rate = Math.max(rate, 5);
    if (moving || s.swimming) this.phase += rate * dt;

    this.run = damp(this.run, moving && s.sprinting ? 1 : 0, 8, dt);
    const targetAmp = dead ? 0 : s.swimming ? 0.35 : moving ? lerp(0.42, 0.78, this.run) : 0;
    this.amp = damp(this.amp, targetAmp, 10, dt);
    this.air = damp(this.air, s.grounded || s.swimming || dead ? 0 : 1, 12, dt);

    const attack = s.attackT >= 0 ? Math.sin(Math.PI * Math.min(1, s.attackT)) * s.attackPower : 0;
    const windup = s.windupT >= 0 ? Math.min(1, s.windupT) : 0;
    const death = dead ? easeOut(Math.min(1, s.deathT * 2.5)) : 0;

    for (const leg of this.legs) {
      const off = this.run > 0.5 ? leg.gallop : leg.trot;
      const swing = Math.sin(this.phase + off) * this.amp;
      const lift = Math.max(0, -Math.cos(this.phase + off)) * this.amp;
      let upper = swing * (1 - this.air) + this.air * (leg.front ? -0.85 : 0.75);
      let lower = lift * 1.1 + this.air * 0.5;
      if (leg.front) upper -= attack * 0.9;
      else upper += windup * 0.25;
      upper += death * (leg.front ? -0.3 : 0.3);
      leg.upper.rotation.x = upper;
      leg.lower.rotation.x = lower;
    }

    const bob = Math.sin(this.phase * 2) * 0.03 * this.amp * p.legLength;
    this.body.position.y = lerp(this.hip + bob - windup * p.legLength * 0.14, p.bodyWidth * 0.5, death);
    this.body.position.z = attack * p.bodyLength * 0.26 - windup * p.bodyLength * 0.16;
    this.body.rotation.x = Math.sin(this.phase) * 0.06 * this.run * this.amp - windup * 0.14 + attack * 0.1;
    this.body.rotation.z = death * (Math.PI / 2) + (s.dodgeT >= 0 ? s.dodgeT * TAU : 0);

    const breath = dead ? 0 : Math.sin(this.time * 2.2) * 0.012;
    this.torso.scale.set(1 + breath, 1 + breath, 1);

    this.neck.rotation.x = Math.sin(this.phase * 2 + 0.6) * 0.05 * this.amp + attack * 0.45 - windup * 0.3 + death * 0.3;
    this.neck.rotation.z = s.stunned && !dead ? Math.sin(this.time * 13) * 0.2 : 0;

    const wagSpeed = moving ? 7 : 2.2;
    const wag = dead ? 0 : moving ? 0.2 : 0.11;
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.z = Math.sin(this.time * wagSpeed - i * 0.8) * wag;
      if (i === 0 && this.tail.length > 1) this.tail[i].rotation.x = this.tailBase[i] + this.run * 0.45;
    }

    const flash = Math.max(0, Math.min(1, s.hitFlash));
    const warn = Math.max(0, Math.min(1, s.warn));
    this.material.emissive.setRGB(flash * 0.7 + warn * 0.32, flash * 0.7 + warn * 0.03, flash * 0.7);

    const opacity = dead && s.deathT > 0.6 ? Math.max(0, 1 - (s.deathT - 0.6) / 0.4) : 1;
    if (opacity < 1 !== this.material.transparent) {
      this.material.transparent = opacity < 1;
      this.material.needsUpdate = true;
    }
    this.material.opacity = opacity;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    this.material.dispose();
    this.root.removeFromParent();
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
