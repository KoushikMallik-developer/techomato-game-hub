// Ascendants: shared data — powers and ultimates, hero costumes, tuning, storm phases, saves.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD = { size: 1400, half: 700, sea: 0 };
export const MAX_PLAYERS = 50;

// movement and combat tuning
export const MOVE = {
  run: 7.6, sprint: 11, air: 0.35, jump: 10, gravity: 24, glideFall: 4.2, glideSpeed: 13, swim: 4.2,
  radius: 0.42, height: 1.85, step: 0.6, stamina: 6,
  fly: 17, flyBoost: 30, superDash: 58, dashKi: 14, // free flight: cruise, Shift boost, super dash (ki per second)
};
export const COMBAT = {
  hp: 100, shieldMax: 100,
  // the five-hit rush combo: jab, cross, hook, knee, spinning kick that knocks them away
  melee: [{ dmg: 7, t: 0.24, reach: 2.4 }, { dmg: 7, t: 0.24, reach: 2.4 }, { dmg: 9, t: 0.28, reach: 2.5 }, { dmg: 9, t: 0.3, reach: 2.4 }, { dmg: 16, t: 0.45, reach: 2.8, knock: 16 }],
  heavy: { dmg: 26, t: 0.6, reach: 3, knock: 30, charge: 0.45 }, // hold to smash someone across the map
  comboWindow: 0.7,
  ultCharge: 100, ultPassive: 0.7, ultPerDmg: 0.4,
};
// ki: everyone's energy. Powers spend it, holding C charges it (with an aura), punches build a little.
export const KI = { max: 100, regen: 4.5, charge: 32, perHit: 2.5, vanish: 12 };
// transformations: fill the form meter by fighting, press G to ascend; ascend again while in form for stage two
export const FORMS = [
  null,
  { name: 'Ascended', dur: 26, dmg: 1.25, speed: 1.2, kiRegen: 2, color: '#ffd84a', glow: '#fff3b0' },
  { name: 'Ascended II', dur: 24, dmg: 1.5, speed: 1.32, kiRegen: 2.6, color: '#ffe86a', glow: '#ffffff', sparks: true },
];
export const FORM_GAIN = { dealt: 0.32, taken: 0.22, kill: 30 };
export const MODES = {
  solo: { name: 'Solo', team: 1 },
  duo: { name: 'Duos', team: 2 },
  squad: { name: 'Squads', team: 4 },
};

// the storm: [wait before shrinking, shrink time, radius after, damage per second]
export const STORM = [
  [75, 50, 470, 1], [50, 40, 300, 2], [45, 35, 190, 4], [40, 30, 110, 6], [35, 25, 55, 8], [25, 20, 18, 10], [20, 18, 0, 14],
];

