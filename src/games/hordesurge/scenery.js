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
    g.computeVertexNormals();
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

// ───────────── prop kits per world ─────────────
function kit(theme) {
  const id = theme.id;
  if (id === 'meadow') {
    return [
      { name: 'pine', weight: 3, scale: [0.8, 1.5], geo: parts([
        [T(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6), 0, 0.6, 0), '#7a5636'],
        [T(new THREE.ConeGeometry(1.35, 1.9, 7), 0, 1.75, 0), '#2f8a45'],
        [T(new THREE.ConeGeometry(1.05, 1.6, 7), 0, 2.6, 0), '#38a04f'],
        [T(new THREE.ConeGeometry(0.7, 1.3, 7), 0, 3.35, 0), '#45b45c'],
      ]) },
      { name: 'oak', weight: 3, scale: [0.8, 1.4], geo: parts([
        [T(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), 0, 0.8, 0), '#80593a'],
        [T(new THREE.IcosahedronGeometry(1.15, 0), 0, 2.3, 0), '#5cbf4a'],
        [T(new THREE.IcosahedronGeometry(0.85, 0), 0.75, 2.0, 0.3), '#4fae40'],
        [T(new THREE.IcosahedronGeometry(0.8, 0), -0.7, 2.1, -0.25), '#69c955'],
        [T(new THREE.IcosahedronGeometry(0.7, 0), 0.1, 2.95, -0.2), '#72d25d'],
      ]) },
      { name: 'bush', weight: 4, scale: [0.6, 1.2], geo: parts([
        [T(new THREE.IcosahedronGeometry(0.6, 0), 0, 0.4, 0), '#4caa3f'],
        [T(new THREE.IcosahedronGeometry(0.45, 0), 0.5, 0.3, 0.1), '#5bbd4b'],
        [T(new THREE.IcosahedronGeometry(0.4, 0), -0.45, 0.28, -0.1), '#43a039'],
      ]) },
      { name: 'flowers', weight: 6, scale: [0.8, 1.3], near: true, geo: parts([
        ...[[0, 0, '#ff6b9a'], [0.3, 0.2, '#ffd23f'], [-0.25, 0.3, '#ffffff'], [0.15, -0.3, '#b07bff'], [-0.3, -0.2, '#ff8a3d']].flatMap(([x, z, c]) => [
          [T(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 3), x, 0.17, z), '#3f8f34'],
          [T(new THREE.IcosahedronGeometry(0.09, 0), x, 0.38, z), c],
        ]),
      ]) },
      { name: 'grass', weight: 10, scale: [0.7, 1.4], near: true, geo: parts([
        [R(T(new THREE.ConeGeometry(0.06, 0.5, 3), 0, 0.25, 0), 0, 0, 0.15), '#5dbb4a'],
        [R(T(new THREE.ConeGeometry(0.06, 0.42, 3), 0.1, 0.21, 0.05), 0, 0, -0.3), '#4ea83e'],
        [R(T(new THREE.ConeGeometry(0.06, 0.38, 3), -0.08, 0.19, -0.06), 0.25, 0, 0), '#67c552'],
      ]) },
      { name: 'rock', weight: 2, scale: [0.5, 1.4], geo: parts([
        [S(T(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.25, 0), 1.3, 0.7, 1), '#9aa1a6'],
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
      { name: 'rock', weight: 3, scale: [0.5, 1.4], geo: parts([
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
      [T(new THREE.IcosahedronGeometry(0.12, 0), 0, h + 0.6, 0), '#ff6b9a'],
    ]);
    return [
      { name: 'cactus', weight: 4, scale: [0.8, 1.4], geo: cactus(1.8) },
      { name: 'barrel', weight: 3, scale: [0.6, 1.1], near: true, geo: parts([
        [S(T(new THREE.IcosahedronGeometry(0.4, 1), 0, 0.32, 0), 1, 0.85, 1), '#5ea64f'],
        [T(new THREE.IcosahedronGeometry(0.1, 0), 0, 0.68, 0), '#ffd23f'],
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
        [T(new THREE.IcosahedronGeometry(0.16, 0), 0.4, 0.12, 0), '#f2eadb'],
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
      [T(new THREE.IcosahedronGeometry(1.1, 0), 0, 2.6, 0), '#2b2f6e'],
      [T(new THREE.IcosahedronGeometry(0.8, 0), 0.6, 2.2, 0.3), '#33307a'],
    ]) },
    { name: 'rock', weight: 2, scale: [0.6, 1.4], geo: parts([
      [S(T(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.25, 0), 1.3, 0.7, 1), '#3a3f68'],
    ]) },
  ];
}

// vertex-coloured material; "vertexEmissive" makes the vertex colours glow (neon world)
function kitMaterial(opts = {}) {
  const { vertexEmissive = 0, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0, ...rest });
  if (vertexEmissive) {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * ${vertexEmissive.toFixed(2)};`);
    };
  }
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

// ───────────── the paved lane ─────────────
function laneTexture(theme, len) {
  const c = canvas(512, 512); const g = c.getContext('2d');
  const rnd = mulberry32(17);
  const base = new THREE.Color(theme.lane);
  g.fillStyle = theme.lane; g.fillRect(0, 0, 512, 512);
  // paving slabs: 4 across, staggered rows
  const cols = 4; const rows = 4; const w = 512 / cols; const hgt = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * w + (r % 2) * w / 2; const y = r * hgt;
      const shade = (rnd() - 0.5) * 0.12;
      const col = base.clone().offsetHSL(0, 0, shade);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x + 3, y + 3, w - 6, hgt - 6);
      // bevel
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, y + 3, w - 6, 4);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 3, y + hgt - 7, w - 6, 4);
    }
  }
  // speckle
  for (let i = 0; i < 3000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; g.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
  return tex(c, [1, len / 12]);
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
  const ground = new THREE.Mesh(terr, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  g.add(ground);

  // distant mountains / mesas / hills
  const mGeo = theme.id === 'desert' ? new THREE.CylinderGeometry(0.7, 1, 1, 7, 1) : theme.id === 'candy' ? new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.ConeGeometry(1, 1, 6, 1);
  if (theme.id !== 'desert' && theme.id !== 'candy') mGeo.translate(0, 0.5, 0);
  if (theme.id === 'desert') mGeo.translate(0, 0.5, 0);
  const mCol = theme.id === 'snow' ? '#c7d3df' : theme.id === 'desert' ? '#d29a68' : theme.id === 'candy' ? '#ffb3dc' : theme.id === 'night' ? '#221f4d' : '#7aa08a';
  const mMat = new THREE.MeshStandardMaterial({ color: mCol, flatShading: true, roughness: 1, fog: true });
  const mN = 26;
  const mountains = new THREE.InstancedMesh(mGeo, mMat, mN);
  const caps = theme.id === 'snow' || theme.id === 'meadow' ? new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }), mN) : null;
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
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const cN = lo ? 60 : 140;
    const clouds = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ color: theme.id === 'candy' ? '#fff0fa' : '#ffffff', roughness: 1, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.25, fog: false }), cN);
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
  const laneMat = new THREE.MeshStandardMaterial({ map: laneTexture(theme, laneLen), roughness: 0.75 });
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

  return { group: g, update: (dt, t) => anim.forEach((f) => f(dt, t)), sunDir };
}
