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
  { id: 'rate', name: 'Fire rate', desc: 'Units fired per second', max: 15, base: 5, step: 0.6, unit: '/s', cost: (l) => 75 + l * l * 50 },
  { id: 'start', name: 'Opening burst', desc: 'Units launched when the level starts', max: 15, base: 0, step: 6, unit: '', cost: (l) => 100 + l * l * 55 },
  { id: 'champ', name: 'Champion power', desc: 'Champion health and damage', max: 15, base: 1, step: 0.25, unit: '×', cost: (l) => 125 + l * l * 70 },
  { id: 'armor', name: 'Cannon armor', desc: 'Enemies the cannon can take', max: 12, base: 30, step: 5, unit: ' HP', cost: (l) => 90 + l * l * 50 },
  { id: 'coins', name: 'Loot bonus', desc: 'Extra coins from every level', max: 10, base: 0, step: 10, unit: '%', cost: (l) => 150 + l * l * 75 },
  { id: 'cool', name: 'Power recharge', desc: 'Super powers recharge faster', max: 10, base: 0, step: 6, unit: '%', cost: (l) => 140 + l * l * 70 },
  { id: 'pow', name: 'Power-up time', desc: 'Frenzy and Freeze last longer', max: 10, base: 0, step: 10, unit: '%', cost: (l) => 110 + l * l * 60 },
];

