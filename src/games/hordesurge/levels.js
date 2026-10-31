// Horde Surge level generator: every level number gives the same layout (seeded), getting harder as you go.
// A level is a lane from the cannon (z = +5) to the enemy fortress (z = -L) with gates, bonus crates,
// barriers and hazards placed along it, plus the enemy's wave plan and an optional boss.
import * as THREE from 'three';
import { mulberry32, LANE_W, THEMES, clamp } from './data.js';
import { enemyMix, mixCost, ENEMY_TYPES, BOSSES } from './enemies.js';

const HALF = LANE_W / 2;

// time of day across a world's five levels: bright day through golden hour to a dusk boss fight
const DUSK = [0, 0.1, 0.3, 0.55, 0.85];
export function dayTheme(base, k) {
  if (base.neon) return { ...base, tod: k, sunElev: 1, sunI: 1 };
  const a = DUSK[k];
  const mix = (c, to, t) => `#${new THREE.Color(c).lerp(new THREE.Color(to), t).getHexString()}`;
  return {
    ...base, tod: k, sunElev: 1 - a * 0.65, sunI: 1 - a * 0.35,
    sky: [mix(base.sky[0], '#2b2a6a', a), mix(base.sky[1], '#ff9a5a', a * 0.85)],
    fog: mix(base.fog, '#e89a78', a * 0.7),
    sun: mix(base.sun, '#ff9a50', a),
  };
}

// every level gets a twist on the layout, so neighbouring levels never play the same
// (8 twists against 5-level worlds: each world's levels all differ, and the combos shift world to world)
export const TWISTS = [
  { id: 'classic', name: 'Open Field', desc: 'A fair fight on an open lane' },
  { id: 'maze', name: 'Gate Maze', desc: 'Gate rows packed close together, and more of them move' },
  { id: 'crates', name: 'Crate Canyon', desc: 'Bonus crates stacked high on both sides' },
  { id: 'blades', name: 'Blade Alley', desc: 'An extra spinning bar or saw on the lane' },
  { id: 'walls', name: 'Wall Breaker', desc: 'Three walls across the lane, each hiding a ×2' },
  { id: 'gold', name: 'Gold Rush', desc: 'Twice the coin trails, and every coin is worth more' },
  { id: 'orbs', name: 'Power Surge', desc: 'Twice the power-up orbs' },
  { id: 'rush', name: 'Horde Rush', desc: 'A bigger horde, but its fortress is weaker' },
];