// ── powers (anime-style ki techniques; all names are this game's own) ──
// kind: how it is cast (see powers.js). cd seconds, ki cost, dmg, r range/radius, colours for the effects.
// bot: how bots use it — 'poke' ranged, 'burst' close, 'engage' gap closer, 'escape', 'heal', 'defend', 'zone'.
export const POWERS = [
  { id: 'volley', name: 'Ki Volley', kind: 'volley', cd: 4, ki: 16, dmg: 4, count: 8, speed: 75, color: '#ffd84a', glow: '#fffbe0', bot: 'poke', desc: 'Fire a rapid barrage of ki blasts from both hands.' },
  { id: 'wave', name: 'Radiant Wave', kind: 'chargebeam', cd: 9, ki: 30, dmg: 80, dur: 1.7, r: 70, width: 1.1, charge: 1.1, color: '#4ab8ff', glow: '#e6f7ff', bot: 'poke', desc: 'Cup your hands, gather energy, and unleash a crushing beam. Beams that meet will clash!' },
  { id: 'piercer', name: 'Piercing Ray', kind: 'ray', cd: 5, ki: 15, dmg: 30, r: 90, color: '#c47bff', glow: '#f6e6ff', bot: 'poke', desc: 'A needle-thin ray from your fingertip that strikes instantly.' },
  { id: 'disc', name: 'Razor Halo', kind: 'disc', cd: 7, ki: 18, dmg: 40, speed: 34, r: 0.9, color: '#ffe066', glow: '#fffbe0', bot: 'poke', desc: 'A spinning disc of ki that hunts its target and cuts through anything.' },
  { id: 'bomb', name: 'Ki Bomb', kind: 'bolt', cd: 6, ki: 18, dmg: 42, speed: 40, r: 0.9, blast: 5.5, knock: 10, color: '#ff8a3c', glow: '#ffe0b0', bot: 'poke', desc: 'Hurl a heavy orb of energy that bursts on impact.' },
  { id: 'scatter', name: 'Scatter Storm', kind: 'scatter', cd: 10, ki: 26, dmg: 9, count: 14, color: '#9bff6a', glow: '#eaffd6', bot: 'zone', desc: 'Throw a cloud of blasts into the sky that rain down on your target.' },
  { id: 'nova', name: 'Nova Burst', kind: 'nova', cd: 8, ki: 24, dmg: 34, r: 8, knock: 18, color: '#ffffff', glow: '#bfe9ff', bot: 'burst', desc: 'Explode with ki in every direction, blasting everyone away.' },
  { id: 'shout', name: 'Kiai Shout', kind: 'cone', cd: 5, ki: 10, dmg: 14, r: 11, knock: 22, color: '#bfe9ff', glow: '#ffffff', bot: 'burst', desc: 'A shout so strong it throws enemies off their feet.' },
  { id: 'flash', name: 'Blinding Flash', kind: 'flash', cd: 12, ki: 12, r: 18, dur: 2.6, color: '#fffbe0', glow: '#ffffff', bot: 'escape', desc: 'Blind everyone looking at you with a burst of light.' },
  { id: 'rush', name: 'Meteor Rush', kind: 'rush', cd: 9, ki: 20, dmg: 6, hits: 6, final: 20, r: 24, color: '#ff5a3c', glow: '#ffd0b0', bot: 'engage', desc: 'Blitz to your target and pummel them with a flurry that ends in a launching kick.' },
  { id: 'instant', name: 'Instant Step', kind: 'instant', cd: 5, ki: 10, r: 40, color: '#ffffff', glow: '#cfe9ff', bot: 'engage', desc: 'Vanish and reappear right behind your target.' },
  { id: 'afterimage', name: 'Afterimage', kind: 'buff', cd: 11, ki: 12, dur: 3, color: '#cfe9ff', glow: '#ffffff', bot: 'defend', desc: 'Move so fast that the next attacks only hit an afterimage.' },
  { id: 'barrier', name: 'Ki Barrier', kind: 'buff', cd: 12, ki: 20, dur: 4, absorb: 80, color: '#4ad8ff', glow: '#d9f7ff', bot: 'defend', desc: 'Wrap yourself in a dome of energy that soaks up damage.' },
  { id: 'heal', name: 'Inner Calm', kind: 'buff', cd: 15, ki: 25, dur: 3, heal: 42, color: '#5cff8a', glow: '#e1ffe9', bot: 'heal', desc: 'Focus your ki inward and mend your wounds.' },
  { id: 'split', name: 'Split Form', kind: 'clone', cd: 15, ki: 26, dur: 7, count: 2, dmg: 7, color: '#ffffff', glow: '#cfe9ff', bot: 'zone', desc: 'Split into fighting copies of yourself that fire on nearby enemies.' },
  { id: 'lash', name: 'Energy Lash', kind: 'lash', cd: 8, ki: 12, dmg: 12, r: 26, color: '#ff4ad8', glow: '#ffd6f4', bot: 'engage', desc: 'Snare an enemy with a whip of ki and drag them to you.' },
  { id: 'gravity', name: 'Gravity Press', kind: 'orb', cd: 12, ki: 22, dmg: 9, r: 7, dur: 3, pull: 10, speed: 30, color: '#7d5cff', glow: '#d8ccff', bot: 'zone', desc: 'A crushing field that drags enemies into its centre.' },
  { id: 'quake', name: 'Earth Breaker', kind: 'line', cd: 8, ki: 18, dmg: 30, r: 18, root: 1.1, color: '#b08a5a', glow: '#ffe2b0', bot: 'poke', desc: 'Punch the ground and rip a line of stone spikes toward your foe.' },
];
export const ULTS = [
  { id: 'sun', name: 'Gathered Sun', ult: true, kind: 'bigsphere', dmg: 120, r: 14, gather: 2.4, speed: 22, color: '#7fd8ff', glow: '#ffffff', bot: 'zone', desc: 'Raise your hands and gather energy into a colossal sphere, then hurl it down.' },
  { id: 'radiance', name: 'Final Radiance', ult: true, kind: 'megabeam', dmg: 150, dur: 3, r: 110, width: 3.2, charge: 1.4, color: '#ffd84a', glow: '#ffffff', bot: 'poke', desc: 'A gigantic beam that tears across the island. Wins almost every clash.' },
  { id: 'breaker', name: 'Star Breaker', ult: true, kind: 'bolt', dmg: 90, speed: 50, r: 2.2, blast: 11, knock: 22, color: '#7d5cff', glow: '#e0d4ff', bot: 'poke', desc: 'Thrust out one palm and fire a giant orb that detonates like a star.' },
  { id: 'surge', name: 'Crimson Surge', ult: true, kind: 'surge', dur: 12, dmgMul: 1.45, speedMul: 1.45, drain: 2.2, color: '#ff2a2a', glow: '#ffb0b0', bot: 'burst', desc: 'Push your body past its limit: a blazing red aura multiplies your power while it burns your health.' },
  { id: 'comet', name: 'Comet Fall', ult: true, kind: 'meteor', dmg: 55, r: 6, count: 7, rad: 10, color: '#ff6a2a', glow: '#ffe1a0', bot: 'zone', desc: 'Call down a rain of burning comets on the target area.' },
  { id: 'timestop', name: 'Time Stop', ult: true, kind: 'freeze', r: 18, dur: 3, color: '#ffe9a8', glow: '#ffffff', bot: 'burst', desc: 'Freeze every enemy near you in time.' },
  { id: 'barrage', name: 'Galaxy Barrage', ult: true, kind: 'barrage', dmg: 6, count: 60, dur: 3, color: '#ffd84a', glow: '#fffbe0', bot: 'poke', desc: 'Unleash an endless storm of ki blasts at your target until the dust hides everything.' },
  { id: 'fist', name: 'Spirit Fist', ult: true, kind: 'titanfist', dmg: 110, r: 60, color: '#ffc23a', glow: '#fff1d6', bot: 'engage', desc: 'Become a streak of golden energy shaped like a giant fist and punch straight through your enemy.' },
];
export const ALL_POWERS = [...POWERS, ...ULTS];
export const POWER = Object.fromEntries(ALL_POWERS.map((p) => [p.id, p]));
export const MAX_LEVEL = 3;
// a duplicate power levels it up: more damage, shorter cooldown
export const lvDmg = (lv) => 1 + 0.18 * (lv - 1);
export const lvCd = (lv) => 1 - 0.12 * (lv - 1);

