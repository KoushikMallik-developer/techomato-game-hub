// Horde Surge crowds: thousands of little units per side, stored as flat arrays and drawn with
// instanced meshes (body, face and accessory) — one draw call each no matter how many are on screen.
import * as THREE from 'three';
import { MAX_UNITS } from './data.js';

// a soft, rounded blob body with little feet
function bodyGeometry() {
  const g = new THREE.SphereGeometry(0.34, 20, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    const x = p.getX(i); const z = p.getZ(i);
    // flatter bottom, slightly pear-shaped
    if (y < -0.12) y = -0.12 + (y + 0.12) * 0.45;
    const k = 1 + Math.max(0, -y) * 0.25;
    p.setXYZ(i, x * k, y + 0.34, z * k);
  }
  g.computeVertexNormals();
  // a little belly highlight and a darker underside are painted in the shader; feet and arms are tagged
  // so the vertex shader can swing them as the unit runs
  const feet = [-1, 1].map((s) => { const f = new THREE.SphereGeometry(0.115, 10, 8); f.scale(1, 0.62, 1.35); f.translate(s * 0.15, 0.06, -0.04); return f; });
  const arms = [-1, 1].map((s) => { const a = new THREE.CapsuleGeometry(0.058, 0.14, 4, 10); a.rotateZ(s * 0.5); a.rotateX(0.35); a.translate(s * 0.33, 0.3, -0.05); return a; });
  const out = mergeSimple([g, ...feet, ...arms]);
  const tags = []; [g, ...feet, ...arms].forEach((q, k) => { const n = (q.index ? q.index.count : q.attributes.position.count); for (let i = 0; i < n; i++) tags.push(k === 0 ? 0 : k <= 2 ? (k === 1 ? -1 : 1) : (k === 3 ? -2 : 2)); });
  out.setAttribute('limb', new THREE.Float32BufferAttribute(tags, 1));
  return out;
}
// soft round shadow under each unit
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let SHADOW_TEX = null;

// eyes (white with dark pupils) + a little mouth, facing -z
function faceGeometry() {
  const parts = [];
  const cols = [];
  [-1, 1].forEach((s) => {
    const w = new THREE.SphereGeometry(0.085, 10, 8); w.scale(1, 1.15, 0.6); w.translate(s * 0.12, 0.46, -0.28);
    const p = new THREE.SphereGeometry(0.045, 8, 6); p.scale(1, 1.1, 0.6); p.translate(s * 0.12, 0.455, -0.325);
    const glint = new THREE.SphereGeometry(0.015, 6, 4); glint.translate(s * 0.12 + 0.02, 0.48, -0.355);
    parts.push(w, p, glint); cols.push([1, 1, 1], [0.05, 0.05, 0.07], [1, 1, 1]);
  });
  // a small smile
  const mouth = new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI);
  mouth.rotateZ(Math.PI);
  mouth.translate(0, 0.36, -0.342);
  parts.push(mouth); cols.push([0.1, 0.05, 0.06]);
  return mergeSimple(parts, cols);
}

function accessoryGeometry(kind) {
  const parts = [];
  if (kind === 'leaf') { const l = new THREE.SphereGeometry(0.12, 8, 6); l.scale(0.5, 0.25, 1); l.rotateX(-0.6); l.translate(0, 0.76, 0.02); const st = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 5); st.translate(0, 0.7, 0); parts.push(l, st); }
  else if (kind === 'ears') [-1, 1].forEach((s) => { const e = new THREE.ConeGeometry(0.09, 0.2, 8); e.rotateZ(-s * 0.4); e.translate(s * 0.17, 0.72, 0); parts.push(e); });
  else if (kind === 'horn') { const h = new THREE.ConeGeometry(0.07, 0.26, 8); h.translate(0, 0.8, -0.04); parts.push(h); }
  else if (kind === 'flame') { const f = new THREE.ConeGeometry(0.12, 0.3, 8); f.translate(0, 0.8, 0.02); const f2 = new THREE.ConeGeometry(0.07, 0.2, 8); f2.translate(0.1, 0.74, 0.04); parts.push(f, f2); }
  else if (kind === 'crown') { const c = new THREE.CylinderGeometry(0.14, 0.13, 0.1, 10, 1, true); c.translate(0, 0.72, 0); parts.push(c); for (let k = 0; k < 5; k++) { const t = new THREE.ConeGeometry(0.035, 0.1, 5); const a = (k / 5) * Math.PI * 2; t.translate(Math.cos(a) * 0.13, 0.81, Math.sin(a) * 0.13); parts.push(t); } }
  else if (kind === 'horns') [-1, 1].forEach((s) => { const h = new THREE.ConeGeometry(0.06, 0.22, 8); h.rotateZ(-s * 0.7); h.translate(s * 0.2, 0.7, 0); parts.push(h); });
  else return null;
  return mergeSimple(parts);
}

