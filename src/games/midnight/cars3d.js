// Midnight Pursuit: procedural car models (traffic, police, rivals, parked cars).
// A car is a rounded lower body lofted along its length, a separate greenhouse (cabin) and two fascia
// caps. All three share one painted "livery atlas" texture per style: windows, pillars, door seams,
// handles, grille, head and tail lights are drawn into it, so edges stay crisp and the whole body is a
// single mesh with one material (the paint colour multiplies the atlas).
// Real .glb models replace these for the player's cars: see models.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// u runs along the car from the rear bumper (0) to the front bumper (1).
// deck: height of the beltline/hood/trunk; cab: [rear glass base, roof start, roof end, windshield base].
export const STYLES = {
  coupe: { L: 4.45, W: 1.9, wb: 2.66, R: 0.34, axle: 0.04, clear: 0.15, roof: 1.3, cabW: 0.72, cab: [0.2, 0.4, 0.6, 0.75],
    deck: [[0, 0.66], [0.05, 0.86], [0.17, 0.92], [0.3, 0.94], [0.72, 0.9], [0.86, 0.82], [0.96, 0.7], [1, 0.56]], spoiler: 'lip', tail: 'bar', rim: 'five', grille: 'wide' },
  hatch: { L: 4.1, W: 1.86, wb: 2.56, R: 0.33, axle: 0.02, clear: 0.15, roof: 1.45, cabW: 0.78, cab: [0.03, 0.14, 0.58, 0.74],
    deck: [[0, 0.82], [0.04, 0.94], [0.2, 0.96], [0.72, 0.92], [0.88, 0.84], [0.97, 0.72], [1, 0.6]], spoiler: 'roof', tail: 'cluster', rim: 'multi', grille: 'honeycomb' },
  muscle: { L: 4.85, W: 1.96, wb: 2.85, R: 0.36, axle: -0.02, clear: 0.16, roof: 1.34, cabW: 0.74, cab: [0.24, 0.36, 0.54, 0.66],
    deck: [[0, 0.74], [0.04, 0.9], [0.15, 0.95], [0.3, 0.97], [0.66, 0.96], [0.9, 0.9], [0.98, 0.78], [1, 0.66]], spoiler: 'lip', tail: 'bar', rim: 'five', grille: 'wide', scoop: true },
  rally: { L: 4.55, W: 1.86, wb: 2.66, R: 0.34, axle: 0.03, clear: 0.17, roof: 1.46, cabW: 0.78, cab: [0.18, 0.32, 0.62, 0.76],
    deck: [[0, 0.74], [0.05, 0.92], [0.17, 0.96], [0.3, 0.97], [0.74, 0.93], [0.88, 0.85], [0.97, 0.72], [1, 0.6]], spoiler: 'wing', wingH: 0.32, tail: 'cluster', rim: 'multi', grille: 'honeycomb', scoop: true },
  super: { L: 4.6, W: 2.0, wb: 2.7, R: 0.35, axle: -0.04, clear: 0.11, roof: 1.17, cabW: 0.66, cab: [0.3, 0.45, 0.6, 0.79],
    deck: [[0, 0.72], [0.05, 0.86], [0.2, 0.92], [0.4, 0.94], [0.78, 0.8], [0.9, 0.68], [0.98, 0.52], [1, 0.44]], spoiler: 'wing', wingH: 0.18, tail: 'bar', rim: 'ten', grille: 'splitter', intakes: true },
  hyper: { L: 4.7, W: 2.06, wb: 2.75, R: 0.36, axle: -0.06, clear: 0.1, roof: 1.13, cabW: 0.62, cab: [0.32, 0.46, 0.62, 0.81],
    deck: [[0, 0.74], [0.05, 0.88], [0.2, 0.93], [0.42, 0.95], [0.8, 0.78], [0.92, 0.64], [0.985, 0.48], [1, 0.42]], spoiler: 'wing', wingH: 0.34, tail: 'bar', rim: 'ten', grille: 'splitter', intakes: true, fins: true },
  gt: { L: 4.75, W: 1.95, wb: 2.82, R: 0.35, axle: -0.01, clear: 0.13, roof: 1.24, cabW: 0.68, cab: [0.3, 0.44, 0.56, 0.7],
    deck: [[0, 0.68], [0.05, 0.84], [0.16, 0.91], [0.3, 0.93], [0.62, 0.92], [0.82, 0.86], [0.95, 0.72], [1, 0.58]], spoiler: 'lip', tail: 'bar', rim: 'ten', grille: 'wide', intakes: true },
  track: { L: 4.55, W: 2.04, wb: 2.68, R: 0.35, axle: -0.05, clear: 0.09, roof: 1.15, cabW: 0.64, cab: [0.3, 0.44, 0.6, 0.78],
    deck: [[0, 0.7], [0.05, 0.84], [0.2, 0.9], [0.4, 0.92], [0.78, 0.82], [0.9, 0.7], [0.98, 0.54], [1, 0.46]], spoiler: 'wing', wingH: 0.42, tail: 'bar', rim: 'multi', grille: 'splitter', intakes: true, fins: true, scoop: true },
  sedan: { L: 4.85, W: 1.86, wb: 2.85, R: 0.33, axle: 0.04, clear: 0.15, roof: 1.47, cabW: 0.8, cab: [0.19, 0.32, 0.62, 0.76], twoTone: [0.3, 0.7],
    deck: [[0, 0.76], [0.05, 0.93], [0.18, 0.97], [0.3, 0.98], [0.74, 0.94], [0.88, 0.87], [0.97, 0.74], [1, 0.62]], spoiler: 'none', tail: 'cluster', rim: 'five', grille: 'wide' },
  suv: { L: 4.85, W: 2.0, wb: 2.85, R: 0.4, axle: 0.02, clear: 0.22, roof: 1.8, cabW: 0.84, cab: [0.04, 0.12, 0.64, 0.77], twoTone: [0.25, 0.7],
    deck: [[0, 1.0], [0.04, 1.08], [0.2, 1.1], [0.74, 1.08], [0.88, 1.02], [0.97, 0.9], [1, 0.78]], spoiler: 'roof', tail: 'cluster', rim: 'multi', grille: 'wide' },
  van: { L: 5.1, W: 2.0, wb: 3.2, R: 0.37, axle: 0.1, clear: 0.18, roof: 2.15, cabW: 0.9, cab: [0.015, 0.05, 0.8, 0.87],
    deck: [[0, 1.0], [0.03, 1.06], [0.8, 1.08], [0.9, 1.02], [0.97, 0.88], [1, 0.78]], spoiler: 'none', tail: 'cluster', rim: 'steel', grille: 'wide' },
};

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Catmull-Rom interpolation through [u, value] keys
function curve(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (u >= keys[n - 1][0]) return keys[n - 1][1];
  let k = 0;
  while (k < n - 2 && u > keys[k + 1][0]) k++;
  const [u1, p1] = keys[k];
  const [u2, p2] = keys[k + 1];
  const p0 = k > 0 ? keys[k - 1][1] : p1;
  const p3 = k + 2 < n ? keys[k + 2][1] : p2;
  const t = (u - u1) / (u2 - u1);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function profile(S) {
  const zOf = (u) => (u - 0.5) * S.L;
  const uOf = (z) => z / S.L + 0.5;
  const front = S.wb / 2 + S.axle;
  const rear = -S.wb / 2 + S.axle;
  const [c0, c1, c2, c3] = S.cab;
  const deck = (u) => curve(S.deck, u);
  const cabinFrac = (u) => smooth(c0, c1, u) * (1 - smooth(c2, c3, u));
  const roofY = (u) => {
    const mid = (c1 + c2) / 2;
    const half = Math.max(0.05, (c2 - c1) / 2 + 0.08);
    return S.roof - 0.05 * Math.min(1, ((u - mid) / half) ** 2);
  };
  const halfW = (u) => {
    const z = zOf(u);
    let w = (S.W / 2) * curve([[0, 0.84], [0.012, 0.91], [0.05, 0.96], [0.14, 0.99], [0.3, 1], [0.7, 1], [0.86, 0.99], [0.95, 0.955], [0.988, 0.91], [1, 0.84]], u);
    const flare = S.flare !== undefined ? S.flare : 0.035;
    w += flare * (Math.exp(-(((z - front) / 0.6) ** 2)) + Math.exp(-(((z - rear) / 0.6) ** 2)));
    return w;
  };
  const bottom = (u) => S.clear + curve([[0, 0.08], [0.06, 0.02], [0.5, 0], [0.94, 0.01], [1, 0.06]], u);
  return { zOf, uOf, front, rear, deck, cabinFrac, roofY, halfW, bottom };
}


// ───────────── body ─────────────
// Atlas regions in UV space (v up): body loft, greenhouse, front fascia, rear fascia.
const REG = { body: [0, 0.5, 1, 0.5], gh: [0, 0.25, 1, 0.25], front: [0, 0, 0.5, 0.25], rear: [0.5, 0, 0.5, 0.25] };
const inReg = (r, u, v) => [r[0] + u * r[2], r[1] + v * r[3]];
const spow = (x, p) => Math.sign(x) * Math.abs(x) ** p;
const SPORTY = ['coupe', 'muscle', 'super', 'hyper', 'rally', 'gt', 'track'];

function greenhouseTop(P, S, u) {
  const [c0, c1, c2, c3] = S.cab;
  const rf = P.roofY(Math.min(c2, Math.max(c1, u)));
  let f = 1;
  if (u < c1) f = Math.sin((Math.PI / 2) * Math.max(0, (u - c0) / (c1 - c0)));
  else if (u > c2) f = Math.sin((Math.PI / 2) * Math.max(0, (c3 - u) / (c3 - c2)));
  return lerp(P.deck(u), rf, f);
}

// Index a surface and make its normals face away from a reference point (winding depends on ring direction).
function finish(pos, uv, idx, rel) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.slice(), 2));
  geo.setIndex(idx.slice());
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const p = geo.attributes.position;
  let outward = 0;
  for (let v = 0; v < p.count; v += 3) {
    const [dx, dy] = rel(p.getX(v), p.getY(v));
    outward += nrm.getX(v) * dx + nrm.getY(v) * dy;
  }
  if (outward < 0) {
    const ia = geo.index.array;
    for (let t = 0; t < ia.length; t += 3) { const tmp = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = tmp; }
    geo.computeVertexNormals();
  }
  return geo;
}

