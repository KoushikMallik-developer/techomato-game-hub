// GameHub peer-to-peer rooms: WebRTC data channels between browsers, no game server needed.
//
// The host opens a room with a short code; friends join with that code. Browsers find each other through
// a signalling server that only passes the connection handshake along (the free public PeerJS server by
// default — it speaks the PeerJS signalling protocol, implemented here without the PeerJS library).
// After that all game traffic goes directly between the players' browsers.
//
// Topology is a star: every guest connects to the host; the host relays whatever needs to reach everyone.
// Each link has two channels: reliable/ordered (events) and unreliable/unordered (fast state updates).
//
// Settings live in src/config.js (NET): your own signalling server, and TURN servers for networks that
// block direct connections.
import { NET } from '../../config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = (n) => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const randToken = () => Math.random().toString(36).slice(2, 12);

class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); }
  emit(ev, ...a) { (this._h[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }
}

// One signalling connection (PeerJS protocol): register an id, then exchange OFFER/ANSWER/CANDIDATE messages.
class Signal extends Emitter {
  constructor(url, id) {
    super();
    this.id = id;
    this.open = false;
    const sep = url.includes('?') ? '&' : '?';
    this.ws = new WebSocket(`${url}${sep}id=${encodeURIComponent(id)}&token=${randToken()}&version=1.5.4`);
    this.ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'OPEN') { this.open = true; this.emit('open'); } else if (m.type === 'ID-TAKEN') this.emit('taken');
      else if (m.type === 'ERROR') this.emit('error', (m.payload && m.payload.msg) || 'signalling error');
      else this.emit('msg', m);
    };
    this.ws.onerror = () => this.emit('error', 'Could not reach the matchmaking server');
    this.ws.onclose = () => { this.open = false; this.emit('close'); };
    this.hb = setInterval(() => this.send({ type: 'HEARTBEAT' }), 5000);
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() {
    clearInterval(this.hb);
    try { this.send({ type: 'LEAVE' }); this.ws.close(); } catch { /* closed */ }
  }
}

// One WebRTC link to another player.
class Link extends Emitter {
  constructor(room, remoteId, initiator) {
    super();
    this.room = room;
    this.id = remoteId;
    this.rtt = 0;
    this.ready = false;
    this.pc = new RTCPeerConnection({ iceServers: NET.iceServers });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) room.signal.send({ type: 'CANDIDATE', dst: remoteId, payload: { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate, connectionId: room.cid } });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed') this.emit('down');
      if (s === 'disconnected') {
        clearTimeout(this.dTimer);
        this.dTimer = setTimeout(() => { if (this.pc.connectionState !== 'connected') this.emit('down'); }, 6000);
      }
    };
    this.pending = [];
    if (initiator) {
      this.attach(this.pc.createDataChannel('r', { ordered: true }));
      this.attach(this.pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    } else {
      this.pc.ondatachannel = (e) => this.attach(e.channel);
    }
  }

  attach(ch) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'r') this.rel = ch; else this.unrel = ch;
    ch.onopen = () => {
      if (this.rel && this.unrel && this.rel.readyState === 'open' && this.unrel.readyState === 'open' && !this.ready) {
        this.ready = true;
        this.last = performance.now();
        this.emit('ready');
      }
    };
    ch.onmessage = (e) => {
      this.last = performance.now();
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.emit('data', m);
    };
    ch.onclose = () => this.emit('down');
  }

  async offer() {
    const o = await this.pc.createOffer();
    await this.pc.setLocalDescription(o);
    this.room.signal.send({ type: 'OFFER', dst: this.id, payload: { sdp: o, type: 'data', connectionId: this.room.cid, meta: this.room.meta } });
  }

  async onOffer(p) {
    await this.pc.setRemoteDescription(p.sdp);
    const a = await this.pc.createAnswer();
    await this.pc.setLocalDescription(a);
    this.room.signal.send({ type: 'ANSWER', dst: this.id, payload: { sdp: a, type: 'data', connectionId: p.connectionId } });
    this.flush();
  }

  async onAnswer(p) {
    await this.pc.setRemoteDescription(p.sdp);
    this.flush();
  }

  onCandidate(c) {
    if (this.pc.remoteDescription) this.pc.addIceCandidate(c).catch(() => {});
    else this.pending.push(c);
  }

  flush() { this.pending.splice(0).forEach((c) => this.pc.addIceCandidate(c).catch(() => {})); }

  send(m, reliable = true) {
    const ch = reliable ? this.rel : this.unrel || this.rel;
    if (!ch || ch.readyState !== 'open') return false;
    // keep the unreliable channel from piling up on slow links
    if (!reliable && ch.bufferedAmount > 64 * 1024) return false;
    try { ch.send(typeof m === 'string' ? m : JSON.stringify(m)); return true; } catch { return false; }
  }

  close() {
    clearTimeout(this.dTimer);
    try { this.pc.close(); } catch { /* closed */ }
  }
}

