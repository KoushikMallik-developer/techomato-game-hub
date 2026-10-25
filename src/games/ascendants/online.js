// Ascendants online: GameHub peer-to-peer rooms for up to 50 players. The host runs the Match (rules,
// bots for every empty slot, powers, damage, the storm) and sends events reliably plus a snapshot of all
// heroes ~12 times a second. Guests move their own hero, report it, and send casts, punches, crate
// opening, item use and loadout changes to the host.
import { NetRoom, playerName } from '../shared/net.js';
import { esc, HERO, MAX_PLAYERS, MODES } from './data.js';

const SNAP_HZ = 12;

export class Online {
  constructor(game) {
    this.g = game;
    this.room = null;
    this.inGame = false;
    this.evq = [];
    this.snapT = 0;
  }
  get isHost() { return !!(this.room && this.room.isHost); }
  meta() { return { name: playerName(), hero: this.g.S.hero, skin: this.g.save.skin ?? 1, aura: this.g.S.aura, mode: this.g.S.mode }; }
  updateMeta() { if (this.room) this.room.setMeta(this.meta()); this.render(); }

  status(text) { this.g.hud.show(`<div class="pnl" style="max-width:30em"><h2>ONLINE</h2><p>${esc(text)}</p><div class="row"><button class="btn alt" data-act="mp-leave">Cancel</button></div></div>`); }
  fail(msg) {
    const g = this.g;
    this.leave();
    g.net = null;
    g.netError = msg;
    if (g.mode === 'play') g.leaveMatch(true);
    g.mode = 'menu';
    g.hud.visible(false);
    g.act('online');
  }

  async host() {
    this.status('Creating a room…');
    try { this.room = await NetRoom.host('ascendants', this.meta(), 5, MAX_PLAYERS); } catch (e) { this.fail(e.message || String(e)); return; }
    if (this.g.net !== this) { this.room.close(); return; }
    this.wire(); this.render();
  }
  async join(code) {
    if (!code || code.length < 4) { this.g.netError = 'Type the room code first'; this.g.act('online'); return; }
    this.status('Connecting to the room…');
    try { this.room = await NetRoom.join('ascendants', code, this.meta()); } catch (e) { this.fail(e.message || String(e)); return; }
    if (this.g.net !== this) { this.room.close(); return; }
    this.wire();
    if (!this.inGame) this.render();
  }
  wire() {
    const room = this.room; const g = this.g;
    room.on('join', (id, meta) => {
      if (this.isHost && this.inGame && g.match) this.lateJoin(id, meta);
      if (this.inGame) g.hud.feed(`<b>${esc(meta.name)}</b><i>joined</i>`);
      this.render();
    });
    room.on('meta', () => this.render());
    room.on('leave', (id) => {
      if (this.isHost && this.inGame && g.match) g.match.removePlayer(id);
      this.render();
    });
    room.on('msg', (from, m) => this.onMsg(from, m));
    room.on('error', (e) => { if (!this.leaving) this.fail(e); });
    room.on('closed', () => { if (!this.leaving) this.fail('Disconnected from the room'); });
  }
  onMsg(from, m) {
    const g = this.g;
    if (!m || !m.t) return;
    if (this.isHost) { if (this.inGame && g.match) g.match.handle(from, m); return; }
    switch (m.t) {
      case 'start':
        this.inGame = true;
        g.beginMatch({ host: false, myId: this.room.myId, roster: m.roster, ship: m.ship, crates: m.crates, loot: m.loot, storm: m.storm, dead: m.dead, mode: m.mode, trees: m.trees, time: m.time });
        break;
      case 'evs': if (this.inGame) m.l.forEach((e) => g.onEvent(e)); break;
      case 'snap': if (this.inGame) g.applySnap(m); break;
      case 'lobby': this.toLobby(); break;
      default: break;
    }
  }

