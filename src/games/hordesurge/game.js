// Horde Surge: aim the cannon, fire a stream of units up the lane, multiply them through gates, break
// bonus crates and barriers, crush the enemy horde and its bosses, and storm the fortress.
import * as THREE from 'three';
import {
  LANE_W, CANNON_Z, UNIT_SPEED, ENEMY_SPEED, MAX_UNITS, UPGRADES, SKINS, CHAMPIONS, THEMES, DAILY_REWARDS,
  upgradeValue, loadSave, writeSave, clamp, damp, fmt,
} from './data.js';
import { makeLevel } from './levels.js';
import { Crowd } from './crowd.js';
import { buildFortress, buildCannon, buildGate, buildCrate, buildBarrier, buildHazard, buildBrute, gateText, gateStyle, makeLabel } from './world.js';
import { Sound } from './audio.js';
import { buildScenery } from './scenery.js';
import { Post } from './post.js';
import { CSS, ICON } from './ui.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const HALF = LANE_W / 2;
const CELL = 1.5;
const R_HIT = 0.75; // unit vs unit contact distance
const R_SEEK = 1.5; // units veer toward enemies this close



export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.save = loadSave();
    this.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    const root = document.createElement('div');
    root.className = 'hs';
    root.innerHTML = `<style>${CSS}</style>`;
    container.appendChild(root);
    this.root = root;
    this.sound = new Sound(this.save.settings.volume);
    this.initRenderer();
    this.buildUI();
    this.crowds = {
      player: new Crowd(this.scene, 'player', { ...this.skinOpts(), scale: 1.3 }),
      enemy: new Crowd(this.scene, 'enemy', { color: '#2a2633', acc: 'horns', accColor: '#d9d2c4', scale: 1.3, shadows: this.save.settings.quality !== 'low' }),
    };
    this.initParticles();
    this.tuneEnv(this.scene);
    this.input = { down: false, x: 0, keys: new Set() };
    this.bindInput();
    this.state = 'home';
    this.loadLevel(this.save.level);
    this.showHome();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  skinOpts() {
    const s = SKINS.find((k) => k.id === this.save.skin) || SKINS[0];
    const accColor = { leaf: '#3a8a2a', ears: '#ffd0e0', horn: '#ffffff', flame: '#ffd23f', crown: '#ffcf3a' }[s.acc];
    return { color: s.color, acc: s.acc, accColor, shadows: this.save.settings.quality !== 'low' };
  }

  // ───────────── rendering ─────────────
  initRenderer() {
    const q = this.save.settings.quality;
    const r = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = q !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'hs-c';
    this.root.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff4dc, 2.2);
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // soft image-based lighting so glossy gates, metal and candy pick up reflections
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.environment = this.envTex;
    this.makePost();
  }

  // image lighting is a subtle fill, not a second sun
  tuneEnv(root) {
    root.traverse((o) => { [].concat(o.material || []).forEach((m) => { if (m.isMeshStandardMaterial) m.envMapIntensity = m.metalness > 0.4 ? 0.8 : 0.3; }); });
  }

  makePost() {
    if (this.post) { this.post.dispose(); this.post = null; }
    const q = this.save.settings.quality;
    if (q === 'low') return;
    try { this.post = new Post(this.renderer, this.scene, this.camera, q); } catch (e) { console.warn('post-processing off', e); this.post = null; }
    if (this.post && this.level) this.post.setTheme(this.level.theme);
  }

  // sky gradient + fog for the level's theme
  applyTheme(T) {
    this.scene.background = new THREE.Color(T.sky[1]);
    this.scene.fog = new THREE.Fog(T.fog, 110, 330);
    this.post && this.post.setTheme(T);
    this.renderer.toneMappingExposure = T.id === 'snow' ? 0.78 : T.id === 'candy' ? 0.85 : 0.92;
    this.sun.color.set(T.sun);
    this.sun.intensity = T.neon ? 0.9 : 2.2;
    this.hemi.intensity = T.neon ? 0.45 : 0.75;
    this.hemi.groundColor.set(T.ground2);
    this.root.style.background = T.sky[1];
    this.crowds && this.crowds.enemy.bodyMat.color.set(T.enemy);
    if (this.crowds) {
      this.crowds.enemy.bodyMat.emissive.set(T.neon ? T.enemy : '#000000');
      this.crowds.enemy.bodyMat.emissiveIntensity = T.neon ? 0.5 : 0;
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const q = this.save.settings.quality;
    const base = q === 'low' ? Math.min(dpr, 1) * 0.8 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(base * (this.save.settings.dynRes === false ? 1 : this.resScale || 1));
    this.renderer.setSize(w, h, false);
    if (this.post) { this.post.setSize(w, h, this.renderer.getPixelRatio()); this.post.setFocus(w < h); }
    this.camera.aspect = w / h;
    this.aspect = w / h;
    this.root.style.fontSize = `${clamp(Math.min(w / 30, h / 36), 9, 22)}px`;
    this.root.classList.toggle('short', h < 430);
    this.placeCamera(0, true);
  }

  // high camera behind the cannon looking down the whole lane (wider and further back on tall screens)
  // Frames the whole lane, cannon to fortress. The camera sits high behind the cannon; its pitch and
  // field of view are solved so both ends fit vertically and the lane fills the width on tall screens.
  placeCamera(dt, snap = false) {
    const L = this.level ? this.level.L : 70;
    const a = this.aspect || 1;
    const portrait = a < 1;
    const cx = this.cannon ? this.cannon.group.position.x : 0;
    const shake = this.shake || 0;
    const h = portrait ? clamp(0.55 * L, 30, 52) : 24;
    const zc = CANNON_Z + (portrait ? 8 : 15);
    // angles (below horizontal) to the near edge (just behind the cannon) and the fortress top
    const near = Math.atan2(h - 0, zc - (CANNON_Z + 3));
    const far = Math.atan2(h - 15, zc + L + 1); // leaves room for the HUD above the fortress
    const pitch = (near + far) / 2;
    let vfov = (near - far) * 1.04;
    // keep the lane (plus a little grass) inside the width on narrow screens
    const dNear = Math.hypot(h, zc - CANNON_Z);
    const hfov = 2 * Math.atan(8.2 / dNear);
    vfov = Math.max(vfov, 2 * Math.atan(Math.tan(hfov / 2) / a));
    const fov = clamp(THREE.MathUtils.radToDeg(vfov), 30, 100);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const tx = cx * (portrait ? 0.15 : 0.3) + (Math.random() - 0.5) * shake;
    const ty = h + (Math.random() - 0.5) * shake;
    const p = this.camera.position;
    if (snap) p.set(tx, ty, zc);
    else { p.x = damp(p.x, tx, 6, dt); p.y = damp(p.y, ty, 6, dt); p.z = damp(p.z, zc, 6, dt); }
    this.camera.lookAt(p.x * 0.4, p.y - Math.sin(pitch) * 10, p.z - Math.cos(pitch) * 10);
    this.shake = Math.max(0, shake - dt * 2.5);
  }

  // ───────────── level ─────────────
  loadLevel(n) {
    this.clearLevel();
    const lvl = makeLevel(n);
    this.level = lvl;
    this.applyTheme(lvl.theme);
    const q = this.save.settings.quality;
    const grp = new THREE.Group();
    this.levelGroup = grp;
    this.scene.add(grp);
    this.scenery = buildScenery(lvl, q);
    grp.add(this.scenery.group);
    this.fort = buildFortress(lvl);
    grp.add(this.fort.group);
    const skin = SKINS.find((k) => k.id === this.save.skin) || SKINS[0];
    this.cannon = buildCannon(skin.color);
    grp.add(this.cannon.group);
    this.gates = lvl.gates.map((g) => ({ ...g, left: g.op === 'x' ? g.v : g.v, used: false, view: null, x0: g.x }));
    this.gates.forEach((g) => { g.view = buildGate(g); grp.add(g.view.group); });
    this.crates = lvl.crates.map((c) => ({ ...c, view: buildCrate(c) }));
    this.crates.forEach((c) => grp.add(c.view.group));
    this.barriers = lvl.barriers.map((b) => ({ ...b, view: buildBarrier(b) }));
    this.barriers.forEach((b) => grp.add(b.view.group));
    this.hazards = lvl.hazards.map((h) => ({ ...h, view: buildHazard(h), ang: 0, sx: 0 }));
    this.hazards.forEach((h) => grp.add(h.view.group));
    // sun shadow covers the lane
    const sc = this.sun.shadow.camera;
    const span = lvl.L / 2 + 14;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 220;
    sc.updateProjectionMatrix();
    // the light comes from over the right shoulder; the sun disc in the sky sits beyond the fortress
    this.sun.position.set(34, 62, -lvl.L / 2 + 34);
    this.sun.target.position.set(0, 0, -lvl.L / 2);
    this.tuneEnv(grp);
    // state
    const armor = upgradeValue(this.save, 'armor');
    this.st = {
      baseHp: lvl.baseHp, baseMax: lvl.baseHp, hp: armor, hpMax: armor, time: 0, fireT: 0, meter: 0, meterMax: 60,
      waveT: lvl.waves.first, waveN: lvl.waves.count, kills: 0, fired: 0, bossSpawned: false, crates: 0, startBurst: Math.round(upgradeValue(this.save, 'start')),
    };
    this.bigs = [];
    this.champs = [];
    this.cannonX = 0;
    this.fortShown = lvl.baseHp;
    this.pressure = 1;
    this.crowds.player.clear();
    this.crowds.enemy.clear();
    this.placeCamera(0, true);
    this.updateHud(true);
  }

  // the fortress fights back: every hit it takes sends more defenders out of its gate
  hitFort(dmg) {
    const st = this.st;
    st.baseHp -= dmg;
    st.fightBack = (st.fightBack || 0) + Math.min(dmg, 40) * this.level.waves.fightBack;
    const E = this.crowds.enemy;
    while (st.fightBack >= 1) { st.fightBack -= 1; E.add((Math.random() - 0.5) * 4.5, -this.level.L + 1.8 + Math.random() * 1.2, { speed: 1.1 }); }
    this.fortLabel();
  }

  fortLabel() {
    const v = Math.max(0, Math.ceil(this.st.baseHp));
    if (v !== this.fortShown) { this.fortShown = v; this.fort.label.update(String(v)); }
  }

  disposeObj(o) {
    this.scene.remove(o);
    o.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) [].concat(m.material).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); });
    });
  }

  clearLevel() {
    if (!this.levelGroup) return;
    this.scene.remove(this.levelGroup);
    this.levelGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.levelGroup = null;
    (this.bigs || []).forEach((b) => this.disposeObj(b.view.group));
    this.bigs = [];
    (this.champs || []).forEach((c) => this.disposeObj(c.view.group));
    this.champs = [];
    this.particles && (this.pN = 0);
    this.floats && this.floats.forEach((f) => f.el.remove());
    this.floats = [];
  }

  startLevel() {
    this.sound.init();
    this.state = 'play';
    this.crowds.enemy.clear();
    this.closeScreen();
    this.ui.hud.hidden = false;
    this.ui.hint.hidden = false;
    this.ui.hint.textContent = this.isTouch ? 'HOLD & DRAG TO FIRE' : 'HOLD MOUSE (OR SPACE) TO FIRE · DRAG / A D TO AIM';
    this.banner(this.level.bossLevel ? 'BOSS LEVEL' : `LEVEL ${this.level.n}`, this.level.bossLevel ? this.level.boss.name : this.level.theme.name, 1600);
    // the opening burst
    for (let k = 0; k < this.st.startBurst; k++) this.spawnPlayer(this.cannonX + (Math.random() - 0.5) * 3, CANNON_Z - 1 - Math.random() * 3, true);
  }

  // ───────────── spawning ─────────────
  spawnPlayer(x, z, launched = false) {
    const c = this.crowds.player;
    return c.add(clamp(x, -HALF + 0.4, HALF - 0.4), z, launched ? { y: 1.2, vy: 3 + Math.random() * 2, speed: 1 } : { speed: 1 });
  }

  fire() {
    const cx = this.cannonX;
    this.spawnPlayer(cx + (Math.random() - 0.5) * 0.6, CANNON_Z - 0.6, true);
    this.st.fired++;
    this.save.stats.fired++;
    this.st.meter = Math.min(this.st.meterMax, this.st.meter + 1);
    this.cannon.barrel.position.z = 0.25;
    this.sound.shoot();
  }

  launchChampion() {
    if (this.state !== 'play' || this.st.meter < this.st.meterMax) return;
    this.st.meter = 0;
    const def = CHAMPIONS.find((c) => c.id === this.save.champ) || CHAMPIONS[0];
    const pow = upgradeValue(this.save, 'champ');
    const skin = SKINS.find((k) => k.id === this.save.skin) || SKINS[0];
    const view = buildBrute(this.level.theme, def.radius * 0.95, { color: skin.color });
    if (def.id === 'roller') { view.legs.forEach((l) => { l.visible = false; }); view.body.scale.set(1, 0.85, 1); }
    view.group.position.set(this.cannonX, 0, CANNON_Z - 1.5);
    view.group.rotation.y = 0;
    this.scene.add(view.group);
    const hp = Math.round(def.hp * pow);
    this.champs.push({ def, view, x: this.cannonX, z: CANNON_Z - 1.5, hp, max: hp, dmg: def.dmg * pow, t: 0, phase: 0 });
    this.sound.champion();
    this.shake = 0.6;
    this.banner(def.name.toUpperCase(), '', 900);
  }

  spawnWave() {
    const lvl = this.level;
    const n = Math.min(lvl.waves.cap, Math.round(this.st.waveN * this.pressure));
    const c = this.crowds.enemy;
    for (let k = 0; k < n; k++) c.add((Math.random() - 0.5) * 4.6, -lvl.L + 1.2 + Math.random() * 1.6 + k * 0.05, { speed: 1 });
    this.st.waveN *= lvl.waves.growth;
  }

  // big enemies: the level boss (smashes the ground, reaching the cannon ends the run) and
  // brutes that march down with the waves and hit the cannon hard if they get through
  spawnBig(def, kind) {
    const view = buildBrute(this.level.theme, def.scale);
    const x = kind === 'boss' ? 0 : (Math.random() - 0.5) * 6;
    view.group.position.set(x, 0, -this.level.L + 3);
    view.group.rotation.y = Math.PI;
    this.scene.add(view.group);
    const b = { ...def, kind, view, x, z: -this.level.L + 3, hp: def.hp, max: def.hp, smashT: 2.2, anim: Math.random() * 6, radius: 0.95 * def.scale, blocked: false, shown: -1 };
    this.bigs.push(b);
    if (kind === 'boss') {
      this.st.bossSpawned = true;
      this.sound.roar();
      this.shake = 0.8;
      this.banner(def.name.toUpperCase(), 'incoming!', 1500);
    } else this.sound.roar();
    return b;
  }

  // ───────────── particles and floating text ─────────────
  initParticles() {
    const N = 1600;
    this.pMax = N;
    this.pN = 0;
    this.pd = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), s: new Float32Array(N) };
    const geo = new THREE.IcosahedronGeometry(0.11, 0);
    this.particles = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), N);
    this.particles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.particles.frustumCulled = false;
    this.particles.count = 0;
    this.scene.add(this.particles);
    this.pColor = new THREE.Color();
    this.floats = [];
  }

  burst(x, y, z, color, n = 6, power = 3) {
    const d = this.pd;
    this.pColor.set(color);
    for (let k = 0; k < n; k++) {
      if (this.pN >= this.pMax) return;
      const i = this.pN++;
      d.x[i] = x; d.y[i] = y + 0.3; d.z[i] = z;
      const a = Math.random() * Math.PI * 2; const s = power * (0.4 + Math.random());
      d.vx[i] = Math.cos(a) * s; d.vz[i] = Math.sin(a) * s; d.vy[i] = 2 + Math.random() * power * 1.4;
      d.life[i] = d.max[i] = 0.45 + Math.random() * 0.35;
      d.s[i] = 0.7 + Math.random() * 0.9;
      this.particles.instanceColor.setXYZ(i, this.pColor.r, this.pColor.g, this.pColor.b);
    }
  }

  updateParticles(dt) {
    const d = this.pd;
    const a = this.particles.instanceMatrix.array;
    let i = 0;
    while (i < this.pN) {
      d.life[i] -= dt;
      if (d.life[i] <= 0) {
        const j = --this.pN;
        if (i !== j) {
          for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 's']) d[k][i] = d[k][j];
          this.particles.instanceColor.setXYZ(i, this.particles.instanceColor.getX(j), this.particles.instanceColor.getY(j), this.particles.instanceColor.getZ(j));
        }
        continue;
      }
      d.vy[i] -= 16 * dt;
      d.x[i] += d.vx[i] * dt; d.y[i] += d.vy[i] * dt; d.z[i] += d.vz[i] * dt;
      if (d.y[i] < 0.05) { d.y[i] = 0.05; d.vy[i] *= -0.35; d.vx[i] *= 0.6; d.vz[i] *= 0.6; }
      const s = d.s[i] * Math.min(1, d.life[i] / d.max[i] * 2);
      const o = i * 16;
      a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0; a[o + 12] = d.x[i]; a[o + 13] = d.y[i]; a[o + 14] = d.z[i]; a[o + 15] = 1;
      i++;
    }
    this.particles.count = this.pN;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }

  floatText(text, x, y, z, color = '#fff', size = 1) {
    if (this.floats.length > 40) { const f = this.floats.shift(); f.el.remove(); }
    const el = document.createElement('div');
    el.className = 'hs-float hs-out';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${1.3 * size}em`;
    this.ui.hud.appendChild(el);
    this.floats.push({ el, p: new THREE.Vector3(x, y, z), t: 0 });
  }

  updateFloats(dt) {
    const w = this.container.clientWidth; const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    this.floats = this.floats.filter((f) => {
      f.t += dt;
      if (f.t > 0.9) { f.el.remove(); return false; }
      v.copy(f.p); v.y += f.t * 2.2;
      v.project(this.camera);
      f.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%) scale(${1 + Math.min(f.t * 4, 0.3)})`;
      f.el.style.opacity = String(Math.min(1, (0.9 - f.t) * 3));
      return true;
    });
  }

  // ───────────── simulation ─────────────
  update(dt) {
    const st = this.st;
    const lvl = this.level;
    const P = this.crowds.player;
    const E = this.crowds.enemy;
    st.time += dt;
    // cannon aim and fire
    const k = this.input.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.cannonX = clamp(this.cannonX + kx * 9 * dt, -HALF + 1.2, HALF - 1.2);
    const cg = this.cannon.group;
    cg.position.x = damp(cg.position.x, this.cannonX, 18, dt);
    cg.rotation.y = damp(cg.rotation.y, -(this.cannonX - cg.position.x) * 0.25, 10, dt);
    this.cannon.barrel.position.z = damp(this.cannon.barrel.position.z, 0, 14, dt);
    const firing = this.input.down || k.has('Space') || this.save.settings.autoFire;
    if (firing && P.n < MAX_UNITS - 10) {
      st.fireT += dt;
      const gap = 1 / upgradeValue(this.save, 'rate');
      while (st.fireT >= gap) { st.fireT -= gap; this.fire(); }
      this.ui.hint.hidden = true;
    } else st.fireT = Math.min(st.fireT, 0);
    // champion ring glow
    const ready = st.meter >= st.meterMax;
    this.cannon.ring.material.opacity = ready ? 0.6 + Math.sin(st.time * 8) * 0.3 : 0;
    // enemy waves and boss
    st.waveT -= dt;
    if (st.waveT <= 0) { st.waveT = lvl.waves.interval; this.spawnWave(); }
    if (lvl.boss && !st.bossSpawned && st.time >= lvl.boss.at) this.spawnBig(lvl.boss, 'boss');
    // a steady trickle between waves
    st.flowT = (st.flowT || 0) + dt * lvl.waves.flow * this.pressure * (1 + Math.min(1, st.time / 120) * 0.4 + Math.max(0, st.time - 100) / 40);
    while (st.flowT >= 1) { st.flowT -= 1; this.crowds.enemy.add((Math.random() - 0.5) * 5, -lvl.L + 1.4 + Math.random(), { speed: 1 }); }
    if (lvl.brutes) {
      st.bruteT = (st.bruteT ?? lvl.brutes.first) - dt;
      if (st.bruteT <= 0) { st.bruteT = lvl.brutes.every; this.spawnBig({ hp: Math.round(lvl.brutes.hp * (1 + st.time / 120)), speed: 1.9, scale: 1.25, name: 'Brute', hit: lvl.brutes.hit }, 'brute'); }
    }
    // moving gates and hazards
    this.gates.forEach((g) => {
      if (g.move) g.x = g.x0 + Math.sin(st.time * g.speed + g.phase) * g.move;
      g.view.group.position.x = g.x;
      g.view.panelMat.uniforms.flash.value = g.flash || 0;
      g.flash = Math.max(0, (g.flash || 0) - dt * 3);
    });
    this.hazards.forEach((h) => {
      if (h.type === 'spinner') { h.ang += h.speed * dt; h.view.arm.rotation.y = h.ang; } else {
        h.sx = Math.sin(st.time * h.speed + h.phase) * h.amp;
        h.view.saw.position.x = h.sx;
        h.view.saw.rotation.z -= dt * 12;
      }
    });
    this.updatePlayers(dt);
    this.updateEnemies(dt);
    this.combat(dt);
    this.updateChampions(dt);
    this.updateBigs(dt);
    // fortress flags
    // win / lose
    if (st.baseHp <= 0) this.win();
    else if (st.hp <= 0) this.lose();
  }

  updatePlayers(dt) {
    const P = this.crowds.player;
    const st = this.st;
    const L = this.level.L;
    const spd = UNIT_SPEED * dt;
    for (let i = 0; i < P.n; i++) {
      // launched units arc out of the cannon
      if (P.y[i] > 0 || P.vy[i] > 0) {
        P.vy[i] -= 22 * dt;
        P.y[i] += P.vy[i] * dt;
        if (P.y[i] <= 0) { P.y[i] = 0; P.vy[i] = 0; }
      }
      const z0 = P.z[i];
      P.z[i] -= spd * P.sp[i];
      P.vx[i] += (Math.random() - 0.5) * 3 * dt;
      P.vx[i] *= 0.985;
      P.x[i] += P.vx[i] * dt;
      if (P.x[i] < -HALF + 0.35) { P.x[i] = -HALF + 0.35; P.vx[i] = Math.abs(P.vx[i]); }
      if (P.x[i] > HALF - 0.35) { P.x[i] = HALF - 0.35; P.vx[i] = -Math.abs(P.vx[i]); }
      const x = P.x[i]; const z = P.z[i];
      // gates (crossing the gate line inside its width)
      let dead = false;
      for (const g of this.gates) {
        if (g.used || !(z0 > g.z && z <= g.z) || Math.abs(x - g.x) > g.w / 2) continue;
        g.flash = 0.6;
        if (g.op === 'x') {
          for (let m = 1; m < g.v; m++) this.spawnClone(x, g.z);
          this.sound.gateHit(true);
        } else if (g.op === '+') {
          for (let m = 0; m < g.left; m++) this.spawnClone(x, g.z);
          this.floatText(`+${g.left}`, g.x, 2.6, g.z, '#8affb2', 1.2);
          g.used = true; g.left = 0;
          g.view.panelMat.uniforms.fade.value = 0.25; g.view.label.update('✓');
          this.sound.gateHit(true);
        } else if (g.op === '-') {
          g.left--;
          g.view.label.update(gateText(g));
          if (g.left <= 0) { g.used = true; g.view.panelMat.uniforms.fade.value = 0.25; }
          dead = true;
          this.sound.gateHit(false);
        }
        break;
      }
      if (dead) { this.burst(x, 0.3, z, '#ff3b4a', 3, 2); P.kill(i); i--; continue; }
      // bonus crates
      let hit = false;
      for (const c of this.crates) {
        if (c.dead || Math.abs(x - c.x) > c.w / 2 + 0.3 || Math.abs(z - c.z) > c.d / 2 + 0.3) continue;
        c.hp--;
        hit = true;
        c.view.box.scale.setScalar(0.92);
        if (c.hp <= 0) this.breakCrate(c);
        break;
      }
      if (hit) { this.burst(x, 0.4, z, this.skinColor(), 2, 1.5); P.kill(i); i--; continue; }
      // barriers
      for (const b of this.barriers) {
        if (b.dead || Math.abs(x - b.x) > b.w / 2 + 0.2 || Math.abs(z - b.z) > 0.75) continue;
        b.hp--;
        hit = true;
        b.dirty = true;
        b.view.wall.position.y = 0.8 + (Math.random() - 0.5) * 0.06;
        if (b.hp <= 0) this.breakBarrier(b);
        break;
      }
      if (hit) { this.burst(x, 0.5, z, '#ffd400', 2, 1.5); this.sound.thud(); P.kill(i); i--; continue; }
      // hazards
      if (this.hazardHit(x, z)) { this.burst(x, 0.3, z, this.skinColor(), 6, 3); this.sound.pop(); P.kill(i); i--; continue; }
      // the fortress
      if (z <= -L + 1.6) {
        this.hitFort(1);
        this.burst(x, 1, z, '#ffd23f', 3, 2);
        this.fortLabel();
        P.kill(i); i--;
        this.sound.thud();
      }
    }
    this.barriers.forEach((b) => { if (b.dirty && !b.dead) { b.dirty = false; b.view.label.update(String(Math.ceil(b.hp))); } });
    // crates spring back after a hit
    this.crates.forEach((c) => { if (!c.dead) c.view.box.scale.setScalar(damp(c.view.box.scale.x, 1, 12, dt)); });
  }

  spawnClone(x, gz) {
    const P = this.crowds.player;
    const i = P.add(clamp(x + (Math.random() - 0.5) * 1.4, -HALF + 0.4, HALF - 0.4), gz - 0.1 - Math.random() * 0.9, { speed: 1, y: 0.4, vy: 2.5 + Math.random() * 2 });
    return i;
  }

  skinColor() { return (SKINS.find((k) => k.id === this.save.skin) || SKINS[0]).color; }

  breakCrate(c) {
    c.dead = true;
    this.st.crates++;
    c.view.group.visible = false;
    this.burst(c.x, 0.6, c.z, c.big ? '#8b4dff' : '#2fbf5a', 14, 4);
    this.floatText(`+${c.value}`, c.x, 1.6, c.z, c.big ? '#d6b8ff' : '#8affb2', c.big ? 1.5 : 1);
    this.sound.crate();
    const P = this.crowds.player;
    for (let m = 0; m < c.value; m++) P.add(clamp(c.x - Math.sign(c.x) * (0.9 + Math.random() * 2.6), -HALF + 0.4, HALF - 0.4), c.z - Math.random() * 1.5, { speed: 1, y: 0.5, vy: 3 + Math.random() * 3 });
  }

  breakBarrier(b) {
    b.dead = true;
    b.view.group.visible = false;
    this.burst(b.x, 0.8, b.z, '#9aa0aa', 30, 5);
    this.burst(b.x, 0.8, b.z, '#ffd400', 12, 4);
    this.sound.smash();
    this.shake = 0.5;
    if (b.reward) {
      const gt = { id: 9000 + b.id, z: b.z - 1.5, x: b.x, w: b.w, op: b.reward.op, v: b.reward.v, left: b.reward.v, move: 0, x0: b.x };
      gt.view = buildGate(gt);
      this.levelGroup.add(gt.view.group);
      this.gates.push(gt);
      this.floatText('BONUS GATE!', b.x, 2.5, b.z, '#7fd0ff', 1.2);
    }
  }

  hazardHit(x, z) {
    for (const h of this.hazards) {
      if (h.type === 'spinner') {
        if (Math.abs(z - h.z) > h.len / 2 + 0.5 || Math.abs(x - h.x) > h.len / 2 + 0.5) continue;
        // distance from the point to the rotating bar segment
        const c = Math.cos(h.ang); const s = Math.sin(h.ang);
        const dx = x - h.x; const dz = z - h.z;
        const along = clamp(dx * c - dz * s, -h.len / 2, h.len / 2);
        const px = h.x + along * c; const pz = h.z - along * s;
        if (Math.hypot(x - px, z - pz) < 0.45) return true;
      } else if (Math.abs(z - h.z) < h.r + 0.2 && Math.abs(x - h.sx) < h.r + 0.2) return true;
    }
    return false;
  }

  updateEnemies(dt) {
    const E = this.crowds.enemy;
    const st = this.st;
    const spd = ENEMY_SPEED * dt;
    const tx = this.cannon.group.position.x;
    for (let i = 0; i < E.n; i++) {
      E.z[i] += spd * E.sp[i];
      // drift toward the cannon as they get closer
      const pull = clamp((E.z[i] + this.level.L) / this.level.L, 0, 1) * 0.6;
      E.vx[i] = damp(E.vx[i], (tx - E.x[i]) * pull, 2, dt) + (Math.random() - 0.5) * 0.4;
      E.x[i] = clamp(E.x[i] + E.vx[i] * dt, -HALF + 0.35, HALF - 0.35);
      const x = E.x[i]; const z = E.z[i];
      // barriers: enemies swerve around the open side well before they reach one
      for (const b of this.barriers) {
        if (b.dead || z < b.z - 5 || z > b.z + 0.8 || Math.abs(x - b.x) > b.w / 2 + 0.45) continue;
        const side = b.x < 0 ? 1 : -1;
        E.vx[i] = side * 5;
        E.x[i] = clamp(x + side * 5 * dt, -HALF + 0.35, HALF - 0.35);
        if (z > b.z - 0.8) E.z[i] = b.z - 0.8;
      }
      if (z >= CANNON_Z - 0.4) {
        st.hp--;
        st.hitUnits = (st.hitUnits || 0) + 1;
        this.burst(x, 0.6, z, '#ff3b4a', 8, 3);
        this.sound.hurt();
        if (this.save.settings.vibrate && navigator.vibrate && performance.now() - (this.vibT || 0) > 250) { this.vibT = performance.now(); try { navigator.vibrate(25); } catch { /* blocked */ } }
        this.shake = Math.max(this.shake, 0.35);
        this.ui.vig.style.boxShadow = 'inset 0 0 8em 1em rgba(255,0,40,.45)';
        clearTimeout(this.vigT);
        this.vigT = setTimeout(() => { this.ui.vig.style.boxShadow = ''; }, 200);
        E.kill(i); i--;
      }
    }
  }

  // player vs enemy: any pair closer than R_HIT annihilate each other
  combat(dt) {
    const P = this.crowds.player;
    const E = this.crowds.enemy;
    if (!P.n || !E.n) return;
    const L = this.level.L;
    const W = Math.ceil(LANE_W / CELL) + 2;
    const D = Math.ceil((L + CANNON_Z + 10) / CELL);
    const cells = W * D;
    if (!this.gridHead || this.gridHead.length < cells) this.gridHead = new Int32Array(cells);
    if (!this.gridNext || this.gridNext.length < MAX_UNITS) this.gridNext = new Int32Array(MAX_UNITS);
    const head = this.gridHead; const next = this.gridNext;
    head.fill(-1, 0, cells);
    const cx = (x) => clamp(Math.floor((x + HALF) / CELL) + 1, 0, W - 1);
    const cz = (z) => clamp(Math.floor((z + L + 5) / CELL), 0, D - 1);
    for (let j = 0; j < E.n; j++) { const c = cz(E.z[j]) * W + cx(E.x[j]); next[j] = head[c]; head[c] = j; }
    const deadE = new Uint8Array(E.n);
    const killP = [];
    const r2 = R_HIT * R_HIT;
    for (let i = 0; i < P.n; i++) {
      if (P.y[i] > 0.6) continue;
      const ix = cx(P.x[i]); const iz = cz(P.z[i]);
      let found = -1; let best = R_SEEK * R_SEEK; let bx = 0;
      for (let dz = -1; dz <= 1 && found < 0; dz++) {
        const zz = iz + dz;
        if (zz < 0 || zz >= D) continue;
        for (let dx = -1; dx <= 1 && found < 0; dx++) {
          const xx = ix + dx;
          if (xx < 0 || xx >= W) continue;
          for (let j = head[zz * W + xx]; j >= 0; j = next[j]) {
            if (deadE[j]) continue;
            const ddx = E.x[j] - P.x[i]; const ddz = E.z[j] - P.z[i];
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < r2) { found = j; break; }
            if (d2 < best) { best = d2; bx = ddx; }
          }
        }
      }
      if (found >= 0) { deadE[found] = 1; killP.push(i); } else if (bx) P.vx[i] = clamp(P.vx[i] + Math.sign(bx) * 14 * dt, -3, 3);
    }
    if (!killP.length) return;
    const ec = this.level.theme.enemy;
    const pc = this.skinColor();
    // remove from the end so indices stay valid
    for (let k = killP.length - 1; k >= 0; k--) { const i = killP[k]; this.burst(P.x[i], 0.3, P.z[i], pc, 2, 2.2); P.kill(i); }
    for (let j = E.n - 1; j >= 0; j--) if (deadE[j]) { this.burst(E.x[j], 0.3, E.z[j], ec, 3, 2.4); E.kill(j); }
    this.st.kills += killP.length;
    this.save.stats.kills += killP.length;
    this.sound.pop();
  }

  updateChampions(dt) {
    const E = this.crowds.enemy;
    const st = this.st;
    for (const c of [...this.champs]) {
      c.t += dt;
      c.z -= c.def.speed * dt;
      c.phase += dt * (c.def.id === 'roller' ? 14 : 7);
      const v = c.view;
      v.group.position.set(c.x, 0, c.z);
      if (c.def.id === 'roller') v.body.rotation.x -= dt * 10;
      else {
        v.legs.forEach((l, k) => { l.rotation.x = Math.sin(c.phase + k * Math.PI) * 0.6; });
        v.arms.forEach((a, k) => { a.rotation.x = Math.sin(c.phase + k * Math.PI + Math.PI) * 0.5; });
      }
      // flatten enemies in reach
      const R = c.def.radius + 0.4;
      for (let j = E.n - 1; j >= 0; j--) {
        if (Math.abs(E.z[j] - c.z) > R || Math.abs(E.x[j] - c.x) > R) continue;
        if ((E.x[j] - c.x) ** 2 + (E.z[j] - c.z) ** 2 > R * R) continue;
        this.burst(E.x[j], 0.4, E.z[j], this.level.theme.enemy, 4, 4);
        E.kill(j);
        c.hp -= 1 / Math.max(1, c.dmg * 0.5);
        st.kills++;
      }
      // crush crates and barriers in the way
      this.crates.forEach((cr) => { if (!cr.dead && Math.abs(cr.x - c.x) < R + 0.5 && Math.abs(cr.z - c.z) < R) { cr.hp -= 30 * dt; if (cr.hp <= 0) this.breakCrate(cr); } });
      this.barriers.forEach((b) => {
        if (b.dead || Math.abs(b.x - c.x) > b.w / 2 + R || Math.abs(b.z - c.z) > R) return;
        const d = Math.min(b.hp, c.dmg * 40 * dt);
        b.hp -= d; c.hp -= d * 0.05;
        c.z = Math.max(c.z, b.z + R * 0.8);
        b.dirty = true;
        if (b.hp <= 0) this.breakBarrier(b);
      });
      // wrestle any big enemy in the way
      for (const b of this.bigs) {
        if (Math.abs(b.z - c.z) > b.radius + R || Math.abs(b.x - c.x) > b.radius + R) continue;
        c.z = b.z + b.radius + R * 0.8;
        b.blocked = true;
        b.hp -= c.dmg * 6 * dt;
        c.hp -= (b.kind === 'boss' ? 4 : 2) * dt;
        if (Math.random() < 0.3) this.burst(c.x, 1.5, c.z - R, '#ffffff', 2, 3);
        break;
      }
      // reach the fortress: crash into it
      if (c.z <= -this.level.L + 2) {
        const dmg = Math.round(c.hp * c.dmg * 0.6);
        this.hitFort(dmg);
        this.fortLabel();
        this.floatText(`-${dmg}`, c.x, 4, c.z, '#ffd23f', 1.6);
        this.sound.smash();
        this.shake = 1;
        c.hp = 0;
      }
      // HP bar faces the camera
      v.bar.quaternion.copy(v.group.quaternion).invert().multiply(this.camera.quaternion);
      v.barFg.scale.x = Math.max(0.001, c.hp / c.max);
      v.barFg.position.x = -1.2 * (1 - c.hp / c.max);
      const shown = Math.max(0, Math.ceil(c.hp));
      if (shown !== c.shown) { c.shown = shown; v.label.update(String(shown)); }
      if (c.hp <= 0) {
        this.disposeObj(v.group);
        this.burst(c.x, 1.5, c.z, this.skinColor(), 30, 5);
        if (c.def.split) for (let m = 0; m < c.def.split; m++) this.spawnClone(c.x, c.z);
        this.champs.splice(this.champs.indexOf(c), 1);
      }
    }
  }

  updateBigs(dt) {
    const P = this.crowds.player;
    const st = this.st;
    for (const b of [...this.bigs]) {
      b.anim += dt;
      // walks toward the cannon unless a champion is holding it back
      if (!b.blocked) b.z += b.speed * dt;
      b.blocked = false;
      b.x = damp(b.x, this.cannon.group.position.x * 0.5, 0.4, dt);
      const v = b.view;
      v.group.position.set(b.x, 0, b.z);
      v.legs.forEach((l, k) => { l.rotation.x = Math.sin(b.anim * 4 + k * Math.PI) * 0.4; });
      // units that run into it chip away at its health
      const R = b.radius;
      for (let i = P.n - 1; i >= 0; i--) {
        if (Math.abs(P.z[i] - b.z) > R + 0.3 || Math.abs(P.x[i] - b.x) > R + 0.3) continue;
        if ((P.x[i] - b.x) ** 2 + (P.z[i] - b.z) ** 2 > (R + 0.3) ** 2) continue;
        b.hp -= 1;
        this.burst(P.x[i], 1, P.z[i], this.skinColor(), 2, 2.5);
        P.kill(i);
      }
      if (b.kind === 'boss') {
        // ground smash: wipes out the units in front of it
        b.smashT -= dt;
        const smashing = b.smashT < 0.5;
        v.arms.forEach((a) => { a.rotation.x = smashing ? -2.2 + (0.5 - Math.max(0, b.smashT)) * 4.4 : damp(a.rotation.x, -0.2, 4, dt); });
        if (b.smashT <= 0) {
          b.smashT = 1.6;
          const sx = b.x; const sz = b.z + R * 1.2; const SR = 1.6 * b.scale;
          let n = 0;
          for (let i = P.n - 1; i >= 0; i--) if ((P.x[i] - sx) ** 2 + (P.z[i] - sz) ** 2 < SR * SR) { this.burst(P.x[i], 0.3, P.z[i], this.skinColor(), 1, 3); P.kill(i); n++; }
          this.burst(sx, 0.1, sz, '#a08a70', 18, 5);
          this.sound.smash();
          this.shake = Math.max(this.shake, 0.6);
          if (n > 4) this.floatText(`-${n}`, sx, 2, sz, '#ff8a8a', 1.2);
        }
      } else v.arms.forEach((a, k) => { a.rotation.x = Math.sin(b.anim * 4 + k * Math.PI + Math.PI) * 0.5; });
      v.bar.quaternion.copy(v.group.quaternion).invert().multiply(this.camera.quaternion);
      const f = clamp(b.hp / b.max, 0, 1);
      v.barFg.scale.x = Math.max(0.001, f);
      v.barFg.position.x = -1.2 * (1 - f);
      const shown = Math.max(0, Math.ceil(b.hp));
      if (shown !== b.shown) { b.shown = shown; v.label.update(String(shown)); }
      if (b.z >= CANNON_Z - 1.5) {
        this.sound.smash();
        this.shake = 1.2;
        if (b.kind === 'boss') { st.hp = 0; continue; }
        st.hp -= b.hit;
        st.hitBigs = (st.hitBigs || 0) + b.hit;
        this.floatText(`-${b.hit}`, b.x, 3, b.z, '#ff6b6b', 1.4);
        this.burst(b.x, 1, b.z, '#ff3b4a', 30, 5);
        this.disposeObj(v.group);
        this.bigs.splice(this.bigs.indexOf(b), 1);
        continue;
      }
      if (b.hp <= 0) {
        this.disposeObj(v.group);
        this.bigs.splice(this.bigs.indexOf(b), 1);
        const big = b.kind === 'boss';
        this.burst(b.x, 2, b.z, '#ffcf3a', big ? 60 : 24, big ? 7 : 5);
        this.burst(b.x, 2, b.z, '#ffffff', big ? 30 : 10, 6);
        this.sound.explode();
        this.shake = big ? 1.4 : 0.6;
        st.kills += 10;
        if (big) {
          this.floatText('BOSS DOWN!', b.x, 4, b.z, '#ffd23f', 2);
          this.save.stats.bosses++;
          // its fall shakes the fortress
          st.baseHp -= Math.round(st.baseMax * 0.2);
          this.fortLabel();
        } else this.floatText('BRUTE DOWN', b.x, 3, b.z, '#ffd23f', 1.2);
      }
    }
  }

  // ───────────── end of level ─────────────
  win() {
    if (this.state !== 'play') return;
    this.state = 'won';
    this.fortLabel();
    this.burst(0, 4, -this.level.L, '#ffd23f', 80, 9);
    this.burst(0, 4, -this.level.L, '#ff6b6b', 40, 8);
    this.fort.group.children.forEach((c) => { c.userData.fall = Math.random(); });
    this.sound.explode();
    this.shake = 1.5;
    setTimeout(() => this.sound.win(), 500);
    const st = this.st;
    const stars = st.hp >= st.hpMax * 0.7 ? 3 : st.hp >= st.hpMax * 0.35 ? 2 : 1;
    const loot = 1 + upgradeValue(this.save, 'coins') / 100;
    const base = 60 + this.level.n * 15 + (this.level.bossLevel ? 150 : 0);
    const kills = Math.round(st.kills * 0.25);
    const survivors = Math.round(this.crowds.player.n * 0.3);
    const total = Math.round((base + kills + survivors) * loot * (1 + (stars - 1) * 0.25));
    this.result = { win: true, stars, base, kills, survivors, total };
    const s = this.save;
    s.coins += total;
    s.stars[this.level.n] = Math.max(s.stars[this.level.n] || 0, stars);
    s.level = Math.max(s.level, this.level.n + 1);
    s.best = Math.max(s.best, this.level.n);
    s.stats.wins++;
    writeSave(s);
    setTimeout(() => this.showResult(), 1700);
  }

  lose() {
    if (this.state !== 'play') return;
    this.state = 'lost';
    this.sound.lose();
    this.shake = 1;
    const total = Math.round((20 + this.st.kills * 0.3) * (1 + upgradeValue(this.save, 'coins') / 100));
    this.result = { win: false, total, progress: 1 - this.st.baseHp / this.st.baseMax };
    this.save.coins += total;
    this.save.stats.losses++;
    writeSave(this.save);
    setTimeout(() => this.showResult(), 1100);
  }

  // ───────────── frame ─────────────
  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    this.tick(dt);
    this.draw();
  }

  draw() {
    if (this.post) this.post.draw();
    else this.renderer.render(this.scene, this.camera);
  }

  tick(dt) {
    this.clock = (this.clock || 0) + dt;
    if (this.scenery) this.scenery.update(dt, this.clock);
    if (this.fort) {
      const t = this.clock;
      this.fort.flags.forEach((f, i) => { if (f.userData.banner) f.rotation.x = Math.sin(t * 1.7 + i) * 0.06; else f.rotation.y = Math.sin(t * 3 + i) * 0.3; });
      this.fort.torches.forEach((f, i) => { const k = 0.85 + Math.sin(t * 17 + i * 3) * 0.1 + Math.sin(t * 29 + i) * 0.06; f.scale.set(k, k * 1.1, k); });
    }
    if (this.gates) this.gates.forEach((q) => { q.view.panelMat.uniforms.time.value = this.clock + q.id * 0.37; });
    if (this.state === 'play' && !this.paused) this.update(dt);
    else if (this.state === 'won') {
      // the fortress crumbles
      this.fort.group.children.forEach((c) => { if (c.userData.fall !== undefined) { c.position.y -= dt * (3 + c.userData.fall * 6); c.rotation.z += dt * (c.userData.fall - 0.5); } });
    } else if (this.state === 'home') {
      // idle: the enemy horde marches in the distance
      this.idleT = (this.idleT || 0) - dt;
      const E = this.crowds.enemy;
      if (this.idleT <= 0 && E.n < 120) { this.idleT = 0.15; E.add((Math.random() - 0.5) * 4, -this.level.L + 2, { speed: 1 }); }
      for (let i = 0; i < E.n; i++) { E.z[i] += ENEMY_SPEED * 0.6 * dt; if (E.z[i] > -this.level.L * 0.45) { E.kill(i); i--; } }
    }
    this.crowds.player.sync(this.paused ? 0 : dt);
    this.crowds.enemy.sync(this.paused ? 0 : dt);
    if (!this.paused) this.updateParticles(dt);
    this.updateFloats(dt);
    this.placeCamera(dt);
    if (this.state === 'play') this.updateHud();
    this.autoRes(dt);
  }

  autoRes(dt) {
    if (this.save.settings.dynRes === false || this.state !== 'play' || document.hidden) return;
    this.frN = (this.frN || 0) + 1;
    this.frT = (this.frT || 0) + dt;
    if (this.frT < 2) return;
    const fps = this.frN / this.frT;
    this.frN = 0; this.frT = 0;
    this.resScale = this.resScale || 1;
    let next = this.resScale;
    if (fps < 45 && next > 0.5) next = Math.max(0.5, next * 0.85);
    else if (fps > 58 && next < 1) next = Math.min(1, next * 1.12);
    if (next !== this.resScale) { this.resScale = next; this.resize(); }
  }

  // ───────────── UI ─────────────
  buildUI() {
    this.root.insertAdjacentHTML('beforeend', `
      <div class="hs-vig"></div>
      <div class="hs-hud" hidden>
        <div class="hs-top">
          <button class="hs-round" data-act="pause" aria-label="Pause">${ICON.pause}</button>
          <div class="hs-lvl hs-out"><small>LEVEL</small><b>1</b></div>
          <div class="hs-bars">
            <div class="hs-meter base"><span class="ic">${ICON.castle}</span><div class="hs-track"><i class="trail"></i><i class="fill"></i><b class="hs-out">0</b></div></div>
            <div class="hs-meter hp"><span class="ic">${ICON.heart}</span><div class="hs-track"><i class="trail"></i><i class="fill"></i><b class="hs-out">0</b></div></div>
          </div>
          <div class="hs-coins hs-out"><span class="hs-coin"></span><span class="v">0</span></div>
        </div>
        <div class="hs-count hs-out"><span class="d me"></span><span class="pn">0</span><span class="vs">VS</span><span class="d foe"></span><span class="en">0</span></div>
        <div class="hs-hint hs-out" hidden></div>
        <button class="hs-champ hs-out" data-act="champ"><span>CHAMP<br>0%</span></button>
      </div>
      <div class="hs-banner hs-out"></div>
      <div class="hs-screen"></div>`);
    const q = (s) => this.root.querySelector(s);
    this.ui = {
      hud: q('.hs-hud'), lvl: q('.hs-lvl b'),
      base: q('.hs-meter.base .fill'), baseTrail: q('.hs-meter.base .trail'), baseTxt: q('.hs-meter.base b'),
      hp: q('.hs-meter.hp .fill'), hpTrail: q('.hs-meter.hp .trail'), hpTxt: q('.hs-meter.hp b'),
      coins: q('.hs-coins'), coinsV: q('.hs-coins .v'), pn: q('.hs-count .pn'), en: q('.hs-count .en'), me: q('.hs-count .me'), foe: q('.hs-count .foe'),
      hint: q('.hs-hint'), champ: q('.hs-champ'), champTxt: q('.hs-champ span'),
      banner: q('.hs-banner'), screen: q('.hs-screen'), vig: q('.hs-vig'),
    };
    this.cache = {};
  }

  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'width') el.style.width = val; else if (prop === 'html') el.innerHTML = val; else el[prop] = val;
  }

  updateHud(force = false) {
    const st = this.st;
    if (!st) return;
    if (force) this.cache = {};
    this.set('lvl', this.ui.lvl, String(this.level.n));
    const bw = `${clamp(st.baseHp / st.baseMax, 0, 1) * 100}%`;
    this.set('base', this.ui.base, bw, 'width');
    this.set('baseTr', this.ui.baseTrail, bw, 'width');
    this.set('baseT', this.ui.baseTxt, String(Math.max(0, Math.ceil(st.baseHp))));
    const hw = `${clamp(st.hp / st.hpMax, 0, 1) * 100}%`;
    this.set('hp', this.ui.hp, hw, 'width');
    this.set('hpTr', this.ui.hpTrail, hw, 'width');
    this.set('hpT', this.ui.hpTxt, String(Math.max(0, st.hp)));
    if (this.cache.coins !== this.save.coins) {
      if (this.cache.coins !== undefined) { this.ui.coins.classList.remove('bump'); void this.ui.coins.offsetWidth; this.ui.coins.classList.add('bump'); }
      this.cache.coins = this.save.coins;
      this.ui.coinsV.textContent = fmt(this.save.coins);
    }
    this.set('pn', this.ui.pn, String(this.crowds.player.n));
    this.set('en', this.ui.en, String(this.crowds.enemy.n));
    if (force) { this.ui.me.style.background = this.skinColor(); this.ui.foe.style.background = this.level.theme.enemy; }
    const p = Math.floor((st.meter / st.meterMax) * 100);
    if (this.cache.cp !== p) { this.cache.cp = p; this.ui.champ.style.setProperty('--p', `${p}%`); }
    const ready = p >= 100;
    this.ui.champ.classList.toggle('ready', ready);
    const def = CHAMPIONS.find((c) => c.id === this.save.champ) || CHAMPIONS[0];
    this.set('champT', this.ui.champTxt, ready ? `${def.name.toUpperCase()}<br>GO!` : `${def.name.toUpperCase()}<br>${p}%`, 'html');
  }

  banner(title, sub = '', ms = 1200) {
    const b = this.ui.banner;
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('on'), ms);
  }

  setScreen(html, dim = true) {
    this.ui.screen.hidden = false;
    this.ui.screen.className = `hs-screen${dim ? ' dim' : ''}`;
    this.ui.screen.innerHTML = html;
  }

  closeScreen() { this.ui.screen.innerHTML = ''; this.ui.screen.className = 'hs-screen'; this.ui.screen.hidden = true; }

  coinsPill() { return `<div class="hs-coins hs-out"><span class="hs-coin"></span><span>${fmt(this.save.coins)}</span></div>`; }

  backBtn() { return `<button class="hs-btn ghost" data-act="back">${ICON.home} Back</button>`; }

  showHome() {
    this.state = 'home';
    this.paused = false;
    this.ui.hud.hidden = true;
    const s = this.save;
    const n = this.level.n;
    const w0 = Math.floor((n - 1) / 5) * 5 + 1;
    const road = Array.from({ length: 5 }, (_, k) => {
      const L = w0 + k;
      const cls = `${L < n ? 'done' : L === n ? 'cur' : ''}${L % 5 === 0 ? ' boss' : ''}`;
      return `${k ? '<u></u>' : ''}<i class="${cls}">${L % 5 === 0 ? ICON.skull : ''}</i>`;
    }).join('');
    const today = new Date().toDateString();
    const dailyReady = s.daily.day !== today;
    const canUpgrade = UPGRADES.some((u) => (s.up[u.id] || 0) < u.max && s.coins >= u.cost(s.up[u.id] || 0));
    this.setScreen(`
      <div class="hs-topbar">${this.coinsPill()}</div>
      <div class="hs-logo"><span class="a">HORDE</span><span class="b">SURGE</span></div>
      <div class="hs-where hs-out">${this.level.theme.name} · Level ${n}${this.level.bossLevel ? ' · <span class="boss">Boss</span>' : ''}</div>
      <div class="hs-road">${road}</div>
      <button class="hs-btn green hs-play hs-out" data-act="play">${ICON.play} PLAY</button>
      <div class="hs-nav">
        <button class="hs-tile up" data-act="upgrades">${ICON.up}Upgrades${canUpgrade ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile skin" data-act="skins">${ICON.palette}Skins</button>
        <button class="hs-tile champ" data-act="champs">${ICON.shield}Heroes</button>
        <button class="hs-tile gift" data-act="daily">${ICON.gift}Daily${dailyReady ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile gear" data-act="settings">${ICON.gear}Settings</button>
      </div>`, false);
  }

  confetti() {
    const box = document.createElement('div');
    box.className = 'hs-confetti';
    const cols = ['#ffd23f', '#ff4f7a', '#3fd86b', '#2b8cff', '#ffffff', '#b07bff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
      c.style.animationDelay = `${Math.random() * 0.6}s`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(c);
    }
    this.ui.screen.appendChild(box);
    setTimeout(() => box.remove(), 4200);
  }

  // counts a number up inside an element
  countUp(el, to, ms = 900) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  showResult() {
    const r = this.result;
    this.ui.hud.hidden = true;
    if (r.win) {
      const st = Array.from({ length: 3 }, (_, k) => `<span class="${k < r.stars ? '' : 'off'}">★</span>`).join('');
      this.setScreen(`<div class="hs-ribbon">VICTORY!</div><div class="hs-stars">${st}</div>
        <div class="hs-reward hs-out">
          <div><span>Level reward</span><b>${fmt(r.base)}</b></div>
          <div><span>Enemies crushed</span><b>${fmt(r.kills)}</b></div>
          <div><span>Survivors</span><b>${fmt(r.survivors)}</b></div>
          <div class="total"><span>Total</span><b><span class="hs-coin"></span> <i class="cnt">0</i></b></div>
        </div>
        <div class="hs-actions">
          <button class="hs-btn ghost" data-act="home">${ICON.home}</button>
          <button class="hs-btn green hs-play hs-out" data-act="next">NEXT ${ICON.play}</button>
        </div>`);
      this.confetti();
      const cnt = this.ui.screen.querySelector('.cnt');
      cnt.style.fontStyle = 'normal';
      setTimeout(() => this.countUp(cnt, r.total), 600);
    } else {
      this.setScreen(`<div class="hs-ribbon lose hs-out">DEFEAT</div>
        <div class="hs-where hs-out">Fortress ${Math.round(r.progress * 100)}% destroyed · +<span class="hs-coin"></span>${r.total}</div>
        <p class="hs-tip">Aim through the ×3 gates first, break the purple crates for big bursts, and save your hero for brutes and bosses.</p>
        <div class="hs-actions">
          <button class="hs-btn ghost" data-act="home">${ICON.home}</button>
          <button class="hs-btn gold" data-act="upgrades">${ICON.up} Upgrades</button>
          <button class="hs-btn green hs-play hs-out" data-act="retry">${ICON.retry} RETRY</button>
        </div>`);
    }
  }

  showUpgrades() {
    const s = this.save;
    const rows = UPGRADES.map((u) => {
      const lv = s.up[u.id] || 0;
      const val = upgradeValue(s, u.id);
      const max = lv >= u.max;
      const cost = u.cost(lv);
      const pips = Array.from({ length: Math.min(u.max, 15) }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="hs-row"><div class="t">${u.name} <b>${u.id === 'champ' ? val.toFixed(2) : Math.round(val * 10) / 10}${u.unit}</b><small>${u.desc}</small><div class="hs-pips">${pips}</div></div>
        <button class="hs-btn ${max ? 'ghost' : 'gold'}" data-act="buyup" data-arg="${u.id}" ${max || s.coins < cost ? 'disabled' : ''}>${max ? 'MAX' : `<span class="hs-coin"></span>${fmt(cost)}`}</button></div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Upgrades</h2>${rows}</div>${this.backBtn()}`);
  }

  showSkins() {
    const s = this.save;
    const rows = SKINS.map((k) => {
      const own = s.skins.includes(k.id);
      const btn = s.skin === k.id ? '<button class="hs-btn ghost" disabled>In use</button>' : own ? `<button class="hs-btn" data-act="skin" data-arg="${k.id}">Use</button>` : `<button class="hs-btn gold" data-act="buyskin" data-arg="${k.id}" ${s.coins < k.cost ? 'disabled' : ''}><span class="hs-coin"></span>${fmt(k.cost)}</button>`;
      return `<div class="hs-row"><div class="hs-sw" style="background:${k.color}"></div><div class="t">${k.name}<small>${{ leaf: 'Leaf sprout', ears: 'Pointy ears', horn: 'Ice horn', flame: 'Fire crest', crown: 'Little crown' }[k.acc]}</small></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Skins</h2>${rows}</div>${this.backBtn()}`);
  }

  showChamps() {
    const s = this.save;
    const rows = CHAMPIONS.map((c) => {
      const own = s.champs.includes(c.id);
      const btn = s.champ === c.id ? '<button class="hs-btn ghost" disabled>In use</button>' : own ? `<button class="hs-btn" data-act="champ-use" data-arg="${c.id}">Use</button>` : `<button class="hs-btn gold" data-act="buychamp" data-arg="${c.id}" ${s.coins < c.cost ? 'disabled' : ''}><span class="hs-coin"></span>${fmt(c.cost)}</button>`;
      return `<div class="hs-row"><div class="t">${c.name}<small>${c.desc} Health ${c.hp}, speed ${c.speed}.</small></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Heroes</h2><p class="hs-tip" style="margin:0 0 .4em;text-align:center">Firing charges the round button. When it's full, tap it to send your hero up the lane.</p>${rows}</div>${this.backBtn()}`);
  }

  showDaily() {
    const s = this.save;
    const today = new Date().toDateString();
    const ready = s.daily.day !== today;
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    const streak = ready ? (s.daily.day === yesterday ? s.daily.streak : 0) : s.daily.streak - 1;
    const cur = streak % 7;
    const cells = DAILY_REWARDS.map((v, k) => {
      const cls = k === cur && ready ? 'now' : k < cur || (!ready && k <= cur) ? 'got' : '';
      return `<div class="hs-day ${cls}${k === 6 ? ' big' : ''}">Day ${k + 1}${ICON.gift.replace('<svg', '<svg style="width:1.6em;height:1.6em;color:#ffd23f"')}<span><span class="hs-coin"></span> ${fmt(v)}</span></div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Daily reward</h2><div class="hs-days">${cells}</div>
      <p class="hs-tip" style="text-align:center;margin:.6em auto 0">${ready ? 'Come back every day: the reward grows with your streak.' : 'Claimed for today. Come back tomorrow to keep the streak.'}</p></div>
      <div class="hs-actions">${this.backBtn()}${ready ? `<button class="hs-btn gold hs-play" data-act="claim">${ICON.gift} CLAIM</button>` : ''}</div>`);
  }

  showSettings() {
    const st = this.save.settings;
    const opt = (k, vals) => `<div class="hs-opts">${vals.map(([v, l]) => `<button class="hs-btn ${String(st[k]) === String(v) ? 'sel' : 'ghost'}" data-act="set" data-arg="${k}:${v}">${l}</button>`).join('')}</div>`;
    this.setScreen(`<div class="hs-panel hs-out"><h2>Settings</h2>
      <div class="hs-row"><span class="t">Graphics<small>Low turns off shadows and effects</small></span>${opt('quality', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']])}</div>
      <div class="hs-row"><span class="t">Sound</span>${opt('volume', [[0, 'Off'], [40, '40%'], [70, '70%'], [100, '100%']])}</div>
      <div class="hs-row"><span class="t">Auto-fire<small>Fire without holding</small></span>${opt('autoFire', [[false, 'Off'], [true, 'On']])}</div>
      <div class="hs-row"><span class="t">Auto resolution<small>Keeps the frame rate smooth</small></span>${opt('dynRes', [[true, 'On'], [false, 'Off']])}</div>
      <div class="hs-row"><span class="t">Your stats<small>Fired ${fmt(this.save.stats.fired)}, crushed ${fmt(this.save.stats.kills)}, won ${this.save.stats.wins}, bosses beaten ${this.save.stats.bosses}</small></span></div>
      </div>${this.backBtn()}`);
  }

  showPause() {
    this.paused = true;
    this.sound.suspend();
    this.setScreen(`<div class="hs-ribbon">PAUSED</div>
      <button class="hs-btn green hs-play hs-out" data-act="resume">${ICON.play} RESUME</button>
      <div class="hs-actions">
        <button class="hs-btn" data-act="retry">${ICON.retry} Restart</button>
        <button class="hs-btn ghost" data-act="settings">${ICON.gear} Settings</button>
        <button class="hs-btn ghost" data-act="home">${ICON.home} Home</button>
      </div>`);
  }

  act(a, arg) {
    const s = this.save;
    this.sound.init();
    if (a !== 'champ') this.sound.click();
    switch (a) {
      case 'play': this.startLevel(); break;
      case 'next': this.loadLevel(s.level); this.startLevel(); break;
      case 'retry': this.paused = false; this.sound.resume(); this.loadLevel(this.level.n); this.startLevel(); break;
      case 'home': this.paused = false; this.sound.resume(); this.loadLevel(s.level); this.showHome(); break;
      case 'pause': if (this.state === 'play') this.showPause(); break;
      case 'resume': this.paused = false; this.sound.resume(); this.closeScreen(); break;
      case 'champ': this.launchChampion(); break;
      case 'upgrades': this.back = this.state === 'lost' ? 'result' : 'home'; this.showUpgrades(); break;
      case 'skins': this.back = 'home'; this.showSkins(); break;
      case 'champs': this.back = 'home'; this.showChamps(); break;
      case 'daily': this.back = 'home'; this.showDaily(); break;
      case 'settings': this.back = this.paused ? 'pause' : 'home'; this.showSettings(); break;
      case 'back':
        if (this.back === 'pause') this.showPause();
        else if (this.back === 'result') this.showResult();
        else this.showHome();
        break;
      case 'buyup': {
        const u = UPGRADES.find((x) => x.id === arg);
        const lv = s.up[arg] || 0;
        if (lv < u.max && s.coins >= u.cost(lv)) { s.coins -= u.cost(lv); s.up[arg] = lv + 1; this.sound.coin(); writeSave(s); }
        this.showUpgrades();
        break;
      }
      case 'buyskin': {
        const k = SKINS.find((x) => x.id === arg);
        if (!s.skins.includes(arg) && s.coins >= k.cost) { s.coins -= k.cost; s.skins.push(arg); s.skin = arg; this.sound.coin(); writeSave(s); this.applySkin(); }
        this.showSkins();
        break;
      }
      case 'skin': s.skin = arg; writeSave(s); this.applySkin(); this.showSkins(); break;
      case 'buychamp': {
        const c = CHAMPIONS.find((x) => x.id === arg);
        if (!s.champs.includes(arg) && s.coins >= c.cost) { s.coins -= c.cost; s.champs.push(arg); s.champ = arg; this.sound.coin(); writeSave(s); }
        this.showChamps();
        break;
      }
      case 'champ-use': s.champ = arg; writeSave(s); this.showChamps(); break;
      case 'claim': {
        const today = new Date().toDateString();
        if (s.daily.day === today) break;
        const yesterday = new Date(Date.now() - 864e5).toDateString();
        const streak = s.daily.day === yesterday ? s.daily.streak : 0;
        s.coins += DAILY_REWARDS[streak % 7];
        s.daily = { day: today, streak: streak + 1 };
        writeSave(s);
        this.sound.win();
        this.showDaily();
        break;
      }
      case 'set': {
        const [k, raw] = arg.split(':');
        const v = raw === 'true' ? true : raw === 'false' ? false : k === 'volume' ? Number(raw) : raw;
        const prevQ = s.settings.quality;
        s.settings[k] = v;
        writeSave(s);
        if (k === 'volume') this.sound.setVolume(v);
        if (k === 'quality' && v !== prevQ) this.applyQuality();
        if (k === 'dynRes') { this.resScale = 1; this.resize(); }
        this.showSettings();
        break;
      }
      default: break;
    }
  }

  applySkin() {
    const o = this.skinOpts();
    this.crowds.player.setLook(o.color, o.acc, o.accColor);
    this.cannon.body.color.set(o.color);
  }

  applyQuality() {
    const q = this.save.settings.quality;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.crowds.player.setShadows(q !== 'low');
    this.crowds.enemy.setShadows(q !== 'low');
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.makePost();
    this.loadLevel(this.level.n);
    this.resize();
  }

  // ───────────── input ─────────────
  bindInput() {
    const c = this.renderer.domElement;
    let lastX = null;
    const toWorld = (px) => (px / Math.max(1, this.container.clientWidth)) * LANE_W * (this.aspect < 1 ? 1.5 : 1.1);
    this.onDown = (e) => {
      if (this.state !== 'play' || this.paused) return;
      this.sound.init();
      this.input.down = true;
      lastX = e.clientX;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.input.down || lastX === null) return;
      this.cannonX = clamp(this.cannonX + toWorld(e.clientX - lastX), -HALF + 1.2, HALF - 1.2);
      lastX = e.clientX;
    };
    this.onUp = () => { this.input.down = false; lastX = null; };
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.onKey = (e) => {
      if (!this.root.isConnected) return;
      const down = e.type === 'keydown';
      if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyC', 'KeyP', 'Escape'].includes(e.code) && this.state === 'play') e.preventDefault();
      if (down) this.input.keys.add(e.code); else this.input.keys.delete(e.code);
      if (!down || e.repeat) return;
      if (this.state === 'play' && (e.code === 'KeyC' || e.code === 'KeyE')) this.launchChampion();
      if (this.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) { if (this.paused) this.act('resume'); else this.showPause(); }
      if (e.code === 'Enter' && this.state === 'home') this.act('play');
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.onBlur = () => { this.input.keys.clear(); this.input.down = false; };
    window.addEventListener('blur', this.onBlur);
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      this.act(el.dataset.act, el.dataset.arg);
    });
    this.onVis = () => { if (document.hidden && this.state === 'play' && !this.paused) this.showPause(); };
    document.addEventListener('visibilitychange', this.onVis);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVis);
    this.clearLevel();
    this.crowds.player.dispose();
    this.crowds.enemy.dispose();
    this.sound.close();
    if (this.post) this.post.dispose();
    if (this.envTex) this.envTex.dispose();
    this.renderer.dispose();
    this.root.remove();
  }
}

export { THEMES };
