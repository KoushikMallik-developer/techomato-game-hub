// Horde Surge effects: particle bits (chunky debris and spinning glass shards), ground splats that
// fade out, flying projectiles (arrows, ice shards) and rising smoke puffs. All pooled, no per-frame allocation.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function canvasTex(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────── particle bits ─────────────
const KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 's', 'rx', 'ry', 'wx', 'wy'];
export class Bits {
  constructor(scene, geo, N, { spin = false, mat = null, gravity = 16 } = {}) {
    this.N = N; this.n = 0; this.spin = spin; this.g = gravity;
    this.d = Object.fromEntries(KEYS.map((k) => [k, new Float32Array(N)]));
    this.mesh = new THREE.InstancedMesh(geo, mat || new THREE.MeshStandardMaterial({ roughness: 0.6 }), N);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene = scene;
    scene.add(this.mesh);
    this.c = new THREE.Color();
  }

  burst(x, y, z, color, n = 6, power = 3, size = 1) {
    const d = this.d;
    this.c.set(color);
    for (let k = 0; k < n; k++) {
      if (this.n >= this.N) return;
      const i = this.n++;
      d.x[i] = x; d.y[i] = y + 0.3; d.z[i] = z;
      const a = Math.random() * Math.PI * 2; const s = power * (0.4 + Math.random());
      d.vx[i] = Math.cos(a) * s; d.vz[i] = Math.sin(a) * s; d.vy[i] = 2 + Math.random() * power * 1.4;
      d.life[i] = d.max[i] = (0.45 + Math.random() * 0.35) * (this.spin ? 1.8 : 1);
      d.s[i] = (0.7 + Math.random() * 0.9) * size;
      d.rx[i] = Math.random() * 6; d.ry[i] = Math.random() * 6;
      d.wx[i] = (Math.random() - 0.5) * 18; d.wy[i] = (Math.random() - 0.5) * 18;
      this.mesh.instanceColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
  }

  update(dt) {
    const d = this.d;
    const a = this.mesh.instanceMatrix.array;
    const ic = this.mesh.instanceColor;
    let i = 0;
    while (i < this.n) {
      d.life[i] -= dt;
      if (d.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) { for (const k of KEYS) d[k][i] = d[k][j]; ic.setXYZ(i, ic.getX(j), ic.getY(j), ic.getZ(j)); }
        continue;
      }
      d.vy[i] -= this.g * dt;
      d.x[i] += d.vx[i] * dt; d.y[i] += d.vy[i] * dt; d.z[i] += d.vz[i] * dt;
      if (d.y[i] < 0.05) { d.y[i] = 0.05; d.vy[i] *= -0.35; d.vx[i] *= 0.6; d.vz[i] *= 0.6; d.wx[i] *= 0.5; d.wy[i] *= 0.5; }
      const s = d.s[i] * Math.min(1, (d.life[i] / d.max[i]) * 2);
      if (this.spin) {
        d.rx[i] += d.wx[i] * dt; d.ry[i] += d.wy[i] * dt;
        _m.compose(_p.set(d.x[i], d.y[i], d.z[i]), _q.setFromEuler(_e.set(d.rx[i], d.ry[i], 0)), _s.set(s, s, s));
        _m.toArray(a, i * 16);
      } else {
        const o = i * 16;
        a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0; a[o + 12] = d.x[i]; a[o + 13] = d.y[i]; a[o + 14] = d.z[i]; a[o + 15] = 1;
      }
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    ic.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

// a thin triangle of glass for shattering gates
export function shardGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, -0.1, 0, 0.14, -0.06, 0, -0.02, 0.18, 0], 3));
  g.computeVertexNormals();
  return g;
}

