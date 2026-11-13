import type { BossDef } from '../core/types.ts';

// Biome bosses. Boss stats are final values at the boss's level (no per-level scaling).
// TODO(M5): boss phases.

const list: BossDef[] = [
  {
    id: 'ancient_stag', biome: 'forest', title: 'Ancient Stag, Lord of the Forest', level: 10,
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
        leashRadius: 22, wanderRadius: 6, fleeBurst: 0, windedSpeedMult: 1,
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
];

export const BOSSES: Record<string, BossDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function getBoss(id: string): BossDef {
  const def = BOSSES[id];
  if (!def) throw new Error(`Unknown boss: ${id}`);
  return def;
}
