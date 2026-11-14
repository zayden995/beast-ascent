import { getSpecies, getVariant } from '../data/species.ts';
import { STAGES } from '../data/stages.ts';
import type { SaveData } from '../logic/saveData.ts';
import { button, el } from './dom.ts';

export const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint (uses stamina)'],
  ['Space', 'Jump'],
  ['Q', 'Dodge roll (uses stamina)'],
  ['Left click', 'Attack'],
  ['1 2 3', 'Abilities'],
  ['E', 'Eat, interact'],
  ['Tab', 'Growth and abilities'],
  ['Esc', 'Pause'],
];

function controlsList(): HTMLElement {
  const dl = el('dl', 'controls');
  for (const [key, text] of CONTROLS) {
    const dt = el('dt');
    dt.append(el('span', 'key', key));
    dl.append(dt, el('dd', '', text));
  }
  return dl;
}

/** Title screen over the live forest. */
export function createTitleScreen(
  parent: HTMLElement,
  save: SaveData | null,
  on: { newGame: () => void; continueGame: () => void },
): HTMLElement {
  const root = el('div', 'screen title');
  const h1 = el('h1');
  h1.append('Beast', el('br'), 'Ascent');
  const lede = el('p', 'lede', 'Start small. Hunt, eat and grow until the forest is yours.');
  const planks = el('div', 'planks');
  if (save) {
    const species = getSpecies(save.speciesId);
    const variant = getVariant(species, save.variantId);
    planks.append(
      button('plank primary', 'Continue', on.continueGame, `${STAGES[save.progress.stage].name} ${variant.name}, level ${save.progress.level}`),
    );
  }
  planks.append(button(save ? 'plank' : 'plank primary', 'New game', on.newGame, save ? 'Replaces your saved animal' : ''));
  const note = el('p', 'note', 'Keyboard and mouse. Milestone 2: the Forest, with seven animals to play.');
  root.append(h1, lede, planks, note);
  parent.append(root);
  return root;
}

/** Pause menu: resume, controls, back to the title screen. */
export function createPauseMenu(parent: HTMLElement, on: { resume: () => void; quit: () => void }): HTMLElement {
  const root = el('div', 'screen overlay');
  const card = el('div', 'pause-card plaque');
  card.append(
    el('h2', '', 'Paused'),
    button('plank primary', 'Resume', on.resume),
    button('plank', 'Save and return to title', on.quit),
    controlsList(),
  );
  root.append(card);
  parent.append(root);
  return root;
}
