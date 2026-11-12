import type { EnemyDef } from '../core/types.ts';

// Wild animals. Base stats are level 1; health, damage and XP scale per level (see tuning.ts).

const list: EnemyDef[] = [
  {
    // Prey: runs on sight, never fights.
    id: 'deer', name: 'Deer',
    baseStats: {
      maxHealth: 50, stamina: 100, staminaRegen: 10, damage: 0, moveSpeed: 2.6, sprintSpeed: 8.6,
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
      aggroRadius: 13, aggressive: false, fleeOnSight: true, fleeHealthPct: 1,
      leashRadius: 60, wanderRadius: 16, fleeBurst: 5, windedSpeedMult: 0.62,
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
      leashRadius: 38, wanderRadius: 12, fleeBurst: 0, windedSpeedMult: 1,
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
      maxHealth: 38, stamina: 100, staminaRegen: 10, damage: 6, moveSpeed: 3.0, sprintSpeed: 9,
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
      leashRadius: 30, wanderRadius: 14, fleeBurst: 4, windedSpeedMult: 0.7,
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

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));

export function getEnemy(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}
