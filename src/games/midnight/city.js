// Midnight Pursuit: the city layout - coastline, districts, road network and terrain.
// Pure data (no three.js) and deterministic, so the same city is built on every device.
//
// How the map is made:
//  1. A coastline curve splits land from sea (south and east).
//  2. Hand-placed arterials: a ring highway with sweeping bends, an elevated expressway through the
//     middle, diagonal avenues, a coast boulevard and winding hill roads.
//  3. Each district gets its own street grid - its own angle, irregular block sizes and, in the hills
//     and by the beach, a smooth noise warp that bends the streets into curves.
//  4. All of it is planarised into one road graph: crossings become intersections, street ends that
//     stop just short of another road are extended to meet it, slivers are merged and stubs pruned.
//  5. A terrain heightfield (hills, a gentle rise from the coast, the sea floor) is flattened under
//     every road so cars and roads agree on the ground.
import { mulberry32, clamp, lerp } from './data.js';

export const MAP = 1150; // the playable area is -MAP..MAP on both axes
export const SEA_Y = -1.3; // water surface height
export const T_EXT = 1500; // terrain extent
export const T_RES = 8; // terrain grid spacing (m)

// lanes: per direction; lane centre k sits at median + laneW * (k + 0.5) from the centre line
export const ROAD_TYPES = {
  highway: { hw: 12.5, lanes: 3, laneW: 3.6, median: 1.4, speed: 32, sidewalk: 0, barrier: true, rank: 6 },
  expressway: { hw: 11.4, lanes: 3, laneW: 3.4, median: 1.0, speed: 32, sidewalk: 0, barrier: true, rank: 5 },
  avenue: { hw: 9.5, lanes: 2, laneW: 3.6, median: 1.1, speed: 22, sidewalk: 4.5, rank: 4 },
  industrial: { hw: 8.8, lanes: 2, laneW: 3.7, median: 0.15, speed: 17, sidewalk: 2.5, rank: 2 },
  street: { hw: 8.6, lanes: 2, laneW: 3.3, median: 0.15, speed: 16, sidewalk: 4, rank: 2 },
  residential: { hw: 5.4, lanes: 1, laneW: 3.6, median: 0.1, speed: 13, sidewalk: 2.2, rank: 1 },
};

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ───────────── noise ─────────────
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(i, j, seed), hash2(i + 1, j, seed), u), lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), u), v);
}
export function fbm(x, z, seed, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x * f, z * f, seed + o * 31);
    norm += a;
    f *= 2.03;
    a *= 0.5;
  }
  return s / norm;
}

// ───────────── polylines ─────────────
function catmull(ctrl, closed, step = 8) {
  const n = ctrl.length;
  const P = (i) => (closed ? ctrl[((i % n) + n) % n] : ctrl[clamp(i, 0, n - 1)]);
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < k; s++) {
      const t = s / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (closed) out.push([...out[0]]);
  else out.push([...ctrl[n - 1]]);
  return out;
}

function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(l / step));
    for (let s = 1; s <= k; s++) out.push([lerp(a[0], b[0], s / k), lerp(a[1], b[1], s / k)]);
  }
  return out;
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  const x = ax + dx * t;
  const z = az + dz * t;
  return { t, x, z, d: Math.hypot(px - x, pz - z) };
}

// Uniform grid index of line segments (or any items with a bounding box)
export class SegIndex {
  constructor(cell = 40) {
    this.cell = cell;
    this.map = new Map();
    this.stamp = 0;
  }

  key(i, j) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  add(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(Math.min(x0, x1) / c); i <= Math.floor(Math.max(x0, x1) / c); i++) {
      for (let j = Math.floor(Math.min(z0, z1) / c); j <= Math.floor(Math.max(z0, z1) / c); j++) {
        const k = this.key(i, j);
        let l = this.map.get(k);
        if (!l) { l = []; this.map.set(k, l); }
        l.push(item);
      }
    }
  }

  remove(item) {
    this.map.forEach((l) => { const i = l.indexOf(item); if (i >= 0) l.splice(i, 1); });
  }

  // calls fn(item) once for every item whose cells touch the box
  query(x0, z0, x1, z1, fn) {
    const c = this.cell;
    const st = ++this.stamp;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const l = this.map.get(this.key(i, j));
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const it = l[k];
          if (it._q === st) continue;
          it._q = st;
          if (fn(it) === false) return;
        }
      }
    }
  }
}

// ───────────── layout ─────────────
// coastline: land lies to the north-west of this curve
const COAST_CTRL = [[-1700, 940], [-1200, 905], [-820, 868], [-480, 918], [-160, 884], [150, 832], [400, 776], [610, 662], [775, 488], [890, 278], [955, 40], [1005, -230], [1090, -410], [1240, -515], [1700, -570]];

// ring highway (closed loop)
const RING_CTRL = [[-1010, -925], [-520, -1040], [80, -1015], [600, -990], [955, -790], [948, -440], [852, -130], [768, 132], [572, 330], [286, 528], [-90, 590], [-520, 568], [-905, 525], [-1062, 248], [-1082, -160], [-1062, -560]];

// elevated expressway crossing the city north to south, joining the ring at both ends
const EXPRESS_CTRL = [[330, -1002], [338, -840], [372, -560], [318, -250], [214, 80], [70, 380], [-92, 588]];