  // ── host ──
  start() {
    if (!this.isHost) return;
    const roster = [...this.room.players.entries()].map(([id, meta]) => ({ id, name: meta.name || 'Hero', hero: HERO[meta.hero] ? meta.hero : 'vanguard', skin: meta.skin ?? 1, aura: meta.aura || 'hero' }));
    this.inGame = true;
    this.g.beginMatch({ host: true, myId: this.room.myId, roster, seed: (Math.random() * 1e9) | 0, difficulty: this.g.S.bots, mode: this.g.S.mode });
  }
  matchStarted(match) {
    const s = match.fullState();
    this.room.broadcast({ t: 'start', roster: s.roster, ship: s.ship, crates: s.crates, loot: s.loot, storm: s.storm, dead: s.dead, mode: s.mode, trees: s.trees, time: s.time });
  }
  lateJoin(id, meta) {
    const m = this.g.match;
    // swap out a bot that's still in the ship, or watch as a spectator
    const bot = [...m.players.values()].find((p) => p.bot && p.mode === 'ship');
    if (bot) { m.players.delete(bot.id); m.addPlayer({ id, name: meta.name, hero: HERO[meta.hero] ? meta.hero : 'vanguard', skin: meta.skin ?? 1, aura: meta.aura, team: bot.team }); }
    const s = m.fullState();
    this.room.send(id, { t: 'start', roster: s.roster, ship: s.ship, crates: s.crates, loot: s.loot, storm: s.storm, dead: s.dead, mode: s.mode, trees: s.trees, time: s.time });
  }
  queue(e) { this.evq.push(e); }
  tick(dt) {
    if (!this.room || !this.isHost || !this.inGame) return;
    if (this.evq.length) { this.room.broadcast({ t: 'evs', l: this.evq }); this.evq = []; }
    this.snapT -= dt;
    if (this.snapT <= 0 && this.g.match) { this.snapT = 1 / SNAP_HZ; this.room.broadcast(this.g.match.snapshot(), false); }
  }
  // ── guest ──
  toHost(m) { if (this.room && !this.isHost) this.room.send(this.room.hostId, m, m.t !== 'state'); }

  backToLobby() { if (this.isHost) this.room.broadcast({ t: 'lobby' }); this.toLobby(); }
  toLobby() {
    this.inGame = false; this.evq = [];
    const g = this.g;
    if (g.mode === 'play') g.leaveMatch(true);
    g.mode = 'menu';
    g.hud.visible(false);
    this.render();
  }
  leave() { this.leaving = true; this.inGame = false; if (this.room) this.room.close(); this.room = null; }
  act(a) {
    if (a === 'mp-start') this.start();
    if (a === 'mp-leave') { this.leave(); this.g.net = null; this.g.showHome(); }
    if (a === 'mp-lobby') this.backToLobby();
  }
  render() {
    const g = this.g;
    if (!this.room || this.inGame || g.mode !== 'menu' || g.net !== this) return;
    const players = [...this.room.players.entries()];
    g.hud.show(`<div class="pnl" style="max-width:40em"><h2>ROOM <span style="color:#ffd166;letter-spacing:.2em">${esc(this.room.code)}</span></h2>
      <p class="note">Friends open Ascendants → Online and type this code. ${players.length} player${players.length > 1 ? 's' : ''} here — bots fill the other ${MAX_PLAYERS - players.length} slots.</p>
      <div class="lobbyl">${players.map(([id, m]) => `<span>${esc(m.name || 'Hero')} · ${esc((HERO[m.hero] || {}).name || '')}${id === this.room.myId ? ' (you)' : ''}</span>`).join('')}</div>
      ${this.isHost ? `<div class="row" style="margin-bottom:.8em"><span class="note">Mode</span><span class="seg">${Object.entries(MODES).map(([k, md]) => `<button class="${k === (g.S.mode || 'solo') ? 'on' : ''}" data-act="setmode" data-arg="${k}">${md.name}</button>`).join('')}</span></div>` : `<p class="note">Mode: ${esc((MODES[(this.room.players.get(this.room.hostId) || {}).mode] || MODES.solo).name)}</p>`}
      <div class="row"><button class="btn alt" data-act="hero">Change hero</button>${this.isHost ? '<button class="btn" data-act="mp-start">Start the battle</button>' : '<span class="note">Waiting for the host to start…</span>'}<button class="btn alt" data-act="mp-leave">Leave</button></div></div>`);
  }
}
