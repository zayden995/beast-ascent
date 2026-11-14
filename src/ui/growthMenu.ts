import { getAbility } from '../data/abilities.ts';
import { STAGES, STAGE_ORDER, previousStage } from '../data/stages.ts';
import { abilityRank, canUpgradeAbility, evolveStatus, growthNeeded } from '../logic/progression.ts';
import type { Growth } from '../systems/growth.ts';
import { button, el } from './dom.ts';
import { iconSvg } from './icons.ts';

/** Tab menu: the two growth tracks. Left: food -> life stage. Right: ability points -> abilities. */
export class GrowthMenu {
  readonly root = el('div', 'screen overlay');
  private card = el('div', 'growth-card plaque');
  private growth: Growth;
  private onClose: () => void;

  constructor(parent: HTMLElement, growth: Growth, onClose: () => void) {
    this.growth = growth;
    this.onClose = onClose;
    this.root.append(this.card);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose();
    });
    parent.append(this.root);
    this.render();
  }

  private render(): void {
    this.card.textContent = '';
    this.card.append(this.stageColumn(), this.abilityColumn());
  }

  private stageColumn(): HTMLElement {
    const g = this.growth;
    const p = g.progress;
    const col = el('section');
    col.append(el('h2', '', `${STAGES[p.stage].name} ${g.variant.name}`));

    const track = el('div', 'stages');
    const currentIndex = STAGE_ORDER.indexOf(p.stage);
    STAGE_ORDER.forEach((id, i) => {
      if (i > 0) track.append(el('span', 'arrow', '>'));
      const node = el('div', `stage${i < currentIndex ? ' done' : i === currentIndex ? ' current' : ''}`);
      node.append(el('b', '', STAGES[id].name), `Level ${STAGES[id].levelRequired}`);
      track.append(node);
    });
    col.append(track);

    const status = evolveStatus(p);
    const need = growthNeeded(p.stage);
    if (status.next && need !== null) {
      const next = STAGES[status.next];
      const meter = el('div', `meter growth${status.canEvolve ? ' full' : ''}`);
      const fill = el('i');
      fill.style.width = `${Math.min(100, (p.growth / need) * 100)}%`;
      meter.append(fill, el('span', '', `Growth ${Math.floor(p.growth)} / ${need}`));
      col.append(meter);

      const needs = el('ul', 'needs');
      const growthItem = el('li', status.growthOk ? 'met' : '', 'Fill the growth meter by eating');
      const levelItem = el('li', status.levelOk ? 'met' : '', `Reach level ${next.levelRequired} (you are level ${p.level})`);
      needs.append(growthItem, levelItem);
      col.append(needs);

      const evolve = button('plank primary', `Evolve into ${next.name}`, () => {
        if (g.tryEvolve()) this.onClose();
      });
      evolve.disabled = !status.canEvolve;
      col.append(evolve);

      if (status.locked) {
        col.append(el('p', 'hint', `${next.name} is not available yet. Keep growing until then.`));
      } else {
        col.append(el('p', 'hint', `${next.name}: ${next.sizeScale / STAGES[p.stage].sizeScale > 1 ? 'bigger' : 'same size'}, ${next.powerMult / STAGES[p.stage].powerMult}x health and damage.`));
      }
    } else {
      col.append(el('p', 'hint', 'Fully grown.'));
    }
    const lower = previousStage(p.stage);
    if (p.wounded && lower) {
      col.append(el('p', 'hint wounded', `Wounded: dying before you gain a level drops you to ${STAGES[lower].name}.`));
    }
    col.append(el('p', 'hint', `Diet: ${g.species.diet}. Dying drops you to level ${STAGES[p.stage].levelRequired}, the start of your stage. Dying again before your next level costs a whole stage.`));
    return col;
  }

  private abilityColumn(): HTMLElement {
    const g = this.growth;
    const p = g.progress;
    const col = el('section');
    const head = el('h2', '', 'Abilities ');
    head.append(el('span', 'points', p.abilityPoints === 1 ? '1 point to spend' : `${p.abilityPoints} points to spend`));
    col.append(head);

    const list = el('ul', 'ability-list');
    let activeIndex = 0;
    for (const id of g.variant.abilities) {
      const def = getAbility(id);
      const rank = abilityRank(p, id);
      const passive = def.effect.kind === 'passive';
      const row = el('li', `ability-row${rank === 0 ? ' locked' : ''}`);

      const icon = el('div', 'ability-icon');
      icon.innerHTML = iconSvg(def.icon);

      const body = el('div');
      const title = el('h3', '', def.name);
      title.append(el('span', 'key', passive ? 'Passive' : String(++activeIndex)));
      const pips = el('span', 'pips');
      for (let i = 0; i < def.maxRank; i++) pips.append(el('i', i < rank ? 'on' : ''));
      title.append(pips);
      const cost = passive ? '' : ` ${def.cooldown}s cooldown, ${def.staminaCost} stamina.`;
      body.append(title, el('p', '', `${def.description}${cost} Each rank adds ${Math.round(def.rankScale * 100)}%.`));

      const label = rank >= def.maxRank ? 'Max rank' : rank === 0 ? 'Unlock' : 'Upgrade';
      const btn = button('chip', label, () => {
        if (g.upgrade(id)) this.render();
      });
      btn.disabled = !canUpgradeAbility(p, def);
      row.append(icon, body, btn);
      list.append(row);
    }
    col.append(list);
    col.append(el('p', 'hint', 'Defeating animals gives XP. Each level gives one ability point.'));
    return col;
  }

  dispose(): void {
    this.root.remove();
  }
}
