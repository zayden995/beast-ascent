import * as THREE from 'three';
import { TAU, damp, lerp } from '../core/math.ts';
import type { AnimalAppearance, AnimalModel, AnimState } from './AnimalModel.ts';
import { PartBuilder } from './ProceduralQuadruped.ts';
import { toonMaterial } from './toon.ts';

const DARK = 0x1c1a18;
const FEATHER = 0x3a2a1a;
const BEAK = 0xe8b923;

const sphere = (r: number) => new THREE.SphereGeometry(r, 10, 8);

interface Wing {
  pivot: THREE.Group;
  side: number;
}

/**
 * A bird built from primitives, with procedural animation: it perches with its wings folded,
 * hops on the ground, flaps while climbing, glides level, and sweeps its wings back in a dive.
 * Model space: +Z forward, +Y up, origin on the ground between the feet. It is the second rig
 * behind `AnimalModel` (the first is `ProceduralQuadruped`).
 */
export class ProceduralBird implements AnimalModel {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly radius: number;

  private material: THREE.MeshToonMaterial;
  private body = new THREE.Group();
  private torso!: THREE.Mesh;
  private neck = new THREE.Group();
  private wings: Wing[] = [];
  private legs: THREE.Group[] = [];
  private tail = new THREE.Group();

  private look: AnimalAppearance;
  private hip: number;
  private size: number;
  private phase = 0;
  private flapPhase = 0;
  private time = Math.random() * 10;
  private amp = 0;
  private spread = 0;
  private air = 0;
  private pitch = 0;

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
    const headTop = this.buildHead();
    this.buildWings();
    this.buildTail();

