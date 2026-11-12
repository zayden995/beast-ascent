import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITIES } from '../../src/data/abilities.ts';
import { BIOMES, BIOME_ORDER, FOREST_LAYOUT, FOREST_SPAWNS } from '../../src/data/biomes.ts';
import { BOSSES } from '../../src/data/bosses.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { canEat } from '../../src/data/food.ts';
import { SPECIES, isPlayable } from '../../src/data/species.ts';
import { STAGES } from '../../src/data/stages.ts';
import { parseSave, sanitizeSave } from '../../src/logic/saveData.ts';
import { newProgress } from '../../src/logic/progression.ts';

test('data: all seven species are defined; wolf, lion and bear are playable in M1', () => {
  assert.deepEqual(
    SPECIES.map((s) => s.id).sort(),
    ['bear', 'crocodile', 'eagle', 'elephant', 'lion', 'tiger', 'wolf'],
  );
  assert.deepEqual(SPECIES.filter((s) => isPlayable(s, 1)).map((s) => s.id).sort(), ['bear', 'lion', 'wolf']);
  const bear = SPECIES.find((s) => s.id === 'bear');
  assert.deepEqual(bear?.variants.map((v) => v.id), ['brown', 'polar']);
});

test('data: every ability a species lists exists, with exactly one signature', () => {
  for (const species of SPECIES) {
    for (const variant of species.variants) {
      const defs = variant.abilities.map((id) => {
        assert.ok(ABILITIES[id], `${species.id}/${variant.id} lists unknown ability ${id}`);
        return ABILITIES[id];
      });
      assert.equal(defs.filter((d) => d.signature).length, 1, `${species.id}/${variant.id} signature count`);
      assert.ok(defs[0].signature, `${species.id}/${variant.id}: signature must be first (key 1)`);
      const actives = defs.filter((d) => d.effect.kind !== 'passive');
      assert.ok(actives.length <= 3, `${species.id}/${variant.id} has more actives than keys`);
    }
  }
});

test('data: playable species have at least 3 unlockable abilities with no TODO effects', () => {
  for (const species of SPECIES.filter((s) => isPlayable(s, 1))) {
    for (const variant of species.variants) {
      const unlockable = variant.abilities.map((id) => ABILITIES[id]).filter((d) => !d.signature);
      assert.ok(unlockable.length >= 3, `${species.id}/${variant.id} has ${unlockable.length} unlockables`);
      for (const id of variant.abilities) assert.equal(ABILITIES[id].todo, undefined, `${id} is a stub`);
    }
  }
});

test('data: stage table matches the bible', () => {
  assert.deepEqual(
    [STAGES.juvenile, STAGES.adult, STAGES.alpha].map((s) => [s.levelRequired, s.sizeScale, s.powerMult]),
    [[1, 0.6, 1.0], [8, 1.0, 1.8], [18, 1.4, 3.0]],
  );
});

test('data: biome order, forest boss and spawn zones are consistent', () => {
  assert.deepEqual(BIOME_ORDER, ['forest', 'jungle', 'plains', 'winter']);
  assert.ok(BIOMES.forest.implemented);
  assert.ok(BIOMES.forest.bossId && BOSSES[BIOMES.forest.bossId]);
  const kinds = new Set(FOREST_SPAWNS.map((z) => z.enemyId));
  assert.ok(kinds.size >= 3, 'at least 3 wild enemy types');
  for (const zone of FOREST_SPAWNS) {
    assert.ok(ENEMIES[zone.enemyId], `unknown enemy ${zone.enemyId}`);
    assert.ok(Math.hypot(zone.x, zone.z) + zone.radius < FOREST_LAYOUT.worldRadius, 'zone inside the world');
    assert.ok(zone.levelMin <= zone.levelMax);
  }
});

test('data: diets', () => {
  assert.ok(canEat('carnivore', 'carcass') && canEat('carnivore', 'fish'));
  assert.ok(!canEat('carnivore', 'fruit'));
  assert.ok(canEat('herbivore', 'fruit') && !canEat('herbivore', 'carcass'));
  assert.ok(canEat('omnivore', 'carcass') && canEat('omnivore', 'fruit') && canEat('omnivore', 'fish'));
});

const goodSave = () => ({
  version: 1,
  speciesId: 'bear',
  variantId: 'polar',
  progress: { ...newProgress(['bear_heavy_swipe']), level: 4, xp: 12, growth: 55 },
  unlockedBiomes: ['forest'],
  ruledBiomes: [],
});

test('save: a valid save round-trips through JSON', () => {
  const loaded = parseSave(JSON.stringify(goodSave()));
  assert.ok(loaded);
  assert.equal(loaded.speciesId, 'bear');
  assert.equal(loaded.variantId, 'polar');
  assert.equal(loaded.progress.level, 4);
  assert.equal(loaded.progress.growth, 55);
  assert.equal(loaded.progress.abilityRanks.bear_heavy_swipe, 1);
});

test('save: corrupt, empty, old-version or locked-species saves are rejected', () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave(''), null);
  assert.equal(parseSave('{not json'), null);
  assert.equal(parseSave('[]'), null);
  assert.equal(parseSave('"hello"'), null);
  assert.equal(sanitizeSave({ ...goodSave(), version: 0 }), null);
  assert.equal(sanitizeSave({ ...goodSave(), speciesId: 'dragon' }), null);
  assert.equal(sanitizeSave({ ...goodSave(), speciesId: 'tiger', variantId: 'default' }), null);
  assert.equal(sanitizeSave({ ...goodSave(), progress: null }), null);
  assert.equal(sanitizeSave({ ...goodSave(), progress: { ...goodSave().progress, stage: 'elder' } }), null);
});

test('save: out-of-range values are clamped instead of trusted', () => {
  const s = sanitizeSave({
    ...goodSave(),
    variantId: 'purple',
    progress: {
      level: -3, xp: 1e9, abilityPoints: -2, stage: 'alpha', growth: 1e9,
      abilityRanks: { bear_heavy_swipe: 0, bear_maul: 99, hacked_ability: 3 },
    },
    unlockedBiomes: ['winter', 'moon'],
    ruledBiomes: 'all',
  });
  assert.ok(s);
  assert.equal(s.variantId, 'brown', 'unknown variant falls back to the first');
  assert.equal(s.progress.level, 1);
  assert.ok(s.progress.xp < 20);
  assert.equal(s.progress.abilityPoints, 0);
  assert.equal(s.progress.stage, 'adult', 'Alpha is not playable in M1');
  assert.equal(s.progress.growth, 250);
  assert.deepEqual(s.progress.abilityRanks, { bear_heavy_swipe: 1, bear_maul: 3 });
  assert.deepEqual(s.unlockedBiomes, ['forest', 'winter']);
  assert.deepEqual(s.ruledBiomes, []);
});
