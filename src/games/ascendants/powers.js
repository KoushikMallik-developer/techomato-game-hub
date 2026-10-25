// Ascendants powers: what happens when a ki technique is cast, and the things techniques leave in the
// world (ki blasts, homing discs, gravity fields, charged beams that can clash, giant gathered spheres,
// comets, fighting copies). Runs on the host (or offline); clients get events and draw them.
// Damage scales with the power's level here, and with the caster's form / surge inside Match.damage.
import { POWER, lvDmg, clamp } from './data.js';
import { dirOf, eyeY } from './sim.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const r2 = (v) => Math.round(v * 100) / 100;
const R2 = (a) => a.map(r2);

// beam push in a clash, by power
const PUSH = { wave: 1, radiance: 1.75 };
const BEAM_SPEED = 95;

// where a caster's aim lands: the target point they sent, or a ray along their view
export function aimPoint(m, pl, req) {
  if (req && req.aim) return req.aim;
  if (pl.lastAim) return pl.lastAim;
  const o = [pl.p[0], pl.p[1] + eyeY(pl), pl.p[2]];
  const d = dirOf(pl.yaw, pl.pitch);
  const h = m.island.ray(o, d, 140);
  return h ? h.p : add(o, d, 140);
}
// the point between the hands, a little in front of the chest
export function handsOf(pl, dir) {
  const f = dir || dirOf(pl.yaw, pl.pitch);
  return [pl.p[0] + f[0] * 0.7, pl.p[1] + 1.25 + f[1] * 0.5, pl.p[2] + f[2] * 0.7];
}
// one of the two hands (side -1 left, +1 right)
function handSide(pl, dir, s) {
  const h = handsOf(pl, dir);
  return [h[0] + Math.cos(pl.yaw) * 0.32 * s, h[1], h[2] - Math.sin(pl.yaw) * 0.32 * s];
}
// who a targeted technique goes for: the locked target if valid, else the enemy nearest the aim line
export function pickTarget(m, pl, req, range, slack = 5) {
  if (req && req.lock) {
    const t = m.players.get(req.lock);
    if (t && t.alive && !m.sameTeam(pl, t) && Math.hypot(t.p[0] - pl.p[0], t.p[1] - pl.p[1], t.p[2] - pl.p[2]) < range * 1.2) return t;
  }
  const eye = [pl.p[0], pl.p[1] + eyeY(pl), pl.p[2]];
  const aim = aimPoint(m, pl, req);
  const d = norm(sub(aim, eye));
  const t = m.lineTarget(pl, eye, d, range, slack);
  if (t) return t;
  // anyone in a cone in front
  let best = null; let bd = range;
  for (const e of m.players.values()) {
    if (!e.alive || e === pl || e.mode === 'ship' || m.sameTeam(pl, e)) continue;
    const to = sub([e.p[0], e.p[1] + 1, e.p[2]], eye); const L = len(to);
    if (L < bd && dot(to, d) / L > 0.75) { bd = L; best = e; }
  }
  return best;
}

