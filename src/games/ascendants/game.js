// Ascendants client: rendering, the third-person camera, input, your hero's movement and flight, other
// heroes with their auras and forms, crates and loot, technique visuals (beams, clashes, gathered spheres),
// the day passing over the island, HUD and menus. A Match (rules + bots) runs here offline and on the host
// online; guests get events and snapshots from the host instead.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GradeShader } from '../corebreach/grade.js';
import {
  POWER, HERO, HEROES, COMBAT, CRATES, ITEMS, MOVE, KI, FORMS, AURAS, EMOTES, MODES, lvCd, clamp, damp, wrapAngle, loadSave, writeSave, esc, level,
  dailyState, CHALLENGES, powerLevel,
} from './data.js';
import { Island, POIS } from './island.js';
import { buildIslandView, GrassField } from './islandview.js';
import { Match, SHIP_H } from './match.js';
import { stepBody, dirOf } from './sim.js';
import { buildHero, animateHero, disposeHero, setForm, setRim } from './hero.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { HUD, CSS, icon } from './hud.js';
import { Online } from './online.js';
import { playerName, savePlayerName } from '../shared/net.js';
import { warmModels } from '../corebreach/models.js';

const MANUAL = typeof location !== 'undefined' && /[?&]manual/.test(location.search);
const MATCH_DAY = 660; // seconds from morning to sunset
const EMOTE_IDS = EMOTES.map((e) => e.id);

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.save = loadSave();
    this.S = this.save.settings;
    this.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    if (this.isTouch && !this.save.touchInit) { this.S.quality = 'low'; this.save.touchInit = true; writeSave(this.save); }
    const root = document.createElement('div');
    root.className = 'asc';
    root.tabIndex = 0;
    root.innerHTML = `<style>${CSS}</style>`;
    container.appendChild(root);
    this.root = root;
    root.classList.toggle('touch', this.isTouch);
    this.v3 = new THREE.Vector3();
    this.sound = new Sound(this.S.volume);
    this.island = new Island();
    this.pois = POIS;
    this.initRenderer();
    this.hud = new HUD(this);
    this.fx = new FX(this.scene, this.island, this.S.quality);
    this.fx.lookup = (id) => { const a = this.avatars.get(id); if (!a || !a.alive) return null; const me = id === this.myId; return { p: a.p, yaw: me ? this.camYaw : a.yaw, pitch: me ? this.camPitch : a.pitch, face: a.face, mode: a.mode }; };
    this.mapImage = this.makeMapImage();
    this.avatars = new Map();
    this.roster = new Map();
    this.crates = new Map();
    this.loot = new Map();
    this.keys = new Set();
    this.mouse = { l: false, r: false, lT: 0 };
    this.tc = { mx: 0, mz: 0 };
    this.camYaw = 0.6; this.camPitch = -0.1;
    this.mode = 'menu';
    this.time = 0;
    this.pings = [];
    this.net = null;
    this.tod = 0.35;
    this.shipMesh = this.buildShip();
    this.scene.add(this.shipMesh);
    this.shipMesh.visible = false;
    this.buildLootTemplates();
    this.bindInput();
    if (this.isTouch) this.buildTouch();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    if (!MANUAL) warmModels(this.S.quality === 'high' ? 'medium' : this.S.quality);
    this.applyTimeOfDay(0.35, true);
    this.showHome();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    if (!MANUAL) this.raf = requestAnimationFrame(this.frame);
    window.__asc = this;
  }

  // ───────────── rendering setup ─────────────
  initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: MANUAL });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.66;
    r.shadowMap.enabled = this.S.shadows !== false && this.S.quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'gl';
    this.root.appendChild(r.domElement);
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(this.S.fov, 16 / 9, 0.1, 4000);
    this.camera.rotation.order = 'YXZ';
    const view = buildIslandView(this.island, this.S.quality, r);
    this.view = view;
    scene.add(view.group);
    // the sky shader is bright under ACES: tone it down
    const sk = view.sky.mesh;
    sk.material.uniforms.skyGain = { value: 0.5 };
    sk.material.fragmentShader = sk.material.fragmentShader.replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyGain;').replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
    // image-based light from the same sky (rebuilt as the day goes by)
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    const esky = sk.clone(); esky.material = sk.material.clone(); esky.material.uniforms.skyGain = { value: 0.8 }; esky.scale.setScalar(100);
    esky.material.uniforms.sunPosition = sk.material.uniforms.sunPosition;
    this.envSky = esky;
    this.envScene.add(esky);
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5d6b4a, side: THREE.BackSide })));
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.55;
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.6);
    sun.castShadow = r.shadowMap.enabled;
    const s = this.S.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 600;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a40, 0.55);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xb9d3e6, 380, 2200);
    if (this.S.quality !== 'low') this.grass = new GrassField(scene, this.island, view.uniforms, this.S.quality);
    view.group.traverse((o) => { if (o.name === 'water') this.waterMat = o.material; });
    this.buildComposer();
  }
  // the sun crosses the sky during a match: soft morning, bright noon, a golden sunset
  applyTimeOfDay(tod, force = false) {
    this.tod = tod;
    const L = this.view.setTimeOfDay(tod);
    this.sun.color.copy(L.sunColor); this.sun.intensity = L.sunInt;
    this.hemi.color.copy(L.sky); this.hemi.groundColor.copy(L.ground); this.hemi.intensity = L.hemiInt;
    this.scene.fog.color.copy(L.fog);
    if (this.waterMat) this.waterMat.uniforms.fogColor.value.copy(L.fog);
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.environmentIntensity = L.env;
    // rebuild the reflected sky now and then
    if (force || Math.abs(tod - (this.envTod ?? -1)) > 0.08) {
      this.envTod = tod;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
    }
  }
  buildComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.S.quality === 'low' ? 0 : 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.S.quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.5, 1.0);
      this.composer.addPass(this.bloom);
      const gp = new ShaderPass(GradeShader);
      this.grade = gp;
      this.composer.addPass(gp);
    }
    this.composer.addPass(new OutputPass());
  }
  resize() {
    const w = Math.max(1, this.root.clientWidth); const h = Math.max(1, this.root.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.S.quality === 'high' ? 1.75 : this.S.quality === 'medium' ? 1.25 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.root.classList.toggle('short', h < 480 || w < 700);
  }

  makeMapImage() {
    const S = 512; const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = -700 + (x / S) * 1400; const wz = -700 + (y / S) * 1400;
      const h = this.island.height(wx, wz); const n = this.island.normal(wx, wz);
      const shade = 0.75 + (n[0] * -0.5 + n[2] * -0.5) * 0.6;
      let col;
      if (h < 0.3) { const d = clamp(-h / 14, 0, 1); col = [40 - d * 20, 120 - d * 50, 150 - d * 30]; } else if (h < 2.8) col = [214, 196, 150];
      else if (h > 90) col = [235, 240, 248];
      else if (n[1] < 0.8 || h > 68) col = [128, 120, 110];
      else col = [76 + h * 0.3, 128 - h * 0.2, 60];
      const i = (y * S + x) * 4;
      img.data[i] = col[0] * shade; img.data[i + 1] = col[1] * shade; img.data[i + 2] = col[2] * shade; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (this.view.river) { g.strokeStyle = 'rgba(60,150,190,.9)'; g.lineWidth = 2.5; g.beginPath(); this.view.river.forEach(([x, , z], i) => { const px = ((x + 700) / 1400) * S; const pz = ((z + 700) / 1400) * S; if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }); g.stroke(); }
    g.fillStyle = 'rgba(40,30,25,.8)';
    this.island.buildings.forEach((b) => { const x = ((b.x + 700) / 1400) * S; const z = ((b.z + 700) / 1400) * S; g.fillRect(x - 2.5, z - 2.5, 5, 5); });
    g.fillStyle = 'rgba(20,60,30,.35)';
    this.island.trees.forEach((t) => { g.fillRect(((t.x + 700) / 1400) * S - 1, ((t.z + 700) / 1400) * S - 1, 2, 2); });
    return c;
  }

  // the dropship: a sleek lifting body with glowing engines
  buildShip() {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x2b3550, metalness: 0.7, roughness: 0.35 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.5, roughness: 0.4 });
    const glowM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x5ef2ff, emissiveIntensity: 3 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, -14], [2.2, -12], [3.6, -6], [4, 2], [3.4, 9], [1.8, 13], [0, 14]].map(([r, y]) => new THREE.Vector2(r, y)), 24), hull);
    body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.55); g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 6), hull); wing.position.set(0, -0.4, 2); g.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(30.2, 0.55, 0.6), trim); stripe.position.set(0, -0.4, -0.6); g.add(stripe);
    [-11, -6, 6, 11].forEach((x) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 5, 16), hull); e.rotation.x = Math.PI / 2; e.position.set(x, -1.2, 3); g.add(e); const f = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16), glowM); f.position.set(x, -1.2, 5.55); g.add(f); });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 4), hull); tail.position.set(0, 2.6, 10); tail.rotation.x = 0.3; g.add(tail);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a1020, metalness: 0.9, roughness: 0.05 }));
    cockpit.scale.set(1, 0.6, 2); cockpit.position.set(0, 1.4, -8); g.add(cockpit);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }

  // crate and loot meshes
  buildLootTemplates() {
    this.crateMats = {};
    Object.entries(CRATES).forEach(([k, c]) => {
      this.crateMats[k] = {
        body: new THREE.MeshStandardMaterial({ color: 0x1f2740, metalness: 0.75, roughness: 0.35 }),
        trim: new THREE.MeshStandardMaterial({ color: 0x0, emissive: c.color, emissiveIntensity: 2.2 }),
        gold: new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.8, roughness: 0.3 }),
      };
    });
    this.orbGeo = new THREE.IcosahedronGeometry(0.32, 2);
  }
  makeCrate(c) {
    const M = this.crateMats[c.tier];
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.86), M.body); base.position.y = 0.31; g.add(base);
    const lid = new THREE.Group(); lid.position.set(0, 0.62, 0.43); g.add(lid);
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.3, 20, 1, false, 0, Math.PI), M.body); lm.rotation.z = Math.PI / 2; lm.position.z = -0.43; lid.add(lm);
    [-0.5, 0.5].forEach((x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.66, 0.9), M.gold); b.position.set(x, 0.32, 0); g.add(b); const lb = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 6, 20, Math.PI), M.gold); lb.rotation.y = Math.PI / 2; lb.position.set(x, 0, -0.43); lid.add(lb); });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 0.9), M.trim); seam.position.y = 0.6; g.add(seam);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.06), M.trim); lock.position.set(0, 0.5, -0.45); g.add(lock);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: CRATES[c.tier].color, transparent: true, opacity: c.tier === 'common' ? 0.0 : 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 15; g.add(beam);
    g.traverse((m) => { if (m.isMesh && m !== beam) { m.castShadow = true; m.receiveShadow = true; } });
    g.position.set(...c.p);
    g.rotation.y = (c.id * 1.7) % 6.28;
    g.userData = { lid, beam };
    return g;
  }
  makeLoot(l) {
    const g = new THREE.Group();
    if (l.kind === 'power') {
      const P = POWER[l.power];
      const core = new THREE.Mesh(this.orbGeo, new THREE.MeshStandardMaterial({ color: 0, emissive: P.color, emissiveIntensity: 2.4, roughness: 0.2 }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowMap, color: P.ult ? '#ffd166' : P.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      halo.scale.setScalar(P.ult ? 2.6 : 1.8);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: P.ult ? '#ffd166' : '#ffffff', transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const img = new Image();
      const tex = new THREE.CanvasTexture(c);
      img.onload = () => { const x = c.getContext('2d'); x.drawImage(img, 8, 8, 48, 48); tex.needsUpdate = true; };
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(icon(l.power, '#ffffff', 48).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); gl.scale.setScalar(0.6); gl.position.y = 0.85;
      g.add(core, halo, ring, gl);
      g.userData.spin = ring;
    } else {
      const I = ITEMS[l.item];
      const m = l.item === 'medkit'
        ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.38), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.48, 16), new THREE.MeshStandardMaterial({ color: 0x1a2a40, emissive: I.color, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }));
      if (l.item === 'medkit') { const x = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.31, 0.08), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2fd06a, emissiveIntensity: 2 })); const y = x.clone(); y.rotation.y = Math.PI / 2; g.add(x, y); }
      g.add(m);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowMap, color: I.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
      halo.scale.setScalar(1.2); g.add(halo);
    }
    g.position.set(l.p[0], l.p[1] + 0.7, l.p[2]);
    g.userData.base = l.p[1] + 0.7;
    g.userData.ph = Math.random() * 6;
    return g;
  }

  // ───────────── menus ─────────────
  showHome(note = '') {
    this.mode = 'menu';
    this.hud.visible(false);
    dailyState(this.save);
    this.hud.show(this.hud.homeScreen(this.save, note), 'home');
    this.ensurePreview();
  }
  ensurePreview() {
    // a hero standing on a cliff over the sea while the camera drifts, aura flickering
    if (this.preview && this.preview.hero === this.S.hero && this.preview.skin === this.save.skin && this.preview.aura === this.S.aura) return;
    if (this.preview) { this.scene.remove(this.preview.h.root); disposeHero(this.preview.h); }
    const h = buildHero(this.S.hero, this.save.skin ?? 1, this.S.quality === 'high' ? 'medium' : this.S.quality);
    const x = 430; const z = 230;
    h.root.position.set(x, this.island.floor(x, z, 999), z);
    h.root.rotation.y = 2.2;
    this.scene.add(h.root);
    const aura = this.fx.aura(this.auraColor(this.S.hero, this.S.aura), '#ffffff');
    h.root.add(aura);
    this.preview = { h, hero: this.S.hero, skin: this.save.skin, aura: this.S.aura, auraM: aura };
  }
  clearPreview() { if (this.preview) { this.scene.remove(this.preview.h.root); disposeHero(this.preview.h); this.preview = null; } }
  auraColor(hero, aura) { const A = AURAS.find((x) => x.id === aura); return (A && A.color) || (HERO[hero] || HEROES[0]).glow; }

  act(a, arg) {
    this.sound.init();
    this.sound.ui();
    const lv = level(this.save.xp);
    switch (a) {
      case 'play': this.heroSelect(); break;
      case 'selhero': if ((HERO[arg] || {}).unlock > lv) { this.hud.toast(`Reach level ${HERO[arg].unlock} to unlock ${HERO[arg].name}`, '#ff7a7a'); break; } this.S.hero = arg; writeSave(this.save); this.ensurePreview(); this.renderSelect(); break;
      case 'lockin': if (this.sel && !this.sel.locked) { this.sel.locked = true; this.sel.end = Math.min(this.sel.end, performance.now() + 1600); this.sound.ui(); this.renderSelect(); } break;
      case 'take': this.send({ t: 'take', id: Number(arg) }); setTimeout(() => this.renderInv(), 120); break;
      case 'home': if (this.net && this.net.room) { this.net.render(); break; } if (this.net) { this.net.leave(); this.net = null; } this.showHome(); break;
      case 'hero': this.hud.show(this.hud.heroScreen(this.S.hero, this.save.skin ?? 1, lv, this.S.aura), 'home'); this.ensurePreview(); break;
      case 'sethero': if ((HERO[arg] || {}).unlock > lv) { this.hud.toast(`Reach level ${HERO[arg].unlock} to unlock ${HERO[arg].name}`, '#ff7a7a'); break; } this.S.hero = arg; writeSave(this.save); this.ensurePreview(); this.hud.show(this.hud.heroScreen(this.S.hero, this.save.skin ?? 1, lv, this.S.aura), 'home'); if (this.net) this.net.updateMeta(); break;
      case 'setskin': this.save.skin = Number(arg); writeSave(this.save); this.ensurePreview(); this.hud.show(this.hud.heroScreen(this.S.hero, this.save.skin, lv, this.S.aura), 'home'); if (this.net) this.net.updateMeta(); break;
      case 'setaura': { const A = AURAS.find((x) => x.id === arg); if (!A || A.unlock > lv) { this.hud.toast(`Reach level ${A ? A.unlock : '?'} to unlock this aura`, '#ff7a7a'); break; } this.S.aura = arg; writeSave(this.save); this.ensurePreview(); this.hud.show(this.hud.heroScreen(this.S.hero, this.save.skin ?? 1, lv, this.S.aura), 'home'); if (this.net) this.net.updateMeta(); break; }
      case 'setmode': if (MODES[arg]) { this.S.mode = arg; writeSave(this.save); if (this.net && this.net.room) { this.net.updateMeta(); this.net.render(); } else this.showHome(); } break;
      case 'powers': this.hud.show(this.hud.powersScreen()); break;
      case 'settings': this.settingsFrom = this.mode; this.hud.show(this.hud.settingsScreen(this.S)); break;
      case 'set': {
        const [k, v] = arg.split(':');
        this.S[k] = v === 'true' ? true : v === 'false' ? false : v;
        writeSave(this.save);
        if (k === 'quality' || k === 'shadows') this.hud.toast('Graphics change applies when you reopen the game', '#5ef2ff');
        this.hud.applyCrosshair(this.S);
        this.hud.show(this.hud.settingsScreen(this.S));
        break;
      }
      case 'back': if (this.settingsFrom === 'play') this.hud.show(this.hud.pauseScreen(!!this.net), true); else this.showHome(); break;
      case 'online': this.hud.show(this.hud.onlineScreen(playerName(), this.netError)); this.netError = null; break;
      case 'host': case 'join': {
        const n = this.root.querySelector('input[name=pname]');
        if (n && n.value.trim()) savePlayerName(n.value.trim().slice(0, 16));
        if (!this.net) this.net = new Online(this);
        if (a === 'host') this.net.host();
        else { const c = this.root.querySelector('input[name=code]'); this.net.join(c ? c.value.trim() : ''); }
        break;
      }
      case 'resume': this.hud.hide(); this.lock(); break;
      case 'quit': this.leaveMatch(); break;
      case 'again': if (this.net) { this.leaveMatch(true); this.net.toLobby(); } else this.startOffline(); break;
      case 'spectate': this.hud.hide(); this.spectating = true; break;
      case 'pick': this.invSel = this.invSel === arg ? null : arg; this.renderInv(); break;
      case 'slot': this.assignSlot(Number(arg)); break;
      case 'closeinv': this.closeInv(); break;
      default: if (this.net) this.net.act(a, arg); break;
    }
  }

  // ───────────── match lifecycle ─────────────
  // Valorant-style agent select: pick a hero, lock in, and the drop starts when the timer runs out
  heroSelect() {
    if (this.selTimer) clearInterval(this.selTimer);
    this.sel = { end: performance.now() + 15000, locked: false };
    this.ensurePreview();
    this.renderSelect();
    this.selTimer = setInterval(() => {
      if (!this.sel || this.mode === 'play') { clearInterval(this.selTimer); this.selTimer = null; return; }
      if (performance.now() >= this.sel.end) { clearInterval(this.selTimer); this.selTimer = null; this.sel = null; this.startOffline(); return; }
      this.renderSelect();
    }, 250);
  }
  renderSelect() {
    if (!this.sel) return;
    const left = Math.max(0, (this.sel.end - performance.now()) / 1000);
    const html = this.hud.heroSelectScreen(this.S.hero, level(this.save.xp), left, this.sel.locked);
    if (html !== this.selHtml) { this.selHtml = html; this.hud.show(html, true); }
  }
  startOffline() {
    if (this.selTimer) { clearInterval(this.selTimer); this.selTimer = null; } this.sel = null;
    const myId = 'me';
    const roster = [{ id: myId, name: playerName(), hero: this.S.hero, skin: this.save.skin ?? 1, aura: this.S.aura, team: 0 }];
    this.beginMatch({ host: true, myId, roster, seed: (Math.random() * 1e9) | 0, difficulty: this.S.bots, mode: this.S.mode });
  }
  // host / offline: create the Match; guests: build from the host's roster
  beginMatch(o) {
    this.clearMatch();
    this.clearPreview();
    this.myId = o.myId;
    this.isHost = o.host;
    this.match = null;
    if (o.host) {
      this.match = new Match(this.island, { seed: o.seed, roster: o.roster, difficulty: o.difficulty || 'normal', mode: o.mode || 'solo', emit: (e) => this.onEvent(e) });
      if (this.net) this.net.matchStarted(this.match);
    }
    this.matchMode = this.match ? this.match.mode : (o.mode || 'solo');
    const roster = this.match ? this.match.roster() : o.roster;
    roster.forEach((r) => this.roster.set(r.id, r));
    this.myTeam = (this.roster.get(this.myId) || {}).team;
    const ship = this.match ? this.match.ship : o.ship;
    this.shipPath = { a: ship.a, b: ship.b };
    this.shipT = ship.t || 0;
    this.phase = 'ship';
    this.matchTime = o.time || 0;
    this.me = {
      id: this.myId, p: ship.a.slice(), v: [0, 0, 0], yaw: 0, pitch: 0, mode: 'ship', ground: false, alive: true, hp: COMBAT.hp, shield: 50, absorb: 0, ultCharge: 0, stamina: MOVE.stamina, speedMul: 1, force: null,
      ki: 60, form: 0, formMeter: 0, charging: false, stance: 0, tumble: 0, held: 0, downed: false, bleed: 0, emote: null,
    };
    this.inv = { powers: {}, slots: [null, null, null], ult: null, items: { medkit: 0, cell: 0 } };
    this.cd = {}; this.cdMax = {};
    this.stats = { kills: 0, dmg: 0, found: 0 };
    this.mstats = { dmg: 0, kills: 0, crates: 0, beams: 0, clashWins: 0, forms: 0, hits: 0, revives: 0, flyKm: 0 };
    this.storm = { c: [0, 0], r: 760, next: null, t: 0, shrinking: false, label: 'STORM', dps: 1 };
    this.alive = roster.length; this.teamsLeft = new Set(roster.map((r) => r.team)).size;
    this.spectating = false;
    this.dead = false;
    this.result = null;
    this.combo = { n: 0, t: 0 }; this.meleeAnim = null; this.castT = 0; this.aiming = 0;
    this.lastSend = 0; this.hurt = 0; this.blindT = 0; this.lockId = null; this.clash = null; this.hits = { n: 0, t: 0 };
    this.lastSpace = -9; this.flyTogglePressed = false;
    this.marks = new Map(); this.drops = []; this.red = null; this.mateIdx = new Map();
    roster.filter((r) => r.team === this.myTeam && r.id !== this.myId).forEach((r, i) => this.mateIdx.set(r.id, i + 1));
    this.camYaw = Math.atan2(-(ship.b[0] - ship.a[0]), -(ship.b[2] - ship.a[2])); this.camPitch = -0.25;
    this.mode = 'play';
    this.hud.hide();
    this.hud.visible(true);
    this.hud.center('DROP IN', this.isTouch ? 'Tap JUMP to leave the ship' : 'Press SPACE to leave the ship · double-tap SPACE to fly', 4, '#ffd166');
    this.shipMesh.visible = true;
    const crates = this.match ? [...this.match.crates.values()].map((c) => [c.id, c.tier, c.p, c.open ? 1 : 0]) : o.crates;
    crates.forEach(([id, tier, p, open]) => { const c = { id, tier, p, open: !!open }; c.obj = this.makeCrate(c); if (open) this.openCrateVisual(c, true); this.scene.add(c.obj); this.crates.set(id, c); });
    (o.loot || []).forEach((l) => this.onEvent({ e: 'loot', l }));
    (o.trees || []).forEach((i) => { this.island.fellTree(i); this.view.hideTree(i); });
    if (o.storm) this.applyStormState(o.storm);
    (o.dead || []).forEach((id) => { const r = this.roster.get(id); if (r) r.dead = true; });
    roster.forEach((r) => { if (!r.dead) this.ensureAvatar(r.id); });
    this.sound.init();
    this.lock();
    if (this.match) this.match.emitInv(this.match.players.get(this.myId));
  }
  clearMatch() {
    this.avatars.forEach((a) => { this.scene.remove(a.h.root); disposeHero(a.h); if (a.tag) this.scene.remove(a.tag); if (a.sphere) this.scene.remove(a.sphere.obj); });
    this.avatars.clear();
    this.crates.forEach((c) => this.scene.remove(c.obj)); this.crates.clear();
    this.loot.forEach((l) => this.scene.remove(l.obj)); this.loot.clear();
    this.roster.clear();
    this.fx.clear();
    this.match = null;
    this.shipMesh.visible = false;
    this.fx.setStorm([0, 0], 2000);
    // regrow the forest
    this.island.trees.forEach((t) => { if (t.dead) { t.dead = false; t.col = this.island.addCollider(t.col); } });
    this.view.showAllTrees();
    this.sound.chargeLoop(0);
    (this.drops || []).forEach((d) => { if (d.obj) this.scene.remove(d.obj); if (d.smoke) this.scene.remove(d.smoke); }); this.drops = [];
    if (this.redMesh) this.redMesh.visible = false; this.red = null;
    if (this.marks) this.marks.clear();
  }
  leaveMatch(keepNet = false) {
    this.unlock();
    this.clearMatch();
    this.mode = 'menu';
    this.applyTimeOfDay(0.35, true);
    if (this.net && !keepNet) { this.net.leave(); this.net = null; }
    if (!keepNet) this.showHome();
  }

  // ───────────── avatars ─────────────
  ensureAvatar(id) {
    if (this.avatars.has(id)) return this.avatars.get(id);
    const r = this.roster.get(id);
    if (!r) return null;
    const detail = this.S.quality === 'low' ? 'low' : 'medium';
    const h = buildHero(r.hero, r.skin ?? 1, detail);
    this.scene.add(h.root);
    const a = {
      id, h, p: (this.match && this.match.players.get(id) ? this.match.players.get(id).p : this.shipPath.a).slice(), yaw: 0, face: 0, pitch: 0, mode: 'ship', hp: 100, shield: 0, flags: 0, speed: 0, buffs: {}, snaps: [], castT: 0, melee: null, alive: true, v: [0, 0, 0], ground: true,
      ki: 60, fm: 0, pw: 0, team: r.team, auraAmp: 0, auraCol: this.auraColor(r.hero, r.aura), pose: null, poseT: 0, emote: null,
    };
    if (id !== this.myId) {
      const mate = r.team === this.myTeam && this.matchMode !== 'solo';
      a.mate = mate;
      a.tag = this.nameTag(r.name, mate ? '#5effa8' : r.bot ? '#ffffff' : '#7ff5e2', mate);
      this.scene.add(a.tag);
    }
    this.avatars.set(id, a);
    return a;
  }
  nameTag(text, color, fixed) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d'); g.font = '800 28px Manrope, sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, 128, 34); g.fillStyle = color; g.fillText(text, 128, 34);
    if (fixed) { g.fillStyle = color; g.beginPath(); g.moveTo(118, 40); g.lineTo(138, 40); g.lineTo(128, 48); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: !fixed, transparent: true, toneMapped: false, fog: false, sizeAttenuation: !fixed }));
    if (fixed) s.scale.set(0.16, 0.03, 1); else s.scale.set(1.6, 0.3, 1);
    s.renderOrder = fixed ? 20 : 0;
    return s;
  }
  setPose(a, pose, t) { a.pose = pose; a.poseT = t; }

  // ───────────── events (from the match, locally or over the network) ─────────────
  onEvent(e) {
    if (this.net && this.isHost) this.net.queue(e);
    const me = this.myId;
    switch (e.e) {
      case 'join': this.roster.set(e.pl.id, e.pl); this.ensureAvatar(e.pl.id); break;
      case 'drop': {
        const a = this.ensureAvatar(e.id); if (a) { a.mode = 'fall'; a.p = e.p.slice(); }
        if (e.id === me) { Object.assign(this.me, { mode: 'fall', skydive: true, p: e.p.slice(), v: e.v.slice(), deployAt: 60 }); this.sound.drop(); this.hud.center('', '', 0); }
        break;
      }
      case 'phase': this.phase = e.phase; if (e.phase === 'play') { this.shipMesh.visible = false; this.hud.centerT = 0; } break;
      case 'storm': this.onStorm(e); break;
      case 'inv': if (e.id === me) { this.inv = { powers: e.powers, slots: e.slots, ult: e.ult, items: e.items }; if (this.invOpen) this.renderInv(); } break;
      case 'got': if (e.id === me) {
        if (e.power) { const P = POWER[e.power]; this.hud.toast(`${icon(e.power, P.color, 22)} ${esc(P.name)} <small>${e.up ? `LEVEL ${e.lv}` : P.ult ? 'ULTIMATE' : 'NEW TECHNIQUE'}</small>`, P.ult ? '#ffd166' : P.color); this.stats.found++; } else this.hud.toast(`${icon(e.item, ITEMS[e.item].color, 22)} ${ITEMS[e.item].name}`, ITEMS[e.item].color);
        this.sound.pickup(!!e.power);
      } break;
      case 'loot': { const l = { ...e.l }; l.obj = this.makeLoot(l); this.scene.add(l.obj); this.loot.set(l.id, l); break; }
      case 'unloot': { const l = this.loot.get(e.id); if (l) { this.scene.remove(l.obj); this.loot.delete(e.id); this.fx.burst([l.p[0], l.p[1] + 0.7, l.p[2]], l.power ? POWER[l.power].color : '#ffffff', 12, 3, 0.35, 0.4, { grav: -2 }); } break; }
      case 'crate': { const c = this.crates.get(e.crate); if (c) { this.openCrateVisual(c); this.sound.crate(c.p, c.tier); } const di = (this.drops || []).findIndex((x) => x.id === e.crate); if (di >= 0) { const d = this.drops[di]; if (d.smoke) this.scene.remove(d.smoke); this.drops.splice(di, 1); } break; }
      case 'cast': this.onCast(e); break;
      case 'self': if (e.id === me) this.applySelf(e); break;
      case 'knock': if (e.id === me) {
        const m = this.me;
        if (e.set) m.v = e.v.slice(); else { m.v[0] += e.v[0]; m.v[1] = Math.max(m.v[1], e.v[1]); m.v[2] += e.v[2]; }
        m.ground = false;
        if (e.tumble) { m.v = e.v.slice(); m.tumble = e.tumble; m.charging = false; m.stance = 0; if (m.mode === 'fly') m.mode = 'ground'; this.shakeAmt = Math.max(this.shakeAmt || 0, 0.7); this.impact(null, 1); }
      } break;
      case 'buff': {
        const a = this.avatars.get(e.id); if (a) a.buffs[e.kind] = e.t;
        if (e.id === me) {
          const m = this.me;
          if (e.kind === 'frozen') { m.frozen = e.t; this.hud.center('TIME STOPPED', '', 1.2, '#ffe9a8'); }
          if (e.kind === 'root') m.root = e.t;
          if (e.kind === 'held') m.held = e.t;
          if (e.kind === 'blind') { this.blindT = e.t; this.sound.flash(); }
          if (e.kind === 'surge') this.hud.center('CRIMSON SURGE', 'Power ×1.45 — but it burns your health', 2, '#ff4a4a');
        }
        if (a && e.kind === 'barrier') this.sound.cast(a.p, 'barrier');
        break;
      }
      case 'ent': this.fx.addEnt(e, (en) => { const r = this.roster.get(en.owner); if (!r) return null; const h = buildHero(r.hero, r.skin ?? 1, 'low'); h.root.traverse((m) => { if (m.material && !Array.isArray(m.material)) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.7; } }); return h; }); if (e.huge) { const a = this.avatars.get(e.owner); if (a && a.sphere) { this.scene.remove(a.sphere.obj); a.sphere = null; } } break;
      case 'unent': this.fx.removeEnt(e.id, e.p, e.fizzle); break;
      case 'boom': {
        this.fx.boom(e.p, e.power, e.r, !!e.big, !!e.huge);
        if (e.power === 'heavy') { this.sound.heavy(e.p); this.shake(e.p, 3); this.impact(e.p, 0.8); break; }
        if (e.huge) this.impact(e.p, 1.2);
        if (e.power !== 'storm') this.sound.boom(e.p, e.huge ? 2 : e.r > 4 ? 1.3 : e.r > 1.2 ? 0.6 : 0.3);
        if (e.r > 3) this.shake(e.p, e.r * (e.huge ? 2 : 1));
        break;
      }
      case 'zone': this.fx.addZone(e); this.sound.cast(e.p, 'gravity'); break;
      case 'zoneEnd': break;
      case 'meteor': this.fx.meteor(e.p, e.delay); break;
      case 'crater': this.fx.crater(e.p, e.r); break;
      case 'trees': {
        e.ids.forEach((i) => { const t = this.island.trees[i]; if (!t) return; this.island.fellTree(i); if (this.view.hideTree(i)) this.fx.fallingTree(t, e.from); });
        if (this.me && Math.hypot(e.from[0] - this.me.p[0], e.from[2] - this.me.p[2]) < 80) this.sound.crack(e.from);
        break;
      }
      case 'tp': {
        const a = this.avatars.get(e.id);
        this.fx.streak(e.from, e.to, a ? a.auraCol : '#ffffff');
        if (a && e.id !== me) { a.p = e.to.slice(); a.snaps.forEach((s) => { s.p = e.to.slice(); }); }
        this.sound.tp(e.to);
        if (e.power === 'afterimage' && a) this.fx.puff([e.from[0], e.from[1] + 1, e.from[2]], '#cfe9ff', 6, 1, 0.5, 0.6, 0.4);
        break;
      }
      case 'beam': {
        this.fx.addBeam({ bid: e.bid, owner: e.id, power: e.power, d: e.d, w: e.w, max: e.max });
        const a = this.avatars.get(e.id); if (a) this.setPose(a, 'beam', e.dur + 0.3);
        this.sound.beam(a ? a.p : null, e.dur, e.power === 'radiance');
        if (e.id === me) this.myBeam = e.bid;
        break;
      }
      case 'beamU': { const b = this.fx.kiBeams.get(e.bid); if (b) { b.wantDir = e.d; if (!b.clash && e.len < b.wantLen - 3) b.wantLen = e.len; } break; }
      case 'beamEnd': {
        const b = this.fx.kiBeams.get(e.bid);
        if (b) { const a = this.avatars.get(b.owner); if (a && a.pose === 'beam') a.poseT = 0.15; }
        this.fx.removeBeam(e.bid);
        if (this.myBeam === e.bid) this.myBeam = null;
        break;
      }
      case 'clash': {
        const A = this.fx.kiBeams.get(e.a); const B = this.fx.kiBeams.get(e.b);
        if (A) A.clash = e.p; if (B) B.clash = e.p;
        this.fx.addClash(e.a, e.p, A ? POWER[A.power].color : '#fff', B ? POWER[B.power].color : '#fff');
        this.sound.clash(e.p);
        if (e.ia === me || e.ib === me) { this.clash = { key: e.a, mineA: e.ia === me, f: e.f }; this.hud.center('BEAM CLASH!', this.isTouch ? 'Tap anything to push!' : 'MASH any key to push!', 2, '#ffffff'); }
        else if (this.me && Math.hypot(e.p[0] - this.me.p[0], e.p[2] - this.me.p[2]) < 200) this.hud.toast('A beam clash is shaking the island!', '#ffffff');
        break;
      }
      case 'clashp': {
        this.fx.moveClash(e.a, e.p);
        for (const b of this.fx.kiBeams.values()) if (b.clash) b.clash = e.p;
        if (this.clash && this.clash.key === e.a) this.clash.f = e.f;
        this.shake(e.p, 10);
        break;
      }
      case 'clashEnd': {
        { const b = this.fx.clashes.get(e.a); if (b) this.impact(b.p, 1.3); }
        this.fx.removeClash(e.a);
        [e.a, e.b].forEach((bid) => { const b = this.fx.kiBeams.get(bid); if (b) b.clash = null; });
        if (this.clash && this.clash.key === e.a) {
          if (e.winner === me) this.hud.center('CLASH WON!', 'Your beam broke through', 2, '#ffd166');
          else if (e.winner) this.hud.center('OVERPOWERED', '', 1.6, '#ff6a6a');
          this.clash = null;
        }
        break;
      }
      case 'form': {
        const a = this.avatars.get(e.id);
        if (a && e.form) {
          const F = FORMS[e.form];
          this.setPose(a, 'transform', 1.0);
          this.fx.flash(a.p, F.color, 200, 60);
          this.fx.dome([a.p[0], a.p[1] + 1, a.p[2]], F.glow, 7, 0.8);
          this.fx.ring(a.p, F.color, 22, 0.9, 0.2, 0.1);
          for (let k = 0; k < 6; k++) this.fx.bolt([a.p[0], a.p[1] + 1, a.p[2]], [a.p[0] + (Math.random() - 0.5) * 8, a.p[1] + 1 + Math.random() * 5, a.p[2] + (Math.random() - 0.5) * 8], F.color, '#ffffff', 0.25, true);
          this.sound.transform(a.p, e.form);
          this.shake(a.p, 8);
          this.impact(a.p, 1);
        }
        if (e.id === me) {
          this.me.form = e.form;
          if (e.form) { this.hud.center(FORMS[e.form].name.toUpperCase(), `Power ×${FORMS[e.form].dmg} · Speed ×${FORMS[e.form].speed}`, 2.4, FORMS[e.form].color); this.me.stance = 1; }
          else this.hud.toast('Your form fades', '#cccccc');
        }
        break;
      }
      case 'down': {
        const r = this.roster.get(e.id); const k = e.by && this.roster.get(e.by);
        this.hud.feed(k ? `<b>${esc(k.name)}</b><i>knocked down</i><b>${esc(r ? r.name : '?')}</b>` : `<b>${esc(r ? r.name : '?')}</b><i>is down</i>`, e.by === me || e.id === me);
        if (e.id === me) { this.me.downed = true; this.me.mode = this.me.mode === 'fly' ? 'ground' : this.me.mode; this.hud.center('DOWNED', 'Crawl to a teammate — they can revive you', 2.5, '#ff6a6a'); }
        if (e.by === me) this.hud.center('KNOCKED DOWN', esc(r ? r.name : ''), 1.4, '#ffd166');
        break;
      }
      case 'revived': {
        const a = this.avatars.get(e.id);
        if (a) this.fx.burst([a.p[0], a.p[1] + 1, a.p[2]], '#5effa8', 30, 4, 0.5, 0.8, { grav: -2 });
        if (e.id === me) { this.me.downed = false; this.me.hp = e.hp; this.hud.center('REVIVED', '', 1.5, '#5effa8'); }
        if (e.by === me) this.hud.toast('Teammate revived', '#5effa8');
        break;
      }
      case 'emote': { const a = this.avatars.get(e.id); if (a && e.id !== me) { a.emote = { id: e.em, t: 3 }; } break; }
      case 'stat': if (e.id === me && this.mstats) this.mstats[e.k] = (this.mstats[e.k] || 0) + e.v; break;
      case 'noki': if (e.id === me) this.noKi(); break;
      case 'melee': {
        const a = this.avatars.get(e.id);
        const M = e.n === 5 ? COMBAT.heavy : COMBAT.melee[e.n];
        if (a && (e.id !== me || e.rush)) { a.melee = { n: e.n, t: e.rush ? 0.12 : M.t, dur: e.rush ? 0.12 : M.t }; a.castT = 0; }
        if (a) this.sound.punch(a.p, e.n, e.hit);
        if (a && e.hit && e.id === me) { this.hits = { n: this.hits.t > 0 ? this.hits.n + 1 : 1, t: 1.2 }; if (e.n >= 4) this.shakeAmt = Math.max(this.shakeAmt || 0, 0.3); }
        if (a && e.hit) { const f = [-Math.sin(a.face) * 1.2, 1.2, -Math.cos(a.face) * 1.2]; this.fx.burst([a.p[0] + f[0], a.p[1] + f[1], a.p[2] + f[2]], '#ffffff', e.n >= 4 ? 18 : 8, 6, 0.35, 0.2, { grav: 0 }); }
        break;
      }
      case 'hit': this.onHit(e); break;
      case 'kill': this.onKill(e); break;
      case 'use': if (e.id === me) this.usingT = { item: e.item, t: ITEMS[e.item].use, tot: ITEMS[e.item].use }; break;
      case 'used': if (e.id === me) { this.usingT = null; this.me.hp = e.hp; this.me.shield = e.sh; } break;
      case 'win': this.onWin(e); break;
      case 'airdrop': this.onAirdrop(e); break;
      case 'crateAdd': {
        const [id, tier, p, open] = e.c;
        if (this.crates.has(id)) break;
        const c = { id, tier, p, open: !!open }; c.obj = this.makeCrate(c); this.scene.add(c.obj); this.crates.set(id, c);
        const d = this.drops.find((x) => x.id === id);
        if (d) { d.landed = true; if (d.obj) { this.scene.remove(d.obj); d.obj = null; } this.fx.puff([p[0], p[1] + 0.6, p[2]], '#e8e0d0', 14, 3, 0.8, 1.5, 0.6); this.sound.boom(p, 0.4); }
        break;
      }
      case 'redzone': this.onRedZone(e); break;
      case 'ping': this.onPing(e); break;
      default: break;
    }
  }
  // a sky cache drifts down under a canopy, trailing red smoke
  onAirdrop(e) {
    const g = new THREE.Group();
    const crate = this.makeCrate({ id: e.id, tier: 'supply', p: [0, 0, 0] });
    crate.position.set(0, 0, 0); g.add(crate);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshToonMaterial({ color: '#ff4a4a', side: THREE.DoubleSide }));
    canopy.scale.y = 0.55; canopy.position.y = 6.5; g.add(canopy);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(3.25, 16, 8, 0, Math.PI * 2, Math.PI / 4.2, 0.18), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    stripe.scale.y = 0.55; stripe.position.y = 6.5; g.add(stripe);
    const lineM = new THREE.LineBasicMaterial({ color: '#333' });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(Math.cos(a) * 2.6, 6.6, Math.sin(a) * 2.6)]); g.add(new THREE.Line(geo, lineM)); }
    this.scene.add(g);
    const d = { id: e.id, p: e.p.slice(), fall: e.fall, t: 0, obj: g, landed: false, smokeT: 0 };
    this.drops.push(d);
    this.hud.toast(`${icon('cell', '#ff4a4a', 20)} SKY CACHE incoming <small>${Math.round(Math.hypot(e.p[0] - this.me.p[0], e.p[2] - this.me.p[2]))}m — check the map</small>`, '#ff4a4a');
    this.sound.storm();
  }
  onRedZone(e) {
    if (e.end) { this.red = null; if (this.redMesh) this.redMesh.visible = false; this.hud.toast('Bombardment over', '#cccccc'); return; }
    this.red = { c: e.c, r: e.r, warnEnd: this.time + e.warn, end: this.time + e.warn + e.dur };
    if (!this.redMesh) {
      this.redMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.scene.add(this.redMesh);
    }
    this.redMesh.visible = true;
    this.redMesh.scale.set(e.r, 160, e.r); this.redMesh.position.set(e.c[0], 60, e.c[1]);
    this.hud.center('BOMBARDMENT ZONE', 'Comets are about to rain down — stay out of the red circle', 3, '#ff5a4a');
  }
  // squad pings: one location marker per player, enemy spots fade after a few seconds
  onPing(e) {
    if (e.team !== this.myTeam) return;
    const key = e.kind === 'enemy' ? `e${e.id}` : `m${e.id}`;
    if (e.kind === 'clear') { this.marks.delete(`m${e.id}`); return; }
    const cols = ['#ffd84a', '#5ef2ff', '#ff7ae5', '#7dff8a'];
    const color = e.kind === 'enemy' ? '#ff4a4a' : cols[(e.id === this.myId ? 0 : this.mateIdx.get(e.id) || 1) % 4];
    const name = (this.roster.get(e.id) || {}).name || '';
    this.marks.set(key, { p: e.p.slice(), kind: e.kind, color, label: e.kind === 'enemy' ? 'ENEMY' : e.id === this.myId ? '' : name, until: this.time + (e.kind === 'enemy' ? 8 : 120) });
    if (e.id !== this.myId) this.hud.toast(`<b style="color:${color}">${esc(name)}</b> ${e.kind === 'enemy' ? 'spotted an enemy' : 'marked a location'}`, color);
    this.sound.ui();
  }
  pingAim() {
    if (!this.me || !this.me.alive || this.mode !== 'play') return;
    const p = this.aimPoint();
    const enemy = [...this.avatars.values()].some((a) => a.alive && !a.mate && a.id !== this.myId && Math.hypot(a.p[0] - p[0], a.p[1] + 1.1 - p[1], a.p[2] - p[2]) < 2);
    this.send({ t: 'ping', p, kind: enemy ? 'enemy' : 'loc' });
  }
  stepWorldEvents(dt) {
    for (const d of this.drops || []) {
      d.t += dt;
      if (d.obj) {
        const f = Math.min(1, d.t / d.fall);
        d.obj.position.set(d.p[0] + Math.sin(d.t * 0.7) * 1.5, d.p[1] + (1 - f) * 140, d.p[2] + Math.cos(d.t * 0.6) * 1.5);
        d.obj.rotation.y += dt * 0.3; d.obj.rotation.z = Math.sin(d.t * 1.3) * 0.06;
      }
      d.smokeT -= dt;
      if (d.smokeT <= 0 && d.t < d.fall + 45) {
        d.smokeT = 0.12;
        const q = d.obj ? d.obj.position : { x: d.p[0], y: d.p[1], z: d.p[2] };
        this.fx.puff([q.x, q.y + 0.8, q.z], '#ff3a2a', 1, 2.2, d.obj ? 1.4 : 3.5, 0.4, 0.75);
      }
    }
    if (this.marks) for (const [k, m] of this.marks) if (this.time > m.until) this.marks.delete(k);
    if (this.red && this.redMesh) this.redMesh.material.opacity = this.time < this.red.warnEnd ? 0.1 + 0.08 * Math.sin(this.time * 8) : 0.2;
  }
  noKi() { if ((this.noKiT || 0) > this.time) return; this.noKiT = this.time + 1.5; this.hud.toast(`Not enough ki — hold <kbd>${this.isTouch ? 'CHG' : 'C'}</kbd> to charge`, '#ffd84a'); this.sound.ui(); }

  onStorm(e) {
    this.storm.next = e.to;
    this.storm.start = this.time;
    this.storm.waitEnd = this.time + e.wait;
    this.storm.shrinkEnd = this.time + e.wait + e.shrink;
    this.storm.from = e.from;
    this.storm.dps = e.dps;
    if (e.phase > 0) { this.hud.center('STORM IS MOVING', 'Get inside the safe zone', 3, '#c99bff'); this.sound.storm(); }
  }
  applyStormState(s) {
    if (!s || s.phase < 0) return;
    this.storm.next = s.to; this.storm.from = s.from;
    this.storm.waitEnd = this.time + (s.shrinking ? 0 : s.t);
    this.storm.shrinkEnd = this.time + (s.shrinking ? s.t : s.t + s.shrink);
  }

  openCrateVisual(c, instant = false) {
    c.open = true;
    const lid = c.obj.userData.lid;
    if (instant) lid.rotation.x = -1.9; else c.opening = 0;
    c.obj.userData.beam.visible = false;
    if (!instant) { this.fx.burst([c.p[0], c.p[1] + 0.8, c.p[2]], CRATES[c.tier].color, 40, 6, 0.5, 0.8, { lift: 4, grav: 6 }); this.fx.flash(c.p, CRATES[c.tier].color, 40, 10); }
  }

  // a sphere of gathered energy above someone's raised hands
  makeSphere(color, glow) {
    const g = new THREE.Group();
    const mat = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.65, 28, 18), mat('#ffffff', 1));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat(color, 0.55));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowMap, color: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(4.5);
    g.add(core, shell, halo);
    this.scene.add(g);
    return g;
  }

  onCast(e) {
    const a = this.avatars.get(e.id);
    const P = POWER[e.power];
    const mine = e.id === this.myId;
    if (a) { a.castT = 0.45; a.emote = null; }
    if (mine) {
      this.castT = 0.45;
      this.me.emote = null;
      if (e.stance) this.me.stance = Math.max(this.me.stance || 0, e.stance);
      if (P.ult) this.me.ultCharge = 0; else { this.cd[e.power] = P.cd * lvCd(this.inv.powers[e.power] || 1); this.cdMax[e.power] = this.cd[e.power]; }
    }
    this.sound.cast(e.o, e.power);
    const c = P.color;
    this.fx.burst(e.o, P.glow, 10, 3, 0.4, 0.3);
    switch (P.kind) {
      case 'chargebeam': case 'megabeam':
        if (a) { this.setPose(a, 'beamcharge', e.charge); a.charge = { t: 0, max: e.charge, power: e.power }; }
        break;
      case 'ray': this.fx.beamLine(`r${e.id}${Math.random()}`, e.o, e.t, c, P.glow, 0.09, 0.25); this.fx.burst(e.t, P.glow, 14, 5, 0.4, 0.3); break;
      case 'line': this.fx.spikes(e.pts); break;
      case 'nova': if (a) { this.fx.dome([a.p[0], a.p[1] + 1, a.p[2]], P.glow, P.r, 0.5); this.fx.ring(a.p, P.glow, P.r * 1.5, 0.5); } break;
      case 'cone': {
        const d = [e.t[0] - e.o[0], 0, e.t[2] - e.o[2]]; const L = Math.hypot(d[0], d[2]) || 1;
        for (let k = 0; k < 50; k++) { const s = 12 + Math.random() * 10; const sp = (Math.random() - 0.5) * 1.0; const cs = Math.cos(sp); const sn = Math.sin(sp); this.fx.glow.emit(e.o, [((d[0] * cs - d[2] * sn) / L) * s, (Math.random() - 0.3) * 4, ((d[0] * sn + d[2] * cs) / L) * s], this.fx.col(P.glow), 0.7, 0.45, { drag: 2.5 }); }
        if (a) this.fx.ring([a.p[0], a.p[1] + 1.2, a.p[2]], '#ffffff', 6, 0.35, 0, 0.1);
        break;
      }
      case 'flash': this.fx.flash(e.o, '#ffffff', 400, 60); this.fx.dome(e.o, '#ffffff', 6, 0.35); this.fx.burst(e.o, '#ffffff', 60, 18, 0.8, 0.4, { grav: 0 }); break;
      case 'lash': if (e.tgt) a.lash = { to: e.tgt, t: 0.4, color: c, glow: P.glow }; else this.fx.beamLine(`l${e.id}`, e.o, e.t, c, P.glow, 0.06, 0.3); break;
      case 'freeze': this.fx.ring(e.o, P.glow, P.r, 0.8); this.fx.burst(e.o, P.glow, 60, 14, 0.6, 0.8); this.fx.dome(e.o, '#fff3c4', P.r, 0.6); break;
      case 'bigsphere': if (a) { this.setPose(a, 'gather', e.gather + 0.4); a.sphere = { obj: this.makeSphere(c, P.glow), t: 0, max: e.gather }; } break;
      case 'barrage': if (a) this.setPose(a, 'barrage', e.dur); break;
      case 'surge': if (a) { this.fx.dome([a.p[0], a.p[1] + 1, a.p[2]], '#ff2a2a', 4, 0.5); this.fx.flash(a.p, '#ff2a2a', 150, 30); } break;
      case 'titanfist': if (a) { a.fist = 1.3; this.fx.flash(a.p, c, 150, 40); } break;
      case 'buff': if (a) this.fx.burst([a.p[0], a.p[1] + 1, a.p[2]], P.glow, 26, 3, 0.5, 0.8, { grav: -2 }); break;
      case 'clone': if (a) this.fx.puff([a.p[0], a.p[1] + 1, a.p[2]], '#e6f2ff', 8, 1.2, 0.6, 1.5, 0.4); break;
      case 'scatter': if (a) this.fx.burst([a.p[0], a.p[1] + 2, a.p[2]], P.glow, 30, 10, 0.5, 0.5, { up: 2 }); break;
      default: break;
    }
  }

  applySelf(e) {
    const m = this.me;
    if (e.force) m.force = { v: e.force.v.slice(), t: e.force.t };
    if (e.p) { m.p = e.p.slice(); m.v = [0, 0, 0]; }
    if (e.yaw !== undefined) { this.camYaw = e.yaw; }
    if (e.vy !== undefined) { m.v[1] = e.vy; m.ground = false; }
    m.speedMul = e.speedMul || 1;
    if (e.stance) m.stance = Math.max(m.stance || 0, e.stance);
    m.downed = !!e.downed;
  }

  onHit(e) {
    const a = this.avatars.get(e.id);
    const at = a ? [a.p[0], a.p[1] + 2.1, a.p[2]] : null;
    if (a) { a.hp = e.hp; a.shield = e.sh; a.hitT = 0.15; }
    if (e.id === this.myId) {
      this.me.hp = e.hp; this.me.shield = e.sh;
      this.hurt = Math.min(0.6, this.hurt + e.amt / 60);
      this.me.charging = false;
      this.sound.hurt();
      const src = e.by && this.avatars.get(e.by);
      if (src) {
        this.pings.push({ p: src.p.slice(), t: 1 });
        const dx = src.p[0] - this.me.p[0]; const dz = src.p[2] - this.me.p[2]; const y = this.camYaw;
        this.hud.damageDir(Math.atan2(dx * Math.cos(y) - dz * Math.sin(y), -dx * Math.sin(y) - dz * Math.cos(y)));
      }
    }
    if (e.by === this.myId && e.id !== this.myId) {
      this.stats.dmg += e.amt;
      if (at) this.hud.damageNumber(at, e.amt, e.amt >= 40 ? 'big' : e.sh > 0 ? 'sh' : '');
      this.hud.hitMarker(); this.sound.hitmark(e.amt >= 40);
      this.me.ultCharge = Math.min(COMBAT.ultCharge, this.me.ultCharge + e.amt * COMBAT.ultPerDmg);
    }
    if (a && e.power !== 'storm') this.fx.burst([a.p[0], a.p[1] + 1.2, a.p[2]], e.sh > 0 ? '#7fd8ff' : '#ff4a5a', 6, 3, 0.3, 0.3);
  }

  onKill(e) {
    const r = this.roster.get(e.id); const k = e.by && this.roster.get(e.by);
    this.alive = e.left; this.teamsLeft = e.teams;
    const how = e.power ? (POWER[e.power] ? POWER[e.power].name : e.power === 'melee' ? 'Fists' : e.power === 'storm' ? 'the Storm' : e.power === 'bleed' ? 'Bled out' : '') : '';
    const mine = e.by === this.myId || e.id === this.myId;
    this.hud.feed(k ? `<b>${esc(k.name)}</b><i>${esc(how)}</i><b>${esc(r ? r.name : '?')}</b>` : `<b>${esc(r ? r.name : '?')}</b><i>${e.power === 'storm' ? 'lost to the storm' : 'eliminated'}</i>`, mine, !mine && k && k.team === this.myTeam && this.matchMode !== 'solo');
    if (this.marks) this.marks.delete(`e${e.id}`);
    const a = this.avatars.get(e.id);
    if (a) { a.alive = false; a.deathT = 0; a.deathDir = 1; this.fx.burst([a.p[0], a.p[1] + 1, a.p[2]], '#ffd166', 40, 6, 0.6, 1.2, { grav: -1 }); if (a.sphere) { this.scene.remove(a.sphere.obj); a.sphere = null; } if (this.lockId === e.id) this.lockId = null; }
    if (r) r.dead = true;
    if (e.by === this.myId) { this.stats.kills++; this.me.ultCharge = Math.min(COMBAT.ultCharge, this.me.ultCharge + 20); this.hud.killBanner(r ? r.name : '?', this.stats.kills); this.sound.kill(); }
    if (e.id === this.myId) {
      this.me.alive = false; this.me.downed = false;
      this.dead = true;
      this.killer = e.by;
      if (e.teamOut) this.finish(e.place, k ? k.name : null);
      else { this.spectating = true; this.killer = [...this.avatars.values()].find((x) => x.alive && x.mate)?.id || e.by; this.hud.center('ELIMINATED', 'Your squad fights on — spectating', 3, '#ff6a6a'); }
    } else if (e.teamOut && e.team === this.myTeam && this.dead) this.finish(e.place, k ? k.name : null);
  }
  onWin(e) {
    const won = e.team === this.myTeam;
    if (won) { this.sound.win(); this.finish(1, null); } else if (!this.result) this.finish(2, null);
    this.hud.center(won ? 'VICTORY' : `${esc((this.roster.get(e.id) || { name: '?' }).name)}${this.matchMode !== 'solo' ? '’S SQUAD' : ''} WINS`, '', 6, '#ffd166');
  }
  finish(place, by) {
    if (this.result) return;
    const prevLv = level(this.save.xp);
    let xp = Math.round(40 + this.stats.kills * 35 + this.stats.dmg * 0.15 + (50 - place) * 4 + (place === 1 ? 250 : 0));
    // daily challenges
    const ms = { ...this.mstats, kills: this.stats.kills, top10: place <= 10 ? 1 : 0 };
    const D = dailyState(this.save);
    const done = [];
    D.ids.forEach((id) => {
      const C = CHALLENGES.find((c) => c.id === id);
      if (!C || D.done[id]) return;
      D.prog[id] = (D.prog[id] || 0) + (ms[C.stat] || 0);
      if (D.prog[id] >= C.goal) { D.done[id] = true; xp += C.xp; done.push(C); }
    });
    this.result = { place, by, kills: this.stats.kills, dmg: this.stats.dmg, powers: this.stats.found, xp, online: !!this.net, canSpectate: place > 1, done, mode: this.matchMode };
    const S = this.save.stats;
    S.matches++; S.kills += this.stats.kills; S.best = Math.min(S.best || 50, place); if (place === 1) S.wins++; if (place <= 5) S.top5++;
    this.save.xp += xp;
    const lv = level(this.save.xp);
    if (lv > prevLv) {
      const un = [...HEROES.filter((h) => h.unlock > prevLv && h.unlock <= lv).map((h) => h.name), ...AURAS.filter((x) => x.unlock > prevLv && x.unlock <= lv).map((x) => `${x.name} aura`)];
      this.result.levelUp = { lv, un };
    }
    this.save.history.unshift({ place, kills: this.stats.kills, t: Date.now() });
    writeSave(this.save);
    setTimeout(() => { if (this.mode === 'play' && this.result) { this.unlock(); this.hud.show(this.hud.endScreen(this.result), true); } }, place === 1 ? 2500 : 1600);
  }

  // an anime impact frame: a split second of inverted ink, then speed lines
  impact(p, strength = 1) {
    if (p && this.me && Math.hypot(this.me.p[0] - p[0], this.me.p[2] - p[2]) > 70) return;
    this.impactT = 0.07 + strength * 0.03;
    this.linesT = Math.max(this.linesT || 0, 0.35 * strength);
    this.shakeAmt = Math.max(this.shakeAmt || 0, 0.35 * strength);
  }
  shake(p, r) { const d = this.me ? Math.hypot(this.me.p[0] - p[0], this.me.p[2] - p[2]) : 99; this.shakeAmt = Math.max(this.shakeAmt || 0, clamp(1 - d / (r * 5), 0, 1) * 0.6); }

  // ───────────── input ─────────────
  bindInput() {
    const R = this.root;
    this.onKeyDown = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.code;
      if (this.mode !== 'play') return;
      if (['Tab', 'Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyF', 'KeyM', 'KeyC', 'KeyV', 'KeyT', 'KeyG', 'KeyZ'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'Escape') { if (this.invOpen) this.closeInv(); else if (this.mapOpen) this.toggleMap(); return; }
      if (k === 'Tab') { if (this.invOpen) this.closeInv(); else this.openInv(); return; }
      if (k === 'KeyM') { this.toggleMap(); return; }
      if (k === 'KeyB' && !this.invOpen && !this.mapOpen) { this.pingAim(); return; }
      if (this.invOpen || this.dead) return;
      if (this.clash && ['Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyF', 'KeyC'].includes(k)) { this.mashKey(); return; }
      if (k === 'Space') this.pressJump();
      if (k === 'KeyQ') this.castSlot(0); if (k === 'KeyE') this.castSlot(1); if (k === 'KeyR') this.castSlot(2); if (k === 'KeyX') this.castSlot(3);
      if (k === 'Digit1') this.castSlot(0); if (k === 'Digit2') this.castSlot(1); if (k === 'Digit3') this.castSlot(2);
      if (k === 'Digit4') this.useItem('medkit'); if (k === 'Digit5') this.useItem('cell');
      if (k === 'KeyV') this.vanish();
      if (k === 'KeyT') this.toggleLock();
      if (k === 'KeyG') this.transform();
      const em = EMOTES.find((x) => `Digit${x.key}` === k); if (em) this.emote(em.id);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.onMouseMove = (e) => {
      if (document.pointerLockElement !== this.renderer.domElement || this.mode !== 'play') return;
      const s = 0.0022 * this.S.sens * (this.aiming > 0.5 ? 0.65 : 1);
      this.camYaw -= e.movementX * s;
      this.camPitch = clamp(this.camPitch - e.movementY * s * (this.S.invertY ? -1 : 1), -1.35, 1.2);
    };
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      this.sound.init();
      if (this.mode !== 'play') return;
      if (document.pointerLockElement !== this.renderer.domElement) { if (!this.invOpen && !this.result) this.lock(); return; }
      if (e.button === 0) { this.mouse.l = true; this.mouse.lT = 0; if (this.clash) this.mashKey(); }
      if (e.button === 2) this.mouse.r = true;
      if (e.button === 1) { e.preventDefault(); this.pingAim(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouse.l) { this.mouse.l = false; this.releaseAttack(this.mouse.lT); }
      if (e.button === 2) this.mouse.r = false;
    });
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.onLockChange = () => {
      if (document.pointerLockElement !== this.renderer.domElement && this.mode === 'play' && !this.invOpen && !this.mapOpen && !this.result && !this.isTouch && !this.unlocking) this.hud.show(this.hud.pauseScreen(!!this.net), true);
      this.unlocking = false;
    };
    document.addEventListener('pointerlockchange', this.onLockChange);
    R.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { e.preventDefault(); this.act(b.dataset.act, b.dataset.arg); }
    });
    R.addEventListener('input', (e) => {
      const k = e.target.dataset && e.target.dataset.set;
      if (!k) return;
      this.S[k] = Number(e.target.value);
      if (k === 'volume') this.sound.setVolume(this.S.volume);
      if (k === 'fov') { this.camera.fov = this.S.fov; this.camera.updateProjectionMatrix(); }
      if (k === 'xhSize') this.hud.applyCrosshair(this.S);
      writeSave(this.save);
    });
    this.onBlur = () => { this.keys.clear(); this.mouse.l = false; this.mouse.r = false; };
    window.addEventListener('blur', this.onBlur);
  }
  lock() { if (this.isTouch || MANUAL) return; try { const p = this.renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed */ } }
  unlock() { if (document.pointerLockElement) { this.unlocking = true; document.exitPointerLock(); } }

  // a tap jumps; two quick taps take off (or land)
  pressJump() {
    if (this.time - this.lastSpace < 0.32) { this.flyTogglePressed = true; this.lastSpace = -9; } else { this.lastSpace = this.time; this.jumpPressed = true; }
  }
  // left mouse: tap for the combo, hold and release for a heavy smash
  releaseAttack(held) { if (held >= COMBAT.heavy.charge) this.heavy(); else this.punch(); }
  mashKey() { if (!this.clash) return; this.send({ t: 'mash' }); this.clash.pulse = 0.15; this.sound.mash(); }

  buildTouch() {
    const tc = this.hud.el.querySelector('.tc');
    tc.innerHTML = `<div class="stick"><i></i></div>
      <div class="tb" data-t="jump" style="right:1.2em;bottom:6.5em;width:4.6em;height:4.6em">JUMP</div>
      <div class="tb" data-t="punch" style="right:6.6em;bottom:2.4em;width:4.6em;height:4.6em">HIT</div>
      <div class="tb" data-t="0" style="right:11.6em;bottom:1.2em">Q</div><div class="tb" data-t="1" style="right:12.4em;bottom:5.6em">E</div><div class="tb" data-t="2" style="right:9.6em;bottom:9.4em">R</div>
      <div class="tb" data-t="3" style="right:5.2em;bottom:11.4em;border-color:#ffd166">ULT</div>
      <div class="tb" data-t="use" style="right:1.2em;bottom:12em">F</div>
      <div class="tb" data-t="fly" style="right:1.2em;bottom:16.6em;border-color:#7fd8ff">FLY</div>
      <div class="tb" data-t="down" style="right:5.6em;bottom:16em;width:3.2em;height:3.2em">▼</div>
      <div class="tb" data-t="charge" style="left:11em;bottom:9em;width:3.6em;height:3.6em;border-color:#ffd84a">CHG</div>
      <div class="tb" data-t="vanish" style="right:9.8em;bottom:14em;width:3.2em;height:3.2em">VAN</div>
      <div class="tb" data-t="lock" style="right:1.2em;top:19em;width:3.2em;height:3.2em">LOCK</div>
      <div class="tb" data-t="ping" style="right:5em;top:15em;width:3.2em;height:3.2em;border-color:#ffd84a">PING</div>
      <div class="tb" data-t="form" style="right:5em;top:19em;width:3.2em;height:3.2em;border-color:#ffd84a">ASC</div>
      <div class="tb" data-t="inv" style="right:1.2em;top:15em;width:3.2em;height:3.2em">BAG</div>
      <div class="tb" data-t="heal" style="left:11em;bottom:1.2em;width:3.2em;height:3.2em">+HP</div>
      <div class="tb" data-t="sprint" style="left:11em;bottom:5em;width:3.2em;height:3.2em">RUN</div>`;
    const stick = tc.querySelector('.stick'); const knob = stick.querySelector('i');
    let sid = null; let look = null;
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; e.preventDefault(); }, { passive: false });
    const moveStick = (t) => { const r = stick.getBoundingClientRect(); let x = (t.clientX - r.left) / r.width * 2 - 1; let y = (t.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.tc.mx = x; this.tc.mz = -y; knob.style.transform = `translate(${x * 2.6}em,${y * 2.6}em)`; };
    tc.querySelectorAll('.tb').forEach((b) => {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); this.sound.init();
        const t = b.dataset.t;
        if (this.clash && t !== 'inv') { this.mashKey(); return; }
        if (t === 'jump') { this.jumpPressed = true; this.keys.add('Space'); } else if (t === 'punch') { this.mouse.l = true; this.mouse.lT = 0; }
        else if (t === 'use') this.keys.add('KeyF'); else if (t === 'inv') { if (this.invOpen) this.closeInv(); else this.openInv(); } else if (t === 'heal') this.useItem(this.me && this.me.hp < 100 ? 'medkit' : 'cell'); else if (t === 'sprint') this.tc.sprint = !this.tc.sprint;
        else if (t === 'fly') this.flyTogglePressed = true; else if (t === 'down') this.keys.add('KeyZ'); else if (t === 'charge') this.keys.add('KeyC');
        else if (t === 'vanish') this.vanish(); else if (t === 'lock') this.toggleLock(); else if (t === 'ping') this.pingAim(); else if (t === 'form') this.transform();
        else this.castSlot(Number(t));
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        const t = b.dataset.t;
        if (t === 'jump') this.keys.delete('Space'); if (t === 'use') this.keys.delete('KeyF'); if (t === 'down') this.keys.delete('KeyZ'); if (t === 'charge') this.keys.delete('KeyC');
        if (t === 'punch' && this.mouse.l) { this.mouse.l = false; this.releaseAttack(this.mouse.lT); }
      }, { passive: false });
    });
    const cv = this.renderer.domElement;
    cv.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) if (t.clientX > this.root.clientWidth * 0.35 && look === null) look = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) moveStick(t);
        if (look && t.identifier === look.id) { this.camYaw -= (t.clientX - look.x) * 0.006 * this.S.sens; this.camPitch = clamp(this.camPitch - (t.clientY - look.y) * 0.005 * this.S.sens, -1.35, 1.2); look.x = t.clientX; look.y = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; this.tc.mx = 0; this.tc.mz = 0; knob.style.transform = ''; } if (look && t.identifier === look.id) look = null; } });
  }

  // ───────────── actions ─────────────
  send(m) { if (this.match) this.match.handle(this.myId, m); else if (this.net) this.net.toHost(m); }
  canAct() { const m = this.me; return m && m.alive && !m.downed && m.mode !== 'ship' && !(m.frozen > 0) && !(m.held > 0) && !(m.tumble > 0.3) && !this.usingT; }

  // where the crosshair points in the world (the locked target, else enemies near the crosshair first)
  aimPoint() {
    const lk = this.lockId && this.avatars.get(this.lockId);
    if (lk && lk.alive) return [lk.p[0], lk.p[1] + 1.1, lk.p[2]];
    const cam = this.camera;
    const o = cam.position.toArray(); const d = cam.getWorldDirection(this.v3).toArray();
    let best = 160;
    let hit = null;
    for (const a of this.avatars.values()) {
      if (a.id === this.myId || !a.alive || a.mode === 'ship' || a.mate) continue;
      const c = [a.p[0] - o[0], a.p[1] + 1.1 - o[1], a.p[2] - o[2]];
      const t = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
      if (t < 2 || t > best) continue;
      const off = Math.hypot(c[0] - d[0] * t, c[1] - d[1] * t, c[2] - d[2] * t);
      if (off < 0.9 + t * 0.012) { best = t; hit = [a.p[0], a.p[1] + 1.1, a.p[2]]; }
    }
    const w = this.island.ray(o, d, best);
    if (w && (!hit || w.t < best)) return w.p;
    return hit || [o[0] + d[0] * 160, o[1] + d[1] * 160, o[2] + d[2] * 160];
  }
  toggleLock() {
    if (this.lockId) { this.lockId = null; this.sound.ui(); return; }
    const cam = this.camera; const o = cam.position; const d = cam.getWorldDirection(this.v3.clone());
    let best = null; let bs = 0.93;
    for (const a of this.avatars.values()) {
      if (a.id === this.myId || !a.alive || a.mode === 'ship' || a.mate) continue;
      const c = new THREE.Vector3(a.p[0] - o.x, a.p[1] + 1.1 - o.y, a.p[2] - o.z); const L = c.length();
      if (L > 180) continue;
      const s = c.dot(d) / L + (1 - L / 180) * 0.03;
      if (s > bs) { bs = s; best = a; }
    }
    if (best) { this.lockId = best.id; this.sound.lock(); } else this.hud.toast('No target in sight to lock on to', '#cccccc');
  }
  castSlot(i) {
    const m = this.me;
    if (!this.canAct() || m.stance > 0) return;
    const id = i === 3 ? this.inv.ult : this.inv.slots[i];
    if (!id) { this.hud.toast(i === 3 ? 'No ultimate equipped' : 'Empty technique slot — open crates!', '#ff7a7a'); return; }
    const P = POWER[id];
    if (P.ult && m.ultCharge < COMBAT.ultCharge) { this.hud.toast('Ultimate not charged', '#ff7a7a'); return; }
    if (!P.ult && (this.cd[id] || 0) > 0) return;
    if (!P.ult && m.ki < (P.ki || 0)) { this.noKi(); return; }
    m.charging = false;
    const aim = this.aimPoint();
    m.yaw = this.camYaw; this.faceYaw = this.camYaw; this.faceT = 0.8;
    this.send({ t: 'cast', slot: i, aim, yaw: this.camYaw, pitch: this.camPitch, lock: this.lockId || undefined });
  }
  punch() {
    const m = this.me;
    if (!this.canAct() || this.invOpen || m.stance > 0 || (this.meleeAnim && this.meleeAnim.t > this.meleeAnim.dur * 0.3)) return;
    const n = this.combo.t > 0 ? (this.combo.n + 1) % COMBAT.melee.length : 0;
    this.combo = { n, t: COMBAT.comboWindow };
    const M = COMBAT.melee[n];
    this.meleeAnim = { n, t: M.t, dur: M.t };
    this.lunge(9);
    this.send({ t: 'melee', n, yaw: this.faceYaw, pitch: this.camPitch });
  }
  heavy() {
    const m = this.me;
    if (!this.canAct() || this.invOpen || m.stance > 0) return;
    this.combo = { n: 0, t: 0 };
    this.meleeAnim = { n: 5, t: COMBAT.heavy.t, dur: COMBAT.heavy.t };
    this.lunge(14);
    this.send({ t: 'heavy', yaw: this.faceYaw, pitch: this.camPitch });
  }
  // face the nearest enemy in front and lunge toward them (in the air too)
  lunge(power) {
    const m = this.me;
    let yaw = this.camYaw;
    let best = null; let bd = m.mode === 'fly' ? 7 : 4.5;
    const lk = this.lockId && this.avatars.get(this.lockId);
    for (const a of this.avatars.values()) {
      if (a.id === this.myId || !a.alive || a.mate) continue;
      const dx = a.p[0] - m.p[0]; const dz = a.p[2] - m.p[2]; const dy = a.p[1] - m.p[1]; const d = Math.hypot(dx, dz, dy);
      const fwd = (-Math.sin(this.camYaw) * dx - Math.cos(this.camYaw) * dz) / (Math.hypot(dx, dz) || 1);
      if (d < bd && (fwd > 0.4 || a === lk) && (Math.abs(dy) < 2.5 || m.mode === 'fly')) { bd = d; best = a; }
    }
    if (best) {
      yaw = Math.atan2(-(best.p[0] - m.p[0]), -(best.p[2] - m.p[2]));
      if (bd > 1.6) { const d = [best.p[0] - m.p[0], best.p[1] - m.p[1], best.p[2] - m.p[2]]; const L = Math.hypot(...d); m.v[0] += (d[0] / L) * power; m.v[2] += (d[2] / L) * power; if (m.mode === 'fly') m.v[1] += (d[1] / L) * power; }
    }
    this.faceYaw = yaw; this.faceT = 0.5;
    m.yaw = yaw;
    m.emote = null;
  }
  vanish() {
    const m = this.me;
    if (!m || !m.alive || m.downed || m.mode === 'ship' || m.stance > 0) return;
    if (m.ki < KI.vanish) { this.noKi(); return; }
    this.send({ t: 'vanish', lock: this.lockId || undefined, aim: this.aimPoint(), yaw: this.camYaw, pitch: this.camPitch });
  }
  transform() {
    const m = this.me;
    if (!m || !m.alive || m.downed || m.mode === 'ship') return;
    if (m.formMeter < 100) { this.hud.toast(m.form >= 2 ? 'Already at your peak' : 'Fill the form meter by fighting', '#ffd84a'); return; }
    this.send({ t: 'transform' });
  }
  emote(id) {
    const m = this.me;
    if (!this.canAct() || m.mode === 'fly' || m.stance > 0) return;
    m.emote = { id, t: 3 };
    this.send({ t: 'emote', em: id });
  }
  useItem(item) {
    if (!this.me || !this.me.alive || this.me.downed || this.inv.items[item] <= 0) return;
    this.send({ t: 'use', item });
  }

  openInv() { if (this.mode !== 'play' || this.dead) return; this.invOpen = true; this.invSel = null; this.unlock(); this.renderInv(); }
  closeInv() { this.invOpen = false; this.hud.hide(); this.lock(); }
  renderInv() { if (this.invOpen) this.hud.show(this.hud.loadoutScreen(this.inv, this.invSel, this.vicinity()), true); }
  vicinity() {
    const m = this.me; if (!m) return [];
    return [...this.loot.values()].map((l) => ({ id: l.id, power: l.kind === 'power' ? l.power : null, item: l.kind === 'power' ? null : l.item, n: l.n || 1, dist: Math.round(Math.hypot(l.p[0] - m.p[0], l.p[2] - m.p[2])) })).filter((l) => l.dist < 9).sort((a, b) => a.dist - b.dist);
  }
  assignSlot(i) {
    const sel = this.invSel;
    const inv = this.inv;
    const slots = inv.slots.slice(); let ult = inv.ult;
    if (!sel) { if (i < 3) slots[i] = null; else ult = null; } else {
      const P = POWER[sel];
      if (P.ult && i !== 3) { this.hud.toast('Ultimates go in the X slot', '#ff7a7a'); return; }
      if (!P.ult && i === 3) { this.hud.toast('Pick an ultimate for this slot', '#ff7a7a'); return; }
      if (P.ult) ult = sel; else { const j = slots.indexOf(sel); if (j >= 0) slots[j] = slots[i]; slots[i] = sel; }
    }
    this.invSel = null;
    this.inv = { ...inv, slots, ult };
    this.send({ t: 'loadout', slots, ult });
    this.renderInv();
  }
  toggleMap() {
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) {
      this.unlock(); this.hud.show(this.hud.mapScreen(), true);
      const bm = this.hud.screen.querySelector('.bigmap');
      if (bm) bm.addEventListener('click', (ev) => {
        const r = bm.getBoundingClientRect();
        const x = ((ev.clientX - r.left) / r.width - 0.5) * 1400; const z = ((ev.clientY - r.top) / r.height - 0.5) * 1400;
        const mine = this.marks.get(`m${this.myId}`);
        if (mine && Math.hypot(mine.p[0] - x, mine.p[2] - z) < 40) this.send({ t: 'ping', p: [x, 0, z], kind: 'clear' });
        else this.send({ t: 'ping', p: [x, this.island.floor(x, z, 999), z], kind: 'mark' });
      });
    } else { this.hud.hide(); this.lock(); }
  }

  // ───────────── the frame ─────────────
  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.draw();
  }

  step(dt) {
    this.time += dt;
    this.view.uniforms.time.value = this.time;
    if (this.mode === 'play') this.stepPlay(dt);
    else this.stepMenu(dt);
    this.view.update(dt, this.camera.position);
    // spray where the river tumbles down the mountain
    const fl = this.view.falls;
    if (fl && Math.random() < 0.25 && this.camera.position.distanceTo(this.v3.set(fl[0], fl[1], fl[2])) < 260) this.fx.puff([fl[0] + (Math.random() - 0.5) * 6, fl[1] - Math.random() * 20, fl[2] + (Math.random() - 0.5) * 6], '#eef6fa', 1, 3, 2, 2, 0.22);
    this.fx.update(dt);
    this.fx.updateEnts(dt, (h, d, o) => animateHero(h, { dt: d, speed: o && o.mode === 'fly' ? 4 : 0, mode: o && o.mode === 'fly' ? 'fly' : 'ground', ground: !(o && o.mode === 'fly'), alive: true, castT: Math.random() < 0.05 ? 0.4 : 0 }));
    this.fx.updateZones(dt);
    if (this.net) this.net.tick(dt);
  }

  stepMenu(dt) {
    const t = this.time * 0.03;
    if (this.preview) {
      const h = this.preview.h; const p = h.root.position;
      animateHero(h, { dt, speed: 0, mode: 'ground', ground: true, alive: true, pose: 'charge' });
      const am = this.preview.auraM;
      am.material.uniforms.time.value = this.time;
      am.material.uniforms.amp.value = 0.55 + Math.sin(this.time * 1.3) * 0.2;
      if (Math.random() < 0.4) this.fx.glow.emit([p.x + (Math.random() - 0.5) * 1.2, p.y + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 1.2], [0, 1.6 + Math.random(), 0], this.fx.col(this.auraColor(this.S.hero, this.S.aura)), 0.35, 0.9, { drag: 0.5 });
      if (Math.random() < 0.05) this.fx.rock([p.x + (Math.random() - 0.5) * 3, p.y, p.z + (Math.random() - 0.5) * 3], [0, 1 + Math.random(), 0], 3, 0.7, -0.2);
      const a = -2.2 + Math.sin(t * 2) * 0.08;
      h.root.rotation.y = a;
      const fx = -Math.sin(a); const fz = -Math.cos(a);
      this.camera.position.set(p.x + fx * 3.3, p.y + 1.15, p.z + fz * 3.3);
      this.camera.lookAt(p.x, p.y + 1.2, p.z);
      this.camera.rotateY(this.root.clientWidth > 700 ? 0.3 : 0);
    } else {
      this.camera.position.set(Math.cos(t) * 520, 180, Math.sin(t) * 520);
      this.camera.lookAt(0, 20, 0);
    }
    this.moveSun(this.camera.position);
  }

  stepPlay(dt) {
    const m = this.me;
    // ── local hero ──
    this.combo.t -= dt;
    if (this.mouse.l) this.mouse.lT += dt;
    if (this.meleeAnim) { this.meleeAnim.t -= dt; if (this.meleeAnim.t <= 0) this.meleeAnim = null; }
    this.castT = Math.max(0, this.castT - dt);
    this.hits.t -= dt;
    this.blindT = Math.max(0, this.blindT - dt);
    this.impactT = Math.max(0, (this.impactT || 0) - dt);
    this.linesT = Math.max(0, (this.linesT || 0) - dt);
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    ['frozen', 'root', 'held', 'stance'].forEach((k) => { if (m[k] > 0) m[k] = Math.max(0, m[k] - dt); });
    if (m.emote) { m.emote.t -= dt; if (m.emote.t <= 0) m.emote = null; }
    if (this.usingT) { this.usingT.t -= dt; }
    if (m.alive && this.phase !== 'ship') m.ultCharge = Math.min(COMBAT.ultCharge, m.ultCharge + COMBAT.ultPassive * dt);
    this.hurt = Math.max(0, this.hurt - dt * 0.5);
    this.aiming = damp(this.aiming, this.mouse.r && m.alive ? 1 : 0, 12, dt);
    this.matchTime += dt;
    const k = this.keys;
    let mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.tc.mx;
    let mz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.tc.mz;
    if (this.invOpen || this.mapOpen || this.dead) { mx = 0; mz = 0; }
    if (Math.abs(mx) + Math.abs(mz) > 0.1 && m.emote) m.emote = null;
    const inp = {
      mx: clamp(mx, -1, 1), mz: clamp(mz, -1, 1), yaw: this.camYaw, pitch: this.camPitch, jump: !!this.jumpPressed && !this.invOpen, hold: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.tc.sprint, down: k.has('ControlLeft') || k.has('KeyZ'), flyToggle: !!this.flyTogglePressed && !this.invOpen,
    };
    this.jumpPressed = false; this.flyTogglePressed = false;
    // holding C powers up ki
    m.charging = m.alive && !m.downed && k.has('KeyC') && !this.clash && m.mode !== 'ship' && m.mode !== 'fall' && m.mode !== 'glide' && !(m.stance > 0) && !(m.tumble > 0) && !this.invOpen;
    if (m.charging) m.emote = null;
    if (m.alive) {
      if (m.mode === 'ship') {
        if (this.match) m.p = this.match.ship.p.slice(); else if (this.shipPath) { const f = Math.min(1, (this.shipT * 48) / Math.hypot(this.shipPath.b[0] - this.shipPath.a[0], this.shipPath.b[2] - this.shipPath.a[2])); m.p = [this.shipPath.a[0] + (this.shipPath.b[0] - this.shipPath.a[0]) * f, SHIP_H, this.shipPath.a[2] + (this.shipPath.b[2] - this.shipPath.a[2]) * f]; }
        if (inp.jump || inp.flyToggle) this.send({ t: 'drop' });
      } else {
        const wasGround = m.ground; const vy = m.v[1]; const p0 = m.p.slice(); const wasFly = m.mode === 'fly';
        if (this.usingT) { inp.mx = 0; inp.mz = 0; }
        stepBody(m, inp, dt, this.island);
        if (!wasGround && m.ground && vy < -12) { this.sound.land(m.p); this.fx.puff(m.p, '#b9a58a', 6, 1.2, 0.8, 1, 0.4); if (vy < -25) { this.fx.ring(m.p, '#d9c8a8', 5, 0.4); this.shakeAmt = Math.max(this.shakeAmt || 0, 0.3); } }
        if (m.mode === 'fly' && !wasFly) { this.sound.takeoff(m.p); this.fx.ring(m.p, '#ffffff', 4, 0.4); }
        if (m.mode === 'fly') this.mstats.flyKm += Math.hypot(m.p[0] - p0[0], m.p[1] - p0[1], m.p[2] - p0[2]) / 1000;
        // supersonic: a sonic ring when the dash kicks in
        if (m.boostT > 1.3 && !this.sonic) { this.sonic = true; this.fx.ring([m.p[0], m.p[1] + 1, m.p[2]], '#ffffff', 9, 0.5, 0, 0.08); this.sound.sonic(); }
        if (!(m.boostT > 1.3)) this.sonic = false;
        // pull from gravity fields nearby
        for (const z of this.fx.zones.values()) {
          const P = POWER[z.power]; if (!P.pull || z.owner === this.myId) continue;
          const dx = z.p[0] - m.p[0]; const dz = z.p[2] - m.p[2]; const d = Math.hypot(dx, dz);
          if (d < z.r && d > 0.8) { const pull = P.pull * (1 - d / (z.r * 1.4)); m.v[0] += (dx / d) * pull * dt * 6; m.v[2] += (dz / d) * pull * dt * 6; }
        }
      }
      this.stepInteract(dt);
      // report our state
      this.lastSend -= dt;
      if (this.lastSend <= 0) {
        this.lastSend = this.match ? 0 : 1 / 20;
        const aimNow = this.castT > 0 || m.stance > 0;
        this.send({ t: 'state', p: m.p, v: m.v, yaw: this.camYaw, pitch: this.camPitch, mode: m.mode, g: m.ground, a: 0, c: m.charging ? 1 : 0, b: m.boosting ? 1 : 0, em: m.emote ? m.emote.id : 0, aim: aimNow ? this.aimPoint() : undefined });
      }
    }
    if (this.match) {
      this.match.step(dt);
      const P = this.match.players.get(this.myId);
      if (P) { m.ki = P.ki; m.formMeter = P.formMeter; m.form = P.form; m.bleed = P.bleed || 0; m.hp = P.hp; m.shield = P.shield; m.absorb = P.absorb || 0; m.ultCharge = P.ultCharge; m.surge = P.surge || 0; m.afterimage = P.buffs.afterimage > 0; m.barrier = P.buffs.barrier > 0; m.downed = !!P.downed; m.speedMul = this.match.speedMul(P); }
    }
    if (!this.match) this.shipT += dt;
    // the day goes by
    if (this.phase !== 'ship') this.applyTimeOfDay(clamp(0.08 + (this.matchTime / MATCH_DAY) * 0.9, 0, 0.98));
    else this.applyTimeOfDay(0.08);
    this.stepStorm(dt);
    this.updateAvatars(dt);
    this.updateWorldObjects(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.sound.listen(this.camera.position.toArray(), this.camYaw);
    this.sound.setWind(m.alive && (m.mode === 'fall' || m.mode === 'glide' || m.mode === 'fly') ? (m.mode === 'fall' ? 1 : m.boosting ? 1 : 0.4) : 0);
    this.sound.chargeLoop(m.charging ? 1 : 0);
    this.pings = this.pings.filter((p) => (p.t -= dt * 0.4) > 0);
    this.stepWorldEvents(dt);
  }

  stepInteract(dt) {
    const m = this.me;
    let best = null; let bd = 3.2; let mate = null;
    if (!m.downed && (m.mode === 'ground' || m.mode === 'swim')) {
      for (const c of this.crates.values()) { if (c.open) continue; const d = Math.hypot(c.p[0] - m.p[0], c.p[2] - m.p[2]); if (d < bd && Math.abs(c.p[1] - m.p[1]) < 2.5) { bd = d; best = c; } }
      for (const a of this.avatars.values()) { if (!a.mate || !a.alive || !(a.flags & 128)) continue; const d = Math.hypot(a.p[0] - m.p[0], a.p[1] - m.p[1], a.p[2] - m.p[2]); if (d < 3.4) { mate = a; best = null; break; } }
    }
    this.nearCrate = best; this.nearMate = mate;
    const target = mate ? `m${mate.id}` : best ? `c${best.id}` : null;
    if (target && this.keys.has('KeyF') && !this.usingT) {
      this.channel = this.channel && this.channel.id === target ? this.channel : { id: target, t: 0 };
      this.channel.t += dt;
      if (mate && this.channel.t >= 4) { this.send({ t: 'revive', target: mate.id }); this.channel = null; }
      else if (best && this.channel.t >= CRATES[best.tier].open) { this.send({ t: 'open', crate: best.id }); this.channel = null; }
    } else this.channel = null;
  }

  stepStorm() {
    const st = this.storm;
    if (!st.next) return;
    if (this.match) { const s = this.match.storm; st.c = s.c.slice(); st.r = s.r; }
    else if (this.snapStorm) { st.c = [this.snapStorm[0], this.snapStorm[1]]; st.r = this.snapStorm[2]; }
    this.fx.setStorm(st.c, st.r);
    const inside = this.me && Math.hypot(this.me.p[0] - st.c[0], this.me.p[2] - st.c[1]) <= st.r;
    this.inStorm = !inside && this.me.alive && this.me.mode !== 'ship';
  }

  // ── other heroes ──
  updateAvatars(dt) {
    const M = this.match;
    const camP = this.camera.position;
    this.camera.updateMatrixWorld();
    this.frustum = this.frustum || new THREE.Frustum();
    this.sph = this.sph || new THREE.Sphere();
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    for (const a of this.avatars.values()) {
      const isMe = a.id === this.myId;
      if (isMe) {
        const m = this.me;
        a.p = m.p.slice(); a.v = m.v.slice(); a.mode = m.mode; a.ground = m.ground; a.alive = m.alive; a.hp = m.hp; a.ki = m.ki;
        a.speed = Math.hypot(m.v[0], m.v[2]); a.pitch = this.camPitch; a.yaw = this.camYaw;
        a.flags = (m.afterimage ? 1 : 0) | (m.form ? 2 : 0) | (m.form === 2 ? 8192 : 0) | (m.frozen > 0 ? 4 : 0) | (this.usingT ? 8 : 0) | (m.charging ? 32 : 0) | (m.boosting ? 64 : 0) | (m.downed ? 128 : 0) | (m.tumble > 0 ? 256 : 0) | (m.surge > 0 ? 512 : 0) | (m.stance > 0 ? 2048 : 0);
        this.faceT = (this.faceT || 0) - dt;
        let want = a.face;
        if (this.lockId && this.avatars.get(this.lockId)) { const t = this.avatars.get(this.lockId); want = Math.atan2(-(t.p[0] - m.p[0]), -(t.p[2] - m.p[2])); }
        else if (this.aiming > 0.5 || this.faceT > 0 || this.castT > 0 || m.mode === 'fly' || m.stance > 0 || m.charging) want = this.faceT > 0 && this.faceYaw !== undefined ? this.faceYaw : this.camYaw;
        else if (a.speed > 0.5) want = Math.atan2(-m.v[0], -m.v[2]);
        if (this.faceT > 0 && this.faceYaw !== undefined) want = this.faceYaw;
        a.face = a.face + wrapAngle(want - a.face) * Math.min(1, dt * 12);
        a.castT = Math.max(this.castT, 0);
        a.melee = this.meleeAnim;
        a.emote = m.emote;
      } else if (M) {
        const pl = M.players.get(a.id);
        if (pl) {
          a.p = pl.p.slice(); a.v = pl.v.slice(); a.mode = pl.mode; a.ground = pl.ground; a.yaw = pl.yaw; a.pitch = pl.pitch; a.hp = pl.hp; a.shield = pl.shield; a.absorb = pl.absorb;
          a.flags = M.flags(pl); a.ki = pl.ki; a.fm = pl.formMeter; a.pw = Object.values(pl.powers).reduce((x, y) => x + y, 0); a.bleed = pl.bleed || 0;
          a.speed = Math.hypot(pl.v[0], pl.v[2]);
        }
      } else this.interpolate(a);
      if (!isMe) {
        a.castT = Math.max(0, a.castT - dt);
        if (a.melee) { a.melee.t -= dt; if (a.melee.t <= 0) a.melee = null; }
        if (a.emote) { a.emote.t -= dt; if (a.emote.t <= 0 || a.speed > 1.5) a.emote = null; }
        let want = a.yaw;
        if (a.speed > 1.2 && a.castT <= 0 && !a.melee && a.mode === 'ground' && !(a.flags & 2048)) want = Math.atan2(-a.v[0], -a.v[2]);
        a.face = a.face + wrapAngle(want - a.face) * Math.min(1, dt * 10);
      }
      for (const k in a.buffs) { a.buffs[k] -= dt; if (a.buffs[k] <= 0) delete a.buffs[k]; }
      if (a.poseT > 0) { a.poseT -= dt; if (a.poseT <= 0) a.pose = null; }
      const h = a.h;
      const visible = a.alive || (a.deathT || 0) < 4;
      if (!a.alive) a.deathT = (a.deathT || 0) + dt;
      const dist = Math.hypot(a.p[0] - camP.x, a.p[2] - camP.z);
      const inShip = a.mode === 'ship';
      h.root.visible = visible && !inShip && dist < 360 && (isMe || this.frustum.intersectsSphere(this.sph.set(this.v3.set(a.p[0], a.p[1] + 1, a.p[2]), 3)));
      h.setFar(!isMe && dist > 24);
      if (a.tag) {
        a.tag.visible = a.alive && !inShip && (a.mate ? true : h.root.visible && dist < 34);
        a.tag.position.set(a.p[0], a.p[1] + 2.3, a.p[2]);
      }
      if (!h.root.visible) continue;
      h.root.position.set(a.p[0], a.p[1], a.p[2]);
      h.root.rotation.y = a.face;
      // which held pose?
      let pose = null;
      if (a.flags & 128) pose = 'downed';
      else if (a.flags & 256) pose = 'tumble';
      else if (a.pose) pose = a.pose;
      else if (a.flags & 32) pose = 'charge';
      else if (a.emote) pose = a.emote.id;
      a.animT = (a.animT || 0) + dt;
      if (dist < 90 || a.animT > 0.12) {
        animateHero(h, {
          dt: a.animT, speed: a.speed, mode: a.mode === 'ship' ? 'fall' : a.mode, ground: a.ground !== false, sprint: a.speed > 8.5, aimPitch: a.pitch,
          castT: pose ? 0 : a.castT, melee: a.melee, using: !!(a.flags & 8), alive: a.alive, deathDir: a.deathDir, frozen: !!(a.flags & 4) || a.buffs.frozen > 0, pose,
        });
        a.animT = 0;
      }
      this.statusVisuals(a, dt, isMe, dist);
    }
  }
  statusVisuals(a, dt, isMe, dist) {
    const h = a.h;
    const st = h.status || (h.status = {});
    const F = a.flags;
    const form = F & 2 ? (F & 8192 ? 2 : 1) : 0;
    setForm(h, form, form ? FORMS[form].color : null);
    if (!form) setRim(h, F & 512 ? '#ff2a2a' : F & 32 ? a.auraCol : null, F & 512 ? 0.9 : 0.4);
    // the aura: charging, boosting, ascended, surging, firing
    let amp = 0; let col = a.auraCol;
    if (F & 32) amp = 1; else if (F & 64) amp = 0.75; else if (F & 2048) amp = 0.5;
    if (form) { amp = Math.max(amp, form === 2 ? 0.65 : 0.45); col = FORMS[form].color; }
    if (F & 512) { amp = Math.max(amp, 0.8); col = '#ff2a2a'; }
    if (a.buffs.fist > 0) { amp = 1; col = POWER.fist.color; }
    if (!a.alive || F & 128) amp = 0;
    a.auraAmp = damp(a.auraAmp, amp, 6, dt);
    if (a.auraAmp > 0.02 && !st.aura) { st.aura = this.fx.aura(col, '#ffffff'); h.root.add(st.aura); }
    if (st.aura) {
      st.aura.visible = a.auraAmp > 0.02;
      const u = st.aura.material.uniforms;
      u.amp.value = a.auraAmp; u.time.value = this.time + (a.id.length * 1.7);
      u.c.value.lerp(this.fx.tmpC.set(col), Math.min(1, dt * 5));
      const s = 1 + (F & 32 ? 0.15 : 0) + (a.buffs.fist > 0 ? 0.8 : 0);
      st.aura.scale.set(s, s + (a.mode === 'fly' && a.speed > 10 ? 0.1 : 0), s);
    }
    // barrier dome
    const shield = (a.buffs.barrier > 0) || (isMe ? this.me.barrier : (a.absorb || 0) > 0);
    if (shield && !st.bubble) { st.bubble = this.fx.shieldBubble(POWER.barrier.color); h.root.add(st.bubble); }
    if (st.bubble) { st.bubble.visible = !!shield; st.bubble.position.y = 1.0; st.bubble.material.uniforms.time.value = this.time; }
    const frozen = !!(F & 4) || a.buffs.frozen > 0;
    if (frozen && !st.ice) { st.ice = this.fx.iceBlock(); h.root.add(st.ice); }
    if (st.ice) st.ice.visible = frozen;
    // afterimage: a flickering ghost
    const after = !!(F & 1);
    if (after !== st.after) {
      st.after = after;
      h.root.traverse((o) => { if (o.material && !Array.isArray(o.material) && !o.material.isShaderMaterial && o.material.side !== THREE.BackSide) { o.material.transparent = after; o.material.opacity = after ? 0.55 : 1; o.material.needsUpdate = true; } });
    }
    if (!a.alive || dist > 120) return;
    const fx = this.fx;
    const at = [a.p[0] + (Math.random() - 0.5) * 0.6, a.p[1] + 0.3 + Math.random() * 1.5, a.p[2] + (Math.random() - 0.5) * 0.6];
    // charging: sparks rising, the ground cracks and rocks float up
    if (F & 32) {
      fx.glow.emit(at, [0, 3 + Math.random() * 2, 0], fx.col(col), 0.4, 0.6, { drag: 0.5 });
      const g = this.island.height(a.p[0], a.p[2]);
      if (a.p[1] - g < 3) {
        if (Math.random() < 0.15) fx.rock([a.p[0] + (Math.random() - 0.5) * 6, g + 0.1, a.p[2] + (Math.random() - 0.5) * 6], [(Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 0.4], 2.6, 0.8 + Math.random(), -0.1);
        if (Math.random() < 0.1) fx.puff([a.p[0], g + 0.1, a.p[2]], '#a8957a', 1, 1.6, 1, 3, 0.35);
        st.crackT = (st.crackT || 0) - dt;
        if (st.crackT <= 0) { st.crackT = 0.9; fx.ring([a.p[0], g, a.p[2]], col, 4, 0.8, 0.12, 0.06); }
      }
      if (isMe || dist < 25) this.shakeAmt = Math.max(this.shakeAmt || 0, isMe ? 0.06 : 0.04);
      if (Math.random() < 0.06) fx.bolt([a.p[0], a.p[1] + 1, a.p[2]], [a.p[0] + (Math.random() - 0.5) * 2, a.p[1] + Math.random() * 2.2, a.p[2] + (Math.random() - 0.5) * 2], col, '#ffffff', 0.1, true);
    }
    if (form === 2 && Math.random() < 0.08) fx.bolt([a.p[0], a.p[1] + 1, a.p[2]], [a.p[0] + (Math.random() - 0.5) * 1.6, a.p[1] + Math.random() * 2, a.p[2] + (Math.random() - 0.5) * 1.6], '#9fd8ff', '#ffffff', 0.1, true);
    if (form && Math.random() < 0.4) fx.glow.emit(at, [0, 1.5, 0], fx.col(FORMS[form].glow), 0.25, 0.5);
    if (F & 512 && Math.random() < 0.5) fx.glow.emit(at, [0, 2, 0], fx.col('#ff4a3a'), 0.35, 0.5);
    // flight trails
    if (a.mode === 'fly' && a.speed > 6) {
      const n = F & 64 ? 3 : 1;
      for (let k = 0; k < n; k++) fx.glow.emit([a.p[0], a.p[1] + 1, a.p[2]], [(Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)], fx.col(col), F & 64 ? 0.7 : 0.35, F & 64 ? 0.5 : 0.3, { drag: 3 });
    }
    if (a.buffs.heal > 0 && Math.random() < 0.5) fx.glow.emit(at, [0, 1.5, 0], fx.col('#5cff8a'), 0.3, 0.8, { drag: 0.5 });
    if (a.buffs.root > 0 && Math.random() < 0.3) fx.puff([a.p[0], a.p[1], a.p[2]], '#8a7556', 1, 0.6, 0.6, 0.6, 0.5);
    if (a.flags & 128 && Math.random() < 0.1) fx.glow.emit([a.p[0], a.p[1] + 0.3, a.p[2]], [0, 0.6, 0], fx.col('#ff4a4a'), 0.3, 0.8);
    // a beam's charge ball between the hands
    if (a.charge) {
      a.charge.t += dt;
      const P = POWER[a.charge.power];
      const f = [-Math.sin(a.face), -Math.cos(a.face)];
      const side = [Math.cos(a.face), -Math.sin(a.face)];
      const hp = a.pose === 'beamcharge' ? [a.p[0] + side[0] * 0.45 + f[0] * 0.1, a.p[1] + 0.95, a.p[2] + side[1] * 0.45 + f[1] * 0.1] : [a.p[0] + f[0] * 0.7, a.p[1] + 1.25, a.p[2] + f[1] * 0.7];
      const k = Math.min(1, a.charge.t / a.charge.max);
      fx.glow.emit(hp, [0, 0, 0], fx.col(P.glow), 0.4 + k * 1.4, 0.08);
      fx.glow.emit(hp, [0, 0, 0], fx.col(P.color), 0.8 + k * 2.4, 0.08);
      for (let n = 0; n < 2; n++) { const r = [hp[0] + (Math.random() - 0.5) * 4, hp[1] + (Math.random() - 0.5) * 4, hp[2] + (Math.random() - 0.5) * 4]; fx.glow.emit(r, [(hp[0] - r[0]) * 4, (hp[1] - r[1]) * 4, (hp[2] - r[2]) * 4], fx.col(P.glow), 0.25, 0.25, { drag: 0 }); }
      if (Math.random() < 0.4) fx.flash(hp, P.color, 30 * k, 12);
      if (a.charge.t > a.charge.max + 0.1) a.charge = null;
    }
    // the gathered sphere above the raised hands
    if (a.sphere) {
      const S = a.sphere; S.t += dt;
      const k = Math.min(1, S.t / S.max);
      S.obj.position.set(a.p[0], a.p[1] + 3 + k * 3.5, a.p[2]);
      const s = 0.4 + k * 3.0 + Math.sin(this.time * 20) * 0.05;
      S.obj.scale.setScalar(s);
      for (let n = 0; n < 4; n++) { const ang = Math.random() * Math.PI * 2; const r = 10 + Math.random() * 20; const q = [a.p[0] + Math.cos(ang) * r, a.p[1] + Math.random() * 12, a.p[2] + Math.sin(ang) * r]; const c = S.obj.position; fx.glow.emit(q, [(c.x - q[0]) * 1.5, (c.y - q[1]) * 1.5, (c.z - q[2]) * 1.5], fx.col(POWER.sun.glow), 0.4, 0.65, { drag: 0 }); }
      if (Math.random() < 0.5) fx.flash([S.obj.position.x, S.obj.position.y, S.obj.position.z], POWER.sun.color, 60 * k, 50);
      if (S.t > S.max + 1.2) { this.scene.remove(S.obj); a.sphere = null; }
    }
    // the golden fist
    if (a.fist > 0) {
      a.fist -= dt;
      const f = [-Math.sin(a.face), -Math.cos(a.face)];
      for (let n = 0; n < 6; n++) fx.glow.emit([a.p[0] + f[0] * 2 + (Math.random() - 0.5) * 2.4, a.p[1] + 1 + (Math.random() - 0.5) * 2.4, a.p[2] + f[1] * 2 + (Math.random() - 0.5) * 2.4], [-f[0] * 8, 0, -f[1] * 8], fx.col(n % 2 ? POWER.fist.color : POWER.fist.glow), 1.4, 0.35);
    }
    // a lash between caster and target
    if (a.lash && a.lash.t > 0) {
      a.lash.t -= dt;
      const t = this.avatars.get(a.lash.to);
      if (t) fx.beamLine(`l${a.id}`, [a.p[0], a.p[1] + 1.3, a.p[2]], [t.p[0], t.p[1] + 1.1, t.p[2]], a.lash.color, a.lash.glow, 0.06);
    }
  }
  // guests: smooth remote heroes between snapshots
  interpolate(a) {
    const s = a.snaps; if (!s.length) return;
    const t = this.netTime - 0.12;
    while (s.length > 2 && s[1].tm <= t) s.shift();
    const A = s[0]; const B = s[1] || s[0];
    const f = B.tm > A.tm ? clamp((t - A.tm) / (B.tm - A.tm), 0, 1.2) : 1;
    a.p = [A.p[0] + (B.p[0] - A.p[0]) * f, A.p[1] + (B.p[1] - A.p[1]) * f, A.p[2] + (B.p[2] - A.p[2]) * f];
    a.v = [(B.p[0] - A.p[0]) / Math.max(0.01, B.tm - A.tm), 0, (B.p[2] - A.p[2]) / Math.max(0.01, B.tm - A.tm)];
    a.yaw = A.yaw + wrapAngle(B.yaw - A.yaw) * f; a.pitch = B.pitch; a.mode = B.mode; a.flags = B.flags; a.hp = B.hp; a.shield = B.sh; a.absorb = B.ab;
    a.ground = !!(B.flags & 16); a.speed = B.spd; a.ki = B.ki; a.fm = B.fm; a.pw = B.pw; a.bleed = B.bleed;
  }
  applySnap(m) {
    this.netTime = m.tm;
    this.snapStorm = m.st;
    this.alive = m.alive; this.teamsLeft = m.teams;
    if (m.ship && this.shipPath) { this.shipPos = m.ship; }
    for (const r of m.pl) {
      const [id, x, y, z, yaw, pitch, mode, hp, sh, flags, ult, spd, ab, ki, fm, pw, bleed] = r;
      if (id === this.myId) {
        const me = this.me;
        me.hp = hp; me.shield = sh; me.ultCharge = ult; me.absorb = ab; me.ki = ki; me.formMeter = fm; me.bleed = bleed;
        me.form = flags & 2 ? (flags & 8192 ? 2 : 1) : 0; me.surge = flags & 512 ? 1 : 0; me.afterimage = !!(flags & 1); me.barrier = ab > 0; me.downed = !!(flags & 128);
        continue;
      }
      const a = this.ensureAvatar(id);
      if (!a) continue;
      a.snaps.push({ tm: m.tm, p: [x, y, z], yaw, pitch, mode, hp, sh, flags, spd, ab, ki, fm, pw, bleed });
      if (a.snaps.length > 8) a.snaps.shift();
    }
  }

  updateWorldObjects(dt) {
    if (this.phase === 'ship' && this.shipPath) {
      const p = this.match ? this.match.ship.p : (this.shipPos || this.me.p);
      this.shipMesh.visible = true;
      this.shipMesh.position.set(p[0], p[1] + 3, p[2]);
      this.shipMesh.rotation.y = Math.atan2(-(this.shipPath.b[0] - this.shipPath.a[0]), -(this.shipPath.b[2] - this.shipPath.a[2]));
      this.shipMesh.rotation.z = Math.sin(this.time * 0.8) * 0.03;
    } else this.shipMesh.visible = false;
    for (const c of this.crates.values()) {
      if (c.opening !== undefined && c.opening < 1) { c.opening = Math.min(1, c.opening + dt * 3); c.obj.userData.lid.rotation.x = -1.9 * c.opening; }
      if (!c.open && c.tier !== 'common') c.obj.userData.beam.material.opacity = 0.08 + Math.sin(this.time * 2 + c.id) * 0.05;
    }
    for (const l of this.loot.values()) {
      l.obj.position.y = l.obj.userData.base + Math.sin(this.time * 2 + l.obj.userData.ph) * 0.12;
      if (l.obj.userData.spin) l.obj.userData.spin.rotation.z += dt * 2;
    }
  }

  // ── camera ──
  updateCamera(dt) {
    const m = this.me;
    const cam = this.camera;
    let target = m;
    if ((this.dead || !m.alive) && this.spectating) {
      let a = this.killer && this.avatars.get(this.killer);
      if (!a || !a.alive) { a = [...this.avatars.values()].find((x) => x.alive && x.mate) || [...this.avatars.values()].find((x) => x.alive && x.id !== this.myId); if (a) this.killer = a.id; }
      if (a) target = { p: a.p, mode: a.mode };
    }
    if (m.mode === 'ship' && m.alive) {
      const p = this.shipMesh.position;
      const back = 34;
      cam.position.set(p.x + Math.sin(this.camYaw) * back * Math.cos(this.camPitch), p.y + 8 - Math.sin(this.camPitch) * back, p.z + Math.cos(this.camYaw) * back * Math.cos(this.camPitch));
      cam.lookAt(p.x, p.y, p.z);
      this.moveSun(cam.position);
      return;
    }
    // lock-on: the camera keeps the target in view
    const lk = this.lockId && this.avatars.get(this.lockId);
    if (lk && lk.alive && target === m) {
      const dx = lk.p[0] - m.p[0]; const dz = lk.p[2] - m.p[2]; const dy = (lk.p[1] + 1) - (m.p[1] + 1.8);
      const d = Math.hypot(dx, dz);
      if (d > 220) this.lockId = null;
      const wy = Math.atan2(-dx, -dz); const wp = clamp(Math.atan2(dy, d) - 0.12, -1.2, 1.0);
      this.camYaw += wrapAngle(wy - this.camYaw) * Math.min(1, dt * 7);
      this.camPitch += (wp - this.camPitch) * Math.min(1, dt * 5);
    }
    const falling = target.mode === 'fall' || target.mode === 'glide';
    const flying = target.mode === 'fly';
    // firing a beam: pull out to the side so you can see it tear across the land
    this.beamCam = damp(this.beamCam || 0, this.myBeam && target === m ? 1 : 0, 3, dt);
    const dist = (falling ? 7.5 : flying ? 5.6 - this.aiming * 2 : 4.3 - this.aiming * 1.9) + this.beamCam * 3;
    const side = falling ? 0 : 0.75 - this.aiming * 0.1 + this.beamCam * 2.4;
    const up = 1.65 + (falling ? 1.2 : 0.15);
    const pivot = new THREE.Vector3(target.p[0], target.p[1] + up, target.p[2]);
    const cp = Math.cos(this.camPitch); const sp = Math.sin(this.camPitch);
    const back = new THREE.Vector3(Math.sin(this.camYaw) * cp, -sp, Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const shoulder = pivot.clone().addScaledVector(right, side);
    const dir = back.clone();
    const hit = this.island.ray(shoulder.toArray(), dir.toArray(), dist + 0.4);
    const d = hit ? Math.max(0.6, hit.t - 0.4) : dist;
    this.camDist = this.camDist === undefined ? d : (d < this.camDist ? d : damp(this.camDist, d, 6, dt));
    const pos = shoulder.clone().addScaledVector(dir, this.camDist);
    const ground = this.island.height(pos.x, pos.z) + 0.4;
    if (pos.y < ground) pos.y = ground;
    this.shakeAmt = Math.max(0, (this.shakeAmt || 0) - dt * 1.5);
    if (m.tumble > 0) this.shakeAmt = Math.max(this.shakeAmt, 0.15);
    if (this.clash) this.shakeAmt = Math.max(this.shakeAmt, 0.25);
    if (this.shakeAmt > 0) pos.add(new THREE.Vector3((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt));
    cam.position.copy(pos);
    cam.rotation.set(this.camPitch, this.camYaw, 0);
    const fov = this.S.fov - this.aiming * 14 + (m.mode === 'fall' ? 8 : 0) + (m.force ? 6 : 0) + (m.boosting ? 6 + clamp((m.boostT - 0.7) / 0.6, 0, 1) * 8 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 8, dt); cam.updateProjectionMatrix(); }
    this.moveSun(pivot);
  }
  moveSun(p) {
    if (this.grass) this.grass.update(p.x, p.z);
    const d = this.view.sunDir;
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.position.set(p.x + d.x * 300, p.y + d.y * 300, p.z + d.z * 300);
  }

  // ── HUD ──
  updateHud(dt) {
    const m = this.me;
    const st = this.storm;
    let stormText = '–'; let stormLabel = 'STORM';
    if (this.phase === 'ship') { stormLabel = 'DROP'; stormText = 'NOW'; } else if (st.waitEnd) {
      if (this.time < st.waitEnd) { stormLabel = 'STORM IN'; stormText = fmt(st.waitEnd - this.time); } else if (this.time < st.shrinkEnd) { stormLabel = 'CLOSING'; stormText = fmt(st.shrinkEnd - this.time); } else stormText = '…';
    }
    let zoneName = 'The Wilds';
    for (const p of POIS) if (Math.hypot(m.p[0] - p.x, m.p[2] - p.z) < p.r * 1.3) zoneName = p.name;
    let prompt = null;
    const K = (a, b) => `<kbd>${this.isTouch ? b : a}</kbd>`;
    if (m.mode === 'ship' && m.alive) prompt = `${K('SPACE', 'JUMP')}Leave the ship`;
    else if (this.nearMate && m.alive) {
      const f = this.channel ? this.channel.t / 4 : 0;
      prompt = `${K('F', 'F')}Hold to revive <b style="color:#5effa8">${esc((this.roster.get(this.nearMate.id) || {}).name || '')}</b><div class="pb"><i style="width:${(f * 100).toFixed(0)}%"></i></div>`;
    } else if (this.nearCrate && m.alive) {
      const C = CRATES[this.nearCrate.tier];
      const f = this.channel ? this.channel.t / C.open : 0;
      prompt = `${K('F', 'F')}Hold to open <b style="color:${C.color}">${C.name}</b><div class="pb"><i style="width:${(f * 100).toFixed(0)}%"></i></div>`;
    } else if ((m.mode === 'fall' || m.mode === 'glide') && m.alive) prompt = `${K('W', '▲')}Dive · ${K('SPACE ×2', 'FLY')}Fly`;
    else if (m.alive && !m.downed && m.formMeter >= 100 && m.form < 2) prompt = `${K('G', 'ASC')}<b style="color:#ffd84a">ASCEND</b> — your form meter is full`;
    else if (m.alive && !m.downed && m.ki < 15 && !m.charging) prompt = `${K('C', 'CHG')}Hold to charge ki`;
    const using = this.usingT ? { label: `Using ${ITEMS[this.usingT.item].name}…`, f: 1 - this.usingT.t / this.usingT.tot } : null;
    // squad
    let team = null;
    if (this.matchMode !== 'solo') {
      team = [...this.avatars.values()].filter((a) => a.mate).map((a) => ({ name: (this.roster.get(a.id) || {}).name || '?', hp: a.hp, alive: a.alive, downed: !!(a.flags & 128), bleed: a.bleed || 0 }));
    }
    // lock-on target
    let lock = null;
    const lk = this.lockId && this.avatars.get(this.lockId);
    if (lk && lk.alive) {
      const v = this.v3.set(lk.p[0], lk.p[1] + 1.0, lk.p[2]).project(this.camera);
      lock = { x: v.x, y: v.y, on: v.z < 1, name: (this.roster.get(lk.id) || {}).name || '?', hp: lk.hp, sh: lk.shield || 0, pl: powerLevel({ hp: lk.hp, shield: lk.shield, ki: lk.ki, powers: { a: lk.pw || 0 }, form: lk.flags & 2 ? (lk.flags & 8192 ? 2 : 1) : 0 }), dist: Math.round(Math.hypot(lk.p[0] - m.p[0], lk.p[1] - m.p[1], lk.p[2] - m.p[2])) };
    }
    // compass, markers, distance to safety, bombardment
    const bear = (x, z) => ((-Math.atan2(-(x - m.p[0]), -(z - m.p[2])) * 180 / Math.PI) % 360 + 360) % 360;
    const compass = []; const marks = [];
    const safe = st.next || st;
    let zoneDist = 0;
    if (this.phase !== 'ship') {
      zoneDist = Math.max(0, Math.hypot(m.p[0] - safe.c[0], m.p[2] - safe.c[1]) - safe.r);
      if (zoneDist > 0) compass.push({ bearing: bear(safe.c[0], safe.c[1]), color: '#ffffff', shape: 'circle' });
    }
    for (const mk of this.marks ? this.marks.values() : []) {
      const dist = Math.hypot(mk.p[0] - m.p[0], mk.p[2] - m.p[2]);
      compass.push({ bearing: bear(mk.p[0], mk.p[2]), color: mk.color, shape: mk.kind === 'enemy' ? 'circle' : 'diamond' });
      marks.push({ p: mk.p, color: mk.color, kind: mk.kind, label: mk.label, dist });
    }
    for (const d of this.drops || []) {
      const q = d.obj ? [d.obj.position.x, d.obj.position.y, d.obj.position.z] : d.p;
      compass.push({ bearing: bear(q[0], q[2]), color: '#ff4a4a', shape: 'diamond' });
      marks.push({ p: q, color: '#ff4a4a', kind: 'drop', label: 'SKY CACHE', dist: Math.hypot(q[0] - m.p[0], q[2] - m.p[2]) });
    }
    for (const a of this.avatars.values()) if (a.mate && a.alive) compass.push({ bearing: bear(a.p[0], a.p[2]), color: ['#5ef2ff', '#ff7ae5', '#7dff8a'][((this.mateIdx && this.mateIdx.get(a.id)) || 1) - 1 % 3], shape: 'circle' });
    const inRed = !!(this.red && this.time > this.red.warnEnd - 7 && Math.hypot(m.p[0] - this.red.c[0], m.p[2] - this.red.c[1]) < this.red.r);
    const phaseLen = st.shrinkEnd && st.start !== undefined ? st.shrinkEnd - st.start : 0;
    const zoneProg = phaseLen > 0 ? clamp((this.time - st.start) / phaseLen, 0, 1) : 0;
    const H = HERO[this.S.hero] || HEROES[0];
    const specA = this.spectating && this.killer && this.avatars.get(this.killer);
    this.hud.update(dt, {
      yaw: this.camYaw, compass, marks, zoneDist, zoneProg, meProg: zoneDist > 0 ? clamp(1 - zoneDist / 400, 0, 0.95) : 1, inRed,
      heroColor: H.suit, heroColor2: H.sash || H.suit2, spectating: specA ? (this.roster.get(specA.id) || {}).name : null, dead: !m.alive,
      alive: this.alive, teams: this.teamsLeft, mode: this.matchMode, kills: this.stats.kills, stormText, stormLabel, zoneName, name: playerName(), heroName: (HERO[this.S.hero] || HEROES[0]).name,
      hp: m.hp, shield: m.shield, absorb: m.absorb || 0, hurt: this.hurt + (m.hp < 30 && m.alive ? 0.25 : 0), inStorm: this.inStorm,
      items: this.inv.items, slots: this.inv.slots, ult: this.inv.ult, levels: this.inv.powers, cd: this.cd, cdMax: this.cdMax, ultCharge: m.ultCharge,
      ki: m.ki, kiMax: KI.max, charging: m.charging, form: m.form, formMeter: m.formMeter, pl: powerLevel({ hp: m.hp, shield: m.shield, ki: m.ki, powers: this.inv.powers, form: m.form }),
      downed: m.downed && m.alive, bleed: m.bleed, blind: this.blindT, team, lock, combo: this.hits.t > 0 && this.hits.n > 1 ? this.hits.n : 0,
      clash: this.clash ? { f: this.clash.mineA ? this.clash.f : 1 - this.clash.f, pulse: (this.clash.pulse = Math.max(0, (this.clash.pulse || 0) - dt)) } : null,
      heavy: this.mouse.l ? clamp(this.mouse.lT / COMBAT.heavy.charge, 0, 1) : 0,
      prompt, using, tod: this.tod,
    });
    // speed lines while dashing at supersonic speed, rushing or getting launched, and after big impacts
    const sp = Math.max(m.boostT > 1.3 ? 0.55 : m.boosting ? 0.2 : 0, m.tumble > 0 ? 0.5 : 0, m.force ? 0.5 : 0, (this.linesT || 0) * 2.2, this.clash ? 0.35 : 0);
    this.hud.speedLines(Math.min(1, sp), this.impactT > 0);
    this.mmT = (this.mmT || 0) - dt;
    if (this.mmT <= 0) {
      this.mmT = 0.1;
      this.hud.drawMap(this.hud.mmCtx, 300, { cx: m.p[0], cz: m.p[2], span: m.mode === 'ship' || m.mode === 'fall' ? 900 : 320 });
      if (this.mapOpen) { const c = this.hud.screen.querySelector('.bigmap canvas'); if (c) this.hud.drawMap(c.getContext('2d'), 900, { cx: 0, cz: 0, span: 1400, names: true }); }
    }
    this.root.querySelector('.xh').style.display = m.alive && m.mode !== 'ship' && !this.invOpen && !lock ? '' : 'none';
  }

  draw() {
    // impact frames flip the picture to stark inverted black-and-white for a few frames
    const cv = this.renderer.domElement;
    const inv = (this.impactT || 0) > 0;
    if (inv !== this.invOn) { cv.style.filter = inv ? 'invert(1) grayscale(1) contrast(2.6)' : ''; this.invOn = inv; }
    // snowfields are far brighter than anything else: ease the bloom off up there so they don't glare
    if (this.bloom) {
      const cp = this.camera.position;
      const hh = this.island.height(cp.x, cp.z);
      const snow = Math.min(1, Math.max(0, (hh - 78) / 22));
      this.bloom.strength = 0.45 * (1 - snow * 0.8);
    }
    if (this.grade) {
      const u = this.grade.uniforms;
      if (u.saturation) u.saturation.value = this.inStorm ? 0.75 : 1.08;
    }
    this.composer.render();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.unlock();
    if (this.net) this.net.leave();
    this.sound.close();
    this.clearMatch();
    this.renderer.dispose();
    this.root.remove();
    if (window.__asc === this) window.__asc = null;
  }
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
void dirOf; void EMOTE_IDS;
export { level };
