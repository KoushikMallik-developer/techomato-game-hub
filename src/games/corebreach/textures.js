// Core Breach materials: hand-painted-looking surfaces generated on canvases (colour + normal maps).
import * as THREE from 'three';
import { mulberry32 } from './data.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

// normal map from a height canvas (grey = height)
function normalFrom(hc, strength = 2) {
  const w = hc.width; const h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

// ── pixel-level helpers for the high-detail surfaces ──
// tileable value-noise fBm field in [0,1]
function fbmField(S, seed, octaves = 5, freq = 4) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(S * S);
  let amp = 1; let tot = 0;
  for (let o = 0; o < octaves; o++) {
    const f = freq << o;
    const lat = new Float32Array(f * f);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * f; const y0 = Math.floor(fy); const ty = fy - y0; const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % f) * f; const r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * f; const x0 = Math.floor(fx); const tx = fx - x0; const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % f; const c1 = (x0 + 1) % f;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * S + x] += (a + (b - a) * sy) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

// paint RGB from a per-pixel function into a canvas, and a height field into another
function paint(S, fn) {
  const c = canvas(S, S); const hc = canvas(S, S);
  const g = c.getContext('2d'); const hg = hc.getContext('2d');
  const img = g.createImageData(S, S); const himg = hg.createImageData(S, S);
  const col = [0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const h = fn(x, y, i, col);
    const k = i * 4;
    img.data[k] = Math.max(0, Math.min(255, col[0])); img.data[k + 1] = Math.max(0, Math.min(255, col[1])); img.data[k + 2] = Math.max(0, Math.min(255, col[2])); img.data[k + 3] = 255;
    const hv = Math.max(0, Math.min(255, h * 255));
    himg.data[k] = hv; himg.data[k + 1] = hv; himg.data[k + 2] = hv; himg.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0);
  return { c, hc, g, hg };
}

// tileable jittered-grid Voronoi: per pixel the nearest cell id, its distance and the edge distance
function voronoi(S, n, seed, jitter = 0.8) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + 0.5 + (rnd() - 0.5) * jitter) / n, (j + 0.5 + (rnd() - 0.5) * jitter) / n]);
  const id = new Int32Array(S * S); const edge = new Float32Array(S * S); const d1 = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S; const v = y / S;
    const ci = Math.floor(u * n); const cj = Math.floor(v * n);
    let b1 = 9; let b2 = 9; let bi = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = ((ci + di) % n + n) % n; const jj = ((cj + dj) % n + n) % n;
      const p = pts[jj * n + ii];
      // nearest copy of the point across the tile edges
      let dx = p[0] - u; let dy = p[1] - v;
      dx -= Math.round(dx); dy -= Math.round(dy);
      const d = Math.hypot(dx, dy);
      if (d < b1) { b2 = b1; b1 = d; bi = jj * n + ii; } else if (d < b2 && jj * n + ii !== bi) b2 = d;
    }
    const k = y * S + x;
    id[k] = bi; d1[k] = b1 * n; edge[k] = (b2 - b1) * n;
  }
  return { id, edge, d1, count: n * n };
}

