import type { AbilityDef } from '../core/types.ts';

const RANKS = { maxRank: 3, rankScale: 0.2 };

const list: AbilityDef[] = [
  // ---------- Wolf ----------
  {
    id: 'wolf_pounce', name: 'Pounce', icon: 'leap', signature: true, ...RANKS,
    description: 'Leap forward and strike everything where you land.',
    cooldown: 6, staminaCost: 20,
    effect: { kind: 'leap', distance: 7, duration: 0.5, damageMult: 1.8, radius: 2.2, knockback: 5 },
  },
  {
    id: 'wolf_howl', name: 'Howl', icon: 'howl', ...RANKS,
    description: 'Howl to raise your speed and damage for a short time.',
    cooldown: 18, staminaCost: 15,
    effect: { kind: 'buff', duration: 8, mods: [{ stat: 'speed', pct: 0.25 }, { stat: 'damage', pct: 0.2 }] },
  },
  {
    id: 'wolf_bleed_bite', name: 'Bleed Bite', icon: 'bite', ...RANKS,
    description: 'A tearing bite that leaves the target bleeding.',
    cooldown: 9, staminaCost: 15,
    effect: {
      kind: 'melee', windup: 0.15, damageMult: 1.1, range: 1.7, arcDeg: 90, knockback: 2,
      bleed: { dpsMult: 0.4, duration: 5 },
    },
  },
  {
    id: 'wolf_pack_hunter', name: 'Pack Hunter', icon: 'fang', ...RANKS,
    description: 'Passive. Deal bonus damage to targets below 40% health.',
    cooldown: 0, staminaCost: 0,
    effect: { kind: 'passive', lowHealthBonus: { threshold: 0.4, pct: 0.25 } },
  },

  // ---------- Lion ----------
  {
    id: 'lion_roar', name: 'Mighty Roar', icon: 'roar', signature: true, ...RANKS,
    description: 'A roar that stuns nearby enemies, then leaves them slowed.',
    cooldown: 12, staminaCost: 20,
    effect: {
      kind: 'aoe', windup: 0.25, radius: 8, damageMult: 0.3, knockback: 2, stun: 1.5,
      slow: { pct: 0.4, duration: 3 },
    },
  },
  {
    id: 'lion_claw_swipe', name: 'Claw Swipe', icon: 'claw', ...RANKS,
    description: 'A wide swipe that hits everything in front of you.',
    cooldown: 5, staminaCost: 15,
    effect: { kind: 'melee', windup: 0.12, damageMult: 1.5, range: 2.4, arcDeg: 180, knockback: 4.5 },
  },
  {
    id: 'lion_pounce_slam', name: 'Pounce Slam', icon: 'leap', ...RANKS,
    description: 'Leap and slam down, knocking enemies back and briefly stunning them.',
    cooldown: 10, staminaCost: 25,
    effect: { kind: 'leap', distance: 6, duration: 0.55, damageMult: 2.0, radius: 3, knockback: 7, stun: 0.5 },
  },
  {
    id: 'lion_pride_presence', name: 'Pride Presence', icon: 'shield', ...RANKS,
    description: 'Passive. Your bearing hardens you: bonus defense.',
    cooldown: 0, staminaCost: 0,
    effect: { kind: 'passive', mods: [{ stat: 'defense', flat: 8 }] },
  },

  // ---------- Bear ----------
  {
    id: 'bear_heavy_swipe', name: 'Heavy Swipe', icon: 'claw', signature: true, ...RANKS,
    description: 'A slow, crushing swipe with heavy knockback.',
    cooldown: 5, staminaCost: 18,
    effect: { kind: 'melee', windup: 0.45, damageMult: 2.4, range: 2.3, arcDeg: 130, knockback: 8 },
  },
  {
    id: 'bear_maul', name: 'Maul', icon: 'paw', ...RANKS,
    description: 'Hold your ground and tear into the target three times.',
    cooldown: 9, staminaCost: 22,
    effect: {
      kind: 'melee', windup: 0.2, damageMult: 0.8, range: 1.9, arcDeg: 80, knockback: 1,
      hits: 3, hitInterval: 0.3, selfRoot: true,
    },
  },
  {
    id: 'bear_ground_slam', name: 'Ground Slam', icon: 'slam', ...RANKS,
    description: 'Slam the ground, damaging and staggering everything around you.',
    cooldown: 11, staminaCost: 25,
    effect: { kind: 'aoe', windup: 0.4, radius: 5, damageMult: 1.6, knockback: 7, stun: 0.6 },
  },
  {
    id: 'bear_ice_slam', name: 'Ice Slam', icon: 'slam', ...RANKS,
    description: 'Slam the ground with a burst of cold that damages and slows.',
    cooldown: 11, staminaCost: 25,
    effect: {
      kind: 'aoe', windup: 0.4, radius: 5, damageMult: 1.4, knockback: 5,
      slow: { pct: 0.45, duration: 4 },
    },
  },
  {
    id: 'bear_thick_hide', name: 'Thick Hide', icon: 'shield', ...RANKS,
    description: 'Passive. Dense fur and fat: bonus defense.',
    cooldown: 0, staminaCost: 0,
    effect: { kind: 'passive', mods: [{ stat: 'defense', flat: 8 }] },
  },
  {
    id: 'bear_arctic_swimmer', name: 'Arctic Swimmer', icon: 'wave', ...RANKS,
    description: 'Passive. Swim faster and gain more growth from fish.',
    cooldown: 0, staminaCost: 0,
    effect: { kind: 'passive', swim: { speedPct: 0.5 }, foodBonus: { kind: 'fish', pct: 0.5 } },
  },

  // ---------- Milestone 2 species: data placeholders, not playable yet ----------
  {
    id: 'tiger_ambush_strike', name: 'Ambush Strike', icon: 'claw', signature: true, ...RANKS,
    description: 'A sudden strike that hits harder from behind.',
    cooldown: 6, staminaCost: 18, todo: 'M2: bonus damage from behind',
    effect: { kind: 'melee', windup: 0.15, damageMult: 1.9, range: 2.0, arcDeg: 100, knockback: 4 },
  },
  {
    id: 'tiger_rend', name: 'Rend', icon: 'bite', ...RANKS,
    description: 'Rake the target and leave it bleeding.',
    cooldown: 9, staminaCost: 15, todo: 'M2: tune',
    effect: {
      kind: 'melee', windup: 0.15, damageMult: 1.0, range: 1.9, arcDeg: 100, knockback: 2,
      bleed: { dpsMult: 0.45, duration: 5 },
    },
  },
  {
    id: 'tiger_stalk', name: 'Stalk', icon: 'paw', ...RANKS,
    description: 'Passive. Move faster while unseen.',
    cooldown: 0, staminaCost: 0, todo: 'M2: needs an "unseen" check',
    effect: { kind: 'passive', mods: [{ stat: 'speed', pct: 0.1 }] },
  },
  {
    id: 'tiger_double_claw', name: 'Double Claw', icon: 'claw', ...RANKS,
    description: 'Two fast claw strikes.',
    cooldown: 7, staminaCost: 18, todo: 'M2: tune',
    effect: {
      kind: 'melee', windup: 0.1, damageMult: 1.0, range: 2.0, arcDeg: 110, knockback: 2,
      hits: 2, hitInterval: 0.22,
    },
  },
  {
    id: 'elephant_charge', name: 'Charge', icon: 'leap', signature: true, ...RANKS,
    description: 'A dash that knocks enemies back.',
    cooldown: 9, staminaCost: 25, todo: 'M2: ground dash instead of a leap',
    effect: { kind: 'leap', distance: 9, duration: 0.7, damageMult: 1.6, radius: 3, knockback: 10 },
  },
  {
    id: 'elephant_stomp', name: 'Stomp', icon: 'slam', ...RANKS,
    description: 'Stomp the ground, damaging everything nearby.',
    cooldown: 10, staminaCost: 25, todo: 'M2: tune',
    effect: { kind: 'aoe', windup: 0.5, radius: 6, damageMult: 1.5, knockback: 6, stun: 0.6 },
  },
  {
    id: 'elephant_trunk_whip', name: 'Trunk Whip', icon: 'claw', ...RANKS,
    description: 'A long sweeping strike with the trunk.',
    cooldown: 5, staminaCost: 15, todo: 'M2: tune',
    effect: { kind: 'melee', windup: 0.25, damageMult: 1.4, range: 3.2, arcDeg: 150, knockback: 6 },
  },
  {
    id: 'elephant_thick_skin', name: 'Thick Skin', icon: 'shield', ...RANKS,
    description: 'Passive. Bonus defense.',
    cooldown: 0, staminaCost: 0, todo: 'M2: tune',
    effect: { kind: 'passive', mods: [{ stat: 'defense', flat: 10 }] },
  },
  {
    id: 'croc_death_roll', name: 'Death Roll', icon: 'bite', signature: true, ...RANKS,
    description: 'Clamp on and roll, dealing heavy damage.',
    cooldown: 10, staminaCost: 25, todo: 'M2: grab the target during the roll',
    effect: {
      kind: 'melee', windup: 0.2, damageMult: 0.9, range: 1.8, arcDeg: 70, knockback: 1,
      hits: 4, hitInterval: 0.25, selfRoot: true,
    },
  },
  {
    id: 'croc_lunge', name: 'Lunge', icon: 'leap', ...RANKS,
    description: 'Burst forward jaws-first.',
    cooldown: 7, staminaCost: 20, todo: 'M2: tune',
    effect: { kind: 'leap', distance: 6, duration: 0.35, damageMult: 1.7, radius: 2, knockback: 4 },
  },
  {
    id: 'croc_tail_sweep', name: 'Tail Sweep', icon: 'claw', ...RANKS,
    description: 'Sweep the tail in a wide arc.',
    cooldown: 6, staminaCost: 15, todo: 'M2: hit behind the animal',
    effect: { kind: 'melee', windup: 0.2, damageMult: 1.3, range: 2.8, arcDeg: 220, knockback: 7 },
  },
  {
    id: 'croc_water_ambush', name: 'Water Ambush', icon: 'wave', ...RANKS,
    description: 'Passive. Strike harder when attacking from water.',
    cooldown: 0, staminaCost: 0, todo: 'M2: needs an "in water" damage check',
    effect: { kind: 'passive', swim: { speedPct: 0.6 } },
  },
  {
    id: 'eagle_dive_strike', name: 'Dive Strike', icon: 'leap', signature: true, ...RANKS,
    description: 'Dive from the air onto a target.',
    cooldown: 7, staminaCost: 20, todo: 'M2: needs flight',
    effect: { kind: 'leap', distance: 10, duration: 0.5, damageMult: 2.2, radius: 2, knockback: 5 },
  },
  {
    id: 'eagle_talon_grab', name: 'Talon Grab', icon: 'claw', ...RANKS,
    description: 'Seize a target with your talons.',
    cooldown: 9, staminaCost: 20, todo: 'M2: grab and carry',
    effect: { kind: 'melee', windup: 0.15, damageMult: 1.5, range: 1.6, arcDeg: 80, knockback: 1 },
  },
  {
    id: 'eagle_gust', name: 'Gust', icon: 'wave', ...RANKS,
    description: 'Beat your wings to knock enemies away.',
    cooldown: 10, staminaCost: 20, todo: 'M2: tune',
    effect: { kind: 'aoe', windup: 0.25, radius: 6, damageMult: 0.4, knockback: 12 },
  },
  {
    id: 'eagle_eye', name: 'Eagle Eye', icon: 'fang', ...RANKS,
    description: 'Passive. Reveals enemies at long range.',
    cooldown: 0, staminaCost: 0, todo: 'M2: reveal effect',
    effect: { kind: 'passive' },
  },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(list.map((a) => [a.id, a]));

export function getAbility(id: string): AbilityDef {
  const def = ABILITIES[id];
  if (!def) throw new Error(`Unknown ability: ${id}`);
  return def;
}