// A room: host or guest. Events:
//   'ready'                — connected (guests: to the host; host: room open), arg: room
//   'join'  (id, meta)     — someone joined (host and guests both get it for every player)
//   'leave' (id)           — someone left
//   'msg'   (from, data)   — a message from a player (relayed by the host if needed)
//   'error' (text)         — fatal problem (room not found, cannot reach server...)
//   'status'(text)         — progress text for the lobby screen
export class NetRoom extends Emitter {
  constructor(game, meta) {
    super();
    this.game = game;
    this.meta = meta || {};
    this.links = new Map();
    this.players = new Map(); // id -> meta (includes self)
    this.cid = `dc_${randToken()}`;
    this.offset = 0; // host clock minus local clock (ms)
    this.closed = false;
  }

  static hostId(game, code) { return `gh-${game}-${code}`.toLowerCase(); }

  // Open a new room. Resolves to the room once it is registered with the signalling server.
  static host(game, meta, codeLen = 5) {
    return new Promise((resolve, reject) => {
      const room = new NetRoom(game, meta);
      room.isHost = true;
      let tries = 0;
      const attempt = () => {
        room.code = randCode(codeLen);
        room.myId = NetRoom.hostId(game, room.code);
        room.signal = new Signal(NET.signalUrl, room.myId);
        room.signal.on('taken', () => { room.signal.close(); if (++tries < 5) attempt(); else reject(new Error('Could not create a room')); });
        room.signal.on('error', (e) => { if (!room.signal.open) reject(new Error(e)); });
        room.signal.on('open', () => {
          room.players.set(room.myId, room.meta);
          room.wireSignal();
          room.startPing();
          resolve(room);
          room.emit('ready', room);
        });
      };
      attempt();
    });
  }

