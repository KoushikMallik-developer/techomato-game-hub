// Self-check for the level generator: node src/games/hordesurge/levels.check.mjs
import assert from 'node:assert/strict';
import { makeLevel } from './levels.js';
import { POWERUPS, LANE_W, THEMES, POWERS, LOADOUT, defaultSave, giftPower, inLoadout, toggleLoadout, needsLoadoutScreen, SKINS } from './data.js';
import { BOSSES, ENEMY_TYPES, pickType } from './enemies.js';
import { MODS, dailyChallenge, makeDaily, makeEndless, endlessWave } from './modes.js';
import { dailyMissions, missionText, MISSIONS } from './missions.js';
import { WEAPONS, weaponPower } from './weapons.js';

let total = 0;
for (let n = 1; n <= 60; n++) {
  const lvl = makeLevel(n);
  assert.deepEqual(makeLevel(n), lvl, `level ${n} is deterministic`);
  for (const p of lvl.pickups) {
    total++;
    assert.ok(POWERUPS[p.kind], `level ${n}: known power-up ${p.kind}`);
    assert.ok(Math.abs(p.x) < LANE_W / 2 - 1, `level ${n}: pickup inside the lane`);
    assert.ok(p.z < 0 && p.z > -lvl.L + 14, `level ${n}: pickup between cannon and fortress`);
    for (const o of [...lvl.gates, ...lvl.barriers, ...lvl.hazards]) assert.ok(Math.abs(o.z - p.z) >= 2.5, `level ${n}: pickup clear of z=${o.z}`);
    if (n < 3) assert.notEqual(p.kind, 'bomb', 'no bombs before level 3');
  }
}
assert.ok(makeLevel(1).pickups.some((p) => p.kind === 'frenzy'), 'level 1 teaches frenzy');

// every world's boss level gets that world's boss; dusk falls on boss levels
for (let w = 0; w < 5; w++) {
  const lvl = makeLevel(w * 5 + 5);
  assert.equal(lvl.boss.name, BOSSES[THEMES[w].id].name);
  assert.ok(lvl.boss.attacks.length && lvl.boss.hp > 0);
  if (!THEMES[w].neon) assert.ok(lvl.theme.sunElev < 0.6 && lvl.theme.sky[1] !== THEMES[w].sky[1], 'boss level is at dusk');
}
// enemy types unlock on their level, with an intro card there
for (const [i, t] of ENEMY_TYPES.entries()) {
  if (!i) continue;
  assert.equal(makeLevel(t.from).intro.id, t.id);
  assert.ok(!makeLevel(t.from - 1).mix.some(([k]) => k === i), `${t.id} not before level ${t.from}`);
  assert.ok(makeLevel(t.from + 5).mix.some(([k]) => k === i));
}
for (let k = 0; k < 1000; k++) assert.ok(pickType(makeLevel(20).mix, k / 1000) < ENEMY_TYPES.length);

// daily challenge: same for everyone on a day, two different compatible modifiers, modifiers applied
const day = dailyChallenge(new Date(2026, 9, 31));
assert.deepEqual(day, dailyChallenge(new Date(2026, 9, 31, 23, 59)));
assert.notDeepEqual(day.mods, dailyChallenge(new Date(2026, 10, 1)).mods.concat('x'));
for (let d = 0; d < 365; d++) {
  const c = dailyChallenge(new Date(2026, 0, 1 + d));
  assert.equal(new Set(c.mods).size, 2);
  assert.ok(c.mods.every((m) => MODS[m]));
  assert.ok(!(c.mods.includes('glass') && c.mods.includes('nohero')));
}
const plain = makeLevel(10);
const rich = makeLevel(10, { mods: ['rich', 'orbs', 'swarm'] });
assert.equal(rich.gates.filter((g) => g.op === 'x').reduce((a, g) => a + g.v, 0), plain.gates.filter((g) => g.op === 'x').reduce((a, g) => a + g.v, 0) + plain.gates.filter((g) => g.op === 'x').length);
assert.ok(rich.pickups.length >= plain.pickups.length && rich.waves.flow > plain.waves.flow);
assert.equal(makeDaily(day).mode, 'daily');