const ARTERIALS = [
  // Broadway: the long diagonal through old town, downtown and up to the north-east
  { type: 'avenue', name: 'Broadway', ctrl: [[-985, 410], [-560, 250], [-150, 70], [240, -150], [600, -360], [948, -600]] },
  // Harbor Avenue: from the hills down to the port
  { type: 'avenue', name: 'Harbor Ave', ctrl: [[-470, -990], [-330, -640], [-150, -330], [40, -40], [250, 230], [420, 470], [470, 610]] },
  // Main Street between old town and the centre
  { type: 'avenue', name: 'Main St', ctrl: [[-372, -780], [-352, -420], [-340, -60], [-325, 300], [-310, 560]] },
  // coast boulevard along the beach
  { type: 'avenue', name: 'Ocean Blvd', ctrl: [[-1190, 835], [-820, 795], [-480, 842], [-160, 808], [120, 760], [262, 650], [300, 540]] },
  // coast road on the east shore
  { type: 'avenue', name: 'Cliff Rd', ctrl: [[768, 132], [842, 120], [880, -60], [918, -260], [944, -440]] },
  // hill roads
  { type: 'residential', name: 'Ridge Rd', ctrl: [[-1065, -700], [-880, -640], [-760, -520], [-600, -590], [-470, -470], [-372, -430]] },
  { type: 'residential', name: 'Canyon Dr', ctrl: [[-640, -1032], [-700, -880], [-600, -780], [-720, -660], [-760, -520], [-700, -400], [-650, -300]] },
  { type: 'residential', name: 'Summit Way', ctrl: [[-600, -780], [-470, -800], [-380, -700], [-330, -640]] },
];

// district street grids: centre, angle, half extents, block spacing range, noise warp
export const DISTRICTS = [
  { name: 'central', c: [78, -128], a: 0.2, h: [405, 505], sp: [74, 118], warp: 0, road: 'street', seed: 11 },
  { name: 'oldtown', c: [-650, 95], a: -0.07, h: [272, 392], sp: [66, 112], warp: 7, road: 'street', seed: 12 },
  { name: 'eastside', c: [628, 40], a: 0.32, h: [200, 205], sp: [78, 118], warp: 5, road: 'street', seed: 13 },
  { name: 'northgate', c: [690, -585], a: 0.55, h: [255, 230], sp: [110, 170], warp: 0, road: 'industrial', seed: 14 },
  { name: 'northside', c: [40, -840], a: 0.08, h: [300, 150], sp: [80, 125], warp: 14, road: 'street', seed: 18 },
  { name: 'southside', c: [-10, 478], a: 0.0, h: [330, 72], sp: [70, 105], warp: 6, road: 'street', seed: 19 },
  { name: 'port', c: [560, 565], a: -0.72, h: [215, 108], sp: [120, 190], warp: 0, road: 'industrial', seed: 15 },
  { name: 'beach', c: [-640, 690], a: 0.02, h: [430, 100], sp: [96, 150], warp: 12, road: 'residential', seed: 16 },
  { name: 'hills', c: [-660, -690], a: 0.4, h: [340, 270], sp: [105, 165], warp: 40, road: 'residential', seed: 17 },
];

// parks: no streets or buildings inside, trees and paths instead
export const PARKS = [
  { name: 'Central Park', c: [-60, -300], a: 0.2, h: [92, 72] },
  { name: 'Bayview Park', c: [-240, 470], a: 0.0, h: [70, 48] },
  { name: 'Hilltop Park', c: [-640, -760], a: 0.4, h: [80, 60] },
];

const inRect = (R, x, z, pad = 0) => {
  const dx = x - R.c[0];
  const dz = z - R.c[1];
  const ca = Math.cos(R.a);
  const sa = Math.sin(R.a);
  const u = dx * ca + dz * sa;
  const v = -dx * sa + dz * ca;
  return Math.abs(u) <= R.h[0] + pad && Math.abs(v) <= R.h[1] + pad;
};

export class City {
  constructor(seed = 1337) {
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.buildCoast();
    const roads = this.layoutRoads();
    this.planarize(roads);
    this.buildTerrain();
    this.finishEdges();
  }

