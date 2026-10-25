// Horde Surge scenery: a shader sky with drifting clouds, rolling low-poly terrain, distant mountains,
// a paved lane with curbs, rails and lamps, and hundreds of instanced props that change with each world
// (meadow trees and flowers, snowy pines, desert cacti and mesas, candy lollipops, neon crystals),
// plus ambient life (snowfall, fireflies, falling petals). Everything is instanced: a few draw calls.
import * as THREE from 'three';
import { LANE_W, CANNON_Z, mulberry32 } from './data.js';
import { mergeSimple } from './crowd.js';

const HALF = LANE_W / 2;
const UP = new THREE.Vector3(0, 1, 0);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep = null) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });

// value noise for terrain
function noise2(seed) {
  const rnd = mulberry32(seed);
  const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = rnd();
  const h = (x, y) => P[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const xf = sm(x - xi); const yf = sm(y - yi);
    const a = h(xi, yi); const b = h(xi + 1, yi); const c = h(xi, yi + 1); const d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

// colour a geometry with one vertex colour
function tint(geo, color) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
// merge tinted parts into one geometry with vertex colours
function parts(list) {
  const geos = list.map(([geo, color]) => tint(geo, color));
  let n = 0;
  geos.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  let o = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const S = (g, x, y, z) => { g.scale(x, y, z); return g; };
const R = (g, ax, ay, az) => { if (ax) g.rotateX(ax); if (ay) g.rotateY(ay); if (az) g.rotateZ(az); return g; };

// one tier of a pine: a cone with a drooping, slightly ragged skirt
function tier(r, h, y) {
  const g = new THREE.ConeGeometry(r, h, 11, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const yy = p.getY(i); const z = p.getZ(i);
    const d = Math.hypot(x, z) / r;
    const a = Math.atan2(z, x);
    const rag = 1 + Math.sin(a * 11) * 0.06 * d;
    p.setXYZ(i, x * rag, yy - d * d * h * 0.18, z * rag);
  }
  g.translate(0, y, 0);
  return g;
}
// a mountain: a noisy, ridged cone
function mountainGeo(seed) {
  const g = new THREE.ConeGeometry(1, 1, 18, 8);
  const p = g.attributes.position;
  const rnd = mulberry32(seed);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i) + 0.5; const z = p.getZ(i);
    const a = Math.atan2(z, x); const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const ridge = 1 + Math.sin(a * 5 + ph[0]) * 0.12 + Math.sin(a * 11 + ph[1]) * 0.06 + Math.sin(a * 23 + y * 6 + ph[2]) * 0.03;
    p.setXYZ(i, x * ridge, (y + Math.sin(a * 7 + y * 9) * 0.02) - 0.5, z * ridge);
  }
  g.translate(0, 0.5, 0);
  g.computeVertexNormals();
  return g;
}

// ───────────── prop kits per world ─────────────
function kit(theme) {
  const id = theme.id;
  if (id === 'meadow') {
    return [
      { name: 'pine', weight: 3, scale: [0.8, 1.5], mat: { flatShading: true }, geo: parts([
        [T(new THREE.CylinderGeometry(0.14, 0.24, 1.6, 8), 0, 0.8, 0), '#6e4c30'],
        [tier(1.45, 1.5, 1.35), '#2b7f40'],
        [tier(1.2, 1.35, 2.15), '#33914a'],
        [tier(0.95, 1.2, 2.85), '#3da454'],
        [tier(0.66, 1.05, 3.5), '#4ab55f'],
        [tier(0.36, 0.8, 4.05), '#58c46a'],
      ]) },
      { name: 'oak', weight: 3, scale: [0.8, 1.4], geo: parts([
        [T(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), 0, 0.8, 0), '#80593a'],
        [T(new THREE.IcosahedronGeometry(1.15, 1), 0, 2.3, 0), '#5cbf4a'],
        [T(new THREE.IcosahedronGeometry(0.85, 1), 0.75, 2.0, 0.3), '#4fae40'],
        [T(new THREE.IcosahedronGeometry(0.8, 1), -0.7, 2.1, -0.25), '#69c955'],
        [T(new THREE.IcosahedronGeometry(0.7, 1), 0.1, 2.95, -0.2), '#72d25d'],
      ]) },
      { name: 'bush', weight: 4, scale: [0.6, 1.2], geo: parts([
        [T(new THREE.IcosahedronGeometry(0.6, 1), 0, 0.4, 0), '#4caa3f'],
        [T(new THREE.IcosahedronGeometry(0.45, 1), 0.5, 0.3, 0.1), '#5bbd4b'],
        [T(new THREE.IcosahedronGeometry(0.4, 1), -0.45, 0.28, -0.1), '#43a039'],
      ]) },
      { name: 'flowers', weight: 6, scale: [0.8, 1.3], near: true, geo: parts([
        ...[[0, 0, '#ff6b9a'], [0.3, 0.2, '#ffd23f'], [-0.25, 0.3, '#ffffff'], [0.15, -0.3, '#b07bff'], [-0.3, -0.2, '#ff8a3d']].flatMap(([x, z, c]) => [
          [T(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 3), x, 0.17, z), '#3f8f34'],
          [T(new THREE.IcosahedronGeometry(0.09, 1), x, 0.38, z), c],
        ]),
      ]) },
      { name: 'grass', weight: 10, scale: [0.7, 1.4], near: true, geo: parts([
        [R(T(new THREE.ConeGeometry(0.06, 0.5, 3), 0, 0.25, 0), 0, 0, 0.15), '#5dbb4a'],
        [R(T(new THREE.ConeGeometry(0.06, 0.42, 3), 0.1, 0.21, 0.05), 0, 0, -0.3), '#4ea83e'],
        [R(T(new THREE.ConeGeometry(0.06, 0.38, 3), -0.08, 0.19, -0.06), 0.25, 0, 0), '#67c552'],
      ]) },
      { name: 'rock', weight: 2, scale: [0.5, 1.4], mat: { flatShading: true }, geo: parts([
        [S(T(new THREE.DodecahedronGeometry(0.6, 1), 0, 0.25, 0), 1.3, 0.7, 1), '#9aa1a6'],
        [S(T(new THREE.DodecahedronGeometry(0.35, 0), 0.6, 0.12, 0.2), 1, 0.8, 1), '#b4bac0'],
      ]) },
    ];
  }
  if (id === 'snow') {
    return [
      { name: 'pine', weight: 6, scale: [0.8, 1.6], geo: parts([
        [T(new THREE.CylinderGeometry(0.15, 0.22, 1.1, 6), 0, 0.55, 0), '#5e4632'],
        [T(new THREE.ConeGeometry(1.3, 1.9, 7), 0, 1.7, 0), '#2a5f4a'],
        [T(new THREE.ConeGeometry(1.32, 0.5, 7), 0, 2.45, 0), '#f4f8fb'],
        [T(new THREE.ConeGeometry(0.95, 1.5, 7), 0, 2.75, 0), '#2f6a52'],
        [T(new THREE.ConeGeometry(0.97, 0.45, 7), 0, 3.3, 0), '#ffffff'],
        [T(new THREE.ConeGeometry(0.55, 1.1, 7), 0, 3.7, 0), '#f2f6f9'],
      ]) },
      { name: 'mound', weight: 4, scale: [0.6, 1.6], geo: parts([
        [S(T(new THREE.IcosahedronGeometry(0.8, 1), 0, 0, 0), 1.4, 0.45, 1), '#f3f7fa'],
      ]) },
      { name: 'ice', weight: 2, scale: [0.5, 1.2], geo: parts([
        [R(T(new THREE.OctahedronGeometry(0.4, 0), 0, 0.5, 0), 0, 0, 0.2), '#bfe8ff'],
        [S(R(T(new THREE.OctahedronGeometry(0.3, 0), 0.35, 0.35, 0.1), 0, 0, -0.4), 1, 1.6, 1), '#9fd8ff'],
      ]), mat: { roughness: 0.15, metalness: 0.1, emissive: '#2a6aa0', emissiveIntensity: 0.25 } },
      { name: 'rock', weight: 3, scale: [0.5, 1.4], mat: { flatShading: true }, geo: parts([
        [S(T(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.25, 0), 1.3, 0.7, 1), '#7d8894'],
        [S(T(new THREE.DodecahedronGeometry(0.61, 0), 0, 0.42, 0), 1.2, 0.25, 0.9), '#ffffff'],
      ]) },
    ];
  }
  if (id === 'desert') {
    const cactus = (h) => parts([
      [T(new THREE.CapsuleGeometry(0.28, h, 3, 8), 0, h / 2 + 0.28, 0), '#4f9a43'],
      [R(T(new THREE.CapsuleGeometry(0.18, 0.5, 3, 8), 0.42, h * 0.55, 0), 0, 0, 0), '#4f9a43'],
      [T(new THREE.CapsuleGeometry(0.17, 0.55, 3, 8), 0.62, h * 0.55 + 0.45, 0), '#5aa84c'],
      [T(new THREE.CapsuleGeometry(0.16, 0.4, 3, 8), -0.55, h * 0.4 + 0.3, 0), '#5aa84c'],
      [R(T(new THREE.CapsuleGeometry(0.15, 0.35, 3, 8), -0.35, h * 0.4, 0), 0, 0, Math.PI / 2), '#4f9a43'],
      [T(new THREE.IcosahedronGeometry(0.12, 1), 0, h + 0.6, 0), '#ff6b9a'],
    ]);
    return [
      { name: 'cactus', weight: 4, scale: [0.8, 1.4], geo: cactus(1.8) },
      { name: 'barrel', weight: 3, scale: [0.6, 1.1], near: true, geo: parts([
        [S(T(new THREE.IcosahedronGeometry(0.4, 1), 0, 0.32, 0), 1, 0.85, 1), '#5ea64f'],
        [T(new THREE.IcosahedronGeometry(0.1, 1), 0, 0.68, 0), '#ffd23f'],
      ]) },
      { name: 'rock', weight: 4, scale: [0.6, 1.8], geo: parts([
        [S(T(new THREE.DodecahedronGeometry(0.7, 0), 0, 0.35, 0), 1.4, 0.8, 1), '#c9875a'],
        [S(T(new THREE.DodecahedronGeometry(0.45, 0), 0.7, 0.2, 0.3), 1, 0.7, 1), '#b8744a'],
      ]) },
      { name: 'palm', weight: 1, scale: [0.9, 1.3], geo: parts([
        ...Array.from({ length: 6 }, (_, k) => [T(new THREE.CylinderGeometry(0.15 - k * 0.012, 0.18 - k * 0.012, 0.65, 6), k * 0.06, 0.32 + k * 0.6, 0), k % 2 ? '#a07a4a' : '#8a6a3a']),
        ...Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2; const g = new THREE.ConeGeometry(0.28, 2.1, 4); g.rotateZ(Math.PI / 2 + 0.35); g.translate(1.0, 3.75, 0); g.rotateY(a); return [g, '#4a9a3a']; }),
      ]) },
      { name: 'bones', weight: 1, scale: [0.6, 1], near: true, geo: parts([
        [R(T(new THREE.CapsuleGeometry(0.06, 0.6, 2, 6), 0, 0.06, 0), 0, 0, Math.PI / 2), '#f2eadb'],
        [T(new THREE.IcosahedronGeometry(0.16, 1), 0.4, 0.12, 0), '#f2eadb'],
      ]) },
    ];
  }
  if (id === 'candy') {
    const pop = (c) => parts([
      [T(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), 0, 1.1, 0), '#ffffff'],
      [R(T(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 20), 0, 2.6, 0), Math.PI / 2, 0, 0), c],
      [R(T(new THREE.TorusGeometry(0.5, 0.09, 6, 20), 0, 2.6, 0.12), 0, 0, 0), '#ffffff'],
    ]);
    const cane = () => {
      const list = [];
      for (let k = 0; k < 8; k++) list.push([T(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), 0, 0.15 + k * 0.3, 0), k % 2 ? '#ffffff' : '#ff3b5c']);
      const hook = new THREE.TorusGeometry(0.4, 0.12, 8, 12, Math.PI); hook.translate(0.4, 2.4, 0);
      list.push([hook, '#ff3b5c']);
      return parts(list);
    };
    return [
      { name: 'pop-pink', weight: 2, scale: [0.8, 1.3], geo: pop('#ff6fb5') },
      { name: 'pop-blue', weight: 2, scale: [0.8, 1.3], geo: pop('#62c8ff') },
      { name: 'cane', weight: 2, scale: [0.8, 1.2], geo: cane() },
      { name: 'cotton', weight: 3, scale: [0.8, 1.4], geo: parts([
        [T(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), 0, 0.7, 0), '#ffffff'],
        [T(new THREE.IcosahedronGeometry(1.0, 1), 0, 2.1, 0), '#ffb3dc'],
        [T(new THREE.IcosahedronGeometry(0.7, 1), 0.7, 1.8, 0.2), '#ffc8e6'],
        [T(new THREE.IcosahedronGeometry(0.65, 1), -0.65, 1.9, -0.2), '#e9a8ff'],
      ]) },
      { name: 'gumdrop', weight: 6, scale: [0.6, 1.2], near: true, geo: parts([
        [T(new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0), '#ff4f8b'],
        [T(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.6, 0, 0.2), '#7dff9c'],
        [T(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), -0.4, 0, 0.5), '#ffd23f'],
      ]), mat: { roughness: 0.25 } },
    ];
  }
  // neon night
  return [
    { name: 'crystal', weight: 4, scale: [0.6, 1.5], geo: parts([
      [S(T(new THREE.OctahedronGeometry(0.5, 0), 0, 0.9, 0), 0.7, 2, 0.7), '#2fd6c4'],
      [S(R(T(new THREE.OctahedronGeometry(0.35, 0), 0.4, 0.55, 0.1), 0, 0, -0.35), 0.7, 1.8, 0.7), '#7a5cff'],
      [S(R(T(new THREE.OctahedronGeometry(0.3, 0), -0.35, 0.45, -0.1), 0, 0, 0.4), 0.7, 1.7, 0.7), '#2fd6c4'],
    ]), mat: { roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.0, vertexEmissive: 0.5 } },
    { name: 'shroom', weight: 4, scale: [0.6, 1.4], near: true, geo: parts([
      [T(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), 0, 0.3, 0), '#d8d2ff'],
      [T(new THREE.SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.55, 0), '#ff3b9a'],
      [T(new THREE.CylinderGeometry(0.05, 0.08, 0.35, 6), 0.4, 0.17, 0.15), '#d8d2ff'],
      [T(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.4, 0.33, 0.15), '#ffd23f'],
    ]), mat: { roughness: 0.4, vertexEmissive: 0.45 } },
    { name: 'tree', weight: 3, scale: [0.9, 1.4], geo: parts([
      [T(new THREE.CylinderGeometry(0.15, 0.25, 2, 6), 0, 1, 0), '#2a2850'],
      [T(new THREE.IcosahedronGeometry(1.1, 1), 0, 2.6, 0), '#2b2f6e'],
      [T(new THREE.IcosahedronGeometry(0.8, 1), 0.6, 2.2, 0.3), '#33307a'],
    ]) },
    { name: 'rock', weight: 2, scale: [0.6, 1.4], mat: { flatShading: true }, geo: parts([
      [S(T(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.25, 0), 1.3, 0.7, 1), '#3a3f68'],
    ]) },
  ];
}

