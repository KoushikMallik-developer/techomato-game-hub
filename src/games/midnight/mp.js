// Midnight Pursuit online play: free roam together, live races and co-op pursuits over peer-to-peer rooms.
//
// Every player simulates their own car, traffic and police; what the others see of you is streamed
// ~15 times a second (your car plus the cops chasing you) and drawn as interpolated remote cars that
// you can bump into. The host starts races for everyone and relays messages between guests.
import * as THREE from 'three';
import { NetRoom, playerName, savePlayerName } from '../shared/net.js';
import { carById, CARS, EVENTS, fmtTime, clamp, lerp, wrapAngle } from './data.js';

const SEND_HZ = 15;
const INTERP_MS = 130;
const COLORS = ['#ff2d55', '#00d1ff', '#7cff4f', '#ffb000', '#b388ff', '#ff7ae6', '#2bffd5', '#ff8a1f', '#e8e8e8', '#5b8cff'];
const RACE_TYPES = new Set(['sprint', 'circuit']);

const CSS = `
.mp-online{display:grid;gap:.8em;max-width:34em;width:100%}
.mp-online input{font:inherit;font-size:1.05em;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:.35em;padding:.6em .8em;width:100%;box-sizing:border-box;letter-spacing:.06em}
.mp-online input.code{text-transform:uppercase;font-size:1.5em;text-align:center;letter-spacing:.3em}
.mp-online .two{display:grid;grid-template-columns:1fr 1fr;gap:.6em}
.mp-online .code-big{font-size:2.6em;font-weight:700;letter-spacing:.25em;color:#ffb000;text-align:center;padding:.15em 0;user-select:all}
.mp-online .err{color:#ff4d6d;min-height:1.2em}
.mp-online .hint{color:#9aa3b5;font-size:.9em;line-height:1.4}
.mp-plist{display:grid;gap:.3em}
.mp-plist div{display:flex;align-items:center;gap:.6em;padding:.45em .7em;background:rgba(255,255,255,.05);border-radius:.3em}
.mp-plist i{width:.8em;height:.8em;border-radius:50%;display:inline-block}
.mp-plist small{margin-left:auto;color:#9aa3b5}
.mp-team{position:absolute;right:1.1em;top:6.6em;display:grid;gap:.25em;font-size:.82em;pointer-events:none;text-align:right}
.mp-team div{background:rgba(8,10,18,.6);padding:.2em .6em;border-radius:.3em;color:#e8ecf4;white-space:nowrap}
.mp-team i{display:inline-block;width:.6em;height:.6em;border-radius:50%;margin-right:.4em}
.mp-team b{color:#ff4d6d;margin-left:.4em}
.mp-team .code{color:#ffb000;font-weight:700;letter-spacing:.12em}
.mp-chat{position:absolute;left:50%;bottom:9.5em;transform:translateX(-50%);width:min(30em,80%);display:none}
.mp-chat.on{display:block}
.mp-chat input{width:100%;box-sizing:border-box;font:inherit;color:#fff;background:rgba(8,10,18,.85);border:1px solid #ffb000;border-radius:.35em;padding:.55em .8em}
.touch .mp-team{top:5.4em;font-size:.72em}
`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A car driven by someone else: drawn from interpolated snapshots, solid for collisions.
class RemoteCar {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.kind = 'remote';
    this.role = 'remote';
    this.halfLen = 1.35;
    this.bodyR = 1.0;
    this.mass = 1.4;
    this.x = 0; this.y = -500; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.speed = 0;
    this.buf = [];
    this.parts = null;
    this.carKey = '';
    this.spin = 0;
    this.cops = [];
    this.tag = null;
    this.state = {};
    this.lastSeen = performance.now();
  }

  setLook(meta) {
    const key = `${meta.car}|${meta.paint}`;
    if (key === this.carKey) { this.updateTag(meta); return; }
    this.carKey = key;
    const G = this.game;
    if (this.parts) { G.factory.dispose(this.parts); }
    const def = carById(meta.car) || CARS[0];
    this.parts = G.factory.build(def.style, meta.paint || def.color, { flames: true, modelKey: def.id });
    G.scene.add(this.parts.group);
    this.parts.group.visible = this.buf.length > 0;
    this.updateTag(meta);
  }

  updateTag(meta) {
    const G = this.game;
    if (!this.tag) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      this.tagCanvas = c;
      this.tagTex = new THREE.CanvasTexture(c);
      this.tagTex.colorSpace = THREE.SRGBColorSpace;
      this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, transparent: true, fog: false }));
      this.tag.scale.set(4.2, 1.05, 1);
      this.tag.renderOrder = 5;
      G.scene.add(this.tag);
    }
    const g = this.tagCanvas.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = String(meta.name || 'Player').slice(0, 14);
    const w = g.measureText(name).width + 34;
    g.fillStyle = 'rgba(8,10,18,.72)';
    g.beginPath();
    g.roundRect ? g.roundRect(128 - w / 2, 10, w, 44, 10) : g.rect(128 - w / 2, 10, w, 44);
    g.fill();
    g.fillStyle = meta.color || '#fff';
    g.fillRect(128 - w / 2 + 10, 25, 8, 14);
    g.fillStyle = '#fff';
    g.fillText(name, 128 + 6, 33);
    this.tagTex.needsUpdate = true;
  }

  push(s) {
    const now = performance.now();
    this.lastSeen = now;
    this.buf.push({ t: now, s });
    if (this.buf.length > 20) this.buf.shift();
    this.state = s;
  }

  update(dt) {
    if (!this.buf.length || !this.parts) return;
    const now = performance.now() - INTERP_MS;
    let a = this.buf[0];
    let b = null;
    for (let i = 1; i < this.buf.length; i++) {
      if (this.buf[i].t >= now) { b = this.buf[i]; a = this.buf[i - 1]; break; }
      a = this.buf[i];
    }
    const pa = a.s.p;
    let x; let y; let z; let h;
    if (b) {
      const f = clamp((now - a.t) / Math.max(1, b.t - a.t), 0, 1);
      const pb = b.s.p;
      x = lerp(pa[0], pb[0], f); y = lerp(pa[1], pb[1], f); z = lerp(pa[2], pb[2], f);
      h = pa[3] + wrapAngle(pb[3] - pa[3]) * f;
    } else {
      // newest snapshot is older than the render time: extrapolate a little with its velocity
      const ex = Math.min(0.25, (now - a.t) / 1000);
      x = pa[0] + pa[4] * ex; y = pa[1]; z = pa[2] + pa[5] * ex; h = pa[3];
    }
    const last = this.buf[this.buf.length - 1].s.p;
    this.vx = last[4]; this.vz = last[5];
    this.speed = Math.hypot(this.vx, this.vz);
    this.x = x; this.y = y; this.z = z; this.h = h;
    const g = this.parts.group;
    g.visible = true;
    g.position.set(x, y, z);
    g.rotation.set(0, h, 0);
    const vF = this.vx * Math.sin(h) + this.vz * Math.cos(h);
    this.spin += (vF * dt) / this.parts.dims.wheel;
    this.parts.wheels.forEach((w) => { w.rotation.x = this.spin; });
    this.parts.pivots.forEach((pv) => { pv.rotation.y = -(last[6] || 0) * 0.45; });
    const flags = last[7] || 0;
    this.parts.tail.emissiveIntensity = flags & 1 ? 4 : 1.2;
    this.parts.flames.forEach((f) => { f.visible = !!(flags & 2); if (flags & 2) f.scale.set(1, 1, 0.7 + Math.random() * 0.7); });
    if (this.tag) {
      const d = Math.hypot(x - this.game.player.x, z - this.game.player.z);
      this.tag.visible = d < 350;
      this.tag.position.set(x, y + 2.4, z);
      const s = clamp(d / 40, 1, 4);
      this.tag.scale.set(4.2 * s, 1.05 * s, 1);
    }
    this.updateCops(this.state.c || []);
  }

  // the police chasing this player, as they see them
  updateCops(list) {
    const G = this.game;
    while (this.cops.length < list.length) {
      const parts = G.factory.build(list[this.cops.length][4] === 2 ? 'suv' : 'sedan', '#0f1115', { cop: true, modelKey: 'cop', paint2: '#f1f1f1', caliper: 3 });
      G.scene.add(parts.group);
      this.cops.push({ parts, kind: 'remote', role: 'remote', halfLen: 1.35, bodyR: 1.0, mass: 1.6, x: 0, y: -500, z: 0, h: 0, vx: 0, vz: 0, speed: 0, t: Math.random() });
    }
    const ph = Math.floor((G.time) * 7) % 2;
    this.cops.forEach((c, i) => {
      const s = list[i];
      c.parts.group.visible = !!s;
      if (!s) { c.y = -500; return; }
      // cops are sent at a lower rate; ease toward the latest position
      const k = Math.min(1, 12 * 0.016);
      c.x = c.y < -100 ? s[0] : lerp(c.x, s[0], k);
      c.y = s[1];
      c.z = c.y < -100 ? s[2] : lerp(c.z, s[2], k);
      c.h = c.h + wrapAngle(s[3] - c.h) * k;
      c.vx = s[5] || 0; c.vz = s[6] || 0;
      c.speed = Math.hypot(c.vx, c.vz);
      c.parts.group.position.set(c.x, c.y, c.z);
      c.parts.group.rotation.set(0, c.h, 0);
      const lb = c.parts.lightbar;
      if (lb) {
        const on = !(s[7] & 1);
        lb.red.emissiveIntensity = on ? (ph ? 7 : 0.2) : 0.3;
        lb.blue.emissiveIntensity = on ? (ph ? 0.2 : 7) : 0.3;
      }
    });
  }

  bodies() {
    return [this, ...this.cops.filter((c) => c.y > -100)];
  }

  dispose() {
    const G = this.game;
    if (this.parts) G.factory.dispose(this.parts);
    this.cops.forEach((c) => G.factory.dispose(c.parts));
    if (this.tag) { G.scene.remove(this.tag); this.tag.material.dispose(); this.tagTex.dispose(); }
  }
}