// endless: waves get harder, a world boss every 5th wave
const run = makeEndless(3);
assert.equal(run.mode, 'endless');
assert.equal(run.boss, null);
assert.ok(endlessWave(10, run.themeIndex).baseHp > endlessWave(2, run.themeIndex).baseHp);
assert.equal(endlessWave(5, run.themeIndex).boss.name, BOSSES[THEMES[run.themeIndex].id].name);
assert.equal(endlessWave(6, run.themeIndex).boss, null);
// lane coins: inside the lane and clear of gates, barriers and hazards
let coins = 0;
for (let n = 1; n <= 40; n++) {
  const lvl = makeLevel(n);
  assert.ok(lvl.coins.length >= 8 && lvl.coinValue >= 2, `level ${n}: ${lvl.coins.length} coins`);
  for (const c of lvl.coins) {
    coins++;
    assert.ok(Math.abs(c.x) <= LANE_W / 2 - 1 && c.z < -8 && c.z > -lvl.L + 14, `level ${n}: coin in the lane`);
    for (const o of [...lvl.gates, ...lvl.barriers, ...lvl.hazards]) assert.ok(Math.abs(o.z - c.z) >= 2.5, `level ${n}: coin clear of z=${o.z}`);
  }
}
// daily missions: three different ones, the same all day, with readable text
const ms = dailyMissions('Sat Oct 31 2026');
assert.equal(new Set(ms.map((m) => m.id)).size, 3);
assert.deepEqual(ms, dailyMissions('Sat Oct 31 2026'));
assert.ok(ms.every((m) => MISSIONS.some((x) => x.id === m.id) && m.reward > 0 && !missionText(m).includes('undefined')));
// arsenal: each weapon is stronger, pricier and unlocks later than the one before it
WEAPONS.forEach((w, i) => { if (!i) return; const p = WEAPONS[i - 1]; assert.ok(weaponPower(w) > weaponPower(p) && w.cost > p.cost && w.from > p.from && w.armor >= p.armor, `weapon ${w.id}`); });
// every level differs from its neighbours, and a world's five levels all play differently
for (let n = 1; n <= 60; n++) {
  assert.notEqual(makeLevel(n).twist.id, makeLevel(n + 1).twist.id, `level ${n} vs ${n + 1}`);
  if (n % 5 === 1) assert.equal(new Set([0, 1, 2, 3, 4].map((k) => makeLevel(n + k).twist.id)).size, 5, `world from level ${n}`);
}
assert.equal(makeLevel(1).twist.id, 'classic');
// super powers: 20-25 of them, four to start with, gifts hand out the rest one at a time
assert.ok(POWERS.length >= 20 && POWERS.length <= 25 && new Set(POWERS.map((p) => p.id)).size === POWERS.length);
const sv = defaultSave();
assert.equal(sv.powers.length, LOADOUT);
assert.deepEqual(sv.loadout, sv.powers);
for (let k = 0; k < POWERS.length - LOADOUT; k++) { const g = giftPower(sv, k / 30); assert.ok(g && sv.powers.filter((id) => id === g).length === 1); }
assert.equal(giftPower(sv), null);
// the loadout: at most four, only owned powers, toggling in and out
const lo = { powers: ['meteor', 'rally', 'aegis', 'storm', 'nuke', 'gale'], loadout: ['meteor', 'rally', 'bogus'] };
assert.deepEqual(inLoadout(lo), ['meteor', 'rally'], 'unowned ids are dropped');
toggleLoadout(lo, 'aegis'); toggleLoadout(lo, 'storm'); toggleLoadout(lo, 'nuke');
assert.deepEqual(lo.loadout, ['meteor', 'rally', 'aegis', 'storm'], 'a fifth power is refused');
toggleLoadout(lo, 'meteor'); toggleLoadout(lo, 'nuke');
assert.deepEqual(lo.loadout, ['rally', 'aegis', 'storm', 'nuke'], 'toggling out then another in');
toggleLoadout(lo, 'siege');
assert.equal(lo.loadout.length, 4, 'an unowned power is refused');
assert.ok(!needsLoadoutScreen({ powers: ['a', 'b', 'c', 'd'] }) && needsLoadoutScreen(lo), 'the screen only shows when there is a choice');
assert.ok(SKINS.every((k) => k.model && k.cost >= 0) && SKINS[0].cost === 0, 'every skin has a model, the first is free');
assert.equal(sv.loadout.length, LOADOUT);
console.log(`ok: 60 levels, ${total} pickups, ${coins} lane coins, bosses, enemy unlocks, daily, endless, missions, twists, powers`);