// merge non-indexed copies of simple geometries (position, normal, optional vertex colour)
export function mergeSimple(geos, colors = null) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = colors ? new Float32Array(n * 3) : null;
  let o = 0;
  list.forEach((g, k) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) for (let i = 0; i < g.attributes.position.count; i++) col.set(colors[k], (o + i) * 3);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const BODY = bodyGeometry();
const FACE = faceGeometry();

export class Crowd {
  // team: 'player' (moves toward -z) or 'enemy' (moves toward +z)
  constructor(scene, team, opts = {}) {
    this.team = team;
    this.dir = team === 'player' ? -1 : 1;
    this.n = 0;
    const N = MAX_UNITS;
    this.x = new Float32Array(N); this.z = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.ph = new Float32Array(N); this.sp = new Float32Array(N);
    this.scale = opts.scale || 1;
    this.bodyMat = new THREE.MeshStandardMaterial({ color: opts.color || '#3fd86b', roughness: 0.45, metalness: 0.05, emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissive ? 0.6 : 0 });
    // soft rim light so units read clearly against the ground, plus a tiny bit of gloss
    this.uTime = { value: 0 };
    this.bodyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float limb; uniform float uTime; varying float vLimb; varying float vH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLimb = limb; vH = position.y;
          float ph = uTime * 11.0 + instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float sw = sin(ph);
          if (abs(limb) > 0.5 && abs(limb) < 1.5) { float side = sign(limb); transformed.z += sw * side * 0.13; transformed.y += max(0.0, cos(ph) * side) * 0.07; }
          if (abs(limb) > 1.5) { float side = sign(limb); transformed.z -= sw * side * 0.09; transformed.y += abs(sw) * 0.02; }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLimb; varying float vH;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          // darker underside and feet, a lighter belly: reads as a rounded little character
          diffuseColor.rgb *= mix(0.62, 1.08, smoothstep(0.02, 0.62, vH));
          if (abs(vLimb) > 0.5 && abs(vLimb) < 1.5) diffuseColor.rgb *= 0.7;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.55 + vec3(rim * 0.1);`);
    };
    this.bodyMat.customProgramCacheKey = () => 'hs-unit';
    this.bodyMat.roughness = 0.38;
    this.body = new THREE.InstancedMesh(BODY, this.bodyMat, N);
    this.face = new THREE.InstancedMesh(FACE, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), N);
    const accG = accessoryGeometry(opts.acc);
    this.acc = accG ? new THREE.InstancedMesh(accG, new THREE.MeshStandardMaterial({ color: opts.accColor || '#ffffff', roughness: 0.5, metalness: opts.acc === 'crown' ? 0.6 : 0.05 }), N) : null;
    if (!SHADOW_TEX) SHADOW_TEX = shadowTexture();
    const sg = new THREE.PlaneGeometry(0.8, 0.8); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N);
    this.shadow.renderOrder = 1;
    [this.body, this.face, this.acc, this.shadow].forEach((m) => {
      if (!m) return;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    });
    this.body.castShadow = !!opts.shadows;
    this.scene = scene;
    this.time = 0;
  }

  setShadows(on) { this.body.castShadow = on; }

  add(x, z, opts = {}) {
    if (this.n >= MAX_UNITS) return -1;
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.y[i] = opts.y || 0;
    this.vx[i] = opts.vx ?? (Math.random() - 0.5) * 0.8;
    this.vy[i] = opts.vy || 0;
    this.ph[i] = Math.random() * 6.28;
    this.sp[i] = (opts.speed || 1) * (0.92 + Math.random() * 0.16);
    return i;
  }

  // swap-remove: order does not matter
  kill(i) {
    const j = --this.n;
    if (i !== j) {
      this.x[i] = this.x[j]; this.z[i] = this.z[j]; this.y[i] = this.y[j];
      this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.ph[i] = this.ph[j]; this.sp[i] = this.sp[j];
    }
  }

  clear() { this.n = 0; this.sync(0); }

  // write instance matrices: hop while running, squash on landing, face the direction of travel
  sync(dt) {
    this.time += dt;
    const n = this.n;
    const s0 = this.scale;
    const rot = this.dir < 0 ? 0 : Math.PI;
    this.uTime.value = this.time * (this.dir < 0 ? 1 : 0.85);
    const arrs = [this.body.instanceMatrix.array, this.face.instanceMatrix.array, this.acc ? this.acc.instanceMatrix.array : null];
    const sh = this.shadow.instanceMatrix.array;
    for (let i = 0; i < n; i++) {
      const ph = this.ph[i] + this.time * 11 * this.sp[i];
      const hop = Math.abs(Math.sin(ph));
      const sq = 1 + (1 - hop) * 0.12;
      const sx = s0 / Math.sqrt(sq); const sy = s0 * sq;
      const yaw = rot + this.vx[i] * 0.25 * -this.dir;
      const c = Math.cos(yaw); const s = Math.sin(yaw);
      const y = this.y[i] + hop * 0.16 * s0;
      for (const a of arrs) {
        if (!a) continue;
        const o = i * 16;
        a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
        a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = s * sx; a[o + 9] = 0; a[o + 10] = c * sx; a[o + 11] = 0;
        a[o + 12] = this.x[i]; a[o + 13] = y; a[o + 14] = this.z[i]; a[o + 15] = 1;
      }
      // the shadow stays on the ground and shrinks as the unit hops
      const o = i * 16; const ss = s0 * (1 - hop * 0.25) * (this.y[i] > 0.5 ? Math.max(0.3, 1 - this.y[i] * 0.1) : 1);
      sh[o] = ss; sh[o + 1] = 0; sh[o + 2] = 0; sh[o + 3] = 0; sh[o + 4] = 0; sh[o + 5] = 1; sh[o + 6] = 0; sh[o + 7] = 0;
      sh[o + 8] = 0; sh[o + 9] = 0; sh[o + 10] = ss; sh[o + 11] = 0; sh[o + 12] = this.x[i]; sh[o + 13] = 0.03; sh[o + 14] = this.z[i]; sh[o + 15] = 1;
    }
    [this.body, this.face, this.acc, this.shadow].forEach((m) => { if (m) { m.count = n; m.instanceMatrix.needsUpdate = true; } });
  }

  setLook(color, acc, accColor) {
    this.bodyMat.color.set(color);
    if (this.acc) { this.scene.remove(this.acc); this.acc.geometry.dispose(); this.acc.material.dispose(); this.acc = null; }
    const g = accessoryGeometry(acc);
    if (g) {
      this.acc = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: accColor || '#ffffff', roughness: 0.5, metalness: acc === 'crown' ? 0.6 : 0.05 }), MAX_UNITS);
      this.acc.count = 0; this.acc.frustumCulled = false;
      this.scene.add(this.acc);
    }
  }

  dispose() {
    [this.body, this.face, this.acc, this.shadow].forEach((m) => { if (m) { this.scene.remove(m); m.material.dispose(); m.dispose(); } });
  }
}
