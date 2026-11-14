import * as THREE from 'three';
import { lerp, mulberry32, smoothstep } from '../core/math.ts';
import type { BiomeDef } from '../core/types.ts';
import { TUNING } from '../data/tuning.ts';
import { advanceDay, dayState, wrapDay } from '../logic/dayNight.ts';
import type { DayState } from '../logic/dayNight.ts';

const D = TUNING.dayNight;
const C = D.colors;
const WHITE = new THREE.Color(0xffffff);
/** The light never drops lower than this, so sunrise and sunset shadows stay short enough to look clean. */
const MIN_LIGHT_HEIGHT = 0.24;
/** Sun height at which the shadow-casting light stops being the sun and becomes the moon. */
const HANDOVER = -0.06;
/** Brightness of the lit ground at midnight, as a fraction of noon. */
const NIGHT_BRIGHTNESS = (D.nightAmbient + D.moonIntensity * 0.6) / (D.dayAmbient + D.sunIntensity * 0.6);

/** Sky dome, sun, moon, stars, clouds, fog and lights for a biome, with a day and night cycle. */
export class Sky {
  readonly group = new THREE.Group();
  /** Fraction of a full day: 0 = midnight, 0.5 = noon. */
  time = D.startAt;
  state: DayState = dayState(D.startAt, D.dayBias);
  /** Multiply unlit materials (grass blades) by this so they darken with the light. */
  readonly unlitTint = new THREE.Color(1, 1, 1);

  private dome: THREE.Mesh;
  private clouds: THREE.InstancedMesh;
  private cloudMaterial: THREE.MeshBasicMaterial;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fog: THREE.Fog;
  /** The biome's usual fog distances, which `setVisibility` scales. */
  private fogNear: number;
  private fogFar: number;
  private background: THREE.Color;

  private sunDir = new THREE.Vector3(0, 1, 0);
  private moonDir = new THREE.Vector3(0, -1, 0);
  private lightDir = new THREE.Vector3(0, 1, 0);
  private uniforms: {
    top: { value: THREE.Color };
    horizon: { value: THREE.Color };
    sunColor: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    moonDir: { value: THREE.Vector3 };
    sunGlow: { value: number };
    night: { value: number };
  };

  // Day colours come from the biome; night and twilight colours are shared (tuning.ts).
  private day: { top: THREE.Color; horizon: THREE.Color; fog: THREE.Color; sun: THREE.Color };
  private col = {
    nightTop: new THREE.Color(C.nightTop), nightHorizon: new THREE.Color(C.nightHorizon), nightFog: new THREE.Color(C.nightFog),
    twilightTop: new THREE.Color(C.twilightTop), twilightHorizon: new THREE.Color(C.twilightHorizon),
    twilightFog: new THREE.Color(C.twilightFog), twilightSun: new THREE.Color(C.twilightSun),
    moon: new THREE.Color(C.moon),
    dayAmbientSky: new THREE.Color(C.dayAmbientSky), dayAmbientGround: new THREE.Color(C.dayAmbientGround),
    nightAmbientSky: new THREE.Color(C.nightAmbientSky), nightAmbientGround: new THREE.Color(C.nightAmbientGround),
    nightUnlit: new THREE.Color(C.nightUnlit), nightCloud: new THREE.Color(C.nightCloud), twilightCloud: new THREE.Color(C.twilightCloud),
  };