// cast power `id` (level lv) for player pl. Returns false if it can't be cast now.
export function cast(m, pl, id, lv, req = {}) {
  const P = POWER[id];
  if (!P) return false;
  const k = lvDmg(lv);
  const eye = [pl.p[0], pl.p[1] + eyeY(pl), pl.p[2]];
  const target = aimPoint(m, pl, req);
  const dir = norm(sub(target, eye));
  const hand = handsOf(pl, dir);
  const ev = { e: 'cast', id: pl.id, power: id, o: R2(hand), t: R2(target) };
  const stance = (t) => { pl.stance = Math.max(pl.stance || 0, t); ev.stance = r2(t); };
  switch (P.kind) {
    // ── normal techniques ──
    case 'volley': {
      // alternating hands, each blast aimed at where they're looking now
      m.emit(ev);
      for (let n = 0; n < P.count; n++) {
        m.later(n * 0.09, () => {
          if (!pl.alive || pl.downed) return;
          const tgt = aimPoint(m, pl, null);
          const o = handSide(pl, null, n % 2 ? 1 : -1);
          const jit = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.6];
          const d = norm(sub(add(tgt, jit), o));
          m.spawn({ kind: 'bolt', power: id, owner: pl.id, p: o, v: d.map((c) => c * P.speed), r: 0.35, dmg: P.dmg * k, life: 1.8, small: true });
        });
      }
      break;
    }
    case 'chargebeam': {
      // cup the hands, gather, then the beam fires and grows from the hands
      stance(P.charge + P.dur);
      ev.charge = P.charge;
      m.emit(ev);
      m.later(P.charge, () => { if (pl.alive && !pl.downed) startBeam(m, pl, id, k, P); });
      break;
    }
    case 'ray': {
      const t = m.lineTarget(pl, eye, dir, P.r, 0.9);
      let end = target;
      if (t && m.island.los(eye, [t.p[0], t.p[1] + 1.2, t.p[2]])) { m.damage(t, P.dmg * k, pl, id); end = [t.p[0], t.p[1] + 1.2, t.p[2]]; }
      else { const h = m.island.ray(hand, dir, P.r); end = h ? h.p : add(hand, dir, P.r); }
      ev.t = R2(end);
      m.emit(ev);
      break;
    }
    case 'disc': {
      const tgt = pickTarget(m, pl, req, 70, 8);
      m.spawn({ kind: 'disc', power: id, owner: pl.id, p: hand, v: dir.map((c) => c * P.speed), r: P.r, dmg: P.dmg * k, life: 3.4, target: tgt ? tgt.id : null, hit: [] }, ev);
      break;
    }
    case 'bolt': {
      // ki bomb / star breaker: a heavy orb that bursts
      m.spawn({ kind: 'bolt', power: id, owner: pl.id, p: hand, v: dir.map((c) => c * P.speed), r: P.r, dmg: P.dmg * k, life: 3, blast: P.blast, knock: P.knock || 0, big: !!P.ult }, ev);
      if (P.ult) stance(0.5);
      break;
    }
    case 'scatter': {
      // throw blasts high into the sky; they rain down around the target
      m.emit(ev);
      for (let n = 0; n < P.count; n++) {
        m.later(n * 0.06, () => {
          if (!pl.alive) return;
          const a = Math.random() * Math.PI * 2; const rr = Math.sqrt(Math.random()) * 4.5;
          const q = [target[0] + Math.cos(a) * rr, 0, target[2] + Math.sin(a) * rr];
          q[1] = m.island.floor(q[0], q[2], target[1] + 6);
          const o = handSide(pl, dir, n % 2 ? 1 : -1);
          m.spawn({ kind: 'bolt', power: id, owner: pl.id, p: o, v: lob(o, q, 30, 2.6), r: 0.4, dmg: P.dmg * k, life: 4, grav: 18, blast: 2.6, knock: 4, small: true });
        });
      }
      break;
    }
    case 'nova': {
      m.emit(ev);
      m.explode(pl, [pl.p[0], pl.p[1] + 1, pl.p[2]], P.r, P.dmg * k, P.knock, id, { self: true });
      break;
    }
    case 'cone': {
      m.emit(ev);
      m.enemiesNear(pl, pl.p, P.r, true).forEach((e) => {
        const to = norm(sub(e.p, pl.p));
        if (to[0] * dir[0] + to[1] * dir[1] * 0.5 + to[2] * dir[2] > 0.4) { m.damage(e, P.dmg * k, pl, id); m.launch(e, pl.p, P.knock, 7); }
      });
      // a shout rips through the trees in front too
      m.fellTrees(add(pl.p, dir, P.r * 0.6), P.r * 0.45, add(pl.p, dir, -2));
      break;
    }
    case 'flash': {
      m.emit(ev);
      for (const e of m.players.values()) {
        if (!e.alive || e === pl || e.mode === 'ship' || m.sameTeam(pl, e)) continue;
        const to = sub(pl.p, e.p); const L = len(to);
        if (L > P.r) continue;
        const look = dirOf(e.yaw, e.pitch);
        if (dot(look, to) / (L || 1) > 0.15 || L < 4) { e.blind = P.dur; m.buff(e, 'blind', P.dur); }
      }
      break;
    }
    case 'rush': {
      const tgt = pickTarget(m, pl, req, P.r, 6);
      if (!tgt) {
        // nobody to hit: a short burst forward
        pl.force = { v: dir.map((c) => c * 45), t: 0.3 };
        m.emit(ev);
        break;
      }
      const to = sub(tgt.p, pl.p); const d = len(to);
      const t = clamp((d - 1.6) / 60, 0.05, 0.6);
      pl.force = { v: norm(to).map((c) => c * ((d - 1.6) / t)), t };
      ev.tgt = tgt.id;
      m.emit(ev);
      m.later(t + 0.03, () => pummel(m, pl, tgt, P, k, id));
      break;
    }
    case 'instant': {
      const tgt = pickTarget(m, pl, req, P.r, 6);
      if (!tgt) {
        // no target: a flash step forward
        const h = m.island.ray(eye, dir, 16);
        const np = add(pl.p, dir, h ? Math.max(0, h.t - 1.2) : 16);
        np[1] = Math.max(np[1], m.island.floor(np[0], np[2], np[1] + 1));
        m.teleport(pl, np, pl.yaw, id);
        break;
      }
      m.behind(pl, tgt, id);
      break;
    }
    case 'buff': {
      if (id === 'afterimage') { pl.dodges = 3; m.buff(pl, 'afterimage', P.dur); }
      if (id === 'barrier') { pl.absorb = Math.max(pl.absorb || 0, P.absorb * k); m.buff(pl, 'barrier', P.dur); }
      if (id === 'heal') { pl.regen = { t: P.dur, rate: (P.heal * k) / P.dur }; m.buff(pl, 'heal', P.dur); }
      m.emit(ev);
      break;
    }
    case 'clone': {
      m.emit(ev);
      for (let n = 0; n < P.count; n++) {
        const a = pl.yaw + (n ? -1 : 1) * 1.2;
        m.spawn({ kind: 'clone', power: id, owner: pl.id, slot: n, p: [pl.p[0] - Math.sin(a) * 2.5, pl.p[1], pl.p[2] - Math.cos(a) * 2.5], v: [0, 0, 0], life: P.dur, hp: 45, hero: pl.hero, skin: pl.skin, yaw: pl.yaw, fireT: 0.5 + n * 0.3, dmg: P.dmg * k });
      }
      break;
    }
    case 'lash': {
      const tgt = pickTarget(m, pl, req, P.r, 1.8);
      if (!tgt || !m.island.los(eye, [tgt.p[0], tgt.p[1] + 1.2, tgt.p[2]])) { ev.t = R2(add(hand, dir, P.r * 0.7)); m.emit(ev); break; }
      ev.tgt = tgt.id; ev.t = R2([tgt.p[0], tgt.p[1] + 1.1, tgt.p[2]]);
      m.emit(ev);
      m.damage(tgt, P.dmg * k, pl, id);
      const to = sub(pl.p, tgt.p); const d = len(to);
      m.pull(tgt, norm(to).map((c, i) => c * Math.min(32, d * 2.2) + (i === 1 ? 5 : 0)));
      tgt.root = Math.max(tgt.root || 0, 0.35);
      break;
    }
    case 'orb': {
      const v = lob(hand, target, P.speed, 1.2);
      m.spawn({ kind: 'orb', power: id, owner: pl.id, p: hand, v, r: 0.5, life: 3, grav: 14, k }, ev);
      break;
    }
    case 'line': {
      // stone spikes rip along the ground toward the aim
      const flat = norm([dir[0], 0, dir[2]]);
      const base = pl.mode === 'fly' ? [target[0] - flat[0] * P.r * 0.5, 0, target[2] - flat[2] * P.r * 0.5] : pl.p;
      const pts = [];
      for (let s = 2; s <= P.r; s += 1.6) {
        const x = base[0] + flat[0] * s; const z = base[2] + flat[2] * s;
        pts.push([r2(x), r2(m.island.floor(x, z, (pl.mode === 'fly' ? target[1] : pl.p[1]) + 3)), r2(z)]);
      }
      ev.pts = pts;
      m.emit(ev);
      const hit = new Set();
      pts.forEach((q, i) => m.later(i * 0.035, () => {
        m.enemiesNear(pl, q, 1.8).forEach((e) => { if (hit.has(e.id)) return; hit.add(e.id); m.damage(e, P.dmg * k, pl, id); e.root = Math.max(e.root || 0, P.root); m.buff(e, 'root', P.root); m.knock(e, q, 0, 7); });
      }));
      break;
    }
    // ── ultimates ──
    case 'megabeam': {
      stance(P.charge + P.dur);
      ev.charge = P.charge;
      m.emit(ev);
      m.later(P.charge, () => { if (pl.alive && !pl.downed) startBeam(m, pl, id, k, P); });
      break;
    }
    case 'bigsphere': {
      // hands raised: a sphere of gathered energy swells above, then it's hurled at the aim
      stance(P.gather + 0.5);
      ev.gather = P.gather;
      m.emit(ev);
      m.later(P.gather, () => {
        if (!pl.alive || pl.downed) return;
        const o = [pl.p[0], pl.p[1] + 6.5, pl.p[2]];
        const tg = aimPoint(m, pl, null);
        const d = norm(sub(tg, o));
        m.spawn({ kind: 'bolt', power: id, owner: pl.id, p: o, v: d.map((c) => c * P.speed), r: 3.4, dmg: P.dmg * k, life: 7, blast: P.r, knock: 26, big: true, huge: true });
      });
      break;
    }
    case 'surge': {
      pl.surge = P.dur;
      m.buff(pl, 'surge', P.dur);
      m.emit(ev);
      m.selfSync(pl);
      break;
    }
    case 'meteor': {
      m.emit(ev);
      for (let n = 0; n < P.count; n++) {
        const a = Math.random() * Math.PI * 2; const rr = Math.sqrt(Math.random()) * P.rad;
        const q = [target[0] + Math.cos(a) * rr, 0, target[2] + Math.sin(a) * rr];
        q[1] = m.island.floor(q[0], q[2], target[1] + 20);
        m.emit({ e: 'meteor', p: R2(q), delay: 0.6 + n * 0.28, power: id });
        m.later(0.6 + n * 0.28 + 0.9, () => m.explode(pl, q, P.r, P.dmg * k, 14, id));
      }
      break;
    }
    case 'freeze': {
      m.emit(ev);
      m.enemiesNear(pl, pl.p, P.r, true).forEach((e) => { e.frozen = P.dur; m.buff(e, 'frozen', P.dur); });
      break;
    }
    case 'barrage': {
      stance(P.dur);
      ev.dur = P.dur;
      m.emit(ev);
      for (let n = 0; n < P.count; n++) {
        m.later(n * (P.dur / P.count), () => {
          if (!pl.alive || pl.downed) return;
          const tg = aimPoint(m, pl, null);
          const o = handSide(pl, null, n % 2 ? 1 : -1);
          const jit = [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 4];
          const d = norm(sub(add(tg, jit), o));
          m.spawn({ kind: 'bolt', power: id, owner: pl.id, p: o, v: d.map((c) => c * 70), r: 0.45, dmg: P.dmg * k, life: 2.2, blast: 2.2, knock: 3, small: true });
        });
      }
      break;
    }
    case 'titanfist': {
      // become a streak of golden energy shaped like a fist
      const t = P.r / 62;
      pl.force = { v: dir.map((c) => c * 62), t, dash: { power: id, dmg: P.dmg * k, hit: [], knock: 34 } };
      m.buff(pl, 'fist', t + 0.2);
      m.emit(ev);
      break;
    }
    default: return false;
  }
  return true;
}

