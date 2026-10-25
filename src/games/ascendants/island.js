// Ascendants: the island. Generated once (fixed seed, so everyone plays the same map): a heightmap with a
// noisy coastline, rolling hills, a mountain range with a snowy summit, a crater lake, beaches and cliffs;
// named places with houses, ruins, a lighthouse, docks and a research base; forests and boulders.
// It also answers the game's physical questions: ground height, colliding a body with buildings, trees
// and rocks, and ray casts for line of sight, aiming and projectiles.
import { WORLD, mulberry32, clamp, lerp } from './data.js';

const N = 351; // height samples per side (4 m apart)
const CELL = WORLD.size / (N - 1);

// ── noise ──
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => { const u = (h & 1) ? x : -x; const v = (h & 2) ? y : -y; return (h & 4) ? u + v * 0.5 : u * 0.5 + v; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x); const v = fade(y);
    const a = perm[X] + Y; const b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u), lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
  };
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// named places: [name, x, z, radius, kind, target height (null = follow terrain)]
export const POIS = [
  { name: 'Harbor Rest', x: 40, z: 470, r: 80, kind: 'harbor' },
  { name: 'Pinewatch', x: -330, z: 120, r: 70, kind: 'village' },
  { name: 'Old Mill', x: -150, z: -60, r: 55, kind: 'farm' },
  { name: 'Summit Station', x: 90, z: -330, r: 40, kind: 'station' },
  { name: 'Lighthouse Point', x: 515, z: 120, r: 45, kind: 'lighthouse' },
  { name: 'Sunken Temple', x: -380, z: -330, r: 60, kind: 'ruins' },
  { name: 'Driftwood Bay', x: 360, z: 390, r: 60, kind: 'huts' },
  { name: 'Hollow Farm', x: 60, z: 240, r: 70, kind: 'farm' },
  { name: 'Crater Lab', x: 300, z: -170, r: 55, kind: 'lab' },
  { name: 'Fisher Cove', x: -420, z: 380, r: 50, kind: 'huts' },
];

export class Island {
  constructor(seed = 20261025) {
    this.seed = seed;
    const n1 = makeNoise(seed); const n2 = makeNoise(seed + 1); const n3 = makeNoise(seed + 2);
    this.noise = n1;
    const fbm = (x, y, o = 5) => { let s = 0; let a = 1; let f = 1; let t = 0; for (let i = 0; i < o; i++) { s += n1(x * f, y * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
    const ridge = (x, y) => { let s = 0; let a = 1; let f = 1; let t = 0; for (let i = 0; i < 5; i++) { s += (1 - Math.abs(n2(x * f, y * f))) ** 2 * a; t += a; a *= 0.5; f *= 2.1; } return s / t; };
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -WORLD.half + i * CELL; const z = -WORLD.half + j * CELL;
        // coastline: a squashed circle broken up by noise, with a couple of capes
        const ang = Math.atan2(z, x);
        const coast = 560 + fbm(Math.cos(ang) * 2.2 + 7, Math.sin(ang) * 2.2 + 3, 4) * 140 + Math.cos(ang * 3 + 1.2) * 30;
        const d = Math.hypot(x * 1.0, z * 1.08);
        const land = smooth(coast + 40, coast - 70, d); // 0 sea .. 1 inland
        let h = -14 + land * 18;
        h += fbm(x / 260, z / 260) * 22 * land; // rolling hills
        // the mountain range runs across the north; the summit is near Summit Station
        const mtn = smooth(260, 40, Math.hypot((x - 60) * 0.7, (z + 320) * 1.3)) * land;
        h += ridge(x / 220 + 5, z / 220) * 150 * mtn + mtn * 30;
        // cliffs on the east and north-west coasts
        const cliff = smooth(0.4, 0.75, n3(x / 300, z / 300) + 0.5) * smooth(coast - 10, coast - 90, d);
        h += cliff * 14;
        // a crater lake west of the centre
        const lake = smooth(70, 20, Math.hypot(x + 210, z - 230));
        h = lerp(h, -7, lake * 0.95);
        // small detail
        h += fbm(x / 40, z / 40, 3) * 2.2 * land;
        H[j * N + i] = h;
      }
    }
    // flatten the places so houses sit level
    for (const p of POIS) {
      let sum = 0; let cnt = 0;
      for (let a = 0; a < 16; a++) { const hh = this._raw(H, p.x + Math.cos(a) * p.r * 0.5, p.z + Math.sin(a) * p.r * 0.5); sum += hh; cnt++; }
      p.h = Math.max(p.kind === 'harbor' || p.kind === 'huts' ? 2.2 : 4, sum / cnt);
      if (p.kind === 'station') p.h = Math.max(p.h, 60);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = -WORLD.half + i * CELL; const z = -WORLD.half + j * CELL;
        const w = smooth(p.r * 1.25, p.r * 0.75, Math.hypot(x - p.x, z - p.z));
        if (w > 0) H[j * N + i] = lerp(H[j * N + i], p.h, w);
      }
    }
    this.H = H;
    this.colliders = [];
    this.grid = new Map();
    this.buildings = [];
    this.trees = [];
    this.rocks = [];
    this.props = [];
    this.crateSpots = [];
    this.build();
  }