// ───────────── ground splats ─────────────
export class Splats {
  constructor(scene, N = 260) {
    this.N = N; this.next = 0; this.scene = scene;
    const map = canvasTex(64, (g, S) => {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.26, 0, 7); g.fill();
      for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.28 + Math.random() * 0.4; const r = S * (0.28 + Math.random() * 0.14); g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * (0.03 + Math.random() * 0.05), 0, 7); g.fill(); }
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -1 }), N);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.d = { x: new Float32Array(N), z: new Float32Array(N), s: new Float32Array(N), r: new Float32Array(N), t: new Float32Array(N).fill(99) };
    this.mesh.count = N;
    scene.add(this.mesh);
    this.c = new THREE.Color();
  }

  add(x, z, color, size = 1) {
    const i = this.next++ % this.N;
    const d = this.d;
    d.x[i] = x; d.z[i] = z; d.s[i] = size * (0.7 + Math.random() * 0.6); d.r[i] = Math.random() * 6.28; d.t[i] = 0;
    this.c.set(color).multiplyScalar(0.75); // unlit: a little darker so splats don't glow
    this.mesh.instanceColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const d = this.d;
    const a = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.N; i++) {
      d.t[i] += dt;
      const t = d.t[i];
      const k = t < 0.12 ? t / 0.12 : t > 6 ? Math.max(0, 1 - (t - 6) / 1.5) : 1;
      const s = d.s[i] * k;
      const c = Math.cos(d.r[i]) * s; const sn = Math.sin(d.r[i]) * s;
      const o = i * 16;
      a[o] = c; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0; a[o + 12] = d.x[i]; a[o + 13] = 0.025; a[o + 14] = d.z[i]; a[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.d.t.fill(99); }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

// ───────────── projectiles ─────────────
function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5); shaft.rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.07, 0.2, 6); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.52);
  const fl = new THREE.BoxGeometry(0.16, 0.01, 0.16); fl.translate(0, 0, -0.42);
  const g = new THREE.BufferGeometry();
  const parts = [shaft, head, fl].map((q) => q.toNonIndexed());
  const n = parts.reduce((a, q) => a + q.attributes.position.count, 0);
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3);
  let o = 0;
  parts.forEach((q) => { pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export class Shots {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = { arrow: arrowGeometry(), shard: new THREE.OctahedronGeometry(0.3, 0).scale(0.55, 0.55, 1.9), meteor: new THREE.IcosahedronGeometry(0.8, 1), shell: new THREE.IcosahedronGeometry(0.32, 1),
      missile: new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8).rotateX(Math.PI / 2) };
    this.mat = {
      arrow: new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.6 }),
      shard: new THREE.MeshStandardMaterial({ color: '#bfeaff', emissive: '#7fd0ff', emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.2, flatShading: true }),
      shell: new THREE.MeshStandardMaterial({ color: '#2a2a30', emissive: '#ff8a2a', emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.5 }),
      missile: new THREE.MeshStandardMaterial({ color: '#f4f6fa', emissive: '#ff4a2a', emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.4 }),
      meteor: new THREE.MeshStandardMaterial({ color: '#5a2a1a', emissive: '#ff6a1a', emissiveIntensity: 1.6, roughness: 0.8, flatShading: true }),
    };
  }

  // flies from a to b along an arc and calls land(b) when it arrives (fly(pos) every frame on the way)
  fire(kind, a, b, dur, arc, land, fly = null) {
    let s = this.list.find((q) => !q.on && q.kind === kind);
    if (!s) {
      s = { kind, m: new THREE.Mesh(this.geo[kind], this.mat[kind]), a: new THREE.Vector3(), b: new THREE.Vector3() };
      s.m.castShadow = true;
      this.scene.add(s.m);
      this.list.push(s);
    }
    s.on = true; s.t = 0; s.dur = dur; s.arc = arc; s.land = land; s.fly = fly;
    s.a.copy(a); s.b.copy(b);
    s.m.visible = true;
    s.m.position.copy(a);
  }

  update(dt) {
    for (const s of this.list) {
      if (!s.on) continue;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const k2 = Math.min(1, k + 0.04);
      _p.lerpVectors(s.a, s.b, k2); _p.y += s.arc * 4 * k2 * (1 - k2);
      s.m.position.lerpVectors(s.a, s.b, k); s.m.position.y += s.arc * 4 * k * (1 - k);
      s.m.lookAt(_p);
      if (s.fly) s.fly(s.m.position);
      if (k >= 1) { s.on = false; s.m.visible = false; s.land && s.land(s.b); }
    }
  }

  clear() { this.list.forEach((s) => { s.on = false; s.m.visible = false; }); }

  dispose() {
    this.list.forEach((s) => this.scene.remove(s.m));
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mat).forEach((m) => m.dispose());
  }
}

// ───────────── smoke and fire puffs ─────────────
export class Smoke {
  constructor(scene, N = 48) {
    this.scene = scene;
    this.map = canvasTex(64, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    });
    this.pool = Array.from({ length: N }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.map, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      scene.add(sp);
      return { sp, t: 0, life: 1, on: false, size: 1, rise: 1, vx: 0 };
    });
  }

  puff(x, y, z, color = '#555', size = 2, rise = 1.5, life = 2.5, additive = false) {
    const p = this.pool.find((q) => !q.on) || this.pool.reduce((a, q) => (q.t / q.life > a.t / a.life ? q : a));
    p.on = true; p.t = 0; p.life = life; p.size = size; p.rise = rise; p.vx = (Math.random() - 0.5) * 0.6;
    p.sp.position.set(x, y, z);
    p.sp.material.color.set(color);
    p.sp.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sp.material.rotation = Math.random() * 6;
    p.sp.visible = true;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.on = false; p.sp.visible = false; continue; }
      p.sp.position.y += p.rise * dt;
      p.sp.position.x += p.vx * dt;
      p.sp.scale.setScalar(p.size * (0.5 + k * 1.2));
      p.sp.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.8;
    }
  }

  clear() { this.pool.forEach((p) => { p.on = false; p.sp.visible = false; }); }

  dispose() { this.pool.forEach((p) => { this.scene.remove(p.sp); p.sp.material.dispose(); }); this.map.dispose(); }
}
