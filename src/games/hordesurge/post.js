// Horde Surge post-processing: soft bloom (gates, sparks, neon), a toy-like colour grade
// (vibrance, gentle contrast, warm highlights) and a vignette. A tilt-shift option is kept in the
// shader (uniform tilt) but off: it blurred units the player needs to see.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vibrance: { value: 0.14 },
    contrast: { value: 1.06 },
    warmth: { value: 0.03 },
    vignette: { value: 0.32 },
    tilt: { value: 0 },
    focus: { value: 0.52 },
    hit: { value: 0 },
    cold: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vibrance; uniform float contrast; uniform float warmth; uniform float vignette;
    uniform float tilt; uniform float focus; uniform vec2 res; uniform float hit; uniform float cold; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (tilt > 0.0) {
        float d = clamp((abs(vUv.y - focus) - 0.22) * 2.6, 0.0, 1.0) * tilt;
        if (d > 0.01) {
          vec2 px = d * 3.0 / res;
          vec4 acc = c * 0.2;
          acc += texture2D(tDiffuse, vUv + vec2( px.x, 0.0)) * 0.1;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)) * 0.1;
          acc += texture2D(tDiffuse, vUv + vec2(0.0,  px.y)) * 0.1;
          acc += texture2D(tDiffuse, vUv + vec2(0.0, -px.y)) * 0.1;
          acc += texture2D(tDiffuse, vUv + px) * 0.1;
          acc += texture2D(tDiffuse, vUv - px) * 0.1;
          acc += texture2D(tDiffuse, vUv + vec2(px.x, -px.y)) * 0.1;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x, px.y)) * 0.1;
          c = acc;
        }
      }
      // impact: a short chromatic split and flash on big hits
      if (hit > 0.0) {
        vec2 off = (vUv - 0.5) * hit * 0.014;
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.b = texture2D(tDiffuse, vUv - off).b;
        c.rgb += hit * 0.1;
      }
      // linear HDR in, still linear out (OutputPass tone maps)
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
      float sat = mx - mn;
      c.rgb = mix(vec3(l), c.rgb, 1.0 + vibrance * (1.0 - sat));
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;
      c.rgb *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
      c.rgb = mix(c.rgb, c.rgb * vec3(0.8, 0.98, 1.3) + vec3(0.0, 0.01, 0.03), cold * 0.6);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.quality = quality;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.tilt.value = 0; // tilt-shift looked great but blurred the units you need to read
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setTheme(theme) {
    this.bloom.strength = theme.neon ? 0.6 : 0.3;
    this.bloom.threshold = theme.neon ? 0.55 : 0.9;
    this.grade.uniforms.warmth.value = theme.id === 'snow' ? -0.02 : theme.id === 'desert' ? 0.06 : 0.03;
  }

  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.grade.uniforms.res.value.set(w * dpr, h * dpr);
  }

  // portrait screens show more lane: keep the tilt-shift band a bit taller
  setFocus(portrait) { this.grade.uniforms.focus.value = portrait ? 0.48 : 0.52; }

  setFx(hit, cold) { this.grade.uniforms.hit.value = hit; this.grade.uniforms.cold.value = cold; }

  draw() { this.composer.render(); }

  dispose() { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.bloom.dispose(); }
}
