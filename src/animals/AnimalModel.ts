import type * as THREE from 'three';
import type { BodyColors, BodyPlan, FeatureId, RigId } from '../core/types.ts';
import { ProceduralBird } from './ProceduralBird.ts';
import { ProceduralQuadruped } from './ProceduralQuadruped.ts';
import { ProceduralSnake } from './ProceduralSnake.ts';

/** What gameplay tells a model each frame. Models never read game state directly. */
export interface AnimState {
  /** Horizontal speed in m/s. */
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  swimming: boolean;
  /** 0..1 through an attack swing, -1 when not attacking. */
  attackT: number;
  /** Animation strength of the current attack (1 = basic). */
  attackPower: number;
  /** 0..1 through a wind-up (telegraph), -1 otherwise. */
  windupT: number;
  /** 0..1 through a dodge roll, -1 otherwise. */
  dodgeT: number;
  stunned: boolean;
  /** 0..1 after death, -1 while alive. */
  deathT: number;
  /** 0..1 white flash when hit. */
  hitFlash: number;
  /** 0..1 red warning glow. */
  warn: number;
  /** In flight (a winged animal that has left the ground). */
  flying: boolean;
  /** -1..1: how fast it is climbing (1) or sinking (-1) in flight. */
  climb: number;
  /** Head down at the water's edge, drinking. */
  drinking: boolean;
}

export function createAnimState(): AnimState {
  return {
    speed: 0, sprinting: false, grounded: true, swimming: false, attackT: -1, attackPower: 1,
    windupT: -1, dodgeT: -1, stunned: false, deathT: -1, hitFlash: 0, warn: 0, flying: false, climb: 0, drinking: false,
  };
}

/**
 * The only thing gameplay code knows about an animal's visuals.
 * The procedural rig implements it today; a glTF-backed model can implement it later
 * without touching gameplay code.
 */
export interface AnimalModel {
  readonly root: THREE.Group;
  /** Top of the head above the ground, in world units. */
  readonly height: number;
  /** Collision radius in world units. */
  readonly radius: number;
  update(dt: number, state: AnimState): void;
  dispose(): void;
}

export interface AnimalAppearance {
  body: BodyPlan;
  colors: BodyColors;
  features: FeatureId[];
  /** Overall scale (life stage or enemy size). */
  size: number;
  /** Relative head size; juveniles have bigger heads. */
  headScale: number;
  /** Which rig draws the animal (default: the four-legged one). */
  rig?: RigId;
}

export function createAnimalModel(appearance: AnimalAppearance): AnimalModel {
  // TODO(M5): optional glTF models.
  if (appearance.rig === 'winged') return new ProceduralBird(appearance);
  if (appearance.rig === 'serpent') return new ProceduralSnake(appearance);
  return new ProceduralQuadruped(appearance);
}
