// Core Breach client: rendering, input, the local player (movement, guns, abilities), other players,
// effects, HUD and menus. A Match (rules + bots) runs here for offline play and on the host online;
// guests receive events and snapshots from the host instead.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GradeShader } from './grade.js';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  WEAPON, AGENT, MOVE, TIMES, COLORS, clamp, damp, wrapAngle, loadSave, writeSave, DEFAULT_SETTINGS,
} from './data.js';
import { makeLevel, LEVELS, MAPS } from './level.js';
import { Match } from './match.js';
import { moveBody, eyeHeight } from './sim.js';
import { rayPlayer, spreadDir, dirFrom } from './hit.js';
import { stepProjectile, throwVelocity } from './proj.js';
import { buildMap } from './mapview.js';
import { buildAgent, animateAgent, setAgentGun, disposeTree, buildViewModel, buildCore, buildTurret, warmModels } from './models.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { HUD, CSS } from './hud.js';
import { GunState } from './gun.js';
import { Online } from './online.js';
import * as UI from './menus.js';
import { ensureProgress, award, skinFor, SKIN, skinUnlocked } from './progression.js';
import { playerName, savePlayerName } from '../shared/net.js';

const DEG = Math.PI / 180;
const INSTANT = new Set(['dash', 'overdrive', 'heal', 'bastion', 'hunt', 'revive', 'blink', 'supernova']);
// how each throwable leaves the hand (must match match.js runAbility)
const THROWS = {
  flash: [18, 0.1, 0.55], molly: [15, 0.3, 9], concuss: [15, 0.25, 1.0], frag: [15, 0.3, 1.6], shock: [26, 0.08, 4],
  recon: [26, 0.1, 4], slow: [15, 0.3, 9], smoke: [15, 0.3, 9], toxin: [15, 0.3, 9],
};
const VM_POS = {
  sidearm: [0.17, -0.15, -0.5], melee: [0.17, -0.19, -0.42], smg: [0.16, -0.19, -0.5], rifle: [0.17, -0.2, -0.52],
  shotgun: [0.17, -0.2, -0.52], sniper: [0.17, -0.2, -0.52], heavy: [0.18, -0.21, -0.52],
};

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.font = '600 30px Rajdhani, "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,.65)';
  g.strokeText(text, 128, 38);
  g.fillStyle = color;
  g.fillText(text, 128, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.3, 0.28, 1);
  s.renderOrder = 20;
  return s;
}

