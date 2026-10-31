// Sky Hopper sound: synthesized effects and a small looping tune, all WebAudio (no files).
// Browsers only allow audio after a tap or key press, so resume() is called from the first input.
const NOTES = [0, 4, 7, 12, 7, 4, 9, 12, 16, 12, 9, 12, 7, 11, 14, 11, 7, 11, 5, 9, 12, 9, 5, 0]; // semitones above the root
const BASS = [0, 9, 5, 7]; // one bass note per 6 melody notes
const STEP = 0.17;

export class Sound {
  constructor(settings) {
    this.s = settings; // { sfx: bool, music: bool }, shared with the game's save
    this.ac = null; this.timer = null; this.i = 0; this.next = 0; this.root = 220;
  }

  resume() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
    if (this.ac.state === 'suspended') this.ac.resume();
    this.syncMusic();
  }

  beep(f, d = 0.12, type = 'square', slide = 0, vol = 0.06) {
    if (!this.ac || !this.s.sfx) return;
    this.tone(f, this.ac.currentTime, d, type, slide, vol);
  }

  tone(f, t, d, type, slide, vol) {
    const o = this.ac.createOscillator(); const g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + d + 0.02);
  }

  // each world plays the same tune in a different key
  setWorld(n) { this.root = [220, 247, 196, 262][(n - 1) % 4]; }

  syncMusic() {
    if (this.s.music && this.ac && !this.timer) {
      this.next = this.ac.currentTime + 0.05;
      this.timer = setInterval(() => this.schedule(), 100);
    } else if (!this.s.music && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  schedule() {
    if (!this.ac || this.ac.state !== 'running') return;
    while (this.next < this.ac.currentTime + 0.3) {
      const n = NOTES[this.i % NOTES.length];
      this.tone(this.root * 2 ** (n / 12), this.next, STEP * 0.9, 'triangle', 0, 0.045);
      if (this.i % 6 === 0) this.tone(this.root / 2 * 2 ** (BASS[(this.i / 6) % 4 | 0] / 12), this.next, STEP * 3, 'sine', 0, 0.07);
      this.i++; this.next += STEP;
    }
  }

  pause(on) { if (this.ac) (on ? this.ac.suspend() : this.ac.resume()).catch(() => {}); }

  destroy() { clearInterval(this.timer); this.timer = null; if (this.ac) this.ac.close().catch(() => {}); }
}
