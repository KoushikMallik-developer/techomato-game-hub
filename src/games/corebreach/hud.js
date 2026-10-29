// Core Breach HUD and screens (DOM overlay): score bar, health, abilities, ammo, killfeed, minimap,
// crosshair, damage indicators, buy menu and scoreboard.
import { AGENT, AGENTS, WEAPON, BUY_CATS, ARMOR, COLORS, SLOTS, esc, fmtClock, clamp } from './data.js';

export const CSS = `
.cb{position:absolute;inset:0;overflow:hidden;font-family:'Rajdhani','Bahnschrift','Arial Narrow','Segoe UI',system-ui,sans-serif;color:#ece8e1;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-size:15px;line-height:1.25;background:#0f1923}
.cb *{box-sizing:border-box}
.cb [hidden]{display:none!important}
.cb canvas.cb-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}
.cb-hud{position:absolute;inset:0;pointer-events:none}
.cb-top{position:absolute;top:.6em;left:50%;transform:translateX(-50%);display:flex;align-items:stretch;gap:.35em}
.cb-team{display:flex;gap:.25em;align-items:center}
.cb-ag{width:2.2em;height:2.2em;border-radius:.3em;display:grid;place-items:center;font-weight:700;font-size:.85em;background:#1c2733;border:2px solid #fff3;position:relative;overflow:hidden}
.cb-ag.dead{opacity:.35;filter:grayscale(1)}
.cb-ag i{position:absolute;left:0;bottom:0;height:3px;background:#fff}
.cb-score{display:flex;align-items:center;background:rgba(15,25,35,.82);border-bottom:3px solid #ff4655;clip-path:polygon(0 0,100% 0,94% 100%,6% 100%);padding:.15em 1.4em}
.cb-score b{font-size:1.7em;width:1.4em;text-align:center}
.cb-score .t{font-size:1.5em;font-weight:700;min-width:3.4em;text-align:center;letter-spacing:.04em}
.cb-score .t.core{color:#ff4655}
.cb-ph{position:absolute;top:3.6em;left:50%;transform:translateX(-50%);font-size:.85em;letter-spacing:.2em;color:#ece8e1cc;text-shadow:0 1px 3px #000}
.cb-bl{position:absolute;left:1.2em;bottom:1em;display:flex;align-items:flex-end;gap:.8em}
.cb-hp{display:flex;align-items:baseline;gap:.4em;background:rgba(15,25,35,.7);padding:.3em .9em .2em;clip-path:polygon(0 0,92% 0,100% 100%,0 100%)}
.cb-hp b{font-size:2.6em;font-weight:700}
.cb-hp .ar{font-size:1.2em;color:#9fd8ff}
.cb-hp .bar{width:9em;height:.45em;background:#fff2;align-self:center;position:relative}
.cb-hp .bar i{position:absolute;inset:0;right:auto;background:#ece8e1}
.cb-abil{position:absolute;left:50%;bottom:1em;transform:translateX(-50%);display:flex;gap:.5em;align-items:flex-end}
.cb-ab{width:3.4em;height:3.4em;background:rgba(15,25,35,.75);border:1px solid #ece8e133;position:relative;display:grid;place-items:center;clip-path:polygon(12% 0,100% 0,88% 100%,0 100%)}
.cb-ab .ic{width:1.6em;height:1.6em;opacity:.9}
.cb-ab .k{position:absolute;top:.1em;left:.5em;font-size:.75em;color:#ece8e1aa}
.cb-ab .ch{position:absolute;bottom:.15em;left:0;right:0;display:flex;gap:.2em;justify-content:center}
.cb-ab .ch i{width:.4em;height:.4em;background:#ece8e1;transform:rotate(45deg)}
.cb-ab .ch i.off{background:#ece8e133}
.cb-ab.empty .ic{opacity:.25}
.cb-ab.ult{width:4em;height:4em;border-color:#ffd166aa}
.cb-ab.ult.ready{box-shadow:inset 0 0 18px #ffd166;border-color:#ffd166}
.cb-ab .pts{position:absolute;bottom:.1em;font-size:.75em;color:#ffd166}
.cb-br{position:absolute;right:1.2em;bottom:1em;text-align:right}
.cb-ammo{font-size:2.6em;font-weight:700;line-height:1}
.cb-ammo small{font-size:.5em;color:#ece8e1aa;margin-left:.2em}
.cb-wname{font-size:.95em;letter-spacing:.15em;color:#ece8e1cc}
.cb-credits{font-size:1.1em;color:#ffd166}
.cb-feed{position:absolute;right:1em;top:.8em;display:grid;gap:.25em;justify-items:end}
.cb-feed div{background:rgba(15,25,35,.75);padding:.2em .6em;font-size:.92em;display:flex;gap:.5em;align-items:center;border-right:3px solid transparent}
.cb-feed div.me{border-right-color:#ffd166;background:rgba(60,45,10,.75)}
.cb-feed .w{color:#ece8e1aa;font-size:.85em;letter-spacing:.08em}
.cb-feed .hs{color:#ff4655}
.cb-mini{position:absolute;left:1em;top:1em;width:210px;height:210px;background:rgba(15,25,35,.55);border:1px solid #ece8e122}
.cb-xh{position:absolute;left:50%;top:50%;width:0;height:0}
.cb-xh i{position:absolute;background:var(--xc,#0f8);box-shadow:0 0 0 1px rgba(0,0,0,.6)}
.cb-hitm{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transition:opacity .15s}
.cb-hitm.on{opacity:1;transition:none}
.cb-hitm i{position:absolute;width:9px;height:2px;background:#fff;top:12px}
.cb-hitm.kill i{background:#ff4655;height:3px}
.cb-dmgdir{position:absolute;left:50%;top:50%;width:0;height:0}
.cb-dmgdir i{position:absolute;left:-60px;top:-150px;width:120px;height:26px;border-top:5px solid rgba(255,70,85,.85);border-radius:50% 50% 0 0;transform-origin:60px 150px;transition:opacity .6s}
.cb-vig{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px rgba(255,30,40,0);transition:box-shadow .25s}
.cb-blind{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.cb-smokeov{position:absolute;inset:0;background:radial-gradient(circle,#7d8290 0,#6a6f7c 100%);opacity:0;pointer-events:none}
.cb-msg{position:absolute;left:0;right:0;top:22%;text-align:center;pointer-events:none}
.cb-msg b{display:block;font-size:3.2em;letter-spacing:.12em;font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.cb-msg span{display:block;font-size:1.1em;letter-spacing:.3em;color:#ece8e1cc}
.cb-msg.win b{color:#3edbc4}.cb-msg.lose b{color:#ff4655}
.cb-act{position:absolute;left:50%;top:62%;transform:translateX(-50%);width:16em;text-align:center}
.cb-act .bar{height:.5em;background:#fff2;margin-top:.3em}
.cb-act .bar i{display:block;height:100%;background:#ffd166;width:0}
.cb-tip{position:absolute;left:50%;bottom:6.6em;transform:translateX(-50%);font-size:.95em;background:rgba(15,25,35,.7);padding:.25em .9em;letter-spacing:.06em}
.cb-spec{position:absolute;left:50%;bottom:7.6em;transform:translateX(-50%);font-size:1.1em;letter-spacing:.2em;background:rgba(15,25,35,.7);padding:.3em 1em}
.cb-fps{position:absolute;right:.5em;bottom:.3em;font-size:.75em;color:#ece8e188}
.cb-reveal{position:absolute;width:0;height:0}
.cb-scope{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at center,rgba(20,40,60,0) 0,rgba(20,40,60,.12) 30vmin,#000 32.4vmin)}
.cb-scope:before,.cb-scope:after{content:'';position:absolute;background:#000}
.cb-scope:before{left:50%;top:0;bottom:0;width:1px}
.cb-scope:after{top:50%;left:0;right:0;height:1px}
.cb-chat{position:absolute;left:1em;bottom:7.5em;width:24em;display:grid;gap:.2em;font-size:.9em}
.cb-chat div{background:rgba(15,25,35,.6);padding:.15em .5em}
.cb-chat input{font:inherit;color:#fff;background:rgba(15,25,35,.9);border:1px solid #ffd166;padding:.4em .6em;pointer-events:auto}
/* screens */
.cb-screen{position:absolute;inset:0;display:grid;place-items:center;overflow:auto;padding:1em}
.cb-screen:empty{display:none}
.cb-panel{background:rgba(15,25,35,.92);box-shadow:inset 0 0 0 1px #ece8e11f;padding:1.4em 1.6em;max-width:min(64em,100%);width:100%;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,20px 100%,0 calc(100% - 20px))}
.cb h1{font-family:'Chakra Petch','Rajdhani',sans-serif;font-size:3.4em;letter-spacing:.06em;margin:0;line-height:1;font-weight:700}
.cb h1 span{color:#ff4655}
.cb h2{font-family:'Chakra Petch','Rajdhani',sans-serif;font-size:1.6em;letter-spacing:.1em;margin:0 0 .4em;font-weight:700}
.cb .sub{color:#ece8e1aa;letter-spacing:.12em;margin:.3em 0 1.2em}
.cb button.b{font:inherit;font-weight:700;letter-spacing:.14em;color:#ece8e1;background:rgba(255,255,255,.05);border:1px solid #ece8e133;padding:.7em 1.3em;cursor:pointer;text-transform:uppercase;text-align:left}
.cb button.b:hover,.cb button.b:focus-visible{background:rgba(255,255,255,.12);outline:none;border-color:#ece8e1aa}
.cb button.b.primary{background:#ff4655;border-color:#ff4655;color:#fff}
.cb button.b.primary:hover{background:#ff5f6b}
.cb button.b.sel{border-color:#ffd166;color:#ffd166}
.cb button.b:disabled{opacity:.4;cursor:default}
.cb-menu{position:absolute;left:5%;top:50%;transform:translateY(-50%);display:grid;gap:.5em;width:min(24em,90%)}
.cb-menu .b{font-size:1.15em;background:rgba(15,25,35,.75)}
.cb-foot{position:absolute;left:5%;bottom:1.2em;color:#ece8e199;font-size:.9em;letter-spacing:.1em}
.cb-row{display:flex;gap:.6em;flex-wrap:wrap;align-items:center;margin:.4em 0}
.cb-row label{min-width:9em;color:#ece8e1bb;letter-spacing:.08em}
.cb input[type=range]{width:12em;accent-color:#ff4655}
.cb input[type=text],.cb input.code{font:inherit;color:#fff;background:rgba(255,255,255,.07);border:1px solid #ece8e144;padding:.55em .8em;letter-spacing:.1em}
.cb input.code{text-transform:uppercase;font-size:1.5em;width:7em;text-align:center;letter-spacing:.3em}
.cb-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(9em,1fr));gap:.6em;margin:1em 0}
.cb-agent{border:1px solid #ece8e133;padding:.6em;cursor:pointer;background:rgba(255,255,255,.04);text-align:left;font:inherit;color:inherit}
.cb-agent.sel{border-color:#ffd166;background:rgba(255,209,102,.08)}
.cb-agent b{display:block;font-size:1.3em;letter-spacing:.1em}
.cb-agent small{color:#ece8e1aa;letter-spacing:.1em}
.cb-agent .sw{height:.35em;margin:.4em 0}
.cb-abl{display:grid;gap:.4em;margin-top:.6em}
.cb-abl div{display:grid;grid-template-columns:2em 1fr;gap:.6em;align-items:start}
.cb-abl kbd{border:1px solid #ece8e166;padding:.1em .35em;font-size:.85em;text-align:center}
.cb-abl small{color:#ece8e1aa}
.cb-buy{display:grid;grid-template-columns:repeat(4,1fr);gap:.8em}
.cb-buy h3{margin:0 0 .4em;font-size:.9em;letter-spacing:.2em;color:#ece8e1aa}
.cb-item{display:block;width:100%;margin-bottom:.4em;font:inherit;color:inherit;text-align:left;padding:.55em .7em;background:rgba(255,255,255,.05);border:1px solid #ece8e122;cursor:pointer}
.cb-item:hover{border-color:#ece8e1aa}
.cb-item.own{border-color:#3edbc4;background:rgba(62,219,196,.1)}
.cb-item.no{opacity:.4}
.cb-item b{display:block;letter-spacing:.1em}
.cb-item small{color:#ffd166}
.cb-sb table{width:100%;border-collapse:collapse;margin:.5em 0}
.cb-sb td,.cb-sb th{padding:.35em .6em;text-align:left}
.cb-sb th{color:#ece8e199;font-weight:600;letter-spacing:.12em;font-size:.85em}
.cb-sb tr.red td{background:rgba(255,70,85,.12)}.cb-sb tr.blue td{background:rgba(62,219,196,.12)}
.cb-sb tr.me td{color:#ffd166}
.cb-touch{position:absolute;inset:0;pointer-events:none}
.cb-touch .stick{position:absolute;left:1.2em;bottom:1.2em;width:9em;height:9em;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid #fff3;pointer-events:auto;touch-action:none}
.cb-touch .stick i{position:absolute;left:50%;top:50%;width:3.6em;height:3.6em;margin:-1.8em;border-radius:50%;background:rgba(255,255,255,.25)}
.cb-touch .look{position:absolute;right:0;top:0;width:55%;height:100%;pointer-events:auto;touch-action:none}
.cb-touch button{position:absolute;pointer-events:auto;touch-action:none;font:inherit;font-weight:700;color:#fff;background:rgba(15,25,35,.6);border:1px solid #fff4;border-radius:50%;width:4.2em;height:4.2em;letter-spacing:.05em}
.cb-touch button.on{background:rgba(255,70,85,.6)}
.cb-touch .fire{right:2em;bottom:7em;width:6em;height:6em;background:rgba(255,70,85,.35)}
.cb-touch .fire2{left:12em;bottom:9em}
.cb-touch .jump{right:9em;bottom:2.5em}.cb-touch .crouch{right:14em;bottom:1.2em}
.cb-touch .reload{right:2em;bottom:16em;width:3.4em;height:3.4em}
.cb-touch .scope{right:8em;bottom:13em;width:3.4em;height:3.4em}
.cb-touch .wpn{right:2em;bottom:21em;width:3.4em;height:3.4em}
.cb-touch .use{right:14em;bottom:7em;width:3.6em;height:3.6em}
.cb-touch .menu{left:50%;transform:translateX(-50%);width:3em;height:2em;border-radius:.3em;top:5em}
.cb-touch .buy{left:calc(150px + 2em);top:1em;width:3.4em;height:3.4em}
.touch .cb-abil{bottom:.5em;pointer-events:auto;z-index:2}
.touch .cb-ab{width:3.8em;height:3.8em}
.touch .cb-mini{width:150px;height:150px}
.touch .cb-bl{left:.6em;bottom:auto;top:calc(150px + 1.6em)}
.touch .cb-hp{padding:.15em .6em .1em}
.touch .cb-hp b{font-size:1.7em}
.touch .cb-hp .bar{width:5em}
.touch .cb-tip{bottom:5.4em}
.touch .cb-spec{bottom:6.6em}
.touch .cb-chat{bottom:auto;top:calc(150px + 5em);width:18em}
.touch .cb-feed{top:5em}
@media (max-width:760px){.cb{font-size:12px}.cb-buy{grid-template-columns:1fr 1fr}}
`;

