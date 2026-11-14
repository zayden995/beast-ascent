import { STAGES } from '../data/stages.ts';
import type { DeathOutcome } from './progression.ts';

/** What the death screen and the wake-up message say about a death (see `applyDeath`). */
export function describeDeath(outcome: DeathOutcome, animalName: string): { lost: string; wake: string } {
  const stage = STAGES[outcome.stage].name;
  let lost: string;
  if (outcome.dropped) lost = `You fall back a life stage, from ${STAGES[outcome.from].name} to ${stage}.`;
  else if (outcome.stage === 'juvenile') lost = 'Your levels and abilities are lost.';
  else lost = 'You keep your life stage, but your levels and abilities are lost.';

  let wake = `You wake at your den as a level ${outcome.level} ${stage} ${animalName}.`;
  if (outcome.wounded) wake += ' You are wounded: dying again before you gain a level costs a life stage.';
  return { lost, wake };
}