  // Join a room by code. Resolves once the link to the host is open.
  static join(game, code, meta, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const room = new NetRoom(game, meta);
      room.isHost = false;
      room.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      room.hostId = NetRoom.hostId(game, room.code);
      room.myId = `gh-${game}-p${randToken()}`.toLowerCase();
      room.signal = new Signal(NET.signalUrl, room.myId);
      let done = false;
      const fail = (msg) => { if (done) return; done = true; room.close(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Could not connect to that room (it may not exist, or your network blocks direct connections)'), timeoutMs);
      room.signal.on('error', (e) => fail(e));
      room.signal.on('open', () => {
        room.emit('status', 'Contacting host...');
        room.wireSignal();
        room.signal.on('msg', (m) => { if (m.type === 'EXPIRE' && m.src === room.hostId) fail('Room not found'); });
        const link = room.addLink(room.hostId, true);
        link.on('ready', () => {
          if (done) return;
          room.emit('status', 'Connected');
          link.send({ _hello: room.meta });
        });
        link.offer().catch((e) => fail(String(e)));
      });
      // resolved when the host welcomes us
      room._welcome = (players) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        players.forEach(([id, m]) => room.players.set(id, m));
        room.players.set(room.myId, room.meta);
        room.startPing();
        resolve(room);
        room.emit('ready', room);
        players.forEach(([id, m]) => { if (id !== room.myId) room.emit('join', id, m); });
      };
    });
  }

  wireSignal() {
    this.signal.on('msg', (m) => {
      const p = m.payload || {};
      if (m.type === 'OFFER' && this.isHost) {
        if (this.links.has(m.src)) this.links.get(m.src).close();
        if (this.players.size >= (NET.maxPlayers || 10)) return;
        const link = this.addLink(m.src, false);
        link.onOffer(p).catch(() => {});
      } else if (m.type === 'ANSWER') {
        const l = this.links.get(m.src);
        if (l) l.onAnswer(p).catch(() => {});
      } else if (m.type === 'CANDIDATE') {
        const l = this.links.get(m.src);
        if (l && p.candidate) l.onCandidate(p.candidate);
      } else if (m.type === 'LEAVE' && this.links.has(m.src)) {
        this.dropLink(m.src);
      }
    });
  }

  addLink(id, initiator) {
    const link = new Link(this, id, initiator);
    this.links.set(id, link);
    link.on('data', (m) => this.onData(link, m));
    link.on('down', () => this.dropLink(id));
    return link;
  }

  dropLink(id) {
    const l = this.links.get(id);
    if (!l) return;
    this.links.delete(id);
    l.close();
    if (this.isHost) {
      if (this.players.has(id)) {
        this.players.delete(id);
        this.emit('leave', id);
        this.broadcast({ _left: id });
      }
    } else if (id === this.hostId && !this.closed) {
      this.emit('error', 'Lost connection to the host');
      this.close();
    }
  }

  onData(link, m) {
    // connection housekeeping
    if (m._ping !== undefined) { link.send({ _pong: m._ping, t: this.now() }, false); return; }
    if (m._pong !== undefined) {
      const rtt = performance.now() - m._pong;
      link.rtt = link.rtt ? link.rtt * 0.8 + rtt * 0.2 : rtt;
      if (!this.isHost && link.id === this.hostId) {
        const off = m.t + rtt / 2 - performance.now();
        this.offset = this.offsetInit ? this.offset * 0.85 + off * 0.15 : off;
        this.offsetInit = true;
      }
      return;
    }
    if (this.isHost) {
      if (m._hello) {
        const meta = m._hello;
        this.players.set(link.id, meta);
        link.send({ _welcome: [...this.players.entries()] });
        this.broadcast({ _joined: [link.id, meta] }, true, link.id);
        this.emit('join', link.id, meta);
        return;
      }
      if (!this.players.has(link.id)) return;
      if (m._meta) { this.players.set(link.id, m._meta); this.broadcast({ _meta: m._meta, _from: link.id }, true, link.id); this.emit('meta', link.id, m._meta); return; }
      // a guest asked for this to reach everyone
      if (m._all) {
        const fwd = { ...m, _from: link.id };
        delete fwd._all;
        delete fwd._u;
        const rel = !m._u;
        this.links.forEach((l, id) => { if (id !== link.id) l.send(fwd, rel); });
        this.emit('msg', link.id, fwd);
        return;
      }
      this.emit('msg', link.id, m);
      return;
    }
    // guest side
    if (m._welcome) { this._welcome(m._welcome); return; }
    if (m._joined) { const [id, meta] = m._joined; this.players.set(id, meta); this.emit('join', id, meta); return; }
    if (m._left) { this.players.delete(m._left); this.emit('leave', m._left); return; }
    if (m._meta) { this.players.set(m._from, m._meta); this.emit('meta', m._from, m._meta); return; }
    if (m._kick) { this.emit('error', m._kick); this.close(); return; }
    this.emit('msg', m._from || link.id, m);
  }

  // host clock in ms (shared timebase for countdowns and round timers)
  now() { return performance.now() + (this.isHost ? 0 : this.offset); }

  startPing() {
    this.lastTick = performance.now();
    this.pingTimer = setInterval(() => {
      const now = performance.now();
      // if this page itself was frozen (loading a map, tab in the background), don't blame the others
      if (now - this.lastTick > 3000) this.links.forEach((l) => { l.last = now; });
      this.lastTick = now;
      this.links.forEach((l, id) => {
        l.send({ _ping: now }, false);
        // nothing heard for a while: the other side closed the tab or lost its connection
        if (l.ready && now - (l.last || now) > 15000) this.dropLink(id);
      });
    }, 1000);
    this.links.forEach((l) => l.send({ _ping: performance.now() }, false));
  }

  // send to one player (guests can only reach the host directly; others go through toAll)
  send(id, m, reliable = true) {
    const l = this.links.get(id);
    return l ? l.send(m, reliable) : false;
  }

  // host: send to every guest (optionally except one)
  broadcast(m, reliable = true, except = null) {
    const s = JSON.stringify(m);
    this.links.forEach((l, id) => { if (id !== except) l.send(s, reliable); });
  }

  // anyone: deliver to every other player
  toAll(m, reliable = true) {
    if (this.isHost) this.broadcast({ ...m, _from: this.myId }, reliable);
    else this.send(this.hostId, reliable ? { ...m, _all: 1 } : { ...m, _all: 1, _u: 1 }, reliable);
  }

  // update my player info (name, car, team...)
  setMeta(meta) {
    this.meta = meta;
    this.players.set(this.myId, meta);
    if (this.isHost) this.broadcast({ _meta: meta, _from: this.myId });
    else this.send(this.hostId, { _meta: meta });
  }

  kick(id, reason = 'Removed by host') {
    if (!this.isHost) return;
    this.send(id, { _kick: reason });
    setTimeout(() => this.dropLink(id), 300);
  }

  rtt() {
    if (this.isHost) return 0;
    const l = this.links.get(this.hostId);
    return l ? l.rtt : 0;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    this.links.forEach((l) => l.close());
    this.links.clear();
    if (this.signal) this.signal.close();
    this.emit('closed');
  }
}

// a remembered player name shared by all GameHub games
export function playerName() {
  try {
    const n = localStorage.getItem('gamehub-name');
    if (n) return n;
  } catch { /* storage blocked */ }
  return `Player${Math.floor(100 + Math.random() * 900)}`;
}
export function savePlayerName(n) {
  try { localStorage.setItem('gamehub-name', n); } catch { /* storage blocked */ }
}
