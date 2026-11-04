// Core Breach colour grade: a film-like look on top of the tone mapper's input (linear HDR).
// Soft violet-tinted shadows and warm golden highlights, rich saturation and a light vignette: a bright, playful look.
// On top of that, a stylised hero-shooter finish: thin ink outlines where brightness jumps (agents, props, wall edges)
// and soft cel-style banding of the light, so flat colours read clean and shapes pop.
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.05 },
    saturation: { value: 1.26 },
    shadowTint: { value: new THREE.Vector3(1.0, 0.97, 1.06) },
    highTint: { value: new THREE.Vector3(1.06, 1.01, 0.93) },
    vignette: { value: 0.16 },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    ink: { value: 0.75 }, // outline strength, 0 = off
    bands: { value: 0.3 }, // 0 = smooth light, 1 = hard bands
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform vec3 shadowTint; uniform vec3 highTint; uniform float vignette; uniform vec2 texel; uniform float ink; uniform float bands;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      float k = smoothstep(0.02, 0.6, l);
      c.rgb *= mix(shadowTint, highTint, k);
      // contrast around mid grey in log space keeps highlights intact
      c.rgb = exp2((log2(max(c.rgb, 1e-4)) - log2(0.18)) * contrast + log2(0.18));
      // cel bands: snap brightness to 6 steps (in a perceptual curve) and blend a little of that back in
      float lp = pow(max(lum(c.rgb), 1e-4), 0.45);
      float lb = (floor(lp * 6.0) + smoothstep(0.35, 0.65, fract(lp * 6.0))) / 6.0;
      c.rgb *= mix(1.0, pow(max(lb, 1e-4), 2.2222) / max(pow(lp, 2.2222), 1e-4), bands);
      // ink: compare brightness with the four neighbours (log scale, so dark and bright areas outline alike)
      float e = abs(log2(lum(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb) + 0.05) - log2(lum(texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb) + 0.05))
              + abs(log2(lum(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb) + 0.05) - log2(lum(texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb) + 0.05));
      c.rgb *= 1.0 - ink * smoothstep(0.3, 0.95, e);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.2, 0.9, dot(q, q) * 2.4);
      gl_FragColor = c;
    }`,
};