// vertex-coloured material; "vertexEmissive" makes the vertex colours glow (neon world)
export const WIND = { value: 0 };
function kitMaterial(opts = {}) {
  const { vertexEmissive = 0, sway = 1, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.75, metalness: 0, ...rest });
  // soft ambient occlusion toward the base, sunlit tops, a gentle sway in the wind
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind; varying float vLy;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLy = position.y;
        #ifdef USE_INSTANCING
        float wph = uWind * 1.6 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
        float bend = max(0.0, position.y - 0.4);
        transformed.x += sin(wph) * bend * bend * ${(0.012 * sway).toFixed(4)};
        transformed.z += cos(wph * 0.8) * bend * bend * ${(0.008 * sway).toFixed(4)};
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLy;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.9, vLy)) * mix(1.0, 1.12, smoothstep(1.5, 3.5, vLy));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${vertexEmissive ? `totalEmissiveRadiance += vColor.rgb * ${vertexEmissive.toFixed(2)};` : ''}
        float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * rimK * 0.25;`);
  };
  m.customProgramCacheKey = () => `hs-kit-${vertexEmissive}-${sway}-${rest.flatShading ? 1 : 0}`;
  return m;
}

// ───────────── sky ─────────────
function buildSky(theme, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.sky[0]) },
      bottom: { value: new THREE.Color(theme.sky[1]) },
      sun: { value: new THREE.Color(theme.sun) },
      sunDir: { value: sunDir.clone().normalize() },
      stars: { value: theme.neon ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; uniform vec3 sunDir; uniform float stars; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float y = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(bottom, top, pow(smoothstep(-0.05, 0.75, y), 0.8));
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sun * (pow(d, 300.0) * 2.5 + pow(d, 12.0) * 0.25);
        if (stars > 0.5) { vec3 q = floor(vDir * 220.0); float s = step(0.996, h(q)) * smoothstep(0.05, 0.4, y); c += vec3(s) * (0.6 + 0.4 * h(q + 1.0)); }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // colours are given in sRGB; convert to linear for the shader
  mat.uniforms.top.value.convertSRGBToLinear();
  mat.uniforms.bottom.value.convertSRGBToLinear();
  mat.uniforms.sun.value.convertSRGBToLinear();
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// fine detail tiled over the ground: blades, specks and pebbles (greyscale, multiplied in the shader)
function groundDetail(theme) {
  const c = canvas(256, 256); const g = c.getContext('2d');
  const rnd = mulberry32(5);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  const blades = theme.id === 'meadow' || theme.id === 'night' || theme.id === 'candy';
  for (let i = 0; i < (blades ? 2600 : 1600); i++) {
    const x = rnd() * 256; const y = rnd() * 256; const v = 90 + rnd() * 90 | 0;
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y);
    if (blades) g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 5); else g.lineTo(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3);
    g.stroke();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ───────────── the paved lane ─────────────
function laneTexture(theme, len) {
  const S = 1024;
  const c = canvas(S, S); const g = c.getContext('2d');
  const nc = canvas(S, S); const ng = nc.getContext('2d');
  const rnd = mulberry32(17);
  const base = new THREE.Color(theme.lane);
  // grout
  g.fillStyle = `#${base.clone().offsetHSL(0, -0.05, -0.22).getHexString()}`; g.fillRect(0, 0, S, S);
  ng.fillStyle = 'rgb(128,128,255)'; ng.fillRect(0, 0, S, S);
  // paving slabs: 4 across, staggered rows, each slab slightly different with soft bevelled edges
  const cols = 4; const rows = 4; const w = S / cols; const hgt = S / rows; const gap = 7;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * w + (r % 2) * w / 2; const y = r * hgt;
      const col = base.clone().offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.1);
      const gr = g.createLinearGradient(x, y, x + w * 0.3, y + hgt);
      gr.addColorStop(0, `#${col.clone().offsetHSL(0, 0, 0.04).getHexString()}`); gr.addColorStop(1, `#${col.clone().offsetHSL(0, 0, -0.04).getHexString()}`);
      g.fillStyle = gr; g.fillRect(x + gap, y + gap, w - gap * 2, hgt - gap * 2);
      // bevels: light top-left, dark bottom-right; matching normal map edges
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + gap, y + gap, w - gap * 2, 5); g.fillRect(x + gap, y + gap, 5, hgt - gap * 2);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + gap, y + hgt - gap - 5, w - gap * 2, 5); g.fillRect(x + w - gap - 5, y + gap, 5, hgt - gap * 2);
      ng.fillStyle = 'rgb(128,200,230)'; ng.fillRect(x + gap, y + gap, w - gap * 2, 6);
      ng.fillStyle = 'rgb(128,56,230)'; ng.fillRect(x + gap, y + hgt - gap - 6, w - gap * 2, 6);
      ng.fillStyle = 'rgb(56,128,230)'; ng.fillRect(x + gap, y + gap, 6, hgt - gap * 2);
      ng.fillStyle = 'rgb(200,128,230)'; ng.fillRect(x + w - gap - 6, y + gap, 6, hgt - gap * 2);
      // wear, small chips and a hairline crack now and then
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(x + gap + rnd() * (w - gap * 2), y + gap + rnd() * (hgt - gap * 2), 2 + rnd() * 10, 0, 7); g.fill(); }
      if (rnd() < 0.3) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.beginPath(); let cx = x + gap + rnd() * w * 0.5; let cy = y + gap; g.moveTo(cx, cy); for (let i = 0; i < 8; i++) { cx += (rnd() - 0.3) * 18; cy += hgt / 9; g.lineTo(cx, cy); } g.stroke(); }
    }
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  // dirt gathering along both edges of the lane
  const eg = g.createLinearGradient(0, 0, S, 0);
  eg.addColorStop(0, 'rgba(60,45,30,0.28)'); eg.addColorStop(0.07, 'rgba(60,45,30,0)'); eg.addColorStop(0.93, 'rgba(60,45,30,0)'); eg.addColorStop(1, 'rgba(60,45,30,0.28)');
  g.fillStyle = eg; g.fillRect(0, 0, S, S);
  const map = tex(c, [1, len / 12]);
  const normal = new THREE.CanvasTexture(nc); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.repeat.set(1, len / 12);
  return { map, normal };
}