// rush follow-up: if we reached them, a flurry of blows that ends with a launching kick
function pummel(m, pl, tgt, P, k, id) {
  if (!pl.alive || !tgt.alive || Math.hypot(tgt.p[0] - pl.p[0], tgt.p[1] - pl.p[1], tgt.p[2] - pl.p[2]) > 4.5) return;
  pl.stance = Math.max(pl.stance || 0, P.hits * 0.1 + 0.25);
  tgt.held = Math.max(tgt.held || 0, P.hits * 0.1 + 0.15);
  m.buff(tgt, 'held', P.hits * 0.1 + 0.15);
  pl.yaw = Math.atan2(-(tgt.p[0] - pl.p[0]), -(tgt.p[2] - pl.p[2]));
  for (let n = 0; n <= P.hits; n++) {
    m.later(n * 0.1, () => {
      if (!pl.alive || !tgt.alive) return;
      const last = n === P.hits;
      m.emit({ e: 'melee', id: pl.id, n: last ? 4 : n % 4, hit: true, rush: true });
      m.damage(tgt, (last ? P.final : P.dmg) * k, pl, id);
      if (last) { tgt.held = 0; m.launch(tgt, pl.p, 34, 12); }
    });
  }
}

// a charged beam leaves the hands
function startBeam(m, pl, id, k, P) {
  const d = dirOf(pl.yaw, pl.pitch);
  const aim = aimPoint(m, pl, null);
  const o = handsOf(pl, d);
  const dir = norm(sub(aim, o));
  const b = { bid: m.nextId++, owner: pl.id, power: id, o, dir, len: 1, max: P.r, w: P.width, dps: (P.dmg * k) / P.dur, t: P.dur, push: PUSH[id] || 1, clash: null, sync: 0, scorch: 0 };
  m.beams.push(b);
  pl.stance = Math.max(pl.stance || 0, P.dur + 0.1);
  m.stat(pl, 'beams', 1);
  m.emit({ e: 'beam', bid: b.bid, id: pl.id, power: id, d: R2(dir), max: P.r, w: P.width, dur: P.dur });
}

