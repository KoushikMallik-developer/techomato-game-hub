// Horde Surge sound: all synthesised with WebAudio (no files), throttled so huge crowds don't clip.
export class Sound {
  constructor(volume = 70) {
    this.vol = volume / 100;
    this.ctx = null;
    this.last = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.vol = v / 100; if (this.master) this.master.gain.value = this.vol; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  close() { if (this.ctx) this.ctx.close(); this.ctx = null; }

  // allow a sound at most every `gap` seconds
  gate(name, gap) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }

  tone(t0, dur, { type = 'sine', f = 440, f2 = null, g = 0.3, a = 0.004 } = {}) {
    const o = this.ctx.createOscillator(); const gn = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + a); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(t0, dur, { type = 'bandpass', f = 1200, f2 = null, q = 1, g = 0.3 } = {}) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = this.ctx.createGain(); gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(gn); gn.connect(this.master); s.start(t0); s.stop(t0 + dur + 0.05);
  }

  shoot() { if (!this.gate('shoot', 0.07)) return; const t = this.ctx.currentTime; this.tone(t, 0.08, { type: 'triangle', f: 320 + Math.random() * 60, f2: 140, g: 0.12 }); }
  pop() { if (!this.gate('pop', 0.035)) return; const t = this.ctx.currentTime; this.tone(t, 0.07, { type: 'sine', f: 600 + Math.random() * 500, f2: 180, g: 0.12 }); this.noise(t, 0.05, { f: 2500, g: 0.06 }); }
  gateHit(good) { if (!this.gate('gate', 0.09)) return; const t = this.ctx.currentTime; this.tone(t, 0.12, { type: 'square', f: good ? 880 : 220, f2: good ? 1320 : 140, g: 0.06 }); }
  crate() { if (!this.gate('crate', 0.08)) return; const t = this.ctx.currentTime; this.noise(t, 0.25, { type: 'lowpass', f: 1500, f2: 200, g: 0.35 }); this.tone(t, 0.3, { type: 'triangle', f: 520, f2: 1040, g: 0.15 }); }
  thud() { if (!this.gate('thud', 0.06)) return; const t = this.ctx.currentTime; this.tone(t, 0.12, { f: 120, f2: 60, g: 0.18 }); }
  hurt() { if (!this.gate('hurt', 0.15)) return; const t = this.ctx.currentTime; this.tone(t, 0.25, { type: 'sawtooth', f: 200, f2: 80, g: 0.14 }); }
  smash() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, 0.5, { type: 'lowpass', f: 600, f2: 60, g: 0.7 }); this.tone(t, 0.4, { f: 90, f2: 35, g: 0.5 }); }
  roar() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 1.1, { type: 'sawtooth', f: 110, f2: 60, g: 0.18 }); this.noise(t, 1, { f: 400, q: 0.6, g: 0.25 }); }
  champion() { if (!this.ctx) return; const t = this.ctx.currentTime; [330, 440, 554, 660].forEach((f, k) => this.tone(t + k * 0.06, 0.3, { type: 'square', f, g: 0.07 })); this.tone(t, 0.6, { f: 80, f2: 40, g: 0.4 }); }
  coin() { if (!this.gate('coin', 0.05)) return; const t = this.ctx.currentTime; this.tone(t, 0.08, { type: 'square', f: 1320, g: 0.05 }); this.tone(t + 0.06, 0.12, { type: 'square', f: 1760, g: 0.05 }); }
  click() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 0.05, { type: 'triangle', f: 1400, g: 0.1 }); }
  win() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(t + k * 0.1, 0.45, { type: 'triangle', f, g: 0.22 })); }
  lose() { if (!this.ctx) return; const t = this.ctx.currentTime; [392, 330, 262, 196].forEach((f, k) => this.tone(t + k * 0.16, 0.5, { type: 'triangle', f, g: 0.2 })); }
  power(kind) { if (!this.ctx) return; const t = this.ctx.currentTime; const base = kind === 'freeze' ? 660 : kind === 'bomb' ? 220 : 440; [1, 1.25, 1.5, 2].forEach((m, k) => this.tone(t + k * 0.05, 0.25, { type: kind === 'freeze' ? 'sine' : 'square', f: base * m, g: 0.08 })); this.noise(t, 0.4, { type: 'highpass', f: 3000, f2: 800, g: 0.12 }); }
  combo(tier) { if (!this.gate('combo', 0.2)) return; const t = this.ctx.currentTime; const f = 660 * Math.pow(1.122, tier); this.tone(t, 0.18, { type: 'triangle', f, g: 0.14 }); this.tone(t + 0.08, 0.3, { type: 'triangle', f: f * 1.5, g: 0.12 }); }
  arrow() { if (!this.gate('arrow', 0.12)) return; const t = this.ctx.currentTime; this.noise(t, 0.18, { type: 'bandpass', f: 2600, f2: 900, q: 3, g: 0.12 }); this.tone(t, 0.06, { type: 'triangle', f: 700, f2: 300, g: 0.06 }); }
  clang() { if (!this.gate('clang', 0.08)) return; const t = this.ctx.currentTime; this.tone(t, 0.18, { type: 'square', f: 1800 + Math.random() * 400, f2: 900, g: 0.04 }); this.noise(t, 0.06, { type: 'highpass', f: 4000, g: 0.06 }); }
  boom() { if (!this.gate('boom', 0.1)) return; const t = this.ctx.currentTime; this.noise(t, 0.45, { type: 'lowpass', f: 1200, f2: 80, g: 0.5 }); this.tone(t, 0.3, { f: 110, f2: 40, g: 0.3 }); }
  laser() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 1.1, { type: 'sawtooth', f: 180, f2: 900, g: 0.12 }); this.tone(t, 1.1, { type: 'square', f: 92, f2: 460, g: 0.06 }); }
  thunder() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, 2.2, { type: 'lowpass', f: 500, f2: 40, g: 0.6 }); this.noise(t + 0.08, 0.3, { type: 'bandpass', f: 1800, g: 0.25 }); }
  wave() { if (!this.ctx) return; const t = this.ctx.currentTime; [392, 523, 659, 784].forEach((f, k) => this.tone(t + k * 0.08, 0.35, { type: 'square', f, g: 0.07 })); }
  explode() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, 1.4, { type: 'lowpass', f: 900, f2: 40, g: 1 }); this.tone(t, 1, { f: 70, f2: 25, g: 0.6 }); }
}
