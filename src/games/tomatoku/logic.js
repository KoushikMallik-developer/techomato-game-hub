// Tomatoku rules (a Meowdoku-style puzzle, with tomatoes). No browser code here, so logic.check.mjs can test it in Node.
// An n x n field is split into n coloured patches. Plant n tomatoes so every row, column and patch has exactly one,
// and no two tomatoes touch (not even corner to corner). Every generated puzzle has exactly one solution.
// Port of the generator in the "Paw Grid" artifact.
export const MIN_N = 5;
export const MAX_N = 9;
export const DAILY_N = 8;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// small seeded random generator (mulberry32): the same seed gives the same puzzle (daily and numbered levels)
export class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) { return Math.floor(this.next() * n); }
}

const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = r.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const inside = (n, y, x) => y >= 0 && x >= 0 && y < n && x < n;

export const sizeFor = (level) => (level <= 2 ? 5 : level <= 5 ? 6 : level <= 10 ? 7 : level <= 18 ? 8 : 9);

// one tomato per row, none in the same column, none touching the row above
function placeTomatoes(n, r) {
  const cols = []; const used = new Array(n).fill(false);
  (function go(row) {
    if (row === n) return true;
    for (const c of shuffle([...Array(n).keys()], r)) {
      if (used[c] || (row > 0 && Math.abs(cols[row - 1] - c) <= 1)) continue;
      used[c] = true; cols[row] = c;
      if (go(row + 1)) return true;
      used[c] = false;
    }
    return false;
  })(0);
  return cols;
}

// grow n patches outward from the tomato cells until the whole field is covered
function grow(n, cols, r) {
  const g = Array.from({ length: n }, () => new Array(n).fill(-1));
  cols.forEach((c, i) => { g[i][c] = i; });
  let left = n * n - n;
  while (left > 0) {
    const reg = r.int(n); const fr = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] === reg) for (const [dy, dx] of D4) if (inside(n, y + dy, x + dx) && g[y + dy][x + dx] === -1) fr.push([y + dy, x + dx]);
    if (!fr.length) continue;
    const [yy, xx] = fr[r.int(fr.length)]; g[yy][xx] = reg; left--;
  }
  return g;
}

// a valid solution other than `cols`, or null when `cols` is the only one
function findOther(n, g, cols) {
  let out = null; const uc = new Array(n).fill(false); const ur = new Array(n).fill(false); const cur = [];
  (function go(row, prev) {
    if (out) return;
    if (row === n) { if (cur.some((c, i) => c !== cols[i])) out = cur.slice(); return; }
    for (let c = 0; c < n; c++) {
      if (uc[c] || ur[g[row][c]] || Math.abs(prev - c) <= 1) continue;
      uc[c] = ur[g[row][c]] = true; cur[row] = c;
      go(row + 1, c);
      uc[c] = ur[g[row][c]] = false;
      if (out) return;
    }
  })(0, -9);
  return out;
}

function connected(n, g, reg) {
  let start = null; let total = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] === reg) { total++; if (!start) start = [y, x]; }
  if (!start) return false;
  const seen = new Set([start[0] * n + start[1]]); const st = [start];
  while (st.length) {
    const [y, x] = st.pop();
    for (const [dy, dx] of D4) { const yy = y + dy; const xx = x + dx; if (inside(n, yy, xx) && g[yy][xx] === reg && !seen.has(yy * n + xx)) { seen.add(yy * n + xx); st.push([yy, xx]); } }
  }
  return seen.size === total;
}

// start from a random layout; while a second solution exists, move a cell of it into a neighbouring patch to break it
function makePuzzle(n, seed) {
  const r = new Rng(seed);
  for (let t = 0; t < 400; t++) {
    const cols = placeTomatoes(n, r); const g = grow(n, cols, r);
    for (let k = 0; k < 200; k++) {
      const o = findOther(n, g, cols);
      if (!o) return { regions: Uint8Array.from(g.flat()), cols };
      const cand = []; o.forEach((c, y) => { if (c !== cols[y]) cand.push([y, c]); }); shuffle(cand, r);
      let done = false;
      for (const [y, x] of cand) {
        const old = g[y][x];
        const nb = shuffle(D4.map(([dy, dx]) => [y + dy, x + dx]).filter(([a, b]) => inside(n, a, b) && g[a][b] !== old), r);
        for (const [a, b] of nb) { g[y][x] = g[a][b]; if (connected(n, g, old)) { done = true; break; } g[y][x] = old; }
        if (done) break;
      }
      if (!done) break;
    }
  }
  return null;
}

// mode 'level' (level n is always the same puzzle) or 'daily' (the same for everyone that day)
export function puzzleFor({ mode, level = 1, day = 0 }) {
  const n = mode === 'daily' ? DAILY_N : sizeFor(level);
  let seed = mode === 'daily' ? (day * 2654435761) >>> 0 : level * 7919 + 13; let p = makePuzzle(n, seed);
  while (!p) { seed += 101; p = makePuzzle(n, seed); }
  return { n, regions: p.regions, cols: p.cols };
}

// how many solutions does this field have (stops at `limit`)? Independent of the generator, used by the check
export function countSolutions(n, regions, limit = 2) {
  let count = 0; const uc = new Array(n).fill(false); const ur = new Array(n).fill(false);
  (function go(row, prev) {
    if (count >= limit) return;
    if (row === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      const g = regions[row * n + c];
      if (uc[c] || ur[g] || Math.abs(prev - c) <= 1) continue;
      uc[c] = ur[g] = true; go(row + 1, c); uc[c] = ur[g] = false;
    }
  })(0, -9);
  return count;
}

// the cells a tomato at i rules out: its row, column, patch and the eight around it
export function blockedBy(n, regions, i) {
  const y = Math.floor(i / n); const x = i % n; const out = [];
  for (let j = 0; j < n * n; j++) {
    if (j === i) continue;
    const yy = Math.floor(j / n); const xx = j % n;
    if (yy === y || xx === x || regions[j] === regions[i] || (Math.abs(yy - y) <= 1 && Math.abs(xx - x) <= 1)) out.push(j);
  }
  return out;
}

export const xpLevel = (xp) => Math.floor(Math.sqrt(xp / 150)) + 1;
export const xpFor = (level) => (level - 1) * (level - 1) * 150;
// whole local days since 1970, for the daily puzzle and its streak
export const dayNum = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);

// the tomato every puzzle starts with, already planted and locked: the one in the smallest patch (deterministic)
export function startCell(n, regions, cols) {
  const size = new Array(n).fill(0); for (let i = 0; i < n * n; i++) size[regions[i]]++;
  let best = 0; for (let y = 1; y < n; y++) if (size[regions[y * n + cols[y]]] < size[regions[best * n + cols[best]]]) best = y;
  return best * n + cols[best];
}
