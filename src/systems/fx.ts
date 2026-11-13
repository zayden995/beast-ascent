import * as THREE from 'three';

interface Effect {
  mesh: THREE.Mesh;
  t: number;
  duration: number;
  step: (k: number, mesh: THREE.Mesh) => void;
}

const flat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false });

/** Short-lived ground effects that make attacks readable: slashes, shockwave rings, charge warnings. */
export class Fx {
  private scene: THREE.Scene;
  private effects: Effect[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  private discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  private shared = new Set<THREE.BufferGeometry>([this.ringGeo, this.discGeo, this.stripGeo]);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private spawn(mesh: THREE.Mesh, duration: number, step: Effect['step']): void {
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.effects.push({ mesh, t: 0, duration, step });
    step(0, mesh);
  }

  /** Expanding shockwave ring. */
  ring(pos: THREE.Vector3, radius: number, color: number, duration = 0.45): void {
    const mesh = new THREE.Mesh(this.ringGeo, flat(color, 0.9));
    mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    this.spawn(mesh, duration, (k, m) => {
      const s = radius * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      m.scale.set(s, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
  }

  /** Arc swept by a melee attack, in front of the attacker. */
  slash(pos: THREE.Vector3, yaw: number, reach: number, arcDeg: number, height: number, color: number): void {
    const arc = (arcDeg * Math.PI) / 180;
    const geo = new THREE.RingGeometry(reach * 0.45, reach, 20, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, flat(color, 0.75));
    mesh.position.set(pos.x, pos.y + height, pos.z);
    mesh.rotation.y = yaw;
    this.spawn(mesh, 0.2, (k, m) => {
      const s = 0.75 + 0.25 * k;
      m.scale.set(s, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
    });
  }

  /** Warning strip on the ground along a charge path. */
  chargeWarning(pos: THREE.Vector3, yaw: number, length: number, width: number, duration: number): void {
    const mesh = new THREE.Mesh(this.stripGeo, flat(0xff3b2f, 0.0));
    mesh.position.set(pos.x, pos.y + 0.2, pos.z);
    mesh.rotation.y = yaw;
    mesh.scale.set(width, 1, length);
    this.spawn(mesh, duration, (k, m) => {
      (m.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.2 * k;
    });
  }

  /** Warning disc that fills in before an area attack lands. */
  areaWarning(pos: THREE.Vector3, radius: number, duration: number): void {
    const mesh = new THREE.Mesh(this.discGeo, flat(0xff3b2f, 0.0));
    mesh.position.set(pos.x, pos.y + 0.18, pos.z);
    mesh.scale.set(radius, 1, radius);
    this.spawn(mesh, duration, (k, m) => {
      (m.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.2 * k;
    });
  }

  update(dt: number): void {
    for (const e of this.effects) {
      e.t += dt;
      e.step(Math.min(1, e.t / e.duration), e.mesh);
    }
    const done = this.effects.filter((e) => e.t >= e.duration);
    if (done.length) {
      for (const e of done) this.remove(e);
      this.effects = this.effects.filter((e) => e.t < e.duration);
    }
  }

  private remove(e: Effect): void {
    e.mesh.removeFromParent();
    (e.mesh.material as THREE.Material).dispose();
    if (!this.shared.has(e.mesh.geometry)) e.mesh.geometry.dispose();
  }

  dispose(): void {
    for (const e of this.effects) this.remove(e);
    this.effects = [];
    for (const g of this.shared) g.dispose();
  }
}
