import type { EnemyDef } from '../core/types.ts';
import { getSpecies, getVariant } from './species.ts';

// Wild animals. Base stats are level 1; health, damage and XP scale per level (see tuning.ts).

const list: EnemyDef[] = [
  {
    // Prey: runs on sight, never fights. It bolts in short bursts, then tires, so every playable
    // species can run it down (its sprint stays below the slowest predator's sprint).
    id: 'deer', name: 'Deer',
    baseStats: {
      maxHealth: 50, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 2.6, sprintSpeed: 7.4,
      attackSpeed: 1, defense: 0, size: 1,
    },
    body: {
      bodyLength: 1.2, bodyHeight: 0.46, bodyWidth: 0.34, legLength: 0.85, legThickness: 0.07,
      neckLength: 0.5, neckAngle: 1.05, headSize: 0.23, snoutLength: 0.2,
      ears: 'long', earSize: 0.14, tail: 'stub', tailLength: 0.12, chestBulk: 1.05,
    },
    colors: { body: 0xb5834f, belly: 0xead8b8, accent: 0x7a5630 },
    features: ['antlersSmall', 'tailTipLight'],
    behavior: {
      aggroRadius: 11, aggressive: false, fleeOnSight: true, fleeHealthPct: 1,
      leashRadius: 60, wanderRadius: 16, fleeBurst: 3.5, windedSeconds: 5, windedSpeedMult: 0.45,
      woundedSpeedMult: 0.65,
      // Prey watches for predators: a deer that faces a hunter sees it from about 15 m and bolts.
      senses: { front: 1.35 },
    },
    attacks: [],
    xp: 12, carcassGrowth: 14,
  },
  {
    // Fighter: attacks on sight, charges from range, never runs.
    id: 'boar', name: 'Boar',
    baseStats: {
      maxHealth: 90, stamina: 100, staminaRegen: 10, damage: 9, moveSpeed: 2.4, sprintSpeed: 6.8,
      attackSpeed: 1, defense: 6, size: 1,
    },
    body: {
      bodyLength: 1.1, bodyHeight: 0.62, bodyWidth: 0.5, legLength: 0.4, legThickness: 0.11,
      neckLength: 0.12, neckAngle: 0.1, headSize: 0.38, snoutLength: 0.3,
      ears: 'pointed', earSize: 0.1, tail: 'thin', tailLength: 0.25, chestBulk: 1.28,
    },
    colors: { body: 0x4f3d31, belly: 0x65503f, accent: 0x2a211b },
    features: ['tusks', 'ridge'],
    behavior: {
      aggroRadius: 10, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
      leashRadius: 38, wanderRadius: 12, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
      woundedSpeedMult: 1,
    },
    attacks: [
      {
        id: 'gore', kind: 'melee', range: 1.0, windup: 0.45, recover: 0.7, damageMult: 1,
        arcDeg: 100, knockback: 5, cooldown: 1.4,
      },
      {
        id: 'charge', kind: 'charge', range: 12, minRange: 5, windup: 0.7, recover: 1.0,
        damageMult: 1.6, knockback: 9, cooldown: 7, speed: 13, duration: 0.8,
      },
    ],
    xp: 24, carcassGrowth: 20,
  },
  {
    // Small and fast: nips at close range, bolts when hurt.
    id: 'fox', name: 'Fox',
    baseStats: {
      maxHealth: 38, stamina: 100, staminaRegen: 10, damage: 6, moveSpeed: 3.0, sprintSpeed: 7.6,
      attackSpeed: 1, defense: 0, size: 1,
    },
    body: {
      bodyLength: 0.62, bodyHeight: 0.23, bodyWidth: 0.2, legLength: 0.3, legThickness: 0.045,
      neckLength: 0.16, neckAngle: 0.7, headSize: 0.18, snoutLength: 0.16,
      ears: 'pointed', earSize: 0.11, tail: 'bushy', tailLength: 0.5, chestBulk: 1.08,
    },
    colors: { body: 0xd96a2b, belly: 0xf5ead8, accent: 0x2b2420 },
    features: ['tailTipLight'],
    behavior: {
      aggroRadius: 7, aggressive: true, fleeOnSight: false, fleeHealthPct: 0.4,
      leashRadius: 30, wanderRadius: 14, fleeBurst: 2.5, windedSeconds: 4.5, windedSpeedMult: 0.45,
      woundedSpeedMult: 0.7,
    },
    attacks: [
      {
        id: 'nip', kind: 'melee', range: 0.8, windup: 0.3, recover: 0.5, damageMult: 1,
        arcDeg: 100, knockback: 2, cooldown: 1.0,
      },
    ],
    xp: 10, carcassGrowth: 8,
  },
];