function speckle(g, w, h, n, rnd, cols, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

function blotches(g, w, h, n, rnd, col, r = [20, 70]) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w; const y = rnd() * h; const rr = r[0] + rnd() * (r[1] - r[0]);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

// stucco wall: lime plaster with soft tonal variation, fine trowel grain, a few hairline cracks and
// small patches where the plaster has flaked off to show the stone underneath
export function plaster(seed = 1, base = [233, 220, 198]) {
  const S = 512;
  const rnd = mulberry32(seed);
  const low = fbmField(S, seed * 7 + 1, 4, 2);
  const hi = fbmField(S, seed * 7 + 2, 4, 16);
  const mid = fbmField(S, seed * 7 + 3, 3, 6);
  const { c, hc, g, hg } = paint(S, (x, y, i, col) => {
    const t = 1 + (low[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.08 + (hi[i] - 0.5) * 0.07;
    // patches of bare stone where mid-frequency noise peaks
    const chip = mid[i] > 0.79 && low[i] > 0.6 && hi[i] > 0.42;
    if (chip) {
      const s = 0.86 + (hi[i] - 0.5) * 0.2;
      col[0] = 200 * s; col[1] = 180 * s; col[2] = 150 * s;
      return 0.3 + hi[i] * 0.2;
    }
    col[0] = base[0] * t; col[1] = base[1] * t; col[2] = base[2] * t * 0.99;
    return 0.55 + (hi[i] - 0.5) * 0.5 + (mid[i] - 0.5) * 0.2;
  });
  g.strokeStyle = 'rgba(110,90,70,0.25)'; hg.strokeStyle = '#5a5a5a';
  for (let k = 0; k < 3; k++) {
    let x = rnd() * S; let y = rnd() * S;
    g.lineWidth = hg.lineWidth = 1;
    g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let st = 0; st < 8; st++) { x += (rnd() - 0.5) * 24; y += rnd() * 18; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2.2), false) };
}

// cut stone blocks (wall caps, pillars, plaza borders)
export function stone(seed = 2, base = '#cbbfa8') {
  const S = 512;
  const rnd = mulberry32(seed);
  const c = canvas(S, S); const g = c.getContext('2d');
  const hc = canvas(S, S); const hg = hc.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#202020'; hg.fillRect(0, 0, S, S);
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = (r * S) / rows;
    let x = r % 2 ? -S / 6 : 0;
    while (x < S) {
      const w = S / 3 + (rnd() - 0.5) * 60;
      const v = 0.85 + rnd() * 0.25;
      g.fillStyle = `rgba(${Math.round(203 * v)},${Math.round(191 * v)},${Math.round(168 * v)},1)`;
      g.fillRect(x + 3, y + 3, w - 6, S / rows - 6);
      hg.fillStyle = `rgb(${150 + rnd() * 40 | 0},${150 + rnd() * 40 | 0},${150 + rnd() * 40 | 0})`;
      hg.fillRect(x + 4, y + 4, w - 8, S / rows - 8);
      x += w;
    }
  }
  speckle(g, S, S, 7000, rnd, ['rgba(80,70,55,0.18)', 'rgba(255,255,255,0.18)']);
  speckle(hg, S, S, 8000, rnd, ['#909090', '#b0b0b0']);
  return { map: tex(c), normalMap: tex(normalFrom(hc, 3), false) };
}

// square floor tiles: per-tile colour, worn edges, recessed grout (6 x 6 per texture)
export function tiles(seed = 3, cols = ['#b9a58a', '#c7b497', '#ad9a80']) {
  const S = 512;
  const rnd = mulberry32(seed);
  const n = 8; const t = S / n;
  const pal = cols.map((h) => new THREE.Color(h));
  const tileCol = Array.from({ length: n * n }, () => { const p = pal[Math.floor(rnd() * pal.length)]; const v = 0.9 + rnd() * 0.18; return [p.r * 255 * v, p.g * 255 * v, p.b * 255 * v]; });
  const hi = fbmField(S, seed * 5 + 1, 4, 16);
  const low = fbmField(S, seed * 5 + 2, 3, 3);
  const { c, hc } = paint(S, (x, y, i, col) => {
    const ti = Math.floor(x / t); const tj = Math.floor(y / t);
    const lx = x - ti * t; const ly = y - tj * t;
    const e = Math.min(lx, ly, t - lx, t - ly);
    const grout = e < 1.6;
    if (grout) { const v = 0.55 + hi[i] * 0.1; col[0] = 150 * v + 50; col[1] = 138 * v + 45; col[2] = 120 * v + 40; return 0.2; }
    const tc = tileCol[tj * n + ti];
    const wear = Math.min(1, e / 9);
    const k = (0.9 + 0.1 * wear) * (1 + (hi[i] - 0.5) * 0.1 + (low[i] - 0.5) * 0.12);
    col[0] = tc[0] * k; col[1] = tc[1] * k; col[2] = tc[2] * k;
    return 0.55 + 0.35 * wear + (hi[i] - 0.5) * 0.15;
  });
  return { map: tex(c), normalMap: tex(normalFrom(hc, 1.4), false) };
}

