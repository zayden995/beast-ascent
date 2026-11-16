import * as THREE from 'three';
import { TAU, damp, lerp, smoothstep } from '../core/math.ts';
import type { AnimalAppearance, AnimalModel, AnimState } from './AnimalModel.ts';
import { PartBuilder } from './ProceduralQuadruped.ts';
import { toonMaterial } from './toon.ts';

const DARK = 0x14120f;
const EYE = 0xe8c53a;
const TONGUE = 0xc2263a;
/** How many rounded pieces the body is made of. */
const SEGMENTS = 30;

const sphere = (r: number) => new THREE.SphereGeometry(r, 9, 7);

/**
 * A snake built from primitives, with procedural animation: it slithers (a wave runs back along the body),
 * rests in a loose S with its head raised and its tongue flicking, rears back before it strikes, lunges when it
 * does, shivers when stunned and dies belly up. It is the third rig behind `AnimalModel`. It reads the same
 * `BodyPlan` as the others, but only a few of its fields: `bodyLength` is the length of the whole snake,
 * `bodyWidth` how thick it is at its thickest and `headSize` the width of its head.
 * Model space: +Z forward, +Y up, origin on the ground under the middle of the snake.
 */
export class ProceduralSnake implements AnimalModel {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly radius: number;

  private material: THREE.MeshToonMaterial;
  /** Everything that moves: lifted by half the thickness, so that rolling over turns it about its own middle. */
  private inner = new THREE.Group();
  private segs: THREE.Mesh[] = [];
  private radii: number[] = [];
  private head = new THREE.Group();
  private tongue = new THREE.Group();

  private look: AnimalAppearance;
  private length: number;
  private thick: number;
  private time = Math.random() * 10;
  private phase = Math.random() * TAU;
  private move = 0;
  private lift = 0;
  private size: number;

  constructor(look: AnimalAppearance) {
    this.look = look;
    const p = look.body;
    this.size = look.size;
    this.length = p.bodyLength;
    this.thick = p.bodyWidth;
    this.material = toonMaterial({ vertexColors: true, rim: 0.3 });

    this.root.add(this.inner);
    this.inner.position.y = this.thick / 2;
    this.buildBody();
    this.buildHead();

    this.root.scale.setScalar(this.size);
    this.height = this.thick * 2.2 * this.size;
    this.radius = Math.max(0.28, this.length * 0.15) * this.size;
  }

  /** The radius of the body at a point along it: 0 at the snout, 1 at the tail's tip. */
  private radiusAt(s: number): number {
    const half = this.thick / 2;
    const neck = lerp(0.62, 1, smoothstep(0, 0.16, s));
    const taper = 1 - 0.9 * smoothstep(0.5, 1, s) ** 1.15;
    return half * neck * taper;
  }

  private buildBody(): void {
    const c = this.look.colors;
    const spacing = this.length / (SEGMENTS - 1);
    for (let i = 0; i < SEGMENTS; i++) {
      const s = i / (SEGMENTS - 1);
      const r = Math.max(0.012, this.radiusAt(s));
      this.radii.push(r);
      const b = new PartBuilder();
      // A rounded piece, stretched along the snake so that thin pieces near the tail still touch their neighbours.
      const stretch = Math.max(1.3, (spacing * 1.05) / r);
      b.add(sphere(r), c.body, [0, 0, 0], [0, 0, 0], [1, 0.92, stretch]);
      // A paler underside (it shows when the snake rolls over in death), and a darker band over the back every third piece.
      b.add(sphere(r * 0.94), c.belly, [0, -r * 0.45, 0], [0, 0, 0], [0.74, 0.5, stretch * 0.98]);
      // Dark bands across the back, two pieces in every four.
      if (i % 4 >= 2) b.add(sphere(r * 1.03), c.accent, [0, r * 0.14, 0], [0, 0, 0], [0.96, 0.78, stretch * 1.02]);
      const mesh = b.build(this.material);
      this.segs.push(mesh);
      this.inner.add(mesh);
    }
  }

