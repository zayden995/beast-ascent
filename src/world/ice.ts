import * as THREE from 'three';
import { mulberry32 } from '../core/math.ts';
import type { WaterBody } from '../core/types.ts';
import { surfaceOf } from '../logic/heightfield.ts';
import type { IceSheet, IceTuning } from '../logic/ice.ts';

const ICE = new THREE.Color(0xd4e9f2);
const WORN = new THREE.Color(0xa9c6d6);
const CRACK = 0x3f6075;

/**
 * The picture of Winter's ice. The lake's circles are drawn as ice whose colour and holes come from a texture with one texel per
 * square of the `IceSheet`: worn squares turn a greyer blue, holes are cut out (the dark water below shows through), and each square
 * that cracks gets a few jagged dark lines, which go when it heals or freezes over.
 */
export class IceView {
  readonly group = new THREE.Group();
  private readonly sheet: IceSheet;
  private readonly t: IceTuning;
  private readonly data: Uint8Array;
  private readonly texture: THREE.DataTexture;
  private readonly cracks = new Map<number, THREE.LineSegments>();
  private readonly crackMaterial = new THREE.LineBasicMaterial({ color: CRACK });
  private seen = -1;
  private readonly bodies: readonly WaterBody[];
  private readonly waterY: number;

  constructor(sheet: IceSheet, bodies: readonly WaterBody[], waterY: number, t: IceTuning, waterColor: number) {
    this.sheet = sheet;
    this.t = t;
    this.bodies = bodies;
    this.waterY = waterY;
    this.data = new Uint8Array(sheet.cols * sheet.rows * 4);
    this.texture = new THREE.DataTexture(this.data, sheet.cols, sheet.rows, THREE.RGBAFormat);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const ice = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5 });
    const water = new THREE.MeshLambertMaterial({ color: new THREE.Color(waterColor).multiplyScalar(0.45) });
    const w = sheet.cols * sheet.cell;
    const d = sheet.rows * sheet.cell;
    for (const b of bodies) {
      // The ice: a circle whose texture coordinates are its place on the grid of squares.
      const geo = new THREE.CircleGeometry(b.radius, 72);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (b.x + pos.getX(i) - sheet.minX) / w, (b.z + pos.getZ(i) - sheet.minZ) / d);
      }
      const mesh = new THREE.Mesh(geo, ice);
      const surface = surfaceOf(b, waterY);
      mesh.position.set(b.x, surface + t.iceThickness, b.z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      // Dark water under it, seen through a hole.
      const under = new THREE.Mesh(geo.clone(), water);
      under.position.set(b.x, surface - 0.05, b.z);
      this.group.add(under);
    }
    // The texture's rows run along z, and a plane's v runs the same way here (set above), so no flip is needed.
    this.texture.flipY = false;
    this.refresh();
  }

  /** Redraws whatever changed since the last call. */
  update(): void {
    if (this.sheet.version === this.seen) return;
    this.refresh();
  }

  private refresh(): void {
    const s = this.sheet;
    const c = new THREE.Color();
    for (let k = 0; k < s.wear.length; k++) {
      const o = k * 4;
      if (!s.lake[k] || s.hole[k]) {
        this.data[o + 3] = 0;
      } else {
        c.copy(ICE).lerp(WORN, Math.min(1, s.wear[k] / this.t.crackAt) * 0.6);
        this.data[o] = Math.round(c.r * 255);
        this.data[o + 1] = Math.round(c.g * 255);
        this.data[o + 2] = Math.round(c.b * 255);
        this.data[o + 3] = 255;
      }
      const cracked = !!s.lake[k] && !s.hole[k] && s.wear[k] >= this.t.crackAt;
      const lines = this.cracks.get(k);
      if (cracked && !lines) this.addCracks(k);
      if (!cracked && lines) {
        this.group.remove(lines);
        lines.geometry.dispose();
        this.cracks.delete(k);
      }
    }
    this.texture.needsUpdate = true;
    this.seen = s.version;
  }

  /** A few jagged dark lines across a square, the same every time for the same square. */
  private addCracks(k: number): void {
    const s = this.sheet;
    const i = k % s.cols;
    const j = (k - i) / s.cols;
    const x0 = s.minX + i * s.cell;
    const z0 = s.minZ + j * s.cell;
    const rand = mulberry32(k * 7919 + 13);
    // The cracks lie on the ice of whichever body this square belongs to.
    const cx = x0 + s.cell / 2;
    const cz = z0 + s.cell / 2;
    const body = this.bodies.find((b) => Math.hypot(cx - b.x, cz - b.z) < b.radius) ?? this.bodies[0];
    const y = surfaceOf(body, this.waterY) + this.t.iceThickness + 0.02;
    const points: number[] = [];
    for (let line = 0; line < 3; line++) {
      let x = x0 + rand() * s.cell;
      let z = z0 + rand() * s.cell;
      const a = rand() * Math.PI * 2;
      for (let seg = 0; seg < 4; seg++) {
        const turn = a + (rand() - 0.5) * 1.2;
        const nx = Math.min(x0 + s.cell, Math.max(x0, x + Math.cos(turn) * 0.45));
        const nz = Math.min(z0 + s.cell, Math.max(z0, z + Math.sin(turn) * 0.45));
        points.push(x, y, z, nx, y, nz);
        x = nx;
        z = nz;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geo, this.crackMaterial);
    this.cracks.set(k, lines);
    this.group.add(lines);
  }

  dispose(): void {
    this.texture.dispose();
    this.crackMaterial.dispose();
    for (const lines of this.cracks.values()) lines.geometry.dispose();
  }
}
