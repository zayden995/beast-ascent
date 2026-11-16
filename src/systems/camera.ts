import * as THREE from 'three';
import { TAU, clamp, damp, lerp } from '../core/math.ts';
import type { TitleViewDef } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import type { HeightFn } from '../logic/heightfield.ts';
import { titleCameraPose } from '../logic/titleView.ts';

const T = TUNING.camera;

/** What the camera needs to know about trunks and rocks: is this spot, this high above the ground, inside one? */
export interface CameraObstacles {
  blocked(x: number, z: number, radius: number, height?: number): boolean;
}

/**
 * Third-person orbit camera that follows a target smoothly, stays above the terrain, and moves in closer
 * when a tree trunk or a rock would otherwise stand between it and the animal.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Orbit angle around the target. Forward on the ground is (sin yaw, cos yaw). */
  yaw = Math.PI;
  pitch = T.startPitch;

  private focus = new THREE.Vector3();
  private distance = 6;
  /** How far out the camera can sit right now without a trunk or rock in the way. */
  private clear = 6;
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

  update(dt: number, target: THREE.Vector3, targetHeight: number, size: number, heightAt: HeightFn, obstacles?: CameraObstacles): void {
    const wantDistance = T.baseDistance + T.distancePerSize * size;
    const lambda = this.snapNext ? 1e6 : T.followLambda;
    this.distance = damp(this.distance, wantDistance, this.snapNext ? 1e6 : 4, dt);

    const fx = target.x;
    const fy = target.y + targetHeight * 0.85;
    const fz = target.z;
    this.focus.set(damp(this.focus.x, fx, lambda, dt), damp(this.focus.y, fy, lambda, dt), damp(this.focus.z, fz, lambda, dt));

    const cp = Math.cos(this.pitch);
    const sx = -Math.sin(this.yaw) * cp;
    const sy = Math.sin(this.pitch);
    const sz = -Math.cos(this.yaw) * cp;

    // Walk out from the animal toward where the camera wants to be; stop short of the first trunk or rock.
    let reach = this.distance;
    if (obstacles) {
      const steps = Math.ceil(this.distance / 0.35);
      for (let i = 1; i <= steps; i++) {
        const k = (i / steps) * this.distance;
        const x = this.focus.x + sx * k;
        const z = this.focus.z + sz * k;
        const above = this.focus.y + sy * k - heightAt(x, z);
        // A cliff or a steep bank counts too: ground that stands well above the line of sight would hide the animal.
        if (above < -T.wallDepth || obstacles.blocked(x, z, T.clearance, above)) {
          reach = Math.max(Math.min(T.minDistance, this.distance), k - 0.35);
          break;
        }
      }
    }
    // Move in at once (so the trunk never hides the animal), and back out gently.
    this.clear = reach < this.clear || this.snapNext ? reach : damp(this.clear, reach, 3, dt);

    this.desired.set(this.focus.x + sx * this.clear, this.focus.y + sy * this.clear, this.focus.z + sz * this.clear);
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
