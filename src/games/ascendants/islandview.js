// Ascendants island rendering: splat-textured terrain (grass, rock, sand, snow blended by height and slope,
// shore foam and darker sea floor), animated sea, wind-swayed forests (pines, oaks, palms) and boulders in
// culled chunks, houses with facades and roofs, landmarks (lighthouse, temple, radio mast, silo, lab, pier),
// sky with a sun that crosses it during a match (morning to golden sunset), drifting clouds that cast
// shadows, a river that tumbles over a waterfall into the crater lake, morning mist, birds, flowers.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { WORLD, mulberry32 } from './data.js';
import * as TX from './texgen.js';

const clean = (g) => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k); return o; };
function mergeAll(list, colors = false) {
  if (!list.length) return null;
  const l = list.map(clean);
  if (colors) l.forEach((g) => { if (!g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); } });
  else l.forEach((g) => { if (g.attributes.color) g.deleteAttribute('color'); });
  l.forEach((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
  return mergeGeometries(l);
}
const tint = (g, hex) => { const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

export function buildIslandView(island, quality, renderer) {
  const group = new THREE.Group();
  const uniforms = { time: { value: 0 } };
  const sunDir = new THREE.Vector3(0.45, 0.62, 0.38).normalize();
  group.add(buildTerrain(island, quality, uniforms));
  const water = buildWater(uniforms, sunDir);
  group.add(water);
  const forest = buildForest(island, quality, uniforms);
  group.add(forest.group);
  group.add(buildRocks(island, quality));
  group.add(buildSpires(island));
  group.add(buildTowns(island));
  const sky = buildSky(sunDir, renderer);
  group.add(sky.mesh);
  const clouds = buildClouds();
  group.add(clouds);
  const river = buildRiver(island, uniforms);
  if (river) group.add(river.mesh);
  const birds = new Birds(group, island, uniforms);
  const mist = buildMist(island);
  group.add(mist);
  const view = { group, uniforms, sunDir, sky, river: river && river.path, falls: river && river.falls };
  const wu = water.userData.mat.uniforms;
  // trees knocked down by blasts disappear from the instanced forest
  view.hideTree = (i) => {
    const r = forest.refs.get(i);
    if (!r || r.hidden) return false;
    r.hidden = true;
    r.list.forEach(([m, k]) => { m.setMatrixAt(k, ZERO); m.instanceMatrix.needsUpdate = true; });
    return true;
  };
  view.showAllTrees = () => {
    forest.refs.forEach((r) => { if (!r.hidden) return; r.hidden = false; r.list.forEach(([m, k]) => { m.setMatrixAt(k, r.m4); m.instanceMatrix.needsUpdate = true; }); });
  };
  // time of day: 0 dawn … 1 sunset
  const C = (h) => new THREE.Color(h);
  const K = {
    sunWarm: C('#ff9a55'), sunDay: C('#fff0d8'), skyDay: C('#cfe6ff'), skyWarm: C('#ffc7a0'), gDay: C('#5a6a40'), gWarm: C('#5a4a3a'),
    fogDay: C('#b9d3e6'), fogWarm: C('#e8b48a'), fogMorn: C('#d6dde6'), wSky: C('#bfe0f2'), wWarm: C('#f2c49a'), cloudDay: C('#ffffff'), cloudWarm: C('#ffc69a'),
  };
  const out = { sunColor: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), fog: new THREE.Color(), sunInt: 3, hemiInt: 0.55, exposure: 0.66, env: 0.55 };
  view.setTimeOfDay = (tod) => {
    const el = (Math.max(2, 26 + 38 * Math.sin(Math.PI * tod) - 28 * tod) * Math.PI) / 180;
    const az = -1.9 + tod * 3.2;
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    const su = sky.mesh.material.uniforms;
    su.sunPosition.value.copy(sunDir).multiplyScalar(1000);
    const warm = 1 - smooth01((el * 180) / Math.PI / 40); // 1 when the sun is low
    const eve = warm * (tod > 0.5 ? 1 : 0.45); // evenings are much warmer than mornings
    su.rayleigh.value = 1.4 + eve * 1.6; su.turbidity.value = 4.5 + eve * 4; su.mieCoefficient.value = 0.004 + eve * 0.006;
    out.sunColor.copy(K.sunDay).lerp(K.sunWarm, eve * 0.9 + warm * 0.15);
    out.sunInt = 1.4 + 2.3 * smooth01((el * 180) / Math.PI / 30);
    out.sky.copy(K.skyDay).lerp(K.skyWarm, eve * 0.7);
    out.ground.copy(K.gDay).lerp(K.gWarm, eve * 0.6);
    out.hemiInt = 0.5 - eve * 0.12;
    out.fog.copy(K.fogDay).lerp(K.fogWarm, eve * 0.8).lerp(K.fogMorn, tod < 0.3 ? warm * 0.5 : 0);
    out.exposure = 0.66 + eve * 0.12;
    out.env = 0.55 - eve * 0.2;
    wu.skyc.value.copy(K.wSky).lerp(K.wWarm, eve * 0.75);
    wu.sunc.value.copy(out.sunColor);
    clouds.children.forEach((c) => c.material.color.copy(K.cloudDay).lerp(K.cloudWarm, eve * 0.85));
    mist.userData.k = tod < 0.35 ? 1 - tod / 0.35 * 0.75 : 0.25 + eve * 0.35;
    return out;
  };
  view.update = (dt, cam) => {
    // clouds drift on the wind and wrap around
    clouds.children.forEach((c) => { c.position.x += dt * c.userData.w; if (c.position.x > 1900) c.position.x = -1900; });
    birds.update(dt, cam);
    mist.children.forEach((m) => { m.material.opacity = m.userData.o * mist.userData.k * (0.8 + Math.sin(uniforms.time.value * 0.2 + m.userData.ph) * 0.2); m.position.x = m.userData.x + Math.sin(uniforms.time.value * 0.05 + m.userData.ph) * 8; });
  };
  return view;
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// ── the river: it follows the land downhill into the crater lake, tumbling over a waterfall ──
function buildRiver(island, uniforms) {
  // trace water downhill from springs on the mountain slopes; keep the run with the best waterfall that
  // reaches the sea or a lake
  let peak = [0, 0]; let ph = -1;
  for (let x = -600; x <= 600; x += 12) for (let z = -600; z <= 600; z += 12) { const h = island.height(x, z); if (h > ph) { ph = h; peak = [x, z]; } }
  const trace = (sx, sz) => {
    const path = [];
    let x = sx; let z = sz; let h = island.height(x, z);
    let dir = Math.atan2(z - peak[1], x - peak[0]);
    for (let n = 0; n < 420; n++) {
      path.push([x, Math.max(h, 0.15), z]);
      if (h < 0.2) return path;
      let bx = 0; let bz = 0; let bs = Infinity; let bd = dir; let bh = h;
      for (let k = -4; k <= 4; k++) {
        const d = dir + k * 0.2; const nx = x + Math.cos(d) * 3; const nz = z + Math.sin(d) * 3;
        const nh = island.height(nx, nz);
        const score = nh + Math.abs(k) * 0.08;
        if (score < bs) { bs = score; bx = nx; bz = nz; bd = d; bh = nh; }
      }
      if (bh > h + 0.4) return null; // a hollow with no way out
      x = bx; z = bz; dir = bd; h = bh;
    }
    return null;
  };
  let best = null; let bestScore = 0;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    for (const r of [60, 90, 120]) {
      const p = trace(peak[0] + Math.cos(a) * r, peak[1] + Math.sin(a) * r);
      if (!p || p.length < 30) continue;
      let drop = 0;
      for (let i = 2; i < p.length; i++) drop = Math.max(drop, (p[i - 2][1] - p[i][1]) / 6);
      const sc = drop * 10 + Math.min(p.length, 200) * 0.02;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
  }
  if (!best) return null;
  const path = best;
  if (path.length < 20) return null;
  // smooth it a little
  for (let it = 0; it < 3; it++) for (let i = 1; i < path.length - 1; i++) { path[i][0] = (path[i - 1][0] + path[i][0] * 2 + path[i + 1][0]) / 4; path[i][2] = (path[i - 1][2] + path[i][2] * 2 + path[i + 1][2]) / 4; }
  path.forEach((p) => { p[1] = Math.max(0.15, island.height(p[0], p[2])); });
  // ribbon geometry: width grows downstream; steep stretches turn to white water
  const pos = []; const uv = []; const steep = []; const idx = [];
  let along = 0; let falls = null; let maxDrop = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]; const q = path[Math.min(path.length - 1, i + 1)]; const o = path[Math.max(0, i - 1)];
    const dx = q[0] - o[0]; const dz = q[2] - o[2]; const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L; const nz = dx / L;
    const w = 1.6 + (i / path.length) * 3.2;
    const drop = Math.max(0, (o[1] - q[1]) / Math.max(1, Math.hypot(q[0] - o[0], q[2] - o[2])));
    if (drop > maxDrop && p[1] > 2) { maxDrop = drop; falls = [p[0], p[1], p[2]]; }
    if (i) along += Math.hypot(p[0] - path[i - 1][0], p[2] - path[i - 1][2]);
    for (const s of [-1, 1]) {
      const X = p[0] + nx * w * s; const Z = p[2] + nz * w * s;
      pos.push(X, Math.max(p[1], island.height(X, Z)) + 0.35 + Math.min(1.5, drop * 1.2), Z);
      uv.push(s < 0 ? 0 : 1, along / 8);
      steep.push(Math.min(1, drop * 1.6));
    }
    if (i < path.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('steep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: { time: uniforms.time, ...THREE.UniformsLib.fog },
    vertexShader: `attribute float steep; varying vec2 vUv; varying float vS;
#include <fog_pars_vertex>
      void main(){ vUv = uv; vS = steep; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying float vS;
#include <fog_pars_fragment>
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float speed = 1.2 + vS * 5.0;
        vec2 q = vec2(vUv.x * 6.0, vUv.y * 3.0 - time * speed);
        float streak = n2(q * vec2(1.0, 0.4)) * 0.6 + n2(q * 2.7) * 0.4;
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        vec3 water = mix(vec3(0.12, 0.36, 0.42), vec3(0.3, 0.6, 0.66), streak);
        float foam = smoothstep(0.62, 0.95, streak + vS * 0.25) + (1.0 - edge) * 0.3;
        vec3 col = mix(water, vec3(0.82, 0.9, 0.94), clamp(foam, 0.0, 1.0) * (0.3 + vS * 0.4));
        gl_FragColor = vec4(col, (0.72 + vS * 0.2) * max(edge, 0.25));
#include <fog_fragment>
#include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  mesh.name = 'river';
  return { mesh, path, falls };
}

// ── morning mist over the lake and the low valleys ──
function buildMist(island) {
  const g = new THREE.Group();
  const t = TX.smokeTex();
  const rnd = mulberry32(31);
  let n = 0;
  for (let k = 0; k < 600 && n < 34; k++) {
    const x = (rnd() - 0.5) * 1200; const z = (rnd() - 0.5) * 1200;
    const h = island.height(x, z);
    if (h > 9 || h < -9 || Math.hypot(x, z) > 640) continue;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: 0xf2f6fa, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(x, Math.max(h, 0) + 4 + rnd() * 3, z);
    const s = 60 + rnd() * 80; m.scale.set(s, s * 0.22, 1);
    m.userData = { o: 0.35 + rnd() * 0.25, ph: rnd() * 6, x };
    g.add(m); n++;
  }
  g.userData.k = 1;
  g.name = 'mist';
  return g;
}

// ── flocks of birds wheeling over the island ──
class Birds {
  constructor(group, island, uniforms) {
    const geo = new THREE.BufferGeometry();
    // a body and two wings; the wings flap in the vertex shader
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.35, -1, 0.05, 0.1, 0, 0, 0.25, 0, 0, -0.35, 0, 0, 0.25, 1, 0.05, 0.1], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x1c1a1a, side: THREE.DoubleSide, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = uniforms.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;\ntransformed.y += abs(position.x) * sin(time * 9.0 + ph) * 0.7;');
    };
    this.n = 42;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
    const rnd = mulberry32(5);
    this.flocks = [0, 1, 2].map(() => ({ c: [(rnd() - 0.5) * 900, 0, (rnd() - 0.5) * 900], r: 50 + rnd() * 90, h: 60 + rnd() * 60, a: rnd() * 6, s: (0.08 + rnd() * 0.08) * (rnd() < 0.5 ? -1 : 1), drift: [(rnd() - 0.5) * 4, (rnd() - 0.5) * 4] }));
    this.off = Array.from({ length: this.n }, () => [(rnd() - 0.5) * 18, (rnd() - 0.5) * 6, (rnd() - 0.5) * 18, rnd() * 6]);
    this.island = island;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1.4, 1.4, 1.4); this.up = new THREE.Vector3(0, 1, 0);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.flocks.forEach((f) => { f.a += f.s * dt; f.c[0] += f.drift[0] * dt; f.c[2] += f.drift[1] * dt; if (Math.abs(f.c[0]) > 600) f.drift[0] *= -1; if (Math.abs(f.c[2]) > 600) f.drift[1] *= -1; });
    for (let i = 0; i < this.n; i++) {
      const f = this.flocks[i % 3]; const o = this.off[i];
      const a = f.a + o[3] * 0.05;
      const x = f.c[0] + Math.cos(a) * f.r + o[0] + Math.sin(this.t * 0.7 + o[3]) * 3;
      const z = f.c[2] + Math.sin(a) * f.r + o[2];
      const y = Math.max(this.island.height(x, z) + 25, f.h) + o[1] + Math.sin(this.t + o[3]) * 2;
      this.q.setFromAxisAngle(this.up, -a + (f.s > 0 ? Math.PI : 0));
      this.m4.compose(this.p.set(x, y, z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ── terrain ──
function buildTerrain(island, quality, uniforms) {
  const step = quality === 'low' ? 2 : 1;
  const N = Math.round(Math.sqrt(island.H.length));
  const n = Math.floor((N - 1) / step) + 1;
  const cell = WORLD.size / (N - 1);
  const pos = new Float32Array(n * n * 3); const nor = new Float32Array(n * n * 3); const spl = new Float32Array(n * n * 4);
  const rnd = mulberry32(7);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -WORLD.half + i * step * cell; const z = -WORLD.half + j * step * cell;
    const h = island.H[(j * step) * N + i * step];
    const k = j * n + i;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const nm = island.normal(x, z);
    nor[k * 3] = nm[0]; nor[k * 3 + 1] = nm[1]; nor[k * 3 + 2] = nm[2];
    // weights: sand by the sea, rock on steep slopes and high up, snow on the peaks, grass elsewhere
    const jit = (rnd() - 0.5) * 1.4;
    let sand = clamp01((2.4 + jit * 0.6 - h) / 1.2);
    let rock = clamp01((0.86 - nm[1]) / 0.1) + clamp01((h - 66 + jit * 4) / 12);
    let snow = clamp01((h - 88 + jit * 6) / 10) * clamp01((nm[1] - 0.62) / 0.12);
    rock = clamp01(rock - snow);
    sand *= 1 - rock;
    let grass = clamp01(1 - sand - rock - snow);
    const t = grass + rock + sand + snow || 1;
    grass /= t; rock /= t; sand /= t; snow /= t;
    spl[k * 4] = grass; spl[k * 4 + 1] = rock; spl[k * 4 + 2] = sand; spl[k * 4 + 3] = snow;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; const b = a + 1; const c = a + n; const d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const gr = TX.ground('grass'); const rk = TX.ground('rock'); const sd = TX.ground('sand'); const sn = TX.ground('snow');
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tG: { value: gr.map }, tR: { value: rk.map }, tS: { value: sd.map }, tN: { value: sn.map }, nG: { value: gr.normal }, nR: { value: rk.normal }, nS: { value: sd.normal }, time: uniforms.time });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tG, tR, tS, tN, nG, nR, nS; uniform float time; varying vec4 vSplat; varying vec3 vWP;
vec3 tri(sampler2D t, vec2 uv){ return texture2D(t, uv).rgb * 0.6 + texture2D(t, uv * 0.23 + 0.31).rgb * 0.4; }`)
      .replace('#include <map_fragment>', `
vec2 uv = vWP.xz / 6.0;
vec2 uvR = vec2(vWP.x + vWP.z, vWP.y * 1.6) / 9.0;
vec3 cG = tri(tG, uv); vec3 cR = mix(tri(tR, uv * 0.7), tri(tR, uvR), 0.5); vec3 cS = tri(tS, uv * 1.4); vec3 cN = tri(tN, uv) * vec3(0.74, 0.77, 0.82);
float macro = texture2D(tG, vWP.xz / 230.0).g;
cG *= (0.78 + macro * 0.42) * vec3(0.92, 0.96, 0.86);
vec4 w = vSplat;
// break up the blend edges with the textures themselves
w.y += (cR.r - 0.45) * 0.6 * w.y; w.z += (cS.r - 0.75) * 0.5 * w.z;
w = max(w, 0.0); w /= max(w.x + w.y + w.z + w.w, 0.001);
vec3 col = cG * w.x + cR * w.y + cS * w.z + cN * w.w;
// under the sea: darker and bluer with depth; a wet band and moving foam at the waterline
float depth = clamp(-vWP.y / 6.0, 0.0, 1.0);
col = mix(col, col * vec3(0.22, 0.42, 0.5), smoothstep(0.0, 0.5, depth));
col *= 1.0 - smoothstep(0.6, -0.2, vWP.y) * 0.25 * (1.0 - depth);
float foam = smoothstep(0.55, 0.0, abs(vWP.y - 0.15 - sin(time * 0.9 + vWP.x * 0.05) * 0.25)) * (0.55 + 0.45 * sin(vWP.x * 0.8 + vWP.z * 0.6 + time * 2.0));
col = mix(col, vec3(0.92, 0.95, 0.96), foam * 0.55);
// shadows of drifting clouds
float cs = texture2D(tR, vWP.xz / 900.0 + vec2(time * 0.0045, time * 0.002)).r * 0.6 + texture2D(tG, vWP.xz / 1300.0 - vec2(time * 0.003, 0.0)).g * 0.4;
col *= 1.0 - smoothstep(0.5, 0.68, cs) * 0.3;
diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `
vec3 nm = (texture2D(nG, uv).xyz * 2.0 - 1.0) * w.x + (texture2D(nR, uvR).xyz * 2.0 - 1.0) * w.y + (texture2D(nS, uv * 1.4).xyz * 2.0 - 1.0) * w.z;
normal = normalize(normal + (viewMatrix * vec4(nm.x, 0.0, nm.y, 0.0)).xyz * 0.9);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.4, smoothstep(0.6, -0.3, vWP.y)) - w.w * 0.25;');
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.castShadow = quality === 'high';
  m.name = 'terrain';
  return m;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── sea ──
function buildWater(uniforms, sunDir) {
  const g = new THREE.PlaneGeometry(30000, 30000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { time: uniforms.time, sun: { value: sunDir }, sunc: { value: new THREE.Color('#fff2d9') }, deep: { value: new THREE.Color('#0d4a63') }, shallow: { value: new THREE.Color('#2a9bb0') }, skyc: { value: new THREE.Color('#bfe0f2') }, fogColor: { value: new THREE.Color('#cfe3ee') }, fogNear: { value: 400 }, fogFar: { value: 2600 } },
    vertexShader: 'varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float time; uniform vec3 sun, sunc, deep, shallow, skyc, fogColor; uniform float fogNear, fogFar; varying vec3 vW; varying float vD;
      vec2 wave(vec2 p, vec2 d, float f, float s, float a){ float ph = dot(p, d) * f + time * s; return d * cos(ph) * a * f; }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.11, 1.3, 0.35) + wave(p, normalize(vec2(-0.4, 1.0)), 0.17, 1.7, 0.22) + wave(p, normalize(vec2(0.7, -0.8)), 0.43, 2.6, 0.06) + wave(p, normalize(vec2(-0.9, -0.2)), 0.9, 3.4, 0.025) + wave(p, normalize(vec2(0.2, 0.9)), 1.7, 4.4, 0.012);
        float far = smoothstep(80.0, 900.0, vD);
        g *= 1.0 - far * 0.85;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.85 + 0.08;
        float distIsland = length(vW.xz);
        vec3 base = mix(shallow, deep, smoothstep(520.0, 760.0, distIsland));
        vec3 col = mix(base, skyc, fres);
        vec3 h = normalize(sun + v);
        col += sunc * pow(max(dot(n, h), 0.0), 220.0) * 2.2 + sunc * pow(max(dot(n, h), 0.0), 40.0) * 0.12 * (1.0 - sun.y);
        col += vec3(0.6, 0.75, 0.8) * pow(max(dot(n, h), 0.0), 18.0) * 0.06;
        float f = smoothstep(fogNear, fogFar, vD);
        gl_FragColor = vec4(mix(col, fogColor, f), mix(0.86, 0.97, fres));
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.y = 0.05;
  m.renderOrder = 1;
  m.name = 'water';
  m.userData.mat = mat;
  return m;
}

// ── trees ──
function windify(mat, uniforms, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = uniforms.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float time;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec4 ip = instanceMatrix[3];
      float sway = sin(time * 1.3 + ip.x * 0.07 + ip.z * 0.05) + sin(time * 2.7 + ip.x * 0.2) * 0.3;
      float hgt = max(transformed.y - 1.5, 0.0);
      transformed.x += sway * hgt * hgt * ${amount.toFixed(4)};
      transformed.z += sway * hgt * hgt * ${(amount * 0.6).toFixed(4)};
      #endif`);
  };
  return mat;
}
function sphUV(g) { const p = g.attributes.position; const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getX(i), p.getZ(i)) * 0.9; uv[i * 2 + 1] = p.getY(i) * 0.6; } return new THREE.BufferAttribute(uv, 2); }
function treeGeos() {
  const rnd = mulberry32(5);
  const displace = (g, amt, seed) => {
    const r = mulberry32(seed); const p = g.attributes.position; const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!map.has(key)) map.set(key, (r() - 0.5) * amt);
      const d = map.get(key); const l = Math.hypot(p.getX(i), p.getZ(i)) || 1;
      p.setXYZ(i, p.getX(i) + (p.getX(i) / l) * d, p.getY(i) + d * 0.4, p.getZ(i) + (p.getZ(i) / l) * d);
    }
    g.computeVertexNormals();
    return g;
  };
  // pine: bark trunk and four needle tiers
  const pineT = new THREE.CylinderGeometry(0.16, 0.32, 8, 8); pineT.translate(0, 4, 0);
  const pineL = [];
  for (let k = 0; k < 4; k++) {
    const r = 2.6 - k * 0.55; const h = 3.4 - k * 0.4;
    const c = new THREE.ConeGeometry(r, h, 11, 3, true); displace(c, 0.5, 10 + k);
    c.translate(0, 2.4 + k * 1.75 + h / 2, 0);
    tint(c, ['#4f7a52', '#5a885a', '#64925e', '#6e9c66'][k]);
    pineL.push(c);
  }
  // oak: forked trunk and leafy clumps
  const oakT = [new THREE.CylinderGeometry(0.22, 0.4, 4.2, 9)];
  oakT[0].translate(0, 2.1, 0);
  [[0.6, 0.6], [-0.7, 0.2], [0.1, -0.7]].forEach(([x, z]) => { const b = new THREE.CylinderGeometry(0.08, 0.16, 2.8, 6); b.translate(0, 1.4, 0); b.rotateZ(-x * 0.7); b.rotateX(z * 0.7); b.translate(0, 3.6, 0); oakT.push(b); });
  const oakL = [];
  const clumps = [[0, 6.2, 0, 2.4], [1.5, 5.4, 0.6, 1.8], [-1.6, 5.6, 0.3, 1.9], [0.3, 5.2, -1.6, 1.8], [-0.4, 7.3, 0.4, 1.7], [0.9, 6.6, 1.3, 1.5], [-1, 4.6, -0.9, 1.4]];
  clumps.forEach(([x, y, z, r], k) => { let s = new THREE.IcosahedronGeometry(r, 2); s.deleteAttribute('uv'); s.deleteAttribute('normal'); s = mergeVertices(s); displace(s, 0.5, 30 + k); s.setAttribute('uv', sphUV(s)); s.translate(x, y, z); tint(s, ['#7aa860', '#86b468', '#92bc6c', '#749e58'][k % 4]); oakL.push(s); });
  // leaf cards scattered over the oak's clumps break up its silhouette
  const oakC = []; const cr = mulberry32(77);
  clumps.forEach(([x, y, z, r]) => {
    for (let k = 0; k < 9; k++) {
      const a = cr() * Math.PI * 2; const u = cr() * 2 - 1; const rr = r * (0.9 + cr() * 0.25);
      const px = x + Math.cos(a) * Math.sqrt(1 - u * u) * rr; const py = y + u * rr * 0.9; const pz = z + Math.sin(a) * Math.sqrt(1 - u * u) * rr;
      const q = new THREE.PlaneGeometry(1.5, 1.5);
      q.lookAt(new THREE.Vector3(px - x, py - y, pz - z));
      q.rotateZ(cr() * 3);
      q.translate(px, py, pz);
      tint(q, cr() < 0.5 ? '#92bc6c' : '#a2c878');
      oakC.push(q);
    }
  });
  // palm: curved ringed trunk and drooping fronds
  const palmT = []; let px = 0; let py = 0;
  for (let k = 0; k < 8; k++) { const seg = 1.05; const a = k * 0.045; const c = new THREE.CylinderGeometry(0.17 - k * 0.008, 0.21 - k * 0.008, seg, 8); c.rotateZ(-a); c.translate(px, py + seg / 2, 0); palmT.push(c); px += Math.sin(a) * seg; py += Math.cos(a) * seg; }
  const palmL = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2; const L = 3.4 + rnd() * 0.6; const segs = 8; const pts = []; const uv = []; const ix = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; const y = Math.sin(t * 2.2) * 1.0 - t * t * 2.4; const w = 0.55 * Math.sin(Math.min(1, t * 1.3 + 0.1) * Math.PI); pts.push(-w, y + w * 0.25, t * L, w, y + w * 0.25, t * L, 0, y - 0.05, t * L); uv.push(0, t, 1, t, 0.5, t); if (i < segs) { const b = i * 3; ix.push(b, b + 2, b + 3, b + 3, b + 2, b + 5, b + 2, b + 1, b + 5, b + 1, b + 4, b + 5); } }
    const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); f.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); f.setIndex(ix); f.computeVertexNormals();
    f.rotateY(a); f.translate(px, py, 0); tint(f, k % 2 ? '#4c7d2c' : '#5a8c34'); palmL.push(f);
  }
  return {
    pine: { trunk: mergeAll([pineT]), leaf: mergeAll(pineL, true) },
    oak: { trunk: mergeAll(oakT), leaf: mergeAll(oakL, true), cards: mergeAll(oakC, true) },
    palm: { trunk: mergeAll(palmT), leaf: mergeAll(palmL, true) },
  };
}
function buildForest(island, quality, uniforms) {
  const group = new THREE.Group();
  const geos = treeGeos();
  const bk = TX.bark();
  const trunkMat = windify(new THREE.MeshStandardMaterial({ map: bk.map, normalMap: bk.normal, roughness: 0.95 }), uniforms, 0.002);
  const leafMats = {
    pine: windify(new THREE.MeshStandardMaterial({ map: TX.leaves('pine'), vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), uniforms, 0.004),
    oak: windify(new THREE.MeshStandardMaterial({ map: TX.leaves('oak'), vertexColors: true, roughness: 0.8 }), uniforms, 0.005),
    palm: windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 }), uniforms, 0.01),
  };
  const cardMat = windify(new THREE.MeshStandardMaterial({ map: TX.leafCard(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), uniforms, 0.005);
  // chunks so off-screen forests are culled
  const C = 4; const size = WORLD.size / C;
  const buckets = new Map();
  const list = quality === 'low' ? island.trees.filter((t, i) => i % 2 === 0) : island.trees;
  list.forEach((t) => {
    const key = `${Math.floor((t.x + WORLD.half) / size)}|${Math.floor((t.z + WORLD.half) / size)}|${t.kind}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  });
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(); const p = new THREE.Vector3(); const col = new THREE.Color();
  const refs = new Map();
  buckets.forEach((arr, key) => {
    const kind = key.split('|')[2];
    const G = geos[kind];
    const cm = G.cards ? new THREE.InstancedMesh(G.cards, cardMat, arr.length) : null;
    const tm = new THREE.InstancedMesh(G.trunk, trunkMat, arr.length);
    const lm = new THREE.InstancedMesh(G.leaf, leafMats[kind], arr.length);
    arr.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r * Math.PI * 2);
      s.setScalar(t.s); p.set(t.x, t.y - 0.25, t.z);
      m4.compose(p, q, s);
      tm.setMatrixAt(i, m4); lm.setMatrixAt(i, m4); if (cm) cm.setMatrixAt(i, m4);
      refs.set(t.i, { m4: m4.clone(), list: [[tm, i], [lm, i], ...(cm ? [[cm, i]] : [])], hidden: false });
      col.setHSL(0.08 * (t.r - 0.5), 0.05, 0.85 + t.r * 0.3);
      lm.setColorAt(i, col);
    });
    [tm, lm, cm].filter(Boolean).forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); });
  });
  return { group, refs };
}

// ── spires and mesas: layered sandstone, flat-shaded, with an ink outline like a painted backdrop ──
function buildSpires(island) {
  const g = new THREE.Group();
  if (!island.spires || !island.spires.length) return g;
  const geos = [];
  const bands = ['#b8774a', '#c98e5a', '#a8623a', '#d6a46e', '#9a5634', '#c4844e'].map((h) => new THREE.Color(h));
  island.spires.forEach((sp) => {
    const rnd = mulberry32(sp.seed);
    const seg = sp.mesa ? 13 : 9; const rows = sp.mesa ? 7 : 10;
    const geo = new THREE.CylinderGeometry(1, 1, 1, seg, rows, false);
    const p = geo.attributes.position;
    const jit = Array.from({ length: seg + 1 }, () => 0.82 + rnd() * 0.36);
    const rowJ = Array.from({ length: rows + 1 }, () => 0.9 + rnd() * 0.2);
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i) + 0.5; const z = p.getZ(i);
      const r0 = Math.hypot(x, z);
      const a = Math.atan2(z, x); const ai = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg) % seg;
      const row = Math.round(y * rows);
      // taper: mesas stay wide with a slight flare at the top; spires narrow to a jagged tip
      const taper = sp.mesa ? 1 - y * 0.12 + (y > 0.92 ? 0.05 : 0) : 1 - Math.pow(y, 1.3) * 0.7;
      const rr = r0 > 0.01 ? sp.r * taper * jit[ai] * rowJ[row] : 0;
      const yy = y * sp.h + (r0 < 0.01 && !sp.mesa && y > 0.9 ? sp.h * 0.06 : 0);
      p.setXYZ(i, Math.cos(a) * rr + Math.sin(sp.ry) * sp.lean * yy, yy, Math.sin(a) * rr + Math.cos(sp.ry) * sp.lean * yy);
      // strata
      const b = bands[Math.floor((yy / 3.2 + sp.seed % 5)) % bands.length];
      const sh = 0.9 + rnd() * 0.12;
      cols[i * 3] = b.r * sh; cols[i * 3 + 1] = b.g * sh; cols[i * 3 + 2] = b.b * sh;
      if (sp.mesa && y > 0.99) { cols[i * 3] = 0.45; cols[i * 3 + 1] = 0.55; cols[i * 3 + 2] = 0.3; } // grassy top
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.rotateY(sp.ry);
    geo.translate(sp.x, sp.y, sp.z);
    geos.push(geo);
  });
  const merged = mergeAll(geos, true);
  merged.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, map: TX.ground('rock').map });
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  // ink outline (the same shapes pushed out a little along their normals)
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a120c, side: THREE.BackSide });
  ink.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.18;'); };
  const sm = new THREE.BufferGeometry(); sm.setAttribute('position', merged.attributes.position.clone());
  const sn = mergeVertices(sm, 0.05); sn.computeVertexNormals();
  g.add(new THREE.Mesh(sn, ink));
  return g;
}

// ── boulders ──
function buildRocks(island, quality) {
  const group = new THREE.Group();
  const rk = TX.ground('rock');
  const mat = new THREE.MeshStandardMaterial({ map: rk.map, normalMap: rk.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92, color: 0xd8d2c8 });
  const variants = [0, 1, 2, 3].map((v) => {
    const g = new THREE.IcosahedronGeometry(1, quality === 'low' ? 1 : 2);
    const r = mulberry32(100 + v); const p = g.attributes.position; const map = new Map();
    const sx = 1 + r() * 0.5; const sz = 0.8 + r() * 0.5; const sy = 0.6 + r() * 0.35;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!map.has(key)) map.set(key, 1 + (Math.sin(x * 5.1 + v) * Math.sin(y * 4.3 + v * 2) * Math.sin(z * 4.7) * 0.18) + (r() - 0.5) * 0.06);
      const k = map.get(key);
      p.setXYZ(i, x * k * sx, Math.max(-0.35, y * k) * sy, z * k * sz);
    }
    g.computeVertexNormals();
    // planar uvs
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.6; uv[i * 2 + 1] = p.getY(i) * 0.6; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
  const by = [[], [], [], []];
  island.rocks.forEach((r) => by[r.seed % 4].push(r));
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
  by.forEach((arr, v) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(variants[v], mat, arr.length);
    arr.forEach((r, i) => { e.set(0, (r.seed % 628) / 100, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.r, r.r, r.r)); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

// ── houses and landmarks ──
function gableRoof(w, d, h, over = 0.4) {
  const W = w / 2 + over; const D = d / 2 + over;
  const v = [
    -W, 0, -D, W, 0, -D, 0, h, -D, // gable ends
    W, 0, D, -W, 0, D, 0, h, D,
    -W, 0, D, -W, 0, -D, 0, h, -D, -W, 0, D, 0, h, -D, 0, h, D, // slopes
    W, 0, -D, W, 0, D, 0, h, D, W, 0, -D, 0, h, D, 0, h, -D,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length; i += 3) { const x = v[i]; const y = v[i + 1]; const z = v[i + 2]; uv.push((i < 18 ? x : z) / 3, (i < 18 ? y : Math.hypot(Math.abs(x) - W, y)) / 3); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function boxWithUV(w, h, d, su, sv) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i));
    const u = uv.getX(i); const vv = uv.getY(i);
    uv.setXY(i, u * (ax > 0.5 ? d : w) / su, vv * (ay > 0.5 ? d : h) / sv);
  }
  return g;
}
function buildTowns(island) {
  const group = new THREE.Group();
  const walls = {}; const roofs = {}; const doors = []; const trims = []; const sills = []; const frames = [];
  const put = (store, key, g) => { (store[key] = store[key] || []).push(g); };
  for (const b of island.buildings) {
    const tr = (g) => { g.rotateY(b.ry); g.translate(b.x, b.y, b.z); return g; };
    const style = b.style;
    const storeys = Math.max(1, Math.round(b.h / 3.2));
    const wall = boxWithUV(b.w, b.h + 0.6, b.d, 4, (b.h + 0.6) / storeys);
    wall.translate(0, (b.h + 0.6) / 2, 0);
    put(walls, style, tr(wall));
    // stone sills and lintels under and over every painted window, so facades have real relief
    if (style !== 'barn' && style !== 'hut') {
      const sh = (b.h + 0.6) / storeys;
      // [normal axis, sign, face width, u direction] for the four walls (BoxGeometry's uv layout)
      [[2, 1, b.w, 1], [2, -1, b.w, -1], [0, 1, b.d, -1], [0, -1, b.d, 1]].forEach(([ax, sg, fw, ud]) => {
        for (let k = 0; (k + 0.5) * 4 + 0.5 <= fw; k++) {
          const along = (-fw / 2 + (k + 0.5) * 4) * ud;
          for (let st = 0; st < storeys; st++) {
            if (st === 0 && ax === 2 && sg === 1 && Math.abs(along) < 1.3) continue; // the door
            const yb = st * sh + sh * 0.35; const yt = st * sh + sh * 0.74;
            const mk = (gw, gh, gd, y, out) => {
              const g = ax === 2 ? new THREE.BoxGeometry(gw, gh, gd) : new THREE.BoxGeometry(gd, gh, gw);
              const off = (ax === 2 ? b.d : b.w) / 2 + out;
              if (ax === 2) g.translate(along, y, sg * off); else g.translate(sg * off, y, along);
              return tr(g);
            };
            sills.push(mk(1.3, 0.1, 0.22, yb - 0.04, 0.08));
            sills.push(mk(1.2, 0.14, 0.12, yt + 0.06, 0.04));
            // a thin frame around the glass
            frames.push(mk(0.06, yt - yb, 0.08, (yb + yt) / 2, 0.02).translate(0, 0, 0));
          }
        }
      });
    }
    // door on the front face, with a frame and a step
    const door = new THREE.BoxGeometry(1.2, 2.2, 0.12); door.translate(0, 0.6 + 1.1, b.d / 2 + 0.03); doors.push(tr(door));
    const dframe = new THREE.BoxGeometry(1.5, 2.45, 0.08); dframe.translate(0, 0.6 + 1.2, b.d / 2 + 0.005); sills.push(tr(dframe));
    const step = new THREE.BoxGeometry(1.8, 0.25, 0.7); step.translate(0, 0.6 - 0.12, b.d / 2 + 0.35); sills.push(tr(step));
    // base course
    const base = new THREE.BoxGeometry(b.w + 0.2, 0.7, b.d + 0.2); base.translate(0, 0.35, 0); trims.push(tr(base));
    const top = b.y + b.h + 0.6;
    if (b.roof === 'gable' || b.roof === 'barn') {
      const r = gableRoof(b.w, b.d, b.roof === 'barn' ? b.w * 0.45 : b.w * 0.38);
      r.translate(0, b.h + 0.6, 0);
      put(roofs, style === 'stone' ? 'slate' : b.roof === 'barn' ? 'metal' : 'tile', tr(r));
      // chimney
      if (b.roof === 'gable' && (b.x * 7) % 3 > 1) { const c = new THREE.BoxGeometry(0.7, 2.2, 0.7); c.translate(b.w * 0.25, b.h + 1.6, 0); trims.push(tr(c)); }
    } else if (b.roof === 'hut') {
      const r = new THREE.ConeGeometry(Math.hypot(b.w, b.d) / 2 + 0.6, 2.6, 4, 1, true); r.rotateY(Math.PI / 4); r.translate(0, b.h + 0.6 + 1.3, 0);
      put(roofs, 'thatch', tr(r));
    } else if (b.roof === 'dome') {
      const r = new THREE.SphereGeometry(Math.min(b.w, b.d) / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); r.translate(0, b.h + 0.6, 0);
      put(roofs, 'metal', tr(r));
    } else {
      // flat roof with a parapet and rooftop units
      const r = new THREE.BoxGeometry(b.w + 0.3, 0.5, b.d + 0.3); r.translate(0, b.h + 0.85, 0); trims.push(tr(r));
      const u = new THREE.BoxGeometry(1.6, 1, 1.2); u.translate(b.w * 0.2, b.h + 1.6, -b.d * 0.15); trims.push(tr(u));
    }
    void top;
  }
  const facades = Object.fromEntries(Object.keys(walls).map((s) => [s, new THREE.MeshStandardMaterial({ map: TX.facade(s), roughness: 0.9 })]));
  Object.entries(walls).forEach(([s, l]) => { const m = new THREE.Mesh(mergeAll(l), facades[s]); m.castShadow = true; m.receiveShadow = true; group.add(m); });
  Object.entries(roofs).forEach(([k, l]) => { const t = TX.roofTex(k); const m = new THREE.Mesh(mergeAll(l), new THREE.MeshStandardMaterial({ map: t, roughness: k === 'metal' ? 0.5 : 0.85, metalness: k === 'metal' ? 0.5 : 0, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; group.add(m); });
  if (doors.length) group.add(new THREE.Mesh(mergeAll(doors), new THREE.MeshStandardMaterial({ map: TX.planks(), color: 0x8a5a3a, roughness: 0.7 })));
  if (sills.length) { const m = new THREE.Mesh(mergeAll(sills), new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 0.85, map: TX.ground('rock').map })); m.castShadow = true; m.receiveShadow = true; group.add(m); }
  if (frames.length) group.add(new THREE.Mesh(mergeAll(frames), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 })));
  if (trims.length) { const m = new THREE.Mesh(mergeAll(trims), new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.9, map: TX.ground('rock').map })); m.castShadow = true; m.receiveShadow = true; group.add(m); }
  group.add(buildLandmarks(island));
  return group;
}

function buildLandmarks(island) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.9, map: TX.ground('rock').map });
  const wood = new THREE.MeshStandardMaterial({ map: TX.planks(), roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff1b0, emissiveIntensity: 3 });
  const hay = new THREE.MeshStandardMaterial({ color: 0xd8b860, roughness: 1, map: TX.roofTex('thatch') });
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const piers = []; const posts = [];
  for (const p of island.props) {
    switch (p.t) {
      case 'pier': {
        const d = new THREE.BoxGeometry(6, 0.3, 9.2); d.translate(p.x, 1.55, p.z); piers.push(d);
        [-2.6, 2.6].forEach((dx) => [-4, 4].forEach((dz) => { const c = new THREE.CylinderGeometry(0.18, 0.2, 4, 7); c.translate(p.x + dx, -0.4, p.z + dz); posts.push(c); }));
        break;
      }
      case 'silo': add(new THREE.CylinderGeometry(3.2, 3.2, 14, 24), metal, p.x, p.y + 7, p.z); add(new THREE.SphereGeometry(3.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, p.x, p.y + 14, p.z); break;
      case 'hay': { const y = island.height(p.x, p.z); const h = add(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16), hay, p.x, y + 0.75, p.z); h.rotation.z = Math.PI / 2; h.rotation.y = p.x; break; }
      case 'lighthouse': {
        // striped tapering tower, gallery, glowing lantern, red cap
        const segs = 6;
        for (let k = 0; k < segs; k++) add(new THREE.CylinderGeometry(3.4 - (k + 1) * 0.28, 3.4 - k * 0.28, 22 / segs, 24), k % 2 ? red : white, p.x, p.y + 22 / segs * (k + 0.5), p.z);
        add(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 24), metal, p.x, p.y + 22.2, p.z);
        add(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 16), glow, p.x, p.y + 23.6, p.z, false);
        add(new THREE.ConeGeometry(1.8, 1.8, 16), red, p.x, p.y + 25.7, p.z);
        const light = new THREE.PointLight(0xfff1b0, 40, 60, 2); light.position.set(p.x, p.y + 23.6, p.z); g.add(light);
        break;
      }
      case 'temple': {
        add(new THREE.BoxGeometry(22, 2, 22), stone, p.x, p.y + 1, p.z);
        add(new THREE.BoxGeometry(14, 2, 14), stone, p.x, p.y + 3, p.z);
        add(new THREE.BoxGeometry(8, 3, 8), stone, p.x, p.y + 5.5, p.z);
        [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(([dx, dz]) => add(new THREE.CylinderGeometry(0.45, 0.5, 3.5, 12), stone, p.x + dx, p.y + 8.7, p.z + dz));
        add(new THREE.BoxGeometry(8.6, 0.8, 8.6), stone, p.x, p.y + 10.8, p.z);
        break;
      }
      case 'column': {
        const c = add(new THREE.CylinderGeometry(0.8, 0.9, p.h, 14), stone, p.x, p.y + p.h / 2 - 0.3, p.z);
        c.rotation.z = (p.x % 3) * 0.04;
        if (p.h > 6) add(new THREE.BoxGeometry(2, 0.6, 2), stone, p.x, p.y + p.h - 0.2, p.z);
        break;
      }
      case 'mast': {
        // lattice tower: four legs with cross braces, dishes, a red beacon
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          const leg = add(new THREE.CylinderGeometry(0.12, 0.18, 30, 6), metal, p.x + Math.cos(a) * 1.0, p.y + 15, p.z + Math.sin(a) * 1.0);
          leg.rotation.set(Math.sin(a) * 0.035, 0, -Math.cos(a) * 0.035);
        }
        for (let y = 2; y < 29; y += 3) add(new THREE.TorusGeometry(1.1 - y * 0.012, 0.06, 4, 4), metal, p.x, p.y + y, p.z).rotation.set(Math.PI / 2, 0, Math.PI / 4);
        [10, 18].forEach((y, i) => { const d = add(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), white, p.x + (i ? -1.2 : 1.2), p.y + y, p.z); d.rotation.z = i ? 1.3 : -1.3; });
        add(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2020, emissiveIntensity: 4 }), p.x, p.y + 30.4, p.z, false);
        break;
      }
      case 'tank': add(new THREE.CylinderGeometry(2.2, 2.2, 6, 24), white, p.x, p.y + 3, p.z); add(new THREE.SphereGeometry(2.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, p.x, p.y + 6, p.z); break;
      default: break;
    }
  }
  if (piers.length) { const m = new THREE.Mesh(mergeAll(piers), wood); m.receiveShadow = true; m.castShadow = true; g.add(m); }
  if (posts.length) g.add(new THREE.Mesh(mergeAll(posts), wood));
  return g;
}

// ── sky and clouds ──
function buildSky(sunDir) {
  const sky = new Sky();
  sky.scale.setScalar(9000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir).multiplyScalar(1000);
  return { mesh: sky };
}
function buildClouds() {
  const g = new THREE.Group();
  const t = TX.smokeTex();
  const rnd = mulberry32(77);
  for (let k = 0; k < 70; k++) {
    const m = new THREE.SpriteMaterial({ map: t, color: 0xffffff, transparent: true, opacity: 0.5 + rnd() * 0.35, depthWrite: false, fog: false });
    const a = rnd() * Math.PI * 2; const r = 150 + rnd() * 1700;
    // big cumulus heaps: a few puffs clustered together
    const cx = Math.cos(a) * r; const cz = Math.sin(a) * r; const cy = 300 + rnd() * 200; const w = 2 + rnd() * 3;
    for (let j = 0; j < 3; j++) {
      const s = new THREE.Sprite(j ? m.clone() : m);
      s.position.set(cx + (rnd() - 0.5) * 160, cy + j * 25 + rnd() * 20, cz + (rnd() - 0.5) * 120);
      const sc = (140 + rnd() * 220) * (j ? 0.75 : 1); s.scale.set(sc * 1.7, sc * (0.55 + j * 0.12), 1);
      s.userData.w = w;
      g.add(s);
    }
  }
  g.name = 'clouds';
  return g;
}

// ── grass tufts that follow the player: thousands of crossed blade cards on grassy ground ──
export class GrassField {
  constructor(scene, island, uniforms, quality) {
    this.island = island;
    this.R = quality === 'high' ? 46 : 32;
    this.step = quality === 'high' ? 0.85 : 1.1;
    const n = Math.ceil((this.R * 2) / this.step);
    this.count = n * n;
    // blade card texture
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d'); const rnd = mulberry32(9);
    for (let k = 0; k < 110; k++) {
      const x = 6 + rnd() * 116; const h = 40 + rnd() * 80; const bend = (rnd() - 0.5) * 34; const w = 1.5 + rnd() * 2.5;
      const b = 0.7 + rnd() * 0.5;
      const gr = g.createLinearGradient(0, 128, 0, 128 - h);
      gr.addColorStop(0, `rgb(${70 * b | 0},${108 * b | 0},${40 * b | 0})`); gr.addColorStop(1, `rgb(${(120 + rnd() * 50) * b | 0},${(160 + rnd() * 40) * b | 0},${(70 + rnd() * 20) * b | 0})`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + bend * 0.4, 128 - h * 0.6, x + bend, 128 - h); g.quadraticCurveTo(x + bend * 0.4 + w * 0.3, 128 - h * 0.6, x + w, 128); g.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const planes = [];
    for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(0.8, 0.36); p.translate(0, 0.17, 0); p.rotateY((k / 3) * Math.PI); planes.push(p); }
    const geo = mergeAll(planes);
    // normals point up so the blades light like the ground under them
    const nm = geo.attributes.normal; for (let i = 0; i < nm.count; i++) nm.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xb8c898 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = uniforms.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix[3];
        float sw = sin(time * 2.1 + ip.x * 0.35 + ip.z * 0.21) * 0.6 + sin(time * 3.7 + ip.x * 0.9) * 0.25;
        transformed.x += sw * transformed.y * 0.22; transformed.z += sw * transformed.y * 0.12;`);
      // light both sides of the blades like the ground beneath them
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    // wildflowers scattered through the grass
    const fc = document.createElement('canvas'); fc.width = fc.height = 128;
    const fg = fc.getContext('2d'); const fr = mulberry32(13);
    const cols = ['#ffe14a', '#ffffff', '#ff6aa8', '#b78aff', '#ff8a3a'];
    for (let k = 0; k < 9; k++) {
      const x = 12 + fr() * 104; const top = 30 + fr() * 50;
      fg.strokeStyle = '#4a7a2e'; fg.lineWidth = 2; fg.beginPath(); fg.moveTo(x, 128); fg.quadraticCurveTo(x + (fr() - 0.5) * 10, (128 + top) / 2, x, top); fg.stroke();
      fg.fillStyle = cols[k % cols.length];
      for (let pe = 0; pe < 5; pe++) { const a = (pe / 5) * Math.PI * 2; fg.beginPath(); fg.arc(x + Math.cos(a) * 5, top + Math.sin(a) * 5, 4.5, 0, 7); fg.fill(); }
      fg.fillStyle = '#ffd23a'; fg.beginPath(); fg.arc(x, top, 3, 0, 7); fg.fill();
    }
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const fgeo = mergeAll([0, 1].map((k) => { const p = new THREE.PlaneGeometry(0.7, 0.7); p.translate(0, 0.33, 0); p.rotateY(k * Math.PI / 2); return p; }));
    const fn = fgeo.attributes.normal; for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
    this.flowers = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), Math.ceil(this.count / 12));
    this.flowers.count = 0; this.flowers.frustumCulled = false; this.flowers.receiveShadow = true;
    scene.add(this.flowers);
    this.at = null;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color();
  }
  update(x, z) {
    if (this.at && Math.hypot(x - this.at[0], z - this.at[1]) < 6) return;
    this.at = [x, z];
    const I = this.island; const st = this.step; const R = this.R;
    const x0 = Math.floor((x - R) / st) * st; const z0 = Math.floor((z - R) / st) * st;
    let k = 0; let fk = 0; const fmax = this.flowers.instanceMatrix.count;
    for (let gz = z0; gz < z + R; gz += st) {
      for (let gx = x0; gx < x + R; gx += st) {
        // stable jitter per world cell
        const h1 = Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453; const r1 = h1 - Math.floor(h1);
        const h2 = Math.sin(gx * 39.346 + gz * 11.135) * 24634.6345; const r2 = h2 - Math.floor(h2);
        const px = gx + (r1 - 0.5) * st; const pz = gz + (r2 - 0.5) * st;
        const d = Math.hypot(px - x, pz - z);
        if (d > R) continue;
        const h = I.height(px, pz);
        if (h < 2.9 || h > 66) continue;
        const n = I.normal(px, pz);
        if (n[1] < 0.84) continue;
        // thin out toward the edge so the field fades instead of ending
        if (r2 > 1 - (d / R) ** 3 * 0.9 + 0.1) continue;
        const sc = (0.7 + r1 * 0.7) * (1 - (d / R) ** 4 * 0.6);
        this.q.setFromAxisAngle(this.p.set(0, 1, 0), r2 * 6.28);
        this.m4.compose(this.p.set(px, h - 0.05, pz), this.q, this.s.set(sc, sc * (0.8 + r2 * 0.6), sc));
        this.mesh.setMatrixAt(k, this.m4);
        k++;
        if (r1 > 0.9 && fk < fmax && d < R * 0.85 && I.noise(px / 60, pz / 60) > 0.05) { this.m4.compose(this.p.set(px + 0.2, h - 0.05, pz), this.q, this.s.set(sc, sc, sc)); this.flowers.setMatrixAt(fk++, this.m4); }
        if (k >= this.count) break;
      }
      if (k >= this.count) break;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flowers.count = fk; this.flowers.instanceMatrix.needsUpdate = true;
  }
}
