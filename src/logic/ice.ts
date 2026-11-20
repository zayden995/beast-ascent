// Winter's ice: it wears under an animal that stands on it, cracks, breaks into a hole, heals and freezes over again.
// Pure logic over a grid of squares, no three.js.

export interface IceTuning {
  /** The ice is kept as squares of this size (metres). */
  cellSize: number;
  /** Below this speed (m/s) an animal wears the ice under it: standing, fighting, turning. Walking or running never does. */
  slowSpeed: number;
  /** How long an animal of weight 1 (an Adult of a middling animal) takes to break a square. */
  breakSeconds: number;
  /** Cracks show from this share of wear. */
  crackAt: number;
  /** Wear fades away over this many seconds once nothing adds to it. */
  healSeconds: number;
  /** A hole with nobody in it freezes over after this many seconds. */
  refreezeSeconds: number;
  /** A break opens the animal's circle plus this much. */
  holeMargin: number;
  /** Share of its max health an animal loses each second in the freezing water. */
  coldPctPerSecond: number;
  /** How far the top of the ice stands above the water. */
  iceThickness: number;
  /** The radius of an animal of weight 1. */
  refRadius: number;
  /** A leopard seal comes up for a player or pet that has been in the freezing water this long. */
  sealAfterSeconds: number;
  /** It sinks away once its hole has been empty this long. */
  sealLeaveSeconds: number;
}

export type IceState = 'ice' | 'cracked' | 'hole';

/** An animal on (or in) the ice this step. */
export interface IceStander {
  x: number;
  z: number;
  radius: number;
  /** See `iceWeight`. */
  weight: number;
  /** Its speed over the ground (m/s). */
  speed: number;
  /** It wears nothing (flying, an injured pet lying down, the mammoth), though it still keeps a hole open. */
  exempt: boolean;
}

export interface IceEvent {
  kind: 'crack' | 'break' | 'refreeze';
  x: number;
  z: number;
  radius: number;
}

/** How heavily an animal of this collision radius bears on the ice: 1 for an Adult of a middling animal, 0.15 to 3. */
export function iceWeight(radius: number, t: IceTuning): number {
  return Math.min(3, Math.max(0.15, (radius / t.refRadius) ** 2));
}

/** How much of a square's life an animal wears away each second. */
export function wearRate(weight: number, speed: number, t: IceTuning): number {
  return speed >= t.slowSpeed ? 0 : weight / t.breakSeconds;
}

/** True when a player or pet has been in the freezing water long enough to bring a leopard seal up, and none is up yet. */
export function sealDue(coldSeconds: number, sealUp: boolean, t: IceTuning): boolean {
  return !sealUp && coldSeconds >= t.sealAfterSeconds;
}

/**
 * Whether a step may go from `fromHole` to `toHole` (each: is that spot a hole in the ice). A swimmer in a hole cannot walk out onto
 * the ice: it has to jump (the user's playtest, 2026-11-21). Anything not swimming (jumping, wading, walking) may step anywhere.
 */
export function holeStepAllowed(swimming: boolean, fromHole: boolean, toHole: boolean): boolean {
  return !(swimming && fromHole && !toHole);
}

/** A swimmer this close to the middle of the nearest whole ice square (or shore) is at the edge of its hole: an animal hops out. */
export const HOP_REACH = 1.8;

/** True once a seal's hole has been empty long enough for it to sink away. */
export function sealLeaves(emptySeconds: number, t: IceTuning): boolean {
  return emptySeconds >= t.sealLeaveSeconds;
}

/** The sheet of ice over a frozen lake (one or more overlapping circles), as a grid of squares. */
export class IceSheet {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  /** 1 where a square's middle lies on the lake. */
  readonly lake: Uint8Array;
  /** 0 to 1: how worn each square is (1 is broken). */
  readonly wear: Float32Array;
  /** 1 where the square is a hole. */
  readonly hole: Uint8Array;
  /** Bumped whenever anything that shows changes (for the picture of the ice). */
  version = 0;
  private readonly empty: Float32Array;
  private readonly t: IceTuning;