  private buildHead(): void {
    const c = this.look.colors;
    const hr = this.look.body.headSize / 2;
    const b = new PartBuilder();
    // A wedge: a flattened skull, a blunt snout, a pale lower jaw, and yellow eyes with dark slits.
    b.add(sphere(hr), c.body, [0, hr * 0.05, -hr * 0.1], [0, 0, 0], [1.08, 0.62, 1.3]);
    b.add(sphere(hr * 0.72), c.body, [0, -hr * 0.04, hr * 0.85], [0, 0, 0], [0.88, 0.5, 1.0]);
    b.add(sphere(hr * 0.86), c.belly, [0, -hr * 0.28, hr * 0.28], [0, 0, 0], [0.86, 0.34, 1.25]);
    b.add(sphere(hr * 0.2), c.accent, [0, hr * 0.28, -hr * 0.05], [0, 0, 0], [1.6, 0.5, 2.4]);
    for (const side of [1, -1]) {
      b.add(sphere(hr * 0.24), EYE, [side * hr * 0.62, hr * 0.2, hr * 0.32]);
      b.add(sphere(hr * 0.1), DARK, [side * hr * 0.75, hr * 0.2, hr * 0.42], [0, 0, 0], [0.5, 1.4, 0.6]);
      b.add(sphere(hr * 0.06), DARK, [side * hr * 0.2, hr * 0.02, hr * 1.5]);
    }
    this.head.add(b.build(this.material));

    // A forked tongue that flicks out now and then.
    const t = new PartBuilder();
    t.add(new THREE.CylinderGeometry(hr * 0.045, hr * 0.045, hr * 1.2, 4), TONGUE, [0, 0, hr * 0.6], [Math.PI / 2, 0, 0]);
    for (const side of [1, -1]) {
      t.add(new THREE.CylinderGeometry(hr * 0.02, hr * 0.035, hr * 0.5, 4), TONGUE, [side * hr * 0.14, 0, hr * 1.32], [Math.PI / 2, side * 0.45, 0]);
    }
    this.tongue.position.set(0, -hr * 0.12, hr * 1.4);
    this.tongue.add(t.build(this.material));
    this.head.add(this.tongue);
    this.inner.add(this.head);
  }

  update(dt: number, s: AnimState): void {
    const L = this.length;
    const thick = this.thick;
    this.time += dt;
    const dead = s.deathT >= 0;
    const moving = (s.speed > 0.15 || s.swimming) && !dead;
    this.move = damp(this.move, moving ? 1 : 0, 6, dt);

    // The wave runs back along the body as fast as the snake goes forward, so that its coils seem to stay where they are.
    const wavelength = L * 0.55;
    const k = TAU / wavelength;
    const forward = moving ? Math.max(0.9, s.speed / this.size) : 0.18;
    this.phase += forward * k * dt;

    const attack = s.attackT >= 0 ? Math.sin(Math.PI * Math.min(1, s.attackT)) * s.attackPower : 0;
    const windup = s.windupT >= 0 ? Math.min(1, s.windupT) : 0;
    const death = dead ? 1 - (1 - Math.min(1, s.deathT * 2.5)) ** 2 : 0;

    // How far the head is raised: a little at rest, high when rearing back for a strike, low in the lunge.
    const restLift = thick * lerp(0.9, 0.25, this.move);
    const targetLift = (restLift + windup * L * 0.3) * (1 - attack * 0.75) * (1 - death);
    this.lift = damp(this.lift, targetLift, 14, dt);
    const swing = L * lerp(0.1, 0.075, this.move) * (1 - death * 0.85);

    this.inner.position.z = attack * L * 0.22 - windup * L * 0.1;
    this.inner.rotation.z = death * Math.PI;

    const xs: number[] = [];
    const zs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const f = i / (SEGMENTS - 1);
      const along = f * L;
      // Near the head the wave is small, so the head keeps pointing the way the snake is going.
      xs.push(swing * (0.18 + 0.82 * f) * Math.sin(k * along - this.phase));
      zs.push(L * 0.5 - along * 0.97);
      ys.push(this.radii[i] - thick / 2 + this.lift * (1 - smoothstep(0, 0.34, f)));
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(SEGMENTS - 1, i + 1);
      const seg = this.segs[i];
      seg.position.set(xs[i], ys[i], zs[i]);
      seg.rotation.y = Math.atan2(xs[a] - xs[b], zs[a] - zs[b]);
      seg.rotation.x = Math.atan2(ys[b] - ys[a], Math.hypot(xs[a] - xs[b], zs[a] - zs[b])) * 0.7;
    }

    const lifted = Math.min(1, this.lift / (thick * 2));
    const yaw = Math.atan2(xs[0] - xs[2], zs[0] - zs[2]);
    this.head.position.set(xs[0], ys[0] + this.radii[0] * 0.15, zs[0] + this.look.body.headSize * 0.25);
    this.head.rotation.set(0.1 + lifted * 0.55 - windup * 0.25 + attack * 0.15, yaw, s.stunned && !dead ? Math.sin(this.time * 13) * 0.25 : 0, 'YXZ');

    // A flick of the tongue every couple of seconds, and a hiss (a longer, faster one) while winding up.
    const flick = Math.max(Math.max(0, Math.sin(this.time * 2.1)) ** 10, windup);
    this.tongue.scale.z = dead ? 0.05 : 0.1 + flick * (0.9 + Math.sin(this.time * 38) * 0.1);

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
