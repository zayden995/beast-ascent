import type { BiomeId } from '../core/types.ts';
import { PETS } from '../data/pets.ts';
import type { PetKind } from '../data/pets.ts';
import { getAbility } from '../data/abilities.ts';
import { SPECIES, isPlayable } from '../data/species.ts';
import { STAGES, STAGE_ORDER } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { setAbilityPoints, setAbilityRank, setGrowth, setLevel, setStage, setWounded } from '../logic/admin.ts';
import type { Progress } from '../logic/progression.ts';
import type { Growth } from '../systems/growth.ts';
import { button, el } from './dom.ts';

/** What the admin panel needs from the game besides the animal's growth. */
export interface AdminHooks {
  biomeName: string;
  isRuled: () => boolean;
  setRuled: (ruled: boolean) => void;
  /** Every biome that is built, and which one the sandbox is in. */
  biomes: { id: BiomeId; name: string; current: boolean }[];
  /** Restarts the sandbox at that biome's den. */
  goToBiome: (id: BiomeId) => void;
  /** The sandbox's pet, and a way to give one or take it away. */
  pet: () => PetKind | null;
  setPet: (kind: PetKind | null) => void;
  /** Starts the sandbox again as another animal (species and skin cannot change while the game runs). */
  switchAnimal: (speciesId: string, variantId: string) => void;
  close: () => void;
}

function chip(label: string, pressed: boolean, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = button('chip', label, onClick);
  b.setAttribute('aria-pressed', String(pressed));
  b.disabled = disabled;
  return b;
}

function row(label: string, value: string, controls: HTMLElement[]): HTMLElement {
  const line = el('div', 'admin-row');
  const controlBox = el('div', 'admin-chips');
  controlBox.append(...controls);
  line.append(el('span', 'admin-label', label), el('b', 'admin-value', value), controlBox);
  return line;
}

/** The Pet row: none, a liger cub or a hyena pup, given at once beside the animal. */
function petRow(hooks: AdminHooks, render: () => void): HTMLElement {
  const current = hooks.pet();
  const choose = (kind: PetKind | null) => () => {
    if (kind !== current) hooks.setPet(kind);
    render();
  };
  const line = row('Pet', current ? PETS[current].name : 'None', [
    chip('None', current === null, choose(null)),
    ...(Object.keys(PETS) as PetKind[]).map((k) => chip(PETS[k].name, current === k, choose(k))),
  ]);
  line.dataset.row = 'pet';
  return line;
}

/**
 * The admin panel (sandbox games only, opened with J): switch to any animal and edit its stage, level,
 * ability points, growth meter, wounded mark, ability ranks and the ruled biome. Edits go through
 * `growth.adminEdit`, so stats and the model follow at once, and nothing is ever saved.
 */
export function createAdminPanel(parent: HTMLElement, growth: Growth, hooks: AdminHooks): HTMLElement {
  const root = el('div', 'screen overlay');
  const card = el('div', 'admin-card plaque');
  root.append(card);
  root.addEventListener('click', (e) => {
    if (e.target === root) hooks.close();
  });

  const render = (): void => {
    const p = growth.progress;
    const edit = (change: (progress: Progress, abilityIds: string[]) => void, stageChanged = false): void => {
      growth.adminEdit(change, stageChanged);
      render();
    };
    const needed = STAGES[p.stage].growthToNext;

    const animals = el('div', 'admin-chips');
    for (const s of SPECIES.filter((sp) => isPlayable(sp, TUNING.currentMilestone))) {
      for (const v of s.variants) {
        const current = growth.profile.speciesId === s.id && growth.profile.variantId === v.id;
        animals.append(chip(v.name, current, () => {
          if (!current) hooks.switchAnimal(s.id, v.id);
        }));
      }
    }

    const biomes = el('div', 'admin-chips');
    for (const b of hooks.biomes) {
      biomes.append(chip(b.name, b.current, () => {
        if (!b.current) hooks.goToBiome(b.id);
      }));
    }

    const stages = el('div', 'admin-chips');
    for (const id of STAGE_ORDER) stages.append(chip(STAGES[id].name, p.stage === id, () => edit((pr, ids) => setStage(pr, id, ids), true)));

    const left = el('section');
    left.append(
      el('h2', '', 'Admin sandbox'),
      el('p', 'admin-hint', 'Nothing here is saved to your slots. Press Esc or J to close.'),
      el('h3', '', 'Animal'),
      animals,
      el('h3', '', 'Biome'),
      biomes,
      el('h3', '', 'Life stage'),
      stages,
      el('h3', '', 'Progress'),
      row('Level', String(p.level), [-5, -1, 1, 5].map((d) => button('chip', d > 0 ? `+${d}` : String(d), () => edit((pr, ids) => setLevel(pr, pr.level + d, ids))))),
      row('Ability points', String(p.abilityPoints), [-1, 1, 5].map((d) => button('chip', d > 0 ? `+${d}` : String(d), () => edit((pr) => setAbilityPoints(pr, pr.abilityPoints + d))))),
      row('Growth meter', needed === null ? 'No meter (Alpha)' : `${Math.round(p.growth)} / ${needed}`, [
        ['Empty', 0],
        ['Half', 0.5],
        ['Full', 1],
      ].map(([label, f]) => {
        const b = button('chip', String(label), () => edit((pr) => setGrowth(pr, (STAGES[pr.stage].growthToNext ?? 0) * Number(f))));
        b.disabled = needed === null;
        return b;
      })),
      petRow(hooks, render),
      row('Marks', '', [
        chip('Wounded', p.wounded, () => edit((pr) => setWounded(pr, !pr.wounded)), p.stage === 'juvenile'),
        chip(`${hooks.biomeName} ruled`, hooks.isRuled(), () => {
          hooks.setRuled(!hooks.isRuled());
          render();
        }),
      ]),
    );

    const list = el('div', 'admin-abilities');
    for (const id of growth.variant.abilities) {
      const def = getAbility(id);
      const rank = p.abilityRanks[id] ?? 0;
      const name = el('span', 'admin-ability-name');
      name.append(el('b', '', def.name), el('em', '', def.signature ? 'Signature' : def.effect.kind === 'passive' ? 'Passive' : 'Active'));
      const ranks = el('div', 'admin-chips');
      for (let r = 0; r <= def.maxRank; r++) {
        ranks.append(chip(String(r), rank === r, () => edit((pr) => setAbilityRank(pr, def, r)), r === 0 && !!def.signature));
      }
      const line = el('div', 'admin-ability');
      line.dataset.ability = id;
      line.append(name, ranks);
      list.append(line);
    }
    const setAll = (rankFor: (max: number, current: number) => number): void => {
      edit((pr, ids) => {
        for (const id of ids) {
          const def = getAbility(id);
          setAbilityRank(pr, def, rankFor(def.maxRank, pr.abilityRanks[id] ?? 0));
        }
      });
    };
    const bulk = el('div', 'admin-chips');
    bulk.append(
      button('chip', 'Unlock all', () => setAll((_max, current) => Math.max(1, current))),
      button('chip', 'Max all', () => setAll((max) => max)),
      button('chip', 'Reset', () => setAll(() => 0)),
    );

    const right = el('section');
    right.append(el('h2', '', 'Abilities'), el('p', 'admin-hint', 'Ranks are set directly and cost no points.'), list, bulk, button('plank', 'Close', hooks.close));

    card.replaceChildren(left, right);
  };

  render();
  parent.append(root);
  return root;
}
