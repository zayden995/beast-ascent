import { STAGES } from '../data/stages.ts';
import { TUNING } from '../data/tuning.ts';
import { describeMod } from '../logic/biome.ts';
import { describeDeath } from '../logic/deathText.ts';
import { PHASE_NAMES } from '../logic/dayNight.ts';
import { meterLabel } from '../logic/growthText.ts';
import { visionLimited } from '../logic/vision.ts';
import { evolveStatus, growthNeeded, xpToNext } from '../logic/progression.ts';
import type { Game } from '../game/Game.ts';
import { DomCache, el } from './dom.ts';
import { iconSvg } from './icons.ts';

interface SlotView {
  root: HTMLElement;
  sweep: HTMLElement;
  cd: HTMLElement;
}

function meter(kind: string): { root: HTMLElement; fill: HTMLElement; label: HTMLElement } {
  const root = el('div', `meter ${kind}`);
  const fill = el('i');
  const label = el('span');
  root.append(fill, label);
  return { root, fill, label };
}

function slot(key: string, icon: string, extra = ''): SlotView {
  const root = el('div', `slot ${extra}`.trim());
  root.innerHTML = iconSvg(icon);
  const sweep = el('i', 'sweep');
  const cd = el('span', 'cd');
  root.append(sweep, el('span', 'key', key), cd);
  return { root, sweep, cd };
}

/** Heads-up display: plain DOM over the canvas, updated every frame from game state. */
export class Hud {
  readonly root = el('div', 'hud');
  private game: Game;
  private c = new DomCache();
  private offs: (() => void)[] = [];

  private level = el('div', 'hud-level');
  private who = el('b');
  private points = el('span');
  private xp = meter('xp');
  private growthMeter = meter('growth');
  private biomeMod = el('span');
  private dayPhase = el('small');
  private boss = el('div', 'hud-boss');
  private bossName = el('b');
  private bossBar = meter('health');
  private health = meter('health');
  private stamina = meter('stamina');
  private status = el('div', 'hud-status');
  private slots: SlotView[] = [];
  private dodgeSlot: SlotView;
  private prompt = el('div', 'hud-prompt plaque');
  private toasts = el('div', 'hud-toasts');
  private death = el('div', 'hud-death');
  private deathLost = el('p');
  private deathWake = el('p');
  private hurt = el('div', 'hud-hurt');
  private banner: HTMLElement | null = null;

  constructor(parent: HTMLElement, game: Game) {
    this.game = game;

    const growth = el('div', 'hud-growth plaque');
    const col = el('div', 'col');
    const whoRow = el('div', 'who');
    whoRow.append(this.who, this.points);
    col.append(whoRow, this.xp.root, this.growthMeter.root);
    growth.append(this.level, col);

    const biome = el('div', 'hud-biome plaque');
    biome.append(el('b', '', game.world.biome.name), this.dayPhase, this.biomeMod);

    this.boss.append(this.bossName, this.bossBar.root);
    this.boss.hidden = true;

    const vitals = el('div', 'hud-vitals plaque');
    vitals.append(this.health.root, this.stamina.root, this.status);

    const abilities = el('div', 'hud-abilities');
    const attack = slot('LMB', 'claw', 'small');
    this.dodgeSlot = slot('Q', 'dodge', 'small');
    abilities.append(attack.root, this.dodgeSlot.root);
    game.player.abilities.slots.forEach((s, i) => {
      const view = slot(String(i + 1), s.def.icon, i === 0 ? 'gap' : '');
      view.root.title = s.def.name;
      this.slots.push(view);
      abilities.append(view.root);
    });

    const hints = el('div', 'hud-hints');
    const hintRows = [['Tab', 'Growth and abilities'], ['Esc', 'Pause']];
    if (game.growth.species.rig === 'winged') hintRows.unshift(['Space', 'Hold to fly, release to glide']);
    for (const [key, text] of hintRows) {
      const row = el('div');
      row.append(el('span', 'key', key), ` ${text}`);
      hints.append(row);
    }

    this.prompt.hidden = true;
    this.death.hidden = true;
    const deathBox = el('div');
    deathBox.append(
      el('h2', '', 'Defeated'),
      this.deathLost,
      this.deathWake,
      el('p', '', 'Biomes you rule stay yours.'),
    );
    this.death.append(deathBox);

    this.root.append(this.hurt, growth, biome, this.boss, vitals, abilities, this.prompt, hints, this.toasts, this.death);
    parent.append(this.root);

    const ev = game.events;
    this.offs.push(
      ev.on('toast', ({ text, tone }) => this.toast(text, tone)),
      ev.on('banner', ({ title, subtitle }) => this.showBanner(title, subtitle)),
      ev.on('damage', ({ target }) => {
        if (target !== game.player.actor) return;
        this.hurt.classList.add('on');
        requestAnimationFrame(() => this.hurt.classList.remove('on'));
      }),
      ev.on('playerDied', (outcome) => {
        // Nothing else should compete with the death screen.
        this.banner?.remove();
        const text = describeDeath(outcome, game.growth.variant.name);
        this.deathLost.textContent = text.lost;
        this.deathWake.textContent = text.wake;
        this.death.hidden = false;
      }),
      ev.on('playerRespawned', () => (this.death.hidden = true)),
    );
  }