// velocity to lob something from a to b; `arc` raises the throw
function lob(a, b, speed, arc = 1, g = 9.8) {
  const d = sub(b, a); const flat = Math.hypot(d[0], d[2]);
  const t = clamp((flat / speed) * arc, 0.35, 3);
  const gg = arc > 1.5 ? 18 : g;
  return [d[0] / t, (d[1] + 0.5 * gg * t * t) / t, d[2] / t];
}

// ── per-step updates of everything techniques leave behind ──
export function updatePowers(m, dt) {
  updateEnts(m, dt);
  updateZones(m, dt);
  updateBeams(m, dt);
  // dashes (spirit fist): hurt whoever the dasher passes through
  for (const pl of m.players.values()) {
    if (pl.force && pl.force.dash) {
      const D = pl.force.dash;
      m.enemiesNear(pl, pl.p, 3.4, true).forEach((e) => {
        if (D.hit.includes(e.id)) return;
        D.hit.push(e.id);
        m.damage(e, D.dmg, pl, D.power);
        m.launch(e, pl.p, D.knock || 12, 10);
      });
      m.fellTrees(pl.p, 4, null);
      if (pl.force.t <= 0.02 || pl.force.blocked) { if (pl.p[1] - m.island.floor(pl.p[0], pl.p[2], pl.p[1] + 1) < 3) m.explode(pl, pl.p, 7, 25, 12, D.power, { self: true }); pl.force.dash = null; }
    }
  }
}

