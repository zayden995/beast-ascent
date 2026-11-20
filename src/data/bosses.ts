import type { BossDef } from '../core/types.ts';
import { getEnemy } from './enemies.ts';

// Biome bosses. Boss stats are final values at the boss's level (no per-level scaling).
// TODO(M5): boss phases.

const list: BossDef[] = [
  {
    id: 'ancient_stag', biome: 'forest', title: 'Ancient Stag, Lord of the Forest', level: 10, repeatXp: 50,
    enemy: {
      id: 'ancient_stag', name: 'Ancient Stag',
      baseStats: {
        maxHealth: 900, stamina: 100, staminaRegen: 10, damage: 24, moveSpeed: 3.2, sprintSpeed: 7.4,
        attackSpeed: 1, defense: 8, size: 2.3,
      },
      body: {
        bodyLength: 1.25, bodyHeight: 0.52, bodyWidth: 0.4, legLength: 0.85, legThickness: 0.085,
        neckLength: 0.55, neckAngle: 1.0, headSize: 0.25, snoutLength: 0.22,
        ears: 'long', earSize: 0.13, tail: 'stub', tailLength: 0.12, chestBulk: 1.25,
      },
      colors: { body: 0x5c4838, belly: 0xcbbfa3, accent: 0xe9e2c8 },
      features: ['antlers', 'ruff', 'scar', 'tailTipLight'],
      behavior: {
        aggroRadius: 18, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
        leashRadius: 22, wanderRadius: 6, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
        woundedSpeedMult: 1,
      },
      attacks: [
        {
          id: 'antler_swing', kind: 'melee', range: 1.8, windup: 0.7, recover: 0.9, damageMult: 1,
          arcDeg: 140, knockback: 9, cooldown: 2.0,
        },
        {
          id: 'charge', kind: 'charge', range: 30, minRange: 8, windup: 1.0, recover: 1.4,
          damageMult: 1.7, knockback: 14, cooldown: 8, speed: 17, duration: 1.1,
        },
        {
          id: 'stomp', kind: 'aoe', range: 2.5, radius: 6, windup: 0.9, recover: 1.0,
          damageMult: 1.2, knockback: 8, cooldown: 11,
        },
      ],
      xp: 300, carcassGrowth: 60,
    },
  },
  {
    // The Jungle's boss: a giant silverback. Wide fist swings, a ground pound that reaches far, and a charge.
    id: 'silverback', biome: 'jungle', title: 'Great Silverback, Lord of the Jungle', level: 20, repeatXp: 80,
    enemy: {
      id: 'silverback', name: 'Great Silverback',
      baseStats: {
        maxHealth: 2000, stamina: 100, staminaRegen: 10, damage: 46, moveSpeed: 3.0, sprintSpeed: 7.2,
        attackSpeed: 1, defense: 12, size: 2.3,
      },
      // A gorilla: long arms and a high, heavy shoulder mound, short hind legs, a head sunk between the shoulders
      // with a flat dark face, a heavy brow and a crest, no tail, and a silver saddle over the back.
      body: {
        bodyLength: 1.2, bodyHeight: 0.7, bodyWidth: 0.64, legLength: 0.5, legThickness: 0.15,
        neckLength: 0.2, neckAngle: 0.3, headSize: 0.46, snoutLength: 0.05,
        ears: 'round', earSize: 0.045, tail: 'stub', tailLength: 0.02, chestBulk: 1.25,
      },
      colors: { body: 0x3b3b43, belly: 0x3d3d45, accent: 0x18181b, saddle: 0xc3c8d2 },
      features: ['knuckle', 'brow', 'saddle', 'scar'],
      behavior: {
        aggroRadius: 18, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
        leashRadius: 22, wanderRadius: 6, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
        woundedSpeedMult: 1,
      },
      attacks: [
        {
          id: 'fist_swing', kind: 'melee', range: 2.0, windup: 0.65, recover: 0.85, damageMult: 1,
          arcDeg: 150, knockback: 10, cooldown: 1.9,
        },
        {
          id: 'charge', kind: 'charge', range: 28, minRange: 8, windup: 0.9, recover: 1.3,
          damageMult: 1.6, knockback: 14, cooldown: 9, speed: 16, duration: 1.0,
        },
        {
          id: 'ground_pound', kind: 'aoe', range: 3, radius: 7, windup: 1.0, recover: 1.0,
          damageMult: 1.25, knockback: 10, cooldown: 8,
        },
      ],
      xp: 700, carcassGrowth: 80,
    },
  },
  {
    // The Plains' boss: a hyena pack leader. She bites, lunges and rakes the ground round her, and she calls a pack of 3 hyenas
    // when the fight starts and another 3 six seconds after the last of a pack has died (`summon`, rule in logic/summon.ts).
    id: 'hyena_matriarch', biome: 'plains', title: 'Hyena Matriarch, Queen of the Plains', level: 30, repeatXp: 120,
    summon: { enemyId: 'hyena', count: 3, waitSeconds: 6, levelMin: 19, levelMax: 21, text: 'The Matriarch whoops, and her pack answers!' },
    enemy: {
      id: 'hyena_matriarch', name: 'Hyena Matriarch',
      baseStats: {
        maxHealth: 3500, stamina: 100, staminaRegen: 10, damage: 58, moveSpeed: 3.2, sprintSpeed: 7.2,
        attackSpeed: 1, defense: 14, size: 2.2,
      },
      body: getEnemy('hyena').body,
      colors: { body: 0x8f7240, belly: 0xc9b27d, accent: 0x2e2314 },
      features: ['slope', 'spots', 'ridge', 'scar'],
      behavior: {
        aggroRadius: 18, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
        leashRadius: 22, wanderRadius: 6, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
        woundedSpeedMult: 1,
      },
      attacks: [
        {
          id: 'bite', kind: 'melee', range: 1.7, windup: 0.5, recover: 0.8, damageMult: 1,
          arcDeg: 110, knockback: 8, cooldown: 1.7,
        },
        {
          id: 'lunge', kind: 'charge', range: 26, minRange: 7, windup: 0.8, recover: 1.2,
          damageMult: 1.6, knockback: 13, cooldown: 7, speed: 16, duration: 1.0,
        },
        {
          id: 'rake', kind: 'aoe', range: 3, radius: 6, windup: 0.9, recover: 1.0,
          damageMult: 1.2, knockback: 9, cooldown: 10,
        },
      ],
      xp: 1100, carcassGrowth: 100,
    },
  },
  {
    // Winter's boss, on the peak of the mountain: a woolly mammoth, with long curved tusks, a shaggy coat and a hump. A tusk sweep,
    // a trunk slam, a short charge, and its ice shockwave: it rears and stamps, and a ring spreads across the frozen pool on the
    // peak, wearing the ice it crosses, so the floor breaks up as the fight goes on (the user's idea, 2026-11-20). No helpers.
    id: 'woolly_mammoth', biome: 'winter', title: 'Woolly Mammoth, Lord of Winter', level: 40, repeatXp: 100,
    enemy: {
      id: 'woolly_mammoth', name: 'Woolly Mammoth',
      baseStats: {
        maxHealth: 5000, stamina: 100, staminaRegen: 10, damage: 70, moveSpeed: 2.6, sprintSpeed: 6.6,
        attackSpeed: 1, defense: 18, size: 1.6,
      },
      body: {
        bodyLength: 2.6, bodyHeight: 1.7, bodyWidth: 1.35, legLength: 1.4, legThickness: 0.4,
        neckLength: 0.3, neckAngle: 0.3, headSize: 1.0, snoutLength: 0.12,
        ears: 'round', earSize: 0.3, tail: 'tuft', tailLength: 0.7, chestBulk: 1.1,
      },
      colors: { body: 0x6b4a32, belly: 0x5a3e2a, accent: 0x4a3322 },
      features: ['trunk', 'longTusks', 'shaggy', 'hump', 'scar'],
      behavior: {
        aggroRadius: 18, aggressive: true, fleeOnSight: false, fleeHealthPct: 0,
        leashRadius: 18, wanderRadius: 5, fleeBurst: 0, windedSeconds: 0, windedSpeedMult: 1,
        woundedSpeedMult: 1,
      },
      attacks: [
        {
          id: 'tusk_sweep', kind: 'melee', range: 3.2, windup: 0.75, recover: 0.9, damageMult: 1,
          arcDeg: 150, knockback: 9, cooldown: 2.0,
        },
        {
          id: 'trunk_slam', kind: 'aoe', range: 3.2, radius: 5, windup: 0.9, recover: 1.0,
          damageMult: 1.2, knockback: 8, cooldown: 7,
        },
        {
          // The ice shockwave: a ring that crosses the pool and stops at the rim. A jump or a dodge lets it pass.
          id: 'ice_shockwave', kind: 'wave', range: 9, radius: 13, windup: 1.2, recover: 1.2, damageMult: 0.5,
          knockback: 3, cooldown: 8, waveSpeed: 8, waveWidth: 1.5, iceWear: 0.5,
        },
        {
          // Short: the peak is 32 m across inside its rim.
          id: 'charge', kind: 'charge', range: 16, minRange: 6, windup: 1.0, recover: 1.3,
          damageMult: 1.6, knockback: 9, cooldown: 9, speed: 14, duration: 0.9,
        },
      ],
      xp: 1500, carcassGrowth: 120,
    },
  },
];

export const BOSSES: Record<string, BossDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function getBoss(id: string): BossDef {
  const def = BOSSES[id];
  if (!def) throw new Error(`Unknown boss: ${id}`);
  return def;
}
