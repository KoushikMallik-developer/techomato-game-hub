// Core Breach: the local player's gun handling — fire rate, semi/auto/burst triggers, magazines and
// reloads, spread (bloom) and the recoil pattern. Pure logic; the game turns shots into rays.
import { WEAPON, MOVE, clamp } from './data.js';

export class GunState {
  constructor(sound) {
    this.sound = sound;
    this.reset();
  }

  reset() {
    this.ammo = {};
    this.cool = 0;
    this.equipT = 0;
    this.reloadT = 0;
    this.reloadId = null;
    this.bloom = 0;
    this.kick = { p: 0, y: 0 }; // view punch in degrees (pitch up, yaw)
    this.pend = { p: 0, y: 0 };
    this.spray = 0; // shots in the current spray
    this.sinceShot = 9;
    this.burstLeft = 0;
    this.burstCool = 0;
    this.armed = true; // semi-auto: trigger must be released between shots
    this.scope = 0; // zoom level index + 1 (0 = not scoped)
    this.ads = false;
    this.swing = 0;
  }

  mag(id) {
    const w = WEAPON[id];
    if (!this.ammo[id]) this.ammo[id] = [w.mag, w.reserve || 0];
    return this.ammo[id];
  }

  refill() { this.ammo = {}; }

  equip(id) {
    const w = WEAPON[id];
    if (!w) return;
    this.equipT = w.equip;
    this.reloadT = 0;
    this.reloadId = null;
    this.scope = 0;
    this.ads = false;
    this.burstLeft = 0;
    this.sound.equip();
  }

  canReload(id) {
    const w = WEAPON[id];
    if (!w || !w.mag) return false;
    const m = this.mag(id);
    return m[0] < w.mag && m[1] > 0 && this.reloadT <= 0;
  }

  reload(id, instant = false) {
    if (!this.canReload(id)) return false;
    const w = WEAPON[id];
    this.scope = 0;
    this.ads = false;
    this.burstLeft = 0;
    this.reloadId = id;
    this.reloadT = instant ? 0.01 : w.reload;
    this.reloadLen = this.reloadT;
    if (!instant) this.sound.reload(w);
    return true;
  }

  finishReload() {
    const id = this.reloadId;
    const w = WEAPON[id];
    const m = this.mag(id);
    const take = Math.min(w.mag - m[0], m[1]);
    m[0] += take;
    m[1] -= take;
    this.reloadId = null;
  }

  busy() { return this.equipT > 0 || this.reloadT > 0; }

  applyRecoil() {
    this.kick.p = Math.min(this.kick.p + this.pend.p, 14);
    this.kick.y += this.pend.y;
    this.pend.p = 0; this.pend.y = 0;
  }

  // current spread cone in degrees
  spread(id, st) {
    const w = WEAPON[id];
    if (!w || !w.spread) return 0;
    const s = w.spread;
    const speed = clamp(st.speed / MOVE.run, 0, 1);
    let deg = s.base + (s.move * (speed > 0.55 ? speed : speed * 0.4)) + (st.ground ? 0 : s.air) + this.bloom;
    if (s.unscoped && !this.scope) deg += s.unscoped;
    if (st.crouch > 0.5 && st.ground) deg *= 0.8;
    if (this.ads) deg *= 0.8;
    return Math.min(deg, (s.max || 6) + (st.ground ? 0 : s.air) + (s.unscoped && !this.scope ? s.unscoped : 0));
  }

  // advance timers; returns the number of shots to fire this frame
  update(dt, id, trigger, st) {
    const w = WEAPON[id];
    this.cool -= dt;
    this.sinceShot += dt;
    this.swing = Math.max(0, this.swing - dt);
    if (this.equipT > 0) this.equipT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && this.reloadId) this.finishReload();
    }
    if (!w) return 0;
    // bloom and recoil recover while not shooting
    if (w.spread) {
      const rec = this.sinceShot > 60 / w.rpm + 0.03 ? w.spread.recover : w.spread.recover * 0.15;
      this.bloom = Math.max(0, this.bloom - rec * dt);
    }
    if (this.sinceShot > 60 / (w.rpm || 600) + 0.05) {
      const k = 1 - Math.exp(-dt * 9);
      this.kick.p -= this.kick.p * k;
      this.kick.y -= this.kick.y * k;
      if (this.sinceShot > 0.3) this.spray = 0;
    }
    if (!trigger) this.armed = true;
    if (this.busy()) return 0;
    // burst weapons finish the burst on their own
    if (this.burstLeft > 0) {
      if (this.cool > 0) return 0;
      return this.shoot(w, st);
    }
    if (!trigger || this.cool > 0) return 0;
    if (w.cat === 'melee') {
      if (!this.armed) return 0;
      this.armed = false;
      this.cool = 60 / w.rpm;
      this.swing = 0.35;
      return 1;
    }
    if (!w.auto && !this.armed) return 0;
    const m = this.mag(id);
    if (m[0] <= 0) {
      this.armed = false;
      if (m[1] > 0) this.reload(id);
      else this.sound.empty();
      return 0;
    }
    this.armed = false;
    if (w.burst && !this.ads) this.burstLeft = w.burst;
    return this.shoot(w, st);
  }

  shoot(w, st) {
    const m = this.mag(w.id);
    if (m[0] <= 0) { this.burstLeft = 0; return 0; }
    m[0]--;
    this.cool = 60 / w.rpm;
    if (this.burstLeft > 0) {
      this.burstLeft--;
      if (this.burstLeft === 0) this.cool = w.burstDelay || this.cool;
    }
    this.sinceShot = 0;
    this.spray++;
    const s = w.spread;
    if (s) this.bloom = Math.min(s.max, this.bloom + s.shot);
    // recoil: the first shots climb, a long spray sways side to side
    const r = w.recoil || { v: 0.5, h: 0.3 };
    const n = this.spray;
    const climb = n <= 1 ? 0.55 : n < 10 ? 1 : 0.35;
    // the bullet leaves before the recoil moves the view: queue it, applyRecoil() after the shot
    this.pend.p += r.v * climb * (st.crouch > 0.5 ? 0.85 : 1);
    this.pend.y += n < 6 ? (Math.random() - 0.5) * r.h * 0.6 : Math.sin(n * 0.55) * r.h * 1.6 + (Math.random() - 0.5) * r.h * 0.4;
    // snipers drop out of the scope after a shot
    if (w.cat === 'sniper') this.scope = 0;
    if (w.pump) this.scope = 0;
    return 1;
  }
}