function buildBody(S, N = 64, M = 40) {
  const P = profile(S);
  const pos = [];
  const uv = [];
  const idx = [];
  const archR = S.R + 0.08;
  // lower body: rounded-rectangle sections, sides tuck in towards the shoulder
  const us = [];
  for (let i = 0; i < N; i++) us.push((1 - Math.cos((Math.PI * i) / (N - 1))) / 2);
  const ring = (u) => {
    const a = P.halfW(u);
    const yb = P.bottom(u);
    const yt = P.deck(u);
    const yc = (yb + yt) / 2;
    const b = (yt - yb) / 2;
    const out = [];
    for (let k = 0; k <= M; k++) {
      const t = -Math.PI / 2 + (2 * Math.PI * k) / M;
      let x = a * spow(Math.cos(t), 2 / 4.4);
      const y = yc + b * spow(Math.sin(t), 2 / 3.6);
      const up = Math.max(0, (y - yc) / b);
      x *= 1 - 0.08 * up * up;
      out.push([x, y, k / M]);
    }
    return { pts: out, a, yb, yt };
  };
  us.forEach((u, i) => {
    const z = P.zOf(u);
    const { pts, a } = ring(u);
    pts.forEach(([x, y, v]) => {
      // wheel arches: the lower side follows the arch circle so the tyre is exposed
      for (const wz of [P.front, P.rear]) {
        const dz = z - wz;
        if (Math.abs(dz) < archR && Math.abs(x) > a * 0.6) {
          const archY = S.R + Math.sqrt(archR * archR - dz * dz);
          if (y < archY) {
            const side = smooth(a * 0.6, a * 0.8, Math.abs(x));
            y = lerp(y, archY, side);
          }
        }
      }
      pos.push(x, y, z);
      uv.push(...inReg(REG.body, u, v));
    });
    if (i < N - 1) {
      for (let k = 0; k < M; k++) {
        const p0 = i * (M + 1) + k;
        const p1 = p0 + 1;
        const q0 = p0 + M + 1;
        const q1 = q0 + 1;
        idx.push(p0, q0, p1, p1, q0, q1);
      }
    }
  });
  const lower = finish(pos, uv, idx, (x, y) => [x, y - 0.5]);
  pos.length = 0;
  uv.length = 0;
  idx.length = 0;
  // greenhouse: an open strip from one side's beltline over the roof to the other
  const [c0, , , c3] = S.cab;
  const G = 30;
  const Ms = 22;
  const base0 = 0;
  for (let i = 0; i < G; i++) {
    const tt = (1 - Math.cos((Math.PI * i) / (G - 1))) / 2;
    const u = lerp(c0, c3, tt);
    const z = P.zOf(u);
    const a = P.halfW(u);
    const y0 = P.deck(u) - 0.02;
    const H = Math.max(0.001, greenhouseTop(P, S, u) - y0);
    const wbase = a * 0.9;
    const wtop = a * S.cabW * 0.96;
    for (let k = 0; k <= Ms; k++) {
      const s = k / Ms;
      const th = Math.PI * (1 - s);
      const xn = spow(Math.cos(th), 2 / 3.4);
      const yn = Math.abs(Math.sin(th)) ** (2 / 3.4);
      pos.push(xn * lerp(wbase, wtop, yn), y0 + H * yn, z);
      uv.push(...inReg(REG.gh, tt, s));
    }
    if (i < G - 1) {
      for (let k = 0; k < Ms; k++) {
        const p0 = base0 + i * (Ms + 1) + k;
        const p1 = p0 + 1;
        const q0 = p0 + Ms + 1;
        const q1 = q0 + 1;
        idx.push(p0, q0, p1, p1, q0, q1);
      }
    }
  }
  const cabin = finish(pos, uv, idx, (x, y) => [x, y - P.deck(0.5) + 0.3]);
  // fascia caps
  const cap = (u, front) => {
    const { pts, a, yb, yt } = ring(u);
    const shape = new THREE.Shape(pts.slice(0, M).map(([x, y]) => new THREE.Vector2(x, y)));
    const sg = new THREE.ShapeGeometry(shape, 2);
    const p = sg.attributes.position;
    const t = sg.attributes.uv;
    for (let v = 0; v < p.count; v++) {
      const fx = p.getX(v) / (2 * a) + 0.5;
      const fy = (p.getY(v) - yb) / (yt - yb);
      t.setXY(v, ...inReg(front ? REG.front : REG.rear, front ? fx : 1 - fx, fy));
    }
    if (!front) sg.rotateY(Math.PI);
    sg.translate(0, 0, P.zOf(u));
    return { g: sg.toNonIndexed(), a, yb, yt };
  };
  const fc = cap(1, true);
  const rc = cap(0, false);
  const body = mergeGeometries([lower.toNonIndexed(), cabin.toNonIndexed(), fc.g, rc.g]);
  return { geometry: body, P, front: fc, rear: rc };
}

