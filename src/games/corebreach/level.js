// Core Breach levels: a 1-metre grid of floor heights and walls.
// Everything that matters for play lives here without any rendering: standing height, collision boxes,
// ray casts (bullets, line of sight), callout names and an A* path finder for bots.
//
// Cells: kind 0 = outside, 1 = floor, 2 = wall, 3 = prop (crate/cover: a raised floor you may jump onto).
// top[] is the height of the cell's upper surface (floor height, or the top of the wall/prop).

const H_WALL = 7;

// ── Meridian: a two-site map. x east, z south (attackers spawn south, defenders north) ──
// Areas are walkable rectangles [x0, z0, x1, z1] (cells, x1/z1 exclusive) with a floor height and a theme.
const MERIDIAN = {
  name: 'Meridian',
  size: [-66, -72, 66, 72],
  areas: [
    // spawns
    { n: 'Defender Spawn', r: [-16, -68, 16, -54], h: 0, th: 'def' },
    { n: 'Attacker Spawn', r: [-16, 54, 16, 68], h: 0, th: 'atk' },
    // A side
    { n: 'A Lobby', r: [-46, 52, -16, 64], h: 0, th: 'sand' },
    { n: 'A Main', r: [-46, 14, -36, 52], h: 0, th: 'sand' },
    { n: 'A Site', r: [-60, -26, -24, 14], h: 0, th: 'plaza' },
    { n: 'A Heaven', r: [-60, -26, -48, -14], h: 3, th: 'plaza' },
    { n: 'A Link', r: [-24, -8, -10, -1], h: 0, th: 'tile' },
    { n: 'A Short', r: [-36, 30, -6, 36], h: 0, th: 'tile' },
    { n: 'A Rotate', r: [-42, -62, -16, -55], h: 0, th: 'tile' },
    { n: 'A Defender', r: [-42, -55, -32, -26], h: 0, th: 'tile' },
    // mid
    { n: 'Mid Courtyard', r: [-10, -20, 10, 20], h: 0, th: 'plaza' },
    { n: 'Mid Bottom', r: [-6, 20, 6, 54], h: 0, th: 'sand' },
    { n: 'Mid Top', r: [-6, -54, 6, -20], h: 0, th: 'tile' },
    { n: 'Market', r: [10, -6, 22, 6], h: 0, th: 'tile' },
    // B side
    { n: 'B Lobby', r: [16, 52, 46, 64], h: 0, th: 'sand' },
    { n: 'B Main', r: [36, 10, 46, 52], h: 0, th: 'sand' },
    { n: 'B Site', r: [22, -22, 60, 10], h: 0, th: 'plaza' },
    { n: 'B Back', r: [48, -22, 60, -12], h: 1.5, th: 'plaza' },
    { n: 'B Short', r: [6, 26, 36, 32], h: 0, th: 'tile' },
    { n: 'B Rotate', r: [16, -62, 42, -55], h: 0, th: 'tile' },
    { n: 'B Defender', r: [32, -55, 42, -22], h: 0, th: 'tile' },
  ],
  // stairs: rect and the direction the steps climb (+x, -x, +z, -z), from floor h0 to h1
  stairs: [
    { r: [-48, -24, -42, -18], dir: '-x', h0: 0, h1: 3 }, // A site up to heaven
    { r: [44, -20, 48, -14], dir: '+x', h0: 0, h1: 1.5 }, // B site up to back site
  ],
  // solid blocks inside areas (pillars, small buildings): [x0, z0, x1, z1]
  blocks: [
    [-41, -13, -36, -9], // A site: breaks the A Main / A Defender sightline
    [37, -9, 42, -5], // B site
    [-3, -4, 3, 2], // mid: the courtyard pavilion
    [-6, 43, -3, 46], [3, 28, 6, 31], // mid bottom pillars
    [-6, -44, -3, -41], [3, -32, 6, -29], // mid top pillars
    [-44, 24, -41, 27], [39, 22, 42, 25], // A / B main pillars
    [-38, -40, -35, -37], [35, -42, 38, -39], // defender corridors
  ],
  // cover: [x0, z0, x1, z1, height]
  props: [
    // A site
    [-44, -6, -42, -4, 1], [-44, -4, -42, -2, 2.1], [-34, 2, -31, 5, 1], [-34, 5, -32, 7, 2.1],
    [-52, 4, -50, 8, 1.2], [-40, -16, -36, -15, 1.25], [-30, -20, -28, -18, 1], [-56, -8, -54, -6, 2.1],
    [-28, 8, -26, 10, 1],
    // A main / lobby / short
    [-42, 40, -40, 42, 1], [-30, 56, -28, 58, 2.1], [-22, 60, -20, 62, 1], [-20, 32, -18, 34, 1],
    // mid
    [-8, 10, -6, 12, 1], [6, -14, 8, -12, 1], [-9, -16, -7, -14, 2.1], [4, 14, 7, 16, 1.2],
    [-2, 38, 0, 40, 1], [2, -40, 4, -38, 1], [16, -2, 18, 0, 1],
    // B site
    [32, -8, 34, -6, 1], [32, -6, 34, -4, 2.1], [40, 0, 43, 3, 1], [26, -16, 28, -14, 2.1], [50, -2, 52, 2, 1.2],
    [42, -18, 44, -16, 1], [24, 4, 26, 6, 1],
    // B main / lobby / short
    [38, 30, 40, 32, 1], [28, 58, 30, 60, 2.1], [20, 28, 22, 30, 1],
    // spawns
    [-10, -60, -8, -58, 1], [8, 58, 10, 60, 1],
  ],
  sites: {
    A: { r: [-56, -20, -28, 10], c: [-42, -5] },
    B: { r: [26, -18, 56, 6], c: [41, -6] },
  },
  spawns: {
    atk: [[-8, 60], [-4, 62], [0, 60], [4, 62], [8, 61], [-6, 57], [6, 57], [0, 64], [-11, 63], [11, 63]],
    def: [[-8, -61], [-4, -63], [0, -61], [4, -63], [8, -62], [-6, -58], [6, -58], [0, -65], [-11, -64], [11, -64]],
  },
  // where bots like to hold as defenders, and where attackers stage before a push
  holds: {
    A: [[-50, -12], [-38, -18], [-54, 2], [-30, -2], [-52, -20, 3], [-26, -22]],
    B: [[46, -12], [30, -10], [52, 0], [38, -18], [54, -16, 1.5], [26, 2]],
    mid: [[0, -24], [-6, -8], [6, 8], [12, 0]],
  },
  stage: { A: [-41, 22], B: [41, 18], mid: [0, 24] },
  ceilings: [ // decorative roofs over corridors (visual only)
    [-24, -8, -10, -1, 4.2], [10, -6, 22, 6, 4.4], [-36, 30, -6, 36, 4.2], [6, 26, 36, 32, 4.2],
  ],
};