function diamond(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(Math.PI / 4);
  g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 4;
  g.fillRect(-14, -14, 28, 28); g.strokeRect(-14, -14, 28, 28);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.setScalar(0.35);
  s.renderOrder = 21;
  return s;
}

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    let fresh = true;
    try { fresh = !localStorage.getItem('core-breach-save'); } catch { fresh = true; }
    this.save = loadSave();
    this.S = this.save.settings;
    this.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    if (fresh && this.isTouch) this.S.quality = 'low';
    const root = document.createElement('div');
    root.className = 'cb';
    root.tabIndex = 0;
    root.innerHTML = `<style>${CSS}${UI.CSS}</style>`;
    container.appendChild(root);
    this.root = root;
    root.classList.toggle('touch', this.isTouch);
    this.sound = new Sound(this.S.volume);
    this.initRenderer();
    this.hud = new HUD(this);
    this.fx = null;
    this.levels = {};
    this.useLevel('meridian');
    this.recs = new Map();
    this.avatars = new Map();
    this.turrets = new Map();
    this.smokes = new Map();
    this.wallBoxes = new Map();
    this.boxWall = new Map();
    this.loadouts = new Map();
    this.roster = new Map();
    this.keys = new Set();
    this.mouse = { down: false };
    this.tc = { sx: 0, sy: 0, fire: false, crouch: false, use: false };
    this.me = { p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, ground: true, alive: false };
    this.gun = new GunState(this.sound);
    this.st = this.blankState();
    this.mode = 'menu';
    this.screen = null;
    this.uiOpen = null;
    this.time = 0;
    this.vm = null;
    this.vmAnim = { kick: 0, swayX: 0, swayY: 0, bob: 0, equip: 0 };
    this.shake = 0;
    this.blind = 0;
    this.stats = { shots: 0, hits: 0, heads: 0, kills: 0 };
    if (!/[?&]manual/.test(location.search)) warmModels(this.S.quality); // pre-mesh sculpted models while in the menus
    this.coreObj = buildCore();
    this.coreObj.visible = false;
    this.scene.add(this.coreObj);
    this.marker = this.makeMarker();
    this.bindInput();
    if (this.isTouch) this.buildTouch();
    this.showScreen('main');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.last = performance.now();
    this.fpsT = 0; this.fpsN = 0;
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  blankState() {
    return { mode: 'core', phase: 'wait', phaseT: 0, round: 0, score: { red: 0, blue: 0 }, sides: { red: 'atk', blue: 'def' }, toWin: 5, core: { state: 'none', carrier: null, p: [0, 0, 0], fuse: 0, plantT: 0, defuseT: 0, defuser: null } };
  }

  // ───────────── rendering setup ─────────────
  initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.68;
    r.shadowMap.enabled = this.S.quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // the map never moves: draw the sun's shadow map only when something solid changes
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    r.domElement.className = 'cb-canvas';
    this.root.appendChild(r.domElement);
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.04, 2000);
    this.camera.rotation.order = 'YXZ';
    // sky, image-based light, sun and fog: set per map by applyLighting()
    const patchSky = (sk) => {
      sk.material.uniforms.skyGain = { value: 0.55 };
      sk.material.fragmentShader = sk.material.fragmentShader
        .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyGain;')
        .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
    };
    this.sky = new Sky();
    this.sky.scale.setScalar(1500);
    this.sky.frustumCulled = false;
    patchSky(this.sky);
    scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(50);
    patchSky(this.envSky);
    this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6f604c, side: THREE.BackSide }));
    this.envScene.add(this.envGround);
    // sun with shadows over the whole map
    const sun = new THREE.DirectionalLight(0xfff0da, 4.2);
    scene.add(sun, sun.target);
    const sc = sun.shadow.camera;
    sc.left = -108; sc.right = 108; sc.top = 108; sc.bottom = -108; sc.near = 20; sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.sun = sun;
    this.applyShadowQuality();
    this.hemi = new THREE.HemisphereLight(0xffe9d0, 0xe0b887, 0.62);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xf2dcc0, 190, 720);
    // the first-person weapon renders in its own pass so it never clips into walls
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(54, 16 / 9, 0.01, 10);
    const vl = new THREE.DirectionalLight(0xfff0da, 3.2);
    vl.position.set(0.5, 1, 0.3);
    this.vmScene.add(vl, new THREE.HemisphereLight(0xd8e6ff, 0x5a4a3a, 0.5));
    this.vmLight = vl;
    this.applyLighting(null);
    this.buildComposer();
  }

  // per-map light: sun height/direction/colour, sky haze, exposure, fog (null = default sunny noon)
  applyLighting(l) {
    const L = { elev: 34, az: 218, color: '#ffe3b3', sun: 4.6, hemi: [0xffe9d0, 0xe0b887, 0.62], turbidity: 3.4, rayleigh: 1.25, mie: 0.006, exposure: 0.92, fog: 0xf2dcc0, skyGain: 0.62, ...(l || {}) };
    const dir = new THREE.Vector3().setFromSphericalCoords(1, (90 - L.elev) * DEG, L.az * DEG);
    [[this.sky, L.skyGain], [this.envSky, L.skyGain * 1.35]].forEach(([sk, gain]) => {
      const u = sk.material.uniforms;
      u.turbidity.value = L.turbidity; u.rayleigh.value = L.rayleigh; u.mieCoefficient.value = L.mie; u.mieDirectionalG.value = 0.84;
      u.sunPosition.value.copy(dir);
      u.skyGain.value = gain;
    });
    this.sun.position.copy(dir).multiplyScalar(170);
    this.sun.color.set(L.color);
    this.sun.intensity = L.sun;
    this.hemi.color.setHex(L.hemi[0]); this.hemi.groundColor.setHex(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.vmLight.color.set(L.color);
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.fog.color.setHex(L.fog);
    this.envGround.material.color.setHex(L.elev < 20 ? 0x7a5a44 : 0xb89a72);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.vmScene.environment = this.envRT.texture;
    this.renderer.shadowMap.needsUpdate = true;
  }

  applyShadowQuality() {
    const q = this.S.quality;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    this.renderer.shadowMap.needsUpdate = true;
  }

  buildComposer() {
    const q = this.S.quality;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : q === 'medium' ? 2 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    // ambient occlusion in corners and under cover (high quality)
    this.ao = null;
    if (q === 'high') {
      try {
        this.ao = new GTAOPass(this.scene, this.camera, Math.max(1, size.x), Math.max(1, size.y));
        this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 12 });
        this.ao.blendIntensity = 0.85;
        c.addPass(this.ao);
      } catch (e) { console.warn('AO unavailable', e); this.ao = null; }
    }
    const vp = new RenderPass(this.vmScene, this.vmCam);
    vp.clear = false;
    vp.clearDepth = true;
    c.addPass(vp);
    this.bloom = null;
    if (q !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)), 0.32, 0.4, 2.6);
      c.addPass(this.bloom);
    }
    if (q !== 'low') { this.grade = new ShaderPass(GradeShader); c.addPass(this.grade); }
    c.addPass(new OutputPass());
    this.composer = c;
  }

  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const q = this.S.quality;
    const base = q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    return base * (this.S.dynRes === false ? 1 : this.resScale || 1);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.vmCam.aspect = w / h;
    this.vmCam.updateProjectionMatrix();
    this.viewH = h;
    this.updateFov(1);
  }

  // field of view setting is horizontal (like most shooters); zoom divides it
  updateFov(zoom) {
    const a = this.camera.aspect || 16 / 9;
    const h = clamp(this.S.fov, 70, 110) * DEG;
    const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(a, 1.0));
    const vz = 2 * Math.atan(Math.tan(v / 2) / zoom);
    if (Math.abs(this.camera.fov - vz / DEG) > 0.01) {
      this.camera.fov = vz / DEG;
      this.camera.updateProjectionMatrix();
    }
    this.vfov = vz / DEG;
  }

  useLevel(id) {
    if (this.levelId === id) return;
    if (this.mapGroup) this.scene.remove(this.mapGroup);
    let L = this.levels[id];
    if (!L) {
      const level = makeLevel(id);
      const built = buildMap(level, this.S.quality);
      built.group.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { if ('envMapIntensity' in m) m.envMapIntensity = 0.5; }); });
      L = { level, ...built };
      this.levels[id] = L;
    }
    this.levelId = id;
    this.level = L.level;
    this.mapGroup = L.group;
    this.barriers = L.barriers;
    this.scene.add(L.group);
    this.applyLighting(L.level.def.light || null);
    if (!this.fx) this.fx = new FX(this.scene, this.level, this.sound);
    this.fx.level = this.level;
    this.hud.initMinimap(this.level);
  }

  makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x5be0ff, transparent: true, opacity: 0.25, depthWrite: false }));
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 80), 3));
    const arc = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.8, depthWrite: false }));
    arc.frustumCulled = false;
    g.add(ring, box, arc);
    g.visible = false;
    this.scene.add(g);
    return { g, ring, box, arc };
  }

  // ───────────── sessions ─────────────
  resetWorld() {
    this.avatars.forEach((a) => this.dropAvatar(a));
    this.avatars.clear();
    this.turrets.forEach((t) => { this.scene.remove(t.obj); disposeTree(t.obj); });
    this.turrets.clear();
    this.smokes.clear();
    this.wallBoxes.clear();
    this.boxWall.clear();
    this.recs.clear();
    this.loadouts.clear();
    this.roster.clear();
    this.fx.clear();
    this.level.boxes.length = 0;
    this.coreObj.visible = false;
    this.gun.reset();
    this.heldId = null;
    this.slot = 'secondary';
    this.me = { p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, ground: true, alive: false };
    this.acting = null;
    this.armedAb = null;
    this.specId = null;
    this.deathT = 0;
    this.blind = 0;
    this.st = this.blankState();
    this.stats = { shots: 0, hits: 0, heads: 0, kills: 0 };
    this.mstats = { plants: 0, defuses: 0, abilities: 0, sniper: 0, heads: 0, kills: 0 };
    this.reward = null;
    this.roundKills = 0;
    this.overShown = false;
    this.hud.el.feed.innerHTML = '';
    this.hud.cache = {};
    this.marker.g.visible = false;
  }

  // offline: vs bots, deathmatch, practice range
  startLocal(mode) {
    const S = this.S;
    this.endSession();
    this.useLevel(mode === 'range' ? 'range' : this.pickMap(S.map));
    this.resetWorld();
    this.myId = 'me';
    this.session = { mode, online: null };
    this.st.mode = mode;
    const m = new Match({ mode, level: this.level, toWin: S.length === 'standard' ? 13 : 5, difficulty: S.difficulty, emit: (e) => this.onEvent(e), seed: (Math.random() * 1e9) | 0 });
    this.match = m;
    if (mode === 'core' && Math.random() < 0.5) m.sides = { red: 'def', blue: 'atk' };
    m.addPlayer({ id: 'me', name: playerName() || 'You', team: 'red', agent: S.agent });
    if (mode === 'core') { m.fillBots('red', 5); m.fillBots('blue', 5); } else if (mode === 'dm') m.fillBots('blue', 7);
    else m.fillBots('blue', 6);
    m.rangeMove = false;
    m.start();
    this.enterPlay();
  }

  // online (called by Online): host runs the match, guests mirror it
  startOnline(opt) {
    this.endSession(true);
    this.useLevel(this.pickMap(opt.cfg.map, opt.seed));
    this.resetWorld();
    this.myId = opt.myId;
    this.session = { mode: opt.cfg.mode, online: opt.host ? 'host' : 'guest', cfg: opt.cfg };
    this.st.mode = opt.cfg.mode;
    opt.roster.forEach((r) => this.roster.set(r.id, r));
    if (opt.host) {
      const m = new Match({ mode: opt.cfg.mode, level: this.level, toWin: opt.cfg.length === 'standard' ? 13 : 5, difficulty: opt.cfg.difficulty, emit: (e) => { this.onEvent(e); this.net.queue(e); }, seed: opt.seed });
      this.match = m;
      opt.roster.forEach((r) => m.addPlayer({ id: r.id, name: r.name, team: r.team, agent: r.agent }));
      if (opt.cfg.bots) {
        if (opt.cfg.mode === 'core') { m.fillBots('red', 5); m.fillBots('blue', 5); } else {
          const humans = opt.roster.length;
          if (humans < 8) m.fillBots('blue', 8 - humans + opt.roster.filter((r) => r.team === 'blue').length);
        }
      }
      m.start();
    } else this.match = null;
    this.enterPlay();
  }

  pickMap(id, seed) {
    if (id && id !== 'random' && LEVELS[id]) return id;
    const list = MAPS.map((m) => m.id);
    return list[Math.abs(seed ?? Math.floor(Math.random() * 1e6)) % list.length];
  }

  enterPlay() {
    this.mode = 'play';
    this.paused = false;
    this.uiOpen = null;
    this.closeScreen();
    this.hud.el.hud.hidden = false;
    this.hud.el.touch.hidden = !this.isTouch;
    this.sound.init();
    this.sound.sting('start');
    this.lockPointer();
  }

  endSession(keepNet = false) {
    this.match = null;
    if (this.net && !keepNet) { this.net.leave(); this.net = null; }
    this.session = null;
  }

  toMenu() {
    this.endSession();
    this.resetWorld();
    this.mode = 'menu';
    this.useLevel('meridian');
    this.hud.el.hud.hidden = true;
    this.hud.el.touch.hidden = true;
    this.hud.el.scope.hidden = true;
    this.unlockPointer();
    this.showScreen('main');
  }

  // online: back to the room screen after a match
  toLobby() {
    this.endSession(true);
    this.resetWorld();
    this.mode = 'menu';
    this.hud.el.hud.hidden = true;
    this.hud.el.touch.hidden = true;
    this.hud.el.scope.hidden = true;
    this.unlockPointer();
    this.closeScreen();
  }

  // ───────────── requests to the match (local or through the host) ─────────────
  req(m) {
    if (this.match) this.handleReq(this.myId, m);
    else if (this.net) this.net.toHost(m, m.t !== 'st');
  }

  handleReq(id, m) {
    const M = this.match;
    if (!M) return;
    switch (m.t) {
      case 'st': M.setState(id, m.s); break;
      case 'fire': M.fire(id, m.f); break;
      case 'knife': M.knife(id, m.target, m.back); break;
      case 'ab': M.ability(id, m.slot, m.o, m.d); break;
      case 'buy': M.buy(id, m.item); break;
      case 'pick': M.pick(id, m.gun); break;
      case 'plant': M.plant(id, !!m.s); break;
      case 'defuse': M.defuse(id, !!m.s); break;
      default: break;
    }
  }

  // ───────────── events from the match ─────────────
  onEvent(e) {
    const me = this.myId;
    switch (e.e) {
      case 'roster':
        e.players.forEach((r) => this.roster.set(r.id, r));
        [...this.roster.keys()].forEach((id) => { if (!e.players.find((r) => r.id === id)) this.roster.delete(id); });
        break;
      case 'spawn': {
        if (e.id === me) {
          const M = this.me;
          M.p = [...e.p]; M.v = [0, 0, 0]; M.yaw = e.yaw; M.pitch = 0; M.ground = true; M.crouch = 0; M.alive = true;
          this.deathT = 0;
          this.specId = null;
          this.acting = null;
          if (!e.revive) {
            this.gun.reset();
            this.roundKills = 0;
          }
          this.heldId = null;
          const lo = this.myLoad();
          this.slot = lo && lo.guns && lo.guns.primary ? 'primary' : 'secondary';
          this.hud.el.spec.hidden = true;
        } else {
          const r = this.recs.get(e.id);
          if (r) { r.buf = []; r.p = [...e.p]; r.rp = [...e.p]; }
        }
        break;
      }
      case 'phase':
        if (!this.match) { this.st.phase = e.phase; this.st.phaseT = e.t; this.st.round = e.round; this.st.score = e.score; this.st.sides = e.sides; this.st.toWin = e.toWin; }
        if (this.barriers) this.barriers.visible = e.phase === 'buy';
        if (e.phase !== 'buy' && this.uiOpen === 'buy' && this.st.mode === 'core') this.closeUI();
        if (e.phase === 'buy') { this.fx.clear(); this.smokes.clear(); }
        break;
      case 'msg':
        this.hud.message(e.text, e.sub || '', '', 2000);
        break;
      case 'msg-team':
        if (e.team === this.myTeam()) this.hud.chatLine('INTEL', e.text, '#ffd166');
        break;
      case 'loadout': {
        this.loadouts.set(e.id, e);
        if (e.id === me) {
          if (e.cur && e.cur !== this.slot && e.cur !== 'melee') this.slot = e.cur;
          if (this.uiOpen === 'buy') this.renderBuy();
        }
        break;
      }
      case 'fire': this.onFire(e); break;
      case 'dmg': this.onDamage(e); break;
      case 'kill': this.onKill(e); break;
      case 'fx': this.onFx(e); break;
      case 'core': this.onCore(e); break;
      case 'round': {
        const myTeam = this.myTeam();
        const won = e.winner === myTeam;
        this.hud.message(won ? 'ROUND WON' : 'ROUND LOST', e.reason.toUpperCase(), won ? 'win' : 'lose', 3500);
        this.sound.sting(won ? 'win' : 'lose');
        if (this.acting) this.acting = null;
        break;
      }
      case 'over': this.onOver(e); break;
      default: break;
    }
  }

  myTeam() { const r = this.recs.get(this.myId) || this.roster.get(this.myId); return r ? r.team : 'red'; }
  mySide() { return this.st.sides[this.myTeam()]; }

  isEnemy(rec) {
    if (!rec || rec.id === this.myId) return false;
    if (this.st.mode === 'range') return !!rec.bot;
    if (this.st.mode === 'dm') return true;
    return rec.team !== this.myTeam();
  }

  // my guns / charges / credits
  myLoad() {
    if (this.match) {
      const p = this.match.players.get(this.myId);
      return p ? { guns: p.guns, charges: p.charges, credits: p.credits, armor: p.armor, ult: p.ult, agent: p.agent } : null;
    }
    const l = this.loadouts.get(this.myId);
    const r = this.recs.get(this.myId);
    if (!l) return null;
    return { guns: l.guns, charges: l.charges, credits: r ? r.credits : l.credits, armor: r ? r.armor : l.armor, ult: r ? r.ult : (l.ult || 0), agent: (this.roster.get(this.myId) || {}).agent || this.S.agent };
  }

  curGunId() {
    if (this.slot === 'melee') return 'knife';
    const lo = this.myLoad();
    if (!lo) return 'wasp';
    if (this.slot === 'primary' && !lo.guns.primary) this.slot = 'secondary';
    return lo.guns[this.slot] || 'wasp';
  }

  onFire(e) {
    if (e.id === this.myId) return;
    const tmp = new THREE.Vector3();
    let from = e.o;
    if (String(e.id).startsWith('t')) {
      const t = this.turrets.get(Number(String(e.id).slice(1)));
      if (t && e.ends[0]) {
        const h = t.obj.userData.head;
        const dx = e.ends[0][0] - t.p[0]; const dz = e.ends[0][2] - t.p[2];
        h.rotation.y = Math.atan2(-dx, -dz) - t.obj.rotation.y;
      }
      this.sound.turret(e.o);
      e.ends.forEach((end) => this.fx.tracer(e.o, end, t && t.team === this.myTeam() ? 0x5be0ff : 0xff6a6a));
      return;
    }
    const w = WEAPON[e.w];
    if (!w) return;
    const av = this.avatars.get(e.id);
    if (av && av.rig.gun && av.rig.root.visible) {
      av.rig.gun.userData.muzzle.getWorldPosition(tmp);
      from = tmp.toArray();
      av.recoil = 1;
    }
    this.fx.muzzle(from, w.cat === 'sniper' || w.cat === 'shotgun' ? 1 : 0.7);
    this.sound.shot(w, e.o);
    (e.ends || []).slice(0, 5).forEach((end, k) => {
      if (k < 2 || w.pellets) this.fx.tracer(from, end);
      const dx = end[0] - e.o[0]; const dy = end[1] - e.o[1]; const dz = end[2] - e.o[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      const hit = this.level.raycast(e.o, [dx / L, dy / L, dz / L], L + 0.3);
      if (hit && Math.abs(hit.t - L) < 0.35) this.fx.impact(end, [hit.nx, hit.ny, hit.nz]);
      else if (L < 199) this.fx.impact(end, null, true);
    });
  }

  onDamage(e) {
    if (e.id === this.myId) {
      const a = this.recs.get(e.by);
      if (a && e.src !== 'molly') {
        const rel = Math.atan2(-(a.rp[0] - this.me.p[0]), -(a.rp[2] - this.me.p[2])) - this.me.yaw;
        this.hud.damageFrom(-rel);
      } else this.hud.damageFrom(Math.PI);
      this.sound.hurt();
      this.shake = Math.min(1, this.shake + 0.25);
    }
    const av = this.avatars.get(e.id);
    if (av) av.rig.flinch = 1;
  }

  onKill(e) {
    const info = (id) => {
      const r = this.recs.get(id) || this.roster.get(id);
      return r ? { name: id === this.myId ? `${r.name}` : r.name, team: this.st.mode === 'core' ? (r.team === this.myTeam() ? 'blue' : 'red') : (id === this.myId ? 'blue' : 'red') } : { name: '?', team: 'red' };
    };
    const killer = e.killer ? info(e.killer) : null;
    this.hud.feed(killer, info(e.victim), e.w, e.head, e.killer === this.myId || e.victim === this.myId);
    if (e.killer === this.myId && e.victim !== this.myId) {
      this.hud.hitmarker(true);
      this.sound.hit(e.head, true);
      this.roundKills++;
      this.stats.kills++;
      this.mstats.kills++;
      if (e.head) this.mstats.heads++;
      if (WEAPON[e.w] && WEAPON[e.w].cat === 'sniper') this.mstats.sniper++;
      this.save.stats.kills++;
      if (e.head) this.save.stats.headshots++;
      if (this.st.mode !== 'range' && this.roundKills >= 2) this.hud.message(['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'ACE'][Math.min(5, this.roundKills)], '', 'win', 1400);
    }
    if (e.victim === this.myId) this.die(e);
    // fall away from the shooter
    const av = this.avatars.get(e.victim);
    const v = this.recs.get(e.victim);
    const k = this.recs.get(e.killer);
    if (av && v && k) {
      const dx = k.rp[0] - v.rp[0]; const dz = k.rp[2] - v.rp[2];
      av.deathDir = dx * -Math.sin(v.yaw) + dz * -Math.cos(v.yaw) > 0 ? 1 : -1;
    } else if (av) av.deathDir = 1;
  }

  die(e) {
    const M = this.me;
    M.alive = false;
    this.deathT = 0;
    this.killerId = e.killer;
    this.deathPos = [...M.p];
    if (this.acting) { this.req({ t: this.acting, s: false }); this.acting = null; }
    this.armedAb = null;
    this.gun.scope = 0;
    this.save.stats.deaths++;
    if (this.uiOpen === 'buy') this.closeUI();
  }

  onFx(e) {
    const fx = this.fx;
    if (e.pid && e.kind !== 'throw') fx.projEnd(e.pid);
    const teamColor = (team) => (team === this.myTeam() ? 0x40ffb0 : 0xff5a6a);
    switch (e.kind) {
      case 'throw': fx.throwStart(e.pid, e.what, e.o, e.v, e.stick); break;
      case 'smoke': fx.smoke(e.zid, e.p, e.r, e.dur); this.smokes.set(e.zid, { p: e.p, r: e.r }); break;
      case 'fire': case 'slow': case 'toxin': fx.groundZone(e.zid, e.kind, e.p, e.r, e.dur); break;
      case 'trap': fx.trap(e.trid, e.p, e.team); break;
      case 'blink': {
        if (e.id === this.myId && this.me.alive) { this.me.p = [...e.p]; this.me.v = [0, 0, 0]; }
        const r = this.recs.get(e.id);
        if (r && r.id !== this.myId) { r.buf = []; r.rp = [...e.p]; }
        fx.blink(e.from, e.p);
        break;
      }
      case 'supernova': fx.supernova(e.p); break;
      case 'nova-hit': if (e.id === this.myId) { this.blind = Math.max(this.blind, 2.5); } break;
      case 'flash': {
        fx.flash(e.p);
        if (!this.me.alive) break;
        const eye = this.eyePos();
        const dx = e.p[0] - eye[0]; const dy = e.p[1] - eye[1]; const dz = e.p[2] - eye[2];
        const L = Math.hypot(dx, dy, dz);
        if (L > 40 || !this.level.los(eye, e.p) || this.smokeBlocks(eye, e.p)) break;
        const look = this.aimDir();
        const dot = (look[0] * dx + look[1] * dy + look[2] * dz) / L;
        const k = dot > 0.5 ? 1 : dot > 0 ? 0.55 : dot > -0.5 ? 0.25 : 0;
        this.blind = Math.max(this.blind, 2.2 * k);
        break;
      }
      case 'concuss': fx.concuss(e.p); break;
      case 'blast': {
        fx.blast(e.p, e.r, e.big);
        const d = Math.hypot(e.p[0] - this.me.p[0], e.p[2] - this.me.p[2]);
        if (d < 25) this.shake = Math.min(1.2, this.shake + (e.big ? 1 : 0.6) * (1 - d / 25));
        break;
      }
      case 'pulse': if (e.p) fx.pulse(e.p, teamColor(e.team)); else this.sound.ability('pulse', null); break;
      case 'wall': {
        fx.wall(e.wid, e.box, e.team);
        setTimeout(() => { this.renderer.shadowMap.needsUpdate = true; }, 450);
        let box = e.box;
        if (!this.match) box = this.level.addBox({ ...e.box });
        this.wallBoxes.set(e.wid, box);
        this.boxWall.set(box, e.wid);
        break;
      }
      case 'turret': {
        const obj = buildTurret(e.team);
        obj.position.set(e.p[0], e.p[1], e.p[2]);
        obj.rotation.y = e.yaw;
        this.scene.add(obj);
        this.turrets.set(e.tid, { obj, p: e.p, team: e.team, yaw: e.yaw, id: e.tid });
        this.sound.ability('wall', e.p);
        break;
      }
      case 'heal': {
        const r = this.recs.get(e.id);
        if (r) fx.healFx(r.id === this.myId ? this.me.p : r.rp);
        break;
      }
      case 'dash': {
        if (e.id === this.myId && this.me.alive) {
          const M = this.me;
          let dx = M.v[0]; let dz = M.v[2];
          if (Math.hypot(dx, dz) < 0.5) { dx = -Math.sin(M.yaw); dz = -Math.cos(M.yaw); }
          const l = Math.hypot(dx, dz) || 1;
          M.v[0] = (dx / l) * 17; M.v[2] = (dz / l) * 17; M.v[1] = 2.6; M.ground = false;
        }
        fx.dashFx(e.p);
        break;
      }
      case 'overdrive':
        this.sound.ability('ult', null);
        if (e.id === this.myId) this.hud.message('OVERDRIVE', 'FASTER · INSTANT RELOAD', 'win', 1500);
        break;
      case 'hunt':
        this.sound.ability('ult', null);
        this.hud.message(e.team === this.myTeam() ? "HUNTER'S SIGHT" : 'YOU ARE BEING HUNTED', '', e.team === this.myTeam() ? 'win' : 'lose', 1800);
        break;
      case 'orbital': fx.orbital(e.p, e.delay); break;
      case 'end': {
        if (e.zid !== undefined) { fx.endZone(e.zid); this.smokes.delete(e.zid); }
        if (e.trid !== undefined) fx.endZone(`t${e.trid}`);
        if (e.wid !== undefined) {
          fx.endWall(e.wid);
          this.renderer.shadowMap.needsUpdate = true;
          const b = this.wallBoxes.get(e.wid);
          if (b && !this.match) this.level.removeBox(b);
          this.wallBoxes.delete(e.wid);
          if (b) this.boxWall.delete(b);
        }
        if (e.tid !== undefined) {
          const t = this.turrets.get(e.tid);
          if (t) { this.scene.remove(t.obj); disposeTree(t.obj); this.turrets.delete(e.tid); fx.puffAt([t.p[0], t.p[1] + 0.6, t.p[2]], 1, 0.6, 0x999999, 0.6); }
        }
        break;
      }
      default: break;
    }
  }

  onCore(e) {
    const c = this.st.core;
    switch (e.state) {
      case 'planting': if (e.by === this.myId) this.sound.sting('click'); break;
      case 'planted':
        if (!e.stop) {
          if (e.by === this.myId) this.mstats.plants++;
          this.sound.plant();
          this.hud.message('CORE PLANTED', e.site ? `SITE ${e.site}` : '', this.mySide() === 'atk' ? 'win' : 'lose', 2500);
          this.beepT = 0;
          if (this.acting === 'plant') this.acting = null;
        }
        break;
      case 'half': this.hud.message('HALF', 'DEFUSE CHECKPOINT', '', 900); break;
      case 'defused': if (e.by === this.myId) this.mstats.defuses++; this.hud.message('CORE DEFUSED', '', this.mySide() === 'def' ? 'win' : 'lose', 2500); if (this.acting === 'defuse') this.acting = null; break;
      case 'detonated':
        this.fx.blast(e.p, 16, true);
        this.fx.blast([e.p[0] + 4, e.p[1], e.p[2] - 3], 10, true);
        this.shake = 1.5;
        break;
      case 'dropped': if (this.match === null) c.p = e.p; break;
      default: break;
    }
  }

  onOver(e) {
    this.overData = e;
    const myTeam = this.myTeam();
    const win = this.st.mode === 'core' ? e.winner === myTeam : e.winner === this.myId;
    this.save.stats.matches++;
    if (win) this.save.stats.wins++;
    // XP, rank and missions
    const me = this.recs.get(this.myId) || { k: 0, d: 0, a: 0 };
    const other = myTeam === 'red' ? 'blue' : 'red';
    const place = this.st.mode === 'dm' ? 1 + [...this.recs.values()].filter((r) => r.id !== this.myId && r.k > me.k).length : 0;
    this.reward = award(this.save, {
      mode: this.st.mode, map: this.levelId, win, kills: this.mstats.kills, deaths: me.d, assists: me.a, heads: this.mstats.heads,
      roundsWon: this.st.mode === 'core' ? e.score[myTeam] : 0, roundsLost: this.st.mode === 'core' ? e.score[other] : 0,
      plants: this.mstats.plants, defuses: this.mstats.defuses, abilities: this.mstats.abilities, sniper: this.mstats.sniper,
      difficulty: (this.session && this.session.cfg && this.session.cfg.difficulty) || this.S.difficulty, online: !!(this.session && this.session.online),
      score: this.st.mode === 'core' ? `${e.score[myTeam]}–${e.score[other]}` : `#${place}`, place,
    });
    writeSave(this.save);
    this.hud.message(win ? 'VICTORY' : 'DEFEAT', this.st.mode === 'core' ? `${e.score[myTeam]} – ${e.score[myTeam === 'red' ? 'blue' : 'red']}` : '', win ? 'win' : 'lose', 4000);
    this.sound.sting(win ? 'win' : 'lose');
    setTimeout(() => {
      if (this.mode !== 'play' || this.overData !== e) return;
      this.uiOpen = 'results';
      this.unlockPointer();
      this.showScreen('results');
    }, 3500);
  }

  // ───────────── state: from the match (local/host) or snapshots (guest) ─────────────
  rec(id) {
    let r = this.recs.get(id);
    if (!r) {
      r = { id, name: '?', team: 'red', agent: 'vex', bot: false, p: [0, 0, 0], rp: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, v: [0, 0, 0], gun: 'wasp', hp: 100, armor: 0, alive: false, hasCore: false, revealed: false, over: false, slow: false, concuss: false, credits: 0, k: 0, d: 0, a: 0, ult: 0, buf: [] };
      this.recs.set(id, r);
    }
    return r;
  }

  syncFromMatch() {
    const m = this.match;
    const st = this.st;
    st.mode = m.mode; st.phase = m.phase; st.phaseT = m.phaseT; st.round = m.round; st.score = m.score; st.sides = m.sides; st.toWin = m.toWin; st.core = m.core;
    const seen = new Set();
    m.players.forEach((p) => {
      const r = this.rec(p.id);
      seen.add(p.id);
      r.name = p.name; r.team = p.team; r.agent = p.agent; r.bot = p.bot;
      r.p = p.p; r.rp = p.p; r.yaw = p.yaw; r.pitch = p.pitch; r.crouch = p.crouch; r.v = p.v;
      r.gun = p.cur === 'primary' ? p.guns.primary : p.cur === 'secondary' ? p.guns.secondary : 'knife';
      r.hp = p.hp; r.armor = p.armor; r.alive = p.alive; r.hasCore = p.hasCore;
      r.revealed = p.revealT > 0; r.over = p.overT > 0; r.slow = p.slowT > 0; r.concuss = p.concussT > 0;
      r.credits = p.credits; r.k = p.kills; r.d = p.deaths; r.a = p.assists; r.ult = p.ult;
    });
    this.recs.forEach((r, id) => { if (!seen.has(id)) this.removeRec(id); });
  }

  applySnap(s) {
    const now = performance.now();
    const st = this.st;
    st.phase = s.ph; st.phaseT = s.pt; st.round = s.rd;
    st.score = { red: s.sc[0], blue: s.sc[1] };
    st.sides = { red: s.sd, blue: s.sd === 'atk' ? 'def' : 'atk' };
    const c = s.core;
    st.core = { state: c[0], carrier: c[1], p: [c[2], c[3], c[4]], fuse: c[5], plantT: c[6], defuseT: c[7], defuser: c[8] };
    const seen = new Set();
    for (const a of s.pl) {
      const [id, x, y, z, yaw, pitch, cr, gun, hp, armor, flags, credits, k, d, as, ult, vx, vz] = a;
      seen.add(id);
      const r = this.rec(id);
      const ro = this.roster.get(id);
      if (ro) { r.name = ro.name; r.team = ro.team; r.agent = ro.agent; r.bot = !!ro.bot; }
      if (id !== this.myId) {
        r.buf.push([now, x, y, z, yaw, pitch, cr]);
        if (r.buf.length > 40) r.buf.shift();
      }
      r.gun = gun; r.hp = hp; r.armor = armor; r.alive = !!(flags & 1); r.hasCore = !!(flags & 2); r.revealed = !!(flags & 4);
      r.over = !!(flags & 8); r.concuss = !!(flags & 32); r.slow = !!(flags & 64);
      r.credits = credits; r.k = k; r.d = d; r.a = as; r.ult = ult; r.v = [vx, 0, vz];
    }
    this.recs.forEach((r, id) => { if (!seen.has(id)) this.removeRec(id); });
  }

  removeRec(id) {
    this.recs.delete(id);
    const av = this.avatars.get(id);
    if (av) { this.dropAvatar(av); this.avatars.delete(id); }
  }

  // guests: draw others ~110 ms in the past, between two snapshots
  interpolate(dt) {
    const t = performance.now() - 110;
    this.recs.forEach((r) => {
      if (r.id === this.myId) { r.p = this.me.p; r.rp = this.me.p; r.yaw = this.me.yaw; r.pitch = this.me.pitch; r.crouch = this.me.crouch; return; }
      const b = r.buf;
      if (!b.length) return;
      let i = b.length - 1;
      while (i > 0 && b[i - 1][0] > t) i--;
      const B = b[i];
      const A = i > 0 ? b[i - 1] : B;
      let x; let y; let z; let yaw; let pitch; let cr;
      if (t >= B[0]) {
        // past the newest snapshot: extrapolate a little
        const e = Math.min(0.15, (t - B[0]) / 1000);
        x = B[1] + r.v[0] * e; y = B[2]; z = B[3] + r.v[2] * e; yaw = B[4]; pitch = B[5]; cr = B[6];
      } else {
        const k = A === B ? 1 : clamp((t - A[0]) / (B[0] - A[0]), 0, 1);
        x = A[1] + (B[1] - A[1]) * k; y = A[2] + (B[2] - A[2]) * k; z = A[3] + (B[3] - A[3]) * k;
        yaw = A[4] + wrapAngle(B[4] - A[4]) * k; pitch = A[5] + (B[5] - A[5]) * k; cr = A[6] + (B[6] - A[6]) * k;
      }
      r.rp = [x, y, z]; r.p = r.rp; r.yaw = yaw; r.pitch = pitch; r.crouch = cr;
    });
    if (this.st.phaseT > 0) this.st.phaseT -= dt;
  }

  // ───────────── the local player ─────────────
  eyePos() { return [this.me.p[0], this.me.p[1] + eyeHeight(this.me.crouch), this.me.p[2]]; }

  aimDir() { return dirFrom(this.me.yaw + this.gun.kick.y * DEG, clamp(this.me.pitch + this.gun.kick.p * DEG, -1.55, 1.55)); }

  controlsActive() { return this.mode === 'play' && !this.uiOpen && !this.chatting && !this.paused; }

  spawnRect() {
    const side = this.mySide();
    const a = this.level.def.areas.find((x) => x.n === (side === 'atk' ? 'Attacker Spawn' : 'Defender Spawn'));
    return a ? a.r : null;
  }

  updateMe(dt) {
    const M = this.me;
    const st = this.st;
    const rec = this.recs.get(this.myId);
    const ctl = this.controlsActive() && M.alive;
    const K = (c) => this.keys.has(c);
    let f = 0; let s = 0; let walk = false; let crouch = false; let jump = false;
    if (ctl) {
      f = (K('KeyW') || K('ArrowUp') ? 1 : 0) - (K('KeyS') || K('ArrowDown') ? 1 : 0) - this.tc.sy;
      s = (K('KeyD') || K('ArrowRight') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') ? 1 : 0) + this.tc.sx;
      walk = K('ShiftLeft') || K('ShiftRight');
      crouch = K('ControlLeft') || K('ControlRight') || K('KeyZ') || this.tc.crouch;
      jump = this.jumpQ > 0;
    }
    this.jumpQ = Math.max(0, (this.jumpQ || 0) - dt);
    if (!M.alive) return;
    if (this.acting) { f = 0; s = 0; jump = false; }
    const gid = this.curGunId();
    let mul = (WEAPON[gid] && WEAPON[gid].speed) || 1;
    if (rec && rec.slow) mul *= 0.55;
    if (rec && rec.concuss) mul *= 0.8;
    if (rec && rec.over) mul *= 1.15;
    if (this.gun.scope || this.gun.ads) mul *= 0.76;
    const wasGround = M.ground;
    M.jumped = false;
    moveBody(this.level, M, { f, s, jump, crouch, walk }, dt, mul);
    if (M.jumped) this.jumpQ = 0;
    if (!wasGround && M.ground && (M.landSpeed || 0) > 6) this.sound.land(null);
    // buy phase: stay inside spawn
    if (st.mode === 'core' && st.phase === 'buy') {
      const r = this.spawnRect();
      if (r) { M.p[0] = clamp(M.p[0], r[0] + 0.4, r[2] - 0.4); M.p[2] = clamp(M.p[2], r[1] + 0.4, r[3] - 0.4); }
    }
    const sp = Math.hypot(M.v[0], M.v[2]);
    this.stepT = (this.stepT || 0) - dt;
    if (M.ground && sp > 3.3 && !walk && M.crouch < 0.5 && this.stepT <= 0) { this.stepT = 0.34; this.sound.step(null, true); }
    // plant / defuse (hold F)
    const want = ctl && (K('KeyF') || this.tc.use);
    const c = st.core;
    const site = this.level.siteAt(M.p[0], M.p[2]);
    const canPlant = st.mode === 'core' && st.phase === 'live' && c.state === 'carried' && c.carrier === this.myId && site && M.ground;
    const canDefuse = st.mode === 'core' && c.state === 'planted' && this.mySide() === 'def' && Math.hypot(M.p[0] - c.p[0], M.p[2] - c.p[2]) < 2.1 && (!c.defuser || c.defuser === this.myId);
    if (want && !this.acting) {
      if (canPlant) { this.acting = 'plant'; this.req({ t: 'plant', s: true }); } else if (canDefuse) { this.acting = 'defuse'; this.req({ t: 'defuse', s: true }); }
    }
    if (this.acting && (!want || (this.acting === 'plant' && c.state !== 'planting' && c.state !== 'carried') || (this.acting === 'defuse' && c.state !== 'planted'))) {
      if (want === false || this.acting) this.req({ t: this.acting, s: false });
      this.acting = null;
    }
    this.canPlant = canPlant;
    this.canDefuse = canDefuse;
    // report where I am
    const S = { p: M.p.slice(), v: M.v.slice(), yaw: M.yaw, pitch: M.pitch, crouch: M.crouch, cur: this.slot, ground: M.ground };
    if (this.match) this.handleReq(this.myId, { t: 'st', s: S });
    else {
      this.sendT = (this.sendT || 0) - dt;
      if (this.sendT <= 0) { this.sendT = 0.05; this.req({ t: 'st', s: S }); }
    }
  }

  updateWeapon(dt) {
    const M = this.me;
    const id = this.curGunId();
    if (id !== this.heldId) {
      this.heldId = id;
      this.gun.equip(id);
      this.buildVM(id);
    }
    const ctl = this.controlsActive() && M.alive;
    const trigger = ctl && (this.mouse.down || this.tc.fire) && !this.armedAb && !this.acting;
    const sp = Math.hypot(M.v[0], M.v[2]);
    const st = { speed: sp, ground: M.ground, crouch: M.crouch };
    const rec = this.recs.get(this.myId);
    if (rec && rec.over && this.gun.reloadT > 0.05) this.gun.reloadT = 0.05;
    const n = M.alive ? this.gun.update(dt, id, trigger, st) : 0;
    for (let k = 0; k < n; k++) this.fireShot(id, st);
    this.gun.applyRecoil();
    const w = WEAPON[id];
    if (w.mag && M.alive && !trigger && !this.gun.busy()) {
      const m = this.gun.mag(id);
      if (m[0] === 0 && m[1] > 0) this.gun.reload(id, rec && rec.over);
    }
    this.spreadNow = this.gun.spread(id, st);
  }

  fireShot(id, st) {
    const w = WEAPON[id];
    const o = this.eyePos();
    const aim = this.aimDir();
    if (w.cat === 'melee') { this.knifeAttack(o, aim); return; }
    const spread = w.pellets ? w.spread.base : Math.max(w.spread.base * 0.5, this.gun.spread(id, st) - w.spread.shot);
    const ends = []; const hits = []; const objs = [];
    let anyHit = false; let head = false;
    const pellets = w.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const dir = spreadDir(aim, spread * (w.pellets ? 0.5 + Math.random() * 0.5 : 1));
      const wall = this.level.raycast(o, dir, 200);
      let maxT = wall ? wall.t : 200;
      let best = null;
      this.recs.forEach((r) => {
        if (!r.alive || !this.isEnemy(r)) return;
        const h = rayPlayer(o, dir, r.rp, r.crouch, maxT);
        if (h && (!best || h.t < best.t)) best = { ...h, r };
      });
      this.turrets.forEach((t) => {
        if (t.team === this.myTeam() && this.st.mode === 'core') return;
        const dx = t.p[0] - o[0]; const dy = t.p[1] + 0.6 - o[1]; const dz = t.p[2] - o[2];
        const b = dx * dir[0] + dy * dir[1] + dz * dir[2];
        if (b < 0 || b > maxT) return;
        if (dx * dx + dy * dy + dz * dz - b * b < 0.36 && (!best || b < best.t)) best = { t: b, turret: t };
      });
      if (best) {
        maxT = best.t;
        if (best.turret) objs.push({ id: best.turret.id, dmg: w.dmg[1] });
        else { hits.push({ id: best.r.id, part: best.part, dist: best.t }); anyHit = true; if (best.part === 0) head = true; }
      } else if (wall && wall.box && this.boxWall.has(wall.box)) objs.push({ id: this.boxWall.get(wall.box), dmg: w.dmg[1] });
      const end = [o[0] + dir[0] * maxT, o[1] + dir[1] * maxT, o[2] + dir[2] * maxT];
      ends.push(end);
      if (best && !best.turret) this.fx.impact(end, null, true);
      else if (wall && maxT === wall.t) this.fx.impact(end, [wall.nx, wall.ny, wall.nz]);
      if (k < 3) this.fx.tracer(this.muzzleWorld(), end);
    }
    this.req({ t: 'fire', f: { w: id, o, ends, hits, objs, n: 1 } });
    this.sound.shot(w, null);
    this.fx.muzzle(this.muzzleWorld(), 0.5);
    this.vmFlash = 0.05;
    this.vmAnim.kick = 1;
    this.stats.shots++;
    if (anyHit) {
      this.stats.hits++;
      if (head) this.stats.heads++;
      this.hud.hitmarker(false);
      this.sound.hit(head, false);
    }
  }

  muzzleWorld() {
    const c = this.camera;
    const v = new THREE.Vector3(0.12, -0.1, -0.6).applyQuaternion(c.quaternion).add(c.position);
    return v.toArray();
  }

  knifeAttack(o, aim) {
    this.sound.shot(WEAPON.knife, null);
    let best = null;
    this.recs.forEach((r) => {
      if (!r.alive || !this.isEnemy(r)) return;
      const c = [r.rp[0], r.rp[1] + 1.1, r.rp[2]];
      const dx = c[0] - o[0]; const dy = c[1] - o[1]; const dz = c[2] - o[2];
      const d = Math.hypot(dx, dz);
      if (d > 2.4) return;
      const L = Math.hypot(dx, dy, dz) || 1;
      if ((dx * aim[0] + dy * aim[1] + dz * aim[2]) / L < 0.75) return;
      if (!this.level.los(o, c)) return;
      if (!best || d < best.d) best = { r, d };
    });
    if (!best) return;
    const t = best.r;
    const back = (-Math.sin(t.yaw)) * (-Math.sin(this.me.yaw)) + (-Math.cos(t.yaw)) * (-Math.cos(this.me.yaw)) > 0.5;
    this.req({ t: 'knife', target: t.id, back });
    this.hud.hitmarker(false);
    this.sound.hit(false, false);
    this.fx.impact([t.rp[0], t.rp[1] + 1.2, t.rp[2]], null, true);
  }

  // abilities: most are "equipped" with their key and used with a click
  abilityKey(slot) {
    if (!this.controlsActive() || !this.me.alive) return;
    const lo = this.myLoad();
    if (!lo) return;
    const ag = AGENT[lo.agent] || AGENT.vex;
    const ab = ag.abilities[slot];
    const st = this.st;
    if (st.mode === 'dm') { this.hud.message('NO ABILITIES', 'DEATHMATCH IS GUNS ONLY', '', 1200); return; }
    const free = st.mode === 'range';
    const ready = slot === 'x' ? lo.ult >= ab.points || free : (lo.charges[slot] || 0) > 0 || free;
    if (!ready) { this.sound.sting('deny'); return; }
    if (st.mode === 'core' && st.phase === 'buy' && !['wall', 'turret', 'smoke', 'slow', 'heal', 'trap'].includes(ab.kind)) { this.sound.sting('deny'); return; }
    if (this.armedAb === slot || INSTANT.has(ab.kind)) { this.useAbility(slot); return; }
    this.armedAb = slot;
    this.sound.sting('click');
  }

  useAbility(slot) {
    this.req({ t: 'ab', slot, o: this.eyePos(), d: this.aimDir() });
    this.mstats.abilities++;
    this.armedAb = null;
    this.marker.g.visible = false;
    this.vmAnim.equip = 0.6;
  }

  updateMarker() {
    const mk = this.marker;
    if (!this.armedAb || !this.me.alive) { mk.g.visible = false; return; }
    const lo = this.myLoad();
    const ab = AGENT[lo.agent].abilities[this.armedAb];
    const o = this.eyePos();
    const d = this.aimDir();
    mk.g.visible = true;
    mk.ring.visible = false; mk.box.visible = false; mk.arc.visible = false;
    const aimPoint = (maxD) => {
      const h = this.level.raycast(o, d, maxD);
      const t = h ? h.t - 0.3 : maxD;
      const x = o[0] + d[0] * t; const z = o[2] + d[2] * t;
      return [x, this.level.groundUnder(x, z, 0.1, (h ? h.y : o[1]) + 0.5), z];
    };
    mk.g.position.set(0, 0, 0);
    if (ab.kind === 'wall') {
      const len = lo.agent === 'solace' ? 5 : 7;
      const x = o[0] + d[0] * 3.5; const z = o[2] + d[2] * 3.5;
      const g = this.level.groundUnder(x, z, 0.2, this.me.p[1] + 1);
      const alongX = Math.abs(d[2]) > Math.abs(d[0]);
      mk.box.visible = true;
      mk.box.scale.set(alongX ? len : 0.5, 3.2, alongX ? 0.5 : len);
      mk.box.position.set(x, g + 1.6, z);
    } else if (ab.aimed || ab.kind === 'turret' || ab.kind === 'eclipse' || ab.kind === 'trap') {
      const pt = aimPoint(ab.kind === 'turret' ? 6 : ab.kind === 'trap' ? 8 : ab.kind === 'orbital' ? 70 : ab.kind === 'eclipse' ? 60 : 45);
      mk.ring.visible = true;
      const r = ab.kind === 'orbital' ? 5 : ab.kind === 'turret' ? 0.5 : ab.kind === 'trap' ? 3.5 : ab.kind === 'lockdown' ? 11 : 4.6;
      mk.ring.scale.setScalar(r);
      mk.ring.position.set(pt[0], pt[1] + 0.05, pt[2]);
    } else if (THROWS[ab.kind]) {
      const [speed, lift, fuse] = THROWS[ab.kind];
      const pr = { p: [...o], v: throwVelocity(d, speed, lift), stick: ab.kind === 'shock' || ab.kind === 'recon' };
      const pos = mk.arc.geometry.attributes.position;
      let n = 0;
      for (let t = 0; t < Math.min(fuse, 3) && n < 80; t += 0.04) {
        pos.setXYZ(n++, pr.p[0], pr.p[1], pr.p[2]);
        stepProjectile(this.level, pr, 0.04);
        if (pr.landed) break;
      }
      pos.setXYZ(n++, pr.p[0], pr.p[1], pr.p[2]);
      for (let k = n; k < 80; k++) pos.setXYZ(k, pr.p[0], pr.p[1], pr.p[2]);
      pos.needsUpdate = true;
      mk.arc.geometry.setDrawRange(0, n);
      mk.arc.computeLineDistances();
      mk.arc.visible = true;
      mk.ring.visible = true;
      mk.ring.scale.setScalar(ab.kind === 'molly' ? 3.4 : ab.kind === 'slow' ? 4.2 : 1.2);
      mk.ring.position.set(pr.p[0], this.level.groundUnder(pr.p[0], pr.p[2], 0.1, pr.p[1] + 0.5) + 0.05, pr.p[2]);
    } else mk.g.visible = false;
  }

  // ───────────── viewmodel ─────────────
  buildVM(gunId) {
    if (this.vm) { this.vmScene.remove(this.vm.group); disposeTree(this.vm.group); }
    const lo = this.myLoad();
    const g = buildViewModel(gunId, lo ? lo.agent : this.S.agent, skinFor(this.save, gunId));
    const muzzle = g.userData.gun.userData.muzzle;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glow, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flash.scale.setScalar(0.22);
    flash.visible = false;
    muzzle.add(flash);
    this.vmScene.add(g);
    this.vm = { group: g, gunId, flash, cat: WEAPON[gunId].cat };
  }

  updateVM(dt) {
    const vm = this.vm;
    if (!vm) return;
    const A = this.vmAnim;
    const M = this.me;
    const w = WEAPON[vm.gunId];
    const scoped = this.gun.scope && w.cat === 'sniper';
    vm.group.visible = M.alive && !scoped && this.mode === 'play';
    const base = VM_POS[w.cat] || VM_POS.rifle;
    const sp = Math.hypot(M.v[0], M.v[2]);
    A.bob += dt * (M.ground ? sp * 1.9 : 0);
    const bobAmt = clamp(sp / MOVE.run, 0, 1) * (M.ground ? 1 : 0.2);
    A.kick = Math.max(0, A.kick - dt * 9);
    A.swayX = damp(A.swayX, 0, 8, dt);
    A.swayY = damp(A.swayY, 0, 8, dt);
    A.equip = Math.max(0, A.equip - dt);
    const eq = this.gun.equipT > 0 ? clamp(this.gun.equipT / (w.equip || 1), 0, 1) : A.equip;
    const ads = this.gun.ads ? 1 : 0;
    A.ads = damp(A.ads || 0, ads, 14, dt);
    let x = base[0] * (1 - A.ads * 0.75) + Math.sin(A.bob) * 0.012 * bobAmt + A.swayX;
    let y = base[1] + A.ads * 0.04 - Math.abs(Math.cos(A.bob)) * 0.012 * bobAmt + A.swayY - eq * 0.25;
    let z = base[2] + A.kick * 0.045;
    let rx = A.kick * 0.09 - eq * 0.5; let ry = 0; let rz = 0;
    if (this.gun.reloadT > 0 && this.gun.reloadLen) {
      const t = 1 - this.gun.reloadT / this.gun.reloadLen;
      const s = Math.sin(t * Math.PI);
      rz = s * 0.55; rx += s * 0.25; y -= s * 0.06;
      const mag = vm.group.userData.gun.userData.mag;
      if (mag) mag.position.y = (mag.userData.y0 ?? (mag.userData.y0 = mag.position.y)) - (t > 0.2 && t < 0.75 ? 0.25 : 0);
    }
    if (w.cat === 'melee') {
      const s = this.gun.swing > 0 ? Math.sin((1 - this.gun.swing / 0.35) * Math.PI) : 0;
      ry = s * 0.9; rz = -s * 0.6; x -= s * 0.1; z -= s * 0.08;
      rx += 0.25;
    }
    if (this.armedAb) { y -= 0.12; rx -= 0.3; }
    vm.group.position.set(x, y, z);
    vm.group.rotation.set(rx, ry, rz);
    const sl = vm.group.userData.gun.userData.slide; // slide / pump cycles with each shot
    if (sl) sl.position.z = sl.userData.z0 + Math.min(1, A.kick * 1.6) * (w.cat === 'shotgun' ? 0.06 : 0.025);
    this.vmFlash = Math.max(0, (this.vmFlash || 0) - dt);
    vm.flash.visible = this.vmFlash > 0;
    if (vm.flash.visible) vm.flash.material.rotation = Math.random() * 6;
  }

  // ───────────── other players ─────────────
  avatar(r) {
    let av = this.avatars.get(r.id);
    const enemy = this.isEnemy(r);
    if (av && (av.agent !== r.agent || av.enemy !== enemy)) { this.dropAvatar(av); av = null; }
    if (!av) {
      const rig = buildAgent(r.agent, r.team, { rim: enemy ? '#ff2236' : '#06302c', detail: this.S.quality });
      rig.root.traverse((o) => { o.castShadow = false; if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 0.6; });
      const blob = new THREE.Mesh(this.blobGeo || (this.blobGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2)), this.blobMat || (this.blobMat = this.makeBlobMat()));
      blob.renderOrder = 1;
      this.scene.add(blob);
      this.scene.add(rig.root);
      const tag = nameTag(r.name, enemy ? '#ff8a96' : '#7ff5e2');
      tag.position.y = 2.15;
      rig.root.add(tag);
      const mark = diamond('#ff3344');
      mark.position.y = 2.35;
      rig.root.add(mark);
      av = { rig, agent: r.agent, enemy, tag, mark, blob, recoil: 0, flinch: 0, stepT: Math.random() * 0.3 };
      this.avatars.set(r.id, av);
    }
    return av;
  }

  makeBlobMat() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  dropAvatar(av) {
    if (av.blob) this.scene.remove(av.blob);
    this.scene.remove(av.rig.root);
    disposeTree(av.rig.root);
  }

  updateAvatars(dt) {
    const meP = this.me.p;
    this.recs.forEach((r) => {
      const self = r.id === this.myId;
      if (self && (this.me.alive || this.mode !== 'play')) { const a = this.avatars.get(r.id); if (a) a.rig.root.visible = false; return; }
      const av = this.avatar(r);
      const root = av.rig.root;
      const hidden = this.specId === r.id && !this.me.alive && this.deathT > 2.4;
      root.visible = !hidden;
      av.blob.visible = !hidden;
      if (hidden) return;
      const p = self ? this.deathPos || meP : r.rp;
      root.position.set(p[0], p[1], p[2]);
      const gy = this.level.topAt(p[0], p[2]);
      av.blob.position.set(p[0], gy + 0.02, p[2]);
      av.blob.material.opacity = clamp(1 - (p[1] - gy) / 2, 0, 1);
      root.rotation.y = r.yaw;
      setAgentGun(av.rig, r.gun || 'wasp', self ? skinFor(this.save, r.gun || 'wasp') : null);
      av.recoil = Math.max(0, av.recoil - dt * 8);
      const sp = Math.hypot(r.v[0], r.v[2]);
      const fx = -Math.sin(r.yaw); const fz = -Math.cos(r.yaw);
      const mz = sp > 0.1 ? (r.v[0] * fx + r.v[2] * fz) / sp : 0;
      const mx = sp > 0.1 ? (r.v[0] * -fz + r.v[2] * fx) / sp : 0;
      const ground = p[1] - this.level.topAt(p[0], p[2]) < 0.08;
      animateAgent(av.rig, { speed: sp, mx, mz, crouch: r.crouch, pitch: r.pitch, dt, aimRecoil: av.recoil, alive: r.alive, ground, deathDir: av.deathDir });
      // names over allies, a marker over revealed enemies
      av.tag.visible = r.alive && (!av.enemy || this.st.mode === 'range');
      av.mark.visible = r.alive && av.enemy && r.revealed;
      // footsteps of others
      if (r.alive && !self && sp > 3.4) {
        av.stepT -= dt;
        const d = Math.hypot(p[0] - meP[0], p[2] - meP[2]);
        if (av.stepT <= 0) { av.stepT = 0.34; if (d < 32) this.sound.step(p, true); }
      }
    });
  }

  // ───────────── camera ─────────────
  updateCamera(dt) {
    const cam = this.camera;
    const M = this.me;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake;
    const rec = this.recs.get(this.myId);
    let zoom = 1;
    const w = WEAPON[this.heldId || 'wasp'];
    if (M.alive) {
      const e = this.eyePos();
      cam.position.set(e[0], e[1], e[2]);
      let wob = 0;
      if (rec && rec.concuss) wob = Math.sin(this.time * 3.1) * 0.05;
      cam.rotation.set(clamp(M.pitch + this.gun.kick.p * DEG, -1.55, 1.55) + (Math.random() - 0.5) * sh * 0.02 + wob * 0.5, M.yaw + this.gun.kick.y * DEG + (Math.random() - 0.5) * sh * 0.02, wob);
      if (this.gun.scope && w.scope) zoom = w.scope[this.gun.scope - 1];
      else if (this.gun.ads) zoom = 1.25;
    } else {
      this.deathT += dt;
      const corpse = this.deathPos || M.p;
      const mates = this.st.mode === 'core' ? [...this.recs.values()].filter((r) => r.alive && r.id !== this.myId && r.team === this.myTeam()) : [];
      if (this.deathT > 2.4 && mates.length) {
        if (!this.specId || !mates.find((r) => r.id === this.specId)) this.specId = mates[0].id;
        const r = this.recs.get(this.specId);
        cam.position.set(r.rp[0], r.rp[1] + eyeHeight(r.crouch), r.rp[2]);
        cam.rotation.set(r.pitch, r.yaw, 0);
        this.hud.el.spec.hidden = false;
        this.hud.set('spec', this.hud.el.spec, `SPECTATING ${r.name.toUpperCase()} · CLICK FOR NEXT`);
      } else {
        // death cam: rise above the body, look toward the killer if we can
        const k = this.killerId && this.recs.get(this.killerId);
        const t = Math.min(1, this.deathT / 1.2);
        const back = 2.5 + t * 1.5;
        const yaw = M.yaw;
        const px = corpse[0] + Math.sin(yaw) * back; const pz = corpse[2] + Math.cos(yaw) * back;
        const top = this.level.topAt(px, pz);
        cam.position.set(px, Math.max(corpse[1] + 1.6 + t * 1.6, top + 0.5), pz);
        const look = k && k.alive ? new THREE.Vector3(k.rp[0], k.rp[1] + 1.2, k.rp[2]) : new THREE.Vector3(corpse[0], corpse[1] + 0.5, corpse[2]);
        cam.lookAt(look);
        cam.rotation.order = 'YXZ';
        this.hud.el.spec.hidden = this.st.mode === 'core';
        if (this.st.mode !== 'core') this.hud.set('spec', this.hud.el.spec, 'RESPAWNING…');
      }
    }
    this.updateFov(zoom);
    this.hud.el.scope.hidden = !(M.alive && this.gun.scope && w.cat === 'sniper');
    this.sound.listen(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y);
  }

  // menu background: a slow flight over the map
  menuCamera() {
    const t = this.time * 0.045;
    const cam = this.camera;
    cam.position.set(Math.sin(t) * 52, 22 + Math.sin(t * 1.7) * 4, Math.cos(t) * 58);
    cam.lookAt(Math.sin(t + 0.9) * 10, 0, Math.cos(t + 0.9) * 10);
    this.updateFov(1);
    if (this.vm) this.vm.group.visible = false;
  }

  // ───────────── world objects: the Core ─────────────
  updateCore(dt) {
    const c = this.st.core;
    const o = this.coreObj;
    let p = null;
    if (c.state === 'dropped' || c.state === 'planted' || c.state === 'detonated') p = c.p;
    else if (c.state === 'planting') { const r = this.recs.get(c.carrier); if (r) p = r.id === this.myId ? this.me.p : r.rp; }
    o.visible = !!p && c.state !== 'detonated' && this.st.mode === 'core';
    if (!o.visible) return;
    o.position.set(p[0], p[1], p[2]);
    const g = o.userData.glow;
    if (c.state === 'planted') {
      const urg = 1 - clamp(c.fuse / TIMES.fuse, 0, 1);
      const period = 1.0 - urg * 0.86;
      this.beepT = (this.beepT || 0) - dt;
      if (this.beepT <= 0) { this.beepT = period; this.sound.coreBeep(c.p, urg); g.emissiveIntensity = 6; }
      g.emissiveIntensity = Math.max(1.5, g.emissiveIntensity - dt * 20);
      o.rotation.y += dt * (1 + urg * 4);
    } else { g.emissiveIntensity = 2; o.rotation.y += dt * 0.5; }
  }

  smokeBlocks(a, b) {
    for (const z of this.smokes.values()) {
      const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
      const L2 = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp(((z.p[0] - a[0]) * dx + (z.p[1] - a[1]) * dy + (z.p[2] - a[2]) * dz) / L2, 0, 1);
      const px = a[0] + dx * t - z.p[0]; const py = a[1] + dy * t - z.p[1]; const pz = a[2] + dz * t - z.p[2];
      if (px * px + py * py + pz * pz < z.r * z.r * 0.85) return true;
    }
    return false;
  }

  // ───────────── HUD ─────────────
  updateHUD(dt) {
    const H = this.hud;
    const E = H.el;
    const st = this.st;
    const me = this.recs.get(this.myId);
    if (!me) return;
    const myTeam = me.team;
    const other = myTeam === 'red' ? 'blue' : 'red';
    const side = st.sides[myTeam];
    // top bar
    if (st.mode === 'core') {
      H.set('s1', E.s1, st.score[myTeam]);
      H.set('s2', E.s2, st.score[other]);
    } else if (st.mode === 'dm') {
      let top = 0;
      this.recs.forEach((r) => { if (r.id !== this.myId) top = Math.max(top, r.k); });
      H.set('s1', E.s1, me.k);
      H.set('s2', E.s2, top);
    } else { H.set('s1', E.s1, this.stats.kills); H.set('s2', E.s2, ''); }
    let t = '';
    if (st.mode === 'range') t = '∞';
    else if (st.phase === 'planted') t = '◆';
    else if (st.phase === 'end' || st.phase === 'over') t = '';
    else t = UI.clock(st.phaseT);
    H.set('time', E.time, t);
    E.time.classList.toggle('core', st.phase === 'planted');
    let ph = '';
    if (st.mode === 'core') ph = `${st.phase === 'buy' ? 'BUY PHASE · ' : ''}ROUND ${st.round} · ${side === 'atk' ? 'ATTACK' : 'DEFEND'}${st.round === st.toWin * 2 - 1 ? ' · MATCH POINT' : ''}`;
    else if (st.mode === 'dm') ph = 'DEATHMATCH · FIRST TO 30';
    else {
      const acc = this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
      const hs = this.stats.hits ? Math.round((this.stats.heads / this.stats.hits) * 100) : 0;
      ph = `PRACTICE RANGE · ACCURACY ${acc}% · HEADSHOTS ${hs}% · [M] MOVING TARGETS ${this.match && this.match.rangeMove ? 'ON' : 'OFF'} · [N] RESET`;
    }
    H.set('ph', E.ph, ph);
    this.teamT = (this.teamT || 0) - dt;
    if (this.teamT <= 0) {
      this.teamT = 0.25;
      H.teams([...this.recs.values()], myTeam, st.mode);
    }
    // health / shields
    H.set('hp', E.hp, Math.max(0, Math.ceil(me.hp)));
    H.set('ar', E.ar, me.armor > 0 ? `◈ ${Math.ceil(me.armor)}` : '');
    const hpw = `${clamp(me.hp, 0, 100)}%`;
    if (H.cache.hpw !== hpw) { H.cache.hpw = hpw; E.hpbar.style.width = hpw; E.hpbar.style.background = me.hp < 30 ? '#ff4655' : '#ece8e1'; }
    // abilities
    const lo = this.myLoad();
    if (lo) {
      const ag = AGENT[lo.agent];
      const charges = st.mode === 'range' ? { c: ag.abilities.c.max, q: ag.abilities.q.max, e: ag.abilities.e.max } : lo.charges;
      const ult = st.mode === 'range' ? ag.abilities.x.points : lo.ult;
      E.abil.style.display = st.mode === 'dm' ? 'none' : '';
      H.abilities(lo.agent, charges, ult, this.armedAb);
      H.set('credits', E.credits, st.mode === 'core' && (st.phase === 'buy' || this.uiOpen === 'buy') ? `¤ ${lo.credits}` : '');
    }
    // ammo
    const gid = this.heldId || 'wasp';
    const w = WEAPON[gid];
    if (w.mag) {
      const m = this.gun.mag(gid);
      H.set('ammo', E.ammo, this.gun.reloadT > 0 ? '…' : m[0]);
      H.set('res', E.reserve, `/ ${m[1]}`);
    } else { H.set('ammo', E.ammo, '—'); H.set('res', E.reserve, ''); }
    H.set('wname', E.wname, w.name.toUpperCase());
    // context tip
    let tip = '';
    const c = st.core;
    if (this.me.alive) {
      if (this.armedAb && lo) tip = `${AGENT[lo.agent].abilities[this.armedAb].name.toUpperCase()} · ${this.isTouch ? 'TAP FIRE TO USE' : 'CLICK OR PRESS AGAIN TO USE · RIGHT CLICK TO CANCEL'}`;
      else if (st.mode === 'core' && st.phase === 'buy') tip = this.isTouch ? 'BUY PHASE · TAP BUY' : 'BUY PHASE · PRESS B TO BUY';
      else if (this.canPlant && !this.acting) tip = this.isTouch ? 'HOLD F TO PLANT THE CORE' : 'HOLD F TO PLANT THE CORE';
      else if (this.canDefuse && !this.acting) tip = 'HOLD F TO DEFUSE';
      else if (st.mode === 'core' && c.carrier === this.myId && c.state === 'carried') tip = 'YOU CARRY THE CORE · PLANT IT ON A OR B';
      else if ((st.mode === 'dm' || st.mode === 'range') && this.time < (this.tipUntil || 0)) tip = this.isTouch ? 'TAP BUY TO PICK A WEAPON' : 'PRESS B TO PICK A WEAPON';
    }
    E.tip.hidden = !tip;
    H.set('tip', E.tip, tip);
    // plant / defuse progress
    let act = null;
    if (c.state === 'planting' && c.carrier === this.myId) act = ['PLANTING', c.plantT / TIMES.plant];
    else if (c.state === 'planted' && c.defuser === this.myId) act = [c.defuseT >= TIMES.defuseHalf ? 'DEFUSING · HALF' : 'DEFUSING', c.defuseT / TIMES.defuse];
    E.act.hidden = !act;
    if (act) { H.set('actl', E.act.querySelector('span'), act[0]); E.act.querySelector('i').style.width = `${clamp(act[1], 0, 1) * 100}%`; }
    // crosshair
    const pxPerDeg = this.viewH / (this.vfov || 60);
    H.crosshair(this.S.ch, this.me.alive ? Math.max(0, (this.spreadNow || 0) - (w.spread ? w.spread.base : 0)) * pxPerDeg * 0.6 : 0);
    E.xh.style.display = this.me.alive && !(this.gun.scope && w.cat === 'sniper') && !this.uiOpen ? '' : 'none';
    // flashes and dazes
    this.blind = Math.max(0, this.blind - dt);
    E.blind.style.opacity = clamp(this.blind / 1.2, 0, 1).toFixed(3);
    const dazed = me.concuss && this.me.alive;
    if (H.cache.daze !== dazed) { H.cache.daze = dazed; this.renderer.domElement.style.filter = dazed ? 'blur(1.6px) saturate(.7)' : ''; }
    // inside a smoke: the screen fills with grey
    let inSmoke = 0;
    const cp = this.camera.position;
    this.smokes.forEach((z) => {
      const d = Math.hypot(cp.x - z.p[0], cp.y - z.p[1], cp.z - z.p[2]);
      inSmoke = Math.max(inSmoke, clamp((z.r - d) / 1.2, 0, 1));
    });
    const so = (inSmoke * 0.96).toFixed(2);
    if (H.cache.so !== so) { H.cache.so = so; E.smokeov.style.opacity = so; }
    // minimap
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT <= 0) { this.miniT = 1 / 30; this.drawMinimap(); }
    // fps
    E.fps.hidden = !this.S.showFps;
  }

  drawMinimap() {
    const cam = this.me.alive || !this.specId ? { x: this.me.p[0], z: this.me.p[2], yaw: this.me.yaw } : (() => { const r = this.recs.get(this.specId); return r ? { x: r.rp[0], z: r.rp[2], yaw: r.yaw } : { x: this.me.p[0], z: this.me.p[2], yaw: this.me.yaw }; })();
    const dots = [];
    const eye = this.eyePos();
    this.visT = (this.visT || 0) - 1 / 30;
    const recheck = this.visT <= 0;
    if (recheck) this.visT = 0.2;
    this.recs.forEach((r) => {
      if (r.id === this.myId || !r.alive) return;
      const enemy = this.isEnemy(r);
      if (enemy) {
        if (recheck) r.seen = this.me.alive && this.level.los(eye, [r.rp[0], r.rp[1] + 1.3, r.rp[2]]) && !this.smokeBlocks(eye, [r.rp[0], r.rp[1] + 1.3, r.rp[2]]);
        if (!(r.seen || r.revealed || this.st.mode === 'range')) return;
      }
      dots.push({ x: r.rp[0], z: r.rp[2], yaw: r.yaw, color: enemy ? COLORS.atk : COLORS.def, ring: r.hasCore });
    });
    const c = this.st.core;
    const coreP = this.st.mode === 'core' && (c.state === 'dropped' || c.state === 'planted') ? c.p : null;
    this.hud.drawMinimap({ cam, dots, smokes: [...this.smokes.values()], core: coreP });
  }

  // ───────────── frame ─────────────
  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsN = 0; this.fpsT = 0; if (this.S.showFps) this.hud.set('fps', this.hud.el.fps, `${this.fps} FPS · ${Math.round((this.resScale || 1) * 100)}%`); this.autoRes(); }
    try {
      if (this.mode === 'play') this.tick(dt);
      else this.menuCamera();
      this.fx.update(dt, this.camera);
      this.composer.render(dt);
    } catch (e) {
      console.error(e);
    }
  }

  // keep the frame rate up: lower the render resolution when frames are slow, raise it when there is room
  autoRes() {
    if (this.S.dynRes === false || this.mode !== 'play' || document.hidden) return;
    this.resScale = this.resScale || 1;
    this.resHist = (this.resHist || []).concat(this.fps).slice(-4);
    if (this.resHist.length < 4 || this.time - (this.resChanged || 0) < 2.5) return;
    const avg = this.resHist.reduce((a, b) => a + b, 0) / this.resHist.length;
    let next = this.resScale;
    if (avg < 45 && this.resScale > 0.5) next = Math.max(0.5, this.resScale * 0.85);
    else if (avg > 58 && this.resScale < 1) next = Math.min(1, this.resScale * 1.12);
    if (next !== this.resScale) { this.resScale = next; this.resChanged = this.time; this.resHist = []; this.resize(); }
  }

  tick(dt) {
    if (this.net) this.net.tick(dt);
    if (this.match) {
      if (!(this.paused && !this.net)) {
        this.match.update(dt);
        // people pick up a dropped Core by walking over it
        this.match.players.forEach((p) => { if (!p.bot && p.alive && this.match.core.state === 'dropped') this.match.pickupCore(p); });
      }
      this.syncFromMatch();
    } else this.interpolate(dt);
    if (this.paused && !this.net) { this.updateCamera(0); return; }
    if (this.look) this.applyLook();
    this.updateMe(dt);
    this.updateWeapon(dt);
    this.updateMarker();
    this.updateAvatars(dt);
    this.updateCore(dt);
    this.updateCamera(dt);
    this.updateVM(dt);
    this.updateHUD(dt);
    if (this.barriers) this.barriers.visible = this.st.mode === 'core' && this.st.phase === 'buy';
    const tv = this.uiOpen && this.uiOpen !== 'buy' ? 'hidden' : '';
    if (this.hud.el.touch.style.visibility !== tv) this.hud.el.touch.style.visibility = tv;
  }

  // ───────────── input ─────────────
  sens() {
    const w = WEAPON[this.heldId || 'wasp'];
    let z = 1;
    if (this.gun.scope && w.scope) z = w.scope[this.gun.scope - 1];
    else if (this.gun.ads) z = 1.25;
    return 0.0022 * this.S.sens / z;
  }

  turn(dx, dy) {
    if (!this.controlsActive() || !this.me.alive) return;
    const k = this.sens();
    this.me.yaw -= dx * k;
    this.me.pitch = clamp(this.me.pitch - dy * k * (this.S.invertY ? -1 : 1), -1.5, 1.5);
    this.vmAnim.swayX = clamp(this.vmAnim.swayX - dx * 0.00012, -0.03, 0.03);
    this.vmAnim.swayY = clamp(this.vmAnim.swayY + dy * 0.00012, -0.03, 0.03);
  }

  // without pointer lock (some embedded pages block it) the cursor edge keeps turning
  applyLook() {
    if (!this.freeLook || this.locked || !this.controlsActive() || !this.cursor) return;
    const w = this.root.clientWidth; const h = this.root.clientHeight;
    const ex = this.cursor.x < w * 0.04 ? -1 : this.cursor.x > w * 0.96 ? 1 : 0;
    const ey = this.cursor.y < h * 0.05 ? -1 : this.cursor.y > h * 0.95 ? 1 : 0;
    if (ex || ey) this.turn(ex * 14, ey * 8);
  }

  lockPointer() {
    if (this.isTouch) return;
    const el = this.renderer.domElement;
    try {
      const p = el.requestPointerLock && el.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeLook = true; });
    } catch { this.freeLook = true; }
  }

  unlockPointer() {
    if (document.pointerLockElement) try { document.exitPointerLock(); } catch { /* not locked */ }
  }

  bindInput() {
    const root = this.root;
    const canvas = this.renderer.domElement;
    this.onKeyDown = (e) => {
      if (!this.root.isConnected) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        if (this.chatting && e.code === 'Enter') { this.sendChat(); e.preventDefault(); }
        if (this.chatting && e.code === 'Escape') { this.endChat(); e.preventDefault(); }
        return;
      }
      if (this.mode !== 'play') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyB'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.uiOpen === 'buy' || this.uiOpen === 'sb') this.closeUI();
        else if (this.uiOpen === 'pause') this.resume();
        else if (!this.uiOpen) this.pause();
        return;
      }
      if (e.code === 'KeyB') { if (this.uiOpen === 'buy') this.closeUI(); else if (!this.uiOpen) this.openBuy(); return; }
      if (e.code === 'Tab') { if (!this.uiOpen) this.openScoreboard(); return; }
      if (e.code === 'Enter' && this.net && !this.uiOpen) { this.startChat(); return; }
      if (!this.controlsActive()) return;
      if (e.code === 'Space') this.jumpQ = 0.15;
      if (e.code === 'Digit1') this.selectSlot('primary');
      if (e.code === 'Digit2') this.selectSlot('secondary');
      if (e.code === 'Digit3') this.selectSlot('melee');
      if (e.code === 'KeyR') this.reloadNow();
      if (e.code === 'KeyC') this.abilityKey('c');
      if (e.code === 'KeyQ') this.abilityKey('q');
      if (e.code === 'KeyE') this.abilityKey('e');
      if (e.code === 'KeyX') this.abilityKey('x');
      if (e.code === 'KeyM' && this.st.mode === 'range' && this.match) this.match.rangeMove = !this.match.rangeMove;
      if (e.code === 'KeyN' && this.st.mode === 'range') this.stats = { shots: 0, hits: 0, heads: 0, kills: 0 };
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab' && this.uiOpen === 'sb') this.closeUI();
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.onBlur = () => { this.keys.clear(); this.mouse.down = false; };
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'play') return;
      this.sound.init();
      if (!this.locked && !this.freeLook && !this.uiOpen) { this.lockPointer(); return; }
      if (!this.controlsActive()) return;
      if (!this.me.alive) { if (e.button === 0) this.nextSpec(); return; }
      if (e.button === 0) {
        if (this.armedAb) { this.useAbility(this.armedAb); return; }
        this.mouse.down = true;
      } else if (e.button === 2) {
        if (this.armedAb) { this.armedAb = null; return; }
        this.altFire();
      }
    });
    window.addEventListener('mouseup', this.onMouseUp = (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!this.controlsActive()) return;
      const order = ['primary', 'secondary', 'melee'];
      let i = order.indexOf(this.slot);
      for (let k = 0; k < 3; k++) {
        i = (i + (e.deltaY > 0 ? 1 : 2)) % 3;
        if (order[i] !== 'primary' || (this.myLoad() && this.myLoad().guns.primary)) break;
      }
      this.selectSlot(order[i]);
    }, { passive: true });
    this.onMouseMove = (e) => {
      if (this.mode !== 'play') return;
      const r = this.root.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.locked) this.turn(e.movementX || 0, e.movementY || 0);
      else if (this.freeLook) this.turn(clamp(e.movementX || 0, -60, 60), clamp(e.movementY || 0, -60, 60));
    };
    document.addEventListener('mousemove', this.onMouseMove);
    this.onLockChange = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      root.classList.toggle('free', this.freeLook && !this.locked);
      if (was && !this.locked && this.mode === 'play' && !this.uiOpen) this.pause();
    };
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockErr = () => { this.freeLook = true; });
    // menu buttons and settings
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      this.sound.init();
      this.sound.sting('click');
      this.act(el.dataset.act, el.dataset.arg, el);
    });
    root.addEventListener('input', (e) => { const el = e.target.closest('[data-set]'); if (el) this.setSetting(el.dataset.set, el); });
    root.addEventListener('change', (e) => { const el = e.target.closest('[data-set]'); if (el) this.setSetting(el.dataset.set, el); });
    this.onVis = () => { if (document.hidden) this.sound.suspend(); else this.sound.resume(); };
    document.addEventListener('visibilitychange', this.onVis);
  }

  nextSpec() {
    const mates = [...this.recs.values()].filter((r) => r.alive && r.id !== this.myId && r.team === this.myTeam());
    if (!mates.length) return;
    const i = mates.findIndex((r) => r.id === this.specId);
    this.specId = mates[(i + 1) % mates.length].id;
  }

  selectSlot(s) {
    const lo = this.myLoad();
    if (s === 'primary' && !(lo && lo.guns.primary)) return;
    if (this.slot === s) return;
    this.slot = s;
    this.armedAb = null;
  }

  reloadNow() {
    const id = this.curGunId();
    const r = this.recs.get(this.myId);
    this.gun.reload(id, r && r.over);
  }

  altFire() {
    const w = WEAPON[this.heldId || 'wasp'];
    if (this.gun.busy()) return;
    if (w.scope) {
      this.gun.scope = (this.gun.scope + 1) % (w.scope.length + 1);
      this.sound.sting('click');
    } else if (w.cat !== 'melee' && w.cat !== 'shotgun') this.gun.ads = !this.gun.ads;
  }

  // ───────────── touch controls ─────────────
  buildTouch() {
    const T = this.hud.el.touch;
    T.innerHTML = `<div class="look"></div><div class="stick"><i></i></div>
      <button class="fire">FIRE</button><button class="fire2">FIRE</button><button class="jump">JUMP</button><button class="crouch">CROUCH</button>
      <button class="reload">R</button><button class="scope">ZOOM</button><button class="wpn">GUN</button><button class="use">F</button>
      <button class="buy">BUY</button><button class="menu">II</button>`;
    const q = (s) => T.querySelector(s);
    const stick = q('.stick'); const knob = stick.querySelector('i');
    const ids = {};
    const lookStart = (t) => { ids.look = t.identifier; ids.lx = t.clientX; ids.ly = t.clientY; };
    const lookMove = (t) => {
      if (t.identifier !== ids.look) return;
      this.turn((t.clientX - ids.lx) * 2.2, (t.clientY - ids.ly) * 2.2);
      ids.lx = t.clientX; ids.ly = t.clientY;
    };
    const stickSet = (t) => {
      const r = stick.getBoundingClientRect();
      let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.tc.sx = x; this.tc.sy = y;
      knob.style.transform = `translate(${x * 2.6}em,${y * 2.6}em)`;
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; ids.stick = t.identifier; stickSet(t); });
    q('.look').addEventListener('touchstart', (e) => { e.preventDefault(); lookStart(e.changedTouches[0]); if (!this.me.alive) this.nextSpec(); });
    const hold = (sel, on, off) => {
      const b = q(sel);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.sound.init(); b.classList.add('on'); on(e); });
      b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); if (off) off(e); });
      b.addEventListener('touchcancel', () => { b.classList.remove('on'); if (off) off(); });
    };
    ['.fire', '.fire2'].forEach((sel) => hold(sel, (e) => {
      if (sel === '.fire') lookStart(e.changedTouches[0]);
      if (this.armedAb) { this.useAbility(this.armedAb); return; }
      this.tc.fire = true;
    }, () => { this.tc.fire = false; }));
    hold('.jump', () => { this.jumpQ = 0.15; });
    hold('.crouch', () => { this.tc.crouch = !this.tc.crouch; q('.crouch').classList.toggle('on', this.tc.crouch); });
    hold('.reload', () => this.reloadNow());
    hold('.scope', () => this.altFire());
    hold('.wpn', () => {
      const lo = this.myLoad();
      const order = lo && lo.guns.primary ? ['primary', 'secondary', 'melee'] : ['secondary', 'melee'];
      this.selectSlot(order[(order.indexOf(this.slot) + 1) % order.length]);
    });
    hold('.use', () => { this.tc.use = true; }, () => { this.tc.use = false; });
    // the HUD's ability icons double as buttons
    this.hud.el.abil.addEventListener('touchstart', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      e.preventDefault();
      this.sound.init();
      this.abilityKey(b.dataset.slot);
    });
    hold('.buy', () => { if (this.uiOpen === 'buy') this.closeUI(); else if (!this.uiOpen) this.openBuy(); });
    hold('.menu', () => { if (!this.uiOpen) this.pause(); });
    this.onTouchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === ids.stick) stickSet(t);
        lookMove(t);
      }
    };
    this.onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === ids.stick) { ids.stick = null; this.tc.sx = 0; this.tc.sy = 0; knob.style.transform = ''; }
        if (t.identifier === ids.look) ids.look = null;
      }
    };
    T.addEventListener('touchmove', this.onTouchMove, { passive: false });
    T.addEventListener('touchend', this.onTouchEnd);
    T.addEventListener('touchcancel', this.onTouchEnd);
  }

  // ───────────── in-game panels ─────────────
  openBuy() {
    if (this.mode !== 'play' || !this.me.alive) return;
    const st = this.st;
    if (st.mode === 'core' && st.phase !== 'buy') { this.hud.message('', 'BUYING IS ONLY ALLOWED IN THE BUY PHASE', '', 1200); return; }
    this.uiOpen = 'buy';
    this.mouse.down = false;
    this.unlockPointer();
    this.renderBuy();
  }

  renderBuy() {
    const lo = this.myLoad();
    if (!lo) return;
    this.hud.el.screen.innerHTML = this.hud.buyMenu({ agent: lo.agent, guns: lo.guns, credits: lo.credits, armor: lo.armor, charges: lo.charges }, this.st.mode);
  }

  openScoreboard() {
    this.uiOpen = 'sb';
    const list = [...this.recs.values()].map((r) => ({ ...r, kills: r.k, deaths: r.d, assists: r.a, ping: this.net && !r.bot ? this.net.pingOf(r.id) : undefined }));
    this.hud.el.screen.innerHTML = this.hud.scoreboard(list, this.myId, this.st.mode, this.st.score, !!this.net);
  }

  closeUI() {
    const was = this.uiOpen;
    this.uiOpen = null;
    this.hud.el.screen.innerHTML = '';
    if (this.mode === 'play' && was !== 'sb') this.lockPointer();
  }

  pause() {
    this.uiOpen = 'pause';
    this.mouse.down = false;
    this.paused = true;
    this.unlockPointer();
    this.showScreen('pause');
  }

  resume() {
    this.paused = false;
    this.uiOpen = null;
    this.closeScreen();
    this.lockPointer();
  }

  startChat() {
    this.chatting = true;
    this.unlockPointer();
    const inp = document.createElement('input');
    inp.maxLength = 120;
    inp.placeholder = 'Say something… (Enter to send, Esc to cancel)';
    this.hud.el.chat.appendChild(inp);
    this.chatInput = inp;
    setTimeout(() => inp.focus(), 0);
  }

  sendChat() {
    const text = this.chatInput ? this.chatInput.value.trim() : '';
    if (text && this.net) this.net.chat(text);
    this.endChat();
  }

  endChat() {
    this.chatting = false;
    if (this.chatInput) this.chatInput.remove();
    this.chatInput = null;
    this.lockPointer();
  }

  // ───────────── menus ─────────────
  showScreen(name, arg) {
    this.screen = name;
    if (this.mode === 'menu' || name === 'pause' || name === 'results' || name === 'settings') this.unlockPointer();
    this.hud.el.screen.innerHTML = UI.render(name, this, arg);
    if (name === 'online' || name === 'main') {
      const inp = this.hud.el.screen.querySelector('input[name=pname]');
      if (inp) inp.addEventListener('change', () => savePlayerName(inp.value.trim().slice(0, 16)));
    }
  }

  closeScreen() { this.screen = null; this.hud.el.screen.innerHTML = ''; }

  act(a, arg, el) {
    switch (a) {
      case 'screen': this.showScreen(arg); break;
      case 'back': if (this.mode === 'play') this.showScreen('pause'); else this.showScreen('main'); break;
      case 'play': this.tipUntil = this.time + 8; this.startLocal(arg); break;
      case 'agent':
        if (this.net && this.mode === 'menu') { this.net.setAgent(arg); break; }
        this.S.agent = arg; writeSave(this.save); this.showScreen(this.screen === 'agents' ? 'agents' : 'bots'); break;
      case 'opt': {
        const [k, v] = arg.split(':');
        this.S[k] = v; writeSave(this.save);
        if (k === 'quality') this.applySettings(true);
        this.showScreen(this.screen); break;
      }
      case 'resume': this.resume(); break;
      case 'leave': this.toMenu(); break;
      case 'again': {
        const mode = this.session && this.session.mode;
        if (this.session && !this.session.online) this.startLocal(mode);
        else if (this.net) this.net.backToLobby();
        else this.toMenu();
        break;
      }
      case 'buy': {
        if (this.st.mode === 'core') this.req({ t: 'buy', item: arg });
        else if (WEAPON[arg]) this.req({ t: 'pick', gun: arg });
        this.sound.sting('buy');
        break;
      }
      case 'closebuy': this.closeUI(); break;
      case 'fullscreen': {
        const d = document;
        if (d.fullscreenElement) d.exitFullscreen(); else if (this.container.requestFullscreen) this.container.requestFullscreen().catch(() => {});
        break;
      }
      case 'reset-settings': {
        const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        Object.keys(this.S).forEach((k) => delete this.S[k]);
        Object.assign(this.S, s);
        writeSave(this.save);
        this.applySettings(true);
        this.showScreen('settings');
        break;
      }
      case 'online': this.showScreen('online'); break;
      case 'skin': {
        const [gun, skin] = arg.split(':');
        if (!skinUnlocked(this.save, skin)) { this.sound.sting('deny'); break; }
        ensureProgress(this.save).skins[gun] = skin;
        writeSave(this.save);
        this.showScreen('armory', gun);
        break;
      }
      case 'armory-gun': this.showScreen('armory', arg); break;
      default:
        if (a.startsWith('mp-')) {
          if (!this.net) this.net = new Online(this);
          this.net.act(a, arg, el);
        }
    }
  }

  setSetting(key, el) {
    const S = this.S;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (key === 'pname') { savePlayerName(String(v).trim().slice(0, 16)); return; }
    if (key.startsWith('ch.')) S.ch[key.slice(3)] = v;
    else S[key] = v;
    writeSave(this.save);
    const out = el.parentElement && el.parentElement.querySelector('output');
    if (out) out.textContent = el.type === 'range' ? (Number.isInteger(v) ? v : v.toFixed(2)) : '';
    this.applySettings(key === 'quality');
    const pv = this.root.querySelector('.cb-xh-preview');
    if (pv) pv.innerHTML = UI.crosshairPreview(S.ch);
  }

  applySettings(quality) {
    this.sound.setVolume(this.S.volume);
    if (quality) {
      this.applyShadowQuality();
      this.buildComposer();
      this.resize();
    }
    this.hud.cache.xh = null;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.endSession();
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockErr);
    document.removeEventListener('visibilitychange', this.onVis);
    this.unlockPointer();
    this.sound.close();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
    this.envRT.dispose();
    this.pmrem.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.renderer.dispose();
    this.root.remove();
  }
}
