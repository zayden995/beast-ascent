import { BIOMES } from '../data/biomes.ts';
import { getSpecies, getVariant } from '../data/species.ts';
import { STAGES } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { parseSave } from './saveData.ts';
import type { SaveData } from './saveData.ts';

/** The part of localStorage the slots need, so that the rules can be tested without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SLOT_COUNT = TUNING.save.slots;

/** Slots are numbered 1 to SLOT_COUNT, the way the player sees them. */
export function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT;
}

export function slotKey(slot: number): string {
  if (!isValidSlot(slot)) throw new RangeError(`There is no save slot ${slot}`);
  return `${TUNING.save.slotKeyPrefix}${slot}`;
}

/** The animal in a slot, or null if the slot is empty or its save cannot be read. */
export function readSlot(store: KeyValueStore, slot: number): SaveData | null {
  if (!isValidSlot(slot)) return null;
  return parseSave(store.getItem(slotKey(slot)));
}

/** Every slot in order: index 0 is slot 1. */
export function readAllSlots(store: KeyValueStore): (SaveData | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(store, i + 1));
}

export function writeSlot(store: KeyValueStore, slot: number, data: SaveData): void {
  store.setItem(slotKey(slot), JSON.stringify(data));
}

export function hasAnySave(slots: (SaveData | null)[]): boolean {
  return slots.some((s) => s !== null);
}

/** The first slot (1 to 4) with no animal in it, or null if all are taken. */
export function firstEmptySlot(slots: (SaveData | null)[]): number | null {
  const i = slots.findIndex((s) => s === null);
  return i < 0 ? null : i + 1;
}

/**
 * Earlier versions kept one save under a single key. Moves it into the first empty slot, and forgets
 * the old key only after the copy has been read back, so that a failure never costs the player an animal.
 * Returns true if an animal was moved.
 */
export function migrateLegacySave(store: KeyValueStore): boolean {
  try {
    const save = parseSave(store.getItem(TUNING.save.legacyKey));
    if (!save) return false;
    const slot = firstEmptySlot(readAllSlots(store));
    if (slot === null) return false;
    writeSlot(store, slot, save);
    if (!readSlot(store, slot)) return false;
    store.removeItem(TUNING.save.legacyKey);
    return true;
  } catch {
    return false;
  }
}

/** The two lines a slot card shows: which animal it is, and how far it has got. */
export function slotSummary(save: SaveData): { title: string; detail: string } {
  const variant = getVariant(getSpecies(save.speciesId), save.variantId);
  const ruled = save.ruledBiomes.map((id) => BIOMES[id].name);
  return {
    title: `${STAGES[save.progress.stage].name} ${variant.name}, level ${save.progress.level}`,
    detail: ruled.length > 0 ? `${ruled.join(', ')} ruled` : 'No biome ruled yet',
  };
}
