// Ascendants match rules (runs offline, or on the host online): 50 heroes ride a dropship over the island,
// jump, fly or glide down, open crates for techniques, fight with ki, take the techniques of the fallen,
// and stay inside the shrinking storm. Solo, duos or squads: downed heroes can be revived by teammates.
// Last hero (or team) standing wins. Humans move on their own screens and report their state; the match
// moves bots, resolves techniques and damage, and tells everyone what happened through events.
import {
  POWER, POWERS, ULTS, CRATES, ITEMS, COMBAT, STORM, MAX_PLAYERS, HEROES, BOT_NAMES, MAX_LEVEL, KI, FORMS, FORM_GAIN, MODES, MOVE, AIRDROP, REDZONE,
  lvCd, mulberry32, clamp,
} from './data.js';
import { stepBody, eyeY, dirOf } from './sim.js';
import { cast, updatePowers, r2, pickTarget } from './powers.js';
import { Brain } from './bots.js';

const SHIP_H = 230; const SHIP_SPEED = 48;
const R2 = (a) => a.map(r2);
const BLEED = 100; const BLEED_RATE = 3.4; const REVIVE_T = 4;

export class Match {
  constructor(island, opts) {
    this.island = island;
    this.opts = opts;
    this.seed = opts.seed || 1;
    this.rnd = mulberry32(this.seed);
    this.emitFn = opts.emit || (() => {});
    this.mode = MODES[opts.mode] ? opts.mode : 'solo';
    this.teamSize = MODES[this.mode].team;
    this.players = new Map();
    this.ents = new Map();
    this.zones = [];
    this.beams = [];
    this.clashes = [];
    this.timers = [];
    this.loot = new Map();
    this.crates = new Map();
    this.nextId = 1;
    this.time = 0;
    this.phase = 'ship';
    this.hitAcc = new Map();
    this.craterT = 0;
    this.teamPlace = new Map();
    // the dropship crosses the island along a random line
    const a = this.rnd() * Math.PI * 2; const off = (this.rnd() - 0.5) * 260;
    const nx = Math.cos(a); const nz = Math.sin(a);
    this.ship = { a: [-nx * 760 - nz * off, SHIP_H, -nz * 760 + nx * off], b: [nx * 760 - nz * off, SHIP_H, nz * 760 + nx * off], t: 0 };
    this.ship.len = Math.hypot(this.ship.b[0] - this.ship.a[0], this.ship.b[2] - this.ship.a[2]);
    this.ship.p = this.ship.a.slice();
    // crates: most of the island's spots, shuffled per match
    island.crateSpots.slice().forEach(([x, z, tier]) => {
      if (tier === 'common' && this.rnd() < 0.18) return;
      const t2 = tier === 'common' && this.rnd() < 0.08 ? 'rare' : tier;
      const id = this.nextId++;
      this.crates.set(id, { id, tier: t2, p: [x, island.floor(x, z, 999), z], open: false });
    });
    // storm: the first circle covers the island; later ones shrink toward a random point
    this.storm = { phase: -1, c: [0, 0], r: 760, from: { c: [0, 0], r: 760 }, to: { c: [0, 0], r: 760 }, t: STORM[0][0], shrinking: false, dps: 0 };
    // players: humans first (teams in join order), then bots fill every team
    this.nextTeam = 0;
    (opts.roster || []).forEach((r, i) => this.addPlayer({ ...r, team: r.team ?? Math.floor(i / this.teamSize) }));
    this.nextTeam = Math.ceil((opts.roster || []).length / this.teamSize);
    if (opts.bots !== false) this.fillBots();
  }

  emit(e) { e.tm = r2(this.time); this.emitFn(e); }
  later(t, fn) { this.timers.push({ t, fn }); }

  addPlayer(r) {
    const pl = {
      id: r.id, name: r.name || 'Hero', hero: r.hero || 'vanguard', skin: r.skin ?? 1, aura: r.aura || null, bot: !!r.bot, alive: true, team: r.team ?? this.freeTeam(),
      p: this.ship.p.slice(), v: [0, 0, 0], yaw: 0, pitch: 0, mode: 'ship', ground: false,
      hp: COMBAT.hp, shield: 50, absorb: 0, powers: {}, slots: [null, null, null], ult: null, cd: {}, ultCharge: 0,
      ki: 60, form: 0, formT: 0, formMeter: 0, mashV: 0,
      items: { medkit: 0, cell: 0 }, kills: 0, dmgDone: 0, place: 0, meleeT: 0, castT: 0, buffs: {}, anim: 0, stats: {},
    };
    // everyone starts with a basic ki volley and one random technique
    this.give(pl, 'volley', 1, true);
    let start = POWERS[Math.floor(this.rnd() * POWERS.length)].id;
    if (start === 'volley') start = 'bomb';
    this.give(pl, start, 1, true);
    this.players.set(pl.id, pl);
    if (pl.bot) pl.brain = new Brain(this, pl, this.opts.difficulty || 'normal');
    if (this.time > 0) this.emit({ e: 'join', pl: this.publicInfo(pl) });
    return pl;
  }
  teamCount(t) { let n = 0; this.players.forEach((p) => { if (p.team === t) n++; }); return n; }
  freeTeam() {
    if (this.teamSize > 1) for (let t = 0; t < this.nextTeam; t++) if (this.teamCount(t) < this.teamSize) return t;
    return this.nextTeam++;
  }

  fillBots() {
    const heroes = HEROES.map((h) => h.id);
    const names = BOT_NAMES.slice().sort(() => this.rnd() - 0.5);
    let n = 0;
    while (this.players.size < MAX_PLAYERS) {
      const id = `bot${n}`;
      this.addPlayer({ id, name: names[n % names.length] + (n >= names.length ? n : ''), hero: heroes[Math.floor(this.rnd() * heroes.length)], skin: Math.floor(this.rnd() * 5), bot: true });
      n++;
    }
  }

  removePlayer(id) {
    const pl = this.players.get(id);
    if (!pl) return;
    if (pl.alive && this.phase !== 'ship') this.kill(pl, null, 'left', true);
    this.players.delete(id);
  }

  publicInfo(pl) { return { id: pl.id, name: pl.name, hero: pl.hero, skin: pl.skin, bot: pl.bot, team: pl.team, aura: pl.aura }; }
  roster() { return [...this.players.values()].map((p) => this.publicInfo(p)); }
  alive() { let n = 0; this.players.forEach((p) => { if (p.alive) n++; }); return n; }
  aliveTeams() { const s = new Set(); this.players.forEach((p) => { if (p.alive) s.add(p.team); }); return s; }
  sameTeam(a, b) { return !!a && !!b && a !== b && a.team !== undefined && a.team === b.team; }
  isFoe(a, b) { return b !== a && !this.sameTeam(a, b); }
  stat(pl, k, v) { if (pl && pl.stats) pl.stats[k] = (pl.stats[k] || 0) + v; if (pl && !pl.bot) this.emit({ e: 'stat', id: pl.id, k, v }); }

