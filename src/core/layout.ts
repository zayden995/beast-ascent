// The shape of a biome's map, as data. Pure TypeScript: no three.js imports.
import type { RiverDef } from '../logic/river.ts';
import type { WaterBody } from './types.ts';

/** The ground before anything is built on it: big rolling hills plus small bumps. */
export interface TerrainDef {
  /** Height of the ground the hills roll around, in metres. */
  base: number;
  /** The big hills: how high they roll, how tightly they are packed, and how detailed they are. */
  rollHeight: number;
  rollScale: number;
  rollOctaves: number;
  /** The small bumps on top. */
  bumpHeight: number;
  bumpScale: number;
  bumpOctaves: number;
  /** Squares along one side of the ground mesh (more for a biome with cliffs and river banks). */
  segments: number;
  /** The steepest ground an animal can walk up, as rise over run. Left out: every slope can be walked. */
  maxClimbSlope?: number;
  /** Ground steeper than this is drawn as bare rock. Left out: slopes are never drawn as rock. */
  rockSlope?: number;
}

/** A hill with a flat top. One side can be a cliff: there the ground drops to the foot within a few metres. */
export interface HillDef {
  x: number;
  z: number;
  /** Height of the flat top, in metres. */
  top: number;
  /** The top is flat out to here; from here the hillside falls away to `footRadius`. */
  plateauRadius: number;
  footRadius: number;
  /** Small bumps on the top and the slopes. */
  bumpHeight: number;
  cliff?: {
    /** The cliff faces this way from the middle of the hill (0 = east, 90 = south, 180 = west, 270 = north). */
    towardDeg: number;
    /** It is a full cliff within this many degrees either side of that direction... */
    halfDeg: number;
    /** ...and eases back into an ordinary hillside over this many more degrees. */
    taperDeg: number;
    /** How far out from the edge of the top the cliff reaches the ground below, in metres. */
    width: number;
  };
}

/** A gate between biomes. `side` is the edge of the map it stands on; the way in from it points the other way. */
export interface GateDef {
  x: number;
  z: number;
  radius: number;
}

/** A cave: a chamber roofed with rock, with one mouth, and carcasses inside as bait. */
export interface CaveDef {
  /** The middle of the floor. */
  x: number;
  z: number;
  /** The radius of the floor an animal can walk on (the walls stand about a metre outside it). */
  radius: number;
  /** The mouth faces this way (0 = east, 90 = south, 180 = west, 270 = north). */
  mouthDeg: number;
  /** How many carcasses lie inside. */
  bait: number;
  /** A trail kept clear of trees leads from the mouth to the boss's arena (the Jungle's cave has one; the Plains' dens have none). */
  trail?: boolean;
  /** The colour of its rocks (the Plains' lion's den is pale stone, the hyena's dark earth). Left out: the biome's rock colour, darkened. */
  rockColor?: number;
}

export type BiomeStyle = 'forest' | 'jungle' | 'plains';

/** Everything that is placed on a biome's map. North is -Z. All positions are in metres. */
export interface BiomeLayout {
  seed: number;
  style: BiomeStyle;
  worldRadius: number;
  terrain: TerrainDef;
  /** Wild animals never enter `refugeRadius`, and ignore a player who is inside it. */
  den: { x: number; z: number; radius: number; refugeRadius: number };
  /** Where the animal wakes: at the start of a game and after a death. */
  playerSpawn: { x: number; z: number; yaw: number };
  /** Height of the water surface of every pond and river that does not name its own. */
  waterY: number;
  waters: WaterBody[];
  rivers: RiverDef[];
  hill?: HillDef;
  /** The stream that ends in a waterfall, and how far out from the cliff edge the water lands. */
  waterfall?: { river: string; run: number };
  arena: { x: number; z: number; radius: number };
  /** Caves: the Jungle's (next to the boss's arena) or the Plains' two dens. Left out: none. */
  caves?: CaveDef[];
  /** The gate onward to the next biome, at the north edge. It opens when the boss is beaten. */
  gate: GateDef;
  /** The gate back to the biome before this one, at the south edge. Always open. Left out in the first biome. */
  returnGate?: GateDef;
  trees: number;
  rocks: number;
  grassTufts: number;
  /** Fruit bushes for plant-eaters, at fixed spots. */
  berryBushes: [number, number][];
  /** Food reserves guarded by animals that stay calm until the reserve is raided. */
  foxReserves: { x: number; z: number }[];
  /** Leafy plants for herbivores to eat (`plantsAtDen` of them inside the den refuge). */
  plants: number;
  plantsAtDen: number;
  /** Distance from the shore of any water that still counts as "near water". */
  nearWaterMargin: number;
}