// cobbled plaza: rounded irregular stones (tileable Voronoi) with dark joints
export function slabs(seed = 4, cols = ['#c4b59b', '#b6a68c', '#cdbfa6', '#a9987f']) {
  const S = 512;
  const rnd = mulberry32(seed);
  const V = voronoi(S, 9, seed * 3 + 1, 0.75);
  const pal = cols.map((h) => new THREE.Color(h));
  const cc = Array.from({ length: V.count }, () => { const p = pal[Math.floor(rnd() * pal.length)]; const v = 0.88 + rnd() * 0.2; return [p.r * 255 * v, p.g * 255 * v, p.b * 255 * v]; });
  const hi = fbmField(S, seed * 3 + 2, 4, 16);
  const low = fbmField(S, seed * 3 + 3, 3, 3);
  const { c, hc } = paint(S, (x, y, i, col) => {
    const e = V.edge[i];
    if (e < 0.07) { const v = 70 + hi[i] * 30; col[0] = v; col[1] = v * 0.92; col[2] = v * 0.82; return 0.05; }
    const cl = cc[V.id[i]];
    const dome = Math.min(1, (e - 0.07) / 0.35);
    const k = (0.78 + 0.22 * Math.sqrt(dome)) * (1 + (hi[i] - 0.5) * 0.14 + (low[i] - 0.5) * 0.16);
    col[0] = cl[0] * k; col[1] = cl[1] * k; col[2] = cl[2] * k;
    return 0.35 + 0.55 * Math.sqrt(dome) + (hi[i] - 0.5) * 0.12;
  });
  return { map: tex(c), normalMap: tex(normalFrom(hc, 3.2), false) };
}

