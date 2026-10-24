// Midnight Pursuit: the city's 3D world, built from the road network in city.js: terrain and sea,
// roads with real junctions, sidewalks and markings, buildings along every street frontage (PBR
// facades, storefronts, rooftops), houses, warehouses and the port, street furniture, traffic lights,
// parked cars and neon, plus collisions, ground height and the map image.
import * as THREE from 'three';
import * as PROPS from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, mulberry32 } from './data.js';
import { City, MAP, SEA_Y, T_EXT, T_RES, PARKS, SegIndex, fbm } from './city.js';
import { parkedCarGeometries } from './cars3d.js';

export const MAP_HALF = MAP + 60;
export const MAP_PX = 1024;
const SIDEWALK_H = 0.17;
const FLOOR = 3.5; // metres per storey; facade textures hold 8 storeys x 8 bays
const TEX_SPAN = FLOOR * 8;
const STORE_H = 5;

// ───────────── texture helpers ─────────────
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

export function canvasTexture(w, h, draw, srgb = true) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return toTexture(c, srgb, false);
}

function normalFromHeight(hc, strength) {
  const w = hc.width;
  const h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function noise(g, w, h, rnd, amount, size = 2, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd() * 1.5})`;
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
}

// One facade = albedo + emissive (lit windows) + roughness + metalness + normal, same layout.
// The texture covers 8 storeys x 8 bays (28 m x 28 m). Windows are drawn with a recessed reveal
// (shadowed lintel and jamb), reflective glass, frames, sills and drip stains; then the wall gets
// weathering streaks. Detail maps are drawn at the same layout and scaled down.
function facadeTextures(type, seed, S = 1024) {
  const rnd = mulberry32(seed);
  const D = 512; // detail map size
  const k = S / 512; // pixels per 512-unit
  const cell = S / 8;
  const al = makeCanvas(S, S);
  const em = makeCanvas(S, S);
  const ro = makeCanvas(S, S);
  const me = makeCanvas(S, S);
  const he = makeCanvas(S, S);
  const A = al.getContext('2d');
  const E = em.getContext('2d');
  const R = ro.getContext('2d');
  const M = me.getContext('2d');
  const Hh = he.getContext('2d');
  E.fillStyle = '#000';
  E.fillRect(0, 0, S, S);
  const fill = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const gray = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
  const rgb = (c, f = 1) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
  const litColors = ['#ffd9a0', '#ffe7c2', '#fff3dc', '#cfe2ff', '#ffc77a', '#e9f1ff'];
  const lit = (x, y, w, h, p = 0.38) => {
    if (rnd() > p) return;
    const c = litColors[Math.floor(rnd() * litColors.length)];
    const grd = E.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, c);
    grd.addColorStop(1, 'rgba(60,40,20,1)');
    E.fillStyle = grd;
    E.globalAlpha = 0.55 + rnd() * 0.45;
    E.fillRect(x, y, w, h);
    E.globalAlpha = 1;
    if (rnd() < 0.5) { E.fillStyle = 'rgba(255,255,255,0.7)'; E.fillRect(x + 2 * k, y + 2 * k, w - 4 * k, 3 * k); }
    if (rnd() < 0.3) { E.fillStyle = 'rgba(0,0,0,0.6)'; E.fillRect(x, y, w, h * (0.2 + rnd() * 0.5)); }
  };
  // glass pane: sky reflection gradient, occasional blinds or curtains
  const glass = (x, y, w, h, tint = [38, 48, 58], refl = 1) => {
    const g = A.createLinearGradient(x, y, x + w * 0.3, y + h);
    const t = 0.8 + rnd() * 0.45;
    g.addColorStop(0, rgb([tint[0] + 70 * refl, tint[1] + 78 * refl, tint[2] + 86 * refl], t));
    g.addColorStop(0.45, rgb(tint, t));
    g.addColorStop(1, rgb(tint, t * 0.6));
    A.fillStyle = g;
    A.fillRect(x, y, w, h);
    const r = rnd();
    if (r < 0.22) fill(A, ['#cfc6b2', '#b9b3a6', '#e0dccf'][Math.floor(rnd() * 3)], x, y, w, h * (0.15 + rnd() * 0.5)); // blind
    else if (r < 0.32) { const c = ['#7a3b2e', '#3d4f6b', '#8a7a52', '#5a6b4a'][Math.floor(rnd() * 4)]; fill(A, c, x, y, w * 0.22, h); fill(A, c, x + w * 0.78, y, w * 0.22, h); }
    fill(R, gray(12), x, y, w, h);
    fill(M, gray(225), x, y, w, h);
    fill(Hh, gray(50), x, y, w, h);
  };
  // a punched window in a masonry wall
  const punched = (x, y, w, h, wall, frame, opts = {}) => {
    const rv = 5 * k; // reveal depth in pixels
    // reveal: shadowed lintel (top) and jambs
    fill(A, rgb(wall, 0.42), x - rv * 0.4, y - rv * 0.3, w + rv * 0.8, h + rv * 0.3);
    glass(x + rv * 0.6, y + rv, w - rv * 0.6, h - rv, opts.tint, 0.9);
    fill(A, rgb(wall, 0.3), x, y, w, rv); // lintel shadow
    fill(A, rgb(wall, 0.55), x, y, rv * 0.6, h); // left jamb
    fill(Hh, gray(70), x - rv * 0.4, y - rv * 0.3, w + rv * 0.8, h + rv * 0.3);
    lit(x + rv * 0.6, y + rv, w - rv * 0.6, h - rv, opts.lit ?? 0.36);
    // frame and glazing bars
    const fw = 2.2 * k;
    A.fillStyle = frame;
    A.fillRect(x + rv * 0.6, y + rv, w - rv * 0.6, fw);
    A.fillRect(x + rv * 0.6, y + h - fw, w - rv * 0.6, fw);
    A.fillRect(x + rv * 0.6, y + rv, fw, h - rv);
    A.fillRect(x + w - fw, y + rv, fw, h - rv);
    A.fillRect(x + rv * 0.6 + (w - rv * 0.6) / 2 - fw / 2, y + rv, fw, h - rv);
    if (opts.transom) A.fillRect(x + rv * 0.6, y + rv + (h - rv) * 0.3, w - rv * 0.6, fw);
    fill(R, gray(140), x + rv * 0.6, y + rv, w - rv * 0.6, fw);
    // stone sill with a lit top edge, and a drip stain under it
    const sh = 4 * k;
    fill(A, opts.sill || '#cfc8b8', x - 4 * k, y + h, w + 8 * k, sh);
    fill(A, 'rgba(255,255,255,0.25)', x - 4 * k, y + h, w + 8 * k, 1.2 * k);
    fill(A, 'rgba(0,0,0,0.35)', x - 4 * k, y + h + sh, w + 8 * k, 1.5 * k);
    fill(Hh, gray(235), x - 4 * k, y + h, w + 8 * k, sh);
    const stain = A.createLinearGradient(0, y + h + sh, 0, y + h + sh + cell * (0.25 + rnd() * 0.35));
    stain.addColorStop(0, `rgba(25,20,15,${0.18 + rnd() * 0.2})`);
    stain.addColorStop(1, 'rgba(25,20,15,0)');
    A.fillStyle = stain;
    A.fillRect(x + w * 0.1, y + h + sh, w * 0.8, cell * 0.5);
    if (opts.lintel) {
      fill(A, opts.lintel, x - 3 * k, y - 6 * k, w + 6 * k, 5 * k);
      fill(Hh, gray(220), x - 3 * k, y - 6 * k, w + 6 * k, 5 * k);
    }
    if (opts.ac && rnd() < 0.12) {
      // window air-conditioner
      const ax = x + w * 0.2;
      const ay = y + h - h * 0.28;
      fill(A, '#c9c6bd', ax, ay, w * 0.55, h * 0.26);
      fill(A, '#8d8a83', ax, ay + h * 0.13, w * 0.55, 1.5 * k);
      fill(Hh, gray(255), ax, ay, w * 0.55, h * 0.26);
      fill(R, gray(160), ax, ay, w * 0.55, h * 0.26);
    }
  };
  // weathering: vertical rain streaks, soot near the top of each storey, blotches
  const grime = (amount = 1) => {
    for (let i = 0; i < 160 * amount; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = (20 + rnd() * 120) * k;
      const g = A.createLinearGradient(0, y, 0, y + len);
      const a = 0.04 + rnd() * 0.1;
      g.addColorStop(0, `rgba(30,26,22,${a})`);
      g.addColorStop(1, 'rgba(30,26,22,0)');
      A.fillStyle = g;
      A.fillRect(x, y, (1 + rnd() * 5) * k, len);
    }
    for (let i = 0; i < 26 * amount; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = (20 + rnd() * 70) * k;
      const g = A.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.7;
      g.addColorStop(0, dark ? `rgba(20,18,15,${0.05 + rnd() * 0.07})` : `rgba(255,250,235,${0.04 + rnd() * 0.05})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      A.fillStyle = g;
      A.fillRect(x - r, y - r, r * 2, r * 2);
    }
    noise(A, S, S, rnd, 22000 * k, 1.5 * k, 0.07);
  };

  if (type === 'glass') {
    // curtain wall: reflective panels in a mullion grid, opaque spandrels at each floor slab
    const tint = [[22, 40, 52], [30, 46, 48], [34, 38, 48], [20, 34, 44], [40, 44, 40]][Math.floor(rnd() * 5)];
    fill(A, '#2a2f35', 0, 0, S, S);
    fill(R, gray(110), 0, 0, S, S);
    fill(M, gray(200), 0, 0, S, S);
    fill(Hh, gray(200), 0, 0, S, S);
    const cols = 2;
    for (let r = 0; r < 8; r++) {
      const y = r * cell;
      const spand = cell * 0.24;
      fill(A, rgb(tint, 0.55), 0, y + cell - spand, S, spand);
      fill(R, gray(70), 0, y + cell - spand, S, spand);
      for (let c = 0; c < 8 * cols; c++) {
        const x = c * (cell / cols);
        const pw = cell / cols;
        const g = A.createLinearGradient(x, y, x + pw * 0.6, y + cell);
        const kk = 0.75 + rnd() * 0.5;
        g.addColorStop(0, rgb([tint[0] + 90, tint[1] + 100, tint[2] + 110], kk));
        g.addColorStop(0.5, rgb(tint, kk * 1.1));
        g.addColorStop(1, rgb(tint, kk * 0.7));
        A.fillStyle = g;
        A.fillRect(x + 1.5 * k, y + 1.5 * k, pw - 3 * k, cell - spand - 3 * k);
        fill(R, gray(8), x + 1.5 * k, y + 1.5 * k, pw - 3 * k, cell - spand - 3 * k);
        fill(M, gray(240), x + 1.5 * k, y + 1.5 * k, pw - 3 * k, cell - spand - 3 * k);
        fill(Hh, gray(150), x + 1.5 * k, y + 1.5 * k, pw - 3 * k, cell - spand - 3 * k);
        lit(x + 1.5 * k, y + 1.5 * k, pw - 3 * k, cell - spand - 3 * k, 0.32);
        fill(A, '#4a4f56', x, y, 1.5 * k, cell); // mullion
      }
      fill(A, '#555a61', 0, y + cell - spand, S, 1.5 * k);
    }
    noise(A, S, S, rnd, 5000 * k, 1.5 * k, 0.04);
  } else if (type === 'office') {
    // 1960s-70s office block: precast concrete spandrels, ribbon windows with mullions
    const wall = [[176, 172, 160], [190, 184, 170], [146, 150, 154], [196, 190, 178], [160, 150, 136]][Math.floor(rnd() * 5)];
    fill(A, rgb(wall), 0, 0, S, S);
    noise(A, S, S, rnd, 16000 * k, 2 * k, 0.1);
    fill(R, gray(215), 0, 0, S, S);
    fill(M, gray(0), 0, 0, S, S);
    fill(Hh, gray(200), 0, 0, S, S);
    const tint = [[30, 38, 46], [36, 40, 38], [28, 32, 40]][Math.floor(rnd() * 3)];
    for (let r = 0; r < 8; r++) {
      const y = r * cell + cell * 0.14;
      const h = cell * 0.52;
      fill(A, rgb(wall, 0.4), 0, y - 3 * k, S, 4 * k); // shadow under spandrel
      for (let c = 0; c < 16; c++) {
        const x = c * (S / 16);
        glass(x + 2 * k, y, S / 16 - 4 * k, h, tint, 0.8);
        lit(x + 2 * k, y, S / 16 - 4 * k, h, 0.32);
        fill(A, '#3e4248', x, y, 2.5 * k, h); // mullion
        fill(Hh, gray(150), x, y, 2.5 * k, h);
      }
      fill(A, 'rgba(255,255,255,0.22)', 0, y + h, S, 1.5 * k); // spandrel lip
      fill(Hh, gray(240), 0, y + h, S, 3 * k);
      // panel joints in the spandrel
      for (let c = 0; c < 8; c++) fill(A, rgb(wall, 0.75), c * cell, y + h, 1.2 * k, cell - h);
    }
    grime(1.2);
  } else if (type === 'brick') {
    const brick = [[132, 62, 44], [116, 66, 52], [150, 86, 62], [104, 74, 64], [124, 52, 40]][Math.floor(rnd() * 5)];
    const mortar = [168, 158, 144];
    fill(A, rgb(mortar, 0.85), 0, 0, S, S);
    fill(Hh, gray(110), 0, 0, S, S);
    const bh = 3 * k; // ~8 cm course
    const bw = 8 * k;
    for (let y = 0, row = 0; y < S; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S; x += bw) {
        const v = 0.78 + rnd() * 0.38;
        const burnt = rnd() < 0.06 ? 0.62 : 1;
        A.fillStyle = rgb(brick, v * burnt);
        A.fillRect(x + off + 0.6, y + 0.6, bw - 1.2, bh - 1.2);
      }
    }
    fill(Hh, gray(190), 0, 0, S, S);
    fill(R, gray(228), 0, 0, S, S);
    fill(M, gray(0), 0, 0, S, S);
    const lintel = rnd() < 0.5 ? '#d6cfbf' : rgb(brick, 0.7);
    const frame = ['#e8e4da', '#2c2a28', '#4b3b2c', '#3c4a3c'][Math.floor(rnd() * 4)];
    for (let r = 0; r < 8; r++) {
      // a band course every storey
      fill(A, rgb(brick, 0.62), 0, r * cell + cell - 3 * k, S, 2 * k);
      for (let c = 0; c < 8; c++) {
        const w = cell * 0.38;
        const h = cell * 0.56;
        const x = c * cell + (cell - w) / 2;
        const y = r * cell + cell * 0.2;
        punched(x, y, w, h, brick, frame, { lintel, sill: '#cfc8b8', transom: true, ac: true, tint: [34, 40, 46] });
      }
    }
    grime(1.4);
  } else {
    // classic limestone: rusticated courses, pilasters between bays, tall windows with heads
    const stone = [[208, 200, 184], [190, 182, 166], [170, 168, 160], [214, 206, 188], [150, 146, 138]][Math.floor(rnd() * 5)];
    fill(A, rgb(stone), 0, 0, S, S);
    noise(A, S, S, rnd, 18000 * k, 2 * k, 0.09);
    fill(R, gray(200), 0, 0, S, S);
    fill(M, gray(0), 0, 0, S, S);
    fill(Hh, gray(200), 0, 0, S, S);
    for (let y = 0; y < S; y += cell / 5) {
      fill(A, rgb(stone, 0.72), 0, y, S, 1.2 * k);
      fill(Hh, gray(150), 0, y, S, 1.2 * k);
    }
    for (let c = 0; c < 8; c++) {
      // pilaster
      fill(A, rgb(stone, 1.05), c * cell, 0, 7 * k, S);
      fill(A, 'rgba(0,0,0,0.18)', c * cell + 7 * k, 0, 2 * k, S);
      fill(Hh, gray(250), c * cell, 0, 7 * k, S);
    }
    const frame = ['#2b2b2b', '#e6e1d6', '#3a3226'][Math.floor(rnd() * 3)];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const w = cell * 0.42;
        const h = cell * 0.62;
        const x = c * cell + (cell - w) / 2 + 3 * k;
        const y = r * cell + cell * 0.16;
        punched(x, y, w, h, stone, frame, { lintel: rgb(stone, 1.08), sill: rgb(stone, 1.1), transom: rnd() < 0.5, ac: true, tint: [36, 42, 50] });
      }
    }
    grime(1.0);
  }
  const small = (c) => {
    if (c.width === D) return c;
    const o = makeCanvas(D, D);
    o.getContext('2d').drawImage(c, 0, 0, D, D);
    return o;
  };
  return {
    map: toTexture(al, true),
    emissiveMap: toTexture(em, true),
    roughnessMap: toTexture(small(ro), false),
    metalnessMap: toTexture(small(me), false),
    normalMap: toTexture(normalFromHeight(small(he), 3.2), false),
  };
}

// Ground-floor shops: one texture = 4 shop fronts across 28 m, 5 m tall.
const SHOP_NAMES = ['CORNER DELI', 'LUCKY NOODLE', 'METRO PHARMACY', 'BLUE MOON CAFE', "TONY'S PIZZA", 'RIVERSIDE BOOKS', 'NIGHT OWL DINER',
  'FRESH MARKET', 'LAUNDROMAT', 'PAWN & LOAN', 'BARBER SHOP', 'TAILOR', 'DONUTS', 'CHECK CASHING', 'AUTO PARTS', 'SHOE REPAIR', 'JEWELRY',
  'DRY CLEANERS', 'LIQUORS', 'TATTOO', 'HARDWARE', 'ELECTRONICS', 'BAKERY', 'FLOWERS', 'OPTICIAN', 'THAI KITCHEN', 'BURGERS', 'VIDEO GAMES', 'BAIL BONDS', 'DINER'];
function storefrontTextures(seed) {
  const rnd = mulberry32(seed);
  const W = 1024;
  const H = 184;
  const al = makeCanvas(W, H);
  const em = makeCanvas(W, H);
  const A = al.getContext('2d');
  const E = em.getContext('2d');
  E.fillStyle = '#000';
  E.fillRect(0, 0, W, H);
  const signCols = ['#ff4d4d', '#5fd0ff', '#ffc040', '#9cff7a', '#ff8ad8', '#f4f1e8', '#ffd27a'];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let k = 0; k < 4; k++) {
    const x = k * 256;
    const wall = pick(['#3a3530', '#4a4038', '#2e3236', '#5a4c40', '#3c3a36', '#6a5a48']);
    A.fillStyle = wall;
    A.fillRect(x, 0, 256, H);
    noise(A, 256, H, rnd, 900, 2, 0.12);
    // pilasters between shops
    A.fillStyle = '#8f877a';
    A.fillRect(x, 0, 8, H);
    A.fillStyle = 'rgba(0,0,0,0.3)';
    A.fillRect(x + 8, 0, 2, H);
    const name = pick(SHOP_NAMES);
    const col = pick(signCols);
    const style = rnd();
    const fs = name.length > 11 ? 15 : 18;
    if (style < 0.4) {
      // backlit box sign
      A.fillStyle = '#16161a';
      A.fillRect(x + 22, 10, 212, 30);
      A.fillStyle = col;
      A.font = `bold ${fs}px sans-serif`;
      A.textAlign = 'center';
      A.textBaseline = 'middle';
      A.fillText(name, x + 128, 26);
      E.fillStyle = col;
      E.font = `bold ${fs}px sans-serif`;
      E.textAlign = 'center';
      E.textBaseline = 'middle';
      E.fillText(name, x + 128, 26);
    } else if (style < 0.75) {
      // striped fabric awning with the name on its valance
      const c1 = pick(['#7a1f1f', '#1f4a2a', '#1f2f5a', '#5a4a1f', '#3a3a3a']);
      for (let sx = 0; sx < 240; sx += 16) {
        A.fillStyle = (sx / 16) % 2 ? c1 : '#d8d2c2';
        A.fillRect(x + 12 + sx, 8, 16, 30);
      }
      const g = A.createLinearGradient(0, 8, 0, 38);
      g.addColorStop(0, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      A.fillStyle = g;
      A.fillRect(x + 12, 8, 240, 30);
      A.fillStyle = c1;
      A.fillRect(x + 12, 38, 240, 12);
      A.fillStyle = '#f2ede0';
      A.font = 'bold 10px sans-serif';
      A.textAlign = 'center';
      A.textBaseline = 'middle';
      A.fillText(name, x + 132, 44);
    } else {
      // painted lettering on the wall
      A.fillStyle = pick(['#e9e2cf', '#d8b04a', '#c8c8c8']);
      A.font = `bold ${fs + 2}px serif`;
      A.textAlign = 'center';
      A.textBaseline = 'middle';
      A.fillText(name, x + 128, 25);
    }
    // display window and door, with frames and a stall riser
    const interior = pick(['#f2c27a', '#ffe1b0', '#d8ecff', '#ffd08a', '#e8f0e0']);
    const wy = 58;
    const wh = 98;
    A.fillStyle = '#22272c';
    A.fillRect(x + 18, wy, 150, wh);
    A.fillRect(x + 182, wy - 6, 58, wh + 26);
    const gl = A.createLinearGradient(x + 18, wy, x + 120, wy + wh);
    gl.addColorStop(0, 'rgba(160,175,190,0.55)');
    gl.addColorStop(0.5, 'rgba(60,70,80,0.2)');
    gl.addColorStop(1, 'rgba(20,24,28,0.1)');
    A.fillStyle = gl;
    A.fillRect(x + 18, wy, 150, wh);
    const g = E.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, interior);
    g.addColorStop(1, '#3a2a18');
    E.fillStyle = g;
    E.fillRect(x + 18, wy, 150, wh);
    E.globalAlpha = 0.55;
    E.fillRect(x + 186, wy, 50, wh + 16);
    E.globalAlpha = 1;
    // goods / shelves / people inside
    E.fillStyle = 'rgba(0,0,0,0.5)';
    for (let s2 = 0; s2 < 4; s2++) E.fillRect(x + 24 + s2 * 36, wy + 40 + rnd() * 30, 22 + rnd() * 10, 60);
    E.fillStyle = 'rgba(0,0,0,0.35)';
    E.fillRect(x + 18, wy + 30, 150, 3);
    A.fillStyle = '#a7aaae';
    [[x + 16, wy - 2, 154, 3], [x + 16, wy + wh, 154, 3], [x + 92, wy, 3, wh], [x + 180, wy - 8, 62, 3], [x + 180, wy - 6, 3, wh + 26], [x + 239, wy - 6, 3, wh + 26]].forEach((r) => A.fillRect(...r));
    A.fillStyle = '#5c544a';
    A.fillRect(x + 16, wy + wh + 3, 154, H - wy - wh - 3);
    A.fillStyle = 'rgba(0,0,0,0.35)';
    A.fillRect(x + 16, H - 6, 240, 6);
    if (rnd() < 0.3) {
      // roller shutter half down
      A.fillStyle = '#7d8186';
      A.fillRect(x + 18, wy, 150, wh * (0.3 + rnd() * 0.4));
      for (let yy = wy; yy < wy + wh * 0.6; yy += 4) { A.fillStyle = 'rgba(0,0,0,0.25)'; A.fillRect(x + 18, yy, 150, 1); }
    }
  }
  return { map: toTexture(al, true), emissiveMap: toTexture(em, true) };
}