  // ── inventory ──
  give(pl, id, lv = 1, quiet = false) {
    const P = POWER[id];
    if (!P) return;
    const had = pl.powers[id] || 0;
    pl.powers[id] = Math.min(MAX_LEVEL, had + lv);
    if (!had) {
      if (P.ult) { if (!pl.ult) pl.ult = id; } else {
        const i = pl.slots.indexOf(null);
        if (i >= 0) pl.slots[i] = id;
      }
    }
    if (!quiet) this.emit({ e: 'got', id: pl.id, power: id, lv: pl.powers[id], up: had > 0 });
    this.emitInv(pl);
  }
  emitInv(pl) { if (!pl.bot) this.emit({ e: 'inv', id: pl.id, powers: pl.powers, slots: pl.slots, ult: pl.ult, items: pl.items }); }
  setLoadout(pl, slots, ult) {
    const clean = (slots || []).slice(0, 3).map((s) => (s && pl.powers[s] && !POWER[s].ult ? s : null));
    while (clean.length < 3) clean.push(null);
    clean.forEach((s, i) => { if (s && clean.indexOf(s) !== i) clean[i] = null; });
    pl.slots = clean;
    pl.ult = ult && pl.powers[ult] && POWER[ult].ult ? ult : null;
    this.emitInv(pl);
  }

  // ── requests from humans (and the local player offline) ──
  handle(id, m) {
    const pl = this.players.get(id);
    if (!pl) return;
    switch (m.t) {
      case 'state':
        if (!pl.alive || pl.bot) return;
        if (pl.mode === 'ship' && m.mode === 'ship') { pl.yaw = m.yaw; pl.pitch = m.pitch; return; }
        pl.p = m.p; pl.v = m.v; pl.yaw = m.yaw; pl.pitch = m.pitch; pl.mode = m.mode; pl.ground = m.g; pl.anim = m.a || 0;
        pl.charging = !!m.c && !pl.downed; pl.boosting = !!m.b; pl.emote = m.em || null;
        if (m.aim) pl.lastAim = m.aim; else if (!(pl.stance > 0)) pl.lastAim = null;
        if (m.fd) this.stat(pl, 'flyKm', m.fd / 1000);
        break;
      case 'drop': if (pl.mode === 'ship' && this.phase === 'ship') this.dropOut(pl); break;
      case 'cast': this.tryCast(pl, m.slot, m); break;
      case 'melee': this.melee(pl, m.n | 0, m); break;
      case 'heavy': this.heavy(pl, m); break;
      case 'vanish': this.vanish(pl, m); break;
      case 'transform': this.transform(pl); break;
      case 'mash': pl.mashV = Math.min(3.2, (pl.mashV || 0) + 0.2); break;
      case 'open': this.openCrate(pl, m.crate); break;
      case 'revive': this.revive(pl, m.target); break;
      case 'use': this.useItem(pl, m.item); break;
      case 'loadout': this.setLoadout(pl, m.slots, m.ult); break;
      case 'emote': if (pl.alive && !pl.downed) this.emit({ e: 'emote', id: pl.id, em: String(m.em).slice(0, 8) }); break;
      case 'take': { const l = this.loot.get(m.id); if (l && pl.alive && !pl.downed && Math.hypot(l.p[0] - pl.p[0], l.p[2] - pl.p[2]) < 9) this.takeLoot(pl, l); break; }
      case 'ping': if (Array.isArray(m.p) && m.p.length === 3) this.emit({ e: 'ping', id: pl.id, team: pl.team, p: R2(m.p), kind: m.kind === 'enemy' ? 'enemy' : m.kind === 'mark' ? 'mark' : m.kind === 'clear' ? 'clear' : 'loc' }); break;
      default: break;
    }
  }

  dropOut(pl) {
    pl.mode = 'fall';
    pl.skydive = true;
    pl.deployAt = 55 + this.rnd() * 30;
    const d = this.shipDir();
    pl.v = [d[0] * SHIP_SPEED * 0.6, -4, d[2] * SHIP_SPEED * 0.6];
    pl.p = this.ship.p.slice();
    pl.p[1] -= 4;
    this.emit({ e: 'drop', id: pl.id, p: R2(pl.p), v: R2(pl.v) });
  }
  shipDir() { const s = this.ship; const dx = s.b[0] - s.a[0]; const dz = s.b[2] - s.a[2]; const L = Math.hypot(dx, dz); return [dx / L, 0, dz / L]; }

  canAct(pl) { return pl.alive && !pl.downed && pl.mode !== 'ship' && !(pl.frozen > 0) && !(pl.held > 0) && !(pl.tumble > 0.3); }

  tryCast(pl, slot, req) {
    if (!this.canAct(pl)) return false;
    const id = slot === 3 ? pl.ult : pl.slots[slot];
    if (!id) return false;
    const P = POWER[id];
    if (P.ult) { if (pl.ultCharge < COMBAT.ultCharge) return false; } else {
      if ((pl.cd[id] || 0) > 0) return false;
      if (pl.ki < (P.ki || 0)) { if (!pl.bot) this.emit({ e: 'noki', id: pl.id }); return false; }
    }
    if (pl.castT > 0 || pl.stance > 0) return false;
    if (req && req.aim) pl.lastAim = req.aim;
    if (req && req.yaw !== undefined) { pl.yaw = req.yaw; pl.pitch = req.pitch; }
    pl.charging = false;
    const ok = cast(this, pl, id, pl.powers[id] || 1, req);
    if (!ok) return false;
    if (P.ult) pl.ultCharge = 0; else { pl.cd[id] = P.cd * lvCd(pl.powers[id] || 1); pl.ki -= P.ki || 0; }
    pl.castT = 0.3;
    pl.emote = null;
    this.selfSync(pl, { p: false });
    return true;
  }

