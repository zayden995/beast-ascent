import type { BiomeId, StageId } from '../core/types.ts';
import { ABILITIES } from '../data/abilities.ts';
import { BIOME_ORDER } from '../data/biomes.ts';
import { SPECIES, isPlayable } from '../data/species.ts';
import { STAGE_ORDER } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { growthNeeded, xpToNext } from './progression.ts';
import type { Progress } from './progression.ts';

export interface SaveData {
  version: number;
  speciesId: string;
  variantId: string;
  progress: Progress;
  unlockedBiomes: BiomeId[];
  ruledBiomes: BiomeId[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function biomeList(v: unknown): BiomeId[] {
  if (!Array.isArray(v)) return [];
  return BIOME_ORDER.filter((b) => v.includes(b));
}

/**
 * Turns whatever came out of storage into a valid save, or null if it cannot be trusted.
 * Out-of-range numbers are clamped so a hand-edited or older save cannot break the game.
 */
export function sanitizeSave(raw: unknown): SaveData | null {
  if (!isRecord(raw) || raw.version !== TUNING.save.version) return null;
  const species = SPECIES.find((s) => s.id === raw.speciesId);
  if (!species || !isPlayable(species, TUNING.currentMilestone)) return null;
  const variant = species.variants.find((v) => v.id === raw.variantId) ?? species.variants[0];
  if (!isRecord(raw.progress)) return null;
  const rp = raw.progress;

  const maxStageIndex = STAGE_ORDER.indexOf(TUNING.maxPlayableStage);
  let stageIndex = STAGE_ORDER.indexOf(rp.stage as StageId);
  if (stageIndex < 0) return null;
  stageIndex = Math.min(stageIndex, maxStageIndex);
  const stage = STAGE_ORDER[stageIndex];

  const level = Math.max(1, Math.floor(finite(rp.level, 1)));
  const xp = Math.min(Math.max(0, finite(rp.xp, 0)), xpToNext(level) - 1);
  const growth = Math.min(Math.max(0, finite(rp.growth, 0)), growthNeeded(stage) ?? 0);

  const ranks: Record<string, number> = {};
  const rawRanks = isRecord(rp.abilityRanks) ? rp.abilityRanks : {};
  for (const id of variant.abilities) {
    const def = ABILITIES[id];
    if (!def) continue;
    let rank = Math.min(def.maxRank, Math.max(0, Math.floor(finite(rawRanks[id], 0))));
    if (def.signature) rank = Math.max(1, rank);
    if (rank > 0) ranks[id] = rank;
  }

  const unlocked = biomeList(raw.unlockedBiomes);
  if (!unlocked.includes('forest')) unlocked.unshift('forest');

  return {
    version: TUNING.save.version,
    speciesId: species.id,
    variantId: variant.id,
    progress: {
      level,
      xp,
      abilityPoints: Math.max(0, Math.floor(finite(rp.abilityPoints, 0))),
      stage,
      growth,
      abilityRanks: ranks,
    },
    unlockedBiomes: unlocked,
    ruledBiomes: biomeList(raw.ruledBiomes),
  };
}

export function parseSave(json: string | null): SaveData | null {
  if (!json) return null;
  try {
    return sanitizeSave(JSON.parse(json));
  } catch {
    return null;
  }
}
