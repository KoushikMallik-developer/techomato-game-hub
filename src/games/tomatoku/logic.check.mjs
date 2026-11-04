// node src/games/tomatoku/logic.check.mjs  (part of `npm test`)
import assert from 'node:assert/strict';
import { sizeFor, puzzleFor, countSolutions, blockedBy, xpLevel, xpFor, dayNum, startCell, MIN_N, MAX_N, DAILY_N } from './logic.js';
import { normalizeSave, totalStars } from './save.js';

// field size grows with the level
assert.deepEqual([1, 2, 3, 5, 6, 10, 11, 18, 19, 500].map(sizeFor), [5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);

// every level and daily puzzle: n patches, each connected, a valid solution, and exactly one solution
function check(p, label) {
  const { n, regions, cols } = p;
  assert.ok(n >= MIN_N && n <= MAX_N, label); assert.equal(regions.length, n * n); assert.equal(cols.length, n);
  assert.equal(new Set(regions).size, n, `${label} has ${n} patches`);
  for (let reg = 0; reg < n; reg++) { // connected
    const cells = [...regions].map((r, i) => (r === reg ? i : -1)).filter((i) => i >= 0); const seen = new Set([cells[0]]); const st = [cells[0]];
    while (st.length) { const i = st.pop(); for (const j of [i - n, i + n, i % n ? i - 1 : -1, (i % n) < n - 1 ? i + 1 : -1]) if (j >= 0 && j < n * n && regions[j] === reg && !seen.has(j)) { seen.add(j); st.push(j); } }
    assert.equal(seen.size, cells.length, `${label} patch ${reg} connected`);
  }
  assert.equal(new Set(cols).size, n, `${label} columns`); assert.equal(new Set(cols.map((c, y) => regions[y * n + c])).size, n, `${label} patches`);
  for (let y = 1; y < n; y++) assert.ok(Math.abs(cols[y] - cols[y - 1]) > 1, `${label} touching`);
  assert.equal(countSolutions(n, regions, 2), 1, `${label} unique`);
}
const t0 = Date.now();
for (let level = 1; level <= 40; level++) check(puzzleFor({ mode: 'level', level }), `level ${level}`);
for (let day = 20500; day < 20510; day++) check(puzzleFor({ mode: 'daily', day }), `day ${day}`);
assert.ok(Date.now() - t0 < 30000, `generation is fast enough (${Date.now() - t0} ms)`);

// repeatable: the same level or day always gives the same puzzle
const a = puzzleFor({ mode: 'level', level: 7 }); const b = puzzleFor({ mode: 'level', level: 7 });
assert.deepEqual([...a.regions], [...b.regions]); assert.deepEqual(a.cols, b.cols);
assert.deepEqual([...puzzleFor({ mode: 'daily', day: 20500 }).regions], [...puzzleFor({ mode: 'daily', day: 20500 }).regions]);
assert.equal(puzzleFor({ mode: 'daily', day: 1 }).n, DAILY_N);
assert.notDeepEqual([...puzzleFor({ mode: 'level', level: 8 }).regions], [...puzzleFor({ mode: 'level', level: 9 }).regions]);

// the solver counts more than one solution on an open field, and zero on an impossible one
assert.equal(countSolutions(5, new Uint8Array(25).map((_, i) => Math.floor(i / 5)), 5) > 1, true);
assert.equal(countSolutions(5, new Uint8Array(25), 2), 0); // one patch only: n tomatoes cannot fit

// what a tomato blocks: row, column, patch and the 8 around it
const p = puzzleFor({ mode: 'level', level: 3 }); const i = 2 * p.n + p.cols[2]; const blocked = blockedBy(p.n, p.regions, i);
assert.ok(!blocked.includes(i)); assert.ok(blocked.includes(i - 1) && blocked.includes(i + p.n)); // beside and below
assert.ok(blocked.includes(2 * p.n + ((p.cols[2] + 1) % p.n === 0 ? p.cols[2] - 2 : p.cols[2] + 1)));
for (let j = 0; j < p.n * p.n; j++) if (p.regions[j] === p.regions[i] && j !== i) assert.ok(blocked.includes(j));

assert.equal(xpLevel(0), 1); assert.equal(xpLevel(xpFor(5)), 5); assert.equal(xpLevel(xpFor(5) - 1), 4);
assert.equal(dayNum(new Date(2026, 0, 2)) - dayNum(new Date(2026, 0, 1)), 1);

// save: garbage in, safe save out
let s = normalizeSave(null);
assert.deepEqual([s.level, s.solved, s.run, s.theme, s.sfx, s.auto, s.hints], [1, 0, null, 'garden', true, true, 5]);
s = normalizeSave({ solved: 'x', level: 1e9, xp: -5, hints: 99, stars: { 1: 9, 2: 2, abc: 3, 99999: 1 }, theme: 'evil', run: { mode: 'level', cells: [1] } });
assert.equal(s.solved, 0); assert.equal(s.level, 999); assert.equal(s.xp, 0); assert.equal(s.hints, 9); assert.deepEqual(s.stars, { 1: 3, 2: 2 }); assert.equal(totalStars(s), 5); assert.equal(s.theme, 'garden'); assert.equal(s.run, null);
const run = { mode: 'level', level: 3, day: 0, cells: new Array(36).fill(0), mistakes: 9, hintsUsed: 1, time: 75 };
s = normalizeSave({ run });
assert.equal(s.run.time, 75); assert.equal(s.run.mistakes, 2); assert.equal(s.run.cells.length, 36);
assert.equal(normalizeSave(null).hard, false); assert.equal(normalizeSave({ hard: true }).hard, true); assert.equal(normalizeSave({ run: { ...run, hard: true } }).run.hard, true); assert.equal(normalizeSave({ run }).run.hard, false);
assert.equal(normalizeSave({ run: { ...run, cells: new Array(25).fill(0) } }).run, null); // wrong size for level 3
assert.equal(normalizeSave({ run: { ...run, cells: new Array(36).fill(7) } }).run, null);
assert.equal(normalizeSave({ run: { ...run, mode: 'daily', cells: new Array(64).fill(0) } }).run.cells.length, 64);
const sc = puzzleFor({ mode: 'level', level: 4 }); const si = startCell(sc.n, sc.regions, sc.cols); assert.equal(sc.cols[Math.floor(si / sc.n)], si % sc.n); // a real solution cell
console.log('tomatoku logic ok');