  private toast(text: string, tone: string): void {
    const node = el('div', `toast plaque ${tone}`, text);
    this.toasts.append(node);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => node.classList.add('out'), 3200);
    setTimeout(() => node.remove(), 3700);
  }

  private showBanner(title: string, subtitle: string): void {
    this.banner?.remove();
    const node = el('div', 'hud-banner');
    node.append(el('h2', '', title), el('p', '', subtitle));
    node.addEventListener('animationend', () => node.remove());
    this.root.append(node);
    this.banner = node;
  }

  update(): void {
    const g = this.game;
    const c = this.c;
    const a = g.player.actor;
    const p = g.growth.progress;
    const stage = STAGES[p.stage];

    c.text('level', this.level, String(p.level));
    c.text('who', this.who, `${stage.name} ${g.growth.variant.name}`);
    c.text('pts', this.points, p.abilityPoints > 0 ? `${p.abilityPoints} point${p.abilityPoints > 1 ? 's' : ''} to spend` : '');

    const need = xpToNext(p.level);
    c.width('xp', this.xp.fill, p.xp / need);
    c.text('xpT', this.xp.label, `XP ${Math.floor(p.xp)} / ${need}`);

    const growthNeed = growthNeeded(p.stage);
    const evo = evolveStatus(p);
    if (growthNeed === null) {
      c.width('gr', this.growthMeter.fill, 1);
      c.text('grT', this.growthMeter.label, 'Fully grown');
    } else {
      c.width('gr', this.growthMeter.fill, p.growth / growthNeed);
      // A full meter says which level is still missing and how much XP is left (the meter and the level are separate tracks).
      c.text('grT', this.growthMeter.label, meterLabel(p));
    }
    c.cls('grFull', this.growthMeter.root, 'full', evo.canEvolve);

    c.text('phase', this.dayPhase, PHASE_NAMES[g.sky.state.phase]);

    const mods = g.player.activeMods;
    if (mods.length === 0) {
      c.text('mod', this.biomeMod, 'No modifier here');
      c.attr('modC', this.biomeMod, 'class', '');
    } else {
      c.text('mod', this.biomeMod, mods.map(describeMod).join(', '));
      c.attr('modC', this.biomeMod, 'class', mods[0].pct > 0 ? 'buff' : 'nerf');
    }

    c.width('hp', this.health.fill, a.hp / a.stats.maxHealth);
    const maxHp = Math.round(a.stats.maxHealth);
    c.text('hpT', this.health.label, `${Math.min(maxHp, Math.ceil(a.hp))} / ${maxHp}`);
    c.width('st', this.stamina.fill, a.stamina / a.stats.stamina);

    const status: string[] = [];
    if (g.world.inRefuge(a.pos.x, a.pos.z)) status.push('Safe at the den');
    if (p.wounded) status.push('Wounded');
    if (g.player.stalking) status.push('Unseen');
    if (a.flying) status.push(`Flying ${Math.round(a.altitude)} m`);
    for (const s of g.player.abilities.slots) {
      const t = a.buffTime(s.def.id);
      if (t > 0) status.push(`${s.def.name} ${Math.ceil(t)}s`);
    }
    if (a.stun > 0) status.push('Stunned');
    if (a.slowTime > 0) status.push('Slowed');
    if (a.swimming) status.push('Swimming');
    if (visionLimited(g.growth.variant.nightVision, g.sky.state.daylight)) status.push('Night: limited vision');
    c.text('status', this.status, status.join(', '));

    g.player.abilities.slots.forEach((s, i) => {
      const view = this.slots[i];
      const reason = g.player.abilities.blockedReason(i);
      let state = reason === 'locked' ? 'locked' : s.cooldown > 0 ? 'cooldown' : reason === 'stamina' ? 'stamina' : 'ready';
      if (a.buffTime(s.def.id) > 0) state = 'active';
      c.attr(`s${i}`, view.root, 'data-state', state);
      c.height(`s${i}h`, view.sweep, s.def.cooldown > 0 ? s.cooldown / s.def.cooldown : 0);
      c.text(`s${i}t`, view.cd, s.cooldown > 0 ? String(Math.ceil(s.cooldown)) : '');
    });
    c.attr('dodge', this.dodgeSlot.root, 'data-state', a.stamina >= TUNING.player.dodge.staminaCost ? 'ready' : 'stamina');

    const boss = g.spawner.boss;
    const showBoss = !!boss && boss.alive && (boss.engaged || boss.hp < boss.stats.maxHealth);
    c.hidden('boss', this.boss, !showBoss);
    if (boss && showBoss) {
      c.text('bossN', this.bossName, `${boss.name}  Lv ${boss.level}`);
      c.width('bossW', this.bossBar.fill, boss.hp / boss.stats.maxHealth);
      c.text('bossT', this.bossBar.label, `${Math.ceil(boss.hp)} / ${Math.round(boss.stats.maxHealth)}`);
    }

    const prompt = g.prompt;
    c.hidden('prompt', this.prompt, !prompt);
    if (prompt) {
      const key = `${prompt.key}|${prompt.text}`;
      if (this.promptKey !== key) {
        this.promptKey = key;
        this.prompt.textContent = '';
        if (prompt.key) this.prompt.append(el('span', 'key', prompt.key), ' ');
        this.prompt.append(prompt.text);
      }
    }
  }

  private promptKey = '';

  dispose(): void {
    for (const off of this.offs) off();
    this.root.remove();
  }
}
