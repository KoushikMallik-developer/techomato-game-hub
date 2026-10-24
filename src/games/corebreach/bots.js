// Core Breach bots. Each bot sees (field of view, walls, smoke, flashes), hears gunfire and footsteps,
// reacts with a human-like delay, aims with error that settles over time, controls recoil, and plays
// the objective: attackers stage, execute onto a site and plant; defenders hold, rotate, retake and defuse.
import { WEAPON, AGENT, DIFFICULTY, MOVE, clamp, wrapAngle } from './data.js';
import { moveBody, eyeHeight } from './sim.js';
import { stepProjectile, throwVelocity } from './proj.js';

const DEG = Math.PI / 180;

export class Bot {
  constructor(match, p) {
    this.m = match;
    this.p = p;
    this.diff = DIFFICULTY[match.difficulty] || DIFFICULTY.normal;
    this.seen = new Map(); // enemy id -> { p, t }
    this.newRound();
  }

  newRound() {
    this.path = null;
    this.pathI = 0;
    this.goal = null;
    this.goalKey = '';
    this.repathT = 0;
    this.target = null;
    this.reactT = 0;
    this.err = [0, 0];
    this.cool = 0;
    this.burst = 0;
    this.burstPause = 0;
    this.reloadT = 0;
    this.thinkT = Math.random() * 0.2;
    this.stuckT = 0;
    this.lastPos = [...this.p.p];
    this.mode = 'idle';
    this.holdLook = null;
    this.waitT = 0;
    this.utilT = 2 + Math.random() * 6;
    this.bought = false;
    this.strafeT = 0;
    this.strafeDir = 1;
    this.planting = false;
    this.defusing = false;
    this.seen.clear();
    this.aimYaw = this.p.yaw;
    this.aimPitch = 0;
    this.spray = 0;
    this.role = null;
    this.usedSig = false;
  }

  onPlant() { this.path = null; this.goalKey = ''; this.planting = false; }

  hear(src, radius) {
    const d = Math.hypot(src.p[0] - this.p.p[0], src.p[2] - this.p.p[2]);
    if (d < radius * (this.diff.hear / 26)) this.seen.set(src.id, { p: [...src.p], t: this.m.time, heard: true });
  }

  hurt(by) {
    if (!by.p) return;
    this.seen.set(by.id, { p: [...by.p], t: this.m.time, heard: true });
    if (!this.target) this.aimTowards(by.p, true);
  }

  gun() {
    const p = this.p;
    const id = p.cur === 'primary' ? p.guns.primary : p.cur === 'secondary' ? p.guns.secondary : 'knife';
    return WEAPON[id || 'wasp'];
  }

  ammo(w) {
    const p = this.p;
    if (!p.ammo[w.id]) p.ammo[w.id] = [w.mag, w.reserve || 0];
    return p.ammo[w.id];
  }

  eye() { return [this.p.p[0], this.p.p[1] + eyeHeight(this.p.crouch), this.p.p[2]]; }

  // ───────────── main ─────────────
  update(dt) {
    const m = this.m;
    const p = this.p;
    if (m.mode === 'range') { this.rangeDummy(dt); return; }
    if (m.mode === 'core' && m.phase === 'buy') {
      if (!this.bought) this.buy();
      this.idleLook(dt);
      return;
    }
    if (m.phase === 'end' || m.phase === 'over') {
      this.drive(dt, null);
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.1;
      this.perceive();
      this.decide();
    }
    this.combat(dt);
    this.drive(dt, this.goal);
    this.useUtility(dt);
    void p;
  }

