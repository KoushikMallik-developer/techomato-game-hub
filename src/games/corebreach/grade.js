// Core Breach colour grade: a film-like look on top of the tone mapper's input (linear HDR).
// Cool shadows and warm highlights, a little extra contrast and saturation, and a soft vignette.
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.08 },
    saturation: { value: 1.06 },
    shadowTint: { value: new THREE.Vector3(0.97, 1.0, 1.04) },
    highTint: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
    vignette: { value: 0.28 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform vec3 shadowTint; uniform vec3 highTint; uniform float vignette;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      float k = smoothstep(0.02, 0.6, l);
      c.rgb *= mix(shadowTint, highTint, k);
      // contrast around mid grey in log space keeps highlights intact
      c.rgb = exp2((log2(max(c.rgb, 1e-4)) - log2(0.18)) * contrast + log2(0.18));
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.2, 0.9, dot(q, q) * 2.4);
      gl_FragColor = c;
    }`,
};