// Livery atlas for a style: albedo (white = paint colour) + emissive (lights).
const atlasCache = new Map();
function liveryAtlas(style, cop = false) {
  const key = style + (cop ? '-cop' : '');
  if (atlasCache.has(key)) return atlasCache.get(key);
  const S = STYLES[style];
  const Z = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = Z; c.height = Z; return c; };
  const al = mk();
  const em = mk();
  const A = al.getContext('2d');
  const E = em.getContext('2d');
  A.fillStyle = '#ffffff';
  A.fillRect(0, 0, Z, Z);
  E.fillStyle = '#000000';
  E.fillRect(0, 0, Z, Z);
  // region -> canvas rect (canvas y runs down, uv v runs up)
  const R = (reg, u0, u1, v0, v1) => {
    const [x0, y0] = inReg(reg, Math.min(u0, u1), Math.max(v0, v1));
    const [x1, y1] = inReg(reg, Math.max(u0, u1), Math.min(v0, v1));
    return [x0 * Z, (1 - y0) * Z, (x1 - x0) * Z, (y0 - y1) * Z];
  };
  const box = (ctx, reg, u0, u1, v0, v1, col) => { ctx.fillStyle = col; ctx.fillRect(...R(reg, u0, u1, v0, v1)); };
  const both = (reg, u0, u1, v0, v1, col) => { box(A, reg, u0, u1, v0, v1, col); box(A, reg, u0, u1, 1 - v1, 1 - v0, col); };
  const [c0, c1, c2, c3] = S.cab;
  const sporty = SPORTY.includes(style);
  const fourDoor = ['sedan', 'suv', 'hatch', 'van'].includes(style);
  const TRIM = '#141518';
  const SEAM = '#8a8a8a';
  const GLASS = '#101317';

  // ── body loft: u along the car (0 rear, 1 front), v around the section (0 bottom, .25/.75 sides, .5 top)
  const B = REG.body;
  both(B, 0, 1, 0, 0.1, TRIM); // rocker panels and underside
  box(A, B, 0, 1, 0.9, 1, TRIM);
  if (cop) {
    // black-and-white: black everywhere except the doors and roof
    const d0 = fourDoor ? c1 - 0.01 : c1 + (c2 - c1) * 0.25;
    const d1 = c3 - 0.01;
    box(A, B, 0, d0, 0.1, 0.9, '#0c0c0e');
    box(A, B, d1, 1, 0.1, 0.9, '#0c0c0e');
    box(A, B, d0, d1, 0.4, 0.6, '#0c0c0e');
  }
  // door seams and handles
  const doorEdges = fourDoor ? [c3 - 0.01, (c1 + c2) / 2, c1 - 0.01] : [c3 - 0.01, c1 + (c2 - c1) * 0.25];
  doorEdges.forEach((u) => both(B, u - 0.0015, u + 0.0015, 0.11, 0.405, SEAM));
  for (let d = 0; d < doorEdges.length - 1; d++) {
    const hu = doorEdges[d + 1] + 0.035;
    both(B, hu, hu + 0.03, 0.355, 0.375, '#5a5a5a');
  }
  // hood and trunk shut lines, cowl
  box(A, B, c3 + 0.012, c3 + 0.015, 0.42, 0.58, SEAM);
  box(A, B, 0.965, 0.968, 0.42, 0.58, SEAM);
  [0.43, 0.57].forEach((v) => box(A, B, c3 + 0.012, 0.968, v - 0.0015, v + 0.0015, SEAM));
  if (!['hatch', 'suv', 'van'].includes(style)) {
    box(A, B, c0 - 0.015, c0 - 0.012, 0.42, 0.58, SEAM);
    [0.43, 0.57].forEach((v) => box(A, B, 0.03, c0 - 0.012, v - 0.0015, v + 0.0015, SEAM));
  }
  if (!sporty) both(B, c0, c3, 0.402, 0.41, '#c9ccd1'); // chrome beltline strip
  both(B, 0.955, 0.975, 0.3, 0.33, '#d08a20'); // side markers
  both(B, 0.03, 0.05, 0.3, 0.33, '#8a1010');
  if (sporty) both(B, 0.62, 0.7, 0.16, 0.2, TRIM); // side intake hint

  // ── greenhouse: u from rear glass base (0) to windshield base (1), s across (0 one side, .5 roof, 1 other)
  const Gr = REG.gh;
  const ug = (u) => (u - c0) / (c3 - c0);
  const g1 = ug(c1);
  const g2 = ug(c2);
  box(A, Gr, 0, 1, 0, 1, GLASS);
  // subtle sky reflection gradient on the glass
  const [gx, gy, gw, gh2] = R(Gr, 0, 1, 0, 1);
  const grd = A.createLinearGradient(0, gy, 0, gy + gh2);
  grd.addColorStop(0, 'rgba(70,80,92,0.35)');
  grd.addColorStop(0.5, 'rgba(70,80,92,0.0)');
  grd.addColorStop(1, 'rgba(70,80,92,0.35)');
  A.fillStyle = grd;
  A.fillRect(gx, gy, gw, gh2);
  const rw = 0.2;
  box(A, Gr, g1 + 0.015, g2 - 0.01, 0.5 - rw, 0.5 + rw, cop ? '#ffffff' : '#ffffff'); // roof
  // pillars (body colour)
  const cEnd = ['hatch', 'suv', 'van'].includes(style) ? g1 * 0.5 + 0.02 : g1 + (g2 - g1) * 0.16;
  both(Gr, 0, cEnd, 0.04, 0.5 - rw + 0.01, '#ffffff'); // C/D pillar
  const aStart = g2 + (1 - g2) * 0.3;
  both(Gr, aStart, 1, 0.04, 0.5 - rw + 0.01, '#ffffff'); // A pillar / fender
  const mid = (g1 + g2) / 2 + (fourDoor ? 0 : 0.12);
  both(Gr, mid - 0.012, mid + 0.012, 0.04, 0.5 - rw, TRIM); // B pillar
  both(Gr, 0, 1, 0, 0.045, TRIM); // window seal
  // window surround (black DLO trim)
  both(Gr, cEnd, cEnd + 0.008, 0.04, 0.5 - rw, TRIM);
  both(Gr, aStart - 0.008, aStart, 0.04, 0.5 - rw, TRIM);
  both(Gr, cEnd, aStart, 0.5 - rw - 0.012, 0.5 - rw, TRIM);
  if (cop) both(Gr, mid - 0.04, mid + 0.04, 0.5 - rw - 0.02, 0.5 - rw, '#ffffff');
  if (style === 'van') {
    // panel van: solid cargo sides behind the cab
    both(Gr, 0, mid + 0.05, 0.04, 0.5 - rw + 0.01, '#ffffff');
    box(A, Gr, 0, g1 * 0.6, 0.3, 0.7, '#ffffff');
  }

  // ── front fascia (fx 0..1 across, fy 0 bottom .. 1 top)
  const F = REG.front;
  const both2 = (reg, x0, x1, y0, y1, col, ctx = A) => { box(ctx, reg, x0, x1, y0, y1, col); box(ctx, reg, 1 - x1, 1 - x0, y0, y1, col); };
  box(A, F, 0, 1, 0, 0.2, '#1b1c1f');
  if (cop) box(A, F, 0, 1, 0.2, 1, '#0c0c0e');
  // lower intake with mesh
  box(A, F, sporty ? 0.18 : 0.28, sporty ? 0.82 : 0.72, 0.06, 0.26, '#060607');
  for (let k = 0; k < 14; k++) box(A, F, 0.28 + k * 0.032, 0.284 + k * 0.032, 0.07, 0.25, '#1d1e22');
  // grille
  if (!sporty || style === 'muscle') {
    box(A, F, 0.3, 0.7, 0.4, 0.66, '#08090a');
    for (let k = 0; k < 7; k++) box(A, F, 0.3, 0.7, 0.42 + k * 0.034, 0.43 + k * 0.034, '#30333a');
    if (!sporty) {
      box(A, F, 0.29, 0.71, 0.66, 0.68, '#c9ccd1');
      box(A, F, 0.29, 0.71, 0.38, 0.4, '#c9ccd1');
    }
  } else box(A, F, 0.4, 0.6, 0.46, 0.54, '#0a0a0b');
  // headlights: housing, lens, projector, LED strip
  both2(F, 0.0, 0.3, 0.56, 0.94, '#1e2024');
  both2(F, 0.01, 0.29, 0.59, 0.91, '#b9c0c9');
  both2(F, 0.03, 0.13, 0.64, 0.86, '#f4f6f8');
  both2(F, 0.15, 0.25, 0.64, 0.86, '#e8ecf0');
  both2(F, 0.01, 0.29, 0.59, 0.63, '#ffffff', E);
  both2(F, 0.03, 0.13, 0.64, 0.86, '#fffaf0', E);
  both2(F, 0.15, 0.25, 0.64, 0.86, '#f0f4ff', E);
  both2(F, 0.26, 0.29, 0.62, 0.72, '#ffae2a'); // amber indicator
  // light clusters wrap round the front corners of the body
  both(B, 0.955, 1, 0.3, 0.44, '#1e2024');
  both(B, 0.96, 1, 0.31, 0.43, '#b9c0c9');
  both(B, 0.96, 1, 0.31, 0.33, '#ffffff');
  both(B, 0.96, 1, 0.31, 0.33, '#ffffff');
  [[0.31, 0.33], [0.67, 0.69]].forEach(([v0, v1]) => box(E, B, 0.96, 1, v0, v1, '#ffffff'));
  both2(F, 0.09, 0.15, 0.12, 0.18, '#d9dde2'); // fog lights
  // ── rear fascia
  const Rr = REG.rear;
  box(A, Rr, 0, 1, 0, 0.18, '#1b1c1f');
  if (cop) box(A, Rr, 0, 1, 0.18, 1, '#0c0c0e');
  box(A, Rr, 0.36, 0.64, 0.24, 0.46, '#2a2b2f'); // plate recess
  box(A, Rr, 0.06, 0.94, 0.5, 0.505, SEAM); // trunk lid line
  both2(Rr, 0.0, 0.32, 0.5, 0.92, '#2a0608');
  both2(Rr, 0.01, 0.31, 0.53, 0.89, '#8c0d10');
  both2(Rr, 0.04, 0.2, 0.55, 0.64, '#d7d7d7'); // reverse light
  both2(Rr, 0.01, 0.31, 0.68, 0.89, '#ff1d24', E);
  both(B, 0, 0.045, 0.3, 0.44, '#2a0608');
  both(B, 0, 0.04, 0.31, 0.43, '#8c0d10');
  [[0.33, 0.43], [0.57, 0.67]].forEach(([v0, v1]) => box(E, B, 0, 0.04, v0, v1, '#ff1d24'));
  if (S.tail === 'bar') {
    box(A, Rr, 0.3, 0.7, 0.72, 0.76, '#8c0d10');
    box(E, Rr, 0.3, 0.7, 0.72, 0.76, '#ff1d24');
  }
  const map = new THREE.CanvasTexture(al);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(em);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const out = { map, emissiveMap };
  atlasCache.set(key, out);
  return out;
}