    this.root.scale.setScalar(this.size);
    this.height = headTop * this.size;
    this.radius = (p.bodyWidth * 0.5 + p.bodyLength * 0.2) * this.size;
  }

  private buildTorso(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const w = p.bodyWidth / p.bodyHeight;
    const b = new PartBuilder();
    b.add(new THREE.CapsuleGeometry(r, Math.max(0.01, p.bodyLength - 2 * r), 4, 10), c.body, [0, 0, 0], [Math.PI / 2, 0, 0], [w, 1, 1]);
    // A paler breast, and the rump.
    b.add(sphere(r * p.chestBulk), c.belly, [0, -r * 0.15, halfL - r * 0.9], [0, 0, 0], [w, 1, 1.1]);
    b.add(sphere(r), c.body, [0, r * 0.05, -halfL + r * 0.9], [0, 0, 0], [w, 0.95, 1.1]);
    // Feathered thighs.
    for (const s of [1, -1]) b.add(sphere(r * 0.7), c.belly, [s * r * w * 0.8, -r * 0.5, -halfL * 0.05], [0, 0, 0], [0.7, 1.15, 1.25]);
    this.torso = b.build(this.material);
    this.body.add(this.torso);
  }

  private buildLegs(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const pivotY = -r * 0.5;
    const total = this.hip + pivotY;
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * p.bodyWidth * 0.3, pivotY, -halfL * 0.05);
      const lb = new PartBuilder();
      lb.segment([0, 0, 0], [0, -total, 0], p.legThickness * 1.1, p.legThickness * 0.8, c.accent);
      // Three toes forward and one back, each with a dark claw.
      for (const a of [-0.4, 0, 0.4]) {
        lb.add(new THREE.ConeGeometry(0.02, 0.1, 4), c.accent, [Math.sin(a) * 0.05, -total + 0.015, Math.cos(a) * 0.05], [Math.PI / 2, 0, -a]);
        lb.add(new THREE.ConeGeometry(0.014, 0.05, 4), DARK, [Math.sin(a) * 0.1, -total + 0.012, Math.cos(a) * 0.1], [Math.PI / 2, 0, -a]);
      }
      lb.add(new THREE.ConeGeometry(0.018, 0.07, 4), DARK, [0, -total + 0.015, -0.04], [-Math.PI / 2, 0, 0]);
      pivot.add(lb.build(this.material));
      this.body.add(pivot);
      this.legs.push(pivot);
    }
  }

  /** Returns the height of the top of the head in model space. */
  private buildHead(): number {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const hr = (p.headSize * this.look.headScale) / 2;

    this.neck.position.set(0, r * 0.45, halfL - r * 0.3);
    this.body.add(this.neck);
    const nb = new PartBuilder();
    nb.segment([0, 0, 0], [0, p.neckLength * 0.9, p.neckLength * 0.5], r * 0.7, hr * 0.85, c.body);
    this.neck.add(nb.build(this.material));

    const head = new THREE.Group();
    head.position.set(0, p.neckLength * 0.9, p.neckLength * 0.5);
    this.neck.add(head);
    const hb = new PartBuilder();
    hb.add(sphere(hr), c.body, [0, 0, 0], [0, 0, 0], [0.95, 0.95, 1.1]);
    hb.add(sphere(hr * 0.8), c.belly, [0, hr * 0.15, -hr * 0.7], [0, 0, 0], [1, 0.9, 0.8]);
    for (const s of [1, -1]) {
      // A heavy brow over a pale eye gives it the hard look of a raptor.
      hb.add(new THREE.BoxGeometry(hr * 0.55, hr * 0.14, hr * 0.7), FEATHER, [s * hr * 0.5, hr * 0.4, hr * 0.5], [0.25, 0, 0]);
      hb.add(sphere(hr * 0.17), 0xe0b020, [s * hr * 0.62, hr * 0.2, hr * 0.55]);
      hb.add(sphere(hr * 0.09), DARK, [s * hr * 0.7, hr * 0.2, hr * 0.6]);
    }
    // The hooked beak.
    hb.add(new THREE.ConeGeometry(hr * 0.55, hr * 1.25, 6), BEAK, [0, -hr * 0.18, hr * 1.15], [Math.PI / 2 + 0.2, 0, 0]);
    hb.add(new THREE.ConeGeometry(hr * 0.22, hr * 0.5, 5), DARK, [0, -hr * 0.52, hr * 1.7], [Math.PI / 2 + 0.9, 0, 0]);
    head.add(hb.build(this.material));
    return this.hip + this.neck.position.y + head.position.y + hr;
  }

  private buildWings(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    const arm = 0.5;
    const hand = 0.5;
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * p.bodyWidth * 0.42, r * 0.35, halfL * 0.2);

      const ib = new PartBuilder();
      ib.add(new THREE.BoxGeometry(arm, 0.035, 0.34), c.body, [s * arm * 0.5, 0, -0.02]);
      ib.add(new THREE.BoxGeometry(arm * 0.85, 0.03, 0.12), c.belly, [s * arm * 0.45, 0.013, 0.1]);
      // The trailing edge: a row of darker flight feathers.
      for (let k = 0; k < 5; k++) {
        ib.add(new THREE.BoxGeometry((arm / 5) * 0.96, 0.02, 0.15), FEATHER, [s * arm * ((k + 0.5) / 5), -0.005, -0.22]);
      }
      pivot.add(ib.build(this.material));

      const outer = new THREE.Group();
      outer.position.set(s * arm, 0, 0);
      pivot.add(outer);
      const ob = new PartBuilder();
      ob.add(new THREE.BoxGeometry(hand * 0.6, 0.03, 0.22), c.body, [s * hand * 0.3, 0, 0]);
      // Finger feathers fanning out at the tip.
      for (let k = 0; k < 6; k++) {
        const len = hand * (1 - k * 0.07);
        ob.add(new THREE.BoxGeometry(len, 0.02, 0.075), k % 2 ? FEATHER : c.body, [s * len * 0.5, 0, 0.11 - k * 0.075], [0, s * (k - 2.5) * -0.05, 0]);
      }
      outer.add(ob.build(this.material));

      this.body.add(pivot);
      this.wings.push({ pivot, side: s });
    }
  }

  private buildTail(): void {
    const p = this.look.body;
    const c = this.look.colors;
    const r = p.bodyHeight / 2;
    const halfL = p.bodyLength / 2;
    this.tail.position.set(0, r * 0.1, -halfL + r * 0.5);
    const tb = new PartBuilder();
    // A fan of long feathers with a pale band near the tip.
    for (let k = -2; k <= 2; k++) {
      tb.add(new THREE.BoxGeometry(0.075, 0.02, p.tailLength * 1.4), k % 2 ? c.body : FEATHER, [k * 0.045, 0, -p.tailLength * 0.7], [0, k * -0.1, 0]);
      tb.add(new THREE.BoxGeometry(0.075, 0.022, 0.06), c.belly, [k * 0.055, 0, -p.tailLength * 1.2], [0, k * -0.1, 0]);
    }
    this.tail.add(tb.build(this.material));
    this.body.add(this.tail);
  }

  update(dt: number, s: AnimState): void {
    const p = this.look.body;
    this.time += dt;
    const dead = s.deathT >= 0;
    const flying = s.flying && !dead;
    const moving = s.speed > 0.2 && !dead && !flying;

    const stride = 0.55;
    if (moving) this.phase += (s.speed / stride) * TAU * dt;
    this.amp = damp(this.amp, moving ? 0.55 : 0, 10, dt);
    this.air = damp(this.air, flying || (!s.grounded && !dead) ? 1 : 0, 9, dt);

    const attack = s.attackT >= 0 ? Math.sin(Math.PI * Math.min(1, s.attackT)) * s.attackPower : 0;
    const windup = s.windupT >= 0 ? Math.min(1, s.windupT) : 0;
    const diving = flying && s.attackT >= 0;
    const death = dead ? 1 - (1 - Math.min(1, s.deathT * 2.5)) ** 2 : 0;

    // Wings: folded on the ground, flapping when climbing, level when gliding, swept back in a dive.
    const flapping = flying && s.climb > 0.15;
    this.flapPhase += dt * (flapping ? 11 : 3);
    const spreadTarget = diving ? 0.55 : flying ? 1 : attack > 0.05 ? 0.5 : 0;
    this.spread = damp(this.spread, spreadTarget, 9, dt);
    const flap = flapping ? Math.sin(this.flapPhase) * 0.75 + 0.1 : s.climb < -0.1 ? 0.22 + Math.sin(this.time * 2) * 0.03 : 0.12 + Math.sin(this.time * 2.4) * 0.05;
    for (const w of this.wings) {
      const fold = 1 - this.spread;
      w.pivot.rotation.y = w.side * (fold * 1.35 + (diving ? 0.55 : 0));
      w.pivot.rotation.z = w.side * lerp(-0.3, flap, this.spread);
      w.pivot.scale.x = lerp(0.5, 1, this.spread) * (diving ? 0.8 : 1);
    }

    // Legs: hop on the ground, tuck back in flight, reach forward with the talons to strike.
    for (let i = 0; i < this.legs.length; i++) {
      const walk = Math.sin(this.phase + i * Math.PI) * 0.6 * this.amp;
      this.legs[i].rotation.x = lerp(walk, 1.25, this.air) - attack * (this.air > 0.5 ? 2.4 : 1.0) + death * 0.4;
    }

    // Body: perched with its chest up, level in flight, nose down in a dive.
    const pitchTarget = diving ? 0.9 : flying ? -s.climb * 0.3 + (s.climb < 0 ? 0.08 : 0) : -0.45;
    this.pitch = damp(this.pitch, pitchTarget, 8, dt);
    const hop = Math.abs(Math.sin(this.phase)) * 0.035 * this.amp;
    this.body.position.y = lerp(this.hip + hop - windup * 0.03, p.bodyWidth * 0.5, death);
    this.body.position.z = attack * 0.2 - windup * 0.06;
    this.body.rotation.x = this.pitch - windup * 0.15 + attack * 0.2;
    this.body.rotation.z = death * (Math.PI / 2) + (s.dodgeT >= 0 ? s.dodgeT * TAU : 0);

    const breath = dead ? 0 : Math.sin(this.time * 2.4) * 0.014;
    this.torso.scale.set(1 + breath, 1 + breath, 1);
    this.neck.rotation.x = attack * 0.5 - windup * 0.3 + death * 0.4 + (flying ? 0.25 : -0.1);
    this.neck.rotation.z = s.stunned && !dead ? Math.sin(this.time * 13) * 0.2 : 0;
    this.tail.rotation.x = flying ? 0.1 + (diving ? 0.5 : 0) : 0.35;

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
