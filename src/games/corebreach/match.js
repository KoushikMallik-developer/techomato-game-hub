// Core Breach match: the rules. Runs on the host (online) or locally (vs bots / range).
// It owns health, money, rounds, the Core, abilities and the bots. Players controlled by people move
// themselves and report where they are; their shots arrive as already-resolved hits.
//
// Everything that happens is sent out as an event through `emit` (round started, damage, kill, smoke...).
import {
  WEAPON, AGENT, AGENTS, ECON, TIMES, MOVE, BOT_NAMES, clamp, hitDamage, mulberry32,
} from './data.js';
import { moveBody, separate, eyeHeight } from './sim.js';
import { rayPlayer, segThroughSphere, spreadDir } from './hit.js';
import { stepProjectile, throwVelocity } from './proj.js';
import { Bot } from './bots.js';

const SIDE_SWAP = { atk: 'def', def: 'atk' };

export class Match {
  // opts: { mode: 'core' | 'dm' | 'range', level, toWin, difficulty, emit(evt) }
  constructor(opts) {
    this.mode = opts.mode || 'core';
    this.level = opts.level;
    this.toWin = opts.toWin || 5;
    this.dmKills = opts.dmKills || 30;
    this.difficulty = opts.difficulty || 'normal';
    this.emit = opts.emit || (() => {});
    this.rnd = mulberry32(opts.seed || 1234);
    this.players = new Map();
    this.time = 0;
    this.round = 0;
    this.score = { red: 0, blue: 0 };
    this.sides = { red: 'atk', blue: 'def' };
    this.lossStreak = { red: 0, blue: 0 };
    this.phase = 'wait';
    this.phaseT = 0;
    this.core = { state: 'none', carrier: null, p: [0, 0, 0], fuse: 0, plantT: 0, defuseT: 0, defuser: null, half: false };
    this.zones = [];
    this.projs = [];
    this.walls = [];
    this.turrets = [];
    this.strikes = [];
    this.traps = [];
    this.nextId = 1;
    this.over = false;
    this.botN = 0;
  }

