import { TAU, lerp } from '../core/math.ts';
import type { TitleViewDef } from '../core/types.ts';

export interface TitleCameraPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/**
 * Where the title screen's camera is at `time`. It swings back and forth along an arc around the pond
 * (smoothly, resting at both ends), always looking toward the water, moved a little to one side so that the
 * animals sit to the right of the lettering.
 */
export function titleCameraPose(view: TitleViewDef, time: number, heightAt: (x: number, z: number) => number): TitleCameraPose {
  const k = 0.5 - 0.5 * Math.cos((time / view.period) * TAU);
  const angle = (lerp(view.fromDeg, view.toDeg, k) * Math.PI) / 180;
  const x = view.centre.x + Math.cos(angle) * view.radius;
  const z = view.centre.z + Math.sin(angle) * view.radius;
  // The direction the camera faces (toward the middle of the pond) and the way that is "to the right".
  const fx = (view.centre.x - x) / view.radius;
  const fz = (view.centre.z - z) / view.radius;
  const lookX = view.centre.x - -fz * view.shift;
  const lookZ = view.centre.z - fx * view.shift;
  return { x, y: heightAt(x, z) + view.height, z, lookX, lookY: heightAt(lookX, lookZ) + view.lookHeight, lookZ };
}
