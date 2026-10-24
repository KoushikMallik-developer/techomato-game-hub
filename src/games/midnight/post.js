// Midnight Pursuit: screen effects that give the "Most Wanted" street-racing look:
// speed motion blur, film-style colour grading (golden "Rockport" haze by day), vignette and grain.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export function makeMotionBlurPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      strength: { value: 0 },
      center: { value: new THREE.Vector2(0.5, 0.56) },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float strength;
      uniform vec2 center;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - center;
        float edge = smoothstep(0.08, 0.6, length(dir));
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          acc += texture2D(tDiffuse, center + dir * (1.0 - strength * edge * t));
        }
        gl_FragColor = acc / 10.0;
      }`,
  });
}

export function makeGradePass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 1 },
      lift: { value: new THREE.Vector3() },
      gamma: { value: new THREE.Vector3(1, 1, 1) },
      gain: { value: new THREE.Vector3(1, 1, 1) },
      tint: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1 },
      contrast: { value: 1 },
      haze: { value: new THREE.Vector3(0, 0, 0) },
      vignette: { value: 0.35 },
      grain: { value: 0.025 },
      time: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float amount, saturation, contrast, vignette, grain, time;
      uniform vec3 lift, gamma, gain, tint, haze;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        vec3 g = col * gain + lift * (1.0 - col);
        g = pow(max(g, 0.0), 1.0 / gamma);
        g = (g - 0.5) * contrast + 0.5;
        float l = dot(g, vec3(0.299, 0.587, 0.114));
        g = mix(vec3(l), g, saturation) * tint;
        g += haze * (1.0 - l);
        col = mix(col, g, amount);
        vec2 d = vUv - 0.5;
        col *= 1.0 - vignette * dot(d, d) * 2.0;
        float n = fract(sin(dot(vUv * 1000.0 + time, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * grain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
      }`,
  });
}

// Colour grades. "rockport" imitates the warm, smoggy, desaturated-gold look of mid-2000s street racers.
export const GRADES = {
  rockport: {
    overcast: { lift: [0.0, 0.004, 0.0], gamma: [1.0, 1.0, 0.97], gain: [1.02, 1.03, 0.95], tint: [1.01, 1.02, 0.95], saturation: 0.95, contrast: 1.14, haze: [0, 0, 0], vignette: 0.32 },
    day: { lift: [0.0, 0.0, 0.0], gamma: [1.0, 1.0, 0.98], gain: [1.04, 1.01, 0.96], tint: [1.03, 1.0, 0.95], saturation: 1.02, contrast: 1.1, haze: [0, 0, 0], vignette: 0.28 },
    sunset: { lift: [0.01, 0.0, 0.0], gamma: [1.0, 0.99, 0.96], gain: [1.06, 1.0, 0.9], tint: [1.05, 0.99, 0.9], saturation: 1.02, contrast: 1.12, haze: [0, 0, 0], vignette: 0.34 },
    night: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.0, 1.04], gain: [1.0, 1.02, 1.08], tint: [0.96, 1.0, 1.06], saturation: 1.08, contrast: 1.1, haze: [0.0, 0.004, 0.012], vignette: 0.55 },
  },
  natural: {
    overcast: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], saturation: 0.95, contrast: 1.05, haze: [0, 0, 0], vignette: 0.3 },
    day: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], saturation: 1.0, contrast: 1.03, haze: [0, 0, 0], vignette: 0.25 },
    sunset: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], saturation: 1.0, contrast: 1.03, haze: [0, 0, 0], vignette: 0.3 },
    night: { lift: [0, 0, 0.01], gamma: [1, 1, 1], gain: [1, 1, 1.02], tint: [1, 1, 1], saturation: 1.02, contrast: 1.05, haze: [0, 0, 0], vignette: 0.35 },
  },
};

export function applyGrade(pass, style, tod) {
  const g = (GRADES[style] || GRADES.rockport)[tod] || GRADES.natural.day;
  const u = pass.uniforms;
  u.lift.value.set(...g.lift);
  u.gamma.value.set(...g.gamma);
  u.gain.value.set(...g.gain);
  u.tint.value.set(...g.tint);
  u.haze.value.set(...g.haze);
  u.saturation.value = g.saturation;
  u.contrast.value = g.contrast;
  u.vignette.value = g.vignette;
}