  // movement changes the match made to a human's body: their own client applies them
  selfSync(pl, opts = {}) {
    if (pl.bot) return;
    const ev = { e: 'self', id: pl.id, force: pl.force ? { v: R2(pl.force.v), t: r2(pl.force.t) } : null, speedMul: r2(this.speedMul(pl)), stance: r2(pl.stance || 0), downed: !!pl.downed };
    if (opts.p) ev.p = R2(pl.p);
    if (opts.yaw !== undefined) ev.yaw = r2(opts.yaw);
    if (opts.vy !== undefined) ev.vy = opts.vy;
    this.emit(ev);
  }
  speedMul(pl) {
    let s = 1;
    if (pl.form) s *= FORMS[pl.form].speed;
    if (pl.surge > 0) s *= POWER.surge.speedMul;
    if (pl.downed) s *= 0.3;
    return s;
  }
  dmgMul(pl) {
    let s = 1;
    if (pl.form) s *= FORMS[pl.form].dmg;
    if (pl.surge > 0) s *= POWER.surge.dmgMul;
    return s;
  }

  // ── melee: the five-hit rush combo and the charged heavy smash ──
  melee(pl, n, req) {
    if (!this.canAct(pl) || pl.meleeT > 0 || pl.stance > 0) return;
    const M = COMBAT.melee[clamp(n, 0, COMBAT.melee.length - 1)];
    pl.meleeT = M.t * 0.85;
    pl.emote = null; pl.charging = false;
    if (req && req.yaw !== undefined) { pl.yaw = req.yaw; if (req.pitch !== undefined) pl.pitch = req.pitch; }
    const hitAny = this.strike(pl, M.reach, M.dmg, M.knock || 0, 'melee', n);
    this.emit({ e: 'melee', id: pl.id, n, hit: hitAny });
  }
  heavy(pl, req) {
    if (!this.canAct(pl) || pl.meleeT > 0 || pl.stance > 0) return;
    const H = COMBAT.heavy;
    pl.meleeT = H.t;
    pl.emote = null; pl.charging = false;
    if (req && req.yaw !== undefined) { pl.yaw = req.yaw; if (req.pitch !== undefined) pl.pitch = req.pitch; }
    const hitAny = this.strike(pl, H.reach, H.dmg, H.knock, 'heavy', 5);
    this.emit({ e: 'melee', id: pl.id, n: 5, hit: hitAny, heavy: true });
  }
  strike(pl, reach, dmg, knock, power, n) {
    const f = dirOf(pl.yaw, pl.mode === 'fly' ? pl.pitch : 0);
    let hitAny = false;
    this.enemiesNear(pl, pl.p, reach + 0.8, true).forEach((e) => {
      const d = [e.p[0] - pl.p[0], e.p[1] - pl.p[1], e.p[2] - pl.p[2]]; const L = Math.hypot(...d) || 1;
      const facing = (d[0] * f[0] + d[2] * f[2] + (pl.mode === 'fly' ? d[1] * f[1] : 0)) / L;
      if (facing < 0.2 || Math.abs(d[1]) > 2.8) return;
      if (this.dodge(e, pl)) return;
      this.damage(e, dmg, pl, power === 'heavy' ? 'melee' : power);
      pl.ki = Math.min(KI.max, pl.ki + KI.perHit);
      this.stat(pl, 'hits', 1);
      if (knock >= 20) this.launch(e, pl.p, knock, power === 'heavy' ? 9 : 6, f);
      else if (knock) this.knock(e, pl.p, knock, 5);
      else { e.v[0] += f[0] * 2.5; e.v[2] += f[2] * 2.5; }
      if (power === 'heavy') this.emit({ e: 'boom', power: 'heavy', p: R2([e.p[0], e.p[1] + 1.1, e.p[2]]), r: 2.2 });
      hitAny = true;
    });
    // punch copies too
    for (const ent of this.ents.values()) if (ent.kind === 'clone' && ent.owner !== pl.id && Math.hypot(ent.p[0] - pl.p[0], ent.p[2] - pl.p[2]) < reach + 0.5) ent.hp = 0;
    return hitAny;
  }

  // vanish: spend ki to blink behind your target (or out of a combo)
  vanish(pl, req) {
    if (!pl.alive || pl.downed || pl.mode === 'ship' || pl.frozen > 0 || pl.ki < KI.vanish || pl.stance > 0) return;
    if ((pl.vanishCd || 0) > 0) return;
    const tgt = pickTarget(this, pl, req, 45, 6);
    pl.ki -= KI.vanish;
    pl.vanishCd = 0.7;
    pl.tumble = 0; pl.held = 0;
    if (tgt) this.behind(pl, tgt, 'vanish');
    else {
      // dodge sideways
      const s = Math.random() < 0.5 ? -1 : 1;
      const np = [pl.p[0] + Math.cos(pl.yaw) * 8 * s, pl.p[1], pl.p[2] - Math.sin(pl.yaw) * 8 * s];
      np[1] = Math.max(np[1], this.island.floor(np[0], np[2], np[1] + 2));
      this.teleport(pl, np, pl.yaw, 'vanish');
    }
  }
  // appear on the far side of `tgt`, facing them
  behind(pl, tgt, power) {
    const dx = tgt.p[0] - pl.p[0]; const dz = tgt.p[2] - pl.p[2]; const d = Math.hypot(dx, dz) || 1;
    const np = [tgt.p[0] + (dx / d) * 2.2, tgt.p[1] + (tgt.mode === 'fly' ? 0.2 : 0), tgt.p[2] + (dz / d) * 2.2];
    const fl = this.island.floor(np[0], np[2], np[1] + 3);
    if (np[1] < fl) np[1] = fl;
    const yaw = Math.atan2(dx / d, dz / d); // facing back toward them
    this.teleport(pl, np, yaw, power);
  }
  teleport(pl, np, yaw, power) {
    const from = pl.p.slice();
    pl.p = np; pl.v = [0, 0, 0]; pl.yaw = yaw;
    this.emit({ e: 'tp', id: pl.id, from: R2(from), to: R2(np), power });
    this.selfSync(pl, { p: true, yaw });
  }
  // afterimage: the hit lands on an image of you, and you're a few metres to the side
  dodge(e, src) {
    if (!(e.buffs.afterimage > 0) || !(e.dodges > 0)) return false;
    e.dodges--;
    if (e.dodges <= 0) delete e.buffs.afterimage;
    const s = Math.random() < 0.5 ? -1 : 1;
    const np = [e.p[0] + Math.cos(e.yaw) * 4 * s, e.p[1], e.p[2] - Math.sin(e.yaw) * 4 * s];
    np[1] = Math.max(np[1], this.island.floor(np[0], np[2], np[1] + 2));
    this.teleport(e, np, e.yaw, 'afterimage');
    void src;
    return true;
  }