function groundTextures(seed) {
  const rnd = mulberry32(seed);
  const S = 512;
  const al = makeCanvas(S, S);
  const he = makeCanvas(S, S);
  const ro = makeCanvas(S, S);
  const A = al.getContext('2d');
  const Hc = he.getContext('2d');
  const R = ro.getContext('2d');
  A.fillStyle = '#34363b';
  A.fillRect(0, 0, S, S);
  Hc.fillStyle = '#808080';
  Hc.fillRect(0, 0, S, S);
  R.fillStyle = 'rgb(225,225,225)';
  R.fillRect(0, 0, S, S);
  for (let i = 0; i < 60000; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const v = 30 + rnd() * 70;
    A.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rnd() * 0.4})`;
    A.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    const hv = 90 + rnd() * 120;
    Hc.fillStyle = `rgb(${hv},${hv},${hv})`;
    Hc.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // patches, stains and cracks
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 20 + rnd() * 70;
    const g = A.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(10,10,12,${0.15 + rnd() * 0.2})`);
    g.addColorStop(1, 'rgba(10,10,12,0)');
    A.fillStyle = g;
    A.fillRect(x - r, y - r, r * 2, r * 2);
    const rg = R.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(150,150,150,0.6)');
    rg.addColorStop(1, 'rgba(150,150,150,0)');
    R.fillStyle = rg;
    R.fillRect(x - r, y - r, r * 2, r * 2);
  }
  A.strokeStyle = 'rgba(15,15,17,0.7)';
  Hc.strokeStyle = 'rgb(20,20,20)';
  for (let i = 0; i < 10; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    A.lineWidth = Hc.lineWidth = 1 + rnd();
    A.beginPath();
    Hc.beginPath();
    A.moveTo(x, y);
    Hc.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 30;
      y += (rnd() - 0.5) * 30;
      A.lineTo(x, y);
      Hc.lineTo(x, y);
    }
    A.stroke();
    Hc.stroke();
  }
  return { map: toTexture(al, true), normalMap: toTexture(normalFromHeight(he, 1.4), false), roughnessMap: toTexture(ro, false) };
}

function pavingTextures(seed) {
  const rnd = mulberry32(seed);
  const S = 256;
  const al = makeCanvas(S, S);
  const he = makeCanvas(S, S);
  const A = al.getContext('2d');
  const Hc = he.getContext('2d');
  A.fillStyle = '#7b7c7e';
  A.fillRect(0, 0, S, S);
  Hc.fillStyle = '#333';
  Hc.fillRect(0, 0, S, S);
  const t = S / 4; // 4 x 4 slabs per texture (0.75 m each over 3 m)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 128 + rnd() * 30;
      A.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      A.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      Hc.fillStyle = '#c8c8c8';
      Hc.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
  noise(A, S, S, rnd, 5000, 2, 0.12);
  return { map: toTexture(al, true), normalMap: toTexture(normalFromHeight(he, 2.5), false) };
}

function grassTexture(seed) {
  const rnd = mulberry32(seed);
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#35552c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(80,120,50,${rnd() * 0.5})` : `rgba(25,45,20,${rnd() * 0.5})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3);
  }
  return toTexture(c, true);
}

function signTexture(text, color, bg = '#08080a') {
  const c = makeCanvas(512, 160);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 140);
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 84);
  return toTexture(c, true, false);
}

function adTexture(seed) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d');
  const cols = [['#ff3b5c', '#2b0a3d'], ['#00c2ff', '#04243a'], ['#ffb000', '#3a1c00'], ['#7cff6b', '#06301a']][seed % 4];
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, cols[1]);
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = cols[0];
  g.beginPath();
  g.arc(380 + rnd() * 40, 128, 90, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 54px sans-serif';
  g.fillText(['NITRO ENERGY', 'APEX TYRES', 'VOLT MOBILE', 'NOVA AIR'][seed % 4], 30, 110);
  g.font = '28px sans-serif';
  g.fillText(['Feel the rush', 'Grip every corner', 'Faster than ever', 'Fly tonight'][seed % 4], 34, 160);
  return toTexture(c, true, false);
}

export const glowTexture = () => canvasTexture(128, 128, (g, w) => {
  const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, w);
});

