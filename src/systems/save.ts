import { SLOT_COUNT, migrateLegacySave, readAllSlots, writeSlot } from '../logic/saveSlots.ts';
import { TUNING } from '../data/tuning.ts';
import type { SaveData } from '../logic/saveData.ts';
import type { Profile } from './growth.ts';

// Every storage call is wrapped: localStorage can be missing, full or blocked (private mode, iframes).

/** All four slots in order (index 0 is slot 1). An unreadable storage looks like four empty slots. */
export function loadSlots(): (SaveData | null)[] {
  try {
    return readAllSlots(window.localStorage);
  } catch {
    return Array.from({ length: SLOT_COUNT }, () => null);
  }
}

/** Moves the single save of earlier versions into a slot. Safe to call on every start. */
export function migrateOldSave(): void {
  try {
    migrateLegacySave(window.localStorage);
  } catch {
    // No storage, nothing to move.
  }
}

/** Saves the animal into its slot. Returns false if the save could not be written. */
export function writeSave(slot: number, profile: Profile): boolean {
  const data: SaveData = {
    version: TUNING.save.version,
    speciesId: profile.speciesId,
    variantId: profile.variantId,
    progress: profile.progress,
    unlockedBiomes: profile.unlockedBiomes,
    ruledBiomes: profile.ruledBiomes,
  };
  try {
    writeSlot(window.localStorage, slot, data);
    return true;
  } catch {
    return false;
  }
}
