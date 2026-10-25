// Ascendants effects: a particle engine (glowing sparks and soft smoke), flying rocks, technique visuals
// (ki blasts with streaks, bombs, homing discs, giant gathered spheres, gravity fields, charged beams with
// glowing heads, beam clashes, stone spikes, comets, explosions with domes and shockwaves), flame auras,
// craters burned into the ground, toppling trees, hero status visuals (barrier bubble, time-stop shell)
// and the storm wall.
import * as THREE from 'three';
import { POWER } from './data.js';
import * as TX from './texgen.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 4);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max); this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('color', this.colAttr); g.setAttribute('size', this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: additive ? TX.glowTex() : TX.smokeTex() }, scale: { value: 600 } },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.004) discard; }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }
  emit(p, v, color, size, life, { grav = 0, drag = 0.5, grow = 0, alpha = 1 } = {}) {
    let i = this.n;
    if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
    this.p.set(p, i * 3); this.v.set(v, i * 3);
    this.c[i * 4] = color.r; this.c[i * 4 + 1] = color.g; this.c[i * 4 + 2] = color.b; this.c[i * 4 + 3] = alpha;
    this.a0[i] = alpha; this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) { // move the last one here
          this.p.copyWithin(i * 3, n * 3, n * 3 + 3); this.v.copyWithin(i * 3, n * 3, n * 3 + 3); this.c.copyWithin(i * 4, n * 4, n * 4 + 4);
          this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.size[i] = this.size[n]; this.grow[i] = this.grow[n]; this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n]; this.a0[i] = this.a0[n];
          i--;
        }
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
    }
    this.n = n;
    const pa = this.posAttr.array; const ca = this.colAttr.array; const sa = this.sizeAttr.array;
    for (let i = 0; i < n; i++) {
      pa[i * 3] = this.p[i * 3]; pa[i * 3 + 1] = this.p[i * 3 + 1]; pa[i * 3 + 2] = this.p[i * 3 + 2];
      const f = this.life[i] / this.maxLife[i];
      ca[i * 4] = this.c[i * 4]; ca[i * 4 + 1] = this.c[i * 4 + 1]; ca[i * 4 + 2] = this.c[i * 4 + 2]; ca[i * 4 + 3] = this.a0[i] * Math.min(1, f * 2.5) * Math.min(1, (1 - f) * 12 + 0.2);
      sa[i] = this.size[i];
    }
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true; this.sizeAttr.needsUpdate = true;
  }
}


// flame-like aura around a hero: a capsule of licking additive flames
const AURA_VS = `uniform float time; uniform float amp; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vH;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vUv = uv; vec3 p = position; vH = uv.y;
  float flame = sin(uv.x * 37.7 + time * 9.0) * 0.5 + sin(uv.x * 18.8 - time * 6.0 + uv.y * 4.0) * 0.5;
  // flame tongues: the upper half rises into points, one per column around the body
  float tx = uv.x * 9.0;
  float tri = 1.0 - abs(fract(tx) - 0.5) * 2.0;
  float fl = 0.5 + 0.5 * sin(floor(tx) * 2.7 + time * 6.0);
  float rise = pow(max(0.0, uv.y - 0.35) / 0.65, 1.6);
  p.y += (tri * tri * (0.55 + fl * 0.6)) * rise * amp * 1.2;
  p.xz *= (1.0 + flame * 0.08 * amp * uv.y + amp * 0.12) * (1.0 - rise * (1.0 - tri) * 0.35);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const AURA_FS = `uniform vec3 c; uniform vec3 c2; uniform float time; uniform float amp; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vH;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
