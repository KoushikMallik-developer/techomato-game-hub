// Sky Hopper: a side-scrolling 3D platformer. Run, jump, stomp jellies, grab fire flowers, beat bosses, reach the flag.
// Physics is 2D (x, y); three.js only draws. Level data comes from levels.js, sound from audio.js, particles from fx.js.
import * as THREE from 'three';
import { bake } from '../hordesurge/assets.js';
import { H, GROUND, BRICK, QUESTION, USED, makeLevel, solidAt } from './levels.js';
import { Sound } from './audio.js';
import { Particles } from './fx.js';
import { normalizeSave, totalStars, starsFor } from './save.js';

export const THEMES = [
  { sky: '#7ec8ff', fog: '#d4efff', grass: '#4cc55a', dirt: '#8a5a34', deco: ['CommonTree_1', 'CommonTree_2', 'Bush_1', 'Flowers'] },
  { sky: '#ffa65e', fog: '#ffd9a8', grass: '#d2b84e', dirt: '#8a4e2a', deco: ['Cactus_1', 'Cactus_3', 'Cactus_4', 'Rock_Moss_1'] },
  { sky: '#1b2656', fog: '#3a4a8c', grass: '#3a9f78', dirt: '#3b3050', deco: ['PineTree_Snow_1', 'PineTree_Snow_3', 'Rock_Snow_2'] },
  { sky: '#c9e6ff', fog: '#f2faff', grass: '#eef7ff', dirt: '#7c8aa6', deco: ['PineTree_Snow_1', 'CommonTree_Snow_4', 'Bush_Snow_1'] },
];
export const PRELOAD = ['Coin', ...new Set(THEMES.flatMap((t) => t.deco))];
// Pip's colours, unlocked by total stars
export const SKINS = [
  { id: 'pip', name: 'Pip', c: '#2fb7e6', need: 0 }, { id: 'ember', name: 'Ember', c: '#ff7a45', need: 6 }, { id: 'leaf', name: 'Leaf', c: '#46c95c', need: 15 },
  { id: 'royal', name: 'Royal', c: '#9a6bff', need: 30 }, { id: 'gold', name: 'Gilded', c: '#ffcf3a', need: 50 },
];
const PAD_SCALE = [0.85, 1, 1.3];
const PAD_NAME = ['Small', 'Medium', 'Large'];

