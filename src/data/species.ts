import type { BodyPlan, SpeciesDef } from '../core/types.ts';

// All seven species live in this one file (bible section 6).
// Base stats are Juvenile values; life stages multiply health and damage (see stages.ts).
// Body plans are adult proportions in metres; life stages scale the whole animal.

const wolfBody: BodyPlan = {
  bodyLength: 1.05, bodyHeight: 0.42, bodyWidth: 0.36, legLength: 0.6, legThickness: 0.085,
  neckLength: 0.3, neckAngle: 0.75, headSize: 0.27, snoutLength: 0.25,
  ears: 'pointed', earSize: 0.13, tail: 'bushy', tailLength: 0.55, chestBulk: 1.15,
};

const bigCatBody: BodyPlan = {
  bodyLength: 1.35, bodyHeight: 0.52, bodyWidth: 0.46, legLength: 0.66, legThickness: 0.12,
  neckLength: 0.3, neckAngle: 0.6, headSize: 0.34, snoutLength: 0.19,
  ears: 'round', earSize: 0.09, tail: 'tuft', tailLength: 0.9, chestBulk: 1.2,
};

const bearBody: BodyPlan = {
  bodyLength: 1.5, bodyHeight: 0.8, bodyWidth: 0.74, legLength: 0.58, legThickness: 0.2,
  neckLength: 0.22, neckAngle: 0.35, headSize: 0.42, snoutLength: 0.24,
  ears: 'round', earSize: 0.1, tail: 'stub', tailLength: 0.12, chestBulk: 1.12,
};