// packed sand / dirt with pebbles
export function sand(seed = 5) {
  const S = 512;
  const rnd = mulberry32(seed);
  const c = canvas(S, S); const g = c.getContext('2d');
  const hc = canvas(S, S); const hg = hc.getContext('2d');
  g.fillStyle = '#cdb48b'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  blotches(g, S, S, 50, rnd, 'rgba(160,130,90,0.3)', [20, 80]);
  blotches(g, S, S, 30, rnd, 'rgba(240,220,180,0.3)', [20, 70]);
  speckle(g, S, S, 16000, rnd, ['rgba(120,95,65,0.4)', 'rgba(250,240,220,0.4)'], [1, 2.5]);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S; const y = rnd() * S; const r = 1.5 + rnd() * 3.5;
    const v = 120 + rnd() * 80;
    g.fillStyle = `rgb(${v},${v * 0.9 | 0},${v * 0.75 | 0})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    hg.fillStyle = '#d0d0d0'; hg.beginPath(); hg.arc(x, y, r, 0, Math.PI * 2); hg.fill();
  }
  speckle(hg, S, S, 20000, rnd, ['#707070', '#909090']);
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2), false) };
}

// painted metal panels with rivets (doors, structures)
export function metal(seed = 6, base = '#2f8a8a') {
  const S = 256;
  const rnd = mulberry32(seed);
  const c = canvas(S, S); const g = c.getContext('2d');
  const hc = canvas(S, S); const hg = hc.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; hg.strokeStyle = '#303030';
  g.lineWidth = hg.lineWidth = 3;
  [0, S / 2].forEach((y) => { g.strokeRect(2, y + 2, S - 4, S / 2 - 4); hg.strokeRect(2, y + 2, S - 4, S / 2 - 4); });
  for (let k = 0; k < 16; k++) {
    const x = 10 + (k % 8) * ((S - 20) / 7); const y = k < 8 ? 10 : S - 10;
    hg.fillStyle = '#d0d0d0'; hg.beginPath(); hg.arc(x, y, 3, 0, 7); hg.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
  }
  blotches(g, S, S, 12, rnd, 'rgba(0,0,0,0.12)', [10, 40]);
  speckle(g, S, S, 3000, rnd, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.15)']);
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2.5), false) };
}

// wooden supply crate (one crate per texture, planks + metal corners)
export function crate(seed = 7) {
  const S = 256;
  const rnd = mulberry32(seed);
  const c = canvas(S, S); const g = c.getContext('2d');
  const hc = canvas(S, S); const hg = hc.getContext('2d');
  g.fillStyle = '#9a6b3c'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    const v = 0.85 + rnd() * 0.25;
    g.fillStyle = `rgb(${Math.round(160 * v)},${Math.round(112 * v)},${Math.round(64 * v)})`;
    g.fillRect(0, y + 1, S, 30);
    hg.fillStyle = '#9a9a9a'; hg.fillRect(0, y + 2, S, 28);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(70,40,20,0.25)'; g.fillRect(rnd() * S, y + 4 + rnd() * 22, 20 + rnd() * 50, 1.5); }
  }
  // frame and diagonal brace
  g.fillStyle = '#7a4f2a'; hg.fillStyle = '#c8c8c8';
  [[0, 0, S, 22], [0, S - 22, S, 22], [0, 0, 22, S], [S - 22, 0, 22, S]].forEach((r) => { g.fillRect(...r); hg.fillRect(...r); });
  g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI / 4); g.fillRect(-S * 0.7, -10, S * 1.4, 20); g.restore();
  hg.save(); hg.translate(S / 2, S / 2); hg.rotate(Math.PI / 4); hg.fillRect(-S * 0.7, -10, S * 1.4, 20); hg.restore();
  g.fillStyle = '#5a5f66';
  [[0, 0], [S - 30, 0], [0, S - 30], [S - 30, S - 30]].forEach(([x, y]) => g.fillRect(x, y, 30, 30));
  return { map: tex(c), normalMap: tex(normalFrom(hc, 3), false) };
}

// painted shipping-style cargo box with stripes
export function cargo(seed = 8, base = '#d0662f') {
  const S = 256;
  const rnd = mulberry32(seed);
  const c = canvas(S, S); const g = c.getContext('2d');
  const hc = canvas(S, S); const hg = hc.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 5, S);
    hg.fillStyle = '#606060'; hg.fillRect(x, 0, 5, S);
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, S * 0.72, S, 10);
  g.fillStyle = 'rgba(30,30,30,0.6)'; g.font = 'bold 34px sans-serif'; g.fillText('CB-7', 18, 60);
  blotches(g, S, S, 10, rnd, 'rgba(60,30,10,0.18)', [10, 40]);
  return { map: tex(c), normalMap: tex(normalFrom(hc, 2), false) };
}

// big painted site letter for walls
export function letter(ch, color = '#ffffff') {
  const c = canvas(256, 256); const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = color;
  g.font = 'bold 220px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = 0.9;
  g.fillText(ch, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a palm frond / leaf card with alpha
export function frond() {
  const c = canvas(64, 256); const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  g.strokeStyle = '#6b7a3a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke();
  for (let y = 250; y > 6; y -= 5) {
    const len = 30 * Math.sin((y / 256) * Math.PI * 0.95 + 0.1);
    for (const s of [-1, 1]) {
      const v = 120 + Math.random() * 60;
      g.strokeStyle = `rgb(${v * 0.6 | 0},${v | 0},${v * 0.45 | 0})`;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 + s * len, y - 12); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── facade decoration ──
// shuttered window with a stone surround (1 x 1.4 m), dark glass with a sky reflection
export function windowTex(seed = 11, shutter = '#3f6f6a') {
  const rnd = mulberry32(seed);
  const W = 128; const H = 180;
  const c = canvas(W, H); const g = c.getContext('2d');
  g.fillStyle = '#d8ccb4'; g.fillRect(0, 0, W, H); // stone surround
  speckle(g, W, H, 900, rnd, ['rgba(120,100,80,0.25)', 'rgba(255,255,255,0.25)']);
  const gx = 30; const gy = 18; const gw = W - 60; const gh = H - 42;
  const gr = g.createLinearGradient(0, gy, 0, gy + gh);
  gr.addColorStop(0, '#6e8da6'); gr.addColorStop(0.45, '#2d3e4e'); gr.addColorStop(1, '#151d26');
  g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath(); g.moveTo(gx, gy + gh * 0.7); g.lineTo(gx + gw * 0.6, gy); g.lineTo(gx + gw * 0.85, gy); g.lineTo(gx, gy + gh); g.fill();
  g.strokeStyle = '#e9e2d2'; g.lineWidth = 4; g.strokeRect(gx, gy, gw, gh);
  g.beginPath(); g.moveTo(W / 2, gy); g.lineTo(W / 2, gy + gh); g.moveTo(gx, gy + gh * 0.45); g.lineTo(gx + gw, gy + gh * 0.45); g.stroke();
  // louvred shutters either side
  for (const x0 of [4, W - 28]) {
    g.fillStyle = shutter; g.fillRect(x0, gy - 4, 24, gh + 8);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5;
    for (let y = gy; y < gy + gh; y += 6) { g.beginPath(); g.moveTo(x0 + 2, y); g.lineTo(x0 + 22, y + 2); g.stroke(); }
  }
  g.fillStyle = '#bfb39b'; g.fillRect(gx - 6, gy + gh, gw + 12, 10); // sill
  const t = tex(c, true, false);
  return t;
}

export function doorTex(seed = 12, paint = '#6a3f2a') {
  const rnd = mulberry32(seed);
  const W = 128; const H = 230;
  const c = canvas(W, H); const g = c.getContext('2d');
  g.fillStyle = '#cdbfa5'; g.fillRect(0, 0, W, H);
  g.fillStyle = paint; g.fillRect(12, 14, W - 24, H - 14);
  for (let x = 12; x < W - 12; x += 13) { g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.1})`; g.fillRect(x, 14, 2, H - 14); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  g.strokeRect(24, 30, W - 48, 70); g.strokeRect(24, 120, W - 48, 90);
  speckle(g, W, H, 600, rnd, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)']);
  g.fillStyle = '#c8a24a'; g.beginPath(); g.arc(W - 30, 130, 5, 0, 7); g.fill();
  return tex(c, true, false);
}

