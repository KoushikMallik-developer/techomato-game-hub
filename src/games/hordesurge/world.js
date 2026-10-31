// Horde Surge scenery and level props: the lane, rails, ground and trees per theme, the enemy fortress,
// the cannon, gates, bonus crates, barriers, hazards, the boss and champions.
import * as THREE from 'three';
import { LANE_W, CANNON_Z, mulberry32 } from './data.js';
import { mergeSimple } from './crowd.js';

const HALF = LANE_W / 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep = null) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

// big chunky number text (outlined) drawn on a canvas texture; update(text) redraws it
export function makeLabel(text, { w = 256, h = 128, color = '#ffffff', stroke = '#1a1a22', bg = null, font = 900, size = 0.78 } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const t = tex(c);
  let last = null;
  const draw = (s) => {
    if (s === last) return;
    last = s;
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    let fs = h * size;
    g.font = `${font} ${fs}px "Arial Black", Impact, system-ui, sans-serif`;
    while (g.measureText(s).width > w * 0.9 && fs > 10) { fs *= 0.9; g.font = `${font} ${fs}px "Arial Black", Impact, system-ui, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = fs * 0.16;
    g.strokeStyle = stroke;
    g.strokeText(s, w / 2, h / 2 + fs * 0.04);
    g.fillStyle = color;
    g.fillText(s, w / 2, h / 2 + fs * 0.04);
    t.needsUpdate = true;
  };
  draw(String(text));
  return { texture: t, update: (s) => draw(String(s)) };
}

function noiseTex(base, dark, rep, seed = 1, lines = false) {
  const rnd = mulberry32(seed);
  const c = canvas(256, 256); const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? dark : 'rgba(255,255,255,0.12)'; g.globalAlpha = 0.15 + rnd() * 0.25; const s = 1 + rnd() * 3; g.fillRect(rnd() * 256, rnd() * 256, s, s); }
  g.globalAlpha = 1;
  if (lines) { g.fillStyle = 'rgba(255,255,255,0.55)'; for (let y = 0; y < 256; y += 64) g.fillRect(124, y, 8, 34); }
  return tex(c, rep);
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05, ...o });
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ───────────── environment ─────────────
export function buildEnvironment(level, quality) {
  const T = level.theme;
  const L = level.L;
  const g = new THREE.Group();
  const zFar = -L - 30; const zNear = CANNON_Z + 30;
  // ground
  const ground = mesh(new THREE.PlaneGeometry(260, zNear - zFar + 200), std({ map: noiseTex(T.ground, T.ground2, [40, 50], 3), roughness: 0.95 }), g, 0, -0.02, (zNear + zFar) / 2, false);
  ground.rotation.x = -Math.PI / 2;
  // the lane: a raised strip with a curb on each side
  const laneLen = CANNON_Z + 8 + L + 6;
  const laneZ = (CANNON_Z + 8 - L - 6) / 2;
  const lane = mesh(new THREE.BoxGeometry(LANE_W, 0.3, laneLen), std({ map: noiseTex(T.lane, 'rgba(0,0,0,0.5)', [3, laneLen / 4], 5), roughness: 0.85 }), g, 0, -0.15, laneZ, false);
  lane.receiveShadow = true;
  const railMat = std({ color: T.rail, roughness: 0.5 });
  const stripe = canvas(64, 64); const sg = stripe.getContext('2d');
  sg.fillStyle = T.neon ? '#ff3b9a' : '#e63b3b'; sg.fillRect(0, 0, 64, 64); sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, 32, 64);
  const curbMat = std({ map: tex(stripe, [laneLen / 2, 1]), roughness: 0.6, emissive: T.neon ? '#ff3b9a' : '#000000', emissiveIntensity: T.neon ? 0.4 : 0 });
  [-1, 1].forEach((s) => {
    mesh(new THREE.BoxGeometry(0.5, 0.5, laneLen), curbMat, g, s * (HALF + 0.25), 0.1, laneZ);
    mesh(new THREE.BoxGeometry(0.25, 0.9, laneLen), railMat, g, s * (HALF + 0.75), 0.45, laneZ);
  });
  // trees / props beyond the rails (instanced)
  if (quality !== 'low') {
    const rnd = mulberry32(level.n * 31 + 7);
    const count = quality === 'high' ? 260 : 150;
    const crown = T.id === 'desert' ? new THREE.CylinderGeometry(0.35, 0.4, 2.6, 8) : T.id === 'candy' ? new THREE.SphereGeometry(1.1, 12, 10) : T.id === 'night' ? new THREE.OctahedronGeometry(0.9, 0).scale(0.6, 1.9, 0.6) : new THREE.ConeGeometry(1.3, 3.2, 8);
    crown.translate(0, T.id === 'desert' ? 1.3 : T.id === 'night' ? 1.9 : 2.6, 0);
    const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6); trunk.translate(0, 0.6, 0);
    const cm = new THREE.InstancedMesh(crown, std({ color: T.tree, emissive: T.neon ? T.tree : '#000000', emissiveIntensity: T.neon ? 0.55 : 0, roughness: T.neon ? 0.3 : 0.8 }), count);
    const tm = new THREE.InstancedMesh(trunk, std({ color: T.trunk }), count);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (HALF + 3 + rnd() * rnd() * 40);
      const z = zFar + rnd() * (zNear - zFar);
      const s = 0.7 + rnd() * 0.9;
      sc.set(s, s * (0.8 + rnd() * 0.5), s);
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      m.compose(p, q, sc);
      cm.setMatrixAt(i, m); tm.setMatrixAt(i, m);
    }
    cm.castShadow = true;
    g.add(cm, tm);
    // a few rocks / hills in the distance
    const hill = new THREE.SphereGeometry(1, 16, 10);
    for (let k = 0; k < 10; k++) {
      const h = mesh(hill, std({ color: T.ground2, roughness: 1 }), g, (k % 2 ? 1 : -1) * (30 + rnd() * 50), -2, zFar - 20 - rnd() * 60, false);
      h.scale.set(20 + rnd() * 25, 8 + rnd() * 14, 20 + rnd() * 20);
    }
  }
  return g;
}

// ───────────── the enemy fortress ─────────────
// stone blocks texture (tinted per world)
function stoneTex(color, rep) {
  const c = canvas(256, 256); const g = c.getContext('2d');
  const base = new THREE.Color(color);
  const rnd = mulberry32(41);
  g.fillStyle = '#' + base.clone().offsetHSL(0, 0, -0.18).getHexString(); g.fillRect(0, 0, 256, 256);
  const rows = 8; const h = 256 / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -24 : 0;
    while (x < 256) {
      const w = 40 + rnd() * 30;
      g.fillStyle = '#' + base.clone().offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.12).getHexString();
      g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, r * h + 2, w - 4, 3);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 2, r * h + h - 5, w - 4, 3);
      x += w;
    }
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  return tex(c, rep);
}

// the horde's emblem for banners: a horned skull-ish face
function bannerTex(color, neon) {
  const c = canvas(128, 256); const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 10, 256); g.fillRect(118, 0, 10, 256);
  g.fillStyle = neon ? '#1b1238' : '#ffd23f'; g.fillRect(0, 0, 128, 14);
  // tail notch
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, 256); g.lineTo(64, 206); g.lineTo(128, 256); g.fill();
  g.globalCompositeOperation = 'source-over';
  const ink = neon ? '#1b1238' : '#2a1a14';
  g.fillStyle = ink;
  g.beginPath(); g.arc(64, 112, 34, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(34, 96); g.quadraticCurveTo(10, 70, 22, 48); g.quadraticCurveTo(30, 78, 46, 86); g.fill();
  g.beginPath(); g.moveTo(94, 96); g.quadraticCurveTo(118, 70, 106, 48); g.quadraticCurveTo(98, 78, 82, 86); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.ellipse(50, 110, 9, 11, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(78, 110, 9, 11, -0.3, 0, Math.PI * 2); g.fill();
  g.fillRect(52, 130, 6, 10); g.fillRect(62, 130, 6, 10); g.fillRect(72, 130, 6, 10);
  const t = tex(c);
  return t;
}

export function buildFortress(level) {
  const T = level.theme;
  const g = new THREE.Group();
  const stone = std({ map: stoneTex(T.fort, [3, 1.2]), roughness: 0.9 });
  const stoneV = std({ map: stoneTex(T.fort, [2, 2.5]), roughness: 0.9 });
  const trim = std({ color: new THREE.Color(T.fort).offsetHSL(0, -0.05, 0.12), roughness: 0.8 });
  const dark = std({ color: '#2a2530', roughness: 0.5, metalness: 0.5 });
  const red = T.neon ? '#ff3b6b' : '#c0392b';
  const accent = std({ color: red, roughness: 0.45, emissive: T.neon ? red : '#000000', emissiveIntensity: T.neon ? 0.8 : 0 });
  const W = LANE_W + 4;
  // plinth, main wall and walkway lip
  mesh(new THREE.BoxGeometry(W + 1.2, 0.8, 5.2), trim, g, 0, 0.4, -2);
  mesh(new THREE.BoxGeometry(W, 5.2, 4), stone, g, 0, 3.4, -2);
  mesh(new THREE.BoxGeometry(W + 0.6, 0.35, 4.6), trim, g, 0, 6.05, -2);
  // crenellations front and back
  for (let k = -4; k <= 4; k++) {
    // crenellations are tagged so they can break off as the fortress takes damage
    mesh(new THREE.BoxGeometry(1.05, 0.9, 0.7), stone, g, k * 1.95, 6.65, -0.25).userData.chunk = 1;
    mesh(new THREE.BoxGeometry(1.05, 0.9, 0.7), stone, g, k * 1.95, 6.65, -3.75).userData.chunk = 2;
  }
  // buttresses
  [-1, 1].forEach((s) => [2.9, 5.6].forEach((x) => mesh(new THREE.BoxGeometry(0.8, 4.4, 1.0), trim, g, s * x, 2.6, 0.3)));
  // the gate: arched opening with a raised portcullis and a glowing interior
  const arch = new THREE.Shape();
  arch.moveTo(-2.4, 0); arch.lineTo(-2.4, 2.6); arch.absarc(0, 2.6, 2.4, Math.PI, 0, true); arch.lineTo(2.4, 0); arch.lineTo(-2.4, 0);
  const frame = new THREE.Shape();
  frame.moveTo(-3.1, 0); frame.lineTo(-3.1, 2.6); frame.absarc(0, 2.6, 3.1, Math.PI, 0, true); frame.lineTo(3.1, 0); frame.lineTo(-3.1, 0);
  frame.holes.push(arch);
  const fg = new THREE.ExtrudeGeometry(frame, { depth: 0.5, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 16 });
  mesh(fg, trim, g, 0, 0.8, -0.15);
  const holeMat = new THREE.MeshStandardMaterial({ color: '#0b0910', roughness: 1, emissive: T.neon ? '#ff3b6b' : '#ff5a1f', emissiveIntensity: T.neon ? 0.55 : 0.35 });
  mesh(new THREE.ShapeGeometry(arch, 16), holeMat, g, 0, 0.8, -0.05, false);
  for (let k = -2; k <= 2; k++) mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), dark, g, k * 0.95, 4.9 - Math.abs(k) * 0.25, 0.25);
  mesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), dark, g, 0, 4.4, 0.25);
  // towers with crenellated tops, roof cones, ring trims and spinning-in-the-wind flags
  [-1, 1].forEach((s) => {
    const x = s * (HALF + 2.4);
    mesh(new THREE.CylinderGeometry(2.0, 2.4, 9.5, 16), stoneV, g, x, 4.75, -1.6);
    mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.5, 16), trim, g, x, 9.6, -1.6);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const b = mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), stoneV, g, x + Math.cos(a) * 2.2, 10.2, -1.6 + Math.sin(a) * 2.2); b.rotation.y = -a; b.userData.chunk = 2; }
    const roof = mesh(new THREE.ConeGeometry(2.3, 3.6, 16), accent, g, x, 12.1, -1.6);
    roof.castShadow = true;
    roof.userData.roof = s;
    mesh(new THREE.TorusGeometry(2.05, 0.12, 8, 24), dark, g, x, 10.45, -1.6).rotation.x = Math.PI / 2;
    // arrow-slit windows glowing from inside
    [3.4, 6.4].forEach((y) => mesh(new THREE.BoxGeometry(0.3, 0.9, 0.1), holeMat, g, x - s * 0.2, y, 0.62, false));
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), dark, g, x, 14.9, -1.6);
    const flag = mesh(new THREE.PlaneGeometry(1.6, 0.9, 6, 1), new THREE.MeshStandardMaterial({ color: red, side: THREE.DoubleSide, emissive: T.neon ? red : '#000', emissiveIntensity: T.neon ? 0.6 : 0 }), g, x + 0.8, 15.6, -1.6);
    flag.userData.flag = true;
    // hanging banners on the wall either side of the gate
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex(red, T.neon), transparent: true, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide });
    const b = mesh(new THREE.PlaneGeometry(1.3, 2.6), bm, g, s * 4.3, 4.3, 0.04, false);
    b.userData.flag = true;
    b.userData.banner = true;
    // torches
    mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.6, 6), dark, g, s * 3.4, 2.4, 0.2);
    const fl = mesh(new THREE.ConeGeometry(0.16, 0.45, 8), new THREE.MeshBasicMaterial({ color: T.neon ? '#7fe9ff' : '#ffb347' }), g, s * 3.4, 2.9, 0.2, false);
    fl.userData.torch = true;
  });
  // HP sign: a wooden board on chains above the gate
  const label = makeLabel(String(level.baseHp), { w: 512, h: 160 });
  const board = mesh(new THREE.BoxGeometry(5.4, 1.6, 0.25), std({ color: '#5a3b24', roughness: 0.9 }), g, 0, 8.4, 0.2);
  void board;
  const sign = mesh(new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }), g, 0, 8.42, 0.36, false);
  sign.renderOrder = 5;
  g.position.z = -level.L;
  return { group: g, label, flags: g.children.filter((c) => c.userData.flag), torches: g.children.filter((c) => c.userData.torch), chunks: g.children.filter((c) => c.userData.chunk), roofs: g.children.filter((c) => c.userData.roof) };
}

// ───────────── the cannon ─────────────
export function buildCannon(color) {
  const g = new THREE.Group();
  const body = std({ color, roughness: 0.28, metalness: 0.35 });
  const metal = std({ color: '#2f3238', roughness: 0.32, metalness: 0.85 });
  const brass = std({ color: '#d9a441', roughness: 0.25, metalness: 0.9 });
  const wood = std({ color: '#7a5636', roughness: 0.75 });
  const woodDark = std({ color: '#5a3d26', roughness: 0.8 });
  // the carriage: two cheek boards, a base, iron straps and bolts
  mesh(new THREE.BoxGeometry(1.9, 0.38, 2.1), wood, g, 0, 0.42, 0.05);
  [-1, 1].forEach((s) => {
    const cheek = mesh(new THREE.BoxGeometry(0.22, 0.75, 1.9), woodDark, g, s * 0.78, 0.85, 0.15);
    cheek.rotation.x = 0.12;
    mesh(new THREE.BoxGeometry(0.24, 0.08, 1.95), metal, g, s * 0.78, 1.2, 0.2).rotation.x = 0.12;
    for (let k = 0; k < 3; k++) mesh(new THREE.SphereGeometry(0.05, 8, 6), brass, g, s * 0.9, 0.7 + k * 0.08, -0.5 + k * 0.6);
    // spoked wheel with an iron tyre and a brass hub cap
    const wg = new THREE.Group(); wg.position.set(s * 1.15, 0.64, 0.2); g.add(wg);
    const tyre = mesh(new THREE.TorusGeometry(0.58, 0.07, 10, 28), metal, wg, 0, 0, 0); tyre.rotation.y = Math.PI / 2;
    const fel = mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 28), wood, wg, 0, 0, 0); fel.rotation.y = Math.PI / 2;
    for (let k = 0; k < 8; k++) { const sp = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.98, 6), wood, wg, 0, 0, 0); sp.rotation.x = (k / 8) * Math.PI; }
    const hub = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 14), brass, wg, 0, 0, 0); hub.rotation.z = Math.PI / 2;
    g.userData[s < 0 ? 'wl' : 'wr'] = wg;
  });
  const barrel = new THREE.Group();
  barrel.position.set(0, 1.15, 0);
  g.add(barrel);
  // a turned barrel: tapering body with raised reinforcing rings, a flared muzzle and a cascabel knob
  const prof = [[0.0, 1.0], [0.62, 1.0], [0.82, 0.92], [0.86, 0.78], [0.8, 0.7], [0.79, 0.4], [0.84, 0.35], [0.84, 0.28], [0.77, 0.24], [0.72, -0.3], [0.77, -0.34], [0.77, -0.42], [0.7, -0.46], [0.64, -1.05], [0.71, -1.1], [0.74, -1.22], [0.68, -1.28], [0.5, -1.3], [0.48, -1.18]];
  const lathe = new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const b = mesh(lathe, body, barrel, 0, 0, -0.6);
  b.rotation.x = Math.PI / 2 + 0.25;
  b.scale.set(1, 1.15, 1);
  // brass bands and a dark bore, in the barrel's own space (its muzzle is the -y end)
  [[0.3, 0.86], [-0.38, 0.79], [-1.16, 0.76]].forEach(([y, r]) => { const band = mesh(new THREE.TorusGeometry(r, 0.045, 8, 28), brass, b, 0, y, 0); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 1 / 1.15); });
  const bore = mesh(new THREE.CircleGeometry(0.49, 24), new THREE.MeshBasicMaterial({ color: '#0b0b0d' }), b, 0, -1.25, 0, false);
  bore.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.62, 22, 16), body, barrel, 0, -0.22, 0.62);
  mesh(new THREE.SphereGeometry(0.2, 12, 10), brass, barrel, 0, -0.4, 1.38);
  // trunnions
  [-1, 1].forEach((s) => { const t = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 12), metal, barrel, s * 0.82, -0.05, -0.1); t.rotation.z = Math.PI / 2; });
  // energy ring around the muzzle (glows when the champion is ready)
  const ring = mesh(new THREE.TorusGeometry(0.78, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0 }), barrel, 0, 0.38, -2.05, false);
  ring.rotation.x = -0.25;
  // muzzle flash, kicked to full on every shot and faded by the game
  const flash = mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), barrel, 0, 0.42, -2.35, false);
  flash.scale.set(1, 1, 1.8);
  g.position.set(0, 0, CANNON_Z + 1.5);
  return { group: g, barrel, body, ring, flash, wheels: [g.userData.wl, g.userData.wr] };
}

// ───────────── gates ─────────────
export function gateStyle(op) {
  if (op === '-') return { color: '#ff3b4a', glow: '#ff6b6b', text: '#ffffff' };
  if (op === 'x') return { color: '#2f8bff', glow: '#7fd0ff', text: '#ffffff' };
  return { color: '#20c25a', glow: '#8affb2', text: '#ffffff' };
}
export const gateText = (gt) => (gt.op === 'x' ? `×${gt.v}` : gt.op === '+' ? `+${gt.left ?? gt.v}` : `−${gt.left ?? gt.v}`);

// gate glass: tinted panel with a moving diagonal shine and glowing edges
function gateMaterial(color, glow) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, glow: { value: new THREE.Color(glow) }, time: { value: 0 }, flash: { value: 0 }, fade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform vec3 glow; uniform float time; uniform float flash; uniform float fade; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.82, 1.0, max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0));
        float shine = smoothstep(0.06, 0.0, abs(fract(vUv.x * 0.8 - vUv.y * 0.5 - time * 0.35) - 0.5) - 0.08);
        float bands = 0.5 + 0.5 * sin((vUv.y + time * 0.6) * 40.0);
        vec3 c = mix(color, glow, edge * 0.8 + shine * 0.5) * (1.0 + flash * 1.5);
        float a = (0.32 + edge * 0.5 + shine * 0.25 + bands * 0.05 + flash * 0.3) * fade;
        gl_FragColor = vec4(c * 1.3, a);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildGate(gt) {
  const s = gateStyle(gt.op);
  const g = new THREE.Group();
  const white = std({ color: '#f4f6fa', roughness: 0.3, metalness: 0.2 });
  const col = std({ color: s.color, roughness: 0.35, metalness: 0.1, emissive: s.glow, emissiveIntensity: 0.25 });
  const h = 2.5;
  [-1, 1].forEach((k) => {
    const x = k * gt.w / 2;
    mesh(new THREE.CylinderGeometry(0.2, 0.24, h, 12), white, g, x, h / 2, 0);
    mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 12), col, g, x, 0.11, 0);
    mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 12), col, g, x, h * 0.55, 0);
    mesh(new THREE.SphereGeometry(0.3, 14, 10), col, g, x, h + 0.15, 0);
  });
  mesh(new THREE.BoxGeometry(gt.w, 0.2, 0.22), white, g, 0, h - 0.05, 0);
  const panelMat = gateMaterial(s.color, s.glow);
  // compatibility: game code tweaks emissiveIntensity/opacity on the panel material
  Object.defineProperty(panelMat, 'emissiveIntensity', { get: () => 0.5 + panelMat.uniforms.flash.value, set: (v) => { panelMat.uniforms.flash.value = Math.max(0, v - 0.5); } });
  const panel = mesh(new THREE.PlaneGeometry(gt.w - 0.3, h - 0.2), panelMat, g, 0, (h - 0.2) / 2, 0, false);
  panel.receiveShadow = false;
  panel.renderOrder = 2;
  const label = makeLabel(gateText(gt), { w: 256, h: 128 });
  const lm = mesh(new THREE.PlaneGeometry(Math.min(gt.w * 0.9, 3.4), 1.7), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }), g, 0, h / 2 + 0.25, 0.06, false);
  lm.rotation.x = -0.35;
  lm.renderOrder = 3;
  g.position.set(gt.x, 0, gt.z);
  return { group: g, panel, panelMat, label, labelMesh: lm };
}

// ───────────── power-up orbs ─────────────
export function buildPickup(p, def) {
  const g = new THREE.Group();
  const orb = mesh(new THREE.IcosahedronGeometry(0.5, 1), std({ color: def.color, emissive: def.color, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3, flatShading: true }), g, 0, 1.3, 0);
  const shell = mesh(new THREE.SphereGeometry(0.78, 20, 14), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.2, depthWrite: false }), g, 0, 1.3, 0, false);
  const ring = mesh(new THREE.RingGeometry(0.75, 1, 36), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.6, depthWrite: false }), g, 0, 0.05, 0, false);
  ring.rotation.x = -Math.PI / 2;
  const label = makeLabel(def.name, { w: 256, h: 72, color: '#ffffff' });
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, depthWrite: false }));
  tag.scale.set(2.1, 0.6, 1);
  tag.position.y = 2.45;
  tag.renderOrder = 3;
  g.add(tag);
  g.position.set(p.x, 0, p.z);
  return { group: g, orb, shell, ring };
}

// ───────────── bonus crates and HP barriers ─────────────
export function buildCrate(c) {
  const col = c.big ? '#8b4dff' : '#2fbf5a';
  const g = new THREE.Group();
  const hgt = c.big ? 1.35 : 0.95;
  const box = mesh(new THREE.BoxGeometry(c.w, hgt, c.d), std({ color: col, roughness: 0.45, emissive: col, emissiveIntensity: 0.12 }), g, 0, hgt / 2, 0);
  const label = makeLabel(`+${c.value}`, { w: 256, h: 128 });
  const top = mesh(new THREE.PlaneGeometry(c.w * 0.95, c.d * 0.68), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }), g, 0, hgt + 0.02, 0, false);
  top.rotation.x = -Math.PI / 2;
  const front = mesh(new THREE.PlaneGeometry(c.w * 0.95, hgt * 0.7), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }), g, 0, hgt / 2, c.d / 2 + 0.01, false);
  void front;
  g.position.set(c.x, 0, c.z);
  return { group: g, box, label, h: hgt };
}

export function buildBarrier(b) {
  const g = new THREE.Group();
  const tape = canvas(128, 32); const tg = tape.getContext('2d');
  tg.fillStyle = '#ffd400'; tg.fillRect(0, 0, 128, 32);
  tg.fillStyle = '#111'; for (let x = -32; x < 160; x += 32) { tg.beginPath(); tg.moveTo(x, 32); tg.lineTo(x + 16, 32); tg.lineTo(x + 32, 0); tg.lineTo(x + 16, 0); tg.fill(); }
  const tapeMat = std({ map: tex(tape, [b.w / 1.2, 1]), roughness: 0.5 });
  const wall = mesh(new THREE.BoxGeometry(b.w, 1.6, 0.9), std({ color: '#4a4f58', roughness: 0.6, metalness: 0.3 }), g, 0, 0.8, 0);
  mesh(new THREE.BoxGeometry(b.w + 0.05, 0.25, 0.95), tapeMat, g, 0, 1.55, 0);
  mesh(new THREE.BoxGeometry(b.w + 0.05, 0.25, 0.95), tapeMat, g, 0, 0.12, 0);
  const label = makeLabel(String(b.hp), { w: 512, h: 160, color: '#ffffff' });
  const lm = mesh(new THREE.PlaneGeometry(b.w * 0.85, 1.1), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }), g, 0, 0.82, 0.47, false);
  lm.renderOrder = 3;
  g.position.set(b.x, 0, b.z);
  return { group: g, wall, label };
}

// ───────────── hazards ─────────────
export function buildHazard(h) {
  const g = new THREE.Group();
  const metal = std({ color: '#c9ced6', roughness: 0.25, metalness: 0.9 });
  const red = std({ color: '#e0343f', roughness: 0.4 });
  if (h.type === 'spinner') {
    mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 14), red, g, 0, 0.55, 0);
    const arm = new THREE.Group();
    arm.position.y = 0.75;
    g.add(arm);
    mesh(new THREE.BoxGeometry(h.len, 0.28, 0.28), metal, arm, 0, 0, 0);
    [-1, 1].forEach((s) => mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), red, arm, s * h.len / 2, 0, 0));
    g.position.set(h.x, 0, h.z);
    return { group: g, arm };
  }
  // saw blade on a rail
  mesh(new THREE.BoxGeometry(LANE_W - 1, 0.12, 0.3), std({ color: '#3a3f48' }), g, 0, 0.06, 0);
  const saw = new THREE.Group();
  g.add(saw);
  const disc = mesh(new THREE.CylinderGeometry(h.r, h.r, 0.12, 24), metal, saw, 0, h.r, 0);
  disc.rotation.x = Math.PI / 2;
  const teeth = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const t = new THREE.ConeGeometry(0.14, 0.32, 4);
    t.rotateZ(-a - Math.PI / 2);
    t.translate(Math.cos(a) * (h.r + 0.1), h.r + Math.sin(a) * (h.r + 0.1), 0);
    teeth.push(t);
  }
  const tm = new THREE.Mesh(mergeSimple(teeth), metal);
  tm.castShadow = true;
  saw.add(tm);
  saw.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 12), red, null, 0, h.r, 0));
  saw.children[saw.children.length - 1].rotation.x = Math.PI / 2;
  g.position.set(0, 0, h.z);
  return { group: g, saw, disc, teethMesh: tm };
}

// ───────────── big creatures: boss and champions ─────────────
// deco (world bosses): { skin, crown, glow } override the skin colour, add a crown and make the skin glow
export function buildBrute(theme, scale, champion = null, deco = null) {
  const g = new THREE.Group();
  const skinCol = champion ? champion.color : deco?.skin || (theme.neon ? '#ff4f7a' : '#ffcf3a');
  const skin = std({ color: skinCol, roughness: 0.5, emissive: deco?.glow ? skinCol : '#000000', emissiveIntensity: deco?.glow ? 0.45 : 0 });
  const skinDk = std({ color: new THREE.Color(skinCol).offsetHSL(0, 0.05, -0.12), roughness: 0.55 });
  const cloth = std({ color: champion ? '#e8ecf4' : '#a8322a', roughness: 0.75 });
  const leather = std({ color: champion ? '#5a6478' : '#4a2e1e', roughness: 0.65 });
  const dark = std({ color: '#141418', roughness: 0.4 });
  const white = std({ color: '#ffffff', roughness: 0.25 });
  const metal = std({ color: champion ? '#d8dde6' : '#9aa0a8', roughness: 0.25, metalness: 0.85 });
  const gold = std({ color: '#ffcf3a', roughness: 0.3, metalness: 0.8 });
  const body = new THREE.Group();
  g.add(body);
  // torso: a pear-shaped body with a round belly, pecs and a navel
  const torso = mesh(new THREE.SphereGeometry(0.75, 28, 20), skin, body, 0, 1.25, 0);
  torso.scale.set(1.25, 1.05, 0.95);
  mesh(new THREE.SphereGeometry(0.55, 20, 14), skin, body, 0, 1.0, -0.22).scale.set(1.15, 0.95, 0.9); // belly
  [-1, 1].forEach((sd) => mesh(new THREE.SphereGeometry(0.32, 16, 12), skin, body, sd * 0.3, 1.55, -0.38).scale.set(1.1, 0.7, 0.6)); // pecs
  if (!champion) mesh(new THREE.SphereGeometry(0.035, 8, 6), skinDk, body, 0, 0.95, -0.72); // navel
  // head: brow ridge, nose, jaw with tusks or a helmet
  const headG = new THREE.Group(); headG.position.set(0, 2.05, -0.05); body.add(headG);
  mesh(new THREE.SphereGeometry(0.5, 24, 18), skin, headG, 0, 0, 0).scale.set(1, 0.95, 0.98);
  mesh(new THREE.SphereGeometry(0.42, 20, 14), skin, headG, 0, -0.18, -0.12).scale.set(1.15, 0.7, 1); // jaw
  mesh(new THREE.SphereGeometry(0.09, 12, 8), skinDk, headG, 0, -0.02, -0.5).scale.set(1.2, 0.9, 1); // nose
  mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), skinDk, headG, 0, 0.18, -0.4).rotation.z = Math.PI / 2; // brow ridge
  [-1, 1].forEach((sd) => {
    mesh(new THREE.SphereGeometry(0.11, 14, 10), white, headG, sd * 0.18, 0.08, -0.4);
    mesh(new THREE.SphereGeometry(0.055, 10, 8), dark, headG, sd * 0.18, 0.08, -0.5);
    mesh(new THREE.SphereGeometry(0.018, 6, 4), white, headG, sd * 0.18 + 0.02, 0.1, -0.545); // eye glint
    const brow = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), dark, headG, sd * 0.18, 0.24, -0.45);
    brow.rotation.z = sd * (champion ? -0.2 : 0.38);
    mesh(new THREE.SphereGeometry(0.1, 12, 8), skin, headG, sd * 0.5, 0.0, 0.0).scale.set(0.4, 1, 0.7); // ears
  });
  // mouth
  const mouth = mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), dark, headG, 0, -0.24, -0.47);
  mouth.rotation.z = Math.PI / 2;
  if (!champion) {
    [-1, 1].forEach((sd) => { const t = mesh(new THREE.ConeGeometry(0.045, 0.16, 10), white, headG, sd * 0.13, -0.17, -0.48); t.rotation.z = sd * -0.15; }); // tusks
    [-1, 1].forEach((sd) => { // curved horns
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sd * 0.32, 0.3, 0), new THREE.Vector3(sd * 0.62, 0.55, 0.05), new THREE.Vector3(sd * 0.55, 0.85, -0.12));
      const horn = new THREE.TubeGeometry(curve, 12, 0.07, 10, false);
      const p = horn.attributes.position; // taper toward the tip
      for (let k = 0; k < p.count; k++) { const seg = Math.floor(k / 11) / 12; const c = curve.getPoint(seg); const f = 1 - seg * 0.85; p.setXYZ(k, c.x + (p.getX(k) - c.x) * f, c.y + (p.getY(k) - c.y) * f, c.z + (p.getZ(k) - c.z) * f); }
      horn.computeVertexNormals();
      mesh(horn, white, headG, 0, 0, 0);
    });
    if (deco?.crown) { // a spiked crown between the horns
      const cm = std({ color: deco.crown, roughness: 0.25, metalness: 0.8, emissive: deco.glow ? deco.crown : '#000000', emissiveIntensity: deco.glow ? 0.8 : 0 });
      const band = mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.2, 18, 1, true), Object.assign(cm, { side: THREE.DoubleSide }), headG, 0, 0.42, 0);
      void band;
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.07, 0.24, 6), cm, headG, Math.cos(a) * 0.38, 0.62, Math.sin(a) * 0.38); }
      mesh(new THREE.OctahedronGeometry(0.09, 0), std({ color: '#ff3b6b', emissive: '#ff3b6b', emissiveIntensity: 0.9 }), headG, 0, 0.45, -0.4);
    }
  } else {
    // knight helmet with a visor slit and a plume
    const helm = mesh(new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), metal, headG, 0, 0.02, 0.0);
    helm.scale.set(1.02, 1.0, 1.02);
    mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), dark, headG, 0, 0.08, -0.52);
    mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 32, Math.PI), gold, headG, 0, 0.02, 0).rotation.x = Math.PI / 2;
    const plume = mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 10), std({ color: '#ff3b4a', roughness: 0.8 }), headG, 0, 0.6, 0.15);
    plume.rotation.x = 1.1;
  }
  // belt with a buckle and a loincloth / tabard
  const belt = mesh(new THREE.TorusGeometry(0.82, 0.08, 10, 32), leather, body, 0, 0.78, 0);
  belt.rotation.x = Math.PI / 2; belt.scale.set(1.12, 0.95, 1);
  mesh(new THREE.BoxGeometry(0.26, 0.2, 0.06), gold, body, 0, 0.78, -0.82);
  mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.55, 16, 1, true, -Math.PI * 0.35, Math.PI * 0.7), Object.assign(cloth.clone(), { side: THREE.DoubleSide }), body, 0, 0.5, 0).rotation.y = Math.PI;
  if (champion) mesh(new THREE.SphereGeometry(0.62, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), metal, body, 0, 1.3, -0.25).scale.set(1.05, 1.1, 0.8); // breastplate
  const arms = [-1, 1].map((sd) => {
    const sh = new THREE.Group();
    sh.position.set(sd * 0.95, 1.65, 0);
    body.add(sh);
    // shoulder pad: spiked iron for the horde, a plate for heroes
    mesh(new THREE.SphereGeometry(0.44, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), champion ? metal : leather, sh, 0, 0.05, 0);
    if (!champion) for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.ConeGeometry(0.06, 0.22, 8), metal, sh, sd * (0.1 + k * 0.08), 0.38 - k * 0.05, -0.15 + k * 0.15); sp.rotation.z = -sd * 0.5; }
    const up = mesh(new THREE.CapsuleGeometry(0.26, 0.45, 6, 14), skin, sh, sd * 0.15, -0.45, -0.1);
    up.rotation.z = sd * 0.25;
    mesh(new THREE.CapsuleGeometry(0.28, 0.25, 6, 14), skin, sh, sd * 0.25, -0.85, -0.22).rotation.x = 0.5; // forearm
    mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 20), champion ? gold : leather, sh, sd * 0.25, -0.95, -0.3).rotation.x = Math.PI / 2 + 0.5; // wristband
    const fist = mesh(new THREE.SphereGeometry(0.36, 16, 12), skin, sh, sd * 0.27, -1.12, -0.36);
    fist.scale.set(1, 0.9, 1.05);
    for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.075, 8, 6), skinDk, sh, sd * 0.27 + (k - 1.5) * 0.11, -1.0, -0.66); // knuckles
    return sh;
  });
  if (champion) { // round shield on the left arm
    const sh = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 28), metal, arms[0], -0.45, -0.8, -0.3);
    sh.rotation.z = Math.PI / 2; sh.rotation.y = 0.3;
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), gold, arms[0], -0.5, -0.8, -0.32).rotation.z = Math.PI / 2;
  }
  const legs = [-1, 1].map((sd) => {
    const l = new THREE.Group();
    l.position.set(sd * 0.42, 0.65, 0);
    g.add(l);
    mesh(new THREE.CapsuleGeometry(0.26, 0.3, 6, 14), skin, l, 0, -0.2, 0);
    const foot = mesh(new THREE.SphereGeometry(0.3, 14, 10), skinDk, l, 0, -0.56, -0.1);
    foot.scale.set(1, 0.55, 1.4);
    for (let k = 0; k < 3; k++) mesh(new THREE.SphereGeometry(0.08, 8, 6), skinDk, l, (k - 1) * 0.12, -0.6, -0.48); // toes
    if (champion) mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.3, 14), metal, l, 0, -0.38, 0); // greaves
    return l;
  });
  g.scale.setScalar(scale);
  const { bar, barFg, label } = hpBar(!!champion);
  bar.position.y = 3.1;
  g.add(bar);
  return { group: g, body, arms, legs, bar, barFg, label };
}

// HP bar with a number, drawn over everything and turned to face the camera by the game
export function hpBar(friendly) {
  const label = makeLabel('', { w: 256, h: 64, size: 0.9 });
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ color: '#2a0d12', depthTest: false }));
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ color: friendly ? '#3edb7a' : '#ff3b4a', depthTest: false }));
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthTest: false }));
  const bar = new THREE.Group();
  bar.add(barBg, barFg, txt);
  txt.position.y = 0.32;
  barBg.renderOrder = 10; barFg.renderOrder = 11; txt.renderOrder = 12;
  return { bar, barFg, label };
}
