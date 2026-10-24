// Core Breach: game data. Weapons, agents, economy, timings and saved settings.
// Pure data and small helpers only (no three.js), so the match logic and bots can run anywhere.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtClock = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── movement (metres, seconds) ──
export const MOVE = {
  run: 5.4,
  walk: 2.9,
  crouch: 1.9,
  accel: 52,
  airAccel: 9,
  friction: 14,
  gravity: 19,
  jump: 6.8,
  height: 1.78,
  crouchHeight: 1.18,
  eye: 1.62,
  crouchEye: 1.06,
  radius: 0.34,
  step: 0.5,
};

// ── weapons ──
// dmg: [head, body, leg] at close range; far: same beyond `falloff` metres (none if omitted).
// spread values in degrees: base (standing still, first shot), move (added at full run speed),
// air (added while airborne), shot (added per shot), max (cap), recover (deg/s back to base).
// recoil: vertical kick per shot (deg) and horizontal wander amplitude; pattern climbs then sways.
export const WEAPONS = [
  { id: 'knife', name: 'Tactical Knife', cat: 'melee', cost: 0, slot: 'melee', mag: 0, rpm: 120, dmg: [50, 50, 50], range: 2.2, speed: 1.0, equip: 0.4 },
  { id: 'wasp', name: 'Wasp', cat: 'sidearm', cost: 0, slot: 'secondary', mag: 12, reserve: 36, rpm: 400, auto: false, dmg: [78, 26, 22], far: [66, 22, 18], falloff: 30, spread: { base: 0.4, move: 2.6, air: 6, shot: 0.9, max: 4, recover: 9 }, recoil: { v: 0.8, h: 0.35 }, reload: 1.75, equip: 0.75, speed: 1.0 },
  { id: 'hornet', name: 'Hornet', cat: 'sidearm', cost: 450, slot: 'secondary', mag: 13, reserve: 39, rpm: 600, auto: true, dmg: [63, 21, 18], far: [48, 16, 13], falloff: 20, spread: { base: 1.1, move: 1.8, air: 6, shot: 0.7, max: 5, recover: 8 }, recoil: { v: 0.65, h: 0.5 }, reload: 2.0, equip: 0.75, speed: 1.0 },
  { id: 'mamba', name: 'Mamba', cat: 'sidearm', cost: 500, slot: 'secondary', mag: 15, reserve: 45, rpm: 400, auto: false, dmg: [105, 30, 25], far: [88, 25, 21], falloff: 25, spread: { base: 0.3, move: 2.2, air: 6, shot: 0.8, max: 3.5, recover: 10 }, recoil: { v: 0.7, h: 0.3 }, reload: 2.2, equip: 0.75, speed: 1.0, quiet: true },
  { id: 'magnum', name: 'Magnum', cat: 'sidearm', cost: 800, slot: 'secondary', mag: 6, reserve: 24, rpm: 240, auto: false, dmg: [159, 55, 46], far: [145, 50, 42], falloff: 30, spread: { base: 0.25, move: 3.2, air: 7, shot: 2.6, max: 5, recover: 6 }, recoil: { v: 3.0, h: 0.6 }, reload: 2.25, equip: 1.0, speed: 1.0 },
  { id: 'bolt', name: 'Bolt', cat: 'sidearm', cost: 300, slot: 'secondary', mag: 2, reserve: 8, rpm: 200, auto: false, pellets: 9, dmg: [22, 11, 9], far: [6, 3, 3], falloff: 9, spread: { base: 4.2, move: 0.5, air: 2, shot: 0, max: 4.2, recover: 10 }, recoil: { v: 3.5, h: 1.0 }, reload: 1.75, equip: 0.75, speed: 1.0 },
  { id: 'viper', name: 'Viper', cat: 'smg', cost: 1100, slot: 'primary', mag: 20, reserve: 80, rpm: 860, auto: true, dmg: [60, 24, 20], far: [48, 19, 16], falloff: 15, spread: { base: 0.9, move: 0.6, air: 5, shot: 0.28, max: 3.6, recover: 9 }, recoil: { v: 0.4, h: 0.55 }, reload: 2.0, equip: 0.6, speed: 1.0 },
  { id: 'swift', name: 'Swift', cat: 'smg', cost: 1600, slot: 'primary', mag: 30, reserve: 90, rpm: 800, auto: true, dmg: [67, 26, 22], far: [56, 22, 18], falloff: 20, spread: { base: 0.7, move: 0.9, air: 5, shot: 0.22, max: 3.2, recover: 8 }, recoil: { v: 0.45, h: 0.45 }, reload: 2.25, equip: 0.75, speed: 0.98 },
  { id: 'breaker', name: 'Breaker', cat: 'shotgun', cost: 1850, slot: 'primary', mag: 5, reserve: 15, rpm: 66, auto: false, pellets: 12, dmg: [34, 17, 14], far: [12, 6, 5], falloff: 12, spread: { base: 3.6, move: 0.6, air: 2, shot: 0, max: 3.6, recover: 10 }, recoil: { v: 4.5, h: 1.2 }, reload: 1.75, equip: 1.0, speed: 0.95, pump: true },
  { id: 'tempest', name: 'Tempest', cat: 'shotgun', cost: 2600, slot: 'primary', mag: 7, reserve: 21, rpm: 210, auto: true, pellets: 10, dmg: [24, 12, 10], far: [10, 5, 4], falloff: 11, spread: { base: 3.2, move: 0.6, air: 2, shot: 0.4, max: 4.5, recover: 6 }, recoil: { v: 2.4, h: 1.1 }, reload: 2.6, equip: 1.0, speed: 0.94 },
  { id: 'ranger', name: 'Ranger', cat: 'rifle', cost: 2050, slot: 'primary', mag: 24, reserve: 72, rpm: 600, auto: false, burst: 3, burstDelay: 0.32, dmg: [116, 35, 29], far: [116, 35, 29], spread: { base: 0.3, move: 4, air: 7, shot: 0.5, max: 4, recover: 9 }, recoil: { v: 0.9, h: 0.4 }, reload: 2.5, equip: 1.0, speed: 0.95 },
  { id: 'sentinel', name: 'Sentinel', cat: 'rifle', cost: 2250, slot: 'primary', mag: 12, reserve: 36, rpm: 290, auto: false, dmg: [195, 65, 49], far: [195, 65, 49], spread: { base: 0.1, move: 5, air: 8, shot: 1.0, max: 4, recover: 10 }, recoil: { v: 1.4, h: 0.3 }, reload: 2.5, equip: 1.0, speed: 0.92 },
  { id: 'falcon', name: 'Falcon', cat: 'rifle', cost: 2900, slot: 'primary', mag: 25, reserve: 75, rpm: 585, auto: true, dmg: [160, 40, 34], far: [160, 40, 34], spread: { base: 0.25, move: 6, air: 8, shot: 0.38, max: 6, recover: 8 }, recoil: { v: 0.95, h: 0.65, pattern: 'climb' }, reload: 2.5, equip: 1.0, speed: 0.92 },
  { id: 'raptor', name: 'Raptor', cat: 'rifle', cost: 2900, slot: 'primary', mag: 30, reserve: 90, rpm: 660, auto: true, dmg: [156, 39, 33], far: [124, 31, 26], falloff: 30, spread: { base: 0.2, move: 6, air: 8, shot: 0.32, max: 5.5, recover: 8.5 }, recoil: { v: 0.8, h: 0.55, pattern: 'climb' }, reload: 2.5, equip: 1.0, speed: 0.92, quiet: true },
  { id: 'marshal', name: 'Marshal', cat: 'rifle', cost: 1600, slot: 'primary', mag: 10, reserve: 30, rpm: 230, auto: false, dmg: [150, 55, 45], far: [150, 55, 45], spread: { base: 0.12, move: 4, air: 8, shot: 0.6, max: 3, recover: 9 }, recoil: { v: 1.7, h: 0.25 }, reload: 2.3, equip: 1.0, speed: 0.93, scope: [1.6] },
  { id: 'scout', name: 'Scout', cat: 'sniper', cost: 950, slot: 'primary', mag: 5, reserve: 15, rpm: 90, auto: false, dmg: [202, 101, 85], far: [202, 101, 85], spread: { base: 0.05, unscoped: 4, move: 5, air: 9, shot: 0, max: 9, recover: 12 }, recoil: { v: 2.5, h: 0.2 }, reload: 2.5, equip: 1.0, speed: 0.9, scope: [2.5] },
  { id: 'longbow', name: 'Longbow', cat: 'sniper', cost: 4700, slot: 'primary', mag: 5, reserve: 10, rpm: 36, auto: false, dmg: [255, 150, 120], far: [255, 150, 120], spread: { base: 0.02, unscoped: 5, move: 8, air: 12, shot: 0, max: 12, recover: 12 }, recoil: { v: 3.5, h: 0.2 }, reload: 3.7, equip: 1.25, speed: 0.76, scope: [2.5, 5] },
  { id: 'anvil', name: 'Anvil', cat: 'heavy', cost: 3200, slot: 'primary', mag: 50, reserve: 100, rpm: 700, auto: true, dmg: [95, 38, 32], far: [77, 31, 26], falloff: 30, spread: { base: 0.9, move: 4, air: 9, shot: 0.12, max: 4, recover: 5 }, recoil: { v: 0.42, h: 0.6 }, reload: 5.0, equip: 1.25, speed: 0.85 },
];
export const WEAPON = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const BUY_CATS = [
  ['Sidearms', ['wasp', 'bolt', 'hornet', 'mamba', 'magnum']],
  ['SMG / Shotgun', ['viper', 'swift', 'breaker', 'tempest']],
  ['Rifles', ['marshal', 'ranger', 'sentinel', 'falcon', 'raptor']],
  ['Snipers / Heavy', ['scout', 'longbow', 'anvil']],
];
export const ARMOR = [
  { id: 'light', name: 'Light Shields', cost: 400, value: 25 },
  { id: 'heavy', name: 'Heavy Shields', cost: 1000, value: 50 },
];

