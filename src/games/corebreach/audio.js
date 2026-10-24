// Core Breach sound: everything is synthesised with WebAudio (no files). Gunshots, footsteps,
// reloads, ability sounds and the Core's beeping, positioned in 3D around the listener.
export class Sound {
  constructor(volume = 70) {
    this.vol = volume / 100;
    this.ctx = null;
    this.noiseBuf = null;
    this.lastStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.vol = v / 100; if (this.master) this.master.gain.value = this.vol; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  close() { if (this.ctx) this.ctx.close(); this.ctx = null; }

  listen(x, y, z, yaw) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // output node: plain (UI / own sounds) or positioned in the world
  out(pos, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.rolloffFactor = 1.1;
      p.maxDistance = 120;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noise(dest, t0, dur, { type = 'bandpass', freq = 1200, q = 1, gain = 1, attack = 0.002, freqEnd = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  tone(dest, t0, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.003 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // weapon shot; pos null = my own gun
  shot(w, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cat = w.cat || 'rifle';
    const quiet = w.quiet;
    const dest = this.out(pos, pos ? 1.6 : 0.9);
    const base = { sidearm: 1500, smg: 1300, rifle: 900, sniper: 520, shotgun: 600, heavy: 800, melee: 3000 }[cat] || 900;
    if (cat === 'melee') { this.noise(dest, t, 0.12, { type: 'highpass', freq: 2500, gain: 0.5 }); return; }
    // crack
    this.noise(dest, t, quiet ? 0.07 : 0.11, { freq: quiet ? base * 2 : base * 2.4, q: 0.7, gain: quiet ? 0.45 : 1 });
    // body
    this.noise(dest, t, cat === 'sniper' ? 0.6 : cat === 'shotgun' ? 0.4 : 0.22, { type: 'lowpass', freq: base, freqEnd: 120, gain: quiet ? 0.5 : 1.1 });
    // thump
    if (!quiet) this.tone(dest, t, cat === 'sniper' ? 0.35 : 0.14, { freq: cat === 'sniper' ? 90 : 140, freqEnd: 40, gain: cat === 'sidearm' ? 0.5 : 0.9 });
    // mechanical click for my own gun
    if (!pos) this.noise(dest, t + 0.03, 0.03, { type: 'highpass', freq: 4000, gain: 0.15 });
  }

  turret(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, 1.0);
    this.noise(d, t, 0.06, { freq: 2600, gain: 0.5 });
    this.tone(d, t, 0.05, { type: 'square', freq: 900, freqEnd: 500, gain: 0.08 });
  }

  impact(pos, flesh = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, 0.5);
    this.noise(d, t, flesh ? 0.08 : 0.05, { freq: flesh ? 700 : 3500, q: 1.5, gain: flesh ? 0.6 : 0.35 });
  }

  // hit confirmation on my screen
  hit(head = false, kill = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.35);
    if (head) this.tone(d, t, 0.18, { type: 'triangle', freq: 2400, freqEnd: 1800, gain: 0.5 });
    else this.noise(d, t, 0.05, { freq: 1800, q: 4, gain: 0.5 });
    if (kill) { this.tone(d, t + 0.02, 0.25, { type: 'sine', freq: 660, freqEnd: 990, gain: 0.35 }); }
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.4);
    this.noise(d, t, 0.18, { type: 'lowpass', freq: 600, gain: 0.8 });
    this.tone(d, t, 0.12, { freq: 180, freqEnd: 90, gain: 0.3 });
  }

  step(pos, run = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, run ? (pos ? 1.1 : 0.22) : 0.08);
    this.noise(d, t, 0.07, { freq: 260 + Math.random() * 160, q: 1.2, gain: 0.8 });
    this.noise(d, t, 0.03, { type: 'highpass', freq: 3000, gain: 0.15 });
  }