// opts: theme (index, overrides the world), forceBoss (endless waves), mods (daily challenge modifiers)
export function makeLevel(n, opts = {}) {
  const rnd = mulberry32(n * 7919 + 13);
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const mods = new Set(opts.mods || []);
  const L = Math.round(62 + Math.min(n, 24) * 1.1);
  const base = THEMES[opts.theme ?? Math.floor((n - 1) / 5) % THEMES.length];
  const theme = dayTheme(base, (n - 1) % 5);
  const bossLevel = opts.forceBoss ?? n % 5 === 0;
  const miniBoss = !bossLevel && n >= 3 && n % 5 === 3;
  const d = Math.min(1, (n - 1) / 30); // overall difficulty 0..1
  const twist = TWISTS[(n - 1) % TWISTS.length];
  const tw = twist.id;
  const lvl = {
    n, L, theme, bossLevel, twist,
    baseHp: Math.round(((bossLevel ? 1.25 : 1) * (300 + n * 70 + d * 1400)) / 5) * 5,
    waves: { first: 2.5, interval: clamp(5.5 - n * 0.12, 2.8, 5.5), count: Math.round(18 + n * 4), growth: 1.05 + d * 0.06, cap: Math.round(80 + n * 14), flow: 5 + n * 0.9, reinforce: Math.round(8 + n * 2.5), fightBack: 0.45 + d * 0.4 },
    brutes: n >= 2 ? { first: bossLevel ? 25 : 14, every: clamp(24 - n * 0.6, 12, 24), hp: Math.round(14 + n * 4), hit: 4 } : null,
    boss: bossLevel ? { ...BOSSES[base.id], hp: Math.round(160 + n * 22), speed: 1.3 + d * 0.5, at: 8, scale: 2.6 } : miniBoss ? { hp: Math.round(70 + n * 10), speed: 1.6, at: 14, scale: 1.8, name: 'Brute', attacks: [] } : null,
    gates: [], crates: [], barriers: [], hazards: [], pickups: [], coins: [], coinValue: 2 + Math.floor(n / 8),
    mix: enemyMix(n, mods.has('iron') ? { shield: 0.35 } : mods.has('bombers') ? { bomber: 0.22 } : {}),
    intro: ENEMY_TYPES.find((t, i) => i && t.from === n) || null,
    mods: [...mods],
  };
  let id = 1;
  // ── gate rows every ~14 m, starting a little in front of the cannon ──
  let z = -7;
  const end = -L + 16;
  let row = 0;
  while (z > end) {
    const kind = row === 0 ? 'pair' : pick(['pair', 'pair', 'single', 'wide', n > 3 || tw === 'maze' ? 'moving' : 'pair', n > 6 ? 'trap' : 'single', ...(tw === 'maze' ? ['moving', 'pair'] : [])]);
    const goodMul = () => (rnd() < 0.15 + d * 0.15 ? 3 : 2);
    if (kind === 'pair') {
      // two gates side by side: a better and a worse choice
      const a = { op: 'x', v: goodMul() };
      const b = rnd() < 0.5 ? { op: '+', v: Math.round(r(3, 8 + n)) } : { op: rnd() < 0.35 + d * 0.3 ? '-' : 'x', v: rnd() < 0.5 ? 2 : Math.round(r(2, 6)) };
      if (b.op === 'x') b.v = 2;
      const left = rnd() < 0.5;
      lvl.gates.push({ id: id++, z, x: -HALF / 2, w: HALF - 0.4, ...(left ? a : b), move: 0 });
      lvl.gates.push({ id: id++, z, x: HALF / 2, w: HALF - 0.4, ...(left ? b : a), move: 0 });
    } else if (kind === 'single') {
      lvl.gates.push({ id: id++, z, x: r(-2.5, 2.5), w: r(3.5, 5), op: 'x', v: goodMul(), move: 0 });
    } else if (kind === 'wide') {
      lvl.gates.push({ id: id++, z, x: 0, w: LANE_W - 1, op: '+', v: Math.round(r(10, 20 + n * 2)), move: 0, once: true });
    } else if (kind === 'moving') {
      lvl.gates.push({ id: id++, z, x: 0, w: r(3, 4), op: 'x', v: goodMul() + (rnd() < 0.3 ? 1 : 0), move: r(2.5, 3.8), speed: r(0.6, 1.2), phase: r(0, 6) });
    } else if (kind === 'trap') {
      lvl.gates.push({ id: id++, z, x: r(-2, 2), w: r(4, 6), op: '-', v: Math.round(r(3, 8)), move: r(0, 2), speed: r(0.5, 1), phase: r(0, 6) });
      lvl.gates.push({ id: id++, z: z - 5, x: r(-3, 3), w: 3.5, op: 'x', v: 3, move: 0 });
      z -= 4;
    }
    row++;
    z -= tw === 'maze' ? r(9.5, 11) : r(11, 15);
  }
  // ── bonus crates stacked along one side (as columns of blocks), occasionally a big purple stack ──
  const sides = n % 2 ? [-1, 1] : [1, -1];
  sides.forEach((side, k) => {
    if (k === 1 && n < 3 && tw !== 'crates') return;
    const big = k === 1 || (n > 4 && rnd() < 0.3) || tw === 'crates';
    const count = Math.round(r(8, 14)) + (tw === 'crates' ? 6 : 0);
    const z0 = r(-12, -22);
    for (let i = 0; i < count; i++) {
      lvl.crates.push({ id: id++, x: side * (HALF - 0.9), z: z0 - i * 1.6, w: 1.5, d: 1.4, hp: big ? Math.round(6 + n * 0.8) : 1, value: big ? Math.round(12 + n * 2) : 3, big });
    }
  });
  // ── HP barriers across part of the lane ──
  if (n >= 2) {
    const nb = tw === 'walls' ? 3 : n >= 8 ? 2 : 1;
    for (let k = 0; k < nb; k++) {
      const bz = -L * (nb === 3 ? 0.3 + k * 0.2 : 0.45 + k * 0.22) + r(-3, 3);
      const left = rnd() < 0.5;
      lvl.barriers.push({ id: id++, z: bz, x: left ? -HALF / 2 - 0.3 : HALF / 2 + 0.3, w: HALF - 0.6, hp: Math.round(40 + n * 22 + d * 400), reward: rnd() < 0.5 || tw === 'walls' ? { op: 'x', v: 2 } : null });
    }
  }
  // ── hazards: spinning bars and sweeping saws ──
  if (n >= 3 || (tw === 'blades' && n >= 2)) {
    const nh = Math.min(3, 1 + Math.floor(n / 6)) + (tw === 'blades' && !bossLevel ? 1 : 0);
    for (let k = 0; k < nh; k++) {
      const hz = r(-16, -L + 18);
      if (lvl.gates.some((g) => Math.abs(g.z - hz) < 3) || lvl.barriers.some((b) => Math.abs(b.z - hz) < 3)) continue;
      if (rnd() < 0.5) lvl.hazards.push({ id: id++, type: 'spinner', x: r(-2.5, 2.5), z: hz, len: r(3.2, 4.4), speed: r(1.4, 2.4) * (rnd() < 0.5 ? -1 : 1) });
      else lvl.hazards.push({ id: id++, type: 'saw', x: 0, z: hz, amp: HALF - 1.5, speed: r(0.8, 1.5), r: 0.9, phase: r(0, 6) });
    }
  }
  // ── power-up orbs, nudged clear of gates, barriers and hazards (drawn after the rest so older layouts stay the same) ──
  const kinds = n >= 3 ? ['frenzy', 'freeze', 'bomb'] : ['frenzy', 'freeze'];
  const np = Math.min(3, 1 + Math.floor(n / 4)) * (mods.has('orbs') ? 2 : 1) * (tw === 'orbs' ? 2 : 1);
  const busy = (z) => [...lvl.gates, ...lvl.barriers, ...lvl.hazards].some((o) => Math.abs(o.z - z) < 2.5);
  for (let k = 0; k < np; k++) {
    let pz = -10 - ((L - 30) * (k + rnd() * 0.6)) / np;
    for (let t = 0; t < 3 && busy(pz); t++) pz -= 4;
    const kind = n === 1 ? 'frenzy' : pick(kinds);
    const x = r(-3.5, 3.5);
    if (!busy(pz) && pz > -L + 14) lvl.pickups.push({ id: id++, kind, x, z: pz });
  }
  // ── short trails of gold coins for the crowd to scoop up, each in a free gap between obstacles ──
  const nc = (2 + Math.min(3, Math.floor(n / 5))) * (tw === 'gold' ? 2 : 1);
  if (tw === 'gold') lvl.coinValue += 2;
  let placed = 0;
  // five-coin trails first; on a crowded lane, shorter three-coin ones fill the smaller gaps
  for (const len of [5, 3]) {
    const trail = (cz) => Array.from({ length: len }, (_, i) => cz - i * 1.05);
    const spots = [];
    for (let cz = -10; cz > -L + 19; cz -= 0.5) if (!trail(cz).some(busy) && !lvl.coins.some((c) => Math.abs(c.z - cz) < 2 + len)) spots.push(cz);
    for (; placed < nc && spots.length; placed++) {
      const cz = spots[Math.floor(rnd() * spots.length)];
      const cx = r(-3.8, 3.8); const wave = rnd() < 0.5;
      trail(cz).forEach((z, i) => lvl.coins.push({ x: clamp(cx + (wave ? Math.sin(i * 0.9) * 1.4 : 0), -HALF + 1, HALF - 1), z }));
      for (let i = spots.length - 1; i >= 0; i--) if (Math.abs(spots[i] - cz) < 2 + len) spots.splice(i, 1); // trails don't overlap
    }
  }
  // ── difficulty budget ──
  // Estimate how many units a typical player pushes up this lane per second (their fire rate at this
  // stage × the multiplier the gate layout offers), then give the horde a share of that and size the
  // fortress so a level lasts roughly 35-60 s. Players with more upgrades or better aim win faster.
  const rows = new Map();
  lvl.gates.forEach((g) => rows.set(g.z, [...(rows.get(g.z) || []), g]));
  let mult = 1;
  rows.forEach((gs) => { mult *= Math.max(...gs.map((g) => (g.op === 'x' ? g.v : g.op === '+' ? 1 + g.v / 40 : 1))); });
  lvl.mult = mult;
  const rate = Math.min(13, 5 + 0.36 * n);
  const P = rate * Math.pow(clamp(mult, 3, 50), 0.6);
  const k = 0.28 + 0.1 * d; // the horde's share of the player's push
  const E = k * P;
  const W = lvl.waves;
  // tougher horde types count for more, so the horde gets smaller as it gets meaner
  const toll = mixCost(lvl.mix);
  W.flow = (E * 0.5) / toll;
  W.count = Math.round((E * 0.5 * W.interval) / toll);
  W.growth = 1.02;
  W.cap = W.count * 2;
  W.fightBack = 0.35;
  const T = 34 + n;
  lvl.baseHp = Math.round(((tw === 'rush' ? 0.75 : 1) * ((1 - k) * P / (1 + W.fightBack)) * T) / 5) * 5;
  if (lvl.boss) lvl.boss.hp = Math.round(P * (bossLevel ? 3.5 : 2.4));
  if (lvl.brutes) lvl.brutes.hp = Math.round(P * 0.85);
  if (tw === 'rush') { W.flow *= 1.3; W.count = Math.round(W.count * 1.3); W.cap = W.count * 2; }
  // daily challenge modifiers that change the layout or the horde
  if (mods.has('rich')) lvl.gates.forEach((g) => { if (g.op === 'x') g.v += 1; });
  if (mods.has('swarm')) { W.flow *= 1.6; W.count = Math.round(W.count * 1.6); W.cap = W.count * 2; }
  return lvl;
}