  // ───────────── senses ─────────────
  perceive() {
    const m = this.m;
    const p = this.p;
    const eye = this.eye();
    const fwd = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    let best = null;
    m.players.forEach((q) => {
      if (!q.alive || !m.enemies(p, q)) return;
      const dx = q.p[0] - p.p[0]; const dz = q.p[2] - p.p[2];
      const d = Math.hypot(dx, dz);
      if (d > 75) return;
      const inFov = (dx * fwd[0] + dz * fwd[1]) / (d || 1) > Math.cos(70 * DEG) || d < 3.5;
      if ((!inFov && q.revealT <= 0) || p.blindT > 0.4) return;
      const head = [q.p[0], q.p[1] + eyeHeight(q.crouch), q.p[2]];
      const chest = [q.p[0], q.p[1] + 1.15 - q.crouch * 0.4, q.p[2]];
      const vis = m.losSmoke(eye, head) || m.losSmoke(eye, chest);
      if (vis) {
        this.seen.set(q.id, { p: [...q.p], t: m.time });
        // share the sighting with the team
        m.intel = m.intel || {};
        m.intel[p.team] = { p: [...q.p], t: m.time, site: m.level.siteAt(q.p[0], q.p[2]) };
        if (!best || d < best.d) best = { q, d, head: m.losSmoke(eye, head) };
      } else if (q.revealT > 0) this.seen.set(q.id, { p: [...q.p], t: m.time, heard: true });
    });
    if (best) {
      if (!this.target || this.target.q !== best.q) {
        // new target: reaction time and an initial aiming error
        const surprise = this.target ? 0.55 : 1;
        this.reactT = this.diff.react * surprise * (0.75 + Math.random() * 0.6) * (p.concussT > 0 ? 1.8 : 1);
        const e = this.diff.aim * (1 + best.d / 40) * DEG * 4;
        this.err = [(Math.random() - 0.5) * e, (Math.random() - 0.5) * e * 0.6];
        this.aimHead = Math.random() < this.diff.headshot * (best.d < 25 ? 1.2 : 0.7);
      }
      this.target = best;
    } else this.target = null;
  }

  // ───────────── plans ─────────────
  decide() {
    const m = this.m;
    const p = this.p;
    if (this.target) { this.mode = 'fight'; this.fightGoal(); return; }
    if (m.mode === 'dm') { this.hunt(); return; }
    const side = m.sides[p.team];
    const c = m.core;
    if (side === 'atk') this.attack(c);
    else this.defend(c);
  }

  // stand still for long shots with rifles, strafe in close fights
  fightGoal() {
    const w = this.gun();
    const t = this.target;
    const precise = w.cat === 'rifle' || w.cat === 'sniper' || w.cat === 'heavy';
    // (the travel goal is kept; movement code pauses it while fighting)
    this.strafe = t.d < 6 || !precise || t.d < 14;
    // far-away enemies are not worth stopping for unless holding an angle with a precise gun
    this.pushThrough = t.d > 42 && w.cat !== 'sniper';
  }

  plan() {
    const m = this.m;
    m.botPlan = m.botPlan || {};
    const key = `${m.round}`;
    if (!m.botPlan[key]) {
      const site = Math.random() < 0.5 ? 'A' : 'B';
      m.botPlan[key] = { site, exec: m.time + 14 + Math.random() * 16, split: Math.random() < 0.3 };
    }
    return m.botPlan[key];
  }