// ---------- The Jungle (Milestone 3) ----------
list.push(
  {
    // Prey: a heavy, short-legged rodent that lives by the water. Runs on sight, in bursts, then tires.
    id: 'capybara', name: 'Capybara',
    baseStats: {
      maxHealth: 70, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 2.4, sprintSpeed: 6.8,
      attackSpeed: 1, defense: 2, size: 1,
    },
    body: {
      bodyLength: 1.05, bodyHeight: 0.5, bodyWidth: 0.44, legLength: 0.25, legThickness: 0.08,
      neckLength: 0.12, neckAngle: 0.3, headSize: 0.32, snoutLength: 0.27,
      ears: 'round', earSize: 0.04, tail: 'stub', tailLength: 0.04, chestBulk: 1.0,
    },
    colors: { body: 0x9a6b3f, belly: 0xb98a5a, accent: 0x6b4a2b },
    features: [],
    behavior: {
      aggroRadius: 11, aggressive: false, fleeOnSight: true, fleeHealthPct: 1,
      leashRadius: 55, wanderRadius: 14, fleeBurst: 3.2, windedSeconds: 5, windedSpeedMult: 0.45,
      woundedSpeedMult: 0.65,
      senses: { front: 1.3 },
    },
    attacks: [],
    xp: 14, carcassGrowth: 18,
  },
  {
    // Small, quick and bold in a troop: bites at close range, bolts when badly hurt.
    id: 'monkey', name: 'Monkey',
    baseStats: {
      maxHealth: 46, stamina: 100, staminaRegen: 10, damage: 7, moveSpeed: 3.2, sprintSpeed: 7.6,
      attackSpeed: 1, defense: 0, size: 1,
    },
    body: {
      bodyLength: 0.55, bodyHeight: 0.24, bodyWidth: 0.2, legLength: 0.34, legThickness: 0.045,
      neckLength: 0.1, neckAngle: 0.9, headSize: 0.2, snoutLength: 0.07,
      ears: 'round', earSize: 0.07, tail: 'thin', tailLength: 0.62, chestBulk: 1.1,
    },
    colors: { body: 0x7a5a3a, belly: 0xd9c29a, accent: 0x4a3524 },
    features: [],
    behavior: {
      aggroRadius: 8, aggressive: true, fleeOnSight: false, fleeHealthPct: 0.35,
      leashRadius: 32, wanderRadius: 14, fleeBurst: 2.5, windedSeconds: 4.5, windedSpeedMult: 0.45,
      woundedSpeedMult: 0.7,
    },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 0.8, windup: 0.28, recover: 0.45, damageMult: 1,
        arcDeg: 100, knockback: 2, cooldown: 0.9,
      },
    ],
    xp: 12, carcassGrowth: 9,
  },
  {
    // Fighter: a big, thick-skinned browser with a pale saddle. Attacks on sight, charges from range, never runs.
    id: 'tapir', name: 'Tapir',
    baseStats: {
      maxHealth: 110, stamina: 100, staminaRegen: 10, damage: 10, moveSpeed: 2.4, sprintSpeed: 6.6,
      attackSpeed: 1, defense: 7, size: 1,
    },
    body: {
      bodyLength: 1.3, bodyHeight: 0.66, bodyWidth: 0.5, legLength: 0.5, legThickness: 0.11,
      neckLength: 0.2, neckAngle: 0.25, headSize: 0.36, snoutLength: 0.42,
      ears: 'round', earSize: 0.08, tail: 'stub', tailLength: 0.06, chestBulk: 1.1,
    },
    colors: { body: 0x35302d, belly: 0x4a433e, accent: 0x242120, saddle: 0xe4dfd2 },
    features: ['saddle'],
    behavior: {
      aggroRadius: 10, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
      leashRadius: 38, wanderRadius: 12, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
      woundedSpeedMult: 1,
    },
    attacks: [
      {
        id: 'shove', kind: 'melee', range: 1.1, windup: 0.5, recover: 0.7, damageMult: 1,
        arcDeg: 100, knockback: 6, cooldown: 1.5,
      },
      {
        id: 'charge', kind: 'charge', range: 12, minRange: 5, windup: 0.7, recover: 1.0,
        damageMult: 1.6, knockback: 9, cooldown: 7, speed: 13, duration: 0.8,
      },
    ],
    xp: 28, carcassGrowth: 24,
  },
);

/** A wild predator that looks like a playable species: the adult body, colours and features. */
function rival(speciesId: string, variantId: string, def: Omit<EnemyDef, 'body' | 'colors' | 'features'>): EnemyDef {
  const species = getSpecies(speciesId);
  return { ...def, body: species.body, colors: getVariant(species, variantId).colors, features: species.stageFeatures.adult };
}