  constructor(bodies: readonly { x: number; z: number; radius: number }[], t: IceTuning) {
    this.t = t;
    this.cell = t.cellSize;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const b of bodies) {
      x0 = Math.min(x0, b.x - b.radius);
      z0 = Math.min(z0, b.z - b.radius);
      x1 = Math.max(x1, b.x + b.radius);
      z1 = Math.max(z1, b.z + b.radius);
    }
    // One square of shore all round, so that the edge of the lake is inside the grid.
    this.minX = Math.floor(x0 / this.cell) * this.cell - this.cell;
    this.minZ = Math.floor(z0 / this.cell) * this.cell - this.cell;
    this.cols = Math.ceil((x1 - this.minX) / this.cell) + 2;
    this.rows = Math.ceil((z1 - this.minZ) / this.cell) + 2;
    const n = this.cols * this.rows;
    this.lake = new Uint8Array(n);
    this.wear = new Float32Array(n);
    this.hole = new Uint8Array(n);
    this.empty = new Float32Array(n);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const cx = this.minX + (i + 0.5) * this.cell;
        const cz = this.minZ + (j + 0.5) * this.cell;
        if (bodies.some((b) => Math.hypot(cx - b.x, cz - b.z) < b.radius)) this.lake[j * this.cols + i] = 1;
      }
    }
  }

  /** The square a point lies in, or -1 outside the grid. */
  index(x: number, z: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }

  /** The ice at a point: whole, cracked or a hole, or null off the lake. */
  state(x: number, z: number): IceState | null {
    const k = this.index(x, z);
    if (k < 0 || !this.lake[k]) return null;
    if (this.hole[k]) return 'hole';
    return this.wear[k] >= this.t.crackAt ? 'cracked' : 'ice';
  }

  wearAt(x: number, z: number): number {
    const k = this.index(x, z);
    return k < 0 || !this.lake[k] ? 0 : this.wear[k];
  }

  /** How many squares are holes. */
  holes(): number {
    let n = 0;
    for (let k = 0; k < this.hole.length; k++) n += this.hole[k];
    return n;
  }

  /** The middles of the hole squares whose middles lie within `radius` of a point (the mammoth's pool, for its seals). */
  holeSpotsIn(x: number, z: number, radius: number): { x: number; z: number }[] {
    const spots: { x: number; z: number }[] = [];
    for (let k = 0; k < this.hole.length; k++) {
      if (!this.lake[k] || !this.hole[k]) continue;
      const c = this.centreOf(k);
      if (Math.hypot(c.x - x, c.z - z) <= radius) spots.push(c);
    }
    return spots;
  }

  /** The lake squares a circle covers: every square whose middle is inside it, and the square its middle is in. */
  private covered(x: number, z: number, radius: number, visit: (k: number) => void): void {
    const c = this.cell;
    const i0 = Math.floor((x - radius - this.minX) / c);
    const i1 = Math.floor((x + radius - this.minX) / c);
    const j0 = Math.floor((z - radius - this.minZ) / c);
    const j1 = Math.floor((z + radius - this.minZ) / c);
    const own = this.index(x, z);
    for (let j = Math.max(0, j0); j <= Math.min(this.rows - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(this.cols - 1, i1); i++) {
        const k = j * this.cols + i;
        if (!this.lake[k]) continue;
        const cx = this.minX + (i + 0.5) * c;
        const cz = this.minZ + (j + 0.5) * c;
        // A square counts once the circle reaches into it (its nearest point), so a circle on a line touches both sides.
        const nx = Math.max(cx - c / 2, Math.min(x, cx + c / 2));
        const nz = Math.max(cz - c / 2, Math.min(z, cz + c / 2));
        if (k === own || Math.hypot(nx - x, nz - z) < radius) visit(k);
      }
    }
  }

  private centreOf(k: number): { x: number; z: number } {
    const i = k % this.cols;
    const j = (k - i) / this.cols;
    return { x: this.minX + (i + 0.5) * this.cell, z: this.minZ + (j + 0.5) * this.cell };
  }

  /** Wears the given squares by `amount`; returns crack and break events (a break opens `holeRadius` round `x`, `z`). */
  private wearSquares(keys: number[], amount: number, x: number, z: number, holeRadius: number, events: IceEvent[]): void {
    let broke = false;
    for (const k of keys) {
      if (this.hole[k]) continue;
      const before = this.wear[k];
      this.wear[k] = Math.min(1, before + amount);
      if (before < this.t.crackAt && this.wear[k] >= this.t.crackAt) {
        const c = this.centreOf(k);
        events.push({ kind: 'crack', x: c.x, z: c.z, radius: this.cell / 2 });
        this.version++;
      }
      if (this.wear[k] >= 1) broke = true;
    }
    if (broke) this.breakAt(x, z, holeRadius, events);
  }

  private breakAt(x: number, z: number, radius: number, events: IceEvent[]): void {
    this.covered(x, z, radius, (k) => {
      this.hole[k] = 1;
      this.wear[k] = 1;
      this.empty[k] = 0;
    });
    events.push({ kind: 'break', x, z, radius });
    this.version++;
  }

  /** One step: wear under the standers, healing elsewhere, and holes freezing over once left empty. */
  step(standers: readonly IceStander[], dt: number): IceEvent[] {
    const events: IceEvent[] = [];
    const touched = new Uint8Array(this.wear.length);
    for (const s of standers) {
      const keys: number[] = [];
      this.covered(s.x, s.z, s.radius, (k) => keys.push(k));
      for (const k of keys) touched[k] = 1;
      const rate = s.exempt ? 0 : wearRate(s.weight, s.speed, this.t);
      if (rate > 0) this.wearSquares(keys, rate * dt, s.x, s.z, s.radius + this.t.holeMargin, events);
    }
    // A hole counts as in use while an animal is in it or within a few metres of it.
    const near = new Uint8Array(this.wear.length);
    for (const s of standers) this.covered(s.x, s.z, s.radius + 3, (k) => { near[k] = 1; });
    const heal = dt / this.t.healSeconds;
    for (let k = 0; k < this.wear.length; k++) {
      if (!this.lake[k]) continue;
      if (this.hole[k]) {
        this.empty[k] = near[k] ? 0 : this.empty[k] + dt;
        if (this.empty[k] >= this.t.refreezeSeconds) {
          this.hole[k] = 0;
          this.wear[k] = 0;
          this.empty[k] = 0;
          const c = this.centreOf(k);
          events.push({ kind: 'refreeze', x: c.x, z: c.z, radius: this.cell / 2 });
          this.version++;
        }
      } else if (!touched[k] && this.wear[k] > 0) {
        const before = this.wear[k];
        this.wear[k] = Math.max(0, before - heal);
        if (before >= this.t.crackAt && this.wear[k] < this.t.crackAt) this.version++;
      }
    }
    return events;
  }

  /** Wears every square in a circle by `amount` at once. */
  addWear(x: number, z: number, radius: number, amount: number): IceEvent[] {
    const events: IceEvent[] = [];
    const keys: number[] = [];
    this.covered(x, z, radius, (k) => keys.push(k));
    this.wearSquares(keys, amount, x, z, radius, events);
    return events;
  }

  /** Wears every square whose middle lies in the ring between `inner` and `outer` round a point (the mammoth's shockwave). */
  ringWear(x: number, z: number, inner: number, outer: number, amount: number): IceEvent[] {
    const events: IceEvent[] = [];
    this.covered(x, z, outer + this.cell, (k) => {
      if (this.hole[k]) return;
      const c = this.centreOf(k);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < inner || d > outer) return;
      const before = this.wear[k];
      this.wear[k] = Math.min(1, before + amount);
      if (before < this.t.crackAt && this.wear[k] >= this.t.crackAt) events.push({ kind: 'crack', x: c.x, z: c.z, radius: this.cell / 2 });
      if (this.wear[k] >= 1) {
        this.hole[k] = 1;
        this.empty[k] = 0;
        events.push({ kind: 'break', x: c.x, z: c.z, radius: this.cell / 2 });
      }
    });
    if (events.length) this.version++;
    return events;
  }

  /** The middle of the nearest square that is not a hole (whole ice, or the shore), within 12 m, or null. */
  nearestFooting(x: number, z: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = 12;
    const c = this.cell;
    const reach = Math.ceil(12 / c);
    const i0 = Math.floor((x - this.minX) / c);
    const j0 = Math.floor((z - this.minZ) / c);
    for (let j = j0 - reach; j <= j0 + reach; j++) {
      for (let i = i0 - reach; i <= i0 + reach; i++) {
        const cx = this.minX + (i + 0.5) * c;
        const cz = this.minZ + (j + 0.5) * c;
        const inside = i >= 0 && j >= 0 && i < this.cols && j < this.rows;
        if (inside && this.lake[j * this.cols + i] && this.hole[j * this.cols + i]) continue;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, z: cz };
        }
      }
    }
    return best;
  }
}