// ── power-up orbs over the lane: the first unit to run through one triggers it ──
export const POWERUPS = {
  frenzy: { name: 'FRENZY', desc: 'Fire rate ×2.5', color: '#ff8a2a', icon: 'bolt', time: 6 },
  freeze: { name: 'FREEZE', desc: 'The horde slows to a crawl', color: '#58c8ff', icon: 'snow', time: 5 },
  bomb: { name: 'BOMB', desc: 'Blasts the lane ahead clear', color: '#ff3b6b', icon: 'bomb', time: 0 },
};
// super powers: the player's own abilities, each on a cooldown (seconds). The first four are owned from
// the start; the rest are rare prizes (first clear of a boss level, all three daily missions done)
// or bought in the store (cost in coins).
// Up to LOADOUT of them are taken into a level (keys 1-4).
export const LOADOUT = 4;
export const POWERS = [
  { id: 'meteor', name: 'Meteor', desc: 'Five meteors smash the thickest part of the horde', cd: 16, color: '#ff7a2a', icon: 'meteor', cost: 0 },
  { id: 'rally', name: 'Rally', desc: 'Fires a volley of extra units at once', cd: 12, color: '#3fd86b', icon: 'rally', cost: 0 },
  { id: 'aegis', name: 'Aegis', desc: "The cannon can't be hurt for 6 s, and zaps anything that reaches it", cd: 24, color: '#58c8ff', icon: 'shield', cost: 0 },
  { id: 'storm', name: 'Thunder', desc: 'Lightning strikes every bat, archer and shaman, and scorches bosses', cd: 18, color: '#ffe066', icon: 'bolt', cost: 0 },
  { id: 'blizzard', name: 'Blizzard', desc: 'The whole horde freezes to a crawl for 7 s', cd: 20, color: '#9fe4ff', icon: 'snow', cost: 1000 },
  { id: 'overdrive', name: 'Overdrive', desc: 'Fire rate ×2.5 for 8 s', cd: 18, color: '#ff9a2a', icon: 'bolt', cost: 1100 },
  { id: 'repair', name: 'Repair', desc: 'Restores half of your cannon armor', cd: 25, color: '#ff5f8a', icon: 'heart', cost: 1500 },
  { id: 'gale', name: 'Gale', desc: 'A gust blows the whole horde back toward its fortress', cd: 16, color: '#c8f0ff', icon: 'infinity', cost: 1750 },
  { id: 'hero', name: 'Hero Call', desc: 'Your hero charges up the lane right now', cd: 30, color: '#ffd23f', icon: 'shield', cost: 1900 },
  { id: 'airstrike', name: 'Airstrike', desc: 'Five missiles blast a line across the lane', cd: 20, color: '#ff8a5a', icon: 'plane', cost: 2500 },
  { id: 'mines', name: 'Sentry Guns', desc: 'Guns pound the lane in front of the cannon for 4 s', cd: 22, color: '#d0d6e0', icon: 'cannon', cost: 2750 },
  { id: 'nuke', name: 'Nuke', desc: 'One giant blast wipes out the thickest part of the horde', cd: 30, color: '#ff3b6b', icon: 'bomb', cost: 3100 },
  { id: 'chain', name: 'Chain Lightning', desc: 'Lightning jumps between 14 enemies', cd: 18, color: '#b8a8ff', icon: 'bolt', cost: 3250 },
  { id: 'smite', name: 'Smite', desc: 'Takes 30% off every boss and brute on the lane', cd: 25, color: '#fff3a0', icon: 'castle', cost: 3500 },
  { id: 'carpet', name: 'Carpet Bomb', desc: 'A bomber flattens the lane from your cannon to the fortress', cd: 22, color: '#ffb35a', icon: 'jet', cost: 3750 },
  { id: 'laser', name: 'Sky Laser', desc: 'A beam from orbit burns straight up your aim line', cd: 20, color: '#ff4fd8', icon: 'bolt', cost: 4000 },
  { id: 'quake', name: 'Earthquake', desc: 'The ground splits: a third of the horde falls in', cd: 26, color: '#c09060', icon: 'skull', cost: 4400 },
  { id: 'timewarp', name: 'Time Warp', desc: 'The horde freezes and your cannon goes into overdrive for 5 s', cd: 26, color: '#a07bff', icon: 'calendar', cost: 4750 },
  { id: 'mirror', name: 'Mirror', desc: 'Every unit on the lane gets a twin', cd: 24, color: '#7fffd0', icon: 'rally', cost: 5000 },
  { id: 'firerain', name: 'Fire Rain', desc: 'Fourteen meteors rain down along the whole lane', cd: 28, color: '#ff5a2a', icon: 'meteor', cost: 5600 },
  { id: 'vortex', name: 'Vortex', desc: 'Sucks the horde into one spot, then it implodes', cd: 28, color: '#6a5aff', icon: 'infinity', cost: 6250 },
  { id: 'midas', name: 'Midas Touch', desc: 'A quarter of the horde turns to gold coins', cd: 30, color: '#ffcf3a', icon: 'gift', cost: 6900 },
  { id: 'legion', name: 'Legion', desc: 'Three Rally volleys in a row', cd: 30, color: '#2fe07a', icon: 'rally', cost: 7500 },
  { id: 'siege', name: 'Siege Strike', desc: 'Meteors hit the enemy fortress for 8% of its health', cd: 30, color: '#ff7a5a', icon: 'castle', cost: 8750 },
];
export const STARTER_POWERS = POWERS.filter((p) => !p.cost).map((p) => p.id);
// the loadout rules, kept here so they can be tested: toggle a power in or out (owned ones only, at most LOADOUT)
export const inLoadout = (save) => save.loadout.filter((id) => save.powers.includes(id)).slice(0, LOADOUT);
export function toggleLoadout(save, id) {
  const L = inLoadout(save);
  save.loadout = L.includes(id) ? L.filter((x) => x !== id) : save.powers.includes(id) && L.length < LOADOUT ? [...L, id] : L;
}
// with LOADOUT powers or fewer there is nothing to choose, so a level starts without the loadout screen
export const needsLoadoutScreen = (save) => save.powers.length > LOADOUT;
// a gifted power: one of the three cheapest the player doesn't own yet (null once they own them all)
export function giftPower(save, r = Math.random()) {
  const left = POWERS.filter((p) => !save.powers.includes(p.id)).slice(0, 3);
  if (!left.length) return null;
  const id = left[Math.floor(r * left.length)].id;
  save.powers.push(id);
  if (save.loadout.length < LOADOUT) save.loadout.push(id);
  return id;
}

