// Horde Surge level generator: every level number gives the same layout (seeded), getting harder as you go.
// A level is a lane from the cannon (z = +5) to the enemy fortress (z = -L) with gates, bonus crates,
// barriers and hazards placed along it, plus the enemy's wave plan and an optional boss.
import { mulberry32, LANE_W, THEMES, clamp } from './data.js';

const HALF = LANE_W / 2;

export function makeLevel(n) {
  const rnd = mulberry32(n * 7919 + 13);
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const L = Math.round(62 + Math.min(n, 24) * 1.1);
  const theme = THEMES[Math.floor((n - 1) / 5) % THEMES.length];
  const bossLevel = n % 5 === 0;
  const miniBoss = !bossLevel && n >= 3 && n % 5 === 3;
  const d = Math.min(1, (n - 1) / 30); // overall difficulty 0..1
  const lvl = {
    n, L, theme, bossLevel,
    baseHp: Math.round(((bossLevel ? 1.25 : 1) * (300 + n * 70 + d * 1400)) / 5) * 5,
    waves: { first: 2.5, interval: clamp(5.5 - n * 0.12, 2.8, 5.5), count: Math.round(18 + n * 4), growth: 1.05 + d * 0.06, cap: Math.round(80 + n * 14), flow: 5 + n * 0.9, reinforce: Math.round(8 + n * 2.5), fightBack: 0.45 + d * 0.4 },
    brutes: n >= 2 ? { first: bossLevel ? 25 : 14, every: clamp(24 - n * 0.6, 12, 24), hp: Math.round(14 + n * 4), hit: 4 } : null,
    boss: bossLevel ? { hp: Math.round(160 + n * 22), speed: 1.3 + d * 0.5, at: 8, scale: 2.6, name: 'Gronk the Crusher' } : miniBoss ? { hp: Math.round(70 + n * 10), speed: 1.6, at: 14, scale: 1.8, name: 'Brute' } : null,
    gates: [], crates: [], barriers: [], hazards: [],
  };
  let id = 1;
  // ── gate rows every ~14 m, starting a little in front of the cannon ──
  let z = -7;
  const end = -L + 16;
  let row = 0;
  while (z > end) {
    const kind = row === 0 ? 'pair' : pick(['pair', 'pair', 'single', 'wide', n > 3 ? 'moving' : 'pair', n > 6 ? 'trap' : 'single']);
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
    z -= r(11, 15);
  }
  // ── bonus crates stacked along one side (as columns of blocks), occasionally a big purple stack ──
  const sides = n % 2 ? [-1, 1] : [1, -1];
  sides.forEach((side, k) => {
    if (k === 1 && n < 3) return;
    const big = k === 1 || (n > 4 && rnd() < 0.3);
    const count = Math.round(r(8, 14));
    const z0 = r(-12, -22);
    for (let i = 0; i < count; i++) {
      lvl.crates.push({ id: id++, x: side * (HALF - 0.9), z: z0 - i * 1.6, w: 1.5, d: 1.4, hp: big ? Math.round(6 + n * 0.8) : 1, value: big ? Math.round(12 + n * 2) : 3, big });
    }
  });
  // ── HP barriers across part of the lane ──
  if (n >= 2) {
    const nb = n >= 8 ? 2 : 1;
    for (let k = 0; k < nb; k++) {
      const bz = -L * (0.45 + k * 0.22) + r(-3, 3);
      const left = rnd() < 0.5;
      lvl.barriers.push({ id: id++, z: bz, x: left ? -HALF / 2 - 0.3 : HALF / 2 + 0.3, w: HALF - 0.6, hp: Math.round(40 + n * 22 + d * 400), reward: rnd() < 0.5 ? { op: 'x', v: 2 } : null });
    }
  }
  // ── hazards: spinning bars and sweeping saws ──
  if (n >= 3) {
    const nh = Math.min(3, 1 + Math.floor(n / 6));
    for (let k = 0; k < nh; k++) {
      const hz = r(-16, -L + 18);
      if (lvl.gates.some((g) => Math.abs(g.z - hz) < 3) || lvl.barriers.some((b) => Math.abs(b.z - hz) < 3)) continue;
      if (rnd() < 0.5) lvl.hazards.push({ id: id++, type: 'spinner', x: r(-2.5, 2.5), z: hz, len: r(3.2, 4.4), speed: r(1.4, 2.4) * (rnd() < 0.5 ? -1 : 1) });
      else lvl.hazards.push({ id: id++, type: 'saw', x: 0, z: hz, amp: HALF - 1.5, speed: r(0.8, 1.5), r: 0.9, phase: r(0, 6) });
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
  const k = 0.5 + 0.25 * d; // the horde's share of the player's push
  const E = k * P;
  const W = lvl.waves;
  W.flow = E * 0.5;
  W.count = Math.round(E * 0.5 * W.interval);
  W.growth = 1.02;
  W.cap = W.count * 2;
  W.fightBack = 0.35;
  const T = 42 + n * 1.2;
  lvl.baseHp = Math.round(((bossLevel ? 1.2 : 1) * ((1 - k) * P / (1 + W.fightBack)) * T) / 5) * 5;
  if (lvl.boss) lvl.boss.hp = Math.round(P * (bossLevel ? 7 : 3.5));
  if (lvl.brutes) lvl.brutes.hp = Math.round(P * 1.1);
  return lvl;
}