const stands = {
  aggressive: true, fleeOnSight: false, fleeHealthPct: 0, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1, woundedSpeedMult: 1,
};

// Rival predators attack on sight and never run. They chase more slowly than any playable species
// can sprint, so a fight with one can always be escaped (and the den is always safe).
list.push(
  rival('wolf', 'default', {
    // Quick bites and a short lunge. Lives in a pair.
    id: 'rival_wolf', name: 'Wolf',
    baseStats: {
      maxHealth: 65, stamina: 100, staminaRegen: 10, damage: 8, moveSpeed: 2.8, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 3, size: 1,
    },
    behavior: { ...stands, aggroRadius: 13, leashRadius: 42, wanderRadius: 16 },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 1.0, windup: 0.35, recover: 0.55, damageMult: 1,
        arcDeg: 100, knockback: 3, cooldown: 1.1,
      },
      {
        id: 'lunge', kind: 'charge', range: 9, minRange: 4, windup: 0.5, recover: 0.8,
        damageMult: 1.4, knockback: 6, cooldown: 6, speed: 14, duration: 0.5,
      },
    ],
    xp: 30, carcassGrowth: 18,
  }),
  rival('lion', 'default', {
    // Wide claw swipes and a pounce from range.
    id: 'rival_lion', name: 'Lion',
    baseStats: {
      maxHealth: 85, stamina: 100, staminaRegen: 10, damage: 10, moveSpeed: 2.6, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 5, size: 1,
    },
    behavior: { ...stands, aggroRadius: 12, leashRadius: 40, wanderRadius: 14 },
    attacks: [
      {
        id: 'claw', kind: 'melee', range: 1.3, windup: 0.45, recover: 0.7, damageMult: 1,
        arcDeg: 130, knockback: 6, cooldown: 1.5,
      },
      {
        id: 'pounce', kind: 'charge', range: 10, minRange: 5, windup: 0.7, recover: 1.0,
        damageMult: 1.6, knockback: 9, cooldown: 7, speed: 14, duration: 0.6,
      },
    ],
    xp: 40, carcassGrowth: 24,
  }),
  rival('bear', 'brown', {
    // Slow and tough: a heavy swipe and a ground slam.
    id: 'rival_bear', name: 'Bear',
    baseStats: {
      maxHealth: 120, stamina: 100, staminaRegen: 10, damage: 11, moveSpeed: 2.2, sprintSpeed: 6.6,
      attackSpeed: 1, defense: 8, size: 1,
    },
    behavior: { ...stands, aggroRadius: 11, leashRadius: 36, wanderRadius: 12 },
    attacks: [
      {
        id: 'swipe', kind: 'melee', range: 1.5, windup: 0.7, recover: 0.9, damageMult: 1.3,
        arcDeg: 120, knockback: 8, cooldown: 2.0,
      },
      {
        id: 'slam', kind: 'aoe', range: 2.0, radius: 4.5, windup: 0.9, recover: 1.1,
        damageMult: 1.1, knockback: 7, cooldown: 9,
      },
    ],
    xp: 50, carcassGrowth: 30,
  }),
);