  // transformations: spend a full form meter to ascend (and again for stage two)
  transform(pl) {
    if (!pl.alive || pl.downed || pl.mode === 'ship' || pl.formMeter < 100 || pl.form >= 2) return;
    pl.form++;
    pl.formT = FORMS[pl.form].dur;
    pl.formMeter = 0;
    pl.ki = KI.max;
    pl.hp = Math.min(COMBAT.hp, pl.hp + 25);
    pl.stance = Math.max(pl.stance || 0, 1.0);
    this.stat(pl, 'forms', 1);
    this.emit({ e: 'form', id: pl.id, form: pl.form, t: pl.formT, hp: Math.round(pl.hp) });
    this.later(0.35, () => this.explode(pl, [pl.p[0], pl.p[1] + 1, pl.p[2]], 7, 8, 16, 'nova', { self: true, quiet: true }));
    this.selfSync(pl);
  }
  gainForm(pl, v) { if (pl && pl.alive && pl.form < 2) pl.formMeter = Math.min(100, (pl.formMeter || 0) + v); }

  openCrate(pl, cid) {
    const c = this.crates.get(cid);
    if (!c || c.open || !pl.alive || pl.downed) return;
    if (Math.hypot(c.p[0] - pl.p[0], c.p[2] - pl.p[2]) > 3.8) return;
    c.open = true;
    const C = CRATES[c.tier];
    this.emit({ e: 'crate', crate: cid, by: pl.id });
    this.stat(pl, 'crates', 1);
    const rnd = this.rnd;
    const drop = (kind, extra) => {
      const a = rnd() * Math.PI * 2; const d = 1.2 + rnd() * 1.4;
      const p = [c.p[0] + Math.cos(a) * d, 0, c.p[2] + Math.sin(a) * d];
      p[1] = this.island.floor(p[0], p[2], c.p[1] + 2);
      this.addLoot({ kind, p, ...extra });
    };
    for (let k = 0; k < C.powers; k++) drop('power', { power: this.randomPower(pl, false), lv: C.lv || (c.tier === 'legendary' && rnd() < 0.5 ? 2 : 1) });
    if (rnd() < C.ult) drop('power', { power: this.randomPower(pl, true), lv: 1 });
    for (let k = 0; k < C.extra; k++) drop('item', { item: rnd() < 0.5 ? 'medkit' : 'cell' });
  }
  randomPower(pl, ult) {
    const list = ult ? ULTS : POWERS;
    for (let k = 0; k < 4; k++) { const p = list[Math.floor(this.rnd() * list.length)].id; if (!pl || !pl.powers[p] || k === 3) return p; }
    return list[0].id;
  }
  addLoot(l) {
    l.id = this.nextId++;
    l.p = R2(l.p);
    this.loot.set(l.id, l);
    this.emit({ e: 'loot', l });
    return l;
  }
  takeLoot(pl, l) {
    if (l.kind === 'power') this.give(pl, l.power, l.lv || 1);
    else {
      if (pl.items[l.item] >= 3) return false;
      pl.items[l.item]++;
      this.emit({ e: 'got', id: pl.id, item: l.item });
      this.emitInv(pl);
    }
    this.loot.delete(l.id);
    this.emit({ e: 'unloot', id: l.id, by: pl.id });
    return true;
  }
  useItem(pl, item) {
    if (!pl.alive || pl.downed || !ITEMS[item] || pl.items[item] <= 0 || pl.using) return;
    if (item === 'medkit' && pl.hp >= COMBAT.hp) return;
    if (item === 'cell' && pl.shield >= COMBAT.shieldMax) return;
    pl.items[item]--;
    pl.using = { item, t: ITEMS[item].use };
    this.emit({ e: 'use', id: pl.id, item });
    this.emitInv(pl);
  }

  // ── squads: downed and revived ──
  revive(pl, tid) {
    const t = this.players.get(tid);
    if (!t || !t.alive || !t.downed || !this.sameTeam(pl, t) || !pl.alive || pl.downed) return;
    if (Math.hypot(t.p[0] - pl.p[0], t.p[1] - pl.p[1], t.p[2] - pl.p[2]) > 4) return;
    t.downed = false; t.hp = 30; t.shield = 0; t.bleed = 0;
    this.stat(pl, 'revives', 1);
    this.emit({ e: 'revived', id: t.id, by: pl.id, hp: 30 });
    this.selfSync(t);
  }
  down(t, killer, power) {
    t.downed = true;
    t.bleed = BLEED;
    t.hp = 0; t.shield = 0; t.absorb = 0;
    t.charging = false; t.stance = 0; t.form = 0; t.formT = 0; t.surge = 0;
    if (t.mode === 'fly') t.mode = 'ground';
    t.downBy = killer ? killer.id : null;
    this.emit({ e: 'down', id: t.id, by: killer && killer.id !== t.id ? killer.id : null, power: power || null, p: R2(t.p) });
    this.selfSync(t);
    this.checkTeam(t.team, killer);
  }
  // a team with nobody standing is out: everyone downed goes too
  checkTeam(team, killer) {
    const mates = [...this.players.values()].filter((p) => p.team === team && p.alive);
    if (mates.length && mates.every((p) => p.downed)) mates.forEach((p) => this.kill(p, this.players.get(p.downBy) || killer, 'bleed', true));
  }

