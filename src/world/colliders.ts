interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Static circle colliders (trees, rocks, structures) in a uniform grid. */
export class ColliderGrid {
  private cells = new Map<number, Circle[]>();
  private cell = 8;
  /** Largest actor radius the grid supports without missing a neighbour cell. */
  private margin = 3;

  private key(ix: number, iz: number): number {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  add(x: number, z: number, r: number): void {
    const c: Circle = { x, z, r };
    const reach = r + this.margin;
    const x0 = Math.floor((x - reach) / this.cell);
    const x1 = Math.floor((x + reach) / this.cell);
    const z0 = Math.floor((z - reach) / this.cell);
    const z1 = Math.floor((z + reach) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(c);
      }
    }
  }

  /** Pushes a moving circle out of every collider it overlaps. */
  resolve(pos: { x: number; z: number }, radius: number): void {
    const list = this.cells.get(this.key(Math.floor(pos.x / this.cell), Math.floor(pos.z / this.cell)));
    if (!list) return;
    for (const c of list) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-5) {
        pos.x += min;
        continue;
      }
      const push = (min - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }

  blocked(x: number, z: number, radius: number): boolean {
    const list = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return false;
    return list.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + radius);
  }
}
