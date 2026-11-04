// Tomatoku's save: cleaned on load, because it comes from localStorage or the cloud and may be damaged or edited.
import { sizeFor, DAILY_N } from './logic.js';

export const MAX_LEVEL = 999;
export const MAX_HINTS = 9;
export const THEME_IDS = ['garden', 'greenhouse', 'sunset', 'midnight'];
const num = (v, max) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.floor(+v))) : 0);

// the puzzle in progress: only the marks are stored; the puzzle itself is made again from its level or day
function normRun(r) {
  if (!r || typeof r !== 'object' || !['level', 'daily'].includes(r.mode)) return null;
  const level = Math.max(1, num(r.level, MAX_LEVEL)); const n = r.mode === 'daily' ? DAILY_N : sizeFor(level);
  if (!Array.isArray(r.cells) || r.cells.length !== n * n || !r.cells.every((x) => x === 0 || x === 1 || x === 2)) return null;
  return { mode: r.mode, level, day: num(r.day, 1e6), cells: r.cells, mistakes: Math.min(2, num(r.mistakes, 2)), hintsUsed: num(r.hintsUsed, 99), time: num(r.time, 864000), hard: r.hard === true };
}

export function normalizeSave(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const stars = {};
  for (const [k, v] of Object.entries(s.stars && typeof s.stars === 'object' ? s.stars : {})) {
    const n = +k; const c = Math.min(3, num(v, 3));
    if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL && c > 0) stars[n] = c;
  }
  const st = s.stats && typeof s.stats === 'object' ? s.stats : {};
  const d = s.daily && typeof s.daily === 'object' ? s.daily : {};
  return {
    xp: num(s.xp, 1e9), solved: num(s.solved, 1e5), level: Math.max(1, num(s.level, MAX_LEVEL)), stars,
    hints: s.hints === undefined ? 5 : Math.min(MAX_HINTS, num(s.hints, MAX_HINTS)),
    theme: THEME_IDS.includes(s.theme) ? s.theme : 'garden', sfx: s.sfx !== false, vibe: s.vibe !== false, auto: s.auto !== false, hard: s.hard === true,
    daily: { day: num(d.day, 1e6), streak: num(d.streak, 99999) },
    stats: { games: num(st.games, 1e9), perfect: num(st.perfect, 1e9) },
    run: normRun(s.run),
  };
}

export const totalStars = (s) => Object.values(s.stars).reduce((a, b) => a + b, 0);
