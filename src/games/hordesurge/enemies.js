// Horde Surge enemy roster: the kinds of horde units (each unlocks at a level and gets an intro card)
// and one boss per world, each with its own special attacks on top of the ground smash.

// index in this list is the unit's type id inside the enemy crowd; cost = how many grunts it is worth
// in the level's difficulty budget (units it takes to beat, or units it tends to take with it)
export const ENEMY_TYPES = [
  { id: 'grunt', name: 'Grunt', desc: 'The rank and file of the horde.', hp: 1, speed: 1, color: null, from: 1, hit: 1, cost: 1 },
  { id: 'shield', name: 'Shieldbearer', desc: 'Hides behind a big shield: takes 2 of your units to bring down.', hp: 2, speed: 0.75, color: '#5b6a86', from: 3, hit: 1, max: 0.16, cost: 2 },
  { id: 'bomber', name: 'Bomber', desc: 'Sprints at your crowd and explodes, taking a whole cluster with it.', hp: 1, speed: 1.55, color: '#d83a2a', from: 6, hit: 2, max: 0.1, cost: 2.5 },
  { id: 'archer', name: 'Archer', desc: 'Stops halfway and rains arrows into your crowd. Push through to reach it.', hp: 1, speed: 0.9, color: '#3f7a3a', from: 8, hit: 1, max: 0.08, cost: 2.5 },
  { id: 'flyer', name: 'Bat', desc: 'Flies over gates and units, then dives at the cannon. Aim your shots at it!', hp: 1, speed: 1.25, color: '#7a4ad8', from: 11, hit: 1, max: 0.06, cost: 1.5 },
  { id: 'healer', name: 'Shaman', desc: 'Keeps brutes and bosses alive. Take it out first.', hp: 2, speed: 0.7, color: '#21b8a6', from: 13, hit: 1, max: 0.05, cost: 2 },
];
export const ET = Object.fromEntries(ENEMY_TYPES.map((t, i) => [t.id, i]));

// spawn weights for level n: [type index, weight] (grunts take what is left)
export function enemyMix(n, extra = {}) {
  const out = [];
  let left = 1;
  ENEMY_TYPES.forEach((t, i) => {
    if (!i || n < t.from) return;
    // a new type shows up a lot on the level that introduces it, then settles to its share
    const w = extra[t.id] ?? (n === t.from ? 0.1 : Math.min(t.max, 0.03 + (n - t.from) * 0.008));
    out.push([i, w]);
    left -= w;
  });
  out.unshift([0, Math.max(0.2, left)]);
  return out;
}

// average cost of one unit drawn from this mix
export const mixCost = (mix) => mix.reduce((a, [i, w]) => a + w * ENEMY_TYPES[i].cost, 0) / mix.reduce((a, [, w]) => a + w, 0);

export function pickType(mix, r) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let x = r * total;
  for (const [i, w] of mix) { x -= w; if (x <= 0) return i; }
  return 0;
}

// one boss per world: look, title and the attacks it rotates through (it always ground-smashes too)
export const BOSSES = {
  meadow: { name: 'Gronk the Crusher', title: 'Tyrant of the Meadow', skin: '#ffcf3a', attacks: ['summon'], minion: 'shield', model: 'Trex', height: 6.5, tint: { Green: '#4f9a3a', LightGreen: '#9bd36a', LightYellow: '#ffd98a', Red: '#c0392b' } },
  snow: { name: 'Frostjaw', title: 'Great Wolf of the Peaks', skin: '#9fd8ff', crown: '#5ec8ff', attacks: ['shards', 'summon'], minion: 'grunt', model: 'Wolf', height: 4.6, tint: { Main: '#d6ecff', Main_Light: '#ffffff' } },
  desert: { name: 'Rakhet the Sandlord', title: 'Spider King under the Dunes', skin: '#e0a85a', crown: '#ffcf3a', attacks: ['burrow', 'summon'], minion: 'bomber', model: 'Spider', height: 3.4, tint: { Material: '#c48a4a', 'Material.001': '#5a3a22' } },
  candy: { name: 'Queen Bonbon', title: 'The Sweet Toad Queen', skin: '#ff8ad0', crown: '#ffd23f', attacks: ['bubble', 'summon'], minion: 'healer', model: 'Frog', height: 4.2, tint: { Green: '#ff7cc8', Yellow: '#ffe0f2' } },
  night: { name: 'Overlord VOLT', title: 'War Mech of the Neon Night', skin: '#ff3b6b', crown: '#7fe9ff', glow: true, attacks: ['laser', 'shards'], minion: 'flyer', model: 'Leela', height: 7 },
};

export const ATTACK_NAMES = { summon: 'CALLS THE HORDE', shards: 'ICE STORM', burrow: 'BURROWS!', bubble: 'SUGAR SHIELD', laser: 'NEON BEAM' };
