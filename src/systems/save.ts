import { TUNING } from '../data/tuning.ts';
import { parseSave } from '../logic/saveData.ts';
import type { SaveData } from '../logic/saveData.ts';
import type { Profile } from './growth.ts';

// Every storage call is wrapped: localStorage can be missing, full or blocked (private mode, iframes).

export function loadSave(): SaveData | null {
  try {
    return parseSave(window.localStorage.getItem(TUNING.save.key));
  } catch {
    return null;
  }
}

/** Returns false if the save could not be written. */
export function writeSave(profile: Profile): boolean {
  const data: SaveData = {
    version: TUNING.save.version,
    speciesId: profile.speciesId,
    variantId: profile.variantId,
    progress: profile.progress,
    unlockedBiomes: profile.unlockedBiomes,
    ruledBiomes: profile.ruledBiomes,
  };
  try {
    window.localStorage.setItem(TUNING.save.key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(TUNING.save.key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
