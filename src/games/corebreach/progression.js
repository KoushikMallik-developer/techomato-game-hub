// Core Breach progression: account XP and levels, a rank earned against bots, daily missions,
// weapon skins unlocked by level, and match history. Everything lives in the local save.
import { WEAPON } from './data.js';

export const SKINS = [
  { id: 'stock', name: 'Stock', level: 1 },
  { id: 'ember', name: 'Ember', level: 2, color: '#b8442c', glow: '#ff8a3c' },
  { id: 'glacier', name: 'Glacier', level: 3, color: '#cfe6f2', glow: '#5ec8ff' },
  { id: 'jade', name: 'Jade', level: 5, color: '#2f8f6a', glow: '#7dffb0' },
  { id: 'onyx', name: 'Onyx', level: 7, color: '#1d1e22', glow: '#ff4655' },
  { id: 'royal', name: 'Royal', level: 9, color: '#3a2a7a', glow: '#ffd166' },
  { id: 'gilded', name: 'Gilded', level: 12, color: '#d8b04a', glow: '#fff0b0' },
  { id: 'prism', name: 'Prism', level: 15, color: '#e8e8f0', glow: '#ff5ef2' },
];
export const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legend'];
export const TIER_COLORS = ['#b8865a', '#c9d1db', '#f2c14e', '#5fd3c4', '#7aa8ff', '#c77dff', '#ff5a6e'];

// XP needed to go from level n to n+1
export const levelXP = (n) => 1000 + 250 * (n - 1);

export function levelInfo(xp) {
  let lvl = 1; let left = xp;
  while (left >= levelXP(lvl)) { left -= levelXP(lvl); lvl++; }
  return { level: lvl, into: left, need: levelXP(lvl) };
}

// rank points: 100 per division, three divisions per tier, Legend is open-ended
export function rankInfo(rp) {
  const div = Math.floor(rp / 100);
  const tier = Math.min(TIERS.length - 1, Math.floor(div / 3));
  const name = tier === TIERS.length - 1 ? TIERS[tier] : `${TIERS[tier]} ${['I', 'II', 'III'][div % 3]}`;
  return { name, tier, color: TIER_COLORS[tier], into: tier === TIERS.length - 1 ? rp - (TIERS.length - 1) * 300 : rp % 100 };
}

const MISSION_POOL = [
  { id: 'kills', text: 'Get 15 kills', goal: 15, key: 'kills' },
  { id: 'wins', text: 'Win a match', goal: 1, key: 'wins' },
  { id: 'heads', text: 'Get 6 headshot kills', goal: 6, key: 'heads' },
  { id: 'plants', text: 'Plant the Core 2 times', goal: 2, key: 'plants' },
  { id: 'defuse', text: 'Defuse the Core', goal: 1, key: 'defuses' },
  { id: 'abil', text: 'Use 12 abilities', goal: 12, key: 'abilities' },
  { id: 'play', text: 'Play 2 matches', goal: 2, key: 'matches' },
  { id: 'snipe', text: 'Get 3 kills with a sniper', goal: 3, key: 'sniper' },
  { id: 'rounds', text: 'Win 8 rounds', goal: 8, key: 'roundsWon' },
  { id: 'dm', text: 'Get 20 kills in Deathmatch', goal: 20, key: 'dmKills' },
];

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// make sure the save has progression fields and today's missions
export function ensureProgress(save) {
  const p = save.prog || (save.prog = {});
  p.xp = p.xp || 0;
  p.rp = p.rp ?? 150;
  p.history = p.history || [];
  p.skins = p.skins || {};
  if (p.day !== today() || !p.missions) {
    p.day = today();
    // three different missions, picked by a hash of the date
    let h = 7; for (const c of p.day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const idx = [];
    while (idx.length < 3) { h = (h * 1103515245 + 12345) >>> 0; const i = h % MISSION_POOL.length; if (!idx.includes(i)) idx.push(i); }
    p.missions = idx.map((i) => ({ ...MISSION_POOL[i], progress: 0, done: false }));
  }
  return p;
}

export function skinFor(save, gunId) {
  const p = ensureProgress(save);
  const s = SKIN[p.skins[gunId] || 'stock'];
  return s && s.color ? s : null;
}

export function skinUnlocked(save, skinId) {
  return levelInfo(ensureProgress(save).xp).level >= (SKIN[skinId] || SKINS[0]).level;
}

// s: { mode, map, win, kills, deaths, assists, heads, roundsWon, roundsLost, plants, defuses, abilities, sniper, difficulty, score, online, place }
export function award(save, s) {
  const p = ensureProgress(save);
  const before = levelInfo(p.xp);
  const rankBefore = rankInfo(p.rp);
  const items = [];
  items.push(['Match played', 150]);
  if (s.mode === 'core') {
    if (s.roundsWon) items.push([`Rounds won ×${s.roundsWon}`, s.roundsWon * 60]);
    if (s.win) items.push(['Victory', 400]);
  } else if (s.mode === 'dm' && s.place) items.push([`Finished #${s.place}`, Math.max(0, 300 - (s.place - 1) * 40)]);
  if (s.kills) items.push([`Kills ×${s.kills}`, s.kills * 25]);
  if (s.heads) items.push([`Headshot kills ×${s.heads}`, s.heads * 10]);
  if (s.plants + s.defuses) items.push([`Plants and defuses ×${s.plants + s.defuses}`, (s.plants + s.defuses) * 50]);
  // daily missions
  const inc = { kills: s.kills, wins: s.win ? 1 : 0, heads: s.heads, plants: s.plants, defuses: s.defuses, abilities: s.abilities, matches: 1, sniper: s.sniper, roundsWon: s.roundsWon, dmKills: s.mode === 'dm' ? s.kills : 0 };
  const done = [];
  p.missions.forEach((m) => {
    if (m.done) return;
    m.progress = Math.min(m.goal, m.progress + (inc[m.key] || 0));
    if (m.progress >= m.goal) { m.done = true; done.push(m); items.push([`Mission: ${m.text}`, 500]); }
  });
  const xp = items.reduce((a, [, v]) => a + v, 0);
  p.xp += xp;
  // rank: only full matches against bots (the harder the bots, the more it moves)
  let rr = 0;
  if (s.mode === 'core' && !s.online) {
    const mul = { easy: 0.5, normal: 1, hard: 1.4 }[s.difficulty] || 1;
    const perf = Math.max(-6, Math.min(8, (s.kills - s.deaths) * 0.8 + s.assists * 0.3));
    rr = Math.round(s.win ? (18 + perf) * mul : (-16 + perf * 0.5) / Math.max(0.6, mul * 0.9));
    p.rp = Math.max(0, p.rp + rr);
  }
  const after = levelInfo(p.xp);
  p.history.unshift({ t: Date.now(), mode: s.mode, map: s.map, win: s.win, score: s.score, k: s.kills, d: s.deaths, a: s.assists, xp, rr, online: !!s.online, place: s.place || 0 });
  p.history = p.history.slice(0, 20);
  const unlocked = SKINS.filter((k) => k.level > before.level && k.level <= after.level);
  return { xp, items, rr, done, before, after, rankBefore, rankAfter: rankInfo(p.rp), unlocked };
}

export const SKINNABLE = Object.keys(WEAPON);