  _raw(H, x, z) {
    const fx = clamp((x + WORLD.half) / CELL, 0, N - 1.001); const fz = clamp((z + WORLD.half) / CELL, 0, N - 1.001);
    const i = Math.floor(fx); const j = Math.floor(fz); const tx = fx - i; const tz = fz - j;
    const a = H[j * N + i]; const b = H[j * N + i + 1]; const c = H[(j + 1) * N + i]; const d = H[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  // terrain height
  height(x, z) { return this._raw(this.H, x, z); }
  normal(x, z) {
    const e = 1.5;
    const dx = this.height(x + e, z) - this.height(x - e, z); const dz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    return [-dx / l, (2 * e) / l, -dz / l];
  }
  biome(x, z) {
    const h = this.height(x, z); const n = this.normal(x, z);
    if (h < 0.4) return 'water';
    if (h > 92) return 'snow';
    if (n[1] < 0.78 || h > 70) return 'rock';
    if (h < 2.8) return 'sand';
    return 'grass';
  }
  inside(x, z) { return Math.abs(x) < WORLD.half - 2 && Math.abs(z) < WORLD.half - 2; }

  // ── obstacles ──
  // box: oriented box {t:'box', x,y,z (base centre), w,d,h, ry}; cyl: {t:'cyl', x,z,y0,y1,r}; sph: {t:'sph', x,y,z,r}
  addCollider(c) {
    c.id = this.colliders.length;
    this.colliders.push(c);
    const r = c.t === 'box' ? Math.hypot(c.w, c.d) / 2 : c.r;
    const i0 = Math.floor((c.x - r) / 16); const i1 = Math.floor((c.x + r) / 16);
    const j0 = Math.floor((c.z - r) / 16); const j1 = Math.floor((c.z + r) / 16);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i * 4096 + j;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    return c;
  }
  removeCollider(c) {
    const r = (c.t === 'box' ? Math.hypot(c.w, c.d) / 2 : c.r) + 1;
    const i0 = Math.floor((c.x - r) / 16); const i1 = Math.floor((c.x + r) / 16);
    const j0 = Math.floor((c.z - r) / 16); const j1 = Math.floor((c.z + r) / 16);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i * 4096 + j; const l = this.grid.get(k);
      if (!l) continue;
      const ix = l.indexOf(c); if (ix >= 0) l.splice(ix, 1);
      if (!l.length) this.grid.delete(k);
    }
  }
  // trees: a 32 m grid for quick lookups; felled trees lose their collider
  treesNear(x, z, r) {
    if (!this.treeGrid) {
      this.treeGrid = new Map();
      this.trees.forEach((t) => { const k = Math.floor(t.x / 32) * 4096 + Math.floor(t.z / 32); if (!this.treeGrid.has(k)) this.treeGrid.set(k, []); this.treeGrid.get(k).push(t); });
    }
    const out = [];
    const i0 = Math.floor((x - r) / 32); const i1 = Math.floor((x + r) / 32); const j0 = Math.floor((z - r) / 32); const j1 = Math.floor((z + r) / 32);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = this.treeGrid.get(i * 4096 + j);
      if (l) for (const t of l) if (!t.dead && Math.hypot(t.x - x, t.z - z) < r) out.push(t);
    }
    return out;
  }
  fellTree(i) {
    const t = this.trees[i];
    if (!t || t.dead) return false;
    t.dead = true;
    if (t.col) this.removeCollider(t.col);
    return true;
  }
  near(x, z, r = 2) {
    const out = new Set();
    const i0 = Math.floor((x - r) / 16); const i1 = Math.floor((x + r) / 16);
    const j0 = Math.floor((z - r) / 16); const j1 = Math.floor((z + r) / 16);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const l = this.grid.get(i * 4096 + j); if (l) l.forEach((c) => out.add(c)); }
    return out;
  }

  // standing height at (x,z) for a body whose feet are at y: terrain or the top of something under it
  floor(x, z, y, rad = 0.35) {
    let g = Math.max(this.height(x, z), -40);
    for (const c of this.near(x, z, rad + 1)) {
      if (c.t === 'box') {
        const [lx, lz] = toLocal(c, x, z);
        if (Math.abs(lx) <= c.w / 2 + rad * 0.6 && Math.abs(lz) <= c.d / 2 + rad * 0.6) { const top = c.y + c.h; if (top <= y + MOVE_STEP && top > g) g = top; }
      } else if (c.t === 'sph') {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r) { const top = c.y + Math.sqrt(c.r * c.r - d * d); if (top <= y + MOVE_STEP && top > g) g = top; }
      } else if (c.t === 'cyl' && c.r >= 2.5) {
        // big rock columns can be stood on
        if (Math.hypot(x - c.x, z - c.z) < c.r) { const top = c.y1; if (top <= y + MOVE_STEP && top > g) g = top; }
      }
    }
    return g;
  }

  // push a vertical capsule (feet at p[1]) out of obstacles; returns true if something was hit
  collide(p, rad, height) {
    let hit = false;
    for (const c of this.near(p[0], p[2], rad + 1)) {
      if (c.t === 'box') {
        if (p[1] + height < c.y || p[1] >= c.y + c.h - MOVE_STEP) continue;
        const [lx, lz] = toLocal(c, p[0], p[2]);
        const hx = c.w / 2 + rad; const hz = c.d / 2 + rad;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const ox = hx - Math.abs(lx); const oz = hz - Math.abs(lz);
          let nx = 0; let nz = 0;
          if (ox < oz) nx = Math.sign(lx) * ox; else nz = Math.sign(lz) * oz;
          const [wx, wz] = toWorldDir(c, nx, nz);
          p[0] += wx; p[2] += wz; hit = true;
        }
      } else if (c.t === 'cyl') {
        if (p[1] + height < c.y0 || p[1] > c.y1) continue;
        const dx = p[0] - c.x; const dz = p[2] - c.z; const d = Math.hypot(dx, dz); const m = c.r + rad;
        if (d < m && d > 1e-6) { p[0] = c.x + (dx / d) * m; p[2] = c.z + (dz / d) * m; hit = true; }
      } else if (c.t === 'sph') {
        const cy = clamp(c.y, p[1] + rad, p[1] + height - rad);
        const dx = p[0] - c.x; const dy = cy - c.y; const dz = p[2] - c.z; const d = Math.hypot(dx, dy, dz); const m = c.r + rad;
        if (d < m && p[1] < c.y + c.r * 0.6) { const hd = Math.hypot(dx, dz) || 1e-6; const push = m - d; p[0] += (dx / hd) * push; p[2] += (dz / hd) * push; hit = true; }
      }
    }
    return hit;
  }

  // ray against terrain and obstacles. returns { t, p:[x,y,z], n:[..], c (collider or null) } or null
  ray(o, d, max = 300) {
    let best = null;
    // terrain: march, then bisect
    let prevT = 0; let prevAbove = o[1] - this.height(o[0], o[2]);
    const step = 1.2;
    for (let t = step; t <= max; t += step * (1 + t / 200)) {
      const x = o[0] + d[0] * t; const y = o[1] + d[1] * t; const z = o[2] + d[2] * t;
      if (!this.inside(x, z)) { if (y < -12) break; continue; }
      const above = y - this.height(x, z);
      if (above < 0 && prevAbove >= 0) {
        let a = prevT; let b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; const yy = o[1] + d[1] * m; if (yy - this.height(o[0] + d[0] * m, o[2] + d[2] * m) < 0) b = m; else a = m; }
        const px = o[0] + d[0] * b; const pz = o[2] + d[2] * b;
        best = { t: b, p: [px, o[1] + d[1] * b, pz], n: this.normal(px, pz), c: null };
        break;
      }
      prevT = t; prevAbove = above;
    }
    // obstacles along the ray (walk the grid cells it passes)
    const lim = best ? best.t : max;
    const seen = new Set();
    for (let t = 0; t <= lim + 8; t += 8) {
      for (const c of this.near(o[0] + d[0] * t, o[2] + d[2] * t, 8)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const r = rayCollider(c, o, d);
        if (r && r.t >= 0 && r.t < (best ? best.t : max)) best = { t: r.t, p: [o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t], n: r.n, c };
      }
    }
    return best;
  }

  // clear line between two points?
  los(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(...d);
    if (L < 0.01) return true;
    const h = this.ray(a, [d[0] / L, d[1] / L, d[2] / L], L);
    return !h || h.t > L - 0.3;
  }

  // ── content ──
  build() {
    const rnd = mulberry32(this.seed + 99);
    const ok = (x, z, clear = 6) => {
      if (!this.inside(x, z)) return false;
      for (const c of this.near(x, z, clear)) {
        const r = c.t === 'box' ? Math.hypot(c.w, c.d) / 2 : c.r;
        if (Math.hypot(x - c.x, z - c.z) < r + clear * 0.5) return false;
      }
      return true;
    };
    const house = (x, z, w, d, h, ry, style, roof = 'gable') => {
      const y = this.height(x, z) - 0.6;
      const b = { x, z, y, w, d, h, ry, style, roof };
      this.buildings.push(b);
      this.addCollider({ t: 'box', x, y, z, w, d, h: h + 0.6, ry, b });
      return b;
    };
    for (const p of POIS) {
      const R = p.r;
      if (p.kind === 'village' || p.kind === 'harbor') {
        // houses round a little square, facing it
        const n = p.kind === 'harbor' ? 11 : 9;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rnd() * 0.3; const rr = R * (0.45 + rnd() * 0.4);
          const x = p.x + Math.cos(a) * rr; const z = p.z + Math.sin(a) * rr;
          if (!ok(x, z, 9)) continue;
          const big = rnd() < 0.3;
          house(x, z, big ? 11 : 7 + rnd() * 2, big ? 8 : 6 + rnd() * 2, big ? 7.5 : 4.2 + rnd() * 1.5, -a + Math.PI / 2, ['plaster', 'timber', 'stone'][Math.floor(rnd() * 3)]);
          this.crateSpots.push([x + Math.cos(a) * -8, z + Math.sin(a) * -8, 'rare']);
        }
        this.crateSpots.push([p.x, p.z, 'legendary']);
        if (p.kind === 'harbor') {
          // a pier out to sea
          for (let k = 0; k < 8; k++) { const z = p.z + 60 + k * 9; this.props.push({ t: 'pier', x: p.x - 30, z, ry: 0 }); this.addCollider({ t: 'box', x: p.x - 30, y: 1.2, z, w: 6, d: 9.2, h: 0.5, ry: 0 }); }
          this.crateSpots.push([p.x - 30, p.z + 120, 'rare']);
        }
      } else if (p.kind === 'farm') {
        house(p.x, p.z, 16, 10, 8, rnd() * 3, 'barn', 'barn');
        house(p.x + 22, p.z - 12, 8, 7, 4.5, rnd() * 3, 'plaster');
        house(p.x - 20, p.z + 16, 7, 6, 4.2, rnd() * 3, 'timber');
        // silo
        const sy = this.height(p.x + 14, p.z + 18);
        this.props.push({ t: 'silo', x: p.x + 14, z: p.z + 18, y: sy });
        this.addCollider({ t: 'cyl', x: p.x + 14, z: p.z + 18, y0: sy - 1, y1: sy + 14, r: 3.2 });
        for (let k = 0; k < 10; k++) { const a = rnd() * 6.28; this.props.push({ t: 'hay', x: p.x + Math.cos(a) * (R * 0.8), z: p.z + Math.sin(a) * (R * 0.8) }); }
        this.crateSpots.push([p.x, p.z + 9, 'rare'], [p.x + 30, p.z + 20, 'common'], [p.x - 35, p.z - 10, 'common']);
      } else if (p.kind === 'huts') {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rnd(); const rr = R * (0.4 + rnd() * 0.4);
          const x = p.x + Math.cos(a) * rr; const z = p.z + Math.sin(a) * rr;
          if (ok(x, z, 8)) { house(x, z, 5.5, 5, 3.4, rnd() * 6, 'hut', 'hut'); this.crateSpots.push([x + 4, z + 4, 'common']); }
        }
        this.crateSpots.push([p.x, p.z, 'rare']);
      } else if (p.kind === 'lighthouse') {
        const y = this.height(p.x, p.z);
        this.props.push({ t: 'lighthouse', x: p.x, z: p.z, y });
        this.addCollider({ t: 'cyl', x: p.x, z: p.z, y0: y - 1, y1: y + 26, r: 3.6 });
        house(p.x - 12, p.z + 8, 8, 6, 4.5, 0.4, 'stone');
        this.crateSpots.push([p.x, p.z + 7, 'legendary'], [p.x - 18, p.z - 6, 'rare']);
      } else if (p.kind === 'ruins') {
        // broken colonnade and a stepped temple
        const y = this.height(p.x, p.z);
        this.props.push({ t: 'temple', x: p.x, z: p.z, y });
        this.addCollider({ t: 'box', x: p.x, y: y - 1, z: p.z, w: 22, d: 22, h: 3, ry: 0 });
        this.addCollider({ t: 'box', x: p.x, y: y - 1, z: p.z, w: 14, d: 14, h: 6, ry: 0 });
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2; const x = p.x + Math.cos(a) * 26; const z = p.z + Math.sin(a) * 26; const hy = this.height(x, z); const ht = 3 + ((k * 7) % 5) * 1.4;
          this.props.push({ t: 'column', x, z, y: hy, h: ht });
          this.addCollider({ t: 'cyl', x, z, y0: hy - 1, y1: hy + ht, r: 0.9 });
        }
        this.crateSpots.push([p.x, p.z, 'legendary'], [p.x + 20, p.z - 30, 'rare'], [p.x - 30, p.z + 10, 'common']);
      } else if (p.kind === 'station') {
        const y = this.height(p.x, p.z);
        this.props.push({ t: 'mast', x: p.x, z: p.z, y });
        this.addCollider({ t: 'cyl', x: p.x, z: p.z, y0: y - 1, y1: y + 30, r: 1.6 });
        house(p.x + 12, p.z + 6, 10, 7, 4, 0.2, 'concrete', 'flat');
        house(p.x - 10, p.z - 9, 6, 5, 3.5, 0.9, 'concrete', 'flat');
        this.crateSpots.push([p.x + 3, p.z - 8, 'legendary'], [p.x - 15, p.z + 12, 'rare']);
      } else if (p.kind === 'lab') {
        house(p.x, p.z, 24, 16, 6, 0.1, 'concrete', 'flat');
        house(p.x + 26, p.z + 18, 10, 10, 5, 0.1, 'concrete', 'dome');
        house(p.x - 24, p.z + 16, 9, 7, 4, 0.1, 'concrete', 'flat');
        for (let k = 0; k < 4; k++) this.props.push({ t: 'tank', x: p.x - 10 + k * 7, z: p.z - 20, y: this.height(p.x - 10 + k * 7, p.z - 20) });
        for (let k = 0; k < 4; k++) this.addCollider({ t: 'cyl', x: p.x - 10 + k * 7, z: p.z - 20, y0: this.height(p.x, p.z) - 1, y1: this.height(p.x, p.z) + 6, r: 2.2 });
        this.crateSpots.push([p.x, p.z + 12, 'legendary'], [p.x + 26, p.z + 4, 'rare'], [p.x - 30, p.z - 8, 'rare']);
      }
    }
    // rock formations of the wastelands: tall spires and flat-topped mesas you can stand on
    this.spires = [];
    for (let k = 0; k < 3000 && this.spires.length < 46; k++) {
      const x = (rnd() - 0.5) * WORLD.size * 0.82; const z = (rnd() - 0.5) * WORLD.size * 0.82;
      const bio = this.biome(x, z);
      if (bio === 'water' || bio === 'sand' || bio === 'snow') continue;
      const h0 = this.height(x, z);
      if (h0 < 4 || h0 > 70 || this.normal(x, z)[1] < 0.8) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 35)) continue;
      if (this.spires.some((q) => Math.hypot(q.x - x, q.z - z) < 70)) continue;
      const mesa = rnd() < 0.4;
      const r = mesa ? 9 + rnd() * 9 : 3.5 + rnd() * 4;
      if (!ok(x, z, r * 2 + 4)) continue;
      const h = mesa ? 16 + rnd() * 22 : 24 + rnd() * 34;
      const sp = { i: this.spires.length, x, z, y: h0 - 2, r, h, mesa, lean: (rnd() - 0.5) * 0.12, ry: rnd() * 6.28, seed: Math.floor(rnd() * 1e6) };
      this.spires.push(sp);
      if (mesa) this.crateSpots.push([x, z, rnd() < 0.3 ? 'legendary' : 'rare']); // a prize on top for those who fly up
      // colliders: stacked cylinders that taper with the rock
      const tiers = mesa ? 2 : 4;
      for (let t = 0; t < tiers; t++) {
        const f0 = t / tiers; const f1 = (t + 1) / tiers;
        const rr = r * (mesa ? 1 - f0 * 0.12 : 1 - f0 * 0.55);
        this.addCollider({ t: 'cyl', x: x + Math.sin(sp.ry) * sp.lean * h * f0, z: z + Math.cos(sp.ry) * sp.lean * h * f0, y0: sp.y + h * f0 - (t ? 0 : 1), y1: sp.y + h * f1 + 0.2, r: rr * 0.92 });
      }
    }
    // forests: density from noise, kinds by height/biome
    const n = this.noise;
    for (let k = 0; k < 9000 && this.trees.length < 3200; k++) {
      const x = (rnd() - 0.5) * WORLD.size * 0.9; const z = (rnd() - 0.5) * WORLD.size * 0.9;
      const bio = this.biome(x, z);
      if (bio === 'water' || bio === 'snow') continue;
      const h = this.height(x, z);
      const dens = n(x / 160 + 30, z / 160 - 12) + (bio === 'rock' ? -0.35 : 0);
      let kind = h > 42 ? 'pine' : bio === 'sand' ? 'palm' : n(x / 90, z / 90) > 0.05 ? 'oak' : 'pine';
      if (bio === 'sand' && rnd() > 0.35) continue;
      if (bio !== 'sand' && dens < -0.06 && rnd() > 0.08) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.85)) continue;
      if (!ok(x, z, 4)) continue;
      if (h > 80) kind = 'pine';
      const s = 0.8 + rnd() * 0.6;
      const tr = { i: this.trees.length, x, z, y: h, s, kind, r: rnd() };
      this.trees.push(tr);
      tr.col = this.addCollider({ t: 'cyl', x, z, y0: h - 1, y1: h + 7 * s, r: (kind === 'oak' ? 0.45 : 0.35) * s });
    }
    // boulders
    for (let k = 0; k < 4000 && this.rocks.length < 520; k++) {
      const x = (rnd() - 0.5) * WORLD.size * 0.88; const z = (rnd() - 0.5) * WORLD.size * 0.88;
      const bio = this.biome(x, z);
      if (bio === 'water') continue;
      if (bio === 'grass' && rnd() > 0.35) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.7)) continue;
      if (!ok(x, z, 3)) continue;
      const r = 0.8 + rnd() ** 2 * 3.2; const y = this.height(x, z) + r * 0.25;
      this.rocks.push({ x, z, y, r, seed: Math.floor(rnd() * 1e6) });
      this.addCollider({ t: 'sph', x, y, z, r: r * 0.92 });
    }
    // crates in the wild
    for (let k = 0; k < 4000 && this.crateSpots.length < 170; k++) {
      const x = (rnd() - 0.5) * WORLD.size * 0.84; const z = (rnd() - 0.5) * WORLD.size * 0.84;
      const bio = this.biome(x, z);
      if (bio === 'water' || this.height(x, z) < 1) continue;
      if (!ok(x, z, 3)) continue;
      this.crateSpots.push([x, z, rnd() < 0.12 ? 'rare' : 'common']);
    }
    this.crateSpots = this.crateSpots.filter(([x, z]) => this.inside(x, z) && this.height(x, z) > 0.6);
  }

  // a random dry spot (bots dropping in, respawn fallbacks)
  randomLand(rnd, nearX = 0, nearZ = 0, spread = 500) {
    for (let k = 0; k < 200; k++) {
      const x = nearX + (rnd() - 0.5) * spread * 2; const z = nearZ + (rnd() - 0.5) * spread * 2;
      if (this.inside(x, z) && this.height(x, z) > 1.5 && this.height(x, z) < 70) return [x, this.floor(x, z, 999), z];
    }
    return [0, this.height(0, 0), 0];
  }
}