// ---------- Winter (Milestone 3, designed with the user on 2026-11-20) ----------
// Levels 24 to 28 on the snow and the ice, 28 to 34 on the mountain. Every number is a first guess.
const winterPrey = {
  aggressive: false, fleeOnSight: true, fleeHealthPct: 1, fleeBurst: 3, windedSeconds: 5, windedSpeedMult: 0.45, woundedSpeedMult: 0.7,
  senses: { front: 1.35 },
};
list.push(
  {
    // Quick prey of the snow: white, with long ears. Bolts in bursts and tires, like the deer.
    id: 'arctic_hare', name: 'Arctic Hare',
    baseStats: {
      maxHealth: 40, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 3.0, sprintSpeed: 7.4,
      attackSpeed: 1, defense: 0, size: 1,
    },
    body: {
      bodyLength: 0.55, bodyHeight: 0.3, bodyWidth: 0.24, legLength: 0.3, legThickness: 0.05,
      neckLength: 0.1, neckAngle: 0.6, headSize: 0.17, snoutLength: 0.07,
      ears: 'long', earSize: 0.22, tail: 'stub', tailLength: 0.06, chestBulk: 1.12,
    },
    colors: { body: 0xf3f5f7, belly: 0xffffff, accent: 0x2f2f33 },
    features: [],
    behavior: { ...winterPrey, aggroRadius: 10, leashRadius: 50, wanderRadius: 14 },
    attacks: [],
    xp: 28, carcassGrowth: 12,
  },
  {
    // The Forest's fox in its winter coat: it nips, and bolts when it is hurt.
    id: 'arctic_fox', name: 'Arctic Fox',
    baseStats: {
      maxHealth: 70, stamina: 100, staminaRegen: 10, damage: 10, moveSpeed: 3.0, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 2, size: 1,
    },
    body: {
      bodyLength: 0.62, bodyHeight: 0.25, bodyWidth: 0.22, legLength: 0.28, legThickness: 0.05,
      neckLength: 0.15, neckAngle: 0.7, headSize: 0.18, snoutLength: 0.13,
      ears: 'pointed', earSize: 0.08, tail: 'bushy', tailLength: 0.5, chestBulk: 1.12,
    },
    colors: { body: 0xeef1f4, belly: 0xffffff, accent: 0x6f7378 },
    features: [],
    behavior: {
      aggroRadius: 8, aggressive: true, fleeOnSight: false, fleeHealthPct: 0.4,
      leashRadius: 30, wanderRadius: 14, fleeBurst: 2.5, windedSeconds: 4.5, windedSpeedMult: 0.45, woundedSpeedMult: 0.7,
    },
    attacks: [
      {
        id: 'nip', kind: 'melee', range: 0.8, windup: 0.3, recover: 0.5, damageMult: 1,
        arcDeg: 100, knockback: 2, cooldown: 1.0,
      },
    ],
    xp: 34, carcassGrowth: 14,
  },
  {
    // Prey of the mountain: a white goat with short curved horns, sure-footed on the shelves beside the trail.
    id: 'mountain_goat', name: 'Mountain Goat',
    baseStats: {
      maxHealth: 90, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 2.8, sprintSpeed: 7.4,
      attackSpeed: 1, defense: 3, size: 1,
    },
    body: {
      bodyLength: 1.0, bodyHeight: 0.56, bodyWidth: 0.4, legLength: 0.55, legThickness: 0.09,
      neckLength: 0.28, neckAngle: 0.8, headSize: 0.26, snoutLength: 0.17,
      ears: 'pointed', earSize: 0.09, tail: 'stub', tailLength: 0.1, chestBulk: 1.18,
    },
    colors: { body: 0xece6d6, belly: 0xf7f3e9, accent: 0x3a3530 },
    features: ['horns'],
    behavior: { ...winterPrey, aggroRadius: 11, leashRadius: 30, wanderRadius: 6 },
    attacks: [],
    xp: 45, carcassGrowth: 26,
  },
  {
    // A big cat of the mountain: pale grey with dark rosettes and a long, thick tail. It lies calm on a ledge beside the trail
    // and springs at an animal that comes within 10 m (`wakeNear` on its lair of one).
    id: 'snow_leopard', name: 'Snow Leopard',
    baseStats: {
      maxHealth: 150, stamina: 100, staminaRegen: 10, damage: 15, moveSpeed: 3.0, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 6, size: 1,
    },
    body: {
      bodyLength: 1.25, bodyHeight: 0.48, bodyWidth: 0.4, legLength: 0.48, legThickness: 0.1,
      neckLength: 0.24, neckAngle: 0.4, headSize: 0.29, snoutLength: 0.13,
      ears: 'round', earSize: 0.07, tail: 'bushy', tailLength: 1.1, chestBulk: 1.1,
    },
    colors: { body: 0xd6d4cc, belly: 0xf1efe9, accent: 0x45454a },
    features: ['spots'],
    behavior: { ...stands, aggroRadius: 12, leashRadius: 26, wanderRadius: 3 },
    attacks: [
      {
        id: 'swipe', kind: 'melee', range: 1.3, windup: 0.4, recover: 0.6, damageMult: 1,
        arcDeg: 110, knockback: 4, cooldown: 1.2,
      },
      {
        id: 'pounce', kind: 'charge', range: 10, minRange: 4, windup: 0.5, recover: 0.8,
        damageMult: 1.5, knockback: 8, cooldown: 6, speed: 14, duration: 0.6,
      },
    ],
    xp: 120, carcassGrowth: 40,
  },
  {
    // The Wolf's body in a white coat: a pack of three on the snow.
    ...rival('wolf', 'default', {
      id: 'arctic_wolf', name: 'Arctic Wolf',
      baseStats: {
        maxHealth: 90, stamina: 100, staminaRegen: 10, damage: 11, moveSpeed: 2.8, sprintSpeed: 7.0,
        attackSpeed: 1, defense: 4, size: 1,
      },
      behavior: { ...stands, aggroRadius: 13, leashRadius: 42, wanderRadius: 16 },
      attacks: [
        {
          id: 'bite', kind: 'melee', range: 1.0, windup: 0.35, recover: 0.55, damageMult: 1,
          arcDeg: 100, knockback: 3, cooldown: 1.1,
        },
        {
          id: 'lunge', kind: 'charge', range: 9, minRange: 4, windup: 0.5, recover: 0.8,
          damageMult: 1.3, knockback: 5, cooldown: 6, speed: 13, duration: 0.55,
        },
      ],
      xp: 70, carcassGrowth: 30,
    }),
    colors: { body: 0xe9edf0, belly: 0xffffff, accent: 0x9aa3ab },
  },
  {
    // A white owl of the pines that goes after an Eagle in the air (the user: "to pester players, eagles mostly"), and now and then
    // swoops on an animal on the ground beneath its tree for a peck. It flies slower than the Eagle, so an Eagle can always escape.
    id: 'snowy_owl', name: 'Snowy Owl', rig: 'winged',
    baseStats: {
      maxHealth: 60, stamina: 100, staminaRegen: 10, damage: 9, moveSpeed: 3.0, sprintSpeed: 6.0,
      attackSpeed: 1, defense: 2, size: 0.85,
    },
    body: getSpecies('eagle').body,
    colors: { body: 0xf3f5f7, belly: 0xffffff, accent: 0x3b3b40, head: 0xffffff, tail: 0xe9ecef },
    features: [],
    behavior: {
      ...stands, aggroRadius: 30, leashRadius: 40, wanderRadius: 0,
      flier: { perchHeight: 7, huntRange: 30, pesterRange: 10, flySpeed: 10, swoopSpeed: 13, homeRange: 40, pesterCooldown: 9 },
    },
    attacks: [
      {
        id: 'talons', kind: 'melee', range: 1.0, windup: 0.3, recover: 0.6, damageMult: 1,
        arcDeg: 90, knockback: 2, cooldown: 1.0,
      },
    ],
    xp: 40, carcassGrowth: 8,
  },
  {
    // It comes up from under the ice into the hole of a player or pet that has stayed in the freezing water for 5 s, bites while
    // they swim, and chases one on the ice near it for about 5 m before diving back (the user's idea, 2026-11-20; the chase and
    // the 5 s since their playtest, 2026-11-21). Two also come up in the mammoth's pool when it breaks during the fight. It
    // belongs to no zone: it never comes back by itself. It pays XP (the pool's pay none) and leaves no carcass (it sinks).
    id: 'leopard_seal', name: 'Leopard Seal', rig: 'seal',
    baseStats: {
      maxHealth: 160, stamina: 100, staminaRegen: 10, damage: 16, moveSpeed: 2.6, sprintSpeed: 5.0,
      attackSpeed: 1, defense: 6, size: 1,
    },
    // The seal rig reads the length of the whole seal, how thick it is, and the size of its head.
    body: {
      bodyLength: 2.6, bodyHeight: 0.8, bodyWidth: 0.8, legLength: 0.1, legThickness: 0.1,
      neckLength: 0.1, neckAngle: 0, headSize: 0.5, snoutLength: 0.3,
      ears: 'round', earSize: 0.01, tail: 'stub', tailLength: 0.1, chestBulk: 1,
    },
    colors: { body: 0x7d848c, belly: 0xd8dde2, accent: 0x2b2f34 },
    features: [],
    behavior: { ...stands, aggroRadius: 6, leashRadius: 6, wanderRadius: 0, holeBound: true },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 0.9, windup: 0.3, recover: 0.6, damageMult: 1,
        arcDeg: 90, knockback: 1.5, cooldown: 1.3,
      },
    ],
    xp: 110, carcassGrowth: 0,
  },
  rival('bear', 'polar', {
    // Heavy hunters of the ice: they walk it, and break it when they stop to fight.
    id: 'polar_bear', name: 'Polar Bear',
    baseStats: {
      maxHealth: 190, stamina: 100, staminaRegen: 10, damage: 15, moveSpeed: 2.4, sprintSpeed: 6.6,
      attackSpeed: 1, defense: 9, size: 1,
    },
    behavior: { ...stands, aggroRadius: 12, leashRadius: 38, wanderRadius: 14 },
    attacks: [
      {
        id: 'swipe', kind: 'melee', range: 1.5, windup: 0.7, recover: 0.9, damageMult: 1.3,
        arcDeg: 120, knockback: 8, cooldown: 2.0,
      },
      {
        id: 'slam', kind: 'aoe', range: 2.0, radius: 4.5, windup: 0.9, recover: 1.1,
        damageMult: 1.1, knockback: 7, cooldown: 9,
      },
    ],
    xp: 90, carcassGrowth: 40,
  }),
);

