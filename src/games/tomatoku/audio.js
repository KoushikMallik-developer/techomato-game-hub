// Tomatoku sound: small synthesized effects (WebAudio, no files). Browsers only start audio after a tap or key press,
// so resume() is called from the first input.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // semitones, a bright major pentatonic

export class Sound {
  constructor(settings) { this.s = settings; this.ac = null; } // settings: { sfx: bool }, shared with the save

  resume() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
    if (this.ac.state === 'suspended') this.ac.resume();
  }

  tone(f, at, d, type = 'triangle', vol = 0.07, slide = 0) {
    const ac = this.ac; const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), at + d);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d + 0.02);
  }

  play(fn) { if (this.ac && this.s.sfx) fn(this.ac.currentTime); }

  pick() { this.play((t) => this.tone(520, t, 0.06, 'sine', 0.05, 160)); }
  put() { this.play((t) => { this.tone(300, t, 0.09, 'sine', 0.09, -120); this.tone(600, t, 0.05, 'triangle', 0.03); }); }
  bad() { this.play((t) => this.tone(150, t, 0.16, 'sawtooth', 0.04, -60)); }
  // a run of rising notes: longer for more lines and for a longer streak
  clear(units, streak) {
    this.play((t) => { const n = Math.min(3 + units + Math.min(streak, 4), 9); for (let i = 0; i < n; i++) this.tone(330 * 2 ** (PENTA[i] / 12), t + i * 0.055, 0.2, 'triangle', 0.07); });
  }

  sudoku() { this.play((t) => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(262 * 2 ** (n / 12), t + i * 0.07, 0.35, 'square', 0.04))); }
  power() { this.play((t) => { this.tone(400, t, 0.12, 'sine', 0.07, 500); this.tone(800, t + 0.08, 0.16, 'triangle', 0.05); }); }
  win() { this.play((t) => [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(262 * 2 ** (n / 12), t + i * 0.1, 0.3, 'triangle', 0.07))); }
  over() { this.play((t) => [7, 4, 0, -5].forEach((n, i) => this.tone(330 * 2 ** (n / 12), t + i * 0.16, 0.3, 'triangle', 0.06))); }
  destroy() { if (this.ac) this.ac.close().catch(() => {}); }
}
