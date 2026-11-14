import * as THREE from 'three';
import { TAU, clamp, damp, lerp } from '../core/math.ts';
import type { TitleViewDef } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import type { HeightFn } from '../logic/heightfield.ts';
import { titleCameraPose } from '../logic/titleView.ts';

const T = TUNING.camera;

/** Third-person orbit camera that follows a target smoothly and stays above the terrain. */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit angle around the target. Forward on the ground is (sin yaw, cos yaw). */
  yaw = Math.PI;
  pitch = T.startPitch;

  private focus = new THREE.Vector3();
  private distance = 6;
  private desired = new THREE.Vector3();
  private snapNext = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(T.fov, aspect, 0.1, 900);
  }

  applyMouse(dx: number, dy: number): void {
    this.yaw -= dx * T.sensitivity;
    this.pitch = clamp(this.pitch + dy * T.sensitivity, T.minPitch, T.maxPitch);
  }

  /** Jump straight to the target on the next update (spawn, respawn). */
  snap(yaw?: number): void {
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = T.startPitch;
    this.snapNext = true;
  }

  update(dt: number, target: THREE.Vector3, targetHeight: number, size: number, heightAt: HeightFn): void {
    const wantDistance = T.baseDistance + T.distancePerSize * size;
    const lambda = this.snapNext ? 1e6 : T.followLambda;
    this.distance = damp(this.distance, wantDistance, this.snapNext ? 1e6 : 4, dt);

    const fx = target.x;
    const fy = target.y + targetHeight * 0.85;
    const fz = target.z;
    this.focus.set(damp(this.focus.x, fx, lambda, dt), damp(this.focus.y, fy, lambda, dt), damp(this.focus.z, fz, lambda, dt));

    const cp = Math.cos(this.pitch);
    this.desired.set(
      this.focus.x - Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z - Math.cos(this.yaw) * cp * this.distance,
    );
    const floor = heightAt(this.desired.x, this.desired.z) + 0.5;
    if (this.desired.y < floor) this.desired.y = floor;

    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.focus);
    this.snapNext = false;
  }

  /** Slow pan back and forth, used behind the title screen. */
  pan(time: number, view: TitleViewDef, heightAt: HeightFn): void {
    const pose = titleCameraPose(view, time, heightAt);
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