// The Jungle's snakes: a few of them lie about in the undergrowth, and a nest of bigger, darker ones guards the cave
// next to the boss's arena. They are slow to chase, quick to strike, and they strike from a rearing start.
const snakeStats = { staminaRegen: 10, stamina: 100, attackSpeed: 1 };
list.push(
  {
    id: 'snake', name: 'Snake', rig: 'serpent',
    baseStats: { ...snakeStats, maxHealth: 48, damage: 9, moveSpeed: 1.8, sprintSpeed: 5.6, defense: 1, size: 1 },
    // bodyLength is the length of the whole snake, bodyWidth how thick it is, headSize how wide its head is.
    body: {
      bodyLength: 1.9, bodyHeight: 0.12, bodyWidth: 0.12, legLength: 0, legThickness: 0,
      neckLength: 0, neckAngle: 0, headSize: 0.14, snoutLength: 0, ears: 'none', earSize: 0, tail: 'thin', tailLength: 0, chestBulk: 1,
    },
    colors: { body: 0xb89a3c, belly: 0xf0e6b4, accent: 0x4d3318 },
    features: [],
    behavior: {
      aggroRadius: 6, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
      leashRadius: 22, wanderRadius: 8, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
      woundedSpeedMult: 1,
    },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 0.9, windup: 0.32, recover: 0.6, damageMult: 1,
        arcDeg: 90, knockback: 1, cooldown: 1.2,
      },
      {
        id: 'strike', kind: 'charge', range: 5, minRange: 2, windup: 0.5, recover: 0.9,
        damageMult: 1.4, knockback: 3, cooldown: 4.5, speed: 11, duration: 0.35,
      },
    ],
    xp: 18, carcassGrowth: 10,
  },
  {
    // The nest's snakes: darker, longer and thicker, with pale bands, and they hit harder.
    id: 'cave_snake', name: 'Cave Snake', rig: 'serpent',
    baseStats: { ...snakeStats, maxHealth: 66, damage: 10, moveSpeed: 1.9, sprintSpeed: 5.8, defense: 4, size: 1.35 },
    body: {
      bodyLength: 2.3, bodyHeight: 0.16, bodyWidth: 0.16, legLength: 0, legThickness: 0,
      neckLength: 0, neckAngle: 0, headSize: 0.19, snoutLength: 0, ears: 'none', earSize: 0, tail: 'thin', tailLength: 0, chestBulk: 1,
    },
    colors: { body: 0x2b2733, belly: 0xcfc8dd, accent: 0xb9aedd },
    features: [],
    behavior: {
      aggroRadius: 7, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
      leashRadius: 24, wanderRadius: 4, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
      woundedSpeedMult: 1,
    },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 1.1, windup: 0.34, recover: 0.6, damageMult: 1.1,
        arcDeg: 90, knockback: 2, cooldown: 1.3,
      },
      {
        id: 'strike', kind: 'charge', range: 6, minRange: 2.2, windup: 0.5, recover: 0.9,
        damageMult: 1.6, knockback: 4, cooldown: 4.5, speed: 12, duration: 0.35,
      },
    ],
    xp: 40, carcassGrowth: 22,
  },
);

