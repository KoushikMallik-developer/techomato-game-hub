// Horde Surge game modes beyond the campaign:
//   Endless: one lane, wave after wave. Breaking the fortress's wave shield starts the next, stronger
//            wave (a world boss every 5th). The run ends when the cannon falls; best wave goes on the leaderboard.
//   Daily challenge: the same seeded level and two modifiers for everyone each day.
import { makeLevel } from './levels.js';
import { THEMES, mulberry32 } from './data.js';

export const MODS = {
  glass: { name: 'Glass Cannon', desc: 'Half the armor, 50% faster fire' },
  swarm: { name: 'Swarm', desc: 'The horde is 60% bigger' },
  rich: { name: 'Rich Gates', desc: 'Every × gate multiplies one more' },
  fog: { name: 'Thick Fog', desc: 'You can barely see the fortress' },
  frenzy: { name: 'Frenzy Start', desc: 'Frenzy for the first 10 seconds' },
  iron: { name: 'Iron Horde', desc: 'Shieldbearers everywhere' },
  lowgrav: { name: 'Low Gravity', desc: 'Units float out of the cannon' },
  nohero: { name: 'No Heroes', desc: 'The hero button is locked' },
  orbs: { name: 'Orb Storm', desc: 'Twice the power-up orbs' },
  rush: { name: 'Rush', desc: 'Everything moves 25% faster' },
  bombers: { name: 'Kaboom', desc: 'Bombers pour out of the gate' },
};
const CLASH = [['glass', 'nohero'], ['iron', 'bombers']];

export const dayKey = (d = new Date()) => d.toDateString();

export function dailyChallenge(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const seed = d.getFullYear() * 1000 + Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5);
  const rnd = mulberry32(seed);
  const ids = Object.keys(MODS);
  const a = ids[Math.floor(rnd() * ids.length)];
  let b = a;
  while (b === a || CLASH.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) b = ids[Math.floor(rnd() * ids.length)];
  return { seed, n: 6 + Math.floor(rnd() * 14), theme: Math.floor(rnd() * THEMES.length), mods: [a, b] };
}

export function makeDaily(ch) {
  const lvl = makeLevel(ch.n, { theme: ch.theme, mods: ch.mods });
  lvl.mode = 'daily';
  return lvl;
}

// endless: the lane layout of a mid-game level in a world that rotates each run
const ENDLESS_LAYOUT = 12;
export function makeEndless(run) {
  const theme = run % THEMES.length;
  const lvl = makeLevel(ENDLESS_LAYOUT, { theme, forceBoss: false });
  lvl.mode = 'endless';
  lvl.themeIndex = theme;
  Object.assign(lvl, endlessWave(1, theme));
  return lvl;
}

// wave w borrows the horde, brutes and fortress strength of a campaign level that grows with w
export function endlessWave(w, theme) {
  const ref = makeLevel(Math.round(2 + w * 1.4), { theme, forceBoss: w % 5 === 0 });
  return { wave: w, waves: ref.waves, brutes: ref.brutes, baseHp: Math.round((ref.baseHp * 0.45) / 5) * 5, mix: ref.mix, boss: ref.bossLevel ? ref.boss : null, bossLevel: ref.bossLevel };
}

export const waveReward = (w) => 40 + w * 15;
