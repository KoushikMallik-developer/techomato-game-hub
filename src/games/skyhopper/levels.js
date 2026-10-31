// Sky Hopper level generator: a level is a tile grid (column-major) plus coins, enemies, springs and moving platforms,
// seeded by the level number. Every 4th level ends in a boss arena. Pure data, no three.js, so levels.check.mjs can test it in node.
export const H = 14; // rows; row 0 is the bottom
export const EMPTY = 0, GROUND = 1, BRICK = 2, QUESTION = 3, USED = 4, STONE = 5;
export const BOSS_EVERY = 4;
export const ARENA = 34; // the flat stretch before the stairs on a boss level

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeLevel(n) {
  const r = rng(n * 7919 + 13);
  const boss = n % BOSS_EVERY === 0;
  const len = 90 + Math.min(n, 8) * 10; // the stairs and flag start here
  const W = len + 14;
  const T = new Uint8Array(W * H);
  const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) T[x * H + y] = v; };
  const coins = []; const foes = []; const springs = []; const movers = [];
  const pitLimit = len - (boss ? ARENA + 4 : 19);
  let x = 0; let since = 99;
  while (x < W) {
    const gap = x > 10 && x < pitLimit && since > 5 && r() < 0.08 + 0.008 * n;
    if (gap) {
      const w = 2 + Math.floor(r() * (n > 1 ? 3 : 2)); // 2..4 wide; a run-jump clears 5
      for (let i = 0; i < w; i++) coins.push({ x: x + i + 0.5, y: 4.6 - Math.abs(i - (w - 1) / 2) * 0.35 });
      if (n > 1 && w >= 3 && r() < 0.5) movers.push({ x0: x + w / 2, y: 2, w: 2.2, range: w / 2 - 0.5, speed: 1.1 + r() * 0.8, phase: r() * 6 });
      x += w; since = 0; continue;
    }
    set(x, 0, GROUND); set(x, 1, GROUND);
    since++;
    if (x > 10 && x < len - 12 && !(boss && x >= len - ARENA - 6)) {
      const roll = r();
      if (roll < 0.075) { // floating platform with a question block
        const w = 3 + Math.floor(r() * 4); const q = Math.floor(r() * w);
        for (let i = 0; i < w; i++) { set(x + i, 5, i === q || r() < 0.15 ? QUESTION : BRICK); coins.push({ x: x + i + 0.5, y: 6.7 }); }
        if (r() < 0.4) for (let i = 1; i < w - 1; i++) set(x + i, 8, BRICK);
      } else if (roll < 0.075 + 0.06 + 0.012 * n) {
        const k = r(); foes.push({ x: x + 0.5, kind: n > 2 && k < 0.2 ? 2 : n > 1 && k < 0.45 ? 1 : 0 });
      } else if (roll < 0.28) {
        for (let i = 0; i < 5; i++) coins.push({ x: x + i + 0.5, y: 3.4 + Math.sin((i / 4) * Math.PI) * 1.4 });
      } else if (roll < 0.31 && n > 1 && since > 3) {
        springs.push({ x: x + 0.5 }); // a spring launches you up to the high bricks
        for (let i = 0; i < 3; i++) coins.push({ x: x + 0.5, y: 8.4 + i * 0.8 });
      }
    }
    x++;
  }
  for (let i = 0; i < 6; i++) for (let y = 2; y < 2 + i + 1; y++) set(len - 8 + i, y, STONE); // stairs up to the flag
  return { n, W, len, T, coins, foes, springs, movers, flagX: len + 3, start: 2, boss: boss ? { x: len - 22, min: len - ARENA + 2, max: len - 11 } : null };
}

export const solidAt = (lv, x, y) => (x < 0 ? true : x >= lv.W || y < 0 || y >= H ? false : lv.T[x * H + y] !== EMPTY);
