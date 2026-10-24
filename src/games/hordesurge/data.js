// Horde Surge: game data — tuning, upgrades, skins, champions, world themes and the save file.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));

// ── the lane (metres): x across, z along; the cannon sits at +z, the enemy fortress far down -z ──
export const LANE_W = 12;
export const CANNON_Z = 5;
export const UNIT_SPEED = 8;
export const ENEMY_SPEED = 5;
export const MAX_UNITS = 1400; // per side

// ── upgrades bought with coins between levels ──
export const UPGRADES = [
  { id: 'rate', name: 'Fire rate', desc: 'Units fired per second', max: 15, base: 5, step: 0.6, unit: '/s', cost: (l) => 60 + l * l * 40 },
  { id: 'start', name: 'Opening burst', desc: 'Units launched when the level starts', max: 15, base: 0, step: 6, unit: '', cost: (l) => 80 + l * l * 45 },
  { id: 'champ', name: 'Champion power', desc: 'Champion health and damage', max: 15, base: 1, step: 0.25, unit: '×', cost: (l) => 100 + l * l * 55 },
  { id: 'armor', name: 'Cannon armor', desc: 'Enemies the cannon can take', max: 12, base: 20, step: 5, unit: ' HP', cost: (l) => 70 + l * l * 40 },
  { id: 'coins', name: 'Loot bonus', desc: 'Extra coins from every level', max: 10, base: 0, step: 10, unit: '%', cost: (l) => 120 + l * l * 60 },
];
export const upgradeValue = (save, id) => {
  const u = UPGRADES.find((x) => x.id === id);
  return u.base + u.step * (save.up[id] || 0);
};

// ── unit skins (body colour and ears/accessory) ──
export const SKINS = [
  { id: 'sprout', name: 'Sprout', color: '#3fd86b', acc: 'leaf', cost: 0 },
  { id: 'berry', name: 'Berry', color: '#ff4f8b', acc: 'ears', cost: 600 },
  { id: 'frost', name: 'Frost', color: '#58c8ff', acc: 'horn', cost: 900 },
  { id: 'ember', name: 'Ember', color: '#ff8a2a', acc: 'flame', cost: 1300 },
  { id: 'royal', name: 'Royal', color: '#9b6bff', acc: 'crown', cost: 2000 },
  { id: 'gold', name: 'Gilded', color: '#ffcf3a', acc: 'crown', cost: 3500 },
];

// ── champions: a big unit charged by firing ──
export const CHAMPIONS = [
  { id: 'titan', name: 'Titan', desc: 'Huge and tough: walks through the horde.', hp: 40, speed: 4.2, radius: 1.4, dmg: 3, cost: 0 },
  { id: 'roller', name: 'Roller', desc: 'A rolling boulder: fast, flattens everything in a line.', hp: 26, speed: 9, radius: 1.1, dmg: 2, cost: 1500 },
  { id: 'splitter', name: 'Splitter', desc: 'Bursts into 30 units when it is destroyed.', hp: 22, speed: 5.5, radius: 1.2, dmg: 2, split: 30, cost: 2500 },
];

// ── worlds: every 5 levels the scenery changes ──
export const THEMES = [
  { id: 'meadow', name: 'Green Meadow', sky: ['#7ec8ff', '#d9f0ff'], ground: '#7cc46a', ground2: '#5aa64d', lane: '#c9ccd2', rail: '#e9eef2', tree: '#3d9a4a', trunk: '#7a5636', fog: '#cfe8ff', sun: '#fff4dc', enemy: '#2a2633', fort: '#8a6a52' },
  { id: 'snow', name: 'Frost Peaks', sky: ['#9fb6cc', '#e8eef3'], ground: '#dce5ed', ground2: '#c3d1de', lane: '#b9bdc4', rail: '#f4f6f8', tree: '#2f6a52', trunk: '#5e4632', fog: '#dfe7ee', sun: '#ffffff', enemy: '#1d1b24', fort: '#6f7c8c' },
  { id: 'desert', name: 'Sunbaked Dunes', sky: ['#f4b26b', '#ffe7c2'], ground: '#e8c27f', ground2: '#d6a866', lane: '#cdb79a', rail: '#f5e9d6', tree: '#5f8f3a', trunk: '#8a6a3a', fog: '#f6dcb6', sun: '#ffd9a0', enemy: '#3a1f1a', fort: '#b07a4a' },
  { id: 'candy', name: 'Candy Hills', sky: ['#ff9ad5', '#ffe2f4'], ground: '#ffc2e6', ground2: '#f6a7d6', lane: '#e3d4ee', rail: '#ffffff', tree: '#ff5fa8', trunk: '#ffffff', fog: '#ffe0f2', sun: '#fff0fa', enemy: '#3b1e4a', fort: '#c45a9a' },
  { id: 'night', name: 'Neon Night', sky: ['#0b0f2a', '#2a1b55'], ground: '#1b2240', ground2: '#151a33', lane: '#3a3f58', rail: '#6a72a8', tree: '#2fd6c4', trunk: '#3a3f58', fog: '#1d2045', sun: '#9fb2ff', enemy: '#ff3b6b', fort: '#4a3a7a', neon: true },
];

// ── save ──
const SAVE_KEY = 'horde-surge-save';
export function defaultSave() {
  return {
    level: 1, coins: 0, gems: 0, up: {}, skin: 'sprout', skins: ['sprout'], champ: 'titan', champs: ['titan'],
    stars: {}, best: 0, daily: { day: '', streak: 0 },
    settings: { quality: 'medium', volume: 70, vibrate: true, dynRes: true, autoFire: false },
    stats: { fired: 0, kills: 0, wins: 0, losses: 0, bosses: 0 },
  };
}
export function loadSave() {
  const d = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s) return d;
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, stats: { ...d.stats, ...(s.stats || {}) }, daily: { ...d.daily, ...(s.daily || {}) }, up: { ...(s.up || {}) } };
  } catch { return d; }
}
export function writeSave(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export const DAILY_REWARDS = [150, 250, 400, 600, 900, 1300, 2000];
