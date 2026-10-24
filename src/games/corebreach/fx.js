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

export class FX {
  constructor(scene, level, sound) {
    this.scene = scene;
    this.level = level;
    this.sound = sound;
    this.glow = glowTex();
    this.puff = puffTex();
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
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.0, depthWrite: true, emissive: 0x20232c, emissiveIntensity: 0.6 });
    const outer = new THREE.Mesh(new THREE.SphereGeometry(r, 56, 36), mat);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(r * 0.97, 24, 16), new THREE.MeshBasicMaterial({ color: 0x55596a, side: THREE.BackSide, transparent: true, opacity: 0 }));
    g.add(outer, inner);
    // billow the surface so it reads as gas, not a ball (smooth normals)
    const pos = outer.geometry.attributes.position;
    const ph = Math.random() * 10;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / r; const y = pos.getY(i) / r; const z = pos.getZ(i) / r;
      const k = 1 + (Math.sin(x * 4.1 + ph) * Math.cos(z * 3.7 - ph) + Math.sin(y * 5.3 + x * 2.1) * 0.6 + Math.cos(z * 7.9 + y * 3.3 + ph) * 0.3) * 0.045 - (y < -0.6 ? (-0.6 - y) * 0.6 : 0);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    outer.geometry.computeVertexNormals();
    mat.color.set(color);
    // a few soft puffs around the edge
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puff, color: 0xb8bcc8, transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(Math.cos(a) * r * 0.85, -r * 0.25 + Math.random() * r * 0.6, Math.sin(a) * r * 0.85);
      s.scale.setScalar(r * 1.1);
      s.userData.puff = true;
      g.add(s);
    }
    g.position.set(p[0], p[1], p[2]);
    this.scene.add(g);
    let t = 0;
    const z = {
      obj: g,
      tick: (dt) => {
        t += dt;
        const o = Math.min(1, t / 0.8) * (dur - t < 1.2 ? Math.max(0, (dur - t) / 1.2) : 1);
        // fully solid once it has formed (any transparency lets shapes show through)
        mat.opacity = o;
        mat.transparent = o < 1;
        inner.material.opacity = o;
        inner.material.transparent = o < 1;
        g.children.forEach((c) => { if (c.userData.puff) c.material.opacity = 0.5 * o; });
        g.rotation.y += dt * 0.05;
        const s = 0.6 + 0.4 * Math.min(1, t / 0.6);
        g.scale.setScalar(s);
      },
      end: () => { this.scene.remove(g); outer.geometry.dispose(); inner.geometry.dispose(); mat.dispose(); inner.material.dispose(); g.children.forEach((c) => { if (c.userData.puff) c.material.dispose(); }); },
    };
    this.zones.set(id, z);
    this.sound.ability('smoke', p);
  }

  groundZone(id, kind, p, r, dur) {
    const color = kind === 'fire' ? 0xff5a1a : kind === 'toxin' ? 0x8dff3a : 0x6ac8ff;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(disc, ring);
    g.position.set(p[0], p[1], p[2]);
    const light = new THREE.PointLight(color, kind === 'fire' ? 4 : 1.5, r * 3, 2);
    light.position.y = 1;
    g.add(light);
    this.scene.add(g);
    let t = 0;
    let em = 0;
    const z = {
      obj: g,
      tick: (dt) => {
        t += dt;
        disc.material.opacity = (0.35 + Math.sin(t * 9) * 0.08) * Math.min(1, (dur - t) / 0.8);
        light.intensity = (kind === 'fire' ? 4 + Math.sin(t * 23) * 1.2 : 1.5) * Math.min(1, (dur - t) / 0.8);
        em -= dt;
        if (em <= 0) {
          em = kind === 'fire' ? 0.04 : 0.12;
          const a = Math.random() * Math.PI * 2; const rr = Math.sqrt(Math.random()) * r;
          const q = [p[0] + Math.cos(a) * rr, p[1] + 0.1, p[2] + Math.sin(a) * rr];
          if (kind === 'fire') this.flame(q);
          else if (kind === 'toxin') this.puffAt([q[0], q[1] + 0.3, q[2]], 1.2, 1.6, 0x9ade5a, 0.45, 0.6);
          else this.puffAt(q, 0.4, 1.2, 0x9ad8ff, 0.4, 1.2);
        }
      },
      end: () => { this.scene.remove(g); disc.geometry.dispose(); disc.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); light.dispose(); },
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
      for (let n = 0; n < 10; n++) this.puffAt([p[0] + (Math.random() - 0.5) * 0.6, p[1] + 0.2 + Math.random() * 1.6, p[2] + (Math.random() - 0.5) * 0.6], 0.5, 0.5 + k * 0.2, 0xc89cff, 0.7, 0.4);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xb06cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(to[0], to[1] + 1, to[2]);
    this.add(s, 0.35, (it) => { const t = it.t / 0.35; s.scale.setScalar(3 * (1 - t) + 0.5); s.material.opacity = 1 - t; }, () => s.material.dispose());
    this.sound.ability('dash', to);
  }

  supernova(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(p[0], p[1], p[2]);
    this.add(m, 0.8, (it) => { const t = it.t / 0.8; m.scale.setScalar(1 + t * 24); m.material.opacity = 0.9 * (1 - t) ** 2; }, () => { m.geometry.dispose(); m.material.dispose(); });
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.userData.peak = 90;
    this.flashT = 0.06;
    this.sound.ability('ult', p);
    this.sound.ability('flash', p);
  }

  flame(p) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1], p[2]);
    const sz = 0.5 + Math.random() * 0.6;
    this.add(s, 0.7, (it) => {
      const t = it.t / 0.7;
      s.position.y += 0.035;
      s.scale.set(sz * (1 - t * 0.5), sz * (1.4 - t * 0.6), 1);
      s.material.opacity = 1 - t;
    }, () => s.material.dispose());
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
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1], p[2]);
    this.add(s, 0.5, (it) => { const t = it.t / 0.5; s.scale.setScalar(2 + t * 10); s.material.opacity = 1 - t; }, () => s.material.dispose());
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.userData.peak = 60;
    this.flashT = 0.06;
    this.sound.ability('flash', p);
  }

  blast(p, r, big = false) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: big ? 0xff8040 : 0xffa060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(p[0], p[1] + 0.5, p[2]);
    this.add(m, 0.5, (it) => { const t = it.t / 0.5; m.scale.setScalar(r * (0.3 + t)); m.material.opacity = 0.9 * (1 - t); }, () => { m.geometry.dispose(); m.material.dispose(); });
    for (let k = 0; k < (big ? 14 : 8); k++) this.puffAt([p[0] + (Math.random() - 0.5) * r, p[1] + Math.random() * 2, p[2] + (Math.random() - 0.5) * r], 1.5, 1.5, 0x555555, 0.7, 1.5);
    this.flashLight.position.set(p[0], p[1] + 1, p[2]);
    this.flashLight.userData.peak = big ? 80 : 40;
    this.flashT = 0.06;
    this.sound.ability('blast', p);
  }

  concuss(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    m.position.set(p[0], p[1], p[2]);
    this.add(m, 0.5, (it) => { const t = it.t / 0.5; m.scale.setScalar(6.5 * t); m.material.opacity = 0.7 * (1 - t); }, () => { m.geometry.dispose(); m.material.dispose(); });
    this.sound.ability('concuss', p);
  }

  pulse(p, color = 0x40ffb0) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p[0], p[1] + 0.2, p[2]);
    this.add(m, 1.2, (it) => { const t = it.t / 1.2; m.scale.setScalar(1 + t * 22); m.material.opacity = 0.9 * (1 - t); }, () => { m.geometry.dispose(); m.material.dispose(); });
    this.sound.ability('pulse', p);
  }

  orbital(p, delay) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 64), new THREE.MeshBasicMaterial({ color: 0xff3d7f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7ab0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 30;
    g.add(ring, beam);
    g.position.set(p[0], p[1] + 0.1, p[2]);
    this.add(g, delay, (it) => {
      const t = it.t / delay;
      ring.rotation.z += 0.05;
      ring.scale.setScalar(1 - t * 0.8);
      beam.scale.set(1 + t * 4, 1, 1 + t * 4);
      beam.material.opacity = 0.15 + t * 0.6;
    }, () => { ring.geometry.dispose(); ring.material.dispose(); beam.geometry.dispose(); beam.material.dispose(); });
    this.sound.ability('orbital', p);
  }

  healFx(p) {
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x7dff9a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = Math.random() * Math.PI * 2;
      s.position.set(p[0] + Math.cos(a) * 0.5, p[1] + Math.random() * 1.6, p[2] + Math.sin(a) * 0.5);
      s.scale.setScalar(0.15);
      this.add(s, 1, (it) => { s.position.y += 0.02; s.material.opacity = 1 - it.t; }, () => s.material.dispose());
    }
    this.sound.ability('heal', p);
  }

  dashFx(p) {
    for (let k = 0; k < 8; k++) this.puffAt([p[0], p[1] + 0.3 + Math.random(), p[2]], 0.8, 0.6, 0xffd0a0, 0.5, 0.2);
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