// ───────────── build everything ─────────────
export function buildScenery(level, quality) {
  const theme = level.theme;
  const L = level.L;
  const g = new THREE.Group();
  const rnd = mulberry32(level.n * 977 + 3);
  const hi = quality === 'high';
  const lo = quality === 'low';
  const anim = [];
  const sunDir = new THREE.Vector3(0.45, 0.55, -0.7);

  g.add(buildSky(theme, sunDir));

  // rolling terrain (flat at the lane, hills further out), vertex coloured
  const zFar = -L - 120; const zNear = CANNON_Z + 60;
  const W = 300; const D = zNear - zFar;
  const seg = lo ? 60 : 110;
  const terr = new THREE.PlaneGeometry(W, D, seg, Math.round(seg * D / W));
  terr.rotateX(-Math.PI / 2);
  terr.translate(0, 0, (zNear + zFar) / 2);
  const n2 = noise2(level.n + 11);
  const p = terr.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const c1 = new THREE.Color(theme.ground); const c2 = new THREE.Color(theme.ground2); const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const z = p.getZ(i);
    const far = Math.max(0, Math.abs(x) - HALF - 6);
    const n = n2(x * 0.05, z * 0.05) * 0.7 + n2(x * 0.13, z * 0.13) * 0.3;
    const y = far > 0 ? Math.pow(far / 30, 1.4) * 9 * n + n * Math.min(1, far / 8) * 1.2 : 0;
    p.setY(i, y - 0.05);
    tmp.copy(c1).lerp(c2, Math.min(1, n * 0.9 + y * 0.04));
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  terr.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  terr.computeVertexNormals();
  const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: groundDetail(theme) });
  // break up the colour with large soft patches so the fields don't look flat
  gm.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float nn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec4 dtex = texture2D(map, vWp.xz * 0.15);
        vec4 dtex2 = texture2D(map, vWp.xz * 0.043 + 0.37);
        float patchN = nn(vWp.xz * 0.045) * 0.55 + nn(vWp.xz * 0.13) * 0.3 + nn(vWp.xz * 0.5) * 0.15;
        // darker lush patches and sun-dried lighter ones, plus fine blades
        diffuseColor.rgb *= mix(vec3(0.72, 0.8, 0.72), vec3(1.16, 1.12, 0.92), smoothstep(0.25, 0.8, patchN));
        diffuseColor.rgb *= 0.7 + dtex.r * 0.45 + (dtex2.r - 0.5) * 0.25;`);
  };
  const ground = new THREE.Mesh(terr, gm);
  ground.receiveShadow = true;
  g.add(ground);

  // distant mountains / mesas / hills
  const mGeo = theme.id === 'desert' ? new THREE.CylinderGeometry(0.7, 1, 1, 9, 2) : theme.id === 'candy' ? new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2) : mountainGeo(level.n);
  if (theme.id === 'desert') mGeo.translate(0, 0.5, 0);
  const mCol = theme.id === 'snow' ? '#c7d3df' : theme.id === 'desert' ? '#d29a68' : theme.id === 'candy' ? '#ffb3dc' : theme.id === 'night' ? '#221f4d' : '#7aa08a';
  const mMat = new THREE.MeshStandardMaterial({ color: mCol, flatShading: true, roughness: 1, fog: true });
  const mN = 26;
  const mountains = new THREE.InstancedMesh(mGeo, mMat, mN);
  const caps = theme.id === 'snow' || theme.id === 'meadow' ? new THREE.InstancedMesh(mountainGeo(level.n).scale(1.04, 1, 1.04), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }), mN) : null;
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const ps = new THREE.Vector3();
  for (let i = 0; i < mN; i++) {
    const a = (i / mN) * Math.PI * 1.4 - Math.PI * 0.7 + (rnd() - 0.5) * 0.1;
    const r = 160 + rnd() * 60;
    const h = theme.id === 'desert' ? 20 + rnd() * 25 : 30 + rnd() * 45;
    const wdt = theme.id === 'desert' ? 25 + rnd() * 25 : 30 + rnd() * 30;
    ps.set(Math.sin(a) * r, -2, -L * 0.5 - Math.cos(a) * r);
    q.setFromAxisAngle(UP, rnd() * 6);
    sc.set(wdt, h, wdt);
    m4.compose(ps, q, sc);
    mountains.setMatrixAt(i, m4);
    if (caps) { ps.y = -2 + h * 0.62; sc.set(wdt * 0.39, h * 0.38, wdt * 0.39); m4.compose(ps, q, sc); caps.setMatrixAt(i, m4); }
  }
  g.add(mountains);
  if (caps) g.add(caps);

  // clouds: clusters of puffs drifting slowly
  if (!theme.neon) {
    const puff = new THREE.IcosahedronGeometry(1, 3);
    const cN = lo ? 60 : 140;
    const cmat = new THREE.MeshStandardMaterial({ color: theme.id === 'candy' ? '#fff0fa' : '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.32, fog: false });
    // soft, slightly blue-grey undersides
    cmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.78, 1.04, smoothstep(-0.6, 0.6, (inverse(viewMatrix) * vec4(normalize(vNormal), 0.0)).y)) * vec3(0.97, 0.98, 1.02);'); };
    const clouds = new THREE.InstancedMesh(puff, cmat, cN);
    const base = [];
    let k = 0;
    while (k < cN) {
      const cx = (rnd() - 0.5) * 360; const cy = 40 + rnd() * 30; const cz = -L * 0.5 - 60 - rnd() * 160;
      const n = 4 + Math.floor(rnd() * 5);
      for (let j = 0; j < n && k < cN; j++, k++) {
        const s = 4 + rnd() * 6;
        base.push([cx + (j - n / 2) * 5 + rnd() * 3, cy + rnd() * 3, cz + (rnd() - 0.5) * 8, s * 1.4, s * 0.8, s]);
      }
    }
    const place = (t) => {
      base.forEach(([x, y, z, sx, sy, sz], i) => {
        let xx = x + t * 1.2; xx = ((xx + 200) % 400 + 400) % 400 - 200;
        ps.set(xx, y, z); sc.set(sx, sy, sz); q.identity(); m4.compose(ps, q, sc); clouds.setMatrixAt(i, m4);
      });
      clouds.instanceMatrix.needsUpdate = true;
    };
    place(0);
    clouds.frustumCulled = false;
    g.add(clouds);
    anim.push((dt, t) => { if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) place(t); });
  }

  // the lane: paved slabs on a raised bed, curbs, rails with posts
  const laneLen = CANNON_Z + 10 + L + 6;
  const laneZ = (CANNON_Z + 10 - L - 6) / 2;
  const lt = laneTexture(theme, laneLen);
  const laneMat = new THREE.MeshStandardMaterial({ map: lt.map, normalMap: lt.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: theme.neon ? 0.35 : 0.7, metalness: theme.neon ? 0.2 : 0 });
  const lane = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.3, laneLen), laneMat);
  lane.position.set(0, -0.15, laneZ);
  lane.receiveShadow = true;
  g.add(lane);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 3.2, 0.5, laneLen), std({ color: theme.neon ? '#262a4a' : new THREE.Color(theme.ground2).offsetHSL(0, -0.1, -0.12) }));
  bed.position.set(0, -0.3, laneZ);
  bed.receiveShadow = true;
  g.add(bed);
  const stripe = canvas(64, 16); const sg = stripe.getContext('2d');
  sg.fillStyle = theme.neon ? '#ff3b9a' : '#ef4040'; sg.fillRect(0, 0, 64, 16); sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, 32, 16);
  const curbMat = std({ map: tex(stripe, [laneLen / 2, 1]), roughness: 0.5, emissive: theme.neon ? '#ff3b9a' : '#000000', emissiveIntensity: theme.neon ? 0.6 : 0 });
  const railMat = std({ color: theme.rail, roughness: 0.35, metalness: 0.3 });
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8).translate(0, 0.55, 0);
  const nPosts = Math.ceil(laneLen / 3) * 2;
  const posts = new THREE.InstancedMesh(postGeo, railMat, nPosts);
  let pi = 0;
  [-1, 1].forEach((s) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, laneLen), curbMat);
    curb.position.set(s * (HALF + 0.27), 0.06, laneZ);
    curb.castShadow = !lo; curb.receiveShadow = true;
    g.add(curb);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, laneLen, 8), railMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * (HALF + 0.95), 1.05, laneZ);
    rail.castShadow = !lo;
    g.add(rail);
    const rail2 = rail.clone(); rail2.position.y = 0.6; g.add(rail2);
    for (let z = CANNON_Z + 10; z > -L - 6; z -= 3) {
      ps.set(s * (HALF + 0.95), 0, z); q.identity(); sc.set(1, 1, 1); m4.compose(ps, q, sc); posts.setMatrixAt(pi++, m4);
    }
  });
  posts.count = pi;
  posts.castShadow = !lo;
  g.add(posts);

  // lamps along the lane (glowing bulbs; real lights would be too costly for phones)
  const lampN = Math.ceil(L / 14) * 2;
  const lampPole = new THREE.InstancedMesh(parts([
    [T(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 6), 0, 1.7, 0), theme.neon ? '#3a3f68' : '#3d4350'],
    [R(T(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), 0, 3.35, 0.0), 0, 0, Math.PI / 2), theme.neon ? '#3a3f68' : '#3d4350'],
  ]), kitMaterial({ roughness: 0.4, metalness: 0.4, flatShading: false }), lampN);
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: theme.neon ? '#7fe9ff' : '#ffd890', emissiveIntensity: theme.neon ? 3 : 1.2 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), bulbMat, lampN);
  let li = 0;
  for (let z = -6; z > -L + 4; z -= 14) {
    [-1, 1].forEach((s) => {
      ps.set(s * (HALF + 1.9), 0, z); q.setFromAxisAngle(UP, s > 0 ? 0 : Math.PI); sc.set(1, 1, 1);
      m4.compose(ps, q, sc); lampPole.setMatrixAt(li, m4);
      ps.set(s * (HALF + 1.9) - s * 0.4, 3.25, z); q.identity(); m4.compose(ps, q, sc); bulbs.setMatrixAt(li, m4);
      li++;
    });
  }
  lampPole.count = li; bulbs.count = li;
  lampPole.castShadow = !lo;
  g.add(lampPole, bulbs);

  // props scattered either side of the lane (none in front of the fortress)
  const items = kit(theme);
  const total = lo ? 260 : hi ? 1100 : 650;
  const wsum = items.reduce((a, b) => a + b.weight, 0);
  for (const it of items) {
    const n = Math.round((total * it.weight) / wsum);
    const mat = kitMaterial(it.mat || {});
    const im = new THREE.InstancedMesh(it.geo, mat, n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x; let z;
      for (let tries = 0; tries < 8; tries++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const reach = it.near ? 2.2 + Math.pow(rnd(), 1.6) * 30 : 3 + Math.pow(rnd(), 1.3) * 75;
        x = side * (HALF + reach);
        z = zFar + 40 + rnd() * (zNear - zFar - 40);
        if (!(z < -L + 4 && z > -L - 8 && Math.abs(x) < HALF + 8)) break;
      }
      const far = Math.max(0, Math.abs(x) - HALF - 6);
      const nn = n2(x * 0.05, z * 0.05) * 0.7 + n2(x * 0.13, z * 0.13) * 0.3;
      const y = far > 0 ? Math.pow(far / 30, 1.4) * 9 * nn + nn * Math.min(1, far / 8) * 1.2 : 0;
      const s = it.scale[0] + rnd() * (it.scale[1] - it.scale[0]);
      ps.set(x, y - 0.05, z); q.setFromAxisAngle(UP, rnd() * Math.PI * 2); sc.set(s, s * (0.85 + rnd() * 0.3), s);
      m4.compose(ps, q, sc);
      im.setMatrixAt(i, m4);
      col.setHSL(0, 0, 0.85 + rnd() * 0.3);
      im.setColorAt(i, col);
    }
    im.castShadow = !lo && !it.near;
    im.receiveShadow = true;
    g.add(im);
  }

  // a dense field of grass blades on both sides of the lane, swaying in the wind
  if (!lo && theme.id !== 'snow') {
    const bc = canvas(128, 128); const bg = bc.getContext('2d'); const br = mulberry32(3);
    const gc = new THREE.Color(theme.id === 'desert' ? '#b9a25a' : theme.ground);
    for (let k = 0; k < 70; k++) {
      const x = 6 + br() * 116; const h = 45 + br() * 80; const bend = (br() - 0.5) * 30; const w = 2 + br() * 3;
      const c0 = gc.clone().offsetHSL((br() - 0.5) * 0.04, 0, -0.07 - br() * 0.05); const c1 = gc.clone().offsetHSL((br() - 0.5) * 0.04, 0.05, 0.05 + br() * 0.1);
      const gr = bg.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, `#${c0.getHexString()}`); gr.addColorStop(1, `#${c1.getHexString()}`);
      bg.fillStyle = gr; bg.beginPath(); bg.moveTo(x - w, 128); bg.quadraticCurveTo(x + bend * 0.4, 128 - h * 0.6, x + bend, 128 - h); bg.quadraticCurveTo(x + bend * 0.4 + w * 0.3, 128 - h * 0.6, x + w, 128); bg.fill();
    }
    const btex = tex(bc);
    const planes = [0, 1, 2].map((k) => { const p = new THREE.PlaneGeometry(0.9, 0.5); p.translate(0, 0.24, 0); p.rotateY((k / 3) * Math.PI); return p; });
    const bgeo = mergeSimple(planes);
    const uvs = []; planes.forEach((p) => { const pp = p.index ? p.toNonIndexed() : p; uvs.push(...pp.attributes.uv.array); });
    bgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const bn = bgeo.attributes.normal; for (let i = 0; i < bn.count; i++) bn.setXYZ(i, 0, 1, 0);
    const bmat = new THREE.MeshStandardMaterial({ map: btex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, emissive: theme.neon ? theme.tree : '#000000', emissiveIntensity: theme.neon ? 0.15 : 0 });
    bmat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = WIND;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float wph = uWind * 2.2 + instanceMatrix[3].x * 0.4 + instanceMatrix[3].z * 0.23;
        transformed.x += (sin(wph) * 0.6 + sin(wph * 2.3) * 0.25) * transformed.y * 0.25;`);
      // light both faces of the blades like the ground beneath them
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    const count = hi ? 16000 : 8000;
    const grass = new THREE.InstancedMesh(bgeo, bmat, count);
    let gi = 0;
    for (let k = 0; k < count * 3 && gi < count; k++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const reach = 1.4 + Math.pow(rnd(), 1.5) * 26;
      const x = side * (HALF + reach); const z = zFar + 60 + rnd() * (zNear - zFar - 60);
      if (z < -L + 4 && z > -L - 8 && Math.abs(x) < HALF + 8) continue;
      const nn = n2(x * 0.05, z * 0.05) * 0.7 + n2(x * 0.13, z * 0.13) * 0.3;
      if (theme.id === 'desert' && rnd() > 0.25) continue;
      if (nn < 0.3 && rnd() > 0.35) continue; // clumps, not a carpet
      const far = Math.max(0, Math.abs(x) - HALF - 6);
      const y = far > 0 ? Math.pow(far / 30, 1.4) * 9 * nn + nn * Math.min(1, far / 8) * 1.2 : 0;
      const sz = 0.7 + rnd() * 0.8;
      ps.set(x, y - 0.06, z); q.setFromAxisAngle(UP, rnd() * 6.28); sc.set(sz, sz * (0.8 + rnd() * 0.6), sz);
      m4.compose(ps, q, sc); grass.setMatrixAt(gi++, m4);
    }
    grass.count = gi;
    grass.receiveShadow = true;
    g.add(grass);
  }

  // ambient life: snowfall, fireflies, drifting petals / sparkles
  if (!lo) {
    const N = theme.id === 'snow' ? 1500 : theme.neon ? 260 : theme.id === 'candy' ? 300 : 160;
    const pos = new Float32Array(N * 3);
    const spd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 80; pos[i * 3 + 1] = rnd() * 30; pos[i * 3 + 2] = CANNON_Z + 10 - rnd() * (L + 30); spd[i] = 0.5 + rnd(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvas(32, 32); const dg = dot.getContext('2d');
    const gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
    const color = theme.id === 'snow' ? '#ffffff' : theme.neon ? '#b6ff6a' : theme.id === 'candy' ? '#ffd1ec' : theme.id === 'desert' ? '#ffe0b0' : '#fff7c2';
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex(dot), color, size: theme.id === 'snow' ? 0.35 : 0.3, transparent: true, depthWrite: false, blending: theme.neon ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
    pts.frustumCulled = false;
    g.add(pts);
    anim.push((dt, t) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        if (theme.id === 'snow') { a[k + 1] -= spd[i] * 2.2 * dt; a[k] += Math.sin(t + i) * 0.4 * dt; if (a[k + 1] < 0) a[k + 1] = 28; }
        else { a[k] += Math.sin(t * 0.7 + i) * 0.6 * dt; a[k + 1] = 0.6 + ((i * 0.37) % 1) * 5 + Math.sin(t * spd[i] + i) * 0.6; a[k + 2] += Math.cos(t * 0.5 + i) * 0.5 * dt; }
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  return { group: g, update: (dt, t) => { WIND.value = t; anim.forEach((f) => f(dt, t)); }, sunDir };
}