const MOVE_STEP = 0.65;
function toLocal(c, x, z) {
  const dx = x - c.x; const dz = z - c.z; const cs = Math.cos(c.ry); const sn = Math.sin(c.ry);
  return [dx * cs - dz * sn, dx * sn + dz * cs];
}
function toWorldDir(c, lx, lz) {
  const cs = Math.cos(c.ry); const sn = Math.sin(c.ry);
  return [lx * cs + lz * sn, -lx * sn + lz * cs];
}
function rayCollider(c, o, d) {
  if (c.t === 'sph') {
    const ox = o[0] - c.x; const oy = o[1] - c.y; const oz = o[2] - c.z;
    const b = ox * d[0] + oy * d[1] + oz * d[2]; const cc = ox * ox + oy * oy + oz * oz - c.r * c.r;
    const disc = b * b - cc; if (disc < 0) return null;
    const t = -b - Math.sqrt(disc); if (t < 0) return null;
    const p = [o[0] + d[0] * t - c.x, o[1] + d[1] * t - c.y, o[2] + d[2] * t - c.z];
    return { t, n: p.map((v) => v / c.r) };
  }
  if (c.t === 'cyl') {
    const ox = o[0] - c.x; const oz = o[2] - c.z;
    const a = d[0] * d[0] + d[2] * d[2]; if (a < 1e-9) return null;
    const b = ox * d[0] + oz * d[2]; const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - a * cc; if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a; if (t < 0) return null;
    const y = o[1] + d[1] * t; if (y < c.y0 || y > c.y1) return null;
    const nx = (ox + d[0] * t) / c.r; const nz = (oz + d[2] * t) / c.r;
    return { t, n: [nx, 0, nz] };
  }
  // oriented box: slabs in local space
  const [lx, lz] = toLocal(c, o[0], o[2]);
  const cs = Math.cos(c.ry); const sn = Math.sin(c.ry);
  const dx = d[0] * cs - d[2] * sn; const dz = d[0] * sn + d[2] * cs;
  const lo = [lx, o[1] - (c.y + c.h / 2), lz]; const ld = [dx, d[1], dz]; const hs = [c.w / 2, c.h / 2, c.d / 2];
  let t0 = -Infinity; let t1 = Infinity; let axis = 0; let sgn = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > hs[k]) return null; continue; }
    let a = (-hs[k] - lo[k]) / ld[k]; let b = (hs[k] - lo[k]) / ld[k];
    let s = -1;
    if (a > b) { [a, b] = [b, a]; s = 1; }
    if (a > t0) { t0 = a; axis = k; sgn = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (t0 < 0) return null;
  const nl = [0, 0, 0]; nl[axis] = sgn;
  const [wx, wz] = toWorldDir(c, nl[0], nl[2]);
  return { t: t0, n: [wx, nl[1], wz] };
}