// The Jungle's rivals: a tiger, alone in its territory, and a crocodile that lives in the river.
list.push(
  rival('tiger', 'default', {
    // Fast claws and a long pounce.
    id: 'rival_tiger', name: 'Tiger',
    baseStats: {
      maxHealth: 95, stamina: 100, staminaRegen: 10, damage: 12, moveSpeed: 2.8, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 5, size: 1,
    },
    behavior: { ...stands, aggroRadius: 13, leashRadius: 42, wanderRadius: 15 },
    attacks: [
      {
        id: 'claw', kind: 'melee', range: 1.3, windup: 0.4, recover: 0.6, damageMult: 1,
        arcDeg: 130, knockback: 6, cooldown: 1.4,
      },
      {
        id: 'pounce', kind: 'charge', range: 10, minRange: 5, windup: 0.6, recover: 0.9,
        damageMult: 1.6, knockback: 9, cooldown: 6.5, speed: 15, duration: 0.55,
      },
    ],
    xp: 45, carcassGrowth: 26,
  }),
  rival('crocodile', 'default', {
    // Slow and armoured. It wanders in the water, bites hard, and sweeps its tail at anything close.
    id: 'rival_crocodile', name: 'Crocodile',
    baseStats: {
      maxHealth: 130, stamina: 100, staminaRegen: 10, damage: 12, moveSpeed: 2.2, sprintSpeed: 6.4,
      attackSpeed: 1, defense: 9, size: 1,
    },
    behavior: { ...stands, aggroRadius: 10, leashRadius: 34, wanderRadius: 10, aquatic: true },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 1.4, windup: 0.5, recover: 0.8, damageMult: 1.2,
        arcDeg: 110, knockback: 5, cooldown: 1.7,
      },
      {
        id: 'tail_sweep', kind: 'aoe', range: 1.8, radius: 4, windup: 0.8, recover: 1.0,
        damageMult: 1.0, knockback: 8, cooldown: 8,
      },
      {
        id: 'lunge', kind: 'charge', range: 8, minRange: 4, windup: 0.55, recover: 0.9,
        damageMult: 1.5, knockback: 7, cooldown: 7, speed: 13, duration: 0.5,
      },
    ],
    xp: 55, carcassGrowth: 32,
  }),
);

