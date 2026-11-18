import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSpecies } from '../../src/data/species.ts';
import { TUNING } from '../../src/data/tuning.ts';
import { newProgress } from '../../src/logic/progression.ts';
import { sanitizeSave } from '../../src/logic/saveData.ts';
import type { SaveData } from '../../src/logic/saveData.ts';
import {
  SLOT_COUNT,
  firstEmptySlot,
  hasAnySave,
  isValidSlot,
  migrateLegacySave,
  readAllSlots,
  readSlot,
  slotKey,
  slotSummary,
  writeSlot,
} from '../../src/logic/saveSlots.ts';
import type { KeyValueStore } from '../../src/logic/saveSlots.ts';

/** A stand-in for localStorage that lives in memory. */
class MemoryStore implements KeyValueStore {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function saveOf(speciesId: string, level: number, ruled: SaveData['ruledBiomes'] = []): SaveData {
  const species = getSpecies(speciesId);
  const variant = species.variants[0];
  const progress = newProgress(variant.abilities);
  progress.level = level;
  return {
    version: TUNING.save.version,
    speciesId,
    variantId: variant.id,
    progress,
    unlockedBiomes: ['forest'],
    ruledBiomes: ruled,
  };
}

test('save slots: there are four, each with its own key', () => {
  assert.equal(SLOT_COUNT, 4);
  const keys = [1, 2, 3, 4].map(slotKey);
  assert.equal(new Set(keys).size, 4, 'every slot has a different key');
  for (const k of keys) assert.ok(k.startsWith(TUNING.save.slotKeyPrefix));
  assert.ok(!keys.includes(TUNING.save.legacyKey), 'a slot never uses the key of the old single save');
});

test('save slots: only whole numbers from 1 to 4 are slots', () => {
  for (const n of [1, 2, 3, 4]) assert.equal(isValidSlot(n), true);
  for (const n of [0, 5, -1, 1.5, NaN]) assert.equal(isValidSlot(n), false);
  assert.throws(() => slotKey(0));
  assert.throws(() => slotKey(5));
});

test('save slots: a new store has four empty slots', () => {
  const store = new MemoryStore();
  assert.deepEqual(readAllSlots(store), [null, null, null, null]);
  assert.equal(hasAnySave(readAllSlots(store)), false);
  assert.equal(firstEmptySlot(readAllSlots(store)), 1);
});

test('save slots: each slot keeps its own animal', () => {
  const store = new MemoryStore();
  writeSlot(store, 1, saveOf('wolf', 5));
  writeSlot(store, 3, saveOf('tiger', 9));
  const all = readAllSlots(store);
  assert.equal(all[0]?.speciesId, 'wolf');
  assert.equal(all[0]?.progress.level, 5);
  assert.equal(all[1], null);
  assert.equal(all[2]?.speciesId, 'tiger');
  assert.equal(all[2]?.progress.level, 9);
  assert.equal(all[3], null);
  assert.equal(hasAnySave(all), true);
  assert.equal(firstEmptySlot(all), 2);
});

test('save slots: writing one slot leaves the others alone', () => {
  const store = new MemoryStore();
  writeSlot(store, 1, saveOf('wolf', 5));
  writeSlot(store, 2, saveOf('lion', 7));
  writeSlot(store, 1, saveOf('bear', 3));
  assert.equal(readSlot(store, 1)?.speciesId, 'bear');
  assert.equal(readSlot(store, 2)?.speciesId, 'lion');
  assert.equal(readSlot(store, 2)?.progress.level, 7);
});

test('save slots: a slot with a damaged save reads as empty and does not hide the others', () => {
  const store = new MemoryStore();
  writeSlot(store, 2, saveOf('lion', 7));
  store.setItem(slotKey(1), '{"version":1,"speciesId":"dragon"');
  store.setItem(slotKey(3), JSON.stringify({ version: 1, speciesId: 'dragon' }));
  const all = readAllSlots(store);
  assert.equal(all[0], null);
  assert.equal(all[1]?.speciesId, 'lion');
  assert.equal(all[2], null);
});

test('save slots: a slot that is not a slot number reads as empty and cannot be written', () => {
  const store = new MemoryStore();
  assert.equal(readSlot(store, 9), null);
  assert.throws(() => writeSlot(store, 9, saveOf('wolf', 2)));
  assert.equal(store.items.size, 0);
});

test('save slots: what is written reads back as a valid save', () => {
  const store = new MemoryStore();
  const original = saveOf('elephant', 12, ['forest']);
  writeSlot(store, 4, original);
  assert.deepEqual(readSlot(store, 4), sanitizeSave(original));
});

test('old single save: moves into slot 1 and the old key is removed', () => {
  const store = new MemoryStore();
  store.setItem(TUNING.save.legacyKey, JSON.stringify(saveOf('lion', 11, ['forest'])));
  assert.equal(migrateLegacySave(store), true);
  assert.equal(readSlot(store, 1)?.speciesId, 'lion');
  assert.equal(readSlot(store, 1)?.progress.level, 11);
  assert.deepEqual(readSlot(store, 1)?.ruledBiomes, ['forest']);
  assert.equal(store.getItem(TUNING.save.legacyKey), null, 'the old key is gone, so the animal exists once');
});

test('old single save: nothing to move when there is none', () => {
  const store = new MemoryStore();
  assert.equal(migrateLegacySave(store), false);
  assert.equal(store.items.size, 0);
});

test('old single save: moving it twice does not make a copy', () => {
  const store = new MemoryStore();
  store.setItem(TUNING.save.legacyKey, JSON.stringify(saveOf('lion', 11)));
  migrateLegacySave(store);
  assert.equal(migrateLegacySave(store), false);
  assert.deepEqual(readAllSlots(store).map((s) => s?.speciesId ?? null), ['lion', null, null, null]);
});

test('old single save: goes to the first empty slot and never replaces an animal', () => {
  const store = new MemoryStore();
  writeSlot(store, 1, saveOf('wolf', 5));
  store.setItem(TUNING.save.legacyKey, JSON.stringify(saveOf('lion', 11)));
  assert.equal(migrateLegacySave(store), true);
  assert.equal(readSlot(store, 1)?.speciesId, 'wolf');
  assert.equal(readSlot(store, 2)?.speciesId, 'lion');
});

test('old single save: with every slot full it is left where it is, not thrown away', () => {
  const store = new MemoryStore();
  for (const n of [1, 2, 3, 4]) writeSlot(store, n, saveOf('wolf', n));
  const legacy = JSON.stringify(saveOf('lion', 11));
  store.setItem(TUNING.save.legacyKey, legacy);
  assert.equal(migrateLegacySave(store), false);
  assert.equal(store.getItem(TUNING.save.legacyKey), legacy);
});

test('old single save: one that cannot be read is left alone', () => {
  const store = new MemoryStore();
  store.setItem(TUNING.save.legacyKey, '{"version":1,"speciesId":"dragon"');
  assert.equal(migrateLegacySave(store), false);
  assert.equal(store.getItem(TUNING.save.legacyKey), '{"version":1,"speciesId":"dragon"');
  assert.deepEqual(readAllSlots(store), [null, null, null, null]);
});

test('old single save: if the new slot cannot be written, the old save stays', () => {
  const store = new MemoryStore();
  const legacy = JSON.stringify(saveOf('lion', 11));
  store.setItem(TUNING.save.legacyKey, legacy);
  store.setItem = () => {
    throw new Error('storage full');
  };
  assert.equal(migrateLegacySave(store), false);
  assert.equal(store.getItem(TUNING.save.legacyKey), legacy, 'nothing is lost when the copy fails');
});

test('slot summary: names the animal, its stage and level, and the biomes it rules', () => {
  const grown = saveOf('wolf', 12, ['forest']);
  grown.progress.stage = 'adult';
  const summary = slotSummary(sanitizeSave(grown)!);
  assert.equal(summary.title, 'Adult Grey Wolf, level 12');
  assert.equal(summary.detail, 'Forest ruled');
});

test('slot summary: says when nothing is ruled yet, and which skin a variant has', () => {
  const fresh = slotSummary(sanitizeSave(saveOf('wolf', 1))!);
  assert.equal(fresh.title, 'Juvenile Grey Wolf, level 1');
  assert.equal(fresh.detail, 'No biome ruled yet');
  const bear = saveOf('bear', 3);
  bear.variantId = 'polar';
  assert.match(slotSummary(sanitizeSave(bear)!).title, /Juvenile Polar Bear, level 3/);
});

// ---------- The pet (M3, 2026-11-19): one pet per slot, saved with the animal ----------

test('pet save: a save from before the pet has no pet', () => {
  assert.equal(sanitizeSave(saveOf('lion', 20))!.pet, null);
});

test('pet save: a liger cub or a hyena pup is kept, injured or not', () => {
  const a = { ...saveOf('lion', 20), pet: { kind: 'liger', injured: false } };
  assert.deepEqual(sanitizeSave(a)!.pet, { kind: 'liger', injured: false });
  const b = { ...saveOf('wolf', 20), pet: { kind: 'hyena', injured: true } };
  assert.deepEqual(sanitizeSave(b)!.pet, { kind: 'hyena', injured: true });
});

test('pet save: a pet that cannot be trusted is dropped, never the whole save', () => {
  for (const pet of [{ kind: 'dragon', injured: false }, 'liger', 7, [], { injured: true }]) {
    const save = sanitizeSave({ ...saveOf('lion', 20), pet });
    assert.ok(save, `the save loads with pet ${JSON.stringify(pet)}`);
    assert.equal(save!.pet, null);
  }
  assert.deepEqual(sanitizeSave({ ...saveOf('lion', 20), pet: { kind: 'liger', injured: 'yes' } })!.pet, { kind: 'liger', injured: false });
});

test('pet save: the pet survives a write and a read', () => {
  const store = new MemoryStore();
  writeSlot(store, 2, sanitizeSave({ ...saveOf('tiger', 22), pet: { kind: 'hyena', injured: false } })!);
  assert.deepEqual(readSlot(store, 2)!.pet, { kind: 'hyena', injured: false });
});

test('slot summary: the card names the pet, and says when it is injured', () => {
  const save = sanitizeSave({ ...saveOf('lion', 22, ['forest', 'jungle']), pet: { kind: 'liger', injured: false } })!;
  assert.equal(slotSummary(save).detail, 'Forest, Jungle ruled, with a liger cub');
  const hurt = sanitizeSave({ ...saveOf('wolf', 22), pet: { kind: 'hyena', injured: true } })!;
  assert.equal(slotSummary(hurt).detail, 'No biome ruled yet, with an injured hyena pup');
  assert.equal(slotSummary(sanitizeSave(saveOf('wolf', 3))!).detail, 'No biome ruled yet', 'no pet, no mention');
});