// ── Harbor: a sunset dockyard. A is an open quay with a raised loading dock, mid is a covered
// warehouse, B is a container yard. x east, z south (attackers south, defenders north) ──
const HARBOR = {
  name: 'Harbor',
  size: [-62, -70, 62, 70],
  light: { elev: 14, az: 252, color: '#ffa86a', sun: 4.0, hemi: [0xffc29c, 0x7a5a50, 0.7], turbidity: 7, rayleigh: 2.6, mie: 0.01, exposure: 0.86, fog: 0xe8b08a, skyGain: 0.68 },
  // big things beyond the walls: dock cranes, a moored ship, container stacks
  dressing: {
    cranes: [[-92, -30, 0], [-92, 18, 0], [-20, -102, Math.PI / 2], [30, -104, Math.PI / 2]],
    ship: [-118, -6, 0],
    stacks: [[80, -40], [84, -20], [78, 10], [86, 30], [70, 84], [-70, 86], [40, 88]],
  },
  areas: [
    { n: 'Defender Spawn', r: [-14, -66, 14, -54], h: 0, th: 'def' },
    { n: 'Attacker Spawn', r: [-14, 54, 14, 66], h: 0, th: 'atk' },
    // A side
    { n: 'A Lobby', r: [-44, 54, -14, 62], h: 0, th: 'sand' },
    { n: 'A Long', r: [-52, 10, -44, 62], h: 0, th: 'sand' },
    { n: 'A Short', r: [-44, 28, -5, 34], h: 0, th: 'tile' },
    { n: 'A Site', r: [-56, -26, -26, 10], h: 0, th: 'plaza' },
    { n: 'A Dock', r: [-56, -26, -46, -12], h: 2, th: 'plaza' },
    { n: 'A Hall', r: [-26, -10, -12, -4], h: 0, th: 'tile' },
    { n: 'A Rotate', r: [-40, -62, -14, -55], h: 0, th: 'tile' },
    { n: 'A Defender', r: [-40, -55, -30, -26], h: 0, th: 'tile' },
    // mid
    { n: 'Warehouse', r: [-12, -16, 12, 16], h: 0, th: 'tile' },
    { n: 'Mid Lower', r: [-5, 16, 5, 54], h: 0, th: 'sand' },
    { n: 'Mid Upper', r: [-5, -54, 5, -16], h: 0, th: 'tile' },
    // B side
    { n: 'B Yard', r: [14, 54, 44, 62], h: 0, th: 'sand' },
    { n: 'B Main', r: [36, 10, 44, 54], h: 0, th: 'sand' },
    { n: 'Pier', r: [5, 26, 36, 32], h: 0, th: 'tile' },
    { n: 'B Site', r: [20, -24, 56, 10], h: 0, th: 'plaza' },
    { n: 'B Short', r: [12, -4, 20, 4], h: 0, th: 'tile' },
    { n: 'B Rotate', r: [14, -62, 40, -55], h: 0, th: 'tile' },
    { n: 'B Defender', r: [30, -55, 40, -24], h: 0, th: 'tile' },
  ],
  stairs: [
    { r: [-46, -21, -42, -15], dir: '-x', h0: 0, h1: 2 }, // A site up to the loading dock
  ],
  blocks: [
    [-38, -12, -34, -8], // A site
    [-52, 34, -49, 37], // A long: breaks the long sightline
    [30, -10, 33, -6], // B site
    [-8, -10, -6, -8], [6, 8, 8, 10], [-2, -2, 2, 2], // warehouse pillars
    [-5, 40, -2, 43], [2, -42, 5, -39], // mid lanes
    [38, 24, 41, 27], // B main
    [-37, -42, -34, -39], [33, -44, 36, -41], // defender corridors
  ],
  props: [
    // A site and dock
    [-44, -4, -41, -2, 1], [-34, 2, -31, 5, 2.4], [-31, 2, -29, 5, 1], [-52, 2, -49, 7, 1.2], [-30, -20, -28, -18, 1],
    [-54, -8, -52, -5, 2.4], [-40, -18, -38, -16, 1], [-28, 6, -26, 8, 1],
    // A long / short / lobby
    [-50, 46, -48, 48, 1], [-26, 56, -24, 58, 2.4], [-18, 30, -16, 32, 1], [-40, 30, -38, 32, 1],
    // warehouse
    [-10, 10, -8, 13, 1], [7, -14, 10, -12, 2.4], [-11, -14, -9, -12, 1], [2, 12, 5, 14, 1.2],
    [-2, 36, 0, 38, 1], [1, -36, 3, -34, 1],
    // B yard: container stacks
    [26, -8, 29, -2, 2.4], [29, -8, 31, -5, 1], [40, 0, 44, 2, 2.4], [44, 0, 46, 2, 1], [48, -16, 52, -14, 2.4],
    [46, -6, 48, -2, 1.2], [24, 4, 26, 7, 1], [36, -18, 38, -16, 1], [50, 2, 53, 6, 2.4],
    // B main / pier / yard
    [38, 32, 40, 34, 1], [26, 56, 28, 58, 2.4], [18, 28, 20, 30, 1],
    // spawns
    [-10, -60, -8, -58, 1], [8, 58, 10, 60, 1],
  ],
  sites: {
    A: { r: [-54, -22, -30, 8], c: [-42, -6] },
    B: { r: [24, -20, 52, 6], c: [38, -6] },
  },
  spawns: {
    atk: [[-8, 59], [-4, 61], [0, 59], [4, 61], [8, 60], [-6, 56], [6, 56], [0, 63], [-11, 62], [11, 62]],
    def: [[-8, -59], [-4, -61], [0, -59], [4, -61], [8, -60], [-6, -57], [6, -57], [0, -63], [-11, -63], [11, -63]],
  },
  holds: {
    A: [[-50, -18, 2], [-36, -20], [-54, 0], [-30, -4], [-44, -14], [-28, -22]],
    B: [[46, -12], [28, -14], [52, -2], [36, -20], [22, 0], [44, 4]],
    mid: [[0, -22], [-8, -6], [8, 6], [10, -2]],
  },
  stage: { A: [-48, 20], B: [40, 18], mid: [0, 22] },
  ceilings: [
    [-12, -16, 12, 16, 6.2], [-26, -10, -12, -4, 4.2], [12, -4, 20, 4, 4.2], [-44, 28, -5, 34, 4.4],
  ],
};

