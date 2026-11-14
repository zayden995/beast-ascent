import type { EventBus } from '../core/events.ts';
import type { BiomeId, FoodKind, SpeciesDef, SpeciesVariant } from '../core/types.ts';
import { getAbility } from '../data/abilities.ts';
import { FOODS } from '../data/food.ts';
import { getSpecies, getVariant } from '../data/species.ts';
import { STAGES } from '../data/stages.ts';
import {
  addGrowth, addXp, applyDeath, evolve, evolveStatus, newProgress, summarizePassives, upgradeAbility,
} from '../logic/progression.ts';
import type { DeathOutcome, PassiveSummary, Progress } from '../logic/progression.ts';
import type { SaveData } from '../logic/saveData.ts';
import type { GameEvents } from './gameEvents.ts';

/** The saved state of a run: who the player is and how far they have grown. */
export interface Profile {
  speciesId: string;
  variantId: string;
  progress: Progress;
  unlockedBiomes: BiomeId[];
  ruledBiomes: BiomeId[];
}

export function newProfile(speciesId: string, variantId: string): Profile {
  const variant = getVariant(getSpecies(speciesId), variantId);
  return {
    speciesId,
    variantId: variant.id,
    progress: newProgress(variant.abilities),
    unlockedBiomes: ['forest'],
    ruledBiomes: [],
  };
}

export function profileFromSave(save: SaveData): Profile {
  return {
    speciesId: save.speciesId,
    variantId: save.variantId,
    progress: save.progress,
    unlockedBiomes: save.unlockedBiomes,
    ruledBiomes: save.ruledBiomes,
  };
}

/** Both growth tracks: XP -> levels -> ability points, and food -> growth meter -> life stage. */
export class Growth {
  readonly profile: Profile;
  readonly species: SpeciesDef;
  readonly variant: SpeciesVariant;
  private events: EventBus<GameEvents>;
  private passives: PassiveSummary;
  private wasEvolveReady = false;

  constructor(profile: Profile, events: EventBus<GameEvents>) {
    this.profile = profile;
    this.events = events;
    this.species = getSpecies(profile.speciesId);
    this.variant = getVariant(this.species, profile.variantId);
    this.passives = summarizePassives(profile.progress, this.variant.abilities);
    this.wasEvolveReady = evolveStatus(profile.progress).canEvolve;
  }

  get progress(): Progress {
    return this.profile.progress;
  }

  getPassives(): PassiveSummary {
    return this.passives;
  }

  private changed(): void {
    const ready = evolveStatus(this.progress).canEvolve;
    if (ready && !this.wasEvolveReady) {
      this.events.emit('toast', { text: 'Ready to evolve! Open the Growth menu (Tab).', tone: 'good' });
    }
    this.wasEvolveReady = ready;
    this.events.emit('progress', null);
  }

  gainXp(amount: number): void {
    const levels = addXp(this.progress, amount);
    this.events.emit('xp', { amount });
    if (levels > 0) {
      this.events.emit('levelUp', { level: this.progress.level });
      this.events.emit('toast', {
        text: `Level ${this.progress.level}! +${levels} ability point${levels > 1 ? 's' : ''} (Tab)`,
        tone: 'good',
      });
    }
    this.changed();
  }

  /** Eats food and returns the fraction of max health to restore. */
  eat(kind: FoodKind, growth: number): number {
    const bonus = 1 + (this.passives.foodBonus[kind] ?? 0);
    const gained = addGrowth(this.progress, growth * bonus);
    this.events.emit('ate', { kind, growth: gained });
    this.changed();
    return FOODS[kind].healPct;
  }

  tryEvolve(): boolean {
    if (!evolve(this.progress)) return false;
    this.events.emit('evolved', { stage: this.progress.stage });
    this.events.emit('banner', {
      title: `${STAGES[this.progress.stage].name} ${this.species.name}`,
      subtitle: 'You have grown. Bigger, stronger, more feared.',
    });
    this.changed();
    return true;
  }

  upgrade(abilityId: string): boolean {
    if (!this.variant.abilities.includes(abilityId)) return false;
    if (!upgradeAbility(this.progress, getAbility(abilityId))) return false;
    this.passives = summarizePassives(this.progress, this.variant.abilities);
    this.changed();
    return true;
  }

  /**
   * Death: levels are lost, and a second death before the next level costs a life stage (see
   * `applyDeath`). The species stays the same, and ruled and unlocked biomes are kept.
   */
  penalizeDeath(): DeathOutcome {
    const outcome = applyDeath(this.progress, this.variant.abilities);
    this.passives = summarizePassives(this.progress, this.variant.abilities);
    this.changed();
    return outcome;
  }

  ruleBiome(biome: BiomeId, next: BiomeId | null): void {
    if (!this.profile.ruledBiomes.includes(biome)) this.profile.ruledBiomes.push(biome);
    if (next && !this.profile.unlockedBiomes.includes(next)) this.profile.unlockedBiomes.push(next);
    this.changed();
  }

  /**
   * Admin sandbox only: edits the progress with `edit`, then brings the passives, the stats and (if the
   * life stage changed) the model up to date, the way a level, an upgrade or an evolution would.
   */
  adminEdit(edit: (p: Progress, abilityIds: string[]) => void, stageChanged = false): void {
    edit(this.progress, this.variant.abilities);
    this.passives = summarizePassives(this.progress, this.variant.abilities);
    if (stageChanged) this.events.emit('evolved', { stage: this.progress.stage });
    this.changed();
  }

  /** Admin sandbox only: rules a biome, or takes the rule away again (and the unlock it gave). */
  adminSetRuled(biome: BiomeId, next: BiomeId | null, ruled: boolean): void {
    if (ruled) {
      this.ruleBiome(biome, next);
      return;
    }
    this.profile.ruledBiomes = this.profile.ruledBiomes.filter((b) => b !== biome);
    if (next) this.profile.unlockedBiomes = this.profile.unlockedBiomes.filter((b) => b !== next);
    this.changed();
  }
}