// pets: an animated companion beside the cannon, each with its own perk
export const PETS = [
  { id: 'shiba', name: 'Shiba', desc: 'Lucky pup: +20% coins from everything, and digs up treasure', cost: 1500, model: 'ShibaInu', color: '#e8a050' },
  { id: 'husky', name: 'Husky', desc: 'Guard dog: pounces on enemies that get close to the cannon', cost: 3100, model: 'Husky', color: '#9aa8b8' },
  { id: 'fox', name: 'Fox', desc: 'Clever fox: super powers recharge 25% faster', cost: 5000, model: 'Fox', color: '#ff8a3a' },
];

// combo tiers: kills chained without a 1.2 s gap
export const COMBO_TIERS = [25, 50, 100, 200, 400, 800];
export const upgradeValue = (save, id) => {
  const u = UPGRADES.find((x) => x.id === id);
  return u.base + u.step * (save.up[id] || 0);
};

// ── unit skins: a 3D character every unit in your crowd becomes (models in skins/, see CREDITS.txt).
// color tints the HUD, splats and cannon; acc is the blob look used until (or if) the model can't load ──
export const SKINS = [
  { id: 'sprout', name: 'Slime', desc: 'A bouncy green slime', model: 'skins/Slime', color: '#3fd86b', acc: 'leaf', cost: 0 },
  { id: 'berry', name: 'Chick', desc: 'A fluffy little chick', model: 'skins/Chick', color: '#ffd23f', acc: 'ears', cost: 750 },
  { id: 'frost', name: 'Penguin', desc: 'Waddles into battle', model: 'skins/Penguin', color: '#58c8ff', acc: 'horn', cost: 1100 },
  { id: 'ember', name: 'Duckling', desc: 'A brave little duckling', model: 'skins/Duck', color: '#ff8a2a', acc: 'flame', cost: 1600 },
  { id: 'royal', name: 'Buddy', desc: 'A chubby blue hero', model: 'skins/Buddy', color: '#2b8cff', acc: 'crown', cost: 2500 },
  { id: 'gold', name: 'Ninja', desc: 'Twin swords, no fear', model: 'skins/Ninja', color: '#9b6bff', acc: 'crown', cost: 4400 },
];

// ── champions: a big unit charged by firing ──
export const CHAMPIONS = [
  { id: 'titan', name: 'Titan', desc: 'Huge and tough: walks through the horde.', hp: 40, speed: 4.2, radius: 1.4, dmg: 3, cost: 0 },
  { id: 'roller', name: 'Roller', desc: 'A rolling boulder: fast, flattens everything in a line.', hp: 26, speed: 9, radius: 1.1, dmg: 2, cost: 1900 },
  { id: 'splitter', name: 'Splitter', desc: 'Bursts into 30 units when it is destroyed.', hp: 22, speed: 5.5, radius: 1.2, dmg: 2, split: 30, cost: 3100 },
  { id: 'blaster', name: 'Blaster', desc: 'Explodes when it falls, flattening everything nearby.', hp: 24, speed: 6.5, radius: 1.15, dmg: 2, blast: 6, cost: 4400 },
];

// ── worlds: every 5 levels the scenery changes ──
export const THEMES = [
  { id: 'meadow', name: 'Green Meadow', sky: ['#7ec8ff', '#d9f0ff'], ground: '#76b85e', ground2: '#4f9445', lane: '#c9ccd2', rail: '#e9eef2', tree: '#3d9a4a', trunk: '#7a5636', fog: '#cfe8ff', sun: '#fff4dc', enemy: '#2a2633', fort: '#8a6a52' },
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
    settings: { quality: 'medium', volume: 70, vibrate: true, dynRes: true, autoFire: false, camera: 'wide' },
    stats: { fired: 0, kills: 0, wins: 0, losses: 0, bosses: 0, bestCombo: 0 },
    endless: { best: 0, runs: 0 }, challenge: { day: '', done: false, best: 0 }, seen: {},
    pets: [], pet: null, missions: { day: '', list: [] }, weapons: ['cannon'], weapon: 'cannon',
    powers: [...STARTER_POWERS], loadout: [...STARTER_POWERS],
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
