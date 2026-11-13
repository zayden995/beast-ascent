import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Four-step ramp that gives MeshToonMaterial its banded shading. */
export function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([105, 165, 220, 255]), 4, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export interface ToonOptions {
  color?: number;
  vertexColors?: boolean;
  /** Soft rim light strength (0 = off). */
  rim?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

/** Toon material with an optional soft rim light, the shared look for the whole game. */
export function toonMaterial(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: opts.vertexColors ?? false,
    gradientMap: toonGradient(),
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  const rim = opts.rim ?? 0;
  if (rim > 0) {
    const strength = rim.toFixed(3);
    mat.onBeforeCompile = (shader) => {
      // `normal` and `vViewPosition` are defined by the stock toon fragment shader (three r187).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rimDot = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
         outgoingLight += vec3( 1.0, 0.96, 0.88 ) * pow( rimDot, 3.0 ) * ${strength};
         #include <opaque_fragment>`,
      );
    };
    mat.customProgramCacheKey = () => `toon-rim-${strength}`;
  }
  return mat;
}

/**
 * Returns a faceted copy of a geometry (one normal per triangle).
 * MeshToonMaterial has no flatShading option, so the low-poly look is baked into the normals.
 */
export function flatShade(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (out !== geo) geo.dispose();
  out.computeVertexNormals();
  return out;
}