// damage for one hit; part: 0 head, 1 body, 2 legs
export function hitDamage(w, part, dist) {
  const t = w.far && w.falloff && dist > w.falloff ? w.far : w.dmg;
  return t[part];
}

// ── agents ──
// Ability slots: C and Q are bought each round, E is free (signature), X is the ultimate (needs points).
// kind tells the game which effect to run; numbers are tuned per ability.
export const AGENTS = [
  {
    id: 'vex', suit: '#4a3530', suit2: '#5c4c42', name: 'Vex', role: 'Duelist', color: '#ff5a3c', accent: '#ffc35a',
    bio: 'Close-quarters entry fighter. Burns corners clear, flashes, then dashes in.',
    abilities: {
      c: { name: 'Flare', kind: 'flash', cost: 250, max: 2, desc: 'Throw a flare that blinds everyone looking at it.' },
      q: { name: 'Firebomb', kind: 'molly', cost: 200, max: 1, desc: 'Lob a bomb that leaves a burning patch (60 dmg/s).' },
      e: { name: 'Jetstream', kind: 'dash', free: 1, max: 1, desc: 'Dash forward in the direction you move.' },
      x: { name: 'Overdrive', kind: 'overdrive', points: 7, desc: 'For 12 s: faster movement, instant reloads and +50 shields.' },
    },
  },
  {
    id: 'mirage', suit: '#36314f', suit2: '#4a4466', name: 'Mirage', role: 'Controller', color: '#7a5cff', accent: '#3ee6ff',
    bio: 'Blocks sight lines with long-range smoke domes and slows pushes.',
    abilities: {
      c: { name: 'Slow Orb', kind: 'slow', cost: 150, max: 2, desc: 'Throw an orb that leaves a slowing field.' },
      q: { name: 'Haze', kind: 'smoke', cost: 100, max: 1, desc: 'Lob a smoke grenade (15 s).' },
      e: { name: 'Dome', kind: 'smoke', free: 2, max: 3, desc: 'Place a smoke dome where you aim, up to 45 m away (18 s).', aimed: true },
      x: { name: 'Eclipse', kind: 'eclipse', points: 7, desc: 'Drop a line of four smokes along where you aim.' },
    },
  },
  {
    id: 'echo', suit: '#3e4a3c', suit2: '#5b6650', name: 'Echo', role: 'Initiator', color: '#29d3a0', accent: '#d5ff4a',
    bio: 'Information gatherer. Reveals enemies through walls and concusses them.',
    abilities: {
      c: { name: 'Concuss', kind: 'concuss', cost: 250, max: 2, desc: 'Throw a charge that dazes and slows enemies hit.' },
      q: { name: 'Shock Dart', kind: 'shock', cost: 200, max: 2, desc: 'A dart that bursts for up to 75 damage.' },
      e: { name: 'Recon Dart', kind: 'recon', free: 1, max: 1, desc: 'A dart that reveals nearby enemies twice.' },
      x: { name: 'Hunter\'s Sight', kind: 'hunt', points: 8, desc: 'Reveal every enemy on the map three times.' },
    },
  },
  {
    id: 'halo', suit: '#c9d0dc', suit2: '#8f9bb0', name: 'Halo', role: 'Sentinel', color: '#3e8bff', accent: '#f2f5ff',
    bio: 'Locks down a site with barriers, a watch turret and slows.',
    abilities: {
      c: { name: 'Barrier', kind: 'wall', cost: 400, max: 1, desc: 'Raise a wall in front of you for 30 s.' },
      q: { name: 'Snare', kind: 'slow', cost: 200, max: 2, desc: 'A slowing field that also reveals.' },
      e: { name: 'Watch Turret', kind: 'turret', free: 1, max: 1, desc: 'Place a turret that fires at enemies in front of it.' },
      x: { name: 'Bastion', kind: 'bastion', points: 7, desc: 'Restore full health and +50 shields to you and nearby allies.' },
    },
  },
  {
    id: 'solace', suit: '#d9ccb0', suit2: '#a8977a', name: 'Solace', role: 'Sentinel', color: '#f2c94c', accent: '#ffffff',
    bio: 'Keeps the team alive: heals, slows and can bring an ally back.',
    abilities: {
      c: { name: 'Barrier Orb', kind: 'wall', cost: 300, max: 1, desc: 'Raise a short wall for 25 s.' },
      q: { name: 'Slow Orb', kind: 'slow', cost: 150, max: 2, desc: 'A slowing field.' },
      e: { name: 'Mend', kind: 'heal', free: 1, max: 1, desc: 'Heal yourself or the ally you look at for 60 HP.' },
      x: { name: 'Second Wind', kind: 'revive', points: 8, desc: 'Revive the dead ally you look at.' },
    },
  },
  {
    id: 'riot', suit: '#333338', suit2: '#5a2c3d', name: 'Riot', role: 'Initiator', color: '#ff3d7f', accent: '#5affd2',
    bio: 'Explosives expert. Clears space with frags, stuns and an orbital strike.',
    abilities: {
      c: { name: 'Stun Grenade', kind: 'concuss', cost: 250, max: 2, desc: 'Dazes and slows everyone caught.' },
      q: { name: 'Frag', kind: 'frag', cost: 300, max: 1, desc: 'Grenade that explodes for up to 120 damage.' },
      e: { name: 'Pulse', kind: 'recon', free: 1, max: 1, desc: 'Emit a pulse that reveals enemies around where it lands.' },
      x: { name: 'Orbital Strike', kind: 'orbital', points: 8, desc: 'Call a strike on where you aim (200 dmg after 2.5 s).', aimed: true },
    },
  },
  {
    id: 'nova', suit: '#2b2440', suit2: '#40355e', name: 'Nova', role: 'Duelist', color: '#b06cff', accent: '#ffe27a',
    bio: 'Fights from angles nobody expects: blinks through gaps and overwhelms a site with light.',
    abilities: {
      c: { name: 'Shard', kind: 'flash', cost: 250, max: 2, desc: 'Throw a crystal shard that bursts into a blinding flash.' },
      q: { name: 'Static', kind: 'shock', cost: 200, max: 1, desc: 'A dart that bursts for up to 75 damage.' },
      e: { name: 'Blink', kind: 'blink', free: 1, max: 2, desc: 'Teleport up to 9 m in the direction you aim.' },
      x: { name: 'Supernova', kind: 'supernova', points: 7, desc: 'Erupt with light: blinds and reveals every enemy within 25 m that can see you.' },
    },
  },
  {
    id: 'warden', suit: '#3a3f2c', suit2: '#545b3c', name: 'Warden', role: 'Controller', color: '#8fae3c', accent: '#c8ff6a',
    bio: 'Chokes off routes with toxic gas, smog and sensor traps, then locks a whole area down.',
    abilities: {
      c: { name: 'Toxin', kind: 'toxin', cost: 200, max: 2, desc: 'Lob a canister that leaks toxic gas (15 dmg/s) for 9 s.' },
      q: { name: 'Smog', kind: 'smoke', cost: 100, max: 2, desc: 'Lob a smoke canister (15 s).' },
      e: { name: 'Sensor Trap', kind: 'trap', free: 1, max: 1, desc: 'Place a sensor that dazes and reveals the first enemy who comes close.' },
      x: { name: 'Lockdown', kind: 'lockdown', points: 8, desc: 'Flood a large area where you aim with a slowing, revealing field for 8 s.', aimed: true },
    },
  },
];
export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
export const SLOTS = ['c', 'q', 'e', 'x'];

