// Core Breach menu screens (HTML templates). Buttons carry data-act / data-arg and are handled by Game.act.
import { AGENT, AGENTS, WEAPON, esc, fmtClock } from './data.js';
import { MAPS } from './level.js';
import { BUY_CATS } from './data.js';
import { ensureProgress, levelInfo, rankInfo, SKINS, skinUnlocked, TIERS, TIER_COLORS } from './progression.js';
import { playerName } from '../shared/net.js';

export const clock = fmtClock;

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Chakra+Petch:wght@600;700&display=swap');
.cb-home{position:absolute;left:5%;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:1em;width:min(30em,90%);padding:1.2em 0}
.cb-home .cb-logo h1{font-family:'Chakra Petch','Rajdhani',sans-serif;font-size:3.8em;letter-spacing:.04em}
.cb-home .cb-logo .tag{font-size:.85em;margin-top:.3em}
.cb-cut{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.cb-hero{position:relative;display:grid;text-align:left;gap:.15em;padding:1em 3.6em 1em 1.2em;border:0;cursor:pointer;color:#fff;font:inherit;
  background:linear-gradient(115deg,#ff4655 0%,#e0303f 60%,#b81f2d 100%);clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));transition:filter .15s,transform .15s}
.cb-hero:hover,.cb-hero:focus-visible{filter:brightness(1.1);outline:none;transform:translateX(4px)}
.cb-hero .k{font-size:.78em;letter-spacing:.3em;font-weight:700;opacity:.85;text-transform:uppercase}
.cb-hero .t{font-family:'Chakra Petch','Rajdhani',sans-serif;font-size:1.9em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1}
.cb-hero .d{font-size:.9em;opacity:.9;letter-spacing:.03em}
.cb-hero .go{position:absolute;right:1em;top:50%;transform:translateY(-50%);font-size:1.6em}
.cb-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:.5em}
.cb-mode{display:grid;gap:.2em;text-align:left;padding:.75em .8em;border:0;cursor:pointer;font:inherit;color:#ece8e1;background:rgba(15,25,35,.78);box-shadow:inset 0 0 0 1px rgba(236,232,225,.16);
  clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));transition:background .15s,box-shadow .15s}