const SAVE_KEY = 'sky-hopper-save';
const loadSave = () => { try { return normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { return normalizeSave(null); } };
const put = (el, v) => { if (el.dataset.v !== String(v)) { el.dataset.v = String(v); el.textContent = v; } }; // skip identical writes
const worldName = (n) => `${Math.ceil(n / 4)}-${((n - 1) % 4) + 1}`;
const starText = (k) => '★'.repeat(k) + '☆'.repeat(3 - k);

const CSS = `
.sh-root{--ps:1;position:absolute;inset:0;overflow:hidden;font-family:"Lilita One","Arial Black",system-ui,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none}
.sh-root canvas{display:block;width:100%;height:100%}
.sh-hud{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:.5em;padding:.5em .7em;font-size:clamp(12px,2.5vmin,22px);text-shadow:0 2px 0 rgba(0,0,0,.45);pointer-events:none;background:linear-gradient(rgba(0,0,0,.28),transparent)}
.sh-hud .g{display:flex;gap:.4em;align-items:center}
.sh-hud .pill{display:flex;gap:.35em;align-items:baseline;padding:.15em .6em;border-radius:2em;background:rgba(0,0,0,.28);line-height:1.2}
.sh-hud small{font-size:.6em;opacity:.85;letter-spacing:.1em}
.sh-hud .mid{text-align:center;line-height:1.1}
.sh-bossbar{display:none;width:clamp(120px,30vmin,260px);height:.7em;margin:.3em auto 0;border-radius:1em;background:rgba(0,0,0,.45);overflow:hidden;border:2px solid #fff}
.sh-bossbar i{display:block;height:100%;width:100%;background:linear-gradient(#ff7a7a,#d22);transition:width .25s}
.sh-hud .ib{pointer-events:auto;font:inherit;width:2.2em;height:2.2em;border-radius:50%;border:2px solid rgba(255,255,255,.7);background:rgba(0,0,0,.35);color:#fff;cursor:pointer}
.sh-panel{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:.7em;background:rgba(10,20,50,.6);text-align:center;padding:1em;overflow:auto}
.sh-panel h2{margin:0;font-size:clamp(28px,7vmin,64px);letter-spacing:.04em;text-shadow:0 4px 0 rgba(0,0,0,.35);color:#ffe45e}
.sh-panel p{margin:0;font-size:clamp(13px,2.6vmin,22px);opacity:.95}
.sh-panel .stars{font-size:clamp(30px,8vmin,64px);color:#ffd23a;text-shadow:0 3px 0 rgba(0,0,0,.4);letter-spacing:.1em}
.sh-btns{display:flex;gap:.6em;flex-wrap:wrap;justify-content:center}
.sh-panel button{font:inherit;font-size:clamp(15px,3.2vmin,26px);padding:.45em 1.4em;border:0;border-radius:2em;background:linear-gradient(#ffe45e,#ffb020);color:#4a2a00;box-shadow:0 5px 0 #b86a00;cursor:pointer}
.sh-panel button.alt{background:linear-gradient(#e8f1ff,#b8cdf0);box-shadow:0 5px 0 #6f86b0;color:#1d2f55}
.sh-panel button:active{transform:translateY(3px);box-shadow:0 2px 0 #b86a00}
.sh-panel button:disabled{opacity:.45;filter:grayscale(.6);cursor:default}
.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:.5em;width:min(92vw,640px);max-height:52vh;overflow:auto;padding:.3em}
.sh-grid button{padding:.35em .2em;font-size:clamp(13px,2.6vmin,20px);line-height:1.15;border-radius:.8em}
.sh-grid button small{display:block;font-size:.7em;color:#c46a00}
.sh-rows{display:grid;gap:.45em;width:min(92vw,420px)}
.sh-rows div{display:flex;justify-content:space-between;align-items:center;gap:1em;font-size:clamp(14px,2.8vmin,22px)}
.sh-rows button{padding:.25em 1em;font-size:inherit;min-width:5.5em}
.sh-chips{display:flex;gap:.5em;flex-wrap:wrap;justify-content:center}
.sh-panel .sh-chips button{width:3em;height:3em;padding:0;border-radius:50%;border:3px solid #fff;box-shadow:none;font-size:.8em}
.sh-chips button.on{outline:4px solid #ffe45e}
.sh-pad{position:absolute;left:0;right:0;bottom:0;display:none;justify-content:space-between;align-items:flex-end;padding:1em 1.2em calc(1em + env(safe-area-inset-bottom));pointer-events:none}
.sh-touch .sh-pad{display:flex}
.sh-pad .g{display:flex;gap:calc(.8em*var(--ps));align-items:flex-end;pointer-events:auto}
.sh-pad b{display:grid;place-content:center;width:calc(clamp(56px,16vmin,92px)*var(--ps));height:calc(clamp(56px,16vmin,92px)*var(--ps));border-radius:50%;background:rgba(255,255,255,.22);border:3px solid rgba(255,255,255,.55);font-size:clamp(14px,4vmin,26px);backdrop-filter:blur(2px);touch-action:none}
.sh-pad b.on{background:rgba(255,228,94,.6)}.sh-pad b.big{width:calc(clamp(70px,20vmin,112px)*var(--ps));height:calc(clamp(70px,20vmin,112px)*var(--ps))}
.sh-pad b[data-k="f"]{display:none;background:rgba(255,120,40,.4)}.sh-pad.fire b[data-k="f"]{display:grid}
.sh-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:clamp(18px,4vmin,34px);text-shadow:0 3px 0 rgba(0,0,0,.4);pointer-events:none;transition:opacity .4s;white-space:nowrap}`;

function tex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const brickTex = () => tex((g, s) => { g.fillStyle = '#c8602a'; g.fillRect(0, 0, s, s); g.fillStyle = '#7a3412'; for (let y = 0; y < s; y += 16) { g.fillRect(0, y, s, 2); for (let x = (y / 16) % 2 ? 0 : 16; x < s; x += 32) g.fillRect(x, y, 2, 16); } });
const questionTex = () => tex((g, s) => { g.fillStyle = '#ffc21a'; g.fillRect(0, 0, s, s); g.strokeStyle = '#a86400'; g.lineWidth = 5; g.strokeRect(2, 2, s - 4, s - 4); g.fillStyle = '#8a4e00'; g.font = `bold ${s * 0.7}px Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', s / 2, s / 2 + 3); });
const solidTex = (a, b) => tex((g, s) => { g.fillStyle = a; g.fillRect(0, 0, s, s); g.strokeStyle = b; g.lineWidth = 5; g.strokeRect(2, 2, s - 4, s - 4); });

// geometry is cached by shape: enemies, shots and items come and go all the time, and a fresh geometry each time leaks GPU memory
const geos = new Map();
const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const sph = (r, c, w = 16, h = 12) => new THREE.Mesh(geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h)), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
const box = (x, y, z, c) => new THREE.Mesh(geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z)), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

// the hero (Pip): a round critter with an orange beak, little wings and a tuft. Stands on y = 0, about 0.9 tall.
function buildHero() {
  const g = new THREE.Group();
  const body = sph(0.42, '#2fb7e6'); body.scale.set(1, 1.1, 1); body.position.y = 0.48; g.add(body);
  const belly = sph(0.3, '#eafaff'); belly.position.set(0, 0.4, 0.2); belly.scale.z = 0.7; g.add(belly);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.16, 0.66, 0.34);
    e.add(sph(0.13, '#ffffff', 12, 8));
    const p = sph(0.065, '#111111', 8, 6); p.position.set(0, 0, 0.11); e.add(p);
    g.add(e); eyes.push(e);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#ff9a1f' })); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.52, 0.5); g.add(beak);
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), new THREE.MeshStandardMaterial({ color: '#ffe45e' })); tuft.position.set(0, 1.0, 0); g.add(tuft);
  const wings = [-1, 1].map((s) => { const w = sph(0.2, '#2fb7e6', 10, 8); w.scale.set(0.35, 0.8, 0.6); w.position.set(s * 0.44, 0.5, -0.02); g.add(w); w.userData.side = s; return w; });
  g.userData = { body, belly, eyes, tuft, wings, feet: [-1, 1].map((s) => { const f = box(0.2, 0.1, 0.3, '#ff9a1f'); f.position.set(s * 0.16, 0.05, 0.06); g.add(f); return f; }) };
  return g;
}

function buildFoe(kind) {
  const g = new THREE.Group();
  if (kind === 1) { // spiked ball: never stomp it
    const b = sph(0.34, '#3a2a4a'); b.position.y = 0.4; g.add(b);
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(geo('spike', () => new THREE.ConeGeometry(0.09, 0.26, 6)), new THREE.MeshStandardMaterial({ color: '#ff5a5a' }));
      const a = (i / 10) * Math.PI * 2; c.position.set(Math.cos(a) * 0.36, 0.4 + Math.sin(a) * 0.36, 0); c.rotation.z = a - Math.PI / 2; g.add(c);
    }
  } else { // jelly (kind 0) and the green spitter (kind 2): both can be stomped
    const d = new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.MeshStandardMaterial({ color: kind ? '#2f9f7f' : '#a24de8', roughness: 0.35 }));
    d.position.y = 0.12; d.scale.y = 1.25; g.add(d);
    const base = new THREE.Mesh(geo('fbase', () => new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16)), new THREE.MeshStandardMaterial({ color: kind ? '#1f6f58' : '#7a2fb8' })); base.position.y = 0.06; g.add(base);
    if (kind) { const t = new THREE.Mesh(geo('tube', () => new THREE.CylinderGeometry(0.1, 0.13, 0.34, 10)), new THREE.MeshStandardMaterial({ color: '#2a3a44' })); t.rotation.z = Math.PI / 2; t.position.set(-0.42, 0.42, 0); g.add(t); }
  }
  const ey = kind === 1 ? 0.45 : 0.38;
  for (const s of [-1, 1]) {
    const e = sph(0.1, '#ffffff', 10, 8); e.position.set(s * 0.15, ey, 0.28); g.add(e);
    const p = sph(0.05, '#111111', 8, 6); p.position.set(s * 0.15, ey, 0.37); g.add(p);
  }
  return g;
}

function buildBoss() { // the Jelly King: a huge jelly with a crown
  const g = new THREE.Group(); const j = buildFoe(0); j.scale.setScalar(2.1); g.add(j);
  const crown = new THREE.Group();
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(geo('crown', () => new THREE.ConeGeometry(0.14, 0.4, 6)), new THREE.MeshStandardMaterial({ color: '#ffd23a', metalness: 0.5, roughness: 0.3, emissive: '#7a5200' })); const a = (i / 5) * Math.PI * 2; c.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.3); crown.add(c); }
  crown.position.y = 1.5; g.add(crown);
  return g;
}

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.save = loadSave();
    this.sound = new Sound(this.save);
    this.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    this.keys = { l: 0, r: 0, j: 0, run: 0, f: 0 };
    this.score = 0; this.coinsN = 0; this.lives = 3; this.shake = 0; this.simT = 0;
    this.state = 'title';
    this.root = document.createElement('div');
    this.root.className = `sh-root${this.isTouch ? ' sh-touch' : ''}`;
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="sh-hud"><div class="g"><span class="pill">❤ <b class="l">3</b></span><span class="pill">🪙 <b class="c">0</b></span><span class="pill">⭐ <b class="st">0</b></span></div>
        <div class="mid"><small>WORLD</small> <b class="w">1-1</b><div class="sh-bossbar"><i></i></div></div>
        <div class="g"><span class="pill"><small>SCORE</small><b class="s">000000</b></span><span class="pill">⏱ <b class="t">300</b></span><button class="ib" data-a="pause" aria-label="Pause">❚❚</button></div></div>
      <div class="sh-pad"><div class="g"><b data-k="l">◀</b><b data-k="r">▶</b></div><div class="g"><b data-k="f">FIRE</b><b data-k="run">RUN</b><b data-k="j" class="big">JUMP</b></div></div>
      <div class="sh-toast" style="opacity:0"></div><div class="sh-panel"></div>`;
    container.appendChild(this.root);
    this.panelEl = this.root.querySelector('.sh-panel');
    this.padEl = this.root.querySelector('.sh-pad');
    this.bossBar = this.root.querySelector('.sh-bossbar');
    this.hudEl = {}; for (const c of ['s', 'c', 'w', 't', 'l', 'st']) this.hudEl[c] = this.root.querySelector(`.sh-hud .${c}`);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.root.insertBefore(this.renderer.domElement, this.root.firstChild);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 200);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7a8a6a', 1.5));
    const sun = new THREE.DirectionalLight('#fff4d6', 2.2); sun.position.set(-8, 20, 14); this.scene.add(sun);
    this.hero = buildHero(); this.scene.add(this.hero);
    this.fx = new Particles(this.scene);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.mats = { brick: new THREE.MeshStandardMaterial({ map: brickTex() }), q: new THREE.MeshStandardMaterial({ map: questionTex(), emissive: '#553300', emissiveIntensity: 0.4 }), used: new THREE.MeshStandardMaterial({ map: solidTex('#7a5a3a', '#4a3320') }), stone: new THREE.MeshStandardMaterial({ map: solidTex('#a8afb8', '#6a717c') }) };
    this.blockGeo = new THREE.BoxGeometry(1, 1, 1.6);
    this.p = { buf: 0 };
    this.applySettings();
    this.bindInput();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
    if (this.ro) this.ro.observe(container);
    this.resize();
    this.build(this.save.level);
    this.showTitle();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode */ } }

  applySettings() {
    this.root.style.setProperty('--ps', PAD_SCALE[this.save.touch] ?? 1);
    const sk = SKINS.find((k) => k.id === this.save.skin && totalStars(this.save) >= k.need) || SKINS[0];
    const u = this.hero.userData;
    u.body.material.color.set(sk.c); u.wings.forEach((w) => w.material.color.set(sk.c));
    this.sound.syncMusic();
  }

  // ───────────── level ─────────────
  build(n) {
    const retry = this.state === 'dying'; // a respawn keeps the 'no hits' star lost
    this.n = n;
    if (this.coinGeo) this.coinGeo.dispose();
    this.lv = makeLevel(n);
    this.theme = THEMES[(n - 1) % THEMES.length];
    const th = this.theme; const lv = this.lv;
    this.sound.setWorld(n);
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, 30, 90);
    this.world.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    this.world.clear();
    // ground as two instanced meshes (dirt blocks + grass caps); bricks and ? blocks are single meshes so they can bump
    const ground = []; const caps = [];
    this.blocks = new Map();
    for (let x = 0; x < lv.W; x++) for (let y = 0; y < H; y++) {
      const v = lv.T[x * H + y];
      if (!v) continue;
      if (v === GROUND) { ground.push([x, y]); if (!lv.T[x * H + y + 1]) caps.push([x, y]); continue; }
      const m = new THREE.Mesh(this.blockGeo, v === BRICK ? this.mats.brick : v === QUESTION ? this.mats.q : this.mats.stone);
      m.userData.shared = true;
      m.position.set(x + 0.5, y + 0.5, 0); this.world.add(m); this.blocks.set(x * H + y, m);
    }
    const dirt = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1.6), new THREE.MeshStandardMaterial({ color: th.dirt, roughness: 0.9 }), ground.length);
    const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.26, 1.66), new THREE.MeshStandardMaterial({ color: th.grass, roughness: 0.8 }), Math.max(1, caps.length));
    const mt = new THREE.Matrix4();
    ground.forEach(([x, y], i) => dirt.setMatrixAt(i, mt.setPosition(x + 0.5, y + 0.5, 0)));
    caps.forEach(([x, y], i) => cap.setMatrixAt(i, mt.setPosition(x + 0.5, y + 0.93, 0)));
    this.world.add(dirt, cap);
    // coins (the shared Coin model when it loaded, a gold disc otherwise)
    const cg = (bake('Coin', 0.7, true) || new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18).rotateX(Math.PI / 2)).clone();
    this.coinGeo = cg;
    this.coinMat = new THREE.MeshStandardMaterial({ color: '#ffd23a', metalness: 0.4, roughness: 0.35, emissive: '#c88a00', emissiveIntensity: 0.6 });
    this.coins = lv.coins.map((c) => { const m = new THREE.Mesh(cg, this.coinMat); m.userData.shared = true; m.position.set(c.x, c.y, 0); this.world.add(m); return { ...c, m, got: false }; });
    // scenery behind the track
    const rnd = (a) => ((a * 9301 + 49297) % 233280) / 233280;
    for (let x = 4, k = 0; x < lv.W; x += 3 + Math.floor(rnd(x + n) * 5), k++) {
      if (!lv.T[x * H]) continue;
      const name = th.deco[k % th.deco.length];
      const small = /^(Rock|Bush|Flowers)/.test(name);
      const geo = bake(name, small ? 1.1 : 3 + rnd(x) * 2.5);
      const m = geo ? new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })) : new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 7), new THREE.MeshStandardMaterial({ color: '#2f8f3f' }));
      m.userData.shared = !!geo;
      m.position.set(x, geo ? 2 : 3.5, -2.2 - rnd(x * 3) * 5); this.world.add(m);
    }
    const night = (n - 1) % 4 === 2;
    for (let i = 0; i < Math.ceil(lv.W / 14); i++) { // clouds and far hills
      const c = new THREE.Group();
      for (let j = 0; j < 3; j++) { const s = sph(1.2 + j * 0.2, '#ffffff'); s.material.transparent = true; s.material.opacity = night ? 0.25 : 0.9; s.position.set(j * 1.4, (j % 2) * 0.4, 0); c.add(s); }
      c.position.set(i * 14 + rnd(i) * 8, 9 + rnd(i + 5) * 5, -16 - rnd(i + 9) * 6); this.world.add(c);
      const hill = sph(7 + rnd(i) * 4, th.grass, 18, 10); hill.scale.y = 0.8; hill.position.set(i * 14 + 5, -3, -34); this.world.add(hill);
    }
    // goal: flagpole and a little hut
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 8, 8), new THREE.MeshStandardMaterial({ color: '#f4f4f4', metalness: 0.5, roughness: 0.3 }));
    pole.position.set(lv.flagX, 6, 0); this.world.add(pole);
    const ball = sph(0.2, '#ffd34a'); ball.position.set(lv.flagX, 10.1, 0); this.world.add(ball);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: '#ff4d6d', side: THREE.DoubleSide }));
    this.flag.position.set(lv.flagX + 0.75, 9.4, 0); this.world.add(this.flag);
    const hut = box(5, 4, 3, '#caa27a'); hut.position.set(lv.flagX + 6, 4, -1.5); this.world.add(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#d4433a' })); roof.position.set(lv.flagX + 6, 7.1, -1.5); roof.rotation.y = Math.PI / 4; this.world.add(roof);
    // enemies, springs, moving platforms, boss
    this.foes = lv.foes.map((f) => { const m = buildFoe(f.kind); m.position.set(f.x, lv.start, 0); this.world.add(m); return { x: f.x, y: lv.start, vx: 0, vy: 0, w: 0.7, h: 0.8, kind: f.kind, dir: -1, dead: 0, active: false, cool: 1.2, m }; });
    this.springs = lv.springs.map((s) => {
      const m = new THREE.Group();
      const b = box(0.8, 0.16, 0.8, '#444a55'); b.position.y = 0.08; m.add(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.34, 12), new THREE.MeshStandardMaterial({ color: '#ff4d4d' })); c.position.y = 0.33; m.add(c);
      const t = box(0.8, 0.1, 0.8, '#ffd23a'); t.position.y = 0.55; m.add(t);
      m.position.set(s.x, lv.start, 0); this.world.add(m); return { x: s.x, y: lv.start, sq: 0, m };
    });
    this.movers = lv.movers.map((o) => {
      const m = box(o.w, 0.4, 1.6, '#6a7fa8'); const stripe = box(o.w * 0.9, 0.06, 1.62, '#ffd23a'); stripe.position.y = 0.14; m.add(stripe);
      m.position.set(o.x0, o.y - 0.2, 0); this.world.add(m); return { ...o, x: o.x0, dx: 0, m };
    });
    this.boss = null; this.bossDead = false;
    if (lv.boss) { const m = buildBoss(); this.world.add(m); this.boss = { x: lv.boss.x, y: lv.start, vx: 0, vy: 0, w: 1.8, h: 1.5, hp: 6, dir: -1, inv: 0, t: 1.2, hops: 0, on: true, m }; }
    this.bossBar.style.display = 'none'; this.bossBar.firstChild.style.width = '100%';
    this.items = []; this.pops = []; this.fireballs = []; this.bullets = [];
    this.p = { x: 2, y: lv.start, vx: 0, vy: 0, w: 0.7, h: 0.9, big: false, fire: false, on: false, dir: 1, inv: 0, coy: 0, buf: 0, anim: 0, cut: false, dead: 0, sq: 0, wasOn: true, lastVy: 0, dust: 0, stand: null };
    this.hero.userData.tuft.material.color.set('#ffe45e');
    this.hero.scale.setScalar(1); this.hero.visible = true;
    this.padEl.classList.remove('fire');
    this.cx = 9; this.cy = undefined; this.time = 300; this.flagY = 9.4; this.clearShown = false;
    this.lvCoins = 0; this.hitTaken = retry && this.hitTaken; this.gateT = -9; this.blink = 2;
  }

  startRun(n) {
    this.score = 0; this.lives = 3; this.coinsN = 0;
    this.build(n); this.hidePanel(); this.state = 'play'; this.toast(`World ${worldName(n)}${this.lv.boss ? ' · BOSS' : ''}`);
  }

  // ───────────── screens ─────────────
  panel(html, buttons = []) {
    this.panelEl.style.display = 'grid';
    this.panelEl.innerHTML = `${html}<div class="sh-btns">${buttons.map(([label, a, v, alt]) => `<button data-a="${a}"${v !== undefined ? ` data-v="${v}"` : ''}${alt ? ' class="alt"' : ''}>${label}</button>`).join('')}</div>`;
  }
  hidePanel() { this.panelEl.style.display = 'none'; }

  showTitle() {
    this.state = 'title'; this.backTo = 'title';
    const stars = totalStars(this.save);
    this.panel(`<h2>SKY HOPPER</h2><p>Run, jump, stomp jellies, grab fire flowers and beat the Jelly King.</p><p>${this.isTouch ? 'Use the on-screen buttons' : 'Arrows / A D move · Space jump · Shift run · F fire · P pause'}</p><p>⭐ ${stars} stars${this.save.hi ? ` · Best score ${this.save.hi}` : ''}</p>`,
      [[this.save.level > 1 ? `CONTINUE (${worldName(this.save.level)})` : 'PLAY', 'play'], ['LEVELS', 'levels', undefined, 1], ['PIP & SETTINGS', 'settings', undefined, 1]]);
  }
  showLevels() {
    const cells = [];
    for (let n = 1; n <= Math.max(1, this.save.level); n++) cells.push(`<button data-a="pick" data-v="${n}">${n % 4 === 0 ? '👑 ' : ''}${worldName(n)}<small>${starText(this.save.stars[n] || 0)}</small></button>`);
    this.panelEl.style.display = 'grid';
    this.panelEl.innerHTML = `<h2>LEVELS</h2><div class="sh-grid">${cells.join('')}</div><div class="sh-btns"><button data-a="back" class="alt">BACK</button></div>`;
    const last = this.panelEl.querySelector('.sh-grid button:last-child'); if (last) last.scrollIntoView({ block: 'nearest' });
  }
  showSettings() {
    const stars = totalStars(this.save); const s = this.save;
    const chips = SKINS.map((k) => { const open = stars >= k.need; return `<button data-a="skin" data-v="${k.id}" style="background:${k.c}"${open ? '' : ' disabled'} class="${s.skin === k.id ? 'on' : ''}" title="${open ? k.name : `${k.name}: ${k.need} stars`}">${open ? '' : '🔒'}</button>`; }).join('');
    const next = SKINS.find((k) => k.need > stars);
    this.panelEl.style.display = 'grid';
    this.panelEl.innerHTML = `<h2>SETTINGS</h2>
      <div class="sh-chips">${chips}</div><p>${next ? `Next colour at ⭐ ${next.need} (you have ${stars})` : 'All colours unlocked!'}</p>
      <div class="sh-rows"><div>Sound effects<button data-a="sfx" class="alt">${s.sfx ? 'ON' : 'OFF'}</button></div><div>Music<button data-a="music" class="alt">${s.music ? 'ON' : 'OFF'}</button></div>
      <div>Touch buttons<button data-a="touch" class="alt">${PAD_NAME[s.touch]}</button></div>${document.fullscreenEnabled ? `<div>Fullscreen<button data-a="fs" class="alt">${document.fullscreenElement ? 'EXIT' : 'GO'}</button></div>` : ''}</div>
      <div class="sh-btns"><button data-a="back">BACK</button></div>`;
  }
  toast(t, ms = 1400) {
    const e = this.root.querySelector('.sh-toast'); e.textContent = t; e.style.opacity = 1;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { e.style.opacity = 0; }, ms);
  }

  act(a, v) {
    this.sound.resume();
    const save = () => { this.persist(); this.applySettings(); this.showSettings(); };
    switch (a) {
      case 'play': this.startRun(this.save.level); break;
      case 'levels': this.showLevels(); break;
      case 'pick': this.startRun(+v); break;
      case 'settings': this.showSettings(); break;
      case 'back': if (this.backTo === 'pause') this.showPause(); else this.showTitle(); break;
      case 'skin': this.save.skin = v; save(); break;
      case 'sfx': this.save.sfx = !this.save.sfx; save(); break;
      case 'music': this.save.music = !this.save.music; save(); break;
      case 'touch': this.save.touch = (this.save.touch + 1) % PAD_SCALE.length; save(); break;
      case 'fs': this.toggleFullscreen(); setTimeout(() => this.showSettings(), 250); break;
      case 'pause': case 'resume': if (this.state === 'play' || this.state === 'pause') this.togglePause(); break;
      case 'quit': this.sound.pause(false); this.build(this.save.level); this.showTitle(); break;
      case 'next': this.build(this.n + 1); this.hidePanel(); this.state = 'play'; this.toast(`World ${worldName(this.n)}${this.lv.boss ? ' · BOSS' : ''}`); break;
      case 'retry': this.startRun(this.n); break;
      default:
    }
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      const r = this.container.requestFullscreen && this.container.requestFullscreen({ navigationUI: 'hide' });
      if (r && r.then) r.then(() => { if (this.isTouch && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
    } catch { /* not supported */ }
  }

  showPause() {
    this.backTo = 'pause';
    this.panel('<h2>PAUSED</h2>', [['RESUME', 'resume'], ['SETTINGS', 'settings', undefined, 1], ['QUIT', 'quit', undefined, 1]]);
  }
  togglePause() {
    if (this.state === 'play') {
      this.state = 'pause'; this.keys = { l: 0, r: 0, j: 0, run: 0, f: 0 }; this.pads.clear(); this.padEl.querySelectorAll('b').forEach((b) => b.classList.remove('on'));
      this.sound.pause(true); this.showPause();
    } else if (this.state === 'pause') { this.hidePanel(); this.state = 'play'; this.sound.pause(false); }
  }

  // ───────────── input ─────────────
  press(k, down) {
    if (k === 'j' && down && !this.keys.j) this.p.buf = 0.12;
    if (k === 'f' && down && !this.keys.f && this.state === 'play') this.shoot();
    this.keys[k] = down ? 1 : 0;
  }
  bindInput() {
    const map = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'j', ArrowUp: 'j', KeyW: 'j', KeyZ: 'j', ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run', KeyF: 'f', KeyK: 'f' };
    this.onKey = (e) => {
      if ((e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) || e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
      const down = e.type === 'keydown';
      if (down) this.sound.resume();
      if (down && !e.repeat && (e.code === 'KeyP' || e.code === 'Escape')) { if (this.state === 'play' || this.state === 'pause') this.togglePause(); return; }
      if (down && !e.repeat && e.code === 'Enter' && this.panelEl.style.display !== 'none') { const b = this.panelEl.querySelector('.sh-btns button'); if (b) b.click(); return; }
      const k = map[e.code];
      if (!k) return;
      if (this.state !== 'title') e.preventDefault();
      this.press(k, down);
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    // touch pad: each finger remembers its button, so slide-offs and multi-touch (run + jump) work
    this.pads = new Map();
    const refresh = (k) => { const on = [...this.pads.values()].includes(k); this.keys[k] = on ? 1 : 0; const b = this.root.querySelector(`[data-k="${k}"]`); if (b) b.classList.toggle('on', on); };
    this.onPadDown = (e) => {
      e.preventDefault(); this.sound.resume();
      const k = e.currentTarget.dataset.k;
      this.press(k, true); this.pads.set(e.pointerId, k); refresh(k);
    };
    this.onPadUp = (e) => { const k = this.pads.get(e.pointerId); if (k) { this.pads.delete(e.pointerId); refresh(k); } };
    this.root.querySelectorAll('.sh-pad b').forEach((b) => { b.addEventListener('pointerdown', this.onPadDown); b.addEventListener('contextmenu', (e) => e.preventDefault()); });
    window.addEventListener('pointerup', this.onPadUp);
    window.addEventListener('pointercancel', this.onPadUp);
    this.onClick = (e) => { const el = e.target.closest('[data-a]'); if (el && !el.disabled) this.act(el.dataset.a, el.dataset.v); };
    this.root.addEventListener('click', this.onClick);
    this.onBlur = () => { if (this.state === 'play') this.togglePause(); };
    window.addEventListener('blur', this.onBlur);
  }

  beep(...a) { this.sound.beep(...a); }

  // ───────────── physics ─────────────
  // moves a body by its velocity and pushes it out of solid tiles; returns { wall, head: [tx, ty] | null }
  move(b, dt) {
    const lv = this.lv; const e = 0.001; const out = { wall: false, head: null };
    b.x += b.vx * dt;
    for (let tx = Math.floor(b.x - b.w / 2); tx <= Math.floor(b.x + b.w / 2 - e); tx++) for (let ty = Math.floor(b.y + e); ty <= Math.floor(b.y + b.h - e); ty++) {
      if (!solidAt(lv, tx, ty)) continue;
      if (b.vx > 0 || (b.vx === 0 && b.x < tx + 0.5)) b.x = tx - b.w / 2 - e; else b.x = tx + 1 + b.w / 2 + e;
      b.vx = 0; out.wall = true;
    }
    b.y += b.vy * dt; b.on = false;
    let best = null;
    for (let tx = Math.floor(b.x - b.w / 2); tx <= Math.floor(b.x + b.w / 2 - e); tx++) for (let ty = Math.floor(b.y); ty <= Math.floor(b.y + b.h - e); ty++) {
      if (!solidAt(lv, tx, ty)) continue;
      if (b.vy > 0) { if (!best || Math.abs(tx + 0.5 - b.x) < Math.abs(best[0] + 0.5 - b.x)) best = [tx, ty]; } else if (ty + 1 - b.y < 0.6) { b.y = ty + 1; b.vy = 0; b.on = true; }
    }
    if (best) { b.y = best[1] - b.h - e; b.vy = 0; out.head = best; }
    return out;
  }

  hit(tx, ty) {
    const lv = this.lv; const k = tx * H + ty; const v = lv.T[k]; const m = this.blocks.get(k); const p = this.p;
    if (v === QUESTION) {
      lv.T[k] = USED; if (m) { m.material = this.mats.used; m.userData.bump = 0.25; }
      if (!p.fire && (tx * 31 + ty * 17 + this.n) % 3 === 0) this.spawnItem(tx + 0.5, ty + 1, p.big ? 'flower' : 'orb');
      else { this.gainCoin(200); this.popCoin(tx + 0.5, ty + 1.2); }
    } else if (v === BRICK) {
      if (p.big) { lv.T[k] = 0; if (m) { this.world.remove(m); this.blocks.delete(k); } this.score += 50; this.fx.burst(tx + 0.5, ty + 0.5, '#c8602a', 10, { speed: 5, size: 0.22, life: 0.7 }); this.shake = Math.max(this.shake, 0.08); this.beep(160, 0.15, 'sawtooth', -60, 0.08); } else { if (m) m.userData.bump = 0.25; this.beep(220, 0.06, 'square'); }
    } else return;
    for (const f of this.foes) if (!f.dead && Math.abs(f.x - (tx + 0.5)) < 0.8 && Math.abs(f.y - (ty + 1)) < 0.3) this.killFoe(f, true);
  }
  gainCoin(points = 100) {
    this.coinsN++; this.lvCoins++; this.save.stats.coins++; this.score += points; this.beep(points > 100 ? 988 : 1200, 0.09, 'square', 500, 0.04);
    if (this.coinsN >= 100) { this.coinsN -= 100; this.lives++; this.toast('1UP!'); this.beep(660, 0.3, 'triangle', 600); }
  }
  popCoin(x, y) { const m = new THREE.Mesh(this.coinGeo, this.coinMat); m.position.set(x, y, 0.3); this.world.add(m); this.pops.push({ m, t: 0, y }); this.fx.burst(x, y, '#ffd23a', 6, { speed: 3, life: 0.4 }); }
  spawnItem(x, y, type) {
    const g = new THREE.Group();
    if (type === 'flower') {
      const st = box(0.08, 0.3, 0.08, '#2f9f3f'); st.position.y = 0.15; g.add(st);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = sph(0.13, '#ff7a2a', 8, 6); pt.position.set(Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2); g.add(pt); }
      const c = sph(0.13, '#ffe45e', 8, 6); c.position.y = 0.42; g.add(c);
    } else {
      const o = sph(0.32, '#7dff6a'); o.material.emissive = new THREE.Color('#2aa83a'); o.position.y = 0.34; g.add(o);
      const r = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.4, 0.05, 8, 20)), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#aaffaa' })); r.position.y = 0.34; g.add(r);
    }
    g.position.set(x, y, 0); this.world.add(g);
    this.items.push({ x, y, vx: 2.4, vy: 0, w: 0.6, h: 0.6, m: g, born: 0.4, type, dir: 1 }); this.beep(330, 0.2, 'triangle', 300);
  }
  killFoe(f, fling, stomp) {
    f.dead = fling ? 1.2 : 0.45; f.fling = fling; if (fling) f.vy = 8;
    this.score += 100; if (stomp) this.save.stats.stomps++;
    this.fx.burst(f.x, f.y + 0.4, f.kind === 1 ? '#ff5a5a' : f.kind === 2 ? '#2f9f7f' : '#a24de8', 10, { speed: 5, size: 0.18 });
    this.beep(fling ? 300 : 520, 0.1, 'square', fling ? -120 : 200);
  }

  shoot() {
    const p = this.p;
    if (!p.fire || p.dead || this.fireballs.length >= 2) return;
    const m = sph(0.16, '#ff9a1f'); m.material.emissive = new THREE.Color('#ff4a00'); this.world.add(m);
    this.fireballs.push({ x: p.x + p.dir * 0.5, y: p.y + 0.6, vx: p.dir * 10, vy: 2, w: 0.3, h: 0.3, t: 0, m });
    this.beep(700, 0.12, 'sawtooth', -400, 0.05);
  }
  enemyShot(x, y, dir, vx = 5) {
    const m = sph(0.15, '#ff4d6d'); m.material.emissive = new THREE.Color('#aa0033'); this.world.add(m);
    this.bullets.push({ x, y, vx: dir * vx, t: 0, m }); this.beep(240, 0.12, 'square', -100, 0.04);
  }

  hurt() {
    const p = this.p;
    if (p.inv > 0 || p.dead) return;
    this.hitTaken = true;
    if (p.big) { p.big = false; p.fire = false; p.h = 0.9; p.inv = 1.6; this.hero.scale.setScalar(1); this.hero.userData.tuft.material.color.set('#ffe45e'); this.padEl.classList.remove('fire'); this.shake = 0.3; this.beep(300, 0.3, 'sawtooth', -200); return; }
    this.die();
  }
  die() {
    const p = this.p; if (p.dead) return;
    this.hitTaken = true;
    p.dead = 1; p.vy = 13; p.vx = 0; this.state = 'dying'; this.dieT = 1.6; this.shake = 0.4; this.beep(500, 0.6, 'square', -380, 0.08);
  }
  grow(fire) {
    const p = this.p; this.score += 500;
    if (fire) { p.fire = true; this.hero.userData.tuft.material.color.set('#ff5a2a'); this.padEl.classList.add('fire'); this.toast(this.isTouch ? 'FIRE POWER! Tap FIRE' : 'FIRE POWER! Press F'); } else if (!p.big) this.toast('POWER UP!');
    if (!p.big) { p.big = true; p.h = 1.5; this.hero.scale.setScalar(1.5); }
    this.fx.burst(p.x, p.y + 0.8, fire ? '#ff9a1f' : '#7dff6a', 14, { speed: 5 });
    this.beep(520, 0.35, 'triangle', 700);
  }

  hitBoss(dmg = 1) {
    const b = this.boss;
    if (!b || b.inv > 0 || b.hp <= 0) return false;
    b.hp -= dmg; b.inv = 1; this.shake = 0.35; this.score += 300;
    this.fx.burst(b.x, b.y + 1, '#ff7aa0', 14, { speed: 6, size: 0.2 }); this.beep(180, 0.25, 'sawtooth', -90, 0.08);
    this.bossBar.firstChild.style.width = `${Math.max(0, (b.hp / 6) * 100)}%`;
    if (b.hp <= 0) {
      this.bossDead = true; this.save.stats.bosses++; this.score += 2000; this.shake = 0.6;
      this.fx.burst(b.x, b.y + 1, '#ffd23a', 40, { speed: 9, size: 0.3, life: 1 }); this.fx.burst(b.x, b.y + 1, '#ff7aa0', 30, { speed: 7, size: 0.25, life: 1 });
      for (let i = 0; i < 6; i++) this.popCoin(b.x - 1.2 + i * 0.5, b.y + 1.5);
      this.world.remove(b.m); this.bossBar.style.display = 'none'; this.toast('JELLY KING DEFEATED!', 2200); this.beep(880, 0.5, 'triangle', 500);
    }
    return true;
  }

  step(dt) {
    const p = this.p; const k = this.keys; const lv = this.lv;
    if (p.dead) { p.vy -= 40 * dt; p.y += p.vy * dt; return; }
    this.simT += dt;
    for (const m of this.movers) { const ox = m.x; m.x = m.x0 + Math.sin(this.simT * m.speed + m.phase) * m.range; m.dx = m.x - ox; }
    if (p.stand) p.x += p.stand.dx; // ride the platform
    const dirIn = k.r - k.l;
    const top = k.run ? 8.5 : 5.2;
    if (dirIn) { p.vx += dirIn * (p.on ? 42 : 26) * dt; p.dir = dirIn; } else { const f = (p.on ? 38 : 8) * dt; p.vx = Math.abs(p.vx) < f ? 0 : p.vx - Math.sign(p.vx) * f; }
    if (Math.abs(p.vx) > top) p.vx = Math.sign(p.vx) * Math.max(top, Math.abs(p.vx) - 30 * dt);
    p.coy = p.on ? 0.1 : p.coy - dt; p.buf -= dt;
    if (p.buf > 0 && p.coy > 0) { p.vy = 16.8 + Math.abs(p.vx) * 0.18; p.buf = 0; p.coy = 0; p.cut = false; p.stand = null; p.sq = -0.4; this.beep(420, 0.16, 'square', 380); this.fx.burst(p.x, p.y + 0.05, '#e8e0d0', 4, { speed: 2, size: 0.12, life: 0.3, gravity: -2, up: 0.3 }); }
    if (!k.j && p.vy > 0 && !p.cut && !p.on) { p.vy *= 0.5; p.cut = true; } // release early = short hop
    p.vy -= (p.vy < 0 ? 62 : 44) * dt; if (p.vy < -26) p.vy = -26;
    const prevY = p.y; p.lastVy = p.vy;
    const r = this.move(p, dt);
    p.stand = null;
    if (!p.on && p.vy <= 0) for (const m of this.movers) if (Math.abs(p.x - m.x) < m.w / 2 + p.w * 0.3 && prevY >= m.y - 0.1 && p.y <= m.y + 0.1) { p.y = m.y; p.vy = 0; p.on = true; p.stand = m; break; }
    if (p.x < 0.4) { p.x = 0.4; p.vx = Math.max(0, p.vx); }
    if (this.boss && !this.bossDead && p.x > lv.len - 9.5) { p.x = lv.len - 9.5; p.vx = 0; if (this.simT - this.gateT > 2.5) { this.gateT = this.simT; this.toast('Defeat the Jelly King first!'); } }
    if (r.head) this.hit(r.head[0], r.head[1]);
    if (p.on && !p.wasOn && p.lastVy < -8) { p.sq = 0.5; this.fx.burst(p.x, p.y + 0.05, '#e8e0d0', 5, { speed: 2.5, size: 0.14, life: 0.35, gravity: -2, up: 0.3 }); }
    p.wasOn = p.on;
    if (p.on) p.cut = false;
    p.inv = Math.max(0, p.inv - dt);
    p.anim += Math.abs(p.vx) * dt * 2.4;
    p.dust -= dt; if (p.on && Math.abs(p.vx) > 6 && p.dust <= 0) { p.dust = 0.09; this.fx.burst(p.x - p.dir * 0.3, p.y + 0.05, '#e8e0d0', 1, { speed: 1.2, size: 0.12, life: 0.35, gravity: -1, up: 0.2 }); }
    if (p.y < -2) { this.die(); return; }
    for (const s of this.springs) if (Math.abs(p.x - s.x) < 0.6 && p.vy <= 0 && p.y < s.y + 0.5 && p.y > s.y - 0.3) { p.vy = 27; p.cut = true; p.on = false; s.sq = 0.3; this.beep(300, 0.25, 'sine', 600, 0.08); this.fx.burst(s.x, s.y + 0.5, '#ffd23a', 6, { speed: 3, life: 0.4 }); }
    for (const c of this.coins) if (!c.got && Math.abs(c.x - p.x) < 0.65 && c.y > p.y - 0.35 && c.y < p.y + p.h + 0.35) { c.got = true; c.m.visible = false; this.gainCoin(); this.fx.burst(c.x, c.y, '#ffd23a', 4, { speed: 2.5, size: 0.1, life: 0.35, gravity: -4 }); }
    for (const f of this.foes) {
      if (f.dead) continue;
      if (!f.active) { if (Math.abs(f.x - p.x) < 17) f.active = true; else continue; }
      f.vy = Math.max(-20, f.vy - 40 * dt);
      if (f.kind === 2) { // spitter: stands still and fires at you
        f.vx = 0; f.dir = p.x < f.x ? -1 : 1; this.move(f, dt); f.cool -= dt;
        if (f.cool <= 0 && Math.abs(f.x - p.x) < 13) { f.cool = 2.6; this.enemyShot(f.x + f.dir * 0.5, f.y + 0.45, f.dir); }
      } else { f.vx = f.dir * (f.kind ? 1.4 : 1.9); const fr = this.move(f, dt); if (fr.wall) f.dir = -f.dir; }
      if (f.y < -3) { f.dead = 0.01; continue; }
      if (Math.abs(f.x - p.x) < (f.w + p.w) / 2 && p.y < f.y + f.h && p.y + p.h > f.y) {
        if (f.kind !== 1 && p.vy < 0 && p.y > f.y + f.h * 0.4) { this.killFoe(f, false, true); p.vy = k.j ? 16 : 11; this.shake = Math.max(this.shake, 0.1); } else this.hurt();
      }
    }
    const b = this.boss;
    if (b && !this.bossDead) this.stepBoss(b, p, dt);
    for (const f of this.fireballs) {
      f.t += dt; f.vy -= 38 * dt; const fr = this.move(f, dt);
      if (f.on) f.vy = 8;
      if (fr.wall || f.t > 2.5 || f.y < -3) { f.t = 9; this.fx.burst(f.x, f.y, '#ff9a1f', 5, { speed: 3, size: 0.12, life: 0.3 }); continue; }
      for (const e of this.foes) if (!e.dead && Math.abs(e.x - f.x) < 0.6 && Math.abs(e.y + 0.4 - f.y) < 0.6) { this.killFoe(e, true); f.t = 9; break; }
      if (b && !this.bossDead && Math.abs(b.x - f.x) < b.w / 2 + 0.2 && f.y > b.y && f.y < b.y + b.h) { this.hitBoss(1); f.t = 9; }
    }
    this.fireballs = this.fireballs.filter((f) => { if (f.t >= 9) { this.world.remove(f.m); return false; } return true; });
    for (const bl of this.bullets) {
      bl.t += dt; bl.x += bl.vx * dt;
      if (bl.t > 4 || solidAt(lv, Math.floor(bl.x), Math.floor(bl.y))) { bl.t = 9; continue; }
      if (Math.abs(bl.x - p.x) < 0.45 && bl.y > p.y - 0.1 && bl.y < p.y + p.h + 0.1) { bl.t = 9; this.hurt(); }
    }
    this.bullets = this.bullets.filter((bl) => { if (bl.t >= 9) { this.world.remove(bl.m); return false; } return true; });
    for (const it of this.items) {
      it.vy = Math.max(-20, it.vy - 40 * dt);
      if (it.born > 0) { it.born -= dt; it.y += 1.5 * dt; } else if (it.type === 'orb') { it.vx = it.dir * 2.4; if (this.move(it, dt).wall) it.dir = -it.dir; }
      if (!it.got && Math.abs(it.x - p.x) < 0.6 && it.y < p.y + p.h && it.y + it.h > p.y) { it.got = true; this.world.remove(it.m); this.grow(it.type === 'flower'); }
    }
    this.items = this.items.filter((i) => !i.got && i.y > -4);
    if (p.x > lv.flagX - 0.3) this.finish();
  }

  stepBoss(b, p, dt) {
    if (Math.abs(b.x - p.x) > 16) return;
    if (this.bossBar.style.display === 'none') { this.bossBar.style.display = 'block'; this.toast('THE JELLY KING!', 1800); }
    b.inv = Math.max(0, b.inv - dt); b.t -= dt; b.vy = Math.max(-26, b.vy - 40 * dt);
    const was = b.on;
    if (b.on) {
      b.vx = 0;
      if (b.t <= 0) {
        b.dir = p.x < b.x ? -1 : 1; b.vy = 13; b.vx = b.dir * (3.4 + (6 - b.hp) * 0.25); b.t = Math.max(0.7, 1.5 - (6 - b.hp) * 0.1); b.hops++;
        if (b.hops % 3 === 0) { this.enemyShot(b.x + b.dir, b.y + 0.9, b.dir, 6); this.enemyShot(b.x + b.dir, b.y + 1.6, b.dir, 5); }
      }
    }
    this.move(b, dt);
    const { min, max } = this.lv.boss;
    if (b.x < min) { b.x = min; b.vx = 0; } else if (b.x > max) { b.x = max; b.vx = 0; }
    if (b.on && !was) { this.shake = Math.max(this.shake, 0.25); this.fx.burst(b.x, b.y + 0.05, '#e8e0d0', 8, { speed: 4, size: 0.2, life: 0.4, gravity: -3, up: 0.3 }); this.beep(110, 0.2, 'sawtooth', -40, 0.08); }
    if (Math.abs(b.x - p.x) < (b.w + p.w) / 2 && p.y < b.y + b.h && p.y + p.h > b.y) {
      if (p.vy < 0 && p.y > b.y + b.h * 0.55) { this.hitBoss(1); p.vy = 17; } else this.hurt();
    }
  }

  finish() {
    const p = this.p; const lv = this.lv;
    this.state = 'clear'; this.clearT = 0; p.vx = 0; p.vy = 0; p.x = lv.flagX - 0.45;
    this.stars = starsFor(this.lvCoins, lv.coins.length, this.hitTaken);
    this.score += Math.round(Math.max(0, p.y - 2) * 100) + Math.floor(this.time) * 10; this.beep(784, 0.5, 'triangle', 400);
    this.save.stars[this.n] = Math.max(this.save.stars[this.n] || 0, this.stars);
    this.save.level = Math.max(this.save.level, this.n + 1); this.save.hi = Math.max(this.save.hi, this.score); this.persist();
    this.fx.burst(lv.flagX, 10, '#ffd23a', 24, { speed: 6, size: 0.2, life: 0.9 });
  }

  // ───────────── loop ─────────────
  frame(t) {
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    if (this.state === 'play') {
      this.time -= dt; if (this.time <= 0) { this.time = 0; this.die(); }
      let left = dt; while (left > 1e-6 && this.state === 'play') { const s = Math.min(left, 1 / 90); this.step(s); left -= s; }
    } else if (this.state === 'dying') {
      this.step(dt); this.dieT -= dt;
      if (this.dieT <= 0) {
        this.lives--; this.save.hi = Math.max(this.save.hi, this.score); this.persist();
        if (this.lives <= 0) { this.state = 'over'; this.panel(`<h2>GAME OVER</h2><p>Score ${this.score}</p>`, [['TRY AGAIN', 'retry'], ['MENU', 'quit', undefined, 1]]); } else { this.build(this.n); this.state = 'play'; }
      }
    } else if (this.state === 'clear') {
      this.clearT += dt;
      this.flagY = Math.max(3.2, this.flagY - 4 * dt); this.flag.position.y = this.flagY;
      if (this.p.y > this.lv.start + 0.01) this.p.y = Math.max(this.lv.start, this.p.y - 6 * dt);
      else if (this.clearT > 1 && !this.clearShown) {
        this.clearShown = true;
        this.panel(`<h2>${this.lv.boss ? 'WORLD CLEAR!' : 'LEVEL CLEAR!'}</h2><div class="stars">${starText(this.stars)}</div><p>Score ${this.score} · Coins ${this.lvCoins}/${this.lv.coins.length}${this.hitTaken ? '' : ' · No hits!'}</p>`, [['NEXT LEVEL', 'next'], ['MENU', 'quit', undefined, 1]]);
      }
    }
    this.fx.update(this.state === 'pause' ? 0 : dt);
    this.animate(dt, t / 1000);
    this.renderer.render(this.scene, this.camera);
  }

  animate(dt, t) {
    const p = this.p; const h = this.hero; const u = h.userData;
    h.position.set(p.x, p.y, 0);
    h.rotation.y = p.dir * (Math.PI / 2 - 0.45);
    h.visible = !(p.inv > 0 && Math.floor(t * 18) % 2);
    // squash and stretch: landing squashes, jumping and falling stretch
    p.sq *= Math.max(0, 1 - dt * 10);
    const base = p.big ? 1.5 : 1; const st = p.on ? 0 : Math.min(0.2, Math.abs(p.vy) * 0.008);
    h.scale.set(base * (1 + p.sq * 0.4 - st * 0.5), base * (1 - p.sq * 0.4 + st), base * (1 + p.sq * 0.4 - st * 0.5));
    const sw = p.on ? Math.sin(p.anim * 3) * 0.12 : 0;
    u.feet[0].position.y = 0.05 + Math.max(0, sw) + (p.on ? 0 : 0.12); u.feet[1].position.y = 0.05 + Math.max(0, -sw) + (p.on ? 0 : 0.12);
    if (p.on && Math.abs(p.vx) > 0.5) h.position.y += Math.abs(Math.sin(p.anim * 3)) * 0.06;
    for (const w of u.wings) w.rotation.z = w.userData.side * (0.35 + Math.sin(t * (p.on ? 6 : 28)) * (p.on ? 0.1 : 0.5));
    this.blink -= dt; if (this.blink < -0.12) this.blink = 2 + Math.random() * 2.5;
    for (const e of u.eyes) e.scale.y = this.blink < 0 ? 0.1 : 1;
    for (const c of this.coins) if (!c.got) c.m.rotation.y = t * 3 + c.x;
    for (const b of this.blocks.values()) if (b.userData.bump > 0) { b.userData.bump -= dt; b.position.y = Math.floor(b.position.y) + 0.5 + Math.sin(Math.max(0, b.userData.bump) / 0.25 * Math.PI) * 0.25; }
    for (const m of this.movers) m.m.position.x = m.x;
    for (const s of this.springs) { s.sq = Math.max(0, s.sq - dt); s.m.scale.y = 1 - s.sq * 1.2; }
    for (const f of this.foes) {
      if (f.gone) continue;
      f.m.position.set(f.x, f.y, 0);
      if (f.dead) {
        f.dead -= dt;
        if (f.fling) { f.m.rotation.z += dt * 10; f.vy -= 40 * dt; f.y += f.vy * dt; f.x += f.dir * 2 * dt; } else f.m.scale.set(1.2, 0.25, 1.2);
        if (f.dead <= 0) { f.gone = true; this.world.remove(f.m); }
      } else if (f.kind === 1) f.m.rotation.z -= f.dir * dt * 5;
      else { f.m.scale.y = 1 + Math.sin(t * 8 + f.x) * 0.06; if (f.kind === 2) f.m.scale.x = -f.dir; }
    }
    const b = this.boss;
    if (b && !this.bossDead) { b.m.position.set(b.x, b.y, 0); b.m.scale.set(1 + (b.on ? 0 : -0.05), 1 + (b.on ? Math.sin(t * 5) * 0.03 : 0.08), 1); b.m.visible = !(b.inv > 0 && Math.floor(t * 20) % 2); }
    for (const it of this.items) { it.m.position.set(it.x, it.y, 0); it.m.rotation.y += dt * 3; }
    for (const f of this.fireballs) f.m.position.set(f.x, f.y, 0);
    for (const bl of this.bullets) bl.m.position.set(bl.x, bl.y, 0);
    for (const c of this.pops) { c.t += dt; c.m.position.y = c.y + Math.sin(Math.min(1, c.t / 0.5) * Math.PI) * 1.4; c.m.rotation.y += dt * 12; if (c.t > 0.5) { this.world.remove(c.m); c.done = true; } }
    this.pops = this.pops.filter((c) => !c.done);
    // camera: look ahead of the hero, stay inside the level; pull back on tall (phone portrait) screens
    const fov = this.camera.fov * Math.PI / 180; const aspect = this.camera.aspect;
    const dist = Math.max(13, 17 / (2 * Math.tan(fov / 2) * aspect));
    const visH = 2 * dist * Math.tan(fov / 2); const visW = visH * aspect;
    const tx = Math.max(visW / 2 - 1, Math.min(this.lv.W - visW / 2 + 2, p.x + visW * 0.18));
    this.cx += (tx - this.cx) * Math.min(1, dt * 6);
    const ty = 2 + visH * 0.3 + Math.max(0, p.y - 6) * 0.7;
    this.cy = this.cy === undefined ? ty : this.cy + (ty - this.cy) * Math.min(1, dt * 4);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const sx = (Math.random() - 0.5) * this.shake * 2; const sy = (Math.random() - 0.5) * this.shake * 2;
    this.camera.position.set(this.cx + sx, this.cy + 0.6 + sy, dist); this.camera.lookAt(this.cx + sx, this.cy + sy, 0);
    const e = this.hudEl;
    put(e.s, String(this.score).padStart(6, '0')); put(e.c, this.coinsN); put(e.w, worldName(this.n)); put(e.t, Math.ceil(this.time)); put(e.l, this.lives); put(e.st, totalStars(this.save));
  }

  resize() {
    const w = this.container.clientWidth || 1280; const h = this.container.clientHeight || 720;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize); window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey); window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPadUp); window.removeEventListener('pointercancel', this.onPadUp);
    this.root.removeEventListener('click', this.onClick);
    if (this.ro) this.ro.disconnect();
    clearTimeout(this.toastT);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.fx.dispose(); this.renderer.dispose(); try { this.renderer.forceContextLoss(); } catch { /* ignore */ } this.root.remove(); this.sound.destroy();
  }
}