  constructor(scene: THREE.Scene, biome: BiomeDef) {
    const p = biome.palette;
    this.day = {
      top: new THREE.Color(p.skyTop), horizon: new THREE.Color(p.skyHorizon), fog: new THREE.Color(p.fog), sun: new THREE.Color(p.sun),
    };
    this.fogNear = biome.fogNear;
    this.fogFar = biome.fogFar;
    this.fog = new THREE.Fog(p.fog, biome.fogNear, biome.fogFar);
    this.background = new THREE.Color(p.skyHorizon);
    scene.fog = this.fog;
    scene.background = this.background;

    this.uniforms = {
      top: { value: new THREE.Color(p.skyTop) },
      horizon: { value: new THREE.Color(p.skyHorizon) },
      sunColor: { value: new THREE.Color(p.sun) },
      sunDir: { value: this.sunDir },
      moonDir: { value: this.moonDir },
      sunGlow: { value: 1 },
      night: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(480, 24, 14),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 horizon;
          uniform vec3 sunColor;
          uniform vec3 sunDir;
          uniform vec3 moonDir;
          uniform float sunGlow;
          uniform float night;
          varying vec3 vDir;

          float hash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          }

          void main() {
            vec3 dir = normalize(vDir);
            float t = pow(clamp(dir.y, 0.0, 1.0), 0.55);
            vec3 col = mix(horizon, top, t);

            float s = max(dot(dir, sunDir), 0.0);
            col += sunColor * (pow(s, 600.0) * 1.4 + pow(s, 12.0) * 0.16) * sunGlow;

            if (night > 0.0) {
              // Stars: one possible star per cell of a grid wrapped around the dome.
              vec3 g = dir * 110.0;
              vec3 cell = floor(g);
              float h = hash(cell);
              float d = length(fract(g) - 0.5);
              float star = step(0.955, h) * smoothstep(0.22, 0.03, d) * (0.45 + 0.55 * fract(h * 57.0));
              col += vec3(0.86, 0.9, 1.0) * star * night * smoothstep(0.02, 0.3, dir.y);

              // Moon: a soft disc with a faint halo, opposite the sun.
              float m = max(dot(dir, moonDir), 0.0);
              col += vec3(0.9, 0.93, 1.0) * (smoothstep(0.99935, 0.9996, m) * 0.9 + pow(m, 90.0) * 0.1) * night;
            }

            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // Soft flat-bottomed clouds.
    const rand = mulberry32(77);
    const count = 16;
    this.cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.9 });
    this.clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), this.cloudMaterial, count * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = 150 + rand() * 230;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const cy = 95 + rand() * 50;
      for (let j = 0; j < 3; j++) {
        const w = 22 + rand() * 20;
        m.compose(
          new THREE.Vector3(cx + (j - 1) * w * 0.7, cy + rand() * 4, cz + (rand() - 0.5) * 14),
          q,
          new THREE.Vector3(w, 6 + rand() * 4, w * 0.6),
        );
        this.clouds.setMatrixAt(n++, m);
      }
    }
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    this.hemi = new THREE.HemisphereLight(C.dayAmbientSky, C.dayAmbientGround, D.dayAmbient);
    this.group.add(this.hemi);

    // One shadow-casting light does both jobs: it is the sun by day and the moon by night.
    this.sun = new THREE.DirectionalLight(p.sun, D.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -42;
    cam.right = 42;
    cam.top = 42;
    cam.bottom = -42;
    cam.near = 1;
    cam.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.group.add(this.sun, this.sun.target);

    scene.add(this.group);
    this.setTime(this.time);
  }

  /**
   * Scales how far the player can see: the fog starts and ends at this fraction of the biome's usual
   * distances (1 = as normal). An animal with limited night vision sets it below 1 in the dark.
   */
  setVisibility(fraction: number): void {
    this.fog.near = this.fogNear * fraction;
    this.fog.far = this.fogFar * fraction;
  }

  /** Moves the clock forward. One full day takes `TUNING.dayNight.cycleSeconds`. */
  advance(dt: number): void {
    this.setTime(advanceDay(this.time, dt, D.cycleSeconds));
  }

  /** Jumps to a time of day (0 = midnight, 0.5 = noon) and recolours the sky, fog and lights. */
  setTime(time: number): void {
    this.time = wrapDay(time);
    const s = dayState(this.time, D.dayBias);
    this.state = s;
    const c = this.col;
    const day = s.daylight;
    const glow = s.twilight;

    // The sun rises in the east (+X), passes a little south of overhead, and sets in the west.
    this.sunDir.set(Math.cos(s.angle), Math.sin(s.angle) + D.dayBias, 0.4).normalize();
    this.moonDir.copy(this.sunDir).negate();

    const u = this.uniforms;
    u.top.value.copy(c.nightTop).lerp(this.day.top, day).lerp(c.twilightTop, glow * 0.45);
    u.horizon.value.copy(c.nightHorizon).lerp(this.day.horizon, day).lerp(c.twilightHorizon, glow * 0.7);
    u.sunColor.value.copy(c.twilightSun).lerp(this.day.sun, smoothstep(0, 0.4, s.elevation));
    u.sunGlow.value = smoothstep(-0.14, 0.02, s.elevation);
    u.night.value = 1 - smoothstep(-0.22, 0.06, s.elevation);
    this.fog.color.copy(c.nightFog).lerp(this.day.fog, day).lerp(c.twilightFog, glow * 0.5);
    this.background.copy(u.horizon.value);

    // The sun keeps lighting the world for a moment after it touches the horizon (golden hour),
    // then fades to nothing just below it, which hides the hand-over to the moon.
    const sunUp = s.elevation >= HANDOVER;
    this.lightDir.copy(sunUp ? this.sunDir : this.moonDir);
    this.lightDir.y = Math.max(this.lightDir.y, MIN_LIGHT_HEIGHT);
    this.lightDir.normalize();
    if (sunUp) {
      this.sun.color.copy(c.twilightSun).lerp(this.day.sun, smoothstep(0.02, 0.45, s.elevation));
      this.sun.intensity = D.sunIntensity * smoothstep(HANDOVER, 0.14, s.elevation);
    } else {
      this.sun.color.copy(c.moon);
      this.sun.intensity = D.moonIntensity * smoothstep(-HANDOVER, 0.2, -s.elevation);
    }

    this.hemi.intensity = lerp(D.nightAmbient, D.dayAmbient, day);
    this.hemi.color.copy(c.nightAmbientSky).lerp(c.dayAmbientSky, day).lerp(c.twilightHorizon, glow * 0.25);
    this.hemi.groundColor.copy(c.nightAmbientGround).lerp(c.dayAmbientGround, day);

    // Unlit things follow how bright the lit ground is right now, so grass never glows at dusk.
    const brightness = (this.hemi.intensity + this.sun.intensity * 0.6) / (D.dayAmbient + D.sunIntensity * 0.6);
    const lit = smoothstep(NIGHT_BRIGHTNESS, 1, brightness);
    this.unlitTint.copy(c.nightUnlit).lerp(WHITE, lit).lerp(c.twilightCloud, glow * 0.15);
    this.cloudMaterial.color.copy(c.nightCloud).lerp(WHITE, day).lerp(c.twilightCloud, glow * 0.6);
  }

  /** Keeps the sky centred on the camera and the shadow box centred on the focus point. */
  update(cameraPos: THREE.Vector3, focus: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 110);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.clouds.geometry.dispose();
    this.cloudMaterial.dispose();
  }
}