function updateEnts(m, dt) {
  for (const ent of m.ents.values()) {
    ent.life -= dt;
    const owner = m.players.get(ent.owner);
    if (ent.kind === 'clone') {
      // fighting copies hover around their owner and fire at nearby enemies
      if (!owner || !owner.alive || ent.life <= 0 || ent.hp <= 0) { m.despawn(ent, true); continue; }
      const a = owner.yaw + (ent.slot ? -1 : 1) * 1.2;
      const want = [owner.p[0] - Math.sin(a) * 2.6, owner.p[1] + (owner.mode === 'fly' ? 0.4 : 0), owner.p[2] - Math.cos(a) * 2.6];
      ent.p = ent.p.map((c, i) => c + (want[i] - c) * Math.min(1, dt * 6));
      ent.fireT -= dt;
      if (ent.fireT <= 0) {
        ent.fireT = 0.7;
        const e = m.nearestEnemy(owner, ent.p, 38, []);
        if (e) {
          const o = [ent.p[0], ent.p[1] + 1.3, ent.p[2]];
          const d = norm(sub([e.p[0], e.p[1] + 1.1, e.p[2]], o));
          ent.yaw = Math.atan2(-d[0], -d[2]);
          m.spawn({ kind: 'bolt', power: 'volley', owner: ent.owner, p: o, v: d.map((c) => c * 70), r: 0.35, dmg: ent.dmg, life: 1.6, small: true });
        }
      }
      continue;
    }
    if (ent.kind === 'disc' && ent.target) {
      const tg = m.players.get(ent.target);
      if (tg && tg.alive) {
        const want = norm(sub([tg.p[0], tg.p[1] + 1.1, tg.p[2]], ent.p)).map((c) => c * POWER.disc.speed);
        ent.v = ent.v.map((c, i) => c + (want[i] - c) * Math.min(1, dt * 2.6));
      }
    }
    const prev = ent.p.slice();
    ent.v[1] -= (ent.grav || 0) * dt;
    ent.p = add(ent.p, ent.v, dt);
    const seg = sub(ent.p, prev); const sl = len(seg);
    // hit players along the segment
    const hitP = (ent.kind === 'bolt' || ent.kind === 'disc') ? m.sweepPlayers(ent.owner, prev, ent.p, (ent.r || 0.3) + 0.2, ent.hit) : null;
    const wh = sl > 0 ? m.island.ray(prev, seg.map((c) => c / sl), sl) : null;
    if (hitP && (!wh || hitP.t <= wh.t)) {
      const at = add(prev, seg, hitP.t / (sl || 1));
      if (ent.kind === 'orb') { m.burstOrb(ent, at); continue; }
      if (hitP.dodged) { /* went through an afterimage */ continue; }
      if (ent.kind === 'disc') {
        // cuts straight through
        ent.hit.push(hitP.pl.id);
        m.damage(hitP.pl, ent.dmg, owner, ent.power);
        m.emit({ e: 'boom', power: ent.power, p: R2(at), r: 1.2 });
        ent.target = null;
        continue;
      }
      if (ent.blast) m.explode(owner || { id: ent.owner }, at, ent.blast, ent.dmg, ent.knock, ent.power, { direct: hitP.pl, ent: ent.id, big: ent.big, huge: ent.huge });
      else {
        m.damage(hitP.pl, ent.dmg, owner, ent.power);
        if (ent.knock) m.knock(hitP.pl, prev, ent.knock, 5);
        m.emit({ e: 'boom', power: ent.power, p: R2(at), r: ent.small ? 0.8 : 1.6, ent: ent.id });
      }
      m.despawn(ent, false);
      continue;
    }
    if (wh) {
      const at = wh.p;
      if (ent.kind === 'orb') { m.burstOrb(ent, at); continue; }
      if (ent.kind === 'disc') { m.emit({ e: 'boom', power: ent.power, p: R2(at), r: 1.2, ent: ent.id }); m.fellTrees(at, 2, prev); m.despawn(ent, false); continue; }
      if (ent.blast) m.explode(owner || { id: ent.owner }, at, ent.blast, ent.dmg, ent.knock, ent.power, { ent: ent.id, big: ent.big, huge: ent.huge });
      else m.emit({ e: 'boom', power: ent.power, p: R2(at), r: ent.small ? 0.7 : 1.4, ent: ent.id });
      m.despawn(ent, false);
      continue;
    }
    if (ent.life <= 0) {
      if (ent.kind === 'orb') { m.burstOrb(ent, ent.p); continue; }
      if (ent.huge) { m.explode(owner || { id: ent.owner }, ent.p, ent.blast, ent.dmg, ent.knock, ent.power, { ent: ent.id, big: true, huge: true }); m.despawn(ent, false); continue; }
      m.despawn(ent, true);
    }
  }
}