  // ───────────── players ─────────────
  addPlayer({ id, name, team, agent, bot = false }) {
    const ag = AGENT[agent] ? agent : 'vex';
    const p = {
      id, name: name || BOT_NAMES[this.botN++ % BOT_NAMES.length], team, agent: ag, bot,
      alive: false, hp: 100, armor: 0, credits: ECON.start, kills: 0, deaths: 0, assists: 0, score: 0, ult: 0,
      charges: { c: 0, q: 0, e: 0 }, guns: { primary: null, secondary: 'wasp' }, cur: 'secondary',
      ammo: {}, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, ground: true, height: MOVE.height,
      hasCore: false, blindT: 0, concussT: 0, slowT: 0, revealT: 0, overT: 0, heal: null, respawnT: 0,
      dmgBy: new Map(), lastHit: 0, hs: 0, shots: 0, hits: 0, spawnProtect: 0,
    };
    this.players.set(id, p);
    if (bot) p.brain = new Bot(this, p);
    if (this.phase !== 'wait') {
      // late joiner: sits out until the next round (core) or spawns now (dm/range)
      if (this.mode !== 'core') this.spawn(p);
    }
    this.emit({ e: 'roster', players: this.roster() });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.hasCore) this.dropCore(p);
    this.players.delete(id);
    this.emit({ e: 'roster', players: this.roster() });
    this.checkRoundEnd();
  }

  roster() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, bot: p.bot }));
  }

  sideOf(p) { return this.mode === 'core' ? this.sides[p.team] : 'ffa'; }
  enemies(a, b) { return a !== b && (this.mode !== 'core' || a.team !== b.team) && !(this.mode === 'range' && !a.bot && !b.bot); }

  // fill a team with bots up to n players
  fillBots(team, n, agents) {
    let k = 0;
    while ([...this.players.values()].filter((p) => p.team === team).length < n) {
      const id = `bot${this.nextId++}`;
      const ag = agents ? agents[k++ % agents.length] : AGENTS[Math.floor(this.rnd() * AGENTS.length)].id;
      this.addPlayer({ id, team, agent: ag, bot: true });
    }
  }

  // ───────────── flow ─────────────
  start() {
    this.over = false;
    if (this.mode === 'core') this.startRound();
    else {
      this.phase = 'live';
      this.phaseT = this.mode === 'dm' ? TIMES.dmLength : 1e9;
      this.players.forEach((p) => {
        p.guns.primary = this.mode === 'range' ? 'falcon' : p.dmGun || 'falcon';
        p.cur = 'primary';
        this.spawn(p);
      });
      this.emitPhase();
    }
  }

  startRound() {
    this.round++;
    // swap sides at the half
    if (this.round === this.toWin) {
      this.sides = { red: SIDE_SWAP[this.sides.red], blue: SIDE_SWAP[this.sides.blue] };
      this.players.forEach((p) => { p.credits = ECON.start; p.guns = { primary: null, secondary: 'wasp' }; p.armor = 0; p.charges = { c: 0, q: 0, e: 0 }; p.ult = 0; p.cur = 'secondary'; });
      this.lossStreak = { red: 0, blue: 0 };
      this.emit({ e: 'msg', text: 'SWITCHING SIDES', sub: `Round ${this.round}` });
    }
    this.clearEffects();
    this.core = { state: 'none', carrier: null, p: [0, 0, 0], fuse: 0, plantT: 0, defuseT: 0, defuser: null, half: false };
    const bySide = { atk: [], def: [] };
    this.players.forEach((p) => bySide[this.sides[p.team]].push(p));
    ['atk', 'def'].forEach((side) => {
      const pts = this.level.spawns[side];
      bySide[side].forEach((p, i) => {
        const s = pts[i % pts.length];
        // a fresh round: full health, signature ability back
        if (!p.alive) { p.guns.primary = null; p.guns.secondary = p.guns.secondary && p.alive ? p.guns.secondary : 'wasp'; p.armor = 0; }
        p.hp = 100;
        const ag = AGENT[p.agent];
        p.charges.e = Math.max(p.charges.e, ag.abilities.e.free || 0);
        p.alive = true;
        p.hasCore = false;
        p.blindT = p.concussT = p.slowT = p.revealT = p.overT = 0;
        p.heal = null;
        p.dmgBy.clear();
        p.p = [s[0], this.level.groundUnder(s[0], s[1], 0.3), s[1]];
        p.v = [0, 0, 0];
        p.yaw = side === 'atk' ? 0 : Math.PI;
        p.pitch = 0;
        p.cur = p.guns.primary ? 'primary' : 'secondary';
        p.ammo = {};
        if (p.brain) p.brain.newRound();
        this.emit({ e: 'spawn', id: p.id, p: p.p, yaw: p.yaw, round: true });
        this.emitLoadout(p);
      });
    });
    // give the Core to a random attacker
    const atk = bySide.atk.filter((p) => p.alive);
    if (atk.length) {
      const c = atk[Math.floor(this.rnd() * atk.length)];
      c.hasCore = true;
      this.core.state = 'carried';
      this.core.carrier = c.id;
    }
    this.phase = 'buy';
    this.phaseT = TIMES.buy;
    this.emitPhase();
    this.emit({ e: 'msg', text: `ROUND ${this.round}`, sub: this.round === this.toWin * 2 - 1 ? 'MATCH POINT · SUDDEN DEATH' : 'BUY PHASE' });
  }

  spawn(p) {
    let best = null;
    let bestScore = -1;
    // dm/range: farthest from enemies among some candidate points
    const cands = [];
    if (this.mode === 'range') {
      const s = p.bot ? null : this.level.spawns.atk[0];
      if (s) cands.push([s[0], 0, s[1]]);
      else cands.push(this.level.randomIn([-20, -48, 20, -24], this.rnd));
    } else {
      this.level.def.areas.forEach((a) => { for (let k = 0; k < 2; k++) cands.push(this.level.randomIn(a.r, this.rnd)); });
    }
    cands.forEach((c) => {
      let dmin = 999;
      this.players.forEach((q) => { if (q !== p && q.alive) dmin = Math.min(dmin, Math.hypot(q.p[0] - c[0], q.p[2] - c[2])); });
      const sc = Math.min(dmin, 40) + this.rnd() * 6;
      if (sc > bestScore) { bestScore = sc; best = c; }
    });
    p.p = [best[0], this.level.groundUnder(best[0], best[2], 0.3), best[2]];
    p.v = [0, 0, 0];
    p.alive = true;
    p.hp = 100;
    p.armor = this.mode === 'dm' ? 50 : 0;
    p.yaw = this.mode === 'range' && !p.bot ? 0 : this.rnd() * Math.PI * 2;
    p.pitch = 0;
    p.ammo = {};
    p.blindT = p.concussT = p.slowT = 0;
    p.spawnProtect = 1.5;
    if (p.brain) p.brain.newRound();
    this.emit({ e: 'spawn', id: p.id, p: p.p, yaw: p.yaw });
    this.emitLoadout(p);
  }

  emitLoadout(p) {
    this.emit({ e: 'loadout', id: p.id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges }, ult: p.ult });
  }

  emitPhase() {
    this.emit({ e: 'phase', phase: this.phase, t: this.phaseT, round: this.round, score: { ...this.score }, sides: { ...this.sides }, toWin: this.toWin, mode: this.mode });
  }

  // ───────────── per tick ─────────────
  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.phase === 'wait') return;
    this.phaseT -= dt;
    if (this.mode === 'core') this.updateCore(dt);
    else if (this.mode === 'dm' && this.phaseT <= 0) this.endMatch(this.leader());
    this.players.forEach((p) => {
      p.blindT = Math.max(0, p.blindT - dt);
      p.concussT = Math.max(0, p.concussT - dt);
      p.slowT = Math.max(0, p.slowT - dt);
      p.revealT = Math.max(0, p.revealT - dt);
      p.overT = Math.max(0, p.overT - dt);
      p.spawnProtect = Math.max(0, p.spawnProtect - dt);
      if (p.heal && p.alive) {
        const h = Math.min(p.heal.left, p.heal.rate * dt);
        p.heal.left -= h;
        p.hp = Math.min(100, p.hp + h);
        if (p.heal.left <= 0) p.heal = null;
      }
      if (!p.alive && this.mode !== 'core' && p.respawnT > 0) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) this.spawn(p);
      }
    });
    // bots think and move
    this.players.forEach((p) => {
      if (!p.bot || !p.alive) return;
      p.brain.update(dt);
    });
    // keep bodies apart
    const alive = [...this.players.values()].filter((p) => p.alive);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      if (alive[i].bot || alive[j].bot) {
        const a = alive[i]; const b = alive[j];
        const pa = [...a.p]; const pb = [...b.p];
        separate(a, b);
        // only bots get pushed by this; people move themselves
        if (!a.bot) a.p = pa;
        if (!b.bot) b.p = pb;
      }
    }
    this.updateEffects(dt);
  }

  updateCore(dt) {
    const c = this.core;
    if (this.phase === 'buy') {
      if (this.phaseT <= 0) { this.phase = 'live'; this.phaseT = TIMES.round; this.emitPhase(); this.emit({ e: 'msg', text: 'GO', sub: '' }); }
      return;
    }
    if (this.phase === 'end') {
      if (this.phaseT <= 0) {
        if (this.over) return;
        this.startRound();
      }
      return;
    }
    // planting (carrier holds the key, inside a site, standing still)
    if (c.state === 'planting') {
      const p = this.players.get(c.carrier);
      if (!p || !p.alive) { c.state = p ? 'dropped' : 'none'; return; }
      c.plantT += dt;
      if (c.plantT >= TIMES.plant) {
        c.state = 'planted';
        c.p = [p.p[0], p.p[1], p.p[2]];
        c.site = this.level.siteAt(p.p[0], p.p[2]);
        c.fuse = TIMES.fuse;
        p.hasCore = false;
        c.carrier = null;
        this.phase = 'planted';
        this.phaseT = TIMES.fuse;
        // the attacking team earns the plant bonus
        this.players.forEach((q) => { if (this.sides[q.team] === 'atk') q.credits = Math.min(ECON.max, q.credits + ECON.plant); });
        p.ult = Math.min(AGENT[p.agent].abilities.x.points, p.ult + 1);
        p.score += 50;
        this.emit({ e: 'core', state: 'planted', p: c.p, site: c.site, by: p.id });
        this.emitPhase();
        this.players.forEach((q) => { if (q.brain) q.brain.onPlant(); });
      }
    }
    if (c.state === 'planted') {
      c.fuse -= dt;
      if (c.defuser) {
        const d = this.players.get(c.defuser);
        if (!d || !d.alive || Math.hypot(d.p[0] - c.p[0], d.p[2] - c.p[2]) > 2.2) { this.cancelDefuse(); } else {
          c.defuseT += dt;
          if (c.defuseT >= TIMES.defuseHalf && !c.half) { c.half = true; this.emit({ e: 'core', state: 'half' }); }
          if (c.defuseT >= TIMES.defuse) {
            c.state = 'defused';
            d.ult = Math.min(AGENT[d.agent].abilities.x.points, d.ult + 1);
            d.score += 50;
            this.emit({ e: 'core', state: 'defused', by: d.id });
            this.endRound(this.teamOfSide('def'), 'Core defused');
            return;
          }
        }
      }
      if (c.fuse <= 0) {
        c.state = 'detonated';
        this.emit({ e: 'core', state: 'detonated', p: c.p });
        // the blast kills everyone nearby
        this.players.forEach((q) => { if (q.alive && Math.hypot(q.p[0] - c.p[0], q.p[2] - c.p[2]) < 22) this.applyDamage(q, null, 500, 1, 'core'); });
        this.endRound(this.teamOfSide('atk'), 'Core detonated');
        return;
      }
    }
    if (this.phase === 'live' && this.phaseT <= 0) this.endRound(this.teamOfSide('def'), 'Time ran out');
  }

  teamOfSide(side) { return this.sides.red === side ? 'red' : 'blue'; }

  checkRoundEnd() {
    if (this.mode !== 'core' || (this.phase !== 'live' && this.phase !== 'planted')) return;
    const alive = { atk: 0, def: 0 };
    let total = { atk: 0, def: 0 };
    this.players.forEach((p) => { const s = this.sides[p.team]; total[s]++; if (p.alive) alive[s]++; });
    void total;
    if (alive.def === 0) { this.endRound(this.teamOfSide('atk'), 'Defenders eliminated'); return; }
    if (alive.atk === 0 && this.core.state !== 'planted') this.endRound(this.teamOfSide('def'), 'Attackers eliminated');
  }

  endRound(winner, reason) {
    if (this.phase === 'end') return;
    const loser = winner === 'red' ? 'blue' : 'red';
    this.score[winner]++;
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] = Math.min(2, this.lossStreak[loser] + 1);
    this.players.forEach((p) => {
      if (p.team === winner) p.credits += ECON.win;
      else p.credits += ECON.loss[this.lossStreak[loser] - 1];
      p.credits = Math.min(ECON.max, p.credits);
      // the dead lose their guns
      if (!p.alive) { p.guns.primary = null; p.guns.secondary = 'wasp'; p.armor = 0; }
      if (p.hasCore) p.hasCore = false;
    });
    this.phase = 'end';
    this.phaseT = TIMES.end;
    this.emit({ e: 'round', winner, reason, score: { ...this.score }, side: this.sides[winner] });
    this.emitPhase();
    if (this.score[winner] >= this.toWin) this.endMatch(winner);
  }

  leader() {
    let best = null;
    this.players.forEach((p) => { if (!best || p.kills > best.kills) best = p; });
    return best ? best.id : null;
  }

  endMatch(winner) {
    if (this.over) return;
    this.over = true;
    this.phase = 'over';
    this.emit({ e: 'over', winner, score: { ...this.score }, board: this.board() });
    this.emitPhase();
  }

  board() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, k: p.kills, d: p.deaths, a: p.assists, score: p.score, bot: p.bot }));
  }

  // ───────────── inputs from people ─────────────
  // movement report from a player's own client
  setState(id, s) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    p.p = s.p; p.v = s.v || p.v; p.yaw = s.yaw; p.pitch = s.pitch; p.crouch = s.crouch || 0;
    if (s.cur) p.cur = s.cur;
    p.ground = s.ground !== undefined ? s.ground : true;
  }

  // shots from a player's own client: hits are already resolved there (what they saw is what they hit)
  fire(id, f) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const w = WEAPON[f.w];
    if (!w) return;
    p.shots += f.n || 1;
    this.emit({ e: 'fire', id, w: f.w, o: f.o, ends: f.ends });
    (f.hits || []).forEach((h) => {
      const t = this.players.get(h.id);
      if (!t || !t.alive || !this.enemies(p, t)) return;
      // sanity: distance roughly matches
      if (Math.hypot(t.p[0] - p.p[0], t.p[2] - p.p[2]) > (w.range || 200) + 10) return;
      p.hits++;
      if (h.part === 0) p.hs++;
      this.applyDamage(t, p, hitDamage(w, h.part, h.dist || 10) * (h.mul || 1), h.part, f.w);
    });
    (f.objs || []).forEach((o) => this.damageObject(o.id, o.dmg, p));
    // walking or firing reveals you to nearby bots by sound
    this.players.forEach((q) => { if (q.brain && q.alive && this.enemies(q, p)) q.brain.hear(p, w.quiet ? 15 : 50); });
  }

  knife(id, targetId, back) {
    const p = this.players.get(id);
    const t = this.players.get(targetId);
    if (!p || !t || !p.alive || !t.alive || !this.enemies(p, t)) return;
    if (Math.hypot(t.p[0] - p.p[0], t.p[2] - p.p[2]) > 3) return;
    this.applyDamage(t, p, back ? 150 : 50, 1, 'knife');
  }

  // buy for a person (or a bot); returns true if bought
  buy(id, item) {
    const p = this.players.get(id);
    if (!p || !this.canBuy(p)) return false;
    const w = WEAPON[item];
    if (w && w.cost !== undefined && w.cat !== 'melee') {
      const slot = w.slot;
      if (p.guns[slot] === item) return false;
      // swapping a gun bought this round refunds it
      if (w.cost > p.credits) return false;
      p.credits -= w.cost;
      p.guns[slot] = item;
      p.cur = slot;
      p.ammo[item] = null;
      this.emit({ e: 'loadout', id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges } });
      return true;
    }
    if (item === 'light' || item === 'heavy') {
      const value = item === 'light' ? 25 : 50;
      const cost = item === 'light' ? 400 : 1000;
      if (p.armor >= value || cost > p.credits) return false;
      p.credits -= cost;
      p.armor = value;
      this.emit({ e: 'loadout', id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges } });
      return true;
    }
    if (item === 'c' || item === 'q') {
      const ab = AGENT[p.agent].abilities[item];
      if (p.charges[item] >= ab.max || ab.cost > p.credits) return false;
      p.credits -= ab.cost;
      p.charges[item]++;
      this.emit({ e: 'loadout', id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges } });
      return true;
    }
    return false;
  }

  canBuy(p) {
    if (this.mode === 'range' || this.mode === 'dm') return true;
    return this.phase === 'buy' && p.alive;
  }

  // deathmatch / range: pick a gun for free
  pick(id, gun) {
    const p = this.players.get(id);
    const w = WEAPON[gun];
    if (!p || !w || this.mode === 'core') return;
    p.guns[w.slot] = gun;
    p.cur = w.slot;
    p.dmGun = w.slot === 'primary' ? gun : p.dmGun;
    this.emit({ e: 'loadout', id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges } });
  }

  // the Core
  plant(id, start) {
    const p = this.players.get(id);
    const c = this.core;
    if (!p || !p.alive || this.phase !== 'live') return;
    if (start) {
      if (!p.hasCore || !this.level.siteAt(p.p[0], p.p[2])) return;
      c.state = 'planting'; c.carrier = id; c.plantT = 0;
      this.emit({ e: 'core', state: 'planting', by: id });
    } else if (c.state === 'planting' && c.carrier === id) {
      c.state = 'carried'; c.plantT = 0;
      this.emit({ e: 'core', state: 'carried', by: id });
    }
  }

  defuse(id, start) {
    const p = this.players.get(id);
    const c = this.core;
    if (!p || !p.alive || c.state !== 'planted' || this.sides[p.team] !== 'def') return;
    if (start) {
      if (Math.hypot(p.p[0] - c.p[0], p.p[2] - c.p[2]) > 2.2) return;
      if (c.defuser && c.defuser !== id) return;
      c.defuser = id;
      if (!c.half) c.defuseT = 0;
      else c.defuseT = Math.max(c.defuseT, TIMES.defuseHalf);
      this.emit({ e: 'core', state: 'defusing', by: id });
    } else if (c.defuser === id) this.cancelDefuse();
  }

  cancelDefuse() {
    const c = this.core;
    c.defuser = null;
    c.defuseT = c.half ? TIMES.defuseHalf : 0;
    this.emit({ e: 'core', state: 'planted', p: c.p, stop: true });
  }

  pickupCore(p) {
    const c = this.core;
    if (c.state !== 'dropped' || !p.alive || this.sides[p.team] !== 'atk') return;
    if (Math.hypot(p.p[0] - c.p[0], p.p[2] - c.p[2]) > 1.6) return;
    c.state = 'carried'; c.carrier = p.id; p.hasCore = true;
    this.emit({ e: 'core', state: 'carried', by: p.id });
  }

  dropCore(p) {
    const c = this.core;
    p.hasCore = false;
    if (c.carrier === p.id) {
      c.state = 'dropped';
      c.carrier = null;
      c.p = [p.p[0], this.level.groundUnder(p.p[0], p.p[2], 0.2), p.p[2]];
      this.emit({ e: 'core', state: 'dropped', p: c.p });
    }
  }

  // ───────────── damage ─────────────
  applyDamage(t, by, amount, part, src) {
    if (!t.alive || amount <= 0) return;
    if (t.spawnProtect > 0 && this.mode === 'dm') return;
    if (this.mode === 'range' && !t.bot) return;
    let dmg = amount;
    // shields soak 66% of damage until they break
    if (t.armor > 0 && src !== 'core') {
      const soak = Math.min(t.armor, dmg * 0.66);
      t.armor -= soak;
      dmg -= soak;
    }
    t.hp -= dmg;
    t.lastHit = this.time;
    if (by) t.dmgBy.set(by.id, (t.dmgBy.get(by.id) || 0) + amount);
    this.emit({ e: 'dmg', id: t.id, by: by ? by.id : null, amount: Math.round(amount), hp: Math.max(0, Math.round(t.hp)), armor: Math.round(t.armor), part, src });
    if (t.brain && by) t.brain.hurt(by);
    if (t.hp <= 0) this.kill(t, by, src, part === 0);
  }

  kill(t, by, src, head) {
    t.alive = false;
    t.hp = 0;
    t.deaths++;
    t.heal = null;
    if (t.hasCore) this.dropCore(t);
    if (this.core.defuser === t.id) this.cancelDefuse();
    if (this.core.state === 'planting' && this.core.carrier === t.id) { this.core.state = 'dropped'; this.core.p = [t.p[0], t.p[1], t.p[2]]; this.core.carrier = null; this.emit({ e: 'core', state: 'dropped', p: this.core.p }); }
    const ag = AGENT[t.agent];
    t.ult = Math.min(ag.abilities.x.points, t.ult + 1);
    let assist = null;
    if (by && by !== t) {
      by.kills++;
      by.score += 150 + (head ? 30 : 0);
      by.ult = Math.min(AGENT[by.agent].abilities.x.points, by.ult + 1);
      if (this.mode === 'core') by.credits = Math.min(ECON.max, by.credits + ECON.kill);
      if (by.overT > 0) by.hp = Math.min(100, by.hp + 25);
      t.dmgBy.forEach((d, id) => {
        if (id !== by.id && d >= 50) {
          const a = this.players.get(id);
          if (a) { a.assists++; a.score += 50; assist = a.id; }
        }
      });
    }
    t.corpse = [t.p[0], t.p[1], t.p[2]];
    this.emit({ e: 'kill', victim: t.id, killer: by ? by.id : null, w: src, head: !!head, assist, p: t.corpse });
    if (this.mode === 'core') this.checkRoundEnd();
    else {
      t.respawnT = TIMES.dmRespawn;
      if (this.mode === 'dm' && by && by.kills >= this.dmKills) this.endMatch(by.id);
    }
  }

  // ───────────── abilities ─────────────
  // a player (or bot) uses ability slot c/q/e/x; o = eye position, d = look direction
  ability(id, slot, o, d) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase === 'end' || this.phase === 'over') return false;
    const ab = AGENT[p.agent].abilities[slot];
    if (!ab) return false;
    if (this.mode === 'dm') return false;
    if (slot === 'x') {
      if (p.ult < ab.points && this.mode !== 'range') return false;
    } else if (p.charges[slot] <= 0 && this.mode !== 'range') return false;
    if (this.phase === 'buy' && !['wall', 'turret', 'smoke', 'slow', 'heal', 'trap'].includes(ab.kind)) return false;
    const ok = this.runAbility(p, ab, o, d);
    if (!ok) return false;
    if (slot === 'x') p.ult = 0;
    else if (this.mode !== 'range') p.charges[slot]--;
    this.emit({ e: 'loadout', id, guns: { ...p.guns }, credits: p.credits, cur: p.cur, armor: p.armor, charges: { ...p.charges }, ult: p.ult });
    return true;
  }

  runAbility(p, ab, o, d) {
    const fx = (data) => this.emit({ e: 'fx', ...data });
    const aimPoint = (maxD) => {
      const h = this.level.raycast(o, d, maxD);
      const t = h ? h.t - 0.3 : maxD;
      const x = o[0] + d[0] * t; const z = o[2] + d[2] * t;
      return [x, this.level.groundUnder(x, z, 0.1, (h ? h.y : o[1]) + 0.5), z];
    };
    switch (ab.kind) {
      case 'flash': return this.throwProj(p, o, d, 'flash', { speed: 18, lift: 0.1, fuse: 0.55 });
      case 'molly': return this.throwProj(p, o, d, 'molly', { speed: 15, lift: 0.3, fuse: 2.5, landFire: true });
      case 'concuss': return this.throwProj(p, o, d, 'concuss', { speed: 15, lift: 0.25, fuse: 1.0 });
      case 'frag': return this.throwProj(p, o, d, 'frag', { speed: 15, lift: 0.3, fuse: 1.6 });
      case 'shock': return this.throwProj(p, o, d, 'shock', { speed: 26, lift: 0.08, fuse: 4, stick: true });
      case 'recon': return this.throwProj(p, o, d, 'recon', { speed: 26, lift: 0.1, fuse: 4, stick: true });
      case 'slow': return this.throwProj(p, o, d, 'slow', { speed: 15, lift: 0.3, fuse: 2.5, landFire: true, reveal: p.agent === 'halo' });
      case 'smoke': {
        if (ab.aimed) { this.addSmoke(p, aimPoint(45)); return true; }
        return this.throwProj(p, o, d, 'smoke', { speed: 15, lift: 0.3, fuse: 2.2, landFire: true });
      }
      case 'eclipse': {
        const end = aimPoint(60);
        const dx = end[0] - p.p[0]; const dz = end[2] - p.p[2];
        const L = Math.hypot(dx, dz) || 1;
        for (let k = 0; k < 4; k++) {
          const t = Math.min(L, 10 + k * 7);
          const x = p.p[0] + (dx / L) * t; const z = p.p[2] + (dz / L) * t;
          const g = this.level.groundUnder(x, z, 0.1, 10);
          if (g < 50) this.addSmoke(p, [x, g, z], 20);
        }
        return true;
      }
      case 'dash': {
        // movement is the player's own; bots get the push here
        fx({ kind: 'dash', id: p.id, p: [...p.p] });
        if (p.bot) {
          const s = Math.hypot(p.v[0], p.v[2]) > 0.5 ? [p.v[0], p.v[2]] : [-Math.sin(p.yaw), -Math.cos(p.yaw)];
          const l = Math.hypot(s[0], s[1]) || 1;
          p.v[0] = (s[0] / l) * 17; p.v[2] = (s[1] / l) * 17;
        }
        return true;
      }
      case 'blink': {
        // teleport along the aim (flattened), stopping short of walls, onto walkable ground
        const hx = d[0]; const hz = d[2]; const hl = Math.hypot(hx, hz) || 1;
        const dir = [hx / hl, 0, hz / hl];
        const o2 = [p.p[0], p.p[1] + 1.0, p.p[2]];
        const h = this.level.raycast(o2, dir, 9);
        let dist = h ? Math.max(0, h.t - 0.6) : 9;
        let dest = null;
        for (; dist > 1; dist -= 0.5) {
          const x = p.p[0] + dir[0] * dist; const z = p.p[2] + dir[2] * dist;
          const g = this.level.groundUnder(x, z, 0.35, p.p[1] + 1.2);
          if (g < 50 && Math.abs(g - p.p[1]) < 1.6) { dest = [x, g, z]; break; }
        }
        if (!dest) return false;
        fx({ kind: 'blink', id: p.id, from: [...p.p], p: dest });
        p.p = dest; p.v = [0, 0, 0];
        return true;
      }
      case 'supernova': {
        fx({ kind: 'supernova', id: p.id, p: [p.p[0], p.p[1] + 1.4, p.p[2]] });
        const eye = [p.p[0], p.p[1] + 1.5, p.p[2]];
        this.players.forEach((q) => {
          if (!q.alive || !this.enemies(p, q)) return;
          const qe = [q.p[0], q.p[1] + eyeHeight(q.crouch), q.p[2]];
          if (Math.hypot(qe[0] - eye[0], qe[2] - eye[2]) > 25 || !this.losSmoke(eye, qe)) return;
          q.blindT = Math.max(q.blindT, 2.5);
          q.revealT = Math.max(q.revealT, 4);
          this.emit({ e: 'fx', kind: 'nova-hit', id: q.id, p: eye });
        });
        return true;
      }
      case 'toxin': return this.throwProj(p, o, d, 'toxin', { speed: 15, lift: 0.3, fuse: 2.5, landFire: true });
      case 'trap': {
        const pt = aimPoint(8);
        const t = { id: this.nextId++, owner: p.id, team: p.team, p: pt, armT: this.time + 1 };
        this.traps.push(t);
        fx({ kind: 'trap', trid: t.id, p: pt, team: p.team });
        return true;
      }
      case 'lockdown': {
        const pt = aimPoint(45);
        const z = { id: this.nextId++, kind: 'slow', p: pt, r: 11, until: this.time + 8, owner: p.id, team: p.team, reveal: true };
        this.zones.push(z);
        fx({ kind: 'slow', zid: z.id, p: z.p, r: z.r, dur: 8, big: true });
        return true;
      }
      case 'overdrive':
        p.overT = 12;
        p.armor = Math.min(100, p.armor + 50);
        fx({ kind: 'overdrive', id: p.id });
        return true;
      case 'wall': {
        const len = p.agent === 'solace' ? 5 : 7;
        const x = o[0] + d[0] * 3.5; const z = o[2] + d[2] * 3.5;
        const g = this.level.groundUnder(x, z, 0.2, p.p[1] + 1);
        // walls are axis-aligned: across the larger component of the look direction
        const alongX = Math.abs(d[2]) > Math.abs(d[0]);
        const b = alongX ? { x0: x - len / 2, x1: x + len / 2, z0: z - 0.25, z1: z + 0.25 } : { x0: x - 0.25, x1: x + 0.25, z0: z - len / 2, z1: z + len / 2 };
        b.y0 = g; b.y1 = g + 3.2;
        const w = { id: this.nextId++, box: this.level.addBox(b), hp: 800, until: this.time + (p.agent === 'solace' ? 25 : 30), team: p.team };
        this.walls.push(w);
        fx({ kind: 'wall', wid: w.id, box: b, team: p.team });
        return true;
      }
      case 'turret': {
        const pt = aimPoint(6);
        const t = { id: this.nextId++, owner: p.id, team: p.team, p: [pt[0], pt[1], pt[2]], yaw: p.yaw, hp: 125, cool: 0, until: this.time + 999 };
        this.turrets.push(t);
        fx({ kind: 'turret', tid: t.id, p: t.p, yaw: t.yaw, team: p.team });
        return true;
      }
      case 'heal': {
        let target = p;
        this.players.forEach((q) => {
          if (q === p || !q.alive || q.team !== p.team || this.mode !== 'core') return;
          const e = [q.p[0], q.p[1] + 1.2, q.p[2]];
          const vx = e[0] - o[0]; const vy = e[1] - o[1]; const vz = e[2] - o[2];
          const L = Math.hypot(vx, vy, vz);
          if (L < 15 && (vx * d[0] + vy * d[1] + vz * d[2]) / L > 0.96 && this.level.los(o, e)) target = q;
        });
        if (target.hp >= 100) return false;
        target.heal = { rate: 20, left: 60 };
        fx({ kind: 'heal', id: target.id });
        return true;
      }
      case 'bastion':
        this.players.forEach((q) => {
          if (!q.alive || q.team !== p.team || Math.hypot(q.p[0] - p.p[0], q.p[2] - p.p[2]) > 12) return;
          q.hp = 100;
          q.armor = Math.min(100, q.armor + 50);
          fx({ kind: 'heal', id: q.id, big: true });
        });
        return true;
      case 'revive': {
        let best = null;
        this.players.forEach((q) => {
          if (q.alive || q.team !== p.team || !q.corpse) return;
          const dd = Math.hypot(q.corpse[0] - p.p[0], q.corpse[2] - p.p[2]);
          if (dd < 12 && (!best || dd < best.d)) best = { q, d: dd };
        });
        if (!best) return false;
        const q = best.q;
        q.alive = true; q.hp = 100; q.p = [...q.corpse]; q.v = [0, 0, 0];
        q.guns.primary = q.guns.primary || null;
        this.emit({ e: 'spawn', id: q.id, p: q.p, yaw: q.yaw, revive: true });
        fx({ kind: 'heal', id: q.id, big: true });
        return true;
      }
      case 'hunt':
        for (let k = 0; k < 3; k++) {
          this.strikes.push({ kind: 'reveal-all', t: this.time + k * 2.2, team: p.team, owner: p.id });
        }
        fx({ kind: 'hunt', team: p.team });
        return true;
      case 'orbital': {
        const pt = aimPoint(70);
        this.strikes.push({ kind: 'orbital', t: this.time + 2.5, p: pt, owner: p.id, team: p.team });
        fx({ kind: 'orbital', p: pt, delay: 2.5 });
        return true;
      }
      default: return false;
    }
  }

  throwProj(p, o, d, kind, opt) {
    const v = throwVelocity(d, opt.speed, opt.lift);
    const pr = { id: this.nextId++, kind, owner: p.id, team: p.team, p: [...o], v, t: 0, fuse: opt.fuse, stick: !!opt.stick, landFire: !!opt.landFire, reveal: !!opt.reveal };
    this.projs.push(pr);
    this.emit({ e: 'fx', kind: 'throw', pid: pr.id, what: kind, o, v, stick: pr.stick });
    return true;
  }

  addSmoke(p, pt, dur = 18, pid = null) {
    const z = { id: this.nextId++, kind: 'smoke', p: [pt[0], pt[1] + 1.6, pt[2]], r: 4.6, until: this.time + dur, team: p.team };
    this.zones.push(z);
    this.emit({ e: 'fx', kind: 'smoke', zid: z.id, p: z.p, r: z.r, dur, pid });
  }

  updateEffects(dt) {
    const L = this.level;
    // projectiles
    for (const pr of [...this.projs]) {
      pr.t += dt;
      stepProjectile(L, pr, dt);
      const done = (pr.landFire && pr.landed) || pr.t >= pr.fuse || (pr.stick && pr.landed);
      if (!done) continue;
      this.projs.splice(this.projs.indexOf(pr), 1);
      this.detonate(pr);
    }
    // zones: smoke, fire, slow
    for (const z of [...this.zones]) {
      if (this.time >= z.until) {
        this.zones.splice(this.zones.indexOf(z), 1);
        this.emit({ e: 'fx', kind: 'end', zid: z.id });
        continue;
      }
      if (z.kind === 'fire' || z.kind === 'slow' || z.kind === 'toxin') {
        this.players.forEach((q) => {
          if (!q.alive) return;
          const inside = Math.hypot(q.p[0] - z.p[0], q.p[2] - z.p[2]) < z.r && Math.abs(q.p[1] - z.p[1]) < 2;
          if (!inside) return;
          if (z.kind === 'toxin') {
            const own = this.players.get(z.owner);
            if (own && !this.enemies(own, q)) return;
            this.applyDamage(q, own || null, 15 * dt, 1, 'toxin');
            q.revealT = Math.max(q.revealT, 0.3);
          } else if (z.kind === 'fire') {
            const own = this.players.get(z.owner);
            if (own && own.agent === 'vex' && q === own) { q.hp = Math.min(100, q.hp + 12 * dt); return; }
            if (own && !this.enemies(own, q) && q !== own) return;
            this.applyDamage(q, own && own !== q ? own : null, 60 * dt, 1, 'molly');
          } else {
            const own = this.players.get(z.owner);
            if (own && !this.enemies(own, q)) return;
            q.slowT = Math.max(q.slowT, 0.3);
            if (z.reveal) q.revealT = Math.max(q.revealT, 0.5);
          }
        });
      }
    }
    // ability walls
    for (const w of [...this.walls]) {
      if (this.time >= w.until || w.hp <= 0) {
        this.walls.splice(this.walls.indexOf(w), 1);
        L.removeBox(w.box);
        this.emit({ e: 'fx', kind: 'end', wid: w.id });
      }
    }
    // turrets shoot the nearest visible enemy in front of them
    for (const t of [...this.turrets]) {
      if (t.hp <= 0) {
        this.turrets.splice(this.turrets.indexOf(t), 1);
        this.emit({ e: 'fx', kind: 'end', tid: t.id });
        continue;
      }
      t.cool -= dt;
      if (t.cool > 0 || (this.phase !== 'live' && this.phase !== 'planted' && this.mode === 'core')) continue;
      const eye = [t.p[0], t.p[1] + 0.9, t.p[2]];
      let best = null;
      this.players.forEach((q) => {
        if (!q.alive || q.team === t.team) return;
        const dx = q.p[0] - t.p[0]; const dz = q.p[2] - t.p[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 32) return;
        const ang = Math.atan2(-dx, -dz);
        let da = Math.abs(ang - t.yaw) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > 0.9) return;
        const tgt = [q.p[0], q.p[1] + 1.1, q.p[2]];
        if (!this.losSmoke(eye, tgt)) return;
        if (!best || dist < best.dist) best = { q, dist, tgt };
      });
      if (best) {
        t.cool = 0.26;
        const own = this.players.get(t.owner);
        this.applyDamage(best.q, own || null, 9, 1, 'turret');
        best.q.slowT = Math.max(best.q.slowT, 0.3);
        this.emit({ e: 'fire', id: `t${t.id}`, w: 'turret', o: eye, ends: [best.tgt] });
      }
    }
    // sensor traps: the first enemy within 3.5 m sets one off
    for (const t of [...this.traps]) {
      if (this.time < t.armT) continue;
      const own = this.players.get(t.owner);
      let hit = null;
      this.players.forEach((q) => {
        if (hit || !q.alive || q.team === t.team || (own && !this.enemies(own, q))) return;
        if (Math.hypot(q.p[0] - t.p[0], q.p[2] - t.p[2]) < 3.5 && Math.abs(q.p[1] - t.p[1]) < 2 && this.level.los([t.p[0], t.p[1] + 0.3, t.p[2]], [q.p[0], q.p[1] + 1, q.p[2]])) hit = q;
      });
      if (!hit) continue;
      this.traps.splice(this.traps.indexOf(t), 1);
      hit.concussT = Math.max(hit.concussT, 3);
      hit.revealT = Math.max(hit.revealT, 4);
      hit.slowT = Math.max(hit.slowT, 2);
      this.emit({ e: 'fx', kind: 'concuss', p: [t.p[0], t.p[1] + 0.4, t.p[2]] });
      this.emit({ e: 'fx', kind: 'end', trid: t.id });
      this.emit({ e: 'msg-team', team: t.team, text: `${hit.name} triggered a sensor` });
    }
    // delayed strikes and reveals
    for (const s of [...this.strikes]) {
      if (this.time < s.t) continue;
      this.strikes.splice(this.strikes.indexOf(s), 1);
      const own = this.players.get(s.owner);
      if (s.kind === 'orbital') {
        this.emit({ e: 'fx', kind: 'blast', p: s.p, r: 6, big: true });
        this.players.forEach((q) => {
          if (!q.alive || (own && !this.enemies(own, q) && q !== own)) return;
          const d = Math.hypot(q.p[0] - s.p[0], q.p[2] - s.p[2]);
          if (d < 8) this.applyDamage(q, own || null, d < 5 ? 200 : 60, 1, 'orbital');
        });
      } else if (s.kind === 'reveal-all') {
        this.players.forEach((q) => { if (q.alive && q.team !== s.team) q.revealT = Math.max(q.revealT, 1.6); });
        this.emit({ e: 'fx', kind: 'pulse', team: s.team, all: true });
      } else if (s.kind === 'reveal') {
        this.revealAround(s.p, 22, s.team);
      }
    }
  }

  detonate(pr) {
    const own = this.players.get(pr.owner);
    const p = pr.p;
    const fx = (data) => this.emit({ e: 'fx', pid: pr.id, ...data });
    switch (pr.kind) {
      case 'flash': {
        fx({ kind: 'flash', p });
        this.players.forEach((q) => {
          if (!q.alive) return;
          const eye = [q.p[0], q.p[1] + eyeHeight(q.crouch), q.p[2]];
          const dx = p[0] - eye[0]; const dy = p[1] - eye[1]; const dz = p[2] - eye[2];
          const L = Math.hypot(dx, dy, dz);
          if (L > 40 || !this.losSmoke(eye, p)) return;
          const look = [-Math.sin(q.yaw) * Math.cos(q.pitch), Math.sin(q.pitch), -Math.cos(q.yaw) * Math.cos(q.pitch)];
          const dot = (look[0] * dx + look[1] * dy + look[2] * dz) / L;
          const k = dot > 0.5 ? 1 : dot > 0 ? 0.55 : dot > -0.5 ? 0.25 : 0;
          if (k > 0) q.blindT = Math.max(q.blindT, 2.2 * k);
          // the client shows its own flash from the event; bots are blinded here
        });
        break;
      }
      case 'molly': {
        const g = this.level.groundUnder(p[0], p[2], 0.1, p[1] + 0.5);
        const z = { id: this.nextId++, kind: 'fire', p: [p[0], g, p[2]], r: 3.4, until: this.time + 7, owner: pr.owner, team: pr.team };
        this.zones.push(z);
        fx({ kind: 'fire', zid: z.id, p: z.p, r: z.r, dur: 7 });
        break;
      }
      case 'toxin': {
        const g = this.level.groundUnder(p[0], p[2], 0.1, p[1] + 0.5);
        const z = { id: this.nextId++, kind: 'toxin', p: [p[0], g, p[2]], r: 4, until: this.time + 9, owner: pr.owner, team: pr.team };
        this.zones.push(z);
        fx({ kind: 'toxin', zid: z.id, p: z.p, r: z.r, dur: 9 });
        break;
      }
      case 'slow': {
        const g = this.level.groundUnder(p[0], p[2], 0.1, p[1] + 0.5);
        const z = { id: this.nextId++, kind: 'slow', p: [p[0], g, p[2]], r: 4.2, until: this.time + 7, owner: pr.owner, team: pr.team, reveal: pr.reveal };
        this.zones.push(z);
        fx({ kind: 'slow', zid: z.id, p: z.p, r: z.r, dur: 7 });
        break;
      }
      case 'smoke': {
        const g = this.level.groundUnder(p[0], p[2], 0.1, p[1] + 0.5);
        if (own) this.addSmoke(own, [p[0], g, p[2]], 15, pr.id);
        break;
      }
      case 'concuss': {
        fx({ kind: 'concuss', p });
        this.players.forEach((q) => {
          if (!q.alive || (own && !this.enemies(own, q))) return;
          if (Math.hypot(q.p[0] - p[0], q.p[1] - p[1], q.p[2] - p[2]) < 6.5 && this.level.los(p, [q.p[0], q.p[1] + 1.2, q.p[2]])) q.concussT = 3;
        });
        break;
      }
      case 'frag':
      case 'shock': {
        const R = pr.kind === 'frag' ? 6.5 : 4.5;
        const max = pr.kind === 'frag' ? 120 : 75;
        fx({ kind: 'blast', p, r: R });
        this.players.forEach((q) => {
          if (!q.alive) return;
          if (own && !this.enemies(own, q) && q !== own) return;
          const c = [q.p[0], q.p[1] + 1.0, q.p[2]];
          const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
          if (d > R || !this.level.los(p, c)) return;
          const dmg = max * (1 - (d / R) * 0.8) * (q === own ? 0.5 : 1);
          this.applyDamage(q, own && own !== q ? own : null, dmg, 1, pr.kind);
        });
        break;
      }
      case 'recon': {
        fx({ kind: 'pulse', p, team: pr.team });
        this.revealAround(p, 22, pr.team);
        this.strikes.push({ kind: 'reveal', t: this.time + 2.5, p, team: pr.team });
        break;
      }
      default: break;
    }
  }

  revealAround(p, r, team) {
    this.emit({ e: 'fx', kind: 'pulse', p, team });
    this.players.forEach((q) => {
      if (!q.alive || q.team === team) return;
      const c = [q.p[0], q.p[1] + 1.2, q.p[2]];
      if (Math.hypot(c[0] - p[0], c[2] - p[2]) < r && this.level.los([p[0], p[1] + 0.3, p[2]], c)) q.revealT = Math.max(q.revealT, 2);
    });
  }

  damageObject(id, dmg, by) {
    const w = this.walls.find((x) => x.id === id);
    if (w) { w.hp -= dmg; return; }
    const t = this.turrets.find((x) => x.id === id);
    if (t && (!by || t.team !== by.team)) t.hp -= dmg;
  }

  clearEffects() {
    this.zones.forEach((z) => this.emit({ e: 'fx', kind: 'end', zid: z.id }));
    this.walls.forEach((w) => { this.level.removeBox(w.box); this.emit({ e: 'fx', kind: 'end', wid: w.id }); });
    this.turrets.forEach((t) => this.emit({ e: 'fx', kind: 'end', tid: t.id }));
    this.traps.forEach((t) => this.emit({ e: 'fx', kind: 'end', trid: t.id }));
    this.traps = [];
    this.zones = [];
    this.walls = [];
    this.turrets = [];
    this.projs = [];
    this.strikes = [];
  }

  // line of sight that smoke also blocks
  losSmoke(a, b) {
    if (!this.level.los(a, b)) return false;
    for (const z of this.zones) if (z.kind === 'smoke' && segThroughSphere(a, b, { x: z.p[0], y: z.p[1], z: z.p[2], r: z.r * 0.92 })) return false;
    return true;
  }

  // ───────────── bot shooting ─────────────
  // a bot fires its current weapon along d from eye position o; resolves hits against everyone
  hitscan(shooter, o, d, w, spreadDeg) {
    const pellets = w.pellets || 1;
    const ends = [];
    const hits = [];
    const objs = [];
    for (let k = 0; k < pellets; k++) {
      const dir = spreadDir(d, spreadDeg, this.rnd);
      const wall = this.level.raycast(o, dir, 200);
      let maxT = wall ? wall.t : 200;
      // smoke does not stop bullets but walls (abilities) can take damage
      if (wall && wall.box) {
        const wl = this.walls.find((x) => x.box === wall.box);
        if (wl) objs.push({ id: wl.id, dmg: w.dmg[1] });
      }
      let best = null;
      this.players.forEach((q) => {
        if (q === shooter || !q.alive || !this.enemies(shooter, q)) return;
        const h = rayPlayer(o, dir, q.p, q.crouch, maxT);
        if (h && (!best || h.t < best.t)) best = { ...h, q };
      });
      for (const t of this.turrets) {
        if (t.team === shooter.team) continue;
        const dx = t.p[0] - o[0]; const dy = t.p[1] + 0.6 - o[1]; const dz = t.p[2] - o[2];
        const b = dx * dir[0] + dy * dir[1] + dz * dir[2];
        if (b < 0 || b > maxT) continue;
        const dd = dx * dx + dy * dy + dz * dz - b * b;
        if (dd < 0.36 && (!best || b < best.t)) best = { t: b, turret: t };
      }
      if (best) {
        maxT = best.t;
        if (best.turret) objs.push({ id: best.turret.id, dmg: w.dmg[1] });
        else hits.push({ id: best.q.id, part: best.part, dist: best.t });
      }
      ends.push([o[0] + dir[0] * maxT, o[1] + dir[1] * maxT, o[2] + dir[2] * maxT]);
    }
    this.fire(shooter.id, { w: w.id, o, ends, hits, objs, n: 1 });
    return hits;
  }

  // ───────────── network snapshot ─────────────
  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const pl = [];
    this.players.forEach((p) => {
      const flags = (p.alive ? 1 : 0) | (p.hasCore ? 2 : 0) | (p.revealT > 0 ? 4 : 0) | (p.overT > 0 ? 8 : 0) | (p.blindT > 0 ? 16 : 0) | (p.concussT > 0 ? 32 : 0) | (p.slowT > 0 ? 64 : 0);
      pl.push([p.id, r2(p.p[0]), r2(p.p[1]), r2(p.p[2]), r2(p.yaw), r2(p.pitch), r2(p.crouch), p.cur === 'primary' ? p.guns.primary : p.cur === 'secondary' ? p.guns.secondary : 'knife', Math.ceil(p.hp), Math.round(p.armor), flags, p.credits, p.kills, p.deaths, p.assists, p.ult, r2(p.v[0]), r2(p.v[2])]);
    });
    const c = this.core;
    return {
      t: 'snap', ph: this.phase, pt: r2(this.phaseT), rd: this.round, sc: [this.score.red, this.score.blue], sd: this.sides.red,
      core: [c.state, c.carrier, r2(c.p[0]), r2(c.p[1]), r2(c.p[2]), r2(c.fuse), r2(c.plantT), r2(c.defuseT), c.defuser],
      pl,
    };
  }
}