// The Plains' animals (Milestone 3, levels about 16 to 23, for Alphas). Every number is a first guess.
list.push(
  {
    // Prey that is harder to catch than any before (the user asked, 2026-11-18): faster than the deer, quick even when tired, and it
    // recovers sooner. A sprint costs a hunter stamina (14 a second), so a hunter can only sprint for about 6 to 8 seconds: in that
    // time only the Wolf, the Tiger and the Lion gain enough on it to bite (a test counts the metres); the Bear, the Crocodile and
    // the Elephant must corner it against a lake or a rock, or come at it from behind, where it notices a hunter late. Every bite
    // slows it.
    id: 'antelope', name: 'Antelope',
    baseStats: {
      maxHealth: 60, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 3.0, sprintSpeed: 8.6,
      attackSpeed: 1, defense: 0, size: 1,
    },
    body: {
      bodyLength: 1.25, bodyHeight: 0.44, bodyWidth: 0.3, legLength: 0.95, legThickness: 0.065,
      neckLength: 0.55, neckAngle: 1.0, headSize: 0.22, snoutLength: 0.2,
      ears: 'long', earSize: 0.12, tail: 'thin', tailLength: 0.3, chestBulk: 1.0,
    },
    colors: { body: 0xc58b4e, belly: 0xf3e7cf, accent: 0x3a2a1c },
    features: ['horns', 'tailTipDark'],
    behavior: {
      aggroRadius: 14, aggressive: false, fleeOnSight: true, fleeHealthPct: 1,
      leashRadius: 70, wanderRadius: 18, fleeBurst: 3.5, windedSeconds: 3, windedSpeedMult: 0.7,
      woundedSpeedMult: 0.7,
      senses: { front: 1.4 },
    },
    attacks: [],
    xp: 30, carcassGrowth: 22,
  },
  {
    // Fighter: a heavy, thick-skinned grazer with a hump and wide horns. Attacks on sight, charges from range, never runs.
    id: 'buffalo', name: 'Buffalo',
    baseStats: {
      maxHealth: 150, stamina: 100, staminaRegen: 10, damage: 11, moveSpeed: 2.4, sprintSpeed: 6.8,
      attackSpeed: 1, defense: 8, size: 1.1,
    },
    body: {
      bodyLength: 1.5, bodyHeight: 0.75, bodyWidth: 0.62, legLength: 0.55, legThickness: 0.12,
      neckLength: 0.22, neckAngle: 0.15, headSize: 0.4, snoutLength: 0.3,
      ears: 'pointed', earSize: 0.09, tail: 'tuft', tailLength: 0.6, chestBulk: 1.3,
    },
    colors: { body: 0x3a2f28, belly: 0x4a3c33, accent: 0x1f1814 },
    features: ['hump', 'bullHorns'],
    behavior: {
      aggroRadius: 11, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
      leashRadius: 40, wanderRadius: 12, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
      woundedSpeedMult: 1,
    },
    attacks: [
      {
        id: 'gore', kind: 'melee', range: 1.2, windup: 0.5, recover: 0.8, damageMult: 1,
        arcDeg: 110, knockback: 7, cooldown: 1.6,
      },
      {
        id: 'charge', kind: 'charge', range: 14, minRange: 5, windup: 0.8, recover: 1.1,
        damageMult: 1.7, knockback: 11, cooldown: 7, speed: 12.5, duration: 0.9,
      },
    ],
    xp: 55, carcassGrowth: 34,
  },
  {
    // A pack animal: quick bites and a short lunge, with a sloping back, spots and a dark ridge down the neck. Lives in threes
    // and fours, guards the hyena's den, and answers the Matriarch's call.
    id: 'hyena', name: 'Hyena',
    baseStats: {
      maxHealth: 80, stamina: 100, staminaRegen: 10, damage: 9, moveSpeed: 3.0, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 3, size: 1,
    },
    body: {
      bodyLength: 1.15, bodyHeight: 0.5, bodyWidth: 0.38, legLength: 0.55, legThickness: 0.085,
      neckLength: 0.32, neckAngle: 0.6, headSize: 0.34, snoutLength: 0.26,
      ears: 'round', earSize: 0.12, tail: 'thin', tailLength: 0.35, chestBulk: 1.2,
    },
    colors: { body: 0xb89a62, belly: 0xd9c79c, accent: 0x4a3a22 },
    features: ['slope', 'spots', 'ridge', 'tailTipDark'],
    behavior: { ...stands, aggroRadius: 13, leashRadius: 40, wanderRadius: 16 },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 1.0, windup: 0.3, recover: 0.5, damageMult: 1.1,
        arcDeg: 90, knockback: 3, cooldown: 1.0,
      },
      {
        id: 'lunge', kind: 'charge', range: 9, minRange: 4, windup: 0.5, recover: 0.8,
        damageMult: 1.4, knockback: 5, cooldown: 6, speed: 12, duration: 0.5,
      },
    ],
    xp: 40, carcassGrowth: 26,
  },
);