  land(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, pos ? 1.0 : 0.3);
    this.noise(d, t, 0.14, { type: 'lowpass', freq: 400, gain: 1 });
  }

  reload(w) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.35);
    const r = w.reload || 2;
    this.noise(d, t + 0.1, 0.05, { type: 'highpass', freq: 2500, gain: 0.5 });
    this.noise(d, t + r * 0.45, 0.06, { freq: 1500, q: 2, gain: 0.6 });
    this.noise(d, t + r * 0.85, 0.05, { type: 'highpass', freq: 3000, gain: 0.7 });
  }

  equip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.3);
    this.noise(d, t, 0.06, { type: 'highpass', freq: 2000, gain: 0.5 });
    this.noise(d, t + 0.08, 0.04, { freq: 1200, q: 3, gain: 0.4 });
  }

  empty() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(this.out(null, 0.3), t, 0.03, { type: 'highpass', freq: 3000, gain: 0.6 });
  }

  ability(kind, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, pos ? 1.4 : 0.6);
    switch (kind) {
      case 'throw': this.noise(d, t, 0.25, { freq: 900, freqEnd: 300, q: 0.8, gain: 0.4 }); break;
      case 'flash': this.tone(d, t, 0.6, { type: 'sawtooth', freq: 3000, freqEnd: 600, gain: 0.25 }); this.noise(d, t, 0.3, { type: 'highpass', freq: 2000, gain: 0.8 }); break;
      case 'smoke': this.noise(d, t, 1.4, { type: 'lowpass', freq: 900, freqEnd: 200, gain: 0.8, attack: 0.05 }); break;
      case 'fire': this.noise(d, t, 1.2, { type: 'bandpass', freq: 500, q: 0.5, gain: 0.9, attack: 0.05 }); break;
      case 'blast': this.noise(d, t, 0.9, { type: 'lowpass', freq: 800, freqEnd: 60, gain: 1.4 }); this.tone(d, t, 0.6, { freq: 70, freqEnd: 30, gain: 0.9 }); break;
      case 'pulse': this.tone(d, t, 0.5, { freq: 900, freqEnd: 1600, gain: 0.25 }); this.tone(d, t + 0.12, 0.4, { freq: 1800, gain: 0.15 }); break;
      case 'dash': this.noise(d, t, 0.35, { freq: 1200, freqEnd: 400, q: 0.6, gain: 0.7 }); break;
      case 'heal': this.tone(d, t, 0.6, { freq: 520, freqEnd: 1040, gain: 0.25 }); this.tone(d, t + 0.1, 0.5, { freq: 780, freqEnd: 1300, gain: 0.15 }); break;
      case 'wall': this.tone(d, t, 0.5, { type: 'square', freq: 120, freqEnd: 240, gain: 0.25 }); break;
      case 'ult': this.tone(d, t, 1.2, { type: 'sawtooth', freq: 110, freqEnd: 440, gain: 0.25 }); this.tone(d, t + 0.2, 1.0, { freq: 660, freqEnd: 880, gain: 0.2 }); break;
      case 'orbital': this.tone(d, t, 2.4, { type: 'sawtooth', freq: 200, freqEnd: 1200, gain: 0.18 }); break;
      case 'concuss': this.tone(d, t, 0.8, { freq: 140, freqEnd: 60, gain: 0.6 }); this.noise(d, t, 0.4, { type: 'lowpass', freq: 500, gain: 0.8 }); break;
      default: this.noise(d, t, 0.2, { freq: 800, gain: 0.4 });
    }
  }

  // the Core: beeps get faster as the fuse runs down
  coreBeep(pos, urgency) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, 1.2);
    this.tone(d, t, 0.09, { type: 'square', freq: 1400 + urgency * 600, gain: 0.18 });
  }

  plant() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.4);
    for (let k = 0; k < 4; k++) this.tone(d, t + k * 0.12, 0.06, { type: 'square', freq: 800 + k * 200, gain: 0.2 });
  }

  // round start, round won/lost, match point...
  sting(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.out(null, 0.5);
    if (kind === 'win') [523, 659, 784, 1047].forEach((f, k) => this.tone(d, t + k * 0.11, 0.5, { type: 'triangle', freq: f, gain: 0.3 }));
    else if (kind === 'lose') [392, 330, 262].forEach((f, k) => this.tone(d, t + k * 0.16, 0.6, { type: 'triangle', freq: f, gain: 0.3 }));
    else if (kind === 'start') { this.tone(d, t, 0.4, { type: 'sawtooth', freq: 220, freqEnd: 440, gain: 0.2 }); this.tone(d, t + 0.3, 0.6, { type: 'triangle', freq: 880, gain: 0.25 }); } else if (kind === 'buy') this.tone(d, t, 0.15, { type: 'triangle', freq: 1200, freqEnd: 1600, gain: 0.25 });
    else if (kind === 'click') this.tone(d, t, 0.05, { type: 'triangle', freq: 1800, gain: 0.15 });
    else if (kind === 'deny') this.tone(d, t, 0.15, { type: 'square', freq: 200, gain: 0.15 });
    else if (kind === 'kill') this.tone(d, t, 0.3, { type: 'triangle', freq: 880, freqEnd: 1320, gain: 0.3 });
  }
}