// ── practice range: a long hall with lanes of targets ──
const RANGE = {
  name: 'Range',
  size: [-30, -60, 30, 20],
  areas: [
    { n: 'Range', r: [-24, -50, 24, 14], h: 0, th: 'tile' },
    { n: 'Lanes', r: [-24, -56, 24, -50], h: 0.6, th: 'plaza' },
  ],
  stairs: [],
  props: [[-24, 2, -14, 4, 1.1], [14, 2, 24, 4, 1.1], [-2, -20, 2, -18, 1.2], [-14, -30, -12, -28, 2.1], [12, -30, 14, -28, 2.1]],
  sites: { A: { r: [-6, 6, 6, 12], c: [0, 9] }, B: { r: [-6, 6, 6, 12], c: [0, 9] } },
  spawns: { atk: [[0, 10], [2, 10], [-2, 10], [4, 10], [-4, 10]], def: [[0, -40], [6, -40], [-6, -40], [12, -40], [-12, -40]] },
  holds: { A: [], B: [], mid: [] },
  stage: { A: [0, 0], B: [0, 0], mid: [0, 0] },
  ceilings: [],
};

export const LEVELS = { meridian: MERIDIAN, harbor: HARBOR, range: RANGE };
export const MAPS = [{ id: 'meridian', name: 'Meridian', desc: 'Sunny hillside town. Raised A heaven, central courtyard.' }, { id: 'harbor', name: 'Harbor', desc: 'Sunset dockyard. Long A quay, covered warehouse mid, B container yard.' }];