export class Multi {
  constructor(game) {
    this.game = game;
    this.room = null;
    this.remotes = new Map();
    this.sendT = 0;
    this.race = null;
    this.fins = new Map();
    const style = document.createElement('style');
    style.textContent = CSS;
    game.root.appendChild(style);
    game.ui.hud.insertAdjacentHTML('beforeend', '<div class="mp-team" hidden></div><div class="mp-chat"><input maxlength="80" placeholder="Say something... (Enter to send, Esc to close)"></div>');
    this.teamEl = game.ui.hud.querySelector('.mp-team');
    this.chatEl = game.ui.hud.querySelector('.mp-chat');
    this.chatIn = this.chatEl.querySelector('input');
    this.chatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') {
        const t = this.chatIn.value.trim();
        if (t) this.sendChat(t);
        this.closeChat();
      } else if (e.code === 'Escape') this.closeChat();
    });
    this.chatIn.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get active() { return !!this.room; }
  get isHost() { return !!(this.room && this.room.isHost); }

  myMeta() {
    const s = this.game.save;
    const def = carById(s.car);
    return { name: this.name || playerName(), car: def.id, paint: s.paint[def.id] || def.color, color: this.color || COLORS[0] };
  }

  // ───────────── lobby screens ─────────────
  showLobby(err = '') {
    const G = this.game;
    G.overlay = G.mode === 'play' ? 'online' : null;
    if (this.room) { this.showRoom(); return; }
    const name = this.name || playerName();
    G.setScreen(`<div class="mp-wrap mp-panel mp-online">
      <div class="mp-h"><h2>Online</h2><small>Drive with friends: free roam, races and team pursuits. Up to 8 players.</small></div>
      <label class="hint">Your name<input class="nm" maxlength="14" value="${esc(name)}"></label>
      <div class="two">
        <button class="mp-b primary" data-act="mp-host">Host a room</button>
        <div style="display:grid;gap:.4em"><input class="code" maxlength="5" placeholder="CODE"><button class="mp-b" data-act="mp-join">Join with code</button></div>
      </div>
      <div class="err">${esc(err)}</div>
      <p class="hint">Hosting gives you a 5-letter code to share. Players connect directly to each other; if a friend can't join, one of your networks may be blocking direct connections (common on some mobile and office networks).</p>
      <div class="mp-btns"><button class="mp-b" data-act="${G.mode === 'play' ? 'resume' : 'back'}">Back</button></div></div>`);
    const code = G.ui.screen.querySelector('input.code');
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') this.join(); });
    G.ui.screen.querySelector('input.nm').addEventListener('keydown', (e) => e.stopPropagation());
  }

  readName() {
    const el = this.game.ui.screen.querySelector('input.nm');
    const n = (el && el.value.trim().slice(0, 14)) || playerName();
    this.name = n;
    savePlayerName(n);
    return n;
  }

  status(text) {
    const e = this.game.ui.screen.querySelector('.mp-online .err');
    if (e) { e.style.color = '#9aa3b5'; e.textContent = text; }
  }

  async host() {
    this.readName();
    this.status('Opening a room...');
    try {
      this.color = COLORS[0];
      const room = await NetRoom.host('midnight', this.myMeta());
      this.attach(room);
      this.game.popup(`Room ${room.code} is open`, 'gold');
      this.showRoom();
    } catch (e) {
      this.showLobby(e.message || String(e));
    }
  }

  async join() {
    this.readName();
    const codeEl = this.game.ui.screen.querySelector('input.code');
    const code = (codeEl ? codeEl.value : '').trim().toUpperCase();
    if (code.length < 4) { this.showLobby('Enter the room code'); return; }
    this.status('Connecting...');
    try {
      const room = await NetRoom.join('midnight', code, this.myMeta());
      this.attach(room);
      // pick the first colour nobody else uses
      const used = new Set([...room.players.entries()].filter(([id]) => id !== room.myId).map(([, m]) => m.color));
      this.color = COLORS.find((c) => !used.has(c)) || COLORS[1];
      room.setMeta(this.myMeta());
      this.game.popup(`Joined room ${room.code}`, 'gold');
      this.game.startRoam();
    } catch (e) {
      this.showLobby(e.message || String(e));
    }
  }

  showRoom() {
    const G = this.game;
    const r = this.room;
    const rows = [...r.players.entries()].map(([id, m]) => `<div><i style="background:${m.color || '#fff'}"></i>${esc(m.name)}${id === r.myId ? ' (you)' : ''}<small>${id === r.myId && r.isHost ? 'host' : id.includes('-p') ? '' : 'host'} ${esc((carById(m.car) || {}).name || '')}</small>${r.isHost && id !== r.myId ? `<button class="mp-b" data-act="mp-kick" data-arg="${id}" style="padding:.2em .6em">Kick</button>` : ''}</div>`).join('');
    G.setScreen(`<div class="mp-wrap mp-panel mp-online">
      <div class="mp-h"><h2>Room</h2><small>${r.isHost ? 'Share this code with your friends' : 'Connected'}</small></div>
      <div class="code-big">${r.code}</div>
      <div class="mp-plist">${rows}</div>
      <p class="hint">${r.isHost ? 'Drive into a Sprint or Circuit marker and press Enter to race everyone in the room. Pause → Team pursuit sends the police after the whole crew.' : 'The host starts online races. Press T to chat.'}</p>
      <div class="mp-btns"><button class="mp-b primary" data-act="mp-drive">Drive</button><button class="mp-b" data-act="mp-leave">Leave room</button></div></div>`);
  }

  attach(room) {
    this.room = room;
    room.on('join', (id, meta) => {
      this.remote(id).setLook(meta);
      this.game.popup(`${meta.name} joined`, 'blue');
      if (this.game.overlay === 'online') this.showRoom();
    });
    room.on('meta', (id, meta) => { if (id !== room.myId) this.remote(id).setLook(meta); });
    room.on('leave', (id) => {
      const r = this.remotes.get(id);
      const m = r && r.meta;
      if (r) { r.dispose(); this.remotes.delete(id); }
      this.game.popup(`${(m && m.name) || 'A player'} left`, '');
      if (this.game.overlay === 'online') this.showRoom();
    });
    room.on('msg', (from, m) => this.onMsg(from, m));
    room.on('error', (e) => {
      this.game.popup(e, 'red');
      this.leave(true);
    });
    room.players.forEach((meta, id) => { if (id !== room.myId) this.remote(id).setLook(meta); });
  }

  remote(id) {
    let r = this.remotes.get(id);
    if (!r) {
      r = new RemoteCar(this.game, id);
      this.remotes.set(id, r);
    }
    r.meta = this.room.players.get(id) || r.meta || {};
    return r;
  }

  leave(silent = false) {
    if (!this.room) return;
    const room = this.room;
    this.room = null;
    room.close();
    this.remotes.forEach((r) => r.dispose());
    this.remotes.clear();
    this.teamEl.hidden = true;
    if (this.race && this.game.event && this.game.event.mp) this.game.cleanupEvent();
    this.race = null;
    if (!silent) this.game.popup('Left the room', '');
  }

  // ───────────── messages ─────────────
  onMsg(from, m) {
    const G = this.game;
    if (m.t === 's') {
      const r = this.remote(from);
      if (!r.parts) r.setLook(r.meta);
      r.push(m);
      return;
    }
    const who = (this.room.players.get(from) || {}).name || 'Someone';
    if (m.t === 'chat') { G.popup(`${who}: ${m.text}`, 'blue'); G.audio.beep(false); return; }
    if (m.t === 'note') { G.popup(`${who} ${m.text}`, m.cls || ''); return; }
    if (m.t === 'race') { this.beginRace(m); return; }
    if (m.t === 'fin') {
      this.fins.set(from, m.time);
      G.popup(`${who} finished · ${fmtTime(m.time)}`, 'gold');
      this.refreshResults();
      return;
    }
    if (m.t === 'tpur') {
      if (G.mode !== 'play' || G.event) return;
      if (!G.pursuit) G.startPursuit(m.heat || 2);
      G.bigMessage('TEAM PURSUIT', 'Lose the cops together · bounty x crew', 'red', 2200);
    }
  }

  sendChat(text) {
    if (!this.room) return;
    this.room.toAll({ t: 'chat', text: text.slice(0, 80) });
    this.game.popup(`You: ${text}`, '');
  }

  openChat() {
    if (!this.room) return;
    this.chatEl.classList.add('on');
    this.game.keys.clear();
    setTimeout(() => this.chatIn.focus(), 0);
  }

  closeChat() {
    this.chatEl.classList.remove('on');
    this.chatIn.value = '';
    this.game.root.focus({ preventScroll: true });
  }

  note(text, cls = '') { if (this.room) this.room.toAll({ t: 'note', text, cls }); }

  // ───────────── per frame ─────────────
  update(dt) {
    if (!this.room) return;
    const G = this.game;
    this.remotes.forEach((r) => {
      r.update(dt);
      // nothing heard for a while (paused tab): park the car out of the way
      if (performance.now() - r.lastSeen > 4000 && r.parts) { r.parts.group.visible = false; r.y = -500; if (r.tag) r.tag.visible = false; }
    });
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      this.sendState();
    }
    this.updateTeamHud();
    if (this.race) this.updateRace();
    void G;
  }

  sendState() {
    const G = this.game;
    const P = G.player;
    const flags = (P.braking ? 1 : 0) | (P.boosting ? 2 : 0);
    const r3 = (v) => Math.round(v * 100) / 100;
    const msg = { t: 's', p: [r3(P.x), r3(P.y), r3(P.z), r3(P.h), r3(P.vx), r3(P.vz), r3(P.steer || 0), flags] };
    // the police after me, so the others can see (and hit) them
    const cops = G.cops.filter((c) => c.role !== 'patrol' && Math.hypot(c.x - P.x, c.z - P.z) < 320).slice(0, 6);
    G.cops.filter((c) => c.role === 'patrol' && Math.hypot(c.x - P.x, c.z - P.z) < 200).slice(0, 2).forEach((c) => cops.push(c));
    msg.c = cops.map((c) => [r3(c.x), r3(c.y), r3(c.z), r3(c.h), c.tier || 0, r3(c.vx), r3(c.vz), c.role === 'chase' || c.role === 'block' ? 0 : 1]);
    const pur = G.pursuit;
    if (pur) { msg.pur = pur.heat; msg.cd = pur.cooldown ? 1 : 0; msg.b = Math.round(pur.bounty); }
    const ev = G.event;
    if (ev && ev.mp && ev.countdown <= 0) msg.rp = ev.player.done ? 1e9 - ev.player.time : G.playerProgress();
    else if (ev) msg.ev = ev.def.name;
    if (G.mode !== 'play' || G.overlay) msg.away = 1;
    this.room.toAll(msg, false);
  }

  // bodies for collisions (remote cars and their cops)
  bodies() {
    const out = [];
    this.remotes.forEach((r) => { if (r.parts && r.y > -100) out.push(...r.bodies()); });
    return out;
  }

  updateTeamHud() {
    const el = this.teamEl;
    el.hidden = false;
    const rows = [`<div><span class="code">ROOM ${this.room.code}</span></div>`];
    this.remotes.forEach((r) => {
      const m = r.meta || {};
      const s = r.state || {};
      let st = '';
      if (s.pur) st = `<b>${'★'.repeat(s.pur)}</b>`;
      else if (s.rp !== undefined) st = ' · racing';
      else if (s.ev) st = ` · ${esc(s.ev)}`;
      else if (s.away) st = ' · paused';
      const d = Math.hypot(r.x - this.game.player.x, r.z - this.game.player.z);
      rows.push(`<div><i style="background:${m.color || '#fff'}"></i>${esc(m.name || '...')} <small>${r.y > -100 ? `${Math.round(d)} m` : ''}</small>${st}</div>`);
    });
    const html = rows.join('');
    if (html !== this.teamHtml) { this.teamHtml = html; el.innerHTML = html; }
  }

  // other players in a pursuit within range: their heat and how many
  pursuitNear(range) {
    let heat = 0;
    let n = 0;
    const P = this.game.player;
    this.remotes.forEach((r) => {
      const s = r.state || {};
      if (s.pur && Math.hypot(r.x - P.x, r.z - P.z) < range) { heat = Math.max(heat, s.pur); n++; }
    });
    return { heat, n };
  }

  // an active (not cooling down) pursuit right next to me drags me in as an accomplice
  accompliceHeat() {
    const P = this.game.player;
    let heat = 0;
    this.remotes.forEach((r) => {
      const s = r.state || {};
      if (s.pur && !s.cd && Math.hypot(r.x - P.x, r.z - P.z) < 90) heat = Math.max(heat, s.pur);
    });
    return heat;
  }

  teamPursuit() {
    if (!this.isHost) return;
    const G = this.game;
    this.room.toAll({ t: 'tpur', heat: 2 });
    if (!G.event && !G.pursuit) G.startPursuit(2);
    G.resume();
    G.bigMessage('TEAM PURSUIT', 'Lose the cops together · bounty x crew', 'red', 2200);
  }

  drawMinimapDots(dot) {
    this.remotes.forEach((r) => {
      if (r.y < -100) return;
      dot(r.x, r.z, (r.meta && r.meta.color) || '#fff', 6);
      r.cops.forEach((c) => { if (c.y > -100) dot(c.x, c.z, Math.floor(this.game.time * 6) % 2 ? '#ff2d55' : '#2b6bff', 4); });
    });
  }

  drawMapDots(g, X) {
    this.remotes.forEach((r) => {
      if (r.y < -100) return;
      g.fillStyle = (r.meta && r.meta.color) || '#fff';
      g.beginPath();
      g.arc(X(r.x), X(r.z), 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText((r.meta && r.meta.name) || '', X(r.x), X(r.z) - 12);
    });
  }

  // ───────────── races ─────────────
  // host: start an event for everyone in the room
  startRace(def) {
    const G = this.game;
    const ids = [this.room.myId, ...[...this.room.players.keys()].filter((id) => id !== this.room.myId)];
    const msg = { t: 'race', id: def.id, startAt: this.room.now() + 7000, grid: ids };
    this.room.toAll(msg);
    this.beginRace(msg);
    void G;
  }

  beginRace(m) {
    const G = this.game;
    const def = EVENTS.find((e) => e.id === m.id);
    if (!def) return;
    if (G.mode === 'garage') G.leaveGarage();
    if (G.event) G.cleanupEvent();
    if (G.pursuit) G.endPursuit();
    if (G.sb.on) G.toggleSB();
    const slot = Math.max(0, m.grid.indexOf(this.room.myId));
    this.race = { def, startAt: m.startAt, grid: m.grid, finished: false };
    this.fins = new Map();
    G.startRoam();
    G.startEvent(def, { mp: { slot, startAt: m.startAt, grid: m.grid } });
  }

  // seconds until the shared start, from the host's clock
  countdown() { return this.race ? (this.race.startAt - this.room.now()) / 1000 : 0; }

  updateRace() {
    const G = this.game;
    const ev = G.event;
    if (ev && ev.mp) this.race.seen = true;
    // the race screen fades in before the event exists; drop the race once its event is gone
    if (!ev || !ev.mp) { if (this.race.seen) this.race = null; return; }
    // give up waiting for the others 40 s after I finished
    if (this.race.finished && !ev.resultsShown && performance.now() - this.race.finishedAt > 40000) this.refreshResults(true);
  }

  // my position among the human racers
  racePosition(myProg) {
    let pos = 1;
    let n = 1;
    if (!this.race) return { pos, n };
    this.race.grid.forEach((id) => {
      if (id === this.room.myId) return;
      n++;
      const r = this.remotes.get(id);
      const fin = this.fins.get(id);
      const prog = fin !== undefined ? 1e9 - fin : r && r.state && r.state.rp !== undefined ? r.state.rp : -1e9;
      if (prog > myProg) pos++;
    });
    return { pos, n };
  }

  onFinish(time) {
    const G = this.game;
    this.race.finished = true;
    this.race.finishedAt = performance.now();
    this.room.toAll({ t: 'fin', time });
    const ahead = [...this.fins.values()].filter((t) => t < time).length;
    G.event.place = ahead + 1;
    this.refreshResults();
  }

  // results table: shown when I finish, refreshed as the others come in
  refreshResults(force = false) {
    const G = this.game;
    const ev = G.event;
    if (!ev || !ev.mp || !this.race || !this.race.finished) return;
    const rows = this.race.grid.map((id) => {
      const me = id === this.room.myId;
      const meta = me ? this.myMeta() : (this.room.players.get(id) || { name: 'Left' });
      const time = me ? ev.player.time : this.fins.get(id);
      return { name: me ? 'You' : meta.name, color: meta.color, time, me };
    });
    rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
    const place = rows.findIndex((r) => r.me) + 1;
    const allIn = rows.every((r) => r.time !== undefined || !this.room.players.has(this.race.grid[rows.indexOf(r)]));
    const table = `<table>${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td><span style="color:${r.color || '#fff'}">●</span> ${esc(r.name)}</td><td style="text-align:right">${r.time !== undefined ? fmtTime(r.time) : 'Racing'}</td></tr>`).join('')}</table>`;
    if (!ev.results) {
      ev.place = place;
      G.finishEvent(place === 1, place === 1 ? 'You won the online race' : `You finished ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][place - 1] || `${place}th`}`, table);
      this.note(place === 1 ? `won ${ev.def.name}!` : `finished ${ev.def.name} in place ${place}`, 'gold');
    } else {
      const t = G.ui.screen.querySelector('.mp-results table');
      if (t) t.outerHTML = table;
    }
    if (allIn || force) ev.resultsShown = true;
  }
}
