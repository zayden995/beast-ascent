import * as THREE from 'three';
import { threatLevel } from '../logic/progression.ts';
import type { Actor } from '../systems/actor.ts';
import type { EnemyActor } from '../systems/ai.ts';
import { el } from './dom.ts';

interface Tag {
  root: HTMLElement;
  lv: HTMLElement;
  bar: HTMLElement;
  threat: string;
  hp: number;
}

const _v = new THREE.Vector3();
const TAG_RANGE = 42;

/** Enemy level tags and floating damage numbers: DOM elements positioned from 3D points. */
export class WorldLabels {
  readonly root = el('div', 'labels');
  private tags = new Map<number, Tag>();
  private width = 1;
  private height = 1;

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  /** Projects a world point to CSS pixels. Returns false if it is behind the camera. */
  private project(camera: THREE.Camera, x: number, y: number, z: number): boolean {
    _v.set(x, y, z).project(camera);
    if (_v.z > 1 || _v.z < -1) return false;
    _v.x = (_v.x * 0.5 + 0.5) * this.width;
    _v.y = (-_v.y * 0.5 + 0.5) * this.height;
    return true;
  }

  /** `revealRange` (the Eagle's Eye) shows level tags farther away than the usual range. */
  update(camera: THREE.Camera, enemies: EnemyActor[], player: Actor, playerLevel: number, revealRange = 0): void {
    const range = Math.max(TAG_RANGE, revealRange);
    // Read the layout size once per frame, not once per label.
    this.width = this.root.clientWidth;
    this.height = this.root.clientHeight;
    const seen = new Set<number>();
    for (const e of enemies) {
      if (!e.alive || !e.model.root.visible) continue;
      // The boss bar at the top of the screen replaces the boss's tag during the fight.
      if (e.isBoss && (e.engaged || e.hp < e.stats.maxHealth)) continue;
      const dist = e.distanceTo(player);
      if (dist > (e.isBoss ? 80 : range)) continue;
      if (!this.project(camera, e.pos.x, e.pos.y + e.model.height + 0.35, e.pos.z)) continue;
      seen.add(e.id);

      let tag = this.tags.get(e.id);
      if (!tag) {
        const root = el('div', `tag${e.isBoss ? ' boss' : ''}`);
        const lv = el('span', 'lv', `Lv ${e.level}`);
        const barWrap = el('div', 'bar');
        const bar = el('i');
        barWrap.append(bar);
        root.append(lv, e.name, barWrap);
        this.root.append(root);
        tag = { root, lv, bar, threat: '', hp: -1 };
        this.tags.set(e.id, tag);
      }
      // Colour shows how dangerous the animal is compared with the player.
      const threat = threatLevel(playerLevel, e.level);
      if (threat !== tag.threat) {
        if (tag.threat) tag.root.classList.remove(tag.threat);
        tag.root.classList.add(threat);
        tag.threat = threat;
      }
      const hp = Math.round((e.hp / e.stats.maxHealth) * 100);
      if (hp !== tag.hp) {
        tag.bar.style.width = `${hp}%`;
        tag.hp = hp;
      }
      tag.root.style.transform = `translate(${_v.x.toFixed(1)}px, ${_v.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, tag] of this.tags) {
      if (!seen.has(id)) {
        tag.root.remove();
        this.tags.delete(id);
      }
    }
  }

  /** Floating number at a world position. */
  number(camera: THREE.Camera, pos: THREE.Vector3, height: number, text: string, kind: string): void {
    if (!this.project(camera, pos.x, pos.y + height, pos.z)) return;
    const node = el('div', `dmg ${kind}`, text);
    const jitter = (Math.random() - 0.5) * 36;
    node.style.transform = `translate(${(_v.x + jitter).toFixed(0)}px, ${_v.y.toFixed(0)}px) translate(-50%, -100%)`;
    node.addEventListener('animationend', () => node.remove());
    this.root.append(node);
    if (this.root.childElementCount > 80) this.root.querySelector('.dmg')?.remove();
  }

  dispose(): void {
    this.root.remove();
    this.tags.clear();
  }
}
