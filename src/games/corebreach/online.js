// Core Breach online play over GameHub's peer-to-peer rooms.
// The host runs the Match (rules, bots, damage) and sends every event reliably plus a snapshot of all
// players ~15 times a second. Guests move and aim on their own screen, report their position, and send
// their shots, ability uses and purchases to the host.
import { NetRoom, playerName, savePlayerName } from '../shared/net.js';
import { esc, AGENT, writeSave } from './data.js';
import { MAPS } from './level.js';

const SNAP_HZ = 15;

export class Online {
  constructor(game) {
    this.g = game;
    this.room = null;
    this.cfg = { mode: 'core', map: 'random', bots: true, difficulty: 'normal', length: 'short' };
    this.inGame = false;
    this.evq = [];
    this.snapT = 0;
    this.team = 'red';
  }

  get code() { return this.room ? this.room.code : ''; }
  get isHost() { return !!(this.room && this.room.isHost); }

  meta() { return { name: playerName() || 'Player', agent: this.g.S.agent, team: this.team }; }

  takeName() {
    const n = this.g.root.querySelector('input[name=pname]');
    if (n && n.value.trim()) savePlayerName(n.value.trim().slice(0, 16));
  }

  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'mp-host': this.takeName(); this.host(); break;
      case 'mp-join': {
        this.takeName();
        const inp = g.root.querySelector('input[name=code]');
        const code = inp ? inp.value.trim() : '';
        if (code.length < 4) { g.netError = 'Type the room code first'; g.showScreen('online'); return; }
        this.join(code);
        break;
      }
      case 'mp-team': {
        if (this.cfg.mode === 'core' && this.teamCount(arg) >= 5) return;
        this.team = arg;
        if (this.room) this.room.setMeta(this.meta());
        this.render();
        break;
      }
      case 'mp-cfg': {
        if (!this.isHost) return;
        const [k, v] = arg.split(':');
        this.cfg[k] = v === 'true' ? true : v === 'false' ? false : v;
        this.room.broadcast({ t: 'cfg', cfg: this.cfg });
        this.render();
        break;
      }
      case 'mp-start': this.start(); break;
      case 'mp-kick': if (this.isHost) this.room.kick(arg, 'The host removed you from the room'); break;
      case 'mp-leave': this.leave(); g.net = null; g.showScreen('online'); break;
      case 'mp-cancel': this.leave(); g.net = null; g.showScreen('online'); break;
      default: break;
    }
  }

  teamCount(team) {
    let n = 0;
    if (!this.room) return 0;
    this.room.players.forEach((m, id) => { if (id !== this.room.myId && m.team === team) n++; });
    return n;
  }

  status(text) {
    this.g.hud.el.screen.innerHTML = `<div class="cb-wide"><div class="cb-panel" style="max-width:34em"><h2>ONLINE</h2><p>${esc(text)}</p><div class="cb-row"><button class="b" data-act="mp-cancel">Cancel</button></div></div></div>`;
  }

  fail(msg) {
    const g = this.g;
    this.leave();
    g.net = null;
    g.netError = msg;
    if (g.mode === 'play') g.toMenu();
    g.showScreen('online');
  }

  async host() {
    this.status('Creating a room…');
    try {
      this.room = await NetRoom.host('corebreach', this.meta());
    } catch (e) { this.fail(e.message || String(e)); return; }
    if (this.g.net !== this) { this.room.close(); return; }
    this.team = 'red';
    this.room.setMeta(this.meta());
    this.wire();
    this.render();
  }

  async join(code) {
    this.status('Connecting to the room…');
    try {
      this.room = await NetRoom.join('corebreach', code, this.meta());
    } catch (e) { this.fail(e.message || String(e)); return; }
    if (this.g.net !== this) { this.room.close(); return; }
    // join the smaller team
    this.team = this.teamCount('blue') < this.teamCount('red') ? 'blue' : 'red';
    this.room.setMeta(this.meta());
    this.wire();
    if (!this.inGame) this.render();
  }

  wire() {
    const room = this.room;
    const g = this.g;
    room.on('status', (t) => { if (!this.inGame) this.status(t); });
    room.on('join', (id, meta) => {
      if (this.isHost) {
        room.send(id, { t: 'cfg', cfg: this.cfg });
        if (this.inGame && g.match) this.lateJoin(id, meta);
      }
      if (this.inGame) g.hud.chatLine('', `${meta.name} joined`, '#ffd166');
      this.render();
    });
    room.on('meta', () => this.render());
    room.on('leave', (id) => {
      const r = g.roster.get(id);
      if (this.isHost && this.inGame && g.match) {
        const p = g.match.players.get(id);
        g.match.removePlayer(id);
        if (p && this.cfg.bots && this.cfg.mode === 'core') g.match.fillBots(p.team, 5);
      }
      if (this.inGame && r) g.hud.chatLine('', `${r.name} left`, '#ffd166');
      this.render();
    });
    room.on('msg', (from, m) => this.onMsg(from, m));
    room.on('error', (e) => { if (!this.leaving) this.fail(e); });
    room.on('closed', () => { if (!this.leaving) this.fail('Disconnected from the room'); });
  }

  onMsg(from, m) {
    const g = this.g;
    if (!m || !m.t) return;
    if (this.isHost) {
      if (m.t === 'chat') { g.hud.chatLine(m.name, m.text, '#7ff5e2'); return; }
      if (this.inGame && g.match) g.handleReq(from, m);
      return;
    }
    switch (m.t) {
      case 'cfg': this.cfg = m.cfg; if (!this.inGame) this.render(); break;
      case 'start':
        this.inGame = true;
        this.cfg = m.cfg;
        g.startOnline({ host: false, myId: this.room.myId, cfg: m.cfg, roster: m.roster, seed: m.seed });
        break;
      case 'evs': if (this.inGame) m.l.forEach((e) => g.onEvent(e)); break;
      case 'snap': if (this.inGame) g.applySnap(m); break;
      case 'lobby': if (this.inGame) this.toLobby(); break;
      case 'chat': g.hud.chatLine(m.name, m.text, '#7ff5e2'); break;
      case 'ping': this.pings = m.p; break;
      default: break;
    }
  }

  // ───────────── host ─────────────
  roster() {
    return [...this.room.players.entries()].map(([id, meta]) => ({ id, name: meta.name || 'Player', team: meta.team || 'red', agent: AGENT[meta.agent] ? meta.agent : 'vex', bot: false }));
  }

  start() {
    if (!this.isHost) return;
    const roster = this.roster();
    if (this.cfg.mode === 'core' && (roster.filter((r) => r.team === 'red').length > 5 || roster.filter((r) => r.team === 'blue').length > 5)) return;
    const seed = (Math.random() * 1e9) | 0;
    this.seed = seed;
    this.inGame = true;
    this.room.broadcast({ t: 'start', cfg: this.cfg, roster, seed });
    this.g.startOnline({ host: true, myId: this.room.myId, cfg: this.cfg, roster, seed });
  }

  lateJoin(id, meta) {
    const m = this.g.match;
    let team = meta.team || 'red';
    if (this.cfg.mode === 'core') {
      const count = (t) => [...m.players.values()].filter((p) => p.team === t && !p.bot).length;
      if (count(team) >= 5) team = team === 'red' ? 'blue' : 'red';
      // make room by removing a bot from that team
      const bot = [...m.players.values()].find((p) => p.team === team && p.bot);
      if (bot && [...m.players.values()].filter((p) => p.team === team).length >= 5) m.removePlayer(bot.id);
    }
    m.addPlayer({ id, name: meta.name, team, agent: AGENT[meta.agent] ? meta.agent : 'vex' });
    this.room.send(id, { t: 'start', cfg: this.cfg, roster: m.roster(), seed: this.seed });
  }

  queue(e) { this.evq.push(e); }

  // network ping per player, as measured by the host (a guest only has a direct link to the host)
  pingOf(id) {
    const room = this.room;
    if (!room) return null;
    if (this.isHost) {
      if (id === room.myId) return 0;
      const l = room.links.get(id);
      return l && l.rtt ? Math.round(l.rtt) : null;
    }
    if (id === room.hostId) return Math.round(room.rtt()) || null;
    if (id === room.myId) return Math.round(room.rtt()) || null;
    const v = this.pings && this.pings[id];
    return v === undefined || v === null ? null : v;
  }

  tick(dt) {
    if (!this.room || !this.isHost || !this.inGame) return;
    this.pingT = (this.pingT || 0) - dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      const p = {};
      this.room.links.forEach((l, id) => { p[id] = l.rtt ? Math.round(l.rtt) : null; });
      p[this.room.myId] = 0;
      this.room.broadcast({ t: 'ping', p }, false);
    }
    if (this.evq.length) {
      this.room.broadcast({ t: 'evs', l: this.evq });
      this.evq = [];
    }
    this.snapT -= dt;
    if (this.snapT <= 0 && this.g.match) {
      this.snapT = 1 / SNAP_HZ;
      this.room.broadcast(this.g.match.snapshot(), false);
    }
  }

  // ───────────── guest ─────────────
  toHost(m, reliable = true) {
    if (this.room && !this.isHost) this.room.send(this.room.hostId, m, reliable);
  }

  chat(text) {
    const name = playerName() || 'Player';
    if (this.room) this.room.toAll({ t: 'chat', name, text });
    this.g.hud.chatLine(name, text, '#ffd166');
  }

  setAgent(a) {
    this.g.S.agent = a;
    writeSave(this.g.save);
    if (this.room) this.room.setMeta(this.meta());
    this.render();
  }

  // after a match: everyone back to the room screen
  backToLobby() {
    if (this.isHost) this.room.broadcast({ t: 'lobby' });
    this.toLobby();
  }

  toLobby() {
    this.inGame = false;
    this.evq = [];
    this.g.toLobby();
    this.render();
  }

  leave() {
    this.leaving = true;
    this.inGame = false;
    if (this.room) this.room.close();
    this.room = null;
  }

  // ───────────── lobby screen ─────────────
  render() {
    const g = this.g;
    if (!this.room || this.inGame || g.mode !== 'menu' || g.net !== this) return;
    const room = this.room;
    const host = this.isHost;
    const cfg = this.cfg;
    const players = [...room.players.entries()];
    const row = ([id, m]) => `<div class="pl"><span>${esc(m.name || 'Player')}${id === room.myId ? ' <small style="color:#ffd166">YOU</small>' : ''}${id === (host ? room.myId : room.hostId) ? ' <small style="opacity:.7">HOST</small>' : ''}</span><span><small style="opacity:.75">${AGENT[m.agent] ? AGENT[m.agent].name.toUpperCase() : ''}</small>${host && id !== room.myId ? ` <button class="b" style="padding:.1em .5em" data-act="mp-kick" data-arg="${id}">✕</button>` : ''}</span></div>`;
    const seg = (key, cur, opts) => (host
      ? `<span class="cb-seg">${opts.map(([v, l]) => `<button class="b${String(cur) === String(v) ? ' sel' : ''}" data-act="mp-cfg" data-arg="${key}:${v}">${l}</button>`).join('')}</span>`
      : `<b>${(opts.find(([v]) => String(v) === String(cur)) || ['', ''])[1]}</b>`);
    const teamBox = (team, label, color) => {
      const list = players.filter(([, m]) => (m.team || 'red') === team);
      const mine = this.team === team;
      return `<div class="team" style="border-color:${color}55"><h3 style="color:${color}">${label} <small style="opacity:.6">${list.length}/5</small></h3>${list.map(row).join('')}
        ${mine ? '' : `<button class="b" data-act="mp-team" data-arg="${team}" ${list.length >= 5 ? 'disabled' : ''}>Join</button>`}</div>`;
    };
    const teams = cfg.mode === 'core'
      ? `<div class="teams">${teamBox('red', 'TEAM A', '#ff4655')}${teamBox('blue', 'TEAM B', '#3edbc4')}</div>`
      : `<div class="team">${players.map(row).join('')}</div>`;
    g.hud.el.screen.innerHTML = `<div class="cb-wide"><div class="cb-panel cb-lobby">
      <div class="cb-row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">ROOM</h2><div class="code">${esc(room.code)}</div></div>
      <p class="cb-note" style="max-width:24em">Friends open Core Breach → Online and type this code. ${players.length} / 10 in the room.</p></div>
      <div class="cb-row"><label>MODE</label>${seg('mode', cfg.mode, [['core', '5v5 Core'], ['dm', 'Deathmatch']])}</div>
      <div class="cb-row"><label>MAP</label>${seg('map', cfg.map || 'random', [...MAPS.map((x) => [x.id, x.name]), ['random', 'Random']])}</div>
      <div class="cb-row"><label>BOTS FILL SLOTS</label>${seg('bots', cfg.bots, [[true, 'On'], [false, 'Off']])}</div>
      <div class="cb-row"><label>BOT DIFFICULTY</label>${seg('difficulty', cfg.difficulty, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}</div>
      ${cfg.mode === 'core' ? `<div class="cb-row"><label>LENGTH</label>${seg('length', cfg.length, [['short', 'First to 5'], ['standard', 'First to 13']])}</div>` : ''}
      ${teams}
      <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em;margin-top:1em">YOUR AGENT</h3>
      ${g.hud.agentGrid(g.S.agent)}
      <div class="cb-row">${host ? '<button class="b primary" data-act="mp-start">Start match</button>' : '<span class="cb-note">Waiting for the host to start…</span>'}<button class="b" data-act="mp-leave">Leave room</button></div>
    </div></div>`;
  }
}
