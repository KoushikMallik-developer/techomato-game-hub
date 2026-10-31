// Horde Surge daily missions: three small goals a day, picked from a pool by the date, each paying coins.
import { mulberry32 } from './data.js';

export const MISSIONS = [
  { id: 'kills', text: (g) => `Crush ${g.toLocaleString()} enemies`, goals: [800, 1500, 2500], reward: 250 },
  { id: 'wins', text: (g) => `Win ${g} levels`, goals: [2, 3, 5], reward: 300 },
  { id: 'powers', text: (g) => `Use super powers ${g} times`, goals: [8, 15, 25], reward: 200 },
  { id: 'crates', text: (g) => `Break ${g} bonus crates`, goals: [15, 30, 50], reward: 200 },
  { id: 'orbs', text: (g) => `Grab ${g} power-up orbs`, goals: [3, 6, 10], reward: 220 },
  { id: 'boss', text: (g) => (g === 1 ? 'Defeat a boss' : `Defeat ${g} bosses`), goals: [1, 2], reward: 400 },
  { id: 'combo', text: (g) => `Reach a ×${g} combo`, goals: [100, 200, 400], reward: 250, best: true },
  { id: 'coins', text: (g) => `Collect ${g} coins from the lane`, goals: [20, 40, 70], reward: 200 },
  { id: 'chests', text: (g) => `Open ${g} treasure chests`, goals: [2, 3, 5], reward: 250 },
];

export function dailyMissions(day) {
  let h = 7;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const rnd = mulberry32(h);
  const pool = [...MISSIONS];
  const out = [];
  while (out.length < 3) {
    const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const k = Math.floor(rnd() * m.goals.length);
    out.push({ id: m.id, goal: m.goals[k], prog: 0, claimed: false, reward: Math.round(m.reward * (1 + k * 0.5)) });
  }
  return out;
}

export const missionText = (m) => MISSIONS.find((x) => x.id === m.id).text(m.goal);
export const isBest = (id) => !!MISSIONS.find((x) => x.id === id).best;
