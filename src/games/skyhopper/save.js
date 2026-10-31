// Sky Hopper save rules, kept free of the DOM so levels.check.mjs can test them.
// A save comes from browser storage or the cloud, so every value is forced into range before the game uses it.
export const MAX_LEVEL = 999;
const num = (v, max) => Math.min(max, Math.max(0, Math.floor(+v) || 0));

export function normalizeSave(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const stars = {};
  for (const [k, v] of Object.entries(s.stars && typeof s.stars === 'object' ? s.stars : {})) {
    const n = +k; const c = num(v, 3);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL && c > 0) stars[n] = c;
  }
  const st = s.stats && typeof s.stats === 'object' ? s.stats : {};
  return {
    level: Math.max(1, num(s.level, MAX_LEVEL)), hi: num(s.hi, 1e8), stars,
    skin: typeof s.skin === 'string' ? s.skin.slice(0, 16) : 'pip', sfx: s.sfx !== false, music: s.music !== false, touch: s.touch === undefined ? 1 : num(s.touch, 2),
    stats: { stomps: num(st.stomps, 1e9), coins: num(st.coins, 1e9), bosses: num(st.bosses, 1e9) },
  };
}

export const totalStars = (s) => Object.values(s.stars).reduce((a, b) => a + b, 0);
// 1 star for clearing, +1 for 70% of the coins, +1 for no hits taken on the level
export const starsFor = (got, total, hit) => 1 + ((total ? got / total >= 0.7 : true) ? 1 : 0) + (hit ? 0 : 1);
