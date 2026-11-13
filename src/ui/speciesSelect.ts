import * as THREE from 'three';
import { createAnimalModel } from '../animals/AnimalModel.ts';
import type { AnimalModel } from '../animals/AnimalModel.ts';
import { createAnimState } from '../animals/AnimalModel.ts';
import { toonMaterial } from '../animals/toon.ts';
import type { SpeciesDef, StageId, StatKey } from '../core/types.ts';
import { getAbility } from '../data/abilities.ts';
import { BIOMES } from '../data/biomes.ts';
import { SPECIES, getVariant, isPlayable } from '../data/species.ts';
import { STAGES, STAGE_ORDER } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { describeMod, favoredAndDisfavored } from '../logic/biome.ts';
import { button, el } from './dom.ts';

/** Turntable scene that shows the selected animal. Rendered by the app while this screen is open. */
export class SpeciesPreview {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private model: AnimalModel | null = null;
  private anim = createAnimState();
  private spin = 0.6;
  private pedestal = new THREE.Group();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
    this.scene.background = new THREE.Color(0xbcd9b4);
    this.scene.fog = new THREE.Fog(0xbcd9b4, 14, 40);
    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x5f7a45, 1.8));
    const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = c.bottom = -5;
    c.right = c.top = 5;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.5, 40), toonMaterial({ color: 0x6fa246 }));
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.75, 4.3, 0.9, 40), toonMaterial({ color: 0x8a6b45 }));
    base.position.y = -0.85;
    this.pedestal.add(ground, base);
    this.scene.add(this.pedestal);
  }

  show(species: SpeciesDef, variantId: string, stage: StageId): void {
    this.model?.dispose();
    const variant = getVariant(species, variantId);
    const def = STAGES[stage];
    this.model = createAnimalModel({
      body: species.body,
      colors: variant.colors,
      features: species.stageFeatures[stage],
      size: def.sizeScale * species.baseStats.size,
      headScale: def.headScale,
    });
    this.scene.add(this.model.root);
    // Frame for the Alpha size so that switching stage visibly changes how big the animal is.
    const alpha = STAGES.alpha.sizeScale;
    const length = species.body.bodyLength * alpha;
    const height = (species.body.legLength + species.body.bodyHeight) * alpha;
    const dist = Math.max(length * 2.3, height * 2.6) + 1.6;
    const k = Math.max(0.35, length * 0.26);
    this.pedestal.scale.set(k, 1, k);
    this.camera.position.set(dist * 0.25, height * 0.9 + 0.9, dist);
    this.camera.lookAt(0, height * 0.45, 0);
  }

  update(dt: number): void {
    if (!this.model) return;
    this.spin += dt * 0.5;
    this.model.root.rotation.y = this.spin;
    this.model.update(dt, this.anim);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
  }
}

const STAT_ROWS: [StatKey, string][] = [
  ['maxHealth', 'Health'],
  ['damage', 'Damage'],
  ['sprintSpeed', 'Speed'],
  ['stamina', 'Stamina'],
  ['defense', 'Defense'],
];

/** Species select: a signpost of species on the left, the animal in the middle, its details on the right. */
export class SpeciesSelect {
  readonly root = el('div', 'screen select');
  private preview: SpeciesPreview;
  private species: SpeciesDef;
  private variantId: string;
  private stage: StageId = 'juvenile';
  private board = el('div', 'board plaque');
  private planks = new Map<string, HTMLButtonElement>();
  private stageButtons = new Map<StageId, HTMLButtonElement>();
  private on: { begin: (speciesId: string, variantId: string) => void; back: () => void };

