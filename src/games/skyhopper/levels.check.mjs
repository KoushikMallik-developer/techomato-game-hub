// node src/games/skyhopper/levels.check.mjs: every level must start on ground, have only jumpable gaps, and end in stairs + a floor.
import assert from 'node:assert/strict';
import { makeLevel, solidAt, GROUND, H, ARENA } from './levels.js';
import { normalizeSave, starsFor, totalStars, MAX_LEVEL } from './save.js';

for (let n = 1; n <= 40; n++) {
  const lv = makeLevel(n);
  assert.deepEqual(makeLevel(n).T, lv.T, `level ${n} is deterministic`);
  for (let x = 0; x < 10; x++) assert.equal(lv.T[x * H], GROUND, `level ${n} starts on ground`);
  let run = 0; let gaps = 0;
  for (let x = 0; x < lv.W; x++) {
    if (lv.T[x * H] === GROUND) { if (run > 0) { assert.ok(run <= 4, `level ${n}: gap of ${run} at ${x}`); gaps++; } run = 0; } else run++;
  }
  assert.equal(run, 0, `level ${n} ends on ground`);
  for (let x = lv.len - 14; x < lv.W; x++) assert.equal(lv.T[x * H], GROUND, `level ${n} has a solid run to the flag`);
  assert.ok(solidAt(lv, lv.len - 3, 2) && !solidAt(lv, lv.flagX, 2), 'stairs end before the flag');
  assert.ok(lv.coins.length >= 20, `level ${n} has coins`);
  assert.ok(lv.foes.length >= 3, `level ${n} has enemies`);
  assert.ok(gaps >= 1 || n === 1, `level ${n} has pits`);
  for (const sp of lv.springs) assert.equal(lv.T[Math.floor(sp.x) * H], GROUND, `level ${n}: spring on ground`);
  for (const m of lv.movers) assert.ok(m.range > 0 && lv.T[Math.floor(m.x0 - m.range - 1.2) * H] === GROUND, `level ${n}: mover starts at a ledge`);
  assert.equal(!!lv.boss, n % 4 === 0, `level ${n} boss every 4th`);
  if (lv.boss) {
    for (let x = lv.len - ARENA; x < lv.len - 8; x++) { assert.equal(lv.T[x * H], GROUND, `level ${n}: flat arena`); assert.equal(lv.T[x * H + 2], 0, `level ${n}: clear arena`); }
    assert.ok(lv.foes.every((f) => f.x < lv.len - ARENA), `level ${n}: no foes in the arena`);
    assert.ok(lv.boss.max < lv.len - 9.5 && lv.boss.min < lv.boss.x, `level ${n}: the boss gate (len - 9.5) is past the arena`);
  }
}
// saves: tampered or broken values are forced into range
const bad = normalizeSave({ level: 1e9, hi: '<img onerror=x>', stars: { 1: 99, x: 3, 5000: 3, 2: -4 }, skin: 42, touch: 9, sfx: 'no', stats: { coins: -5 } });
assert.equal(bad.level, MAX_LEVEL); assert.equal(bad.hi, 0); assert.deepEqual(bad.stars, { 1: 3 }); assert.equal(bad.skin, 'pip'); assert.equal(bad.touch, 2);
assert.equal(bad.stats.coins, 0); assert.equal(totalStars(bad), 3);
assert.equal(normalizeSave(null).level, 1); assert.equal(normalizeSave(null).touch, 1); assert.equal(normalizeSave('junk').level, 1);
assert.deepEqual(normalizeSave(normalizeSave({ level: 7, stars: { 3: 2 } })).stars, { 3: 2 });
// stars: clear = 1, 70% coins = +1, no hits = +1
assert.equal(starsFor(0, 100, true), 1); assert.equal(starsFor(70, 100, true), 2); assert.equal(starsFor(70, 100, false), 3); assert.equal(starsFor(69, 100, false), 2);
console.log('skyhopper levels ok');
