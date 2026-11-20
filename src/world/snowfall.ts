import * as THREE from 'three';

/** How many flakes fall, and the box round the camera they fall in (metres). */
const FLAKES = 2600;
const BOX = { x: 70, y: 34, z: 70 };
const FALL_SPEED = 1.6;

/**
 * Snow falling round the camera (Winter). The flakes live in a box that follows the camera; each falls at its own pace and drifts a
 * little, and wraps round inside the box, so the snow never runs out wherever the animal goes.
 */
export class Snowfall {
  readonly points: THREE.Points;
  private readonly base: Float32Array;
  private readonly speed: Float32Array;

  constructor(rand: () => number) {
    this.base = new Float32Array(FLAKES * 3);
    this.speed = new Float32Array(FLAKES);
    for (let i = 0; i < FLAKES; i++) {
      this.base[i * 3] = rand() * BOX.x;
      this.base[i * 3 + 1] = rand() * BOX.y;
      this.base[i * 3 + 2] = rand() * BOX.z;
      this.speed[i] = FALL_SPEED * (0.7 + rand() * 0.6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
  }

  /** Places every flake for the time `time` (seconds), in the box round `camera`. */
  update(time: number, camera: THREE.Vector3): void {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const wrap = (v: number, size: number) => ((v % size) + size) % size;
    for (let i = 0; i < FLAKES; i++) {
      const drift = Math.sin(time * 0.7 + i) * 0.6;
      arr[i * 3] = camera.x - BOX.x / 2 + wrap(this.base[i * 3] + drift - camera.x, BOX.x);
      arr[i * 3 + 1] = camera.y - BOX.y / 2 + wrap(this.base[i * 3 + 1] - time * this.speed[i] - camera.y, BOX.y);
      arr[i * 3 + 2] = camera.z - BOX.z / 2 + wrap(this.base[i * 3 + 2] + drift * 0.5 - camera.z, BOX.z);
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
