import type { StageId } from '../core/types.ts';
import { STAGES } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { evolveStatus, growthNeeded, totalXp, xpForLevel } from './progression.ts';
import type { Progress } from './progression.ts';

/**
 * The words on the growth meter. A full meter does not mean the animal can evolve: it also needs the
 * level, which comes from XP. So a full meter says which level is still needed and how much XP is left.
 */
export function meterLabel(p: Progress, maxStage: StageId = TUNING.maxPlayableStage): string {
  if (growthNeeded(p.stage) === null) return 'Fully grown';
  const evo = evolveStatus(p, maxStage);
  if (evo.canEvolve) return 'Ready to evolve (Tab)';
  if (evo.growthOk && evo.next) {
    if (evo.locked) return `Growth full. ${STAGES[evo.next].name} is not available yet`;
    const level = STAGES[evo.next].levelRequired;
    return `Fully fed, level ${level} needed (${totalXp(p)}/${xpForLevel(level)} XP)`;
  }
  return `Growth ${Math.floor(p.growth)} / ${growthNeeded(p.stage)}`;
}
