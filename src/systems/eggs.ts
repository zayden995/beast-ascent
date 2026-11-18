import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import type { SpawnZoneDef } from '../core/types.ts';
import { PETS } from '../data/pets.ts';
import type { PetKind } from '../data/pets.ts';
import { mulberry32 } from '../core/math.ts';
import { eggAppears } from '../logic/pet.ts';
import type { BiomeWorld } from '../world/world.ts';
import type { EnemyActor } from './ai.ts';

/**
 * An egg on a ring of dry grass: a pale speckled one (liger) or a sandy spotted one (hyena). Used in a den and, while it
 * hatches, beside the player. About 0.6 m tall.
 */
export function makeEgg(kind: PetKind): THREE.Group {
  const def = PETS[kind];
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), toonMaterial({ color: def.eggColor, rim: 0.35 }));
  shell.scale.set(1, 1.32, 1);
  shell.position.y = 0.32;
  shell.castShadow = true;
  group.add(shell);
  const spotMat = toonMaterial({ color: def.eggSpots });
  const rand = mulberry32(kind === 'liger' ? 11 : 23);
  for (let i = 0; i < 9; i++) {
    // Points on the shell (an ellipsoid), away from the very top and bottom.
    const a = rand() * Math.PI * 2;
    const h = (rand() - 0.5) * 1.3;
    const r = Math.sqrt(1 - (h * h) / 1.7);
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.035 + rand() * 0.03, 8, 6), spotMat);
    spot.position.set(Math.cos(a) * 0.235 * r, 0.32 + h * 0.3, Math.sin(a) * 0.235 * r);
    spot.scale.set(1, 1, 0.5);
    spot.lookAt(0, spot.position.y, 0);
    group.add(spot);
  }
  const nest = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 14), toonMaterial({ color: 0xb08a4a }));
  nest.rotation.x = Math.PI / 2;
  nest.position.y = 0.07;
  group.add(nest);
  return group;
}

/** Frees an egg's geometry and materials and takes it out of the scene. */
export function disposeEgg(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  group.removeFromParent();
}

interface DenEgg {
  zone: SpawnZoneDef;
  kind: PetKind;
  x: number;
  z: number;
  mesh: THREE.Group;
  /** Lying in the den now. It stays while the player is in the biome, until it is taken or the slot gets a pet. */
  shown: boolean;
}

/**
 * The eggs of the dens (the pet step, M3): a den that gives an egg (`eggOf` on its zone) shows one once all its guards are dead
 * and the slot has no pet (`eggAppears`). One pet per slot: once the slot has a pet, every egg is gone.
 */
export class EggSystem {
  private dens: DenEgg[] = [];

  constructor(scene: THREE.Scene, world: BiomeWorld, zones: SpawnZoneDef[]) {
    for (const zone of zones) {
      if (!zone.eggOf) continue;
      const mesh = makeEgg(zone.eggOf);
      mesh.position.set(zone.x, world.heightAt(zone.x, zone.z), zone.z);
      mesh.visible = false;
      scene.add(mesh);
      this.dens.push({ zone, kind: zone.eggOf, x: zone.x, z: zone.z, mesh, shown: false });
    }
  }

  update(enemies: EnemyActor[], hasPet: boolean): void {
    for (const d of this.dens) {
      if (hasPet) d.shown = false;
      else if (!d.shown) {
        const guardsAlive = enemies.filter((e) => e.alive && e.zone === d.zone).length;
        d.shown = eggAppears({ eggOf: d.kind, guardsAlive, hasPet });
      }
      d.mesh.visible = d.shown;
    }
  }

  /** The egg lying nearest to (x, z) within `range`, or null. */
  nearest(x: number, z: number, range: number): DenEgg | null {
    let best: DenEgg | null = null;
    let bestD = range;
    for (const d of this.dens) {
      if (!d.shown) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist <= bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Takes an egg out of its den; returns its kind. */
  take(egg: DenEgg): PetKind {
    egg.shown = false;
    egg.mesh.visible = false;
    return egg.kind;
  }

  /** The eggs lying in dens now (for the browser test). */
  visible(): { kind: PetKind; x: number; z: number }[] {
    return this.dens.filter((d) => d.shown).map((d) => ({ kind: d.kind, x: d.x, z: d.z }));
  }

  dispose(): void {
    for (const d of this.dens) disposeEgg(d.mesh);
    this.dens = [];
  }
}
