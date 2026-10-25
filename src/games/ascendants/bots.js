// Ascendants bots: they pick a landing spot and jump from the dropship, loot crates and dropped
// techniques, keep ahead of the storm (flying when it's far), stick with their squad and revive downed
// teammates, and fight like anime heroes: they take to the air after flying enemies, charge ki when low,
// poke with blasts and beams, rush in with combos and heavy smashes, vanish behind you, ascend when the
// form meter is full and mash their way through beam clashes.
import { POWER, COMBAT, CRATES, KI, clamp, wrapAngle } from './data.js';
import { eyeY } from './sim.js';

const DIFF = {
  easy: { react: 0.8, aim: 2.8, castRate: 0.35, see: 34, mash: 0.6, vanish: 0.15 },
  normal: { react: 0.45, aim: 1.6, castRate: 0.6, see: 46, mash: 1.0, vanish: 0.3 },
  hard: { react: 0.25, aim: 0.8, castRate: 0.9, see: 64, mash: 1.5, vanish: 0.55 },
};
// rough useful range for a technique kind when a bot decides to use it
const RANGE = {
  volley: 45, chargebeam: 60, ray: 70, disc: 55, bolt: 45, scatter: 40, nova: 7, cone: 9, flash: 14, rush: 24, instant: 38, lash: 24, orb: 32, line: 17, clone: 30,
  megabeam: 80, bigsphere: 70, surge: 30, meteor: 50, freeze: 15, barrage: 50, titanfist: 55,
};