export class Level {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    const [x0, z0, x1, z1] = def.size;
    this.x0 = x0; this.z0 = z0;
    this.W = x1 - x0;
    this.D = z1 - z0;
    const N = this.W * this.D;
    this.kind = new Uint8Array(N);
    this.top = new Float32Array(N);
    this.area = new Int16Array(N).fill(-1);
    this.stair = new Uint8Array(N);
    this.boxes = []; // temporary solid boxes (ability walls): { x0, z0, x1, z1, y0, y1 }
    this.build();
    this.buildNav();
  }

  idx(i, j) { return j * this.W + i; }
  ci(x) { return Math.floor(x - this.x0); }
  cj(z) { return Math.floor(z - this.z0); }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.D; }

  build() {
    const d = this.def;
    const fill = (r, fn) => {
      for (let z = r[1]; z < r[3]; z++) for (let x = r[0]; x < r[2]; x++) {
        const i = this.ci(x + 0.5);
        const j = this.cj(z + 0.5);
        if (this.inside(i, j)) fn(this.idx(i, j), x, z);
      }
    };
    d.areas.forEach((a, ai) => fill(a.r, (k) => { this.kind[k] = 1; this.top[k] = a.h; this.area[k] = ai; }));
    d.stairs.forEach((s) => {
      const [sx0, sz0, sx1, sz1] = s.r;
      const len = s.dir[1] === 'x' ? sx1 - sx0 : sz1 - sz0;
      fill(s.r, (k, x, z) => {
        let t;
        if (s.dir === '+x') t = x - sx0 + 1;
        else if (s.dir === '-x') t = sx1 - x;
        else if (s.dir === '+z') t = z - sz0 + 1;
        else t = sz1 - z;
        this.kind[k] = 1;
        this.top[k] = s.h0 + ((s.h1 - s.h0) * t) / (len + 1);
        this.stair[k] = 1;
      });
    });
    d.props.forEach((p) => fill(p, (k) => { this.kind[k] = 3; this.top[k] = (this.top[k] || 0) + p[4]; }));
    (d.blocks || []).forEach((b) => fill(b, (k) => { this.kind[k] = 2; this.top[k] = H_WALL; }));
    // walls: every outside cell that touches a floor
    for (let j = 0; j < this.D; j++) {
      for (let i = 0; i < this.W; i++) {
        const k = this.idx(i, j);
        if (this.kind[k] !== 0) continue;
        let near = false;
        for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) {
          const a = i + di; const b = j + dj;
          if (this.inside(a, b) && (this.kind[this.idx(a, b)] === 1 || this.kind[this.idx(a, b)] === 3)) { near = true; break; }
        }
        if (near) { this.kind[k] = 2; this.top[k] = H_WALL; }
      }
    }
    // a raised area's edge drops to the floor around it: those are ledges, handled by the height test
    this.sites = d.sites;
    this.spawns = d.spawns;
  }

  // height of the solid surface in the cell containing (x, z); walls and outside count as very tall
  topAt(x, z) {
    const i = this.ci(x); const j = this.cj(z);
    if (!this.inside(i, j)) return 99;
    const k = this.idx(i, j);
    let t = this.kind[k] === 0 ? 99 : this.top[k];
    for (const b of this.boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > t) t = b.y1;
    return t;
  }

  addBox(b) { this.boxes.push(b); return b; }
  removeBox(b) { const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1); }

  // ray vs the temporary boxes (slab test)
  rayBoxes(o, d, maxT) {
    let best = null;
    for (const b of this.boxes) {
      let t0 = 0; let t1 = maxT; let nAxis = -1; let nSign = 0;
      const lo = [b.x0, b.y0, b.z0]; const hi = [b.x1, b.y1, b.z1];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; } continue; }
        let ta = (lo[a] - o[a]) / d[a]; let tb = (hi[a] - o[a]) / d[a];
        let sg = -1;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; sg = 1; }
        if (ta > t0) { t0 = ta; nAxis = a; nSign = sg; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && nAxis >= 0 && (!best || t0 < best.t)) {
        const n = [0, 0, 0]; n[nAxis] = nSign;
        best = { t: t0, x: o[0] + d[0] * t0, y: o[1] + d[1] * t0, z: o[2] + d[2] * t0, nx: n[0], ny: n[1], nz: n[2], box: b };
      }
    }
    return best;
  }

  // highest surface under a circle (radius r) at (x, z): what you stand on
  groundUnder(x, z, r, below = 99) {
    let best = -99;
    for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) {
      const t = this.topAt(x + dx, z + dz);
      if (t <= below && t > best) best = t;
    }
    return best;
  }

  areaName(x, z) {
    const i = this.ci(x); const j = this.cj(z);
    if (!this.inside(i, j)) return '';
    const a = this.area[this.idx(i, j)];
    return a >= 0 ? this.def.areas[a].n : '';
  }

  siteAt(x, z) {
    for (const [k, s] of Object.entries(this.sites)) {
      const r = s.r;
      if (x >= r[0] && x < r[2] && z >= r[1] && z < r[3]) return k;
    }
    return null;
  }

  // Ray against the level (grid + temporary boxes). o, d: [x, y, z] with d normalised.
  // Returns { t, x, y, z, nx, ny, nz } or null.
  raycast(o, d, maxT = 200) {
    const g = this.rayGrid(o, d, maxT);
    if (!this.boxes.length) return g;
    const b = this.rayBoxes(o, d, g ? g.t : maxT);
    return b || g;
  }

  rayGrid(o, d, maxT) {
    let i = this.ci(o[0]);
    let j = this.cj(o[2]);
    const stepI = d[0] > 0 ? 1 : -1;
    const stepJ = d[2] > 0 ? 1 : -1;
    const cellX = (n) => this.x0 + n;
    const cellZ = (n) => this.z0 + n;
    const tDX = d[0] !== 0 ? Math.abs(1 / d[0]) : Infinity;
    const tDZ = d[2] !== 0 ? Math.abs(1 / d[2]) : Infinity;
    let tMX = d[0] !== 0 ? ((d[0] > 0 ? cellX(i + 1) : cellX(i)) - o[0]) / d[0] : Infinity;
    let tMZ = d[2] !== 0 ? ((d[2] > 0 ? cellZ(j + 1) : cellZ(j)) - o[2]) / d[2] : Infinity;
    let t = 0;
    let lastAxis = -1;
    for (let n = 0; n < 600; n++) {
      if (!this.inside(i, j)) return null;
      const k = this.idx(i, j);
      const top = this.kind[k] === 0 ? 99 : this.top[k];
      const tExit = Math.min(tMX, tMZ, maxT);
      const yIn = o[1] + d[1] * t;
      const yOut = o[1] + d[1] * tExit;
      if (yIn < top) {
        // entered the cell below its top: hit the side we came through
        if (t === 0) {
          // starting inside (e.g. standing in a crate): ignore this cell
        } else {
          const nx = lastAxis === 0 ? -stepI : 0;
          const nz = lastAxis === 2 ? -stepJ : 0;
          return { t, x: o[0] + d[0] * t, y: yIn, z: o[2] + d[2] * t, nx, ny: 0, nz };
        }
      } else if (yOut < top && d[1] < 0) {
        const th = (top - o[1]) / d[1];
        return { t: th, x: o[0] + d[0] * th, y: top, z: o[2] + d[2] * th, nx: 0, ny: 1, nz: 0 };
      }
      if (tExit >= maxT) return null;
      t = tExit;
      if (tMX < tMZ) { i += stepI; tMX += tDX; lastAxis = 0; } else { j += stepJ; tMZ += tDZ; lastAxis = 2; }
    }
    return null;
  }

  los(a, b) {
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    const h = this.raycast(a, [dx / L, dy / L, dz / L], L);
    return !h;
  }

  // ── navigation: A* on the 1 m grid over floor cells with clearance ──
  buildNav() {
    const N = this.W * this.D;
    this.walk = new Uint8Array(N);
    this.cost = new Float32Array(N).fill(1);
    for (let j = 1; j < this.D - 1; j++) {
      for (let i = 1; i < this.W - 1; i++) {
        const k = this.idx(i, j);
        if (this.kind[k] !== 1) continue;
        let ok = true;
        let near = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const kk = this.idx(i + di, j + dj);
          if (this.kind[kk] === 2 || this.kind[kk] === 0) ok = false;
          else if (this.kind[kk] === 3 || Math.abs(this.top[kk] - this.top[k]) > 0.55) near++;
        }
        if (ok) { this.walk[k] = 1; this.cost[k] = 1 + near * 0.5; }
      }
    }
  }

  // nearest walkable cell to a point
  nearestWalk(x, z) {
    const i0 = this.ci(x); const j0 = this.cj(z);
    for (let r = 0; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di; const j = j0 + dj;
        if (this.inside(i, j) && this.walk[this.idx(i, j)]) return [i, j];
      }
    }
    return null;
  }

  path(ax, az, bx, bz) {
    const s = this.nearestWalk(ax, az);
    const g = this.nearestWalk(bx, bz);
    if (!s || !g) return null;
    const W = this.W;
    const start = this.idx(s[0], s[1]);
    const goal = this.idx(g[0], g[1]);
    const gs = new Float32Array(this.W * this.D).fill(Infinity);
    const from = new Int32Array(this.W * this.D).fill(-1);
    const closed = new Uint8Array(this.W * this.D);
    // binary heap of [f, k]
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      let n = heap.length - 1;
      while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let n = 0;
        for (;;) {
          const l = n * 2 + 1; const r = l + 1; let m = n;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === n) break;
          [heap[m], heap[n]] = [heap[n], heap[m]]; n = m;
        }
      }
      return top;
    };
    const hx = g[0]; const hz = g[1];
    const H = (k) => { const i = k % W; const j = (k - i) / W; const dx = Math.abs(i - hx); const dz = Math.abs(j - hz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gs[start] = 0;
    push(H(start), start);
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    let iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, k] = pop();
      if (k === goal) { found = true; break; }
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % W; const j = (k - i) / W;
      for (const [di, dj, c] of NB) {
        const a = i + di; const b = j + dj;
        const kk = this.idx(a, b);
        if (!this.walk[kk] || closed[kk]) continue;
        if (di && dj && (!this.walk[this.idx(i + di, j)] || !this.walk[this.idx(i, j + dj)])) continue;
        if (Math.abs(this.top[kk] - this.top[k]) > 0.55) continue;
        const ng = gs[k] + c * this.cost[kk];
        if (ng < gs[kk]) { gs[kk] = ng; from[kk] = k; push(ng + H(kk), kk); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    // string-pull: keep only the points needed for straight walkable segments
    const pt = (k) => { const i = k % W; const j = (k - i) / W; return [this.x0 + i + 0.5, this.top[k], this.z0 + j + 0.5]; };
    const out = [pt(cells[0])];
    let anchor = 0;
    for (let n = 2; n < cells.length; n++) {
      if (!this.walkLine(cells[anchor], cells[n])) { out.push(pt(cells[n - 1])); anchor = n - 1; }
    }
    out.push(pt(cells[cells.length - 1]));
    return out;
  }

  // can you walk straight between two cells (all cells along the line walkable, no big height steps)?
  walkLine(ka, kb) {
    const W = this.W;
    const ai = ka % W; const aj = (ka - ai) / W;
    const bi = kb % W; const bj = (kb - bi) / W;
    const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2;
    let prev = this.top[ka];
    for (let s = 1; s <= n; s++) {
      const i = Math.round(ai + ((bi - ai) * s) / n);
      const j = Math.round(aj + ((bj - aj) * s) / n);
      const k = this.idx(i, j);
      if (!this.walk[k]) return false;
      if (Math.abs(this.top[k] - prev) > 0.55) return false;
      prev = this.top[k];
    }
    return true;
  }

  // a random walkable point inside a rectangle
  randomIn(r, rnd = Math.random) {
    for (let t = 0; t < 60; t++) {
      const x = r[0] + rnd() * (r[2] - r[0]);
      const z = r[1] + rnd() * (r[3] - r[1]);
      const i = this.ci(x); const j = this.cj(z);
      if (this.inside(i, j) && this.walk[this.idx(i, j)]) return [x, this.top[this.idx(i, j)], z];
    }
    return [(r[0] + r[2]) / 2, 0, (r[1] + r[3]) / 2];
  }
}

export function makeLevel(id) {
  return new Level(LEVELS[id] || MERIDIAN);
}
