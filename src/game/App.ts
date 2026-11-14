import * as THREE from 'three';
import { FOREST_TITLE } from '../data/biomes.ts';
import { TUNING } from '../data/tuning.ts';
import { AmbientLife } from '../systems/ambient.ts';
import { hasAnySave } from '../logic/saveSlots.ts';
import { loadSlots, migrateOldSave } from '../systems/save.ts';
import { ThirdPersonCamera } from '../systems/camera.ts';
import { newProfile, profileFromSave } from '../systems/growth.ts';
import type { Profile } from '../systems/growth.ts';
import { Input } from '../systems/input.ts';
import { el } from '../ui/dom.ts';
import { GrowthMenu } from '../ui/growthMenu.ts';
import { createPauseMenu, createSlotScreen, createTitleScreen } from '../ui/menus.ts';
import type { SlotMode } from '../ui/menus.ts';
import { SpeciesPreview, SpeciesSelect } from '../ui/speciesSelect.ts';
import { ForestWorld } from '../world/forest.ts';
import { Sky } from '../world/sky.ts';
import { Game } from './Game.ts';

export type Screen = 'title' | 'select' | 'playing' | 'paused' | 'growth';

const MAX_DT = 0.05;

/** Owns the renderer and the world, and moves between title, species select and the game. */
export class App {
  screen: Screen = 'title';
  game: Game | null = null;
  /** Tests turn this off and step the simulation themselves. */
  autoStep = true;
  /** Tests turn rendering off while they fast-forward (software GPUs are slow). */
  renderEnabled = true;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world: ForestWorld;
  readonly sky: Sky;
  readonly cam: ThirdPersonCamera;
  readonly input: Input;
  private ui: HTMLElement;
  private canvas: HTMLCanvasElement;
  private preview: SpeciesPreview;
  private overlay: HTMLElement | null = null;
  private select: SpeciesSelect | null = null;
  private growthMenu: GrowthMenu | null = null;
  private last = 0;
  private pausedAt = 0;
  private elapsed = 0;
  private titleFocus = new THREE.Vector3();
  /** Animals roaming behind the title screen. Gone while a game is running. */
  titleLife: AmbientLife | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.canvas = canvas;
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const aspect = window.innerWidth / window.innerHeight;
    this.world = new ForestWorld(this.scene);
    this.sky = new Sky(this.scene, this.world.biome);
    this.cam = new ThirdPersonCamera(aspect);
    this.preview = new SpeciesPreview(aspect);
    this.input = new Input(canvas);

    const at = FOREST_TITLE.view.lookAt;
    this.titleFocus.set(at.x, this.world.heightAt(at.x, at.z), at.z);