  // ── damage ──
  damage(t, amt, src, power, continuous = false) {
    if (!t || !t.alive || amt <= 0 || this.phase === 'end') return;
    if (src && src.id === t.id && power !== 'storm') return;
    if (src && this.sameTeam(src, t) && power !== 'storm') return;
    if (src && src.alive !== undefined && power !== 'storm') amt *= this.dmgMul(src);
    let a = power === 'storm' ? amt : amt * 0.45; // heroes are tough: every hit lands at 45%
    amt = a;
    if (t.downed) {
      t.bleed -= a * 1.2;
      if (src && src.id !== t.id) { t.lastHitBy = src.id; t.lastHitT = this.time; }
      if (t.bleed <= 0) this.kill(t, src, power, true);
      return;
    }
    if (t.absorb > 0) { const s = Math.min(t.absorb, a); t.absorb -= s; a -= s; }
    if (t.shield > 0 && a > 0) { const s = Math.min(t.shield, a); t.shield -= s; a -= s; }
    t.hp -= a;
    t.cloak = 0;
    t.using = null; // getting hit cancels healing
    if (!continuous) t.charging = false;
    this.gainForm(t, amt * FORM_GAIN.taken);
    if (src && src.id !== t.id && src.stats) {
      src.dmgDone += amt;
      src.ultCharge = Math.min(COMBAT.ultCharge, src.ultCharge + amt * COMBAT.ultPerDmg);
      this.gainForm(src, amt * FORM_GAIN.dealt);
      t.lastHitBy = src.id; t.lastHitT = this.time;
      if (!src.bot) this.stat(src, 'dmg', amt);
    }
    // continuous damage is reported in bundles
    const key = `${t.id}|${src && src.id ? src.id : ''}`;
    const acc = this.hitAcc.get(key) || { amt: 0, t: 0, power };
    acc.amt += amt; acc.power = power;
    this.hitAcc.set(key, acc);
    if (!continuous || acc.amt > 12) this.flushHit(key, t, src);
    if (t.hp <= 0) this.kill(t, src, power);
  }
  flushHit(key, t, src) {
    const acc = this.hitAcc.get(key);
    if (!acc || acc.amt < 0.5 || !t) { this.hitAcc.delete(key); return; }
    this.emit({ e: 'hit', id: t.id, by: src && src.id ? src.id : null, amt: Math.round(acc.amt), power: acc.power, hp: Math.max(0, Math.round(t.hp)), sh: Math.round(t.shield) });
    this.hitAcc.delete(key);
  }
  heal(pl, amt) { if (!pl.downed) pl.hp = Math.min(COMBAT.hp, pl.hp + amt); }
  knock(e, from, power, up) {
    const dx = e.p[0] - from[0]; const dz = e.p[2] - from[2]; const d = Math.hypot(dx, dz) || 1;
    const v = [(dx / d) * power, up, (dz / d) * power];
    e.v[0] += v[0]; e.v[1] = Math.max(e.v[1], v[1]); e.v[2] += v[2];
    e.ground = false;
    if (!e.bot) this.emit({ e: 'knock', id: e.id, v: R2(v) });
  }
  // a heavy hit sends them tumbling through the air (and through trees)
  launch(e, from, power, up, dir) {
    if (e.downed) { this.knock(e, from, power * 0.3, 3); return; }
    let d = dir;
    if (!d) { const dx = e.p[0] - from[0]; const dy = e.p[1] - from[1]; const dz = e.p[2] - from[2]; const L = Math.hypot(dx, dz) || 1; d = [dx / L, clamp(dy / L, -0.5, 0.5), dz / L]; }
    const v = [d[0] * power, Math.max(up, d[1] * power + up * 0.5), d[2] * power];
    e.v = v.slice();
    e.ground = false;
    e.tumble = 1.1;
    e.charging = false; e.stance = 0; e.held = 0;
    if (e.mode === 'fly') e.mode = 'ground';
    this.emit({ e: 'knock', id: e.id, v: R2(v), tumble: 1.1 });
  }
  pull(e, v) {
    e.v = v.slice(); e.ground = false;
    if (!e.bot) this.emit({ e: 'knock', id: e.id, v: R2(v), set: true });
  }

  // explosions: falloff damage, knockback, a crater on the ground, flattened trees
  explode(src, at, r, dmg, knock, power, o = {}) {
    if (!o.quiet) this.emit({ e: 'boom', power, p: R2(at), r, ent: o.ent, big: o.big ? 1 : 0, huge: o.huge ? 1 : 0 });
    const owner = src && src.id ? src : null;
    for (const e of this.players.values()) {
      if (!e.alive || e.mode === 'ship') continue;
      if (owner && (e === owner || this.sameTeam(owner, e))) continue;
      const dd = Math.hypot(e.p[0] - at[0], e.p[1] + 1 - at[1], e.p[2] - at[2]);
      if (dd > r + 0.5 && e !== o.direct) continue;
      const f = e === o.direct ? 1 : clamp(1 - dd / (r * 1.25), 0.25, 1);
      this.damage(e, dmg * f, owner, power);
      if (knock >= 16 && f > 0.4) this.launch(e, at, knock * f, 8);
      else if (knock) this.knock(e, at, knock * f, 6);
    }
    const fl = this.island.floor(at[0], at[2], at[1] + 1);
    if (at[1] - fl < r * 0.8) this.crater([at[0], fl, at[2]], r * (o.huge ? 1.1 : 0.8), power);
    this.fellTrees(at, r * (o.huge ? 1.2 : 0.8), at);
  }
  crater(p, r, power) {
    if (r < 1.6) return;
    if (this.time - this.craterT < 0.12 && r < 5) return;
    this.craterT = this.time;
    const y = this.island.height(p[0], p[2]);
    if (y < 0.2) return; // the sea swallows it
    this.emit({ e: 'crater', p: R2([p[0], y, p[2]]), r: r2(Math.min(r, 16)), power });
  }
  // trees in a radius break and fall away from `from`
  fellTrees(at, r, from) {
    const I = this.island;
    if (!I.treesNear) return;
    const list = I.treesNear(at[0], at[2], r);
    const out = [];
    for (const t of list) {
      if (t.dead) continue;
      if (Math.abs(at[1] - (t.y + 3 * t.s)) > r + 5) continue;
      I.fellTree(t.i);
      out.push(t.i);
    }
    if (out.length) this.emit({ e: 'trees', ids: out, from: from ? R2(from) : R2(at) });
  }

  kill(t, src, power, force = false) {
    if (!t.alive) return;
    // in squads, falling first means being downed while a teammate still stands
    if (!force && this.teamSize > 1 && !t.downed) {
      const standing = [...this.players.values()].some((p) => p !== t && p.alive && !p.downed && p.team === t.team);
      if (standing) { let k = src; if ((!k || k.id === t.id) && t.lastHitBy) k = this.players.get(t.lastHitBy); this.down(t, k, power); return; }
    }
    t.alive = false;
    t.hp = 0; t.downed = false;
    // credit the last attacker if the storm or a fall finished them
    let killer = src && src.id ? src : null;
    if ((!killer || killer.id === t.id) && t.lastHitBy && this.time - t.lastHitT < 12) killer = this.players.get(t.lastHitBy);
    if (killer && killer.id !== t.id && killer.stats) { killer.kills++; killer.ultCharge = Math.min(COMBAT.ultCharge, killer.ultCharge + 20); this.gainForm(killer, FORM_GAIN.kill); if (!killer.bot) this.stat(killer, 'kills', 1); }
    // everything they carried spills out
    const drops = Object.entries(t.powers);
    drops.forEach(([pid, lv], i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2;
      const p = [t.p[0] + Math.cos(a) * 1.6, 0, t.p[2] + Math.sin(a) * 1.6];
      p[1] = this.island.floor(p[0], p[2], t.p[1] + 2);
      if (p[1] < -0.5) p[1] = Math.max(0, t.p[1]);
      this.addLoot({ kind: 'power', power: pid, lv, p });
    });
    ['medkit', 'cell'].forEach((it, i) => { if (t.items[it] > 0) this.addLoot({ kind: 'item', item: it, p: [t.p[0] + (i ? 1 : -1), Math.max(0, t.p[1]), t.p[2] + 1] }); });
    // the team's place is decided when its last member falls
    const teams = this.aliveTeams();
    const teamOut = !teams.has(t.team);
    t.place = teamOut ? teams.size + 1 : 0;
    if (teamOut) this.teamPlace.set(t.team, t.place);
    this.emit({ e: 'kill', id: t.id, by: killer && killer.id !== t.id ? killer.id : null, power: power || null, place: t.place, left: this.alive(), teams: teams.size, team: t.team, teamOut, p: R2(t.p) });
    // the rest of a squad might now all be downed
    if (!teamOut && this.teamSize > 1) this.checkTeam(t.team, killer);
    // the winners?
    if (teams.size <= 1 && this.phase !== 'end') {
      this.phase = 'end';
      const wt = [...teams][0];
      const w = [...this.players.values()].find((p) => p.alive && p.team === wt);
      [...this.players.values()].forEach((p) => { if (p.team === wt) p.place = 1; });
      this.emit({ e: 'win', id: w ? w.id : null, team: wt ?? null });
    }
  }

