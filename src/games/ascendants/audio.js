// Ascendants sound, synthesised with WebAudio: punches and whooshes, ki techniques (blasts, beams, rays,
// gravity, light), the hum of charging ki, beam clashes, teleport zips, transformations, explosions,
// crates, pickups, the storm, wind while skydiving or flying.
export class Sound {
  constructor(volume = 0.7) { this.vol = volume; this.ctx = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // looping wind for falling / flying
    this.wind = this.ctx.createBufferSource(); this.wind.buffer = this.nb; this.wind.loop = true;
    this.windF = this.ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.7;
    this.windG = this.ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); this.wind.start();
  }
  // a rumbling hum while charging ki
  chargeLoop(level) {
    if (!this.ctx) return;
    if (!this.chg) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 82.5;
      const n = c.createBufferSource(); n.buffer = this.nb; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); o2.connect(f); n.connect(nf); nf.connect(g); f.connect(g); g.connect(this.master);
      o.start(); o2.start(); n.start();
      this.chg = { g, o, o2, f };
    }
    const t = this.ctx.currentTime;
    this.chg.g.gain.setTargetAtTime(level * 0.16, t, level ? 0.15 : 0.25);
    if (level) { this.chg.o.frequency.setTargetAtTime(55 + Math.random() * 6, t, 0.2); this.chg.f.frequency.setTargetAtTime(300 + Math.random() * 200, t, 0.1); }
  }
  beam(pos, dur = 1.5, big = false) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, big ? 1.1 : 0.8);
    this.tone(o, t, dur + 0.3, { type: 'sawtooth', f: big ? 70 : 110, f2: big ? 60 : 95, gain: 0.22, a: 0.05 });
    this.tone(o, t, dur + 0.3, { type: 'square', f: big ? 140 : 220, f2: big ? 120 : 200, gain: 0.06, a: 0.05 });
    this.noise(o, t, dur + 0.4, { type: 'bandpass', f: 1400, q: 0.6, gain: 0.55, a: 0.08 });
    this.noise(o, t, dur + 0.4, { type: 'lowpass', f: 400, gain: 0.7, a: 0.05 });
  }
  clash(pos) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 1.2);
    this.noise(o, t, 3.5, { type: 'lowpass', f: 600, f2: 200, gain: 1, a: 0.05 });
    this.tone(o, t, 3.5, { type: 'sawtooth', f: 48, f2: 40, gain: 0.35 });
    this.noise(o, t, 0.6, { type: 'highpass', f: 2000, gain: 0.6 });
  }
  mash() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.25); this.noise(o, t, 0.08, { type: 'bandpass', f: 1200 + Math.random() * 600, gain: 0.5 }); }
  tp(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.7); this.tone(o, t, 0.18, { type: 'sine', f: 1800, f2: 300, gain: 0.25 }); this.noise(o, t, 0.15, { type: 'highpass', f: 3000, f2: 800, gain: 0.5 }); }
  transform(pos, stage = 1) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 1.2);
    this.noise(o, t, 2.4, { type: 'lowpass', f: 300, f2: 2400, gain: 1, a: 0.3 });
    this.tone(o, t, 2.2, { type: 'sawtooth', f: 60, f2: stage === 2 ? 220 : 160, gain: 0.3, a: 0.2 });
    this.tone(o, t + 0.4, 1.6, { type: 'triangle', f: 440, f2: 880, gain: 0.12 });
    for (let k = 0; k < 6; k++) this.noise(o, t + 0.3 + k * 0.17, 0.1, { type: 'highpass', f: 3000, gain: 0.4 });
  }
  heavy(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 1); this.noise(o, t, 0.4, { type: 'lowpass', f: 900, f2: 120, gain: 1 }); this.tone(o, t, 0.35, { f: 90, f2: 30, gain: 0.9 }); this.noise(o, t, 0.08, { type: 'highpass', f: 2500, gain: 0.6 }); }
  crack(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.6); for (let k = 0; k < 3; k++) this.noise(o, t + k * 0.05, 0.12, { type: 'bandpass', f: 600 + k * 300, q: 2, gain: 0.5 }); this.noise(o, t + 0.2, 0.8, { type: 'lowpass', f: 300, gain: 0.5 }); }
  flash() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.5); this.tone(o, t, 2, { type: 'sine', f: 3200, f2: 2800, gain: 0.08 }); }
  lock() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.3); [880, 1320].forEach((f, i) => this.tone(o, t + i * 0.05, 0.08, { type: 'square', f, gain: 0.1 })); }
  takeoff(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.6); this.noise(o, t, 0.5, { f: 300, f2: 1600, gain: 0.5 }); }
  sonic() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.8); this.noise(o, t, 0.6, { type: 'lowpass', f: 1500, f2: 100, gain: 1 }); this.tone(o, t, 0.4, { f: 70, f2: 35, gain: 0.6 }); }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  close() { if (this.ctx) this.ctx.close(); this.ctx = null; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  listen(p, yaw) {
    if (!this.ctx) return;
    const L = this.ctx.listener; const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
    if (L.positionX) { L.positionX.value = p[0]; L.positionY.value = p[1]; L.positionZ.value = p[2]; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else { L.setPosition(p[0], p[1], p[2]); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  }
  setWind(level) { if (this.windG) { this.windG.gain.setTargetAtTime(level * 0.25, this.ctx.currentTime, 0.2); this.windF.frequency.setTargetAtTime(300 + level * 900, this.ctx.currentTime, 0.3); } }
  out(pos, gain = 1) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (pos) {
      const p = this.ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 5; p.rolloffFactor = 1.2; p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(...pos);
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }
  noise(dest, t0, dur, { type = 'bandpass', f = 1200, f2 = null, q = 1, gain = 1, a = 0.003 } = {}) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.nb;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + a); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  tone(dest, t0, dur, { type = 'sine', f = 440, f2 = null, gain = 0.5, a = 0.005 } = {}) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + a); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  ok() { return !!this.ctx && this.ctx.state === 'running'; }

  punch(pos, n, hit) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.8);
    this.noise(o, t, 0.12, { f: 900, f2: 300, q: 0.8, gain: 0.35 });
    if (hit) { this.noise(o, t, 0.16, { type: 'lowpass', f: 600, gain: 0.9 }); this.tone(o, t, 0.12, { f: n >= 4 ? 90 : n === 2 ? 110 : 150, f2: 50, gain: 0.6 }); this.noise(o, t, 0.05, { type: 'highpass', f: 2500, gain: 0.35 }); }
  }
  cast(pos, power) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.7);
    const el = ELEM[power] || 'force';
    if (el === 'fire') { this.noise(o, t, 0.5, { type: 'lowpass', f: 1800, f2: 300, gain: 0.7 }); this.tone(o, t, 0.3, { type: 'sawtooth', f: 180, f2: 90, gain: 0.15 }); }
    else if (el === 'ice') { this.tone(o, t, 0.35, { type: 'triangle', f: 1800, f2: 2600, gain: 0.18 }); this.noise(o, t, 0.25, { type: 'highpass', f: 3000, gain: 0.3 }); }
    else if (el === 'zap') { for (let k = 0; k < 4; k++) this.noise(o, t + k * 0.03, 0.08, { type: 'highpass', f: 2500, gain: 0.5 }); this.tone(o, t, 0.25, { type: 'square', f: 90, f2: 60, gain: 0.15 }); }
    else if (el === 'void') { this.tone(o, t, 0.9, { f: 70, f2: 35, gain: 0.6 }); this.noise(o, t, 0.6, { type: 'lowpass', f: 400, gain: 0.4 }); }
    else if (el === 'light') { this.tone(o, t, 0.6, { type: 'sine', f: 660, f2: 1320, gain: 0.2 }); this.tone(o, t + 0.05, 0.5, { f: 990, f2: 1980, gain: 0.12 }); }
    else if (el === 'beam') { this.tone(o, t, 1.2, { type: 'sawtooth', f: 220, f2: 240, gain: 0.12 }); this.noise(o, t, 1.2, { f: 1500, q: 3, gain: 0.25 }); }
    else { this.noise(o, t, 0.35, { f: 500, f2: 1500, q: 0.7, gain: 0.6 }); this.tone(o, t, 0.2, { f: 160, f2: 80, gain: 0.3 }); }
  }
  boom(pos, big = 1) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 1.0 * big);
    this.noise(o, t, 0.9 * big, { type: 'lowpass', f: 900, f2: 80, gain: 1 });
    this.tone(o, t, 0.6, { f: 90, f2: 35, gain: 0.8 });
  }
  zap(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.8); this.noise(o, t, 0.25, { type: 'highpass', f: 1800, gain: 0.8 }); this.tone(o, t, 0.2, { type: 'square', f: 120, f2: 40, gain: 0.25 }); }
  hitmark(crit) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.35); this.tone(o, t, 0.06, { type: 'square', f: crit ? 1500 : 1100, gain: 0.25 }); }
  hurt() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.5); this.noise(o, t, 0.2, { type: 'lowpass', f: 500, gain: 0.7 }); }
  crate(pos, tier) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.8);
    this.noise(o, t, 0.25, { f: 400, gain: 0.5 });
    const notes = tier === 'legendary' ? [523, 659, 784, 1046, 1318] : tier === 'rare' ? [523, 659, 784, 988] : [523, 659, 784];
    notes.forEach((f, i) => this.tone(o, t + 0.12 + i * 0.07, 0.5, { type: 'triangle', f, gain: 0.18 }));
  }
  pickup(power) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.5); [880, 1320].forEach((f, i) => this.tone(o, t + i * 0.06, 0.25, { type: power ? 'triangle' : 'sine', f, gain: 0.2 })); }
  channel(t0 = 0) { if (!this.ok()) return; const t = this.ctx.currentTime + t0; const o = this.out(null, 0.3); this.tone(o, t, 0.4, { f: 300, f2: 600, gain: 0.12 }); }
  kill() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.6); [660, 990, 1320].forEach((f, i) => this.tone(o, t + i * 0.05, 0.35, { type: 'triangle', f, gain: 0.2 })); }
  drop() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.6); this.noise(o, t, 0.8, { f: 300, f2: 1400, gain: 0.5 }); }
  land(pos) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(pos, 0.6); this.noise(o, t, 0.3, { type: 'lowpass', f: 300, gain: 0.8 }); }
  ui() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.25); this.tone(o, t, 0.06, { type: 'square', f: 900, gain: 0.15 }); }
  storm() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.5); this.tone(o, t, 2.4, { type: 'sawtooth', f: 55, f2: 45, gain: 0.25 }); this.noise(o, t, 2.4, { type: 'lowpass', f: 200, gain: 0.4 }); }
  win() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this.out(null, 0.7); [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(o, t + i * 0.12, 0.6, { type: 'triangle', f, gain: 0.22 })); }
}
const ELEM = {
  volley: 'zap', piercer: 'light', disc: 'zap', bomb: 'fire', scatter: 'zap', nova: 'force', shout: 'force', flash: 'light', rush: 'force', instant: 'light',
  afterimage: 'light', barrier: 'light', heal: 'light', split: 'light', lash: 'zap', gravity: 'void', quake: 'force',
  sun: 'void', breaker: 'void', surge: 'fire', comet: 'fire', timestop: 'light', barrage: 'zap', fist: 'force', wave: 'beam', radiance: 'beam',
};
