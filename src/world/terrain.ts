import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import { fbm2, smoothstep } from '../core/math.ts';
import type { BiomePalette } from '../core/types.ts';
import type { FOREST_LAYOUT } from '../data/biomes.ts';
import type { HeightFn } from '../logic/heightfield.ts';

/** Terrain mesh with vertex colours: grass, dirt at the den and arena, sand at the ponds, rock at the edge. */
export function buildTerrainMesh(heightAt: HeightFn, layout: typeof FOREST_LAYOUT, palette: BiomePalette): THREE.Mesh {
  const size = (layout.worldRadius + 34) * 2;
  const segments = 190;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(palette.ground);
  const grassAlt = new THREE.Color(palette.groundAlt);
  const dirt = new THREE.Color(palette.dirt);
  const rock = new THREE.Color(palette.rock);
  const sand = new THREE.Color(0xd8c690);
  const deep = new THREE.Color(0x6f8a6a);
  const c = new THREE.Color();
  const { arena, den, waters, waterY, gate, worldRadius } = layout;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    c.copy(grass).lerp(grassAlt, smoothstep(-0.3, 0.5, fbm2(x * 0.045, z * 0.045, 91, 2)));

    const dArena = Math.hypot(x - arena.x, z - arena.z);
    const dDen = Math.hypot(x - den.x, z - den.z);
    const dGate = Math.hypot(x - gate.x, z - gate.z);
    const path = Math.abs(x - gate.x) < 3.5 && z < arena.z && z > gate.z ? 1 : 0;
    const dirtAmount = Math.max(
      1 - smoothstep(arena.radius - 2, arena.radius + 2.5, dArena),
      (1 - smoothstep(den.radius - 4, den.radius, dDen)) * 0.9,
      (1 - smoothstep(gate.radius - 2, gate.radius + 2, dGate)) * 0.9,
      path * 0.8,
    );
    c.lerp(dirt, dirtAmount);

    // Sand around every pond, greener-grey in the deep water.
    for (const w of waters) {
      const dPond = Math.hypot(x - w.x, z - w.z);
      if (dPond < w.radius + 5) {
        c.lerp(sand, 1 - smoothstep(w.radius - 1, w.radius + 5, dPond));
        c.lerp(deep, smoothstep(0.2, 2.0, waterY - h));
      }
    }

    const r = Math.hypot(x, z);
    c.lerp(rock, smoothstep(worldRadius - 1, worldRadius + 9, r));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, toonMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}
