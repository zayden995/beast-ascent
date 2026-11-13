import * as THREE from 'three';
import { mulberry32 } from '../core/math.ts';
import type { BiomeDef } from '../core/types.ts';

const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();

/** Sky dome, clouds, fog and lights for a biome. */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private clouds: THREE.InstancedMesh;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;

  constructor(scene: THREE.Scene, biome: BiomeDef) {
    const p = biome.palette;
    scene.fog = new THREE.Fog(p.fog, biome.fogNear, biome.fogFar);
    scene.background = new THREE.Color(p.skyHorizon);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(480, 24, 14),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(p.skyTop) },
          horizon: { value: new THREE.Color(p.skyHorizon) },
          sunColor: { value: new THREE.Color(p.sun) },
          sunDir: { value: SUN_DIR },
        },
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
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            float t = pow(clamp(dir.y, 0.0, 1.0), 0.55);
            vec3 col = mix(horizon, top, t);
            float s = max(dot(dir, sunDir), 0.0);
            col += sunColor * (pow(s, 600.0) * 1.4 + pow(s, 12.0) * 0.16);
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
    this.clouds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.9 }),
      count * 3,
    );
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

    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x6a7a4a, 1.7);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(p.sun, 2.6);
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
  }

  /** Keeps the sky centred on the camera and the shadow box centred on the focus point. */
  update(cameraPos: THREE.Vector3, focus: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(SUN_DIR, 110);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.clouds.geometry.dispose();
    (this.clouds.material as THREE.Material).dispose();
  }
}