// a shop sign with an invented name
export function signTex(text, bg = '#1f4e5f', fg = '#f4ead2') {
  const c = canvas(512, 96); const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(8, 8, 496, 80);
  g.fillStyle = fg; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  return tex(c, true, false);
}

// ivy hanging from wall tops (alpha cut-out)
export function ivyTex(seed = 13) {
  const rnd = mulberry32(seed);
  const c = canvas(128, 256); const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  for (let s = 0; s < 7; s++) {
    let x = 10 + rnd() * 108; let y = 0;
    const len = 120 + rnd() * 130;
    while (y < len) {
      x += (rnd() - 0.5) * 6; y += 4;
      const v = 70 + rnd() * 70;
      g.fillStyle = `rgb(${v * 0.45 | 0},${v | 0},${v * 0.35 | 0})`;
      g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 14, y, 5 + rnd() * 4, 3.5 + rnd() * 3, rnd() * 3, 0, 7); g.fill();
    }
  }
  return tex(c, true, false);
}

export function ventTex() {
  const c = canvas(128, 80); const g = c.getContext('2d');
  g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#5a5e63';
  for (let y = 10; y < 70; y += 6) g.fillRect(10, y, 70, 3);
  g.beginPath(); g.arc(104, 40, 18, 0, 7); g.fill();
  g.strokeStyle = '#2f3236'; g.lineWidth = 3;
  for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(104, 40); g.lineTo(104 + Math.cos(a) * 16, 40 + Math.sin(a) * 16); g.stroke(); }
  return tex(c, true, false);
}

// weathered pine planking: long grain, knots, darker end grain near the edges (1 m tile, planks run along u)
export function wood(seed = 31, base = [168, 122, 74]) {
  const S = 512;
  const n = fbmField(S, seed, 5, 4);
  const rnd = mulberry32(seed + 1);
  const knots = Array.from({ length: 7 }, () => [rnd() * S, rnd() * S, 6 + rnd() * 10]);
  const { c, hc } = paint(S, (x, y, i, col) => {
    // grain: stretched noise along x, wavy rings around knots
    let g = Math.sin((y + n[i] * 40) * 0.55) * 0.5 + 0.5;
    for (const [kx, ky, kr] of knots) {
      let dx = x - kx; dx -= Math.round(dx / S) * S; let dy = y - ky; dy -= Math.round(dy / S) * S;
      const d = Math.hypot(dx * 0.35, dy);
      if (d < kr * 3) g = g * 0.6 + (Math.sin(d * 1.3) * 0.5 + 0.5) * 0.4 * (1 - d / (kr * 3)) + 0.2 * (d < kr ? 1 - d / kr : 0);
    }
    const v = 0.78 + g * 0.16 + (n[i] - 0.5) * 0.3;
    col[0] = base[0] * v; col[1] = base[1] * v; col[2] = base[2] * v;
    return 0.5 + (g - 0.5) * 0.35;
  });
  return { map: tex(c), normalMap: tex(normalFrom(hc, 1.6), false) };
}