function updateZones(m, dt) {
  for (let i = m.zones.length - 1; i >= 0; i--) {
    const z = m.zones[i];
    z.t -= dt;
    const owner = m.players.get(z.owner);
    const P = POWER[z.power];
    m.enemiesNear(owner || { id: z.owner }, z.p, z.r, true).forEach((e) => {
      m.damage(e, P.dmg * (z.k || 1) * dt, owner, z.power, true);
      if (P.pull) {
        const to = sub(z.p, e.p); const d = len(to);
        if (d > 0.8) { const pull = P.pull * (1 - d / (z.r * 1.4)); e.v[0] += (to[0] / d) * pull * dt * 6; e.v[1] += (to[1] / d) * pull * dt * 3; e.v[2] += (to[2] / d) * pull * dt * 6; e.pulled = 0.2; }
      }
    });
    if (z.t <= 0) { m.zones.splice(i, 1); m.emit({ e: 'zoneEnd', id: z.id }); }
  }
}

// closest points between segments p1-q1 and p2-q2 → [dist, s, t]
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1); const d2 = sub(q2, p2); const r = sub(p1, p2);
  const a = dot(d1, d1); const e = dot(d2, d2); const f = dot(d2, r);
  let s; let t;
  if (a < 1e-6 && e < 1e-6) return [len(r), 0, 0];
  if (a < 1e-6) { s = 0; t = clamp(f / e, 0, 1); } else {
    const c = dot(d1, r);
    if (e < 1e-6) { t = 0; s = clamp(-c / a, 0, 1); } else {
      const b = dot(d1, d2); const den = a * e - b * b;
      s = den > 1e-6 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = add(p1, d1, s); const c2 = add(p2, d2, t);
  return [len(sub(c1, c2)), s, t, c1, c2];
}

function updateBeams(m, dt) {
  const B = m.beams;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    const pl = m.players.get(b.owner);
    if (!b.clash) b.t -= dt;
    if (!pl || !pl.alive || pl.downed || b.t <= 0 || b.dead) {
      if (b.clash) endClash(m, b.clash, null);
      B.splice(i, 1);
      m.emit({ e: 'beamEnd', bid: b.bid });
      continue;
    }
    pl.stance = Math.max(pl.stance || 0, 0.15);
    // the beam leaves the hands and can be steered a little toward the aim
    const want = norm(sub(aimPoint(m, pl, null), b.o));
    if (!b.clash) {
      const turn = Math.min(1, dt * 1.3);
      b.dir = norm(b.dir.map((c, j) => c + (want[j] - c) * turn));
    }
    b.o = handsOf(pl, b.dir);
    if (!b.clash) {
      b.len = Math.min(b.max, b.len + BEAM_SPEED * dt);
      const h = m.island.ray(b.o, b.dir, b.len);
      b.ground = null;
      if (h) { b.len = h.t; b.ground = h.p; }
    }
    const end = add(b.o, b.dir, b.len);
    // burn whoever is inside the beam and push them along
    for (const e of m.players.values()) {
      if (!e.alive || e === pl || e.mode === 'ship' || m.sameTeam(pl, e)) continue;
      const [dd] = segSeg(b.o, end, [e.p[0], e.p[1] + 0.3, e.p[2]], [e.p[0], e.p[1] + 1.7, e.p[2]]);
      if (dd < b.w + 0.45) {
        m.damage(e, b.dps * dt, pl, b.power, true);
        e.v[0] += b.dir[0] * 40 * dt; e.v[1] += b.dir[1] * 40 * dt + 6 * dt; e.v[2] += b.dir[2] * 40 * dt;
        if (!e.bot && Math.random() < dt * 4) m.emit({ e: 'knock', id: e.id, v: R2(b.dir.map((c) => c * 6)) });
      }
    }
    // where the beam meets the ground: scorch and blow things apart
    if (b.ground) {
      b.scorch -= dt;
      if (b.scorch <= 0) { b.scorch = 0.28; m.crater(b.ground, b.w * 2.4, b.power); m.fellTrees(b.ground, b.w * 3, b.o); }
    } else {
      m.fellTrees(add(b.o, b.dir, Math.max(0, b.len - 2)), b.w * 1.6, b.o);
    }
    // clashes with an opposing beam
    if (!b.clash) {
      for (const o of B) {
        if (o === b || o.clash || o.owner === b.owner) continue;
        const op = m.players.get(o.owner);
        if (!op || m.sameTeam(pl, op)) continue;
        if (dot(b.dir, o.dir) > -0.25) continue;
        const oe = add(o.o, o.dir, o.len);
        const [dd, s, t] = segSeg(b.o, end, o.o, oe);
        if (dd < b.w + o.w + 0.6 && s > 0.02 && t > 0.02) startClash(m, b, o);
        if (b.clash) break;
      }
    }
    // keep clients in step
    b.sync -= dt;
    if (b.sync <= 0) { b.sync = 0.1; m.emit({ e: 'beamU', bid: b.bid, d: R2(b.dir), len: r2(b.len) }); }
  }
  for (const c of m.clashes.slice()) stepClash(m, c, dt);
}