void main(){
  // anime aura: a silhouette of sharp flame tongues licking upward, bright at the rim, clear inside
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.3);
  float x = vUv.x * 9.0;
  float col = floor(x);
  float tri = 1.0 - abs(fract(x) - 0.5) * 2.0;           // a pointed tip per column
  float flick = n2(vec2(col * 1.7, time * 3.0 + col));
  float top = 0.45 + 0.42 * flick + tri * 0.28 * (0.6 + flick);
  float inside = step(vH, top);
  float edge = smoothstep(top - 0.07, top, vH) * inside;  // a bright line along the flame edges
  float streak = step(0.72, n2(vec2(vUv.x * 30.0, vH * 3.0 - time * 7.0))) * inside;
  float a = (inside * (0.03 + fres * 0.42) + edge * 0.8 + streak * 0.22) * smoothstep(0.0, 0.1, vH) * amp;
  vec3 colr = mix(c, c2, edge * 0.85 + streak * 0.4 + fres * 0.2);
  gl_FragColor = vec4(colr * (1.4 + edge), a);
}`;

function craterTex() {
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(18,12,8,0.95)'); gr.addColorStop(0.35, 'rgba(36,26,18,0.9)'); gr.addColorStop(0.62, 'rgba(70,52,36,0.75)');
  gr.addColorStop(0.78, 'rgba(120,96,70,0.55)'); gr.addColorStop(1, 'rgba(120,96,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // cracks radiating out
  g.strokeStyle = 'rgba(30,20,14,0.45)'; g.lineWidth = 0.8;
  for (let k = 0; k < 10; k++) {
    let a = Math.random() * Math.PI * 2; let r = S * 0.18; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    while (r < S * (0.3 + Math.random() * 0.15)) { r += 4 + Math.random() * 6; a += (Math.random() - 0.5) * 0.4; g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FX {
  constructor(scene, island, quality) {
    this.scene = scene; this.island = island; this.quality = quality;
    this.glow = new Particles(scene, quality === 'low' ? 3000 : 8000, true);
    this.smoke = new Particles(scene, quality === 'low' ? 1000 : 2600, false);
    this.items = []; // timed meshes: { obj, t, life, update(f, t) }
    this.ents = new Map();
    this.zones = new Map();
    this.beams = new Map();   // simple lines (rays, lashes)
    this.kiBeams = new Map(); // charged beams with heads
    this.clashes = new Map();
    this.craters = [];
    this.time = 0;
    this.tmpC = new THREE.Color();
    this.lookup = () => null; // (id) => [x, y, z] of a hero, set by the game
    this.flashes = [];
    for (let k = 0; k < 5; k++) { const l = new THREE.PointLight(0xffffff, 0, 18, 2); scene.add(l); this.flashes.push(l); }
    this.flashI = 0;
    this.storm = this.makeStorm();
    this.glowMap = TX.glowTex();
    this.craterMap = craterTex();
    // a teardrop of flame: rounded at the feet, widest at the chest, licking up to a point above the head
    const prof = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; const y = -0.15 + t * 3.3; const r = t < 0.3 ? 0.35 + Math.sin((t / 0.3) * Math.PI / 2) * 0.38 : 0.73 * Math.pow(Math.cos(((t - 0.3) / 0.7) * Math.PI / 2), 0.8); prof.push(new THREE.Vector2(Math.max(0.02, r), y)); }
    this.auraGeo = new THREE.LatheGeometry(prof, 28);
    // flying rocks (charging lifts the ground around you, explosions throw debris)
    const rockGeo = new THREE.DodecahedronGeometry(0.11, 0);
    this.rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xb8a68e, roughness: 0.95 }), 160);
    this.rocks.count = 0; this.rocks.frustumCulled = false; this.rocks.castShadow = true;
    scene.add(this.rocks);
    this.rockL = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3();
  }
  col(hex) { return this.tmpC.set(hex).clone(); }

  flash(p, color, power = 30, dist = 18) { const l = this.flashes[this.flashI++ % this.flashes.length]; l.position.set(p[0], p[1] + 0.5, p[2]); l.color.set(color); l.intensity = power; l.distance = dist; l.userData.t = 0.25; }

  burst(p, color, n = 30, speed = 8, size = 0.5, life = 0.6, opt = {}) {
    const c = this.col(color);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2; const u = Math.random() * 2 - 1; const s = speed * (0.3 + Math.random() * 0.7);
      const r = Math.sqrt(1 - u * u);
      this.glow.emit(p, [Math.cos(a) * r * s, u * s * (opt.up ?? 1) + (opt.lift || 0), Math.sin(a) * r * s], c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), { grav: opt.grav ?? 4, drag: opt.drag ?? 2.2 });
    }
  }
  puff(p, color, n = 10, size = 2, life = 1.4, spread = 1, alpha = 0.6) {
    const c = this.col(color);
    for (let k = 0; k < n; k++) this.smoke.emit([p[0] + (Math.random() - 0.5) * spread, p[1] + Math.random() * spread * 0.5, p[2] + (Math.random() - 0.5) * spread], [(Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2], c, size * (0.7 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.6), { grav: -0.3, drag: 1.2, grow: size * 0.8, alpha });
  }
  ring(p, color, r, life = 0.5, y = 0.1, width = 0.2) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(p[0], p[1] + y, p[2]);
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, life, update: (f) => { const s = 0.3 + (1 - (1 - f) ** 2) * r; m.scale.set(s, s, s); m.material.opacity = 0.85 * (1 - f); } });
  }
  // a glowing sphere that swells and fades: the heart of a big explosion
  dome(p, color, r, life = 0.7) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(p[0], p[1], p[2]);
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, life, update: (f) => { const s = 0.2 + (1 - (1 - f) ** 3) * r; m.scale.set(s, s * 0.85, s); m.material.opacity = 0.5 * (1 - f) ** 1.5; } });
  }
  rock(p, v, life = 2, size = 1, grav = 18) { if (this.rockL.length >= 160) this.rockL.shift(); this.rockL.push({ p: p.slice(), v: v.slice(), life, t: 0, s: size * (0.4 + Math.random() * 0.8), r: [Math.random() * 6, Math.random() * 6, Math.random() * 6], w: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6], grav }); }

  // explosion / impact for a technique
  boom(p, power, r = 1.6, big = false, huge = false) {
    const P = POWER[power] || { color: '#ffffff', glow: '#ffffff' };
    if (power === 'heavy') { this.burst(p, '#ffffff', 26, 9, 0.5, 0.35, { grav: 0 }); this.ring([p[0], p[1] - 1, p[2]], '#ffffff', 3.5, 0.3, 1, 0.12); return; }
    if (power === 'storm') return;
    big = big || r > 3;
    this.flash(p, P.color, huge ? 160 : big ? 80 : 20, huge ? r * 6 : big ? r * 4 : 10);
    this.burst(p, P.glow, huge ? 140 : big ? 70 : 14, big ? r * 3.2 : 6, huge ? 2 : big ? 1.1 : 0.4, big ? 0.9 : 0.4, { lift: 2 });
    this.burst(p, P.color, huge ? 90 : big ? 50 : 10, big ? r * 2 : 4, huge ? 2.4 : big ? 1.6 : 0.55, big ? 1.1 : 0.5, { lift: 1 });
    if (big) {
      this.dome(p, P.glow, r * (huge ? 1.0 : 0.7), huge ? 1.0 : 0.5);
      this.puff(p, '#a89a86', huge ? 18 : 8, huge ? 5 : 3, huge ? 3 : 1.8, r * 0.8, 0.22);
      this.ring(p, P.glow, r * 1.6, 0.6);
      if (huge) { this.ring([p[0], p[1] + 0.5, p[2]], '#ffffff', r * 2.6, 1.0, 0.1, 0.08); }
      for (let k = 0; k < (huge ? 40 : 16); k++) this.rock(p, [(Math.random() - 0.5) * r * 4, 6 + Math.random() * r * 3, (Math.random() - 0.5) * r * 4], 2.5, huge ? 2.2 : 1.4);
    } else if (r > 1.2) this.puff(p, '#c9b8a0', 3, 0.9, 0.7, 0.4, 0.35);
  }

  // ── projectiles and other moving things ──
  addEnt(e, makeClone) {
    const P = POWER[e.power] || {};
    const g = new THREE.Group();
    let trail = P.color || '#ffffff';
    const halo = (size, color = P.color, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); s.scale.setScalar(size); g.add(s); return s; };
    const core = (r, color = P.glow) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), new THREE.MeshBasicMaterial({ color })); g.add(m); return m; };
    if (e.kind === 'bolt') {
      if (e.huge) {
        // a giant gathered sphere (or the star breaker): layered glowing shells
        core(2.2, '#ffffff');
        const shell = new THREE.Mesh(new THREE.SphereGeometry(3.3, 32, 20), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(shell); g.userData.pulse = shell;
        halo(16); halo(9, P.glow);
        g.userData.light = true;
      } else if (e.big || e.power === 'bomb') {
        core(e.big ? 1.3 : 0.55); halo(e.big ? 7 : 3.2);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(e.big ? 1.8 : 0.8, 20, 14), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(shell); g.userData.pulse = shell;
      } else {
        // a ki blast: hot core, coloured glow, short streak
        core(e.small ? 0.18 : 0.3); halo(e.small ? 1.3 : 1.9);
        const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.01, 1.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        streak.rotation.x = Math.PI / 2; streak.position.z = 0.75;
        const sg = new THREE.Group(); sg.add(streak); g.add(sg); g.userData.align = sg;
      }
    } else if (e.kind === 'disc') {
      const disc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: P.color }));
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = Math.PI / 2; inner.rotation.x = -Math.PI / 2;
      const dg = new THREE.Group(); dg.add(disc, inner); g.add(dg); g.userData.spinY = dg;
      halo(2.6, P.color, 0.6);
    } else if (e.kind === 'orb') {
      core(0.4, '#05030c'); halo(2.6);
    } else if (e.kind === 'clone') {
      const h = makeClone(e);
      if (h) { g.add(h.root); g.userData.hero = h; }
      trail = null;
    }
    g.position.set(...e.p);
    this.scene.add(g);
    this.ents.set(e.id, { ...e, obj: g, trail, v: e.v.slice(), p: e.p.slice(), t: 0 });
  }
  removeEnt(id, at, fizzle) {
    const e = this.ents.get(id);
    if (!e) return;
    this.scene.remove(e.obj);
    e.obj.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    this.ents.delete(id);
    if (fizzle && at) this.burst(at, POWER[e.power] ? POWER[e.power].glow : '#fff', 10, 3, 0.4, 0.4);
  }
  updateEnts(dt, animClone) {
    for (const e of this.ents.values()) {
      e.t += dt;
      if (e.kind === 'clone') {
        // copies hover beside their owner
        const o = this.lookup(e.owner);
        if (o) {
          const a = (o.yaw || 0) + (e.slot ? -1 : 1) * 1.2;
          const want = [o.p[0] - Math.sin(a) * 2.6, o.p[1] + (o.mode === 'fly' ? 0.4 : 0), o.p[2] - Math.cos(a) * 2.6];
          e.p = e.p.map((c, i) => c + (want[i] - c) * Math.min(1, dt * 6));
          e.yaw = o.face ?? o.yaw;
        }
        e.obj.position.set(...e.p);
        if (e.obj.userData.hero) { e.obj.userData.hero.root.rotation.y = e.yaw || 0; animClone(e.obj.userData.hero, dt, o); }
        if (Math.random() < 0.3) this.glow.emit([e.p[0] + (Math.random() - 0.5) * 0.6, e.p[1] + Math.random() * 1.8, e.p[2] + (Math.random() - 0.5) * 0.6], [0, 1, 0], this.col('#cfe9ff'), 0.3, 0.5);
        if (e.t > (e.life || 8) + 1) this.removeEnt(e.id, null, false);
        continue;
      }
      if (e.kind === 'disc' && e.target) {
        const tp = this.lookup(e.target);
        if (tp) {
          const want = new THREE.Vector3(tp.p[0] - e.p[0], tp.p[1] + 1.1 - e.p[1], tp.p[2] - e.p[2]).normalize().multiplyScalar(POWER.disc.speed);
          e.v = e.v.map((c, i) => c + (want.getComponent(i) - c) * Math.min(1, dt * 2.6));
        }
      }
      e.v[1] -= (e.grav || 0) * dt;
      e.p[0] += e.v[0] * dt; e.p[1] += e.v[1] * dt; e.p[2] += e.v[2] * dt;
      e.obj.position.set(...e.p);
      const U = e.obj.userData;
      if (U.spinY) U.spinY.rotation.y += dt * 22;
      if (U.pulse) { const s = 1 + Math.sin(this.time * 18) * 0.06; U.pulse.scale.setScalar(s); }
      if (U.align) U.align.lookAt(e.obj.position.clone().sub(V(e.v)));
      if (U.light && Math.random() < 0.5) this.flash(e.p, POWER[e.power].color, 60, 40);
      if (e.trail) {
        const c = this.col(e.trail);
        const n = e.huge ? 6 : e.big ? 3 : e.small ? 1 : 2;
        const sz = e.huge ? 2.4 : e.big ? 1 : e.small ? 0.3 : 0.45;
        for (let k = 0; k < n; k++) this.glow.emit([e.p[0] + (Math.random() - 0.5) * sz, e.p[1] + (Math.random() - 0.5) * sz, e.p[2] + (Math.random() - 0.5) * sz], [(Math.random() - 0.5), (Math.random() - 0.5) + 0.5, (Math.random() - 0.5)], c, sz, e.huge ? 0.7 : 0.3, { drag: 2 });
        if (e.huge && Math.random() < 0.5) this.burst(e.p, POWER[e.power].glow, 3, 10, 0.5, 0.4, { grav: 0 });
        if (e.kind === 'orb' && Math.random() < 0.6) this.glow.emit(e.p.slice(), [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3], c, 0.5, 0.4);
      }
      if (e.t > (e.life || 5) + 1) this.removeEnt(e.id, null, false);
    }
  }

  // ── gravity fields ──
  addZone(z) {
    const P = POWER[z.power];
    const g = new THREE.Group(); g.position.set(...z.p);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    core.position.y = 1.5; g.add(core);
    const rim = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color: P.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    rim.scale.setScalar(4); rim.position.y = 1.5; g.add(rim);
    const disc = new THREE.Mesh(new THREE.RingGeometry(1.1, z.r * 0.85, 64, 1), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2 + 0.25; disc.position.y = 1.5; g.add(disc);
    g.userData.disc = disc;
    this.scene.add(g);
    this.zones.set(z.id, { ...z, obj: g, t: 0 });
  }
  removeZone(id) { const z = this.zones.get(id); if (!z) return; this.scene.remove(z.obj); this.zones.delete(id); }
  updateZones(dt) {
    for (const z of this.zones.values()) {
      z.t += dt;
      const P = POWER[z.power];
      if (z.obj.userData.disc) z.obj.userData.disc.rotation.z += dt * 2.5;
      const c = this.col(P.color);
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2; const r = z.r * (0.6 + Math.random() * 0.5);
        const p = [z.p[0] + Math.cos(a) * r, z.p[1] + 0.5 + Math.random() * 2, z.p[2] + Math.sin(a) * r];
        this.glow.emit(p, [(z.p[0] - p[0]) * 1.4 - Math.sin(a) * 4, (z.p[1] + 1.5 - p[1]) * 1.4, (z.p[2] - p[2]) * 1.4 + Math.cos(a) * 4], c, 0.35, 0.6, { drag: 0.5 });
      }
      if (Math.random() < 0.1) this.rock([z.p[0] + (Math.random() - 0.5) * z.r, z.p[1] + 0.2, z.p[2] + (Math.random() - 0.5) * z.r], [0, 3, 0], 1.5, 0.8, -1);
      if (z.t > (z.dur || 3) + 0.5) this.removeZone(z.id);
    }
  }

  // ── auras (charging, boosting, forms, the crimson surge) ──
  aura(color, color2) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(color) }, c2: { value: new THREE.Color(color2 || '#ffffff') }, time: { value: 0 }, amp: { value: 0 } },
      vertexShader: AURA_VS, fragmentShader: AURA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.auraGeo, mat);
    m.renderOrder = 7; m.frustumCulled = false;
    return m;
  }

  // ── charged beams ──
  // b: { bid, owner, power, d (dir), w (width), max }
  addBeam(b) {
    const P = POWER[b.power];
    const g = new THREE.Group();
    const mat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    const cyl = (r) => { const geo = new THREE.CylinderGeometry(r, r, 1, 20, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2); return geo; };
    const outer = new THREE.Mesh(cyl(1), mat(P.color, 0.55));
    const mid = new THREE.Mesh(cyl(0.62), mat(P.color, 0.7));
    const inner = new THREE.Mesh(cyl(0.3), mat(P.glow, 1));
    const body = new THREE.Group(); body.add(outer, mid, inner); g.add(body);
    // the beam flares out of the hands over the first few metres, so the caster stays visible
    const cone = (r) => { const geo = new THREE.CylinderGeometry(r, r * 0.18, 1, 20, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2); return geo; };
    const neck = new THREE.Group(); neck.add(new THREE.Mesh(cone(1), mat(P.color, 0.55)), new THREE.Mesh(cone(0.45), mat(P.glow, 1))); g.add(neck);
    const head = new THREE.Group();
    const hc = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), mat(P.glow, 0.95));
    const hs = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), mat(P.color, 0.5));
    const hh = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color: P.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); hh.scale.setScalar(7);
    head.add(hc, hs, hh); g.add(head);
    const root = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color: P.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); root.scale.setScalar(3);
    g.add(root);
    g.renderOrder = 8;
    this.scene.add(g);
    this.kiBeams.set(b.bid, { ...b, obj: g, body, neck, head, root, o: [0, 0, 0], dir: b.d.slice(), wantDir: b.d.slice(), len: 1, wantLen: 1, t: 0, clash: null, outer, mid });
  }
  removeBeam(bid) { const b = this.kiBeams.get(bid); if (!b) return; this.scene.remove(b.obj); b.obj.traverse((m) => m.geometry && m.geometry.dispose()); this.kiBeams.delete(bid); }
  updateBeams(dt) {
    for (const b of this.kiBeams.values()) {
      b.t += dt;
      const P = POWER[b.power];
      const o = this.lookup(b.owner);
      if (o) {
        const f = [-Math.sin(o.yaw) * Math.cos(o.pitch || 0), Math.sin(o.pitch || 0), -Math.cos(o.yaw) * Math.cos(o.pitch || 0)];
        b.o = [o.p[0] + f[0] * 0.7, o.p[1] + 1.25 + f[1] * 0.5, o.p[2] + f[2] * 0.7];
      }
      b.dir = b.dir.map((c, i) => c + (b.wantDir[i] - c) * Math.min(1, dt * 10));
      const L = Math.hypot(...b.dir) || 1; b.dir = b.dir.map((c) => c / L);
      if (b.clash) b.len = Math.hypot(b.clash[0] - b.o[0], b.clash[1] - b.o[1], b.clash[2] - b.o[2]);
      else {
        b.wantLen = Math.min(b.max, b.wantLen + 95 * dt);
        const h = this.island.ray(b.o, b.dir, b.wantLen);
        b.len = h ? h.t : b.wantLen;
        b.hitGround = h ? h.p : null;
      }
      // grow in over the first instant, flicker, thin out at the end
      const w = b.w * Math.min(1, b.t * 6) * (0.92 + Math.random() * 0.16);
      b.obj.position.set(...b.o);
      b.obj.quaternion.setFromUnitVectors(this.v3.set(0, 0, 1), this.s3.set(...b.dir));
      const nl = Math.min(b.len, 1.5 + b.w * 1.7);
      b.neck.scale.set(w, w, Math.max(0.05, nl));
      b.body.position.z = nl;
      b.body.scale.set(w, w, Math.max(0.05, b.len - nl));
      b.head.position.set(0, 0, b.len);
      b.head.scale.setScalar(w * (1 + Math.sin(this.time * 30) * 0.08));
      b.outer.material.opacity = 0.4 + Math.random() * 0.2;
      // sparks along the beam and at the head
      const end = [b.o[0] + b.dir[0] * b.len, b.o[1] + b.dir[1] * b.len, b.o[2] + b.dir[2] * b.len];
      const c = this.col(P.glow);
      for (let k = 0; k < 3; k++) { const f = Math.random(); this.glow.emit([b.o[0] + b.dir[0] * b.len * f, b.o[1] + b.dir[1] * b.len * f, b.o[2] + b.dir[2] * b.len * f], [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6], c, 0.4 * b.w, 0.3); }
      this.burst(end, P.glow, 3, 12, 0.6 * b.w, 0.35, { grav: 0 });
      if (b.hitGround) { if (Math.random() < 0.5) this.puff(b.hitGround, '#7a6a58', 1, 3 * b.w, 1.4, 2, 0.5); if (Math.random() < 0.3) this.rock(b.hitGround, [(Math.random() - 0.5) * 10, 8 + Math.random() * 6, (Math.random() - 0.5) * 10], 2, 1.2); }
      if (Math.random() < 0.6) this.flash(end, P.color, 50, 30);
    }
  }
  // the ball of colliding energy where two beams meet
  addClash(key, p, ca, cb) {
    const g = new THREE.Group();
    const mat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), mat('#ffffff', 0.8));
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), mat(ca, 0.5));
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(3.1, 24, 16), mat(cb, 0.35));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); halo.scale.setScalar(9);
    g.add(core, s1, s2, halo);
    g.position.set(...p);
    this.scene.add(g);
    this.clashes.set(key, { obj: g, p: p.slice(), want: p.slice(), ca, cb, s1, s2, t: 0 });
  }
  moveClash(key, p) { const c = this.clashes.get(key); if (c) c.want = p.slice(); }
  removeClash(key) { const c = this.clashes.get(key); if (!c) return; this.scene.remove(c.obj); this.clashes.delete(key); }
  updateClashes(dt) {
    for (const c of this.clashes.values()) {
      c.t += dt;
      c.p = c.p.map((v, i) => v + (c.want[i] - v) * Math.min(1, dt * 10));
      c.obj.position.set(...c.p);
      const s = 1 + Math.sin(this.time * 25) * 0.12 + Math.random() * 0.1;
      c.obj.scale.setScalar(s * (1 + Math.min(1, c.t) * 0.25));
      c.s1.rotation.y += dt * 3; c.s2.rotation.x += dt * 2;
      this.burst(c.p, Math.random() < 0.5 ? c.ca : c.cb, 6, 18, 0.8, 0.5, { grav: 0 });
      if (Math.random() < 0.25) { const a = [c.p[0] + (Math.random() - 0.5) * 14, c.p[1] + (Math.random() - 0.5) * 10, c.p[2] + (Math.random() - 0.5) * 14]; this.bolt(c.p, a, '#ffffff', '#ffffff', 0.12, true); }
      this.flash(c.p, '#ffffff', 45, 40);
      if (Math.random() < 0.4) this.rock([c.p[0] + (Math.random() - 0.5) * 10, this.island.height(c.p[0], c.p[2]) + 0.2, c.p[2] + (Math.random() - 0.5) * 10], [0, 4 + Math.random() * 4, 0], 2, 1.2, 4);
    }
  }

  // ── scars on the land: craters and felled trees ──
  crater(p, r) {
    const n = 12; const S = r * 2.0;
    const geo = new THREE.PlaneGeometry(S, S, n, n); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = p[0] + pos.getX(i); const z = p[2] + pos.getZ(i);
      const d = Math.hypot(pos.getX(i), pos.getZ(i)) / (S / 2);
      const dip = d < 0.75 ? -Math.cos(Math.min(1, d / 0.75) * Math.PI / 2) * r * 0.18 : 0;
      pos.setY(i, this.island.height(x, z) - p[1] + 0.07 + dip * 0.4);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.craterMap, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(p[0], p[1], p[2]); m.rotation.y = Math.random() * 6.28; m.receiveShadow = true; m.renderOrder = 1;
    this.scene.add(m);
    this.craters.push({ obj: m, t: 0 });
    if (this.craters.length > 50) { const o = this.craters.shift(); this.scene.remove(o.obj); o.obj.geometry.dispose(); o.obj.material.dispose(); }
    this.puff([p[0], p[1] + 0.5, p[2]], '#c2b29a', Math.min(8, 2 + r), r * 0.6, 1.6, r * 0.6, 0.3);
    for (let k = 0; k < Math.min(14, r * 2); k++) this.rock([p[0], p[1] + 0.3, p[2]], [(Math.random() - 0.5) * r * 4, 5 + Math.random() * r * 2, (Math.random() - 0.5) * r * 4], 2.2, 1);
  }
  // a tree breaks at the base and topples away from the blast
  fallingTree(t, from) {
    const g = new THREE.Group();
    const s = t.s;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 5 * s, 7), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 }));
    trunk.position.y = 2.5 * s; g.add(trunk);
    const leafCol = t.kind === 'pine' ? 0x2f5a2a : t.kind === 'palm' ? 0x5a8a2a : 0x4a7a2e;
    const crown = t.kind === 'pine' ? new THREE.ConeGeometry(1.8 * s, 5 * s, 8) : new THREE.IcosahedronGeometry(2.2 * s, 1);
    const cm = new THREE.Mesh(crown, new THREE.MeshStandardMaterial({ color: leafCol, roughness: 0.85, flatShading: true }));
    cm.position.y = (t.kind === 'pine' ? 5 : 5.6) * s; g.add(cm);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(t.x, t.y - 0.2, t.z);
    const ax = new THREE.Vector3(t.z - from[2], 0, -(t.x - from[0])).normalize();
    if (!Number.isFinite(ax.x)) ax.set(1, 0, 0);
    this.scene.add(g);
    this.items.push({ obj: g, t: 0, life: 8, update: (f, tt) => {
      const k = Math.min(1, tt / 1.3); const ang = (k * k) * 1.5;
      g.quaternion.setFromAxisAngle(ax, ang);
      if (tt > 6) g.position.y = t.y - 0.2 - (tt - 6) * 1.2;
    } });
    this.burst([t.x, t.y + 4 * s, t.z], '#9ad36a', 10, 4, 0.3, 1.2, { grav: 2 });
    this.puff([t.x, t.y + 0.5, t.z], '#8a7a66', 3, 1.5, 1.5, 1, 0.5);
  }

  // ── one-off effects ──
  bolt(a, b, color = '#9fb6ff', glow = '#ffffff', life = 0.3, quiet = false) {
    // jagged lightning made of a few strands
    for (let s = 0; s < 2; s++) {
      const pts = []; const n = 10;
      for (let k = 0; k <= n; k++) { const f = k / n; const j = k === 0 || k === n ? 0 : 0.9; pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * f + (Math.random() - 0.5) * j, a[1] + (b[1] - a[1]) * f + (Math.random() - 0.5) * j, a[2] + (b[2] - a[2]) * f + (Math.random() - 0.5) * j)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, s ? 0.04 : 0.1, 5), new THREE.MeshBasicMaterial({ color: s ? glow : color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(tube);
      this.items.push({ obj: tube, t: 0, life, update: (f) => { tube.material.opacity = (1 - f) * (Math.random() < 0.3 ? 0.4 : 1); } });
    }
    if (!quiet) { this.flash(b, color, 30, 14); this.burst(b, glow, 10, 4, 0.35, 0.3); }
  }
  spikes(pts, i0 = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7556, roughness: 0.9, map: TX.ground('rock').map });
    pts.forEach((p, i) => {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.8, 6), mat);
      s.position.set(p[0] + (Math.random() - 0.5) * 0.6, p[1] - 1.6, p[2] + (Math.random() - 0.5) * 0.6);
      s.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      s.castShadow = true;
      this.scene.add(s);
      const delay = (i + i0) * 0.035;
      this.items.push({ obj: s, t: -delay, life: 1.6, update: (f, t) => { if (t < 0) return; const up = Math.min(1, t / 0.12); const down = Math.max(0, (t - 1.1) / 0.5); s.position.y = p[1] - 1.6 + 2.6 * up - 2.8 * down; if (t < 0.05) { this.puff(p, '#a08a6a', 1, 1.2, 0.8, 0.5, 0.5); this.rock(p, [(Math.random() - 0.5) * 4, 6, (Math.random() - 0.5) * 4], 1.5, 0.8); } } });
    });
  }
  meteor(p, delay, color = '#ff6a2a') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), new THREE.MeshStandardMaterial({ color: 0x3a2a22, emissive: 0xff5a1a, emissiveIntensity: 1.2, roughness: 0.8 }));
    const start = [p[0] + 40, p[1] + 150, p[2] - 25];
    rock.position.set(...start);
    this.scene.add(rock);
    const warn = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    warn.rotation.x = -Math.PI / 2; warn.position.set(p[0], p[1] + 0.2, p[2]); this.scene.add(warn);
    const fireC = this.col(color);
    this.items.push({ obj: rock, extra: warn, t: -delay, life: 0.9, update: (f, t) => {
      if (t < 0) { rock.visible = false; warn.material.opacity = 0.3 + Math.sin(this.time * 20) * 0.2; return; }
      rock.visible = true;
      const k = Math.min(1, t / 0.9);
      rock.position.set(start[0] + (p[0] - start[0]) * k, start[1] + (p[1] - start[1]) * k, start[2] + (p[2] - start[2]) * k);
      rock.rotation.x += 0.2;
      for (let n = 0; n < 5; n++) this.glow.emit([rock.position.x, rock.position.y, rock.position.z], [(Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3], fireC, 1.8, 0.5);
      this.smoke.emit([rock.position.x, rock.position.y, rock.position.z], [0, 1, 0], this.col('#2a221e'), 2.6, 1.5, { grow: 2, alpha: 0.4 });
    } });
  }
  beamLine(key, a, b, color, glow, width = 0.12, ttl = 0.12) {
    let bm = this.beams.get(key);
    if (!bm) {
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const g = new THREE.Group(); g.add(outer, inner); this.scene.add(g);
      bm = { obj: g, outer, inner, ttl: 0 };
      this.beams.set(key, bm);
    }
    const A = V(a); const Bv = V(b); const d = Bv.clone().sub(A); const L = d.length();
    bm.obj.position.copy(A).addScaledVector(d, 0.5);
    bm.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const w = width * (0.85 + Math.random() * 0.3);
    bm.obj.scale.set(w, L, w);
    bm.ttl = ttl;
  }
  // a streak where someone moved too fast to see
  streak(a, b, color = '#ffffff') {
    const n = 14;
    const c = this.col(color);
    for (let k = 0; k <= n; k++) { const f = k / n; this.glow.emit([a[0] + (b[0] - a[0]) * f, a[1] + 1 + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], [0, 0, 0], c, 0.7, 0.25, { drag: 4 }); }
    this.burst([a[0], a[1] + 1, a[2]], color, 16, 5, 0.4, 0.3, { grav: 0 });
    this.burst([b[0], b[1] + 1, b[2]], color, 16, 5, 0.4, 0.3, { grav: 0 });
  }

  // ── status visuals attached to a hero ──
  shieldBubble(color) {
    return new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 20), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color(color) }, time: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; uniform float time; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); float hex = 0.5 + 0.5 * sin(vP.x * 18.0 + time * 2.0) * sin(vP.y * 18.0 - time) * sin(vP.z * 18.0); gl_FragColor = vec4(c * (f * 1.4 + hex * 0.08), f * 0.9 + 0.05); }',
    }));
  }
  iceBlock() {
    // frozen in time: a pale golden shell
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), new THREE.MeshPhysicalMaterial({ color: 0xfff3c4, roughness: 0.05, transparent: true, opacity: 0.45, emissive: 0xffd84a, emissiveIntensity: 0.35 }));
    m.position.y = 1.05;
    return m;
  }

  // ── the storm: a tall wall of crackling violet cloud ──
  makeStorm() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, c: { value: new THREE.Color('#8a3cff') } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float time; uniform vec3 c; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 160.0, vW.y * 0.05);
          float v = n(p + vec2(time * 0.6, -time * 0.4)) * 0.6 + n(p * 2.3 - vec2(time, time * 0.3)) * 0.4;
          float bolt = smoothstep(0.985, 1.0, n(vec2(vUv.x * 400.0, time * 3.0))) * step(0.5, n(vec2(time * 2.0, vUv.x * 40.0)));
          float a = 0.16 + v * 0.22;
          a *= smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.35, 0.9, vUv.y));
          a *= mix(1.0, 0.35, smoothstep(150.0, 700.0, distance(cameraPosition.xz, vW.xz)));
          gl_FragColor = vec4(c * (0.6 + v * 0.8) + vec3(0.8, 0.7, 1.0) * bolt * 3.0, a + bolt * 0.5);
        }`,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 360, 128, 1, true), mat);
    m.position.y = 140;
    m.renderOrder = 9;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }
  setStorm(c, r) { this.storm.position.x = c[0]; this.storm.position.z = c[1]; this.storm.scale.set(Math.max(0.1, r), 1, Math.max(0.1, r)); }

  update(dt) {
    this.time += dt;
    this.glow.update(dt); this.smoke.update(dt);
    this.storm.material.uniforms.time.value = this.time;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const f = Math.max(0, it.t) / it.life;
      it.update(Math.min(1, f), it.t);
      if (it.t >= it.life) { this.scene.remove(it.obj); if (it.extra) this.scene.remove(it.extra); it.obj.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); this.items.splice(i, 1); }
    }
    for (const l of this.flashes) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity *= Math.exp(-dt * 14); if (l.userData.t <= 0) l.intensity = 0; } }
    for (const [k, b] of this.beams) { b.ttl -= dt; if (b.ttl <= 0) { this.scene.remove(b.obj); this.beams.delete(k); } }
    this.updateBeams(dt);
    this.updateClashes(dt);
    // flying rocks
    let n = 0;
    for (let i = this.rockL.length - 1; i >= 0; i--) {
      const r = this.rockL[i];
      r.t += dt;
      if (r.t > r.life) { this.rockL.splice(i, 1); continue; }
      r.v[1] -= r.grav * dt;
      r.p[0] += r.v[0] * dt; r.p[1] += r.v[1] * dt; r.p[2] += r.v[2] * dt;
      const g = this.island.height(r.p[0], r.p[2]);
      if (r.p[1] < g && r.grav > 0) { r.p[1] = g; r.v[1] *= -0.3; r.v[0] *= 0.5; r.v[2] *= 0.5; }
      r.r[0] += r.w[0] * dt; r.r[1] += r.w[1] * dt; r.r[2] += r.w[2] * dt;
      const sc = r.s * Math.min(1, (r.life - r.t) * 2);
      this.m4.compose(this.v3.set(r.p[0], r.p[1], r.p[2]), this.q.setFromEuler(this.e.set(r.r[0], r.r[1], r.r[2])), this.s3.set(sc, sc, sc));
      this.rocks.setMatrixAt(n++, this.m4);
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;
    // old craters fade away
    for (let i = this.craters.length - 1; i >= 0; i--) { const c = this.craters[i]; c.t += dt; if (c.t > 70) { c.obj.material.opacity = Math.max(0, 1 - (c.t - 70) / 10); if (c.t > 80) { this.scene.remove(c.obj); c.obj.geometry.dispose(); this.craters.splice(i, 1); } } }
  }

  clear() {
    for (const id of [...this.ents.keys()]) this.removeEnt(id);
    for (const id of [...this.zones.keys()]) this.removeZone(id);
    for (const id of [...this.kiBeams.keys()]) this.removeBeam(id);
    for (const id of [...this.clashes.keys()]) this.removeClash(id);
    this.craters.forEach((c) => { this.scene.remove(c.obj); c.obj.geometry.dispose(); });
    this.craters = [];
    this.items.forEach((it) => { this.scene.remove(it.obj); if (it.extra) this.scene.remove(it.extra); });
    this.items = [];
    this.rockL = []; this.rocks.count = 0;
    this.glow.n = 0; this.smoke.n = 0;
  }
}