  constructor(parent: HTMLElement, preview: SpeciesPreview, on: SpeciesSelect['on']) {
    this.preview = preview;
    this.on = on;
    this.species = SPECIES.find((s) => isPlayable(s, TUNING.currentMilestone)) ?? SPECIES[0];
    this.variantId = this.species.variants[0].id;

    const post = el('div', 'signpost');
    post.append(el('h2', '', 'Choose your animal'));
    for (const s of SPECIES) {
      const playable = isPlayable(s, TUNING.currentMilestone);
      const plank = button('plank', s.name, () => this.pick(s), playable ? s.role : 'Coming soon');
      plank.disabled = !playable;
      this.planks.set(s.id, plank);
      post.append(plank);
    }

    const stages = el('div', 'stage-row plaque');
    stages.append(el('span', '', 'Preview'));
    for (const id of STAGE_ORDER) {
      const b = button('chip', STAGES[id].name, () => {
        this.stage = id;
        this.refresh();
      });
      this.stageButtons.set(id, b);
      stages.append(b);
    }

    this.root.append(post, stages, this.board);
    parent.append(this.root);
    this.refresh();
  }

  private pick(species: SpeciesDef): void {
    this.species = species;
    this.variantId = species.variants[0].id;
    this.refresh();
  }

  private refresh(): void {
    const s = this.species;
    const variant = getVariant(s, this.variantId);
    this.preview.show(s, variant.id, this.stage);
    for (const [id, plank] of this.planks) plank.setAttribute('aria-pressed', String(id === s.id));
    for (const [id, b] of this.stageButtons) b.setAttribute('aria-pressed', String(id === this.stage));

    const board = this.board;
    board.textContent = '';
    board.append(el('h3', '', variant.name), el('p', 'role', s.role));

    if (s.variants.length > 1) {
      const row = el('div', 'variants');
      for (const v of s.variants) {
        const b = button('chip', v.name, () => {
          this.variantId = v.id;
          this.refresh();
        });
        b.setAttribute('aria-pressed', String(v.id === variant.id));
        row.append(b);
      }
      board.append(row);
    }

    const playable = SPECIES.filter((x) => isPlayable(x, TUNING.currentMilestone));
    const stats = el('dl');
    for (const [key, label] of STAT_ROWS) {
      const max = Math.max(...playable.map((x) => x.baseStats[key]));
      const bar = el('div', 'statbar');
      const fill = el('i');
      fill.style.width = `${Math.round((s.baseStats[key] / max) * 100)}%`;
      bar.append(fill);
      const dd = el('dd');
      dd.append(bar);
      stats.append(el('dt', '', label), dd);
    }
    board.append(stats);

    const facts = el('dl');
    const diet = s.diet[0].toUpperCase() + s.diet.slice(1);
    const eats = s.diet === 'carnivore' ? 'carcasses and fish' : s.diet === 'herbivore' ? 'fruit and plants' : 'carcasses, fish and berries';
    facts.append(el('dt', '', 'Diet'), el('dd', '', `${diet}: ${eats}`));
    const { favored, disfavored } = favoredAndDisfavored(variant.biomeMods);
    const fav = el('dd', 'good', favored.map((m) => `${BIOMES[m.biome].name} ${describeMod(m)}`).join(', ') || 'None');
    const dis = el('dd', 'bad', disfavored.map((m) => `${BIOMES[m.biome].name} ${describeMod(m)}`).join(', ') || 'None');
    facts.append(el('dt', '', 'Favored'), fav, el('dt', '', 'Disfavored'), dis);
    board.append(facts);

    const abilities = el('ul', 'abilities');
    for (const id of variant.abilities) {
      const def = getAbility(id);
      const li = el('li');
      li.append(el('b', '', def.name), el('em', '', def.signature ? 'Signature' : def.effect.kind === 'passive' ? 'Passive' : 'Unlockable'));
      abilities.append(li);
    }
    board.append(abilities);

    const actions = el('div', 'actions');
    actions.append(
      button('plank primary', `Begin as a ${variant.name}`, () => this.on.begin(s.id, variant.id)),
      button('chip', 'Back to title', this.on.back),
    );
    board.append(actions);
  }

  dispose(): void {
    this.root.remove();
    this.preview.dispose();
  }
}
