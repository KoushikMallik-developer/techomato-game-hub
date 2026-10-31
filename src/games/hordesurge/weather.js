// Horde Surge weather: each world has its own atmosphere on top of the scenery's ambient specks.
//   meadow: drifting clouds and butterflies     snow: a driving blizzard of streaks
//   desert: a sandstorm with tumbleweeds          candy: tumbling petals
//   night:  neon rain, puddle ripples and lightning (update() returns the flash level for the lights)
import * as THREE from 'three';
import { LANE_W, CANNON_Z, mulberry32 } from './data.js';

const HALF = LANE_W / 2;

function canvasTex(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloudTexture(rnd) {
  return canvasTex(128, (g, S) => {
    for (let k = 0; k < 9; k++) {
      const x = S * (0.2 + rnd() * 0.6); const y = S * (0.45 + (rnd() - 0.5) * 0.25); const r = S * (0.12 + rnd() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  });
}

export function buildWeather(level, quality) {
  const T = level.theme;
  const L = level.L;
  const g = new THREE.Group();
  const anim = [];
  const disposables = [];
  const rnd = mulberry32(level.n * 53 + 9);
  const lo = quality === 'low';
  const zNear = CANNON_Z + 12; const zFar = -L - 12;
  const track = (o) => { disposables.push(o); return o; };

  // ── clouds drifting across the sky (tinted by the time of day) ──
  if (!T.neon) {
    const tex = track(cloudTexture(rnd));
    const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(T.sun), 0.35);
    const n = lo ? 6 : 14;
    const clouds = Array.from({ length: n }, () => {
      const m = track(new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, fog: false, opacity: 0.7 + rnd() * 0.25 }));
      const s = new THREE.Sprite(m);
      const w = 60 + rnd() * 70;
      s.scale.set(w, w * 0.45, 1);
      s.position.set((rnd() - 0.5) * 360, 55 + rnd() * 45, zFar - 80 - rnd() * 160);
      s.userData.v = 1.5 + rnd() * 2.5;
      s.renderOrder = -9;
      g.add(s);
      return s;
    });
    anim.push((dt) => clouds.forEach((s) => { s.position.x += s.userData.v * dt; if (s.position.x > 200) s.position.x = -200; }));
  }
  if (lo) return { group: g, update: (dt, t) => { anim.forEach((f) => f(dt, t)); return 0; }, dispose: () => disposables.forEach((d) => d.dispose()) };

  // ── meadow: butterflies fluttering along the verges ──
  if (T.id === 'meadow') {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.02, -0.18, 0.28, 0, 0.16, 0, 0, 0, -0.32, 0.02, -0.18, -0.28, 0, 0.16], 3));
    wing.computeVertexNormals();
    const mat = track(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }));
    const uT = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += abs(position.x) * sin(uT * 22.0 + instanceMatrix[3].z) * 1.4;`);
    };
    mat.customProgramCacheKey = () => 'hs-fly';
    const N = 28;
    const m = new THREE.InstancedMesh(track(wing), mat, N);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const cols = ['#ffd23f', '#ff8ad0', '#7fd0ff', '#ffffff', '#ff9a3a'].map((c) => new THREE.Color(c));
    const fl = Array.from({ length: N }, (_, i) => {
      const c = cols[i % cols.length];
      m.instanceColor.setXYZ(i, c.r, c.g, c.b);
      const side = i % 2 ? 1 : -1;
      return { cx: side * (HALF + 1.5 + rnd() * 9), cz: zNear - rnd() * (zNear - zFar), r: 1 + rnd() * 2, ph: rnd() * 6, sp: 0.6 + rnd() * 0.8, h: 0.8 + rnd() * 1.6 };
    });
    m.frustumCulled = false;
    g.add(m);
    const M = new THREE.Matrix4(); const Q = new THREE.Quaternion(); const P = new THREE.Vector3(); const S = new THREE.Vector3(1, 1, 1); const Y = new THREE.Vector3(0, 1, 0);
    anim.push((dt, t) => {
      uT.value = t;
      fl.forEach((f, i) => {
        const a = t * f.sp + f.ph;
        P.set(f.cx + Math.cos(a) * f.r, f.h + Math.sin(a * 2.3) * 0.4, f.cz + Math.sin(a * 0.7) * f.r * 1.5);
        Q.setFromAxisAngle(Y, -a + Math.PI / 2);
        M.compose(P, Q, S); m.setMatrixAt(i, M);
      });
      m.instanceMatrix.needsUpdate = true;
    });
  }

  // ── snow: wind-driven blizzard streaks ──
  if (T.id === 'snow') {
    const N = 520;
    const pos = new Float32Array(N * 6);
    const seed = Array.from({ length: N }, () => [(rnd() - 0.5) * 80, rnd() * 24, zNear - rnd() * (zNear - zFar), 0.7 + rnd() * 0.6]);
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false })));
    lines.frustumCulled = false;
    g.add(lines);
    anim.push((dt, t) => {
      const gust = 1 + Math.sin(t * 0.6) * 0.4 + Math.sin(t * 1.7) * 0.2;
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        s[0] += 9 * gust * s[3] * dt; s[1] -= 5 * s[3] * dt;
        if (s[0] > 40) s[0] = -40;
        if (s[1] < 0) s[1] = 24;
        const o = i * 6;
        pos[o] = s[0]; pos[o + 1] = s[1]; pos[o + 2] = s[2];
        pos[o + 3] = s[0] - 0.5 * gust; pos[o + 4] = s[1] + 0.28; pos[o + 5] = s[2];
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // ── desert: sandstorm dust and rolling tumbleweeds ──
  if (T.id === 'desert') {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const sp = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 90; pos[i * 3 + 1] = rnd() * rnd() * 9; pos[i * 3 + 2] = zNear - rnd() * (zNear - zFar); sp[i] = 7 + rnd() * 9; }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = track(canvasTex(32, (q, S) => { const gr = q.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, S, S); }));
    const pts = new THREE.Points(geo, track(new THREE.PointsMaterial({ map: dot, color: '#e8c58a', size: 0.32, transparent: true, opacity: 0.7, depthWrite: false })));
    pts.frustumCulled = false;
    g.add(pts);
    const twGeo = track(new THREE.IcosahedronGeometry(0.7, 1));
    const twMat = track(new THREE.MeshBasicMaterial({ color: '#8a6a3a', wireframe: true }));
    const weeds = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(twGeo, twMat);
      m.position.set(-45 - rnd() * 40, 0.7, zNear - 8 - rnd() * (zNear - zFar - 16));
      m.userData.v = 4 + rnd() * 3; m.userData.ph = rnd() * 6;
      g.add(m);
      return m;
    });
    anim.push((dt, t) => {
      for (let i = 0; i < N; i++) { pos[i * 3] += sp[i] * dt; pos[i * 3 + 1] += Math.sin(t * 2 + i) * 0.4 * dt; if (pos[i * 3] > 45) pos[i * 3] = -45; }
      geo.attributes.position.needsUpdate = true;
      weeds.forEach((m) => {
        m.position.x += m.userData.v * dt;
        m.position.y = 0.7 + Math.abs(Math.sin(t * 3 + m.userData.ph)) * 0.8;
        m.rotation.z -= (m.userData.v / 0.7) * dt;
        if (m.position.x > 50) m.position.x = -50;
      });
    });
  }

  // ── candy: tumbling petals ──
  if (T.id === 'candy') {
    const N = 320;
    const geo = track(new THREE.PlaneGeometry(0.2, 0.13));
    const m = new THREE.InstancedMesh(geo, track(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 })), N);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const cols = ['#ffffff', '#ffc2e6', '#ff8ad0', '#fff0a8', '#c9b6ff'].map((c) => new THREE.Color(c));
    const ps = Array.from({ length: N }, (_, i) => { const c = cols[i % cols.length]; m.instanceColor.setXYZ(i, c.r, c.g, c.b); return [(rnd() - 0.5) * 70, rnd() * 20, zNear - rnd() * (zNear - zFar), rnd() * 6, 0.5 + rnd() * 0.7]; });
    m.frustumCulled = false;
    g.add(m);
    const M = new THREE.Matrix4(); const Q = new THREE.Quaternion(); const E = new THREE.Euler(); const P = new THREE.Vector3(); const S = new THREE.Vector3(1, 1, 1);
    anim.push((dt, t) => {
      ps.forEach((p, i) => {
        p[1] -= p[4] * dt; p[0] += Math.sin(t * 0.8 + p[3]) * 0.8 * dt;
        if (p[1] < 0) p[1] = 20;
        M.compose(P.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(t * 2 + p[3], t * 1.3 + p[3], t * 0.7)), S);
        m.setMatrixAt(i, M);
      });
      m.instanceMatrix.needsUpdate = true;
    });
  }

  // ── night: neon rain, ripples on the lane and lightning ──
  let flash = 0;
  if (T.neon) {
    const N = 900;
    const pos = new Float32Array(N * 6);
    const col = new Float32Array(N * 6);
    const seed = Array.from({ length: N }, () => [(rnd() - 0.5) * 70, rnd() * 26, zNear - rnd() * (zNear - zFar), 18 + rnd() * 8]);
    const c1 = new THREE.Color('#7fe9ff'); const c2 = new THREE.Color('#ff7fd0');
    seed.forEach((s, i) => { const c = i % 3 ? c1 : c2; col.set([c.r, c.g, c.b, c.r * 0.2, c.g * 0.2, c.b * 0.2], i * 6); });
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));
    lines.frustumCulled = false;
    g.add(lines);
    const ringGeo = track(new THREE.RingGeometry(0.85, 1, 24));
    ringGeo.rotateX(-Math.PI / 2);
    const ripples = Array.from({ length: 30 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0, depthWrite: false }));
      disposables.push(m.material);
      m.userData.t = rnd();
      g.add(m);
      return m;
    });
    let nextBolt = 4 + rnd() * 6;
    anim.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        s[1] -= s[3] * dt; s[0] -= 2 * dt;
        if (s[1] < 0) { s[1] = 26; s[0] = (Math.random() - 0.5) * 70; }
        const o = i * 6;
        pos[o] = s[0]; pos[o + 1] = s[1]; pos[o + 2] = s[2];
        pos[o + 3] = s[0] + 0.12; pos[o + 4] = s[1] + 0.9; pos[o + 5] = s[2];
      }
      geo.attributes.position.needsUpdate = true;
      ripples.forEach((m) => {
        m.userData.t += dt * 1.6;
        if (m.userData.t >= 1) { m.userData.t = 0; m.position.set((Math.random() - 0.5) * (LANE_W + 6), 0.04, zNear - Math.random() * (zNear - zFar)); }
        const k = m.userData.t;
        m.scale.setScalar(0.1 + k * 0.7);
        m.material.opacity = (1 - k) * 0.5;
      });
      nextBolt -= dt;
      if (nextBolt <= 0) { nextBolt = 6 + Math.random() * 9; flash = 1; }
      flash = Math.max(0, flash - dt * 2.2);
    });
  }

  return {
    group: g,
    // returns the lightning level (0..1) so the game can light the scene with it
    update: (dt, t) => { anim.forEach((f) => f(dt, t)); return flash > 0.5 ? (Math.sin(flash * 40) > 0 ? flash : flash * 0.3) : flash; },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