// ── crates ──
export const CRATES = {
  common: { name: 'Supply Cache', color: '#58c6ff', open: 0.9, powers: 1, ult: 0.04, extra: 1 },
  rare: { name: 'Hero Vault', color: '#c06bff', open: 1.3, powers: 2, ult: 0.25, extra: 1 },
  legendary: { name: 'Mythic Relic', color: '#ffc23a', open: 1.8, powers: 2, ult: 1, extra: 2 },
  supply: { name: 'Sky Cache', color: '#ff4a4a', open: 2.4, powers: 3, ult: 1, extra: 3, lv: 2 },
};
export const ITEMS = {
  medkit: { name: 'Medkit', heal: 50, use: 2.2, color: '#5cff8a' },
  cell: { name: 'Shield Cell', shield: 50, use: 1.6, color: '#4ad8ff' },
};

// ── heroes (costumes; powers are what you find, not who you pick) ──
// martial-artist outfits: suit = gi top, suit2 = trousers, sash/trim = belt, wristbands and boots
export const HEROES = [
  { id: 'vanguard', name: 'Vanguard', suit: '#24418f', suit2: '#24418f', trim: '#1a1d26', sash: '#d23a2a', under: '#e8e4da', glow: '#5ec8ff', cape: null, mask: 'none', hair: 0, hairStyle: 'wild', skin: 1 },
  { id: 'ember', name: 'Ember', suit: '#a3241c', suit2: '#1f1a1c', trim: '#2a1612', sash: '#f2b233', under: '#1f1a1c', glow: '#ff9a3c', cape: null, mask: 'none', hair: 3, hairColor: '#5a1410', hairStyle: 'flame', skin: 3 },
  { id: 'nightshade', name: 'Nightshade', suit: '#231d33', suit2: '#17141f', trim: '#0f0d14', sash: '#8a5cff', under: '#17141f', glow: '#b06cff', cape: '#2a1f3a', mask: 'hood', hair: 1, skin: 0 },
  { id: 'tempest', name: 'Tempest', suit: '#eef1f6', suit2: '#59657e', trim: '#2a3550', sash: '#3d6fe0', under: '#2a3550', glow: '#9fb6ff', cape: null, mask: 'none', hair: 2, hairColor: '#cfd6e4', hairStyle: 'swept', skin: 2 },
  { id: 'verdant', name: 'Verdant', suit: '#2f6b3e', suit2: '#c9b37a', trim: '#3a2a1a', sash: '#1f3d26', under: '#e8e0c8', glow: '#8bff4a', cape: null, mask: 'band', band: '#d23a2a', hair: 1, hairStyle: 'short', skin: 4 },
  { id: 'aurum', name: 'Aurum', suit: '#22202a', suit2: '#22202a', trim: '#e2b23c', sash: '#e2b23c', under: '#3b342c', glow: '#ffd166', cape: null, mask: 'none', hair: 0, hairStyle: 'flame', armor: true, skin: 2 },
  { id: 'glacier', name: 'Glacier', suit: '#cfe9f5', suit2: '#3a6f8f', trim: '#1b3b52', sash: '#7fdcff', under: '#1b3b52', glow: '#7fdcff', cape: null, mask: 'none', hair: 2, hairColor: '#eef6fb', hairStyle: 'long', skin: 3 },
  { id: 'riot', name: 'Riotgrrl', suit: '#2b2b30', suit2: '#5a1f3a', trim: '#18181c', sash: '#ff3d8b', under: '#ff3d8b', glow: '#ff3d8b', cape: null, mask: 'mohawk', hair: 3, hairColor: '#ff3d8b', skin: 1 },
  { id: 'warden', name: 'Bulwark', suit: '#4a5236', suit2: '#33392a', trim: '#c8ff6a', sash: '#c8ff6a', under: '#2a2e22', glow: '#c8ff6a', cape: '#2f3324', mask: 'mask', hair: 1, armor: true, skin: 4 },
  { id: 'solar', name: 'Solaris', suit: '#f2e6c8', suit2: '#a8562a', trim: '#5a2a12', sash: '#ff7a2a', under: '#a8562a', glow: '#ffb347', cape: null, mask: 'none', hair: 1, hairColor: '#2a1a12', hairStyle: 'long', skin: 0 },
];
HEROES.forEach((h, i) => { h.unlock = [1, 1, 1, 2, 3, 4, 5, 6, 8, 10][i]; });
export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));
// aura colours (cosmetic), unlocked by level
export const AURAS = [
  { id: 'hero', name: 'Hero colour', color: null, unlock: 1 }, { id: 'gold', name: 'Gold', color: '#ffd84a', unlock: 1 },
  { id: 'azure', name: 'Azure', color: '#4ab8ff', unlock: 2 }, { id: 'violet', name: 'Violet', color: '#b06cff', unlock: 3 },
  { id: 'crimson', name: 'Crimson', color: '#ff3a3a', unlock: 4 }, { id: 'emerald', name: 'Emerald', color: '#3aff8a', unlock: 6 },
  { id: 'white', name: 'Pure White', color: '#f2f6ff', unlock: 8 }, { id: 'void', name: 'Void', color: '#2a1a4a', unlock: 12 },
];
// daily challenges: three per day are picked from this list by date
export const CHALLENGES = [
  { id: 'dmg', text: 'Deal 1500 damage', stat: 'dmg', goal: 1500, xp: 300 },
  { id: 'kills', text: 'Eliminate 5 heroes', stat: 'kills', goal: 5, xp: 300 },
  { id: 'crates', text: 'Open 10 crates', stat: 'crates', goal: 10, xp: 200 },
  { id: 'beams', text: 'Fire 12 energy beams', stat: 'beams', goal: 12, xp: 200 },
  { id: 'clash', text: 'Win a beam clash', stat: 'clashWins', goal: 1, xp: 350 },
  { id: 'forms', text: 'Ascend 3 times', stat: 'forms', goal: 3, xp: 250 },
  { id: 'top10', text: 'Finish in the top 10 twice', stat: 'top10', goal: 2, xp: 250 },
  { id: 'fly', text: 'Fly 5 km', stat: 'flyKm', goal: 5, xp: 200 },
  { id: 'melee', text: 'Land 150 punches and kicks', stat: 'hits', goal: 150, xp: 200 },
  { id: 'revive', text: 'Revive 2 teammates', stat: 'revives', goal: 2, xp: 300 },
];
export const EMOTES = [{ id: 'pose', name: 'Power Pose', key: '6' }, { id: 'taunt', name: 'Taunt', key: '7' }, { id: 'bow', name: 'Respect', key: '8' }];
export const SKIN = ['#e0b896', '#c99a74', '#8d5f3e', '#f1cfb0', '#6b4630'];

