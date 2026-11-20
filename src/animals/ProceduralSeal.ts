import * as THREE from 'three';
import { TAU, damp, lerp } from '../core/math.ts';
import type { AnimalAppearance, AnimalModel, AnimState } from './AnimalModel.ts';
import { PartBuilder } from './ProceduralQuadruped.ts';
import { toonMaterial } from './toon.ts';

const DARK = 0x16181b;
/** How many rounded pieces the body is made of (a chain, like the snake's, but short and thick). */
const PIECES = 9;

const sphere = (r: number) => new THREE.SphereGeometry(r, 10, 8);

/**
 * A leopard seal (Winter), built like the snake (`ProceduralSnake`) from a chain of rounded pieces, but short and heavy: a thick
 * spotted body that tapers to rear flippers, a long blunt head with a wide jaw, and two front flippers. It undulates as it swims,
 * rears its head back in the wind-up, lunges with its jaw open in the bite, and rolls over when it dies. The fourth rig behind
 * `AnimalModel`. It reads `bodyLength` (the whole seal), `bodyWidth` (how thick) and `headSize` from the body plan.
 * Model space: +Z forward, +Y up, origin under the middle of the seal.
 */
export class ProceduralSeal implements AnimalModel {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly radius: number;

  private material: THREE.MeshToonMaterial;
  private inner = new THREE.Group();
  private pieces: THREE.Mesh[] = [];
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private flippers: THREE.Group[] = [];
  private look: AnimalAppearance;
  private length: number;
  private thick: number;
  private time = Math.random() * 10;
  private phase = Math.random() * TAU;
  private move = 0;

  constructor(look: AnimalAppearance) {
    this.look = look;
    this.length = look.body.bodyLength;
    this.thick = look.body.bodyWidth;
    this.material = toonMaterial({ vertexColors: true, rim: 0.3 });
    this.root.add(this.inner);
    this.inner.position.y = this.thick * 0.45;
    this.build();
    this.root.scale.setScalar(look.size);
    this.height = this.thick * 1.6 * look.size;
    this.radius = (this.thick * 0.55 + this.length * 0.12) * look.size;
  }

  /** The radius of the body at a point along it: 0 at the shoulders, 1 at the rear flippers. */
  private radiusAt(s: number): number {
    return (this.thick / 2) * lerp(1, 0.3, s ** 1.4) * (s < 0.15 ? lerp(0.85, 1, s / 0.15) : 1);
  }

  private build(): void {
    const c = this.look.colors;
    for (let i = 0; i < PIECES; i++) {
      const s = i / (PIECES - 1);
      const r = this.radiusAt(s);
      const b = new PartBuilder();
      b.add(sphere(r), c.body, [0, 0, 0], [0, 0, 0], [1, 0.82, 1.5]);
      b.add(sphere(r * 0.92), c.belly, [0, -r * 0.35, 0], [0, 0, 0], [0.8, 0.5, 1.45]);
      // Dark spots over the back, a leopard seal's.
      if (i % 2 === 0 && i < PIECES - 1) {
        b.add(sphere(r * 0.18), c.accent, [r * 0.45, r * 0.55, 0], [0, 0, 0], [1, 0.4, 1.3]);
        b.add(sphere(r * 0.15), c.accent, [-r * 0.5, r * 0.45, r * 0.3], [0, 0, 0], [1, 0.4, 1.3]);
      }
      const mesh = b.build(this.material);
      this.pieces.push(mesh);
      this.inner.add(mesh);
    }
    // Rear flippers: two flat blades at the tail.
    const tail = new PartBuilder();
    for (const side of [1, -1]) {
      tail.add(new THREE.BoxGeometry(this.thick * 0.32, this.thick * 0.05, this.thick * 0.6), c.accent, [side * this.thick * 0.18, 0, -this.thick * 0.3], [0, side * 0.35, 0]);
    }
    this.pieces[PIECES - 1].add(tail.build(this.material));
    // Front flippers, near the shoulders.
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      const fb = new PartBuilder();
      fb.add(new THREE.BoxGeometry(this.thick * 0.5, this.thick * 0.06, this.thick * 0.24), c.body, [side * this.thick * 0.25, 0, 0]);
      g.add(fb.build(this.material));
      g.position.set(side * this.thick * 0.42, -this.thick * 0.18, 0);
      this.flippers.push(g);
      this.pieces[1].add(g);
    }
    // The head: long and blunt, with a wide jaw that opens in the bite, and small dark eyes.
    const hr = this.look.body.headSize / 2;
    const hb = new PartBuilder();
    hb.add(sphere(hr), c.body, [0, 0, hr * 0.3], [0, 0, 0], [0.95, 0.75, 1.5]);
    hb.add(sphere(hr * 0.7), c.body, [0, -hr * 0.05, hr * 1.25], [0, 0, 0], [0.9, 0.6, 1.0]);
    for (const side of [1, -1]) hb.add(sphere(hr * 0.12), DARK, [side * hr * 0.55, hr * 0.3, hr * 0.85]);
    hb.add(sphere(hr * 0.1), DARK, [0, hr * 0.05, hr * 1.95]);
    this.head.add(hb.build(this.material));
    const jb = new PartBuilder();
    jb.add(sphere(hr * 0.75), c.belly, [0, 0, hr * 0.7], [0, 0, 0], [0.85, 0.35, 1.4]);
    this.jaw.add(jb.build(this.material));
    this.jaw.position.set(0, -hr * 0.35, hr * 0.2);
    this.head.add(this.jaw);
    this.inner.add(this.head);
  }

  update(dt: number, s: AnimState): void {
    const L = this.length;
    this.time += dt;
    const dead = s.deathT >= 0;
    this.move = damp(this.move, (s.speed > 0.15 || s.swimming) && !dead ? 1 : 0.35, 5, dt);
    this.phase += dt * lerp(1.5, 5, this.move);
    const attack = s.attackT >= 0 ? Math.sin(Math.PI * Math.min(1, s.attackT)) * s.attackPower : 0;
    const windup = s.windupT >= 0 ? Math.min(1, s.windupT) : 0;
    const death = dead ? Math.min(1, s.deathT * 2.5) : 0;

    // An up-and-down wave along the body, like a seal swimming.
    const spacing = L / (PIECES - 1);
    let heading = 0;
    for (let i = 0; i < PIECES; i++) {
      const f = i / (PIECES - 1);
      const y = Math.sin(this.phase - f * 3) * this.thick * 0.12 * f;
      const x = Math.sin(this.phase * 0.5 - f * 2) * this.thick * 0.06 * f;
      const piece = this.pieces[i];
      piece.position.set(x, y, L * 0.35 - i * spacing);
      piece.rotation.x = Math.cos(this.phase - f * 3) * 0.25 * f;
      if (i === 0) heading = x;
    }
    for (const [k, g] of this.flippers.entries()) g.rotation.z = (k === 0 ? 1 : -1) * Math.sin(this.phase) * 0.5 * this.move;

    const hr = this.look.body.headSize / 2;
    this.head.position.set(heading, this.thick * 0.15 + windup * this.thick * 0.5, L * 0.35 + hr * 0.6 + attack * L * 0.25 - windup * L * 0.08);
    this.head.rotation.set(-windup * 0.6 + attack * 0.25, 0, s.stunned && !dead ? Math.sin(this.time * 13) * 0.25 : 0);
    this.jaw.rotation.x = Math.max(windup * 0.3, attack * 0.8);
    this.inner.rotation.z = death * Math.PI;

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
