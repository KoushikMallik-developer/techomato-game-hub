// Horde Surge: aim the cannon, fire a stream of units up the lane, multiply them through gates, break
// bonus crates and barriers, crush the enemy horde and its bosses, and storm the fortress.
import * as THREE from 'three';
import {
  LANE_W, CANNON_Z, UNIT_SPEED, ENEMY_SPEED, MAX_UNITS, UPGRADES, SKINS, CHAMPIONS, THEMES, DAILY_REWARDS, POWERUPS, POWERS, PETS, COMBO_TIERS, LOADOUT,
  giftPower, inLoadout, toggleLoadout, needsLoadoutScreen, upgradeValue, loadSave, writeSave, clamp, damp, fmt,
} from './data.js';
import { makeLevel } from './levels.js';
import { ENEMY_TYPES, ET, pickType, ATTACK_NAMES } from './enemies.js';
import { MODS, dailyChallenge, dayKey, makeDaily, makeEndless, endlessWave, waveReward } from './modes.js';
import { Bits, Splats, Shots, Smoke, shardGeometry } from './fx.js';
import { buildWeather } from './weather.js';
import { WorldMap } from './map.js';
import { Crowd } from './crowd.js';
import { buildFortress, buildGate, buildCrate, buildBarrier, buildHazard, buildPickup, gateText, gateStyle, makeLabel } from './world.js';
import { buildBig, buildPet } from './creatures.js';
import { WEAPONS, buildWeapon, weaponPower, SPECIAL_NAMES } from './weapons.js';
import { load, bake } from './assets.js';
import { dailyMissions, missionText, isBest } from './missions.js';
import { Sound } from './audio.js';
import { buildScenery } from './scenery.js';
import { Post } from './post.js';
import { CSS, ICON } from './ui.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const HALF = LANE_W / 2;
const CELL = 1.5;
const R_HIT = 0.75; // unit vs unit contact distance
const R_SEEK = 1.5; // units veer toward enemies this close
const COMBO_GAP = 1.2; // seconds without a kill before the combo breaks
const ICE = new THREE.Color('#bfe8ff');
// timed effects shown as chips in the HUD: the two power-up orbs and the Aegis power
const FX_CHIPS = { frenzy: POWERUPS.frenzy, freeze: POWERUPS.freeze, aegis: { ...POWERS[2], name: 'AEGIS' } };

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.save = loadSave();
    this.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    // reduced motion: gentler shake, no screen flash, FOV punch or camera sweeps
    this.calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
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
      enemy: new Crowd(this.scene, 'enemy', {
        color: '#ffffff', acc: 'horns', accColor: '#d9d2c4', scale: 1.3, shadows: this.save.settings.quality !== 'low',
        gear: ['shield', 'bomber', 'archer', 'flyer', 'healer'].map((kind) => ({ type: ET[kind], kind })),
      }),
    };
    this.typeColor = ENEMY_TYPES.map((t) => (t.color ? new THREE.Color(t.color) : null));
    this._va = new THREE.Vector3(); this._vb = new THREE.Vector3();
    this.mode = 'campaign';
    this.mods = new Set();
    this.initFx();
    this.refreshMissions();
    this.initShockwaves();
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
    return { color: s.color, acc: s.acc, accColor, model: s.model ? bake(s.model, 1) : null, shadows: this.save.settings.quality !== 'low' };
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
    this.sun.intensity = (T.neon ? 0.9 : 2.2) * (T.sunI ?? 1);
    this.hemi.intensity = T.neon ? 0.45 : 0.75;
    this.hemiBase = this.hemi.intensity;
    this.hemi.groundColor.set(T.ground2);
    this.root.style.background = T.sky[1];
    this.enemyColor = new THREE.Color('#ffffff');
    if (this.crowds) {
      this.crowds.enemy.defColor.set(T.enemy);
      this.crowds.enemy.bodyMat.color.set('#ffffff');
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
    if (this.map) this.map.resize(w, h);
    this.root.style.fontSize = `${clamp(Math.min(w / 30, h / 36), 9, 22)}px`;
    this.root.classList.toggle('short', h < 430);
    this.root.classList.toggle('tall', h > w);
    this.placeCamera(0, true);
  }

  // Frames the whole lane, cannon to fortress. The camera sits high behind the cannon; its pitch and
  // field of view are solved so both ends fit vertically and the lane fills the width on tall screens.
  // The 'low' camera sits lower and closer for a more dramatic, head-on view of the horde.
  placeCamera(dt, snap = false) {
    const L = this.level ? this.level.L : 70;
    const a = this.aspect || 1;
    const portrait = a < 1;
    const low = this.save.settings.camera === 'low';
    const cx = this.cannon ? this.cannon.group.position.x : 0;
    const shake = (this.shake || 0) * (this.calm ? 0.25 : 1);
    const h = (portrait ? clamp(0.55 * L, 30, 52) : 24) * (low ? 0.58 : 1);
    const zc = CANNON_Z + (portrait ? 8 : low ? 11 : 15);
    // angles (below horizontal) to the near edge (just behind the cannon) and the fortress top
    const near = Math.atan2(h - 0, zc - (CANNON_Z + (low ? 4.5 : 3)));
    const far = Math.atan2(h - 15, zc + L + 1); // leaves room for the HUD above the fortress
    const pitch = (near + far) / 2;
    let vfov = (near - far) * 1.04;
    // keep the lane (plus a little grass) inside the width on narrow screens
    const dNear = Math.hypot(h, zc - CANNON_Z);
    const hfov = 2 * Math.atan(8.2 / dNear);
    vfov = Math.max(vfov, 2 * Math.atan(Math.tan(hfov / 2) / a));
    const fov = clamp(THREE.MathUtils.radToDeg(vfov) - (this.kick || 0) * 4, 25, 100);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const tx = cx * (portrait ? 0.15 : 0.3) + (Math.random() - 0.5) * shake;
    const ty = h + (Math.random() - 0.5) * shake;
    const b = this.camBase || (this.camBase = new THREE.Vector3(tx, ty, zc));
    if (snap) b.set(tx, ty, zc);
    else { b.x = damp(b.x, tx, 6, dt); b.y = damp(b.y, ty, 6, dt); b.z = damp(b.z, zc, 6, dt); }
    const look = (this.camLook || (this.camLook = new THREE.Vector3())).set(b.x * 0.4, b.y - Math.sin(pitch) * 10, b.z - Math.cos(pitch) * 10);
    this.camera.position.copy(b);
    // cinematic moves: the intro sweeps in from the fortress; win and lose push in and hold
    const c = this.cine;
    if (c) {
      c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      const w = c.out ? e : 1 - e;
      this.camera.position.lerp(c.pos, w);
      look.lerp(c.look, w);
      if (!c.out && k >= 1) this.cine = null;
    }
    this.camera.lookAt(look);
    this.shake = Math.max(0, (this.shake || 0) - dt * 2.5);
    this.kick = Math.max(0, (this.kick || 0) - dt * 3);
  }

  cinematic(pos, look, dur, out) {
    if (this.calm) return;
    this.cine = { t: 0, dur, out, pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
  }

  // ───────────── level ─────────────
  // lvl: a campaign level by default, or a ready-made endless / daily level
  loadLevel(n, lvl = makeLevel(n)) {
    this.clearLevel();
    this.level = lvl;
    this.mode = lvl.mode || 'campaign';
    this.mods = new Set(lvl.mods || []);
    this.applyTheme(lvl.theme);
    if (this.mods.has('fog')) this.scene.fog = new THREE.Fog(lvl.theme.fog, 16, 72);
    const q = this.save.settings.quality;
    const grp = new THREE.Group();
    this.levelGroup = grp;
    this.scene.add(grp);
    this.scenery = buildScenery(lvl, q);
    grp.add(this.scenery.group);
    this.weather = buildWeather(lvl, q);
    grp.add(this.weather.group);
    this.fort = buildFortress(lvl);
    grp.add(this.fort.group);
    const skin = SKINS.find((k) => k.id === this.save.skin) || SKINS[0];
    this.cannon = this.makeWeapon(skin.color);
    grp.add(this.cannon.group);
    this.gates = lvl.gates.map((g) => ({ ...g, left: g.op === 'x' ? g.v : g.v, used: false, view: null, x0: g.x }));
    this.gates.forEach((g) => { g.view = buildGate(g); grp.add(g.view.group); });
    this.crates = lvl.crates.map((c) => ({ ...c, view: buildCrate(c) }));
    this.crates.forEach((c) => grp.add(c.view.group));
    this.barriers = lvl.barriers.map((b) => ({ ...b, view: buildBarrier(b) }));
    this.barriers.forEach((b) => grp.add(b.view.group));
    this.hazards = lvl.hazards.map((h) => ({ ...h, view: buildHazard(h), ang: 0, sx: 0 }));
    this.hazards.forEach((h) => grp.add(h.view.group));
    this.pickups = lvl.pickups.map((p) => ({ ...p, taken: false, view: buildPickup(p, POWERUPS[p.kind]) }));
    this.pickups.forEach((p) => grp.add(p.view.group));
    if (lvl.boss && lvl.boss.model) load(lvl.boss.model); // ready long before the boss walks out
    // gold coins on the lane (one instanced mesh; collected ones shrink away)
    this.laneCoins = lvl.coins.map((c) => ({ ...c, taken: false, t: 0 }));
    const cg = (bake('Coin', 0.75, true) || new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20).rotateX(Math.PI / 2)).clone();
    const cb = new THREE.Box3().setFromBufferAttribute(cg.attributes.position);
    if (cb.max.y - cb.min.y < 0.3) cg.rotateX(Math.PI / 2); // a coin modelled lying flat: stand it up
    cg.center();
    this.coinMesh = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ vertexColors: !!cg.attributes.color, color: cg.attributes.color ? '#ffffff' : '#ffcf3a', metalness: 0.75, roughness: 0.28, emissive: '#7a4a00', emissiveIntensity: 0.35 }), Math.max(1, this.laneCoins.length));
    this.coinMesh.castShadow = true;
    this.coinMesh.frustumCulled = false;
    grp.add(this.coinMesh);
    this.attachPet();
    this.fortBase = this.fort.group.position.x;
    this.fortHit = 0;
    this.cine = null;
    // sun shadow covers the lane
    const sc = this.sun.shadow.camera;
    const span = lvl.L / 2 + 14;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 220;
    sc.updateProjectionMatrix();
    // the light comes from over the right shoulder; the sun disc in the sky sits beyond the fortress
    this.sun.position.set(34, 62 * (lvl.theme.sunElev ?? 1), -lvl.L / 2 + 34);
    this.sun.target.position.set(0, 0, -lvl.L / 2);
    this.tuneEnv(grp);
    // state
    // second wind: every loss on this campaign level makes the next try a little easier (up to 3 times)
    const boost = this.mode === 'campaign' ? Math.min(3, (this.save.fails || {})[lvl.n] || 0) : 0;
    const armor = Math.round((upgradeValue(this.save, 'armor') + this.weaponDef().armor) * (this.mods.has('glass') ? 0.5 : 1) * (1 + boost * 0.2));
    this.st = {
      baseHp: lvl.baseHp, baseMax: lvl.baseHp, hp: armor, hpMax: armor, time: 0, fireT: 0, meter: 0, meterMax: 60,
      waveT: lvl.waves.first, waveN: lvl.waves.count, kills: 0, fired: 0, bossSpawned: false, crates: 0, startBurst: Math.round(upgradeValue(this.save, 'start')),
      fx: { frenzy: 0, freeze: 0, aegis: 0 }, fxMax: { frenzy: 1, freeze: 1, aegis: 1 }, combo: 0, comboT: 0, bestCombo: 0, tier: -1,
      pw: Object.fromEntries(POWERS.map((q) => [q.id, 0])), // seconds until each super power is ready again
      wave: lvl.wave || 0, fortStage: 0, smokeT: 0, boost, laneCoins: 0, wpnT: 3, later: [],
    };
    this.danger = false;
    this.bigs = [];
    this.champs = [];
    this.cannonX = 0;
    this.fortShown = lvl.baseHp;
    this.pressure = 1 - boost * 0.12; // second wind also thins the horde
    this.crowds.player.clear();
    this.crowds.enemy.clear();
    this.placeCamera(0, true);
    this.buildPowers();
    this.updateHud(true);
  }

  // the powers the player takes into a level (owned ones only, at most LOADOUT)
  loadout() { return inLoadout(this.save).map((id) => POWERS.find((p) => p.id === id)).filter(Boolean); }

  // called when a level is loaded and again as it starts (the loadout screen sits between the two)
  buildPowers() {
    const L = this.inUse = this.loadout();
    this.ui.powers.innerHTML = L.map((q, k) => `<button class="hs-pow" data-act="power" data-arg="${q.id}" style="--c:${q.color}" aria-label="${q.name} (key ${k + 1})" title="${q.name}: ${q.desc}">${ICON[q.icon]}<i class="cd"></i><kbd>${k + 1}</kbd><span class="nm hs-out">${q.name}</span></button>`).join('');
    this.ui.pow = Object.fromEntries(L.map((p) => [p.id, this.ui.powers.querySelector(`[data-arg="${p.id}"]`)]));
  }

  // the fortress fights back: every hit it takes sends more defenders out of its gate
  hitFort(dmg) {
    const st = this.st;
    st.baseHp -= dmg;
    this.fortHit = Math.min(0.3, this.fortHit + 0.05);
    st.fightBack = (st.fightBack || 0) + Math.min(dmg, 40) * this.level.waves.fightBack;
    while (st.fightBack >= 1) { st.fightBack -= 1; this.spawnEnemy((Math.random() - 0.5) * 4.5, -this.level.L + 1.8 + Math.random() * 1.2, 1.1); }
    this.fortLabel();
    this.fortDamage();
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
    (this.corpses || []).forEach((c) => this.disposeObj(c.v.group));
    this.corpses = [];
    this.chest = null;
    this.pet = null;
    this.bits && this.fxClear();
    this.waves && this.waves.forEach((w) => { w.t = w.dur; w.m.visible = false; });
    this.floats && this.floats.forEach((f) => f.el.remove());
    this.floats = [];
  }

  startLevel() {
    this.sound.init();
    this.buildPowers(); // the loadout may have changed since the level was loaded
    this.updateHud(true);
    this.state = 'play';
    this.crowds.enemy.clear();
    this.closeScreen();
    this.ui.hud.hidden = false;
    this.ui.hint.hidden = false;
    this.ui.hint.textContent = this.isTouch ? 'HOLD & DRAG TO FIRE' : 'HOLD MOUSE (OR SPACE) TO FIRE · DRAG / A D TO AIM';
    const lvl = this.level;
    const title = this.mode === 'endless' ? 'ENDLESS' : this.mode === 'daily' ? 'DAILY CHALLENGE' : lvl.bossLevel ? 'BOSS LEVEL' : `LEVEL ${lvl.n}`;
    const sub = this.mode === 'daily' ? lvl.mods.map((m) => MODS[m].name).join(' + ') : this.mode === 'endless' ? 'Survive as many waves as you can' : lvl.bossLevel ? lvl.boss.name : `${lvl.theme.name} · ${lvl.twist.name}`;
    this.banner(title, sub, 1800);
    if (this.mods.has('frenzy')) { this.st.fx.frenzy = 10; this.st.fxMax.frenzy = 10; }
    if (this.st.boost) {
      this.st.fx.frenzy = this.st.fxMax.frenzy = 4 + this.st.boost * 2;
      setTimeout(() => this.state === 'play' && this.banner('SECOND WIND', `Stronger cannon, faster fire, a smaller horde`, 1600), 1900);
    }
    // sweep in from the fortress to the cannon
    this.cinematic([0, 9, -this.level.L + 24], [0, 3, -this.level.L], 2, false);
    // the opening burst
    for (let k = 0; k < this.st.startBurst; k++) this.spawnPlayer(this.cannonX + (Math.random() - 0.5) * 3, CANNON_Z - 1 - Math.random() * 3, true);
    // first time a new kind of enemy shows up: a card explains it
    if (this.mode === 'campaign' && lvl.intro && !(this.save.seen || {})[lvl.intro.id]) this.showIntro(lvl.intro);
  }

  // ───────────── spawning ─────────────
  spawnPlayer(x, z, launched = false) {
    const c = this.crowds.player;
    return c.add(clamp(x, -HALF + 0.4, HALF - 0.4), z, launched ? { y: 1.2, vy: 3 + Math.random() * 2, speed: 1 } : { speed: 1 });
  }

  fire() {
    const cx = this.cannonX;
    const w = this.weaponDef();
    for (let k = 0; k < w.burst; k++) {
      const x = cx + (w.burst > 1 ? (k / (w.burst - 1) - 0.5) * 1.4 : 0) + (Math.random() - 0.5) * 0.6;
      if (this.cannon.air) this.crowds.player.add(clamp(x, -HALF + 0.4, HALF - 0.4), CANNON_Z - 1.5 - Math.random(), { y: 2.8, vy: -1, speed: 1 });
      else this.spawnPlayer(x, CANNON_Z - 0.6, true);
    }
    this.st.fired += w.burst;
    this.save.stats.fired += w.burst;
    if (!this.mods.has('nohero')) this.st.meter = Math.min(this.st.meterMax, this.st.meter + 1);
    this.cannon.barrel.position.z = 0.25;
    const f = this.cannon.flash;
    f.material.opacity = 0.9;
    f.scale.set(0.7 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 1.4 + Math.random() * 0.8);
    this.sound.shoot();
  }

  launchChampion() {
    if (this.state !== 'play' || this.st.meter < this.st.meterMax) return;
    this.st.meter = 0;
    const def = CHAMPIONS.find((c) => c.id === this.save.champ) || CHAMPIONS[0];
    const pow = upgradeValue(this.save, 'champ');
    const skin = SKINS.find((k) => k.id === this.save.skin) || SKINS[0];
    const view = buildBig(this.level.theme, def.radius * 0.95, { champion: { color: skin.color, roller: def.id === 'roller' } });
    if (def.id === 'roller') { view.legs.forEach((l) => { l.visible = false; }); view.body.scale.set(1, 0.85, 1); }
    view.group.position.set(this.cannonX, 0, CANNON_Z - 1.5);
    view.group.rotation.y = 0;
    this.scene.add(view.group);
    const hp = Math.round(def.hp * pow);
    this.champs.push({ def, view, x: this.cannonX, z: CANNON_Z - 1.5, hp, max: hp, dmg: def.dmg * pow, t: 0, phase: 0 });
    this.sound.champion();
    this.shake = 0.6;
    this.shockwave(this.cannonX, CANNON_Z - 1.5, '#ffe066', 4, 0.5);
    this.impact(0.6);
    this.banner(def.name.toUpperCase(), '', 900);
  }

  spawnWave() {
    const lvl = this.level;
    const n = Math.min(lvl.waves.cap, Math.round(this.st.waveN * this.pressure));
    for (let k = 0; k < n; k++) this.spawnEnemy((Math.random() - 0.5) * 4.6, -lvl.L + 1.2 + Math.random() * 1.6 + k * 0.05);
    this.st.waveN *= lvl.waves.growth;
  }

  // one horde unit, its type drawn from the level's mix
  spawnEnemy(x, z, speed = 1, type = pickType(this.level.mix, Math.random())) {
    const def = ENEMY_TYPES[type];
    return this.crowds.enemy.add(x, z, {
      speed: speed * def.speed, type, hp: def.hp, color: this.typeColor[type] || undefined,
      y: type === ET.flyer ? 2.4 : 0,
      // archers stop somewhere in the middle of the lane
      aux: type === ET.archer ? -this.level.L * (0.62 - Math.random() * 0.22) : 0,
    });
  }

  // big enemies: the level boss (smashes the ground, reaching the cannon ends the run) and
  // brutes that march down with the waves and hit the cannon hard if they get through
  spawnBig(def, kind) {
    const view = buildBig(this.level.theme, def.scale, kind === 'boss' && def.model ? { boss: def } : { brute: true });
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
      this.banner(def.name.toUpperCase(), def.title || 'incoming!', 2000);
      // a quick look at the boss before the camera swings back
      if (def.attacks && def.attacks.length) this.cinematic([x + 7, 7, b.z + 13], [x, 3.5, b.z], 2.4, false);
    } else this.sound.roar();
    return b;
  }

  // ───────────── particles and floating text ─────────────
  initFx() {
    this.bits = new Bits(this.scene, new THREE.IcosahedronGeometry(0.11, 0), 1600);
    this.shards = new Bits(this.scene, shardGeometry(), 600, { spin: true, gravity: 12, mat: new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.25 }) });
    this.splats = new Splats(this.scene);
    this.shots = new Shots(this.scene);
    this.smoke = new Smoke(this.scene);
    this.floats = [];
    this.debris = [];
    this.corpses = [];
    // boss attack props, reused by every boss: a sugar bubble and a neon beam with its warning line
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshStandardMaterial({ color: '#ff8ad0', transparent: true, opacity: 0.35, emissive: '#ff8ad0', emissiveIntensity: 0.6, roughness: 0.1, depthWrite: false }));
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 1, 1.2, 0.5), new THREE.MeshBasicMaterial({ color: '#ff3bd0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamMark = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, 0.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, depthWrite: false }));
    [this.bubble, this.beam, this.beamMark].forEach((m) => { m.visible = false; this.scene.add(m); });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#58c8ff', emissive: '#58c8ff', emissiveIntensity: 0.7, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 }));
    this.dome.visible = false;
    this.scene.add(this.dome);
    const boltMat = new THREE.LineBasicMaterial({ color: '#fff6a8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bolts = Array.from({ length: 30 }, () => {
      const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3)), boltMat);
      l.visible = false; l.frustumCulled = false; l.userData.t = 0;
      // a glowing column under each jagged bolt so the strike reads from far away
      const pillar = new THREE.Mesh(this.pillarGeo || (this.pillarGeo = new THREE.CylinderGeometry(0.18, 0.35, 26, 8, 1, true).translate(0, 13, 0)), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      pillar.visible = false;
      l.userData.pillar = pillar;
      this.scene.add(l, pillar);
      return l;
    });
  }

  burst(x, y, z, color, n = 6, power = 3) { this.bits.burst(x, y, z, color, n, power); }

  fxClear() {
    [this.bits, this.shards, this.splats, this.shots, this.smoke].forEach((f) => f.clear());
    [this.bubble, this.beam, this.beamMark, this.dome].forEach((m) => { m.visible = false; });
    this.bolts.forEach((l) => { l.visible = l.userData.pillar.visible = false; });
    this.debris = [];
  }

  fxUpdate(dt) {
    [this.bits, this.shards, this.splats, this.shots, this.smoke].forEach((f) => f.update(dt));
    // battlements knocked off the fortress tumble and bounce (in the fortress's own space)
    this.debris = this.debris.filter((d) => {
      d.t += dt;
      d.v.y -= 20 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.z += d.w.z * dt;
      if (d.m.position.y < 0.45 && d.v.y < 0) {
        if (d.v.y < -4) { const w = this.fort.group.localToWorld(this._va.copy(d.m.position)); this.burst(w.x, 0.2, w.z, '#9a8a7a', 6, 3); this.smoke.puff(w.x, 0.5, w.z, '#8a8078', 2, 0.8, 1.5); }
        d.m.position.y = 0.45; d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.5);
      }
      if (d.t > 3) { d.m.visible = false; return false; }
      return true;
    });
  }

  // the fortress crumbles as it takes damage: battlements break off at 2/3 and 1/3 health
  fortDamage() {
    if (this.mode === 'endless' || this.state !== 'play') return;
    const st = this.st;
    const f = st.baseHp / st.baseMax;
    const stage = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
    while (st.fortStage < stage) {
      const s = ++st.fortStage;
      this.fort.chunks.filter((c) => c.userData.chunk === s).forEach((c, k) => {
        if (s === 1 && k % 2) return; // the first crack knocks off every other front battlement
        c.userData.chunk = 0;
        this.debris.push({ m: c, t: 0, v: new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, 3 + Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9) });
      });
      if (s === 2) this.fort.roofs.forEach((r) => { r.userData.tilt = r.userData.roof * 0.45; });
      const fz = -this.level.L;
      this.burst(0, 7, fz + 0.5, '#9a8a7a', 30, 6);
      this.smoke.puff(0, 7, fz, '#6a6060', 7, 2, 3);
      this.sound.smash();
      this.shake = Math.max(this.shake, 0.7);
      this.impact(0.5);
      this.floatText(s === 1 ? 'THE WALLS CRACK!' : 'IT\'S CRUMBLING!', 0, 10, fz + 2, '#ffd23f', 1.4);
    }
  }

  // a glass gate used up: it bursts into spinning shards
  shatterGate(g) {
    const col = gateStyle(g.op).glow;
    for (let k = -g.w / 2 + 0.3; k < g.w / 2; k += 0.5) this.shards.burst(g.x + k, 0.3 + Math.random() * 1.6, g.z, col, 3, 2.4);
    g.view.panel.visible = false;
    g.view.labelMesh.visible = false;
    this.sound.clang();
  }

  // kills the player units in a circle (arrows, ice shards, bomber blasts); returns how many fell
  hitArea(x, z, r, color) {
    const P = this.crowds.player;
    let n = 0;
    for (let i = P.n - 1; i >= 0; i--) if (P.y[i] < 0.9 && (P.x[i] - x) ** 2 + (P.z[i] - z) ** 2 < r * r) { P.kill(i); n++; }
    this.burst(x, 0.2, z, color, 4 + Math.min(n, 10), 2);
    if (n) this.splats.add(x, z, this.skinColor(), 0.6 + Math.min(n, 8) * 0.12);
    return n;
  }

  archerShot(x, z) {
    const P = this.crowds.player;
    let tx = x + (Math.random() - 0.5) * 3; let tz = z + 8 + Math.random() * 6;
    for (let k = 0; k < 24 && P.n; k++) {
      const i = (Math.random() * P.n) | 0;
      // lead the target: units walk toward the archer
      if (P.z[i] > z && P.z[i] < z + 18 && P.y[i] < 0.3) { tx = P.x[i]; tz = P.z[i] - 3.5; break; }
    }
    this.sound.arrow();
    this.shots.fire('arrow', this._va.set(x, 1.1, z), this._vb.set(tx, 0.15, Math.max(tz, z + 1)), 0.55, 2.2, (q) => this.hitArea(q.x, q.z, 0.65, '#a07040'));
  }

  // shamans mend any brute or boss they walk beside
  healBigs(dt) {
    const E = this.crowds.enemy;
    for (const b of this.bigs) {
      let n = 0;
      for (let j = 0; j < E.n; j++) if (E.type[j] === ET.healer && Math.abs(E.z[j] - b.z) < 7 && Math.abs(E.x[j] - b.x) < 7) n++;
      if (!n) continue;
      b.hp = Math.min(b.max, b.hp + b.max * 0.035 * Math.min(n, 3) * dt);
      if (Math.random() < dt * 8) this.burst(b.x + (Math.random() - 0.5) * 2, 1.5 * b.scale, b.z, '#7dffb0', 2, 1.5);
    }
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

  // expanding ground rings for smashes, blasts and pickups (a small reused pool)
  initShockwaves() {
    this.waveGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.waveGeo.rotateX(-Math.PI / 2);
    this.waves = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
      m.visible = false;
      m.renderOrder = 4;
      this.scene.add(m);
      return { m, t: 1, dur: 1, r: 1 };
    });
  }

  shockwave(x, z, color, r = 4, dur = 0.6) {
    const w = this.waves.find((q) => !q.m.visible) || this.waves.reduce((a, q) => (q.t / q.dur > a.t / a.dur ? q : a));
    w.t = 0; w.dur = dur; w.r = r;
    w.m.position.set(x, 0.08, z);
    w.m.material.color.set(color);
    w.m.visible = true;
  }

  updateShockwaves(dt) {
    for (const w of this.waves) {
      if (!w.m.visible) continue;
      w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) { w.m.visible = false; continue; }
      const s = w.r * (0.15 + 0.85 * (1 - (1 - k) ** 3));
      w.m.scale.set(s, 1, s);
      w.m.material.opacity = (1 - k) * 0.85;
    }
  }

  // big moments: brief slow motion, a FOV punch and a chromatic flash
  slowmo(dur, k) { this.slowT = Math.max(this.slowT || 0, dur); this.slowK = k; }

  impact(k) {
    if (this.calm) return;
    this.kick = Math.max(this.kick || 0, k);
    this.hit = Math.max(this.hit || 0, k * 0.8);
  }

  // every kill feeds the combo; a short lull breaks it
  addKills(n) {
    const st = this.st;
    st.kills += n;
    this.save.stats.kills += n;
    st.combo += n;
    st.comboT = COMBO_GAP;
    st.bestCombo = Math.max(st.bestCombo, st.combo);
    this.mission('kills', n);
    this.mission('combo', st.combo);
    let tier = -1;
    COMBO_TIERS.forEach((v, k) => { if (st.combo >= v) tier = k; });
    if (tier > st.tier) {
      st.tier = tier;
      this.sound.combo(tier);
      const el = this.ui.combo;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
  }

  takePickup(p) {
    this.mission('orbs', 1);
    p.taken = true;
    p.view.group.visible = false;
    const def = POWERUPS[p.kind];
    this.burst(p.x, 1.3, p.z, def.color, 24, 5);
    this.shockwave(p.x, p.z, def.color, 3.5, 0.5);
    this.sound.power(p.kind);
    if (p.kind === 'bomb') { this.blast(p.x, p.z - 4, 7, def.color); return; }
    const t = def.time * (1 + upgradeValue(this.save, 'pow') / 100);
    this.st.fx[p.kind] = t;
    this.st.fxMax[p.kind] = t;
    this.banner(def.name, def.desc, 1100);
  }

  // flattens enemies in a radius and takes a third off any big one caught in it
  blast(x, z, R, color, bigDmg = 0.35, quiet = false) {
    const E = this.crowds.enemy;
    let n = 0;
    for (let j = E.n - 1; j >= 0; j--) {
      if ((E.x[j] - x) ** 2 + (E.z[j] - z) ** 2 > R * R) continue;
      if (n < 60) this.burst(E.x[j], 0.4, E.z[j], this.level.theme.enemy, 2, 5);
      E.kill(j);
      n++;
    }
    if (n) this.addKills(n);
    this.bigs.forEach((b) => { if (Math.hypot(b.x - x, b.z - z) < R + b.radius) b.hp -= b.max * bigDmg; });
    this.burst(x, 1, z, color, 40, 8);
    this.burst(x, 1, z, '#ffffff', 20, 6);
    this.shockwave(x, z, color, R, 0.7);
    this.shockwave(x, z, '#ffffff', R * 0.6, 0.45);
    if (quiet) { this.sound.boom(); this.shake = Math.max(this.shake, 0.35); } else {
      this.sound.explode();
      this.shake = Math.max(this.shake, 1);
      this.impact(1);
      this.slowmo(0.35, 0.3);
    }
    if (n > 3) this.floatText(`×${n}`, x, 2.5, z, '#ffd23f', quiet ? 1.1 : 1.5);
  }

  // ───────────── weapons ─────────────
  weaponDef() { return WEAPONS.find((w) => w.id === this.save.weapon) || WEAPONS[0]; }

  // the equipped weapon's view; until its model file arrives the cannon stands in, then swaps itself
  makeWeapon(color) {
    const def = this.weaponDef();
    const view = buildWeapon(def, color);
    if (view) return view;
    const grp = this.levelGroup;
    load(def.model).then(() => {
      if (this.levelGroup !== grp || this.weaponDef() !== def) return;
      const next = buildWeapon(def, color);
      if (!next) return;
      next.group.position.x = this.cannon.group.position.x;
      grp.remove(this.cannon.group);
      this.cannon = next;
      grp.add(next.group);
    });
    return { ...buildWeapon(null, color), def: WEAPONS[0] };
  }

  // shells lobbed into the thickest part of the horde, a strafing run down the lane, or homing missiles
  weaponSpecial(w) {
    const m = this.cannon.muzzle;
    const cx = this.cannon.group.position.x;
    const c = this.hordeCenter();
    if (!c) return;
    if (w.special === 'shell' || w.special === 'bigshell') {
      const big = w.special === 'bigshell';
      this.shots.fire('shell', this._va.set(cx, m.y + 0.5, CANNON_Z + 1.5 + m.z), this._vb.set(c.x, 0.2, c.z), 1, 7,
        (q) => this.blast(q.x, q.z, big ? 3.8 : 2.8, '#ffaa33', big ? 0.06 : 0.04, true),
        (pos) => { if (Math.random() < 0.5) this.smoke.puff(pos.x, pos.y, pos.z, '#8a8078', 0.8, 0.2, 0.5); });
      this.cannon.barrel.position.z = 0.5;
      this.sound.smash();
    } else if (w.special === 'strafe') {
      // six hits marching up the lane, under the plane's guns
      for (let k = 0; k < 6; k++) {
        this.st.later.push({ t: 0.25 + k * 0.12, fn: () => {
          const z = CANNON_Z - 10 - k * 5;
          this.burst(cx, 0.5, z, '#ffe066', 10, 4);
          this.blast(cx + (Math.random() - 0.5) * 2, z, 2.4, '#ffcf3a', 0.02, true);
        } });
      }
      this.floatText('STRAFE!', cx, 5, CANNON_Z - 6, '#ffe066', 1.3);
    } else if (w.special === 'missiles') {
      const n = w.salvo || 4;
      for (let k = 0; k < n; k++) {
        const tx = clamp(c.x + (Math.random() - 0.5) * 7, -HALF + 1, HALF - 1); const tz = c.z + (Math.random() - 0.5) * 8;
        this.shots.fire('missile', this._va.set(cx + (k % 2 ? 1.2 : -1.2), m.y, CANNON_Z + 1.5 + m.z), this._vb.set(tx, 0.3, tz), 0.9 + k * 0.1, 3,
          (q) => this.blast(q.x, q.z, 3, '#ff7a2a', 0.04, true),
          (pos) => { if (Math.random() < 0.7) this.smoke.puff(pos.x, pos.y, pos.z, '#d8d0c8', 0.9, 0.3, 0.6); });
      }
      this.sound.laser();
    }
  }

  // an animated creature plays its death and sinks away; a procedural one is removed at once
  kill3d(v) {
    if (!v.anim) { this.disposeObj(v.group); return; }
    v.anim.once('death', true);
    v.bar.visible = false;
    this.corpses.push({ v, t: 0 });
  }

  updateCorpses(dt) {
    this.corpses = this.corpses.filter((c) => {
      c.t += dt;
      c.v.anim.update(dt);
      if (c.t > 1.8) c.v.group.position.y -= dt * 1.6;
      if (c.t < 3) return true;
      this.disposeObj(c.v.group);
      return false;
    });
  }

  // ───────────── pets ─────────────
  coinMul() { return this.save.pet === 'shiba' ? 1.2 : 1; }

  attachPet() {
    const def = PETS.find((q) => q.id === this.save.pet);
    this.pet = null;
    if (!def || !this.levelGroup) return;
    const grp = this.levelGroup;
    load(def.model).then(() => {
      if (this.levelGroup !== grp || this.save.pet !== def.id) return;
      const view = buildPet(def.model);
      if (!view) return;
      view.group.position.set(2.4, 0, CANNON_Z + 1.4);
      grp.add(view.group);
      this.pet = { def, view, t: 4 + Math.random() * 4, lunge: null };
    });
  }

  // the pet trots beside the cannon; the husky pounces, the shiba digs up coins, the fox cheers powers on
  updatePet(dt, live) {
    const p = this.pet;
    if (!p) return;
    const g = p.view.group;
    const cx = this.cannon.group.position.x;
    let tx = cx + (cx > 0 ? -2.4 : 2.4); let tz = CANNON_Z + 1.4;
    if (p.lunge) { p.lunge.t -= dt; tx = p.lunge.x; tz = p.lunge.z; if (p.lunge.t <= 0) p.lunge = null; }
    const dx = tx - g.position.x; const dz = tz - g.position.z;
    g.position.x = damp(g.position.x, tx, p.lunge ? 14 : 6, dt);
    g.position.z = damp(g.position.z, tz, p.lunge ? 14 : 6, dt);
    const moving = Math.hypot(dx, dz) > 0.25;
    g.rotation.y = damp(g.rotation.y, moving ? Math.atan2(-dx, -dz) : 0, 8, dt);
    p.view.anim.loop(moving ? 'run' : 'idle');
    p.view.anim.update(dt);
    if (!live) return;
    p.t -= dt;
    if (p.def.id === 'shiba' && p.t <= 0) {
      p.t = 12;
      const v = Math.round((3 + this.level.n / 3) * this.coinMul());
      this.save.coins += v;
      p.view.anim.once('eat');
      this.burst(g.position.x, 0.4, g.position.z, '#ffcf3a', 10, 3);
      this.floatText(`+${v}`, g.position.x, 1.8, g.position.z, '#ffe066', 1);
      this.sound.coin();
    } else if (p.def.id === 'husky' && p.t <= 0) {
      const E = this.crowds.enemy;
      let best = -1; let bz = CANNON_Z - 7;
      for (let j = 0; j < E.n; j++) if (E.z[j] > bz && E.y[j] < 3) { bz = E.z[j]; best = j; }
      if (best < 0) return;
      p.t = 1.1;
      p.lunge = { x: E.x[best], z: E.z[best], t: 0.3 };
      p.view.anim.once('attack', false, 1.6);
      this.burst(E.x[best], 0.5 + E.y[best], E.z[best], this.level.theme.enemy, 8, 3);
      this.splats.add(E.x[best], E.z[best], this.level.theme.enemy, 0.6);
      E.kill(best);
      this.addKills(1);
      this.sound.pop();
    }
  }

  // ───────────── lane coins ─────────────
  takeCoin(c) {
    c.taken = true;
    const v = Math.round(this.level.coinValue * this.coinMul());
    this.save.coins += v;
    this.st.laneCoins += v;
    this.burst(c.x, 1, c.z, '#ffcf3a', 4, 2);
    this.sound.coin();
    this.mission('coins', 1);
  }

  updateCoins(dt) {
    if (!this.coinMesh) return;
    const M = this._m4 || (this._m4 = new THREE.Matrix4());
    const Q = this._q || (this._q = new THREE.Quaternion());
    const P = this._p || (this._p = new THREE.Vector3());
    const S = this._s || (this._s = new THREE.Vector3());
    const Y = this._y || (this._y = new THREE.Vector3(0, 1, 0));
    this.laneCoins.forEach((c, i) => {
      if (c.taken) c.t = Math.min(1, c.t + dt * 3);
      const k = c.taken ? 1 - c.t : 1;
      Q.setFromAxisAngle(Y, this.clock * 3 + i * 0.5 + c.t * 12);
      P.set(c.x, 0.85 + Math.sin(this.clock * 3 + i) * 0.12 + c.t * 2.5, c.z);
      S.setScalar(Math.max(0.001, k));
      M.compose(P, Q, S);
      this.coinMesh.setMatrixAt(i, M);
    });
    this.coinMesh.count = this.laneCoins.length;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ───────────── treasure chest after a win ─────────────
  showChest() {
    if (this.state !== 'won' || !this.levelGroup) return;
    const roll = Math.random();
    const tier = roll < 0.1 ? 2 : roll < 0.4 ? 1 : 0;
    const n = this.mode === 'campaign' ? this.level.n : 12;
    const amount = Math.round([60 + n * 10, 150 + n * 22, 400 + n * 45][tier] * this.coinMul());
    const colors = ['#ffd23f', '#58c8ff', '#c08bff'];
    const geo = bake('Chest_Closed', 2);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: !!geo, color: geo ? '#ffffff' : '#a0682a', roughness: 0.55, metalness: 0.25 });
    const mesh = new THREE.Mesh(geo || new THREE.BoxGeometry(1.8, 1.3, 1.2).translate(0, 0.65, 0), mat);
    mesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colors[tier], transparent: true, depthWrite: false }));
    const g = new THREE.Group();
    g.add(mesh, ring);
    g.position.set(0.5, 6, -this.level.L + 7); // where the fortress gate stood
    g.rotation.y = 0.35;
    this.levelGroup.add(g);
    this.chest = { g, mesh, ring, tier, amount, color: colors[tier], t: 0, opened: false };
    this.ui.hud.hidden = true;
    // the camera swoops down to the chest
    this.cinematic([g.position.x + 3.5, 4.5, g.position.z + 8], [g.position.x, 1, g.position.z], 0.9, true);
    this.sound.power('frenzy');
    this.setScreen(`<div class="hs-chestui">
      <div class="hs-ribbon ${['', 'rare', 'epic'][tier]}">${['TREASURE CHEST!', 'RARE CHEST!', 'EPIC CHEST!'][tier]}</div>
      <button class="hs-btn gold hs-play hs-out" data-act="openchest">OPEN</button>
    </div>`, false);
  }

  openChest() {
    const c = this.chest;
    if (!c || c.opened) return;
    c.opened = true;
    c.t = 0;
    const open = bake('Chest_Open', 2);
    if (open) c.mesh.geometry = open;
    const p = c.g.position;
    this.burst(p.x, 1.4, p.z, '#ffcf3a', 60, 7);
    this.burst(p.x, 1.4, p.z, c.color, 40, 6);
    this.shards.burst(p.x, 1.6, p.z, c.color, 30, 4);
    this.shockwave(p.x, p.z, c.color, 5, 0.7);
    this.floatText(`+${c.amount}`, p.x, 3, p.z, '#ffe066', 2.2);
    this.sound.win();
    this.sound.coin();
    this.save.coins += c.amount;
    this.result.chest = c.amount;
    this.result.total += c.amount;
    this.mission('chests', 1);
    writeSave(this.save);
    // what came out of the chest, on screen until it's collected (or a few seconds pass)
    this.setScreen(`<div class="hs-chestui">
      <div class="hs-ribbon ${['', 'rare', 'epic'][c.tier]}">YOU GOT</div>
      <div class="hs-loot hs-out" role="status" style="--c:${c.color}"><span class="hs-coin"></span><b>+${fmt(c.amount)}</b><small>COINS</small></div>
      <button class="hs-btn green hs-play hs-out" data-act="collect">COLLECT</button>
    </div>`, false);
    setTimeout(() => this.collectChest(), 3500);
  }

  collectChest() { if (this.state === 'won' && this.ui.screen.querySelector('.hs-loot')) this.showResult(); }

  updateChest(dt) {
    const c = this.chest;
    if (!c || !c.g.parent) return;
    c.t += dt;
    const p = c.g.position;
    if (!c.opened) {
      // drops in with a bounce, then wobbles impatiently
      const k = Math.min(1, c.t / 0.55);
      p.y = k < 1 ? 6 * (1 - k * k) : 0;
      c.mesh.rotation.z = c.t > 0.6 ? Math.sin(c.t * 14) * 0.06 * (Math.sin(c.t * 2) > 0.3 ? 1 : 0) : 0;
      if (k >= 1 && !c.landed) { c.landed = true; this.burst(p.x, 0.2, p.z, '#c9a46a', 12, 3); this.sound.thud(); }
    } else {
      c.mesh.rotation.z = 0;
      c.mesh.scale.setScalar(1 + Math.max(0, 0.25 - c.t) * 1.2);
      if (Math.random() < dt * 20) this.burst(p.x + (Math.random() - 0.5), 1.5, p.z, Math.random() < 0.5 ? '#ffcf3a' : c.color, 2, 3);
    }
    c.ring.material.opacity = 0.5 + Math.sin(this.clock * 6) * 0.3;
    c.ring.scale.setScalar(1 + Math.sin(this.clock * 3) * 0.08);
  }

  // ───────────── daily missions ─────────────
  refreshMissions() {
    const day = dayKey();
    const m = this.save.missions;
    if (!m || m.day !== day || !m.list || !m.list.length) this.save.missions = { day, list: dailyMissions(day) };
  }

  mission(id, n) {
    this.refreshMissions();
    for (const m of this.save.missions.list) {
      if (m.id !== id || m.claimed) continue;
      const was = m.prog >= m.goal;
      m.prog = isBest(id) ? Math.max(m.prog, n) : m.prog + n;
      if (!was && m.prog >= m.goal) { this.toast(`Mission complete: ${missionText(m)}`); this.sound.coin(); }
    }
  }

  toast(text) {
    const t = this.ui.toast;
    t.textContent = `✔ ${text}`;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ───────────── super powers ─────────────
  powerReady(id) { return this.state === 'play' && !this.paused && this.st.pw[id] <= 0; }

  usePower(id) {
    if (!this.powerReady(id) || !this.inUse.some((p) => p.id === id) || (id === 'hero' && this.mods.has('nohero'))) return false; // no hero on a No Heroes day
    const def = POWERS.find((q) => q.id === id);
    this.st.pw[id] = def.cd * (1 - upgradeValue(this.save, 'cool') / 100) * (this.save.pet === 'fox' ? 0.75 : 1);
    this.mission('powers', 1);
    if (this.pet && this.pet.def.id === 'fox') this.pet.view.anim.once('attack');
    this.sound.init();
    const cx = this.cannon.group.position.x;
    if (id === 'meteor') {
      // five meteors fall on the thickest part of the horde
      const c = this.hordeCenter() || { x: 0, z: -this.level.L * 0.5 };
      for (let k = 0; k < 5; k++) {
        const tx = clamp(c.x + (Math.random() - 0.5) * 6, -HALF + 1, HALF - 1); const tz = c.z + (Math.random() - 0.5) * 7;
        this.shots.fire('meteor', this._va.set(tx + 14, 34, tz - 20), this._vb.set(tx, 0.4, tz), 0.8 + k * 0.18, 0,
          (q) => this.blast(q.x, q.z, 3.6, '#ff7a2a', 0.06),
          (pos) => { if (Math.random() < 0.6) this.smoke.puff(pos.x, pos.y, pos.z, Math.random() < 0.5 ? '#ff9a3a' : '#ffd23f', 1.6, 0.3, 0.45, true); });
      }
      this.sound.roar();
    } else if (id === 'rally') {
      this.rally();
    } else if (id === 'legion') {
      for (let k = 0; k < 3; k++) this.st.later.push({ t: k * 0.6, fn: () => this.rally() });
    } else if (id === 'aegis') {
      this.st.fx.aegis = this.st.fxMax.aegis = 6;
      this.shockwave(cx, CANNON_Z + 1, '#58c8ff', 6, 0.6);
      this.sound.power('freeze');
    } else if (id === 'storm') {
      this.thunderStrike();
    } else this.morePowers(id, cx);
    this.impact(0.5);
    this.banner(def.name.toUpperCase(), '', 800);
    return true;
  }

  // a volley of extra units fanned out across the lane
  rally() {
    const cx = this.cannon.group.position.x;
    const n = Math.min(110, Math.round(28 + (this.mode === 'endless' ? this.st.wave * 4 : this.level.n * 1.6)));
    for (let k = 0; k < n && this.crowds.player.n < MAX_UNITS - 10; k++) this.spawnPlayer(cx + (Math.random() - 0.5) * 5, CANNON_Z - 1 - Math.random() * 4, true);
    this.shockwave(cx, CANNON_Z - 2, '#3fd86b', 5, 0.5);
    this.sound.champion();
    this.floatText(`+${n}`, cx, 3, CANNON_Z - 3, '#8affb2', 1.6);
  }

  // a meteor (or missile) from the sky that blasts where it lands
  skyHit(kind, x, z, delay, R, color, bigDmg = 0.05, quiet = true) {
    this.shots.fire(kind, this._va.set(x + 14, 34, z - 20), this._vb.set(x, 0.4, z), delay, 0,
      (q) => this.blast(q.x, q.z, R, color, bigDmg, quiet),
      (pos) => { if (Math.random() < 0.5) this.smoke.puff(pos.x, pos.y, pos.z, kind === 'meteor' ? '#ff9a3a' : '#d8d0c8', 1.2, 0.3, 0.45, kind === 'meteor'); });
  }

  // kills a share of the ground horde at random; returns how many fell
  cull(share, color) {
    const E = this.crowds.enemy;
    let n = 0;
    for (let j = E.n - 1; j >= 0; j--) {
      if (E.y[j] > 1.5 || Math.random() > share) continue;
      if (n < 80) this.burst(E.x[j], 0.4, E.z[j], color, 2, 4);
      E.kill(j);
      n++;
    }
    if (n) this.addKills(n);
    return n;
  }

  // the store powers (Meteor, Rally, Aegis and Thunder are in usePower)
  morePowers(id, cx) {
    const st = this.st; const E = this.crowds.enemy; const P = this.crowds.player;
    const L = this.level.L;
    const c = this.hordeCenter() || { x: 0, z: -L * 0.5 };
    const later = (t, fn) => st.later.push({ t, fn });
    const lane = (x) => clamp(x, -HALF + 1, HALF - 1);
    switch (id) {
      case 'blizzard': st.fx.freeze = st.fxMax.freeze = 7; this.shockwave(cx, 0, '#9fe4ff', 14, 0.9); this.sound.power('freeze'); break;
      case 'overdrive': st.fx.frenzy = st.fxMax.frenzy = 8; this.sound.power('frenzy'); break;
      case 'timewarp': st.fx.freeze = st.fxMax.freeze = 5; st.fx.frenzy = st.fxMax.frenzy = 5; this.slowmo(0.6, 0.3); this.sound.power('freeze'); break;
      case 'repair': {
        const add = Math.round(st.hpMax * 0.5);
        st.hp = Math.min(st.hpMax, st.hp + add);
        this.shockwave(cx, CANNON_Z, '#ff5f8a', 5, 0.6);
        this.burst(cx, 2, CANNON_Z + 1, '#ff9ab5', 30, 4);
        this.floatText(`+${add} ARMOR`, cx, 3, CANNON_Z, '#ff9ab5', 1.4);
        this.sound.power('frenzy');
        break;
      }
      case 'hero': st.meter = st.meterMax; this.launchChampion(); break;
      case 'gale':
        // the gust shoves the horde (and its bigs) back up the lane
        for (let j = 0; j < E.n; j++) E.z[j] = Math.max(-L + 1.5, E.z[j] - 14);
        this.bigs.forEach((b) => { b.z = Math.max(-L + 3, b.z - 6); });
        for (let k = 0; k < 12; k++) this.smoke.puff((Math.random() - 0.5) * LANE_W, 1, CANNON_Z - 6 - k * 4, '#e8f6ff', 2, 1.5, 0.8);
        this.shockwave(cx, CANNON_Z - 4, '#c8f0ff', 12, 0.8);
        this.sound.wave();
        break;
      case 'airstrike':
        for (let k = 0; k < 5; k++) this.skyHit('missile', -HALF + 1.2 + (k * (LANE_W - 2.4)) / 4, c.z, 0.5 + k * 0.08, 3, '#ff8a5a');
        this.sound.laser();
        break;
      case 'mines':
        for (let k = 0; k < 10; k++) later(0.2 + k * 0.4, () => { const x = lane(cx + (Math.random() - 0.5) * 9); const z = CANNON_Z - 5 - Math.random() * 12; this.burst(x, 0.5, z, '#ffe066', 8, 4); this.blast(x, z, 2.6, '#d0d6e0', 0.02, true); });
        break;
      case 'nuke':
        this.skyHit('meteor', c.x, c.z, 1, 8, '#ff3b6b', 0.25, false);
        this.sound.roar();
        break;
      case 'chain': {
        let b = 0;
        for (let k = 0; k < 14 && E.n; k++) {
          const j = (Math.random() * E.n) | 0;
          const x = E.x[j]; const z = E.z[j];
          later(k * 0.07, () => { if (b < this.bolts.length) this.bolt(this.bolts[b++], x, 0, z); this.blast(x, z, 1.8, '#b8a8ff', 0.03, true); });
        }
        this.sound.thunder();
        this.flashT = 0.25;
        break;
      }
      case 'smite':
        if (!this.bigs.length) { this.skyHit('meteor', c.x, c.z, 0.6, 4, '#fff3a0'); break; }
        this.bigs.forEach((q, k) => { q.hp -= q.max * 0.3; if (k < this.bolts.length) this.bolt(this.bolts[k], q.x, 2 * q.scale, q.z); this.burst(q.x, 2 * q.scale, q.z, '#fff3a0', 24, 5); });
        this.flashT = 0.35;
        this.sound.thunder();
        break;
      case 'carpet':
        for (let k = 0; k < 9; k++) later(0.3 + k * 0.14, () => { const z = CANNON_Z - 8 - k * ((L - 6) / 9); this.blast(lane((Math.random() - 0.5) * 7), z, 3, '#ffb35a', 0.04, true); });
        this.floatText('CARPET BOMB!', 0, 6, CANNON_Z - 8, '#ffb35a', 1.4);
        break;
      case 'laser': {
        let b = 0;
        for (let k = 0; k < 12; k++) later(k * 0.06, () => { const z = CANNON_Z - 6 - k * ((L - 4) / 12); if (b < this.bolts.length) this.bolt(this.bolts[b++], cx, 0, z); this.blast(cx, z, 2.3, '#ff4fd8', 0.04, true); });
        this.sound.laser();
        break;
      }
      case 'quake': {
        const n = this.cull(0.34, '#c09060');
        this.bigs.forEach((q) => { q.hp -= q.max * 0.1; });
        for (let k = 0; k < 10; k++) this.smoke.puff((Math.random() - 0.5) * LANE_W, 0.5, -Math.random() * L, '#a08060', 2.5, 1, 1.2);
        this.shake = 1.6;
        this.sound.smash();
        if (n) this.floatText(`QUAKE ×${n}`, 0, 4, -L * 0.4, '#ffd9a0', 1.6);
        break;
      }
      case 'mirror': {
        const n = P.n;
        for (let j = 0; j < n && P.n < MAX_UNITS - 10; j++) this.spawnPlayer(P.x[j] + (Math.random() - 0.5) * 0.8, P.z[j] + 0.4);
        this.floatText(`+${n}`, cx, 3, CANNON_Z - 3, '#7fffd0', 1.6);
        this.sound.champion();
        break;
      }
      case 'firerain':
        for (let k = 0; k < 14; k++) this.skyHit('meteor', lane((Math.random() - 0.5) * LANE_W), -8 - Math.random() * (L - 14), 0.6 + k * 0.12, 3.2, '#ff5a2a');
        this.sound.roar();
        break;
      case 'vortex': {
        // everything within 10 m is dragged to one spot, which then implodes
        for (let j = 0; j < E.n; j++) {
          const dx = c.x - E.x[j]; const dz = c.z - E.z[j];
          if (dx * dx + dz * dz < 100) { E.x[j] += dx * 0.8; E.z[j] += dz * 0.8; }
        }
        this.shockwave(c.x, c.z, '#6a5aff', 10, 0.8);
        later(0.7, () => this.blast(c.x, c.z, 4.5, '#6a5aff', 0.15));
        this.sound.wave();
        break;
      }
      case 'midas': {
        const n = this.cull(0.25, '#ffcf3a');
        const gold = Math.round(n * Math.max(1, this.level.coinValue / 2) * this.coinMul());
        this.save.coins += gold;
        st.laneCoins += gold;
        if (n) this.floatText(`+${gold} GOLD`, 0, 4, -L * 0.4, '#ffe066', 1.7);
        this.sound.coin();
        break;
      }
      case 'siege':
        for (let k = 0; k < 4; k++) {
          this.shots.fire('meteor', this._va.set(10, 40, -L - 10), this._vb.set((k - 1.5) * 2, 4, -L + 1), 0.8 + k * 0.15, 0, () => {
            if (this.state !== 'play') return;
            st.baseHp -= st.baseMax * 0.02;
            this.burst((k - 1.5) * 2, 5, -L + 1, '#ff7a5a', 30, 6);
            this.smoke.puff((k - 1.5) * 2, 5, -L, '#6a6060', 3, 1.5, 2);
            this.shake = Math.max(this.shake, 0.8);
            this.sound.explode();
            this.fortLabel(); this.fortDamage();
          });
        }
        break;
      default: break;
    }
  }

  // the thickest 4 m slice of the ground horde, as a point to aim at
  hordeCenter() {
    const E = this.crowds.enemy;
    if (!E.n) return null;
    const L = this.level.L;
    const bins = new Float32Array(Math.ceil((L + CANNON_Z) / 4) + 1); const bx = new Float32Array(bins.length);
    for (let j = 0; j < E.n; j++) {
      if (E.y[j] > 1.5) continue;
      const k = Math.floor((E.z[j] + L) / 4);
      if (k >= 0 && k < bins.length) { bins[k]++; bx[k] += E.x[j]; }
    }
    let best = 0;
    for (let k = 1; k < bins.length; k++) if (bins[k] > bins[best]) best = k;
    return bins[best] ? { x: bx[best] / bins[best], z: -L + best * 4 + 2 } : null;
  }

  // lightning hits every bat, archer and shaman (the units that are hardest to reach) and scorches bigs
  thunderStrike() {
    const E = this.crowds.enemy;
    let n = 0; let b = 0;
    for (let j = E.n - 1; j >= 0; j--) {
      const t = E.type[j];
      if (t !== ET.flyer && t !== ET.archer && t !== ET.healer) continue;
      if (b < this.bolts.length) this.bolt(this.bolts[b++], E.x[j], E.y[j], E.z[j]);
      this.burst(E.x[j], 0.5 + E.y[j], E.z[j], '#fff6a8', 3, 3);
      E.kill(j);
      n++;
    }
    this.bigs.forEach((q) => { q.hp -= q.max * 0.12; if (b < this.bolts.length) this.bolt(this.bolts[b++], q.x, 2 * q.scale, q.z); this.burst(q.x, 2 * q.scale, q.z, '#fff6a8', 12, 4); });
    // nothing special on the lane: strike the thickest part of the horde instead
    if (!n && !this.bigs.length) { const c = this.hordeCenter(); if (c) { this.bolt(this.bolts[b++], c.x, 0, c.z); this.blast(c.x, c.z, 3, '#fff6a8', 0); } }
    if (n) { this.addKills(n); this.floatText(`ZAP ×${n}`, 0, 4, -this.level.L * 0.4, '#fff6a8', 1.6); }
    this.flashT = 0.35;
    this.sound.thunder();
    this.sound.boom();
    this.shake = Math.max(this.shake, 0.8);
  }

  bolt(l, x, y, z) {
    const a = l.geometry.attributes.position.array;
    let px = x + (Math.random() - 0.5) * 6;
    for (let k = 0; k < 10; k++) {
      const f = k / 9;
      px = k === 9 ? x : px + (x - px) * 0.35 + (Math.random() - 0.5) * 1.6;
      a[k * 3] = px; a[k * 3 + 1] = 26 * (1 - f) + y * f; a[k * 3 + 2] = z + (Math.random() - 0.5) * 1.2 * (1 - f);
    }
    l.geometry.attributes.position.needsUpdate = true;
    l.userData.t = 0.3;
    l.visible = true;
    l.userData.pillar.position.set(x, 0, z);
    l.userData.pillar.visible = true;
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
      const gap = 1 / (upgradeValue(this.save, 'rate') * this.weaponDef().rate * (st.fx.frenzy > 0 ? 2.5 : 1) * (this.mods.has('glass') ? 1.5 : 1) * (1 + st.boost * 0.15));
      while (st.fireT >= gap) { st.fireT -= gap; this.fire(); }
      this.ui.hint.hidden = true;
    } else st.fireT = Math.min(st.fireT, 0);
    const fl = this.cannon.flash.material;
    fl.opacity = Math.max(0, fl.opacity - dt * 9);
    // the weapon's own special, and anything it queued up (strafing runs)
    const wd = this.weaponDef();
    if (wd.special && (st.wpnT -= dt) <= 0 && this.crowds.enemy.n > 8) { st.wpnT = wd.every; this.weaponSpecial(wd); }
    st.later = st.later.filter((q) => ((q.t -= dt) > 0 ? true : (q.fn(), false)));
    // power-up and combo timers
    st.fx.frenzy = Math.max(0, st.fx.frenzy - dt);
    st.fx.freeze = Math.max(0, st.fx.freeze - dt);
    st.fx.aegis = Math.max(0, st.fx.aegis - dt);
    POWERS.forEach((q) => { st.pw[q.id] = Math.max(0, st.pw[q.id] - dt); });
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) { st.combo = 0; st.tier = -1; } }
    // champion ring glow
    const ready = st.meter >= st.meterMax;
    this.cannon.ring.material.opacity = ready ? 0.6 + Math.sin(st.time * 8) * 0.3 : 0;
    // enemy waves and boss
    st.waveT -= dt;
    if (st.waveT <= 0) { st.waveT = lvl.waves.interval; this.spawnWave(); }
    if (lvl.boss && !st.bossSpawned && st.time >= lvl.boss.at) this.spawnBig(lvl.boss, 'boss');
    // a steady trickle between waves
    st.flowT = (st.flowT || 0) + dt * lvl.waves.flow * this.pressure * (1 + Math.min(1, st.time / 120) * 0.4 + Math.max(0, st.time - 100) / 40);
    while (st.flowT >= 1) { st.flowT -= 1; this.spawnEnemy((Math.random() - 0.5) * 5, -lvl.L + 1.4 + Math.random()); }
    if (lvl.brutes) {
      st.bruteT = (st.bruteT ?? lvl.brutes.first) - dt;
      if (st.bruteT <= 0) { st.bruteT = lvl.brutes.every; this.spawnBig({ hp: Math.round(lvl.brutes.hp * (1 + st.time / 120)), speed: 1.9, scale: 1.25, name: 'Brute', hit: lvl.brutes.hit }, 'brute'); }
    }
    // moving gates and hazards
    this.gates.forEach((g) => {
      if (g.move) g.x = g.x0 + Math.sin(st.time * g.speed + g.phase) * g.move;
      g.view.group.position.x = g.x;
      g.view.group.scale.setScalar(1 + (g.flash || 0) * 0.12);
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
    if (st.baseHp <= 0) { if (this.mode === 'endless') this.nextWave(); else this.win(); } else if (st.hp <= 0) this.lose();
  }

  updatePlayers(dt) {
    const P = this.crowds.player;
    const st = this.st;
    const L = this.level.L;
    const spd = UNIT_SPEED * dt;
    const grav = 22 * dt * (this.mods.has('lowgrav') ? 0.3 : 1);
    for (let i = 0; i < P.n; i++) {
      // launched units arc out of the cannon
      if (P.y[i] > 0 || P.vy[i] > 0) {
        P.vy[i] -= grav;
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
          this.shatterGate(g);
          this.sound.gateHit(true);
        } else if (g.op === '-') {
          g.left--;
          g.view.label.update(gateText(g));
          if (g.left <= 0) { g.used = true; this.shatterGate(g); }
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
      // power-up orbs (the unit runs on through)
      for (const p of this.pickups) if (!p.taken && Math.abs(x - p.x) < 1 && Math.abs(z - p.z) < 0.8) this.takePickup(p);
      for (const c of this.laneCoins) if (!c.taken && Math.abs(x - c.x) < 0.8 && Math.abs(z - c.z) < 0.6) this.takeCoin(c);
      // hazards
      if (this.hazardHit(x, z)) { this.burst(x, 0.3, z, this.skinColor(), 6, 3); this.splats.add(x, z, this.skinColor(), 0.7); this.sound.pop(); P.kill(i); i--; continue; }
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
    this.mission('crates', 1);
    c.view.group.visible = false;
    this.burst(c.x, 0.6, c.z, c.big ? '#8b4dff' : '#2fbf5a', 14, 4);
    if (c.big) this.shockwave(c.x, c.z, '#b48bff', 2.5, 0.4);
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
    this.shockwave(b.x, b.z, '#ffd400', b.w * 0.8, 0.5);
    this.sound.smash();
    this.shake = 0.5;
    this.impact(0.5);
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
    const L = this.level.L;
    const slow = st.fx.freeze > 0 ? 0.3 : 1;
    const spd = ENEMY_SPEED * dt * slow;
    const tx = this.cannon.group.position.x;
    let front = -Infinity;
    let healers = 0;
    let archers = 0;
    for (let i = 0; i < E.n; i++) {
      const type = E.type[i];
      // archers hold their spot and shoot (horde units never jump, so the bow timer lives in vy);
      // past ten, the rest keep marching so the lane never fills up with them
      if (type === ET.archer && E.z[i] >= E.aux[i] && archers++ < 10) {
        E.vy[i] -= dt * slow;
        if (E.vy[i] <= 0) { E.vy[i] = 1.4 + Math.random() * 1.2; this.archerShot(E.x[i], E.z[i]); }
      } else E.z[i] += spd * E.sp[i];
      // drift toward the cannon as they get closer
      const pull = clamp((E.z[i] + L) / L, 0, 1) * 0.6;
      E.vx[i] = damp(E.vx[i], (tx - E.x[i]) * pull, 2, dt) + (Math.random() - 0.5) * 0.4;
      E.x[i] = clamp(E.x[i] + E.vx[i] * dt, -HALF + 0.35, HALF - 0.35);
      const x = E.x[i]; const z = E.z[i];
      if (z > front) front = z;
      if (type === ET.flyer) {
        // bats cruise over everything, then dive at the cannon
        E.y[i] = damp(E.y[i], z > CANNON_Z - 12 ? 0.95 : 2.4, 2.5, dt);
      } else {
        if (type === ET.healer) healers++;
        // barriers: enemies swerve around the open side well before they reach one
        for (const b of this.barriers) {
          if (b.dead || z < b.z - 5 || z > b.z + 0.8 || Math.abs(x - b.x) > b.w / 2 + 0.45) continue;
          const side = b.x < 0 ? 1 : -1;
          E.vx[i] = side * 5;
          E.x[i] = clamp(x + side * 5 * dt, -HALF + 0.35, HALF - 0.35);
          if (z > b.z - 0.8) E.z[i] = b.z - 0.8;
        }
      }
      if (z >= CANNON_Z - 0.4 && st.fx.aegis > 0) {
        // the Aegis zaps whatever reaches the cannon
        this.burst(x, 0.8, z, '#9fe0ff', 6, 3);
        this.sound.clang();
        this.addKills(1);
        E.kill(i); i--;
        continue;
      }
      if (z >= CANNON_Z - 0.4) {
        st.hp -= ENEMY_TYPES[type].hit;
        st.hitUnits = (st.hitUnits || 0) + 1;
        this.burst(x, 0.6, z, '#ff3b4a', type === ET.bomber ? 22 : 8, 3);
        if (type === ET.bomber) { this.shockwave(x, z, '#ff8a2a', 3, 0.4); this.sound.boom(); this.impact(0.4); }
        this.sound.hurt();
        if (this.save.settings.vibrate && navigator.vibrate && performance.now() - (this.vibT || 0) > 250) { this.vibT = performance.now(); try { navigator.vibrate(25); } catch { /* blocked */ } }
        this.shake = Math.max(this.shake, 0.35);
        this.ui.vig.style.boxShadow = 'inset 0 0 8em 1em rgba(255,0,40,.45)';
        clearTimeout(this.vigT);
        this.vigT = setTimeout(() => { this.ui.vig.style.boxShadow = ''; }, 200);
        E.kill(i); i--;
      }
    }
    this.danger = front > CANNON_Z - 9;
    if (healers) this.healBigs(dt);
  }

  // player vs enemy: any pair closer than R_HIT at a similar height clash. The player unit always falls;
  // the enemy loses a hit point (shieldbearers take 3) and bombers blow up everything around them.
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
    let clangs = 0;
    for (let i = 0; i < P.n; i++) {
      if (P.y[i] > 2.6) continue;
      const ix = cx(P.x[i]); const iz = cz(P.z[i]);
      let found = -1; let best = R_SEEK * R_SEEK; let bx = 0;
      for (let dz = -1; dz <= 1 && found < 0; dz++) {
        const zz = iz + dz;
        if (zz < 0 || zz >= D) continue;
        for (let dx = -1; dx <= 1 && found < 0; dx++) {
          const xx = ix + dx;
          if (xx < 0 || xx >= W) continue;
          for (let j = head[zz * W + xx]; j >= 0; j = next[j]) {
            if (deadE[j] || Math.abs(E.y[j] - P.y[i]) > 0.8) continue;
            const ddx = E.x[j] - P.x[i]; const ddz = E.z[j] - P.z[i];
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < r2) { found = j; break; }
            if (d2 < best) { best = d2; bx = ddx; }
          }
        }
      }
      if (found >= 0) {
        killP.push(i);
        if (--E.hp[found] <= 0) deadE[found] = 1; else clangs++;
      } else if (bx) P.vx[i] = clamp(P.vx[i] + Math.sign(bx) * 14 * dt, -3, 3);
    }
    if (!killP.length) return;
    const pc = this.skinColor();
    // remove from the end so indices stay valid
    for (let k = killP.length - 1; k >= 0; k--) {
      const i = killP[k];
      this.burst(P.x[i], 0.3 + P.y[i], P.z[i], pc, 2, 2.2);
      if (k < 2) this.splats.add(P.x[i], P.z[i], pc, 0.5);
      P.kill(i);
    }
    let dead = 0;
    const booms = [];
    for (let j = E.n - 1; j >= 0; j--) {
      if (!deadE[j]) continue;
      const col = ENEMY_TYPES[E.type[j]].color || this.level.theme.enemy;
      this.burst(E.x[j], 0.3 + E.y[j], E.z[j], col, 3, 2.4);
      if (dead < 3) this.splats.add(E.x[j], E.z[j], col, 0.6);
      if (E.type[j] === ET.bomber) booms.push(E.x[j], E.z[j]);
      E.kill(j);
      dead++;
    }
    for (let k = 0; k < booms.length; k += 2) {
      const n = this.hitArea(booms[k], booms[k + 1], 1.9, '#ff8a2a');
      this.burst(booms[k], 0.5, booms[k + 1], '#ffd23f', 14, 5);
      this.shockwave(booms[k], booms[k + 1], '#ff8a2a', 2.6, 0.4);
      this.smoke.puff(booms[k], 1, booms[k + 1], '#444444', 2.2, 1.2, 1.6);
      this.sound.boom();
      if (n > 3) this.floatText(`-${n}`, booms[k], 2, booms[k + 1], '#ff8a8a', 1);
    }
    if (clangs) this.sound.clang();
    if (dead) this.addKills(dead);
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
      if (v.anim) v.anim.update(dt);
      if (c.def.id === 'roller') v.body.rotation.x -= dt * 10;
      else {
        v.legs.forEach((l, k) => { l.rotation.x = Math.sin(c.phase + k * Math.PI) * 0.6; });
        v.arms.forEach((a, k) => { a.rotation.x = Math.sin(c.phase + k * Math.PI + Math.PI) * 0.5; });
      }
      // flatten enemies in reach
      const R = c.def.radius + 0.4;
      for (let j = E.n - 1; j >= 0; j--) {
        if (Math.abs(E.z[j] - c.z) > R || Math.abs(E.x[j] - c.x) > R || E.y[j] > 1.5) continue;
        if ((E.x[j] - c.x) ** 2 + (E.z[j] - c.z) ** 2 > R * R) continue;
        this.burst(E.x[j], 0.4, E.z[j], this.level.theme.enemy, 4, 4);
        E.kill(j);
        c.hp -= 1 / Math.max(1, c.dmg * 0.5);
        this.addKills(1);
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
        if (v.anim) v.anim.once('attack');
        if (b.view.anim) b.view.anim.once('attack');
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
        this.impact(0.8);
        this.slowmo(0.2, 0.35);
        c.hp = 0;
      }
      // HP bar faces the camera
      v.bar.quaternion.copy(v.group.quaternion).invert().multiply(this.camera.quaternion);
      v.barFg.scale.x = Math.max(0.001, c.hp / c.max);
      v.barFg.position.x = -1.2 * (1 - c.hp / c.max);
      const shown = Math.max(0, Math.ceil(c.hp));
      if (shown !== c.shown) { c.shown = shown; v.label.update(String(shown)); }
      if (c.hp <= 0) {
        this.kill3d(v);
        this.burst(c.x, 1.5, c.z, this.skinColor(), 30, 5);
        if (c.def.split) for (let m = 0; m < c.def.split; m++) this.spawnClone(c.x, c.z);
        if (c.def.blast) this.blast(c.x, c.z, c.def.blast, '#ff8a2a');
        this.champs.splice(this.champs.indexOf(c), 1);
      }
    }
  }

  updateBigs(dt) {
    const P = this.crowds.player;
    const st = this.st;
    for (const b of [...this.bigs]) {
      b.anim += dt;
      const v = b.view;
      if (v.anim) { v.anim.mixer.timeScale = st.fx.freeze > 0 ? 0.35 : 1; v.anim.update(dt); }
      // burrowing boss: sinks, tunnels forward and bursts out under your crowd
      let under = false;
      if (b.burrow > 0) {
        b.burrow -= dt;
        const k = 1 - b.burrow / 1.4;
        const depth = 3.2 * b.scale;
        v.group.position.y = k < 0.3 ? -depth * (k / 0.3) : k < 0.7 ? -depth : -depth * (1 - (k - 0.7) / 0.3);
        under = k > 0.15 && k < 0.85;
        if (!b.tunneled && k >= 0.5) { b.tunneled = true; b.z = Math.min(b.z + 9, CANNON_Z - 10); }
        if (Math.random() < dt * 20) this.burst(b.x + (Math.random() - 0.5) * 3, 0.2, b.z, '#d6a866', 3, 3);
        if (b.burrow <= 0) {
          v.group.position.y = 0;
          this.hitArea(b.x, b.z + b.radius, 3.2, '#d6a866');
          this.shockwave(b.x, b.z, '#e8c27f', 6, 0.6);
          this.smoke.puff(b.x, 1, b.z, '#c9a46a', 6, 1.5, 2);
          this.sound.smash();
          this.shake = Math.max(this.shake, 0.9);
          this.impact(0.6);
        }
      }
      // walks toward the cannon unless a champion is holding it back
      if (!b.blocked && !under) b.z += b.speed * dt * (st.fx.freeze > 0 ? 0.4 : 1);
      b.blocked = false;
      b.x = damp(b.x, this.cannon.group.position.x * 0.5, 0.4, dt);
      v.group.position.x = b.x;
      v.group.position.z = b.z;
      v.legs.forEach((l, k) => { l.rotation.x = Math.sin(b.anim * 4 + k * Math.PI) * 0.4; });
      // units that run into it chip away at its health (unless a sugar shield soaks it up)
      const R = b.radius;
      if (!under) {
        for (let i = P.n - 1; i >= 0; i--) {
          if (Math.abs(P.z[i] - b.z) > R + 0.3 || Math.abs(P.x[i] - b.x) > R + 0.3) continue;
          if ((P.x[i] - b.x) ** 2 + (P.z[i] - b.z) ** 2 > (R + 0.3) ** 2) continue;
          if (!(b.shieldT > 0)) b.hp -= 1;
          this.burst(P.x[i], 1, P.z[i], b.shieldT > 0 ? '#ff8ad0' : this.skinColor(), 2, 2.5);
          P.kill(i);
        }
      }
      if (b.kind === 'boss') {
        // ground smash: wipes out the units in front of it
        b.smashT -= dt;
        const smashing = b.smashT < 0.5;
        v.arms.forEach((a) => { a.rotation.x = smashing ? -2.2 + (0.5 - Math.max(0, b.smashT)) * 4.4 : damp(a.rotation.x, -0.2, 4, dt); });
        if (smashing && !b.swung && v.anim) { b.swung = true; v.anim.once('attack'); }
        if (b.smashT <= 0) {
          b.smashT = b.enraged ? 1.2 : 1.6;
          b.swung = false;
          if (!under) {
            const sx = b.x; const sz = b.z + R * 1.2; const SR = 1.6 * b.scale;
            let n = 0;
            for (let i = P.n - 1; i >= 0; i--) if ((P.x[i] - sx) ** 2 + (P.z[i] - sz) ** 2 < SR * SR) { this.burst(P.x[i], 0.3, P.z[i], this.skinColor(), 1, 3); P.kill(i); n++; }
            this.burst(sx, 0.1, sz, '#a08a70', 18, 5);
            this.shockwave(sx, sz, '#ffffff', SR * 1.3, 0.45);
            if (n) this.splats.add(sx, sz, this.skinColor(), 1.5);
            this.impact(0.4);
            this.sound.smash();
            this.shake = Math.max(this.shake, 0.6);
            if (n > 4) this.floatText(`-${n}`, sx, 2, sz, '#ff8a8a', 1.2);
          }
        }
        this.bossBrain(b, dt);
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
        this.impact(0.8);
        if (st.fx.aegis > 0) {
          // the Aegis throws it back up the lane instead
          b.z -= 9; b.hp -= b.max * 0.1;
          this.shockwave(b.x, CANNON_Z - 1, '#58c8ff', 6, 0.5);
          this.burst(b.x, 2, b.z + 9, '#9fe0ff', 30, 6);
          this.floatText('REPELLED!', b.x, 4, CANNON_Z - 3, '#9fe0ff', 1.4);
          continue;
        }
        if (b.kind === 'boss') { st.hp = 0; continue; }
        st.hp -= b.hit;
        st.hitBigs = (st.hitBigs || 0) + b.hit;
        this.floatText(`-${b.hit}`, b.x, 3, b.z, '#ff6b6b', 1.4);
        this.burst(b.x, 1, b.z, '#ff3b4a', 30, 5);
        this.kill3d(v);
        this.bigs.splice(this.bigs.indexOf(b), 1);
        continue;
      }
      if (b.hp <= 0) {
        this.kill3d(v);
        this.bigs.splice(this.bigs.indexOf(b), 1);
        const big = b.kind === 'boss';
        if (big) [this.bubble, this.beam, this.beamMark].forEach((m) => { m.visible = false; });
        this.burst(b.x, 2, b.z, '#ffcf3a', big ? 60 : 24, big ? 7 : 5);
        this.burst(b.x, 2, b.z, '#ffffff', big ? 30 : 10, 6);
        this.smoke.puff(b.x, 1.5, b.z, '#5a5050', big ? 8 : 4, 1.8, 2.2);
        this.splats.add(b.x, b.z, '#3a2a2a', big ? 4 : 2.2);
        this.sound.explode();
        this.shake = big ? 1.4 : 0.6;
        this.shockwave(b.x, b.z, '#ffcf3a', big ? 9 : 5, big ? 0.9 : 0.6);
        this.impact(big ? 1 : 0.5);
        this.slowmo(big ? 0.9 : 0.15, big ? 0.25 : 0.3);
        this.addKills(10);
        if (big) {
          this.floatText('BOSS DOWN!', b.x, 4, b.z, '#ffd23f', 2);
          this.save.stats.bosses++;
          this.mission('boss', 1);
          // its fall shakes the fortress
          st.baseHp -= Math.round(st.baseMax * 0.2);
          this.fortLabel();
          this.fortDamage();
        } else this.floatText('BRUTE DOWN', b.x, 3, b.z, '#ffd23f', 1.2);
      }
    }
  }

  // world bosses: an enraged phase below half health and a rotation of special attacks
  bossBrain(b, dt) {
    if (!b.attacks || !b.attacks.length) return;
    if (!b.enraged && b.hp < b.max * 0.5) {
      b.enraged = true;
      b.speed *= 1.3;
      this.banner(b.name.toUpperCase(), 'ENRAGED!', 1400);
      this.sound.roar();
      this.impact(0.7);
      this.shake = Math.max(this.shake, 0.8);
      const seen = new Set();
      b.view.body.traverse((m) => { if (m.material && m.material.emissive && !seen.has(m.material)) { seen.add(m.material); m.material.emissive.set('#ff2a2a'); m.material.emissiveIntensity = 0.35; } });
    }
    if (b.shieldT > 0) {
      b.shieldT -= dt;
      this.bubble.visible = b.shieldT > 0;
      this.bubble.position.set(b.x, 1.4 * b.scale, b.z);
      this.bubble.scale.setScalar(1.6 * b.scale * (1 + Math.sin(this.clock * 10) * 0.03));
    }
    if (b.laser) this.updateLaser(b, dt);
    b.atkT = (b.atkT ?? 4) - dt;
    if (b.atkT > 0 || b.burrow > 0 || b.laser) return;
    b.atkT = b.enraged ? 3.6 : 5.5;
    b.atkI = (b.atkI || 0) + 1;
    const a = b.attacks[b.atkI % b.attacks.length];
    if (b.view.anim) b.view.anim.once('attack');
    if (a === 'burrow' && b.z > CANNON_Z - 22) return; // too close to tunnel
    this.floatText(ATTACK_NAMES[a], b.x, 2.4 * b.scale, b.z, '#ffb3b3', 1.3);
    if (a === 'summon') {
      const n = b.enraged ? 12 : 8;
      for (let k = 0; k < n; k++) this.spawnEnemy(b.x + (Math.random() - 0.5) * 5, b.z + 1 + Math.random() * 2, 1, ET[b.minion] ?? 0);
      this.smoke.puff(b.x, 1, b.z + 1.5, '#5a4a6a', 5, 1.4, 1.8);
      this.sound.roar();
    } else if (a === 'shards') {
      const P = this.crowds.player;
      const n = b.enraged ? 9 : 6;
      for (let k = 0; k < n; k++) {
        let tx = (Math.random() - 0.5) * (LANE_W - 2); let tz = b.z + 6 + Math.random() * 18;
        if (P.n) { const i = (Math.random() * P.n) | 0; tx = P.x[i]; tz = P.z[i] - 2; }
        this.shots.fire('shard', this._va.set(b.x, 2.4 * b.scale, b.z), this._vb.set(tx, 0.1, Math.min(tz, CANNON_Z - 2)), 0.7 + k * 0.06, 6, (q) => {
          this.hitArea(q.x, q.z, 1.3, '#bfeaff');
          this.shockwave(q.x, q.z, '#bfeaff', 2, 0.35);
          this.sound.clang();
        });
      }
      this.sound.power('freeze');
    } else if (a === 'burrow') {
      b.burrow = 1.4;
      b.tunneled = false;
      this.sound.smash();
    } else if (a === 'bubble') {
      b.shieldT = 3.5;
      this.sound.power('freeze');
    } else if (a === 'laser') {
      b.laser = { t: 0 };
      this.sound.laser();
    }
  }

  // the neon beam: a flashing warning line, then a wall of light sweeps toward the cannon
  updateLaser(b, dt) {
    const l = b.laser;
    l.t += dt;
    const z0 = b.z + 3;
    if (l.t < 0.8) {
      this.beamMark.visible = true;
      this.beamMark.position.set(0, 0.06, z0);
      this.beamMark.material.opacity = Math.sin(l.t * 30) > 0 ? 0.9 : 0.2;
      return;
    }
    this.beamMark.visible = false;
    const k = (l.t - 0.8) / 1.1;
    if (k >= 1) { this.beam.visible = false; b.laser = null; return; }
    const bz = z0 + k * 20;
    this.beam.visible = true;
    this.beam.position.set(0, 0.6, bz);
    this.beam.scale.y = 1 + Math.sin(l.t * 40) * 0.15;
    const P = this.crowds.player;
    for (let i = P.n - 1; i >= 0; i--) if (P.y[i] < 1.2 && Math.abs(P.z[i] - bz) < 0.6) { this.burst(P.x[i], 0.4, P.z[i], '#ff3bd0', 1, 2); P.kill(i); }
    if (Math.random() < dt * 30) this.burst((Math.random() - 0.5) * LANE_W, 0.3, bz, '#ff7fe0', 2, 3);
  }

  // endless: the wave shield broke, so the next (stronger) wave begins and the lane resets
  nextWave() {
    const st = this.st;
    const w = st.wave + 1;
    const W = endlessWave(w, this.level.themeIndex);
    Object.assign(this.level, { waves: W.waves, brutes: W.brutes, mix: W.mix, boss: W.boss, bossLevel: W.bossLevel });
    const reward = Math.round(waveReward(st.wave) * this.coinMul());
    this.save.coins += Math.round(reward * (1 + upgradeValue(this.save, 'coins') / 100));
    if (W.boss && W.boss.model) load(W.boss.model);
    this.laneCoins.forEach((c) => { c.taken = false; c.t = 0; });
    st.wave = w;
    st.baseHp = st.baseMax = W.baseHp;
    st.waveT = 2; st.waveN = W.waves.count; st.bossSpawned = false; st.time = 0; st.bruteT = undefined; st.fightBack = 0;
    st.hp = Math.min(st.hpMax, st.hp + Math.round(st.hpMax * 0.3));
    this.gates.forEach((g) => {
      if (g.id >= 9000) return;
      g.used = false; g.left = g.v;
      g.view.panel.visible = true; g.view.labelMesh.visible = true;
      g.view.label.update(gateText(g));
    });
    this.crates.forEach((c) => { if (c.dead) { c.dead = false; c.hp = c.big ? Math.round(6 + w) : 1; c.view.group.visible = true; } });
    this.barriers.forEach((b) => { if (b.dead) { b.dead = false; b.hp = Math.round(40 + w * 30); b.view.group.visible = true; b.dirty = true; } });
    this.pickups.forEach((p) => { p.taken = false; p.view.group.visible = true; });
    this.fortShown = -1;
    this.fortLabel();
    this.shockwave(0, -this.level.L + 2, '#7fd0ff', 12, 0.9);
    this.burst(0, 6, -this.level.L, '#7fd0ff', 40, 7);
    this.sound.wave();
    this.impact(0.6);
    this.banner(`WAVE ${w}`, W.boss ? `${W.boss.name} approaches!` : `Wave cleared · +${reward} coins`, 1600);
  }

  // ───────────── end of level ─────────────
  win() {
    if (this.state !== 'play') return;
    this.state = 'won';
    this.fortLabel();
    this.burst(0, 4, -this.level.L, '#ffd23f', 80, 9);
    this.burst(0, 4, -this.level.L, '#ff6b6b', 40, 8);
    this.fort.group.children.forEach((c) => { c.userData.fall = Math.random(); });
    // the horde scatters and any brute or boss still standing falls with the fortress
    const E = this.crowds.enemy;
    for (let j = 0; j < E.n; j += 3) this.burst(E.x[j], 0.4, E.z[j], this.level.theme.enemy, 1, 2.5);
    E.clear();
    this.bigs.forEach((b) => this.kill3d(b.view));
    this.bigs = [];
    this.sound.explode();
    this.shake = 1.5;
    this.shockwave(0, -this.level.L + 2, '#ffd23f', 12, 1.1);
    this.impact(1);
    this.slowmo(0.8, 0.3);
    this.cinematic([7, 11, -this.level.L + 26], [0, 3, -this.level.L], 1.6, true);
    setTimeout(() => this.sound.win(), 500);
    const st = this.st;
    const stars = st.hp >= st.hpMax * 0.7 ? 3 : st.hp >= st.hpMax * 0.35 ? 2 : 1;
    const loot = 1 + upgradeValue(this.save, 'coins') / 100;
    const base = 60 + this.level.n * 15 + (this.level.bossLevel ? 150 : 0);
    const kills = Math.round(st.kills * 0.25);
    const survivors = Math.round(this.crowds.player.n * 0.3);
    const combo = Math.round(st.bestCombo * 0.1);
    const total = Math.round((base + kills + survivors + combo) * loot * (1 + (stars - 1) * 0.25) * this.coinMul());
    const s = this.save;
    this.result = { win: true, stars, base, kills, survivors, combo, bestCombo: st.bestCombo, newBest: st.bestCombo > s.stats.bestCombo, total };
    s.stats.bestCombo = Math.max(s.stats.bestCombo, st.bestCombo);
    s.stats.wins++;
    this.mission('wins', 1);
    if (this.mode === 'daily') {
      // the daily challenge pays a bonus the first time it is beaten each day, and remembers the best time
      const today = dayKey();
      const ch = s.challenge && s.challenge.day === today ? s.challenge : { day: today, done: false, best: 0 };
      const bonus = ch.done ? 0 : 800;
      const best = ch.best ? Math.min(ch.best, st.time) : st.time;
      s.challenge = { day: today, done: true, best };
      Object.assign(this.result, { daily: true, time: st.time, best, newTime: st.time <= best, bonus, total: total + bonus });
      s.coins += total + bonus;
    } else {
      s.coins += total;
      if (s.fails) delete s.fails[this.level.n];
      s.stars[this.level.n] = Math.max(s.stars[this.level.n] || 0, stars);
      if (this.level.n === s.level && this.level.bossLevel) this.result.gift = giftPower(s); // powers are rare prizes: first boss clears only
      s.level = Math.max(s.level, this.level.n + 1);
      s.best = Math.max(s.best, this.level.n);
    }
    writeSave(s);
    setTimeout(() => this.showChest(), 1500);
  }

  lose() {
    if (this.state !== 'play') return;
    this.state = 'lost';
    this.sound.lose();
    this.shake = 1;
    const cx = this.cannon.group.position.x;
    this.cinematic([cx + 5, 7, CANNON_Z + 9], [cx, 1, CANNON_Z - 3], 1.2, true);
    const total = Math.round((20 + this.st.kills * 0.3) * (1 + upgradeValue(this.save, 'coins') / 100));
    this.result = { win: false, total, progress: 1 - this.st.baseHp / this.st.baseMax };
    if (this.mode === 'endless') {
      const e = { best: 0, runs: 0, ...(this.save.endless || {}) };
      const wave = this.st.wave;
      Object.assign(this.result, { endless: true, wave, newBest: wave > e.best, best: Math.max(e.best, wave) });
      this.save.endless = { best: Math.max(e.best, wave), runs: e.runs + 1 };
    }
    this.save.coins += total;
    this.save.stats.losses++;
    if (this.mode === 'campaign') this.save.fails = { ...(this.save.fails || {}), [this.level.n]: ((this.save.fails || {})[this.level.n] || 0) + 1 };
    this.save.stats.bestCombo = Math.max(this.save.stats.bestCombo, this.st.bestCombo);
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
    if (this.state === 'map') { this.map.draw(this.renderer); return; }
    if (this.post) this.post.draw();
    else this.renderer.render(this.scene, this.camera);
  }

  tick(dt) {
    const real = dt;
    if (this.state === 'map') { this.map.update(real); return; }
    if (this.slowT > 0) { this.slowT -= real; dt *= this.slowK; }
    if (this.mods.has('rush') && this.state === 'play') dt *= 1.25;
    this.clock = (this.clock || 0) + dt;
    if (this.scenery) this.scenery.update(dt, this.clock);
    if (this.weather) {
      // lightning lights up the whole scene for a moment
      const fl = this.weather.update(dt, this.clock);
      this.flashT = Math.max(0, (this.flashT || 0) - real);
      this.hemi.intensity = this.hemiBase + fl * 2.2 + this.flashT * 8;
      if (fl > 0.95 && !(this.lastFl > 0.95)) this.sound.thunder();
      this.lastFl = fl;
    }
    if (this.fort) {
      const t = this.clock;
      this.fort.flags.forEach((f, i) => { if (f.userData.banner) f.rotation.x = Math.sin(t * 1.7 + i) * 0.06; else f.rotation.y = Math.sin(t * 3 + i) * 0.3; });
      this.fort.torches.forEach((f, i) => { const k = 0.85 + Math.sin(t * 17 + i * 3) * 0.1 + Math.sin(t * 29 + i) * 0.06; f.scale.set(k, k * 1.1, k); });
    }
    if (this.gates) this.gates.forEach((q) => { q.view.panelMat.uniforms.time.value = this.clock + q.id * 0.37; });
    this.updateCoins(dt);
    this.updateChest(real);
    if (this.cannon) this.updatePet(this.paused ? 0 : dt, this.state === 'play' && !this.paused);
    if (this.cannon && !this.paused) {
      const w = this.cannon;
      if (w.air) {
        w.barrel.position.y = 3.4 + Math.sin(this.clock * 2) * 0.25;
        w.barrel.rotation.z = damp(w.barrel.rotation.z, clamp((this.cannonX - w.group.position.x) * 0.2, -0.45, 0.45), 6, dt); // bank into turns
      }
    }
    if (this.corpses.length && !this.paused) this.updateCorpses(dt);
    if (this.pickups) {
      const t = this.clock;
      this.pickups.forEach((p, k) => {
        const v = p.view;
        v.orb.rotation.set(t * 0.9, t * 1.6 + k, 0);
        v.orb.position.y = v.shell.position.y = 1.3 + Math.sin(t * 3 + k) * 0.15;
        v.shell.scale.setScalar(1 + Math.sin(t * 4 + k) * 0.08);
        const r = (t * 0.8 + k * 0.3) % 1;
        v.ring.scale.setScalar(1 + r * 0.5);
        v.ring.material.opacity = 0.6 * (1 - r);
      });
    }
    if (this.fort && this.state === 'play') {
      this.fortHit = Math.max(0, this.fortHit - dt);
      this.fort.group.position.x = this.fortBase + (Math.random() - 0.5) * this.fortHit * 0.25;
      this.fort.roofs.forEach((r) => { if (r.userData.tilt) r.rotation.z = damp(r.rotation.z, r.userData.tilt, 2, dt); });
      // a damaged fortress smokes, and burns once it is close to falling
      const st = this.st;
      if (st.fortStage > 0 && (st.smokeT -= dt) <= 0) {
        st.smokeT = 0.35 / st.fortStage;
        const x = (Math.random() - 0.5) * 14; const fz = -this.level.L - 1.5;
        this.smoke.puff(x, 7 + Math.random() * 3, fz, '#4a4444', 3 + Math.random() * 2, 2.2, 3);
        if (st.fortStage > 1) this.smoke.puff(x * 0.8, 6.5, fz + 1, '#ff7a2a', 1.6, 2.5, 0.8, true);
      }
    }
    // a frozen horde turns icy and the grade cools with it
    const cold = this.state === 'play' && this.st.fx.freeze > 0 ? 1 : 0;
    this.coldV = damp(this.coldV || 0, cold, 6, real);
    if (this.enemyColor) this.crowds.enemy.bodyMat.color.copy(this.enemyColor).lerp(ICE, this.coldV * 0.75);
    this.hit = Math.max(0, (this.hit || 0) - real * 3);
    if (this.post) this.post.setFx(this.hit, this.coldV);
    if (this.state === 'play' && !this.paused) this.update(dt);
    else if (this.state === 'won') {
      // the fortress crumbles
      this.fort.group.children.forEach((c) => { if (c.userData.fall !== undefined) { c.position.y -= dt * (3 + c.userData.fall * 6); c.rotation.z += dt * (c.userData.fall - 0.5); } });
    } else if (this.state === 'home') {
      // idle: the enemy horde marches in the distance
      this.idleT = (this.idleT || 0) - dt;
      const E = this.crowds.enemy;
      if (this.idleT <= 0 && E.n < 120) { this.idleT = 0.15; this.spawnEnemy((Math.random() - 0.5) * 4, -this.level.L + 2); }
      for (let i = 0; i < E.n; i++) { E.z[i] += ENEMY_SPEED * 0.6 * dt; if (E.z[i] > -this.level.L * 0.45) { E.kill(i); i--; } }
    }
    this.crowds.player.sync(this.paused ? 0 : dt);
    this.crowds.enemy.sync(this.paused ? 0 : dt);
    if (!this.paused) { this.fxUpdate(dt); this.updateShockwaves(dt); }
    this.bolts.forEach((l) => {
      if (!l.visible) return;
      l.userData.t -= real;
      const pl = l.userData.pillar;
      pl.material.opacity = (Math.random() < 0.3 ? 0.25 : 0.7) * Math.min(1, l.userData.t * 5);
      pl.scale.set(1 + Math.random() * 0.4, 1, 1 + Math.random() * 0.4);
      if (l.userData.t <= 0) l.visible = pl.visible = false;
    });
    const aegis = this.state === 'play' && this.st.fx.aegis > 0;
    this.dome.visible = aegis;
    if (aegis) {
      this.dome.position.set(this.cannon.group.position.x, 0, CANNON_Z + 1.2);
      this.dome.scale.setScalar(1 + Math.sin(this.clock * 8) * 0.03);
      this.dome.material.opacity = this.st.fx.aegis < 1.5 && Math.sin(this.clock * 20) > 0 ? 0.12 : 0.3;
    }
    this.updateFloats(dt);
    this.placeCamera(real);
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
        <div class="hs-powers"></div>
        <div class="hs-boss" hidden><b class="hs-out">BOSS</b><div class="hs-track"><i class="trail"></i><i class="fill"></i></div></div>
        <div class="hs-fx">${Object.entries(FX_CHIPS).map(([k, d]) => `<div class="chip" data-fx="${k}" style="--c:${d.color}" hidden>${ICON[d.icon]}<span class="hs-out">${d.name}</span><i></i></div>`).join('')}</div>
        <div class="hs-combo hs-out" hidden><b>0</b><small>COMBO</small><i></i></div>
        <div class="hs-danger"></div>
      </div>
      <div class="hs-banner hs-out"></div>
      <div class="hs-toast hs-out" role="status"></div>
      <div class="hs-screen"></div>`);
    const q = (s) => this.root.querySelector(s);
    this.ui = {
      hud: q('.hs-hud'), lvl: q('.hs-lvl b'), lvlS: q('.hs-lvl small'),
      base: q('.hs-meter.base .fill'), baseTrail: q('.hs-meter.base .trail'), baseTxt: q('.hs-meter.base b'),
      hp: q('.hs-meter.hp .fill'), hpTrail: q('.hs-meter.hp .trail'), hpTxt: q('.hs-meter.hp b'),
      coins: q('.hs-coins'), coinsV: q('.hs-coins .v'), pn: q('.hs-count .pn'), en: q('.hs-count .en'), me: q('.hs-count .me'), foe: q('.hs-count .foe'),
      hint: q('.hs-hint'), champ: q('.hs-champ'), champTxt: q('.hs-champ span'),
      banner: q('.hs-banner'), screen: q('.hs-screen'), vig: q('.hs-vig'), toast: q('.hs-toast'),
      boss: q('.hs-boss'), bossName: q('.hs-boss b'), bossFill: q('.hs-boss .fill'), bossTrail: q('.hs-boss .trail'),
      fx: Object.fromEntries(Object.keys(FX_CHIPS).map((k) => [k, q(`[data-fx="${k}"]`)])),
      powers: q('.hs-powers'), pow: {},
      combo: q('.hs-combo'), comboN: q('.hs-combo b'), comboBar: q('.hs-combo i'),
    };
    this.cache = {};
  }

  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'width') el.style.width = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'danger' || prop === 'ready') el.toggle(prop, val);
    else if (prop === 'pwcd') el.setProperty('--cd', val);
    else el[prop] = val;
  }

  updateHud(force = false) {
    const st = this.st;
    if (!st) return;
    if (force) this.cache = {};
    this.set('lvlS', this.ui.lvlS, this.mode === 'endless' ? 'WAVE' : this.mode === 'daily' ? 'DAILY' : 'LEVEL');
    this.set('lvl', this.ui.lvl, String(this.mode === 'endless' ? st.wave : this.mode === 'daily' ? new Date().getDate() : this.level.n));
    this.set('nohero', this.ui.champ, this.mods.has('nohero'), 'hidden');
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
    // power-up chips with a draining timer
    // super power buttons: a cooldown sweep that empties as the power recharges
    this.inUse.forEach((p) => {
      const left = Math.ceil((st.pw[p.id] / p.cd) * 40) / 40;
      this.set(`pw-${p.id}`, this.ui.pow[p.id].style, left > 0 ? `${left * 100}%` : '0%', 'pwcd');
      this.set(`pwr-${p.id}`, this.ui.pow[p.id].classList, left <= 0, 'ready');
    });
    for (const k of Object.keys(FX_CHIPS)) {
      const on = st.fx[k] > 0;
      this.set(`fx-${k}`, this.ui.fx[k], !on, 'hidden');
      if (on) this.ui.fx[k].style.setProperty('--t', `${(st.fx[k] / st.fxMax[k]) * 100}%`);
    }
    // combo counter: shows from 10 kills, colour climbs with the tier
    const showCombo = st.combo >= 10;
    this.set('comboOn', this.ui.combo, !showCombo, 'hidden');
    if (showCombo) {
      this.set('comboN', this.ui.comboN, `×${fmt(st.combo)}`);
      this.set('comboTier', this.ui.combo.dataset, String(Math.max(0, st.tier)), 'tier');
      this.ui.comboBar.style.width = `${(st.comboT / COMBO_GAP) * 100}%`;
    }
    // boss health across the top
    const boss = this.bigs.find((b) => b.kind === 'boss');
    this.set('bossOn', this.ui.boss, !boss, 'hidden');
    if (boss) {
      this.set('bossName', this.ui.bossName, boss.name.toUpperCase());
      const bw2 = `${clamp(boss.hp / boss.max, 0, 1) * 100}%`;
      this.set('bossW', this.ui.bossFill, bw2, 'width');
      this.set('bossTr', this.ui.bossTrail, bw2, 'width');
    }
    this.set('danger', this.root.classList, this.danger, 'danger');
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
    const today = dayKey();
    const giftReady = s.daily.day !== new Date().toDateString();
    const canUpgrade = UPGRADES.some((u) => (s.up[u.id] || 0) < u.max && s.coins >= u.cost(s.up[u.id] || 0));
    const stars = Object.values(s.stars).reduce((a, b) => a + b, 0);
    const ch = dailyChallenge();
    const chDone = s.challenge && s.challenge.day === today && s.challenge.done;
    const first = Math.floor((s.level - 1) / 25) * 25 + 1;
    const lock = (lvl) => (s.level < lvl ? ` disabled data-lock="Unlocks at level ${lvl}"` : '');
    this.setScreen(`
      <div class="hs-topbar"><div class="hs-coins hs-out"><span class="hs-star">★</span><span>${stars}</span></div>${this.coinsPill()}</div>
      <div class="hs-logo"><span class="a">HORDE</span><span class="b">SURGE</span></div>
      <div class="hs-where hs-out">${this.level.theme.name} · Level ${n} · ${this.level.twist.name}${this.level.bossLevel ? ` · <span class="boss">${this.level.boss.name}</span>` : ''}</div>
      <button class="hs-btn green hs-play hs-out" data-act="play">${ICON.play} PLAY</button>
      <div class="hs-modes">
        <button class="hs-mode map" data-act="map">${ICON.map}<b>World Map</b><small>Chapter ${Math.floor((s.level - 1) / 25) + 1} · ${s.level - first + 1}/25</small></button>
        <button class="hs-mode endless" data-act="endless"${lock(6)}>${ICON.infinity}<b>Endless</b><small>${s.level < 6 ? 'Unlocks at level 6' : `Best: wave ${(s.endless && s.endless.best) || 0}`}</small></button>
        <button class="hs-mode daily${chDone ? ' done' : ''}" data-act="challenge"${lock(4)}>${ICON.calendar}<b>Daily Challenge</b><small>${s.level < 4 ? 'Unlocks at level 4' : chDone ? 'Cleared today ✓' : ch.mods.map((m) => MODS[m].name).join(' + ')}</small></button>
      </div>
      <div class="hs-nav">
        <button class="hs-tile up" data-act="upgrades">${ICON.up}Upgrades${canUpgrade ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile skin" data-act="skins">${ICON.palette}Skins</button>
        <button class="hs-tile champ" data-act="champs">${ICON.shield}Heroes</button>
        <button class="hs-tile gift" data-act="daily">${ICON.gift}Gift${giftReady ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile pow" data-act="powers">${ICON.bolt}Powers${POWERS.some((p) => !s.powers.includes(p.id) && s.coins >= p.cost) ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile arms" data-act="arsenal">${ICON.tank}Arsenal${WEAPONS.some((w) => !this.save.weapons.includes(w.id) && this.save.level >= w.from && this.save.coins >= w.cost) ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile pet" data-act="pets">${ICON.paw}Pets</button>
        <button class="hs-tile quest" data-act="missions">${ICON.scroll}Missions${this.save.missions.list.some((m) => m.prog >= m.goal && !m.claimed) ? '<span class="dot"></span>' : ''}</button>
        <button class="hs-tile gear" data-act="settings">${ICON.gear}Settings</button>
      </div>`, false);
  }

  // ───────────── world map ─────────────
  // n: the level to open the map on (its chapter is shown); older chapters are a tap away
  showMap(n = this.save.level) {
    this.state = 'map';
    this.paused = false;
    this.ui.hud.hidden = true;
    if (!this.map) this.map = new WorldMap();
    this.map.open(this.save, this.skinColor(), Math.floor((n - 1) / 25));
    this.map.resize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
    const ch = this.map.chapter; const last = Math.floor((this.save.level - 1) / 25);
    this.setScreen(`
      <div class="hs-maptop"><button class="hs-round" data-act="back" aria-label="Back">${ICON.home}</button><div class="hs-chapters"><button class="hs-round" data-act="chapter" data-arg="-1" aria-label="Previous chapter" ${ch ? '' : 'disabled'}>‹</button><div class="hs-where hs-out">Chapter ${ch + 1}</div><button class="hs-round" data-act="chapter" data-arg="1" aria-label="Next chapter" ${ch < last ? '' : 'disabled'}>›</button></div>${this.coinsPill()}</div>
      <p class="hs-maphint hs-out">Drag to explore · tap a level</p>
      <div class="hs-mapcard"></div>`, false);
    this.ui.screen.classList.add('map');
    this.selectLevel(n);
  }

  selectLevel(n) {
    const card = this.ui.screen.querySelector('.hs-mapcard');
    if (!card) return;
    if (n > this.save.level) {
      card.innerHTML = `<div class="hs-panel hs-out lvlcard locked"><h2>Level ${n}</h2><p class="hs-tip">Locked. Beat level ${this.save.level} to move on.</p></div>`;
      return;
    }
    const lvl = makeLevel(n);
    this.mapLevel = n;
    const stars = this.save.stars[n] || 0;
    const foes = lvl.mix.map(([i]) => ENEMY_TYPES[i]).map((t) => `<span class="foe" title="${t.name}"><i style="background:${t.color || lvl.theme.enemy}"></i>${t.name}</span>`).join('');
    card.innerHTML = `<div class="hs-panel hs-out lvlcard">
      <h2>Level ${n}</h2>
      <div class="sub">${lvl.theme.name}${lvl.bossLevel ? ` · <span class="boss">${lvl.boss.name}</span>` : ''}</div>
      <div class="twist"><b>${lvl.twist.name}</b> · ${lvl.twist.desc}</div>
      <div class="hs-stars small">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">★</span>`).join('')}</div>
      ${lvl.intro ? `<div class="newfoe">NEW ENEMY: ${lvl.intro.name}</div>` : ''}
      <div class="foes">${foes}</div>
      <button class="hs-btn green hs-play" data-act="playlvl" data-arg="${n}">${ICON.play} ${n < this.save.level ? 'REPLAY' : 'PLAY'}</button>
    </div>`;
    this.map.focusOn(n);
  }

  showChallenge() {
    const s = this.save;
    const ch = dailyChallenge();
    const lvl = makeDaily(ch);
    const c = s.challenge && s.challenge.day === dayKey() ? s.challenge : null;
    const mods = ch.mods.map((m) => `<div class="hs-row"><span class="hs-modic">${ICON.bolt}</span><span class="t">${MODS[m].name}<small>${MODS[m].desc}</small></span></div>`).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div>
      <div class="hs-panel hs-out"><h2>Daily Challenge</h2>
        <p class="hs-tip" style="text-align:center;margin:0 auto .4em">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${lvl.theme.name}</p>
        ${mods}
        <div class="hs-row"><span class="t">Reward<small>${c && c.done ? `Cleared in ${c.best.toFixed(1)} s. Can you go faster?` : 'Bonus for the first clear today'}</small></span><b>${c && c.done ? '✓' : '<span class="hs-coin"></span> 800'}</b></div>
      </div>
      <div class="hs-actions">${this.backBtn()}<button class="hs-btn gold hs-play" data-act="playdaily">${ICON.play} ${c && c.done ? 'REPLAY' : 'START'}</button></div>`);
  }

  // a card introducing a new kind of enemy; the level waits behind it
  showIntro(def) {
    this.paused = true;
    this.setScreen(`<div class="hs-ribbon">NEW ENEMY!</div>
      <div class="hs-panel hs-out foecard"><div class="hs-sw big" style="background:${def.color}"></div><h2>${def.name}</h2><p class="hs-tip">${def.desc}</p></div>
      <button class="hs-btn green hs-play hs-out" data-act="gotit">GOT IT</button>`);
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
    if (r.endless) {
      this.setScreen(`<div class="hs-ribbon lose hs-out">RUN OVER</div>
        <div class="hs-bigwave hs-out"><small>YOU REACHED</small>WAVE ${r.wave}</div>
        <div class="hs-where hs-out">${r.newBest ? '<span class="gold">NEW BEST!</span>' : `Best: wave ${r.best}`} · +<span class="hs-coin"></span>${r.total}</div>
        <div class="hs-actions">
          <button class="hs-btn ghost" data-act="home">${ICON.home}</button>
          <button class="hs-btn gold" data-act="upgrades">${ICON.up} Upgrades</button>
          <button class="hs-btn green hs-play hs-out" data-act="retry">${ICON.retry} AGAIN</button>
        </div>`);
      if (r.newBest) this.confetti();
      return;
    }
    if (r.win && r.daily) {
      this.setScreen(`<div class="hs-ribbon">CHALLENGE CLEARED!</div>
        <div class="hs-reward hs-out">
          <div><span>Your time</span><b>${r.time.toFixed(1)} s</b></div>
          <div class="${r.newTime ? 'best' : ''}"><span>Best today${r.newTime ? ' · NEW!' : ''}</span><b>${r.best.toFixed(1)} s</b></div>
          ${r.bonus ? `<div><span>First clear bonus</span><b>${fmt(r.bonus)}</b></div>` : ''}
          <div class="total"><span>Total</span><b><span class="hs-coin"></span> ${fmt(r.total)}</b></div>
        </div>
        <div class="hs-actions">
          <button class="hs-btn ghost" data-act="home">${ICON.home}</button>
          <button class="hs-btn green hs-play hs-out" data-act="retry">${ICON.retry} FASTER</button>
        </div>`);
      this.confetti();
      return;
    }
    if (r.win) {
      const st = Array.from({ length: 3 }, (_, k) => `<span class="${k < r.stars ? '' : 'off'}">★</span>`).join('');
      this.setScreen(`<div class="hs-ribbon">VICTORY!</div><div class="hs-stars">${st}</div>
        <div class="hs-reward hs-out">
          <div><span>Level reward</span><b>${fmt(r.base)}</b></div>
          <div><span>Enemies crushed</span><b>${fmt(r.kills)}</b></div>
          <div><span>Survivors</span><b>${fmt(r.survivors)}</b></div>
          ${r.chest ? `<div class="best"><span>Treasure chest</span><b>${fmt(r.chest)}</b></div>` : ''}
          ${this.st.laneCoins ? `<div><span>Lane coins</span><b>${fmt(this.st.laneCoins)}</b></div>` : ''}
          ${r.gift ? `<div class="best"><span>New super power!</span><b>${POWERS.find((p) => p.id === r.gift).name}</b></div>` : ''}
          <div class="${r.newBest ? 'best' : ''}"><span>Best combo ×${fmt(r.bestCombo)}${r.newBest ? ' · NEW!' : ''}</span><b>${fmt(r.combo)}</b></div>
          <div class="total"><span>Total</span><b><span class="hs-coin"></span> <i class="cnt">0</i></b></div>
        </div>
        <div class="hs-actions">
          <button class="hs-btn ghost" data-act="home">${ICON.home}</button>
          <button class="hs-btn" data-act="map">${ICON.map}</button>
          <button class="hs-btn green hs-play hs-out" data-act="next">NEXT ${ICON.play}</button>
        </div>`);
      this.confetti();
      const cnt = this.ui.screen.querySelector('.cnt');
      cnt.style.fontStyle = 'normal';
      setTimeout(() => this.countUp(cnt, r.total), 600);
    } else {
      this.setScreen(`<div class="hs-ribbon lose hs-out">DEFEAT</div>
        <div class="hs-where hs-out">Fortress ${Math.round(r.progress * 100)}% destroyed · +<span class="hs-coin"></span>${r.total}</div>
        ${this.mode === 'campaign' && (this.save.fails || {})[this.level.n] <= 3 ? `<div class="hs-where hs-out"><span class="gold">Second wind:</span> next try gets a stronger, faster cannon, a smaller horde and a Frenzy start</div>` : ''}
        <p class="hs-tip">Aim through the ×3 gates first, break the purple crates for big bursts, steer into glowing power-up orbs, and save your hero for brutes and bosses. Use your super powers (keys 1-4) whenever they glow!</p>
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
      return `<div class="hs-row"><div class="hs-sw" style="background:${k.color}"></div><div class="t">${k.name}<small>${k.desc}</small></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Skins</h2>${rows}</div>${this.backBtn()}`);
  }

  showArsenal() {
    const s = this.save;
    const rows = WEAPONS.map((w) => {
      const own = s.weapons.includes(w.id);
      const locked = s.level < w.from;
      const btn = s.weapon === w.id ? '<button class="hs-btn ghost" disabled>Equipped</button>'
        : own ? `<button class="hs-btn" data-act="weapon-use" data-arg="${w.id}">Equip</button>`
          : locked ? `<button class="hs-btn ghost" disabled>Level ${w.from}</button>`
            : `<button class="hs-btn gold" data-act="buyweapon" data-arg="${w.id}" ${s.coins < w.cost ? 'disabled' : ''}><span class="hs-coin"></span>${fmt(w.cost)}</button>`;
      const tags = [`Power ×${weaponPower(w)}`, w.armor ? `+${w.armor} armor` : '', w.special ? `${SPECIAL_NAMES[w.special]} every ${w.every} s` : ''].filter(Boolean).map((t) => `<i>${t}</i>`).join('');
      return `<div class="hs-row weapon${locked ? ' locked' : ''}"><div class="hs-wic ${w.kind}">${ICON[w.icon]}</div><div class="t">${w.name}<small>${w.desc}</small><div class="hs-tags">${tags}</div></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Arsenal</h2><p class="hs-tip" style="margin:0 0 .4em;text-align:center">Every weapon fires more units than the last. Tanks and aircraft also have a special attack.</p>${rows}</div>${this.backBtn()}`);
  }

  // swap the weapon in the scene right away (home screen preview)
  equipWeapon(id) {
    this.save.weapon = id;
    writeSave(this.save);
    if (!this.levelGroup) return;
    const old = this.cannon;
    this.cannon = this.makeWeapon(this.skinColor());
    this.cannon.group.position.x = old.group.position.x;
    this.levelGroup.remove(old.group);
    this.levelGroup.add(this.cannon.group);
  }

  // the power store and loadout: owned powers toggle in and out of the 4 slots, the rest are for sale.
  // With a start function (go) it is the last stop before a level, with a START button.
  showPowers(go = this.go) {
    const s = this.save;
    this.go = go;
    const L = this.loadout().map((p) => p.id);
    const slots = Array.from({ length: LOADOUT }, (_, k) => { const p = POWERS.find((q) => q.id === L[k]); return p ? `<button class="hs-slot" data-act="loadout" data-arg="${p.id}" style="--c:${p.color}" title="Remove ${p.name}">${ICON[p.icon]}<small class="hs-out">${p.name}</small></button>` : '<div class="hs-slot empty">+</div>'; }).join('');
    // before a level only the owned powers are listed; the store (no go) lists them all
    const cards = POWERS.filter((p) => !go || s.powers.includes(p.id)).map((p) => {
      const own = s.powers.includes(p.id);
      const on = L.includes(p.id);
      const btn = own ? `<button class="hs-btn ${on ? 'sel' : ''}" data-act="loadout" data-arg="${p.id}" ${!on && L.length >= LOADOUT ? 'disabled' : ''}>${on ? `Slot ${L.indexOf(p.id) + 1}` : 'Take'}</button>`
        : `<button class="hs-btn gold" data-act="buypower" data-arg="${p.id}" ${s.coins < p.cost ? 'disabled' : ''}><span class="hs-coin"></span>${fmt(p.cost)}</button>`;
      return `<div class="hs-pcard${on ? ' on' : ''}${own ? '' : ' shop'}" style="--c:${p.color}"><div class="ic">${ICON[p.icon]}</div><b>${p.name}</b><small>${p.desc}</small><i>${p.cd} s recharge</i>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out wide"><h2>${go ? 'Choose your powers' : 'Super Powers'}</h2>
      <p class="hs-tip" style="margin:0 0 .4em;text-align:center">${go ? `Take up to ${LOADOUT} of your ${s.powers.length} powers into this level (keys 1-${LOADOUT}).` : `Take up to ${LOADOUT} into a level (keys 1-${LOADOUT}). You own ${s.powers.length} of ${POWERS.length}: win one by beating a boss level for the first time or finishing all three daily missions, or buy them here.`}</p>
      <div class="hs-slots">${slots}</div><div class="hs-pgrid">${cards}</div></div>
      <div class="hs-actions">${this.backBtn()}${go ? `<button class="hs-btn green hs-play" data-act="go">${ICON.play} START</button>` : ''}</div>`);
  }

  // every way into a level passes the loadout screen first, once there is something to choose
  prepare(start) {
    if (!needsLoadoutScreen(this.save)) { start(); return; }
    this.back = this.state === 'map' ? 'map' : this.state === 'won' || this.state === 'lost' ? 'result' : 'home';
    this.showPowers(start);
  }

  showPets() {
    const s = this.save;
    const rows = PETS.map((q) => {
      const own = s.pets.includes(q.id);
      const btn = s.pet === q.id ? '<button class="hs-btn ghost" data-act="pet-use" data-arg="">With you</button>' : own ? `<button class="hs-btn" data-act="pet-use" data-arg="${q.id}">Take</button>` : `<button class="hs-btn gold" data-act="buypet" data-arg="${q.id}" ${s.coins < q.cost ? 'disabled' : ''}><span class="hs-coin"></span>${fmt(q.cost)}</button>`;
      return `<div class="hs-row"><div class="hs-petic" style="--c:${q.color}">${ICON.paw}</div><div class="t">${q.name}<small>${q.desc}</small></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Pets</h2><p class="hs-tip" style="margin:0 0 .4em;text-align:center">A pet runs beside your cannon and helps out. Take one with you.</p>${rows}</div>${this.backBtn()}`);
  }

  showMissions() {
    this.refreshMissions();
    const rows = this.save.missions.list.map((m, i) => {
      const done = m.prog >= m.goal;
      const pct = Math.min(100, (m.prog / m.goal) * 100);
      const btn = m.claimed ? '<button class="hs-btn ghost" disabled>✓</button>' : `<button class="hs-btn ${done ? 'green' : 'ghost'}" data-act="claimmission" data-arg="${i}" ${done ? '' : 'disabled'}><span class="hs-coin"></span>${fmt(m.reward)}</button>`;
      return `<div class="hs-row mission${done && !m.claimed ? ' ready' : ''}"><div class="t">${missionText(m)}<div class="hs-prog"><i style="width:${pct}%"></i><b>${fmt(Math.min(m.prog, m.goal))} / ${fmt(m.goal)}</b></div></div>${btn}</div>`;
    }).join('');
    this.setScreen(`<div class="hs-topbar">${this.coinsPill()}</div><div class="hs-panel hs-out"><h2>Daily Missions</h2><p class="hs-tip" style="margin:0 0 .4em;text-align:center">Three new missions every day. Finish all three to win a super power.</p>${rows}</div>${this.backBtn()}`);
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
      <div class="hs-row"><span class="t">Camera<small>Low is closer and more dramatic</small></span>${opt('camera', [['wide', 'Wide'], ['low', 'Low']])}</div>
      <div class="hs-row"><span class="t">Sound</span>${opt('volume', [[0, 'Off'], [40, '40%'], [70, '70%'], [100, '100%']])}</div>
      <div class="hs-row"><span class="t">Auto-fire<small>Fire without holding</small></span>${opt('autoFire', [[false, 'Off'], [true, 'On']])}</div>
      <div class="hs-row"><span class="t">Auto resolution<small>Keeps the frame rate smooth</small></span>${opt('dynRes', [[true, 'On'], [false, 'Off']])}</div>
      <details class="hs-credits"><summary>3D model credits</summary>
        <p>Models from <a href="https://poly.pizza" target="_blank" rel="noopener">Poly Pizza</a> and <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a>. Trees, creatures and props: Quaternius (CC0). Weapons: Quaternius, Zsky, KolosStudios, Andreev Evgeny, Gilang Romadhan, jeremy, Stephen Graybill and Poly by Google. Skins: Quaternius, Poly by Google and antoine1germ. Most are licensed <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC-BY 3.0</a>; the full list with links is in models/hordesurge/CREDITS.txt.</p></details>
      <div class="hs-row"><span class="t">Your stats<small>Fired ${fmt(this.save.stats.fired)}, crushed ${fmt(this.save.stats.kills)}, won ${this.save.stats.wins}, bosses beaten ${this.save.stats.bosses}, best combo ×${fmt(this.save.stats.bestCombo)}</small></span></div>
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
    if (a !== 'champ' && a !== 'power' && a !== 'openchest') this.sound.click();
    switch (a) {
      case 'play': this.prepare(() => this.startLevel()); break;
      case 'next': this.prepare(() => { this.loadLevel(Math.min(this.level.n + 1, s.level)); this.startLevel(); }); break;
      case 'go': { const go = this.go; this.go = null; if (go) go(); break; }
      case 'powers': this.back = 'home'; this.go = null; this.showPowers(null); break;
      case 'loadout': {
        toggleLoadout(s, arg);
        writeSave(s); this.showPowers();
        break;
      }
      case 'buypower': {
        const p = POWERS.find((x) => x.id === arg);
        if (p && !s.powers.includes(arg) && s.coins >= p.cost) {
          s.coins -= p.cost; s.powers.push(arg);
          if (this.loadout().length < LOADOUT) s.loadout = [...this.loadout().map((q) => q.id), arg];
          this.sound.win(); writeSave(s);
        }
        this.showPowers();
        break;
      }
      case 'retry':
        this.paused = false; this.sound.resume();
        if (this.mode === 'endless') this.loadLevel(0, makeEndless((s.endless && s.endless.runs) || 0));
        else if (this.mode === 'daily') this.loadLevel(0, makeDaily(dailyChallenge()));
        else this.loadLevel(this.level.n);
        this.startLevel();
        break;
      case 'map': { const n = this.mode === 'campaign' ? this.level.n : s.level; this.back = 'home'; if (this.level.n !== s.level || this.mode !== 'campaign') this.loadLevel(s.level); this.showMap(n); break; }
      case 'chapter': this.showMap(Math.min(s.level, Math.max(1, (this.map.chapter + +arg) * 25 + 1))); break;
      case 'playlvl': this.prepare(() => { this.loadLevel(Math.min(+arg, s.level)); this.startLevel(); }); break;
      case 'endless': if (s.level >= 6) this.prepare(() => { this.loadLevel(0, makeEndless((s.endless && s.endless.runs) || 0)); this.startLevel(); }); break;
      case 'challenge': if (s.level >= 4) { this.back = 'home'; this.showChallenge(); } break;
      case 'playdaily': this.prepare(() => { this.loadLevel(0, makeDaily(dailyChallenge())); this.startLevel(); }); break;
      case 'gotit': s.seen = { ...(s.seen || {}), [this.level.intro.id]: true }; writeSave(s); this.paused = false; this.closeScreen(); break;
      case 'home': this.paused = false; this.sound.resume(); this.loadLevel(s.level); this.showHome(); break;
      case 'pause': if (this.state === 'play') this.showPause(); break;
      case 'resume': this.paused = false; this.sound.resume(); this.closeScreen(); break;
      case 'champ': this.launchChampion(); break;
      case 'power': this.usePower(arg); break;
      case 'upgrades': this.back = this.state === 'lost' ? 'result' : 'home'; this.showUpgrades(); break;
      case 'skins': this.back = 'home'; this.showSkins(); break;
      case 'champs': this.back = 'home'; this.showChamps(); break;
      case 'daily': this.back = 'home'; this.showDaily(); break;
      case 'settings': this.back = this.paused ? 'pause' : 'home'; this.showSettings(); break;
      case 'back':
        if (this.back === 'pause') this.showPause();
        else if (this.back === 'result') this.showResult();
        else if (this.back === 'map') { this.back = 'home'; this.showMap(this.mapLevel); }
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
      case 'pets': this.back = 'home'; this.showPets(); break;
      case 'arsenal': this.back = 'home'; this.showArsenal(); break;
      case 'buyweapon': {
        const w = WEAPONS.find((x) => x.id === arg);
        if (w && !s.weapons.includes(arg) && s.level >= w.from && s.coins >= w.cost) { s.coins -= w.cost; s.weapons.push(arg); this.sound.win(); this.equipWeapon(arg); }
        this.showArsenal();
        break;
      }
      case 'weapon-use': if (s.weapons.includes(arg)) this.equipWeapon(arg); this.showArsenal(); break;
      case 'missions': this.back = 'home'; this.showMissions(); break;
      case 'buypet': {
        const q = PETS.find((x) => x.id === arg);
        if (q && !s.pets.includes(arg) && s.coins >= q.cost) { s.coins -= q.cost; s.pets.push(arg); s.pet = arg; this.sound.coin(); writeSave(s); this.attachPet(); }
        this.showPets();
        break;
      }
      case 'pet-use': s.pet = arg || null; writeSave(s); if (this.pet) { this.levelGroup.remove(this.pet.view.group); this.pet = null; } this.attachPet(); this.showPets(); break;
      case 'claimmission': {
        const m = s.missions.list[+arg];
        if (m && !m.claimed && m.prog >= m.goal) {
          m.claimed = true; s.coins += m.reward;
          const g = s.missions.list.every((x) => x.claimed) && giftPower(s);
          if (g) this.toast(`New super power: ${POWERS.find((p) => p.id === g).name}!`);
          this.sound.win(); writeSave(s);
        }
        this.showMissions();
        break;
      }
      case 'openchest': this.openChest(); break;
      case 'collect': this.collectChest(); break;
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
    this.crowds.player.setLook(o.color, o.acc, o.accColor, o.model);
    // a skin bought or picked in game: its model may still be loading, so swap it in when it arrives
    const s = SKINS.find((k) => k.id === this.save.skin);
    if (s && s.model && !o.model) load(s.model).then((g) => { if (g && this.save.skin === s.id && this.root.isConnected) this.applySkin(); });
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
    this.loadLevel(this.mode === 'campaign' ? this.level.n : this.save.level);
    this.resize();
  }

  // ───────────── input ─────────────
  bindInput() {
    const c = this.renderer.domElement;
    let lastX = null;
    const toWorld = (px) => (px / Math.max(1, this.container.clientWidth)) * LANE_W * (this.aspect < 1 ? 1.5 : 1.1);
    this.onDown = (e) => {
      if (this.state === 'map') { this.mapDrag = { x: e.clientX, y: e.clientY, moved: 0 }; return; }
      if (this.state !== 'play' || this.paused) return;
      this.sound.init();
      this.input.down = true;
      lastX = e.clientX;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    };
    this.onMove = (e) => {
      const md = this.mapDrag;
      if (md) {
        const dy = e.clientY - md.y;
        md.moved += Math.abs(dy) + Math.abs(e.clientX - md.x);
        md.x = e.clientX; md.y = e.clientY;
        this.map.scroll(-dy * 0.06); // the map follows the finger
        return;
      }
      if (!this.input.down || lastX === null) return;
      this.cannonX = clamp(this.cannonX + toWorld(e.clientX - lastX), -HALF + 1.2, HALF - 1.2);
      lastX = e.clientX;
    };
    this.onUp = (e) => {
      const md = this.mapDrag;
      this.mapDrag = null;
      if (md && md.moved < 8 && this.state === 'map' && e && e.type === 'pointerup') {
        const r = c.getBoundingClientRect();
        const n = this.map.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        if (n) { this.sound.init(); this.sound.click(); this.selectLevel(n); }
      }
      this.input.down = false; lastX = null;
    };
    this.onWheel = (e) => { if (this.state === 'map') { e.preventDefault(); this.map.scroll(e.deltaY * 0.02); } };
    c.addEventListener('wheel', this.onWheel, { passive: false });
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
      const pk = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      const pick = this.inUse[pk];
      if (pick && this.state === 'play') this.usePower(pick.id);
      if (this.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) { if (this.paused) this.act('resume'); else this.showPause(); }
      // Enter is the Play shortcut only on the home screen itself: not in menus that share its state, not on a focused button
      if (e.code === 'Enter' && this.state === 'home' && !e.target.closest('button') && this.ui.screen.querySelector('[data-act="play"]')) this.act('play');
      if (e.code === 'Escape' && this.state === 'map') this.act('back');
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
    c.removeEventListener('wheel', this.onWheel);
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
    this.waves.forEach((w) => { this.scene.remove(w.m); w.m.material.dispose(); });
    [this.bits, this.shards, this.splats, this.shots, this.smoke].forEach((f) => f.dispose());
    [this.bubble, this.beam, this.beamMark, this.dome, ...this.bolts].forEach((m) => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this.bolts.forEach((l) => { this.scene.remove(l.userData.pillar); l.userData.pillar.material.dispose(); });
    this.pillarGeo.dispose();
    if (this.map) this.map.dispose();
    this.waveGeo.dispose();
    this.sound.close();
    if (this.post) this.post.dispose();
    if (this.envTex) this.envTex.dispose();
    this.renderer.dispose();
    this.root.remove();
  }
}

export { THEMES };
