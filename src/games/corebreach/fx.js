// Core Breach effects: tracers, muzzle flashes, impacts, particles and every ability's visuals.
import * as THREE from 'three';
import { stepProjectile } from './proj.js';

function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function puffTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let k = 0; k < 14; k++) {
    const x = 34 + Math.random() * 60; const y = 34 + Math.random() * 60; const r = 18 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

// hexagon pattern: fill = background colour (null = black), lines in `color`
function hexTex(color, fill = null) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = fill || '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = color;
  g.lineWidth = 3;
  const r = 16;
  for (let y = 0; y < 160; y += r * 1.5) {
    for (let x = 0; x < 160; x += r * Math.sqrt(3)) {
      const ox = (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(x + ox + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// a tall flame tongue: white-hot core, yellow, orange, fading red tip
function flameTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,70,0.95)'); gr.addColorStop(0.6, 'rgba(255,100,20,0.7)'); gr.addColorStop(1, 'rgba(200,30,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(44, 40, 62, 70, 52, 108); g.bezierCurveTo(46, 124, 18, 124, 12, 108); g.bezierCurveTo(2, 70, 20, 40, 32, 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// an 8-point starburst for flashes
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    g.save(); g.rotate((k / 8) * Math.PI * 2);
    const gr = g.createLinearGradient(0, 0, 0, -(long ? 62 : 38));
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-(long ? 4 : 3), 0); g.lineTo(0, -(long ? 62 : 38)); g.lineTo(long ? 4 : 3, 0); g.fill();
    g.restore();
  }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(-64, -64, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FX {
  constructor(scene, level, sound) {
    this.scene = scene;
    this.level = level;
    this.sound = sound;
    this.glow = glowTex();
    this.puff = puffTex();
    this.flameTex = flameTex();
    this.star = starTex();
    this.items = [];
    this.zones = new Map();
    this.walls = new Map();
    this.turrets = new Map();
    this.projs = new Map();
    // shared light for muzzle flashes and blasts
    this.flashLight = new THREE.PointLight(0xffc070, 0, 12, 2);
    scene.add(this.flashLight);
    this.flashT = 0;
    // tracers
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerGeo.translate(0, 0, -0.5);
    // bullet holes
    const holeC = document.createElement('canvas');
    holeC.width = holeC.height = 32;
    const hg = holeC.getContext('2d');
    const gr = hg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(20,16,12,0.95)'); gr.addColorStop(0.35, 'rgba(40,32,24,0.7)'); gr.addColorStop(1, 'rgba(40,32,24,0)');
    hg.fillStyle = gr; hg.fillRect(0, 0, 32, 32);
    this.holeMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(holeC), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeGeo = new THREE.PlaneGeometry(0.14, 0.14);
    this.holes = [];
    this.sparkMat = new THREE.SpriteMaterial({ map: this.glow, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  add(obj, life, update, onEnd) {
    this.scene.add(obj);
    const it = { obj, t: 0, life, update, onEnd };
    this.items.push(it);
    return it;
  }

  update(dt, cam) {
    this.cam = cam;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.update) it.update(it, dt);
      if (it.t >= it.life) {
        this.scene.remove(it.obj);
        if (it.onEnd) it.onEnd(it);
        this.items.splice(i, 1);
      }
    }
    this.flashT -= dt;
    this.flashLight.intensity = this.flashT > 0 ? this.flashLight.userData.peak * (this.flashT / 0.06) : 0;
    // projectiles in flight follow the same path the host simulates
    this.projs.forEach((p, id) => {
      p.t += dt;
      stepProjectile(this.level, p.pr, dt);
      p.mesh.position.set(p.pr.p[0], p.pr.p[1], p.pr.p[2]);
      p.mesh.rotation.x += dt * 8;
      if (p.t > 6) { this.scene.remove(p.mesh); this.projs.delete(id); }
    });
    // zones breathe
    this.zones.forEach((z) => { if (z.tick) z.tick(dt); });
  }

  // ── shots ──
  tracer(o, e, color = 0xffe0a0) {
    const dx = e[0] - o[0]; const dy = e[1] - o[1]; const dz = e[2] - o[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1) return;
    const m = new THREE.Mesh(this.tracerGeo, color === 0xffe0a0 ? this.tracerMat : new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(o[0], o[1], o[2]);
    m.lookAt(e[0], e[1], e[2]);
    m.rotateY(Math.PI);
    const seg = Math.min(L, 6);
    m.scale.set(1, 1, seg);
    const speed = 380;
    this.add(m, L / speed + 0.02, (it) => {
      const t = Math.min(1, (it.t * speed) / L);
      m.position.set(o[0] + dx * t, o[1] + dy * t, o[2] + dz * t);
      m.material.opacity = 0.9 * (1 - t * 0.5);
    }, () => { if (m.material !== this.tracerMat) m.material.dispose(); });
  }

  muzzle(p, big = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1], p[2]);
    s.scale.setScalar(0.45 * big);
    this.add(s, 0.05, null, () => s.material.dispose());
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.userData.peak = 6 * big;
    this.flashT = 0.06;
  }

  impact(p, n, flesh = false) {
    if (!flesh && n) {
      const m = new THREE.Mesh(this.holeGeo, this.holeMat);
      m.position.set(p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, p[2] + n[2] * 0.01);
      m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
      this.scene.add(m);
      this.holes.push(m);
      if (this.holes.length > 80) this.scene.remove(this.holes.shift());
    }
    const n3 = n || [0, 1, 0];
    for (let k = 0; k < (flesh ? 5 : 4); k++) {
      const s = new THREE.Sprite(flesh ? new THREE.SpriteMaterial({ map: this.glow, color: 0xff6040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }) : this.sparkMat);
      s.position.set(p[0], p[1], p[2]);
      s.scale.setScalar(flesh ? 0.12 : 0.07);
      const v = [n3[0] * 2 + (Math.random() - 0.5) * 4, n3[1] * 2 + Math.random() * 3, n3[2] * 2 + (Math.random() - 0.5) * 4];
      this.add(s, 0.25 + Math.random() * 0.15, (it, dt) => {
        v[1] -= 12 * dt;
        s.position.x += v[0] * dt; s.position.y += v[1] * dt; s.position.z += v[2] * dt;
      }, () => { if (s.material !== this.sparkMat) s.material.dispose(); });
    }
    // dust puff on walls
    if (!flesh) this.puffAt(p, 0.25, 0.4, 0xc8b8a0, 0.5);
  }

  puffAt(p, s0, life, color = 0xcccccc, op = 0.6, rise = 0.6) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puff, color, transparent: true, opacity: op, depthWrite: false }));
    s.position.set(p[0], p[1], p[2]);
    s.scale.setScalar(s0);
    this.add(s, life, (it) => {
      const t = it.t / life;
      s.scale.setScalar(s0 * (1 + t * 2));
      s.position.y += rise * 0.016;
      s.material.opacity = op * (1 - t);
    }, () => s.material.dispose());
  }

  // an expanding flat ring (shockwave) lying on the ground, or facing the camera when upright is set
  ringWave(p, color, r0, r1, life, op = 0.8, thick = 0.12, upright = false) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - thick, 1, 56), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    if (!upright) m.rotation.x = -Math.PI / 2;
    m.position.set(p[0], p[1], p[2]);
    this.add(m, life, (it) => {
      const t = it.t / life;
      m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - t, 3)));
      m.material.opacity = op * Math.pow(1 - t, 1.4);
      if (upright && this.cam) m.quaternion.copy(this.cam.quaternion);
    }, () => { m.geometry.dispose(); m.material.dispose(); });
  }

  // ── abilities ──
  throwStart(pid, what, o, v, stick) {
    const color = { flash: 0xffffff, molly: 0xff6a20, concuss: 0xb070ff, frag: 0x404040, shock: 0x6ad8ff, recon: 0x40ffb0, slow: 0x80c0ff, smoke: 0xa0a0b0 }[what] || 0xffffff;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x30343c, emissive: color, emissiveIntensity: 1.5, roughness: 0.4 }));
    m.position.set(o[0], o[1], o[2]);
    this.scene.add(m);
    this.projs.set(pid, { mesh: m, pr: { p: [...o], v: [...v], stick }, t: 0 });
    this.sound.ability('throw', o);
  }

  projEnd(pid) {
    const p = this.projs.get(pid);
    if (!p) return null;
    this.scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    this.projs.delete(pid);
    return p.pr.p;
  }

  smoke(id, p, r, dur, color = 0x9a9fae) {
    const g = new THREE.Group();
    const tone = (mix, to) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(to), mix), roughness: 1, emissive: 0x222428, emissiveIntensity: 0.5, transparent: true, opacity: 0 });
    const light = tone(0.55, '#ffffff');
    const mid = tone(0.22, '#d8dae0');
    const dark = tone(0.3, '#43464f');
    const mats = [light, mid, dark, mid, light];
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const lumps = [];
    // a dense shell of big lumps plus a filled core: the dome reads as thick rolling gas, edge to edge
    for (let k = 0; k < 120; k++) {
      const core = k < 10;
      const u = Math.random() * 2 - 1; const a = Math.random() * Math.PI * 2; const sq = Math.sqrt(1 - u * u);
      const rr = core ? Math.random() * r * 0.4 : r * (0.66 + Math.random() * 0.24);
      let y = u * rr; if (y < -r * 0.45) y = -r * 0.45 + (y + r * 0.45) * 0.3;
      const m = new THREE.Mesh(geo, mats[k % mats.length]);
      const sz = core ? r * (0.5 + Math.random() * 0.2) : r * (0.12 + Math.random() * 0.14);
      m.scale.set(sz * (0.85 + Math.random() * 0.4), sz * (0.8 + Math.random() * 0.35), sz * (0.85 + Math.random() * 0.4));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.position.set(Math.cos(a) * sq * rr, y, Math.sin(a) * sq * rr);
      m.userData = { ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.5, base: m.position.clone(), sz, sx: m.scale.x / sz, sy: m.scale.y / sz };
      g.add(m); lumps.push(m);
    }
    // soft puffs around the foot where the gas pours out onto the floor
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puff, color: 0xc4c8d2, transparent: true, opacity: 0, depthWrite: false }));
      sp.position.set(Math.cos(a) * r * 0.95, -r * 0.32 + Math.random() * 0.4, Math.sin(a) * r * 0.95);
      sp.scale.setScalar(r * 0.9);
      sp.userData.puff = true;
      g.add(sp);
    }
    g.position.set(p[0], p[1], p[2]);
    this.scene.add(g);
    let t = 0;
    const z = {
      obj: g,
      tick: (dt) => {
        t += dt;
        const grow = Math.min(1, t / 0.7);
        const fade = dur - t < 1.4 ? Math.max(0, (dur - t) / 1.4) : 1;
        const o = grow * fade;
        [light, mid, dark].forEach((q) => { q.opacity = o; q.transparent = o < 1; });
        g.children.forEach((c) => { if (c.userData.puff) c.material.opacity = 0.55 * o; });
        // churn: every lump drifts on a small loop, so the surface keeps rolling
        lumps.forEach((m) => {
          const d = m.userData; const w = t * d.sp + d.ph;
          m.position.set(d.base.x + Math.sin(w) * r * 0.05, d.base.y + Math.cos(w * 0.8) * r * 0.04, d.base.z + Math.cos(w * 1.1) * r * 0.05);
          m.scale.set(d.sz * (0.9 + 0.1 * Math.sin(w * 1.7)) * d.sx, d.sz * (0.92 + 0.08 * Math.cos(w * 1.3)) * d.sy, d.sz * (0.9 + 0.1 * Math.sin(w * 1.1)) * d.sx);
          if (fade < 1) m.scale.multiplyScalar(0.85 + 0.15 * fade);
        });
        g.rotation.y += dt * 0.06;
        // the cloud bursts out fast then settles
        const e = 1 - Math.pow(1 - grow, 3);
        g.scale.setScalar(0.35 + 0.65 * e);
      },
      end: () => { this.scene.remove(g); geo.dispose(); light.dispose(); mid.dispose(); dark.dispose(); g.children.forEach((c) => { if (c.userData.puff) c.material.dispose(); }); },
    };
    this.zones.set(id, z);
    this.sound.ability('smoke', p);
  }

  groundZone(id, kind, p, r, dur) {
    const color = kind === 'fire' ? 0xff5a1a : kind === 'toxin' ? 0x8dff3a : 0x6ac8ff;
    const g = new THREE.Group();
    // fire leaves a scorched patch under the glow
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 40), new THREE.MeshBasicMaterial({ color: 0x100a06, transparent: true, opacity: kind === 'fire' ? 0.5 : 0.0, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.03;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'fire' ? 0.22 : 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(scorch, disc, ring);
    g.position.set(p[0], p[1], p[2]);
    const light = new THREE.PointLight(color, kind === 'fire' ? 5 : 1.5, r * 3.5, 2);
    light.position.y = 1.2;
    g.add(light);
    this.scene.add(g);
    let t = 0;
    let em = 0;
    const z = {
      obj: g,
      tick: (dt) => {
        t += dt;
        const f = Math.min(1, (dur - t) / 0.8) * Math.min(1, t / 0.3);
        disc.material.opacity = (kind === 'fire' ? 0.18 + Math.sin(t * 9) * 0.05 : 0.35 + Math.sin(t * 9) * 0.08) * f;
        scorch.material.opacity = (kind === 'fire' ? 0.5 : 0) * Math.min(1, t / 0.6);
        ring.material.opacity = 0.85 * f;
        light.intensity = (kind === 'fire' ? 5 + Math.sin(t * 23) * 1.5 + Math.sin(t * 37) * 0.8 : 1.5) * f;
        em -= dt;
        if (em <= 0) {
          em = kind === 'fire' ? 0.02 : 0.12;
          const n = kind === 'fire' ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2; const rr = Math.sqrt(Math.random()) * r * 0.95;
            const q = [p[0] + Math.cos(a) * rr, p[1] + 0.05, p[2] + Math.sin(a) * rr];
            if (kind === 'fire') {
              this.flame(q);
              if (Math.random() < 0.18) this.ember(q);
              if (Math.random() < 0.06) this.puffAt([q[0], q[1] + 1.4, q[2]], 1.2, 1.8, 0x3a3532, 0.35, 1.2);
            } else if (kind === 'toxin') {
              this.puffAt([q[0], q[1] + 0.3, q[2]], 1.8, 2.0, Math.random() < 0.5 ? 0x9ade5a : 0x5fb83a, 0.5, 0.5);
              if (Math.random() < 0.3) this.ember([q[0], q[1], q[2]], 0xb8ff5a);
            } else {
              this.puffAt(q, 0.5, 1.4, 0xa8e0ff, 0.45, 1.0);
              if (Math.random() < 0.4) this.ember([q[0], q[1], q[2]], 0xe8f8ff);
            }
          }
        }
      },
      end: () => { this.scene.remove(g); scorch.geometry.dispose(); scorch.material.dispose(); disc.geometry.dispose(); disc.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); light.dispose(); },
    };
    this.zones.set(id, z);
    this.sound.ability(kind === 'fire' ? 'fire' : 'smoke', p);
  }

  // a small sensor on the floor with a pulsing ring
  trap(id, p, team) {
    const color = team === 'red' ? 0xff4655 : 0x3edbc4;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }));
    body.position.y = 0.06;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 3 }));
    eye.position.y = 0.14;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(body, eye, ring);
    g.position.set(p[0], p[1], p[2]);
    this.scene.add(g);
    let t = 0;
    this.zones.set(`t${id}`, {
      obj: g,
      tick: (dt) => { t += dt; ring.material.opacity = 0.12 + 0.12 * Math.sin(t * 4); eye.material.emissiveIntensity = 2 + Math.sin(t * 6) * 1.2; },
      end: () => { this.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); },
    });
    this.sound.ability('wall', p);
  }

  blink(from, to) {
    [from, to].forEach((p, k) => {
      for (let n = 0; n < 14; n++) {
        const a = (n / 14) * Math.PI * 2;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: n % 2 ? 0xc89cff : 0x7de8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.scale.setScalar(0.16);
        const y0 = p[1] + 0.1 + (n / 14) * 1.8;
        this.add(sp, 0.55 + k * 0.1, (it) => { const t = it.t / 0.55; const rr = 0.7 * (k ? t : 1 - t * 0.6); sp.position.set(p[0] + Math.cos(a + t * 5) * rr, y0 + t * 0.6, p[2] + Math.sin(a + t * 5) * rr); sp.material.opacity = 1 - t; }, () => sp.material.dispose());
      }
      this.ringWave([p[0], p[1] + 0.05, p[2]], 0xb06cff, 0.3, 2.2, 0.45, 0.8);
    });
    const dx = to[0] - from[0]; const dy = to[1] - from[1]; const dz = to[2] - from[2];
    const L = Math.hypot(dx, dy, dz);
    if (L > 0.5) {
      const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xc89cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      streak.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 1, (from[2] + to[2]) / 2);
      streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      this.add(streak, 0.3, (it) => { const t = it.t / 0.3; streak.scale.set(1 + t * 3, 1, 1 + t * 3); streak.material.opacity = 0.8 * (1 - t); }, () => { streak.geometry.dispose(); streak.material.dispose(); });
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xc89cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(to[0], to[1] + 1, to[2]);
    this.add(s, 0.35, (it) => { const t = it.t / 0.35; s.scale.setScalar(3.5 * (1 - t) + 0.5); s.material.opacity = 1 - t; }, () => s.material.dispose());
    this.sound.ability('dash', to);
  }

  supernova(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(p[0], p[1], p[2]);
    this.add(m, 0.8, (it) => { const t = it.t / 0.8; m.scale.setScalar(1 + t * 24); m.material.opacity = 0.9 * (1 - t) ** 2; }, () => { m.geometry.dispose(); m.material.dispose(); });
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xfff6d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    star.position.set(p[0], p[1], p[2]);
    this.add(star, 0.9, (it) => { const t = it.t / 0.9; star.scale.setScalar(8 + t * 40); star.material.rotation = t * 1.2; star.material.opacity = Math.pow(1 - t, 1.6); }, () => star.material.dispose());
    this.ringWave([p[0], 0.1, p[2]], 0xffe08a, 1, 30, 0.9, 0.9, false);
    this.ringWave([p[0], p[1], p[2]], 0xffffff, 1, 22, 0.7, 0.6, true);
    for (let k = 0; k < 24; k++) {
      const sp = new THREE.Sprite(this.sparkMat);
      sp.position.set(p[0], p[1], p[2]); sp.scale.setScalar(0.12);
      const a = Math.random() * Math.PI * 2; const b = (Math.random() - 0.5) * 2; const sp2 = 8 + Math.random() * 14; const v = [Math.cos(a) * sp2, b * 8, Math.sin(a) * sp2];
      this.add(sp, 0.7, (it, dt) => { sp.position.x += v[0] * dt; sp.position.y += v[1] * dt; sp.position.z += v[2] * dt; sp.material = this.sparkMat; });
    }
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.userData.peak = 90;
    this.flashT = 0.08;
    this.sound.ability('ult', p);
    this.sound.ability('flash', p);
  }

  flame(p) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1] + 0.3, p[2]);
    const h = 1.1 + Math.random() * 1.1; const w = h * (0.5 + Math.random() * 0.2);
    const life = 0.55 + Math.random() * 0.3;
    const sway = (Math.random() - 0.5) * 0.6; const ph = Math.random() * 6;
    this.add(s, life, (it) => {
      const t = it.t / life;
      s.position.y += 0.012 + (1 - t) * 0.03;
      s.position.x += Math.sin(it.t * 9 + ph) * 0.006 + sway * 0.006;
      const k = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) * 0.7;
      s.scale.set(w * k, h * (0.6 + 0.6 * Math.min(1, t * 3)) * (1 - t * 0.3), 1);
      s.material.opacity = t < 0.15 ? t / 0.15 : 1 - Math.pow(t, 1.6);
    }, () => s.material.dispose());
  }

  ember(p, color = 0xffd070) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1] + 0.4, p[2]);
    s.scale.setScalar(0.05 + Math.random() * 0.04);
    const v = [(Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8];
    const life = 0.9 + Math.random() * 0.8;
    this.add(s, life, (it, dt) => { s.position.x += v[0] * dt; s.position.y += v[1] * dt; s.position.z += v[2] * dt; v[0] += (Math.random() - 0.5) * dt * 3; s.material.opacity = 1 - it.t / life; }, () => s.material.dispose());
  }

  endZone(id) {
    const z = this.zones.get(id);
    if (z) { z.end(); this.zones.delete(id); }
  }

  wall(id, b, team) {
    const color = team === 'red' ? '#ff4655' : '#3edbc4';
    const tex = hexTex('#e8eef5', '#8fa3b8');
    const glow = hexTex('#ffffff');
    tex.colorSpace = THREE.SRGBColorSpace;
    [tex, glow].forEach((t) => t.repeat.set(Math.max(b.x1 - b.x0, b.z1 - b.z0) / 1.5, (b.y1 - b.y0) / 1.5));
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), new THREE.MeshStandardMaterial({
      color: 0xffffff, map: tex, emissive: new THREE.Color(color), emissiveMap: glow, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.3,
    }));
    m.userData.glow = glow;
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    m.castShadow = true;
    m.scale.y = 0.01;
    // glowing top edge and foot line so the wall reads clearly from afar
    [0.5, -0.5].forEach((sy) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.04, 0.07, b.z1 - b.z0 + 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.position.y = sy * (b.y1 - b.y0);
      m.add(e);
    });
    this.scene.add(m);
    let t = 0;
    this.walls.set(id, {
      m,
      tick: (dt) => { t += dt; m.scale.y = Math.min(1, t / 0.4); },
    });
    this.zones.set(`w${id}`, { tick: (dt) => this.walls.get(id) && this.walls.get(id).tick(dt), end: () => {} });
    this.sound.ability('wall', m.position.toArray());
  }

  endWall(id) {
    const w = this.walls.get(id);
    if (!w) return;
    this.scene.remove(w.m);
    w.m.geometry.dispose();
    w.m.material.map.dispose();
    w.m.material.emissiveMap.dispose();
    w.m.material.dispose();
    this.walls.delete(id);
    this.zones.delete(`w${id}`);
    this.puffAt(w.m.position.toArray(), 2, 0.6, 0xd0d8e0, 0.5);
  }

  flash(p) {
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    star.position.set(p[0], p[1], p[2]);
    this.add(star, 0.45, (it) => { const t = it.t / 0.45; star.scale.setScalar(2.5 + Math.pow(t, 0.5) * 9); star.material.rotation = t * 0.6; star.material.opacity = Math.pow(1 - t, 1.5); }, () => star.material.dispose());
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff6d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    core.position.set(p[0], p[1], p[2]);
    this.add(core, 0.5, (it) => { const t = it.t / 0.5; core.scale.setScalar(1.5 + t * 7); core.material.opacity = Math.pow(1 - t, 2); }, () => core.material.dispose());
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Sprite(this.sparkMat);
      sp.position.set(p[0], p[1], p[2]); sp.scale.setScalar(0.08);
      const a = Math.random() * Math.PI * 2; const b = (Math.random() - 0.5) * 2; const v = [Math.cos(a) * 5, b * 4, Math.sin(a) * 5];
      this.add(sp, 0.4, (it, dt) => { sp.position.x += v[0] * dt; sp.position.y += v[1] * dt; sp.position.z += v[2] * dt; });
    }
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.userData.peak = 70;
    this.flashT = 0.07;
    this.sound.ability('flash', p);
  }

  blast(p, r, big = false) {
    // fireball: a few overlapping flame sprites ballooning outward
    for (let k = 0; k < (big ? 7 : 5); k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: k % 2 ? 0xffb347 : 0xff6a1e, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const o = [(Math.random() - 0.5) * r * 0.4, Math.random() * r * 0.3, (Math.random() - 0.5) * r * 0.4];
      s.position.set(p[0] + o[0], p[1] + 0.6 + o[1], p[2] + o[2]);
      const life = 0.45 + Math.random() * 0.2;
      this.add(s, life, (it) => { const t = it.t / life; s.scale.setScalar(r * (0.5 + t * (1.2 + k * 0.08))); s.position.y += 0.02; s.material.opacity = 0.95 * Math.pow(1 - t, 1.6); }, () => s.material.dispose());
    }
    // white-hot core
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff2c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    core.position.set(p[0], p[1] + 0.6, p[2]);
    this.add(core, 0.25, (it) => { const t = it.t / 0.25; core.scale.setScalar(r * (0.4 + t * 0.7)); core.material.opacity = 1 - t; }, () => core.material.dispose());
    // ground shock ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p[0], (p[1] > 1 ? 0 : p[1]) + 0.08, p[2]);
    this.add(ring, 0.5, (it) => { const t = it.t / 0.5; ring.scale.setScalar(r * (0.4 + t * 1.5)); ring.material.opacity = 0.8 * (1 - t); }, () => { ring.geometry.dispose(); ring.material.dispose(); });
    // sparks and debris thrown out, dark smoke and dust rolling up
    for (let k = 0; k < (big ? 26 : 16); k++) {
      const sp = new THREE.Sprite(this.sparkMat);
      sp.position.set(p[0], p[1] + 0.5, p[2]); sp.scale.setScalar(0.07 + Math.random() * 0.06);
      const a = Math.random() * Math.PI * 2; const sp2 = 4 + Math.random() * 9; const v = [Math.cos(a) * sp2, 3 + Math.random() * 7, Math.sin(a) * sp2];
      this.add(sp, 0.5 + Math.random() * 0.5, (it, dt) => { v[1] -= 15 * dt; sp.position.x += v[0] * dt; sp.position.y = Math.max(0.05, sp.position.y + v[1] * dt); sp.position.z += v[2] * dt; });
    }
    for (let k = 0; k < (big ? 14 : 9); k++) this.puffAt([p[0] + (Math.random() - 0.5) * r, p[1] + 0.3 + Math.random() * 1.5, p[2] + (Math.random() - 0.5) * r], 1.6, 1.6 + Math.random(), k % 3 ? 0x4a4642 : 0xb9a98c, 0.65, 1.3);
    // scorch mark left on the ground
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 28), new THREE.MeshBasicMaterial({ color: 0x0e0a07, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(p[0], (p[1] > 1 ? 0 : p[1]) + 0.025, p[2]);
    this.add(scorch, 10, (it) => { scorch.material.opacity = 0.45 * Math.min(1, (10 - it.t) / 3); }, () => { scorch.geometry.dispose(); scorch.material.dispose(); });
    this.flashLight.position.set(p[0], p[1] + 1, p[2]);
    this.flashLight.userData.peak = big ? 90 : 50;
    this.flashT = 0.08;
    this.sound.ability('blast', p);
  }

  concuss(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
    m.position.set(p[0], p[1], p[2]);
    this.add(m, 0.5, (it) => { const t = it.t / 0.5; m.scale.setScalar(6.5 * (1 - Math.pow(1 - t, 3))); m.material.opacity = 0.35 * (1 - t); }, () => { m.geometry.dispose(); m.material.dispose(); });
    this.ringWave([p[0], Math.max(0.08, p[1] - 0.9), p[2]], 0xc8a0ff, 0.5, 6.5, 0.5, 0.18, false);
    this.ringWave([p[0], p[1], p[2]], 0xe0c8ff, 0.5, 6, 0.45, 0.14, true);
    this.ringWave([p[0], Math.max(0.08, p[1] - 0.9), p[2]], 0x8a60ff, 0.3, 4.5, 0.65, 0.25, false);
    for (let k = 0; k < 18; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xc8a0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.set(p[0], p[1], p[2]); sp.scale.setScalar(0.18);
      const a = Math.random() * Math.PI * 2; const b = (Math.random() - 0.5) * 1.4; const v = [Math.cos(a) * 9, b * 6, Math.sin(a) * 9];
      this.add(sp, 0.4, (it, dt) => { sp.position.x += v[0] * dt; sp.position.y += v[1] * dt; sp.position.z += v[2] * dt; sp.material.opacity = 1 - it.t / 0.4; }, () => sp.material.dispose());
    }
    this.sound.ability('concuss', p);
  }

  pulse(p, color = 0x40ffb0) {
    this.ringWave([p[0], p[1] + 0.2, p[2]], color, 1, 24, 1.2, 0.9, 0.06, false);
    this.ringWave([p[0], p[1] + 0.2, p[2]], color, 1, 16, 1.0, 0.4, 0.2, false);
    // a faint vertical curtain riding the ring
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 48, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cyl.position.set(p[0], p[1] + 0.8, p[2]);
    this.add(cyl, 1.2, (it) => { const t = it.t / 1.2; cyl.scale.set(1 + (1 - Math.pow(1 - t, 3)) * 23, 1, 1 + (1 - Math.pow(1 - t, 3)) * 23); cyl.material.opacity = 0.28 * Math.pow(1 - t, 1.4); }, () => { cyl.geometry.dispose(); cyl.material.dispose(); });
    this.sound.ability('pulse', p);
  }

  orbital(p, delay) {
    const g = new THREE.Group();
    const col = 0xff3d7f;
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.7, 48), new THREE.MeshBasicMaterial({ color: 0xffb0cc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring2.rotation.x = -Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 70, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7ab0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 35;
    g.add(ring, ring2, disc, beam);
    g.position.set(p[0], p[1] + 0.1, p[2]);
    this.add(g, delay, (it) => {
      const t = it.t / delay;
      ring.rotation.z += 0.05; ring2.rotation.z -= 0.08;
      ring.scale.setScalar(1 - t * 0.8);
      ring2.scale.setScalar(0.4 + 0.6 * (1 - t) + Math.sin(it.t * 14) * 0.04);
      disc.material.opacity = 0.1 + t * 0.3 + Math.sin(it.t * 18) * 0.05;
      beam.scale.set(0.4 + t * 5, 1, 0.4 + t * 5);
      beam.material.opacity = 0.12 + t * 0.7;
    }, () => {
      ring.geometry.dispose(); ring.material.dispose(); ring2.geometry.dispose(); ring2.material.dispose(); disc.geometry.dispose(); disc.material.dispose(); beam.geometry.dispose(); beam.material.dispose();
      // the strike lands: a flash, a fireball and a ring of fire
      this.ringWave([p[0], p[1] + 0.12, p[2]], 0xff9a5a, 2, 22, 0.8, 0.9, 0.3, false);
      this.ringWave([p[0], p[1] + 0.12, p[2]], 0xffffff, 1, 14, 0.5, 0.8, 0.15, false);
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xffd0e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      star.position.set(p[0], p[1] + 1.5, p[2]);
      this.add(star, 0.6, (it2) => { const t2 = it2.t / 0.6; star.scale.setScalar(6 + t2 * 26); star.material.opacity = Math.pow(1 - t2, 1.5); }, () => star.material.dispose());
    });
    this.sound.ability('orbital', p);
  }

  healFx(p) {
    this.ringWave([p[0], p[1] + 0.05, p[2]], 0x7dff9a, 0.3, 1.6, 0.8, 0.8, 0.15, false);
    for (let k = 0; k < 16; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: k % 3 ? 0x7dff9a : 0xe8ffd0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = Math.random() * Math.PI * 2;
      const r0 = 0.25 + Math.random() * 0.45;
      s.position.set(p[0] + Math.cos(a) * r0, p[1] + Math.random() * 0.6, p[2] + Math.sin(a) * r0);
      s.scale.setScalar(0.12 + Math.random() * 0.1);
      const sp = 0.8 + Math.random() * 1.2;
      this.add(s, 1.1, (it, dt) => { s.position.y += sp * dt; s.material.opacity = Math.sin(Math.min(1, it.t / 1.1) * Math.PI); });
    }
    this.sound.ability('heal', p);
  }

  dashFx(p) {
    for (let k = 0; k < 8; k++) this.puffAt([p[0], p[1] + 0.2 + Math.random() * 0.5, p[2]], 0.8, 0.6, 0xe8d8b8, 0.5, 0.2);
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.set(p[0] + (Math.random() - 0.5) * 0.8, p[1] + 0.2 + Math.random() * 1.5, p[2] + (Math.random() - 0.5) * 0.8);
      sp.scale.set(0.5, 0.05, 1);
      this.add(sp, 0.3, (it) => { sp.material.opacity = 1 - it.t / 0.3; sp.scale.x = 0.5 + it.t * 3; }, () => sp.material.dispose());
    }
    this.sound.ability('dash', p);
  }

  clear() {
    this.zones.forEach((z) => z.end && z.end());
    this.zones.clear();
    this.walls.forEach((w, id) => this.endWall(id));
    this.projs.forEach((p, id) => this.projEnd(id));
    this.items.forEach((it) => { this.scene.remove(it.obj); if (it.onEnd) it.onEnd(it); });
    this.items = [];
  }
}
