import type { BiomeId, BiomeModDef, ModStat, StatMod } from '../core/types.ts';

export const STAT_LABELS: Record<ModStat, string> = {
  maxHealth: 'Max Health',
  stamina: 'Stamina',
  staminaRegen: 'Stamina Regen',
  damage: 'Damage',
  moveSpeed: 'Move Speed',
  sprintSpeed: 'Sprint Speed',
  attackSpeed: 'Attack Speed',
  defense: 'Defense',
  size: 'Size',
  speed: 'Speed',
};

/** Every modifier a species has in this biome, whether or not its condition currently holds. */
export function biomeModsFor(mods: BiomeModDef[], biome: BiomeId): BiomeModDef[] {
  return mods.filter((m) => m.biome === biome);
}

/** Modifiers that apply right now. */
export function activeBiomeMods(
  mods: BiomeModDef[],
  biome: BiomeId,
  ctx: { nearWater: boolean },
): BiomeModDef[] {
  return biomeModsFor(mods, biome).filter((m) => m.condition !== 'nearWater' || ctx.nearWater);
}

export function toStatMods(mods: BiomeModDef[]): StatMod[] {
  return mods.map((m) => ({ stat: m.stat, pct: m.pct }));
}

/** "+20% Speed", "-15% Stamina Regen", "+25% Damage near water". */
export function describeMod(mod: Pick<BiomeModDef, 'stat' | 'pct' | 'condition'>): string {
  const sign = mod.pct >= 0 ? '+' : '-';
  const pct = Math.round(Math.abs(mod.pct) * 100);
  const cond = mod.condition === 'nearWater' ? ' near water' : '';
  return `${sign}${pct}% ${STAT_LABELS[mod.stat]}${cond}`;
}

export function favoredAndDisfavored(mods: BiomeModDef[]): { favored: BiomeModDef[]; disfavored: BiomeModDef[] } {
  return {
    favored: mods.filter((m) => m.pct > 0),
    disfavored: mods.filter((m) => m.pct < 0),
  };
}