function startClash(m, a, b) {
  const c = { a, b, f: 0.5, t: 0, sync: 0 };
  // where along the line between the two hands they met
  const A = a.o; const Bo = b.o; const L = len(sub(Bo, A)) || 1;
  c.f = clamp(a.len / (a.len + b.len), 0.15, 0.85);
  c.L = L;
  a.clash = c; b.clash = c;
  m.clashes.push(c);
  const p = add(A, sub(Bo, A), c.f);
  m.emit({ e: 'clash', a: a.bid, b: b.bid, ia: a.owner, ib: b.owner, p: R2(p), f: r2(c.f) });
}
function stepClash(m, c, dt) {
  const { a, b } = c;
  const pa = m.players.get(a.owner); const pb = m.players.get(b.owner);
  if (!pa || !pb || !pa.alive || !pb.alive) { endClash(m, c, null); return; }
  c.t += dt;
  const pushA = a.push * (1 + (pa.form || 0) * 0.3) * (pa.surge > 0 ? 1.3 : 1) + (pa.mashV || 0) + (pa.bot ? pa.brain.mashRate() : 0);
  const pushB = b.push * (1 + (pb.form || 0) * 0.3) * (pb.surge > 0 ? 1.3 : 1) + (pb.mashV || 0) + (pb.bot ? pb.brain.mashRate() : 0);
  c.f = clamp(c.f + (pushA - pushB) * dt * 0.11, 0, 1);
  a.t = Math.max(a.t, 0.5); b.t = Math.max(b.t, 0.5);
  pa.stance = Math.max(pa.stance || 0, 0.3); pb.stance = Math.max(pb.stance || 0, 0.3);
  const L = len(sub(b.o, a.o)) || 1;
  const dirAB = norm(sub(b.o, a.o));
  a.dir = dirAB; b.dir = dirAB.map((v) => -v);
  a.len = L * c.f; b.len = L * (1 - c.f);
  const p = add(a.o, dirAB, a.len);
  c.sync -= dt;
  if (c.sync <= 0) { c.sync = 0.1; m.emit({ e: 'clashp', a: a.bid, p: R2(p), f: r2(c.f) }); }
  if (Math.random() < dt * 3) m.fellTrees(p, 6, null);
  if (c.f >= 0.97 || (L * (1 - c.f) < 2.2 && c.f > 0.5)) endClash(m, c, pa);
  else if (c.f <= 0.03 || (L * c.f < 2.2 && c.f < 0.5)) endClash(m, c, pb);
  else if (c.t > 7) endClash(m, c, null, p);
}
function endClash(m, c, winner, at) {
  if (c.done) return;
  c.done = true;
  m.clashes.splice(m.clashes.indexOf(c), 1);
  const { a, b } = c;
  a.clash = null; b.clash = null;
  const pa = m.players.get(a.owner); const pb = m.players.get(b.owner);
  if (winner) {
    const loser = winner === pa ? pb : pa;
    const wb = winner === pa ? a : b; const lb = winner === pa ? b : a;
    const P = POWER[wb.power]; const PL = POWER[lb.power];
    // the winning beam crashes through and carries the loser's energy with it
    const dmg = (P.dmg + PL.dmg * 0.5) * 0.8;
    lb.dead = true;
    wb.t = 0.8;
    m.stat(winner, 'clashWins', 1);
    m.emit({ e: 'clashEnd', a: a.bid, b: b.bid, winner: winner.id, loser: loser ? loser.id : null });
    if (loser && loser.alive) m.explode(winner, [loser.p[0], loser.p[1] + 1, loser.p[2]], 9, dmg, 30, wb.power, { direct: loser, big: true, huge: true });
  } else {
    const p = at || add(a.o, a.dir, a.len);
    a.dead = true; b.dead = true;
    m.emit({ e: 'clashEnd', a: a.bid, b: b.bid, winner: null });
    m.explode({ id: '' }, p, 12, 40, 26, a.power, { big: true, huge: true });
  }
}
