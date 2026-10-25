// Ascendants interface: HUD (health/shield, power slots with cooldowns, ultimate, items, minimap with the
// storm, alive/kills, kill feed, pickup toasts, damage numbers, prompts), the loadout screen, the big map
// and every menu. Heroic style: deep navy panels with gold and electric cyan, slanted edges.
import { POWER, ALL_POWERS, HEROES, HERO, CRATES, ITEMS, COMBAT, AURAS, CHALLENGES, MODES, FORMS, esc, level, dailyState, XH_STYLES, XH_COLORS } from './data.js';

// technique glyphs (24x24 viewBox)
const GLYPH = {
  volley: 'M4 8h.1M4 16h.1M9 6l4 2-4 2zM9 14l4 2-4 2zM16 10l5 2-5 2z',
  wave: 'M2 12h4M7 7a5 5 0 0 1 0 10M7 12h15M13 9h9M13 15h9',
  piercer: 'M3 21L21 3M15 3h6v6M7 13l4 4',
  disc: 'M12 12m-8 0a8 3 0 1 0 16 0 8 3 0 1 0-16 0M12 12h.1M4 12l-2 0M20 12h2',
  bomb: 'M12 13m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0M15 7l3-3M18 4l2 0M18 4l0-2',
  scatter: 'M12 21V9M12 9l-6-5M12 9l6-5M6 4l-1 4M18 4l1 4M8 14h.1M16 16h.1M10 18h.1',
  nova: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3',
  shout: 'M3 9h4l5-4v14l-5-4H3zM16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14',
  flash: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  rush: 'M2 8h7M3 12h8M2 16h6M13 7a3 3 0 0 1 6 0v4a4 4 0 0 1-4 4h-2z',
  instant: 'M5 4h4M3 9h4M5 14h4M15 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 9l3 1 2 4M14 13l-2 5M16 14l2 6',
  afterimage: 'M8 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM6 21l1-8 3-3M16 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM14 21l1-8 3-3',
  barrier: 'M12 2l8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z',
  heal: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  split: 'M8 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM16 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 21c0-5 3-8 5-8s5 3 5 8M11 21c0-5 3-8 5-8s5 3 5 8',
  lash: 'M3 20c4-2 4-8 9-8s5 6 9 4M18 12l3 4-4 1',
  gravity: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 3a9 9 0 0 1 9 9M21 12a9 9 0 0 1-9 9M12 21a9 9 0 0 1-9-9M3 12a9 9 0 0 1 9-9',
  quake: 'M2 21l4-10 3 10M8 21l4-16 4 16M15 21l3-9 4 9',
  sun: 'M12 9m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0M7 21l2-6M17 21l-2-6M12 21v-6',
  radiance: 'M2 9h6M2 15h6M8 6c3 0 3 12 0 12M8 12h14M11 8l11 1M11 16l11-1',
  breaker: 'M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  surge: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 2 4 3 4-1-4 0-7 0-10z',
  comet: 'M15 15a5 5 0 1 0 0-.1zM11 11L2 2M8 13L3 8M13 8L8 3',
  timestop: 'M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10',
  barrage: 'M3 6h.1M3 12h.1M3 18h.1M7 4l5 2-5 2zM7 10l5 2-5 2zM7 16l5 2-5 2zM14 7l7 2-7 2zM14 13l7 2-7 2z',
  fist: 'M6 10V5a2 2 0 0 1 4 0v5M10 9V4a2 2 0 0 1 4 0v5M14 9V5a2 2 0 0 1 4 0v8a7 7 0 0 1-14 0v-3a2 2 0 0 1 2-2',
  melee: 'M6 10V5a2 2 0 0 1 4 0v5M10 9V4a2 2 0 0 1 4 0v5M14 9V5a2 2 0 0 1 4 0v8a7 7 0 0 1-14 0v-3a2 2 0 0 1 2-2',
  medkit: 'M4 7h16v13H4zM9 7V4h6v3M12 10v7M8.5 13.5h7',
  cell: 'M8 3h8v3h2v15H6V6h2zM9 13l3-4v3h3l-3 4v-3z',
};
export function icon(id, color = 'currentColor', size = 26) {
  const d = GLYPH[id] || 'M12 2l10 10-10 10L2 12z';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export const CSS = `
.asc{position:absolute;inset:0;overflow:hidden;font-family:Manrope,system-ui,sans-serif;color:#eef3ff;user-select:none;-webkit-user-select:none;outline:none;background:#0b1430}
.asc canvas.gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.asc .hud{position:absolute;inset:0;pointer-events:none;font-size:clamp(11px,1.1vw,15px)}
.asc .hud *{box-sizing:border-box}
.asc .h1{font-family:Unbounded,Manrope,sans-serif;font-weight:800;letter-spacing:.04em}
/* crosshair (customisable) */
.asc .xh{position:absolute;left:50%;top:50%;width:0;height:0;--xc:#7dff8a;--xs:1}
.asc .xh i{position:absolute;background:var(--xc);box-shadow:0 0 0 1px rgba(0,0,0,.75)}
.asc .xh.cross i:nth-child(1),.asc .xh.tee i:nth-child(1){left:calc(-12px * var(--xs));top:-1px;width:calc(8px * var(--xs));height:2px}
.asc .xh.cross i:nth-child(2),.asc .xh.tee i:nth-child(2){left:calc(4px * var(--xs));top:-1px;width:calc(8px * var(--xs));height:2px}
.asc .xh.cross i:nth-child(3){top:calc(-12px * var(--xs));left:-1px;height:calc(8px * var(--xs));width:2px}
.asc .xh.cross i:nth-child(4),.asc .xh.tee i:nth-child(4){top:calc(4px * var(--xs));left:-1px;height:calc(8px * var(--xs));width:2px}
.asc .xh.tee i:nth-child(3){display:none}
.asc .xh i:nth-child(5){left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%}
.asc .xh.cross i:nth-child(5),.asc .xh.tee i:nth-child(5){display:none}
.asc .xh.dot i:not(:nth-child(5)){display:none}
.asc .xh.dot i:nth-child(5){left:-2.5px;top:-2.5px;width:5px;height:5px}
.asc .xh.circle i:not(:nth-child(5)):not(:nth-child(6)){display:none}
.asc .xh i:nth-child(6){display:none}
.asc .xh.circle i:nth-child(6){display:block;background:none;border:2px solid var(--xc);border-radius:50%;left:calc(-11px * var(--xs));top:calc(-11px * var(--xs));width:calc(22px * var(--xs));height:calc(22px * var(--xs));box-shadow:0 0 0 1px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.5)}
.asc .xh.hit{filter:drop-shadow(0 0 3px #fff)}
.asc .hm{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px;opacity:0;transition:opacity .15s}
.asc .hm.on{opacity:1;transition:none}
.asc .hm i{position:absolute;width:9px;height:2px;background:#fff;box-shadow:0 0 2px #000}
.asc .hm.big i{background:#ff4a5a}
.asc .hm i:nth-child(1){left:0;top:4px;transform:rotate(45deg)}.asc .hm i:nth-child(2){right:0;top:4px;transform:rotate(-45deg)}
.asc .hm i:nth-child(3){left:0;bottom:4px;transform:rotate(-45deg)}.asc .hm i:nth-child(4){right:0;bottom:4px;transform:rotate(45deg)}
/* compass bar */
.asc .compass{position:absolute;top:.5em;left:50%;transform:translateX(-50%);width:min(44em,62vw);height:2.6em}
.asc .compass canvas{width:100%;height:100%;display:block}
.asc .bearing{position:absolute;top:3.25em;left:50%;transform:translateX(-50%);font-family:Unbounded,sans-serif;font-weight:700;font-size:.8em;background:rgba(0,0,0,.45);padding:.05em .5em;border-radius:3px}
.asc .zonebar{position:absolute;top:4.75em;left:50%;transform:translateX(-50%);display:flex;gap:.5em;align-items:center;font-weight:700;font-size:.82em;background:rgba(8,10,20,.55);padding:.2em .8em;border-radius:3px;white-space:nowrap}
.asc .zonebar b{font-family:Unbounded,sans-serif;color:#fff}
.asc .zonebar .ic{width:.9em;height:.9em;border-radius:50%;border:2px solid #c99bff}
.asc .zonebar.warn{background:rgba(120,30,30,.7)}
.asc .redwarn{position:absolute;top:6.9em;left:50%;transform:translateX(-50%);font-weight:800;color:#ff6a5a;text-shadow:0 1px 3px #000;letter-spacing:.06em;font-size:.9em;display:none}
/* alive / killed (top right) and kill feed */
.asc .counts{position:absolute;top:.6em;right:.8em;display:flex;gap:.35em}
.asc .counts div{background:rgba(0,0,0,.42);padding:.2em .6em;display:flex;align-items:baseline;gap:.35em;font-weight:800;font-size:.85em;letter-spacing:.06em}
.asc .counts b{font-family:Unbounded,sans-serif;font-size:1.35em;color:#fff}
.asc .counts .alive{background:rgba(255,255,255,.88);color:#111}.asc .counts .alive b{color:#111}
.asc .feed{position:absolute;top:3.4em;right:.8em;display:flex;flex-direction:column;gap:.2em;align-items:flex-end;max-width:28em}
.asc .feed div{background:rgba(0,0,0,.45);padding:.2em .6em;font-size:.82em;animation:ascIn .2s ease-out;white-space:nowrap}
.asc .feed div i{font-style:normal;opacity:.85;margin:0 .4em;color:#ffd166}
.asc .feed div.me{background:rgba(255,80,80,.45)}
.asc .feed div.mate b:first-child{color:#5effa8}
@keyframes ascIn{from{opacity:0;transform:translateX(10px)}}
/* minimap (bottom right) */
.asc .mm{position:absolute;right:.8em;bottom:.8em;width:15em;height:15em;overflow:hidden;border:1px solid rgba(255,255,255,.35);box-shadow:0 4px 18px rgba(0,0,0,.5);background:#0b1430}
.asc .mm canvas{width:100%;height:100%;display:block}
.asc .mm .lbl{position:absolute;left:0;top:0;background:rgba(0,0,0,.55);font-size:.7em;padding:.15em .5em;letter-spacing:.08em}
.asc .mmzone{position:absolute;right:1.07em;bottom:21.6em;width:20em;display:flex;align-items:center;gap:.4em;font-size:.75em;font-weight:800}
.asc .mmzone .tr{flex:1;height:.4em;background:rgba(0,0,0,.45);position:relative}
.asc .mmzone .tr i{position:absolute;left:0;top:0;bottom:0;background:#c99bff}
.asc .mmzone .tr u{position:absolute;top:-.35em;width:.9em;height:1.1em;background:#fff;clip-path:polygon(0 0,100% 50%,0 100%)}
/* hero card (bottom left) */
.asc .card2{position:absolute;left:.8em;bottom:.8em;display:flex;gap:.6em;align-items:flex-end}
.asc .portrait{width:4.6em;height:4.6em;clip-path:polygon(18% 0,100% 0,100% 82%,82% 100%,0 100%,0 18%);display:grid;place-items:center;font-family:Unbounded,sans-serif;font-weight:800;font-size:1.3em;text-shadow:0 2px 4px rgba(0,0,0,.6);position:relative}
.asc .portrait small{position:absolute;bottom:.2em;font-size:.38em;letter-spacing:.1em}
.asc .ident{display:flex;flex-direction:column;gap:.2em;padding-bottom:.2em}
.asc .ident .nm{font-family:Unbounded,sans-serif;font-weight:700;font-size:.9em}
.asc .ident .fm{font-size:.72em;letter-spacing:.12em;font-weight:800;opacity:.9}
.asc .ident .pl{font-size:.72em;letter-spacing:.08em;opacity:.85}.asc .ident .pl b{color:#ffd84a}
.asc .items{display:flex;gap:.35em;margin-top:.2em}
.asc .it{display:flex;align-items:center;gap:.25em;background:rgba(0,0,0,.45);padding:.15em .45em;font-weight:800;font-size:.85em}
.asc .it small{opacity:.6;font-weight:600;font-size:.75em}
/* health / ki (bottom centre, PUBG-like) */
.asc .vit{position:absolute;left:50%;bottom:.9em;transform:translateX(-50%);width:min(30em,40vw)}
.asc .bar{height:.75em;background:rgba(0,0,0,.5);position:relative;margin-top:.22em}
.asc .bar i{position:absolute;left:0;top:0;bottom:0;transition:width .12s}
.asc .bar span{position:absolute;right:.4em;top:50%;transform:translateY(-50%);font-size:.7em;font-weight:800;text-shadow:0 1px 2px #000}
.asc .bar.hp{height:1.05em;border:1px solid rgba(255,255,255,.35)}
.asc .bar.hp i{background:#f2f2f2}
.asc .bar.hp.low i{background:#ff4a4a;animation:ascLow .6s infinite alternate}
@keyframes ascLow{to{background:#ff8a7a}}
.asc .bar.hp b{position:absolute;left:0;top:0;bottom:0;background:rgba(255,80,80,.55);transition:width .6s .3s}
.asc .bar.sh{height:.45em}.asc .bar.sh i{background:#4ab8ff}
.asc .bar.ab{height:.35em}.asc .bar.ab i{background:repeating-linear-gradient(90deg,#fff 0 6px,#bfe 6px 8px)}
.asc .bar.ki{height:.5em}.asc .bar.ki i{background:linear-gradient(90deg,#ffb52e,#fff0a0)}
.asc .bar.ki.chg i{background:linear-gradient(90deg,#fff3b0,#fff);box-shadow:0 0 10px #ffd84a}
.asc .bar.fm{height:.3em}.asc .bar.fm i{background:linear-gradient(90deg,#c58a1a,#ffe86a)}
.asc .bar.fm.full i{background:#fff;animation:ascGlow .5s infinite alternate}
@keyframes ascGlow{to{background:#ffe86a}}
/* ability bar (Valorant-like) */
.asc .slots{position:absolute;bottom:5.3em;left:50%;transform:translateX(-50%);display:flex;gap:.45em;align-items:center}
.asc .slot{width:3.7em;height:3.7em;position:relative;background:rgba(10,12,22,.62);border:1px solid rgba(255,255,255,.25);display:grid;place-items:center;overflow:visible}
.asc .slot .cd{position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.7) var(--p),transparent 0)}
.asc .slot .cdt{position:absolute;inset:0;display:grid;place-items:center;font-family:Unbounded,sans-serif;font-weight:800;font-size:1.05em;text-shadow:0 2px 4px #000}
.asc .slot .key{position:absolute;left:50%;top:-1.25em;transform:translateX(-50%);font-size:.68em;font-weight:800;background:rgba(0,0,0,.55);padding:0 .35em;border:1px solid rgba(255,255,255,.3)}
.asc .slot .lv{position:absolute;bottom:.05em;left:0;right:0;text-align:center;font-size:.55em;letter-spacing:.1em;color:#ffd166}
.asc .slot .kc{position:absolute;right:.2em;top:.1em;font-size:.6em;font-weight:800;color:#ffd84a}
.asc .slot.empty{opacity:.4}
.asc .slot.noki{filter:grayscale(.8) brightness(.65)}
.asc .slot.melee{width:2.9em;height:2.9em;opacity:.85}
.asc .slot.ult{width:3.6em;height:3.6em;margin:0 .6em;border-color:rgba(255,209,102,.6);transform:rotate(45deg)}
.asc .slot.ult > svg,.asc .slot.ult .cdt,.asc .slot.ult .key{transform:rotate(-45deg)}
.asc .slot.ult .key{left:-.6em;top:-.6em;transform:rotate(-45deg)}
.asc .slot.ult.ready{border-color:#ffd166;box-shadow:0 0 0 2px rgba(255,209,102,.4),0 0 22px rgba(255,209,102,.85);animation:ascPulse 1s infinite alternate}
@keyframes ascPulse{to{box-shadow:0 0 0 4px rgba(255,209,102,.25),0 0 30px rgba(255,209,102,1)}}
.asc .pips{position:absolute;left:50%;top:50%;transform:rotate(-45deg) translate(-50%,2.9em);transform-origin:0 0;display:flex;gap:.2em}
.asc .pips i{width:.42em;height:.42em;transform:rotate(45deg);border:1px solid #ffd166}
.asc .pips i.on{background:#ffd166}
.asc .ultfill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(255,209,102,.5),rgba(255,209,102,.1))}
/* prompts, centre text, toasts, damage */
.asc .prompt{position:absolute;left:50%;bottom:10.2em;transform:translateX(-50%);background:rgba(0,0,0,.6);padding:.4em .9em;font-weight:700;white-space:nowrap}
.asc .prompt kbd{background:#fff;color:#111;padding:0 .4em;margin-right:.45em;font-family:Unbounded,sans-serif;font-size:.85em}
.asc .prompt .pb{height:3px;background:rgba(255,255,255,.2);margin-top:.35em}
.asc .prompt .pb i{display:block;height:100%;background:#ffd166}
.asc .center{position:absolute;left:50%;top:21%;transform:translateX(-50%);text-align:center;pointer-events:none}
.asc .center .big{font-family:Unbounded,sans-serif;font-weight:800;font-size:2.3em;letter-spacing:.05em;text-shadow:0 4px 18px rgba(0,0,0,.6);animation:ascPop .35s ease-out}
.asc .center .sub{font-weight:700;opacity:.9;margin-top:.3em;text-shadow:0 2px 6px #000}
@keyframes ascPop{from{transform:scale(1.4);opacity:0}}
.asc .toasts{position:absolute;left:.8em;bottom:7em;display:flex;flex-direction:column;gap:.3em;align-items:flex-start}
.asc .toast{display:flex;align-items:center;gap:.5em;background:linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.1));padding:.3em .7em;border-left:3px solid var(--c);animation:ascIn .25s ease-out;font-weight:700}
.asc .toast small{opacity:.7;font-weight:600}
.asc .toast kbd{background:#fff;color:#111;padding:0 .3em;font-family:Unbounded,sans-serif;font-size:.8em}
.asc .dmg{position:absolute;font-family:Unbounded,sans-serif;font-weight:800;color:#fff;text-shadow:0 2px 4px #000,0 0 8px rgba(0,0,0,.6);pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap}
.asc .dmg.sh{color:#7fd8ff}.asc .dmg.big{color:#ffd166;font-size:1.3em}
.asc .vign{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px rgba(200,0,30,0);transition:box-shadow .3s}
.asc .stormtint{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(120,40,220,0) 30%,rgba(120,40,220,.45));opacity:0;transition:opacity .5s}
.asc .using{position:absolute;left:50%;top:60%;transform:translateX(-50%);width:12em;text-align:center;font-weight:700}
.asc .using .pb{height:5px;background:rgba(255,255,255,.2);overflow:hidden;margin-top:.3em}.asc .using .pb i{display:block;height:100%;background:#5cff8a}
/* damage direction arcs */
.asc .ddir{position:absolute;left:50%;top:50%;width:0;height:0}
.asc .ddir i{position:absolute;left:-5em;top:-5em;width:10em;height:10em;border-radius:50%;border-top:5px solid rgba(255,50,50,.9);transition:opacity .9s;filter:drop-shadow(0 0 4px rgba(255,0,0,.8))}
/* world markers (pings) */
.asc .marks{position:absolute;inset:0}
.asc .mk{position:absolute;transform:translate(-50%,-100%);text-align:center;font-weight:800;font-size:.75em;text-shadow:0 1px 2px #000;white-space:nowrap}
.asc .mk i{display:block;width:1.1em;height:1.1em;margin:0 auto .1em;transform:rotate(45deg);border:2px solid #111;background:var(--c)}
.asc .mk.enemy i{border-radius:50%;transform:none;background:#ff4a4a}
.asc .mk.drop i{background:#ff4a4a;border-radius:2px;transform:none}
/* Valorant-like kill banner */
.asc .killban{position:absolute;left:50%;bottom:13.4em;transform:translateX(-50%);text-align:center;display:none}
.asc .killban .ring{width:4.4em;height:4.4em;margin:0 auto;border-radius:50%;border:3px solid #ffd166;display:grid;place-items:center;background:radial-gradient(circle,rgba(255,209,102,.35),rgba(0,0,0,.4));box-shadow:0 0 24px rgba(255,209,102,.7);animation:ascPop .3s ease-out}
.asc .killban .ring b{font-family:Unbounded,sans-serif;font-size:1.5em;color:#fff}
.asc .killban .sig{display:flex;gap:.25em;justify-content:center;margin-top:.35em}
.asc .killban .sig i{width:.55em;height:.55em;transform:rotate(45deg);background:#ffd166}
.asc .killban .nm{font-weight:800;letter-spacing:.12em;font-size:.85em;margin-top:.3em;text-shadow:0 1px 3px #000}
/* ki, forms, lock-on, squads, clashes */
.asc .lock{position:absolute;width:3.2em;height:3.2em;margin:-1.6em 0 0 -1.6em;border:2px solid #ff5a5a;border-radius:50%;box-shadow:0 0 10px rgba(255,80,80,.6);display:none}
.asc .lock:before,.asc .lock:after{content:'';position:absolute;left:50%;top:-.6em;width:2px;height:4.4em;margin-left:-1px;background:linear-gradient(#ff5a5a 0 20%,transparent 20% 80%,#ff5a5a 80%)}
.asc .lock:after{transform:rotate(90deg)}
.asc .lock .li{position:absolute;left:3.6em;top:-.4em;white-space:nowrap;font-size:.8em;font-weight:800;text-shadow:0 1px 3px #000;line-height:1.3}
.asc .lock .li small{display:block;color:#ffd84a;font-family:Unbounded,sans-serif;font-size:.85em}
.asc .lock .lh{width:7em;height:4px;background:rgba(0,0,0,.6);margin-top:.2em}.asc .lock .lh i{display:block;height:100%;background:#ff5a5a}
.asc .squad{position:absolute;left:.8em;top:38%;display:flex;flex-direction:column;gap:.3em;width:12em}
.asc .squad div{background:rgba(0,0,0,.45);padding:.2em .5em;font-size:.8em;font-weight:700;display:flex;gap:.45em;align-items:center}
.asc .squad div em{font-style:normal;font-family:Unbounded,sans-serif;width:1.3em;height:1.3em;display:grid;place-items:center;font-size:.8em;color:#111}
.asc .squad div span{flex:1}
.asc .squad div.dn{color:#ffb0b0}.asc .squad div.out{opacity:.4;text-decoration:line-through}
.asc .squad i{display:block;height:4px;background:rgba(255,255,255,.15);margin-top:.15em}.asc .squad i b{display:block;height:100%;background:#fff}
.asc .squad div.dn i b{background:#ff5a5a}
.asc .clashm{position:absolute;left:50%;top:30%;width:26em;margin-left:-13em;text-align:center;display:none}
.asc .clashm .cb{height:1.1em;border-radius:1em;overflow:hidden;background:#ff5a5a;border:2px solid #fff;box-shadow:0 0 20px rgba(255,255,255,.6);position:relative}
.asc .clashm .cb i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#5ef2ff,#fff)}
.asc .clashm b{font-family:Unbounded,sans-serif;font-size:1.6em;letter-spacing:.1em;text-shadow:0 0 12px #fff;display:block;margin-bottom:.3em}
.asc .clashm.p b{transform:scale(1.15)}
.asc .blind{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.asc .spd{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen}
.asc .downed{position:absolute;left:50%;top:62%;transform:translateX(-50%);width:16em;text-align:center;font-weight:800;color:#ff8a8a;display:none;text-shadow:0 2px 6px #000}
.asc .downed i{display:block;height:6px;background:rgba(0,0,0,.5);margin-top:.3em;overflow:hidden}.asc .downed i b{display:block;height:100%;background:#ff5a5a}
.asc .combo{position:absolute;right:16%;top:42%;font-family:Unbounded,sans-serif;font-weight:800;font-size:2em;color:#ffd84a;text-shadow:0 3px 10px #000;display:none;transform:rotate(-6deg)}
.asc .combo small{display:block;font-size:.4em;letter-spacing:.3em;color:#fff}
.asc .hv{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px;border-radius:50%;background:conic-gradient(#ffd84a var(--p),transparent 0);-webkit-mask:radial-gradient(circle,transparent 17px,#000 18px);mask:radial-gradient(circle,transparent 17px,#000 18px);display:none}
.asc .spec{position:absolute;left:50%;bottom:9em;transform:translateX(-50%);background:rgba(0,0,0,.6);padding:.35em 1em;font-weight:700;display:none}
.asc .daily{margin-top:1.2em;max-width:26em}.asc .daily h4{margin:0 0 .4em;font-size:.8em;letter-spacing:.15em;opacity:.8}
.asc .daily div{display:flex;justify-content:space-between;font-size:.82em;padding:.3em .5em;background:rgba(8,14,36,.6);margin-bottom:.25em;border-left:3px solid #ffd84a}
.asc .daily div.ok{border-left-color:#5effa8;opacity:.7}
.asc .lvb{height:5px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:.4em;max-width:26em}.asc .lvb i{display:block;height:100%;background:#ffd84a}
.asc .hc.lk{opacity:.4}.asc .hc small{display:block;font-size:.7em;color:#ffd84a}
/* inventory (PUBG-like) */
.asc .invx{display:grid;grid-template-columns:1fr 1.2fr 1.3fr;gap:1em;width:min(70em,96vw);height:min(40em,90vh)}
.asc .invx .col{background:rgba(6,10,24,.82);border:1px solid rgba(255,255,255,.12);padding:.8em;overflow:auto}
.asc .invx h3{margin:0 0 .6em;font-size:.8em;letter-spacing:.2em;opacity:.75}
.asc .vic{display:flex;gap:.6em;align-items:center;padding:.45em .5em;background:rgba(255,255,255,.05);margin-bottom:.35em;cursor:pointer;pointer-events:auto}
.asc .vic:hover{background:rgba(255,255,255,.14)}
.asc .vic b{display:block;font-size:.85em}.asc .vic small{opacity:.6;font-size:.72em}
/* map (PUBG-like grid) */
.asc .bigmap{position:relative;width:min(84vh,90vw);aspect-ratio:1;overflow:hidden;border:2px solid rgba(255,255,255,.4);cursor:crosshair}
.asc .bigmap canvas{width:100%;height:100%}
.asc .maplegend{position:absolute;right:1em;bottom:1em;background:rgba(0,0,0,.6);padding:.6em .8em;font-size:.8em;line-height:1.6;max-width:16em}
/* hero select (Valorant-like) */
.asc .sel{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:1.6em 2em;background:linear-gradient(180deg,rgba(4,8,22,.75),rgba(4,8,22,0) 30%,rgba(4,8,22,0) 60%,rgba(4,8,22,.9))}
.asc .sel h1{font-family:Unbounded,sans-serif;font-weight:800;letter-spacing:.12em;margin:0;font-size:2em}
.asc .sel .tmr{font-family:Unbounded,sans-serif;font-size:2.4em;font-weight:800;color:#ffd166;position:absolute;top:.6em;left:50%;transform:translateX(-50%)}
.asc .sel .grid{display:flex;gap:.5em;justify-content:center;flex-wrap:wrap}
.asc .sel .hx{width:4.8em;height:4.8em;cursor:pointer;clip-path:polygon(15% 0,100% 0,100% 85%,85% 100%,0 100%,0 15%);display:grid;place-items:center;font-family:Unbounded,sans-serif;font-weight:800;position:relative;border:0;color:#fff;font-size:.95em}
.asc .sel .hx.on{outline:3px solid #fff;outline-offset:-3px;filter:brightness(1.25)}
.asc .sel .hx.lk{filter:grayscale(1) brightness(.5);cursor:not-allowed}
.asc .sel .hx small{position:absolute;bottom:.25em;font-size:.45em;letter-spacing:.08em}
.asc .sel .who{font-family:Unbounded,sans-serif;font-size:2.6em;font-weight:800;letter-spacing:.06em}
.asc .sel .lockin{font:inherit;font-family:Unbounded,sans-serif;font-weight:800;font-size:1.2em;letter-spacing:.2em;padding:.7em 3em;border:2px solid #fff;background:#ff4655;color:#fff;cursor:pointer;clip-path:polygon(6% 0,100% 0,94% 100%,0 100%)}
.asc .sel .lockin.done{background:#1c2a3a;cursor:default}
/* overlays and menus */
.asc .scr{position:absolute;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 30% 20%,rgba(30,50,120,.55),rgba(5,8,24,.92));overflow:auto}
.asc .scr.clear{background:rgba(4,8,22,.55)}
.asc .scr.homebg{background:linear-gradient(90deg,rgba(4,8,22,.88) 0%,rgba(4,8,22,.55) 38%,rgba(4,8,22,0) 62%)}
.asc .pnl{background:linear-gradient(180deg,rgba(16,26,64,.96),rgba(8,14,36,.96));border:1px solid rgba(255,209,102,.3);border-radius:18px;padding:1.4em 1.6em;box-shadow:0 30px 80px rgba(0,0,0,.6);max-width:min(64em,94vw);width:100%;max-height:94vh;overflow:auto}
.asc .pnl h2{font-family:Unbounded,sans-serif;font-weight:800;margin:0 0 .6em;letter-spacing:.04em}
.asc .btn{font:inherit;font-weight:800;cursor:pointer;border:0;color:#111;background:linear-gradient(180deg,#ffe08a,#ffb52e);padding:.75em 1.4em;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);letter-spacing:.04em;text-transform:uppercase;font-size:.95em}
.asc .btn:hover{filter:brightness(1.1)}
.asc .btn.alt{background:linear-gradient(180deg,#2a3d80,#1a2754);color:#eef3ff}
.asc .btn.sm{padding:.45em .9em;font-size:.8em}
.asc .row{display:flex;gap:.7em;flex-wrap:wrap;align-items:center}
.asc .home{width:100%;height:100%;display:grid;grid-template-columns:minmax(18em,30em) 1fr;gap:2em;padding:2em 3em;box-sizing:border-box;align-items:center}
.asc .logo{font-family:Unbounded,sans-serif;font-weight:800;font-size:3.2em;line-height:.95;letter-spacing:.02em;background:linear-gradient(180deg,#fff,#ffd166 60%,#ff9a2e);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 20px rgba(255,170,50,.35))}
.asc .tag{opacity:.85;margin:.6em 0 1.6em;line-height:1.5}
.asc .menu{display:flex;flex-direction:column;gap:.7em;align-items:flex-start}
.asc .menu .btn{min-width:16em;text-align:left}
.asc .card{background:rgba(8,14,36,.75);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:.8em 1em}
.asc .stat{display:flex;gap:1.4em;flex-wrap:wrap;margin-top:1.2em}
.asc .stat div{font-size:.8em;opacity:.8}.asc .stat b{display:block;font-family:Unbounded,sans-serif;font-size:1.5em;opacity:1;color:#ffd166}
.asc .heroes{display:grid;grid-template-columns:repeat(auto-fill,minmax(7.5em,1fr));gap:.6em}
.asc .hc{cursor:pointer;border-radius:12px;padding:.6em;border:2px solid transparent;background:rgba(255,255,255,.05);text-align:center;font-weight:700}
.asc .hc.sel{border-color:#ffd166;background:rgba(255,209,102,.12)}
.asc .hc i{display:block;height:2.4em;border-radius:8px;margin-bottom:.4em}
.asc .inv{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.5em,1fr));gap:.55em;margin:.8em 0}
.asc .pc{cursor:pointer;border-radius:10px;padding:.55em .6em;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.08);display:flex;gap:.5em;align-items:center;position:relative}
.asc .pc:hover{border-color:rgba(255,255,255,.3)}.asc .pc.sel{border-color:#5ef2ff;background:rgba(94,242,255,.12)}.asc .pc.eq{opacity:.55}
.asc .pc.ult{background:rgba(255,209,102,.08)}
.asc .pc b{display:block;font-size:.85em}.asc .pc small{opacity:.65;font-size:.7em;display:block;line-height:1.25}
.asc .pc .lvl{position:absolute;top:.3em;right:.45em;color:#ffd166;font-size:.65em;letter-spacing:.1em}
.asc .loadout{display:flex;gap:.6em;align-items:center;flex-wrap:wrap}
.asc .ls{width:5.5em;height:5.5em;border-radius:12px;border:2px dashed rgba(255,255,255,.3);display:grid;place-items:center;cursor:pointer;text-align:center;font-size:.75em;position:relative;background:rgba(0,0,0,.25)}
.asc .ls.ult{border-radius:50%;border-color:rgba(255,209,102,.6)}
.asc .ls.full{border-style:solid}.asc .ls.target{box-shadow:0 0 0 3px #5ef2ff}
.asc .ls .k{position:absolute;top:.2em;left:.4em;font-weight:800;opacity:.7}
.asc .set{display:grid;grid-template-columns:12em 1fr;gap:.7em 1em;align-items:center}
.asc .seg{display:inline-flex;gap:.3em;flex-wrap:wrap}
.asc .seg button{font:inherit;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#eef3ff;padding:.35em .8em;border-radius:6px}
.asc .seg button.on{background:#ffd166;color:#111;border-color:#ffd166}
.asc input[type=range]{width:14em}
.asc input[type=text]{font:inherit;padding:.5em .8em;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff}
.asc .bigmap{position:relative;width:min(80vh,90vw);aspect-ratio:1;border-radius:16px;overflow:hidden;border:2px solid rgba(255,209,102,.5)}
.asc .bigmap canvas{width:100%;height:100%}
.asc .place{font-family:Unbounded,sans-serif;font-weight:800;font-size:4em;background:linear-gradient(180deg,#fff,#ffd166);-webkit-background-clip:text;background-clip:text;color:transparent}
.asc .lobbyl{display:flex;flex-wrap:wrap;gap:.35em;margin:.8em 0}.asc .lobbyl span{background:rgba(255,255,255,.08);padding:.25em .6em;border-radius:6px;font-size:.85em}
.asc .note{opacity:.7;font-size:.85em;line-height:1.5}
.asc .keys{display:grid;grid-template-columns:auto 1fr;gap:.35em 1em;font-size:.85em}.asc .keys kbd{background:rgba(255,255,255,.12);border-radius:4px;padding:0 .45em;font-weight:800}
.asc.short .home{grid-template-columns:1fr;padding:1em}.asc.short .logo{font-size:2.2em}
/* touch */
.asc .tc{position:absolute;inset:0;pointer-events:none;display:none}
.asc.touch .tc{display:block}
.asc .stick{position:absolute;left:1.2em;bottom:1.2em;width:9em;height:9em;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.2);pointer-events:auto}
.asc .stick i{position:absolute;left:50%;top:50%;width:3.6em;height:3.6em;margin:-1.8em;border-radius:50%;background:rgba(255,255,255,.35)}
.asc .tb{position:absolute;width:3.8em;height:3.8em;border-radius:50%;background:rgba(10,20,50,.6);border:2px solid rgba(255,255,255,.3);pointer-events:auto;display:grid;place-items:center;font-weight:800;font-size:.85em;color:#fff}
.asc.touch .vit{bottom:11em}
.asc.touch .slots{bottom:.6em;transform:translateX(-62%) scale(.85)}
.asc.touch .squad{top:30%}

.asc.touch .mm{right:auto;left:.6em;top:.6em;bottom:auto;width:9.5em;height:9.5em}
.asc.touch .mmzone{display:none}
.asc.touch .card2{bottom:auto;top:10.6em;left:.6em;transform:scale(.8);transform-origin:left top}
.asc.touch .compass{width:46vw}
.asc.touch .squad{top:20em}
.asc.touch .toasts{left:50%;transform:translateX(-50%);top:7em;bottom:auto;align-items:center;font-size:.85em}
.asc.touch .toasts .toast:nth-child(n+3){display:none}
.asc.touch .center{top:30%}
.asc.touch .killban{bottom:auto;top:44%;transform:translateX(-50%) scale(.8)}
.asc.touch .vit{width:min(26em,44vw)}
`;

export class HUD {
  constructor(game) {
    this.g = game;
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="vign"></div><div class="stormtint"></div>
      <div class="marks"></div>
      <div class="xh"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="hm"><i></i><i></i><i></i><i></i></div>
      <div class="ddir"></div>
      <div class="compass"><canvas width="880" height="52"></canvas></div><div class="bearing" data-k="bear">0</div>
      <div class="zonebar"><span class="ic"></span><span data-k="stl">STORM</span><b data-k="storm">–</b><span data-k="zdist"></span></div>
      <div class="redwarn">⚠ BOMBARDMENT ZONE — GET OUT</div>
      <div class="counts"><div class="alive"><b data-k="alive">50</b><span data-k="alivel">ALIVE</span></div><div data-k="teamsBox" style="display:none"><b data-k="teams">0</b><span>TEAMS</span></div><div><b data-k="kills">0</b><span>KILLED</span></div></div>
      <div class="feed"></div>
      <div class="mmzone"><div class="tr"><i></i><u></u></div><span data-k="mmt"></span></div>
      <div class="mm"><canvas width="300" height="300"></canvas><div class="lbl" data-k="zone"></div></div>
      <div class="card2"><div class="portrait" data-k="port"></div><div class="ident"><span class="nm" data-k="name"></span><span class="fm" data-k="form">BASE FORM</span><span class="pl">POWER LV <b data-k="pl">0</b></span><div class="items"></div></div></div>
      <div class="vit">
        <div class="bar ab" data-k="abBar" style="display:none"><i></i></div>
        <div class="bar sh"><i></i></div>
        <div class="bar hp"><b></b><i></i><span></span></div>
        <div class="bar ki"><i></i><span></span></div>
        <div class="bar fm"><i></i></div>
      </div>
      <div class="lock"><div class="li"></div></div>
      <div class="squad"></div>
      <div class="clashm"><b>PUSH!</b><div class="cb"><i></i></div></div>
      <div class="downed">DOWNED<i><b></b></i></div>
      <div class="combo"></div>
      <div class="hv"></div>
      <div class="killban"><div class="ring"><b></b></div><div class="sig"></div><div class="nm"></div></div>
      <div class="spec"></div>
      <div class="blind"></div>
      <canvas class="spd"></canvas>
      <div class="slots"></div>
      <div class="prompt" style="display:none"></div>
      <div class="using" style="display:none"></div>
      <div class="center"></div>
      <div class="toasts"></div>
      <div class="dmgs"></div>
      <div class="tc"></div>`;
    game.root.appendChild(el);
    this.el = el;
    this.q = (k) => el.querySelector(`[data-k="${k}"]`);
    this.mm = el.querySelector('.mm canvas');
    this.mmCtx = this.mm.getContext('2d');
    this.cmp = el.querySelector('.compass canvas');
    this.cmpCtx = this.cmp.getContext('2d');
    this.feedEl = el.querySelector('.feed');
    this.slotsEl = el.querySelector('.slots');
    this.promptEl = el.querySelector('.prompt');
    this.centerEl = el.querySelector('.center');
    this.toastsEl = el.querySelector('.toasts');
    this.dmgEl = el.querySelector('.dmgs');
    this.usingEl = el.querySelector('.using');
    this.marksEl = el.querySelector('.marks');
    this.screen = document.createElement('div');
    game.root.appendChild(this.screen);
    this.dmgs = [];
    this.centerT = 0;
    this.slotSig = '';
    this.kb = { t: 0, n: 0 };
    this.applyCrosshair(game.S);
  }

  visible(v) { this.el.style.display = v ? '' : 'none'; }
  applyCrosshair(S) {
    const x = this.el.querySelector('.xh');
    x.className = `xh ${S.xhStyle || 'cross'}`;
    x.style.setProperty('--xc', S.xhColor || '#7dff8a');
    x.style.setProperty('--xs', String(S.xhSize || 1));
  }

  center(big, sub = '', t = 2.5, color = '#fff') {
    this.centerEl.innerHTML = `<div class="big" style="color:${color}">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.centerT = t;
  }
  feed(html, mine, mate) {
    const d = document.createElement('div');
    if (mine) d.className = 'me'; else if (mate) d.className = 'mate';
    d.innerHTML = html;
    this.feedEl.prepend(d);
    while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }
  toast(html, color = '#ffd166') {
    const d = document.createElement('div');
    d.className = 'toast'; d.style.setProperty('--c', color);
    d.innerHTML = html;
    this.toastsEl.prepend(d);
    while (this.toastsEl.children.length > 5) this.toastsEl.lastChild.remove();
    setTimeout(() => d.remove(), 3500);
  }
  damageNumber(p, amt, kind) {
    const d = document.createElement('div');
    d.className = `dmg ${kind || ''}`;
    d.textContent = amt;
    this.dmgEl.appendChild(d);
    this.dmgs.push({ el: d, p: [p[0] + (Math.random() - 0.5) * 0.6, p[1], p[2] + (Math.random() - 0.5) * 0.6], t: 0 });
    if (this.dmgs.length > 30) { this.dmgs[0].el.remove(); this.dmgs.shift(); }
  }
  // Valorant-style elimination banner: a ring with the kill count and a row of sigils
  killBanner(name, n) {
    const k = this.el.querySelector('.killban');
    k.style.display = 'block';
    k.querySelector('.ring').style.animation = 'none'; void k.offsetWidth; k.querySelector('.ring').style.animation = '';
    k.querySelector('b').textContent = n;
    k.querySelector('.sig').innerHTML = '<i></i>'.repeat(Math.min(5, n));
    k.querySelector('.nm').textContent = `ELIMINATED ${name}`.toUpperCase();
    this.kb.t = 2.6;
  }
  // a red arc pointing to where the hit came from (angle relative to the camera, 0 = in front)
  damageDir(ang) {
    const d = this.el.querySelector('.ddir');
    const i = document.createElement('i');
    i.style.transform = `rotate(${ang}rad)`;
    d.appendChild(i);
    requestAnimationFrame(() => requestAnimationFrame(() => { i.style.opacity = '0'; }));
    setTimeout(() => i.remove(), 1000);
    while (d.children.length > 6) d.firstChild.remove();
  }
  // anime speed lines: streaks rushing in from the edges of the screen
  speedLines(k, dark = false) {
    const c = this.spd || (this.spd = this.el.querySelector('.spd'));
    if (!c) return;
    if (k <= 0.01) { if (this.spdOn) { c.getContext('2d').clearRect(0, 0, c.width, c.height); this.spdOn = false; } return; }
    this.spdOn = true;
    const w = (c.width = Math.round(c.clientWidth / 2)); const h = (c.height = Math.round(c.clientHeight / 2));
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    c.style.mixBlendMode = dark ? 'multiply' : 'screen';
    const cx = w / 2; const cy = h / 2; const R = Math.hypot(cx, cy);
    const n = Math.round(30 + k * 70);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.45 + Math.random() * 0.35 * (1.2 - k));
      const wdt = 0.6 + Math.random() * 2.8 * k;
      const ca = Math.cos(a); const sa = Math.sin(a);
      const pa = 0.012 * wdt;
      g.fillStyle = dark ? `rgba(0,0,0,${0.35 + Math.random() * 0.4})` : `rgba(255,255,255,${(0.25 + Math.random() * 0.5) * k})`;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - pa) * R * 1.05, cy + Math.sin(a - pa) * R * 1.05);
      g.lineTo(cx + ca * r0, cy + sa * r0);
      g.lineTo(cx + Math.cos(a + pa) * R * 1.05, cy + Math.sin(a + pa) * R * 1.05);
      g.fill();
    }
  }
  hitMarker(big) { const x = this.el.querySelector('.hm'); x.classList.add('on'); x.classList.toggle('big', !!big); clearTimeout(this.hmT); this.hmT = setTimeout(() => x.classList.remove('on'), 90); }

  // PUBG-style compass: degrees and headings scroll past; markers sit at their bearings
  drawCompass(yaw, marks) {
    const c = this.cmp; const g = this.cmpCtx; const W = c.width; const H = c.height;
    g.clearRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.15, 'rgba(0,0,0,.4)'); grd.addColorStop(0.85, 'rgba(0,0,0,.4)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // heading in degrees: 0 = north (-z), clockwise
    const head = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const span = 150; const px = W / span;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    g.textAlign = 'center';
    for (let d = Math.floor((head - span / 2) / 5) * 5; d <= head + span / 2; d += 5) {
      const x = W / 2 + (d - head) * px;
      const dd = ((d % 360) + 360) % 360;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      g.globalAlpha = Math.max(0, Math.min(1, fade * 1.6));
      if (names[dd] !== undefined) { g.fillStyle = dd === 0 ? '#ffd166' : '#fff'; g.font = '800 22px Manrope, sans-serif'; g.fillText(names[dd], x, 24); g.fillRect(x - 1, 32, 2, 12); }
      else if (dd % 15 === 0) { g.fillStyle = '#fff'; g.font = '700 15px Manrope, sans-serif'; g.fillText(String(dd), x, 22); g.fillRect(x - 1, 34, 2, 10); }
      else { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x - 0.5, 38, 1, 6); }
    }
    g.globalAlpha = 1;
    // markers
    (marks || []).forEach((m) => {
      let d = m.bearing - head; d = ((d + 540) % 360) - 180;
      const x = W / 2 + Math.max(-span / 2, Math.min(span / 2, d)) * px;
      g.fillStyle = m.color;
      g.strokeStyle = '#111'; g.lineWidth = 2;
      g.beginPath();
      if (m.shape === 'circle') g.arc(x, 44, 6, 0, 7); else { g.moveTo(x, 37); g.lineTo(x + 6, 44); g.lineTo(x, 51); g.lineTo(x - 6, 44); g.closePath(); }
      g.fill(); g.stroke();
    });
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(W / 2 - 6, H); g.lineTo(W / 2 + 6, H); g.lineTo(W / 2, H - 8); g.fill();
    this.q('bear').textContent = Math.round(head) % 360;
  }

  // per-frame update
  update(dt, st) {
    const g = this.g;
    this.centerT -= dt;
    if (this.centerT <= 0 && this.centerEl.innerHTML) this.centerEl.innerHTML = '';
    this.kb.t -= dt;
    if (this.kb.t <= 0) this.el.querySelector('.killban').style.display = 'none';
    const cam = g.camera; const w = g.root.clientWidth; const h = g.root.clientHeight;
    for (let i = this.dmgs.length - 1; i >= 0; i--) {
      const d = this.dmgs[i]; d.t += dt; d.p[1] += dt * 1.6;
      const v = g.v3.set(d.p[0], d.p[1], d.p[2]).project(cam);
      if (d.t > 1.1 || v.z > 1) { d.el.remove(); this.dmgs.splice(i, 1); continue; }
      d.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`; d.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`; d.el.style.opacity = String(Math.min(1, (1.1 - d.t) * 3));
    }
    if (!st) return;
    this.q('alive').textContent = st.alive;
    const sq = st.mode && st.mode !== 'solo';
    this.q('teamsBox').style.display = sq ? '' : 'none';
    if (sq) this.q('teams').textContent = st.teams ?? '?';
    this.q('kills').textContent = st.kills;
    this.q('storm').textContent = st.stormText; this.q('stl').textContent = st.stormLabel;
    this.q('zdist').textContent = st.zoneDist > 0 ? `· ${Math.round(st.zoneDist)}m to safety` : '';
    this.el.querySelector('.zonebar').classList.toggle('warn', !!st.inStorm);
    this.el.querySelector('.redwarn').style.display = st.inRed ? 'block' : 'none';
    this.q('zone').textContent = st.zoneName;
    this.q('mmt').textContent = st.stormText;
    const tr = this.el.querySelector('.mmzone .tr');
    tr.querySelector('i').style.width = `${(st.zoneProg || 0) * 100}%`;
    tr.querySelector('u').style.left = `calc(${(st.meProg || 0) * 100}% - .45em)`;
    this.q('name').textContent = st.name;
    const port = this.q('port');
    const psig = `${st.heroName}|${st.heroColor}|${st.form}`;
    if (port.dataset.sig !== psig) { port.dataset.sig = psig; port.style.background = `linear-gradient(135deg,${st.heroColor} 0 55%,${st.heroColor2} 55%)`; port.innerHTML = `${(st.heroName || '?')[0]}<small>${(st.heroName || '').toUpperCase()}</small>`; }
    // vitals
    const hpEl = this.el.querySelector('.bar.hp'); const shEl = this.el.querySelector('.bar.sh');
    hpEl.querySelector('i').style.width = `${Math.max(0, st.hp)}%`; hpEl.querySelector('b').style.width = `${Math.max(0, st.hp)}%`;
    hpEl.querySelector('span').textContent = Math.ceil(Math.max(0, st.hp));
    hpEl.classList.toggle('low', st.hp < 30);
    shEl.querySelector('i').style.width = `${st.shield}%`;
    const ab = this.q('abBar'); ab.style.display = st.absorb > 0 ? '' : 'none'; if (st.absorb > 0) ab.querySelector('i').style.width = `${Math.min(100, st.absorb / 1.2)}%`;
    const kiEl = this.el.querySelector('.bar.ki');
    kiEl.querySelector('i').style.width = `${(st.ki / st.kiMax) * 100}%`; kiEl.querySelector('span').textContent = `KI ${Math.floor(st.ki)}`;
    kiEl.classList.toggle('chg', !!st.charging);
    const fmEl = this.el.querySelector('.bar.fm');
    fmEl.querySelector('i').style.width = `${st.form >= 2 ? 100 : st.formMeter}%`; fmEl.classList.toggle('full', st.formMeter >= 100 && st.form < 2);
    this.q('form').textContent = st.form ? FORMS[st.form].name.toUpperCase() : st.formMeter >= 100 ? 'READY TO ASCEND [G]' : 'BASE FORM';
    this.q('form').style.color = st.form ? FORMS[st.form].color : st.formMeter >= 100 ? '#ffe86a' : '';
    this.q('pl').textContent = st.pl.toLocaleString();
    this.el.querySelector('.vign').style.boxShadow = `inset 0 0 160px rgba(200,0,30,${st.hurt.toFixed(2)})`;
    this.el.querySelector('.stormtint').style.opacity = st.inStorm ? '1' : '0';
    // compass
    this.drawCompass(st.yaw, st.compass);
    // world markers
    const mk = (st.marks || []).map((m) => {
      const v = g.v3.set(m.p[0], m.p[1] + 2.5, m.p[2]).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.9) return '';
      const x = (v.x * 0.5 + 0.5) * w; const y = Math.max(60, (-v.y * 0.5 + 0.5) * h);
      return `<div class="mk ${m.kind || ''}" style="left:${x}px;top:${y}px;--c:${m.color}"><i></i>${m.label ? `${esc(m.label)} · ` : ''}${Math.round(m.dist)}m</div>`;
    }).join('');
    if (mk !== this.mkSig) { this.marksEl.innerHTML = mk; this.mkSig = mk; }
    // lock-on reticle
    const lk = this.el.querySelector('.lock');
    if (st.lock && st.lock.on) {
      lk.style.display = 'block'; lk.style.left = `${(st.lock.x * 0.5 + 0.5) * w}px`; lk.style.top = `${(-st.lock.y * 0.5 + 0.5) * h}px`;
      const li = `${esc(st.lock.name)} · ${st.lock.dist}m<small>POWER LV ${st.lock.pl.toLocaleString()}</small><div class="lh"><i style="width:${Math.max(0, st.lock.hp)}%"></i></div>`;
      const le = lk.querySelector('.li'); if (le.innerHTML !== li) le.innerHTML = li;
    } else lk.style.display = 'none';
    // squad (PUBG-style numbered list)
    const cols = ['#ffd84a', '#5ef2ff', '#ff7ae5', '#7dff8a'];
    const sqh = st.team ? [{ name: st.name, hp: st.hp, alive: !st.dead, downed: st.downed, bleed: st.bleed, me: true }, ...st.team].map((t, i) => `<div class="${!t.alive ? 'out' : t.downed ? 'dn' : ''}"><em style="background:${cols[i % 4]}">${i + 1}</em><span>${esc(t.name)}${t.downed ? ' · DOWN' : ''}<i><b style="width:${t.downed ? t.bleed : Math.max(0, t.hp)}%"></b></i></span></div>`).join('') : '';
    if (sqh !== this.sqSig) { this.el.querySelector('.squad').innerHTML = sqh; this.sqSig = sqh; }
    // beam clash meter
    const cm = this.el.querySelector('.clashm');
    if (st.clash) { cm.style.display = 'block'; cm.querySelector('i').style.width = `${st.clash.f * 100}%`; cm.classList.toggle('p', st.clash.pulse > 0); } else cm.style.display = 'none';
    const dn = this.el.querySelector('.downed');
    dn.style.display = st.downed ? 'block' : 'none'; if (st.downed) dn.querySelector('b').style.width = `${Math.max(0, st.bleed)}%`;
    this.el.querySelector('.blind').style.opacity = String(Math.min(1, st.blind * 0.6));
    const co = this.el.querySelector('.combo');
    if (st.combo) { co.style.display = 'block'; const t = `${st.combo} HITS<small>COMBO</small>`; if (co.innerHTML !== t) co.innerHTML = t; } else co.style.display = 'none';
    const hv = this.el.querySelector('.hv');
    hv.style.display = st.heavy > 0.25 ? 'block' : 'none'; hv.style.setProperty('--p', `${st.heavy * 100}%`);
    const sp = this.el.querySelector('.spec');
    sp.style.display = st.spectating ? 'block' : 'none'; if (st.spectating) sp.textContent = `SPECTATING ${st.spectating}`;
    // items
    const its = `<div class="it">${icon('medkit', '#5cff8a', 16)}${st.items.medkit}<small>4</small></div><div class="it">${icon('cell', '#4ad8ff', 16)}${st.items.cell}<small>5</small></div>`;
    if (its !== this.itSig) { this.el.querySelector('.items').innerHTML = its; this.itSig = its; }
    // ability bar
    const sig = JSON.stringify([st.slots, st.ult, st.levels, g.isTouch]);
    if (sig !== this.slotSig) {
      this.slotSig = sig;
      const keys = g.isTouch ? ['', '', '', ''] : ['Q', 'E', 'R', 'X'];
      const slot = (id, i) => {
        const P = id && POWER[id];
        const isU = i === 3;
        return `<div class="slot${isU ? ' ult' : ''}${P ? '' : ' empty'}" data-slot="${i}">${isU ? '<div class="ultfill"></div>' : ''}${P ? icon(id, P.color, isU ? 30 : 28) : `<span style="opacity:.5;font-size:.65em">${isU ? 'ULT' : '—'}</span>`}<div class="cd"></div><div class="cdt"></div>${keys[i] ? `<span class="key">${keys[i]}</span>` : ''}${P && !isU ? `<span class="lv">${'★'.repeat(st.levels[id] || 1)}</span>` : ''}${P && P.ki ? `<span class="kc">${P.ki}</span>` : ''}${isU ? '<div class="pips">' + '<i></i>'.repeat(8) + '</div>' : ''}</div>`;
      };
      this.slotsEl.innerHTML = `<div class="slot melee">${icon('melee', '#fff', 22)}${g.isTouch ? '' : '<span class="key">LMB</span>'}</div>${st.slots.map(slot).join('')}${slot(st.ult, 3)}`;
    }
    this.slotsEl.querySelectorAll('.slot[data-slot]').forEach((s) => {
      const i = Number(s.dataset.slot);
      const id = i === 3 ? st.ult : st.slots[i];
      const cd = s.querySelector('.cd'); const cdt = s.querySelector('.cdt');
      if (i === 3) {
        const f = st.ultCharge / COMBAT.ultCharge;
        const pips = Math.floor(f * 8 + 1e-6);
        s.querySelectorAll('.pips i').forEach((p, k) => p.classList.toggle('on', k < pips));
        if (!id) return;
        s.querySelector('.ultfill').style.height = `${f * 100}%`;
        s.classList.toggle('ready', f >= 1);
        cdt.textContent = '';
        cd.style.setProperty('--p', '0%');
        return;
      }
      if (!id) return;
      s.classList.toggle('noki', st.ki < (POWER[id].ki || 0));
      const left = st.cd[id] || 0; const tot = st.cdMax[id] || 1;
      cd.style.setProperty('--p', `${(left / tot) * 100}%`);
      cdt.textContent = left > 0.05 ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
    });
    if (st.prompt) { this.promptEl.style.display = ''; if (this.promptEl.innerHTML !== st.prompt) this.promptEl.innerHTML = st.prompt; } else this.promptEl.style.display = 'none';
    if (st.using) { this.usingEl.style.display = ''; this.usingEl.innerHTML = `${esc(st.using.label)}<div class="pb"><i style="width:${(st.using.f * 100).toFixed(0)}%"></i></div>`; } else this.usingEl.style.display = 'none';
  }

  // minimap / big map: island picture, a PUBG-style grid, the storm and the next safe zone, a line to
  // safety, the dropship path, the bombardment zone, airdrops, markers and teammates
  drawMap(ctx, size, view) {
    const g = this.g;
    const img = g.mapImage;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d3a52'; ctx.fillRect(0, 0, size, size);
    const toMap = (x, z) => [((x - view.cx) / view.span + 0.5) * size, ((z - view.cz) / view.span + 0.5) * size];
    const sc = size / view.span;
    if (img) { const s = 1400 * sc; const [ox, oz] = toMap(-700, -700); ctx.drawImage(img, ox, oz, s, s); }
    // grid: 100 m squares, letters across and numbers down on the big map
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    for (let k = -700; k <= 700; k += 100) {
      const [x0, z0] = toMap(k, -700); const [x1, z1] = toMap(k, 700); ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z1); ctx.stroke();
      const [a0, b0] = toMap(-700, k); const [a1, b1] = toMap(700, k); ctx.beginPath(); ctx.moveTo(a0, b0); ctx.lineTo(a1, b1); ctx.stroke();
    }
    if (view.names) {
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `700 ${Math.round(size / 60)}px Manrope, sans-serif`; ctx.textAlign = 'center';
      for (let k = 0; k < 14; k++) { const [x] = toMap(-650 + k * 100, 0); ctx.fillText(String.fromCharCode(65 + k), x, 14); const [, z] = toMap(0, -650 + k * 100); ctx.fillText(String(k + 1), 10, z + 4); }
    }
    const st = g.storm;
    if (st) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, size, size);
      const [cx, cz] = toMap(st.c[0], st.c[1]); const r = st.r * sc;
      ctx.arc(cx, cz, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(120,40,220,.4)'; ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = '#c99bff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cz, Math.max(0, r), 0, Math.PI * 2); ctx.stroke();
      if (st.next) {
        const [nx, nz] = toMap(st.next.c[0], st.next.c[1]);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nx, nz, st.next.r * sc, 0, Math.PI * 2); ctx.stroke();
        // a line from me to the nearest edge of the safe zone when I'm outside it
        const me = g.me;
        if (me && me.alive) {
          const d = Math.hypot(me.p[0] - st.next.c[0], me.p[2] - st.next.c[1]);
          if (d > st.next.r) {
            const k = st.next.r / d;
            const [ex, ez] = toMap(st.next.c[0] + (me.p[0] - st.next.c[0]) * k, st.next.c[1] + (me.p[2] - st.next.c[1]) * k);
            const [mx, mz] = toMap(me.p[0], me.p[2]);
            ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(mx, mz); ctx.lineTo(ex, ez); ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }
    }
    // bombardment zone
    if (g.red) {
      const [rx, rz] = toMap(g.red.c[0], g.red.c[1]);
      ctx.fillStyle = 'rgba(255,40,40,.28)'; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, rz, g.red.r * sc, 0, 7); ctx.fill(); ctx.stroke();
    }
    // dropship path
    if (g.shipPath && g.phase === 'ship') {
      const [ax, az] = toMap(g.shipPath.a[0], g.shipPath.a[2]); const [bx, bz] = toMap(g.shipPath.b[0], g.shipPath.b[2]);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke(); ctx.setLineDash([]);
      const sp = g.shipPos || (g.match && g.match.ship.p);
      if (sp) { const [x, z] = toMap(sp[0], sp[2]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, z, 5, 0, 7); ctx.fill(); }
    }
    if (view.names) {
      ctx.font = `700 ${Math.round(size / 52)}px Manrope, sans-serif`; ctx.textAlign = 'center';
      (g.pois || []).forEach((p) => { const [x, z] = toMap(p.x, p.z); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(p.name, x + 1, z + 1); ctx.fillStyle = '#fff'; ctx.fillText(p.name, x, z); });
    }
    // airdrops
    (g.drops || []).forEach((d) => { const [x, z] = toMap(d.p[0], d.p[2]); ctx.fillStyle = '#ff4a4a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fillRect(x - 5, z - 5, 10, 10); ctx.strokeRect(x - 5, z - 5, 10, 10); });
    // markers
    (g.marks ? [...g.marks.values()] : []).forEach((m) => {
      const [x, z] = toMap(m.p[0], m.p[2]);
      ctx.fillStyle = m.color; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, z - 8); ctx.lineTo(x + 6, z); ctx.lineTo(x, z + 8); ctx.lineTo(x - 6, z); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    // teammates
    const cols = ['#5ef2ff', '#ff7ae5', '#7dff8a'];
    let ti = 0;
    for (const a of g.avatars.values()) {
      if (!a.mate || !a.alive) continue;
      const [x, z] = toMap(a.p[0], a.p[2]);
      ctx.fillStyle = a.flags & 128 ? '#ff5a5a' : cols[ti++ % 3]; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, z, 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    // me, with a view cone
    const me = g.me;
    if (me) {
      const [mx, mz] = toMap(me.p[0], me.p[2]);
      ctx.save(); ctx.translate(mx, mz); ctx.rotate(-g.camYaw);
      const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 40); cone.addColorStop(0, 'rgba(255,255,255,.35)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    (g.pings || []).forEach((p) => { const [x, z] = toMap(p.p[0], p.p[2]); ctx.fillStyle = `rgba(255,70,85,${Math.max(0, p.t)})`; ctx.beginPath(); ctx.arc(x, z, 4, 0, 7); ctx.fill(); });
  }

  // ── screens ──
  show(html, clear = false) {
    this.screen.className = `scr${clear === 'home' ? ' homebg' : clear ? ' clear' : ''}`;
    this.screen.innerHTML = html;
    this.screen.style.display = html ? '' : 'none';
  }
  hide() { this.screen.innerHTML = ''; this.screen.style.display = 'none'; }


  homeScreen(save, online) {
    const S = save.stats;
    const H = HERO[save.settings.hero] || HEROES[0];
    const lv = level(save.xp); const x0 = (lv - 1) ** 2 * 120; const x1 = lv ** 2 * 120;
    const D = dailyState(save);
    const mode = save.settings.mode || 'solo';
    const daily = D.ids.map((id) => { const C = CHALLENGES.find((c) => c.id === id); if (!C) return ''; const p = Math.min(C.goal, Math.floor(D.prog[id] || 0)); return `<div class="${D.done[id] ? 'ok' : ''}"><span>${D.done[id] ? '✓ ' : ''}${esc(C.text)}</span><span>${p}/${C.goal} · +${C.xp} XP</span></div>`; }).join('');
    return `<div class="home">
      <div>
        <div class="logo">ASCEN<br>DANTS</div>
        <div class="tag">A 50-hero battle royale of ki warriors on a wild island. Drop from the sky, fly anywhere, crack open crates for techniques, charge your ki, fire beams that clash in the sky, ascend to new forms — and be the last one standing.</div>
        <div class="row" style="margin-bottom:.8em"><span class="seg">${Object.entries(MODES).map(([k, m]) => `<button class="${k === mode ? 'on' : ''}" data-act="setmode" data-arg="${k}">${m.name}</button>`).join('')}</span></div>
        <div class="menu">
          <button class="btn" data-act="play">▶ Play ${MODES[mode].name.toLowerCase()} · vs bots</button>
          <button class="btn alt" data-act="online">Online with friends</button>
          <button class="btn alt" data-act="hero">Hero: ${esc(H.name)}</button>
          <button class="btn alt" data-act="powers">Techniques guide</button>
          <button class="btn alt" data-act="settings">Settings</button>
        </div>
        <div class="stat"><div><b>${lv}</b>Level</div><div><b>${S.wins}</b>Victories</div><div><b>${S.kills}</b>Eliminations</div><div><b>${S.matches ? `#${S.best}` : '–'}</b>Best place</div><div><b>${S.matches}</b>Matches</div></div>
        <div class="lvb"><i style="width:${((save.xp - x0) / (x1 - x0)) * 100}%"></i></div>
        <div class="daily"><h4>TODAY'S CHALLENGES</h4>${daily}</div>
        ${online ? `<p class="note">${esc(online)}</p>` : ''}
      </div>
      <div></div>
    </div>`;
  }

  heroScreen(cur, skin, lv = 1, aura = 'hero') {
    const sw = ['#e0b896', '#c99a74', '#8d5f3e', '#f1cfb0', '#6b4630'];
    return `<div class="pnl" style="max-width:46em;margin-right:auto;margin-left:4vw"><h2>CHOOSE YOUR HERO</h2>
      <p class="note">Heroes are looks — your techniques come from what you find and who you defeat. Level up to unlock more heroes and aura colours.</p>
      <div class="heroes">${HEROES.map((h) => { const locked = h.unlock > lv; return `<div class="hc${h.id === cur ? ' sel' : ''}${locked ? ' lk' : ''}" data-act="sethero" data-arg="${h.id}"><i style="background:linear-gradient(135deg,${h.suit} 0 45%,${h.suit2} 45% 70%,${h.glow} 70%)"></i>${esc(h.name)}${locked ? `<small>🔒 LEVEL ${h.unlock}</small>` : ''}</div>`; }).join('')}</div>
      <h3 style="margin:1em 0 .4em;font-size:.9em;opacity:.8">SKIN TONE</h3>
      <div class="row">${sw.map((c, i) => `<button class="hc${i === skin ? ' sel' : ''}" style="width:2.6em;height:2.6em;background:${c};padding:0" data-act="setskin" data-arg="${i}"></button>`).join('')}</div>
      <h3 style="margin:1em 0 .4em;font-size:.9em;opacity:.8">AURA</h3>
      <div class="heroes">${AURAS.map((x) => { const locked = x.unlock > lv; const c = x.color || (HERO[cur] || HEROES[0]).glow; return `<div class="hc${x.id === aura ? ' sel' : ''}${locked ? ' lk' : ''}" data-act="setaura" data-arg="${x.id}"><i style="background:radial-gradient(circle,#fff 0 15%,${c} 45%,transparent 75%)"></i>${esc(x.name)}${locked ? `<small>🔒 LEVEL ${x.unlock}</small>` : ''}</div>`; }).join('')}</div>
      <div class="row" style="margin-top:1.2em"><button class="btn" data-act="home">Done</button></div></div>`;
  }

  powersScreen() {
    const card = (P) => `<div class="pc${P.ult ? ' ult' : ''}">${icon(P.id, P.color, 30)}<div><b>${esc(P.name)}${P.ult ? ' · ULTIMATE' : ''}</b><small>${esc(P.desc)}${P.cd ? ` · ${P.cd}s` : ''}${P.ki ? ` · ${P.ki} ki` : ''}</small></div></div>`;
    return `<div class="pnl"><h2>TECHNIQUES</h2><p class="note">Carry as many techniques as you find, but equip three (Q, E, R) and one ultimate (X) — open the loadout with Tab. Techniques cost ki: hold C to charge it. Finding one you already own levels it up (★★★ max). Fighting fills your form meter — press G to ascend, and again for the second stage. Defeated heroes drop everything they carried.</p>
      <div class="inv">${ALL_POWERS.map(card).join('')}</div>
      <h2 style="margin-top:1em">CRATES</h2><div class="row">${Object.values(CRATES).map((c) => `<div class="card" style="border-color:${c.color}"><b style="color:${c.color}">${c.name}</b><br><small class="note">${c.powers} technique${c.powers > 1 ? 's' : ''} · ${Math.round(c.ult * 100)}% ultimate</small></div>`).join('')}</div>
      <div class="row" style="margin-top:1.2em"><button class="btn" data-act="home">Back</button></div></div>`;
  }

  settingsScreen(S) {
    const seg = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<button class="${String(S[k]) === String(v) ? 'on' : ''}" data-act="set" data-arg="${k}:${v}">${l}</button>`).join('')}</span>`;
    return `<div class="pnl" style="max-width:42em"><h2>SETTINGS</h2><div class="set">
      <span>Graphics</span>${seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
      <span>Shadows</span>${seg('shadows', [[true, 'On'], [false, 'Off']])}
      <span>Bot skill</span>${seg('bots', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}
      <span>Mouse sensitivity</span><input type="range" min="0.2" max="2.5" step="0.05" value="${S.sens}" data-set="sens">
      <span>Field of view</span><input type="range" min="60" max="95" step="1" value="${S.fov}" data-set="fov">
      <span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${S.volume}" data-set="volume">
      <span>Invert look</span>${seg('invertY', [[false, 'Off'], [true, 'On']])}
      <span>Crosshair</span>${seg('xhStyle', XH_STYLES)}
      <span>Crosshair colour</span><span class="seg">${XH_COLORS.map((c) => `<button class="${S.xhColor === c ? 'on' : ''}" style="background:${c};width:2em;height:1.6em${S.xhColor === c ? ";outline:3px solid #fff;outline-offset:1px" : ""}" data-act="set" data-arg="xhColor:${c}"></button>`).join('')}</span>
      <span>Crosshair size</span><input type="range" min="0.6" max="2" step="0.1" value="${S.xhSize || 1}" data-set="xhSize">
    </div>
    <h3 style="margin-top:1.2em;font-size:.95em">CONTROLS</h3>
    <div class="keys"><kbd>W A S D</kbd><span>Move · Shift sprint (in the air: boost, hold for a supersonic dash)</span><kbd>Space</kbd><span>Jump · double-tap to fly or land · hold to climb while flying</span><kbd>Ctrl / Z</kbd><span>Descend while flying</span><kbd>Mouse</kbd><span>Look · left click 5-hit combo · hold and release for a heavy smash · right click aim</span><kbd>Q E R</kbd><span>Techniques · X ultimate</span><kbd>C (hold)</kbd><span>Charge ki</span><kbd>V</kbd><span>Vanish — appear behind your target</span><kbd>T</kbd><span>Lock on to the hero in your sights</span><kbd>G</kbd><span>Ascend when the form meter is full</span><kbd>F (hold)</kbd><span>Open crates · revive teammates</span><kbd>4 / 5</kbd><span>Medkit / shield cell</span><kbd>6 7 8</kbd><span>Emotes</span><kbd>Tab</kbd><span>Inventory — loot nearby, swap techniques</span><kbd>M</kbd><span>Map — click to place a marker</span><kbd>Middle mouse / B</kbd><span>Ping where you aim (on an enemy: enemy ping)</span></div>
    <div class="row" style="margin-top:1.2em"><button class="btn" data-act="back">Back</button></div></div>`;
  }

  // PUBG-style inventory: what's lying nearby on the left, your techniques in the middle, equipped slots on the right
  loadoutScreen(inv, sel, near = []) {
    const owned = Object.keys(inv.powers);
    const equipped = new Set([...inv.slots, inv.ult].filter(Boolean));
    const card = (id) => { const P = POWER[id]; return `<div class="pc${P.ult ? ' ult' : ''}${sel === id ? ' sel' : ''}${equipped.has(id) ? ' eq' : ''}" data-act="pick" data-arg="${id}">${icon(id, P.color, 30)}<div><b>${esc(P.name)}</b><small>${esc(P.desc)}${P.ki ? ` · ${P.ki} ki` : ''}</small></div><span class="lvl">${'★'.repeat(inv.powers[id])}</span></div>`; };
    const ls = (id, i) => { const P = id && POWER[id]; return `<div class="ls${i === 3 ? ' ult' : ''}${P ? ' full' : ''}${sel && ((i === 3) === !!POWER[sel].ult) ? ' target' : ''}" data-act="slot" data-arg="${i}"><span class="k">${['Q', 'E', 'R', 'X'][i]}</span>${P ? `${icon(id, P.color, 30)}<br>${esc(P.name)}` : (i === 3 ? 'Ultimate' : 'Empty')}</div>`; };
    const vic = near.map((n) => { const P = n.power && POWER[n.power]; const I = n.item && ITEMS[n.item]; const nm = P ? P.name : I ? I.name : n.item; const col = P ? P.color : I ? I.color : '#fff'; const have = P && inv.powers[n.power]; return `<div class="vic" data-act="take" data-arg="${n.id}">${icon(n.power || n.item, col, 26)}<div><b>${esc(nm)}${n.n > 1 ? ` ×${n.n}` : ''}</b><small>${P ? (P.ult ? 'Ultimate' : 'Technique') + (have ? ` · upgrades to ${'★'.repeat(Math.min(3, have + 1))}` : '') : 'Consumable'} · ${n.dist}m</small></div></div>`; }).join('');
    return `<div class="invx">
      <div class="col"><h3>VICINITY</h3>${vic || '<p class="note">Nothing on the ground nearby.</p>'}<p class="note" style="margin-top:1em">Click to pick up.</p></div>
      <div class="col"><h3>TECHNIQUES · ${owned.length}</h3><div class="inv" style="grid-template-columns:1fr">${owned.sort((a, b) => (POWER[a].ult ? 1 : 0) - (POWER[b].ult ? 1 : 0)).map(card).join('') || '<p class="note">No techniques yet — open crates!</p>'}</div></div>
      <div class="col"><div class="row" style="justify-content:space-between"><h3 style="margin:0">EQUIPPED</h3><button class="btn sm" data-act="closeinv">Close · Tab</button></div>
        <p class="note">Pick a technique, then a slot. The match keeps going while this is open!</p>
        <div class="loadout" style="grid-template-columns:repeat(2,1fr)">${inv.slots.map(ls).join('')}${ls(inv.ult, 3)}</div>
        <h3 style="margin-top:1em">CONSUMABLES</h3><div class="row"><div class="it" style="background:rgba(255,255,255,.06);padding:.4em .7em">${icon('medkit', '#5cff8a', 20)} Medkit ×${inv.items.medkit} <small>[4]</small></div><div class="it" style="background:rgba(255,255,255,.06);padding:.4em .7em">${icon('cell', '#4ad8ff', 20)} Shield cell ×${inv.items.cell} <small>[5]</small></div></div></div>
    </div>`;
  }

  // Valorant-style agent select before an offline match
  heroSelectScreen(cur, lv, left, locked) {
    const H = HERO[cur] || HEROES[0];
    return `<div class="sel"><div><h1>CHOOSE YOUR FIGHTER</h1><div class="note">${locked ? 'Locked in — dropping soon' : 'Pick a hero and lock in'}</div></div>
      <div class="tmr">${Math.ceil(left)}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:1em;flex-wrap:wrap">
        <div><div class="note" style="letter-spacing:.2em">${({ wild: 'BRAWLER', flame: 'BLASTER', swept: 'DUELIST', short: 'SENTINEL', long: 'MYSTIC' }[H.hairStyle] || 'MARTIAL ARTIST')}</div><div class="who" style="color:${H.glow}">${esc(H.name.toUpperCase())}</div></div>
        <div style="text-align:center"><div class="grid">${HEROES.map((h) => { const lk = h.unlock > lv; return `<button class="hx${h.id === cur ? ' on' : ''}${lk ? ' lk' : ''}" style="background:linear-gradient(135deg,${h.suit} 0 50%,${h.sash || h.suit2} 50% 70%,${h.hairColor || h.glow} 70%)" data-act="${locked ? '' : 'selhero'}" data-arg="${h.id}">${esc(h.name[0])}<small>${lk ? `LV ${h.unlock}` : esc(h.name.toUpperCase())}</small></button>`; }).join('')}</div>
        <button class="lockin${locked ? ' done' : ''}" data-act="${locked ? '' : 'lockin'}" style="margin-top:1em">${locked ? 'LOCKED' : 'LOCK IN'}</button></div>
        <div style="width:12em"></div>
      </div></div>`;
  }

  endScreen(res) {
    return `<div class="pnl" style="max-width:34em;text-align:center">
      <div class="place">${res.place === 1 ? 'VICTORY' : `#${res.place}`}</div>
      <p style="font-weight:700">${res.place === 1 ? (res.mode && res.mode !== 'solo' ? 'Your squad is the last one standing!' : 'Last hero standing. The island is yours.') : `${esc(res.by ? `Defeated by ${res.by}` : 'Eliminated')}`}</p>
      <div class="stat" style="justify-content:center"><div><b>${res.kills}</b>Eliminations</div><div><b>${Math.round(res.dmg)}</b>Damage</div><div><b>${res.powers}</b>Techniques found</div><div><b>+${res.xp}</b>XP</div></div>
      ${res.done && res.done.length ? `<div class="daily" style="margin:1em auto 0">${res.done.map((c) => `<div class="ok"><span>✓ ${esc(c.text)}</span><span>+${c.xp} XP</span></div>`).join('')}</div>` : ''}
      ${res.levelUp ? `<p style="color:#ffd84a;font-weight:800">LEVEL ${res.levelUp.lv}!${res.levelUp.un.length ? ` Unlocked: ${res.levelUp.un.map(esc).join(', ')}` : ''}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:1.4em">${res.canSpectate ? '<button class="btn alt" data-act="spectate">Spectate</button>' : ''}<button class="btn" data-act="again">${res.online ? 'Back to room' : 'Play again'}</button><button class="btn alt" data-act="quit">Main menu</button></div></div>`;
  }

  pauseScreen(online) {
    return `<div class="pnl" style="max-width:26em;text-align:center"><h2>PAUSED</h2>${online ? '<p class="note">Online matches keep running.</p>' : ''}
      <div class="menu" style="align-items:center"><button class="btn" data-act="resume">Resume</button><button class="btn alt" data-act="settings">Settings</button><button class="btn alt" data-act="quit">Leave match</button></div></div>`;
  }

  mapScreen() { return '<div class="bigmap" data-k="bigmap"><canvas width="900" height="900"></canvas><div class="maplegend"><b>MAP</b><br>◯ <span style="color:#c99bff">storm</span> · ◯ next safe zone<br><span style="color:#ff4a4a">●</span> bombardment · <span style="color:#ff4a4a">■</span> sky cache<br>◆ marker — click to place, click it again to clear<br>M to close</div></div>'; }

  onlineScreen(name, err) {
    return `<div class="pnl" style="max-width:34em"><h2>ONLINE</h2>
      <p class="note">One player hosts a room and shares the code. Up to 50 players; bots fill every empty slot so it's always a full 50-hero battle. In duos and squads, friends are teamed up in the order they join.</p>
      <div class="row" style="margin:1em 0"><span>Your name</span><input type="text" name="pname" maxlength="16" value="${esc(name)}"></div>
      <div class="row"><button class="btn" data-act="host">Host a room</button></div>
      <div class="row" style="margin-top:1em"><input type="text" name="code" maxlength="6" placeholder="ROOM CODE" style="text-transform:uppercase;width:9em"><button class="btn alt" data-act="join">Join</button></div>
      ${err ? `<p style="color:#ff7a7a;font-weight:700">${esc(err)}</p>` : ''}
      <div class="row" style="margin-top:1.2em"><button class="btn alt" data-act="home">Back</button></div></div>`;
  }
}
export { ITEMS, CRATES };
