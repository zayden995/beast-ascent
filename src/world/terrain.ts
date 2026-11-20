import * as THREE from 'three';
import { toonMaterial } from '../animals/toon.ts';
import { fbm2, smoothstep } from '../core/math.ts';
import type { BiomeLayout } from '../core/layout.ts';
import type { BiomePalette } from '../core/types.ts';
import { TRAIL_HALF_WIDTH, caveTrail, distanceToTrail } from '../logic/cave.ts';
import { slopeAt, surfaceOf } from '../logic/heightfield.ts';
import { trailDistance } from '../logic/mountain.ts';
import type { HeightFn } from '../logic/heightfield.ts';
import { sampleRiver } from '../logic/river.ts';
import type { River } from '../logic/river.ts';

/**
 * Terrain mesh with vertex colours: grass, dirt at the den, arena and gates, sand (or mud) at the water's
 * edge, rock at the world edge and, in a biome with cliffs, on ground too steep to climb.
 */
export function buildTerrainMesh(heightAt: HeightFn, layout: BiomeLayout, palette: BiomePalette, rivers: River[] = []): THREE.Mesh {
  const size = (layout.worldRadius + 34) * 2;
  const segments = layout.terrain.segments;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(palette.ground);
  const grassAlt = new THREE.Color(palette.groundAlt);
  const dirt = new THREE.Color(palette.dirt);
  const rock = new THREE.Color(palette.rock);
  const sand = new THREE.Color(palette.shore ?? 0xd8c690);
  const deep = new THREE.Color(palette.deepWater ?? 0x6f8a6a);
  const c = new THREE.Color();
  const { arena, den, waters, waterY, gate, returnGate, worldRadius } = layout;
  const rockSlope = layout.terrain.rockSlope;
  // Each cave has bare earth round it, and one with a trail has a strip of bare earth from the arena to its mouth.
  const caves = (layout.caves ?? []).map((cave) => ({ cave, trail: cave.trail ? caveTrail(cave, arena) : null }));

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    c.copy(grass).lerp(grassAlt, smoothstep(-0.3, 0.5, fbm2(x * 0.045, z * 0.045, 91, 2)));

    const dArena = Math.hypot(x - arena.x, z - arena.z);
    const dDen = Math.hypot(x - den.x, z - den.z);
    // The last biome has no gate onward, and no path to it.
    const dGate = gate.unused ? Infinity : Math.hypot(x - gate.x, z - gate.z);
    const path = !gate.unused && Math.abs(x - gate.x) < 3.5 && z < arena.z && z > gate.z ? 1 : 0;
    let dirtAmount = Math.max(
      1 - smoothstep(arena.radius - 2, arena.radius + 2.5, dArena),
      (1 - smoothstep(den.radius - 4, den.radius, dDen)) * 0.9,
      (1 - smoothstep(gate.radius - 2, gate.radius + 2, dGate)) * 0.9,
      path * 0.8,
    );
    // Winter's mountain trail is packed snow.
    if (layout.mountain) {
      const d = trailDistance(layout.mountain, x, z);
      if (d !== null) dirtAmount = Math.max(dirtAmount, (1 - smoothstep(layout.mountain.trailWidth / 2 - 1.2, layout.mountain.trailWidth / 2 + 0.4, d)) * 0.7);
    }
    if (returnGate) {
      const dReturn = Math.hypot(x - returnGate.x, z - returnGate.z);
      dirtAmount = Math.max(dirtAmount, (1 - smoothstep(returnGate.radius - 2, returnGate.radius + 2, dReturn)) * 0.9);
    }
    for (const { cave, trail } of caves) {
      dirtAmount = Math.max(dirtAmount, (1 - smoothstep(cave.radius, cave.radius + 4.5, Math.hypot(x - cave.x, z - cave.z))) * 0.95);
      // The trail from the arena to the cave is bare earth.
      if (trail) dirtAmount = Math.max(dirtAmount, (1 - smoothstep(TRAIL_HALF_WIDTH - 0.6, TRAIL_HALF_WIDTH + 1.2, distanceToTrail(trail, x, z))) * 0.75);
    }
    c.lerp(dirt, dirtAmount);

    // Sand around every pond, greener-grey in the deep water.
    for (const w of waters) {
      const dPond = Math.hypot(x - w.x, z - w.z);
      if (dPond < w.radius + 5) {
        c.lerp(sand, 1 - smoothstep(w.radius - 1, w.radius + 5, dPond));
        c.lerp(deep, smoothstep(0.2, 2.0, surfaceOf(w, waterY) - h));
      }
    }
    // The same along every river: its banks, then its bed.
    for (const river of rivers) {
      const s = sampleRiver(river, x, z);
      if (!s || s.dist >= s.halfWidth + 4) continue;
      c.lerp(sand, 1 - smoothstep(s.halfWidth - 1, s.halfWidth + 4, s.dist));
      c.lerp(deep, smoothstep(0.2, 2.0, river.surfaceY - h));
    }

    // Ground too steep to climb is bare rock (a cliff).
    if (rockSlope !== undefined) c.lerp(rock, smoothstep(rockSlope * 0.75, rockSlope * 1.15, slopeAt(heightAt, x, z, 0.6)));

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