export const BOT_NAMES = ['Nova', 'Kestrel', 'Onyx', 'Lumen', 'Brimstone', 'Cobalt', 'Wraith', 'Seraph', 'Volt', 'Mirage', 'Talon', 'Quasar', 'Ironclad', 'Zephyr', 'Halcyon', 'Rook', 'Cinder', 'Aegis', 'Pulsar', 'Echo', 'Specter', 'Vortex', 'Hex', 'Saber', 'Glimmer', 'Atlas', 'Raven', 'Comet', 'Frostbite', 'Blaze', 'Riptide', 'Nimbus', 'Granite', 'Sable', 'Flux', 'Corsair', 'Valkyr', 'Nyx', 'Helix', 'Ember', 'Kraken', 'Orion', 'Shard', 'Typhoon', 'Banshee', 'Jolt', 'Mantis', 'Solstice', 'Paragon', 'Vesper', 'Thorn', 'Aurora', 'Grim', 'Dynamo'];

// ── settings and save ──
export const DEFAULT_SETTINGS = { quality: 'high', sens: 1, volume: 0.7, fov: 72, hero: 'vanguard', invertY: false, bots: 'normal', shadows: true, mode: 'solo', aura: 'hero', xhStyle: 'cross', xhColor: '#7dff8a', xhSize: 1 };
export const XH_STYLES = [['cross', 'Cross'], ['dot', 'Dot'], ['circle', 'Circle'], ['tee', 'T-cross']];
export const XH_COLORS = ['#7dff8a', '#5ef2ff', '#ffe14a', '#ffffff', '#ff4a6a', '#ff7ae5'];
// timed match events (seconds of play)
export const AIRDROP = { first: 95, every: 80, max: 5, fall: 14 };
export const REDZONE = { first: 150, every: 110, r: 55, warn: 7, dur: 18, rate: 0.32, dmg: 38 };
const KEY = 'ascendants-save';
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; }
  s = s && typeof s === 'object' ? s : {};
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.stats = { matches: 0, wins: 0, kills: 0, best: 50, top5: 0, ...(s.stats || {}) };
  s.xp = s.xp || 0;
  s.history = Array.isArray(s.history) ? s.history.slice(0, 12) : [];
  s.daily = s.daily && typeof s.daily === 'object' ? s.daily : {};
  return s;
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }
export const level = (xp) => Math.floor(Math.sqrt(xp / 120)) + 1;

// today's three challenges and progress (resets each day)
export function dailyState(save) {
  const d = new Date(); const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  if (save.daily.day !== day) {
    let seed = 0; for (const c of day) seed = (seed * 31 + c.charCodeAt(0)) | 0;
    const r = mulberry32(seed); const pool = CHALLENGES.slice();
    const pick = []; while (pick.length < 3) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
    save.daily = { day, ids: pick, prog: {}, done: {} };
  }
  return save.daily;
}
// how strong someone feels to a scouter: health, ki, powers and form
export function powerLevel(p) {
  const pw = Object.values(p.powers || {}).reduce((a, b) => a + b, 0);
  return Math.round(((p.hp || 0) + (p.shield || 0) * 0.6 + (p.ki || 0) * 0.5 + pw * 18) * (1 + (p.form || 0) * 0.6) * 47);
}