    this.input.onKey = (code) => this.onKey(code);
    this.input.onLockLost = () => {
      if (this.screen === 'playing') this.pause();
    };
    canvas.addEventListener('mousedown', () => {
      if (this.screen === 'playing') this.input.requestLock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.pause();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    migrateOldSave();
    this.showTitle();
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(MAX_DT, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(dt: number): void {
    this.elapsed += dt;
    if (this.screen === 'select') {
      this.preview.update(dt);
      if (this.renderEnabled) this.renderer.render(this.preview.scene, this.preview.camera);
      return;
    }
    if (this.screen === 'title') {
      this.cam.pan(this.elapsed, FOREST_TITLE.view, this.world.heightAt);
      this.titleLife?.update(dt);
      this.world.update(this.elapsed, this.cam.camera.position);
      this.sky.advance(dt);
      this.world.setUnlitTint(this.sky.unlitTint);
      this.sky.update(this.cam.camera.position, this.titleFocus);
    } else if (this.game) {
      if (this.screen === 'playing' && this.autoStep) this.game.update(dt);
      this.game.present();
    }
    if (this.renderEnabled) this.renderer.render(this.scene, this.cam.camera);
  }

  /** Advance the simulation by one fixed step (used by tests). */
  step(dt: number): void {
    if (this.screen === 'playing' && this.game) this.game.update(dt);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
    this.preview.resize(w / h);
  }

  private onKey(code: string): void {
    if (code === 'Tab') {
      if (this.screen === 'playing') this.openGrowth();
      else if (this.screen === 'growth') this.closeGrowth();
    } else if (code === 'Escape') {
      if (this.screen === 'playing') this.pause();
      // The same Esc press that released the pointer must not immediately un-pause.
      else if (this.screen === 'paused' && performance.now() - this.pausedAt > 350) this.resume();
      else if (this.screen === 'growth') this.closeGrowth();
    }
  }

  private clearOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.select?.dispose();
    this.select = null;
    this.growthMenu?.dispose();
    this.growthMenu = null;
  }

  showTitle(): void {
    this.clearOverlay();
    this.screen = 'title';
    this.titleLife ??= new AmbientLife(this.scene, this.world, FOREST_TITLE.animals, FOREST_TITLE.shyDistance);
    this.overlay = createTitleScreen(this.ui, hasAnySave(loadSlots()), {
      newGame: () => this.showSlots('new'),
      continueGame: () => this.showSlots('continue'),
    });
  }

  /** The four save slots, over the same roaming animals as the title (the screen is still 'title'). */
  showSlots(mode: SlotMode): void {
    this.clearOverlay();
    this.screen = 'title';
    this.overlay = createSlotScreen(this.ui, mode, loadSlots(), {
      pick: (slot) => {
        if (mode === 'new') {
          this.showSelect(slot);
          return;
        }
        // Read again: the slot may have changed since the list was drawn.
        const save = loadSlots()[slot - 1];
        if (save) this.startGame(profileFromSave(save), slot);
        else this.showSlots('continue');
      },
      back: () => this.showTitle(),
    });
  }

  /** Species select for a new animal in `slot`. Nothing in the slot changes until the player begins. */
  showSelect(slot: number): void {
    this.clearOverlay();
    this.screen = 'select';
    this.select = new SpeciesSelect(this.ui, this.preview, {
      begin: (speciesId, variantId) => this.startGame(newProfile(speciesId, variantId), slot),
      back: () => this.showSlots('new'),
    });
  }

  /** Starts the game and saves at once, so the new animal replaces whatever the slot held. */
  startGame(profile: Profile, slot: number): void {
    this.clearOverlay();
    this.game?.dispose();
    this.titleLife?.dispose();
    this.titleLife = null;
    // Every session starts in the morning; the time of day is not saved.
    this.sky.setTime(TUNING.dayNight.startAt);
    this.world.setUnlitTint(this.sky.unlitTint);
    this.game = new Game({ scene: this.scene, world: this.world, sky: this.sky, cam: this.cam, input: this.input, ui: this.ui }, profile, slot);
    this.game.save();
    this.screen = 'playing';
    this.input.clear();
    this.input.requestLock();
    this.canvas.focus();
  }

  pause(): void {
    if (this.screen !== 'playing' || !this.game) return;
    this.screen = 'paused';
    this.pausedAt = performance.now();
    this.game.save();
    this.input.releaseLock();
    this.input.clear();
    this.overlay = createPauseMenu(this.ui, { resume: () => this.resume(), quit: () => this.quitToTitle() });
  }

  resume(): void {
    if (this.screen !== 'paused') return;
    this.clearOverlay();
    this.screen = 'playing';
    this.input.clear();
    this.input.requestLock();
  }

  openGrowth(): void {
    if (this.screen !== 'playing' || !this.game) return;
    this.screen = 'growth';
    this.input.releaseLock();
    this.input.clear();
    this.growthMenu = new GrowthMenu(this.ui, this.game.growth, () => this.closeGrowth());
  }

  closeGrowth(): void {
    if (this.screen !== 'growth') return;
    this.clearOverlay();
    this.screen = 'playing';
    this.input.clear();
    this.input.requestLock();
  }

  quitToTitle(): void {
    this.game?.dispose();
    this.game = null;
    this.showTitle();
  }
}

/** Shown instead of the game when WebGL cannot start. */
export function showFatal(ui: HTMLElement, message: string): void {
  const box = el('div', 'screen overlay');
  const card = el('div', 'pause-card plaque');
  card.append(el('h2', '', 'Cannot start'), el('p', '', message));
  box.append(card);
  ui.append(box);
}