.cb-mode .t{font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.cb-mode .d{font-size:.78em;color:#ece8e199;letter-spacing:.02em}
.cb-mode:hover,.cb-mode:focus-visible{background:rgba(255,70,85,.18);box-shadow:inset 0 0 0 1px #ff4655;outline:none}
.cb-links{display:flex;flex-wrap:wrap;gap:.2em 1.1em}
.cb-links button{border:0;background:none;padding:.3em 0;font:inherit;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ece8e1bb;cursor:pointer;border-bottom:2px solid transparent}
.cb-links button:hover,.cb-links button:focus-visible{color:#fff;border-bottom-color:#ff4655;outline:none}
.cb-id{position:absolute;right:3%;bottom:4%;display:flex;gap:.8em;align-items:center;padding:.8em 1em;background:rgba(15,25,35,.82);box-shadow:inset 0 0 0 1px rgba(236,232,225,.14);width:min(22em,40%);
  clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}
.cb-id .cb-rank{flex:none;width:3.4em;height:3.4em;font-size:1em}
.cb-id-main{flex:1;min-width:0;display:grid;gap:.3em}
.cb-id-main input{font:inherit;font-weight:700;letter-spacing:.08em;color:#fff;background:transparent;border:0;border-bottom:1px solid #ece8e144;padding:.1em 0;width:100%}
.cb-id-main input:focus{outline:none;border-bottom-color:#ff4655}
.cb-id-rank{display:flex;justify-content:space-between;font-weight:700;letter-spacing:.1em;font-size:.85em;text-transform:uppercase}
.cb-id-stats{display:flex;justify-content:space-between;gap:.4em;font-size:.72em;color:#ece8e199;letter-spacing:.08em;text-transform:uppercase}
.cb-id-stats b{display:block;color:#ece8e1;font-size:1.35em;letter-spacing:.02em}
@media (max-width:760px){.cb-id{display:none}.cb-home{width:90%}.cb-home .cb-logo h1{font-size:2.8em}}
@media (max-height:520px){.cb-home{gap:.5em}.cb-home .cb-logo h1{font-size:2.4em}.cb-home .cb-logo .tag{display:none}.cb-hero{padding:.6em 3em .6em 1em}.cb-hero .t{font-size:1.4em}.cb-hero .d,.cb-mode .d{display:none}.cb-mode{padding:.5em .6em}.cb-id{display:none}}
.cb-mainwrap{position:absolute;left:5%;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:1.6em;width:min(26em,90%);padding:1em 0}
.cb-mainwrap .cb-menu{position:static;transform:none;width:100%}
.cb-logo h1{font-size:4.6em}
.cb-logo .tag{letter-spacing:.35em;color:#ece8e1aa;margin-top:.4em;font-size:.95em}
.cb-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,16,24,.88) 0,rgba(10,16,24,.55) 38%,rgba(10,16,24,0) 70%);pointer-events:none}
.cb-menu .b small{display:block;font-weight:500;letter-spacing:.08em;text-transform:none;color:#ece8e199;font-size:.72em;margin-top:.2em}
.cb-name{display:flex;gap:.5em;align-items:center;margin-bottom:.4em}
.cb-name input{flex:1;min-width:0}
.cb-wide{position:absolute;inset:0;overflow:auto;padding:4% 5%;background:rgba(10,16,24,.82)}
.cb-wide .cb-panel{margin:0 auto}
.cb-two{display:grid;grid-template-columns:1.4fr 1fr;gap:1.4em}
.cb-seg{display:inline-flex;gap:0}
.cb-seg .b{padding:.5em .9em;margin-right:-1px}
.cb-xh-preview{position:relative;width:120px;height:80px;background:linear-gradient(#6d7f8f,#a49a86);border:1px solid #ece8e133}
.cb-xh-preview i{position:absolute}
.cb-set{display:grid;grid-template-columns:repeat(auto-fit,minmax(20em,1fr));gap:.3em 2em}
.cb-set .cb-row label{min-width:8em}
.cb-set output{min-width:2.5em;color:#ffd166}
.cb-help{columns:2 22em;column-gap:2em;color:#ece8e1dd}
.cb-help h3{margin:.8em 0 .3em;letter-spacing:.14em;color:#ff4655;font-size:1em}
.cb-help p{margin:.2em 0}
.cb-help kbd{border:1px solid #ece8e166;padding:0 .35em;font-size:.85em}
.cb-res h1{font-size:4em}
.cb-res .win{color:#3edbc4}.cb-res .lose{color:#ff4655}
.cb-lobby .teams{display:grid;grid-template-columns:1fr 1fr;gap:1em}
.cb-lobby .team{border:1px solid #ece8e122;padding:.6em;min-height:9em}
.cb-lobby .team h3{margin:0 0 .4em;letter-spacing:.15em}
.cb-lobby .pl{display:flex;justify-content:space-between;padding:.3em .4em;background:rgba(255,255,255,.04);margin-bottom:.25em}
.cb-lobby .code{font-size:2.4em;letter-spacing:.3em;color:#ffd166;font-weight:700}
.cb-note{color:#ece8e199;font-size:.88em;line-height:1.4}
.cb-err{color:#ff8a96}
.cb.free canvas.cb-canvas{cursor:none}
.cb-ab.sel{border-color:#ffd166;box-shadow:inset 0 0 14px rgba(255,209,102,.5)}
.cb-prof{display:flex;gap:1em;align-items:center;margin:.2em 0}
.cb-rank{width:3.2em;height:3.2em;clip-path:polygon(50% 0,100% 30%,85% 100%,15% 100%,0 30%);display:grid;place-items:center;font-weight:700;color:#0f1923;font-size:.9em}
.cb-xpbar{height:.45em;background:#ece8e122;width:100%;margin-top:.3em}
.cb-xpbar i{display:block;height:100%;background:#ffd166}
.cb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(15em,1fr));gap:.8em;margin:.8em 0}
.cb-card{border:1px solid #ece8e122;padding:.8em;background:rgba(255,255,255,.03)}
.cb-card h3{margin:0 0 .5em;font-size:.85em;letter-spacing:.2em;color:#ece8e1aa}
.cb-mis{margin:.35em 0}
.cb-mis.done{color:#3edbc4}
.cb-hist td{font-size:.9em}
.cb-sw{display:inline-grid;place-items:center;width:4.6em;height:3.2em;margin:.2em;border:2px solid #ece8e133;cursor:pointer;font:inherit;color:#fff;font-size:.72em;letter-spacing:.06em;vertical-align:top}
.cb-sw.sel{border-color:#ffd166}
.cb-sw.lock{opacity:.35;cursor:default}
.cb-guns{display:grid;grid-template-columns:repeat(auto-fill,minmax(8em,1fr));gap:.4em}
.cb-rew{display:grid;grid-template-columns:1fr auto;gap:.15em 1em;max-width:28em}
.cb-rew span:nth-child(even){color:#ffd166;text-align:right}
@media (max-width:760px){.cb-two{grid-template-columns:1fr}.cb-logo h1{font-size:3em}.cb-lobby .teams{grid-template-columns:1fr}}
@media (max-height:520px){.cb-mainwrap{flex-direction:row;align-items:center;width:auto;right:5%;gap:2em}.cb-mainwrap .cb-menu{width:22em;max-height:100%;overflow:auto;gap:.3em}.cb-menu .b{padding:.45em 1em}.cb-menu .b small{display:none}.cb-logo h1{font-size:2.6em}.cb-foot{display:none}}
`;

const seg = (key, cur, opts) => `<span class="cb-seg">${opts.map(([v, l]) => `<button class="b${String(cur) === String(v) ? ' sel' : ''}" data-act="opt" data-arg="${key}:${v}">${l}</button>`).join('')}</span>`;

export function crosshairPreview(ch) {
  const t = ch.thick; const g = ch.gap; const s = ch.size;
  const sh = ch.outline ? 'box-shadow:0 0 0 1px rgba(0,0,0,.7);' : '';
  const c = `background:${ch.color};${sh}`;
  const bars = s > 0 ? [
    `left:${60 - t / 2}px;top:${40 - g - s}px;width:${t}px;height:${s}px`,
    `left:${60 - t / 2}px;top:${40 + g}px;width:${t}px;height:${s}px`,
    `left:${60 - g - s}px;top:${40 - t / 2}px;width:${s}px;height:${t}px`,
    `left:${60 + g}px;top:${40 - t / 2}px;width:${s}px;height:${t}px`,
  ] : [];
  if (ch.dot) bars.push(`left:${60 - t / 2}px;top:${40 - t / 2}px;width:${t}px;height:${t}px`);
  return bars.map((b) => `<i style="${b};${c}"></i>`).join('');
}

function main(g) {
  const st = g.save.stats;
  const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills;
  const p = ensureProgress(g.save); const L = levelInfo(p.xp); const R = rankInfo(p.rp);
  const pct = Math.round((L.into / Math.max(1, L.need)) * 100) || 0;
  return `<div class="cb-shade"></div>
  <div class="cb-home">
    <div class="cb-logo"><h1>CORE<span>BREACH</span></h1><div class="tag">TACTICAL 5V5 SHOOTER</div></div>
    <button class="cb-hero" data-act="screen" data-arg="bots">
      <span class="k">Play</span><span class="t">Versus bots</span><span class="d">5v5 attack and defend. Plant the Core on A or B, or stop it.</span>
      <span class="go">▶</span>
    </button>
    <div class="cb-modes">
      <button class="cb-mode" data-act="online"><span class="t">Online</span><span class="d">Host or join a room</span></button>
      <button class="cb-mode" data-act="screen" data-arg="dm"><span class="t">Deathmatch</span><span class="d">Free-for-all to 30</span></button>
      <button class="cb-mode" data-act="play" data-arg="range"><span class="t">Range</span><span class="d">Practise guns and abilities</span></button>
    </div>
    <div class="cb-links">
      <button data-act="screen" data-arg="agents">Agents</button>
      <button data-act="screen" data-arg="career">Career</button>
      <button data-act="screen" data-arg="armory">Armory</button>
      <button data-act="screen" data-arg="settings">Settings</button>
      <button data-act="screen" data-arg="howto">How to play</button>
    </div>
  </div>
  <div class="cb-id">
    <div class="cb-rank" style="background:${R.color}">${L.level}</div>
    <div class="cb-id-main">
      <input type="text" name="pname" maxlength="16" placeholder="Your name" value="${esc(playerName() || '')}" aria-label="Player name">
      <div class="cb-id-rank"><span style="color:${R.color}">${R.name}</span><span>Level ${L.level}</span></div>
      <div class="cb-xpbar"><i style="width:${pct}%"></i></div>
      <div class="cb-id-stats"><span><b>${st.matches}</b>Matches</span><span><b>${st.wins}</b>Wins</span><span><b>${kd}</b>K/D</span><span><b>${st.headshots}</b>Headshots</span></div>
    </div>
  </div>`;
}

function agentPicker(g, sel) {
  const a = AGENT[sel] || AGENTS[0];
  return `<div class="cb-two"><div>${g.hud.agentGrid(sel)}</div><div>${g.hud.agentInfo(a)}</div></div>`;
}

function bots(g) {
  const S = g.S;
  return `<div class="cb-wide"><div class="cb-panel">
    <h2>PLAY VS BOTS</h2><div class="sub">You and four bots against five. Attackers plant the Core on A or B; defenders stop them.</div>
    ${agentPicker(g, S.agent)}
    <div class="cb-row"><label>MAP</label>${seg('map', S.map || 'random', [...MAPS.map((x) => [x.id, x.name]), ['random', 'Random']])}</div>
    <div class="cb-row"><label>DIFFICULTY</label>${seg('difficulty', S.difficulty, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}</div>
    <div class="cb-row"><label>MATCH LENGTH</label>${seg('length', S.length, [['short', 'Short · first to 5'], ['standard', 'Standard · first to 13']])}</div>
    <div class="cb-row" style="margin-top:1em"><button class="b primary" data-act="play" data-arg="core">Start match</button><button class="b" data-act="screen" data-arg="main">Back</button></div>
  </div></div>`;
}

function dm(g) {
  const S = g.S;
  return `<div class="cb-wide"><div class="cb-panel" style="max-width:40em">
    <h2>DEATHMATCH</h2><div class="sub">Everyone for themselves. Guns only, free loadout (press B), instant respawn. First to 30 kills or most kills in 6 minutes.</div>
    <div class="cb-row"><label>MAP</label>${seg('map', S.map || 'random', [...MAPS.map((x) => [x.id, x.name]), ['random', 'Random']])}</div>
    <div class="cb-row"><label>BOTS</label>${seg('difficulty', S.difficulty, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}</div>
    <div class="cb-row" style="margin-top:1em"><button class="b primary" data-act="play" data-arg="dm">Start</button><button class="b" data-act="screen" data-arg="main">Back</button></div>
  </div></div>`;
}

function agents(g) {
  return `<div class="cb-wide"><div class="cb-panel"><h2>AGENTS</h2><div class="sub">Pick who you play. C and Q are bought each round, E is free every round, X (ultimate) charges with kills, deaths, plants and defuses.</div>
    ${agentPicker(g, g.S.agent)}
    <div class="cb-row" style="margin-top:1em"><button class="b" data-act="screen" data-arg="main">Back</button></div></div></div>`;
}

function settings(g) {
  const S = g.S;
  const ch = S.ch;
  const range = (key, v, min, max, step) => `<div class="cb-row"><label>${key.toUpperCase()}</label><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></div>`;
  const rangeL = (label, key, v, min, max, step) => `<div class="cb-row"><label>${label}</label><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></div>`;
  const check = (label, key, v) => `<div class="cb-row"><label>${label}</label><input type="checkbox" data-set="${key}" ${v ? 'checked' : ''}></div>`;
  return `<div class="cb-wide"><div class="cb-panel">
    <h2>SETTINGS</h2>
    <div class="cb-set">
      <div>
        <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">CONTROLS</h3>
        ${rangeL('SENSITIVITY', 'sens', S.sens, 0.1, 4, 0.05)}
        ${check('INVERT Y', 'invertY', S.invertY)}
        <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">VIDEO</h3>
        ${rangeL('FIELD OF VIEW', 'fov', S.fov, 75, 110, 1)}
        <div class="cb-row"><label>QUALITY</label>${seg('quality', S.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div>
        ${check('AUTO RESOLUTION', 'dynRes', S.dynRes !== false)}
        ${check('SHOW FPS', 'showFps', S.showFps)}
        <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">AUDIO</h3>
        ${range('volume', S.volume, 0, 100, 1)}
      </div>
      <div>
        <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">CROSSHAIR</h3>
        <div class="cb-row"><div class="cb-xh-preview">${crosshairPreview(ch)}</div></div>
        <div class="cb-row"><label>COLOUR</label><input type="color" data-set="ch.color" value="${ch.color}"></div>
        ${rangeL('LENGTH', 'ch.size', ch.size, 0, 14, 1)}
        ${rangeL('GAP', 'ch.gap', ch.gap, 0, 12, 1)}
        ${rangeL('THICKNESS', 'ch.thick', ch.thick, 1, 6, 1)}
        ${check('CENTRE DOT', 'ch.dot', ch.dot)}
        ${check('OUTLINE', 'ch.outline', ch.outline)}
        ${check('MOVES WITH SPREAD', 'ch.dynamic', ch.dynamic)}
      </div>
    </div>
    <div class="cb-row" style="margin-top:1em"><button class="b" data-act="back">Back</button><button class="b" data-act="reset-settings">Reset to defaults</button><button class="b" data-act="fullscreen">Fullscreen</button></div>
  </div></div>`;
}

function howto() {
  const k = (s) => `<kbd>${s}</kbd>`;
  return `<div class="cb-wide"><div class="cb-panel"><h2>HOW TO PLAY</h2><div class="cb-help">
    <h3>THE MATCH</h3>
    <p>Two teams of five. Attackers carry the Core and plant it on site A or B; defenders stop the plant or defuse it (7 s, with a checkpoint at half). A round also ends when a whole team is eliminated, or when time runs out (defenders win).</p>
    <p>Teams swap sides at half-time. The first team to 5 rounds (short) or 13 (standard) wins.</p>
    <h3>ECONOMY</h3>
    <p>Every round starts with a 30-second buy phase. You earn credits for kills, plants, wins, and more for each loss in a row. Weapons and shields you survive with carry into the next round.</p>
    <h3>MOVEMENT AND AIM</h3>
    <p>${k('W A S D')} move · ${k('Shift')} walk (quiet and accurate) · ${k('Ctrl')} or ${k('Z')} crouch · ${k('Space')} jump.</p>
    <p>Guns are most accurate when you stand still. The first shot is precise; holding the trigger spreads and climbs, so tap or burst at range and pull down to control recoil.</p>
    <p>Headshots deal far more damage: rifles kill with one headshot through light shields.</p>
    <h3>WEAPONS</h3>
    <p>${k('Left click')} fire · ${k('Right click')} zoom or scope · ${k('R')} reload · ${k('1')} ${k('2')} ${k('3')} or the wheel to switch · ${k('B')} buy menu.</p>
    <h3>ABILITIES</h3>
    <p>${k('C')} ${k('Q')} ${k('E')} ${k('X')} get an ability ready, then click (or press the key again) to use it; right click cancels. Thrown ones show their arc. X is the ultimate.</p>
    <h3>THE CORE</h3>
    <p>Hold ${k('F')} on a site to plant, or near a planted Core to defuse. Walk over a dropped Core to pick it up.</p>
    <h3>OTHER</h3>
    <p>${k('Tab')} scoreboard · ${k('Enter')} chat (online) · ${k('Esc')} menu. On a phone or tablet: left stick to move, drag the right side to look, buttons for everything else.</p>
    <h3>ONLINE</h3>
    <p>Hosting creates a room code; friends type it to join. Games connect your browsers directly, and the host runs the match and the bots. Up to 10 players.</p>
  </div><div class="cb-row" style="margin-top:1em"><button class="b" data-act="back">Back</button></div></div></div>`;
}

function pause(g) {
  const online = !!g.net;
  return `<div class="cb-shade"></div><div class="cb-menu">
    <h2>${online ? 'MENU' : 'PAUSED'}</h2>
    <button class="b primary" data-act="resume">Resume</button>
    <button class="b" data-act="screen" data-arg="settings">Settings</button>
    <button class="b" data-act="screen" data-arg="howto">How to play</button>
    <button class="b" data-act="leave">Leave match</button>
    ${online ? `<div class="cb-note">Room ${esc(g.net.code || '')} · the match keeps running while this menu is open.</div>` : ''}
  </div>`;
}


function rankBadge(R) {
  return `<div class="cb-rank" style="background:${R.color}">${R.name.split(' ')[1] || '★'}</div>`;
}

function career(g) {
  const p = ensureProgress(g.save);
  const L = levelInfo(p.xp);
  const R = rankInfo(p.rp);
  const st = g.save.stats;
  const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills;
  const hist = p.history.map((h) => `<tr class="${h.win ? 'blue' : 'red'}"><td>${new Date(h.t).toLocaleDateString()}</td><td>${h.mode === 'core' ? 'Core' : 'Deathmatch'}${h.online ? ' · online' : ''}</td><td>${esc(h.map || '')}</td><td>${h.win ? 'WIN' : 'LOSS'} ${esc(h.score || '')}</td><td>${h.k}/${h.d}/${h.a}</td><td>+${h.xp} XP</td><td>${h.rr ? (h.rr > 0 ? '+' : '') + h.rr + ' RP' : ''}</td></tr>`).join('');
  return `<div class="cb-wide"><div class="cb-panel">
    <h2>CAREER</h2>
    <div class="cb-cards">
      <div class="cb-card"><h3>LEVEL</h3><div class="cb-prof"><b style="font-size:2.4em">${L.level}</b><div style="flex:1">${L.into} / ${L.need} XP<div class="cb-xpbar"><i style="width:${(L.into / L.need) * 100}%"></i></div></div></div></div>
      <div class="cb-card"><h3>RANK (VS BOTS)</h3><div class="cb-prof">${rankBadge(R)}<div style="flex:1"><b style="color:${R.color}">${R.name.toUpperCase()}</b><br><small>${R.into} / 100 RP</small><div class="cb-xpbar"><i style="width:${Math.min(100, R.into)}%;background:${R.color}"></i></div></div></div>
        <small style="color:#ece8e199">Win Core matches against bots to climb. Hard bots move your rank faster.</small></div>
      <div class="cb-card"><h3>DAILY MISSIONS · +500 XP EACH</h3>${p.missions.map((ms) => `<div class="cb-mis${ms.done ? ' done' : ''}">${ms.done ? '✓' : '○'} ${esc(ms.text)} <small>(${ms.progress}/${ms.goal})</small></div>`).join('')}<small style="color:#ece8e199">New missions every day.</small></div>
      <div class="cb-card"><h3>LIFETIME</h3>MATCHES ${st.matches} · WINS ${st.wins}<br>KILLS ${st.kills} · DEATHS ${st.deaths} · K/D ${kd}<br>HEADSHOT KILLS ${st.headshots}</div>
    </div>
    <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">RANKS</h3>
    <div class="cb-row">${TIERS.map((t, i) => `<span style="color:${TIER_COLORS[i]};margin-right:1em">${t.toUpperCase()}</span>`).join('')}</div>
    <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em">MATCH HISTORY</h3>
    <div class="cb-sb cb-hist">${hist ? `<table>${hist}</table>` : '<p class="cb-note">No matches yet.</p>'}</div>
    <div class="cb-row"><button class="b" data-act="screen" data-arg="main">Back</button></div>
  </div></div>`;
}

function armory(g, sel) {
  const p = ensureProgress(g.save);
  const L = levelInfo(p.xp);
  const guns = [...BUY_CATS.flatMap(([, ids]) => ids), 'knife'];
  const gun = guns.includes(sel) ? sel : guns[0];
  const cur = p.skins[gun] || 'stock';
  const sw = SKINS.map((s) => {
    const ok = skinUnlocked(g.save, s.id);
    const bg = s.color ? `linear-gradient(135deg,${s.color} 60%,${s.glow} 60%)` : 'linear-gradient(135deg,#6b7078 60%,#5ef2ff 60%)';
    return `<button class="cb-sw${cur === s.id ? ' sel' : ''}${ok ? '' : ' lock'}" style="background:${bg}" data-act="skin" data-arg="${gun}:${s.id}"><span style="background:rgba(0,0,0,.55);padding:0 .3em">${s.name.toUpperCase()}${ok ? '' : ` · LV ${s.level}`}</span></button>`;
  }).join('');
  const list = guns.map((id) => `<button class="b${id === gun ? ' sel' : ''}" data-act="armory-gun" data-arg="${id}">${WEAPON[id].name}<small style="display:block;font-size:.7em;color:#ece8e199">${(p.skins[id] || 'stock').toUpperCase()}</small></button>`).join('');
  return `<div class="cb-wide"><div class="cb-panel">
    <h2>ARMORY</h2><div class="sub">LEVEL ${L.level} · skins unlock as you level up. Your skin shows on your weapon in first person.</div>
    <div class="cb-guns">${list}</div>
    <h3 style="letter-spacing:.2em;color:#ece8e1aa;font-size:.9em;margin-top:1em">${WEAPON[gun].name.toUpperCase()} SKINS</h3>
    <div>${sw}</div>
    <div class="cb-row" style="margin-top:1em"><button class="b" data-act="screen" data-arg="main">Back</button></div>
  </div></div>`;
}

function rewardBlock(r) {
  if (!r) return '';
  const lv = r.after.level > r.before.level ? `<p style="color:#ffd166;font-size:1.3em;margin:.3em 0">LEVEL UP · ${r.after.level}</p>` : '';
  const rk = r.rr ? `<p style="margin:.3em 0">RANK <b style="color:${r.rankAfter.color}">${r.rankAfter.name.toUpperCase()}</b> <span style="color:${r.rr > 0 ? '#3edbc4' : '#ff4655'}">${r.rr > 0 ? '+' : ''}${r.rr} RP</span>${r.rankAfter.name !== r.rankBefore.name ? ` · ${r.rr > 0 ? 'PROMOTED' : 'DEMOTED'}` : ''}</p>` : '';
  const un = r.unlocked.length ? `<p style="margin:.3em 0">UNLOCKED SKINS: <b>${r.unlocked.map((s) => s.name.toUpperCase()).join(', ')}</b> (see Armory)</p>` : '';
  return `<div class="cb-cards"><div class="cb-card"><h3>XP EARNED · +${r.xp}</h3><div class="cb-rew">${r.items.map(([l, v]) => `<span>${esc(l)}</span><span>+${v}</span>`).join('')}</div>
    <div style="margin-top:.6em">LEVEL ${r.after.level} · ${r.after.into} / ${r.after.need}<div class="cb-xpbar"><i style="width:${(r.after.into / r.after.need) * 100}%"></i></div></div></div>
    <div class="cb-card">${lv}${rk}${un}${r.done.length ? `<p style="color:#3edbc4">MISSIONS COMPLETE: ${r.done.map((d) => esc(d.text)).join(', ')}</p>` : ''}</div></div>`;
}

function results(g) {
  const e = g.overData;
  if (!e) return '';
  const myTeam = g.myTeam();
  const core = g.st.mode === 'core';
  const win = core ? e.winner === myTeam : e.winner === g.myId;
  const board = [...e.board].sort((a, b) => b.score - a.score || b.k - a.k);
  const mvp = board[0];
  const rows = board.map((p) => `<tr class="${core ? (p.team === myTeam ? 'blue' : 'red') : ''}${p.id === g.myId ? ' me' : ''}"><td>${esc(p.name)}${p.bot ? ' <small style="opacity:.6">BOT</small>' : ''}${p === mvp ? ' <small style="color:#ffd166">MVP</small>' : ''}</td><td>${AGENT[p.agent].name}</td><td>${p.k}</td><td>${p.d}</td><td>${p.a}</td><td>${p.score}</td></tr>`).join('');
  const acc = g.stats.shots ? Math.round((g.stats.hits / g.stats.shots) * 100) : 0;
  const hs = g.stats.hits ? Math.round((g.stats.heads / g.stats.hits) * 100) : 0;
  return `<div class="cb-wide"><div class="cb-panel cb-res cb-sb">
    <h1 class="${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</h1>
    <div class="sub">${core ? `${e.score[myTeam]} – ${e.score[myTeam === 'red' ? 'blue' : 'red']}` : 'DEATHMATCH'} · YOUR ACCURACY ${acc}% · HEADSHOTS ${hs}%</div>
    ${rewardBlock(g.reward)}
    <table><tr><th>PLAYER</th><th>AGENT</th><th>K</th><th>D</th><th>A</th><th>SCORE</th></tr>${rows}</table>
    <div class="cb-row"><button class="b primary" data-act="again">${g.session && g.session.online ? 'Back to menu' : 'Play again'}</button><button class="b" data-act="leave">Main menu</button></div>
  </div></div>`;
}

function online(g) {
  const err = g.netError ? `<p class="cb-err">${esc(g.netError)}</p>` : '';
  g.netError = '';
  return `<div class="cb-wide"><div class="cb-panel" style="max-width:40em">
    <h2>ONLINE</h2><div class="sub">Play with friends: one of you hosts, the others join with the room code.</div>
    <div class="cb-row"><label>YOUR NAME</label><input type="text" name="pname" data-set="pname" maxlength="16" value="${esc(playerName() || '')}" placeholder="Name"></div>
    <div class="cb-row" style="margin-top:1em"><button class="b primary" data-act="mp-host">Host a room</button></div>
    <div class="cb-row"><input class="code" name="code" maxlength="5" placeholder="CODE"><button class="b" data-act="mp-join">Join</button></div>
    ${err}
    <p class="cb-note">Browsers connect directly to each other (WebRTC); a small public server only helps them find each other. Some strict networks (offices, schools, some mobile carriers) block direct connections — then a TURN server can be added in the game's config.</p>
    <div class="cb-row"><button class="b" data-act="screen" data-arg="main">Back</button></div>
  </div></div>`;
}

export function render(name, g, arg) {
  switch (name) {
    case 'main': return main(g);
    case 'bots': return bots(g);
    case 'dm': return dm(g);
    case 'agents': return agents(g);
    case 'settings': return settings(g);
    case 'howto': return howto(g);
    case 'pause': return pause(g);
    case 'results': return results(g);
    case 'online': return online(g, arg);
    case 'career': return career(g);
    case 'armory': return armory(g, arg);
    default: return '';
  }
}

export { WEAPON };