// ───────────── wheels ─────────────
const wheelCache = new Map();
function wheelGeometry(R, style) {
  const key = `${R}|${style}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const tw = 0.27;
  const rr = R * 0.66;
  // sidewall bulge, shoulders and a tread band; tread grooves are cut into the band as real geometry
  const prof = [
    [rr * 0.98, -tw / 2], [rr + 0.02, -tw / 2 - 0.004], [R - 0.06, -tw / 2 - 0.008], [R - 0.03, -tw / 2 - 0.004], [R - 0.01, -tw / 2 + 0.015], [R, -tw / 2 + 0.04],
    [R, -0.075], [R - 0.012, -0.07], [R - 0.012, -0.055], [R, -0.05], [R, -0.012], [R - 0.012, -0.008], [R - 0.012, 0.008], [R, 0.012], [R, 0.05], [R - 0.012, 0.055], [R - 0.012, 0.07], [R, 0.075],
    [R, tw / 2 - 0.04], [R - 0.01, tw / 2 - 0.015], [R - 0.03, tw / 2 + 0.004], [R - 0.06, tw / 2 + 0.008], [rr + 0.02, tw / 2 + 0.004], [rr * 0.98, tw / 2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tire = new THREE.LatheGeometry(prof, 72);
  tire.rotateZ(Math.PI / 2);

  const parts = [];
  const barrel = new THREE.CylinderGeometry(rr, rr, tw * 0.9, 32, 1, true);
  barrel.rotateZ(Math.PI / 2);
  parts.push(barrel);
  const lip = new THREE.TorusGeometry(rr - 0.012, 0.016, 8, 40);
  lip.rotateY(Math.PI / 2);
  lip.translate(tw * 0.42, 0, 0);
  parts.push(lip);
  const hub = new THREE.CylinderGeometry(0.075, 0.085, 0.07, 16);
  hub.rotateZ(Math.PI / 2);
  hub.translate(tw * 0.36, 0, 0);
  parts.push(hub);
  // five lug nuts and a centre cap with a badge disc
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const nut = new THREE.CylinderGeometry(0.012, 0.012, 0.025, 6);
    nut.rotateZ(Math.PI / 2);
    nut.translate(tw * 0.4, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
    parts.push(nut);
  }
  const cap = new THREE.SphereGeometry(0.034, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.rotateZ(-Math.PI / 2);
  cap.translate(tw * 0.405, 0, 0);
  parts.push(cap);
  const spokeCount = { five: 5, ten: 10, multi: 14, steel: 0 }[style] ?? 5;
  for (let k = 0; k < spokeCount; k++) {
    const len = rr - 0.07;
    const wide = style === 'five' ? 0.075 : style === 'ten' ? 0.04 : 0.028;
    const sp = new THREE.BoxGeometry(0.045, len, wide, 1, 4, 1);
    // spokes taper toward the rim and twist slightly
    sp.translate(tw * 0.36, 0.07 + len / 2, 0);
    // slight concave dish
    const p = sp.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = p.getY(v) / rr;
      p.setX(v, p.getX(v) - t * 0.05);
      p.setZ(v, p.getZ(v) * (1.15 - t * 0.35));
    }
    sp.rotateX((k / spokeCount) * Math.PI * 2);
    parts.push(sp);
  }
  if (style === 'steel') {
    const face = new THREE.CylinderGeometry(rr * 0.92, rr * 0.92, 0.02, 32);
    face.rotateZ(Math.PI / 2);
    face.translate(tw * 0.3, 0, 0);
    parts.push(face);
  }
  const rim = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const plateA = new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.012, 40); plateA.rotateZ(Math.PI / 2); plateA.translate(tw * 0.05 - 0.012, 0, 0);
  const plateB = plateA.clone(); plateB.translate(0.024, 0, 0);
  const hat = new THREE.CylinderGeometry(rr * 0.4, rr * 0.42, 0.06, 24); hat.rotateZ(Math.PI / 2); hat.translate(tw * 0.15, 0, 0);
  const vanes = [];
  for (let k = 0; k < 24; k++) { const v = new THREE.BoxGeometry(0.012, rr * 0.3, 0.008); v.translate(tw * 0.05, rr * 0.66, 0); v.rotateX((k / 24) * Math.PI * 2); vanes.push(v); }
  const disc = mergeGeometries([plateA, plateB, hat, ...vanes].map((g) => (g.index ? g.toNonIndexed() : g)));
  const caliper = new THREE.CapsuleGeometry(0.045, 0.16, 4, 10);
  caliper.rotateX(Math.PI / 2);
  caliper.scale(0.9, 1, 1);
  const bend = caliper.attributes.position;
  for (let i = 0; i < bend.count; i++) { const z = bend.getZ(i); bend.setY(i, bend.getY(i) - z * z * 1.2); } // follow the disc's curve
  caliper.computeVertexNormals();
  caliper.scale(0.8, 0.8, 0.8);
  caliper.translate(tw * 0.14, rr * 0.6, -rr * 0.18);
  const res = { tire, rim, disc, caliper, tw };
  wheelCache.set(key, res);
  return res;
}

// ───────────── textures ─────────────
let sharedTex = null;
function textures() {
  if (sharedTex) return sharedTex;
  const make = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  sharedTex = {
    plate: make(256, 56, (g, w, h) => {
      g.fillStyle = '#f1f1ec';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#222';
      g.lineWidth = 4;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#16161a';
      g.font = 'bold 36px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('MP 2026', w / 2, h / 2 + 2);
    }),
    grille: make(128, 64, (g, w, h) => {
      g.fillStyle = '#060607';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a2b30';
      g.lineWidth = 2;
      for (let y = -h; y < h * 2; y += 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + w * 0.5);
        g.stroke();
        g.beginPath();
        g.moveTo(0, y + w * 0.5);
        g.lineTo(w, y);
        g.stroke();
      }
    }),
    police: make(512, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#0b1a3a';
      g.font = 'bold 72px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('POLICE', w / 2, h / 2 + 4);
    }),
  };
  sharedTex.grille.wrapS = THREE.RepeatWrapping;
  sharedTex.grille.wrapT = THREE.RepeatWrapping;
  return sharedTex;
}

const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g.toNonIndexed();
};
const cyl = (r1, r2, h, x, y, z, axis = 'z', seg = 16) => {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g.toNonIndexed();
};

export class CarFactory {
  constructor() {
    const t = textures();
    this.shared = {
      glass: new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0.0, roughness: 0.05, envMapIntensity: 1.0 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.2 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.12 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
      disc: new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.45 }),
      plate: new THREE.MeshStandardMaterial({ map: t.plate, roughness: 0.5 }),
      police: new THREE.MeshStandardMaterial({ map: t.police, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
      flame: new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      rims: {
        silver: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.22 }),
        gunmetal: new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 1, roughness: 0.3 }),
        black: new THREE.MeshStandardMaterial({ color: 0x111215, metalness: 0.7, roughness: 0.35 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 1, roughness: 0.25 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.25 }),
      },
      calipers: [0xd11a2a, 0xf2b705, 0x1e6bff, 0x333333].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3 })),
    };
    this.bodyCache = new Map();
    this.partCache = new Map();
    this.models = null; // optional real GLB models (models.js)
  }

  body(style) {
    if (!this.bodyCache.has(style)) this.bodyCache.set(style, buildBody(STYLES[style] || STYLES.sedan));
    return this.bodyCache.get(style);
  }

  // small fixed parts per style (mirrors, spoilers, plates, exhausts), merged per material and cached
  parts(style, cop) {
    const key = style + (cop ? '-cop' : '');
    if (this.partCache.has(key)) return this.partCache.get(key);
    const S = STYLES[style] || STYLES.sedan;
    const { P, front, rear } = this.body(style);
    const paintG = [];
    const trimG = [];
    const chromeG = [];
    const glassG = [];
    const plateG = [];
    const zF = S.L / 2;
    const zR = -S.L / 2;
    const yb = S.clear;
    const sporty = SPORTY.includes(style);
    // mirrors on the doors, just behind the A pillar
    const uM = S.cab[3] - 0.03;
    const zM = P.zOf(uM);
    const dM = P.deck(uM);
    [-1, 1].forEach((s) => {
      const x = s * (P.halfW(uM) * 0.92 + 0.1);
      // aerodynamic housing (a squashed teardrop), a stalk to the door, and the mirror glass facing back
      const hx = s * (P.halfW(uM) * 0.92 + 0.07);
      const hsg = new THREE.SphereGeometry(1, 16, 10);
      const hp = hsg.attributes.position;
      for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); hp.setZ(i, z < 0 ? z * 0.6 : z); }
      hsg.scale(0.07, 0.055, 0.11);
      hsg.rotateY(-s * 0.15);
      hsg.translate(hx, dM + 0.13, zM - 0.04);
      paintG.push(hsg.index ? hsg.toNonIndexed() : hsg);
      const stalk = new THREE.CapsuleGeometry(0.018, 0.08, 3, 8);
      stalk.rotateZ(Math.PI / 2 + s * 0.35);
      stalk.translate(s * (P.halfW(uM) * 0.92 + 0.0), dM + 0.09, zM - 0.02);
      trimG.push(stalk.index ? stalk.toNonIndexed() : stalk);
      glassG.push(box(0.1, 0.075, 0.006, hx, dM + 0.13, zM - 0.04 - 0.065, -s * 0.15));
    });
    // number plates
    plateG.push(box(0.52, 0.11, 0.01, 0, rear.yb + (rear.yt - rear.yb) * 0.35, zR - 0.012, Math.PI), box(0.52, 0.11, 0.01, 0, front.yb + (front.yt - front.yb) * 0.33, zF + 0.012));
    // exhausts
    if (sporty) [-1, 1].forEach((s) => chromeG.push(cyl(0.045, 0.045, 0.12, s * 0.42, yb + 0.1, zR + 0.03, 'z')));
    else chromeG.push(cyl(0.032, 0.032, 0.1, -0.5, yb + 0.07, zR + 0.06, 'z'));
    // spoilers
    if (S.spoiler === 'wing') {
      const h = S.wingH || 0.25;
      const zW = zR + 0.3;
      const dW = P.deck(0.06);
      paintG.push(box(S.W * 0.86, 0.04, 0.32, 0, dW + h, zW, 0, -0.08));
      trimG.push(box(0.02, 0.18, 0.36, S.W * 0.43, dW + h + 0.02, zW), box(0.02, 0.18, 0.36, -S.W * 0.43, dW + h + 0.02, zW));
      [-1, 1].forEach((s) => trimG.push(box(0.035, h, 0.1, s * S.W * 0.26, dW + h / 2, zW)));
    } else if (S.spoiler === 'lip') {
      paintG.push(box(S.W * 0.7, 0.03, 0.12, 0, P.deck(0.02) + 0.015, zR + 0.1, 0, -0.25));
    } else if (S.spoiler === 'roof' && style === 'hatch') {
      const zS = P.zOf(S.cab[1]);
      trimG.push(box(S.W * S.cabW * 0.9, 0.04, 0.2, 0, greenhouseTop(P, S, S.cab[1]) + 0.01, zS - 0.04, 0, -0.12));
    }
    if (style === 'suv') {
      // roof rails
      const z0 = P.zOf(S.cab[1] + 0.02);
      const z1 = P.zOf(S.cab[2] - 0.02);
      const y = greenhouseTop(P, S, (S.cab[1] + S.cab[2]) / 2) + 0.04;
      [-1, 1].forEach((s) => trimG.push(box(0.05, 0.05, z1 - z0, s * S.W * S.cabW * 0.42, y, (z0 + z1) / 2)));
    }
    if (S.scoop) trimG.push(box(0.5, 0.06, 0.6, 0, P.deck(0.84) + 0.02, P.zOf(0.84)));
    if (cop) {
      // push bar and roof light bar base
      trimG.push(box(S.W * 0.6, 0.3, 0.05, 0, yb + 0.33, zF + 0.14), box(0.05, 0.3, 0.2, S.W * 0.27, yb + 0.33, zF + 0.05), box(0.05, 0.3, 0.2, -S.W * 0.27, yb + 0.33, zF + 0.05));
      trimG.push(box(1.15, 0.06, 0.28, 0, S.roof + 0.03, P.zOf((S.cab[1] + S.cab[2]) / 2)));
    }
    const merge = (list) => (list.length ? mergeGeometries(list) : null);
    const res = { paint: merge(paintG), trim: merge(trimG), chrome: merge(chromeG), glass: merge(glassG), plate: merge(plateG) };
    this.partCache.set(key, res);
    return res;
  }

  build(style, color, opts = {}) {
    const S = STYLES[style] || STYLES.sedan;
    const sh = this.shared;
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const own = [];
    const ownGeo = [];
    const model = this.models && this.models.get(opts.modelKey || style);
    let tail = new THREE.MeshStandardMaterial({ color: 0x2a0000, emissive: 0xff1020, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
    let paint;
    let P;
    let inst = null;
    const mesh = (g, m, cast = true) => {
      if (!g) return null;
      const o = new THREE.Mesh(g, m);
      o.castShadow = cast;
      o.receiveShadow = true;
      group.add(o);
      return o;
    };
    if (model) {
      paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color) });
      inst = model.instantiate(color);
      group.add(inst.object);
      if (inst.paint) { paint.dispose(); paint = inst.paint; }
      if (inst.tail) tail = inst.tail;
      own.push(...inst.own);
      P = profile(S);
    } else {
      const atlas = liveryAtlas(style in STYLES ? style : 'sedan', !!opts.cop);
      paint = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.cop ? '#f4f4f2' : color), map: atlas.map, emissiveMap: atlas.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4,
        metalness: opts.matte ? 0.1 : 0.45, roughness: opts.matte ? 0.55 : 0.3, clearcoat: opts.matte ? 0.1 : 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1,
      });
      const b = this.body(style in STYLES ? style : 'sedan');
      P = b.P;
      mesh(b.geometry, paint);
      const pt = this.parts(style in STYLES ? style : 'sedan', !!opts.cop);
      mesh(pt.paint, paint);
      mesh(pt.trim, sh.trim);
      mesh(pt.chrome, sh.chrome, false);
      mesh(pt.glass, sh.glass, false);
      mesh(pt.plate, sh.plate, false);
      // brake-light overlays on the rear fascia (they brighten under braking)
      const r = b.rear;
      const tw = r.a * 0.48;
      [-1, 1].forEach((s) => {
        const g = new THREE.PlaneGeometry(tw * 0.62, (r.yt - r.yb) * 0.2);
        g.rotateY(Math.PI);
        g.translate(s * r.a * 0.68, r.yb + (r.yt - r.yb) * 0.785, -S.L / 2 - 0.006);
        ownGeo.push(g);
        mesh(g, tail, false);
      });
      if (opts.cop) {
        [-1, 1].forEach((s) => {
          const plane = new THREE.PlaneGeometry(1.15, 0.22);
          plane.rotateY(s * Math.PI / 2);
          plane.translate(s * (P.halfW(0.5) * 0.985 + 0.012), P.deck(0.5) - 0.26, P.zOf(0.5));
          ownGeo.push(plane);
          mesh(plane, sh.police, false);
        });
      }
    }
    own.push(paint, tail);

    // wheels: pivot (steers) > spinning group (tyre, rim, disc) + fixed caliper
    const wg = wheelGeometry(S.R, S.rim || 'five');
    const rimMat = sh.rims[opts.rim || (opts.cop ? 'black' : S.rim === 'steel' ? 'silver' : ['silver', 'gunmetal', 'black', 'silver'][Math.floor(Math.random() * 4)])];
    const calMat = sh.calipers[opts.caliper !== undefined ? opts.caliper : Math.floor(Math.random() * 4)];
    const wheels = inst && inst.wheels.length >= 4 ? inst.wheels : [];
    const pivots = inst && inst.wheels.length >= 4 ? inst.pivots : [];
    const track = S.W / 2 - wg.tw / 2 - 0.03;
    if (!wheels.length) [[-1, P.front], [1, P.front], [-1, P.rear], [1, P.rear]].forEach(([sx, z]) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * track, S.R, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(wg.tire, sh.tire);
      const rim = new THREE.Mesh(wg.rim, rimMat);
      const disc = new THREE.Mesh(wg.disc, sh.disc);
      tire.castShadow = true;
      spin.add(tire, rim, disc);
      if (sx < 0) spin.scale.x = -1; // mirror so the rim face points outward on the left side
      const cal = new THREE.Mesh(wg.caliper, calMat);
      if (sx < 0) cal.scale.x = -1;
      pivot.add(spin, cal);
      group.add(pivot);
      if (model) pivot.visible = model.hasWheels === false;
      wheels.push(spin);
      if (z === P.front) pivots.push(pivot);
    });

    // nitrous flames
    const flames = [];
    if (opts.flames) {
      const fg = new THREE.ConeGeometry(0.07, 0.9, 10, 1, true);
      fg.translate(0, 0.45, 0);
      fg.rotateX(-Math.PI / 2);
      ownGeo.push(fg);
      [-1, 1].forEach((side) => {
        const f = new THREE.Mesh(fg, sh.flame);
        f.position.set(side * 0.42, S.clear + 0.1, -(model ? model.dims.L : S.L) / 2 - 0.05);
        f.visible = false;
        group.add(f);
        flames.push(f);
      });
    }

    // police light bar
    let lightbar = null;
    if (opts.cop) {
      const red = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0022, emissiveIntensity: 0.3 });
      const blue = new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x1a4dff, emissiveIntensity: 0.3 });
      own.push(red, blue);
      const z = P.zOf((S.cab[1] + S.cab[2]) / 2);
      const geo = new THREE.BoxGeometry(0.5, 0.11, 0.24);
      ownGeo.push(geo);
      const r = new THREE.Mesh(geo, red);
      r.position.set(-0.3, S.roof + 0.12, z);
      const b = new THREE.Mesh(geo, blue);
      b.position.set(0.3, S.roof + 0.12, z);
      group.add(r, b);
      lightbar = { red, blue };
    }

    const dims = model ? { L: model.dims.L, W: model.dims.W, wheel: model.dims.wheel } : { L: S.L, W: S.W, wheel: S.R };
    return { group, paint, tail, wheels, pivots, flames, lightbar, own, ownGeo, dims };
  }

  dispose(parts) {
    parts.ownGeo.forEach((g) => g.dispose());
    parts.own.forEach((m) => m.dispose());
    if (parts.group.parent) parts.group.parent.remove(parts.group);
  }
}

// Merged geometry for instanced parked cars: { paint (atlas-mapped body), dark (wheels), map } in car-local space.
export function parkedCarGeometries(style = 'sedan') {
  const S = STYLES[style];
  const { geometry, P } = buildBody(S, 26, 20);
  const dark = [];
  [[-1, P.front], [1, P.front], [-1, P.rear], [1, P.rear]].forEach(([sx, z]) => {
    const w = new THREE.CylinderGeometry(S.R, S.R, 0.24, 14);
    w.rotateZ(Math.PI / 2);
    w.translate(sx * (S.W / 2 - 0.2), S.R, z);
    dark.push(w.toNonIndexed());
  });
  const atlas = liveryAtlas(style);
  return { paint: geometry, glass: new THREE.BufferGeometry(), dark: mergeGeometries(dark), map: atlas.map, emissiveMap: atlas.emissiveMap, L: S.L, W: S.W };
}
