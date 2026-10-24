// Midnight Pursuit: every sound is synthesized with WebAudio, so the game ships no audio files.

export class AudioFX {
  constructor(volume = 70) {
    this.volume = volume;
    this.ctx = null;
    this.ready = false;
  }

  // Must be called from a user gesture (click / key press) the first time.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume / 100;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // White-noise buffer shared by all noise sounds
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine: three detuned oscillators through a resonant low-pass filter
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 3;
    this.engFilter.frequency.value = 600;
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.engOsc = [
      ['sawtooth', 1, 0.5],
      ['square', 0.5, 0.35],
      ['sawtooth', 2.01, 0.18],
    ].map(([type, mult, vol]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g);
      g.connect(this.engFilter);
      o.start();
      return { o, mult };
    });

    this.skid = this.noiseLoop('bandpass', 950, 1.2);
    this.nitro = this.noiseLoop('highpass', 1600, 0.7);
    this.wind = this.noiseLoop('lowpass', 380, 0.5);

    // Police siren: triangle wave swept by a slow LFO (wail) or a fast one (yelp)
    this.siren = ctx.createOscillator();
    this.siren.type = 'triangle';
    this.siren.frequency.value = 950;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.25;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 330;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.siren.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.siren.start();
    this.sirenLfo.start();

    // Helicopter rotor thump
    this.rotor = this.noiseLoop('lowpass', 160, 1);
    this.rotorLfo = ctx.createOscillator();
    this.rotorLfo.frequency.value = 11;
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    this.rotorLfo.connect(rg);
    rg.connect(this.rotor.gain.gain);
    this.rotorLfo.start();

    this.ready = true;
  }

  noiseLoop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f);
    f.connect(gain);
    gain.connect(this.master);
    src.start();
    return { src, filter: f, gain };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.05);
  }

  // Called every frame with the current driving state.
  update(s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const k = 0.05;
    const slow = s.slowmo ? 0.72 : 1;
    const base = (26 + (s.rpm / 7500) * 108) * slow;
    this.engOsc.forEach(({ o, mult }) => o.frequency.setTargetAtTime(base * mult, t, 0.03));
    this.engFilter.frequency.setTargetAtTime(380 + s.throttle * 1500 + (s.rpm / 7500) * 900, t, k);
    this.engGain.gain.setTargetAtTime(s.active ? 0.07 + s.throttle * 0.07 : 0, t, k);
    this.skid.gain.gain.setTargetAtTime(s.active ? Math.min(0.32, s.skid * 0.32) : 0, t, k);
    this.nitro.gain.gain.setTargetAtTime(s.active && s.nitro ? 0.13 : 0, t, k);
    this.wind.gain.gain.setTargetAtTime(s.active ? Math.min(0.2, s.speedNorm * s.speedNorm * 0.2) : 0, t, k);
    this.sirenGain.gain.setTargetAtTime(s.siren * 0.06, t, 0.1);
    this.sirenLfo.frequency.setTargetAtTime(s.sirenFast ? 3.2 : 0.25, t, 0.2);
    this.rotor.gain.gain.setTargetAtTime(s.heli * 0.25, t, 0.2);
  }

  tone(freq, end, dur, type = 'square', vol = 0.1, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, vol, freq = 900, type = 'lowpass', delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  crash(intensity) {
    const v = Math.min(1, intensity / 30);
    this.burst(0.25 + v * 0.5, 0.25 + v * 0.5, 700 + v * 900);
    this.tone(140, 40, 0.3 + v * 0.3, 'sawtooth', 0.08 + v * 0.12);
  }
  shift() { this.tone(220, 120, 0.08, 'square', 0.05); this.burst(0.08, 0.06, 2500, 'highpass'); }
  click() { this.tone(900, 1100, 0.05, 'square', 0.04); }
  beep(high) { this.tone(high ? 1320 : 660, high ? 1320 : 660, high ? 0.6 : 0.25, 'square', 0.09); }
  chime() { this.tone(880, 1320, 0.12, 'triangle', 0.1); this.tone(1320, 1760, 0.16, 'triangle', 0.08, 0.08); }
  whoosh() { this.burst(0.35, 0.18, 1800, 'bandpass'); }
  money() { [1046, 1318, 1568].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.08, i * 0.07)); }
  boom() { this.burst(1.0, 0.5, 500); this.tone(120, 30, 0.8, 'sawtooth', 0.15); }
  pop() { this.burst(0.15, 0.4, 3000, 'highpass'); this.tone(500, 80, 0.2, 'square', 0.08); }
  nitroStart() { this.burst(0.3, 0.2, 2200, 'highpass'); }
  slowmo(on) { this.tone(on ? 400 : 120, on ? 90 : 420, 0.4, 'sine', 0.15); }
  busted() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.97, 0.3, 'sawtooth', 0.08, i * 0.22)); }
  evaded() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.22, 'triangle', 0.09, i * 0.11)); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.3, 'square', 0.07, i * 0.15)); }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  close() {
    if (this.ctx) {
      try { this.ctx.close(); } catch { /* already closed */ }
    }
    this.ctx = null;
    this.ready = false;
  }
}