export const SPECIES: SpeciesDef[] = [
  {
    id: 'wolf', name: 'Wolf', role: 'Fast, agile pack hunter', diet: 'carnivore',
    playableFrom: 1, rig: 'quadruped',
    baseStats: {
      maxHealth: 90, stamina: 120, staminaRegen: 22, damage: 11, moveSpeed: 6.2, sprintSpeed: 10.5,
      attackSpeed: 1.8, defense: 4, size: 1,
    },
    body: wolfBody,
    stageFeatures: { juvenile: [], adult: ['ruff'], alpha: ['ruff', 'scar'] },
    attack: { range: 1.5, arcDeg: 100, knockback: 3 },
    variants: [
      {
        id: 'default', name: 'Grey Wolf',
        colors: { body: 0x8a8e96, belly: 0xdcd8cf, accent: 0x474a52 },
        biomeMods: [
          { biome: 'forest', stat: 'speed', pct: 0.2 },
          { biome: 'jungle', stat: 'speed', pct: -0.15 },
        ],
        abilities: ['wolf_pounce', 'wolf_howl', 'wolf_bleed_bite', 'wolf_pack_hunter'],
      },
    ],
  },
  {
    id: 'lion', name: 'Lion', role: 'Balanced, strong melee with a mighty roar', diet: 'carnivore',
    playableFrom: 1, rig: 'quadruped',
    baseStats: {
      maxHealth: 110, stamina: 100, staminaRegen: 18, damage: 14, moveSpeed: 5.6, sprintSpeed: 9.6,
      attackSpeed: 1.5, defense: 6, size: 1,
    },
    body: bigCatBody,
    stageFeatures: { juvenile: [], adult: ['maneSmall'], alpha: ['mane', 'scar'] },
    attack: { range: 1.7, arcDeg: 110, knockback: 4 },
    variants: [
      {
        id: 'default', name: 'Savanna Lion',
        colors: { body: 0xd9a65a, belly: 0xf1dcae, accent: 0x7b4a22 },
        biomeMods: [
          { biome: 'plains', stat: 'damage', pct: 0.2 },
          { biome: 'winter', stat: 'speed', pct: -0.2 },
        ],
        abilities: ['lion_roar', 'lion_claw_swipe', 'lion_pounce_slam', 'lion_pride_presence'],
      },
    ],
  },
  {
    id: 'bear', name: 'Bear', role: 'Tank with high health and heavy hits', diet: 'omnivore',
    playableFrom: 1, rig: 'quadruped',
    baseStats: {
      maxHealth: 150, stamina: 90, staminaRegen: 15, damage: 17, moveSpeed: 4.8, sprintSpeed: 8.2,
      attackSpeed: 1.1, defense: 10, size: 1,
    },
    body: bearBody,
    stageFeatures: { juvenile: [], adult: ['hump'], alpha: ['hump', 'scar'] },
    attack: { range: 1.9, arcDeg: 120, knockback: 5.5 },
    variants: [
      {
        id: 'brown', name: 'Brown Bear',
        colors: { body: 0x7b5334, belly: 0x9a6f49, accent: 0x4e321d },
        biomeMods: [
          { biome: 'forest', stat: 'maxHealth', pct: 0.2 },
          { biome: 'jungle', stat: 'stamina', pct: -0.2 },
        ],
        abilities: ['bear_heavy_swipe', 'bear_maul', 'bear_ground_slam', 'bear_thick_hide'],
      },
      {
        id: 'polar', name: 'Polar Bear',
        colors: { body: 0xf1efe6, belly: 0xffffff, accent: 0xc9d2da },
        biomeMods: [
          { biome: 'winter', stat: 'maxHealth', pct: 0.25 },
          { biome: 'jungle', stat: 'stamina', pct: -0.2 },
        ],
        abilities: ['bear_heavy_swipe', 'bear_ice_slam', 'bear_thick_hide', 'bear_arctic_swimmer'],
      },
    ],
  },

  // ---------- Playable from Milestone 2. Numbers are placeholders until then. ----------
  {
    id: 'tiger', name: 'Tiger', role: 'High damage, stealthy ambusher', diet: 'carnivore',
    playableFrom: 2, rig: 'quadruped',
    baseStats: {
      maxHealth: 100, stamina: 105, staminaRegen: 19, damage: 16, moveSpeed: 5.8, sprintSpeed: 10,
      attackSpeed: 1.5, defense: 5, size: 1,
    },
    body: { ...bigCatBody, bodyLength: 1.45, tail: 'thin', tailLength: 0.95 },
    stageFeatures: { juvenile: [], adult: [], alpha: ['scar'] }, // TODO(M2): stripes
    attack: { range: 1.7, arcDeg: 110, knockback: 4 },
    variants: [
      {
        id: 'default', name: 'Bengal Tiger',
        colors: { body: 0xe2852f, belly: 0xf6ead6, accent: 0x231b16 },
        biomeMods: [
          { biome: 'jungle', stat: 'damage', pct: 0.2 },
          { biome: 'plains', stat: 'staminaRegen', pct: -0.15 },
        ],
        abilities: ['tiger_ambush_strike', 'tiger_rend', 'tiger_double_claw', 'tiger_stalk'],
      },
    ],
  },
  {
    id: 'elephant', name: 'Elephant', role: 'Huge health, slow, charges and stomps', diet: 'herbivore',
    playableFrom: 2, rig: 'quadruped',
    baseStats: {
      maxHealth: 220, stamina: 80, staminaRegen: 12, damage: 18, moveSpeed: 4.2, sprintSpeed: 7.2,
      attackSpeed: 0.9, defense: 14, size: 1,
    },
    body: {
      bodyLength: 2.6, bodyHeight: 1.6, bodyWidth: 1.3, legLength: 1.45, legThickness: 0.36,
      neckLength: 0.3, neckAngle: 0.3, headSize: 0.95, snoutLength: 0.3,
      ears: 'round', earSize: 0.45, tail: 'tuft', tailLength: 0.9, chestBulk: 1.05,
    }, // TODO(M2): trunk and tusks on the rig
    stageFeatures: { juvenile: [], adult: ['tusks'], alpha: ['tusks', 'scar'] },
    attack: { range: 2.6, arcDeg: 120, knockback: 7 },
    variants: [
      {
        id: 'default', name: 'Bush Elephant',
        colors: { body: 0x8d8a86, belly: 0xa19d98, accent: 0x5d5a57 },
        biomeMods: [
          { biome: 'jungle', stat: 'maxHealth', pct: 0.2 },
          { biome: 'plains', stat: 'maxHealth', pct: 0.2 },
          { biome: 'winter', stat: 'speed', pct: -0.2 },
        ],
        abilities: ['elephant_charge', 'elephant_stomp', 'elephant_trunk_whip', 'elephant_thick_skin'],
      },
    ],
  },
  {
    id: 'crocodile', name: 'Crocodile', role: 'Ambusher, strong near water, death roll', diet: 'carnivore',
    playableFrom: 2, rig: 'quadruped',
    baseStats: {
      maxHealth: 130, stamina: 90, staminaRegen: 14, damage: 17, moveSpeed: 4.4, sprintSpeed: 7.6,
      attackSpeed: 1.2, defense: 12, size: 1,
    },
    body: {
      bodyLength: 2.3, bodyHeight: 0.42, bodyWidth: 0.62, legLength: 0.24, legThickness: 0.11,
      neckLength: 0.15, neckAngle: 0.05, headSize: 0.36, snoutLength: 0.6,
      ears: 'none', earSize: 0, tail: 'thin', tailLength: 1.8, chestBulk: 1.0,
    }, // TODO(M2): long jaw and heavy tail on the rig
    stageFeatures: { juvenile: [], adult: ['ridge'], alpha: ['ridge', 'scar'] },
    attack: { range: 1.8, arcDeg: 90, knockback: 4 },
    variants: [
      {
        id: 'default', name: 'Crocodile',
        colors: { body: 0x5f6b3a, belly: 0xc9c58d, accent: 0x39421f },
        biomeMods: [
          { biome: 'jungle', stat: 'damage', pct: 0.25, condition: 'nearWater' },
          { biome: 'winter', stat: 'speed', pct: -0.3 },
        ],
        abilities: ['croc_death_roll', 'croc_lunge', 'croc_tail_sweep', 'croc_water_ambush'],
      },
      {
        id: 'alligator', name: 'Alligator',
        colors: { body: 0x3b4034, belly: 0xbdb99a, accent: 0x23261e },
        biomeMods: [
          { biome: 'jungle', stat: 'damage', pct: 0.25, condition: 'nearWater' },
          { biome: 'winter', stat: 'speed', pct: -0.3 },
        ],
        abilities: ['croc_death_roll', 'croc_lunge', 'croc_tail_sweep', 'croc_water_ambush'],
      },
    ],
  },
  {
    id: 'eagle', name: 'Eagle', role: 'Flying, dive attacks, fragile', diet: 'carnivore',
    playableFrom: 2, rig: 'winged', // TODO(M2): winged rig and flight
    baseStats: {
      maxHealth: 65, stamina: 130, staminaRegen: 24, damage: 12, moveSpeed: 6.5, sprintSpeed: 12,
      attackSpeed: 1.6, defense: 2, size: 1,
    },
    body: {
      bodyLength: 0.6, bodyHeight: 0.3, bodyWidth: 0.28, legLength: 0.22, legThickness: 0.04,
      neckLength: 0.12, neckAngle: 0.9, headSize: 0.18, snoutLength: 0.1,
      ears: 'none', earSize: 0, tail: 'thin', tailLength: 0.3, chestBulk: 1.1,
    },
    stageFeatures: { juvenile: [], adult: [], alpha: [] },
    attack: { range: 1.2, arcDeg: 90, knockback: 2 },
    variants: [
      {
        id: 'default', name: 'Golden Eagle',
        colors: { body: 0x5a4028, belly: 0x8a6a45, accent: 0xf2c230 },
        biomeMods: [
          { biome: 'plains', stat: 'speed', pct: 0.2 },
          { biome: 'jungle', stat: 'speed', pct: -0.2 },
        ],
        abilities: ['eagle_dive_strike', 'eagle_talon_grab', 'eagle_gust', 'eagle_eye'],
      },
    ],
  },
];

export function getSpecies(id: string): SpeciesDef {
  const def = SPECIES.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown species: ${id}`);
  return def;
}

export function getVariant(species: SpeciesDef, variantId: string) {
  return species.variants.find((v) => v.id === variantId) ?? species.variants[0];
}

export function isPlayable(species: SpeciesDef, milestone: number): boolean {
  return species.playableFrom <= milestone;
}
