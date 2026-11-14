import type { SaveData } from '../logic/saveData.ts';
import { slotSummary } from '../logic/saveSlots.ts';
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

/** Title screen over the live forest. Both buttons are always there; Continue waits for a first save. */
export function createTitleScreen(
  parent: HTMLElement,
  hasSave: boolean,
  on: { newGame: () => void; continueGame: () => void },
): HTMLElement {
  const root = el('div', 'screen title');
  const h1 = el('h1');
  h1.append('Beast', el('br'), 'Ascent');
  const lede = el('p', 'lede', 'Start small. Hunt, eat and grow until the forest is yours.');
  const planks = el('div', 'planks');
  const newGame = button(hasSave ? 'plank' : 'plank primary', 'New Game', on.newGame, 'Start a new animal in a save slot');
  const continueGame = button(
    hasSave ? 'plank primary' : 'plank',
    'Continue Game',
    on.continueGame,
    hasSave ? 'Pick an animal to carry on with' : 'No saved animals yet',
  );
  continueGame.disabled = !hasSave;
  planks.append(newGame, continueGame);
  const note = el('p', 'note', 'Keyboard and mouse. Milestone 2: the Forest, with seven animals to play.');
  root.append(h1, lede, planks, note);
  parent.append(root);
  return root;
}

export type SlotMode = 'new' | 'continue';

/**
 * The four save slots, shown over the live forest. "New" lets the player pick any slot (a full one asks
 * first); "continue" lets them pick only a slot that holds an animal.
 */
export function createSlotScreen(
  parent: HTMLElement,
  mode: SlotMode,
  slots: (SaveData | null)[],
  on: { pick: (slot: number) => void; back: () => void },
): HTMLElement {
  const root = el('div', 'screen overlay');
  const card = el('div', 'slot-card plaque');
  root.append(card);

  const showList = (): void => {
    const list = el('div', 'slot-list');
    slots.forEach((save, i) => {
      const slot = i + 1;
      const row = el('button', `plank save-slot ${save ? 'filled' : 'empty'}`);
      row.type = 'button';
      row.dataset.slot = String(slot);
      const text = el('span', 'save-slot-text');
      if (save) {
        const summary = slotSummary(save);
        text.append(el('strong', '', summary.title), el('small', '', summary.detail));
      } else {
        text.append(el('strong', '', 'Empty'));
        if (mode === 'new') text.append(el('small', '', 'Start a new animal here'));
      }
      row.append(el('span', 'key', String(slot)), text);
      row.disabled = mode === 'continue' && !save;
      row.addEventListener('click', () => {
        if (mode === 'new' && save) showConfirm(slot, save);
        else on.pick(slot);
      });
      list.append(row);
    });
    card.replaceChildren(
      el('h2', '', mode === 'new' ? 'New game' : 'Continue game'),
      el('p', 'hint', mode === 'new' ? 'Choose a slot for your new animal.' : 'Choose the animal to carry on with.'),
      list,
      button('plank', 'Back', on.back),
    );
  };

  // Nothing is erased here: the old animal is replaced only when the new one begins.
  const showConfirm = (slot: number, save: SaveData): void => {
    const summary = slotSummary(save);
    card.replaceChildren(
      el('h2', '', `Replace slot ${slot}?`),
      el('p', 'hint', `Slot ${slot} holds ${summary.title} (${summary.detail}). If you begin a new animal here, it is lost.`),
      button('plank primary', 'Pick an animal', () => on.pick(slot), 'Nothing is erased until you press Begin'),
      button('plank', 'Keep it', showList),
    );
  };

  showList();
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