// ── rules ──
export const ECON = { start: 800, win: 3000, loss: [1900, 2400, 2900], kill: 200, plant: 300, max: 9000 };
export const TIMES = { buy: 30, round: 100, plant: 4, defuse: 7, defuseHalf: 3.5, fuse: 45, end: 6, dmRespawn: 2.5, dmLength: 360 };
export const COLORS = { atk: '#ff4655', def: '#3edbc4', me: '#ffd166' };

export const BOT_NAMES = ['Nyx', 'Kite', 'Rook', 'Ember', 'Pike', 'Sable', 'Juno', 'Flint', 'Wren', 'Onyx', 'Lumen', 'Brisk', 'Corvo', 'Talon', 'Ash', 'Moss', 'Rune', 'Zed'];
export const DIFFICULTY = {
  easy: { react: 0.62, aim: 3.2, turn: 4, spray: 1.6, headshot: 0.12, hear: 18 },
  normal: { react: 0.38, aim: 1.8, turn: 7, spray: 1.15, headshot: 0.28, hear: 26 },
  hard: { react: 0.22, aim: 0.9, turn: 11, spray: 0.85, headshot: 0.45, hear: 34 },
};

// ── saved data ──
const SAVE_KEY = 'core-breach-save';
export const DEFAULT_SETTINGS = {
  sens: 1.0, fov: 95, volume: 70, quality: 'medium', difficulty: 'normal', length: 'short',
  ch: { color: '#00ff8c', size: 6, gap: 3, thick: 2, dot: true, outline: true, dynamic: true },
  agent: 'vex', invertY: false, showFps: false, dynRes: true, map: 'random',
};
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
  const d = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, rangeBest: 0 } };
  if (!s) return d;
  return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}), ch: { ...d.settings.ch, ...((s.settings || {}).ch || {}) } }, stats: { ...d.stats, ...(s.stats || {}) } };
}
export function writeSave(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}