  // ── spatial helpers (teammates are never targets) ──
  enemiesNear(pl, p, r, withY = false) {
    const out = [];
    for (const e of this.players.values()) {
      if (!e.alive || e.id === pl.id || e.mode === 'ship' || this.sameTeam(pl, e)) continue;
      const dx = e.p[0] - p[0]; const dz = e.p[2] - p[2]; const dy = (e.p[1] + 0.9) - p[1];
      if (dx * dx + dz * dz + (withY ? dy * dy : dy * dy * 0.5) < r * r) out.push(e);
    }
    return out;
  }
  nearestEnemy(pl, p, r, skip) {
    let best = null; let bd = r;
    for (const e of this.players.values()) {
      if (!e.alive || e.id === pl.id || skip.includes(e.id) || e.mode === 'ship' || this.sameTeam(pl, e) || e.downed) continue;
      const d = Math.hypot(e.p[0] - p[0], e.p[1] - p[1], e.p[2] - p[2]);
      if (d < bd && this.island.los([p[0], p[1] + 1.2, p[2]], [e.p[0], e.p[1] + 1.2, e.p[2]])) { bd = d; best = e; }
    }
    return best;
  }
  // the enemy nearest the aim line (within `slack` metres of it)
  lineTarget(pl, o, d, range, slack) {
    let best = null; let bt = range;
    for (const e of this.players.values()) {
      if (!e.alive || e.id === pl.id || e.mode === 'ship' || this.sameTeam(pl, e)) continue;
      const c = [e.p[0] - o[0], e.p[1] + 1.1 - o[1], e.p[2] - o[2]];
      const t = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
      if (t < 0 || t > bt) continue;
      const off = Math.hypot(c[0] - d[0] * t, c[1] - d[1] * t, c[2] - d[2] * t);
      if (off < slack) { bt = t; best = e; }
    }
    return best;
  }
  // first player a moving thing touches between a and b (skipping `skip` ids)
  sweepPlayers(ownerId, a, b, r, skip) {
    const owner = this.players.get(ownerId);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(...d) || 1e-6;
    let best = null;
    for (const e of this.players.values()) {
      if (!e.alive || e.id === ownerId || e.mode === 'ship' || (owner && this.sameTeam(owner, e)) || (skip && skip.includes(e.id))) continue;
      const rr = r + 0.45;
      for (const hy of [0.5, 1.1, 1.6]) {
        const c = [e.p[0] - a[0], e.p[1] + hy - a[1], e.p[2] - a[2]];
        const t = clamp((c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / L, 0, L);
        const off = Math.hypot(c[0] - (d[0] / L) * t, c[1] - (d[1] / L) * t, c[2] - (d[2] / L) * t);
        if (off < rr && (!best || t < best.t)) best = { pl: e, t };
      }
    }
    if (best && this.dodge(best.pl, owner)) best.dodged = true;
    // copies soak hits
    for (const ent of this.ents.values()) {
      if (ent.kind !== 'clone' || ent.owner === ownerId) continue;
      const c = [ent.p[0] - a[0], ent.p[1] + 1 - a[1], ent.p[2] - a[2]];
      const t = clamp((c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / L, 0, L);
      if (Math.hypot(c[0] - (d[0] / L) * t, c[1] - (d[1] / L) * t, c[2] - (d[2] / L) * t) < r + 0.5) ent.hp -= 25;
    }
    return best;
  }

  // ── entities ──
  spawn(ent, ev) {
    ent.id = this.nextId++;
    this.ents.set(ent.id, ent);
    const out = { e: 'ent', id: ent.id, kind: ent.kind, power: ent.power, owner: ent.owner, p: R2(ent.p), v: R2(ent.v), grav: ent.grav || 0, life: ent.life };
    if (ent.kind === 'clone') { out.hero = ent.hero; out.skin = ent.skin; out.slot = ent.slot; }
    if (ent.target) out.target = ent.target;
    if (ent.small) out.small = 1;
    if (ent.huge) out.huge = 1; else if (ent.big) out.big = 1;
    if (ev) { ev.ent = ent.id; this.emit(ev); }
    this.emit(out);
    return ent;
  }
  despawn(ent, fizzle) { this.ents.delete(ent.id); this.emit({ e: 'unent', id: ent.id, fizzle, p: R2(ent.p) }); }
  burstOrb(ent, at) {
    const P = POWER[ent.power];
    const p = at.slice(); p[1] = Math.max(p[1], this.island.floor(p[0], p[2], p[1] + 1));
    const z = { id: this.nextId++, kind: 'zone', power: ent.power, owner: ent.owner, p, r: P.r, t: P.dur, k: ent.k || 1 };
    this.zones.push(z);
    this.despawn(ent, false);
    this.emit({ e: 'zone', id: z.id, power: ent.power, p: R2(p), r: P.r, dur: P.dur });
    this.crater(p, 4, ent.power);
  }
  buff(pl, kind, t) { pl.buffs[kind] = t; this.emit({ e: 'buff', id: pl.id, kind, t }); }

  // ── the simulation step ──
  step(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    this.stepShip(dt);
    this.stepStorm(dt);
    this.stepEvents(dt);
    for (const pl of this.players.values()) {
      if (!pl.alive) continue;
      for (const k in pl.cd) if (pl.cd[k] > 0) pl.cd[k] = Math.max(0, pl.cd[k] - dt);
      for (const k in pl.buffs) { pl.buffs[k] -= dt; if (pl.buffs[k] <= 0) delete pl.buffs[k]; }
      pl.meleeT = Math.max(0, pl.meleeT - dt);
      pl.castT = Math.max(0, pl.castT - dt);
      ['frozen', 'root', 'held', 'blind', 'surge', 'vanishCd'].forEach((k) => { if (pl[k] > 0) pl[k] = Math.max(0, pl[k] - dt); });
      if (pl.stance > 0) pl.stance = Math.max(0, pl.stance - dt);
      if (!pl.bot && pl.tumble > 0) pl.tumble = Math.max(0, pl.tumble - dt); // bots tumble inside stepBody
      pl.mashV = (pl.mashV || 0) * Math.exp(-1.6 * dt);
      if (!pl.buffs.barrier) pl.absorb = 0;
      if (this.phase !== 'ship' && pl.mode !== 'ship') pl.ultCharge = Math.min(COMBAT.ultCharge, pl.ultCharge + COMBAT.ultPassive * dt);
      // ki: regenerates, charges fast while powering up, drains while boosting in flight
      if (pl.mode !== 'ship' && !pl.downed) {
        const F = FORMS[pl.form || 0];
        pl.ki += KI.regen * (F ? F.kiRegen : 1) * dt;
        if (pl.charging && !(pl.stance > 0)) pl.ki += KI.charge * dt;
        if (pl.boosting && pl.mode === 'fly') pl.ki -= MOVE.dashKi * dt;
        pl.ki = clamp(pl.ki, 0, KI.max);
      }
      // forms wear off
      if (pl.form) { pl.formT -= dt; if (pl.formT <= 0) { pl.form = 0; pl.formT = 0; this.emit({ e: 'form', id: pl.id, form: 0 }); this.selfSync(pl); } }
      if (pl.surge > 0) { pl.hp = Math.max(1, pl.hp - POWER.surge.drain * dt); if (pl.surge <= dt) this.later(0.01, () => this.selfSync(pl)); }
      if (pl.regen) { pl.regen.t -= dt; this.heal(pl, pl.regen.rate * dt); if (pl.regen.t <= 0) pl.regen = null; }
      if (pl.downed) { pl.bleed -= BLEED_RATE * dt; if (pl.bleed <= 0) { this.kill(pl, this.players.get(pl.downBy), 'bleed', true); continue; } }
      if (pl.using) {
        pl.using.t -= dt;
        if (pl.using.t <= 0) {
          const I = ITEMS[pl.using.item];
          if (I.heal) this.heal(pl, I.heal);
          if (I.shield) pl.shield = Math.min(COMBAT.shieldMax, pl.shield + I.shield);
          pl.using = null;
          this.emit({ e: 'used', id: pl.id, hp: Math.round(pl.hp), sh: Math.round(pl.shield) });
        }
      }
      if (!pl.bot && pl.force) { pl.force.t -= dt; if (pl.force.t <= 0) pl.force = null; }
      if (pl.bot) {
        pl.brain.update(dt);
        if (pl.mode !== 'ship') {
          pl.speedMul = this.speedMul(pl);
          stepBody(pl, pl.brain.input, dt, this.island);
          if (!(pl.stance > 0) && !(pl.tumble > 0)) { pl.yaw = pl.brain.input.yaw; pl.pitch = pl.brain.input.pitch; }
        }
      }
      if (pl.p[1] < -30) this.damage(pl, 100, null, 'storm');
      // pick up loot lying close by
      if (pl.mode !== 'ship' && !pl.downed) {
        for (const l of this.loot.values()) {
          if (Math.abs(l.p[0] - pl.p[0]) < 1.8 && Math.abs(l.p[2] - pl.p[2]) < 1.8 && Math.abs(l.p[1] - pl.p[1]) < 2.4) { if (this.takeLoot(pl, l)) break; }
        }
      }
    }
    updatePowers(this, dt);
    // send bundled continuous damage
    this.flushT = (this.flushT || 0) - dt;
    if (this.flushT <= 0) {
      this.flushT = 0.25;
      for (const key of [...this.hitAcc.keys()]) { const [tid, sid] = key.split('|'); this.flushHit(key, this.players.get(tid), this.players.get(sid)); }
    }
  }

  // ── airdrops (sky caches drifting down on a canopy) and bombardment zones ──
  stepEvents(dt) {
    if (this.phase !== 'play') return;
    this.playT = (this.playT || 0) + dt;
    const st = this.storm; const safe = st.to || st;
    const pick = (inner) => {
      for (let k = 0; k < 40; k++) {
        const a = this.rnd() * Math.PI * 2; const d = Math.sqrt(this.rnd()) * Math.max(20, safe.r * inner);
        const x = safe.c[0] + Math.cos(a) * d; const z = safe.c[1] + Math.sin(a) * d;
        if (this.island.height(x, z) > 2 && Math.abs(x) < 640 && Math.abs(z) < 640) return [x, z];
      }
      return null;
    };
    this.dropsDone = this.dropsDone || 0;
    if (this.dropsDone < AIRDROP.max && this.playT > AIRDROP.first + this.dropsDone * AIRDROP.every) {
      this.dropsDone++;
      const q = pick(0.75);
      if (q) {
        const y = this.island.floor(q[0], q[1], 999);
        const id = this.nextId++;
        this.emit({ e: 'airdrop', id, p: R2([q[0], y, q[1]]), fall: AIRDROP.fall });
        this.later(AIRDROP.fall, () => {
          const c = { id, tier: 'supply', p: [q[0], y, q[1]], open: false };
          this.crates.set(id, c);
          this.emit({ e: 'crateAdd', c: [id, 'supply', R2(c.p), 0] });
        });
      }
    }
    this.redDone = this.redDone || 0;
    if (!this.red && this.playT > REDZONE.first + this.redDone * REDZONE.every && st.r > 90) {
      this.redDone++;
      // somewhere inside the storm but not right at the safe centre
      let q = null;
      for (let k = 0; k < 30 && !q; k++) { const a = this.rnd() * Math.PI * 2; const d = st.r * (0.3 + this.rnd() * 0.55); const x = st.c[0] + Math.cos(a) * d; const z = st.c[1] + Math.sin(a) * d; if (this.island.height(x, z) > 1) q = [x, z]; }
      if (q) { this.red = { c: q, r: REDZONE.r, warn: REDZONE.warn, t: REDZONE.dur, tick: 0 }; this.emit({ e: 'redzone', c: R2(q), r: REDZONE.r, warn: REDZONE.warn, dur: REDZONE.dur }); }
    }
    if (this.red) {
      const R = this.red;
      if (R.warn > 0) { R.warn -= dt; return; }
      R.t -= dt; R.tick -= dt;
      if (R.tick <= 0) {
        R.tick = REDZONE.rate;
        const a = this.rnd() * Math.PI * 2; const d = Math.sqrt(this.rnd()) * R.r;
        const x = R.c[0] + Math.cos(a) * d; const z = R.c[1] + Math.sin(a) * d;
        const p = [x, this.island.floor(x, z, 999), z];
        this.emit({ e: 'meteor', p: R2(p), delay: 0, power: 'comet' });
        this.later(0.9, () => this.explode({ id: '' }, p, 5.5, REDZONE.dmg, 14, 'comet'));
      }
      if (R.t <= 0) { this.red = null; this.emit({ e: 'redzone', end: true }); }
    }
  }

  stepShip(dt) {
    if (this.phase !== 'ship') return;
    const s = this.ship;
    s.t += dt;
    const f = Math.min(1, (s.t * SHIP_SPEED) / s.len);
    s.p = [s.a[0] + (s.b[0] - s.a[0]) * f, SHIP_H, s.a[2] + (s.b[2] - s.a[2]) * f];
    let riders = 0;
    for (const pl of this.players.values()) {
      if (pl.mode !== 'ship') continue;
      riders++;
      pl.p = s.p.slice();
      if (f > 0.86) this.dropOut(pl);
    }
    if (f >= 1 || (riders === 0 && s.t > 3)) {
      for (const pl of this.players.values()) if (pl.mode === 'ship') this.dropOut(pl);
      this.phase = 'play';
      this.emit({ e: 'phase', phase: 'play' });
      this.nextStorm();
    }
  }

  nextStorm() {
    const st = this.storm;
    st.phase++;
    const S = STORM[Math.min(st.phase, STORM.length - 1)];
    st.from = { c: st.c.slice(), r: st.r };
    let c = st.c.slice();
    const maxOff = Math.max(0, st.r - S[2]);
    for (let k = 0; k < 40; k++) {
      const a = this.rnd() * Math.PI * 2; const d = Math.sqrt(this.rnd()) * maxOff * (st.phase === 0 ? 0.35 : 0.9);
      const x = st.c[0] + Math.cos(a) * d; const z = st.c[1] + Math.sin(a) * d;
      if (this.island.height(x, z) > 2 || k === 39) { c = [x, z]; break; }
    }
    st.to = { c, r: S[2] };
    st.wait = S[0]; st.shrink = S[1]; st.t = S[0]; st.shrinking = false; st.dps = st.phase === 0 ? 1 : STORM[st.phase - 1][3];
    this.emit({ e: 'storm', phase: st.phase, from: { c: R2(st.from.c), r: st.from.r }, to: { c: R2(c), r: S[2] }, wait: S[0], shrink: S[1], dps: S[3] });
  }

  stepStorm(dt) {
    if (this.phase === 'ship') return;
    const st = this.storm;
    st.t -= dt;
    if (!st.shrinking && st.t <= 0) { st.shrinking = true; st.t = st.shrink; st.dps = STORM[Math.min(st.phase, STORM.length - 1)][3]; }
    if (st.shrinking) {
      const f = 1 - Math.max(0, st.t) / st.shrink;
      st.c = [st.from.c[0] + (st.to.c[0] - st.from.c[0]) * f, st.from.c[1] + (st.to.c[1] - st.from.c[1]) * f];
      st.r = st.from.r + (st.to.r - st.from.r) * f;
      if (st.t <= 0 && st.phase < STORM.length - 1) this.nextStorm();
    }
    st.tick = (st.tick || 0) - dt;
    if (st.tick <= 0) {
      st.tick = 1;
      for (const pl of this.players.values()) {
        if (!pl.alive || pl.mode === 'ship') continue;
        if (Math.hypot(pl.p[0] - st.c[0], pl.p[2] - st.c[1]) > st.r) this.damage(pl, Math.max(1, st.dps), null, 'storm');
      }
    }
  }
  inStorm(p, margin = 0) { const st = this.storm; return Math.hypot(p[0] - st.c[0], p[2] - st.c[1]) > st.r - margin; }

  flags(p) {
    return (p.buffs.afterimage > 0 ? 1 : 0) | (p.form ? 2 : 0) | (p.frozen > 0 ? 4 : 0) | (p.using ? 8 : 0) | (p.ground ? 16 : 0)
      | (p.charging ? 32 : 0) | (p.boosting ? 64 : 0) | (p.downed ? 128 : 0) | (p.tumble > 0 ? 256 : 0) | (p.surge > 0 ? 512 : 0)
      | (p.blind > 0 ? 1024 : 0) | (p.stance > 0 ? 2048 : 0) | (p.buffs.fist > 0 ? 4096 : 0) | (p.form === 2 ? 8192 : 0);
  }
  // compact state of every player for clients (~12 times a second)
  snapshot() {
    const pl = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const pw = Object.values(p.powers).reduce((a, b) => a + b, 0);
      pl.push([p.id, r2(p.p[0]), r2(p.p[1]), r2(p.p[2]), r2(p.yaw), r2(p.pitch), p.mode, Math.round(p.hp), Math.round(p.shield), this.flags(p), Math.round(p.ultCharge), r2(Math.hypot(p.v[0], p.v[2])), Math.round(p.absorb || 0), Math.round(p.ki), Math.round(p.formMeter || 0), pw, Math.round(p.bleed || 0), p.emote || 0]);
    }
    const st = this.storm;
    return { t: 'snap', tm: r2(this.time), pl, st: [r2(st.c[0]), r2(st.c[1]), r2(st.r)], ship: this.phase === 'ship' ? R2(this.ship.p) : null, alive: this.alive(), teams: this.aliveTeams().size };
  }
  // full state for someone joining a match in progress
  fullState() {
    return {
      roster: this.roster(), mode: this.mode, phase: this.phase, time: this.time, ship: { a: this.ship.a, b: this.ship.b, t: this.ship.t },
      crates: [...this.crates.values()].map((c) => [c.id, c.tier, R2(c.p), c.open ? 1 : 0]),
      loot: [...this.loot.values()],
      storm: { phase: this.storm.phase, from: this.storm.from, to: this.storm.to, wait: this.storm.wait, shrink: this.storm.shrink, t: this.storm.t, shrinking: this.storm.shrinking },
      dead: [...this.players.values()].filter((p) => !p.alive).map((p) => p.id),
      trees: this.island.trees ? this.island.trees.filter((t) => t.dead).map((t) => t.i) : [],
    };
  }
}
export { SHIP_H, SHIP_SPEED };
export const aimDir = dirOf;
export const eye = eyeY;