  attack(c) {
    const m = this.m;
    const p = this.p;
    const L = m.level;
    const plan = this.plan();
    const site = c.state === 'planted' || c.state === 'planting' ? c.site || L.siteAt(c.p[0], c.p[2]) || plan.site : plan.site;
    const S = L.sites[site];
    // pick up a dropped Core if I'm the closest attacker
    if (c.state === 'dropped') {
      let closest = null;
      m.players.forEach((q) => { if (q.alive && m.sides[q.team] === 'atk' && (!closest || dist2(q.p, c.p) < dist2(closest.p, c.p))) closest = q; });
      if (closest === p) {
        this.setGoal(c.p, 'core');
        if (Math.hypot(p.p[0] - c.p[0], p.p[2] - c.p[2]) < 1.5) m.pickupCore(p);
        return;
      }
    }
    if (c.state === 'planted') {
      // post-plant: hold angles around the Core
      const holds = L.def.holds[site] || [];
      if (!this.post) this.post = holds.length ? holds[Math.floor(Math.random() * holds.length)] : [c.p[0], c.p[2]];
      this.setGoal([this.post[0], this.post[2] || 0, this.post[1]], `post${site}`, true);
      this.holdLook = c.p;
      return;
    }
    this.post = null;
    const executing = m.time >= plan.exec || (m.phaseT < 45);
    if (p.hasCore) {
      if (executing && L.siteAt(p.p[0], p.p[2]) === site) {
        // plant once inside the site and nobody is in sight
        if (!this.planting) { this.planting = true; m.plant(p.id, true); }
        this.goal = null;
        return;
      }
      if (executing) this.setGoal(S.c, `plant${site}`, false, [S.c[0] + (Math.random() - 0.5) * 6, S.c[1] + (Math.random() - 0.5) * 6]);
      else this.setGoal(L.def.stage[site], `stage${site}`);
      return;
    }
    if (executing) {
      if (!this.entry || this.entrySite !== site) {
        this.entry = L.randomIn(S.r);
        this.entrySite = site;
      }
      this.setGoal([this.entry[0], 0, this.entry[2]], `entry${site}`);
    } else {
      const st = L.def.stage[plan.split && this.p.id.length % 2 ? 'mid' : site];
      if (!this.stageOff) this.stageOff = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6];
      this.setGoal([st[0] + this.stageOff[0], 0, st[1] + this.stageOff[1]], `stage${site}`);
    }
  }

  defend(c) {
    const m = this.m;
    const p = this.p;
    const L = m.level;
    if (!this.role) {
      // spread the defenders over A, B and mid
      const mates = [...m.players.values()].filter((q) => q.team === p.team).map((q) => q.id).sort();
      const i = mates.indexOf(p.id);
      this.role = ['A', 'B', 'A', 'B', 'mid'][i % 5];
    }
    if (c.state === 'planted') {
      // retake and defuse
      const near = Math.hypot(p.p[0] - c.p[0], p.p[2] - c.p[2]);
      const enemiesSeen = [...this.seen.values()].some((s) => m.time - s.t < 2 && !s.heard);
      if (near < 1.8 && !enemiesSeen) {
        if (!this.defusing) { this.defusing = true; m.defuse(p.id, true); }
        this.goal = null;
        return;
      }
      if (this.defusing && near >= 1.8) { this.defusing = false; m.defuse(p.id, false); }
      this.setGoal(c.p, 'defuse');
      return;
    }
    // rotate toward fresh enemy sightings on a site
    const intel = m.intel && m.intel[p.team];
    let site = this.role;
    if (intel && m.time - intel.t < 8 && intel.site) site = intel.site;
    const holds = L.def.holds[site] || L.def.holds.A;
    if (!this.hold || this.holdSite !== site) {
      this.hold = holds[Math.floor(Math.random() * holds.length)];
      this.holdSite = site;
    }
    this.setGoal([this.hold[0], this.hold[2] || 0, this.hold[1]], `hold${site}${this.hold[0]}`, true);
    // look toward where attackers come from
    const st = L.def.stage[site === 'mid' ? 'mid' : site];
    this.holdLook = [st[0], 1, st[1]];
  }

  hunt() {
    const m = this.m;
    const p = this.p;
    let best = null;
    this.seen.forEach((s, id) => {
      const q = m.players.get(id);
      if (!q || !q.alive || m.time - s.t > 6) return;
      const d = dist2(s.p, p.p);
      if (!best || d < best.d) best = { s, d };
    });
    if (best) { this.setGoal(best.s.p, `hunt${Math.round(best.s.p[0] / 6)}${Math.round(best.s.p[2] / 6)}`); return; }
    if (!this.roam || dist2(this.roam, p.p) < 9 || m.time > (this.roamT || 0)) {
      const areas = m.level.def.areas;
      const a = areas[Math.floor(Math.random() * areas.length)];
      this.roam = m.level.randomIn(a.r);
      this.roamT = m.time + 20;
    }
    this.setGoal(this.roam, `roam${Math.round(this.roam[0])}`);
  }

  setGoal(pt, key, holdAtEnd = false, override = null) {
    if (this.goalKey !== key) {
      this.goalKey = key;
      this.goal = override ? [override[0], 0, override[1]] : [pt[0], pt[1] || 0, pt[2] !== undefined ? pt[2] : pt[1]];
      if (pt.length === 2) this.goal = override ? [override[0], 0, override[1]] : [pt[0], 0, pt[1]];
      this.path = null;
      this.holdAtEnd = holdAtEnd;
    }
  }

  // ───────────── shooting ─────────────
  combat(dt) {
    const m = this.m;
    const p = this.p;
    const w = this.gun();
    const am = w.cat === 'melee' ? null : this.ammo(w);
    this.cool -= dt;
    this.burstPause -= dt;
    this.spray = Math.max(0, this.spray - dt * (w.spread ? w.spread.recover : 8));
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && am) {
        const need = w.mag - am[0];
        const take = Math.min(need, am[1]);
        am[0] += take; am[1] -= take;
      }
    }
    // switch to the sidearm when the main gun is dry
    if (am && am[0] === 0 && am[1] === 0 && p.cur === 'primary' && p.guns.secondary) { p.cur = 'secondary'; this.cool = 0.6; return; }
    const t = this.target;
    if (!t) {
      // reload between fights
      if (am && am[0] < w.mag * 0.5 && am[1] > 0 && this.reloadT <= 0) this.reloadT = w.reload;
      this.err[0] *= 0.9; this.err[1] *= 0.9;
      return;
    }
    const q = t.q;
    const eye = this.eye();
    const aimY = this.aimHead && t.head ? q.p[1] + eyeHeight(q.crouch) + 0.03 : q.p[1] + 1.1 - q.crouch * 0.35;
    // lead slightly for moving targets
    const lead = 0.06;
    const tp = [q.p[0] + (q.v ? q.v[0] * lead : 0), aimY, q.p[2] + (q.v ? q.v[2] * lead : 0)];
    const dx = tp[0] - eye[0]; const dy = tp[1] - eye[1]; const dz = tp[2] - eye[2];
    const hd = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz) + this.err[0];
    const wantPitch = Math.atan2(dy, hd) + this.err[1];
    // the aiming error settles while tracking
    const settle = Math.exp(-dt * (2.5 + 6 / this.diff.aim));
    this.err[0] *= settle; this.err[1] *= settle;
    const turn = this.diff.turn * (p.concussT > 0 ? 0.5 : 1) * dt;
    p.yaw += clamp(wrapAngle(wantYaw - p.yaw), -turn, turn);
    p.pitch += clamp(wantPitch - p.pitch, -turn, turn);
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (p.blindT > 0.3) return;
    if (!am && w.cat === 'melee') return;
    if (this.reloadT > 0) return;
    if (am[0] <= 0) { if (am[1] > 0) this.reloadT = w.reload; return; }
    const yerr = Math.abs(wrapAngle(wantYaw - this.err[0] - p.yaw));
    const tol = Math.atan2(0.22, Math.max(2, t.d)) + 0.6 * DEG;
    if (yerr > tol * 2.4) return;
    if (this.cool > 0 || this.burstPause > 0) return;
    // fire
    const sp = w.spread;
    const moving = Math.hypot(p.v[0], p.v[2]) / MOVE.run;
    let spread = (sp.base + sp.move * moving * moving + this.spray) * this.diff.spray;
    if (w.scope) spread = sp.base * this.diff.spray + sp.move * moving;
    if (!p.ground) spread += sp.air;
    if (p.concussT > 0) spread *= 2;
    const d = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
    m.hitscan(p, eye, d, w, spread);
    am[0]--;
    this.spray = Math.min(sp.max, this.spray + sp.shot);
    // recoil kicks the bot's view up; it pulls back down on the next frames
    p.pitch += w.recoil.v * DEG * 0.5;
    const iv = 60 / w.rpm;
    this.cool = w.auto ? iv : Math.max(iv, 0.18 + Math.random() * 0.12);
    if (w.burst) { this.burst++; if (this.burst >= w.burst) { this.burst = 0; this.cool = w.burstDelay; } }
    if (w.auto) {
      this.burst++;
      const maxBurst = t.d > 30 ? 2 : t.d > 18 ? 4 : 9;
      if (this.burst >= maxBurst) { this.burst = 0; this.burstPause = 0.18 + t.d * 0.006; }
    }
  }

  aimTowards(pt, snap = false) {
    const p = this.p;
    const eye = this.eye();
    const yaw = Math.atan2(-(pt[0] - eye[0]), -(pt[2] - eye[2]));
    if (snap) p.yaw += wrapAngle(yaw - p.yaw) * 0.5;
    return yaw;
  }

  idleLook(dt) {
    const p = this.p;
    p.v[0] *= 0.8; p.v[2] *= 0.8;
    p.pitch *= 0.9;
    void dt;
  }

  // ───────────── moving ─────────────
  drive(dt, goal) {
    const m = this.m;
    const p = this.p;
    const L = m.level;
    let f = 0;
    let s = 0;
    let walk = false;
    let desiredYaw = null;
    if (goal && !this.planting && !this.defusing) {
      this.repathT -= dt;
      if (!this.path || this.repathT <= 0) {
        this.path = L.path(p.p[0], p.p[2], goal[0], goal[2]);
        this.pathI = 1;
        this.repathT = 4 + Math.random() * 2;
      }
      if (this.path && this.pathI < this.path.length) {
        const n = this.path[this.pathI];
        const dx = n[0] - p.p[0]; const dz = n[2] - p.p[2];
        const d = Math.hypot(dx, dz);
        if (d < 0.7) this.pathI++;
        const moveYaw = Math.atan2(-dx, -dz);
        // walk in that direction whichever way we're facing
        const rel = wrapAngle(moveYaw - p.yaw);
        f = Math.cos(rel);
        s = -Math.sin(rel);
        desiredYaw = moveYaw;
        if (this.pathI >= this.path.length && this.holdAtEnd) { f = 0; s = 0; }
      }
      // stuck: nudge sideways and re-path
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        if (dist2(this.lastPos, p.p) < 0.25 && (f || s)) { this.path = null; s = Math.random() < 0.5 ? 1 : -1; }
        this.stuckT = 0;
        this.lastPos = [...p.p];
      }
    }
    if (this.target && this.pushThrough && (f || s)) {
      // long range: keep moving toward the objective, shooting on the way
      desiredYaw = null;
    } else if (this.target) {
      // fighting: strafe or hold still to shoot accurately
      if (this.strafe) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.35 + Math.random() * 0.5; this.strafeDir = -this.strafeDir; }
        f = 0; s = this.strafeDir * 0.8;
      } else { f = 0; s = 0; }
      desiredYaw = null;
    } else if (!this.target) {
      // look where we're going, or toward where enemies were, or the held angle
      let look = desiredYaw;
      const recent = [...this.seen.values()].filter((x) => m.time - x.t < 5).sort((a, b) => b.t - a.t)[0];
      if (recent) look = this.aimTowards(recent.p);
      else if (this.holdLook && (!this.path || this.pathI >= this.path.length)) look = this.aimTowards(this.holdLook);
      if (look !== null) {
        const turn = 5 * dt;
        p.yaw += clamp(wrapAngle(look - p.yaw), -turn, turn);
      }
      p.pitch *= 0.92;
      walk = !!recent && Math.hypot(recent.p[0] - p.p[0], recent.p[2] - p.p[2]) < 20;
    }
    if (this.planting || this.defusing) { f = 0; s = 0; }
    const w = this.gun();
    let spd = w.speed || 1;
    if (p.slowT > 0) spd *= 0.5;
    if (p.concussT > 0) spd *= 0.7;
    if (p.overT > 0) spd *= 1.15;
    const body = { p: p.p, v: p.v, yaw: p.yaw, crouch: p.crouch, ground: p.ground };
    moveBody(L, body, { f, s, walk, crouch: this.target && this.target.d > 25 && !this.strafe && Math.random() < 0.002 }, dt, spd);
    p.crouch = body.crouch;
    p.ground = body.ground;
    if (m.phase === 'buy' && m.mode === 'core') p.v[0] = p.v[2] = 0;
  }

  // ───────────── economy ─────────────
  buy() {
    const m = this.m;
    const p = this.p;
    this.bought = true;
    const c = p.credits;
    const pistolRound = m.round === 1 || m.round === m.toWin;
    // team economy: save when broke unless it's the pistol round
    if (pistolRound) {
      if (Math.random() < 0.5) m.buy(p.id, 'light');
      else m.buy(p.id, ['hornet', 'mamba', 'bolt'][Math.floor(Math.random() * 3)]);
    } else if (c >= 3900) {
      m.buy(p.id, Math.random() < 0.5 ? 'falcon' : 'raptor');
      m.buy(p.id, 'heavy');
    } else if (c >= 3500 && Math.random() < 0.25) {
      m.buy(p.id, 'longbow');
    } else if (c >= 2400) {
      m.buy(p.id, ['ranger', 'sentinel', 'swift', 'breaker', 'viper', 'marshal', 'tempest'][Math.floor(Math.random() * 7)]);
      m.buy(p.id, c >= 3400 ? 'heavy' : 'light');
    } else if (c >= 1600 && Math.random() < 0.4) {
      m.buy(p.id, 'scout');
      m.buy(p.id, 'light');
    } else if (c >= 900) {
      m.buy(p.id, 'magnum');
    }
    // abilities with what's left
    ['c', 'q'].forEach((k) => { for (let n = 0; n < 2; n++) if (p.credits > 300) m.buy(p.id, k); });
    p.cur = p.guns.primary ? 'primary' : 'secondary';
  }

  // ───────────── abilities ─────────────
  useUtility(dt) {
    const m = this.m;
    const p = this.p;
    if (m.mode !== 'core') return;
    this.utilT -= dt;
    if (this.utilT > 0) return;
    this.utilT = 1.5 + Math.random() * 2.5;
    const ag = AGENT[p.agent];
    const side = m.sides[p.team];
    const L = m.level;
    const eye = this.eye();
    const plan = this.plan();
    const near = (pt, r) => Math.hypot(pt[0] - p.p[0], pt[1] - p.p[2]) < r;
    const tryUse = (slot, aimPt, lob = true) => {
      const ab = ag.abilities[slot];
      if (slot === 'x' ? p.ult < ab.points : p.charges[slot] <= 0) return false;
      const d = aimPt ? (lob ? this.lobDir(eye, aimPt) : unit([aimPt[0] - eye[0], aimPt[1] - eye[1], aimPt[2] - eye[2]])) : [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
      if (aimPt) p.yaw = Math.atan2(-(aimPt[0] - eye[0]), -(aimPt[2] - eye[2]));
      return m.ability(p.id, slot, eye, d);
    };
    const t = this.target;
    // ultimates
    if (p.ult >= ag.abilities.x.points) {
      const k = ag.abilities.x.kind;
      if (k === 'overdrive' && t) tryUse('x');
      else if (k === 'hunt' && m.phase === 'live') tryUse('x');
      else if (k === 'bastion' && p.hp < 50) tryUse('x');
      else if (k === 'revive' && [...m.players.values()].some((q) => q.team === p.team && !q.alive && q.corpse && Math.hypot(q.corpse[0] - p.p[0], q.corpse[2] - p.p[2]) < 10)) tryUse('x');
      else if (k === 'orbital' && t && t.d > 12) tryUse('x', [t.q.p[0], t.q.p[1], t.q.p[2]], false);
      else if (k === 'eclipse' && side === 'atk' && m.time > plan.exec - 2) tryUse('x', [L.sites[plan.site].c[0], 1, L.sites[plan.site].c[1]], false);
      else if (k === 'supernova' && t && t.d < 20) tryUse('x');
      else if (k === 'lockdown' && ((side === 'atk' && m.time > plan.exec - 2) || (side === 'def' && m.core.state === 'planted' && t))) tryUse('x', side === 'atk' ? [L.sites[plan.site].c[0], 1, L.sites[plan.site].c[1]] : [t.q.p[0], t.q.p[1], t.q.p[2]], false);
    }
    // in a fight: flashes, frags, concussions, mollies at the enemy
    if (t && t.d > 6 && t.d < 28) {
      const at = [t.q.p[0], t.q.p[1] + 0.3, t.q.p[2]];
      for (const slot of ['c', 'q']) {
        const kind = ag.abilities[slot].kind;
        if (['frag', 'molly', 'concuss', 'shock', 'toxin'].includes(kind) && Math.random() < 0.35 && tryUse(slot, at)) return;
      }
    }
    if (side === 'atk') {
      const S = L.sites[plan.site];
      const executing = m.time >= plan.exec - 3;
      if (executing && near(S.c, 55)) {
        // smoke the defender holds, then flash in
        const holds = L.def.holds[plan.site];
        for (const slot of ['e', 'q', 'c']) {
          const kind = ag.abilities[slot].kind;
          if (kind === 'smoke' && Math.random() < 0.6) {
            const h = holds[Math.floor(Math.random() * holds.length)];
            if (tryUse(slot, [h[0], (h[2] || 0) + 0.5, h[1]], !ag.abilities[slot].aimed)) return;
          }
          if ((kind === 'flash' || kind === 'concuss') && near(S.c, 30) && Math.random() < 0.5 && tryUse(slot, [S.c[0], 2, S.c[1]])) return;
          if (kind === 'recon' && Math.random() < 0.5 && tryUse(slot, [S.c[0], 2, S.c[1]])) return;
        }
      }
      if (m.core.state === 'planted' && near(m.core.p.length ? [m.core.p[0], m.core.p[2]] : S.c, 25)) {
        // deny the defuse
        const defusing = m.core.defuser;
        if (defusing) {
          for (const slot of ['q', 'c']) {
            const kind = ag.abilities[slot].kind;
            if (['molly', 'frag', 'shock'].includes(kind) && tryUse(slot, m.core.p)) return;
          }
        }
      }
      if (ag.abilities.e.kind === 'dash' && t && t.d < 12 && Math.random() < 0.3) tryUse('e');
      if (ag.abilities.e.kind === 'blink' && executing && near(S.c, 22) && !t && Math.random() < 0.4) tryUse('e', [S.c[0], 1, S.c[1]], false);
    } else {
      // defenders: turret and slows on their site early, heal when hurt
      const holdSite = this.holdSite || 'A';
      const st = L.def.stage[holdSite === 'mid' ? 'mid' : holdSite];
      if (ag.abilities.e.kind === 'turret' && !this.usedSig && this.path && this.pathI >= this.path.length) {
        this.usedSig = true;
        tryUse('e', [st[0], 1, st[1]], false);
        return;
      }
      if (ag.abilities.e.kind === 'trap' && !this.usedSig && this.path && this.pathI >= this.path.length) {
        this.usedSig = true;
        const h = this.hold || [st[0], st[1]];
        tryUse('e', [h[0] + (st[0] - h[0]) * 0.4, 0.5, h[1] + (st[1] - h[1]) * 0.4], false);
        return;
      }
      if (ag.abilities.e.kind === 'recon' && !this.usedSig && m.phase === 'live' && m.time % 30 > 20) {
        this.usedSig = true;
        tryUse('e', [st[0], 2, st[1]]);
        return;
      }
      const intel = m.intel && m.intel[p.team];
      if (intel && m.time - intel.t < 3) {
        for (const slot of ['c', 'q']) {
          const kind = ag.abilities[slot].kind;
          if (['slow', 'molly', 'frag', 'concuss', 'smoke', 'toxin'].includes(kind) && Math.hypot(intel.p[0] - p.p[0], intel.p[2] - p.p[2]) < 30 && Math.random() < 0.4 && tryUse(slot, intel.p)) return;
        }
      }
      if (m.core.state === 'planted' && ag.abilities.e.kind === 'smoke' && Math.random() < 0.3) tryUse('e', m.core.p, false);
    }
    if (ag.abilities.e.kind === 'heal' && p.hp < 60) tryUse('e');
    if (ag.abilities.c.kind === 'wall' && t && t.d < 15 && p.hp < 50 && Math.random() < 0.5) tryUse('c');
  }

  // pick a throw direction that lands near pt (tries a few pitches with the real projectile path)
  lobDir(eye, pt) {
    const dx = pt[0] - eye[0]; const dz = pt[2] - eye[2];
    const hd = Math.hypot(dx, dz) || 1;
    const yaw = [dx / hd, dz / hd];
    let best = null;
    for (let a = -20; a <= 60; a += 8) {
      const pitch = a * DEG;
      const d = [yaw[0] * Math.cos(pitch), Math.sin(pitch), yaw[1] * Math.cos(pitch)];
      const pr = { p: [...eye], v: throwVelocity(d, 15, 0.3) };
      for (let k = 0; k < 40 && !pr.landed; k++) stepProjectile(this.m.level, pr, 0.06);
      const err = Math.hypot(pr.p[0] - pt[0], pr.p[2] - pt[2]);
      if (!best || err < best.err) best = { err, d };
    }
    return best.d;
  }

  // practice range: dummies strafe across their lane and never shoot back
  rangeDummy(dt) {
    const p = this.p;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) this.strafeDir = 0; }
    const body = { p: p.p, v: p.v, yaw: 0, crouch: p.crouch, ground: p.ground };
    p.yaw = 0;
    moveBody(this.m.level, body, { f: 0, s: this.strafeDir * (this.m.rangeMove ? 1 : 0), walk: false }, dt);
    p.ground = body.ground;
  }
}

function dist2(a, b) { const dx = a[0] - b[0]; const dz = a[2] - b[2]; return dx * dx + dz * dz; }
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