// The lion's den and the Plains' rivals and lake animals, built like the playable species they look like.
list.push(
  rival('lion', 'default', {
    // A guard of the lion's den: tougher than a wild lion, with a long pounce.
    id: 'den_lion', name: 'Lion',
    baseStats: {
      maxHealth: 135, stamina: 100, staminaRegen: 10, damage: 13, moveSpeed: 2.8, sprintSpeed: 7.0,
      attackSpeed: 1, defense: 9, size: 1.1,
    },
    behavior: { ...stands, aggroRadius: 13, leashRadius: 36, wanderRadius: 5 },
    attacks: [
      {
        id: 'claw', kind: 'melee', range: 1.4, windup: 0.4, recover: 0.65, damageMult: 1,
        arcDeg: 130, knockback: 7, cooldown: 1.4,
      },
      {
        id: 'pounce', kind: 'charge', range: 11, minRange: 5, windup: 0.6, recover: 0.9,
        damageMult: 1.7, knockback: 10, cooldown: 6.5, speed: 15, duration: 0.6,
      },
    ],
    xp: 90, carcassGrowth: 36,
  }),
  rival('elephant', 'default', {
    // Slow and huge: a trunk whip, a stomp that reaches all round it, and a charge from range.
    id: 'rival_elephant', name: 'Elephant',
    baseStats: {
      maxHealth: 200, stamina: 100, staminaRegen: 10, damage: 15, moveSpeed: 2.4, sprintSpeed: 6.4,
      attackSpeed: 1, defense: 12, size: 1,
    },
    behavior: { ...stands, aggroRadius: 11, leashRadius: 40, wanderRadius: 14 },
    attacks: [
      {
        id: 'trunk_whip', kind: 'melee', range: 2.4, windup: 0.6, recover: 0.9, damageMult: 1,
        arcDeg: 140, knockback: 10, cooldown: 1.8,
      },
      {
        id: 'stomp', kind: 'aoe', range: 2.4, radius: 5, windup: 0.9, recover: 1.1,
        damageMult: 1.2, knockback: 10, cooldown: 8,
      },
      {
        id: 'charge', kind: 'charge', range: 12, minRange: 5, windup: 0.8, recover: 1.0,
        damageMult: 1.6, knockback: 12, cooldown: 8, speed: 13, duration: 0.8,
      },
    ],
    xp: 110, carcassGrowth: 50,
  }),
  rival('crocodile', 'alligator', {
    // The lakes' animal: it never leaves its lake and a strip of shore (`waterBound`), and attacks anyone in the water or on
    // that shore. Not a rival of any species, so every animal meets it.
    id: 'alligator', name: 'Alligator',
    baseStats: {
      maxHealth: 140, stamina: 100, staminaRegen: 10, damage: 13, moveSpeed: 2.2, sprintSpeed: 6.4,
      attackSpeed: 1, defense: 10, size: 1,
    },
    behavior: { ...stands, aggroRadius: 11, leashRadius: 30, wanderRadius: 9, aquatic: true, waterBound: 8 },
    attacks: [
      {
        id: 'bite', kind: 'melee', range: 1.4, windup: 0.5, recover: 0.8, damageMult: 1.2,
        arcDeg: 110, knockback: 5, cooldown: 1.7,
      },
      {
        id: 'tail_sweep', kind: 'aoe', range: 1.8, radius: 4, windup: 0.8, recover: 1.0,
        damageMult: 1.0, knockback: 8, cooldown: 8,
      },
      {
        id: 'lunge', kind: 'charge', range: 8, minRange: 4, windup: 0.55, recover: 0.9,
        damageMult: 1.5, knockback: 7, cooldown: 7, speed: 13, duration: 0.5,
      },
    ],
    xp: 85, carcassGrowth: 40,
  }),
);

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));

export function getEnemy(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}