export class Brain {
  constructor(m, pl, diff) {
    this.m = m;
    this.pl = pl;
    this.d = DIFF[diff] || DIFF.normal;
    this.input = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, hold: false, sprint: false, down: false, flyToggle: false };
    this.think = Math.random() * 0.3;
    this.goal = null;
    this.enemy = null;
    this.seeT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.stuck = { t: 0, p: null, side: 0 };
    this.openT = 0;
    this.reviveT = 0;
    this.chargeT = 0;
    this.heavyT = 0;
    this.calm = Math.random() < 0.75;
    this.style = Math.random(); // < .4 brawler, > .7 blaster
    this.mash = this.d.mash * (0.7 + Math.random() * 0.6);
    // where to land: a crate somewhere near the ship's path
    const cr = [...m.crates.values()];
    const pick = cr[Math.floor(Math.random() * cr.length)];
    this.land = pick ? [pick.p[0], pick.p[2]] : [0, 0];
    const s = m.ship;
    const dx = s.b[0] - s.a[0]; const dz = s.b[2] - s.a[2];
    const f = ((this.land[0] - s.a[0]) * dx + (this.land[1] - s.a[2]) * dz) / (dx * dx + dz * dz);
    this.dropF = clamp(f - 0.05 + Math.random() * 0.06, 0.08, 0.84);
    const px = s.a[0] + dx * this.dropF; const pz = s.a[2] + dz * this.dropF;
    if (Math.hypot(px - this.land[0], pz - this.land[1]) > 420) this.land = [px * 0.8, pz * 0.8];
  }
  // how hard this bot pushes in a beam clash right now
  mashRate() { return this.mash * (0.6 + Math.random() * 0.8); }

  update(dt) {
    const m = this.m; const pl = this.pl; const inp = this.input;
    inp.jump = false; inp.flyToggle = false;
    if (pl.mode === 'ship') {
      const s = m.ship;
      if ((s.t * 48) / s.len >= this.dropF) m.dropOut(pl);
      return;
    }
    if (pl.mode === 'fall' || pl.mode === 'glide') {
      const dx = this.land[0] - pl.p[0]; const dz = this.land[1] - pl.p[2];
      inp.yaw = Math.atan2(-dx, -dz);
      inp.mz = Math.hypot(dx, dz) > 6 ? 1 : 0; inp.mx = 0;
      inp.hold = true;
      return;
    }
    inp.hold = false; inp.down = false;
    this.think -= dt; this.strafeT -= dt; this.seeT -= dt; this.comboT -= dt; this.heavyT -= dt;
    if (this.think <= 0) { this.think = 0.25 + Math.random() * 0.1; this.decide(); }
    pl.charging = false;
    if (pl.frozen > 0 || pl.held > 0 || pl.tumble > 0) {
      inp.mx = 0; inp.mz = 0;
      // recover from a tumble by vanishing, sometimes
      if (pl.tumble > 0.6 && pl.ki > KI.vanish + 10 && Math.random() < dt * this.d.vanish * 2) m.vanish(pl, {});
      return;
    }
    if (pl.downed) { this.crawl(dt); return; }
    // ascend when the meter is full
    if (pl.formMeter >= 100 && pl.form < 2 && (this.enemy || pl.form === 1) && Math.random() < dt * 1.5) m.transform(pl);
    const e = this.enemy && this.enemy.alive ? this.enemy : null;
    if (e && this.seeT <= 0 && !(pl.blind > 0)) this.fight(e, dt);
    else this.travel(dt);
    // power up when it's quiet and ki is low
    if (!e && !pl.using && pl.ki < 55 && this.goal && this.goal.why !== 'zone') {
      this.chargeT += dt;
      if (this.chargeT > 1.2 && pl.ki < 95) { pl.charging = true; inp.mx = 0; inp.mz = 0; }
    } else this.chargeT = 0;
    // heal up when it's quiet
    if (!e && !pl.using) {
      if (pl.hp < 65 && pl.items.medkit > 0) m.useItem(pl, 'medkit');
      else if (pl.shield < 50 && pl.items.cell > 0) m.useItem(pl, 'cell');
    }
    if (pl.using) { inp.mx = 0; inp.mz = 0; }
  }

  crawl() {
    // downed: crawl toward the nearest standing teammate
    const m = this.m; const pl = this.pl; const inp = this.input;
    let best = null; let bd = 80;
    for (const o of m.players.values()) if (o !== pl && o.alive && !o.downed && o.team === pl.team) { const d = Math.hypot(o.p[0] - pl.p[0], o.p[2] - pl.p[2]); if (d < bd) { bd = d; best = o; } }
    if (best && bd > 2) { inp.yaw = Math.atan2(-(best.p[0] - pl.p[0]), -(best.p[2] - pl.p[2])); inp.mz = 1; } else inp.mz = 0;
    inp.mx = 0;
  }

  decide() {
    const m = this.m; const pl = this.pl;
    // look for enemies (closest visible one)
    let best = null; let bd = this.d.see;
    const eye = [pl.p[0], pl.p[1] + 1.6, pl.p[2]];
    for (const o of m.players.values()) {
      if (!o.alive || o === pl || o.mode === 'ship' || m.sameTeam(pl, o)) continue;
      const d = Math.hypot(o.p[0] - pl.p[0], o.p[1] - pl.p[1], o.p[2] - pl.p[2]) * (o.downed ? 1.6 : 1);
      if (d < bd && (d < 6 || m.island.los(eye, [o.p[0], o.p[1] + 1.4, o.p[2]]))) { bd = d; best = o; }
    }
    // a fighting copy may fool them
    for (const ent of m.ents.values()) if (ent.kind === 'clone' && ent.owner !== pl.id && Math.hypot(ent.p[0] - pl.p[0], ent.p[2] - pl.p[2]) < bd * 0.7 && Math.random() < 0.4) { best = { id: ent.owner, p: ent.p, alive: true, clone: true, v: [0, 0, 0], mode: 'ground' }; }
    if (best && (!this.enemy || this.enemy.id !== best.id)) this.seeT = this.d.react * (0.7 + Math.random() * 0.6);
    // somebody hitting us that we can't see? turn on them
    if (!best && pl.lastHitBy && m.time - pl.lastHitT < 2) { const a = m.players.get(pl.lastHitBy); if (a && a.alive && Math.hypot(a.p[0] - pl.p[0], a.p[2] - pl.p[2]) < 90) best = a; }
    // early on, most bots would rather loot than brawl unless someone is right on top of them
    const landedFor = m.time - (this.landT ?? (this.landT = m.time));
    if (best && landedFor < 80 && bd > 14 && !(pl.lastHitBy && m.time - pl.lastHitT < 3) && this.calm) best = null;
    if (best && pl.hp + pl.shield < 30 && bd > 22) best = null;
    if (pl.blind > 0) best = null;
    this.enemy = best;
    // goal when not fighting
    const st = m.storm;
    const safe = st.to || st;
    const distSafe = Math.hypot(pl.p[0] - safe.c[0], pl.p[2] - safe.c[1]);
    const inDanger = m.inStorm(pl.p, 8) || (st.shrinking && distSafe > safe.r * 0.85) || (st.t < 25 && distSafe > safe.r);
    // get out of a bombardment zone
    const R = m.red;
    if (R && Math.hypot(pl.p[0] - R.c[0], pl.p[2] - R.c[1]) < R.r + 8) {
      const a = Math.atan2(pl.p[2] - R.c[1], pl.p[0] - R.c[0]);
      this.goal = { p: [R.c[0] + Math.cos(a) * (R.r + 30), R.c[1] + Math.sin(a) * (R.r + 30)], why: 'zone' };
      return;
    }
    if (inDanger) {
      const a = Math.atan2(pl.p[2] - safe.c[1], pl.p[0] - safe.c[0]);
      this.goal = { p: [safe.c[0] + Math.cos(a) * safe.r * 0.45, safe.c[1] + Math.sin(a) * safe.r * 0.45], why: 'zone' };
      return;
    }
    // a downed teammate nearby? go and pick them up
    for (const o of m.players.values()) {
      if (o !== pl && o.alive && o.downed && o.team === pl.team && Math.hypot(o.p[0] - pl.p[0], o.p[2] - pl.p[2]) < 90 && !best) {
        this.goal = { p: [o.p[0], o.p[2]], why: 'revive', id: o.id };
        return;
      }
    }
    if (this.goal && this.goal.why === 'revive') { this.goal = null; this.reviveT = 0; }
    // loot lying around (techniques first)
    let lb = null; let ld = 45;
    for (const l of m.loot.values()) {
      const d = Math.hypot(l.p[0] - pl.p[0], l.p[2] - pl.p[2]);
      const want = l.kind === 'power' ? (pl.powers[l.power] || 0) < 3 : pl.items[l.item] < 3;
      if (want && d < ld) { ld = d; lb = l; }
    }
    if (lb) { this.goal = { p: [lb.p[0], lb.p[2]], why: 'loot' }; return; }
    // stay near the squad leader
    if (m.teamSize > 1) {
      const lead = [...m.players.values()].find((o) => o.alive && !o.downed && o.team === pl.team && o !== pl && (!o.bot || o.id < pl.id));
      if (lead && Math.hypot(lead.p[0] - pl.p[0], lead.p[2] - pl.p[2]) > 60) { this.goal = { p: [lead.p[0], lead.p[2]], why: 'squad' }; return; }
    }
    // crates
    if (!this.goal || this.goal.why !== 'crate' || m.crates.get(this.goal.crate).open) {
      let cb = null; let cd = 170;
      for (const c of m.crates.values()) {
        if (c.open || m.inStorm(c.p, 15)) continue;
        const d = Math.hypot(c.p[0] - pl.p[0], c.p[2] - pl.p[2]) - (c.tier === 'supply' ? 90 : c.tier === 'legendary' ? 30 : c.tier === 'rare' ? 15 : 0);
        if (d < cd) { cd = d; cb = c; }
      }
      if (cb) { this.goal = { p: [cb.p[0], cb.p[2]], why: 'crate', crate: cb.id }; this.openT = 0; return; }
    }
    if (this.goal && this.goal.why === 'crate') return;
    // wander inside the safe area
    if (!this.goal || Math.hypot(pl.p[0] - this.goal.p[0], pl.p[2] - this.goal.p[1]) < 6) {
      const a = Math.random() * Math.PI * 2; const r = Math.sqrt(Math.random()) * safe.r * 0.7;
      this.goal = { p: [safe.c[0] + Math.cos(a) * r, safe.c[1] + Math.sin(a) * r], why: 'roam' };
    }
  }

  // walk (or fly, when far) toward the goal, open crates, revive, get around obstacles and water
  travel(dt) {
    const m = this.m; const pl = this.pl; const inp = this.input;
    if (!this.goal) { inp.mz = 0; inp.mx = 0; this.land2(); return; }
    const dx = this.goal.p[0] - pl.p[0]; const dz = this.goal.p[1] - pl.p[2]; const d = Math.hypot(dx, dz);
    let yaw = Math.atan2(-dx, -dz);
    if (this.goal.why === 'crate' && d < 2.8) {
      inp.mz = 0; inp.mx = 0;
      if (pl.mode === 'fly') { inp.down = true; inp.yaw = yaw; return; }
      const c = m.crates.get(this.goal.crate);
      if (c && !c.open) { this.openT += dt; if (this.openT >= CRATES[c.tier].open) { m.openCrate(pl, c.id); this.goal = null; } } else this.goal = null;
      inp.yaw = yaw;
      return;
    }
    if (this.goal.why === 'revive' && d < 2.6) {
      inp.mz = 0; inp.mx = 0; inp.yaw = yaw;
      if (pl.mode === 'fly') { inp.down = true; return; }
      this.reviveT += dt;
      if (this.reviveT > 4.1) { m.revive(pl, this.goal.id); this.goal = null; this.reviveT = 0; }
      return;
    }
    // fly for long trips (and over the sea)
    const wantFly = d > 110 || m.island.height(pl.p[0] - Math.sin(yaw) * 12, pl.p[2] - Math.cos(yaw) * 12) < 0;
    if (pl.mode === 'fly') {
      const gh = m.island.height(pl.p[0], pl.p[2]);
      const ahead = m.island.height(pl.p[0] - Math.sin(yaw) * 25, pl.p[2] - Math.cos(yaw) * 25);
      const cruise = d < 30 ? Math.max(gh, 0) + 2 : Math.max(gh, ahead, 0) + 22;
      inp.pitch = clamp(Math.atan2(cruise - pl.p[1], Math.max(8, Math.min(d, 40))), -0.9, 0.9);
      inp.sprint = d > 140 && pl.ki > 35;
      if (d < 18) { inp.down = true; inp.pitch = -0.5; }
    } else {
      if (wantFly && pl.ki > 10 && Math.random() < dt * 2) inp.flyToggle = true;
      inp.pitch = 0;
      // steer around the sea when the target is on land
      const ahead = (a, r) => m.island.height(pl.p[0] - Math.sin(a) * r, pl.p[2] - Math.cos(a) * r);
      if (pl.mode !== 'swim' && ahead(yaw, 7) < 0.3 && m.island.height(this.goal.p[0], this.goal.p[1]) > 0.5) {
        for (const off of [0.6, -0.6, 1.2, -1.2]) if (ahead(yaw + off, 7) > 0.5) { yaw += off; break; }
      }
      inp.sprint = d > 20 && (pl.stamina ?? 6) > 2;
      this.unstick(dt);
    }
    inp.yaw = yaw + (pl.mode === 'fly' ? 0 : this.stuck.side);
    inp.mz = 1; inp.mx = 0;
  }
  land2() { if (this.pl.mode === 'fly') this.input.down = true; }

  unstick(dt) {
    const pl = this.pl; const s = this.stuck;
    s.t += dt;
    if (s.t > 0.8) {
      const moved = s.p ? Math.hypot(pl.p[0] - s.p[0], pl.p[2] - s.p[2]) : 9;
      if (moved < 1.2 && this.input.mz > 0) {
        // stuck on something: hop over it, or just fly
        if (Math.random() < 0.35 && pl.ki > 20) this.input.flyToggle = true; else this.input.jump = true;
        s.side = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6); s.hold = 0.9;
      } else if ((s.hold || 0) <= 0) s.side = 0;
      s.t = 0; s.p = pl.p.slice();
    }
    if (s.hold > 0) s.hold -= dt;
  }

  fight(e, dt) {
    const m = this.m; const pl = this.pl; const inp = this.input;
    const dx = e.p[0] - pl.p[0]; const dz = e.p[2] - pl.p[2]; const dy = (e.p[1] + 1.1) - (pl.p[1] + eyeY(pl));
    const d = Math.hypot(dx, dz); const d3 = Math.hypot(d, dy);
    const yaw = Math.atan2(-dx, -dz);
    inp.yaw = yaw;
    inp.pitch = Math.atan2(dy, d);
    if (pl.stance > 0) { inp.mx = 0; inp.mz = 0; this.aimAt(e, d3); return; }
    const hpFrac = (pl.hp + pl.shield * 0.5) / COMBAT.hp;
    const ready = this.readyPowers();
    const hasRanged = ready.some((p) => ['poke', 'zone'].includes(POWER[p].bot));
    const brawler = this.style < 0.4;
    const want = hpFrac < 0.35 ? 30 : brawler ? 1.6 : hasRanged ? (this.style > 0.7 ? 22 : 14) : 1.6;
    // go airborne after flying enemies (and sometimes just to fight in the sky)
    if (pl.mode !== 'fly' && (e.mode === 'fly' && dy > 3) && pl.ki > 8 && Math.random() < dt * 3) inp.flyToggle = true;
    if (pl.mode === 'fly' && e.mode !== 'fly' && d3 < 6 && Math.random() < dt) inp.down = true;
    // movement: close in or keep distance, strafe
    if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.2 && pl.mode !== 'fly') inp.jump = true; }
    inp.mz = d3 > want + 3 ? 1 : d3 < want - 3 ? -1 : 0;
    inp.mx = this.strafe * (d3 < 4 ? 0.5 : 0.9);
    inp.sprint = d3 > 25 && (pl.mode !== 'fly' || pl.ki > 30);
    if (pl.mode === 'fly') { inp.hold = dy > 2; inp.down = dy < -2 && !inp.down ? true : inp.down; } else this.unstick(dt);
    if (this.stuck.side && pl.mode !== 'fly') inp.mx = Math.sign(this.stuck.side);
    const aim = this.aimAt(e, d3);
    if (e.clone) return;
    // low on ki and out of reach: power up
    if (pl.ki < 18 && d3 > 25 && Math.random() < dt * 2) { pl.charging = true; inp.mx = 0; inp.mz = 0; return; }
    // vanish behind them now and then (or out of trouble)
    if (pl.ki > KI.vanish + 8 && d3 < 22 && Math.random() < dt * this.d.vanish * (hpFrac < 0.4 ? 1.5 : 0.5)) { m.vanish(pl, { lock: e.id }); return; }
    // hurt: heal, shield or escape
    if (hpFrac < 0.4 && Math.random() < 0.08 && this.useRole(['heal', 'defend', 'escape'], aim, d3, e)) return;
    // ultimate when it would land
    if (pl.ult && pl.ultCharge >= COMBAT.ultCharge && Math.random() < 0.06 * this.d.castRate) {
      const U = POWER[pl.ult];
      if (d3 < (RANGE[U.kind] || 30)) { m.tryCast(pl, 3, { aim, yaw, pitch: inp.pitch, lock: e.id }); return; }
    }
    // techniques
    if (Math.random() < 0.08 * this.d.castRate) {
      const roles = d3 < 7 ? ['burst', 'poke', 'zone'] : d3 < 22 ? ['engage', 'poke', 'zone'] : ['poke', 'zone', 'engage'];
      if (this.useRole(roles, aim, d3, e)) return;
    }
    // rush combo up close, finishing with a heavy smash
    if (d3 < 2.6 && pl.meleeT <= 0 && Math.random() < 0.55) {
      if (this.combo >= 4 && this.heavyT <= 0 && Math.random() < 0.5) { m.heavy(pl, { yaw, pitch: inp.pitch }); this.combo = 0; this.heavyT = 2.5; return; }
      m.melee(pl, this.combo, { yaw, pitch: inp.pitch });
      this.combo = (this.combo + 1) % 5;
      this.comboT = 0.8;
    } else if (this.comboT <= 0) this.combo = 0;
  }
  aimAt(e, d) {
    const pl = this.pl;
    const err = this.d.aim * (0.4 + d / 40);
    const lead = d / 60;
    const aim = [e.p[0] + (e.v ? e.v[0] * lead : 0) + (Math.random() - 0.5) * err, e.p[1] + 1.1 + (Math.random() - 0.5) * err * 0.5, e.p[2] + (e.v ? e.v[2] * lead : 0) + (Math.random() - 0.5) * err];
    pl.lastAim = aim;
    return aim;
  }

  readyPowers() {
    const pl = this.pl;
    return pl.slots.filter((id) => id && (pl.cd[id] || 0) <= 0 && pl.ki >= (POWER[id].ki || 0));
  }
  useRole(roles, aim, d, e) {
    const pl = this.pl;
    for (const role of roles) {
      for (let i = 0; i < 3; i++) {
        const id = pl.slots[i];
        if (!id || (pl.cd[id] || 0) > 0 || pl.ki < (POWER[id].ki || 0)) continue;
        const P = POWER[id];
        if (P.bot !== role) continue;
        if (RANGE[P.kind] && d > RANGE[P.kind]) continue;
        if (P.kind === 'flash' && d > P.r) continue;
        if (this.m.tryCast(pl, i, { aim, yaw: this.input.yaw, pitch: this.input.pitch, lock: e ? e.id : null })) return true;
      }
    }
    return false;
  }
}
void wrapAngle;