// ───────────── sky for night (day/sunset use the physical Sky in game.js) ─────────────
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
uniform vec3 top;
uniform vec3 mid;
uniform vec3 bot;
uniform vec3 cloudLit;
uniform vec3 cloudDark;
uniform float cover;
uniform float time;
uniform sampler2D skyMap;
uniform float useMap;
uniform float mapGain;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  float h = vDir.y;
  vec3 c = mix(bot, mid, smoothstep(-0.05, 0.16, h));
  c = mix(c, top, smoothstep(0.16, 0.75, h));
  if (useMap > 0.5) {
    // photographed sky (upper hemisphere, equirectangular), hazing into the fog colour at the horizon
    float u = atan(vDir.z, vDir.x) * 0.15915494 + 0.5;
    float v = asin(clamp(h, 0.0, 1.0)) * 0.63661977;
    vec3 photo = texture2D(skyMap, vec2(u, max(v, 0.002))).rgb * mapGain;
    c = mix(bot, photo, smoothstep(-0.02, 0.09, h));
  } else if (h > 0.0 && cover > 0.0) {
    // a dome of billowing clouds, thicker towards the horizon
    vec2 uv = vDir.xz / (h + 0.12) * 1.4 + vec2(time * 0.004, time * 0.0025);
    float n = fbm(uv);
    float detail = fbm(uv * 2.3 + 4.7);
    float density = smoothstep(1.0 - cover - 0.1, 1.0 - cover + 0.32, n * 0.75 + detail * 0.35);
    vec3 cc = mix(cloudDark, cloudLit, smoothstep(0.3, 0.8, detail + (n - 0.5) * 0.6));
    float fade = smoothstep(0.0, 0.1, h);
    c = mix(c, cc, density * fade);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
      cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() }, cover: { value: 0 }, time: { value: 0 },
      skyMap: { value: null }, useMap: { value: 0 }, mapGain: { value: 1 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function makeStars() {
  const rnd = mulberry32(99);
  const n = 1800;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.1 + rnd() * 0.9;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 2800;
    pos[i * 3 + 1] = y * 2800;
    pos[i * 3 + 2] = Math.sin(a) * r * 2800;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  pts.frustumCulled = false;
  return pts;
}

// ───────────── geometry builders ─────────────
class Builder {
  constructor(color = false) {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = color ? [] : null;
    this.T = null;
  }

  // place following geometry in a rotated local frame (u along (ca, sa), v along (-sa, ca))
  setT(cx, cz, ca, sa) {
    this.T = [cx, cz, ca, sa];
    return this;
  }

  clearT() {
    this.T = null;
    return this;
  }

  quad(a, b, c, d, n, uvA, uvB, uvC, uvD, col) {
    const T = this.T;
    if (T) {
      const [cx, cz, ca, sa] = T;
      const f = (v) => [cx + v[0] * ca - v[2] * sa, v[1], cz + v[0] * sa + v[2] * ca];
      a = f(a); b = f(b); c = f(c); d = f(d);
      n = [n[0] * ca - n[2] * sa, n[1], n[0] * sa + n[2] * ca];
    }
    [a, b, c, a, c, d].forEach((v) => this.p.push(v[0], v[1], v[2]));
    for (let k = 0; k < 6; k++) this.n.push(n[0], n[1], n[2]);
    [uvA, uvB, uvC, uvA, uvC, uvD].forEach((t) => this.uv.push(t[0], t[1]));
    if (this.c) {
      // one colour, or one per corner (a, b, c, d)
      if (Array.isArray(col)) [0, 1, 2, 0, 2, 3].forEach((i) => this.c.push(col[i].r, col[i].g, col[i].b));
      else for (let k = 0; k < 6; k++) this.c.push(col.r, col.g, col.b);
    }
  }

  // four walls of an axis-aligned box from y0 to y1, UVs in metres / span
  walls(x0, x1, z0, z1, y0, y1, span, col, vOff = 0, out = 0, spanV = span) {
    // ambient occlusion where the walls meet the ground: a darker band fading out over ao.h metres
    const A = this.ao;
    if (A && this.c && !Array.isArray(col) && y0 < A.y + A.h - 0.2 && y1 > y0 + 0.2) {
      const ym = Math.min(y1, A.y + A.h);
      const f = (y) => A.k + (1 - A.k) * clamp((y - A.y) / A.h, 0, 1);
      const sc = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k });
      const cb = sc(col, f(y0));
      const ct = sc(col, f(ym));
      this.ao = null;
      this.walls(x0, x1, z0, z1, y0, ym, span, [cb, cb, ct, ct], vOff, out, spanV);
      if (y1 > ym + 0.01) this.walls(x0, x1, z0, z1, ym, y1, span, col, vOff, out, spanV);
      this.ao = A;
      return;
    }
    x0 -= out; x1 += out; z0 -= out; z1 += out;
    const v0 = (y0 - vOff) / spanV;
    const v1 = (y1 - vOff) / spanV;
    const sx = (x1 - x0) / span;
    const sz = (z1 - z0) / span;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, v0], [sx, v0], [sx, v1], [0, v1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, v0], [sx, v0], [sx, v1], [0, v1], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, v0], [sz, v0], [sz, v1], [0, v1], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, v0], [sz, v0], [sz, v1], [0, v1], col);
  }

  top(x0, x1, z0, z1, y, span, col) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 / span, z1 / span], [x1 / span, z1 / span], [x1 / span, z0 / span], [x0 / span, z0 / span], col);
  }

  box(x0, x1, z0, z1, y0, y1, span, col) {
    this.walls(x0, x1, z0, z1, y0, y1, span, col);
    this.top(x0, x1, z0, z1, y1, span, col);
  }

  // a single triangle (world space), for fans
  tri(a, b, c, n, uvA, uvB, uvC, col) {
    [a, b, c].forEach((v) => this.p.push(v[0], v[1], v[2]));
    [n, n, n].forEach((m) => this.n.push(m[0], m[1], m[2]));
    [uvA, uvB, uvC].forEach((t) => this.uv.push(t[0], t[1]));
    if (this.c) for (let k = 0; k < 3; k++) this.c.push(col.r, col.g, col.b);
  }

  get empty() {
    return this.p.length === 0;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const dummy = new THREE.Object3D();
const CHUNK = 420;
let cullList = [];
// Many instances spread over the whole city are split into map tiles, so each tile can be
// frustum-culled and distance-culled on its own. Behaves like one InstancedMesh for callers.
class ChunkedInstances extends THREE.Group {
  constructor(geo, mat, items, place) {
    super();
    this._meshes = [];
    this.map = new Array(items.length);
    const tiles = new Map();
    const mats = items.map((it, i) => {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      place(it, dummy, i);
      dummy.updateMatrix();
      const key = `${Math.floor(dummy.position.x / CHUNK)},${Math.floor(dummy.position.z / CHUNK)}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(i);
      return dummy.matrix.clone();
    });
    tiles.forEach((list) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((i, k) => { m.setMatrixAt(k, mats[i]); this.map[i] = [m, k]; });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = this._cs || false;
      m.receiveShadow = this._rs || false;
      m.renderOrder = this._ro || 0;
      this._meshes.push(m);
      this.add(m);
    });
  }
  setColorAt(i, c) { const [m, k] = this.map[i]; m.setColorAt(k, c); }
  get instanceColor() {
    const ms = this._meshes || [];
    return ms.some((m) => m.instanceColor) ? { set needsUpdate(v) { ms.forEach((m) => { if (m.instanceColor) m.instanceColor.needsUpdate = v; }); } } : null;
  }
  get castShadow() { return this._cs; }
  set castShadow(v) { this._cs = v; (this._meshes || []).forEach((m) => { m.castShadow = v; }); }
  get receiveShadow() { return this._rs; }
  set receiveShadow(v) { this._rs = v; (this._meshes || []).forEach((m) => { m.receiveShadow = v; }); }
  get renderOrder() { return this._ro; }
  set renderOrder(v) { this._ro = v; (this._meshes || []).forEach((m) => { m.renderOrder = v; }); }
  // hide tiles beyond maxD of the camera
  cull(cx, cz, maxD) {
    this._meshes.forEach((m) => {
      const s = m.boundingSphere;
      m.visible = !s || Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius < maxD;
    });
  }
}

function instanced(geo, mat, items, place, maxD = 0) {
  if (items.length > 48) {
    const c = new ChunkedInstances(geo, mat, items, place);
    if (maxD) { c.userData.cullD = maxD; cullList.push(c); }
    return c;
  }
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(it, dummy, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function rampGeometry(len, h, w) {
  const geo = new THREE.BoxGeometry(len, h, w);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) < 0 && p.getY(i) > 0) p.setY(i, -h / 2);
  }
  p.needsUpdate = true;
  geo.translate(0, h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const bx = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return ni(g); };
const cy = (r1, r2, h, x, y, z, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return ni(g); };

// woodland density in the country around the city (0..1)
const forestAt = (x, z) => fbm(x / 300, z / 300, 61, 3);
const smoothstepW = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

const smooth01 = (t) => {
  const x = clamp((t - 0.45) / 0.25, 0, 1);
  return x * x * (3 - 2 * x);
};
// ───────────── world helpers ─────────────
function segClosest(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1) : 0;
  const px = a[0] + dx * t;
  const pz = a[1] + dz * t;
  return { t, x: px, z: pz, d: Math.hypot(x - px, z - pz) };
}

// separating-axis test for two rotated rectangles {x, z, ca, sa, hu, hv}
function obbOverlap(A, B, gap = 0) {
  const axes = [[A.ca, A.sa], [-A.sa, A.ca], [B.ca, B.sa], [-B.sa, B.ca]];
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  for (const [ax, az] of axes) {
    const ra = Math.abs(ax * A.ca + az * A.sa) * A.hu + Math.abs(-ax * A.sa + az * A.ca) * A.hv;
    const rb = Math.abs(ax * B.ca + az * B.sa) * B.hu + Math.abs(-ax * B.sa + az * B.ca) * B.hv;
    if (Math.abs(dx * ax + dz * az) > ra + rb + gap) return false;
  }
  return true;
}

// local (u, v) of a rotated frame -> world (x, z)
const toW = (L, u, v) => [L.x + u * L.ca - v * L.sa, L.z + u * L.sa + v * L.ca];
// move geometry built in a building's local frame into the world
const xf = (g, L, y = 0) => { g.rotateY(-Math.atan2(L.sa, L.ca)); g.translate(L.x, y, L.z); return g; };

const URBAN = new Set(['downtown', 'midtown', 'oldtown', 'eastside', 'northside', 'southside']);
// frontage lots per zone: width along the street, depth, gap between lots, setback from the sidewalk
const ZONES = {
  downtown: { w: [24, 46], d: [24, 42], gap: [0.6, 2.5], set: 0.4, kind: 'city', rear: true },
  midtown: { w: [18, 36], d: [18, 32], gap: [0.6, 3], set: 0.4, kind: 'city', rear: true },
  oldtown: { w: [12, 24], d: [15, 26], gap: [0.3, 2], set: 0.4, kind: 'city', rear: true },
  eastside: { w: [14, 30], d: [16, 28], gap: [0.6, 4], set: 0.4, kind: 'city', rear: true },
  northside: { w: [14, 30], d: [16, 28], gap: [1, 5], set: 0.5, kind: 'city', rear: true },
  southside: { w: [14, 30], d: [16, 28], gap: [1, 5], set: 0.5, kind: 'city', rear: true },
  northgate: { w: [34, 70], d: [26, 48], gap: [6, 14], set: 5, kind: 'warehouse' },
  port: { w: [44, 86], d: [30, 52], gap: [8, 16], set: 6, kind: 'port' },
  beach: { w: [11, 15], d: [9, 12], gap: [7, 13], set: 6, kind: 'house' },
  hills: { w: [11, 15], d: [9, 12], gap: [9, 17], set: 7, kind: 'house' },
  outskirts: { w: [11, 15], d: [9, 12], gap: [22, 40], set: 7, kind: 'house', skip: 0.4 },
};

export class World {
  constructor(seed = 1337, quality = 'medium') {
    this.quality = quality;
    this.seed = seed;
    this.group = new THREE.Group();
    this.city = new City(seed);
    this.colIdx = new SegIndex(32);
    this.lotIdx = new SegIndex(40);
    this.lots = [];
    this.buildings = [];
    this.warehouses = [];
    this.houses = [];
    this.drives = [];
    this.containers = [];
    this.cranes = [];
    this.trees = [];
    this.streetTrees = [];
    this.lamps = [];
    this.props = [];
    this.parked = [];
    this.ramps = [];
    this.signals = [];
    this.facadeMats = [];
    this.shopMats = [];
    this.emissiveMats = [];
    this.buildDeckIndex();
    this.genLots();
    this.genStreets();
    this.genUtilities();
    this.genNature();
    this.genRamps();
    cullList = [];
    this.buildMeshes();
    this.cullList = cullList;
    cullList = [];
    this.mapCanvas = this.drawMap();
  }

  // ───────────── colliders (rotated boxes) ─────────────
  obb(x, z, ca, sa, hu, hv, y0, h, kind) {
    return { x, z, ca, sa, hu, hv, y0, h, kind };
  }

  addCollider(c) {
    const ex = Math.abs(c.ca) * c.hu + Math.abs(c.sa) * c.hv;
    const ez = Math.abs(c.sa) * c.hu + Math.abs(c.ca) * c.hv;
    this.colIdx.add(c, c.x - ex, c.z - ez, c.x + ex, c.z + ez);
    return c;
  }

  removeCollider(c) {
    this.colIdx.remove(c);
  }

  // a box standing on the ground, rotated to heading `ang` (radians, 0 = along +x)
  boxCollider(x, z, ang, hu, hv, height, kind = 'barrier') {
    const g = this.city.terrainAt(x, z).h;
    return this.obb(x, z, Math.cos(ang), Math.sin(ang), hu, hv, g - 1, g + height, kind);
  }

  segCollider(ax, az, bx, bz, thick, y0, h, kind) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) return null;
    return this.addCollider(this.obb((ax + bx) / 2, (az + bz) / 2, (bx - ax) / L, (bz - az) / L, L / 2 + 0.05, thick / 2, y0, h, kind));
  }

  // is (x, z) on the driving surface of any road (plus an extra margin)?
  onCarriageway(x, z, extra = 0.3) {
    let hit = false;
    this.city.edgeIdx.query(x - 14, z - 14, x + 14, z + 14, (it) => {
      const e = it.e;
      if (e.lift[it.i] > 4 && e.lift[it.i + 1] > 4) return true; // up on the expressway deck
      if (segClosest(x, z, e.pts[it.i], e.pts[it.i + 1]).d < e.hw + extra) { hit = true; return false; }
      return true;
    });
    if (!hit) {
      // junction surfaces reach a little beyond the roads' centre lines
      this.city.nodes.forEach((n) => { if (!hit && n.deg >= 3 && Math.hypot(n.x - x, n.z - z) < 10 + extra) hit = true; });
    }
    return hit;
  }

  // clear of every road's carriageway and sidewalk
  roadClear(x, z, margin) {
    let ok = true;
    this.city.edgeIdx.query(x - 18, z - 18, x + 18, z + 18, (it) => {
      const e = it.e;
      const d = segClosest(x, z, e.pts[it.i], e.pts[it.i + 1]).d;
      if (d < e.hw + e.T.sidewalk + margin + (e.T.barrier ? 3 : 0)) { ok = false; return false; }
      return true;
    });
    return ok;
  }

  // how far (x, z) intrudes into the nearest road + sidewalk (+margin); <= 0 means clear
  roadPen(x, z, margin) {
    let pen = -Infinity;
    this.city.edgeIdx.query(x - 18, z - 18, x + 18, z + 18, (it) => {
      const e = it.e;
      const d = segClosest(x, z, e.pts[it.i], e.pts[it.i + 1]).d;
      pen = Math.max(pen, e.hw + e.T.sidewalk + margin + (e.T.barrier ? 3 : 0) - d);
      return true;
    });
    return pen;
  }

  inLot(x, z, pad = 0) {
    let hit = false;
    this.lotIdx.query(x - 1, z - 1, x + 1, z + 1, (L) => {
      const dx = x - L.x;
      const dz = z - L.z;
      if (Math.abs(dx * L.ca + dz * L.sa) < L.hu + pad && Math.abs(-dx * L.sa + dz * L.ca) < L.hv + pad) { hit = true; return false; }
      return true;
    });
    return hit;
  }

  // ───────────── generation: lots and buildings ─────────────
  lotOk(L, pad = 1.0) {
    const C = this.city;
    const pts = [[L.x, L.z]];
    const nu = Math.max(1, Math.ceil((L.hu * 2) / 5));
    const nv = Math.max(1, Math.ceil((L.hv * 2) / 5));
    for (let i = 0; i <= nu; i++) {
      const u = -L.hu + (2 * L.hu * i) / nu;
      pts.push(toW(L, u, -L.hv), toW(L, u, L.hv));
    }
    for (let j = 1; j < nv; j++) {
      const v = -L.hv + (2 * L.hv * j) / nv;
      pts.push(toW(L, -L.hu, v), toW(L, L.hu, v));
    }
    for (const [px, pz] of pts) {
      if (Math.abs(px) > MAP - 14 || Math.abs(pz) > MAP - 14) return false;
      if (C.coastDist(px, pz) < 10) return false;
      if (C.park(px, pz, 3)) return false;
      if (!this.roadClear(px, pz, 0.05)) return false;
    }
    let clash = false;
    const r = Math.hypot(L.hu, L.hv) + 2;
    this.lotIdx.query(L.x - r, L.z - r, L.x + r, L.z + r, (o) => {
      if (obbOverlap(L, o, pad)) { clash = true; return false; }
      return true;
    });
    return !clash;
  }

  addLot(L) {
    const ex = Math.abs(L.ca) * L.hu + Math.abs(L.sa) * L.hv;
    const ez = Math.abs(L.sa) * L.hu + Math.abs(L.ca) * L.hv;
    this.lotIdx.add(L, L.x - ex, L.z - ez, L.x + ex, L.z + ez);
    this.lots.push(L);
  }

  groundUnder(L, fn = Math.min) {
    const C = this.city;
    const hs = [[L.x, L.z], toW(L, -L.hu, -L.hv), toW(L, L.hu, -L.hv), toW(L, L.hu, L.hv), toW(L, -L.hu, L.hv)].map(([x, z]) => C.terrainAt(x, z).h);
    return fn(...hs);
  }

  genLots() {
    const C = this.city;
    const rnd = mulberry32(this.seed + 5);
    const R = (a) => lerp(a[0], a[1], rnd());
    C.edges.forEach((e) => {
      if (e.T.barrier) return;
      [-1, 1].forEach((side) => {
        let s = e.t0 + 2 + rnd() * 4;
        const end = e.len - e.t1 - 2;
        let guard = 0;
        while (s < end - 8 && guard++ < 500) {
          const p = C.at(e, s);
          const zone = C.zoneAt(p.x, p.z);
          if (zone === 'sea') { s += 12; continue; }
          const Z = ZONES[zone] || ZONES.outskirts;
          if (Z.kind === 'city') { s += 10; continue; } // city blocks are filled by genUrbanBlocks
          if (Z.skip && rnd() < Z.skip) { s += 18; continue; }
          let w = R(Z.w);
          if (s + w > end) w = end - s;
          if (w < Z.w[0] * 0.6) break;
          const m = C.at(e, s + w / 2);
          const nx = -m.dz * side;
          const nz = m.dx * side;
          let ok = false;
          const tries = [];
          [1, 0.7, 0.45].forEach((df) => tries.push([1, df]));
          if (w > Z.w[0] * 1.2) [1, 0.7].forEach((df) => tries.push([0.6, df]));
          for (const [wf, df] of tries) {
            const d = R(Z.d) * df;
            if (d < 6) continue;
            const off = e.hw + e.T.sidewalk + Z.set + d / 2;
            const lot = { x: m.x + nx * off, z: m.z + nz * off, ca: m.dx, sa: m.dz, hu: (w * wf) / 2, hv: d / 2, zone, kind: Z.kind, side, front: -side };
            // curving streets: step the lot back just enough to clear the sidewalk
            let pen = -Infinity;
            for (let k = 0; k <= 4; k++) {
              const [fx, fz] = toW(lot, -lot.hu + (lot.hu * k) / 2, lot.front * lot.hv);
              pen = Math.max(pen, this.roadPen(fx, fz, 0.1));
            }
            if (pen > 0 && pen < 6) { lot.x += nx * (pen + 0.15); lot.z += nz * (pen + 0.15); }
            if (this.lotOk(lot)) {
              this.addLot(lot);
              ok = true;
              if (Z.rear && rnd() < 0.8) {
                // a second building behind, filling the block
                const d2 = R(Z.d);
                const w2 = Math.min(w, R(Z.w));
                const off2 = off + d / 2 + 1 + d2 / 2;
                const du = (w - w2) * (rnd() - 0.5);
                const rear = { ...lot, x: m.x + nx * off2 + m.dx * du, z: m.z + nz * off2 + m.dz * du, hu: w2 / 2, hv: d2 / 2, rear: true };
                if (this.lotOk(rear)) this.addLot(rear);
              }
              break;
            }
          }
          s += ok ? w + R(Z.gap) : 5;
        }
      });
    });
    this.genUrbanBlocks(rnd);
    // what stands on each lot
    this.lots.forEach((L) => {
      const base = this.groundUnder(L) - 0.4;
      if (L.kind === 'house') this.makeHouse(L, base, rnd);
      else if (L.kind === 'warehouse') this.makeWarehouse(L, base, rnd);
      else if (L.kind === 'port') {
        if (rnd() < 0.45) this.makeWarehouse(L, base, rnd);
        else this.makeYard(L, base, rnd);
      } else this.makeCityBuilding(L, base, rnd);
    });
  }

  // City blocks: rasterise the land between roads, find each block, and split it into building
  // plots that fill it edge to edge (like a real downtown), each plot squared to its block's street.
  genUrbanBlocks(rnd) {
    const C = this.city;
    const G = 2.5;
    const N = Math.ceil((MAP * 2) / G);
    const idx = (i, j) => j * N + i;
    const cx = (i) => -MAP + (i + 0.5) * G;
    // 0 = not urban, 1 = buildable, 2 = blocked
    const cell = new Uint8Array(N * N);
    const zoneOf = new Array(N * N);
    const ZS = 8; // coarse zone sampling every 8 cells (20 m)
    for (let j = 0; j < N; j += ZS) {
      for (let i = 0; i < N; i += ZS) {
        const x = cx(i + ZS / 2);
        const z = cx(j + ZS / 2);
        const zone = C.zoneAt(x, z);
        if ((ZONES[zone] || {}).kind !== 'city') continue;
        const nearCoast = C.coastDist(x, z) < 50;
        const nearPark = C.park(x, z, 40);
        for (let jj = j; jj < Math.min(N, j + ZS); jj++) {
          for (let ii = i; ii < Math.min(N, i + ZS); ii++) {
            const k = idx(ii, jj);
            const px = cx(ii);
            const pz = cx(jj);
            if ((nearCoast && C.coastDist(px, pz) < 12) || (nearPark && C.park(px, pz, 3)) || Math.abs(px) > MAP - 14 || Math.abs(pz) > MAP - 14) { cell[k] = 2; continue; }
            cell[k] = 1;
            zoneOf[k] = zone;
          }
        }
      }
    }
    // roads, sidewalks and a little margin are not buildable
    C.edges.forEach((e) => {
      const R = e.hw + e.T.sidewalk + 0.6 + (e.T.barrier ? 3 : 0);
      for (let s = 0; s < e.pts.length - 1; s++) {
        const a = e.pts[s];
        const b = e.pts[s + 1];
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - R + MAP) / G));
        const i1 = Math.min(N - 1, Math.floor((Math.max(a[0], b[0]) + R + MAP) / G));
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - R + MAP) / G));
        const j1 = Math.min(N - 1, Math.floor((Math.max(a[1], b[1]) + R + MAP) / G));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const k = idx(i, j);
            if (cell[k] !== 1) continue;
            if (segClosest(cx(i), cx(j), a, b).d < R) cell[k] = 2;
          }
        }
      }
    });
    // lots already placed (none in city zones, but be safe)
    // flood-fill blocks
    const seen = new Int32Array(N * N);
    const stack = [];
    let blockNo = 0;
    for (let k0 = 0; k0 < N * N; k0++) {
      if (cell[k0] !== 1 || seen[k0]) continue;
      const block = [];
      stack.push(k0);
      blockNo++;
      seen[k0] = blockNo;
      while (stack.length) {
        const k = stack.pop();
        block.push(k);
        const i = k % N;
        const j = (k - i) / N;
        if (i > 0 && cell[k - 1] === 1 && !seen[k - 1]) { seen[k - 1] = blockNo; stack.push(k - 1); }
        if (i < N - 1 && cell[k + 1] === 1 && !seen[k + 1]) { seen[k + 1] = blockNo; stack.push(k + 1); }
        if (j > 0 && cell[k - N] === 1 && !seen[k - N]) { seen[k - N] = blockNo; stack.push(k - N); }
        if (j < N - 1 && cell[k + N] === 1 && !seen[k + N]) { seen[k + N] = blockNo; stack.push(k + N); }
      }
      if (block.length < 24) continue; // < 150 m2
      this.splitBlock(block, N, G, zoneOf, rnd, (x, z) => {
        const i = Math.floor((x + MAP) / G);
        const j = Math.floor((z + MAP) / G);
        return i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] === blockNo;
      });
    }
  }

  splitBlock(block, N, G, zoneOf, rnd, inBlock) {
    const C = this.city;
    const cx = (i) => -MAP + (i + 0.5) * G;
    let sx = 0;
    let sz = 0;
    block.forEach((k) => { sx += cx(k % N); sz += cx(Math.floor(k / N)); });
    sx /= block.length;
    sz /= block.length;
    // square the block to its nearest street
    const rd = C.nearestRoad(sx, sz, null, 200);
    const ca = rd ? rd.dx : 1;
    const sa = rd ? rd.dz : 0;
    const zone = zoneOf[block[0]] || 'midtown';
    const Z = ZONES[zone];
    // cells in the block's frame (u along the street, v across)
    const pts = block.map((k) => {
      const x = cx(k % N) - sx;
      const z = cx(Math.floor(k / N)) - sz;
      return [x * ca + z * sa, -x * sa + z * ca];
    });
    const maxW = Z.w[1];
    const maxD = Z.d[1];
    const leaves = [];
    const split = (list, depth) => {
      let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
      list.forEach(([u, v]) => { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const U = u1 - u0 + G;
      const V = v1 - v0 + G;
      if (depth > 12 || (U <= maxW && V <= maxD) || list.length < 30) { leaves.push(list); return; }
      // split the longer side (relative to the plot size limits), a little off-centre
      const alongU = U / maxW > V / maxD;
      const f = 0.4 + rnd() * 0.2;
      const cut = alongU ? u0 + (u1 - u0) * f : v0 + (v1 - v0) * f;
      const a = [];
      const b = [];
      list.forEach((p) => ((alongU ? p[0] : p[1]) < cut ? a : b).push(p));
      if (!a.length || !b.length) { leaves.push(list); return; }
      split(a, depth + 1);
      split(b, depth + 1);
    };
    split(pts, 0);
    leaves.forEach((list) => {
      // largest clean rectangle: start from the bounding box and pull in the side with the most holes
      const H = G * 0.8; // test lattice a little finer than the raster
      const has = (iu, iv) => inBlock(sx + iu * H * ca - iv * H * sa, sz + iu * H * sa + iv * H * ca);
      let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
      list.forEach(([u, v]) => { a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); });
      // lattice strictly inside this plot's share of the block, so neighbours never overlap
      a0 = Math.ceil(a0 / H); a1 = Math.floor(a1 / H); b0 = Math.ceil(b0 / H); b1 = Math.floor(b1 / H);
      for (let it = 0; it < 120 && a1 - a0 >= 2 && b1 - b0 >= 2; it++) {
        const miss = [0, 0, 0, 0];
        let total = 0;
        for (let iu = a0; iu <= a1; iu++) {
          for (let iv = b0; iv <= b1; iv++) {
            if (has(iu, iv)) continue;
            total++;
            if (iu === a0) miss[0]++;
            if (iu === a1) miss[1]++;
            if (iv === b0) miss[2]++;
            if (iv === b1) miss[3]++;
          }
        }
        if (!total) break;
        const rel = [miss[0] / (b1 - b0 + 1), miss[1] / (b1 - b0 + 1), miss[2] / (a1 - a0 + 1), miss[3] / (a1 - a0 + 1)];
        const w = rel.indexOf(Math.max(...rel));
        if (rel[w] === 0) {
          // holes inside: shrink the longer side
          if (a1 - a0 > b1 - b0) a1--; else b1--;
        } else if (w === 0) a0++; else if (w === 1) a1--; else if (w === 2) b0++; else b1--;
      }
      const gap = 0.35;
      const hu = ((a1 - a0) * H) / 2 + H * 0.3 - gap;
      const hv = ((b1 - b0) * H) / 2 + H * 0.3 - gap;
      if (hu < 4 || hv < 4) return;
      const mu = ((a0 + a1) / 2) * H;
      const mv = ((b0 + b1) / 2) * H;
      const x = sx + mu * ca - mv * sa;
      const z = sz + mu * sa + mv * ca;
      // which long side faces a street (for signs); is the plot on the street at all?
      const pPlus = this.roadPen(x - sa * (hv + 2), z + ca * (hv + 2), 3);
      const pMinus = this.roadPen(x + sa * (hv + 2), z - ca * (hv + 2), 3);
      const pU = Math.max(this.roadPen(x + ca * (hu + 2), z + sa * (hu + 2), 3), this.roadPen(x - ca * (hu + 2), z - sa * (hu + 2), 3));
      const onStreet = Math.max(pPlus, pMinus, pU) > 0;
      const lot = { x, z, ca, sa, hu, hv, zone, kind: 'city', side: 1, front: pPlus >= pMinus ? 1 : -1, rear: !onStreet };
      if (this.lotOk(lot, 0.05)) this.addLot(lot);
    });
  }

  makeCityBuilding(L, base, rnd) {
    const z = L.zone;
    let h;
    let types;
    if (z === 'downtown') { h = 40 + Math.pow(rnd(), 1.6) * 165; types = ['glass', 'glass', 'stone', 'office']; } else if (z === 'midtown') { h = 16 + Math.pow(rnd(), 1.5) * 52; types = ['office', 'stone', 'brick', 'stone']; } else if (z === 'oldtown') { h = 10 + rnd() * 22; types = ['brick', 'brick', 'brick', 'stone']; } else { h = 11 + Math.pow(rnd(), 1.4) * 32; types = ['brick', 'stone', 'office', 'brick']; }
    if (L.rear) h *= 0.8 + rnd() * 0.5;
    const type = h > 100 ? (rnd() < 0.65 ? 'glass' : 'stone') : types[Math.floor(rnd() * types.length)];
    const shopP = { downtown: 0.9, midtown: 0.75, oldtown: 0.85 }[z] ?? 0.55;
    const b = { ...L, base, h, type, tint: rnd(), shops: !L.rear && rnd() < shopP, district: z };
    b.top = base + h;
    this.buildings.push(b);
    this.addCollider(this.obb(L.x, L.z, L.ca, L.sa, L.hu, L.hv, base - 1, base + h + 3, 'b'));
  }

  makeWarehouse(L, base, rnd) {
    const w = { ...L, base, h: 9 + rnd() * 6, tint: rnd() };
    this.warehouses.push(w);
    this.addCollider(this.obb(L.x, L.z, L.ca, L.sa, L.hu, L.hv, base - 1, base + w.h + 3, 'b'));
  }

  // a container yard: rows of stacked shipping containers, sometimes under a gantry crane
  makeYard(L, base, rnd) {
    const rowsV = Math.floor((L.hv * 2 - 6) / 7.4);
    const colsU = Math.floor((L.hu * 2 - 4) / 13.6);
    for (let r = 0; r < rowsV; r++) {
      for (let c = 0; c < colsU; c++) {
        if (rnd() < 0.15) continue;
        const u = -L.hu + 2 + 6.1 + c * 13.6;
        const v = -L.hv + 3 + 2.45 + r * 7.4;
        const stack = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < 2; k++) {
          for (let st = 0; st < stack - (k && rnd() < 0.4 ? 1 : 0); st++) {
            const [x, zz] = toW(L, u, v + (k - 0.5) * 2.45);
            this.containers.push({ x, z: zz, y: base + 0.4 + st * 2.6, rot: -Math.atan2(L.sa, L.ca), c: Math.floor(rnd() * 7) });
          }
        }
        const [cx, cz] = toW(L, u, v);
        this.addCollider(this.obb(cx, cz, L.ca, L.sa, 6.1, 2.45, base - 1, base + 0.4 + stack * 2.6, 'c'));
      }
    }
    if (rowsV >= 3 && colsU >= 3 && rnd() < 0.7) {
      const cr = { ...L, base, h: 30 };
      this.cranes.push(cr);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b2]) => {
        const [x, zz] = toW(L, a * (L.hu - 2), b2 * (L.hv - 1.5));
        this.addCollider(this.obb(x, zz, L.ca, L.sa, 0.7, 0.7, base - 1, base + 30, 'pole'));
      });
    }
  }

  makeHouse(L, base, rnd) {
    const floors = rnd() < 0.55 ? 2 : 1;
    const h = { ...L, base, floors, wallH: floors * 3, roofH: 2.4 + rnd(), color: rnd() };
    h.h = h.wallH + h.roofH;
    this.houses.push(h);
    this.addCollider(this.obb(L.x, L.z, L.ca, L.sa, L.hu, L.hv, base - 1, base + h.h + 2, 'b'));
    // driveway from the street to the front of the house, beside it
    const f = L.front; // the street is on this side of the house (local v)
    const C = this.city;
    const clear = (u, v, pad) => {
      const [x, z] = toW(L, u, v);
      return !this.onCarriageway(x, z, pad) && !this.inLot(x, z, 0.2) && !C.park(x, z, 1) && C.coastDist(x, z) > 6;
    };
    // an attached single garage on the driveway side, its door facing the street
    if (rnd() < 0.6 && [[L.hu + 0.4, f * L.hv], [L.hu + 4.6, f * L.hv], [L.hu + 4.6, -f * (L.hv - 1.5)], [L.hu + 0.4, -f * (L.hv - 1.5)]].every(([u, v]) => clear(u, v, 1.5))) {
      h.garage = { u0: L.hu, u1: L.hu + 4.4, v0: -(L.hv - 1.2), v1: L.hv };
      const [gx, gz] = toW(L, L.hu + 2.2, f * 0.6);
      this.addCollider(this.obb(gx, gz, L.ca, L.sa, 2.2, L.hv - 0.6, base - 1, base + 4, 'b'));
    }
    const du = h.garage ? 4.4 : 0;
    this.drives.push({ L, u0: L.hu + 0.8 + (h.garage ? 0.1 : 0), u1: L.hu + (h.garage ? 4.3 : 4), v0: f * L.hv, v1: f * (L.hv + 7.5) });
    void du;
    // front porch, chimney
    if (rnd() < 0.6) h.porch = { u0: -L.hu * (0.2 + rnd() * 0.4), u1: L.hu * (0.2 + rnd() * 0.5) };
    if (rnd() < 0.65) h.chimney = (rnd() < 0.5 ? -1 : 1) * (L.hu - 1.2);
    h.roofCol = rnd();
    // a picket fence round the back garden
    if (rnd() < 0.75) {
      const back = -f * (L.hv + 7 + rnd() * 3);
      const pts = [[-L.hu - 0.8, -f * L.hv], [-L.hu - 0.8, back], [L.hu + 0.8 + du, back], [L.hu + 0.8 + du, -f * L.hv]];
      const segs = [];
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const ok = [0, 0.5, 1].every((t) => clear(lerp(a[0], b[0], t), lerp(a[1], b[1], t), 1.2));
        if (!ok) continue;
        const [ax, az] = toW(L, a[0], a[1]);
        const [bx2, bz] = toW(L, b[0], b[1]);
        segs.push([ax, az, bx2, bz]);
        this.segCollider(ax, az, bx2, bz, 0.15, base - 1, base + 1.6, 'fence');
      }
      if (segs.length) h.fence = segs;
    }
    // a garden tree behind
    if (rnd() < 0.7) {
      const [tx, tz] = toW(L, (rnd() - 0.5) * L.hu * 2, -f * (L.hv + 4 + rnd() * 4));
      if (!this.inLot(tx, tz, 1) && !this.onCarriageway(tx, tz, 2)) this.trees.push({ x: tx, z: tz, s: 0.8 + rnd() * 0.5, r: rnd() });
    }
  }

  // wooden utility poles carrying power lines along suburban and industrial roads, and bus shelters
  genUtilities() {
    const C = this.city;
    const rnd = mulberry32(this.seed + 23);
    this.utility = [];
    this.shelters = [];
    const POWER = new Set(['hills', 'outskirts', 'beach', 'northgate', 'port']);
    C.edges.forEach((e) => {
      const T = e.T;
      if (T.barrier || e.len - e.t0 - e.t1 < 30) return;
      const mid = C.at(e, e.len / 2);
      const zone = C.zoneAt(mid.x, mid.z);
      if (POWER.has(zone)) {
        const side = e.id % 2 ? 1 : -1;
        const chain = [];
        for (let sp = e.t0 + 4; sp < e.len - e.t1 - 2; sp += 32 + rnd() * 6) {
          const p = C.at(e, sp);
          if (p.lift > 0.3) { if (chain.length > 1) this.utility.push(chain.splice(0)); else chain.length = 0; continue; }
          const nx = -p.dz * side;
          const nz = p.dx * side;
          const off = e.hw + (T.sidewalk || 0) + 1.0;
          const x = p.x + nx * off;
          const z = p.z + nz * off;
          if (this.onCarriageway(x, z, 0.6) || this.inLot(x, z, 0.6)) { if (chain.length > 1) this.utility.push(chain.splice(0)); else chain.length = 0; continue; }
          const y = C.terrainAt(x, z).h;
          chain.push({ x, z, y, ax: p.dx, az: p.dz, tilt: (rnd() - 0.5) * 0.04 });
          this.addCollider(this.obb(x, z, 1, 0, 0.18, 0.18, y - 1, y + 10, 'pole'));
        }
        if (chain.length > 1) this.utility.push(chain);
      }
      // a bus shelter on the sidewalk of avenues and busy streets
      if (((e.type === 'avenue' && rnd() < 0.6) || (e.type === 'street' && rnd() < 0.12)) && URBAN.has(zone) && T.sidewalk >= 4 && e.len - e.t0 - e.t1 > 45) {
        const side = rnd() < 0.5 ? 1 : -1;
        const sp = lerp(e.t0 + 12, e.len - e.t1 - 12, 0.3 + rnd() * 0.4);
        const p = C.at(e, sp);
        const nx = -p.dz * side;
        const nz = p.dx * side;
        const off = e.hw + T.sidewalk - 1.0;
        const x = p.x + nx * off;
        const z = p.z + nz * off;
        if (this.inLot(x, z, 0.8) || this.onCarriageway(x, z, 0.3)) return;
        const y = C.terrainAt(x, z).h + SIDEWALK_H;
        // local u along the road, v toward the road
        this.shelters.push({ x, z, y, ca: p.dx, sa: p.dz, face: -side });
        this.addCollider(this.obb(x, z, p.dx, p.dz, 2.1, 0.75, y - 1, y + 2.8, 'pole'));
      }
    });
  }

  // ───────────── generation: street life ─────────────
  genStreets() {
    const C = this.city;
    const rnd = mulberry32(this.seed + 7);
    const pole = (x, z, r, y0, h) => this.addCollider(this.obb(x, z, 1, 0, r, r, y0 - 1, y0 + h, 'pole'));
    const density = this.quality === 'high' ? 0.5 : this.quality === 'medium' ? 0.32 : 0;
    C.edges.forEach((e) => {
      const T = e.T;
      const resid = e.type === 'residential';
      const spacing = resid ? 50 : 38;
      const sides = resid ? [1] : [-1, 1];
      // street lamps (on the deck for the expressway)
      for (let s = e.t0 + 9 + rnd() * 6; s < e.len - e.t1 - 6; s += spacing) {
        const p = C.at(e, s);
        const elevated = p.lift > 0.3;
        sides.forEach((side) => {
          const nx = -p.dz * side;
          const nz = p.dx * side;
          const off = elevated ? e.hw - 0.3 : T.barrier ? e.hw + 1.6 : T.sidewalk ? e.hw + Math.min(0.9, T.sidewalk * 0.3) : e.hw + 1.4;
          const x = p.x + nx * off;
          const z = p.z + nz * off;
          if (!elevated && (this.onCarriageway(x, z, 0.4) || this.inLot(x, z, 0.5))) return;
          const y = elevated ? p.y : C.terrainAt(x, z).h;
          this.lamps.push({ x, z, y, rot: Math.atan2(-nx, -nz), pool: { x: p.x + nx * (off - 4.5), z: p.z + nz * (off - 4.5), y: elevated ? p.y : C.terrainAt(p.x + nx * (off - 4.5), p.z + nz * (off - 4.5)).h } });
          pole(x, z, 0.25, y, 9);
          // hydrants and bins on city sidewalks
          if (T.sidewalk >= 4 && rnd() < 0.3) {
            const t = 5 + rnd() * 6;
            const hx = x + p.dx * t;
            const hz = z + p.dz * t;
            if (!this.onCarriageway(hx, hz, 0.3) && !this.inLot(hx, hz, 0.3)) this.props.push({ x: hx, z: hz, y: C.terrainAt(hx, hz).h + SIDEWALK_H, kind: rnd() < 0.5 ? 'hydrant' : 'bin' });
          }
        });
      }
      const mid = C.at(e, e.len / 2);
      const zone = C.zoneAt(mid.x, mid.z);
      // street trees on city sidewalks
      if ((e.type === 'street' || e.type === 'avenue') && URBAN.has(zone) && !(zone === 'downtown' && e.type === 'street')) {
        for (let s = e.t0 + 20; s < e.len - e.t1 - 8; s += 24) {
          const p = C.at(e, s);
          [-1, 1].forEach((side) => {
            const nx = -p.dz * side;
            const nz = p.dx * side;
            const off = e.hw + T.sidewalk - 1.1;
            const x = p.x + nx * off;
            const z = p.z + nz * off;
            if (this.onCarriageway(x, z, 0.6) || this.inLot(x, z, 0.6)) return;
            this.streetTrees.push({ x, z, s: 0.7 + rnd() * 0.4, r: rnd() });
            pole(x, z, 0.35, C.terrainAt(x, z).h, 6);
          });
        }
      }
      // cars parked along the kerb of city streets
      if (e.type === 'street' && URBAN.has(zone) && density > 0) {
        for (let s = e.t0 + 8; s < e.len - e.t1 - 8; s += 6.6) {
          [-1, 1].forEach((side) => {
            if (rnd() > density) return;
            const p = C.at(e, s);
            const nx = -p.dz * side;
            const nz = p.dx * side;
            const off = e.hw - 1.05;
            const x = p.x + nx * off;
            const z = p.z + nz * off;
            const h = Math.atan2(p.dx, p.dz) + (side < 0 ? Math.PI : 0);
            const y = C.terrainAt(x, z).h;
            this.parked.push({ x, z, y, h, color: rnd() });
            this.addCollider(this.obb(x, z, Math.sin(h), Math.cos(h), 2.4, 1.0, y - 1, y + 1.5, 'p'));
          });
        }
      }
    });
    // traffic lights at junctions: one mast per approach, on the right-hand corner
    C.nodes.forEach((n) => {
      if (!n.junction) return;
      if (n.out.some((o) => C.edges[o.ei].type === 'expressway')) return;
      n.out.forEach((o) => {
        const e = C.edges[o.ei];
        const t = n.trim[o.ei] + 1.5;
        const p = o.fwd ? C.at(e, t) : C.at(e, e.len - t);
        const ux = o.fwd ? p.dx : -p.dx; // pointing away from the junction
        const uz = o.fwd ? p.dz : -p.dz;
        // the right-hand side of traffic arriving at the junction
        const rx = uz;
        const rz = -ux;
        const x = p.x + rx * (e.hw + 1.0);
        const z = p.z + rz * (e.hw + 1.0);
        if (this.onCarriageway(x, z, 0.2)) return;
        const ax = -rx;
        const az = -rz;
        const y = C.terrainAt(x, z).h;
        const group = Math.round(Math.atan2(uz, ux) / (Math.PI / 2)) & 1 ? 'x' : 'z';
        this.signals.push({ x, z, y, rot: Math.atan2(-az, ax), axis: group, span: Math.min(7.5, e.hw * 0.9) });
        pole(x, z, 0.2, y, 7);
      });
    });
    // concrete barriers along the highways (gaps at junctions) and parapets on the expressway
    this.barrierRuns = [];
    C.edges.forEach((e) => {
      if (!e.T.barrier) return;
      const s0 = e.t0 + 5;
      const s1 = e.len - e.t1 - 5;
      if (s1 - s0 < 10) return;
      const lats = e.type === 'highway' ? [-(e.hw + 0.4), 0, e.hw + 0.4] : [-(e.hw + 0.2), 0, e.hw + 0.2];
      lats.forEach((lat) => {
        const run = [];
        for (let s = s0; s <= s1 + 0.01; s += 6) {
          const p = C.at(e, Math.min(s, s1));
          const x = p.x - p.dz * lat;
          const z = p.z + p.dx * lat;
          const y = p.lift > 0.3 ? p.y : C.terrainAt(x, z).h;
          run.push({ x, z, y, lift: p.lift });
        }
        this.barrierRuns.push({ run, median: lat === 0, e });
        for (let k = 1; k < run.length; k++) {
          const a = run[k - 1];
          const b = run[k];
          const y = Math.min(a.y, b.y);
          this.segCollider(a.x, a.z, b.x, b.z, 0.6, y - 0.8, Math.max(a.y, b.y) + 1.0, 'rail');
        }
      });
    });
    // the sea wall along the coast keeps cars out of the water
    this.seawall = [];
    const cs = C.coast;
    for (let i = 0; i < cs.length; i++) {
      const [x, z] = cs[i];
      if (Math.abs(x) > MAP + 60 || Math.abs(z) > MAP + 60) continue;
      const nx = cs[Math.min(cs.length - 1, i + 1)][0] - cs[Math.max(0, i - 1)][0];
      const nz = cs[Math.min(cs.length - 1, i + 1)][1] - cs[Math.max(0, i - 1)][1];
      const l = Math.hypot(nx, nz) || 1;
      // inland is to the left of the coast direction (land lies north-west)
      const ix = nz / l;
      const iz = -nx / l;
      const px = x + ix * 3;
      const pz = z + iz * 3;
      this.seawall.push({ x: px, z: pz, y: C.terrainAt(px, pz).h });
    }
    for (let k = 1; k < this.seawall.length; k++) {
      const a = this.seawall[k - 1];
      const b = this.seawall[k];
      this.segCollider(a.x, a.z, b.x, b.z, 1.0, -8, Math.max(a.y, b.y) + 1.1, 'rail');
    }
    // expressway piers and embankment walls
    this.piers = [];
    C.edges.forEach((e) => {
      if (e.type !== 'expressway') return;
      let next = 30;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i];
        const b = e.pts[i + 1];
        if (e.lift[i] > 0.3 && e.lift[i] < 4.8) {
          // solid ramp: walls on both sides stop cars at ground level
          [-1, 1].forEach((sd) => {
            const ta = e.tan[i];
            const tb = e.tan[i + 1];
            const ax = a[0] - ta[1] * (e.hw + 0.3) * sd;
            const az = a[1] + ta[0] * (e.hw + 0.3) * sd;
            const bx2 = b[0] - tb[1] * (e.hw + 0.3) * sd;
            const bz = b[1] + tb[0] * (e.hw + 0.3) * sd;
            this.segCollider(ax, az, bx2, bz, 0.8, -50, Math.min(e.y[i], e.y[i + 1]) - 0.4, 'rail');
          });
        }
        if (e.lift[i] >= 4.8 && e.cum[i] >= next) {
          next = e.cum[i] + 36;
          if (this.onCarriagewayGround(a[0], a[1], 1.6)) { next = e.cum[i] + 8; continue; }
          const g = C.terrainAt(a[0], a[1]).h;
          this.piers.push({ x: a[0], z: a[1], g, top: e.y[i] - 1.4, rot: Math.atan2(e.tan[i][0], e.tan[i][1]), w: e.hw * 2 });
          this.addCollider(this.obb(a[0], a[1], e.tan[i][0], e.tan[i][1], 1.1, 1.1, g - 1, e.y[i] - 2, 'pole'));
        }
      }
    });
  }

  // like onCarriageway but ignoring the elevated expressway itself
  onCarriagewayGround(x, z, extra) {
    let hit = false;
    this.city.edgeIdx.query(x - 14, z - 14, x + 14, z + 14, (it) => {
      const e = it.e;
      if (e.type === 'expressway') return true;
      if (segClosest(x, z, e.pts[it.i], e.pts[it.i + 1]).d < e.hw + extra) { hit = true; return false; }
      return true;
    });
    return hit;
  }

  // trees in parks and across the open hillsides
  genNature() {
    const C = this.city;
    const rnd = mulberry32(this.seed + 11);
    const want = this.quality === 'low' ? 0.45 : 1;
    PARKS.forEach((p) => {
      const n = Math.floor(p.h[0] * p.h[1] * 0.006 * want);
      for (let k = 0; k < n; k++) {
        const u = (rnd() * 2 - 1) * (p.h[0] - 6);
        const v = (rnd() * 2 - 1) * (p.h[1] - 6);
        const x = p.c[0] + u * Math.cos(p.a) - v * Math.sin(p.a);
        const z = p.c[1] + u * Math.sin(p.a) + v * Math.cos(p.a);
        if (Math.abs(v) < 9 || this.onCarriageway(x, z, 3)) continue; // keep a lane free for the jump
        this.trees.push({ x, z, s: 0.8 + rnd() * 0.7, r: rnd() });
        this.addCollider(this.obb(x, z, 1, 0, 0.4, 0.4, C.terrainAt(x, z).h - 1, C.terrainAt(x, z).h + 7, 't'));
      }
    });
    for (let x = -MAP + 20; x < MAP - 20; x += 17) {
      for (let z = -MAP + 20; z < MAP - 20; z += 17) {
        const jx = x + (rnd() - 0.5) * 14;
        const jz = z + (rnd() - 0.5) * 14;
        const zone = C.zoneAt(jx, jz);
        if (zone !== 'hills' && zone !== 'outskirts' && zone !== 'beach') continue;
        const f = fbm(jx / 140, jz / 140, 77, 3);
        if (f < 0.5 || rnd() > want * (zone === 'beach' ? 0.25 : 0.8)) continue;
        if (C.coastDist(jx, jz) < 25 || this.onCarriageway(jx, jz, 5) || this.inLot(jx, jz, 2)) continue;
        const g = C.terrainAt(jx, jz).h;
        this.trees.push({ x: jx, z: jz, s: 0.8 + rnd() * 0.8, r: rnd() });
        this.addCollider(this.obb(jx, jz, 1, 0, 0.45, 0.45, g - 1, g + 7, 't'));
      }
    }
  }

  // stunt jumps in the parks
  genRamps() {
    const C = this.city;
    PARKS.forEach((p) => {
      const g = C.terrainAt(p.c[0], p.c[1]).h;
      this.ramps.push({ x: p.c[0], z: p.c[1], ca: Math.cos(p.a), sa: Math.sin(p.a), len: 18, w: 9, h: 3.0, y0: g });
    });
  }

  // ───────────── ground height and collisions ─────────────
  buildDeckIndex() {
    this.deckIdx = new SegIndex(40);
    this.city.edges.forEach((e) => {
      if (e.type !== 'expressway') return;
      for (let i = 0; i < e.pts.length - 1; i++) {
        if (e.lift[i] < 0.3 && e.lift[i + 1] < 0.3) continue;
        const a = e.pts[i];
        const b = e.pts[i + 1];
        const r = e.hw + 1;
        this.deckIdx.add({ e, i }, Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r);
      }
    });
  }

  // Ground height and slope. y is the car's current height: it decides whether a car under the
  // expressway is down on the street or up on the deck.
  groundAt(x, z, y = 0) {
    let deck = null;
    this.deckIdx.query(x, z, x, z, (it) => {
      const e = it.e;
      const a = e.pts[it.i];
      const b = e.pts[it.i + 1];
      const c = segClosest(x, z, a, b);
      if (c.d > e.hw + 0.4) return true;
      const lift = lerp(e.lift[it.i], e.lift[it.i + 1], c.t);
      if (lift < 0.3) return true;
      const dy = lerp(e.y[it.i], e.y[it.i + 1], c.t);
      if (lift > 4.8 && y < dy - 1.8) return true;
      if (!deck || dy > deck.h) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const g = (e.y[it.i + 1] - e.y[it.i]) / L;
        deck = { h: dy, gx: (g * (b[0] - a[0])) / L, gz: (g * (b[1] - a[1])) / L };
      }
      return true;
    });
    if (deck) return deck;
    const t = this.city.terrainAt(x, z);
    for (const r of this.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * r.ca + dz * r.sa + r.len / 2;
      const lat = -dx * r.sa + dz * r.ca;
      if (along >= 0 && along <= r.len && Math.abs(lat) <= r.w / 2) {
        const h = r.y0 + (r.h * along) / r.len;
        if (h > t.h) return { h, gx: (r.ca * r.h) / r.len, gz: (r.sa * r.h) / r.len };
      }
    }
    return t;
  }

  // Cars collide as two circles (front and rear half) so they fit beside kerbs and parked cars.
  collide(v) {
    v.contact = null;
    const fx = Math.sin(v.h || 0);
    const fz = Math.cos(v.h || 0);
    const off = v.halfLen !== undefined ? v.halfLen : 1.25;
    let impact = 0;
    for (const s of [off, -off]) {
      const ox = fx * s;
      const oz = fz * s;
      v.x += ox;
      v.z += oz;
      impact = Math.max(impact, this.collideCircle(v, v.bodyR || 1.1));
      v.x -= ox;
      v.z -= oz;
    }
    const lim = MAP;
    if (v.x > lim) { v.x = lim; if (v.vx > 0) { impact = Math.max(impact, v.vx); v.vx *= -0.3; } v.contact = { x: lim + 2, z: v.z }; }
    if (v.x < -lim) { v.x = -lim; if (v.vx < 0) { impact = Math.max(impact, -v.vx); v.vx *= -0.3; } v.contact = { x: -lim - 2, z: v.z }; }
    if (v.z > lim) { v.z = lim; if (v.vz > 0) { impact = Math.max(impact, v.vz); v.vz *= -0.3; } v.contact = { x: v.x, z: lim + 2 }; }
    if (v.z < -lim) { v.z = -lim; if (v.vz < 0) { impact = Math.max(impact, -v.vz); v.vz *= -0.3; } v.contact = { x: v.x, z: -lim - 2 }; }
    return impact;
  }

  collideCircle(v, r) {
    let impact = 0;
    this.colIdx.query(v.x - r, v.z - r, v.x + r, v.z + r, (c) => {
      if (v.y > c.h) return true;
      if (c.y0 !== undefined && v.y < c.y0 - 1.2) return true;
      const dx = v.x - c.x;
      const dz = v.z - c.z;
      const lu = dx * c.ca + dz * c.sa;
      const lv = -dx * c.sa + dz * c.ca;
      const cu = clamp(lu, -c.hu, c.hu);
      const cv = clamp(lv, -c.hv, c.hv);
      const du = lu - cu;
      const dv = lv - cv;
      const d2 = du * du + dv * dv;
      if (d2 >= r * r) return true;
      let nu;
      let nv;
      let pen;
      if (d2 < 1e-8) {
        const pu = c.hu - Math.abs(lu);
        const pv = c.hv - Math.abs(lv);
        if (pu < pv) { nu = Math.sign(lu) || 1; nv = 0; pen = pu + r; } else { nu = 0; nv = Math.sign(lv) || 1; pen = pv + r; }
      } else {
        const d = Math.sqrt(d2);
        nu = du / d;
        nv = dv / d;
        pen = r - d;
      }
      const nx = nu * c.ca - nv * c.sa;
      const nz = nu * c.sa + nv * c.ca;
      v.x += nx * pen;
      v.z += nz * pen;
      const vn = v.vx * nx + v.vz * nz;
      if (vn < 0) {
        v.vx -= 1.3 * vn * nx;
        v.vz -= 1.3 * vn * nz;
        v.vx *= 0.98;
        v.vz *= 0.98;
        impact = Math.max(impact, -vn);
      }
      v.contact = { x: c.x + cu * c.ca - cv * c.sa, z: c.z + cu * c.sa + cv * c.ca };
      return true;
    });
    return impact;
  }

  insideBuilding(x, z) {
    let hit = false;
    this.colIdx.query(x, z, x, z, (c) => {
      if (c.kind !== 'b') return true;
      const dx = x - c.x;
      const dz = z - c.z;
      if (Math.abs(dx * c.ca + dz * c.sa) < c.hu && Math.abs(-dx * c.sa + dz * c.ca) < c.hv) { hit = true; return false; }
      return true;
    });
    return hit;
  }

  los(ax, az, bx2, bz) {
    const d = Math.hypot(bx2 - ax, bz - az);
    const steps = Math.ceil(d / 7);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.insideBuilding(ax + (bx2 - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // ───────────── meshes ─────────────
  buildMeshes() {
    this.buildTerrain();
    this.buildWater();
    this.buildRoads();
    this.buildMarkings();
    this.buildExpressway();
    this.buildBarriers();
    this.buildCityBuildings();
    this.buildPort();
    this.buildSuburbs();
    this.buildSigns(mulberry32(this.seed + 13));
    this.buildStreetFurniture();
    this.buildTrafficLights();
    this.buildTrees();
    this.buildParkedCars();
    this.buildRamps();
    this.buildMountains();
    this.buildUtilities();
    this.buildForest();
    this.buildContactShadows();
  }

  // colour of the bare ground (lots, parks, beaches, hills)
  groundColor(x, z, h) {
    const C = this.city;
    if (h < SEA_Y + 0.2) return [0.3, 0.29, 0.25];
    if (Math.abs(x) > MAP + 80 || Math.abs(z) > MAP + 80) {
      const f = fbm(x / 180, z / 180, 5, 2);
      const forest = smoothstepW(0.45, 0.6, forestAt(x, z));
      return [lerp(0.25 + f * 0.1, 0.12, forest), lerp(0.31 + f * 0.08, 0.17, forest), lerp(0.17, 0.09, forest)];
    }
    const cd = C.coastDist(x, z);
    const zone = C.zoneAt(x, z);
    if (cd < 34 && zone !== 'port') return [0.74, 0.68, 0.53];
    if (C.park(x, z)) {
      const f = fbm(x / 30, z / 30, 8, 2);
      return [0.22 + f * 0.08, 0.36 + f * 0.1, 0.16];
    }
    const f = fbm(x / 60, z / 60, 4, 3);
    if (URBAN.has(zone)) return [0.36 + f * 0.08, 0.35 + f * 0.07, 0.33 + f * 0.06];
    if (zone === 'northgate' || zone === 'port') return [0.3 + f * 0.07, 0.3 + f * 0.06, 0.29 + f * 0.05];
    // grass with dry patches
    const dry = smooth01(fbm(x / 120, z / 120, 6, 2));
    return [lerp(0.24, 0.42, dry) + f * 0.06, lerp(0.34, 0.38, dry) + f * 0.05, lerp(0.16, 0.22, dry)];
  }

  buildTerrain() {
    const C = this.city;
    const N = C.tN;
    // render a slightly coarser mesh far out, full detail inside the map
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = -T_EXT + i * T_RES;
        const z = -T_EXT + j * T_RES;
        const h = C.H[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const c = this.groundColor(x, z, h);
        col[k * 3] = c[0];
        col[k * 3 + 1] = c[1];
        col[k * 3 + 2] = c[2];
        uv[k * 2] = x / 6;
        uv[k * 2 + 1] = z / 6;
      }
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // ground detail: grass blades, clover and soil specks (grey, so the vertex colour sets the hue)
    const detail = canvasTexture(512, 512, (gg, w, h) => {
      gg.fillStyle = 'rgb(176,176,176)';
      gg.fillRect(0, 0, w, h);
      const r2 = mulberry32(31);
      for (let i = 0; i < 9; i++) {
        const x = r2() * w; const y = r2() * h; const rr = 30 + r2() * 90;
        const gr = gg.createRadialGradient(x, y, 0, x, y, rr);
        const v = r2() < 0.5 ? 120 : 215;
        gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
        gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        gg.fillStyle = gr;
        gg.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      for (let i = 0; i < 26000; i++) {
        const x = r2() * w; const y = r2() * h;
        const v = 90 + r2() * 165;
        gg.strokeStyle = `rgba(${v},${v},${v},${0.35 + r2() * 0.4})`;
        gg.lineWidth = 0.8 + r2() * 0.8;
        const a = -Math.PI / 2 + (r2() - 0.5) * 1.2;
        const L = 3 + r2() * 7;
        gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); gg.stroke();
      }
      for (let i = 0; i < 2500; i++) {
        const v = 60 + r2() * 80;
        gg.fillStyle = `rgba(${v},${v * 0.95 | 0},${v * 0.85 | 0},0.5)`;
        gg.fillRect(r2() * w, r2() * h, 1 + r2() * 2, 1 + r2() * 2);
      }
    });
    detail.wrapS = THREE.RepeatWrapping;
    detail.wrapT = THREE.RepeatWrapping;
    detail.anisotropy = 8;
    this.terrainMat = new THREE.MeshStandardMaterial({ map: detail, vertexColors: true, roughness: 0.95 });
    // sample the detail at a second, much larger scale too, so no tiling shows from a distance
    this.terrainMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 t1 = texture2D( map, vMapUv );
        vec4 t2 = texture2D( map, vMapUv * 0.0731 + vec2( 0.37, 0.61 ) );
        vec4 t3 = texture2D( map, vMapUv * 0.0113 + vec2( 0.11, 0.83 ) );
        diffuseColor.rgb *= t1.rgb * ( 0.55 + 0.9 * t2.rgb ) * ( 0.6 + 0.8 * t3.rgb ) * 2.6;
      `);
    };
    const m = new THREE.Mesh(g, this.terrainMat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildWater() {
    const hc = makeCanvas(256, 256);
    const hg = hc.getContext('2d');
    const rnd = mulberry32(91);
    hg.fillStyle = '#808080';
    hg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 4 + rnd() * 18;
      const g = hg.createRadialGradient(x, y, 0, x, y, r);
      const v = rnd() < 0.5 ? 255 : 0;
      g.addColorStop(0, `rgba(${v},${v},${v},0.25)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      hg.fillStyle = g;
      hg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.waterNormal = toTexture(normalFromHeight(hc, 3), false);
    this.waterNormal.repeat.set(500, 500);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x0d2a33, roughness: 0.05, metalness: 0.25, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.5 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = SEA_Y;
    water.receiveShadow = true;
    this.group.add(water);
    // sea wall with a railing along the shore
    const wall = new Builder();
    const rail = [];
    const W0 = { r: 1, g: 1, b: 1 };
    const sw = this.seawall;
    let s = 0;
    for (let k = 1; k < sw.length; k++) {
      const a = sw[k - 1];
      const b = sw[k];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = (b.z - a.z) / L; // seaward normal
      const nz = -(b.x - a.x) / L;
      const ta = a.y + 0.35;
      const tb = b.y + 0.35;
      wall.quad([a.x, -6, a.z], [b.x, -6, b.z], [b.x, tb, b.z], [a.x, ta, a.z], [-nx, 0, -nz], [s / 4, 0], [(s + L) / 4, 0], [(s + L) / 4, 1.6], [s / 4, 1.6], W0);
      wall.quad([a.x, ta, a.z], [b.x, tb, b.z], [b.x - nx * 0.8, tb, b.z - nz * 0.8], [a.x - nx * 0.8, ta, a.z - nz * 0.8], [0, 1, 0], [0, 0], [1, 0], [1, 0.2], [0, 0.2], W0);
      const steps = Math.ceil(L / 2.5);
      for (let q = 0; q < steps; q++) {
        const t = q / steps;
        rail.push(bx(0.07, 1.0, 0.07, lerp(a.x, b.x, t) - nx * 0.4, lerp(ta, tb, t) + 0.5, lerp(a.z, b.z, t) - nz * 0.4));
      }
      const top = new THREE.BoxGeometry(L, 0.07, 0.07);
      top.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      top.translate((a.x + b.x) / 2 - nx * 0.4, (ta + tb) / 2 + 1.0, (a.z + b.z) / 2 - nz * 0.4);
      rail.push(ni(top));
      s += L;
    }
    const stone = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = '#6d6a63';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
          const v = 90 + rnd() * 40;
          g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
          g.fillRect(x + 1, y + 1, 30, 14);
        }
      }
    });
    stone.wrapS = THREE.RepeatWrapping;
    stone.wrapT = THREE.RepeatWrapping;
    if (!wall.empty) this.group.add(new THREE.Mesh(wall.geometry(), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 })));
    if (rail.length) this.group.add(new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.7, roughness: 0.4 })));
  }

  // y of the road surface at a point of an edge (deck height on the expressway)
  roadY(e, x, z, lift, deckY) {
    return lift > 0.3 ? deckY : this.city.terrainAt(x, z).h;
  }

  buildRoads() {
    const C = this.city;
    const gt = groundTextures(3);
    this.groundMat = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, roughnessMap: gt.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const road = new Builder();
    const walk = new Builder();
    const curb = new Builder();
    const W0 = { r: 1, g: 1, b: 1 };
    const UP = [0, 1, 0];
    const RY = 0.05; // road surface above the terrain
    const uvw = (x, z) => [x / 4, z / 4];
    // ribbons along each edge between its junction cut-backs
    C.edges.forEach((e) => {
      const s0 = e.t0;
      const s1 = e.len - e.t1;
      if (s1 - s0 < 0.5) return;
      const ss = [s0];
      e.cum.forEach((c) => { if (c > s0 + 0.5 && c < s1 - 0.5) ss.push(c); });
      ss.push(s1);
      const rows = ss.map((s) => {
        const p = C.at(e, s);
        const rx = -p.dz;
        const rz = p.dx;
        const row = {};
        [-1, 0, 1].forEach((k) => {
          const x = p.x + rx * e.hw * k;
          const z = p.z + rz * e.hw * k;
          row[k] = [x, this.roadY(e, x, z, p.lift, p.y) + RY, z];
        });
        const sw = e.T.sidewalk;
        if (sw > 0 && p.lift < 0.3) {
          [-1, 1].forEach((k) => {
            const xi = p.x + rx * e.hw * k;
            const zi = p.z + rz * e.hw * k;
            const xo = p.x + rx * (e.hw + sw) * k;
            const zo = p.z + rz * (e.hw + sw) * k;
            row['wi' + k] = [xi, C.terrainAt(xi, zi).h + SIDEWALK_H + RY, zi];
            row['wo' + k] = [xo, C.terrainAt(xo, zo).h + SIDEWALK_H + RY, zo];
            row['ci' + k] = [xi, row[k][1] - 0.02, zi];
          });
        }
        return row;
      });
      for (let r = 1; r < rows.length; r++) {
        const A = rows[r - 1];
        const B = rows[r];
        road.quad(A[-1], A[0], B[0], B[-1], UP, uvw(A[-1][0], A[-1][2]), uvw(A[0][0], A[0][2]), uvw(B[0][0], B[0][2]), uvw(B[-1][0], B[-1][2]), W0);
        road.quad(A[0], A[1], B[1], B[0], UP, uvw(A[0][0], A[0][2]), uvw(A[1][0], A[1][2]), uvw(B[1][0], B[1][2]), uvw(B[0][0], B[0][2]), W0);
        if (A.wi1 && B.wi1) {
          [-1, 1].forEach((k) => {
            const ai = A['wi' + k];
            const ao = A['wo' + k];
            const bi = B['wi' + k];
            const bo = B['wo' + k];
            if (k > 0) walk.quad(ai, ao, bo, bi, UP, [ai[0] / 3, ai[2] / 3], [ao[0] / 3, ao[2] / 3], [bo[0] / 3, bo[2] / 3], [bi[0] / 3, bi[2] / 3], W0);
            else walk.quad(ai, bi, bo, ao, UP, [ai[0] / 3, ai[2] / 3], [bi[0] / 3, bi[2] / 3], [bo[0] / 3, bo[2] / 3], [ao[0] / 3, ao[2] / 3], W0);
            const ci = A['ci' + k];
            const di = B['ci' + k];
            const n = [-(B[0][2] - A[0][2]) * k, 0, (B[0][0] - A[0][0]) * k];
            const nl = Math.hypot(n[0], n[2]) || 1;
            curb.quad(ci, di, bi, ai, [-n[0] / nl, 0, -n[2] / nl], [0, 0], [1, 0], [1, 0.1], [0, 0.1], W0);
          });
        }
      }
    });
    // junction surfaces with rounded kerbs, and the sidewalk corners around them
    C.nodes.forEach((n) => {
      if (n.deg === 0) return;
      const ny = C.terrainAt(n.x, n.z).h + RY + 0.004;
      if (n.deg === 1) {
        // cul-de-sac / dead end: a turning circle
        const e = C.edges[n.out[0].ei];
        if (e.lift[0] > 0.3 && e.lift[e.lift.length - 1] > 0.3) return;
        const r = e.hw + 2.5;
        const seg = 20;
        for (let k = 0; k < seg; k++) {
          const a0 = (k / seg) * Math.PI * 2;
          const a1 = ((k + 1) / seg) * Math.PI * 2;
          const p0 = [n.x + Math.cos(a0) * r, 0, n.z + Math.sin(a0) * r];
          const p1 = [n.x + Math.cos(a1) * r, 0, n.z + Math.sin(a1) * r];
          p0[1] = C.terrainAt(p0[0], p0[2]).h + RY;
          p1[1] = C.terrainAt(p1[0], p1[2]).h + RY;
          road.tri([n.x, ny, n.z], p1, p0, UP, uvw(n.x, n.z), uvw(p1[0], p1[2]), uvw(p0[0], p0[2]), W0);
        }
        return;
      }
      const elevatedNode = n.out.some((o) => {
        const e = C.edges[o.ei];
        return (o.fwd ? e.lift[0] : e.lift[e.lift.length - 1]) > 0.3;
      });
      if (elevatedNode) return;
      const arms = n.out.map((o) => {
        const e = C.edges[o.ei];
        const t = n.trim[o.ei];
        const p = o.fwd ? C.at(e, t) : C.at(e, e.len - t);
        const ux = o.fwd ? p.dx : -p.dx;
        const uz = o.fwd ? p.dz : -p.dz;
        const Rx = -uz; // toward the next arm (increasing angle)
        const Rz = ux;
        return { e, p, ux, uz, R: [p.x + Rx * e.hw, p.z + Rz * e.hw], L: [p.x - Rx * e.hw, p.z - Rz * e.hw], Rn: [Rx, Rz], sw: e.T.sidewalk };
      });
      const ring = [];
      const corners = [];
      arms.forEach((a, i) => {
        const b = arms[(i + 1) % arms.length];
        ring.push(a.L, a.R);
        // kerb curve from this arm's right edge to the next arm's left edge
        const P0 = a.R;
        const P2 = b.L;
        let K = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2];
        const den = (-a.ux) * (-b.uz) - (-a.uz) * (-b.ux);
        if (Math.abs(den) > 0.08) {
          const t = ((P2[0] - P0[0]) * (-b.uz) - (P2[1] - P0[1]) * (-b.ux)) / den;
          if (t > 0 && t < 40) K = [P0[0] - a.ux * t, P0[1] - a.uz * t];
        }
        const curve = [];
        for (let k = 1; k < 8; k++) {
          const t = k / 8;
          curve.push([(1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * K[0] + t * t * P2[0], (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * K[1] + t * t * P2[1]]);
        }
        curve.forEach((c) => ring.push(c));
        corners.push({ pts: [P0, ...curve, P2], sw: Math.min(a.sw, b.sw) });
      });
      const Y = (q) => [q[0], C.terrainAt(q[0], q[1]).h + RY + 0.004, q[1]];
      for (let k = 0; k < ring.length; k++) {
        const p0 = Y(ring[k]);
        const p1 = Y(ring[(k + 1) % ring.length]);
        road.tri([n.x, ny, n.z], p1, p0, UP, uvw(n.x, n.z), uvw(p1[0], p1[2]), uvw(p0[0], p0[2]), W0);
      }
      // sidewalk corners: offset the kerb curve away from the junction
      corners.forEach((c) => {
        if (c.sw <= 0) return;
        const pts = c.pts;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1];
          const b = pts[k];
          const nrm = (p, q) => {
            let nx = -(q[1] - p[1]);
            let nz = q[0] - p[0];
            const l = Math.hypot(nx, nz) || 1;
            nx /= l;
            nz /= l;
            // point away from the junction centre
            if ((p[0] - n.x) * nx + (p[1] - n.z) * nz < 0) { nx = -nx; nz = -nz; }
            return [nx, nz];
          };
          const na = nrm(pts[Math.max(0, k - 2)], pts[Math.min(pts.length - 1, k)]);
          const nb = nrm(pts[k - 1], pts[Math.min(pts.length - 1, k + 1)]);
          const ai = [a[0], 0, a[1]];
          const bi = [b[0], 0, b[1]];
          const ao = [a[0] + na[0] * c.sw, 0, a[1] + na[1] * c.sw];
          const bo = [b[0] + nb[0] * c.sw, 0, b[1] + nb[1] * c.sw];
          [ai, bi, ao, bo].forEach((q) => { q[1] = C.terrainAt(q[0], q[2]).h + SIDEWALK_H + RY; });
          walk.quad(ai, bi, bo, ao, UP, [ai[0] / 3, ai[2] / 3], [bi[0] / 3, bi[2] / 3], [bo[0] / 3, bo[2] / 3], [ao[0] / 3, ao[2] / 3], W0);
          const ci = [a[0], ai[1] - SIDEWALK_H - 0.02, a[1]];
          const di = [b[0], bi[1] - SIDEWALK_H - 0.02, b[1]];
          curb.quad(ci, di, bi, ai, [-(na[0] + nb[0]) / 2, 0, -(na[1] + nb[1]) / 2], [0, 0], [1, 0], [1, 0.1], [0, 0.1], W0);
        }
      });
    });
    const roadMesh = new THREE.Mesh(road.geometry(), this.groundMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);
    const pv = pavingTextures(8);
    const walkMesh = new THREE.Mesh(walk.geometry(), new THREE.MeshStandardMaterial({ map: pv.map, normalMap: pv.normalMap, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
    const curbMesh = new THREE.Mesh(curb.geometry(), new THREE.MeshStandardMaterial({ color: 0xa3a3a0, roughness: 0.85, side: THREE.DoubleSide }));
    [walkMesh, curbMesh].forEach((m) => { m.receiveShadow = true; this.group.add(m); });
  }

  buildMarkings() {
    const C = this.city;
    const white = new Builder();
    const yellow = new Builder();
    const W0 = { r: 1, g: 1, b: 1 };
    const UP = [0, 1, 0];
    const MY = 0.075;
    // a painted stripe along an edge, from s0 to s1 at lateral offset lat (+ = right of a->b)
    const stripe = (B, e, s0, s1, lat, w, step = 3) => {
      if (s1 - s0 < 0.3) return;
      const n = Math.max(1, Math.ceil((s1 - s0) / step));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const s = lerp(s0, s1, k / n);
        const p = C.at(e, s);
        const rx = -p.dz;
        const rz = p.dx;
        const pt = (o) => {
          const x = p.x + rx * (lat + o);
          const z = p.z + rz * (lat + o);
          return [x, this.roadY(e, x, z, p.lift, p.y) + MY, z];
        };
        const cur = [pt(-w / 2), pt(w / 2), s];
        if (prev) B.quad(prev[0], prev[1], cur[1], cur[0], UP, [0, prev[2] / 4], [1, prev[2] / 4], [1, s / 4], [0, s / 4], W0);
        prev = cur;
      }
    };
    C.edges.forEach((e) => {
      const T = e.T;
      const s0 = e.t0 + 0.6;
      const s1 = e.len - e.t1 - 0.6;
      if (s1 <= s0) return;
      // centre line: double yellow, or yellow edges of a median
      if (T.median >= 1) {
        stripe(yellow, e, s0, s1, -(T.median - 0.25), 0.14);
        stripe(yellow, e, s0, s1, T.median - 0.25, 0.14);
      } else {
        stripe(yellow, e, s0, s1, -0.13, 0.11);
        stripe(yellow, e, s0, s1, 0.13, 0.11);
      }
      // lane lines (dashed) and edge lines (solid)
      for (let k = 1; k < T.lanes; k++) {
        const lat = T.median + T.laneW * k;
        for (let s = s0 + 2; s < s1 - 3; s += 9) {
          stripe(white, e, s, Math.min(s + 3, s1), lat, 0.13, 3);
          stripe(white, e, s, Math.min(s + 3, s1), -lat, 0.13, 3);
        }
      }
      const edgeLat = T.median + T.laneW * T.lanes + 0.12;
      if (edgeLat < e.hw - 0.3) {
        stripe(white, e, s0, s1, edgeLat, 0.15);
        stripe(white, e, s0, s1, -edgeLat, 0.15);
      }
    });
    // crosswalks and stop lines at city junctions
    C.nodes.forEach((n) => {
      if (!n.junction) return;
      n.out.forEach((o) => {
        const e = C.edges[o.ei];
        if (e.T.barrier || e.type === 'residential') return;
        const t = n.trim[o.ei];
        const sz = (d) => (o.fwd ? d : e.len - d);
        // zebra: stripes along the road, spaced across it
        const zc = t + 2.4;
        for (let lat = -e.hw + 1.0; lat <= e.hw - 0.8; lat += 1.15) stripe(white, e, sz(zc - 1.6) < sz(zc + 1.6) ? sz(zc - 1.6) : sz(zc + 1.6), Math.max(sz(zc - 1.6), sz(zc + 1.6)), lat, 0.55, 3.2);
        // stop line across the arriving lanes (the right-hand half for traffic coming in)
        const sl = t + 5.3;
        const half = o.fwd ? -1 : 1; // arriving traffic drives toward the node: its right is -R for fwd edges
        const a = sz(sl - 0.25);
        const b = sz(sl + 0.25);
        stripe(white, e, Math.min(a, b), Math.max(a, b), half * (e.hw / 2), e.hw - 0.6, 1);
      });
    });
    const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4, transparent: true, opacity: 0.86, depthWrite: false });
    const wm = new THREE.Mesh(white.geometry(), mat(0xb4b4ae));
    const ym = new THREE.Mesh(yellow.geometry(), mat(0xb48a12));
    [wm, ym].forEach((m) => { m.receiveShadow = true; m.renderOrder = 1; this.group.add(m); });
  }

  // the elevated expressway: deck sides, underside, piers, ramp embankments, gantry signs
  buildExpressway() {
    const C = this.city;
    const side = new Builder();
    const W0 = { r: 1, g: 1, b: 1 };
    C.edges.forEach((e) => {
      if (e.type !== 'expressway') return;
      for (let i = 0; i < e.pts.length - 1; i++) {
        if (e.lift[i] < 0.3 && e.lift[i + 1] < 0.3) continue;
        const a = e.pts[i];
        const b = e.pts[i + 1];
        const ta = e.tan[i];
        const tb = e.tan[i + 1];
        const ya = e.y[i];
        const yb = e.y[i + 1];
        [-1, 1].forEach((sd) => {
          const pa = [a[0] - ta[1] * (e.hw + 0.5) * sd, a[1] + ta[0] * (e.hw + 0.5) * sd];
          const pb = [b[0] - tb[1] * (e.hw + 0.5) * sd, b[1] + tb[0] * (e.hw + 0.5) * sd];
          const ga = e.lift[i] < 4.8 ? C.terrainAt(pa[0], pa[1]).h - 0.5 : ya - 1.5;
          const gb = e.lift[i + 1] < 4.8 ? C.terrainAt(pb[0], pb[1]).h - 0.5 : yb - 1.5;
          const nrm = [-ta[1] * sd, 0, ta[0] * sd];
          side.quad([pa[0], ga, pa[1]], [pb[0], gb, pb[1]], [pb[0], yb + 0.1, pb[1]], [pa[0], ya + 0.1, pa[1]], nrm, [e.cum[i] / 6, 0], [e.cum[i + 1] / 6, 0], [e.cum[i + 1] / 6, 0.4], [e.cum[i] / 6, 0.4], W0);
        });
        if (e.lift[i] >= 4.8 && e.lift[i + 1] >= 4.8) {
          const l = (p, t, o) => [p[0] - t[1] * o, p[1] + t[0] * o];
          const al = l(a, ta, -(e.hw + 0.5));
          const ar = l(a, ta, e.hw + 0.5);
          const bl = l(b, tb, -(e.hw + 0.5));
          const br = l(b, tb, e.hw + 0.5);
          side.quad([al[0], ya - 1.5, al[1]], [ar[0], ya - 1.5, ar[1]], [br[0], yb - 1.5, br[1]], [bl[0], yb - 1.5, bl[1]], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], W0);
        }
      }
    });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9b9891, roughness: 0.85, side: THREE.DoubleSide });
    const sm = new THREE.Mesh(side.geometry(), concrete);
    sm.castShadow = true;
    sm.receiveShadow = true;
    this.group.add(sm);
    // T-shaped piers
    const parts = [];
    this.piers.forEach((p) => {
      const h = p.top - p.g;
      const col = new THREE.CylinderGeometry(1.0, 1.15, h, 14);
      col.translate(p.x, p.g + h / 2, p.z);
      parts.push(ni(col));
      const cap = new THREE.BoxGeometry(p.w * 0.8, 1.3, 2.2);
      cap.rotateY(p.rot + Math.PI / 2);
      cap.translate(p.x, p.top - 0.65, p.z);
      parts.push(ni(cap));
    });
    if (parts.length) {
      const pm = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.9 }));
      pm.castShadow = true;
      pm.receiveShadow = true;
      this.group.add(pm);
    }
    // overhead sign gantries
    const ex = C.edges.find((e) => e.type === 'expressway');
    if (!ex) return;
    const gantry = [];
    const signTex = canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = '#0f5b2e';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#fff';
      g.font = 'bold 46px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DOWNTOWN  •  PORT  •  I-9', w / 2, h / 2 + 2);
    });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.15 });
    [0.3, 0.7].forEach((f) => {
      const p = C.at(ex, ex.len * f);
      const rx = -p.dz;
      const rz = p.dx;
      [-1, 1].forEach((sd) => {
        const g = new THREE.BoxGeometry(0.4, 6.4, 0.4);
        g.translate(p.x + rx * (ex.hw - 0.4) * sd, p.y + 3.2, p.z + rz * (ex.hw - 0.4) * sd);
        gantry.push(ni(g));
      });
      const beam = new THREE.BoxGeometry(ex.hw * 2, 0.4, 0.4);
      beam.rotateY(-Math.atan2(rz, rx));
      beam.translate(p.x, p.y + 6.3, p.z);
      gantry.push(ni(beam));
      [-1, 1].forEach((k) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), signMat);
        m.position.set(p.x + p.dx * 0.3 * k, p.y + 5, p.z + p.dz * 0.3 * k);
        m.rotation.y = Math.atan2(p.dx * k, p.dz * k);
        this.group.add(m);
      });
    });
    this.group.add(new THREE.Mesh(mergeGeometries(gantry), new THREE.MeshStandardMaterial({ color: 0x5e636b, metalness: 0.6, roughness: 0.5 })));
  }

  // concrete jersey barriers swept along the highway edges and median
  buildBarriers() {
    const prof = [[-0.3, 0], [-0.12, 0.3], [-0.09, 0.95], [0.09, 0.95], [0.12, 0.3], [0.3, 0]];
    const b = new Builder();
    const W0 = { r: 1, g: 1, b: 1 };
    this.barrierRuns.forEach(({ run }) => {
      for (let k = 1; k < run.length; k++) {
        const A = run[k - 1];
        const B = run[k];
        const L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
        const rx = -(B.z - A.z) / L;
        const rz = (B.x - A.x) / L;
        for (let q = 0; q < prof.length - 1; q++) {
          const [l0, h0] = prof[q];
          const [l1, h1] = prof[q + 1];
          const p = (P, l, h) => [P.x + rx * l, P.y + h, P.z + rz * l];
          const nx = -(h1 - h0);
          const ny = l1 - l0;
          const nl = Math.hypot(nx, ny) || 1;
          b.quad(p(A, l0, h0), p(B, l0, h0), p(B, l1, h1), p(A, l1, h1), [(rx * nx) / nl, ny / nl, (rz * nx) / nl], [0, 0], [1, 0], [1, 1], [0, 1], W0);
        }
      }
    });
    const m = new THREE.Mesh(b.geometry(), new THREE.MeshStandardMaterial({ color: 0xb7b4ad, roughness: 0.85, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    m.castShadow = true;
    this.group.add(m);
  }

  // city buildings: facades merged per type/variant, built in each lot's rotated frame
  buildCityBuildings() {
    const G = this.group;
    const rnd = mulberry32(4242);
    const W0 = { r: 1, g: 1, b: 1 };
    const types = ['glass', 'office', 'brick', 'stone'];
    const VARIANTS = 2;
    const fb = {};
    types.forEach((t) => { for (let v = 0; v < VARIANTS; v++) fb[t + v] = new Builder(true); });
    const fkey = (b) => b.type + (Math.floor(b.tint * 997) % VARIANTS);
    const shopsB = [new Builder(true), new Builder(true), new Builder(true)];
    const roofs = new Builder(true);
    const roofProps = [];
    const tintFor = (b) => {
      const k = 0.88 + b.tint * 0.2;
      return { r: k, g: k * (0.98 + b.tint * 0.04), b: k * (0.96 + (1 - b.tint) * 0.06) };
    };
    const trims = [];
    const tanks = [];
    const escapes = [];
    this.buildings.forEach((b) => {
      const B = (g) => xf(g, b);
      fb[fkey(b)].setT(b.x, b.z, b.ca, b.sa);
      roofs.setT(b.x, b.z, b.ca, b.sa);
      shopsB.forEach((s) => s.setT(b.x, b.z, b.ca, b.sa));
      const aoB = { y: b.base + 0.4, h: 3.2, k: 0.5 };
      fb[fkey(b)].ao = aoB;
      shopsB.forEach((s) => { s.ao = aoB; });
      const addTier = (x0, x1, z0, z1, y0, y1) => {
        fb[fkey(b)].walls(x0, x1, z0, z1, y0, y1, TEX_SPAN, tintFor(b), 0);
        roofs.top(x0, x1, z0, z1, y1, 12, W0);
        if (b.type !== 'glass') {
          const o = 0.7;
          trims.push(B(bx(x1 - x0 + o * 2, 0.9, z1 - z0 + o * 2, (x0 + x1) / 2, y1 - 0.2, (z0 + z1) / 2)));
          for (let y = y0 + FLOOR * 3; y < y1 - FLOOR * 1.5; y += FLOOR * 4) trims.push(B(bx(x1 - x0 + 0.5, 0.25, z1 - z0 + 0.5, (x0 + x1) / 2, y, (z0 + z1) / 2)));
        }
        const t = 0.35;
        const ph = 1.1;
        roofProps.push(B(bx(x1 - x0, ph, t, (x0 + x1) / 2, y1 + ph / 2, z0 + t / 2)), B(bx(x1 - x0, ph, t, (x0 + x1) / 2, y1 + ph / 2, z1 - t / 2)));
        roofProps.push(B(bx(t, ph, z1 - z0, x0 + t / 2, y1 + ph / 2, (z0 + z1) / 2)), B(bx(t, ph, z1 - z0, x1 - t / 2, y1 + ph / 2, (z0 + z1) / 2)));
      };
      const X0 = -b.hu;
      const X1 = b.hu;
      const Z0 = -b.hv;
      const Z1 = b.hv;
      const base = b.base;
      const start = b.shops ? base + 0.4 + STORE_H : base;
      if (b.shops) {
        fb[fkey(b)].walls(X0 + 0.6, X1 - 0.6, Z0 + 0.6, Z1 - 0.6, base, start, TEX_SPAN, tintFor(b));
        shopsB[Math.floor(b.tint * 7919) % 3].walls(X0, X1, Z0, Z1, base, start, 28, W0, base + 0.4, -0.4, STORE_H);
        roofProps.push(B(bx(X1 - X0 + 0.6, 0.25, 0.9, 0, start, Z1 + 0.2)), B(bx(X1 - X0 + 0.6, 0.25, 0.9, 0, start, Z0 - 0.2)));
        roofProps.push(B(bx(0.9, 0.25, Z1 - Z0, X1 + 0.2, start, 0)), B(bx(0.9, 0.25, Z1 - Z0, X0 - 0.2, start, 0)));
      }
      const top = b.top;
      if (b.h > 70 && rnd() < 0.75) {
        const podium = base + Math.min(b.h * 0.35, 40);
        addTier(X0, X1, Z0, Z1, start, podium);
        const ix = (X1 - X0) * (0.12 + rnd() * 0.1);
        const iz = (Z1 - Z0) * (0.12 + rnd() * 0.1);
        const mid = podium + (top - podium) * (0.7 + rnd() * 0.15);
        addTier(X0 + ix, X1 - ix, Z0 + iz, Z1 - iz, podium, mid);
        const ix2 = ix + (X1 - X0) * 0.08;
        const iz2 = iz + (Z1 - Z0) * 0.08;
        addTier(X0 + ix2, X1 - ix2, Z0 + iz2, Z1 - iz2, mid, top);
        b.roofTop = { x0: X0 + ix2, x1: X1 - ix2, z0: Z0 + iz2, z1: Z1 - iz2, y: top };
        if (rnd() < 0.5) roofProps.push(B(cy(0.25, 0.4, 18 + rnd() * 20, 0, top + 10, 0, 6)));
      } else {
        addTier(X0, X1, Z0, Z1, start, top);
        b.roofTop = { x0: X0, x1: X1, z0: Z0, z1: Z1, y: top };
      }
      const rt = b.roofTop;
      const nProps = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < nProps; k++) {
        const w = 2 + rnd() * 3;
        const d = 1.5 + rnd() * 2.5;
        if (rt.x1 - rt.x0 < w * 2 + 2 || rt.z1 - rt.z0 < d * 2 + 2) continue;
        roofProps.push(B(bx(w, 1.2 + rnd() * 1.5, d, lerp(rt.x0 + w, rt.x1 - w, rnd()), rt.y + 0.8, lerp(rt.z0 + d, rt.z1 - d, rnd()))));
      }
      if (b.type !== 'glass' && b.h < 80 && rnd() < 0.55 && rt.x1 - rt.x0 > 9 && rt.z1 - rt.z0 > 9) {
        const [tx, tz] = toW(b, lerp(rt.x0 + 4, rt.x1 - 4, rnd()), lerp(rt.z0 + 4, rt.z1 - 4, rnd()));
        tanks.push({ x: tx, y: rt.y + 1, z: tz, s: 0.8 + rnd() * 0.5 });
      }
      if (b.type === 'brick' && b.h < 50 && b.h > 12 && rnd() < 0.7) {
        // fire escape on one long side
        const alongU = X1 - X0 > Z1 - Z0;
        const w = 6;
        for (let y = base + STORE_H + 2.5; y < top - 2; y += FLOOR) {
          if (alongU) {
            const c = Z1 + 0.8;
            escapes.push(B(bx(w, 0.08, 1.5, 0, y, c)), B(bx(w, 1.0, 0.05, 0, y + 0.5, c + 0.72)), B(bx(0.06, 0.06, 1.4, -w / 2, y + 1.0, c)), B(bx(0.06, 0.06, 1.4, w / 2, y + 1.0, c)));
            const st = new THREE.BoxGeometry(Math.hypot(w * 0.8, FLOOR), 0.06, 0.7);
            st.rotateZ(Math.atan2(FLOOR, w * 0.8));
            st.translate(0, y + FLOOR / 2, c);
            escapes.push(B(ni(st)));
          } else {
            const c = X1 + 0.8;
            escapes.push(B(bx(1.5, 0.08, w, c, y, 0)), B(bx(0.05, 1.0, w, c + 0.72, y + 0.5, 0)), B(bx(1.4, 0.06, 0.06, c, y + 1.0, -w / 2)), B(bx(1.4, 0.06, 0.06, c, y + 1.0, w / 2)));
            const st = new THREE.BoxGeometry(0.7, 0.06, Math.hypot(w * 0.8, FLOOR));
            st.rotateX(-Math.atan2(FLOOR, w * 0.8));
            st.translate(c, y + FLOOR / 2, 0);
            escapes.push(B(ni(st)));
          }
        }
      }
    });
    const texSize = this.quality === 'low' ? 512 : 1024;
    Object.keys(fb).forEach((key, k) => {
      if (fb[key].empty) return;
      const t = key.slice(0, -1);
      const tex = facadeTextures(t, 20 + k * 7, texSize);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1,
        roughnessMap: tex.roughnessMap, metalnessMap: tex.metalnessMap, normalMap: tex.normalMap,
        roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: t === 'glass' ? 1.4 : 0.8,
      });
      this.facadeMats.push(mat);
      const mesh = new THREE.Mesh(fb[key].geometry(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      G.add(mesh);
    });
    if (!this.facadeMats.length) this.facadeMats.push(new THREE.MeshStandardMaterial({ color: 0x777777 }));
    this.shopMats = shopsB.map((sb, k) => {
      const st = storefrontTextures(31 + k * 13);
      const mat = new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.45, metalness: 0.1, vertexColors: true });
      if (!sb.empty) {
        const shopMesh = new THREE.Mesh(sb.geometry(), mat);
        shopMesh.receiveShadow = true;
        G.add(shopMesh);
      }
      return mat;
    });
    const roofTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#5d5e60';
      g.fillRect(0, 0, w, h);
      noise(g, w, h, mulberry32(5), 14000, 2, 0.25);
    });
    roofTex.wrapS = THREE.RepeatWrapping;
    roofTex.wrapT = THREE.RepeatWrapping;
    if (!roofs.empty) G.add(new THREE.Mesh(roofs.geometry(), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95, vertexColors: true })));
    if (trims.length) {
      const tm = new THREE.Mesh(mergeGeometries(trims), new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.85 }));
      tm.castShadow = true;
      tm.receiveShadow = true;
      G.add(tm);
    }
    if (tanks.length) {
      const wood = canvasTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#6a5038';
        g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 8) { g.fillStyle = `rgba(0,0,0,${0.1 + (x % 16 ? 0.1 : 0)})`; g.fillRect(x, 0, 2, h); }
        g.fillStyle = '#2a2420';
        [20, 60, 100].forEach((y) => g.fillRect(0, y, w, 5));
      });
      const barrel = new THREE.CylinderGeometry(2.2, 2.3, 4.2, 16, 1, true);
      barrel.translate(0, 5.1, 0);
      const cap = new THREE.ConeGeometry(2.5, 1.6, 16);
      cap.translate(0, 8, 0);
      const tankGeo = mergeGeometries([ni(barrel), ni(cap)]);
      G.add(instanced(tankGeo, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9, side: THREE.DoubleSide }), tanks, (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.setScalar(t.s); }));
      const legs = mergeGeometries([[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].map(([x, z]) => bx(0.2, 3, 0.2, x, 1.5, z)).concat([bx(3.2, 0.2, 3.2, 0, 3, 0)]));
      G.add(instanced(legs, new THREE.MeshStandardMaterial({ color: 0x2b2a28, metalness: 0.6, roughness: 0.6 }), tanks, (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.setScalar(t.s); }));
    }
    if (escapes.length) G.add(new THREE.Mesh(mergeGeometries(escapes), new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0.7, roughness: 0.6 })));
    if (roofProps.length) {
      const propMesh = new THREE.Mesh(mergeGeometries(roofProps), new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: 0.7, metalness: 0.3 }));
      propMesh.castShadow = true;
      propMesh.receiveShadow = true;
      G.add(propMesh);
    }
    // aviation beacons on the tallest towers
    const tall = this.buildings.filter((b) => b.h > 110);
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 3 });
    G.add(instanced(new THREE.SphereGeometry(0.7, 8, 6), this.beaconMat, tall, (b, d) => {
      const [x, z] = toW(b, (b.roofTop.x0 + b.roofTop.x1) / 2, (b.roofTop.z0 + b.roofTop.z1) / 2);
      d.position.set(x, b.roofTop.y + 1.6, z);
    }));
  }

  buildPort() {
    const G = this.group;
    const corr = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#8d9499';
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) {
        const grd = g.createLinearGradient(x, 0, x + 8, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0.18)');
        grd.addColorStop(0.5, 'rgba(0,0,0,0.12)');
        grd.addColorStop(1, 'rgba(255,255,255,0.18)');
        g.fillStyle = grd;
        g.fillRect(x, 0, 8, h);
      }
      g.fillStyle = '#3c4146';
      g.fillRect(40, 120, 80, 136);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 124; y < h; y += 8) g.fillRect(40, y, 80, 2);
      g.fillStyle = 'rgba(80,60,40,0.25)';
      g.fillRect(0, 230, w, 26);
    });
    corr.wrapS = THREE.RepeatWrapping;
    corr.wrapT = THREE.RepeatWrapping;
    if (this.warehouses.length) {
      const wb = new Builder(true);
      const roofB = new Builder(true);
      this.warehouses.forEach((w) => {
        const tint = { r: 0.85 + w.tint * 0.2, g: 0.85 + w.tint * 0.1, b: 0.8 + (1 - w.tint) * 0.2 };
        wb.setT(w.x, w.z, w.ca, w.sa);
        wb.ao = { y: w.base + 0.4, h: 3, k: 0.5 };
        roofB.setT(w.x, w.z, w.ca, w.sa);
        const x0 = -w.hu;
        const x1 = w.hu;
        const z0 = -w.hv;
        const z1 = w.hv;
        wb.walls(x0, x1, z0, z1, w.base, w.base + w.h, 16, tint);
        const top = w.base + w.h;
        roofB.quad([x0, top, z0], [x1, top, z0], [x1, top + 2.5, 0], [x0, top + 2.5, 0], [0, 0.97, -0.24], [0, 0], [4, 0], [4, 1], [0, 1], tint);
        roofB.quad([x1, top, z1], [x0, top, z1], [x0, top + 2.5, 0], [x1, top + 2.5, 0], [0, 0.97, 0.24], [0, 0], [4, 0], [4, 1], [0, 1], tint);
        [x0, x1].forEach((x, k) => roofB.quad([x, top, z0], [x, top, z1], [x, top + 2.5, 0], [x, top + 2.5, 0], [k ? 1 : -1, 0, 0], [0, 0], [1, 0], [0.5, 0.2], [0.5, 0.2], tint));
      });
      const wm = new THREE.Mesh(wb.geometry(), new THREE.MeshStandardMaterial({ map: corr, roughness: 0.6, metalness: 0.5, vertexColors: true }));
      const rm = new THREE.Mesh(roofB.geometry(), new THREE.MeshStandardMaterial({ map: corr, color: 0x9aa0a6, roughness: 0.55, metalness: 0.6, vertexColors: true, side: THREE.DoubleSide }));
      [wm, rm].forEach((m) => { m.castShadow = true; m.receiveShadow = true; G.add(m); });
    }
    if (this.containers.length) {
      const ct = canvasTexture(256, 64, (g, w, h) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 6) {
          g.fillStyle = x % 12 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.3)';
          g.fillRect(x, 0, 3, h);
        }
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, 0, w, 3);
        g.fillRect(0, h - 3, w, 3);
      });
      const cg = new THREE.BoxGeometry(12.1, 2.55, 2.4);
      cg.translate(0, 1.275, 0);
      const cm = instanced(cg, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6, metalness: 0.4 }), this.containers, (c, d) => { d.position.set(c.x, c.y, c.z); d.rotation.y = c.rot; }, 900);
      const cols = ['#a8321e', '#1f4f8f', '#2e7d4f', '#d17a12', '#7d8288', '#e8e6df', '#6a2d6e'].map((c) => new THREE.Color(c));
      this.containers.forEach((c, i) => cm.setColorAt(i, cols[c.c]));
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
      cm.castShadow = true;
      cm.receiveShadow = true;
      G.add(cm);
    }
    if (this.cranes.length) {
      const crane = [];
      this.cranes.forEach((c) => {
        const B = (g) => xf(g, c);
        const u0 = -c.hu + 2;
        const u1 = c.hu - 2;
        const v0 = -c.hv + 1.5;
        const v1 = c.hv - 1.5;
        [[u0, v0], [u0, v1], [u1, v0], [u1, v1]].forEach(([u, v]) => crane.push(B(bx(1.2, c.h, 1.2, u, c.base + c.h / 2, v))));
        [v0, v1].forEach((v) => crane.push(B(bx(u1 - u0 + 1.2, 1.8, 1.4, 0, c.base + c.h, v))));
        [u0, u1].forEach((u) => crane.push(B(bx(1.4, 1.4, v1 - v0, u, c.base + c.h - 0.2, 0))));
        crane.push(B(bx(5, 3, v1 - v0 - 2, lerp(u0, u1, 0.35), c.base + c.h - 2.2, 0)));
      });
      const m = new THREE.Mesh(mergeGeometries(crane), new THREE.MeshStandardMaterial({ color: 0xd9a61e, roughness: 0.55, metalness: 0.4 }));
      m.castShadow = true;
      G.add(m);
    }
  }

  buildSuburbs() {
    if (!this.houses.length) return;
    const G = this.group;
    const rnd = mulberry32(606);
    const al = makeCanvas(512, 256);
    const em = makeCanvas(512, 256);
    const A = al.getContext('2d');
    const E = em.getContext('2d');
    A.fillStyle = '#e9e5dc';
    A.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 6) { A.fillStyle = 'rgba(0,0,0,0.09)'; A.fillRect(0, y, 512, 1.5); }
    E.fillStyle = '#000';
    E.fillRect(0, 0, 512, 256);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const x = c * 128 + 34;
        const y = r * 128 + 34;
        if (r === 1 && c === 1) {
          A.fillStyle = '#5a3a28';
          A.fillRect(x + 6, y + 6, 44, 88);
          continue;
        }
        A.fillStyle = '#ffffff';
        A.fillRect(x - 5, y - 5, 66, 64);
        A.fillStyle = '#1d242c';
        A.fillRect(x, y, 56, 54);
        A.fillStyle = '#ffffff';
        A.fillRect(x + 27, y, 3, 54);
        A.fillRect(x, y + 26, 56, 3);
        A.fillStyle = '#3e4a39';
        A.fillRect(x - 14, y - 5, 9, 64);
        A.fillRect(x + 61, y - 5, 9, 64);
        if (rnd() < 0.45) {
          const g = E.createLinearGradient(0, y, 0, y + 54);
          g.addColorStop(0, '#ffd59a');
          g.addColorStop(1, '#6a4420');
          E.fillStyle = g;
          E.fillRect(x, y, 56, 54);
        }
      }
    }
    const sid = toTexture(al, true);
    const sidE = toTexture(em, true);
    const walls = new Builder(true);
    const roof = new Builder(true);
    const drives = new Builder();
    const sidingCols = ['#f2efe8', '#d9cdb4', '#b8c7cf', '#e3d4c4', '#c9d3bd', '#f0e1c0', '#d6d6d6', '#a9b8a0', '#c4b29a'].map((c) => new THREE.Color(c));
    const roofCols = ['#5a4a42', '#4a4d52', '#6b3b30', '#3f4a44', '#6e6258', '#2f3236'].map((c) => new THREE.Color(c).multiplyScalar(2.2));
    const rc = { r: 1, g: 1, b: 1 };
    const trim = new Builder(true);
    const brick = new Builder(true);
    const doors = new Builder(true);
    const fenceB = new Builder(true);
    const WHITE = { r: 0.95, g: 0.94, b: 0.9 };
    this.houses.forEach((h) => {
      const col = sidingCols[Math.floor(h.color * sidingCols.length)];
      const rcol = roofCols[Math.floor(h.roofCol * roofCols.length)];
      walls.setT(h.x, h.z, h.ca, h.sa);
      walls.ao = { y: h.base + 0.4, h: 1.6, k: 0.55 };
      roof.setT(h.x, h.z, h.ca, h.sa);
      trim.setT(h.x, h.z, h.ca, h.sa);
      brick.setT(h.x, h.z, h.ca, h.sa);
      doors.setT(h.x, h.z, h.ca, h.sa);
      const f = h.front;
      const g0 = h.base + 0.4;
      // attached garage with a panelled door facing the street
      if (h.garage) {
        const G2 = h.garage;
        const va = f > 0 ? G2.v0 : -G2.v1;
        const vb = f > 0 ? G2.v1 : -G2.v0;
        walls.walls(G2.u0, G2.u1, va, vb, h.base, g0 + 2.9, 12, col, g0, 0, 6);
        roof.quad([G2.u0, g0 + 2.9, va - 0.3], [G2.u1 + 0.3, g0 + 2.9, va - 0.3], [G2.u1 + 0.3, g0 + 3.6, (va + vb) / 2], [G2.u0, g0 + 3.6, (va + vb) / 2], [0, 0.85, -0.5], [0, 0], [2, 0], [2, 1], [0, 1], rcol);
        roof.quad([G2.u1 + 0.3, g0 + 2.9, vb + 0.3], [G2.u0, g0 + 2.9, vb + 0.3], [G2.u0, g0 + 3.6, (va + vb) / 2], [G2.u1 + 0.3, g0 + 3.6, (va + vb) / 2], [0, 0.85, 0.5], [0, 0], [2, 0], [2, 1], [0, 1], rcol);
        const dz = f > 0 ? vb + 0.03 : va - 0.03;
        if (f > 0) doors.quad([G2.u0 + 0.6, g0 - 0.05, dz], [G2.u1 - 0.6, g0 - 0.05, dz], [G2.u1 - 0.6, g0 + 2.3, dz], [G2.u0 + 0.6, g0 + 2.3, dz], [0, 0, 1], [0, 0], [1, 0], [1, 1], [0, 1], WHITE);
        else doors.quad([G2.u1 - 0.6, g0 - 0.05, dz], [G2.u0 + 0.6, g0 - 0.05, dz], [G2.u0 + 0.6, g0 + 2.3, dz], [G2.u1 - 0.6, g0 + 2.3, dz], [0, 0, -1], [0, 0], [1, 0], [1, 1], [0, 1], WHITE);
      }
      // front porch: deck, posts and a little roof
      if (h.porch) {
        const P2 = h.porch;
        const v0 = f * h.hv;
        const v1 = f * (h.hv + 2.3);
        const va = Math.min(v0, v1);
        const vb = Math.max(v0, v1);
        trim.box(P2.u0, P2.u1, va, vb, h.base, g0 + 0.2, 6, { r: 0.55, g: 0.53, b: 0.5 });
        const py = g0 + 2.7;
        [P2.u0 + 0.15, P2.u1 - 0.15].forEach((u) => trim.box(u - 0.09, u + 0.09, v1 - 0.09 * f - 0.09, v1 - 0.09 * f + 0.09, g0 + 0.2, py, 6, WHITE));
        roof.quad([P2.u0 - 0.2, py, f > 0 ? vb + 0.3 : va - 0.3], [P2.u1 + 0.2, py, f > 0 ? vb + 0.3 : va - 0.3], [P2.u1 + 0.2, py + 0.6, v0], [P2.u0 - 0.2, py + 0.6, v0], [0, 0.95, 0.3 * f], [0, 0], [2, 0], [2, 0.6], [0, 0.6], rcol);
        trim.box(P2.u0 - 0.2, P2.u1 + 0.2, va - (f < 0 ? 0.3 : 0), vb + (f > 0 ? 0.3 : 0), py - 0.12, py, 6, WHITE);
      }
      // brick chimney through the roof
      if (h.chimney) {
        const top = g0 + h.wallH + h.roofH + 1.1;
        brick.box(h.chimney - 0.45, h.chimney + 0.45, -0.95, -0.05, g0 + h.wallH, top, 2, { r: 0.55, g: 0.33, b: 0.27 });
        brick.box(h.chimney - 0.55, h.chimney + 0.55, -1.05, 0.05, top - 0.15, top + 0.05, 2, { r: 0.4, g: 0.38, b: 0.36 });
      }
      // white fascia boards under the eaves
      const eT = g0 + h.wallH;
      trim.box(-h.hu - 0.5, h.hu + 0.5, -h.hv - 0.55, -h.hv - 0.4, eT - 0.25, eT + 0.02, 6, WHITE);
      trim.box(-h.hu - 0.5, h.hu + 0.5, h.hv + 0.4, h.hv + 0.55, eT - 0.25, eT + 0.02, 6, WHITE);
      // picket fence
      if (h.fence) {
        fenceB.clearT();
        h.fence.forEach(([ax, az, bx2, bz]) => {
          const L2 = Math.hypot(bx2 - ax, bz - az);
          const ya = this.city.terrainAt(ax, az).h;
          const yb = this.city.terrainAt(bx2, bz).h;
          const n = [-(bz - az) / L2, 0, (bx2 - ax) / L2];
          fenceB.quad([ax, ya - 0.05, az], [bx2, yb - 0.05, bz], [bx2, yb + 1.15, bz], [ax, ya + 1.15, az], n, [0, 0], [L2 / 0.3, 0], [L2 / 0.3, 1], [0, 1], WHITE);
        });
      }
      const x0 = -h.hu;
      const x1 = h.hu;
      const z0 = -h.hv;
      const z1 = h.hv;
      const y0 = h.base;
      walls.walls(x0, x1, z0, z1, y0, y0 + 0.4 + h.wallH, 12, col, y0 + 0.4, 0, 6);
      const top = y0 + 0.4 + h.wallH;
      const ridgeY = top + h.roofH;
      const o = 0.5;
      // ridge runs along the street (local u)
      roof.quad([x0 - o, top, z0 - o], [x1 + o, top, z0 - o], [x1 + o, ridgeY, 0], [x0 - o, ridgeY, 0], [0, 0.8, -0.6], [0, 0], [4, 0], [4, 2], [0, 2], rcol);
      roof.quad([x1 + o, top, z1 + o], [x0 - o, top, z1 + o], [x0 - o, ridgeY, 0], [x1 + o, ridgeY, 0], [0, 0.8, 0.6], [0, 0], [4, 0], [4, 2], [0, 2], rcol);
      [x0, x1].forEach((x, k) => walls.quad([x, top, k ? z0 : z1], [x, top, k ? z1 : z0], [x, ridgeY, 0], [x, ridgeY, 0], [k ? 1 : -1, 0, 0], [0, 0.95], [0.9, 0.95], [0.45, 0.99], [0.45, 0.99], col));
    });
    this.drives.forEach((d) => {
      const L = d.L;
      const C = this.city;
      const q = (u, v) => {
        const [x, z] = toW(L, u, v);
        return [x, C.terrainAt(x, z).h + 0.09, z];
      };
      const a = q(d.u0, d.v0);
      const b = q(d.u1, d.v0);
      const c = q(d.u1, d.v1);
      const e = q(d.u0, d.v1);
      // keep the face pointing up whichever side of the house the street is on
      const cyv = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (cyv >= 0) drives.quad(a, b, c, e, [0, 1, 0], [0, 0], [1, 0], [1, 2], [0, 2], rc);
      else drives.quad(a, e, c, b, [0, 1, 0], [0, 0], [0, 2], [1, 2], [1, 0], rc);
    });
    this.houseMat = new THREE.MeshStandardMaterial({ map: sid, emissiveMap: sidE, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.8, vertexColors: true });
    const shingle = canvasTexture(256, 256, (g, w, hh) => {
      g.fillStyle = '#4a4a4a';
      g.fillRect(0, 0, w, hh);
      for (let y = 0; y < hh; y += 16) {
        for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
          const v = 70 + rnd() * 50;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(x + 1, y + 1, 30, 13);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + 1, y + 12, 30, 3);
        }
      }
    });
    shingle.wrapS = THREE.RepeatWrapping;
    shingle.wrapT = THREE.RepeatWrapping;
    const wm = new THREE.Mesh(walls.geometry(), this.houseMat);
    const rm = new THREE.Mesh(roof.geometry(), new THREE.MeshStandardMaterial({ map: shingle, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide }));
    const extras = [];
    if (!trim.empty) extras.push(new THREE.Mesh(trim.geometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true })));
    if (!brick.empty) extras.push(new THREE.Mesh(brick.geometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true })));
    if (!doors.empty) {
      const doorTex = canvasTexture(128, 128, (g, w, hh) => {
        g.fillStyle = '#e8e6e0';
        g.fillRect(0, 0, w, hh);
        for (let y = 0; y < hh; y += 32) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, y + 3, w, 2); }
        for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 2, hh); }
      });
      extras.push(new THREE.Mesh(doors.geometry(), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6, metalness: 0.2, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 })));
    }
    if (!fenceB.empty) {
      const pick = canvasTexture(64, 64, (g, w, hh) => {
        g.clearRect(0, 0, w, hh);
        g.fillStyle = '#f4f2ec';
        g.beginPath(); g.moveTo(14, hh); g.lineTo(14, 10); g.lineTo(26, 0); g.lineTo(38, 10); g.lineTo(38, hh); g.fill();
        g.fillRect(0, 18, w, 6);
        g.fillRect(0, 46, w, 6);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(34, 10, 4, hh - 10);
      });
      pick.wrapS = THREE.RepeatWrapping;
      const fm = new THREE.Mesh(fenceB.geometry(), new THREE.MeshStandardMaterial({ map: pick, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }));
      fm.castShadow = true;
      extras.push(fm);
    }
    extras.forEach((m) => { m.receiveShadow = true; if (m.material.alphaTest === 0) m.castShadow = true; G.add(m); });
    const dm = new THREE.Mesh(drives.geometry(), new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
    [wm, rm].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    dm.receiveShadow = true;
    G.add(wm, rm, dm);
  }

  // neon signs on city buildings and rooftop billboards
  buildSigns(rnd) {
    const G = this.group;
    const signs = [['HOTEL', '#ff3b5c'], ['BAR', '#29d3ff'], ['24/7', '#7cff6b'], ['CINEMA', '#ffb000'], ['NOODLES', '#ff7ae6'], ['CLUB', '#b388ff'], ['MOTEL', '#ff5a1f'], ['DINER', '#00e5c0']];
    const byTex = signs.map(() => []);
    const ang = (b) => Math.atan2(b.sa, b.ca);
    this.buildings.forEach((b) => {
      if (rnd() > 0.4 || b.h < 14) return;
      const k = Math.floor(rnd() * signs.length);
      const face = b.front > 0 ? 0 : 1; // the street side
      const y = b.base + STORE_H + 2 + rnd() * Math.min(20, b.h - 12);
      const w = 6 + rnd() * 4;
      if (b.hu * 2 < w * 2 + 2) return;
      const u = lerp(-b.hu + w, b.hu - w, rnd());
      const v = face === 0 ? b.hv + 0.15 : -b.hv - 0.15;
      const [x, z] = toW(b, u, v);
      byTex[k].push({ x, y, z, rot: (face === 0 ? 0 : Math.PI) - ang(b), w });
    });
    this.signMats = [];
    signs.forEach(([text, col], k) => {
      if (!byTex[k].length) return;
      const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, col), color: new THREE.Color(2.4, 2.4, 2.4) });
      this.signMats.push(mat);
      G.add(instanced(new THREE.PlaneGeometry(1, 0.3125), mat, byTex[k], (s, d) => {
        d.position.set(s.x, s.y, s.z);
        d.rotation.y = s.rot;
        d.scale.set(s.w, s.w, 1);
      }));
    });
    const boards = [[], [], [], []];
    this.buildings.forEach((b) => {
      if (b.h > 60 || b.h < 14 || rnd() > 0.22) return;
      const rt = b.roofTop;
      if (rt.x1 - rt.x0 < 16) return;
      const v = b.front > 0 ? rt.z1 - 1.5 : rt.z0 + 1.5;
      const [x, z] = toW(b, (rt.x0 + rt.x1) / 2, v);
      boards[Math.floor(rnd() * 4)].push({ x, y: rt.y + 6, z, rot: (b.front > 0 ? 0 : Math.PI) - ang(b) });
    });
    const frames = [];
    boards.forEach((list, k) => {
      if (!list.length) return;
      const mat = new THREE.MeshBasicMaterial({ map: adTexture(k), color: new THREE.Color(1.6, 1.6, 1.6) });
      this.signMats.push(mat);
      G.add(instanced(new THREE.PlaneGeometry(14, 7), mat, list, (s, d) => { d.position.set(s.x, s.y, s.z); d.rotation.y = s.rot; }));
      list.forEach((s) => {
        const f = mergeGeometries([bx(14.6, 7.6, 0.3, 0, 0, -0.2), bx(0.3, 3, 0.3, -5, -5, -0.25), bx(0.3, 3, 0.3, 5, -5, -0.25)]);
        f.rotateY(s.rot);
        f.translate(s.x, s.y, s.z);
        frames.push(f);
      });
    });
    if (frames.length) G.add(new THREE.Mesh(mergeGeometries(frames), new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.6, roughness: 0.5 })));
  }

  buildStreetFurniture() {
    const G = this.group;
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.45, metalness: 0.75 });
    const lampGeo = PROPS.lampGeometry();
    const lamps = this.lamps;
    const lampMesh = instanced(lampGeo, metal, lamps, (l, d) => { d.position.set(l.x, l.y, l.z); d.rotation.y = l.rot; }, 650);
    lampMesh.castShadow = true;
    G.add(lampMesh);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 6 });
    G.add(instanced(PROPS.lampLensGeometry(), this.bulbMat, lamps, (l, d) => { d.position.set(l.x, l.y, l.z); d.rotation.y = l.rot; }));
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffc98a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const pools = instanced(poolGeo, this.poolMat, lamps, (l, d) => { d.position.set(l.pool.x, l.pool.y + 0.12, l.pool.z); d.scale.set(19, 1, 19); });
    pools.renderOrder = 2;
    G.add(pools);
    const hyd = this.props.filter((p) => p.kind === 'hydrant');
    const bins = this.props.filter((p) => p.kind === 'bin');
    const hm = instanced(PROPS.hydrantGeometry(), new THREE.MeshStandardMaterial({ color: 0xb3221c, roughness: 0.45, metalness: 0.35 }), hyd, (p, d) => { d.position.set(p.x, p.y, p.z); d.rotation.y = ((p.x * 7.3 + p.z * 3.1) % 6.28); });
    hm.castShadow = true;
    G.add(hm);
    const bm = instanced(PROPS.binGeometry(), new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.55, metalness: 0.5 }), bins, (p, d) => { d.position.set(p.x, p.y, p.z); d.rotation.y = p.x % 3; }, 260);
    bm.castShadow = true;
    G.add(bm);
  }

  buildTrafficLights() {
    const G = this.group;
    const corners = this.signals;
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.7 });
    // pole + mast arm across the lanes + signal housings (local +x points along the arm)
    // tapered pole on a base, mast arm with a diagonal brace, two signal heads with visors and backplates
    const head = PROPS.signalHeadGeometry();
    const h1 = head.clone(); h1.translate(6.6, 6.38, 0);
    const h2 = head.clone(); h2.translate(3.3, 6.38, 0);
    const brace = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8); brace.rotateZ(Math.PI / 2 - 0.42); brace.translate(1.1, 6.1, 0);
    const frame = mergeGeometries([
      cy(0.11, 0.16, 6.8, 0, 3.4, 0, 12),
      cy(0.28, 0.3, 0.35, 0, 0.17, 0, 12),
      new THREE.CylinderGeometry(0.08, 0.08, 7.5, 10).rotateZ(Math.PI / 2).translate(3.75, 6.6, 0),
      ni(brace), ni(h1), ni(h2),
    ].map((g) => { const q = ni(g); if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; }));
    const place = (c, d) => { d.position.set(c.x, c.y + SIDEWALK_H, c.z); d.rotation.y = c.rot; };
    const fm = instanced(frame, metal, corners, place, 550);
    fm.castShadow = true;
    G.add(fm);
    this.signalMats = { x: {}, z: {} };
    const colors = { red: 0xff2a1a, amber: 0xffaa00, green: 0x22ff77 };
    ['x', 'z'].forEach((axis) => {
      const list = corners.filter((c) => c.axis === axis);
      Object.entries(colors).forEach(([name, col], k) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0.05 });
        this.signalMats[axis][name] = mat;
        const y = 6.38 - k * 0.38;
        const lamp = mergeGeometries([6.6, 3.3].map((lx) => {
          const t = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12);
          t.rotateX(Math.PI / 2);
          t.translate(lx, y, -0.19);
          return ni(t);
        }));
        G.add(instanced(lamp, mat, list, place, 550));
      });
    });
    this.signalPhase = -1;
  }

  // cosmetic signal cycle: the two groups of approaches alternate
  updateSignals(time) {
    if (!this.signalMats) return;
    const t = time % 24;
    let phase;
    if (t < 10) phase = 0; else if (t < 12) phase = 1; else if (t < 22) phase = 2; else phase = 3;
    if (phase === this.signalPhase) return;
    this.signalPhase = phase;
    const set = (axis, state) => {
      const m = this.signalMats[axis];
      m.red.emissiveIntensity = state === 'red' ? 5 : 0.05;
      m.amber.emissiveIntensity = state === 'amber' ? 5 : 0.05;
      m.green.emissiveIntensity = state === 'green' ? 5 : 0.05;
    };
    set('x', phase === 0 ? 'green' : phase === 1 ? 'amber' : 'red');
    set('z', phase === 2 ? 'green' : phase === 3 ? 'amber' : 'red');
  }

  buildParkedCars() {
    if (!this.parked.length) return;
    const geo = parkedCarGeometries('sedan');
    const place = (p, d) => { d.position.set(p.x, p.y, p.z); d.rotation.y = p.h; };
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: geo.map, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    const pm = instanced(geo.paint, paint, this.parked, place, 420);
    const palette = ['#8a8f99', '#5b6470', '#d9d9d6', '#2e3540', '#7a2a2a', '#2c4a6e', '#4a5e3a', '#b9a77a', '#1e1e22', '#e8e8e8', '#992222', '#24476b'];
    const c = new THREE.Color();
    this.parked.forEach((p, i) => { c.set(palette[Math.floor(p.color * palette.length)]); pm.setColorAt(i, c); });
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    pm.castShadow = true;
    const dm = instanced(geo.dark, new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.7 }), this.parked, place, 420);
    this.group.add(pm, dm);
  }

  buildRamps() {
    const stripe = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#f2b705';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16161a';
      for (let k = -1; k < 4; k++) {
        g.beginPath();
        g.moveTo(k * 32, 0);
        g.lineTo(k * 32 + 16, 0);
        g.lineTo(k * 32 + 48, h);
        g.lineTo(k * 32 + 32, h);
        g.fill();
      }
    });
    stripe.wrapS = THREE.RepeatWrapping;
    stripe.wrapT = THREE.RepeatWrapping;
    stripe.repeat.set(4, 2);
    const rampMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6, metalness: 0.3 });
    this.ramps.forEach((r) => {
      const m = new THREE.Mesh(rampGeometry(r.len, r.h, r.w), rampMat);
      m.position.set(r.x, r.y0, r.z);
      m.rotation.y = -Math.atan2(r.sa, r.ca);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    });
  }

  // distant mountains, only on the landward side
  buildMountains() {
    const segs = 360;
    const rings = 14;
    const pos = [];
    const idx = [];
    const n = (a, s) => Math.sin(a * 3 + s) * 0.5 + Math.sin(a * 7 + s * 2.3) * 0.3 + Math.sin(a * 17 + s * 0.7) * 0.2;
    const col = [];
    const uvs = [];
    const hmax = 480;
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      const r = 1750 + t * 900;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // over the sea the range drops below the water
        const land = clamp((Math.cos(a - 3.75) + 0.15) * 2.2, 0, 1);
        const peak = Math.sin(Math.PI * t) * (0.55 + 0.45 * n(a, 1.7));
        const ridge = 1 + (fbm(x / 260, z / 260, 13, 4) - 0.5) * 0.7;
        const h = Math.max(0, peak) * (220 + 260 * (0.5 + 0.5 * n(a * 1.3, 4.1))) * land * ridge - (1 - land) * 20;
        pos.push(x, h - 2, z);
        uvs.push(x / 70, z / 70);
        // forest below, open grass higher up, bare rock on the tops
        const f = fbm(x / 90, z / 90, 21, 3);
        const rock = clamp((h / hmax - 0.55) * 3 + (f - 0.5), 0, 1);
        const grass = clamp((h / hmax - 0.3) * 2.5 + (f - 0.5) * 1.5, 0, 1) * (1 - rock);
        const forest = (1 - rock) * (1 - grass);
        const v = 0.85 + f * 0.3;
        col.push((0.15 * forest + 0.36 * grass + 0.5 * rock) * v, (0.21 * forest + 0.36 * grass + 0.48 * rock) * v, (0.13 * forest + 0.22 * grass + 0.44 * rock) * v);
      }
    }
    for (let k = 0; k < rings; k++) {
      for (let i = 0; i < segs; i++) {
        const a = k * (segs + 1) + i;
        const b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // tree canopy seen from far away: clumps lit on top, dark gaps between
    const canopy = canvasTexture(256, 256, (cg, w, h) => {
      cg.fillStyle = 'rgb(70,70,70)';
      cg.fillRect(0, 0, w, h);
      const r2 = mulberry32(17);
      for (let i = 0; i < 1400; i++) {
        const x = r2() * w; const y = r2() * h; const rr = 3 + r2() * 6;
        const gr = cg.createRadialGradient(x - rr * 0.3, y - rr * 0.4, 0, x, y, rr);
        const v = 150 + r2() * 105;
        gr.addColorStop(0, `rgb(${v},${v},${v})`);
        gr.addColorStop(1, 'rgba(60,60,60,0)');
        cg.fillStyle = gr;
        cg.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    });
    canopy.wrapS = THREE.RepeatWrapping;
    canopy.wrapT = THREE.RepeatWrapping;
    this.mountainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canopy, vertexColors: true, roughness: 1, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, this.mountainMat);
    m.frustumCulled = false;
    this.group.add(m);
  }

  // far-off towers beyond the city on the landward side
  // hide far tiles of small repeated props (parked cars, lamps, trees...)
  cull(cam) {
    const k = this.quality === 'high' ? 1.4 : this.quality === 'low' ? 0.75 : 1;
    this.cullList.forEach((c) => c.cull(cam.x, cam.z, c.userData.cullD * k));
  }

  buildUtilities() {
    const G = this.group;
    const poles = [];
    this.utility.forEach((ch) => ch.forEach((p) => poles.push(p)));
    if (poles.length) {
      // pole with a crossarm, three insulators and a transformer on some
      const wood = mergeGeometries([cy(0.13, 0.17, 10, 0, 5, 0, 7), bx(2.4, 0.14, 0.14, 0, 9.3, 0)]);
      const ins = mergeGeometries([-1, 0, 1].map((k) => cy(0.05, 0.07, 0.3, k * 1.0, 9.5, 0, 6)));
      const place = (p, d) => { d.position.set(p.x, p.y, p.z); d.rotation.set(p.tilt, Math.atan2(p.az, -p.ax) + Math.PI / 2, 0); };
      const poleTex = canvasTexture(32, 128, (g, w, h) => {
        g.fillStyle = '#5c4a38'; g.fillRect(0, 0, w, h);
        const r2 = mulberry32(3);
        for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(20,14,8,${0.2 + r2() * 0.3})`; g.fillRect(r2() * w, r2() * h, 1, 6 + r2() * 20); }
      });
      const pm = instanced(wood, new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.95 }), poles, place, 900);
      pm.castShadow = true;
      G.add(pm, instanced(ins, new THREE.MeshStandardMaterial({ color: 0x8aa0a8, roughness: 0.3, metalness: 0.1 }), poles, place, 600));
      const tf = poles.filter((p, i) => i % 5 === 2);
      if (tf.length) G.add(instanced(cy(0.33, 0.33, 1.2, 0, 7.9, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x6f757a, metalness: 0.5, roughness: 0.5 }), tf, place, 600));
      // sagging wires between neighbouring poles
      const wp = [];
      this.utility.forEach((ch) => {
        for (let k = 1; k < ch.length; k++) {
          const a = ch[k - 1];
          const b = ch[k];
          const ha = Math.atan2(a.az, -a.ax) + Math.PI / 2;
          const hb = Math.atan2(b.az, -b.ax) + Math.PI / 2;
          [-1, 0, 1].forEach((o) => {
            const pa = [a.x + Math.cos(ha) * o, a.y + 9.62, a.z - Math.sin(ha) * o];
            const pb = [b.x + Math.cos(hb) * o, b.y + 9.62, b.z - Math.sin(hb) * o];
            const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
            const sag = 0.012 * L * L / 8 + 0.25;
            for (let i = 0; i < 8; i++) {
              const t0 = i / 8;
              const t1 = (i + 1) / 8;
              const pt = (t) => [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t) - sag * 4 * t * (1 - t), lerp(pa[2], pb[2], t)];
              wp.push(...pt(t0), ...pt(t1));
            }
          });
        }
      });
      // wires as thin crossed ribbons (real thickness, so distant wires thin out instead of staying 1px lines)
      const tri = [];
      const r = 0.018;
      for (let i = 0; i < wp.length; i += 6) {
        const x0 = wp[i]; const y0 = wp[i + 1]; const z0 = wp[i + 2]; const x1 = wp[i + 3]; const y1 = wp[i + 4]; const z1 = wp[i + 5];
        const dx = x1 - x0; const dz = z1 - z0; const l = Math.hypot(dx, dz) || 1;
        const px = (-dz / l) * r; const pz = (dx / l) * r;
        tri.push(x0, y0 - r, z0, x1, y1 - r, z1, x1, y1 + r, z1, x0, y0 - r, z0, x1, y1 + r, z1, x0, y0 + r, z0);
        tri.push(x0 - px, y0, z0 - pz, x1 - px, y1, z1 - pz, x1 + px, y1, z1 + pz, x0 - px, y0, z0 - pz, x1 + px, y1, z1 + pz, x0 + px, y0, z0 + pz);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
      wg.computeVertexNormals();
      G.add(new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide })));
    }
    if (this.shelters.length) {
      // bus shelter: steel frame, glass side and back panels, roof, bench and a lit advert panel
      const frame = [];
      const glass = [];
      const ad = [];
      const roofs = [];
      this.shelters.forEach((sh) => {
        const T = (g) => { g.rotateY(-Math.atan2(sh.sa, sh.ca)); g.translate(sh.x, sh.y, sh.z); return g; };
        const f = sh.face;
        [[-2, -0.7], [2, -0.7], [-2, 0.7], [2, 0.7]].forEach(([u, v]) => frame.push(T(bx(0.08, 2.6, 0.08, u, 1.3, v))));
        frame.push(T(bx(3.4, 0.08, 0.4, 0, 0.45, -0.45 * f)), T(bx(3.4, 0.06, 0.06, 0, 0.42, -0.65 * f)));
        roofs.push(T(bx(4.4, 0.12, 1.8, 0, 2.66, 0)));
        glass.push(T(bx(3.9, 2.0, 0.03, 0, 1.45, -0.72 * f)), T(bx(0.03, 2.0, 1.3, -2, 1.45, 0)));
        ad.push(T(bx(0.06, 1.8, 1.2, 2.0, 1.4, 0)));
      });
      const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.7, roughness: 0.4 });
      G.add(new THREE.Mesh(mergeGeometries(frame), metal), new THREE.Mesh(mergeGeometries(roofs), metal));
      G.add(new THREE.Mesh(mergeGeometries(glass), new THREE.MeshStandardMaterial({ color: 0xa8c4cc, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3 })));
      const adTex = canvasTexture(128, 192, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1c3a5e'); gr.addColorStop(1, '#0e1726');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffb000'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
        g.fillText('NITRO', w / 2, 70); g.fillStyle = '#e8eef5'; g.font = 'bold 15px sans-serif'; g.fillText('ENERGY DRINK', w / 2, 96);
        g.fillStyle = '#ff2d55'; g.beginPath(); g.arc(w / 2, 140, 22, 0, Math.PI * 2); g.fill();
      });
      this.adMat = new THREE.MeshStandardMaterial({ map: adTex, emissiveMap: adTex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.3 });
      this.emissiveMats.push(this.adMat);
      G.add(new THREE.Mesh(mergeGeometries(ad), this.adMat));
    }
  }

  // soft dark halos on the ground around every building footprint (contact shadows)
  buildContactShadows() {
    const C = this.city;
    const pos = [];
    const col = [];
    const add = (L, w, lift, a0) => {
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const inner = cs.map(([u, v]) => toW(L, u * L.hu, v * L.hv));
      const outer = cs.map(([u, v]) => toW(L, u * (L.hu + w), v * (L.hv + w)));
      const Y = (p) => C.terrainAt(p[0], p[1]).h + lift;
      for (let k = 0; k < 4; k++) {
        const a = inner[k]; const b = inner[(k + 1) % 4]; const c = outer[(k + 1) % 4]; const d = outer[k];
        [[a, a0], [b, a0], [c, 0], [a, a0], [c, 0], [d, 0]].forEach(([p, al]) => { pos.push(p[0], Y(p), p[1]); col.push(0, 0, 0, al); });
      }
    };
    this.buildings.forEach((b) => add(b, 2.2, SIDEWALK_H + 0.09, 0.5));
    this.warehouses.forEach((b) => add(b, 2.6, 0.08, 0.45));
    this.houses.forEach((b) => add(b, 1.6, 0.07, 0.42));
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.renderOrder = 1;
    this.group.add(m);
  }

  // woods on the land around the city: cheap crossed-card trees, thick where forestAt is high
  buildForest() {
    const C = this.city;
    const rnd = mulberry32(this.seed + 41);
    const list = [];
    const step = this.quality === 'low' ? 20 : 13;
    for (let x = -T_EXT + 40; x < T_EXT - 40; x += step) {
      for (let z = -T_EXT + 40; z < T_EXT - 40; z += step) {
        const px = x + (rnd() - 0.5) * step;
        const pz = z + (rnd() - 0.5) * step;
        if (Math.abs(px) < MAP + 70 && Math.abs(pz) < MAP + 70) continue;
        const d = forestAt(px, pz);
        if (rnd() > smoothstepW(0.42, 0.62, d) * 0.95 + 0.03) continue;
        if (C.coastDist(px, pz) < 30) continue;
        const h = C.terrainAt(px, pz).h;
        if (h < SEA_Y + 1) continue;
        list.push({ x: px, z: pz, y: h - 0.3, s: 0.8 + rnd() * 0.6, r: rnd(), k: rnd() < 0.55 ? 0 : 1 });
      }
    }
    if (!list.length) return;
    // a two-tree sprite sheet: a conifer and a broadleaf, drawn with lit and shaded sides
    const tex = canvasTexture(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r2 = mulberry32(5);
      // conifer
      g.fillStyle = 'rgb(60,45,35)';
      g.fillRect(124, 200, 8, 56);
      for (let i = 0; i < 2600; i++) {
        const t = r2();
        const y = 14 + t * 200;
        const half = 6 + t * 82;
        const x = 128 + (r2() * 2 - 1) * half * (0.6 + 0.4 * r2());
        const lit = (128 - x) / 90 * 0.35 + 0.65 + (r2() - 0.5) * 0.3;
        const v = 120 * lit;
        g.strokeStyle = `rgb(${v * 0.8 | 0},${v | 0},${v * 0.75 | 0})`;
        g.lineWidth = 1.5;
        const a = Math.PI / 2 + (x < 128 ? 0.7 : -0.7) + (r2() - 0.5) * 0.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke();
      }
      // broadleaf
      g.fillStyle = 'rgb(70,55,42)';
      g.fillRect(380, 150, 9, 106);
      for (let i = 0; i < 1500; i++) {
        const a = r2() * Math.PI * 2;
        const rr = Math.sqrt(r2());
        const x = 384 + Math.cos(a) * rr * 100;
        const y = 104 + Math.sin(a) * rr * 82;
        const lit = 0.6 + (104 - y) / 82 * 0.25 + (384 - x) / 100 * 0.15 + (r2() - 0.5) * 0.3;
        const v = 175 * lit;
        g.fillStyle = `rgb(${v | 0},${v | 0},${v * 0.85 | 0})`;
        g.beginPath(); g.ellipse(x, y, 4 + r2() * 4, 3 + r2() * 3, r2() * 3, 0, Math.PI * 2); g.fill();
      }
    });
    tex.anisotropy = 4;
    const geos = [0, 1].map((k) => {
      const parts = [];
      for (const a of [0, Math.PI / 2]) {
        const q = new THREE.PlaneGeometry(k ? 11 : 9, k ? 11 : 15);
        q.translate(0, k ? 5.5 : 7.5, 0);
        q.rotateY(a);
        const uv = q.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + k * 0.5);
        const nr = q.attributes.normal;
        for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
        parts.push(ni(q));
      }
      return mergeGeometries(parts);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
    const c = new THREE.Color();
    [0, 1].forEach((k) => {
      const items = list.filter((t) => t.k === k);
      const m = instanced(geos[k], mat, items, (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.setScalar(t.s); d.rotation.y = t.r * 6.28; }, 2200);
      items.forEach((t, i) => {
        if (k === 0) c.setHSL(0.28, 0.3, 0.32 + t.r * 0.1);
        else c.setHSL(0.08 + t.r * 0.14, 0.45, 0.4);
        m.setColorAt(i, c);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.group.add(m);
    });
  }

  // per-frame animation (water ripples, traffic signals)
  animate(time) {
    if (this.waterNormal) this.waterNormal.offset.set(time * 0.006, time * 0.003);
    this.updateSignals(time);
  }

  applyTod(p, rain) {
    if (this.adMat) this.adMat.emissiveIntensity = p.windows > 0.5 ? 1.5 : 0.35;
    this.facadeMats.forEach((m) => { m.emissiveIntensity = p.windows; });
    this.shopMats.forEach((m) => { m.emissiveIntensity = 0.25 + p.windows * 1.5; });
    this.bulbMat.emissiveIntensity = 0.3 + p.lamps * 6;
    this.poolMat.opacity = p.lamps * 0.32;
    (this.signMats || []).forEach((m) => m.color.setScalar(0.7 + p.lamps * 1.8));
    if (this.houseMat) this.houseMat.emissiveIntensity = p.windows * 0.9;
    // distant ranges take on some of the haze colour (aerial perspective)
    if (this.mountainMat) {
      const k = p.windows > 0.8 ? 0.22 : 0.34;
      this.mountainMat.color.setScalar((1 - k) * 1.5 * (p.windows > 0.8 ? 0.35 : 1));
      this.mountainMat.emissive.set(p.fog).multiplyScalar(k * 0.6);
    }
    this.groundMat.roughness = rain ? 0.45 : 1;
    this.groundMat.metalness = rain ? 0.15 : 0;
  }

  // ───────────── map image ─────────────
  drawMap() {
    const C = this.city;
    const c = makeCanvas(MAP_PX, MAP_PX);
    const g = c.getContext('2d');
    const k = MAP_PX / (MAP_HALF * 2);
    const X = (x) => (x + MAP_HALF) * k;
    g.fillStyle = '#121620';
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    // sea
    const step = 8;
    g.fillStyle = '#123a52';
    for (let x = -MAP_HALF; x < MAP_HALF; x += step) {
      for (let z = -MAP_HALF; z < MAP_HALF; z += step) {
        if (C.terrainAt(x + step / 2, z + step / 2).h < SEA_Y + 0.3) g.fillRect(X(x), X(z), step * k + 0.5, step * k + 0.5);
      }
    }
    // parks
    g.fillStyle = '#17391f';
    PARKS.forEach((p) => {
      g.save();
      g.translate(X(p.c[0]), X(p.c[1]));
      g.rotate(p.a);
      g.fillRect(-p.h[0] * k, -p.h[1] * k, p.h[0] * 2 * k, p.h[1] * 2 * k);
      g.restore();
    });
    // building footprints
    const foot = (L, col) => {
      g.fillStyle = col;
      g.save();
      g.translate(X(L.x), X(L.z));
      g.rotate(Math.atan2(L.sa, L.ca));
      g.fillRect(-L.hu * k, -L.hv * k, L.hu * 2 * k, L.hv * 2 * k);
      g.restore();
    };
    this.buildings.forEach((b) => foot(b, '#262d3d'));
    [...this.warehouses, ...this.houses].forEach((b) => foot(b, '#2d3343'));
    // roads, widest first
    const order = ['residential', 'street', 'industrial', 'avenue', 'highway', 'expressway'];
    const colour = { residential: '#3a4256', street: '#3e4659', industrial: '#3e4659', avenue: '#566078', highway: '#7a6a44', expressway: '#c98a2a' };
    order.forEach((t) => {
      g.strokeStyle = colour[t];
      g.lineCap = 'round';
      g.lineJoin = 'round';
      C.edges.forEach((e) => {
        if (e.type !== t) return;
        g.lineWidth = Math.max(2, e.hw * 2 * k);
        g.beginPath();
        e.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), X(p[1])) : g.moveTo(X(p[0]), X(p[1]))));
        g.stroke();
      });
    });
    g.fillStyle = '#e0a800';
    this.ramps.forEach((r) => {
      g.save();
      g.translate(X(r.x), X(r.z));
      g.rotate(Math.atan2(r.sa, r.ca));
      g.fillRect((-r.len / 2) * k, (-r.w / 2) * k, r.len * k, r.w * k);
      g.restore();
    });
    return c;
  }

  // Trees: four species built from leaf cards (painted sprigs with see-through gaps), shaded darker
  // inside the crown, instanced per species. Oaks and maples in town, pines on the hills, palms by the sea.
  buildTrees() {
    const rnd = mulberry32(55);
    const C = this.city;
    const all = [...this.trees, ...this.streetTrees];
    const street = new Set(this.streetTrees);
    all.forEach((t) => {
      t.y = C.terrainAt(t.x, t.z).h + (street.has(t) ? SIDEWALK_H : 0);
      const zone = C.zoneAt(t.x, t.z);
      const k = (t.r * 7.31) % 1;
      if (zone === 'beach' && C.coastDist(t.x, t.z) < 140) t.sp = k < 0.75 ? 'palm' : 'oak';
      else if (zone === 'hills' || zone === 'outskirts') t.sp = k < 0.5 ? 'pine' : k < 0.85 ? 'oak' : 'poplar';
      else t.sp = k < 0.75 ? 'oak' : 'poplar';
    });

    // ── textures
    const leafSprig = (seed, kind) => canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r2 = mulberry32(seed);
      const twig = (x, y, a, len, depth) => {
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        g.strokeStyle = 'rgb(70,58,44)';
        g.lineWidth = Math.max(0.6, 2.2 - depth * 0.6);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        const n = kind === 'needle' ? 26 : 7;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const px = x + (x2 - x) * t;
          const py = y + (y2 - y) * t;
          if (kind === 'needle') {
            for (const sgn of [-1, 1]) {
              const na = a + sgn * (0.7 + r2() * 0.3);
              const nl = 9 + r2() * 5;
              const v = 70 + r2() * 60;
              g.strokeStyle = `rgb(${v * 0.75 | 0},${v | 0},${v * 0.7 | 0})`;
              g.lineWidth = 1.3;
              g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke();
            }
          } else {
            for (const sgn of [-1, 1]) {
              if (r2() < 0.15) continue;
              const la = a + sgn * (0.6 + r2() * 0.5);
              const L = 13 + r2() * 9;
              const W = L * (0.38 + r2() * 0.12);
              const v = 150 + r2() * 105;
              g.save();
              g.translate(px + Math.cos(la) * L * 0.5, py + Math.sin(la) * L * 0.5);
              g.rotate(la);
              g.fillStyle = `rgb(${v * (0.9 + r2() * 0.1) | 0},${v | 0},${v * (0.8 + r2() * 0.1) | 0})`;
              g.beginPath();
              g.moveTo(-L / 2, 0);
              g.quadraticCurveTo(0, -W, L / 2, 0);
              g.quadraticCurveTo(0, W, -L / 2, 0);
              g.fill();
              g.strokeStyle = 'rgba(255,255,240,0.25)';
              g.lineWidth = 0.7;
              g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
              g.restore();
            }
          }
        }
        if (depth < 2) {
          const kids = 2 + Math.floor(r2() * 2);
          for (let k = 0; k < kids; k++) twig(x + (x2 - x) * (0.3 + r2() * 0.5), y + (y2 - y) * (0.3 + r2() * 0.5), a + (r2() - 0.5) * 1.6, len * 0.55, depth + 1);
        }
      };
      for (let k = 0; k < 3; k++) twig(w / 2 + (r2() - 0.5) * 30, h - 6, -Math.PI / 2 + (k - 1) * 0.55 + (r2() - 0.5) * 0.2, h * 0.62, 0);
    });
    const broadTex = leafSprig(77, 'leaf');
    const needleTex = leafSprig(91, 'needle');
    const frondTex = canvasTexture(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r2 = mulberry32(93);
      g.strokeStyle = 'rgb(120,110,70)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
      for (let y = h - 6; y > 4; y -= 4) {
        const len = (w / 2 - 2) * Math.sin((y / h) * Math.PI * 0.95 + 0.1);
        for (const s of [-1, 1]) {
          const v = 110 + r2() * 80;
          g.strokeStyle = `rgb(${v * 0.8 | 0},${v | 0},${v * 0.55 | 0})`;
          g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * len, y - 10 - r2() * 4); g.stroke();
        }
      }
    });
    [broadTex, needleTex, frondTex].forEach((t) => { t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; });
    const barkTex = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = '#4d4034';
      g.fillRect(0, 0, w, h);
      const r2 = mulberry32(78);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = r2() < 0.55 ? `rgba(18,14,10,${0.25 + r2() * 0.35})` : `rgba(150,135,115,${0.1 + r2() * 0.2})`;
        g.fillRect(r2() * w, r2() * h, 1 + r2() * 2.5, 8 + r2() * 34);
      }
    });
    barkTex.wrapS = THREE.RepeatWrapping;
    barkTex.wrapT = THREE.RepeatWrapping;
    const palmBark = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#7a6a54';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(40,30,20,0.55)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(200,185,160,0.25)'; g.fillRect(0, y + 4, w, 2); }
    });
    palmBark.wrapS = THREE.RepeatWrapping;
    palmBark.wrapT = THREE.RepeatWrapping;

    // ── geometry helpers
    // a leaf card facing `dir`, with normals bent outwards from the crown centre and darker inside the crown
    const card = (pos, centre, R, size, dir, tilt) => {
      const q = new THREE.PlaneGeometry(size, size);
      q.rotateX(tilt);
      q.rotateY(Math.atan2(dir.x, dir.z));
      q.translate(pos.x, pos.y, pos.z);
      const p = q.attributes.position;
      const nr = q.attributes.normal;
      const col = new Float32Array(p.count * 3);
      for (let v = 0; v < p.count; v++) {
        const d = new THREE.Vector3(p.getX(v), p.getY(v), p.getZ(v)).sub(centre);
        const depth = clamp(d.length() / R, 0, 1);
        const up = clamp(0.5 + d.y / (R * 2), 0, 1);
        const ao = 0.42 + 0.58 * Math.pow(depth, 0.8) * (0.65 + 0.35 * up);
        col[v * 3] = ao; col[v * 3 + 1] = ao; col[v * 3 + 2] = ao;
        d.normalize(); d.y += 0.35; d.normalize();
        nr.setXYZ(v, d.x, d.y, d.z);
      }
      q.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return ni(q);
    };
    const withWhite = (g) => {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      return g;
    };
    const limbs = (wood, y0, y1, n, len, lean) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.7;
        const L = len * (0.7 + rnd() * 0.5);
        const gg = new THREE.CylinderGeometry(0.05, 0.12, L, 5);
        gg.translate(0, L / 2, 0);
        gg.rotateZ(lean + rnd() * 0.3);
        gg.rotateY(a);
        gg.translate(0, y0 + rnd() * (y1 - y0), 0);
        wood.push(ni(gg));
      }
    };
    // a crown made of several overlapping lumps
    const crownCards = (lumps, count, sizeA, sizeB) => {
      const out = [];
      let cx = 0; let cyy = 0; let R = 0;
      lumps.forEach((l) => { cx += l.c.x; cyy += l.c.y; });
      const centre = new THREE.Vector3(cx / lumps.length, cyy / lumps.length, 0);
      lumps.forEach((l) => { R = Math.max(R, l.c.distanceTo(centre) + Math.max(l.r.x, l.r.y)); });
      for (let k = 0; k < count; k++) {
        const l = lumps[k % lumps.length];
        const u = rnd() * 2 - 1;
        const t = rnd() * Math.PI * 2;
        const rr = Math.sqrt(1 - u * u);
        const f = Math.pow(rnd(), 0.35);
        const pos = new THREE.Vector3(rr * Math.cos(t) * l.r.x * f, u * l.r.y * f, rr * Math.sin(t) * l.r.z * f).add(l.c);
        const dir = pos.clone().sub(centre);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(Math.cos(t), 0, Math.sin(t));
        out.push(card(pos, centre, R, sizeA + rnd() * (sizeB - sizeA), dir.normalize(), (rnd() - 0.5) * 1.4 - (u > 0.5 ? 0.9 : 0)));
      }
      return out;
    };
    const lump = (x, y, z, rx, ry, rz) => ({ c: new THREE.Vector3(x, y, z), r: new THREE.Vector3(rx, ry, rz ?? rx) });

    const species = {};
    // oak / maple: wide, lumpy crown on a short trunk
    {
      const wood = [cy(0.17, 0.32, 3.6, 0, 1.8, 0, 9)];
      limbs(wood, 2.6, 3.6, 6, 2.4, 0.75);
      const lumps = [lump(0, 5.4, 0, 2.6, 2.0), lump(1.6, 4.6, 0.6, 1.8, 1.5), lump(-1.5, 4.8, -0.8, 1.9, 1.6), lump(0.3, 6.4, -0.6, 1.8, 1.4), lump(-0.6, 4.4, 1.5, 1.6, 1.3)];
      species.oak = { wood: mergeGeometries(wood), leaves: mergeGeometries(crownCards(lumps, 110, 1.3, 2.2)), tex: broadTex, bark: barkTex };
    }
    // poplar / lime: tall narrow crown
    {
      const wood = [cy(0.13, 0.26, 4.2, 0, 2.1, 0, 8)];
      limbs(wood, 2.5, 5.5, 6, 1.6, 0.35);
      const lumps = [lump(0, 5.2, 0, 1.4, 2.4), lump(0, 7.6, 0, 1.15, 1.9), lump(0.4, 4.2, 0.3, 1.4, 1.4)];
      species.poplar = { wood: mergeGeometries(wood), leaves: mergeGeometries(crownCards(lumps, 80, 1.1, 1.8)), tex: broadTex, bark: barkTex };
    }
    // pine / spruce: a cone of upright, outward-leaning needle cards around a tall trunk
    {
      const wood = [cy(0.08, 0.3, 10, 0, 5, 0, 8)];
      const cards = [];
      const centre = new THREE.Vector3(0, 6, 0);
      const tiers = 8;
      for (let k = 0; k < tiers; k++) {
        const y = 2.2 + k * 1.05;
        const rad = 2.6 * (1 - k / (tiers + 0.5)) + 0.35;
        const n = Math.max(5, Math.round(rad * 4.5));
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 + rnd() * 0.4 + k * 0.7;
          const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          const pos = new THREE.Vector3(Math.cos(a) * rad * 0.55, y + 0.9, Math.sin(a) * rad * 0.55);
          cards.push(card(pos, centre, 6.5, rad * 1.25 + 0.9, dir, 0.5 + rnd() * 0.25));
        }
      }
      for (const a of [0, Math.PI / 2]) cards.push(card(new THREE.Vector3(0, 11.0, 0), centre, 6.5, 1.8, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0));
      species.pine = { wood: mergeGeometries(wood), leaves: mergeGeometries(cards), tex: needleTex, bark: barkTex };
    }
    // palm: a leaning ringed trunk and drooping fronds
    {
      const wood = [];
      const segs = 6;
      let x = 0; let y = 0;
      const lean = 0.12;
      for (let k = 0; k < segs; k++) {
        const L = 1.55;
        const g = new THREE.CylinderGeometry(0.19 - k * 0.012, 0.22 - k * 0.012, L, 8);
        g.translate(0, L / 2, 0);
        g.rotateZ(-lean * (k / segs + 0.3));
        g.translate(x, y, 0);
        wood.push(ni(g));
        x += Math.sin(lean * (k / segs + 0.3)) * L;
        y += Math.cos(lean * (k / segs + 0.3)) * L;
      }
      const top = new THREE.Vector3(x, y, 0);
      const fr = [];
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2 + rnd() * 0.3;
        const L = 3.4 + rnd() * 1.0;
        const droop = 0.3 + rnd() * 0.5;
        // a 3-segment bent strip
        const pos = [];
        const uv = [];
        const pts = [];
        for (let i = 0; i <= 3; i++) {
          const t = i / 3;
          const r = L * t;
          pts.push(new THREE.Vector3(top.x + Math.cos(a) * r, top.y + 0.4 * t - droop * r * t, top.z + Math.sin(a) * r));
        }
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.55);
        for (let i = 0; i < 3; i++) {
          const p0 = pts[i]; const p1 = pts[i + 1];
          const v0 = i / 3; const v1 = (i + 1) / 3;
          const A = p0.clone().sub(side); const B = p0.clone().add(side); const Cc = p1.clone().add(side); const D = p1.clone().sub(side);
          pos.push(A.x, A.y, A.z, B.x, B.y, B.z, Cc.x, Cc.y, Cc.z, A.x, A.y, A.z, Cc.x, Cc.y, Cc.z, D.x, D.y, D.z);
          uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const n = new Float32Array(pos.length).fill(0);
        for (let i = 0; i < n.length; i += 3) { n[i + 1] = 1; }
        g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        const col = new Float32Array(pos.length);
        for (let i = 0; i < col.length; i += 3) { const yy = pos[i + 1]; const ao = clamp(0.55 + (yy - (top.y - 2)) * 0.2, 0.5, 1); col[i] = ao; col[i + 1] = ao; col[i + 2] = ao; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        fr.push(g);
      }
      species.palm = { wood: mergeGeometries(wood), leaves: mergeGeometries(fr), tex: frondTex, bark: palmBark };
    }

    // ── instances, coloured per tree
    const c = new THREE.Color();
    Object.entries(species).forEach(([name, S]) => {
      const list = all.filter((t) => t.sp === name);
      if (!list.length) return;
      const place = (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.setScalar(t.s * (name === 'pine' ? 1.15 : 1)); d.rotation.y = t.r * 6.28; };
      const trunkMesh = instanced(withWhite(S.wood), new THREE.MeshStandardMaterial({ map: S.bark, roughness: 1 }), list, place, 1100);
      const leafMat = new THREE.MeshStandardMaterial({ map: S.tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
      // both sides of a leaf card use the same (crown-shaped) normal, so the back faces aren't black
      leafMat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal\s*\*=\s*faceDirection;/g, ''));
      };
      const leafMesh = instanced(S.leaves, leafMat, list, place, 1100);
      list.forEach((t, i) => {
        const k = (t.r * 13.7) % 1;
        if (name === 'pine') c.setHSL(0.27 + k * 0.05, 0.3, 0.3 + k * 0.07);
        else if (name === 'palm') c.setHSL(0.2 + k * 0.05, 0.45, 0.4);
        // late autumn: greens turning, gold, amber and rust
        else if (k < 0.35) c.setHSL(0.21 + k * 0.08, 0.38, 0.33);
        else if (k < 0.6) c.setHSL(0.12 + (k - 0.35) * 0.08, 0.55, 0.42);
        else if (k < 0.85) c.setHSL(0.07 + (k - 0.6) * 0.08, 0.58, 0.38);
        else c.setHSL(0.15, 0.5, 0.45);
        leafMesh.setColorAt(i, c);
      });
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      trunkMesh.castShadow = true;
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      this.group.add(trunkMesh, leafMesh);
    });
  }


}