const ABIL_ICON = {
  flash: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 2l2.5 7H22l-6 4.5 2.3 7.5L12 16.5 5.7 21 8 13.5 2 9h7.5z"/></svg>',
  molly: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 2c2 4 6 6 6 11a6 6 0 01-12 0c0-3 2-5 3-7 0 3 1 4 2 4 0-3-1-5 1-8z"/></svg>',
  dash: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M2 11h12l-4-5h4l6 6-6 6h-4l4-5H2z"/></svg>',
  overdrive: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  smoke: '<svg viewBox="0 0 24 24" class="ic"><circle cx="9" cy="13" r="6" fill="currentColor"/><circle cx="15" cy="10" r="6" fill="currentColor" opacity=".7"/></svg>',
  slow: '<svg viewBox="0 0 24 24" class="ic"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 2v20M3 7l18 10M21 7L3 17"/></svg>',
  eclipse: '<svg viewBox="0 0 24 24" class="ic"><circle cx="5" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="19" cy="12" r="3" fill="currentColor"/></svg>',
  concuss: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  shock: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M3 21L14 10l-2-2 9-6-6 9-2-2z"/></svg>',
  recon: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 100 8 4 4 0 000-8z"/></svg>',
  hunt: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>',
  wall: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M2 6h20v4H2zm0 6h9v4H2zm11 0h9v4h-9zM2 18h20v2H2z"/></svg>',
  turret: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M6 8h10v6H6zm10 2h6v2h-6zM8 14l-4 8h2l3-6zm6 0l4 8h-2l-3-6zm-3 0h2v8h-2z"/></svg>',
  bastion: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6z"/></svg>',
  heal: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  revive: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 21s-8-5-8-11a5 5 0 019-3 5 5 0 019 3c0 6-8 11-8 11z"/></svg>',
  frag: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="14" r="7" fill="currentColor"/><rect x="10" y="3" width="4" height="5" fill="currentColor"/></svg>',
  blink: '<svg viewBox="0 0 24 24" class="ic"><circle cx="5" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M10 11h7l-3-3 1.4-1.4L21 12l-5.6 5.4L14 16l3-3h-7z"/></svg>',
  supernova: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 1l2 7 7-2-5 5 6 3-7 1 1 7-4-6-4 6 1-7-7-1 6-3-5-5 7 2z"/></svg>',
  toxin: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 2a4 4 0 014 4c0 1-.3 1.8-.8 2.5A6 6 0 0118 14a6 6 0 11-12 0 6 6 0 012.8-5.5A4 4 0 018 6a4 4 0 014-4zm0 9a3 3 0 100 6 3 3 0 000-6z"/></svg>',
  trap: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="14" r="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 14a7 7 0 0114 0M2 14a10 10 0 0120 0"/></svg>',
  lockdown: '<svg viewBox="0 0 24 24" class="ic"><rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.5" d="M8 10V7a4 4 0 018 0v3"/></svg>',
  orbital: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M11 1h2v14h-2z"/><circle cx="12" cy="19" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export class HUD {
  constructor(game) {
    this.g = game;
    const root = game.root;
    root.insertAdjacentHTML('beforeend', `
      <div class="cb-scope" hidden></div>
      <div class="cb-hud" hidden>
        <canvas class="cb-mini" width="210" height="210"></canvas>
        <div class="cb-top"><div class="cb-team t1"></div><div class="cb-score"><b class="s1">0</b><span class="t">1:40</span><b class="s2">0</b></div><div class="cb-team t2"></div></div>
        <div class="cb-ph"></div>
        <div class="cb-feed"></div>
        <div class="cb-xh"></div>
        <div class="cb-hitm"><i style="left:0;transform:rotate(45deg) translate(-2px,-6px)"></i><i style="right:0;transform:rotate(-45deg) translate(2px,-6px)"></i><i style="left:0;transform:rotate(-45deg) translate(-2px,6px)"></i><i style="right:0;transform:rotate(45deg) translate(2px,6px)"></i></div>
        <div class="cb-dmgdir"></div>
        <div class="cb-msg" hidden><b></b><span></span></div>
        <div class="cb-act" hidden><span></span><div class="bar"><i></i></div></div>
        <div class="cb-tip" hidden></div>
        <div class="cb-spec" hidden></div>
        <div class="cb-bl"><div class="cb-hp"><b>100</b><span class="ar"></span><div class="bar"><i></i></div></div></div>
        <div class="cb-abil"></div>
        <div class="cb-br"><div class="cb-credits"></div><div class="cb-ammo"><span>12</span><small>/ 36</small></div><div class="cb-wname">WASP</div></div>
        <div class="cb-chat"></div>
        <div class="cb-fps" hidden></div>
      </div>
      <div class="cb-vig"></div>
      <div class="cb-blind"></div>
      <div class="cb-smokeov"></div>
      <div class="cb-touch" hidden></div>
      <div class="cb-screen"></div>`);
    const q = (s) => root.querySelector(s);
    this.el = {
      hud: q('.cb-hud'), mini: q('.cb-mini'), t1: q('.cb-team.t1'), t2: q('.cb-team.t2'), s1: q('.s1'), s2: q('.s2'), time: q('.cb-score .t'), ph: q('.cb-ph'),
      feed: q('.cb-feed'), xh: q('.cb-xh'), hitm: q('.cb-hitm'), dmgdir: q('.cb-dmgdir'), msg: q('.cb-msg'), act: q('.cb-act'), tip: q('.cb-tip'), spec: q('.cb-spec'),
      hp: q('.cb-hp b'), ar: q('.cb-hp .ar'), hpbar: q('.cb-hp .bar i'), abil: q('.cb-abil'), credits: q('.cb-credits'), ammo: q('.cb-ammo span'), reserve: q('.cb-ammo small'), wname: q('.cb-wname'),
      scope: q('.cb-scope'), vig: q('.cb-vig'), blind: q('.cb-blind'), smokeov: q('.cb-smokeov'), touch: q('.cb-touch'), screen: q('.cb-screen'), chat: q('.cb-chat'), fps: q('.cb-fps'),
    };
    this.miniCtx = this.el.mini.getContext('2d');
    this.cache = {};
    this.feedItems = [];
  }

  set(key, el, v) {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    el.textContent = v;
  }

  html(key, el, v) {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    el.innerHTML = v;
  }

  // crosshair from settings; gap grows with spread when dynamic
  crosshair(ch, spreadPx = 0) {
    const gap = ch.gap + (ch.dynamic ? spreadPx : 0);
    const key = `${ch.color}|${ch.size}|${Math.round(gap)}|${ch.thick}|${ch.dot}|${ch.outline}`;
    if (this.cache.xh === key) return;
    this.cache.xh = key;
    const t = ch.thick;
    const sh = ch.outline ? 'box-shadow:0 0 0 1px rgba(0,0,0,.7)' : 'box-shadow:none';
    const bars = [
      [`left:${-t / 2}px;top:${-gap - ch.size}px;width:${t}px;height:${ch.size}px`],
      [`left:${-t / 2}px;top:${gap}px;width:${t}px;height:${ch.size}px`],
      [`left:${-gap - ch.size}px;top:${-t / 2}px;width:${ch.size}px;height:${t}px`],
      [`left:${gap}px;top:${-t / 2}px;width:${ch.size}px;height:${t}px`],
    ];
    let h = ch.size > 0 ? bars.map((b) => `<i style="${b[0]};background:${ch.color};${sh}"></i>`).join('') : '';
    if (ch.dot) h += `<i style="left:${-t / 2}px;top:${-t / 2}px;width:${t}px;height:${t}px;background:${ch.color};${sh}"></i>`;
    this.el.xh.innerHTML = h;
  }

  hitmarker(kill = false) {
    const h = this.el.hitm;
    h.classList.toggle('kill', kill);
    h.classList.add('on');
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => h.classList.remove('on'), 90);
  }

  damageFrom(angle) {
    const i = document.createElement('i');
    i.style.transform = `rotate(${angle}rad)`;
    this.el.dmgdir.appendChild(i);
    setTimeout(() => { i.style.opacity = '0'; }, 400);
    setTimeout(() => i.remove(), 1100);
    this.el.vig.style.boxShadow = 'inset 0 0 160px rgba(255,30,40,.55)';
    clearTimeout(this.vigT);
    this.vigT = setTimeout(() => { this.el.vig.style.boxShadow = 'inset 0 0 160px rgba(255,30,40,0)'; }, 160);
  }

  message(title, sub = '', cls = '', ms = 2200) {
    const m = this.el.msg;
    m.hidden = false;
    m.className = `cb-msg ${cls}`;
    m.querySelector('b').textContent = title;
    m.querySelector('span').textContent = sub;
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => { m.hidden = true; }, ms);
  }

  feed(killer, victim, weapon, head, meInvolved) {
    const d = document.createElement('div');
    if (meInvolved) d.className = 'me';
    const kc = killer ? (killer.team === 'red' ? COLORS.atk : COLORS.def) : '#ccc';
    const vc = victim.team === 'red' ? COLORS.atk : COLORS.def;
    const wn = weapon === 'core' ? 'CORE' : WEAPON[weapon] ? WEAPON[weapon].name.toUpperCase() : String(weapon || '').toUpperCase();
    d.innerHTML = `${killer ? `<span style="color:${kc}">${esc(killer.name)}</span>` : ''}<span class="w">${wn}${head ? ' <span class="hs">◆</span>' : ''}</span><span style="color:${vc}">${esc(victim.name)}</span>`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }

  chatLine(name, text, color = '#ece8e1') {
    const d = document.createElement('div');
    d.innerHTML = `<b style="color:${color}">${esc(name)}:</b> ${esc(text)}`;
    this.el.chat.appendChild(d);
    while (this.el.chat.querySelectorAll('div').length > 6) this.el.chat.querySelector('div').remove();
    setTimeout(() => d.remove(), 9000);
  }

  // the two teams' portraits along the top
  teams(players, meTeam, mode) {
    const mk = (list, side) => list.map((p) => {
      const ag = AGENT[p.agent];
      const hp = clamp(p.hp / 100, 0, 1);
      return `<div class="cb-ag${p.alive ? '' : ' dead'}" style="border-color:${side}">${ag.name.slice(0, 2).toUpperCase()}<i style="width:${hp * 100}%;background:${side}"></i></div>`;
    }).join('');
    if (mode !== 'core') {
      this.html('t1', this.el.t1, '');
      this.html('t2', this.el.t2, '');
      return;
    }
    const mine = players.filter((p) => p.team === meTeam);
    const theirs = players.filter((p) => p.team !== meTeam);
    this.html('t1', this.el.t1, mk(mine, COLORS.def));
    this.html('t2', this.el.t2, mk(theirs, COLORS.atk));
  }

  abilities(agentId, charges, ult, aiming) {
    const ag = AGENT[agentId];
    const keys = { c: 'C', q: 'Q', e: 'E', x: 'X' };
    const h = SLOTS.map((k) => {
      const a = ag.abilities[k];
      if (k === 'x') {
        const ready = ult >= a.points;
        return `<div class="cb-ab ult${ready ? ' ready' : ''}" data-slot="x" title="${esc(a.name)}"><span class="k">${keys[k]}</span>${ABIL_ICON[a.kind] || ''}<span class="pts">${ready ? 'READY' : `${ult}/${a.points}`}</span></div>`;
      }
      const n = charges[k] || 0;
      const dots = Array.from({ length: a.max }, (_, i) => `<i class="${i < n ? '' : 'off'}"></i>`).join('');
      return `<div class="cb-ab${n ? '' : ' empty'}${aiming === k ? ' sel' : ''}" data-slot="${k}" title="${esc(a.name)}" style="color:${ag.accent}"><span class="k">${keys[k]}</span>${ABIL_ICON[a.kind] || ''}<span class="ch">${dots}</span></div>`;
    }).join('');
    this.html('abil', this.el.abil, h);
  }

  // minimap: the level drawn once, then players and effects on top
  initMinimap(level) {
    const L = level;
    const c = document.createElement('canvas');
    c.width = L.W * 2; c.height = L.D * 2;
    const g = c.getContext('2d');
    for (let j = 0; j < L.D; j++) for (let i = 0; i < L.W; i++) {
      const k = L.kind[L.idx(i, j)];
      if (k === 0) continue;
      g.fillStyle = k === 2 ? '#56606b' : k === 3 ? '#8d8576' : L.top[L.idx(i, j)] > 1 ? '#c9bea7' : '#a69c88';
      g.fillRect(i * 2, j * 2, 2, 2);
    }
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    Object.entries(L.sites).forEach(([n, s]) => {
      g.fillStyle = 'rgba(255,209,102,.9)';
      g.fillText(n, (s.c[0] - L.x0) * 2, (s.c[1] - L.z0) * 2 + 9);
    });
    this.miniBase = c;
    this.miniL = L;
  }

  drawMinimap(view) {
    const g = this.miniCtx;
    const S = 210;
    const L = this.miniL;
    if (!L) return;
    const me = view.cam;
    const zoom = view.miniZoom || 2.1; // px per metre
    g.save();
    g.clearRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    // rotate so up on the minimap is where I look
    g.rotate(me.yaw);
    g.scale(zoom / 2, zoom / 2);
    g.drawImage(this.miniBase, -(me.x - L.x0) * 2, -(me.z - L.z0) * 2);
    g.restore();
    const toMini = (x, z) => {
      const dx = (x - me.x) * zoom; const dz = (z - me.z) * zoom;
      const c = Math.cos(me.yaw); const s = Math.sin(me.yaw);
      return [S / 2 + dx * c - dz * s, S / 2 + dx * s + dz * c];
    };
    const inside = ([x, y], m = 6) => x > m && y > m && x < S - m && y < S - m;
    view.smokes.forEach((z) => {
      const [x, y] = toMini(z.p[0], z.p[2]);
      g.fillStyle = 'rgba(160,165,185,.55)';
      g.beginPath(); g.arc(x, y, z.r * zoom, 0, 7); g.fill();
    });
    if (view.core) {
      const pt = toMini(view.core[0], view.core[2]);
      if (inside(pt)) { g.fillStyle = '#ff4655'; g.fillRect(pt[0] - 5, pt[1] - 5, 10, 10); }
    }
    view.dots.forEach((d) => {
      const pt = toMini(d.x, d.z);
      if (!inside(pt)) return;
      g.save();
      g.translate(pt[0], pt[1]);
      g.rotate(-d.yaw + me.yaw);
      g.fillStyle = d.color;
      g.beginPath();
      g.moveTo(0, -6); g.lineTo(5, 5); g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      if (d.ring) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
      g.restore();
    });
    // me
    g.fillStyle = '#ffd166';
    g.beginPath(); g.moveTo(S / 2, S / 2 - 7); g.lineTo(S / 2 + 6, S / 2 + 6); g.lineTo(S / 2 - 6, S / 2 + 6); g.fill();
  }

  // ───────── buy menu ─────────
  buyMenu(me, mode) {
    const ag = AGENT[me.agent];
    const owned = new Set([me.guns.primary, me.guns.secondary]);
    const credits = mode === 'core' ? me.credits : Infinity;
    const free = mode !== 'core';
    const cols = BUY_CATS.map(([cat, ids]) => `<div><h3>${cat}</h3>${ids.map((id) => {
      const w = WEAPON[id];
      const cls = owned.has(id) ? 'own' : !free && w.cost > credits ? 'no' : '';
      return `<button class="cb-item ${cls}" data-act="buy" data-arg="${id}"><b>${w.name.toUpperCase()}</b><small>${free ? 'FREE' : w.cost ? `¤ ${w.cost}` : 'FREE'}</small></button>`;
    }).join('')}</div>`).join('');
    const armor = mode === 'core' ? ARMOR.map((a) => `<button class="cb-item ${me.armor >= a.value ? 'own' : a.cost > credits ? 'no' : ''}" data-act="buy" data-arg="${a.id}"><b>${a.name.toUpperCase()}</b><small>¤ ${a.cost} · +${a.value}</small></button>`).join('') : '';
    const abil = mode === 'core' ? ['c', 'q'].map((k) => {
      const a = ag.abilities[k];
      const full = (me.charges[k] || 0) >= a.max;
      return `<button class="cb-item ${full ? 'own' : a.cost > credits ? 'no' : ''}" data-act="buy" data-arg="${k}"><b>${k.toUpperCase()} · ${a.name.toUpperCase()} (${me.charges[k] || 0}/${a.max})</b><small>¤ ${a.cost}</small></button>`;
    }).join('') : '';
    return `<div class="cb-panel" style="max-width:62em">
      <div class="cb-row" style="justify-content:space-between"><h2 style="margin:0">${free ? 'LOADOUT' : 'BUY'}</h2><span style="font-size:1.4em;color:#ffd166">${free ? '' : `¤ ${credits}`}</span></div>
      <div class="cb-buy">${cols}</div>
      ${mode === 'core' ? `<div class="cb-buy" style="grid-template-columns:1fr 1fr;margin-top:.6em"><div><h3>SHIELDS</h3>${armor}</div><div><h3>ABILITIES</h3>${abil}</div></div>` : ''}
      <div class="cb-row" style="margin-top:.8em"><button class="b" data-act="closebuy">Close (B)</button></div></div>`;
  }

  scoreboard(players, me, mode, score, online = false) {
    const ping = (p) => {
      if (p.bot) return '<td></td>';
      if (p.ping === null || p.ping === undefined) return '<td>–</td>';
      const c = p.ping < 80 ? '#7ff5a0' : p.ping < 150 ? '#ffd166' : '#ff6b6b';
      return `<td style="color:${c}">${p.ping} ms</td>`;
    };
    const rows = (list) => list.map((p) => `<tr class="${p.team}${p.id === me ? ' me' : ''}"><td>${esc(p.name)}${p.bot ? ' <small style="opacity:.6">BOT</small>' : ''}</td><td>${AGENT[p.agent].name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td>${mode === 'core' ? `<td>¤ ${p.credits}</td>` : ''}<td>${p.alive ? '' : '☠'}</td>${online ? ping(p) : ''}</tr>`).join('');
    const sorted = [...players].sort((a, b) => b.kills - a.kills);
    const head = `<tr><th>PLAYER</th><th>AGENT</th><th>K</th><th>D</th><th>A</th>${mode === 'core' ? '<th>CREDITS</th>' : ''}<th></th>${online ? '<th>PING</th>' : ''}</tr>`;
    if (mode !== 'core') return `<div class="cb-panel cb-sb"><h2>DEATHMATCH</h2><table>${head}${rows(sorted)}</table></div>`;
    return `<div class="cb-panel cb-sb"><h2>SCOREBOARD · ${score.red} – ${score.blue}</h2><table>${head}${rows(sorted.filter((p) => p.team === 'red'))}${rows(sorted.filter((p) => p.team === 'blue'))}</table></div>`;
  }

  agentCard(a, sel) {
    return `<button class="cb-agent${sel ? ' sel' : ''}" data-act="agent" data-arg="${a.id}"><div class="sw" style="background:linear-gradient(90deg,${a.color},${a.accent})"></div><b>${a.name.toUpperCase()}</b><small>${a.role.toUpperCase()}</small></button>`;
  }

  agentInfo(a) {
    const keys = { c: 'C', q: 'Q', e: 'E', x: 'X' };
    return `<div><h2 style="color:${a.color};margin:0">${a.name.toUpperCase()} <small style="font-size:.55em;color:#ece8e1aa">${a.role.toUpperCase()}</small></h2><p style="color:#ece8e1cc;margin:.3em 0">${esc(a.bio)}</p>
      <div class="cb-abl">${SLOTS.map((k) => { const ab = a.abilities[k]; return `<div><kbd>${keys[k]}</kbd><span><b>${esc(ab.name)}</b> ${k === 'x' ? `· ${ab.points} pts` : ab.free ? '· free' : `· ¤ ${ab.cost}`}<br><small>${esc(ab.desc)}</small></span></div>`; }).join('')}</div></div>`;
  }

  agentGrid(sel) { return `<div class="cb-agents">${AGENTS.map((a) => this.agentCard(a, a.id === sel)).join('')}</div>`; }
}

export function fmtTimer(t) { return fmtClock(t); }
