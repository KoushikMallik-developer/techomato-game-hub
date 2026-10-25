// Ascendants surface textures, painted on canvases from noise: grass, rock, sand, snow (colour + normal),
// bark, leaves, roof tiles, plaster walls with windows, planks, plus small UI icons for powers.
import * as THREE from 'three';
import { mulberry32 } from './data.js';

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// tileable value-noise fbm
export function fbm(S, seed, oct = 5, freq = 4) {
  const rnd = mulberry32(seed); const out = new Float32Array(S * S);
  let amp = 1; let tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = freq << o; const lat = new Float32Array(f * f);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * f; const y0 = Math.floor(fy); const ty = fy - y0; const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % f) * f; const r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * f; const x0 = Math.floor(fx); const tx = fx - x0; const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % f; const c1 = (x0 + 1) % f;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx; const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * S + x] += (a + (b - a) * sy) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function normalMap(h, S, k) {
  const c = canvas(S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * k; const dy = (H(x, y - 1) - H(x, y + 1)) * k; const l = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}
function paint(S, fn) {
  const c = canvas(S); const g = c.getContext('2d'); const img = g.createImageData(S, S); const col = [0, 0, 0];
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; h[i] = fn(x, y, i, col);
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, h };
}

const cache = {};
export function ground(kind) {
  if (cache[kind]) return cache[kind];
  const S = 512;
  const n = fbm(S, { grass: 3, rock: 5, sand: 7, snow: 9, dirt: 11 }[kind], 6, 4);
  const m = fbm(S, { grass: 4, rock: 6, sand: 8, snow: 10, dirt: 12 }[kind], 3, 16);
  const rnd = mulberry32(kind.length * 977);
  let out;
  if (kind === 'grass') {
    // meadow: blades as short strokes over patchy green/yellow, a few dirt flecks
    const { c, h } = paint(S, (x, y, i, col) => {
      const v = n[i]; const w = m[i];
      const dry = Math.max(0, v - 0.55) * 2.2;
      col[0] = 70 + w * 38 + dry * 60; col[1] = 96 + w * 40 + dry * 18; col[2] = 44 + w * 16;
      return 0.4 + w * 0.3;
    });
    const g = c.getContext('2d');
    for (let k = 0; k < 9000; k++) {
      const x = rnd() * S; const y = rnd() * S; const l = 3 + rnd() * 6; const a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const b = 0.75 + rnd() * 0.5;
      g.strokeStyle = `rgba(${(70 + rnd() * 50) * b | 0},${(120 + rnd() * 60) * b | 0},${(40 + rnd() * 20) * b | 0},0.55)`;
      g.lineWidth = 1 + rnd();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    out = { map: tex(c), normal: normalMap(h, S, 1.5) };
  } else if (kind === 'rock') {
    // layered stone: strata bands, cracks from a ridged field, lichen spots
    const { c, h } = paint(S, (x, y, i, col) => {
      const v = n[i]; const w = m[i];
      const strata = Math.sin((y / S) * Math.PI * 14 + v * 9) * 0.5 + 0.5;
      const crack = Math.abs(v - 0.5) < 0.012 ? 0.45 : 1;
      const lichen = w > 0.68 ? 1 : 0;
      const b = (0.55 + v * 0.45 + strata * 0.1) * crack;
      col[0] = (118 * b) + lichen * 20; col[1] = (112 * b) + lichen * 30; col[2] = (104 * b);
      return v * 0.8 + strata * 0.2 - (crack < 1 ? 0.3 : 0);
    });
    out = { map: tex(c), normal: normalMap(h, S, 4) };
  } else if (kind === 'sand') {
    const { c, h } = paint(S, (x, y, i, col) => {
      const v = n[i]; const w = m[i];
      const ripple = Math.sin((x + v * 60) / S * Math.PI * 40) * 0.5 + 0.5;
      const b = 0.86 + v * 0.18 + ripple * 0.05 + (rnd() - 0.5) * 0.06;
      col[0] = 214 * b; col[1] = 196 * b; col[2] = 156 * b - w * 10;
      return ripple * 0.4 + v * 0.6;
    });
    out = { map: tex(c), normal: normalMap(h, S, 1.6) };
  } else if (kind === 'snow') {
    const { c, h } = paint(S, (x, y, i, col) => {
      const v = n[i]; const b = 0.9 + v * 0.1 + (rnd() - 0.5) * 0.03;
      col[0] = 236 * b; col[1] = 242 * b; col[2] = 250 * b;
      return v;
    });
    out = { map: tex(c), normal: normalMap(h, S, 2) };
  } else { // dirt paths
    const { c, h } = paint(S, (x, y, i, col) => {
      const v = n[i]; const w = m[i]; const pebble = w > 0.72 ? 0.25 : 0;
      const b = 0.7 + v * 0.35 + pebble;
      col[0] = 120 * b; col[1] = 96 * b; col[2] = 70 * b;
      return v + pebble;
    });
    out = { map: tex(c), normal: normalMap(h, S, 2.5) };
  }
  cache[kind] = out;
  return out;
}

export function bark() {
  if (cache.bark) return cache.bark;
  const S = 256; const n = fbm(S, 21, 5, 4);
  const { c, h } = paint(S, (x, y, i, col) => {
    const ridge = Math.abs(Math.sin((x / S) * Math.PI * 16 + n[i] * 8));
    const b = 0.45 + ridge * 0.35 + n[i] * 0.3;
    col[0] = 96 * b; col[1] = 74 * b; col[2] = 56 * b;
    return ridge;
  });
  cache.bark = { map: tex(c), normal: normalMap(h, S, 3) };
  return cache.bark;
}

// leaf cluster card (alpha) for tree foliage
export function leaves(kind = 'oak') {
  const key = `leaf_${kind}`;
  if (cache[key]) return cache[key];
  const S = 256; const c = canvas(S); const g = c.getContext('2d');
  const rnd = mulberry32(kind === 'oak' ? 31 : kind === 'pine' ? 33 : 35);
  // opaque base so foliage reads as dense canopy; strokes and leaves add the texture
  g.fillStyle = kind === 'pine' ? '#5d7d58' : '#6c8c50'; g.fillRect(0, 0, S, S);
  if (kind === 'pine') {
    // needle sprays
    for (let k = 0; k < 900; k++) {
      const x = rnd() * S; const y = rnd() * S; const a = (rnd() - 0.5) * 1.2 + Math.PI / 2;
      const b = 0.6 + rnd() * 0.5;
      g.strokeStyle = `rgba(${70 * b | 0},${(120 + rnd() * 40) * b | 0},${(70 + rnd() * 20) * b | 0},0.9)`;
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
    }
  } else {
    for (let k = 0; k < 520; k++) {
      const x = rnd() * S; const y = rnd() * S;
      const a = rnd() * Math.PI * 2; const l = 9 + rnd() * 8; const b = 0.55 + rnd() * 0.6;
      g.fillStyle = `rgba(${(55 + rnd() * 40) * b | 0},${(95 + rnd() * 50) * b | 0},${(35 + rnd() * 20) * b | 0},1)`;
      g.beginPath(); g.ellipse(x, y, l, l * 0.45, a, 0, Math.PI * 2); g.fill();
    }
  }
  const t = tex(c);
  cache[key] = t;
  return t;
}

// walls: plaster/timber/stone/concrete with windows; one texture = one storey 3 m tall, 4 m wide
export function facade(style) {
  const key = `fac_${style}`;
  if (cache[key]) return cache[key];
  const W = 256; const H = 192; const c = canvas(W, H); const g = c.getContext('2d');
  const rnd = mulberry32(style.length * 131);
  const base = { plaster: '#e7dcc6', timber: '#efe5d0', stone: '#a9a196', concrete: '#bfc2c3', barn: '#8a2f22', hut: '#9a7a52' }[style] || '#ddd';
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 1800; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6); }
  if (style === 'stone') { g.strokeStyle = 'rgba(60,55,50,.55)'; g.lineWidth = 2; for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / 24) % 2 ? 0 : 20; x < W; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); } } }
  if (style === 'timber') { g.fillStyle = '#4a3020'; [[0, 0, W, 10], [0, H - 10, W, 10], [0, 0, 12, H], [W - 12, 0, 12, H], [W / 2 - 6, 0, 12, H]].forEach((r) => g.fillRect(...r)); g.save(); g.translate(W / 4, H / 2); g.rotate(0.6); g.fillRect(-90, -5, 180, 10); g.restore(); }
  if (style === 'barn' || style === 'hut') { for (let x = 0; x < W; x += 16) { g.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.1})`; g.fillRect(x, 0, 2, H); } }
  if (style === 'concrete') { g.strokeStyle = 'rgba(0,0,0,.12)'; for (let y = 48; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  // window with shutters / frame
  const wx = W * 0.5 - 30; const wy = 50;
  g.fillStyle = style === 'concrete' ? '#3b4a55' : '#26323a'; g.fillRect(wx, wy, 60, 74);
  const gr = g.createLinearGradient(wx, wy, wx + 60, wy + 74); gr.addColorStop(0, 'rgba(180,210,230,.55)'); gr.addColorStop(0.5, 'rgba(60,80,100,.2)'); gr.addColorStop(1, 'rgba(160,190,210,.35)');
  g.fillStyle = gr; g.fillRect(wx, wy, 60, 74);
  g.strokeStyle = '#f2efe8'; g.lineWidth = 4; g.strokeRect(wx, wy, 60, 74); g.beginPath(); g.moveTo(wx + 30, wy); g.lineTo(wx + 30, wy + 74); g.moveTo(wx, wy + 37); g.lineTo(wx + 60, wy + 37); g.stroke();
  if (style === 'plaster' || style === 'timber' || style === 'stone') { g.fillStyle = ['#3f6f6a', '#6a3f2a', '#2f4f7a'][Math.floor(rnd() * 3)]; g.fillRect(wx - 22, wy, 20, 74); g.fillRect(wx + 62, wy, 20, 74); g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = wy + 4; y < wy + 74; y += 7) { g.fillRect(wx - 22, y, 20, 2); g.fillRect(wx + 62, y, 20, 2); } }
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(wx - 4, wy + 74, 68, 6); // sill shadow
  // grime at the bottom
  const gg = g.createLinearGradient(0, H - 40, 0, H); gg.addColorStop(0, 'rgba(60,50,40,0)'); gg.addColorStop(1, 'rgba(60,50,40,.35)'); g.fillStyle = gg; g.fillRect(0, H - 40, W, 40);
  const t = tex(c);
  cache[key] = t;
  return t;
}
export function roofTex(kind) {
  const key = `roof_${kind}`;
  if (cache[key]) return cache[key];
  const S = 256; const c = canvas(S); const g = c.getContext('2d'); const rnd = mulberry32(kind.length * 17);
  const base = { tile: [168, 72, 48], slate: [70, 76, 86], thatch: [176, 146, 90], metal: [120, 126, 130] }[kind] || [160, 70, 50];
  for (let y = 0; y < S; y += 16) {
    for (let x = (y / 16) % 2 ? -12 : 0; x < S; x += 24) {
      const b = 0.75 + rnd() * 0.35;
      g.fillStyle = `rgb(${base[0] * b | 0},${base[1] * b | 0},${base[2] * b | 0})`;
      if (kind === 'thatch') { for (let k = 0; k < 6; k++) g.fillRect(x + rnd() * 24, y, 2, 16); } else if (kind === 'metal') g.fillRect(x, y, 22, 16);
      else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y); g.lineTo(x + 24, y + 12); g.quadraticCurveTo(x + 12, y + 18, x, y + 12); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 14, S, 2);
  }
  const t = tex(c); cache[key] = t; return t;
}
export function planks() {
  if (cache.planks) return cache.planks;
  const S = 256; const n = fbm(S, 41, 4, 4); const rnd = mulberry32(5);
  const { c } = paint(S, (x, y, i, col) => {
    const row = Math.floor(y / 32); const b = 0.65 + ((row * 37) % 7) / 20 + Math.sin((x + n[i] * 50 + row * 70) * 0.25) * 0.05;
    const gap = y % 32 < 2 ? 0.35 : 1;
    col[0] = 150 * b * gap; col[1] = 112 * b * gap; col[2] = 76 * b * gap;
    return b;
  });
  void rnd;
  cache.planks = tex(c);
  return cache.planks;
}

// soft round particle / glow sprite
export function glowTex() {
  if (cache.glow) return cache.glow;
  const S = 64; const c = canvas(S); const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}
export function smokeTex() {
  if (cache.smoke) return cache.smoke;
  const S = 128; const n = fbm(S, 77, 5, 4); const c = canvas(S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const a = Math.max(0, 1 - d) ** 1.5 * (0.5 + n[i] * 0.9);
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  cache.smoke = new THREE.CanvasTexture(c);
  return cache.smoke;
}

// a cluster of leaves with transparent gaps (for canopy edge cards)
export function leafCard() {
  if (cache.leafCard) return cache.leafCard;
  const S = 128; const c = canvas(S); const g = c.getContext('2d'); const rnd = mulberry32(91);
  g.clearRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {
    const a = rnd() * Math.PI * 2; const r = Math.sqrt(rnd()) * S * 0.42;
    const x = S / 2 + Math.cos(a) * r; const y = S / 2 + Math.sin(a) * r; const l = 6 + rnd() * 6; const b = 0.6 + rnd() * 0.6;
    g.fillStyle = `rgb(${(70 + rnd() * 40) * b | 0},${(110 + rnd() * 50) * b | 0},${(40 + rnd() * 20) * b | 0})`;
    g.beginPath(); g.ellipse(x, y, l, l * 0.45, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  cache.leafCard = tex(c);
  return cache.leafCard;
}