  // ── coast ──
  buildCoast() {
    const pts = catmull(COAST_CTRL, false, 10);
    this.coast = pts;
    this.coastIdx = new SegIndex(60);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      this.coastIdx.add({ i }, a[0], a[1], b[0], b[1]);
    }
  }

  // signed distance to the coastline: positive on land, negative at sea
  coastDist(x, z) {
    let best = Infinity;
    let sign = 1;
    const R = 160;
    const scan = (it) => {
      const a = this.coast[it.i];
      const b = this.coast[it.i + 1];
      const c = closestOnSeg(x, z, a[0], a[1], b[0], b[1]);
      if (c.d < best) {
        best = c.d;
        const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
        sign = cross < 0 ? 1 : -1;
      }
    };
    this.coastIdx.query(x - R, z - R, x + R, z + R, scan);
    if (best === Infinity) {
      // far from the coast: decide the side from the coast's general shape
      for (let i = 0; i < this.coast.length - 1; i += 4) scan({ i });
    }
    return sign * best;
  }

  park(x, z, pad = 0) {
    return PARKS.find((p) => inRect(p, x, z, pad)) || null;
  }

  // which district a point belongs to (first match wins)
  districtAt(x, z) {
    if (this.coastDist(x, z) < 6) return 'sea';
    for (const d of DISTRICTS) if (inRect(d, x, z)) return d.name;
    return 'outskirts';
  }

  // finer labels used for building styles
  zoneAt(x, z) {
    const d = this.districtAt(x, z);
    if (d === 'central') {
      const dx = (x - 40) / 270;
      const dz = (z - 50) / 250;
      return dx * dx + dz * dz < 1 ? 'downtown' : 'midtown';
    }
    return d;
  }

  // ── roads ──
  layoutRoads() {
    const roads = [];
    const ring = catmull(RING_CTRL, true, 10);
    roads.push({ type: 'highway', name: 'Ring', pts: ring, closed: true });
    const ex = catmull(EXPRESS_CTRL, false, 10);
    roads.push({ type: 'expressway', name: 'Expressway', pts: ex, elevated: true });
    this.ringPts = ring;
    this.expressPts = ex;
    ARTERIALS.forEach((a) => roads.push({ type: a.type, name: a.name, pts: catmull(a.ctrl, false, 10) }));
    // arterials index for keeping district streets clear of the highway and ramps
    const avoid = new SegIndex(60);
    const addAvoid = (pts, r, lowOnly) => {
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const total = this.polyLen(pts);
        if (!lowOnly || s < 190 || s > total - 190) avoid.add({ a, b, r }, a[0] - r, a[1] - r, a[0] + r, a[1] + r);
        s += L;
      }
    };
    addAvoid(ring, 38, false);
    addAvoid(ex, 30, true); // nothing may cross the expressway where it is still low on its ramps
    const clear = (x, z) => {
      let ok = true;
      avoid.query(x - 40, z - 40, x + 40, z + 40, (it) => {
        if (closestOnSeg(x, z, it.a[0], it.a[1], it.b[0], it.b[1]).d < it.r) { ok = false; return false; }
        return true;
      });
      return ok;
    };
    DISTRICTS.forEach((D) => this.gridFor(D, roads, clear));
    return roads;
  }

  polyLen(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  }

  // A street grid for one district: irregular spacing, optional curvy warp, clipped to the district.
  gridFor(D, roads, clear) {
    const rnd = mulberry32(this.seed * 7 + D.seed);
    const ca = Math.cos(D.a);
    const sa = Math.sin(D.a);
    const toWorld = (u, v) => {
      let x = D.c[0] + u * ca - v * sa;
      let z = D.c[1] + u * sa + v * ca;
      if (D.warp) {
        x += (fbm(x / 260, z / 260, D.seed) - 0.5) * 2 * D.warp;
        z += (fbm(x / 260 + 40, z / 260 + 17, D.seed + 5) - 0.5) * 2 * D.warp;
      }
      return [x, z];
    };
    const lines = (H) => {
      const out = [];
      let p = -H + D.sp[0] * (0.3 + rnd() * 0.5);
      while (p < H - 20) {
        out.push(p);
        p += lerp(D.sp[0], D.sp[1], rnd());
      }
      return out;
    };
    const us = lines(D.h[0]);
    const vs = lines(D.h[1]);
    const inside = (x, z) => this.districtAt(x, z) === D.name && !this.park(x, z, 4) && clear(x, z);
    const emit = (gen, len) => {
      // walk along a grid line in 5 m steps and keep the runs that lie inside the district
      let run = [];
      const flush = () => {
        if (run.length > 1 && this.polyLen(run) > 30) roads.push({ type: D.road, name: D.name, pts: run, district: D.name });
        run = [];
      };
      for (let t = -len; t <= len + 0.01; t += 5) {
        const p = gen(t);
        if (inside(p[0], p[1])) run.push(p);
        else flush();
      }
      flush();
    };
    us.forEach((u) => emit((t) => toWorld(u, t), D.h[1] + 40));
    vs.forEach((v) => emit((t) => toWorld(t, v), D.h[0] + 40));
  }

  // ── planarisation: polylines -> road graph ──
  planarize(roads) {
    // simplify the 5 m grid runs, resample everything to <= 12 m segments
    roads.forEach((r) => { r.pts = resample(simplify(r.pts, 0.6), 12); });
    this.snapEnds(roads);
    roads.forEach((r) => { r.pts = resample(r.pts, 12); });
    // lift profile of the expressway (no at-grade crossings where it is up in the air)
    roads.forEach((r) => {
      r.cum = [0];
      for (let i = 1; i < r.pts.length; i++) r.cum.push(r.cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      r.len = r.cum[r.cum.length - 1];
      r.liftAt = (s) => (r.elevated ? 10.5 * smoothstep(0, 170, s) * smoothstep(0, 170, r.len - s) : 0);
    });
    const idx = new SegIndex(40);
    roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        idx.add({ ri, i }, a[0], a[1], b[0], b[1]);
      }
    });
    // split points: [roadIndex] -> list of { p (segment index + t), x, z }
    const splits = roads.map((r) => [{ p: 0, x: r.pts[0][0], z: r.pts[0][1] }, { p: r.pts.length - 1, x: r.pts[r.pts.length - 1][0], z: r.pts[r.pts.length - 1][1] }]);
    roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        if (r.liftAt(r.cum[i]) > 3 && r.liftAt(r.cum[i + 1]) > 3) continue;
        idx.query(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), (it) => {
          if (it.ri < ri || (it.ri === ri && it.i <= i + 1)) return true;
          const o = roads[it.ri];
          const c = o.pts[it.i];
          const d = o.pts[it.i + 1];
          const hit = segIntersect(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
          if (!hit) return true;
          if (o.liftAt(lerp(o.cum[it.i], o.cum[it.i + 1], hit.u)) > 3 || r.liftAt(lerp(r.cum[i], r.cum[i + 1], hit.t)) > 3) return true;
          const x = lerp(a[0], b[0], hit.t);
          const z = lerp(a[1], b[1], hit.t);
          splits[ri].push({ p: i + hit.t, x, z });
          splits[it.ri].push({ p: it.i + hit.u, x, z });
          return true;
        });
      }
    });
    // cluster split points into nodes
    const pts = [];
    splits.forEach((l, ri) => l.forEach((s) => { s.ri = ri; s.id = pts.length; pts.push(s); }));
    const parent = pts.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const pidx = new SegIndex(20);
    pts.forEach((s) => pidx.add(s, s.x, s.z, s.x, s.z));
    pts.forEach((s) => {
      pidx.query(s.x - 8, s.z - 8, s.x + 8, s.z + 8, (o) => {
        if (o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 8) parent[find(o.id)] = find(s.id);
        return true;
      });
    });
    const nodeOf = new Map();
    const nodes = [];
    pts.forEach((s) => {
      const r = find(s.id);
      if (!nodeOf.has(r)) {
        nodeOf.set(r, nodes.length);
        nodes.push({ id: nodes.length, x: 0, z: 0, n: 0, edges: [] });
      }
      const nd = nodes[nodeOf.get(r)];
      nd.x += s.x;
      nd.z += s.z;
      nd.n++;
      s.node = nd.id;
    });
    nodes.forEach((n) => { n.x /= n.n; n.z /= n.n; });
    // edges between consecutive split points along each road
    const edges = [];
    roads.forEach((r, ri) => {
      const l = splits[ri].sort((a, b) => a.p - b.p);
      for (let k = 0; k < l.length - 1; k++) {
        const s0 = l[k];
        const s1 = l[k + 1];
        if (s0.node === s1.node) continue;
        const ep = [[nodes[s0.node].x, nodes[s0.node].z]];
        for (let i = Math.floor(s0.p) + 1; i <= Math.ceil(s1.p) - 1; i++) {
          if (i > s0.p + 1e-6 && i < s1.p - 1e-6) ep.push(r.pts[i]);
        }
        ep.push([nodes[s1.node].x, nodes[s1.node].z]);
        // lift at the edge's points (only the expressway has any)
        const sOf = (p) => lerp(r.cum[Math.floor(p)] || 0, r.cum[Math.min(r.cum.length - 1, Math.floor(p) + 1)] || 0, p - Math.floor(p));
        edges.push({ a: s0.node, b: s1.node, type: r.type, name: r.name, district: r.district, pts: ep, s0: sOf(s0.p), s1: sOf(s1.p), road: r });
      }
    });
    this.nodes = nodes;
    this.edges = edges;
    this.cleanGraph();
  }

  // Extend street ends that stop just short of another road so they meet it (T-junctions).
  snapEnds(roads) {
    const idx = new SegIndex(40);
    roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        idx.add({ ri, i }, a[0], a[1], b[0], b[1]);
      }
    });
    const R = 78;
    const ends = [];
    roads.forEach((r, ri) => {
      if (r.closed) return;
      ends.push({ ri, end: 0, p: r.pts[0] }, { ri, end: 1, p: r.pts[r.pts.length - 1] });
    });
    roads.forEach((r, ri) => {
      if (r.closed) return;
      [0, 1].forEach((end) => {
        const p = end ? r.pts[r.pts.length - 1] : r.pts[0];
        const q = end ? r.pts[r.pts.length - 2] : r.pts[1];
        const dx = p[0] - q[0];
        const dz = p[1] - q[1];
        const dl = Math.hypot(dx, dz) || 1;
        let best = null;
        idx.query(p[0] - R, p[1] - R, p[0] + R, p[1] + R, (it) => {
          if (it.ri === ri) return true;
          const o = roads[it.ri];
          if (o.elevated && !r.elevated) return true;
          const a = o.pts[it.i];
          const b = o.pts[it.i + 1];
          const c = closestOnSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
          if (c.d > R || c.d < 0.5) return true;
          // only extend roughly straight ahead
          const cos = ((c.x - p[0]) * dx + (c.z - p[1]) * dz) / (c.d * dl);
          if (cos < 0.6) return true;
          if (!best || c.d < best.d) best = c;
          return true;
        });
        // two dead ends facing each other across a district border: join them
        let join = null;
        if (!r.elevated) {
          ends.forEach((o) => {
            if (o.ri === ri || roads[o.ri].elevated) return;
            const d = Math.hypot(o.p[0] - p[0], o.p[1] - p[1]);
            if (d < 1 || d > 70) return;
            const cos = ((o.p[0] - p[0]) * dx + (o.p[1] - p[1]) * dz) / (d * dl);
            if (cos < 0.55) return;
            if (!join || d < join.d) join = { x: o.p[0], z: o.p[1], d };
          });
        }
        if (join && (!best || join.d < best.d + 15)) best = join;
        if (best) {
          // overshoot a little so the crossing is detected
          const ext = [best.x + (dx / dl) * 1.5, best.z + (dz / dl) * 1.5];
          if (best === join) { ext[0] = best.x; ext[1] = best.z; }
          if (end) r.pts.push(ext);
          else r.pts.unshift(ext);
        }
      });
    });
  }

  cleanGraph() {
    let { nodes, edges } = this;
    const check = (tag) => {
      const bad = edges.filter((e) => nodes[e.a].dead || nodes[e.b].dead);
      if (bad.length) console.warn('dead refs after', tag, bad.length);
    };
    const rebuild = () => {
      nodes.forEach((n) => { n.edges = []; });
      edges = edges.filter((e) => e.a !== e.b);
      // duplicate edges between the same nodes: keep the more important road
      const seen = new Map();
      edges = edges.filter((e) => {
        const k = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
        const o = seen.get(k);
        const len = polyLength(e.pts);
        if (o && Math.abs(o.len - len) < Math.max(25, len * 0.3)) {
          if (ROAD_TYPES[e.type].rank > ROAD_TYPES[o.e.type].rank) { o.e.dead = true; seen.set(k, { e, len }); return true; }
          return false;
        }
        if (!o) seen.set(k, { e, len });
        return true;
      }).filter((e) => !e.dead);
      edges.forEach((e, i) => { e.id = i; nodes[e.a].edges.push(i); nodes[e.b].edges.push(i); });
    };
    rebuild();
    // merge very short edges (slivers where roads cross close to each other)
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const e of edges) {
        if (e.dead || e.a === e.b) continue;
        if (polyLength(e.pts) >= 16) continue;
        if (e.type === 'expressway') continue;
        const A = nodes[e.a];
        const B = nodes[e.b];
        if (A.dead || B.dead) continue;
        A.x = (A.x + B.x) / 2;
        A.z = (A.z + B.z) / 2;
        B.dead = true;
        B.mergedInto = A.id;
        edges.forEach((o) => {
          if (o.a === B.id) o.a = A.id;
          if (o.b === B.id) o.b = A.id;
        });
        e.dead = true;
        changed = true;
      }
      edges = edges.filter((e) => !e.dead);
      // re-attach polyline ends to (possibly moved) nodes
      edges.forEach((e) => {
        e.pts[0] = [nodes[e.a].x, nodes[e.a].z];
        e.pts[e.pts.length - 1] = [nodes[e.b].x, nodes[e.b].z];
      });
      rebuild();
      check('short merge ' + pass);
      if (!changed) break;
    }
    // prune short dead-end stubs (repeat: removing one can expose another)
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      edges.forEach((e) => {
        const da = nodes[e.a].edges.length;
        const db = nodes[e.b].edges.length;
        if ((da === 1 || db === 1) && polyLength(e.pts) < 60 && ROAD_TYPES[e.type].rank < 5) { e.dead = true; changed = true; }
      });
      edges = edges.filter((e) => !e.dead);
      rebuild();
      if (!changed) break;
    }
    // remove a few grid streets for irregular, longer blocks (keep every junction at 3+ roads)
    const rnd = mulberry32(this.seed + 99);
    edges.forEach((e) => {
      if (e.dead || !e.district || e.district === 'hills' || e.district === 'beach') return;
      if (rnd() > 0.1) return;
      const A = nodes[e.a];
      const B = nodes[e.b];
      if (A.edges.length >= 4 && B.edges.length >= 4) {
        e.dead = true;
        A.edges = A.edges.filter((i) => i !== e.id);
        B.edges = B.edges.filter((i) => i !== e.id);
      }
    });
    edges = edges.filter((e) => !e.dead);
    rebuild();
    // join edges through degree-2 nodes so roads run unbroken between real junctions
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      const touched = new Set();
      nodes.forEach((n) => {
        if (n.dead || n.edges.length !== 2 || touched.has(n.id)) return;
        const e1 = edges[n.edges[0]];
        const e2 = edges[n.edges[1]];
        if (!e1 || !e2 || e1 === e2 || e1.dead || e2.dead) return;
        if (e1.type === 'expressway' || e2.type === 'expressway') return;
        const p1 = e1.b === n.id ? e1.pts : [...e1.pts].reverse();
        const p2 = e2.a === n.id ? e2.pts : [...e2.pts].reverse();
        const o1 = e1.b === n.id ? e1.a : e1.b;
        const o2 = e2.a === n.id ? e2.b : e2.a;
        if (o1 === o2) return;
        const keep = ROAD_TYPES[e1.type].rank >= ROAD_TYPES[e2.type].rank ? e1 : e2;
        const merged = { ...keep, a: o1, b: o2, pts: [...p1, ...p2.slice(1)] };
        e1.dead = true;
        e2.dead = true;
        n.dead = true;
        edges.push(merged);
        changed = true;
        touched.add(o1);
        touched.add(o2);
        merged.id = -1;
      });
      edges = edges.filter((e) => !e.dead);
      rebuild();
      check('deg2 pass ' + pass);
      if (!changed) break;
    }
    // keep the largest connected piece
    const comp = new Array(nodes.length).fill(-1);
    let best = -1;
    let bestN = 0;
    let c = 0;
    nodes.forEach((n) => {
      if (n.dead || comp[n.id] >= 0 || !n.edges.length) return;
      const stack = [n.id];
      comp[n.id] = c;
      let cnt = 0;
      while (stack.length) {
        const k = stack.pop();
        cnt++;
        nodes[k].edges.forEach((ei) => {
          const e = edges[ei];
          const o = e.a === k ? e.b : e.a;
          if (comp[o] < 0) { comp[o] = c; stack.push(o); }
        });
      }
      if (cnt > bestN) { bestN = cnt; best = c; }
      c++;
    });
    edges = edges.filter((e) => comp[e.a] === best);
    const bad = edges.filter((e) => nodes[e.a].dead || nodes[e.b].dead);
    if (bad.length) console.warn('edges on dead nodes', bad.length, bad.slice(0, 3).map((e) => [e.a, e.b, nodes[e.a].dead, nodes[e.b].dead, nodes[e.a].mergedInto, nodes[e.b].mergedInto, e.type]));
    // compact ids
    const live = nodes.filter((n) => !n.dead && comp[n.id] === best);
    const remap = new Map();
    live.forEach((n, i) => { remap.set(n.id, i); n.id = i; });
    edges.forEach((e, i) => { e.id = i; e.a = remap.get(e.a); e.b = remap.get(e.b); });
    live.forEach((n) => { n.edges = []; });
    edges.forEach((e) => { live[e.a].edges.push(e.id); live[e.b].edges.push(e.id); });
    this.nodes = live;
    this.edges = edges;
  }

  // ── terrain ──
  rawHeight(x, z) {
    const cd = this.coastDist(x, z);
    const hill = smoothstep(600, 180, Math.hypot(x + 660, z + 720)) * 46 * fbm(x / 330, z / 330, 3, 3)
      + smoothstep(420, 120, Math.hypot(x - 770, z + 820)) * 22 * fbm(x / 260, z / 260, 9, 3);
    const flat = DISTRICTS[0] && inRect(DISTRICTS[0], x, z, 40) ? 0.15 : 1; // the centre is flat
    const land = 1.4 + 5 * smoothstep(0, 700, cd) + hill * flat + (fbm(x / 500, z / 500, 21, 2) - 0.5) * 4 * flat;
    if (this.districtAt(x, z) === 'port' && cd > -4) return 1.7;
    if (cd >= 0) return lerp(0.7, land, smoothstep(0, 70, cd));
    return lerp(0.7, -6, smoothstep(0, 22, -cd));
  }

  buildTerrain() {
    const N = Math.round((T_EXT * 2) / T_RES) + 1;
    this.tN = N;
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        H[j * N + i] = this.rawHeight(-T_EXT + i * T_RES, -T_EXT + j * T_RES);
      }
    }
    this.H = H;
    // road heights: smooth the raw ground along each road, pin the ends to shared node heights
    const rawAt = (x, z) => this.sampleH(x, z);
    this.nodes.forEach((n) => {
      let s = 0;
      for (let k = 0; k < 5; k++) s += rawAt(n.x + Math.cos(k * 1.26) * 12, n.z + Math.sin(k * 1.26) * 12);
      n.y = (s + rawAt(n.x, n.z) * 3) / 8;
    });
    // relax node heights so no road between two junctions is steeper than ~10 %
    for (let it = 0; it < 40; it++) {
      this.edges.forEach((e) => {
        const A = this.nodes[e.a];
        const B = this.nodes[e.b];
        const L = polyLength(e.pts);
        const ex = Math.abs(A.y - B.y) - 0.1 * L;
        if (ex <= 0) return;
        const sgn = Math.sign(A.y - B.y);
        A.y -= sgn * ex * 0.5;
        B.y += sgn * ex * 0.5;
      });
    }
    this.edges.forEach((e) => {
      e.pts = resample(e.pts, 6);
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
      e.cum = cum;
      e.len = cum[cum.length - 1];
      const raw = e.pts.map((p) => rawAt(p[0], p[1]));
      // moving average over ~50 m
      const sm = raw.map((_, i) => {
        let s = 0;
        let w = 0;
        for (let k = -4; k <= 4; k++) {
          const q = clamp(i + k, 0, raw.length - 1);
          s += raw[q];
          w++;
        }
        return s / w;
      });
      const A = this.nodes[e.a].y;
      const B = this.nodes[e.b].y;
      const d0 = A - sm[0];
      const d1 = B - sm[sm.length - 1];
      let h = sm.map((v, i) => v + lerp(d0, d1, e.len > 0 ? cum[i] / e.len : 0));
      // limit the grade to 12 % with both ends held at the junction heights
      const G = 0.12;
      h[0] = A;
      h[h.length - 1] = B;
      for (let it = 0; it < 6; it++) {
        for (let i = 1; i < h.length - 1; i++) h[i] = clamp(h[i], h[i - 1] - G * (cum[i] - cum[i - 1]), h[i - 1] + G * (cum[i] - cum[i - 1]));
        for (let i = h.length - 2; i >= 1; i--) h[i] = clamp(h[i], h[i + 1] - G * (cum[i + 1] - cum[i]), h[i + 1] + G * (cum[i + 1] - cum[i]));
      }
      let steep = false;
      for (let i = 1; i < h.length; i++) if (Math.abs(h[i] - h[i - 1]) > (G + 0.02) * (cum[i] - cum[i - 1]) + 0.01) steep = true;
      if (steep) h = cum.map((c) => lerp(A, B, e.len > 0 ? c / e.len : 0));
      e.ground = h;
      // elevated expressway: deck height above the smoothed ground
      e.lift = e.pts.map((_, i) => (e.road && e.road.elevated ? e.road.liftAt(lerp(e.s0, e.s1, e.len > 0 ? cum[i] / e.len : 0)) : 0));
      e.y = h.map((v, i) => v + e.lift[i]);
    });
    // flatten the terrain under and beside every road
    const idx = new SegIndex(40);
    this.edges.forEach((e) => {
      for (let i = 0; i < e.pts.length - 1; i++) {
        if (e.lift[i] > 0.5 && e.lift[i + 1] > 0.5) continue;
        const a = e.pts[i];
        const b = e.pts[i + 1];
        idx.add({ e, i }, a[0], a[1], b[0], b[1]);
      }
    });
    this.flatIdx = idx;
    const R = 36;
    const W = new Float32Array(N * N);
    const T = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -T_EXT + i * T_RES;
        const z = -T_EXT + j * T_RES;
        // the nearest road (relative to its width) sets the height here
        let bw = 0;
        let bh = 0;
        let bd = Infinity;
        idx.query(x - R, z - R, x + R, z + R, (it) => {
          const e = it.e;
          const a = e.pts[it.i];
          const b = e.pts[it.i + 1];
          const c = closestOnSeg(x, z, a[0], a[1], b[0], b[1]);
          const hw = ROAD_TYPES[e.type].hw + ROAD_TYPES[e.type].sidewalk;
          const w = 1 - smoothstep(hw + 1.5, hw + 30, c.d);
          const dn = c.d - hw;
          if (w > 0 && dn < bd) {
            bd = dn;
            bw = w;
            bh = lerp(e.ground[it.i], e.ground[it.i + 1], c.t);
          }
          return true;
        });
        W[j * N + i] = bw;
        T[j * N + i] = bh;
      }
    }
    for (let k = 0; k < N * N; k++) if (W[k] > 0) H[k] = lerp(H[k], T[k] - 0.05, W[k]);
    this.roadMask = W;
  }

  // bilinear terrain height (and slope) at a point
  sampleH(x, z) {
    const N = this.tN;
    const fx = clamp((x + T_EXT) / T_RES, 0, N - 1.001);
    const fz = clamp((z + T_EXT) / T_RES, 0, N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.H;
    const a = H[j * N + i];
    const b = H[j * N + i + 1];
    const c = H[(j + 1) * N + i];
    const d = H[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  terrainAt(x, z) {
    const N = this.tN;
    const fx = clamp((x + T_EXT) / T_RES, 0, N - 1.001);
    const fz = clamp((z + T_EXT) / T_RES, 0, N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.H;
    const a = H[j * N + i];
    const b = H[j * N + i + 1];
    const c = H[(j + 1) * N + i];
    const d = H[(j + 1) * N + i + 1];
    return {
      h: lerp(lerp(a, b, u), lerp(c, d, u), v),
      gx: (lerp(b, d, v) - lerp(a, c, v)) / T_RES,
      gz: (lerp(c, d, u) - lerp(a, b, u)) / T_RES,
    };
  }

  // ── final per-edge data used by rendering, traffic and navigation ──
  finishEdges() {
    // street-level road heights follow the final terrain exactly, so everything placed by road
    // height (racers, markers, barriers) sits on the surface that is drawn and driven on
    this.edges.forEach((e) => {
      e.y = e.y.map((y, i) => (e.lift[i] > 0.05 ? y : this.terrainAt(e.pts[i][0], e.pts[i][1]).h));
    });
    this.nodes.forEach((n) => { n.y = this.terrainAt(n.x, n.z).h; });
    this.edges.forEach((e) => {
      e.T = ROAD_TYPES[e.type];
      e.hw = e.T.hw;
      // tangents and left normals at every point
      e.tan = e.pts.map((p, i) => {
        const a = e.pts[Math.max(0, i - 1)];
        const b = e.pts[Math.min(e.pts.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      });
    });
    this.edgeIdx = new SegIndex(40);
    this.edges.forEach((e) => {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i];
        const b = e.pts[i + 1];
        const r = e.hw;
        this.edgeIdx.add({ e, i }, Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r);
      }
    });
    this.nodes.forEach((n) => {
      n.deg = n.edges.length;
      // outgoing directions for every incident edge
      n.out = n.edges.map((ei) => {
        const e = this.edges[ei];
        const fwd = e.a === n.id;
        const p0 = fwd ? e.pts[0] : e.pts[e.pts.length - 1];
        const p1 = fwd ? e.pts[Math.min(2, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 3)];
        const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        return { ei, fwd, dx: (p1[0] - p0[0]) / l, dz: (p1[1] - p0[1]) / l, ang: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) };
      }).sort((a, b) => a.ang - b.ang);
    });
    // how far each road is cut back from a junction so the junction surface fits
    this.nodes.forEach((n) => {
      n.trim = {};
      n.out.forEach((o) => {
        const e = this.edges[o.ei];
        let t = n.deg >= 3 ? e.hw : n.deg === 1 ? 0 : 1.5;
        if (n.deg >= 2) {
          n.out.forEach((q) => {
            if (q === o) return;
            const f = this.edges[q.ei];
            const cos = o.dx * q.dx + o.dz * q.dz;
            const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
            if (n.deg === 2 && cos < -0.94) return; // a straight continuation needs no junction
            const need = (f.hw + (n.deg >= 3 ? 4 : 1)) / Math.max(sin, 0.3) + e.hw * Math.max(0, cos) / Math.max(sin, 0.3);
            t = Math.max(t, need);
          });
        }
        n.trim[o.ei] = Math.min(t, 48, e.len * 0.45);
      });
      n.junction = n.deg >= 3;
    });
    this.edges.forEach((e) => {
      e.t0 = this.nodes[e.a].trim[e.id] || 0;
      e.t1 = this.nodes[e.b].trim[e.id] || 0;
    });
  }

  // ── queries ──
  // position, height and direction at distance s along an edge (from node a)
  at(e, s) {
    s = clamp(s, 0, e.len);
    const cum = e.cum;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m; else hi = m;
    }
    const t = cum[hi] > cum[lo] ? (s - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    const a = e.pts[lo];
    const b = e.pts[hi];
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return {
      x: lerp(a[0], b[0], t),
      z: lerp(a[1], b[1], t),
      y: lerp(e.y[lo], e.y[hi], t),
      lift: lerp(e.lift[lo], e.lift[hi], t),
      dx: (b[0] - a[0]) / dl,
      dz: (b[1] - a[1]) / dl,
      i: lo,
    };
  }

  // nearest point on the road network. With y, roads at a different level (expressway vs street) score worse.
  nearestRoad(x, z, y = null, R = 80) {
    let best = null;
    let bs = Infinity;
    this.edgeIdx.query(x - R, z - R, x + R, z + R, (it) => {
      const e = it.e;
      const a = e.pts[it.i];
      const b = e.pts[it.i + 1];
      const c = closestOnSeg(x, z, a[0], a[1], b[0], b[1]);
      let score = c.d;
      const ey = lerp(e.y[it.i], e.y[it.i + 1], c.t);
      if (y !== null) score += Math.abs(ey - y) * 3;
      if (score < bs) {
        bs = score;
        const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const dx = (b[0] - a[0]) / dl;
        const dz = (b[1] - a[1]) / dl;
        best = { e, s: e.cum[it.i] + c.t * dl, x: c.x, z: c.z, y: ey, d: c.d, dx, dz, lat: (x - c.x) * -dz + (z - c.z) * dx };
      }
      return true;
    });
    return best;
  }

  nearestNode(x, z) {
    let best = null;
    let bd = Infinity;
    const r = this.nearestRoad(x, z, null, 200);
    if (r) {
      // one of the two ends of the nearest road, whichever is closer along it
      const e = r.e;
      const na = this.nodes[e.a];
      const nb = this.nodes[e.b];
      return r.s < e.len / 2 ? na : nb;
    }
    this.nodes.forEach((n) => {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }

  other(e, nid) {
    return e.a === nid ? e.b : e.a;
  }

  // A* over the road graph; cost is travel time. Returns a list of { node, edge } steps.
  route(fromId, toId) {
    if (fromId === toId) return [{ node: fromId, edge: null }];
    const N = this.nodes;
    const g = new Map([[fromId, 0]]);
    const came = new Map();
    const open = [[0, fromId]];
    const goal = N[toId];
    const h = (id) => Math.hypot(N[id].x - goal.x, N[id].z - goal.z) / 32;
    const closed = new Set();
    while (open.length) {
      // small binary heap would be faster; the graph is small enough for a sorted pop
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === toId) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      for (const ei of N[cur].edges) {
        const e = this.edges[ei];
        const nx = this.other(e, cur);
        const cost = g.get(cur) + e.len / e.T.speed;
        if (cost < (g.has(nx) ? g.get(nx) : Infinity)) {
          g.set(nx, cost);
          came.set(nx, { prev: cur, edge: ei });
          open.push([cost + h(nx), nx]);
        }
      }
    }
    if (!came.has(toId)) return null;
    const steps = [{ node: toId, edge: null }];
    let c = toId;
    while (c !== fromId) {
      const k = came.get(c);
      steps[0].edge = k.edge;
      steps.unshift({ node: k.prev, edge: null });
      c = k.prev;
    }
    // steps[i].edge is the edge used to arrive at steps[i].node; shift so edge leads to the next node
    for (let i = 0; i < steps.length - 1; i++) steps[i].edge = steps[i + 1].edge;
    steps[steps.length - 1].edge = null;
    return steps;
  }

  // dense polyline following a route (list of node ids or route() steps)
  routePoints(steps) {
    const out = [];
    for (let k = 0; k < steps.length - 1; k++) {
      const n = steps[k].node;
      const e = this.edges[steps[k].edge];
      const pts = e.a === n ? e.pts : [...e.pts].reverse();
      const ys = e.a === n ? e.y : [...e.y].reverse();
      pts.forEach((p, i) => {
        if (k > 0 && i === 0) return;
        out.push({ x: p[0], z: p[1], y: ys[i], node: i === 0 ? n : i === pts.length - 1 ? steps[k + 1].node : -1 });
      });
    }
    if (steps.length === 1) {
      const n = this.nodes[steps[0].node];
      out.push({ x: n.x, z: n.z, y: n.y, node: n.id });
    }
    return out;
  }

  // shortest route visiting waypoints (world positions) in order
  routeThrough(waypoints) {
    const ids = waypoints.map(([x, z]) => this.nearestNode(x, z).id);
    let steps = [{ node: ids[0], edge: null }];
    const legs = [0];
    for (let k = 1; k < ids.length; k++) {
      const r = this.route(ids[k - 1], ids[k]);
      if (!r) continue;
      steps[steps.length - 1].edge = r[0].edge;
      steps = steps.concat(r.slice(1));
      legs.push(steps.length - 1);
    }
    return { steps, legs, ids };
  }

  randomNode(rnd = Math.random) {
    return this.nodes[Math.floor(rnd() * this.nodes.length)];
  }
}

function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

// Ramer-Douglas-Peucker: drop points that add no shape (straight grid streets become 2 points)
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = closestOnSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]).d;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) {
      keep[mi] = true;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
