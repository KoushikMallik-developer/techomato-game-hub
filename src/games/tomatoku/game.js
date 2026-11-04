// Tomatoku: plant one tomato in every row, column and coloured patch, with none touching (a Meowdoku-style puzzle).
// Rules and puzzle making live in logic.js, the save in save.js, sound in audio.js. This file draws the field on a
// 2D canvas, handles taps, drags and keys, and shows menus as HTML on top. Layout and rules follow the "Paw Grid" artifact.
import { puzzleFor, blockedBy, startCell, xpLevel, xpFor, dayNum } from './logic.js';
import { normalizeSave, totalStars, MAX_LEVEL, MAX_HINTS } from './save.js';
import { Sound } from './audio.js';

const SAVE_KEY = 'tomatoku-save';
const loadSave = () => { try { return normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { return normalizeSave(null); } };
const FONT = 'Nunito,system-ui,sans-serif';
const DISPLAY = '"Lilita One","Arial Black",system-ui,sans-serif';
const INK = '#1d1f45'; // the thick outline colour of every Horde Surge piece
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const put = (el, v) => { if (el.dataset.v !== String(v)) { el.dataset.v = String(v); el.textContent = v; } }; // skip identical writes
const starText = (k) => '★'.repeat(k) + '☆'.repeat(3 - k);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const LIVES = 3;
const HARD_LIVES = 2;
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.7-9.4-9.4A5.3 5.3 0 0 1 12 6.2a5.3 5.3 0 0 1 9.4 4.9c-1.9 4.7-9.4 9.4-9.4 9.4z"/></svg>';
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  levels: '<svg viewBox="0 0 24 24"><path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/></svg>',
  rules: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
};
const TOOLS = [['levels', 'Levels'], ['hint', 'Hint'], ['undo', 'Undo'], ['restart', 'Restart'], ['rules', 'Rules']];
// the coloured patches of the field: bright candy colours, each with an ink outline
const PATCH = ['#b18cff', '#ffb04a', '#5be0a0', '#ffe14d', '#5db8ff', '#ff7eb3', '#a6ec5b', '#4fe0e8', '#d9a27c'];
export const THEMES = [
  { id: 'garden', name: 'Sky', need: 1, bg: ['#5b8cff', '#2b2f8f'], blob: '#8fe3ff' },
  { id: 'greenhouse', name: 'Grass', need: 3, bg: ['#3fd86b', '#12704a'], blob: '#c9ff8a' },
  { id: 'sunset', name: 'Sunset', need: 6, bg: ['#ff7a59', '#7a2a6e'], blob: '#ffd86b' },
  { id: 'midnight', name: 'Candy', need: 10, bg: ['#ff6fb5', '#5a2aa8'], blob: '#ffb3e6' },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800&display=swap');
.tk-root{--fd:${DISPLAY};--fb:${FONT};--ink:${INK};--ink2:#2c2f63;--sun:#ffd23f;--grass:#3fd86b;--sky:#2b8cff;--rose:#ff4f7a;position:absolute;inset:0;overflow:hidden;font-family:var(--fd);color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;
  background:radial-gradient(70% 45% at 85% 8%,color-mix(in srgb,var(--blob) 55%,transparent),transparent 70%),radial-gradient(60% 40% at 8% 95%,color-mix(in srgb,var(--blob) 35%,transparent),transparent 70%),linear-gradient(var(--b1),var(--b2))}
.tk-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.tk-root :where(button){font:inherit;color:inherit;cursor:pointer;padding:0;border:0;background:none;-webkit-tap-highlight-color:transparent}
.tk-root :where(button):focus-visible{outline:.15em solid #fff;outline-offset:.2em}
.tk-out{text-shadow:-.06em -.06em 0 var(--ink),.06em -.06em 0 var(--ink),-.06em .06em 0 var(--ink),.06em .06em 0 var(--ink),0 .12em 0 var(--ink)}
.tk-top{position:absolute;left:0;right:0;top:0;height:var(--hh);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left));font-size:clamp(12px,min(3.2vmin,2.2vh),26px)}
.tk-ib{justify-self:start;width:2.5em;height:2.5em;border-radius:.8em;border:.16em solid var(--ink);background:linear-gradient(#fff,#d9e4ff);display:grid;place-items:center;box-shadow:0 .2em 0 var(--ink);transition:transform .08s,box-shadow .08s}
.tk-ib:active,.tk-pw:active{transform:translateY(.18em);box-shadow:0 .05em 0 var(--ink)}
.tk-ib svg,.tk-pw svg{width:58%;height:58%;fill:none;stroke:var(--ink);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.tk-time{display:flex;flex-direction:column;align-items:center;line-height:1}
.tk-time small{font-size:.95em;color:var(--sun);letter-spacing:.02em}
.tk-time b{font-size:1.7em;font-weight:400;font-variant-numeric:tabular-nums}
.tk-time small,.tk-time b{text-shadow:-.06em -.06em 0 var(--ink),.06em -.06em 0 var(--ink),-.06em .06em 0 var(--ink),.06em .06em 0 var(--ink),0 .12em 0 var(--ink)}
.tk-lives{justify-self:end;display:flex;gap:.25em}
.tk-lives i{display:block;width:1.6em;height:1.6em;transition:transform .2s}
.tk-lives svg{width:100%;height:100%;fill:var(--rose);stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round;paint-order:stroke;filter:drop-shadow(0 .1em 0 var(--ink))}
.tk-lives i.lost svg{fill:rgba(29,31,69,.55)}
.tk-lives i.lost{transform:scale(.85)}
.tk-bot{position:absolute;left:0;right:0;bottom:0;height:var(--ph);display:flex;align-items:flex-start;justify-content:center;font-size:clamp(11px,min(2.9vmin,2vh),24px)}
.tk-root.land .tk-bot{left:var(--rx);width:var(--rw);top:var(--dt);bottom:auto;height:auto;justify-content:center}
.tk-dock{display:flex;gap:.45em}
.tk-pw{position:relative;min-width:4.2em;padding:.45em .4em .35em;border-radius:1em;border:.16em solid var(--ink);display:grid;justify-items:center;gap:.15em;background:linear-gradient(#fff,#d7e2ff);color:var(--ink);box-shadow:inset 0 -.22em 0 rgba(0,0,0,.12),0 .25em 0 var(--ink);transition:transform .08s,box-shadow .08s,opacity .15s}
.tk-pw svg{width:1.7em;height:1.7em}
.tk-pw[data-a=levels] svg{stroke:#ff4f8b}.tk-pw[data-a=hint] svg{stroke:#e59a00}.tk-pw[data-a=undo] svg{stroke:#2b8cff}.tk-pw[data-a=restart] svg{stroke:#25c058}.tk-pw[data-a=rules] svg{stroke:#9b6bff}
.tk-pw small{font-size:.85em;line-height:1}
.tk-pw b{position:absolute;top:-.5em;right:-.4em;min-width:1.5em;height:1.5em;padding:0 .25em;box-sizing:border-box;border-radius:1em;background:#ff3b4a;border:.14em solid var(--ink);color:#fff;font-size:.8em;font-weight:400;line-height:1.3em;text-align:center}
.tk-pw b:empty{display:none}
.tk-pw.off{opacity:.45;filter:grayscale(.5)}
.tk-ov{position:absolute;inset:0;display:none;place-items:center;background:radial-gradient(circle at 50% 40%,rgba(43,47,110,.55),rgba(14,15,40,.85));padding:3%;overflow:auto;z-index:5}
.tk-card{width:min(92%,25em);max-height:100%;overflow:auto;padding:1em 1.1em 1.1em;border-radius:1.3em;text-align:left;color:#fff;font-family:var(--fb);font-weight:800;font-size:clamp(13px,min(3.2vmin,2.4vh),20px);line-height:1.4;background:linear-gradient(#34387a,#24275a);border:.18em solid var(--ink);box-shadow:0 .35em 0 var(--ink),0 1em 2em rgba(0,0,0,.3);animation:tk-in .45s cubic-bezier(.3,1.4,.5,1) backwards}
.tk-card,.tk-ov{scrollbar-width:thin;scrollbar-color:#ffd23f transparent}
.tk-card::-webkit-scrollbar,.tk-ov::-webkit-scrollbar{width:.7em}
.tk-card::-webkit-scrollbar-button,.tk-ov::-webkit-scrollbar-button{display:none}
.tk-card::-webkit-scrollbar-track,.tk-ov::-webkit-scrollbar-track{background:transparent;margin:1em 0}
.tk-card::-webkit-scrollbar-thumb,.tk-ov::-webkit-scrollbar-thumb{background:linear-gradient(#ffe680,#ffae00);border:.16em solid var(--ink);border-radius:1em}
@keyframes tk-in{from{opacity:0;transform:translateY(1.2em) scale(.92)}}
@keyframes tk-bob{50%{transform:rotate(-2deg) translateY(-.06em)}}
.tk-card h1{margin:.1em 0 .3em;text-align:center;font-family:var(--fd);font-weight:400;font-size:3.1em;line-height:.9;color:var(--sun);transform:rotate(-4deg);-webkit-text-stroke:.09em var(--ink);paint-order:stroke fill;text-shadow:0 .1em 0 var(--ink),0 .2em .3em rgba(0,0,0,.25);animation:tk-bob 3s ease-in-out infinite}
.tk-card h2{margin:-.1em 0 .4em;text-align:center;font-family:var(--fd);font-weight:400;font-size:1.9em;line-height:1.1}
.tk-card p{margin:.5em 0}
.tk-card small{opacity:.8;font-weight:700}
.tk-card .big{font-family:var(--fd);text-align:center;font-size:2.4em;line-height:1.1;color:var(--sun);letter-spacing:.06em;-webkit-text-stroke:.05em var(--ink);paint-order:stroke fill}
.tk-card ul{margin:.5em 0;padding-left:1.15em}
.tk-card li{margin:.35em 0}
.tk-card li::marker{color:var(--sun)}
.tk-card b{font-weight:800;color:var(--sun)}
.tk-card .row{display:flex;flex-wrap:wrap;gap:.5em;margin:.6em 0}
.tk-card .row button{flex:1 1 7em;padding:.5em .8em;border-radius:.9em;border:.16em solid var(--ink);background:linear-gradient(#4a4e8c,#2c2f63);box-shadow:0 .2em 0 var(--ink);font-family:var(--fd);font-weight:400;font-size:1.05em;text-align:center;transition:transform .08s,box-shadow .08s}
.tk-card .row button:active{transform:translateY(.15em);box-shadow:0 .05em 0 var(--ink)}
.tk-card .row button.sel{background:linear-gradient(#ffe680,#ffae00);color:var(--ink)}
.tk-card .row button:disabled{filter:grayscale(.85) brightness(.9);cursor:default}
.tk-card .xp{height:1em;border-radius:1em;background:var(--ink);border:.14em solid var(--ink);overflow:hidden;margin:.7em 0 .3em}
.tk-card .xp i{display:block;height:100%;border-radius:1em;background:linear-gradient(#ffe680,#ffae00)}
.tk-btns{display:flex;flex-direction:column;gap:.7em;margin-top:1em}
.tk-btns button{padding:.45em 1.1em;border-radius:1em;border:.16em solid var(--ink);font-family:var(--fd);font-weight:400;font-size:1.3em;text-align:center;color:#fff;background:linear-gradient(#8dff9e,#25c058);box-shadow:inset 0 -.25em 0 rgba(0,0,0,.18),inset 0 .18em 0 rgba(255,255,255,.35),0 .25em 0 var(--ink);text-shadow:0 .08em 0 rgba(0,0,0,.25);transition:transform .08s,box-shadow .08s}
.tk-btns button:active{transform:translateY(.18em);box-shadow:inset 0 -.15em 0 rgba(0,0,0,.18),0 .07em 0 var(--ink)}
.tk-btns button.alt{background:linear-gradient(#4a4e8c,#2c2f63)}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(4.2em,1fr));gap:.5em;margin-top:.7em}
.tk-grid button{display:flex;flex-direction:column;align-items:center;padding:.4em .2em .3em;border-radius:.9em;border:.16em solid var(--ink);background:linear-gradient(#fff,#d7e2ff);color:var(--ink);box-shadow:inset 0 -.2em 0 rgba(0,0,0,.12),0 .2em 0 var(--ink);font-family:var(--fd);font-weight:400;font-size:1.1em;line-height:1.2;transition:transform .08s,box-shadow .08s}
.tk-grid button:active{transform:translateY(.15em);box-shadow:0 .05em 0 var(--ink)}
.tk-grid button small{font-family:var(--fb);color:#e59a00;opacity:1;letter-spacing:.04em}
.tk-toast{position:absolute;left:50%;top:calc(var(--hh) + .2em);transform:translateX(-50%) translateY(-4px);padding:.35em 1em;border-radius:2em;background:rgba(29,31,69,.88);border:.14em solid var(--ink);color:#fff;font-size:clamp(13px,2.9vmin,20px);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap;z-index:4}
.tk-toast.show{opacity:1;transform:translateX(-50%)}
.tk-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.tk-card,.tk-card h1{animation:none}.tk-toast,.tk-lives i{transition:none}}
`;

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

// a glossy tomato with a thick ink outline, drawn once per size and then copied
function makeSprite(S) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const cx = S / 2; const cy = S * 0.56; const rx = S * 0.38; const ry = S * 0.34; const lw = Math.max(1.5, S * 0.045);
  const body = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.5, S * 0.03, cx, cy, rx * 1.1);
  body.addColorStop(0, '#ff8a7a'); body.addColorStop(0.45, '#ff3b30'); body.addColorStop(1, '#d11f2a');
  g.fillStyle = body; g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(cx - rx * 0.45, cy - ry * 0.42, S * 0.085, S * 0.045, -0.65, 0, 7); g.fill();
  g.save(); g.translate(cx, cy - ry * 0.86); g.scale(1, 0.6); // leaves
  g.fillStyle = '#3fd86b'; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? S * 0.06 : S * 0.17; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke(); g.restore();
  g.strokeStyle = INK; g.lineWidth = lw * 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy - ry * 0.86); g.lineTo(cx + S * 0.03, cy - ry * 1.16); g.stroke();
  g.strokeStyle = '#25c058'; g.lineWidth = lw * 0.7; g.beginPath(); g.moveTo(cx, cy - ry * 0.86); g.lineTo(cx + S * 0.03, cy - ry * 1.16); g.stroke();
  return c;
}

export class Game {
  constructor(container, opts = {}) {
    this.container = container; this.opts = opts;
    this.save = loadSave();
    this.sound = new Sound(this.save);
    this.reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.state = 'menu'; this.paused = false; this.mode = null; this.lvl = 1; this.day = 0; this.n = 5;
    this.reg = new Uint8Array(25); this.sol = []; this.cells = new Uint8Array(25); this.pops = new Float32Array(25);
    this.undo = []; this.mistakes = 0; this.hintsUsed = 0; this.time = 0; this.sel = -1; this.drag = null; this.bad = null; this.hintCell = -1; this.hintT = 0;
    this.parts = []; this.floats = []; this.rings = []; this.sweep = 0; this.lockI = -1; this.shake = 0; this.sprites = new Map();

    const style = document.createElement('style'); style.textContent = CSS;
    this.root = document.createElement('div'); this.root.className = 'tk-root';
    this.root.innerHTML = `<canvas tabindex="0" aria-label="Tomatoku field. Tap a square to cross it out, again to plant a tomato, again to clear. Arrow keys move, Enter taps, X crosses out, H hint, Z undo."></canvas>
      <div class="tk-top"><button class="tk-ib" data-a="pause" aria-label="Pause and menu">${ICON.menu}</button>
        <div class="tk-time"><small class="ml">Tomatoku</small><b class="mv">0:00</b></div>
        <div class="tk-lives" aria-label="Lives"></div></div>
      <div class="tk-bot"><div class="tk-dock">${TOOLS.map(([id, name]) => `<button class="tk-pw" data-a="${id}" aria-label="${name}">${ICON[id]}<small>${name}</small><b></b></button>`).join('')}</div></div>
      <div class="tk-toast" role="status"></div><div class="tk-live" aria-live="polite"></div><div class="tk-ov"></div>`;
    this.root.prepend(style);
    container.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.canvas = q('canvas'); this.ctx = this.canvas.getContext('2d');
    this.el = { ml: q('.ml'), mv: q('.mv'), lives: q('.tk-lives'), toast: q('.tk-toast'), live: q('.tk-live'), ov: q('.tk-ov'), tool: Object.fromEntries(TOOLS.map(([id]) => [id, q(`[data-a="${id}"]`)])) };
    this.applyTheme();

    this.onResize = () => this.resize();
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
    if (this.ro) this.ro.observe(container); else window.addEventListener('resize', this.onResize);
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onClick = (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { this.sound.resume(); this.act(b.dataset.a, b.dataset.v); } };
    this.root.addEventListener('click', this.onClick);
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', () => this.onUp());
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });

    this.resize();
    this.hud();
    this.showMenu();
    this.last = performance.now();
    this.loop = (t) => { this.raf = requestAnimationFrame(this.loop); this.frame(t); };
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────── save, theme, small helpers ─────────
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode */ } }
  theme() { return THEMES.find((t) => t.id === this.save.theme && xpLevel(this.save.xp) >= t.need) || THEMES[0]; }
  applyTheme() { const t = this.theme(); const st = this.root.style; st.setProperty('--b1', t.bg[0]); st.setProperty('--b2', t.bg[1]); st.setProperty('--blob', t.blob); }
  toast(msg, ms = 1600) { const t = this.el.toast; t.textContent = msg; t.classList.add('show'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms); this.el.live.textContent = msg; }
  buzz(ms) { if (this.save.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not allowed */ } } }
  panel(html, buttons) {
    const ov = this.el.ov;
    ov.innerHTML = `<div class="tk-card" role="dialog" aria-modal="true">${html}<div class="tk-btns">${buttons.map(([l, a, v, alt]) => `<button data-a="${a}"${v !== undefined ? ` data-v="${v}"` : ''}${alt ? ' class="alt"' : ''}>${l}</button>`).join('')}</div></div>`;
    ov.style.display = 'grid';
    const f = ov.querySelector('.tk-btns button'); if (f) f.focus({ preventScroll: true });
  }

  hide() { this.el.ov.style.display = 'none'; this.el.ov.innerHTML = ''; }
  get panelOpen() { return this.el.ov.style.display === 'grid'; }
  live() { return this.state === 'play' || this.paused; } // a puzzle is in progress
  label() { return this.mode === 'daily' ? 'Daily puzzle' : `Level ${this.lvl}`; }

  // ───────── layout ─────────
  resize() {
    const w = this.container.clientWidth || 640; const h = this.container.clientHeight || 640;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.hh = Math.round(clamp(h * 0.095, 46, 76)); this.ph = Math.round(clamp(h * 0.1, 54, 84));
    const land = w > (h - this.hh - this.ph) * 1.12; if (land) this.ph = 0; // wide screens: the tools move beside the field
    this.root.classList.toggle('land', land); this.root.style.setProperty('--hh', `${this.hh}px`); this.root.style.setProperty('--ph', `${this.ph}px`);
    const ay = this.hh; const ah = h - this.hh - this.ph; const th = clamp(ah * 0.05, 24, 36);
    let bs; let bx; let by; let tags; let help;
    if (!land) { // tags row, field, one line of help
      bs = Math.min(w - 36, ah - th - 54); bx = (w - bs) / 2; const dy = Math.max(0, (ah - th - 54 - bs) / 2); by = ay + th + 14 + dy; // spare height is split above and below
      tags = { x: bx, y: ay + 6 + dy, w: bs, h: th }; help = { x: w / 2, y: by + bs + 22, lines: 1 };
    } else { // field on the left; tags and help on the right
      bs = Math.min(ah - 52, w * 0.58, 820); const rw = Math.min(540, w * 0.36); bx = Math.max(8, (w - bs - 22 - rw) / 2); by = ay + (ah - bs) / 2; // field and side panel centred together
      const x0 = bx + bs + 22; const top = by + Math.max(0, bs / 2 - 110); // side panel sits at the middle of the field
      tags = { x: x0, y: top, w: rw, h: th }; help = { x: x0 + rw / 2, y: top + th + 40, lines: 3 };
    }
    const st = this.root.style; st.setProperty('--rx', `${land ? tags.x : 0}px`); st.setProperty('--rw', `${land ? tags.w : 0}px`); st.setProperty('--dt', `${tags.y + th + 150}px`);
    this.L = { board: { x: bx, y: by, s: bs }, tags, help }; this.cell = bs / this.n;
    this.sprites.clear(); this.sig = null; // resizing wipes the canvas, so paint again
  }

  sprite(size) {
    const S = Math.max(8, Math.round(size * this.dpr)); let c = this.sprites.get(S);
    if (!c) { c = makeSprite(S); this.sprites.set(S, c); }
    return c;
  }

  cellAt(x, y) { const { x: bx, y: by, s } = this.L.board; const c = Math.floor(((x - bx) / s) * this.n); const r = Math.floor(((y - by) / s) * this.n); return r >= 0 && r < this.n && c >= 0 && c < this.n ? r * this.n + c : -1; }
  cellXY(i) { const { x, y } = this.L.board; return [x + (i % this.n) * this.cell, y + Math.floor(i / this.n) * this.cell]; }

  // ───────── starting and ending puzzles ─────────
  setup(d) {
    const p = puzzleFor({ mode: d.mode, level: d.level, day: d.day });
    this.mode = d.mode; this.lvl = d.level || 1; this.day = d.day || 0; this.n = p.n; this.reg = p.regions; this.sol = p.cols;
    this.hard = d.hard === undefined ? this.save.hard : d.hard; this.lives = this.hard ? HARD_LIVES : LIVES; this.lockI = this.hard ? -1 : startCell(p.n, p.regions, p.cols); this.cells = Uint8Array.from(d.cells || new Array(p.n * p.n).fill(0)); this.pops = new Float32Array(p.n * p.n);
    if (this.lockI >= 0 && this.cells[this.lockI] !== 2) { this.cells[this.lockI] = 2; this.crossAround(this.lockI); } // every puzzle starts with one tomato already planted
    this.mistakes = Math.min(d.mistakes || 0, this.lives - 1); this.hintsUsed = d.hintsUsed || 0; this.time = d.time || 0;
    this.undo = []; this.sel = -1; this.drag = null; this.parts = []; this.floats = []; this.rings = []; this.sweep = 0; this.bad = null; this.hintCell = -1; this.paused = false;
    this.cell = this.L.board.s / this.n; this.sig = null; this.state = 'play'; this.hide(); this.hud(); this.saveRun();
  }

  start(mode, level) { this.setup({ mode, level, day: mode === 'daily' ? dayNum() : 0 }); }

  gainXp(n) { this.save.xp = Math.min(1e9, this.save.xp + Math.floor(n)); }

  saveRun() {
    this.save.run = this.live() ? { mode: this.mode, level: this.lvl, day: this.day, cells: Array.from(this.cells), mistakes: this.mistakes, hintsUsed: this.hintsUsed, time: Math.floor(this.time), hard: this.hard } : null;
    this.persist();
  }

  win() {
    this.state = 'win'; const s = this.save; const t = Math.floor(this.time); const perfect = this.mistakes === 0;
    s.solved = Math.min(1e5, s.solved + 1); s.stats.games++; if (perfect) s.stats.perfect++;
    let base = 30 + this.n * 10; let extra = ''; let firstClear = false;
    if (this.mode === 'daily') {
      if (s.daily.day === this.day) base = 0; // a replay: fun, but no second reward
      else { s.daily.streak = s.daily.day === this.day - 1 ? s.daily.streak + 1 : 1; s.daily.day = this.day; firstClear = true; }
      extra = `<p>${s.daily.streak}-day streak${base ? '' : ' · already harvested today'}</p>`;
    } else {
      const stars = 1 + (perfect ? 1 : 0) + (this.hintsUsed === 0 ? 1 : 0);
      firstClear = !s.stars[this.lvl]; s.stars[this.lvl] = Math.max(s.stars[this.lvl] || 0, stars); s.level = Math.min(MAX_LEVEL, Math.max(s.level, this.lvl + 1));
      extra = `<div class="big">${starText(stars)}</div><p><small>★ solved · ★ no mistakes · ★ no hints</small></p>`;
    }
    if (firstClear && s.hints < MAX_HINTS) { s.hints++; extra += '<p>+1 hint</p>'; }
    const xp = base ? Math.max(10, Math.round(base * (perfect ? 1.5 : 1) - this.hintsUsed * 5)) : 0;
    const before = xpLevel(s.xp); s.run = null; this.gainXp(xp);
    this.persist(); this.sound.win(); this.buzz(60); this.sweep = 0.001;
    for (let i = 0; i < this.n * this.n; i++) if (this.cells[i] === 2) for (let k = 0; k < 3; k++) this.burst(i);
    this.hud();
    this.panel(`<h2>Harvest complete</h2><p>${this.label()} · ${fmt(t)} · ${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}${this.hintsUsed ? ` · ${this.hintsUsed} hint${this.hintsUsed === 1 ? '' : 's'}` : ''}</p>${extra}<p><small>+${xp} XP</small>${xpLevel(s.xp) > before ? `<br><b>⬆ Gardener level ${xpLevel(s.xp)}!</b>` : ''}</p>`,
      this.mode === 'daily' ? [['Menu', 'menu']] : [[this.lvl < MAX_LEVEL ? 'Next level' : 'Levels', this.lvl < MAX_LEVEL ? 'level' : 'levels', this.lvl + 1], ['Levels', 'levels', undefined, 1], ['Menu', 'menu', undefined, 1]]);
  }

  lose() {
    this.state = 'over'; const s = this.save; s.run = null; s.stats.games++; this.gainXp(5); this.persist(); this.sound.over(); this.buzz(80); this.hud();
    this.panel(`<h2>Out of lives</h2><p>${this.lives} tomatoes in the wrong place. The same puzzle is waiting.</p>`, [['Try again', 'restart'], ['Menu', 'menu', undefined, 1]]);
  }

  // ───────── playing ─────────
  isRight(i) { return this.sol[Math.floor(i / this.n)] === i % this.n; }

  // tap: empty -> cross, cross -> tomato, tomato -> clear
  tap(i) {
    if (this.state !== 'play' || i < 0) return;
    if (i === this.lockI) { this.toast('That tomato is locked in place'); this.sound.bad(); return; }
    this.undo.push(this.cells.slice()); if (this.undo.length > 200) this.undo.shift();
    const v = this.cells[i];
    if (v === 0) { this.cells[i] = 1; this.sound.pick(); } else if (v === 1) { this.plant(i, false); } else { this.cells[i] = 0; this.sound.pick(); }
    this.saveRun(); this.hud();
  }

  crossAround(i) { if (this.save.auto && !this.hard) for (const j of blockedBy(this.n, this.reg, i)) if (this.cells[j] === 0) this.cells[j] = 1; }

  // a puzzle that has been played for a while is not thrown away by one stray tap
  sure(a, v) {
    if (this.ok || !this.live() || this.time <= 10) return true;
    this.ask = [a, v]; this.pauseFirst();
    this.panel('<h2>Leave this puzzle?</h2><p>Your progress on it will be lost.</p>', [['Leave puzzle', 'leave'], ['Keep playing', 'pause', undefined, 1]]);
    return false;
  }

  // opening Levels or Rules from a running puzzle pauses it first
  pauseFirst() { if (this.state === 'play') { this.paused = true; this.state = 'menu'; } }

  plant(i, fromHint) {
    if (!fromHint && !this.isRight(i)) { // a tomato in the wrong spot costs a life and turns into a cross
      this.cells[i] = 1; this.mistakes++; this.bad = { i, t: 1 }; this.shake = this.reduce ? 0 : 8; this.sound.bad(); this.buzz(40);
      this.toast(`Not there · ${this.lives - this.mistakes} ${this.lives - this.mistakes === 1 ? 'life' : 'lives'} left`);
      if (this.mistakes >= this.lives) this.lose();
      return;
    }
    this.cells[i] = 2; this.pops[i] = 1; this.rings.push({ i, t: 0 }); this.sound.put(); this.burst(i);
    this.crossAround(i);
    let planted = 0; for (let k = 0; k < this.n * this.n; k++) if (this.cells[k] === 2) planted++;
    if (planted === this.n) this.win();
  }

  undoMove() {
    if (this.state !== 'play') return;
    const u = this.undo.pop();
    if (!u) { this.toast('Nothing to undo'); return; }
    this.cells = Uint8Array.from(u); this.sound.pick(); this.saveRun(); this.hud();
  }

  // plants a correct tomato in the patch with the fewest open squares (the one a person would reason about next)
  hint() {
    if (this.state !== 'play') return;
    if (this.save.hints <= 0) { this.toast('No hints left. Clear levels to earn more'); this.sound.bad(); return; }
    const n = this.n; const rows = [];
    for (let y = 0; y < n; y++) if (this.cells[y * n + this.sol[y]] !== 2) rows.push(y);
    if (!rows.length) return;
    const open = (reg) => { let c = 0; for (let i = 0; i < n * n; i++) if (!this.cells[i] && this.reg[i] === reg) c++; return c; };
    rows.sort((a, b) => open(this.reg[a * n + this.sol[a]]) - open(this.reg[b * n + this.sol[b]]));
    const i = rows[0] * n + this.sol[rows[0]];
    this.undo.push(this.cells.slice()); this.save.hints--; this.hintsUsed++; this.hintCell = i; this.hintT = 2.5; this.sound.power();
    this.plant(i, true); this.saveRun(); this.hud();
  }

  burst(idx) {
    const [x0, y0] = this.cellXY(idx); const cs = this.cell; const n = this.reduce ? 1 : 5;
    for (let k = 0; k < n && this.parts.length < 400; k++) {
      const a = Math.random() * 6.283; const sp = cs * (2 + Math.random() * 4);
      this.parts.push({ x: x0 + cs / 2, y: y0 + cs / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cs * 3, life: 0.5 + Math.random() * 0.4, max: 0.9, size: cs * (0.06 + Math.random() * 0.08), color: k % 3 === 2 ? '#ffe9a0' : '#e8382f' });
    }
  }

  // ───────── input ─────────
  pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * this.w) / r.width, y: ((e.clientY - r.top) * this.h) / r.height }; }

  onDown(e) {
    this.sound.resume();
    if (this.state !== 'play') return;
    const { x, y } = this.pt(e); const i = this.cellAt(x, y); if (i < 0) return;
    this.sel = i; this.drag = { start: i, moved: false, mode: this.cells[i] === 1 ? 'erase' : 'paint', seen: new Set([i]) };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  }

  // dragging across empty squares crosses them out (or, starting on a cross, rubs crosses out)
  onMove(e) {
    const d = this.drag; if (!d) return;
    const { x, y } = this.pt(e); const i = this.cellAt(x, y); if (i < 0 || d.seen.has(i)) return;
    if (!d.moved) { d.moved = true; this.undo.push(this.cells.slice()); this.dragApply(d.start); }
    d.seen.add(i); this.dragApply(i);
  }

  dragApply(i) { const d = this.drag; if (d.mode === 'paint' && this.cells[i] === 0) this.cells[i] = 1; else if (d.mode === 'erase' && this.cells[i] === 1) this.cells[i] = 0; }

  onUp() {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.moved) { this.sound.pick(); this.saveRun(); this.hud(); } else this.tap(d.start);
  }

  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === ' ') && e.target.closest?.('button')) return; // the focused button handles it
    if (k === 'escape' || k === 'p') {
      if (this.state === 'play' && !this.panelOpen) { e.preventDefault(); this.act('pause'); } else if (this.panelOpen && this.paused) { e.preventDefault(); this.act('resume'); }
      return;
    }
    if (this.state !== 'play' || this.panelOpen) return;
    const n = this.n; const move = { arrowleft: [0, -1], arrowright: [0, 1], arrowup: [-1, 0], arrowdown: [1, 0] }[k];
    if (move) {
      e.preventDefault();
      if (this.sel < 0) { this.sel = 0; return; }
      this.sel = clamp(Math.floor(this.sel / n) + move[0], 0, n - 1) * n + clamp((this.sel % n) + move[1], 0, n - 1);
    } else if (k === 'enter' || k === ' ') { if (this.sel >= 0) { e.preventDefault(); this.tap(this.sel); } }
    else if (k === 'x') { if (this.sel >= 0 && this.cells[this.sel] === 0) { this.undo.push(this.cells.slice()); this.cells[this.sel] = 1; this.sound.pick(); this.saveRun(); this.hud(); } }
    else if (k === 'backspace' || k === 'delete') { e.preventDefault(); if (this.sel >= 0 && this.sel !== this.lockI && this.cells[this.sel]) { this.undo.push(this.cells.slice()); this.cells[this.sel] = 0; this.sound.pick(); this.saveRun(); this.hud(); } }
    else if (k === 'h') this.hint();
    else if (k === 'z') this.undoMove();
  }

  // ───────── menus ─────────
  showMenu() {
    this.state = 'menu'; this.paused = false; this.hud();
    const s = this.save; const lvl = xpLevel(s.xp); const lo = xpFor(lvl); const hi = xpFor(lvl + 1); const r = s.run;
    const today = s.daily.day === dayNum();
    this.panel(`<h1>Tomatoku</h1><p><small>Plant one tomato in every row, column and colour. No two may touch.</small></p>
      <p><b>Gardener level ${lvl}</b> <small>· ${s.solved} solved · ${totalStars(s)} ★</small></p><div class="xp"><i style="width:${Math.round(((s.xp - lo) / (hi - lo)) * 100)}%"></i></div>`,
    [r ? [`Continue · ${r.mode === 'daily' ? 'daily puzzle' : `level ${r.level}`} · ${fmt(r.time)}`, 'resumerun'] : [`Play level ${s.level}`, 'level', s.level],
      ...(r ? [[`Play level ${s.level}`, 'level', s.level, 1]] : []),
      [`Daily puzzle${s.daily.streak && (today || s.daily.day === dayNum() - 1) ? ` · ${s.daily.streak}-day streak` : ''}${today ? ' · done' : ''}`, 'daily', undefined, 1], ['Levels', 'levels', undefined, 1], ['How to play', 'how', undefined, 1], ['Stats and settings', 'settings', undefined, 1]]);
  }

  showLevels() {
    this.state = 'menu';
    const s = this.save; const cells = [];
    for (let n = 1; n <= s.level; n++) cells.push(`<button data-a="level" data-v="${n}">${n}<small>${starText(s.stars[n] || 0)}</small></button>`);
    this.panel(`<h2>Levels</h2><p><small>${totalStars(s)} ★ earned · fields grow from 5×5 to 9×9</small></p><div class="tk-grid">${cells.join('')}</div>`, [['Back', this.paused ? 'pause' : 'menu', undefined, 1]]);
  }

  showHow() {
    this.panel(`<h2>How to play</h2><ul><li><b>1st tap: ✕</b> marks a square that cannot hold a tomato.</li>
      <li><b>2nd tap: tomato</b> plants a tomato there.</li><li><b>3rd tap: clear</b> the square and keep solving. Drag across squares to cross out many.</li>
      <li><b>One tomato per row and column.</b></li><li><b>One tomato per colour.</b> Each coloured patch holds exactly one.</li>
      <li><b>No tomatoes around a tomato.</b> The eight squares around it are blocked.</li>
      <li>A tomato in the wrong spot costs a life. You have three.</li></ul>
      <p>Every puzzle starts with one <b>locked tomato</b>. Begin there.</p><p><b>To win:</b> plant all the tomatoes so every row, column and colour has one, with none touching.</p>
      <p><small>Keys: arrows move · Enter taps · X cross out · Backspace clear · H hint · Z undo · P pause</small></p>`, [['Got it', this.paused ? 'pause' : 'menu', undefined, 0]]);
  }

  showSettings() {
    const s = this.save; const lvl = xpLevel(s.xp);
    this.panel(`<h2>Stats & settings</h2>
      <p><b>Gardener level ${lvl}</b> · ${s.xp.toLocaleString()} XP · ${totalStars(s)} ★<br><small>${s.solved} solved · ${s.stats.perfect} flawless · ${s.stats.games} played · daily streak ${s.daily.streak} · ${s.hints} hints</small></p>
      <div class="row"><button data-a="sfx" class="${s.sfx ? 'sel' : ''}">Sound: ${s.sfx ? 'on' : 'off'}</button><button data-a="vibe" class="${s.vibe ? 'sel' : ''}">Vibrate: ${s.vibe ? 'on' : 'off'}</button><button data-a="auto" class="${s.auto ? 'sel' : ''}">Auto cross-out: ${s.auto ? 'on' : 'off'}</button><button data-a="hard" class="${s.hard ? 'sel' : ''}">Hard mode: ${s.hard ? 'on' : 'off'}</button></div>
      <p><small>Hard mode: no locked tomato, no auto cross-out, two lives. Applies from the next puzzle.</small></p>
      <p><small>Backgrounds. More unlock as your gardener level rises.</small></p>
      <div class="row">${THEMES.map((t) => `<button data-a="theme" data-v="${t.id}" class="${this.theme().id === t.id ? 'sel' : ''}"${lvl < t.need ? ' disabled' : ''}>${t.name}${lvl < t.need ? `<br><small>level ${t.need}</small>` : ''}</button>`).join('')}</div>`, [['Back', this.paused ? 'pause' : 'menu', undefined, 0]]);
  }

  act(a, v) {
    switch (a) {
      case 'level': if (!this.sure(a, v)) break; this.start('level', clamp(+v || 1, 1, Math.min(MAX_LEVEL, this.save.level))); break;
      case 'daily': if (!this.sure(a, v)) break; this.start('daily'); break;
      case 'leave': this.ok = true; this.act(...this.ask); this.ok = false; break;
      case 'resumerun': this.setup(this.save.run); break;
      case 'restart': if (!this.sure(a, v)) break; this.setup({ mode: this.mode, level: this.lvl, day: this.day }); break;
      case 'levels': this.pauseFirst(); this.showLevels(); break;
      case 'how': case 'rules': this.pauseFirst(); this.showHow(); break;
      case 'settings': this.showSettings(); break;
      case 'menu': if (this.live()) this.saveRun(); this.state = 'menu'; this.paused = false; this.showMenu(); break;
      case 'pause':
        if (this.state !== 'play' && !this.paused) break;
        this.paused = true; this.state = 'menu';
        this.panel(`<h2>Paused</h2><p>${this.label()} · ${fmt(this.time)}</p>`, [['Resume', 'resume'], ['Stats and settings', 'settings', undefined, 1], ['Restart puzzle', 'restart', undefined, 1], ['Menu', 'menu', undefined, 1]]);
        break;
      case 'resume': this.paused = false; this.state = 'play'; this.hide(); break;
      case 'hint': this.hint(); break;
      case 'undo': this.undoMove(); break;
      case 'sfx': this.save.sfx = !this.save.sfx; this.persist(); this.showSettings(); break;
      case 'vibe': this.save.vibe = !this.save.vibe; this.persist(); this.showSettings(); break;
      case 'hard': this.save.hard = !this.save.hard; this.persist(); this.showSettings(); break;
      case 'auto': this.save.auto = !this.save.auto; this.persist(); this.showSettings(); break;
      case 'theme': this.save.theme = v; this.persist(); this.applyTheme(); this.showSettings(); break;
      default: break;
    }
  }

  // ───────── HUD (HTML parts) ─────────
  hud() {
    const e = this.el; const left = this.lives - this.mistakes; const on = this.state === 'play';
    let planted = 0; for (let i = 0; i < this.n * this.n; i++) if (this.cells[i] === 2) planted++;
    put(e.ml, this.mode ? `Tomatoku · ${this.label()} · ${planted}/${this.n}` : 'Tomatoku'); put(e.mv, fmt(this.time));
    const lv = this.mode ? `${left}/${this.lives}` : '';
    if (e.lives.dataset.v !== lv) { e.lives.dataset.v = lv; e.lives.innerHTML = this.mode ? Array.from({ length: this.lives }, (_, k) => `<i class="${k < left ? '' : 'lost'}">${HEART}</i>`).join('') : ''; e.lives.setAttribute('aria-label', `${left} lives left`); }
    const t = e.tool;
    put(t.hint.querySelector('b'), this.mode ? this.save.hints : ''); t.hint.classList.toggle('off', !on || this.save.hints <= 0);
    t.undo.classList.toggle('off', !on || !this.undo.length); t.restart.classList.toggle('off', !this.mode);
  }

  // ───────── drawing ─────────
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    if (document.hidden) return;
    if (this.state === 'play') { this.time += dt; put(this.el.mv, fmt(this.time)); }
    this.shake = Math.max(0, this.shake - dt * 40); if (this.bad) { this.bad.t -= dt * 2.2; if (this.bad.t <= 0) this.bad = null; } this.hintT = Math.max(0, this.hintT - dt);
    for (let i = 0; i < this.pops.length; i++) if (this.pops[i] > 0) this.pops[i] = Math.max(0, this.pops[i] - dt * 6);
    for (const p of this.parts) { p.life -= dt; p.vy += this.cell * 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) f.t += dt; this.floats = this.floats.filter((f) => f.t < 0.9);
    for (const r of this.rings) r.t += dt * 2.2; this.rings = this.rings.filter((r) => r.t < 1);
    if (this.sweep > 0) { this.sweep += dt * 1.1; if (this.sweep > 1) this.sweep = 0; }

    // a still board is not repainted: only when something moves or the marks, selection or screen changed
    const busy = this.parts.length || this.floats.length || this.rings.length || this.sweep > 0 || this.bad || this.hintT > 0 || this.shake > 0 || this.pops.some((v) => v > 0);
    const sig = `${this.state}${this.paused}${this.sel}${this.mistakes}${this.undo.length}${this.cells.join('')}`;
    if (!busy && sig === this.sig) return;
    this.sig = sig;
    const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.w, this.h);
    g.save();
    if (this.shake > 0.2) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawBoard(g, t);
    g.restore();
    this.drawTags(g); this.drawHelp(g); this.drawFx(g);
  }

  drawBoard(g, t) {
    const { x, y, s } = this.L.board; const n = this.n; const cs = this.cell; const show = (this.mode && this.state !== 'menu') || this.paused;
    const pad = 10; const fw = s + pad * 2;
    g.fillStyle = INK; rr(g, x - pad, y - pad + 7, fw, fw, 26); g.fill(); // hard drop shadow
    g.fillStyle = '#34387a'; rr(g, x - pad, y - pad, fw, fw, 26); g.fill();
    g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
    const gp = Math.max(3, cs * 0.07); const rad = cs * 0.2; const lw = Math.max(2, cs * 0.045);
    const tile = (cx, cy, fill) => {
      g.fillStyle = fill; rr(g, cx + gp / 2, cy + gp / 2, cs - gp, cs - gp, rad); g.fill();
      g.fillStyle = 'rgba(255,255,255,.34)'; rr(g, cx + gp / 2 + lw + cs * 0.04, cy + gp / 2 + lw, cs - gp - 2 * lw - cs * 0.08, cs * 0.1, cs * 0.05); g.fill(); // gloss
      g.fillStyle = 'rgba(0,0,0,.13)'; rr(g, cx + gp / 2 + lw, cy + cs - gp / 2 - lw - cs * 0.09, cs - gp - 2 * lw, cs * 0.09, cs * 0.05); g.fill(); // underside
      g.strokeStyle = INK; g.lineWidth = lw; rr(g, cx + gp / 2, cy + gp / 2, cs - gp, cs - gp, rad); g.stroke();
    };
    if (!show) { for (let i = 0; i < n * n; i++) { const [cx, cy] = this.cellXY(i); tile(cx, cy, '#4a4f9c'); } return; }
    g.save(); rr(g, x - pad, y - pad, fw, fw, 26); g.clip();
    for (let i = 0; i < n * n; i++) { const [cx, cy] = this.cellXY(i); tile(cx, cy, PATCH[this.reg[i]]); }
    if (this.sel >= 0 && this.state === 'play') { const [sx, sy] = this.cellXY(this.sel); g.strokeStyle = '#fff'; g.lineWidth = Math.max(3, cs * 0.06); rr(g, sx + gp / 2 + lw, sy + gp / 2 + lw, cs - gp - 2 * lw, cs - gp - 2 * lw, rad * 0.8); g.stroke(); }
    for (let i = 0; i < n * n; i++) {
      const v = this.cells[i]; if (!v) continue;
      const [cx, cy] = this.cellXY(i);
      if (v === 1) {
        const m = cs * 0.17; g.strokeStyle = 'rgba(29,31,69,.7)'; g.lineWidth = Math.max(2.5, cs * 0.075); g.lineCap = 'round'; g.beginPath();
        g.moveTo(cx + cs / 2 - m, cy + cs / 2 - m); g.lineTo(cx + cs / 2 + m, cy + cs / 2 + m); g.moveTo(cx + cs / 2 + m, cy + cs / 2 - m); g.lineTo(cx + cs / 2 - m, cy + cs / 2 + m); g.stroke();
      } else {
        const k = 1 - 0.35 * this.pops[i] * this.pops[i]; const sz = cs * 0.96 * k;
        g.drawImage(this.sprite(cs * 0.96), cx + (cs - sz) / 2, cy + (cs - sz) / 2, sz, sz);
        if (i === this.lockI) { // a gold padlock on the starting tomato
          const lk = cs * 0.28; const lx = cx + cs - lk - gp - 2; const ly = cy + cs - lk - gp - 2;
          g.strokeStyle = INK; g.lineWidth = lk * 0.2; g.beginPath(); g.arc(lx + lk / 2, ly + lk * 0.38, lk * 0.24, Math.PI, 0); g.stroke();
          g.fillStyle = '#ffd23f'; rr(g, lx, ly + lk * 0.38, lk, lk * 0.62, lk * 0.15); g.fill(); g.lineWidth = lk * 0.14; g.stroke();
        }
      }
    }
    if (this.bad) { const [bx, by] = this.cellXY(this.bad.i); g.fillStyle = `rgba(255,59,74,${0.65 * this.bad.t})`; rr(g, bx + gp / 2, by + gp / 2, cs - gp, cs - gp, rad); g.fill(); }
    if (this.hintT > 0 && this.hintCell >= 0) { const [hx, hy] = this.cellXY(this.hintCell); g.fillStyle = `rgba(255,255,255,${0.3 + 0.25 * Math.sin(t / 140)})`; rr(g, hx + gp / 2, hy + gp / 2, cs - gp, cs - gp, rad); g.fill(); }
    for (const r of this.rings) { const [rx, ry] = this.cellXY(r.i); g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - r.t)})`; g.lineWidth = 3; g.beginPath(); g.arc(rx + cs / 2, ry + cs / 2, cs * (0.3 + 0.7 * r.t), 0, 7); g.stroke(); }
    if (this.sweep > 0) { // a pulse of light across the field when the puzzle is solved
      const sx = x - s * 0.4 + this.sweep * s * 1.8; const band = g.createLinearGradient(sx - s * 0.25, y, sx + s * 0.25, y + s * 0.4);
      band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,.7)'); band.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = band; g.fillRect(x, y, s, s);
    }
    g.restore();
  }

  // one pill per patch: its colour, and a tomato once that patch has one
  drawTags(g) {
    if (!this.mode || (this.state === 'menu' && !this.paused)) return;
    const { x, y, w, h } = this.L.tags; const n = this.n; const gap = 7; const tw = Math.min(h * 1.7, (w - gap * (n - 1)) / n); const ph = h * 0.6; const total = tw * n + gap * (n - 1); const x0 = x + (w - total) / 2; const y0 = y + (h - ph) / 2;
    const done = new Set(); for (let i = 0; i < n * n; i++) if (this.cells[i] === 2) done.add(this.reg[i]);
    for (let r = 0; r < n; r++) {
      const d = done.has(r); const tx = x0 + r * (tw + gap);
      g.save(); g.globalAlpha = d ? 1 : 0.5; g.fillStyle = PATCH[r]; rr(g, tx, y0, tw, ph, ph / 2); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(); g.restore();
      if (d) { const sz = ph * 1.6; g.drawImage(this.sprite(sz), tx + (tw - sz) / 2, y0 + (ph - sz) / 2 - ph * 0.05, sz, sz); }
    }
  }

  drawHelp(g) {
    if (this.state !== 'play') return;
    let planted = 0; for (let i = 0; i < this.n * this.n; i++) if (this.cells[i] === 2) planted++;
    const first = planted === 1 && this.mistakes === 0 && !this.undo.length && this.lockI >= 0;
    const { x, y, lines } = this.L.help; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.round(clamp(Math.min(this.w * 0.032, this.h * 0.022), 12, 22))}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.92)';
    g.shadowColor = INK; g.shadowOffsetY = 2; g.shadowBlur = 0;
    if (first) g.fillText('Start from the locked tomato.', x, y);
    else if (lines === 1) g.fillText('Tap to cross out, again to plant, again to clear. Drag to cross out many.', x, y);
    else ['Tap to cross out', 'Tap again to plant', 'Tap again to clear', 'Drag to cross out many'].forEach((l, k) => g.fillText(l, x, y + k * 26));
    g.shadowColor = 'transparent'; g.shadowOffsetY = 0;
  }

  drawFx(g) {
    for (const p of this.parts) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of this.floats) { g.globalAlpha = Math.max(0, 1 - f.t / 0.9); g.font = `800 ${Math.round(f.size)}px ${FONT}`; g.fillText(f.text, f.x, f.y - f.t * this.cell * 0.9); }
    g.globalAlpha = 1;
  }

  destroy() {
    cancelAnimationFrame(this.raf); clearTimeout(this.toastT);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize);
    if (this.ro) this.ro.disconnect();
    if (this.live()) this.saveRun(); else this.persist();
    this.sound.destroy(); this.root.remove();
  }
}
