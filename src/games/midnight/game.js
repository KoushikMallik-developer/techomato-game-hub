// Midnight Pursuit: game loop, police pursuits, events, garage, HUD and menus.
import * as THREE from 'three';
import {
  clamp, lerp, damp, dampAngle, wrapAngle, headingTo,
  fmtMoney, fmtTime, CARS, carById, carStats, UPGRADES, upgradeCost, PAINTS, COP_TIERS, EVENTS, EVENT_LABEL,
  SAFEHOUSE, RIVALS, RACER_NAMES, HEAT_BOUNTY, COPS_FOR_HEAT, TOD, loadSave, writeSave,
  SPEED_CAMS, MILESTONES, FINISHES, RIM_FINISHES, CALIPERS, UNDERGLOW,
} from './data.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SEA_Y } from './city.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { makeMotionBlurPass, makeGradePass, applyGrade } from './post.js';
import { AudioFX } from './audio.js';
import { World, makeSky, makeStars, MAP_HALF, MAP_PX, canvasTexture, glowTexture } from './world.js';
import { Vehicle, Traffic } from './vehicles.js';
import { CarFactory, STYLES } from './cars3d.js';
import { ModelLibrary } from './models.js';
import { Skids, Particles, Rain, Trails } from './fx.js';
import { Multi } from './mp.js';

const TYPE_COLOR = { sprint: '#ffb000', circuit: '#ff6a00', speedtrap: '#26c6ff', tollbooth: '#b388ff', pursuit: '#ff2d55', rival: '#ff2d55', safehouse: '#39e27d', drift: '#ff3fd0', timetrial: '#7cff4f', knockout: '#ff4b2b', cam: '#ffffff' };
const TYPE_LETTER = { sprint: 'S', circuit: 'C', speedtrap: 'T', tollbooth: '⏱', pursuit: '★', safehouse: 'G', drift: 'D', timetrial: '◷', knockout: 'K' };
const RACE_KINDS = new Set(['sprint', 'circuit', 'rival', 'knockout']);
const LOOP_KINDS = new Set(['circuit', 'knockout']);
const HOLD_KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'hand', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro', KeyB: 'back' };
const ACTION_KEYS = { KeyH: 'photo', KeyF: 'fullscreen', KeyC: 'camera', KeyR: 'reset', KeyQ: 'sb', KeyE: 'sb', KeyM: 'map', Escape: 'pause', KeyP: 'pause', Enter: 'interact', NumpadEnter: 'interact', KeyT: 'chat' };
const PATROL_COUNT = 5;

const CSS = `
.mp{position:absolute;inset:0;overflow:hidden;font-family:'Chakra Petch','Segoe UI',system-ui,sans-serif;color:#f2f4f8;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-size:14px;line-height:1.3}
.mp *{box-sizing:border-box}
.mp [hidden]{display:none!important}
.mp-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;transition:filter .3s}
.mp.sb .mp-canvas{filter:saturate(.35) contrast(1.15) brightness(1.05)}
.mp-vig{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 8em 1em rgba(0,0,0,.65);transition:box-shadow .3s}
.mp.nos .mp-vig{box-shadow:inset 0 0 9em 2em rgba(40,150,255,.45)}
.mp.sb .mp-vig{box-shadow:inset 0 0 10em 3em rgba(150,80,255,.5)}
.mp-hud{position:absolute;inset:0;pointer-events:none}
.mp-tl{position:absolute;left:1.2em;top:1em;display:grid;gap:.25em}
.mp-money{font-size:1.5em;font-weight:700;letter-spacing:.02em;text-shadow:0 2px 4px #000}
.mp-heat{display:flex;gap:.2em;font-size:1.25em}
.mp-heat span{color:rgba(255,255,255,.18);text-shadow:0 1px 2px #000}
.mp-heat span.on{color:#ff2d55}.mp-heat span.car{color:rgba(255,176,0,.65)}
.mp-heat.flash span.on{animation:mpflash .5s infinite alternate}
@keyframes mpflash{to{color:#2b6bff}}
.mp-bounty{font-size:.95em;color:#ffb000;font-weight:600;text-shadow:0 1px 3px #000}
.mp-top{position:absolute;left:50%;top:.8em;transform:translateX(-50%);display:grid;justify-items:center;gap:.4em;width:min(30em,60%)}
.mp-ev{text-align:center;text-shadow:0 2px 4px #000}
.mp-ev-name{font-size:.8em;letter-spacing:.2em;text-transform:uppercase;color:#ffb000;font-weight:700}
.mp-ev-stats{font-size:1.3em;font-weight:700;font-variant-numeric:tabular-nums}
.mp-pur{width:100%;display:grid;gap:.3em;justify-items:center}
.mp-pur-label{font-weight:700;letter-spacing:.15em;font-size:1em;text-shadow:0 2px 4px #000}
.mp-meter{width:100%;height:.45em;background:rgba(0,0,0,.55);border-radius:1em;overflow:hidden}
.mp-meter i{display:block;height:100%;width:0;border-radius:1em}
.mp-evade i{background:linear-gradient(90deg,#39e27d,#9dffb0)}.mp-bust i{background:linear-gradient(90deg,#ff2d55,#ff8a8a)}
.mp-gps{display:flex;align-items:center;gap:.5em;background:rgba(8,10,18,.6);padding:.2em .7em;border-radius:2em;font-weight:600;font-variant-numeric:tabular-nums}
.mp-arrow{width:0;height:0;border-left:.5em solid transparent;border-right:.5em solid transparent;border-bottom:1em solid #ffb000;transition:transform .1s}
.mp-mini{position:absolute;left:1.2em;bottom:1.2em;width:12em;height:12em;border-radius:50%;border:3px solid rgba(20,20,22,.9);box-shadow:0 0 0 2px rgba(255,255,255,.35),0 4px 18px rgba(0,0,0,.6);background:#0a0d14}
.mp-speedo{position:absolute;right:1.2em;bottom:.8em;width:14em;height:14em}
.mp-tach{width:100%;height:100%}
.mp-spd{position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:.15em;text-shadow:none}
.mp-spd b{font-family:'Courier New',ui-monospace,monospace;font-size:2.1em;font-weight:700;color:#3a2600;background:linear-gradient(#e9c27a,#c8963f);border-radius:.25em;padding:.05em .35em;letter-spacing:.06em;font-variant-numeric:tabular-nums;line-height:1.1;box-shadow:inset 0 0 0 2px rgba(0,0,0,.35)}
.mp-spd small{font-size:.75em;letter-spacing:.12em;color:#fff;font-weight:700;text-shadow:0 1px 2px #000}
.mp-gear{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-family:'Courier New',ui-monospace,monospace;font-size:1.15em;font-weight:700;color:#3a2600;background:linear-gradient(#e9c27a,#c8963f);border-radius:.2em;padding:0 .4em}
.mp-bars{display:none}
.mp-race{position:absolute;right:1.2em;top:1em;display:grid;grid-template-columns:auto auto;gap:0;background:rgba(10,10,12,.72);border-radius:.3em;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.mp-race .pos{display:grid;place-content:center;padding:.3em .8em;font-size:1.9em;font-weight:700;line-height:1.05;text-align:center;border-right:2px solid rgba(255,255,255,.15)}
.mp-race .pos i{display:block;height:2px;background:#fff;margin:.08em 0}
.mp-race .info{display:grid;align-content:center;gap:.15em;padding:.35em .9em;font-weight:700;font-variant-numeric:tabular-nums}
.mp-race .time{color:#ffcf6a;font-size:1.3em;text-align:right}
.mp-race .pct{font-size:1em;letter-spacing:.06em}
.mp-bar{position:relative;height:.9em;background:rgba(0,0,0,.55);border-radius:.3em;overflow:hidden;border:1px solid rgba(255,255,255,.12)}
.mp-bar i{position:absolute;inset:0;width:0}
.mp-bar em{position:absolute;left:.5em;top:50%;transform:translateY(-50%);font-style:normal;font-size:.6em;letter-spacing:.18em;font-weight:700;text-shadow:0 1px 2px #000}
.mp-nos i{background:linear-gradient(90deg,#1a7cff,#3fd0ff)}.mp-sbm i{background:linear-gradient(90deg,#7c3cff,#d08bff)}
.mp-pops{position:absolute;left:50%;top:32%;transform:translateX(-50%);display:grid;justify-items:center;gap:.3em}
.mp-pop{font-size:1.25em;font-weight:700;letter-spacing:.06em;text-shadow:0 2px 6px #000;animation:mppop 1.8s ease-out forwards;white-space:nowrap}
.mp-pop.red{color:#ff4d6d}.mp-pop.gold{color:#ffb000}.mp-pop.blue{color:#3fd0ff}.mp-pop.green{color:#39e27d}.mp-pop.purple{color:#d08bff}
@keyframes mppop{0%{opacity:0;transform:scale(.7)}12%{opacity:1;transform:scale(1.08)}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-1.5em)}}
.mp-big{position:absolute;left:0;right:0;top:38%;text-align:center;display:grid;gap:.2em;text-shadow:0 4px 14px #000}
.mp-big b{font-size:4.2em;font-style:italic;letter-spacing:.04em;line-height:1}
.mp-big span{font-size:1.2em;font-weight:600}
.mp-big.red b{color:#ff2d55}.mp-big.green b{color:#39e27d}.mp-big.gold b{color:#ffb000}
.mp-prompt{position:absolute;left:50%;bottom:7.5em;transform:translateX(-50%);pointer-events:auto;background:rgba(8,10,18,.82);border:1px solid #ffb000;color:#fff;font:inherit;font-weight:600;padding:.6em 1.2em;border-radius:.4em;cursor:pointer;max-width:90%}
.mp-prompt kbd{background:#ffb000;color:#1a1200;border-radius:.25em;padding:0 .4em;margin-right:.5em;font-family:inherit}
.mp-pause{position:absolute;left:50%;bottom:1em;transform:translateX(-50%);pointer-events:auto;width:2.6em;height:2.6em;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(8,10,18,.55);color:#fff;font:700 .9em inherit;cursor:pointer}
.mp-touch{position:absolute;inset:auto 0 0 0;height:45%;pointer-events:none}
.mp-touch button{position:absolute;pointer-events:auto;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(10,14,24,.45);color:#fff;font:700 1em 'Chakra Petch',sans-serif;touch-action:none}
.mp-touch button.on{background:rgba(255,176,0,.55)}
.mp-touch [data-t=left]{left:1.2em;bottom:1.4em;width:5.5em;height:5.5em}
.mp-touch [data-t=right]{left:7.6em;bottom:1.4em;width:5.5em;height:5.5em}
.mp-touch [data-t=up]{right:1.2em;bottom:1.4em;width:6em;height:6em;background:rgba(57,226,125,.3)}
.mp-touch [data-t=down]{right:8.2em;bottom:1.2em;width:4.6em;height:4.6em;background:rgba(255,45,85,.3)}
.mp-touch [data-t=nitro]{right:1.8em;bottom:8.4em;width:4.4em;height:4.4em;background:rgba(26,124,255,.35)}
.mp-touch [data-t=hand]{right:7.6em;bottom:7em;width:4.2em;height:4.2em}
.mp-touch [data-t=sb]{right:14em;bottom:1.6em;width:4em;height:4em;background:rgba(124,60,255,.35);font-size:.85em}
.mp.touch .mp-mini{left:auto;right:1em;top:1em;bottom:auto;width:9em;height:9em}
.mp.touch .mp-race{right:auto;left:1em;top:5.6em}
.mp.touch .mp-speedo{bottom:auto;top:10.6em;right:.6em;width:9.5em;height:9.5em}
.mp.touch .mp-bars{right:1em;top:21em;bottom:auto;width:8em}
.mp.touch .mp-pause{left:auto;right:12.6em;top:1em;bottom:auto;transform:none}
.mp.touch .mp-prompt{bottom:auto;top:30%}
.mp-screen{position:absolute;inset:0;display:flex;pointer-events:auto;overflow:auto}
.mp-screen:empty{display:none}
.mp-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .35s}
.mp-fade.on{opacity:1}
.mp-panel{background:rgba(8,10,18,.86);border:1px solid rgba(255,255,255,.08);border-radius:.6em;padding:1.4em;backdrop-filter:blur(4px)}
.mp button.mp-b{font:inherit;font-weight:600;color:#f2f4f8;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:.35em;padding:.65em 1em;cursor:pointer;text-align:left;letter-spacing:.04em}
.mp button.mp-b:hover{background:rgba(255,176,0,.16);border-color:#ffb000}
.mp button.mp-b:focus-visible{outline:2px solid #fff;outline-offset:2px}
.mp button.mp-b.primary{background:#ffb000;color:#1a1200;border-color:#ffb000}
.mp button.mp-b.primary:hover{background:#ffc53d}
.mp button.mp-b:disabled{opacity:.4;cursor:default}
.mp-menu{margin:auto auto auto 5%;width:min(26em,90%);display:grid;gap:1.1em;padding:1.5em 0}
.mp-home-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,rgba(6,7,16,.92) 0,rgba(6,7,16,.6) 38%,rgba(6,7,16,0) 68%),linear-gradient(0deg,rgba(6,7,16,.6),transparent 30%)}
.mp-home{position:relative;margin:auto auto auto 5%;width:min(28em,90%);display:grid;gap:.6em;padding:1.2em 0}
.mp-logo{display:grid;line-height:.86;font-style:italic;font-weight:700;transform:skewX(-6deg);margin-bottom:.2em}
.mp-logo span{font-size:3.9em;letter-spacing:.02em;color:#fff;text-shadow:0 0 .12em rgba(80,220,255,.9),0 0 .5em rgba(40,160,255,.55),0 .08em 0 #0a0c18}
.mp-logo b{font-size:4.3em;letter-spacing:.07em;color:#ffb000;text-shadow:0 0 .1em rgba(255,176,0,.9),0 0 .5em rgba(255,120,0,.55),0 .08em 0 #0a0c18}
.mp-home .mp-sub{margin:0 0 .5em}
.mp-k{position:relative;display:grid;text-align:left;gap:.1em;padding:.7em 2.6em .7em 1.1em;border:0;cursor:pointer;font:inherit;color:#f2f4f8;transform:skewX(-12deg);
  background:linear-gradient(90deg,rgba(14,16,30,.85),rgba(14,16,30,.55));box-shadow:inset 3px 0 0 rgba(255,255,255,.18);transition:transform .15s,box-shadow .15s,background .15s}
.mp-k>*{transform:skewX(12deg)}
.mp-k span{font-size:1.25em;font-weight:700;font-style:italic;letter-spacing:.05em;text-transform:uppercase}
.mp-k small{color:#aab3c6;font-size:.82em}
.mp-k i{position:absolute;right:1em;top:50%;font-style:normal;font-size:1.3em;transform:translateY(-50%) skewX(12deg)}
.mp-k:hover,.mp-k:focus-visible{outline:none;transform:skewX(-12deg) translateX(.5em);box-shadow:inset 4px 0 0 #3fd0ff,0 0 1.2em rgba(63,208,255,.25)}
.mp-k.hero{background:linear-gradient(90deg,#ffb000,#ff7a00);color:#1a1000;box-shadow:0 0 1.6em rgba(255,150,0,.35)}
.mp-k.hero small{color:#3a2400}
.mp-k.hero span{font-size:1.6em}
.mp-k.hero:hover,.mp-k.hero:focus-visible{box-shadow:0 0 2em rgba(255,150,0,.6)}
.mp-krow{display:grid;grid-template-columns:repeat(3,1fr);gap:.45em}
.mp-k.sm{padding:.6em .8em;text-align:center}
.mp-k.sm span{font-size:1em}
.mp-links{display:flex;flex-wrap:wrap;gap:.2em 1.2em;margin-top:.3em}
.mp-links button{border:0;background:none;font:inherit;font-weight:600;color:#aab3c6;cursor:pointer;padding:.25em 0;border-bottom:2px solid transparent;letter-spacing:.04em}
.mp-links button:hover,.mp-links button:focus-visible{color:#fff;border-bottom-color:#3fd0ff;outline:none}
.mp-card{position:absolute;right:3%;bottom:5%;width:min(19em,36%);padding:1em 1.1em;background:rgba(10,12,24,.82);border:1px solid rgba(63,208,255,.25);box-shadow:0 0 2em rgba(63,208,255,.12);transform:skewX(-6deg);display:grid;gap:.5em}
.mp-card>*{transform:skewX(6deg)}
.mp-card-h{display:flex;justify-content:space-between;align-items:center;font-size:.8em;letter-spacing:.16em;text-transform:uppercase;color:#aab3c6}
.mp-heat{color:#ff2d55;letter-spacing:.05em;font-size:1.2em;text-shadow:0 0 .4em rgba(255,45,85,.6)}
.mp-heat em{font-style:normal;color:rgba(255,255,255,.18);text-shadow:none}
.mp-card-cash{font-size:2.1em;font-weight:700;font-style:italic;color:#b6ff3b;text-shadow:0 0 .4em rgba(182,255,59,.35)}
.mp-card-g{display:grid;grid-template-columns:repeat(3,1fr);gap:.4em;font-size:.75em;color:#aab3c6;text-transform:uppercase;letter-spacing:.08em}
.mp-card-g b{display:block;color:#fff;font-size:1.45em;letter-spacing:0}
.mp-card-bar{height:.35em;background:rgba(255,255,255,.1)}
.mp-card-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb000,#ff2d55)}
@media (max-width:760px){.mp-card{display:none}.mp-logo span{font-size:2.8em}.mp-logo b{font-size:3.1em}}
@media (max-height:500px){.mp-home{gap:.35em}.mp-logo span{font-size:2.3em}.mp-logo b{font-size:2.5em}.mp-home .mp-sub,.mp-k small{display:none}.mp-card{display:none}.mp-k{padding:.45em 2.2em .45em .9em}}
.mp-title{display:grid;line-height:.9;font-style:italic;text-shadow:0 4px 18px rgba(0,0,0,.8)}
.mp-title span{font-size:3.4em;font-weight:700;letter-spacing:.02em}
.mp-title b{font-size:3.4em;color:#ffb000;letter-spacing:.06em}
.mp-sub{margin:0;color:#c9cfdb;text-shadow:0 2px 6px #000}
.mp-nav{display:grid;gap:.45em}
.mp-nav .mp-b{font-size:1.1em;background:rgba(8,10,18,.72)}
.mp-foot{display:flex;flex-wrap:wrap;gap:.4em 1.2em;color:#c9cfdb;font-size:.85em;text-shadow:0 1px 3px #000}
.mp-foot b{color:#ffb000}
.mp-wrap{margin:auto;width:min(46em,94%);display:grid;gap:1em}
.mp-panel.mp-wrap{padding:1.4em}
.mp-h{display:flex;align-items:baseline;justify-content:space-between;gap:1em;flex-wrap:wrap}
.mp-h h2{margin:0;font-size:1.7em;font-style:italic}
.mp-h small{color:#9aa3b5}
.mp-list{display:grid;gap:.5em}
.mp-row{display:flex;align-items:center;gap:1em;justify-content:space-between;padding:.7em .9em;background:rgba(255,255,255,.04);border-radius:.4em;border:1px solid rgba(255,255,255,.06);flex-wrap:wrap}
.mp-row .t{display:grid;gap:.1em;min-width:0}
.mp-row .t b{font-size:1.05em}.mp-row .t small{color:#9aa3b5}
.mp-tag{font-size:.7em;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:.15em .5em;border-radius:.3em;background:rgba(255,255,255,.08)}
.mp-ok{color:#39e27d}.mp-lock{color:#9aa3b5}
.mp-garage{display:grid;grid-template-columns:15em 1fr 21em;width:100%;gap:1em;padding:1em}
.mp-glist{display:grid;gap:.4em;align-content:start;overflow:auto}
.mp-gcar{display:grid!important;gap:.15em}
.mp-gcar.sel{border-color:#ffb000!important;background:rgba(255,176,0,.14)!important}
.mp-gcar small{color:#9aa3b5;font-weight:500}
.mp-gdetail{grid-column:3;display:grid;gap:.8em;align-content:start;overflow:auto}
.mp-gdetail h2{margin:0;font-size:1.6em;font-style:italic}
.mp-gdetail p{margin:0;color:#c9cfdb}
.mp-stat{display:grid;grid-template-columns:7em 1fr 5.5em;align-items:center;gap:.6em;font-size:.85em}
.mp-stat .bar{height:.5em;background:rgba(255,255,255,.08);border-radius:1em;overflow:hidden}
.mp-stat .bar i{display:block;height:100%;background:#ffb000}
.mp-stat span:last-child{text-align:right;font-variant-numeric:tabular-nums}
.mp-upg{display:grid;grid-template-columns:1fr auto;gap:.3em .8em;align-items:center}
.mp-pips{display:flex;gap:.25em}.mp-pips i{width:1.2em;height:.4em;background:rgba(255,255,255,.15);border-radius:.2em}.mp-pips i.on{background:#3fd0ff}
.mp-swatches{display:flex;flex-wrap:wrap;gap:.4em}
.mp-sw{width:2em;height:2em;border-radius:50%;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0}
.mp-sw.sel{border-color:#fff;box-shadow:0 0 0 2px #ffb000}
.mp-opts{display:flex;flex-wrap:wrap;gap:.35em}
.mp-cust{display:grid;grid-template-columns:auto 1fr;gap:.35em .8em;align-items:center;margin:.3em 0 .6em}
.mp-cust .mp-b{padding:.3em .6em;font-size:.85em}
.mp-photo{position:absolute;right:1em;top:1em;width:min(24em,92%);max-height:calc(100% - 2em);overflow:auto}
.mp-screen:has(.mp-photo){background:none!important;pointer-events:none}
.mp-screen .mp-photo{pointer-events:auto}
.mp-opts .mp-b{padding:.45em .8em}
.mp-opts .mp-b.sel{background:#ffb000;color:#1a1200;border-color:#ffb000}
.mp-keys{display:grid;grid-template-columns:auto 1fr;gap:.35em 1em;font-size:.9em}
.mp-keys kbd{font-family:inherit;background:rgba(255,255,255,.1);padding:.05em .5em;border-radius:.3em;white-space:nowrap;justify-self:start}
.mp-map{display:grid;grid-template-columns:1fr 17em;gap:1em;width:100%;padding:1em}
.mp-map canvas{width:100%;height:100%;object-fit:contain;min-height:0;cursor:crosshair}
.mp-results table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.mp-results td{padding:.45em .5em;border-bottom:1px solid rgba(255,255,255,.07)}
.mp-win{transform:skewX(-8deg);display:grid;gap:.1em;background:linear-gradient(90deg,rgba(0,0,0,.75),rgba(0,0,0,.25));padding:.6em 1.2em;border-left:4px solid #b6ff3b}
.mp-win b{font-size:2.6em;font-style:italic;color:#b6ff3b;line-height:1;letter-spacing:.04em}
.mp-win.lose{border-color:#ff2d55}.mp-win.lose b{color:#ff2d55}
.mp-win span{font-size:1.25em;font-weight:700;letter-spacing:.04em}
.mp-results tr.me td{color:#ffb000;font-weight:700}
.mp-btns{display:flex;gap:.5em;flex-wrap:wrap}
@media (max-aspect-ratio: 4/3){.mp-garage{grid-template-columns:1fr;grid-auto-rows:auto}.mp-gdetail{grid-column:1}.mp-glist{grid-template-columns:repeat(auto-fill,minmax(10em,1fr))}.mp-map{grid-template-columns:1fr}}
`;

function ensureFont() {
  if (document.getElementById('mp-font')) return;
  const l = document.createElement('link');
  l.id = 'mp-font';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&display=swap';
  document.head.appendChild(l);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Expand an event's waypoints into the road route between them: dense path points (x, z, y),
// checkpoint indices into the path (every waypoint plus extras on long legs), and the junctions passed.
function expandRoute(city, route, closed) {
  const wps = closed ? [...route, route[0]] : route;
  const ids = [];
  wps.forEach(([x, z]) => {
    const id = city.nearestNode(x, z).id;
    if (ids[ids.length - 1] !== id) ids.push(id);
  });
  // node/edge sequence through every waypoint; seq[i].edge leads from seq[i].node to seq[i + 1].node
  let seq = [{ node: ids[0], edge: null, wp: true }];
  for (let k = 1; k < ids.length; k++) {
    const steps = city.route(ids[k - 1], ids[k]);
    if (!steps || steps.length < 2) continue;
    seq[seq.length - 1].edge = steps[0].edge;
    steps.slice(1).forEach((st, q) => seq.push({ node: st.node, edge: st.edge, wp: q === steps.length - 2 }));
  }
  // no out-and-back spurs: going down a road and straight back up it is cut out
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i + 2 < seq.length; i++) {
      if (seq[i].edge !== null && seq[i].edge === seq[i + 1].edge) {
        seq[i] = { node: seq[i].node, edge: seq[i + 2].edge, wp: seq[i].wp || seq[i + 1].wp || seq[i + 2].wp };
        seq.splice(i + 1, 2);
        changed = true;
        break;
      }
    }
    if (closed && seq.length > 3 && seq[0].edge === seq[seq.length - 2].edge) {
      seq = seq.slice(1, -1);
      seq[seq.length - 1] = { node: seq[0].node, edge: null, wp: true };
      seq[0].wp = true;
      changed = true;
    }
  }
  const n0 = city.nodes[seq[0].node];
  const path = [{ x: n0.x, z: n0.z, y: n0.y, hw: 8 }];
  const nodes = [{ id: n0.id, pi: 0, prevEdge: null, nextEdge: null }];
  const wpIdx = [0];
  for (let q = 0; q < seq.length - 1; q++) {
    const n = seq[q].node;
    const e = city.edges[seq[q].edge];
    const fwd = e.a === n;
    const pts = fwd ? e.pts : [...e.pts].reverse();
    const ys = fwd ? e.y : [...e.y].reverse();
    // divided roads: race on the right-hand carriageway, clear of the median barrier
    const T = e.T;
    const off = T.barrier ? T.median + (T.lanes * T.laneW) / 2 : 0;
    const hw = T.barrier ? (T.lanes * T.laneW) / 2 : e.hw;
    for (let i = 1; i < pts.length; i++) {
      let x = pts[i][0];
      let z = pts[i][1];
      if (off) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        // fade the offset in and out at the ends so the line meets the junction
        const k = i === pts.length - 1 ? 0.5 : 1;
        x -= ((b[1] - a[1]) / L) * off * k;
        z += ((b[0] - a[0]) / L) * off * k;
      }
      path.push({ x, z, y: ys[i], hw });
    }
    nodes[nodes.length - 1].nextEdge = e.id;
    nodes.push({ id: seq[q + 1].node, pi: path.length - 1, prevEdge: e.id, nextEdge: null });
    if (seq[q + 1].wp || q === seq.length - 2) wpIdx.push(path.length - 1);
  }
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  // checkpoints: each waypoint, plus one every ~350 m on long legs
  const cpIdx = [0];
  for (let k = 1; k < wpIdx.length; k++) {
    const a = wpIdx[k - 1];
    const b = wpIdx[k];
    const len = cum[b] - cum[a];
    const extra = Math.floor(len / 350);
    for (let q = 1; q <= extra; q++) {
      const target = cum[a] + (len * q) / (extra + 1);
      let i = a;
      while (i < b && cum[i] < target) i++;
      if (i > cpIdx[cpIdx.length - 1] + 3 && i < b - 3) cpIdx.push(i);
    }
    if (b > cpIdx[cpIdx.length - 1]) cpIdx.push(b);
  }
  return { path, cum, cpIdx, wpIdx, nodes };
}

// point and direction at distance s along a dense path
function pathAt(path, cum, s) {
  s = clamp(s, 0, cum[cum.length - 1]);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = path[i - 1];
  const b = path[i];
  const L = Math.max(1e-6, cum[i] - cum[i - 1]);
  const t = clamp((s - cum[i - 1]) / L, 0, 1);
  const dx = (b.x - a.x) / L;
  const dz = (b.z - a.z) / L;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), dx, dz, i };
}

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.save = loadSave();
    this.keys = new Set();
    this.touch = {};
    this.padPrev = [];
    this.timers = new Set();
    this.mode = 'menu';
    this.overlay = null;
    this.active = true;
    this.time = 0;
    this.camMode = 0;
    this.camH = 0;
    this.camY = 3;
    this.shake = 0;
    this.orbitA = 0;
    this.freeze = 0;
    this.sb = { on: false, meter: 0.6 };
    this.drift = { score: 0, idle: 0 };
    this.infractionT = 0;
    this.pursuit = null;
    this.event = null;
    this.gps = null;
    this.cops = [];
    this.racers = [];
    this.roadblocks = [];
    this.heli = null;
    this.patrolT = 0;
    this.lastGear = 1;
    this.skidAcc = 0;
    this.promptTarget = null;
    this.hudCache = {};

    this.root = document.createElement('div');
    this.root.className = 'mp';
    this.root.tabIndex = 0;
    container.appendChild(this.root);
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);
    ensureFont();

    this.initRenderer();
    this.world = new World(1337, this.save.settings.quality);
    Vehicle.ground = (x, z) => this.world.groundAt(x, z, -999).h;
    this.scene.add(this.world.group);
    this.initLights();
    this.factory = new CarFactory();
    if (opts.assetBase) {
      this.models = new ModelLibrary(opts.assetBase);
      const lengthFor = (k) => {
        const style = k === 'cop' ? 'sedan' : k.startsWith('traffic-') ? k.slice(8) : carById(k).style;
        return (STYLES[style] || STYLES.sedan).L;
      };
      this.models.loadAll(lengthFor).then((n) => {
        if (!n || !this.player) return;
        this.factory.models = this.models;
        this.buildPlayer();
        this.traffic.rebuild();
      });
    }
    const glow = glowTexture();
    this.fx = {
      skids: new Skids(this.scene),
      smoke: new Particles(this.scene, glow, 70, { color: 0xc8c8c8 }),
      sparks: new Particles(this.scene, glow, 60, { additive: true, color: 0xffa040 }),
      rain: new Rain(this.scene),
      trails: new Trails(this.scene),
    };
    const q = this.save.settings.quality;
    this.traffic = new Traffic(this.factory, this.scene, this.world, q === 'low' ? 18 : q === 'medium' ? 26 : 32);
    this.buildPlayer();
    this.toSafehouse();
    this.traffic.cars.forEach((v) => this.traffic.spawnAround(v, this.player.x, this.player.z, 70, 420));
    this.buildMarkers();
    this.buildSpeedCams();
    this.buildGates();
    this.audio = new AudioFX(this.save.settings.volume);
    this.buildUI();
    this.multi = new Multi(this);
    this.bindInput();
    this.applySettings();
    this.loadRoadTextures();
    this.showMenu();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ───────────────────────── setup ─────────────────────────
  initRenderer() {
    const q = this.save.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'mp-canvas';
    this.root.appendChild(this.canvas);
    const vig = document.createElement('div');
    vig.className = 'mp-vig';
    this.root.appendChild(vig);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 60, 640);
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 6000);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // post-processing: HDR render -> bloom -> tone mapping/sRGB -> anti-aliasing
    this.useComposer = q !== 'low';
    if (this.useComposer) {
      const rt = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.7, 0.5, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.blurPass = makeMotionBlurPass();
      this.composer.addPass(this.blurPass);
      this.gradePass = makeGradePass();
      this.composer.addPass(this.gradePass);
      if (q !== 'high') this.composer.addPass(new SMAAPass(1280, 720));
      // live reflections of the street on the player's car
      this.cubeRT = new THREE.WebGLCubeRenderTarget(q === 'high' ? 256 : 128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      this.cubeCam = new THREE.CubeCamera(0.5, 1200, this.cubeRT);
      this.cubeFrame = 0;
    }
  }

  initLights() {
    const S = this.scene;
    this.sky = makeSky();
    this.stars = makeStars();
    this.physSky = new Sky();
    this.physSky.scale.setScalar(4400);
    this.physSky.frustumCulled = false;
    S.add(this.sky, this.stars, this.physSky);
    this.envSky = new Sky();
    this.envSky.scale.setScalar(60);
    this.skyEnvScene = new THREE.Scene();
    this.skyEnvScene.add(this.envSky);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    S.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    const sq = this.save.settings.quality;
    this.sun.shadow.mapSize.set(sq === 'high' ? 4096 : 2048, sq === 'high' ? 4096 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    S.add(this.sun, this.sun.target);
    this.headlight = new THREE.SpotLight(0xfff2d8, 6, 110, 0.5, 0.6, 0);
    S.add(this.headlight, this.headlight.target);
    this.copLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff0000, 0, 34, 0);
      S.add(l);
      return l;
    });
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.sky.material));
    this.envLights = new THREE.Group();
    const cols = [0xffd9a0, 0xcfe3ff, 0xffffff, 0xff9a5a];
    for (let k = 0; k < 24; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 6 + (k % 4) * 3, 3), new THREE.MeshBasicMaterial({ color: cols[k % 4] }));
      const a = (k / 24) * Math.PI * 2;
      m.position.set(Math.cos(a) * 38, 2, Math.sin(a) * 38);
      this.envLights.add(m);
    }
    this.envScene.add(this.envLights);
  }

  buildPlayer() {
    const old = this.player;
    const def = carById(this.save.car);
    const color = this.save.paint[def.id] || def.color;
    const parts = this.factory.build(def.style, color, { flames: true, modelKey: def.id, ...this.customOpts(def) });
    this.applyCustom(parts, def);
    this.scene.add(parts.group);
    if (!this.beamGeo) {
      const g = new THREE.ConeGeometry(3.2, 26, 24, 1, true);
      g.translate(0, -13, 0);
      g.rotateX(-Math.PI / 2);
      this.beamGeo = g;
      // soft volumetric-looking beam: bright near the lamp, fading with distance and toward the cone's silhouette
      this.beamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(0xfff1d6) }, strength: { value: 0.16 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 color; uniform float strength; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float along = pow(clamp(vUv.y, 0.0, 1.0), 2.2); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); gl_FragColor = vec4(color * strength * along * edge, 1.0); }',
      });
    }
    this.beams = [-1, 1].map((s) => {
      const m = new THREE.Mesh(this.beamGeo, this.beamMat);
      m.position.set(s * 0.6, 0.75, parts.dims.L / 2);
      m.rotation.x = -0.04;
      m.visible = !this.tod || this.tod.headlights;
      parts.group.add(m);
      return m;
    });
    const stats = carStats(def, this.save.upg[def.id] || {});
    const v = new Vehicle(stats, parts, { kind: 'player' });
    if (old) {
      v.place(old.x, old.z, old.h);
      this.factory.dispose(old.parts);
    }
    v.nitro = stats.nitroCap * 0.6;
    if (this.cubeRT) {
      parts.paint.envMap = this.cubeRT.texture;
      parts.paint.envMapIntensity = 1.4;
      parts.paint.needsUpdate = true;
    }
    this.player = v;
    this.playerDef = def;
    v.sync(0.016);
    if (this.mode === 'garage') parts.group.visible = false;
  }

  // put a car on the road nearest (x, z), in the right-hand lane, facing along the road
  placeOnRoad(v, x, z, prefHeading = null, speed = 0, laneOff = null) {
    const C = this.world.city;
    const rd = C.nearestRoad(x, z, v.y !== undefined && v.y > -100 ? v.y : null);
    if (!rd) { v.place(x, z, prefHeading || 0, speed); return; }
    let dir = 1;
    if (prefHeading !== null) dir = Math.sin(prefHeading) * rd.dx + Math.cos(prefHeading) * rd.dz >= 0 ? 1 : -1;
    const tx = rd.dx * dir;
    const tz = rd.dz * dir;
    const off = laneOff !== null ? laneOff : rd.e.T.median + rd.e.T.laneW * 0.5;
    const elevated = rd.e.type === 'expressway' && rd.y - C.terrainAt(rd.x, rd.z).h > 0.3;
    v.place(rd.x - tz * off, rd.z + tx * off, Math.atan2(tx, tz), speed, elevated ? rd.y : null);
  }

  toSafehouse() {
    if (!this.safehouse) {
      const rd = this.world.city.nearestRoad(SAFEHOUSE[0], SAFEHOUSE[1], null, 300);
      this.safehouse = { x: rd.x, z: rd.z, h: Math.atan2(rd.dx, rd.dz) };
    }
    // just short of the safehouse marker, facing it
    const sh = this.safehouse;
    this.placeOnRoad(this.player, sh.x - Math.sin(sh.h) * 28, sh.z - Math.cos(sh.h) * 28, sh.h);
    this.camH = this.player.h;
  }

  iconTexture(letter, color) {
    return canvasTexture(128, 128, (g) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(64, 64, 56, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,.45)';
      g.stroke();
      g.fillStyle = '#0b0d12';
      g.font = 'bold 64px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, 64, 68);
    });
  }

  // ───────────────────────── customization ─────────────────────────
  customOpts(def) {
    const cu = this.save.custom[def.id] || {};
    return { caliper: cu.caliper ?? 0, rim: cu.rim || 'silver', matte: cu.finish === 'matte' };
  }

  applyCustom(parts, def) {
    const cu = this.save.custom[def.id] || {};
    const p = parts.paint;
    if (p && p.isMeshPhysicalMaterial) {
      if (cu.finish === 'metallic') { p.metalness = 0.8; p.roughness = 0.22; p.clearcoat = 1; }
      else if (cu.finish === 'pearl') { p.metalness = 0.55; p.roughness = 0.14; p.clearcoat = 1; p.clearcoatRoughness = 0.02; p.envMapIntensity = 1.5; }
      else if (cu.finish === 'matte') { p.metalness = 0.1; p.roughness = 0.6; p.clearcoat = 0.05; }
      p.needsUpdate = true;
    }
    if (cu.glow) {
      const c = new THREE.Color(cu.glow);
      const L = parts.dims.L; const W = parts.dims.W;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.3, L * 1.05), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, map: this.glowTex || (this.glowTex = glowTexture()) }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.04;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.6, L * 1.6), plane.material.clone());
      halo.material.opacity = 0.22;
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.03;
      parts.group.add(plane, halo);
      parts.ownGeo.push(halo.geometry);
      parts.own.push(halo.material);
      parts.ownGeo.push(plane.geometry);
      parts.own.push(plane.material);
    }
  }

  // ───────────────────────── speed cameras ─────────────────────────
  buildSpeedCams() {
    const C = this.world.city;
    const pole = new THREE.CylinderGeometry(0.09, 0.11, 5.2, 8);
    pole.translate(0, 2.6, 0);
    const head = new THREE.BoxGeometry(0.5, 0.42, 0.8);
    const metal = new THREE.MeshStandardMaterial({ color: 0x5b6068, metalness: 0.7, roughness: 0.4 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: 0.6 });
    this.cams = SPEED_CAMS.map((def) => {
      const rd = C.nearestRoad(def.x, def.z);
      const g = new THREE.Group();
      const side = (rd.hw || 7) + 1.2;
      const x = rd.x - rd.dz * side; const z = rd.z + rd.dx * side;
      g.position.set(x, rd.y, z);
      g.rotation.y = Math.atan2(rd.dx, rd.dz);
      g.add(new THREE.Mesh(pole, metal));
      const h = new THREE.Mesh(head, yellow);
      h.position.set(0.3, 5.1, 0);
      g.add(h);
      const flash = new THREE.PointLight(0xffffff, 0, 30, 2);
      flash.position.set(0, 5.1, 0.6);
      g.add(flash);
      this.scene.add(g);
      return { def, x: rd.x, z: rd.z, group: g, flash, inside: false, flashT: 0 };
    });
  }

  updateSpeedCams() {
    if (!this.cams) return;
    const P = this.player;
    const s = this.save;
    this.cams.forEach((c) => {
      c.flashT = Math.max(0, c.flashT - 0.016);
      c.flash.intensity = c.flashT > 0 ? 80 * (c.flashT / 0.15) : 0;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      const inside = d < 16;
      if (inside && !c.inside && P.speed > 8) {
        const kmh = Math.round(P.speed * 3.6);
        const best = s.cams[c.def.id] || 0;
        c.flashT = 0.15;
        let msg = `SPEED CAM · ${c.def.name.toUpperCase()} · ${this.speedUnits(P.speed)} ${this.unitLabel()}`;
        if (kmh > best) { s.cams[c.def.id] = kmh; if (best) msg += ' · NEW RECORD'; }
        if (kmh >= c.def.target && best < c.def.target) { s.money += c.def.reward; msg += ` · +${fmtMoney(c.def.reward)}`; this.audio.money(); }
        this.popup(msg, kmh >= c.def.target ? 'green' : 'blue');
        if (this.pursuit) this.pursuit.bounty += Math.round(kmh * 2);
        this.persist();
      }
      c.inside = inside;
    });
  }

  // ───────────────────────── milestones ─────────────────────────
  checkMilestones() {
    const s = this.save;
    MILESTONES.forEach((m) => {
      if (s.milestones[m.id] || !m.test(s)) return;
      s.milestones[m.id] = Date.now();
      s.money += m.reward;
      this.popup(`MILESTONE · ${m.name.toUpperCase()} · +${fmtMoney(m.reward)}`, 'gold');
      this.audio.money();
      this.persist();
    });
  }

  showMilestones() {
    const s = this.save;
    const done = MILESTONES.filter((m) => s.milestones[m.id]).length;
    const ms = MILESTONES.map((m) => `<div class="mp-row"><div class="t"><b>${esc(m.name)} ${s.milestones[m.id] ? '<span class="mp-ok">✓</span>' : ''}</b><small>${esc(m.desc)} · ${fmtMoney(m.reward)}</small></div></div>`).join('');
    const cams = SPEED_CAMS.map((c) => {
      const best = s.cams[c.id] || 0;
      const kmh = (v) => (this.save.settings.units === 'mph' ? Math.round(v / 1.609) : v);
      return `<div class="mp-row"><div class="t"><b>${esc(c.name)} ${best >= c.target ? '<span class="mp-ok">✓</span>' : ''}</b><small>Target ${kmh(c.target)} ${this.unitLabel().toLowerCase()} · Best ${best ? `${kmh(best)} ${this.unitLabel().toLowerCase()}` : '—'} · ${fmtMoney(c.reward)}</small></div><button class="mp-b" data-act="gpscam" data-arg="${c.id}">Set GPS</button></div>`;
    }).join('');
    const st = s.stats;
    this.setScreen(`<div class="mp-wrap mp-panel"><div class="mp-h"><h2>Milestones</h2><small>${done}/${MILESTONES.length} complete</small></div>
      <div class="mp-list">${ms}</div>
      <div class="mp-h"><h2>Speed cameras</h2><small>Fly past them as fast as you can. Beat the target once for a cash bonus.</small></div>
      <div class="mp-list">${cams}</div>
      <div class="mp-foot"><span>Distance <b>${(st.distance / 1000 || 0).toFixed(1)} km</b></span><span>Best drift <b>${Math.round(st.bestDrift || 0).toLocaleString('en-US')}</b></span><span>Near misses <b>${st.nearMisses || 0}</b></span><span>Longest pursuit <b>${fmtTime(st.longestPursuit || 0)}</b></span><span>Top heat <b>${st.maxHeat || 0}</b></span></div>
      <div class="mp-btns"><button class="mp-b" data-act="back">Back</button></div></div>`);
  }

  // ───────────────────────── photo mode ─────────────────────────
  enterPhoto() {
    if (this.mode !== 'play' || (this.overlay && this.overlay !== 'pause')) return;
    const P = this.player;
    this.overlay = 'photo';
    this.audio.suspend();
    this.photo = this.photo || { fov: 45, exposure: 0, dof: true, filter: this.save.settings.style || 'rockport', hideUi: true, blur: 4 };
    this.photoCam = { yaw: P.h + Math.PI * 0.8, pitch: 0.18, dist: 7, tx: P.x, ty: P.y + 0.8, tz: P.z };
    this.ui.hud.hidden = this.photo.hideUi;
    this.ui.touch.hidden = true;
    if (!this.bokeh && this.composer) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 7, aperture: 0.004, maxblur: 0.01 });
      this.composer.insertPass(this.bokeh, 1);
    }
    if (this.bokeh) this.bokeh.enabled = this.photo.dof;
    if (!this.onPhotoDrag) {
      let last = null;
      this.onPhotoDrag = (e) => {
        if (this.overlay !== 'photo') return;
        if (e.type === 'pointerdown') { last = [e.clientX, e.clientY]; return; }
        if (e.type === 'pointerup' || e.type === 'pointercancel') { last = null; return; }
        if (!last) return;
        this.photoCam.yaw -= (e.clientX - last[0]) * 0.006;
        this.photoCam.pitch = clamp(this.photoCam.pitch + (e.clientY - last[1]) * 0.004, -0.15, 1.3);
        last = [e.clientX, e.clientY];
      };
      this.onPhotoWheel = (e) => { if (this.overlay === 'photo') { this.photoCam.dist = clamp(this.photoCam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 2.5, 30); e.preventDefault(); } };
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((t) => this.canvas.addEventListener(t, this.onPhotoDrag));
      this.canvas.addEventListener('wheel', this.onPhotoWheel, { passive: false });
    }
    this.renderPhotoPanel();
  }

  renderPhotoPanel() {
    const ph = this.photo;
    const opt = (k, vals) => vals.map(([v, l]) => `<button class="mp-b ${String(ph[k]) === String(v) ? 'sel' : ''}" data-act="photo-set" data-arg="${k}:${v}">${l}</button>`).join('');
    this.ui.hud.hidden = ph.hideUi;
    if (this.bokeh) this.bokeh.enabled = ph.dof;
    if (this.gradePass) applyGrade(this.gradePass, ph.filter, this.save.settings.tod);
    this.setScreen(`<div class="mp-photo mp-panel"><div class="mp-h"><h2>Photo mode</h2><small>Drag to orbit · wheel to zoom</small></div>
      <div class="mp-cust"><span>Lens</span><div class="mp-opts">${opt('fov', [[28, '28°'], [45, '45°'], [62, '62°'], [80, '80°']])}</div>
      <span>Exposure</span><div class="mp-opts">${opt('exposure', [[-0.3, '−'], [0, '0'], [0.3, '+'], [0.6, '++']])}</div>
      <span>Depth of field</span><div class="mp-opts">${opt('dof', [[true, 'On'], [false, 'Off']])}</div>
      <span>Look</span><div class="mp-opts">${opt('filter', [['rockport', 'Street Haze'], ['natural', 'Natural']])}</div>
      <span>HUD</span><div class="mp-opts">${opt('hideUi', [[true, 'Hidden'], [false, 'Shown']])}</div></div>
      <div class="mp-btns"><button class="mp-b primary" data-act="photo-save">Save photo</button><button class="mp-b" data-act="photo-exit">Back to driving</button></div></div>`);
  }

  updatePhoto(dt) {
    const c = this.photoCam;
    const ph = this.photo;
    const P = this.player;
    c.tx = P.x; c.ty = P.y + 0.8; c.tz = P.z;
    const cam = this.camera;
    const cp = Math.cos(c.pitch);
    cam.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist);
    const g = this.world.city.terrainAt(cam.position.x, cam.position.z).h;
    cam.position.y = Math.max(cam.position.y, g + 0.4);
    cam.lookAt(c.tx, c.ty, c.tz);
    cam.fov = damp(cam.fov, ph.fov, 8, dt);
    cam.updateProjectionMatrix();
    this.renderer.toneMappingExposure = (this.tod ? this.tod.exposure : 0.6) * Math.pow(2, ph.exposure);
    if (this.bokeh) {
      this.bokeh.uniforms.focus.value = cam.position.distanceTo(new THREE.Vector3(c.tx, c.ty, c.tz));
      this.bokeh.uniforms.aperture.value = 0.0035 * (45 / ph.fov);
      this.bokeh.uniforms.maxblur.value = 0.012;
    }
    if (this.blurPass) this.blurPass.uniforms.strength.value = 0;
  }

  savePhoto() {
    if (this.useComposer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    const filename = `midnight-pursuit-${Date.now()}.png`;
    this.canvas.toBlob(async (blob) => {
      if (!blob) { this.popup('Could not save the photo here', 'red'); return; }
      // inside a hosted page the platform offers the file; otherwise a normal browser download
      const host = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
      if (host) {
        try { await host.save({ filename, data: blob }); this.popup('Photo saved', 'green'); } catch (e) { if (e && e.code !== 'declined') this.popup('Could not save the photo here', 'red'); }
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.popup('Photo saved', 'green');
    }, 'image/png');
  }

  exitPhoto() {
    if (this.bokeh) this.bokeh.enabled = false;
    if (this.tod) this.renderer.toneMappingExposure = this.tod.exposure;
    if (this.gradePass) applyGrade(this.gradePass, this.save.settings.style || 'rockport', this.save.settings.tod);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.resume();
  }

  buildMarkers() {
    this.markers = [];
    const beamGeo = new THREE.CylinderGeometry(4, 4, 70, 24, 1, true);
    beamGeo.translate(0, 35, 0);
    const ringGeo = new THREE.RingGeometry(3.4, 4.4, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const C = this.world.city;
    const add = (kind, def, wp) => {
      const color = TYPE_COLOR[kind];
      const g = new THREE.Group();
      // races start at the junction nearest their first waypoint; others sit on the nearest road
      let p;
      if (def && def.route) {
        const n = C.nearestNode(wp[0], wp[1]);
        p = { x: n.x, z: n.z, y: n.y };
      } else {
        const rd = C.nearestRoad(wp[0], wp[1]);
        p = { x: rd.x, z: rd.z, y: rd.y };
      }
      g.position.set(p.x, p.y, p.z);
      const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.y = 0.06;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.iconTexture(TYPE_LETTER[kind], color), transparent: true, depthWrite: false, fog: false }));
      icon.scale.set(5, 5, 1);
      icon.position.y = 7;
      g.add(new THREE.Mesh(beamGeo, beamMat), ring, icon);
      this.scene.add(g);
      this.markers.push({ kind, def, x: p.x, z: p.z, group: g, beamMat, icon });
    };
    EVENTS.forEach((e) => add(e.type, e, e.marker || e.route[0]));
    add('safehouse', null, SAFEHOUSE);
    const sh = this.markers[this.markers.length - 1];
    const rd = C.nearestRoad(sh.x, sh.z);
    this.safehouse = { x: sh.x, z: sh.z, h: Math.atan2(rd.dx, rd.dz) };
    this.refreshMarkers();
  }

  refreshMarkers() {
    this.markers.forEach((m) => {
      const done = m.def && this.save.done[m.def.id];
      m.beamMat.opacity = done ? 0.07 : 0.16;
      m.group.visible = !this.event;
    });
  }

  buildGates() {
    const label = (text, color) => canvasTexture(512, 64, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = 'bold 44px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
    this.gateLabels = {
      cp: label('CHECKPOINT', '#ffb000'),
      finish: label('FINISH', '#ffffff'),
      lap: label('LAP', '#ffb000'),
      trap: label('SPEED TRAP', '#26c6ff'),
    };
    const make = (color) => {
      const g = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.5 });
      const post = new THREE.BoxGeometry(0.6, 9, 0.6);
      post.translate(0, 4.5, 0);
      const l = new THREE.Mesh(post, postMat);
      const r = new THREE.Mesh(post, postMat);
      l.position.x = -14;
      r.position.x = 14;
      const curtainMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(28, 8), curtainMat);
      curtain.position.y = 4;
      const bannerMat = new THREE.MeshBasicMaterial({ map: this.gateLabels.cp, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(28, 3.5), bannerMat);
      banner.position.y = 10;
      g.add(l, r, curtain, banner);
      g.visible = false;
      this.scene.add(g);
      return { group: g, bannerMat };
    };
    this.gate = make(0xffb000);
    this.trapGate = make(0x26c6ff);
    this.trapGate.bannerMat.map = this.gateLabels.trap;
  }

  setGate(gate, x, z, dx, dz, label) {
    gate.group.visible = true;
    gate.group.position.set(x, 0, z);
    gate.group.rotation.y = headingTo(dx, dz);
    const rd = this.world.city.nearestRoad(x, z);
    const w = rd ? rd.e.hw : 9;
    gate.group.position.y = rd ? rd.y : 0;
    gate.group.scale.set((w * 2 + 2) / 28, 1, 1);
    if (label && gate.bannerMat.map !== this.gateLabels[label]) {
      gate.bannerMat.map = this.gateLabels[label];
      gate.bannerMat.needsUpdate = true;
    }
  }

  // ───────────────────────── UI ─────────────────────────
  buildUI() {
    this.root.insertAdjacentHTML('beforeend', `
      <div class="mp-hud" hidden>
        <div class="mp-tl"><div class="mp-money"></div><div class="mp-heat">${'<span>★</span>'.repeat(5)}</div><div class="mp-bounty"></div></div>
        <div class="mp-top">
          <div class="mp-ev"><div class="mp-ev-name"></div><div class="mp-ev-stats"></div></div>
          <div class="mp-pur" hidden><div class="mp-pur-label"></div><div class="mp-meter mp-evade"><i></i></div><div class="mp-meter mp-bust"><i></i></div></div>
          <div class="mp-gps" hidden><div class="mp-arrow"></div><span></span></div>
        </div>
        <canvas class="mp-mini" width="240" height="240"></canvas>
        <div class="mp-race" hidden><div class="pos"><span class="p1">1</span><i></i><span class="p2">4</span></div><div class="info"><div class="time">0:00.00</div><div class="pct">COMPLETE 0%</div></div></div>
        <div class="mp-speedo"><canvas class="mp-tach" width="240" height="240"></canvas><div class="mp-spd"><b>0</b><small>KM/H</small></div><div class="mp-gear">N</div></div>
        <div class="mp-bars"><div class="mp-bar mp-nos"><i></i><em>NITROUS</em></div><div class="mp-bar mp-sbm"><i></i><em>SPEEDBREAKER</em></div></div>
        <div class="mp-pops"></div>
        <div class="mp-big" hidden><b></b><span></span></div>
        <button class="mp-prompt" hidden></button>
        <button class="mp-pause" aria-label="Pause">II</button>
      </div>
      <div class="mp-touch" hidden>
        <button data-t="left" aria-label="Steer left">◀</button><button data-t="right" aria-label="Steer right">▶</button>
        <button data-t="up">GAS</button><button data-t="down">BRAKE</button><button data-t="nitro">NOS</button><button data-t="hand">DRIFT</button><button data-t="sb">SLOW</button>
      </div>
      <div class="mp-screen"></div>
      <div class="mp-fade"></div>`);
    const q = (s) => this.root.querySelector(s);
    this.ui = {
      hud: q('.mp-hud'), money: q('.mp-money'), heat: [...this.root.querySelectorAll('.mp-heat span')], heatBox: q('.mp-heat'), bounty: q('.mp-bounty'),
      evName: q('.mp-ev-name'), evStats: q('.mp-ev-stats'), pur: q('.mp-pur'), purLabel: q('.mp-pur-label'), evade: q('.mp-evade i'), bust: q('.mp-bust i'),
      gps: q('.mp-gps'), arrow: q('.mp-arrow'), gpsText: q('.mp-gps span'), mini: q('.mp-mini'), tach: q('.mp-tach'), spd: q('.mp-spd b'), unit: q('.mp-spd small'),
      gear: q('.mp-gear'), nos: q('.mp-nos i'), sbm: q('.mp-sbm i'), pops: q('.mp-pops'), big: q('.mp-big'), prompt: q('.mp-prompt'), pause: q('.mp-pause'),
      touch: q('.mp-touch'), screen: q('.mp-screen'), fade: q('.mp-fade'),
      race: q('.mp-race'), raceP1: q('.mp-race .p1'), raceP2: q('.mp-race .p2'), raceTime: q('.mp-race .time'), racePct: q('.mp-race .pct'),
    };
    this.miniCtx = this.ui.mini.getContext('2d');
    this.tachCtx = this.ui.tach.getContext('2d');
    this.ui.screen.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.audio.init();
      this.audio.click();
      this.onAction(b.dataset.act, b.dataset.arg);
    });
    this.ui.prompt.addEventListener('click', () => this.interact());
    this.ui.pause.addEventListener('click', () => this.togglePause());
    this.isTouch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    if (this.isTouch) this.root.classList.add('touch');
    this.ui.touch.querySelectorAll('button').forEach((b) => {
      const t = b.dataset.t;
      const down = (e) => {
        e.preventDefault();
        this.active = true;
        this.audio.init();
        try { b.setPointerCapture(e.pointerId); } catch { /* not supported */ }
        b.classList.add('on');
        if (t === 'sb') this.toggleSB();
        else this.touch[t] = true;
      };
      const up = () => {
        b.classList.remove('on');
        this.touch[t] = false;
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  setScreen(html) {
    this.ui.screen.innerHTML = html;
    const first = this.ui.screen.querySelector('button.primary, button.mp-b');
    if (first && !this.isTouch) first.focus({ preventScroll: true });
  }

  popup(text, cls = '') {
    const d = document.createElement('div');
    d.className = `mp-pop ${cls}`;
    d.textContent = text;
    this.ui.pops.appendChild(d);
    while (this.ui.pops.children.length > 4) this.ui.pops.firstChild.remove();
    this.later(1800, () => d.remove());
  }

  bigMessage(title, sub = '', cls = '', ms = 2200) {
    const b = this.ui.big;
    b.hidden = false;
    b.className = `mp-big ${cls}`;
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
    clearTimeout(this.bigTimer);
    this.bigTimer = this.later(ms, () => { b.hidden = true; });
  }

  later(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  fadeThen(fn) {
    this.ui.fade.classList.add('on');
    this.later(360, () => {
      fn();
      this.later(80, () => this.ui.fade.classList.remove('on'));
    });
  }

  speedUnits(mps) {
    return Math.round(mps * (this.save.settings.units === 'mph' ? 2.237 : 3.6));
  }

  unitLabel() {
    return this.save.settings.units === 'mph' ? 'MPH' : 'KM/H';
  }

  persist() {
    writeSave(this.save);
  }

  // ───────────────────────── screens ─────────────────────────
  showMenu() {
    this.mode = 'menu';
    this.overlay = null;
    this.ui.hud.hidden = true;
    this.ui.touch.hidden = true;
    const s = this.save;
    const done = Object.keys(s.done).length;
    const heat = Math.min(5, Math.floor(s.bountyTotal / 20000));
    this.setScreen(`
      <div class="mp-home-shade"></div>
      <div class="mp-home">
        <div class="mp-logo"><span>MIDNIGHT</span><b>PURSUIT</b></div>
        <p class="mp-sub">Race the streets, climb the Blacklist and outrun the city police.</p>
        <button class="mp-k hero" data-act="play"><span>${this.started ? 'Continue' : 'Free roam'}</span><small>Drive the city · find events and rivals</small><i>▶</i></button>
        <button class="mp-k" data-act="online"><span>${this.multi && this.multi.active ? `Online · room ${this.multi.room.code}` : 'Online'}</span><small>Free roam and races with friends</small></button>
        <div class="mp-krow">
          <button class="mp-k sm" data-act="garage"><span>Garage</span></button>
          <button class="mp-k sm" data-act="blacklist"><span>Blacklist</span></button>
          <button class="mp-k sm" data-act="events"><span>Events</span></button>
        </div>
        <div class="mp-links">
          <button data-act="milestones">Milestones &amp; cameras</button>
          <button data-act="settings">Settings</button>
          <button data-act="help">How to play</button>
        </div>
      </div>
      <div class="mp-card">
        <div class="mp-card-h"><span>Street record</span><span class="mp-heat">${'★'.repeat(heat)}<em>${'★'.repeat(5 - heat)}</em></span></div>
        <div class="mp-card-cash">${fmtMoney(s.money)}</div>
        <div class="mp-card-g">
          <span><b>${s.rank}/${RIVALS.length}</b>Blacklist</span>
          <span><b>${done}/${EVENTS.length}</b>Events</span>
          <span><b>${s.bountyTotal.toLocaleString('en-US')}</b>Bounty</span>
        </div>
        <div class="mp-card-bar"><i style="width:${Math.round((s.rank / RIVALS.length) * 100)}%"></i></div>
      </div>`);
  }

  showEvents() {
    const rows = EVENTS.map((e) => {
      const done = this.save.done[e.id];
      return `<div class="mp-row"><div class="t"><b>${esc(e.name)} ${done ? '<span class="mp-ok">✓</span>' : ''}</b><small><span class="mp-tag" style="color:${TYPE_COLOR[e.type]}">${EVENT_LABEL[e.type]}</span> &nbsp;Reward ${fmtMoney(e.reward)}${e.laps ? ` · ${e.laps} laps` : ''}${e.target ? (e.type === 'drift' ? ` · Score ${e.target.toLocaleString('en-US')}` : ` · Target ${e.target} km/h total`) : ''}${e.type === 'timetrial' ? ' · Beat the target time' : ''}${e.type === 'knockout' ? ' · Last place is out each lap' : ''}${e.bountyTarget ? ` · Earn ${e.bountyTarget.toLocaleString('en-US')} bounty` : ''}</small></div>
        <button class="mp-b" data-act="gps" data-arg="${e.id}">Set GPS</button></div>`;
    }).join('');
    this.setScreen(`<div class="mp-wrap mp-panel"><div class="mp-h"><h2>Events</h2><small>Drive into a marker on the map and press Enter to start.</small></div>
      <div class="mp-list">${rows}<div class="mp-row"><div class="t"><b>Safehouse</b><small>Garage: buy cars, upgrades and paint</small></div><button class="mp-b" data-act="gps" data-arg="safehouse">Set GPS</button></div></div>
      <div class="mp-btns"><button class="mp-b" data-act="back">Back</button></div></div>`);
  }

  showBlacklist() {
    const s = this.save;
    const done = Object.keys(s.done).length;
    const rows = RIVALS.map((r, idx) => {
      const beaten = s.rank > idx;
      const current = s.rank === idx;
      const ready = current && done >= r.events && s.bountyTotal >= r.bounty;
      const car = carById(r.car);
      let right;
      if (beaten) right = '<span class="mp-ok">BEATEN</span>';
      else if (ready) right = `<button class="mp-b primary" data-act="rival" data-arg="${idx}">Challenge</button>`;
      else right = '<span class="mp-lock">LOCKED</span>';
      const req = current && !beaten ? `<small>Needs ${Math.min(done, r.events)}/${r.events} events won · ${Math.min(s.bountyTotal, r.bounty).toLocaleString('en-US')}/${r.bounty.toLocaleString('en-US')} bounty</small>` : `<small>${esc(car.name)} · Reward ${fmtMoney(r.reward)}</small>`;
      return `<div class="mp-row"><div class="t"><b>#${r.rank} ${esc(r.name)}</b>${req}</div>${right}</div>`;
    }).reverse().join('');
    const st = s.stats;
    this.setScreen(`<div class="mp-wrap mp-panel"><div class="mp-h"><h2>Blacklist</h2><small>Beat all ${RIVALS.length} to become the city's Most Wanted.</small></div>
      <div class="mp-list">${rows}</div>
      <div class="mp-foot"><span>Races won <b>${st.racesWon}</b></span><span>Pursuits <b>${st.pursuits}</b></span><span>Evaded <b>${st.evaded}</b></span><span>Busted <b>${st.busted}</b></span><span>Cop takedowns <b>${st.takedowns}</b></span><span>Top speed <b>${this.speedUnits(st.topSpeed)} ${this.unitLabel().toLowerCase()}</b></span></div>
      <div class="mp-btns"><button class="mp-b" data-act="back">Back</button></div></div>`);
  }

  showSettings() {
    const st = this.save.settings;
    const opt = (key, vals) => vals.map(([v, label]) => `<button class="mp-b ${String(st[key]) === String(v) ? 'sel' : ''}" data-act="set" data-arg="${key}:${v}">${label}</button>`).join('');
    this.setScreen(`<div class="mp-wrap mp-panel"><div class="mp-h"><h2>Settings</h2></div>
      <div class="mp-list">
        <div class="mp-row"><div class="t"><b>Graphics quality</b><small>High adds shadows. Anti-aliasing changes apply next time the game loads.</small></div><div class="mp-opts">${opt('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div></div>
        <div class="mp-row"><div class="t"><b>Auto resolution</b><small>Lowers the render resolution when the frame rate drops</small></div><div class="mp-opts">${opt('dynRes', [[true, 'On'], [false, 'Off']])}</div></div>
        <div class="mp-row"><div class="t"><b>Time of day</b></div><div class="mp-opts">${opt('tod', Object.entries(TOD).map(([k, v]) => [k, v.label]))}</div></div>
        <div class="mp-row"><div class="t"><b>Visual style</b><small>Street Haze is the warm, smoggy street-racer colour grade.</small></div><div class="mp-opts">${opt('style', [['rockport', 'Street Haze'], ['natural', 'Natural']])}</div></div>
        <div class="mp-row"><div class="t"><b>Speed motion blur</b></div><div class="mp-opts">${opt('blur', [[true, 'On'], [false, 'Off']])}</div></div>
        <div class="mp-row"><div class="t"><b>Rain</b></div><div class="mp-opts">${opt('rain', [[false, 'Off'], [true, 'On']])}</div></div>
        <div class="mp-row"><div class="t"><b>Speed units</b></div><div class="mp-opts">${opt('units', [['kmh', 'km/h'], ['mph', 'mph']])}</div></div>
        <div class="mp-row"><div class="t"><b>Volume</b></div><div class="mp-opts">${opt('volume', [[0, 'Off'], [35, '35%'], [70, '70%'], [100, '100%']])}</div></div>
        <div class="mp-row"><div class="t"><b>Camera shake</b></div><div class="mp-opts">${opt('shake', [[true, 'On'], [false, 'Off']])}</div></div>
      </div>
      <div class="mp-btns"><button class="mp-b" data-act="back">Back</button></div></div>`);
  }

  showHelp() {
    this.setScreen(`<div class="mp-wrap mp-panel"><div class="mp-h"><h2>How to play</h2></div>
      <div class="mp-keys">
        <kbd>W / ↑</kbd><span>Accelerate</span><kbd>S / ↓</kbd><span>Brake and reverse</span><kbd>A D / ← →</kbd><span>Steer</span>
        <kbd>Space</kbd><span>Handbrake (drift)</span><kbd>Shift / N</kbd><span>Nitrous</span><kbd>Q / E</kbd><span>Speedbreaker (slow motion)</span>
        <kbd>C</kbd><span>Change camera</span><kbd>B</kbd><span>Look back</span><kbd>R</kbd><span>Reset car onto the road</span>
        <kbd>M</kbd><span>City map and GPS</span><kbd>H</kbd><span>Photo mode</span><kbd>F</kbd><span>Fullscreen</span><kbd>Enter</kbd><span>Start event / enter garage</span><kbd>Esc / P</kbd><span>Pause</span>
        <kbd>Gamepad</kbd><span>RT gas · LT brake · stick steer · A nitrous · B handbrake · X speedbreaker · Y camera · Back map · Start pause</span>
      </div>
      <p>Drift, jump, and near-miss traffic to refill nitrous and the speedbreaker. Speeding past a patrol car or crashing into traffic starts a pursuit. Break line of sight, then stay hidden until the cooldown ends to evade. Evading banks your bounty and earns cash. Stop near police for too long and you'll be busted.</p>
      <p>Win events and earn bounty to unlock Blacklist challenges. Each rival you beat unlocks faster cars in the garage. A respray lowers your car's heat level.</p>
      <p style="font-size:.78em;color:#9aa3b5">Credits: "Car Concept" 3D model by Eric Chadwick / Darmstadt Graphics Group, Khronos glTF sample assets, CC BY 4.0 (modified: logos removed, parts simplified). Based on a CC0 model by Unity Fan. Sky and lighting images and asphalt texture from Poly Haven (CC0).</p>
      <div class="mp-btns"><button class="mp-b" data-act="back">Back</button></div></div>`);
  }

  showPause() {
    this.overlay = 'pause';
    this.audio.suspend();
    const ev = this.event;
    this.setScreen(`<div class="mp-menu"><div class="mp-title"><b>PAUSED</b></div><div class="mp-nav">
      <button class="mp-b primary" data-act="resume">Resume</button>
      <button class="mp-b" data-act="map">Map &amp; GPS</button>
      <button class="mp-b" data-act="photo">Photo mode (H)</button>
      <button class="mp-b" data-act="milestones">Milestones &amp; cameras</button>
      <button class="mp-b" data-act="online">${this.multi.active ? `Online · room ${this.multi.room.code}` : 'Online'}</button>
      ${this.multi.isHost && !ev ? '<button class="mp-b" data-act="mp-tpur">Team pursuit</button>' : ''}
      <button class="mp-b" data-act="fullscreen">Fullscreen</button>
      ${ev ? `${ev.mp ? '' : '<button class="mp-b" data-act="restart">Restart event</button>'}<button class="mp-b" data-act="abandon">Quit event</button>` : '<button class="mp-b" data-act="garage">Garage</button>'}
      <button class="mp-b" data-act="settings">Settings</button>
      <button class="mp-b" data-act="help">How to play</button>
      <button class="mp-b" data-act="menu">Main menu</button></div></div>`);
  }

  showMap() {
    this.overlay = 'map';
    this.audio.suspend();
    const rows = this.markers.map((m, i) => `<button class="mp-b" data-act="gpsm" data-arg="${i}"><span style="color:${TYPE_COLOR[m.kind]}">●</span> ${esc(m.def ? m.def.name : 'Safehouse')} ${m.def && this.save.done[m.def.id] ? '<span class="mp-ok">✓</span>' : ''}</button>`).join('');
    this.setScreen(`<div class="mp-map"><div class="mp-panel" style="padding:.5em;display:flex;min-height:0"><canvas width="900" height="900"></canvas></div>
      <div class="mp-panel" style="display:grid;gap:.4em;align-content:start;overflow:auto"><div class="mp-h"><h2>Map</h2></div><small style="color:#9aa3b5">Pick a place to set your GPS route.</small>${rows}
      <button class="mp-b" data-act="gpsclear">Clear GPS</button><button class="mp-b primary" data-act="resume">Back to the road</button></div></div>`);
    const c = this.ui.screen.querySelector('canvas');
    this.drawFullMap(c);
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const s = Math.min(r.width, r.height);
      const ox = r.left + (r.width - s) / 2;
      const oy = r.top + (r.height - s) / 2;
      const wx = ((e.clientX - ox) / s) * MAP_HALF * 2 - MAP_HALF;
      const wz = ((e.clientY - oy) / s) * MAP_HALF * 2 - MAP_HALF;
      let best = null;
      let bd = 90;
      this.markers.forEach((m) => {
        const d = Math.hypot(m.x - wx, m.z - wz);
        if (d < bd) { bd = d; best = m; }
      });
      if (best) {
        this.setGps(best.x, best.z, best.def ? best.def.name : 'Safehouse');
        this.drawFullMap(c);
      }
    });
  }

  drawFullMap(c) {
    const g = c.getContext('2d');
    const S = c.width;
    const k = S / (MAP_HALF * 2);
    const X = (v) => (v + MAP_HALF) * k;
    g.drawImage(this.world.mapCanvas, 0, 0, S, S);
    if (this.gps) {
      g.strokeStyle = '#ffb000';
      g.lineWidth = 4;
      g.beginPath();
      this.gps.route.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
      g.stroke();
    }
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    this.markers.forEach((m) => {
      g.fillStyle = TYPE_COLOR[m.kind];
      g.beginPath();
      g.arc(X(m.x), X(m.z), 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      const label = m.def ? m.def.name : 'Safehouse';
      const half = g.measureText(label).width / 2 + 4;
      g.fillText(label, clamp(X(m.x), half, S - half), X(m.z) < 30 ? X(m.z) + 26 : X(m.z) - 14);
    });
    this.multi.drawMapDots(g, X);
    const P = this.player;
    g.save();
    g.translate(X(P.x), X(P.z));
    g.rotate(Math.atan2(Math.cos(P.h), Math.sin(P.h)) - Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 12);
    g.lineTo(8, -8);
    g.lineTo(-8, -8);
    g.fill();
    g.restore();
  }

  showGarage(from) {
    this.mode = 'garage';
    this.overlay = null;
    this.garageFrom = from || this.garageFrom || 'menu';
    this.ui.hud.hidden = true;
    this.ui.touch.hidden = true;
    if (!this.garageSel) this.garageSel = this.save.car;
    this.player.parts.group.visible = false;
    this.buildShowcase();
    this.renderGarage();
  }

  buildShowcase() {
    if (this.showcase) this.factory.dispose(this.showcase);
    const def = carById(this.garageSel);
    this.showcase = this.factory.build(def.style, this.save.paint[def.id] || def.color, { flames: false, modelKey: def.id, ...this.customOpts(def) });
    this.applyCustom(this.showcase, def);
    this.showcase.group.position.set(this.player.x, this.player.y, this.player.z);
    this.showcase.group.rotation.y = this.player.h;
    this.scene.add(this.showcase.group);
  }

  renderGarage() {
    const s = this.save;
    const sel = carById(this.garageSel);
    const owned = s.owned.includes(sel.id);
    const list = CARS.map((c) => {
      const own = s.owned.includes(c.id);
      const locked = !own && s.rank < c.req;
      const sub = own ? (s.car === c.id ? 'EQUIPPED' : 'OWNED') : locked ? `LOCKED · beat ${c.req} rival${c.req > 1 ? 's' : ''}` : fmtMoney(c.price);
      return `<button class="mp-b mp-gcar ${c.id === sel.id ? 'sel' : ''}" data-act="gsel" data-arg="${c.id}"><b>${esc(c.name)}</b><small>Class ${c.cls} · ${sub}</small></button>`;
    }).join('');
    const up = s.upg[sel.id] || {};
    const st = carStats(sel, up);
    const bar = (label, v, max, txt) => `<div class="mp-stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div><span>${txt}</span></div>`;
    const locked = !owned && s.rank < sel.req;
    let action;
    if (owned) action = s.car === sel.id ? '<button class="mp-b" disabled>Equipped</button>' : `<button class="mp-b primary" data-act="equip" data-arg="${sel.id}">Drive this car</button>`;
    else if (locked) action = `<button class="mp-b" disabled>Beat ${sel.req} Blacklist rival${sel.req > 1 ? 's' : ''} to unlock</button>`;
    else action = `<button class="mp-b primary" data-act="buy" data-arg="${sel.id}" ${s.money < sel.price ? 'disabled' : ''}>Buy for ${fmtMoney(sel.price)}</button>`;
    let extra = '';
    if (owned) {
      const rows = UPGRADES.map((u) => {
        const lv = up[u.key] || 0;
        const pips = [0, 1, 2].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        const btn = lv >= 3 ? '<button class="mp-b" disabled>Maxed</button>' : `<button class="mp-b" data-act="upg" data-arg="${u.key}" ${s.money < upgradeCost(sel, lv) ? 'disabled' : ''}>${fmtMoney(upgradeCost(sel, lv))}</button>`;
        return `<div><b>${u.name}</b><div class="mp-pips">${pips}</div><small style="color:#9aa3b5">${u.desc}</small></div>${btn}`;
      }).join('');
      const paint = s.paint[sel.id] || sel.color;
      const sw = PAINTS.map((p) => `<button class="mp-sw ${p === paint ? 'sel' : ''}" style="background:${p}" data-act="paint" data-arg="${p}" aria-label="Paint ${p}"></button>`).join('');
      const heat = s.carHeat[sel.id] || 0;
      const cu = s.custom[sel.id] || {};
      const copt = (k, list, cur) => list.map(([v, l]) => `<button class="mp-b ${String(cur) === String(v) ? 'sel' : ''}" data-act="cust" data-arg="${k}:${v}">${l}</button>`).join('');
      const custom = `<div><b>Customize</b> <small style="color:#9aa3b5">· $750 per change</small></div>
        <div class="mp-cust"><span>Finish</span><div class="mp-opts">${copt('finish', FINISHES, cu.finish || 'gloss')}</div>
        <span>Rims</span><div class="mp-opts">${copt('rim', RIM_FINISHES, cu.rim || 'silver')}</div>
        <span>Calipers</span><div class="mp-opts">${copt('caliper', CALIPERS, cu.caliper ?? 0)}</div>
        <span>Underglow</span><div class="mp-opts">${UNDERGLOW.map(([v, l]) => `<button class="mp-b ${String(cu.glow ?? null) === String(v) ? 'sel' : ''}" data-act="cust" data-arg="glow:${v}" style="${v ? `color:${v}` : ''}">${l}</button>`).join('')}</div></div>`;
      extra = `<div class="mp-upg">${rows}</div>${custom}<div><b>Paint</b> <small style="color:#9aa3b5">· $500 respray, lowers heat by 2</small></div><div class="mp-swatches">${sw}</div>
        <div><b>Heat level</b> <span style="color:#ff2d55">${'★'.repeat(heat)}</span><span style="color:#555">${'★'.repeat(5 - heat)}</span></div>`;
    }
    this.setScreen(`<div class="mp-garage">
      <div class="mp-glist mp-panel"><div class="mp-h"><h2>Garage</h2></div>${list}<button class="mp-b" data-act="garage-exit">${this.garageFrom === 'roam' ? 'Back to the street' : 'Back'}</button></div>
      <div></div>
      <div class="mp-gdetail mp-panel">
        <div class="mp-h"><h2>${esc(sel.name)}</h2><span class="mp-tag">Class ${sel.cls}</span></div>
        <p>${esc(sel.blurb)}</p>
        ${bar('Top speed', st.top, 95, `${this.speedUnits(st.top)} ${this.save.settings.units === 'mph' ? 'mph' : 'km/h'}`)}
        ${bar('Acceleration', st.accel, 27, st.accel.toFixed(1))}
        ${bar('Handling', st.grip, 13, (st.grip / 7.5).toFixed(2))}
        ${bar('Nitrous', st.nitroCap, 8, `${st.nitroCap.toFixed(1)}s`)}
        <div style="color:#ffb000;font-weight:700">Cash ${fmtMoney(s.money)}</div>
        ${action}${extra}
      </div></div>`);
  }

  // ───────────────────────── actions ─────────────────────────
  onAction(act, arg) {
    const s = this.save;
    switch (act) {
      case 'play':
        this.startRoam();
        break;
      case 'garage':
        if (this.mode === 'play' && this.pursuit) { this.popup('Lose the cops first', 'red'); break; }
        this.showGarage(this.mode === 'play' ? 'roam' : 'menu');
        break;
      case 'blacklist': this.showBlacklist(); break;
      case 'events': this.showEvents(); break;
      case 'settings': this.back = this.overlay === 'pause' ? 'pause' : 'menu'; this.showSettings(); break;
      case 'help': this.back = this.overlay === 'pause' ? 'pause' : 'menu'; this.showHelp(); break;
      case 'back':
        if (this.back === 'pause' && this.mode === 'play') this.showPause();
        else this.showMenu();
        this.back = null;
        break;
      case 'menu':
        if (this.event) this.cleanupEvent();
        if (this.pursuit) this.endPursuit();
        this.showMenu();
        break;
      case 'resume': this.resume(); break;
      case 'online': this.multi.showLobby(); break;
      case 'mp-host': this.multi.host(); break;
      case 'mp-join': this.multi.join(); break;
      case 'mp-leave': this.multi.leave(); if (this.mode === 'play') this.showPause(); else this.showMenu(); break;
      case 'mp-drive': if (this.mode === 'play') this.resume(); else this.startRoam(); break;
      case 'mp-kick': this.multi.room.kick(arg); this.later(500, () => this.multi.showRoom()); break;
      case 'mp-tpur': this.multi.teamPursuit(); break;
      case 'map': this.showMap(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'restart': { const def = this.event.def; this.cleanupEvent(); this.resume(); this.startEvent(def); break; }
      case 'abandon': this.cleanupEvent(); this.resume(); break;
      case 'gsel': this.garageSel = arg; this.buildShowcase(); this.renderGarage(); break;
      case 'buy': {
        const c = carById(arg);
        if (s.money >= c.price && s.rank >= c.req && !s.owned.includes(c.id)) {
          s.money -= c.price;
          s.owned.push(c.id);
          s.car = c.id;
          this.audio.money();
          this.persist();
        }
        this.renderGarage();
        break;
      }
      case 'equip': s.car = arg; this.persist(); this.renderGarage(); break;
      case 'upg': {
        const c = carById(this.garageSel);
        const up = (s.upg[c.id] = s.upg[c.id] || {});
        const lv = up[arg] || 0;
        const cost = upgradeCost(c, lv);
        if (lv < 3 && s.money >= cost) {
          s.money -= cost;
          up[arg] = lv + 1;
          this.audio.money();
          this.persist();
        }
        this.renderGarage();
        break;
      }
      case 'paint': {
        const c = carById(this.garageSel);
        if ((s.paint[c.id] || c.color) !== arg && s.money >= 500) {
          s.money -= 500;
          s.paint[c.id] = arg;
          s.carHeat[c.id] = Math.max(0, (s.carHeat[c.id] || 0) - 2);
          this.persist();
          this.buildShowcase();
        }
        this.renderGarage();
        break;
      }
      case 'garage-exit': this.leaveGarage(); break;
      case 'rival': this.startRival(Number(arg)); break;
      case 'gps': {
        const m = arg === 'safehouse' ? this.markers.find((x) => x.kind === 'safehouse') : this.markers.find((x) => x.def && x.def.id === arg);
        if (m) {
          this.setGps(m.x, m.z, m.def ? m.def.name : 'Safehouse');
          this.popup(`GPS set: ${m.def ? m.def.name : 'Safehouse'}`, 'gold');
        }
        this.startRoam();
        break;
      }
      case 'gpsm': {
        const m = this.markers[Number(arg)];
        this.setGps(m.x, m.z, m.def ? m.def.name : 'Safehouse');
        this.drawFullMap(this.ui.screen.querySelector('canvas'));
        break;
      }
      case 'gpscam': {
        const c = this.cams.find((x) => x.def.id === arg);
        if (c) { this.setGps(c.x, c.z, c.def.name); this.popup(`GPS set: ${c.def.name}`, 'gold'); }
        this.startRoam();
        break;
      }
      case 'gpsclear': this.gps = null; this.drawFullMap(this.ui.screen.querySelector('canvas')); break;
      case 'set': {
        const [k, raw] = arg.split(':');
        let v = raw;
        if (raw === 'true') v = true;
        else if (raw === 'false') v = false;
        else if (k === 'volume') v = Number(raw);
        s.settings[k] = v;
        this.persist();
        this.applySettings();
        this.showSettings();
        break;
      }
      case 'continue': this.closeResults(); break;
      case 'milestones': this.back = this.overlay === 'pause' ? 'pause' : 'menu'; this.showMilestones(); break;
      case 'photo': this.enterPhoto(); break;
      case 'photo-exit': this.exitPhoto(); break;
      case 'photo-save': this.savePhoto(); break;
      case 'photo-set': {
        const [k, v] = arg.split(':');
        this.photo[k] = k === 'filter' ? v : k === 'dof' || k === 'hideUi' ? v === 'true' : Number(v);
        this.renderPhotoPanel();
        break;
      }
      case 'cust': {
        const [k, raw] = arg.split(':');
        const c = carById(this.garageSel);
        const cu = (s.custom[c.id] = s.custom[c.id] || {});
        const v = raw === 'null' ? null : k === 'caliper' ? Number(raw) : raw;
        if (cu[k] !== v && s.money >= 750) {
          s.money -= 750;
          cu[k] = v;
          this.audio.money();
          this.persist();
          this.buildShowcase();
          if (s.car === c.id) this.buildPlayer();
        }
        this.renderGarage();
        break;
      }
      case 'retry': { const def = this.lastEventDef; this.closeResults(); this.startEvent(def); break; }
      default: break;
    }
  }

  startRoam() {
    this.audio.init();
    this.audio.resume();
    this.active = true;
    this.started = true;
    this.mode = 'play';
    this.overlay = null;
    this.setScreen('');
    this.ui.hud.hidden = false;
    this.ui.touch.hidden = !this.isTouch;
    this.player.parts.group.visible = true;
    this.camH = this.player.h;
    if (!this.welcomed) {
      this.welcomed = true;
      this.later(600, () => this.popup('Drive into a glowing marker to start an event', 'gold'));
      this.later(2600, () => this.popup('M opens the map · Esc pauses', ''));
    }
    this.root.focus({ preventScroll: true });
  }

  resume() {
    if (this.mode !== 'play') return this.startRoam();
    this.overlay = null;
    this.setScreen('');
    this.audio.resume();
    this.root.focus({ preventScroll: true });
    return undefined;
  }

  togglePause() {
    if (this.mode !== 'play') return;
    if (this.overlay === 'results') return;
    if (this.overlay) this.resume();
    else this.showPause();
  }

  leaveGarage() {
    if (this.showcase) {
      this.factory.dispose(this.showcase);
      this.showcase = null;
    }
    this.buildPlayer();
    this.player.parts.group.visible = true;
    if (this.multi.active) this.multi.room.setMeta(this.multi.myMeta());
    if (this.garageFrom === 'roam') this.startRoam();
    else this.showMenu();
  }

  applySettings() {
    const st = this.save.settings;
    const p = TOD[st.tod] || TOD.night;
    this.audio.setVolume(st.volume);
    this.applyPixelRatio();
    const shadows = st.quality !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
      });
    }
    this.sun.castShadow = st.quality !== 'low' && st.tod !== 'night';
    const night = st.tod === 'night';
    const gradientSky = night || st.tod === 'overcast' || st.tod === 'sunset';
    this.scene.background = null;
    this.sky.visible = gradientSky;
    this.physSky.visible = !gradientSky;
    [this.physSky, this.envSky].forEach((sk) => {
      const su = sk.material.uniforms;
      su.turbidity.value = st.tod === 'sunset' ? 7 : 2.4;
      su.rayleigh.value = st.tod === 'sunset' ? 2.6 : 1.1;
      su.mieCoefficient.value = st.tod === 'sunset' ? 0.008 : 0.004;
      su.mieDirectionalG.value = st.tod === 'sunset' ? 0.92 : 0.8;
      su.sunPosition.value.set(...p.sunDir).normalize();
    });
    if (this.gradePass) {
      applyGrade(this.gradePass, st.style || 'rockport', st.tod);
      this.blurPass.enabled = st.blur !== false;
    }
    if (this.bloom) {
      this.bloom.strength = night ? 0.85 : st.tod === 'sunset' ? 0.45 : st.tod === 'overcast' ? 0.4 : (st.style || 'rockport') === 'rockport' ? 0.35 : 0.22;
      this.bloom.threshold = night ? 0.8 : 0.92;
    }
    const u = this.sky.material.uniforms;
    u.top.value.set(p.sky[0]);
    u.mid.value.set(p.sky[1]);
    u.bot.value.set(p.sky[2]);
    const cl = p.clouds || { cover: 0, lit: '#ffffff', dark: '#ffffff' };
    u.cover.value = st.rain ? Math.max(cl.cover, 0.85) : cl.cover;
    u.cloudLit.value.set(cl.lit);
    u.cloudDark.value.set(cl.dark);
    this.scene.fog.color.set(p.fog);
    this.scene.fog.near = p.fogNear * (st.rain ? 0.6 : 1);
    this.scene.fog.far = p.fogFar * (st.rain ? 0.65 : 1);
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2] * (st.rain ? 0.8 : 1);
    this.sun.color.set(p.sun[0]);
    this.sun.intensity = p.sun[1] * (st.rain ? 0.5 : 1);
    this.sunDir = new THREE.Vector3(...p.sunDir).normalize();
    this.stars.visible = p.stars && !st.rain;
    this.renderer.toneMappingExposure = p.exposure;
    this.headlight.intensity = p.headlights ? 3.2 : 0;
    this.envLights.visible = p.windows > 0.3;
    this.world.applyTod(p, st.rain);
    this.fx.rain.mesh.visible = !!st.rain;
    this.tod = p;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(gradientSky ? this.envScene : this.skyEnvScene, 0.03);
    this.sky.material.uniforms.useMap.value = 0;
    this.envFromHdri = false;
    this.scene.environment = this.envRT.texture;
    this.loadHdri(st.tod);
    if (this.beams) this.beams.forEach((b) => { b.visible = p.headlights; });
    this.ui.unit.textContent = this.unitLabel();
  }

  // Real image-based lighting and sky photos (CC0, Poly Haven):
  //   public/assets/hdri/<tod>.hdr  lighting + reflections     public/assets/sky/<tod>.jpg  visible sky
  loadHdri(tod) {
    if (!this.opts.assetBase) return;
    const base = this.opts.assetBase.endsWith('/') ? this.opts.assetBase : `${this.opts.assetBase}/`;
    this.hdri = this.hdri || {};
    this.skyPhotos = this.skyPhotos || {};
    const st = this.save.settings;
    const applyEnv = (tex) => {
      if (st.tod !== tod || !tex) return;
      if (!this.hdriEnv || this.hdriEnv.tod !== tod) {
        if (this.hdriEnv) this.hdriEnv.rt.dispose();
        this.hdriEnv = { tod, rt: this.pmrem.fromEquirectangular(tex) };
      }
      this.scene.environment = this.hdriEnv.rt.texture;
      this.envFromHdri = true;
      const p = this.tod;
      this.hemi.intensity = p.hemi[2] * (st.rain ? 0.8 : 1) * (p.hdriHemi ?? 0.3);
    };
    const applySky = (tex) => {
      if (st.tod !== tod || !tex) return;
      const u = this.sky.material.uniforms;
      u.skyMap.value = tex;
      u.useMap.value = 1;
      u.mapGain.value = (this.tod.skyGain ?? 1) * (st.rain ? 0.6 : 1);
      this.sky.visible = true;
      this.physSky.visible = false;
    };
    if (tod in this.hdri) applyEnv(this.hdri[tod]);
    else {
      this.hdri[tod] = null;
      fetch(`${base}assets/hdri/${tod}.hdr`).then((r) => {
        if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) throw new Error('no hdri');
        return r.arrayBuffer();
      }).then((buf) => {
        const data = new RGBELoader().setDataType(THREE.FloatType).parse(buf);
        // per time-of-day brightness of the image lighting
        const k = (TOD[tod] && TOD[tod].envScale) || 1;
        if (k !== 1) for (let i = 0; i < data.data.length; i++) if ((i & 3) !== 3) data.data[i] *= k;
        const tex = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.flipY = true;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        this.hdri[tod] = tex;
        applyEnv(tex);
      }).catch(() => {});
    }
    if (tod === 'night') return;
    if (tod in this.skyPhotos) applySky(this.skyPhotos[tod]);
    else {
      this.skyPhotos[tod] = null;
      new THREE.TextureLoader().load(`${base}assets/sky/${tod}.jpg`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        this.skyPhotos[tod] = tex;
        applySky(tex);
      }, undefined, () => {});
    }
  }

  // Optional photo textures for the roads: public/assets/textures/asphalt_color.jpg, _normal.jpg, _roughness.jpg
  loadRoadTextures() {
    if (!this.opts.assetBase) return;
    const base = this.opts.assetBase.endsWith('/') ? this.opts.assetBase : `${this.opts.assetBase}/`;
    const loader = new THREE.TextureLoader();
    const load = (name, srgb) => new Promise((res) => {
      loader.load(`${base}assets/textures/${name}`, (t) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 1);
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => res(null));
    });
    Promise.all([load('asphalt_color.jpg', true), load('asphalt_normal.jpg', false), load('asphalt_roughness.jpg', false)]).then(([c, n, r]) => {
      const m = this.world.groundMat;
      if (c) { m.map = c; m.color.setRGB(0.6, 0.6, 0.62); }
      if (n) m.normalMap = n;
      if (r) m.roughnessMap = r;
      if (c || n || r) m.needsUpdate = true;
    });
  }

  resize() {
    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 720;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.root.style.fontSize = `${clamp(Math.min(h / 46, w / 70), 8.5, 15)}px`;
  }

  // ───────────────────────── input ─────────────────────────
  bindInput() {
    this.onKeyDown = (e) => {
      if (!this.active) return;
      if (this.mode !== 'play' || this.overlay) {
        if (e.code === 'Escape') {
          e.preventDefault();
          if (this.mode === 'garage') this.leaveGarage();
          else if (this.overlay === 'pause' || this.overlay === 'map') this.resume();
          else if (this.overlay === 'results') this.closeResults();
          else if (this.mode === 'play') this.showPause();
          else if (this.ui.screen.querySelector('[data-act=back]')) this.onAction('back');
          return;
        }
        if (e.code === 'KeyM' && this.overlay === 'map') { this.resume(); return; }
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault();
          this.moveFocus(e.code === 'ArrowDown' ? 1 : -1);
        }
        return;
      }
      if (HOLD_KEYS[e.code] || ACTION_KEYS[e.code]) e.preventDefault();
      if (HOLD_KEYS[e.code]) this.keys.add(HOLD_KEYS[e.code]);
      if (!e.repeat && ACTION_KEYS[e.code]) this.action(ACTION_KEYS[e.code]);
    };
    this.onKeyUp = (e) => {
      if (HOLD_KEYS[e.code]) this.keys.delete(HOLD_KEYS[e.code]);
    };
    this.onBlur = () => this.keys.clear();
    this.onDocDown = (e) => { this.active = this.root.contains(e.target); };
    this.onVis = () => {
      if (document.hidden) {
        this.audio.suspend();
        if (this.mode === 'play' && !this.overlay) this.showPause();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerdown', this.onDocDown, true);
    document.addEventListener('visibilitychange', this.onVis);
  }

  moveFocus(d) {
    const btns = [...this.ui.screen.querySelectorAll('button:not([disabled])')];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement);
    btns[(i + d + btns.length) % btns.length].focus();
  }

  action(a) {
    if (a === 'pause') return this.togglePause();
    if (a === 'photo') return this.enterPhoto();
    if (a === 'map') return this.showMap();
    if (a === 'camera') { this.camMode = (this.camMode + 1) % 3; return undefined; }
    if (a === 'reset') return this.resetCar();
    if (a === 'sb') return this.toggleSB();
    if (a === 'interact') return this.interact();
    if (a === 'fullscreen') return this.toggleFullscreen();
    if (a === 'chat') return this.multi.openChat();
    return undefined;
  }

  toggleFullscreen() {
    const el = this.container.closest('.game-frame, .frame') || this.container;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => this.popup('Fullscreen is not available here', ''));
      else this.popup('Fullscreen is not available here', '');
    } catch {
      this.popup('Fullscreen is not available here', '');
    }
  }

  pollGamepad() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { pads = []; }
    const gp = pads && [...pads].find((p) => p && p.connected);
    this.pad = null;
    if (!gp) return;
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const pressed = (i) => b(i) > 0.5 && !this.padPrev[i];
    const ax = Math.abs(gp.axes[0] || 0) > 0.15 ? gp.axes[0] : 0;
    this.pad = { steer: ax, throttle: b(7), brake: b(6), nitro: b(0) > 0.5, hand: b(1) > 0.5, back: b(5) > 0.5 };
    if (this.mode === 'play' && !this.overlay) {
      if (pressed(2)) this.toggleSB();
      if (pressed(3)) this.action('camera');
      if (pressed(9)) this.togglePause();
      if (pressed(8)) this.showMap();
      if (pressed(4)) this.resetCar();
      if (pressed(0) && this.promptTarget) this.interact();
    } else {
      if (pressed(12)) this.moveFocus(-1);
      if (pressed(13)) this.moveFocus(1);
      if (pressed(0) && document.activeElement && this.ui.screen.contains(document.activeElement)) document.activeElement.click();
      if (pressed(1) || pressed(9)) this.onKeyDown({ code: 'Escape', preventDefault() {} });
    }
    this.padPrev = gp.buttons.map((x) => x.pressed || x.value > 0.5);
    this.active = true;
  }

  readInput() {
    const k = this.keys;
    const t = this.touch;
    const p = this.pad || {};
    let steer = (k.has('right') || t.right ? 1 : 0) - (k.has('left') || t.left ? 1 : 0);
    if (p.steer) steer = p.steer;
    return {
      throttle: Math.max(k.has('up') || t.up ? 1 : 0, p.throttle || 0),
      brake: Math.max(k.has('down') || t.down ? 1 : 0, p.brake || 0),
      steer,
      handbrake: k.has('hand') || !!t.hand || !!p.hand,
      nitro: k.has('nitro') || !!t.nitro || !!p.nitro,
    };
  }

  toggleSB() {
    if (this.mode !== 'play' || this.overlay) return;
    if (this.event && this.event.mp && !this.sb.on) { this.popup('No slow motion in online races', ''); return; }
    if (this.sb.on) this.sb.on = false;
    else if (this.sb.meter > 0.08) this.sb.on = true;
    this.audio.slowmo(this.sb.on);
    this.root.classList.toggle('sb', this.sb.on);
  }

  resetCar() {
    if (this.freeze > 0 || this.resetCooldown > 0) return;
    this.resetCooldown = 2;
    const P = this.player;
    const ev = this.event;
    if (ev && ev.path && ev.player) {
      // back onto the race route, at the nearest point between the last and next checkpoints
      const seq = ev.seq;
      const lo = ev.player.cp > 0 ? seq[ev.player.cp - 1].pi : 0;
      const hi = seq[ev.player.cp] ? seq[ev.player.cp].pi : ev.path.length - 1;
      let best = lo;
      let bd = Infinity;
      for (let i = lo; i <= Math.min(hi, ev.path.length - 2); i++) {
        const d = Math.hypot(ev.path[i].x - P.x, ev.path[i].z - P.z);
        if (d < bd) { bd = d; best = i; }
      }
      const a = ev.path[best];
      const b = ev.path[best + 1];
      const h = headingTo(b.x - a.x, b.z - a.z);
      const elevated = a.y - this.world.city.terrainAt(a.x, a.z).h > 0.3;
      P.place(a.x, a.z, h, 0, elevated ? a.y : null);
    } else {
      this.placeOnRoad(P, P.x, P.z, P.h);
    }
    P.spiked = 0;
    this.camH = P.h;
    this.popup('Car reset', '');
  }

  interact() {
    const m = this.promptTarget;
    if (!m || this.mode !== 'play' || this.overlay || this.event) return;
    if (m.kind === 'safehouse') {
      if (this.pursuit) { this.popup('Lose the cops first', 'red'); return; }
      this.showGarage('roam');
      return;
    }
    if (this.pursuit) { this.popup('Lose the cops before starting an event', 'red'); return; }
    if (this.multi.active && (m.def.type === 'sprint' || m.def.type === 'circuit')) {
      if (this.multi.isHost) this.multi.startRace(m.def);
      else this.popup('Online races are started by the host', 'gold');
      return;
    }
    this.startEvent(m.def);
  }

  setGps(x, z, label) {
    this.gps = { x, z, label, route: [], t: 0 };
    this.updateGpsRoute();
  }

  updateGpsRoute() {
    const g = this.gps;
    if (!g) return;
    const P = this.player;
    const C = this.world.city;
    const a = C.nearestNode(P.x, P.z);
    const b = C.nearestNode(g.x, g.z);
    const steps = C.route(a.id, b.id);
    g.route = [{ x: P.x, z: P.z }, ...(steps ? C.routePoints(steps) : []), { x: g.x, z: g.z }];
  }

  // ───────────────────────── main loop ─────────────────────────
  frame(t) {
    this.raf = requestAnimationFrame(this.frame);
    const now = t / 1000;
    const dt = Math.min(0.05, Math.max(0, now - (this.last || now)));
    this.last = now;
    this.time += dt;
    this.pollGamepad();
    if (this.mode === 'play' && !this.overlay) this.updatePlay(dt);
    else if (this.overlay === 'photo') this.updatePhoto(dt);
    else this.updateIdle(dt);
    this.autoRes(dt);
    this.multi.update(dt);
    this.updateAmbient(dt);
    if (this.gradePass) {
      this.gradePass.uniforms.time.value = this.time % 100;
      const P = this.player;
      const playing = this.mode === 'play' && !this.overlay;
      const sp = playing ? clamp((P.speed - 28) / 50, 0, 1) : 0;
      const target = sp * 0.07 + (playing && P.boosting ? 0.05 : 0) + (playing && this.sb.on ? 0.02 : 0);
      const u = this.blurPass.uniforms.strength;
      u.value = damp(u.value, target, 6, dt);
    }
    if (this.cubeCam && this.player && (this.cubeFrame++ % 3 === 0)) {
      const P = this.player;
      P.parts.group.visible = false;
      this.cubeCam.position.set(P.x, P.y + 1.1, P.z);
      this.cubeCam.update(this.renderer, this.scene);
      P.parts.group.visible = this.mode !== 'garage';
    }
    if (this.useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // keep the frame rate up: lower the render resolution when frames are slow, raise it again when there is room
  autoRes(dt) {
    if (this.save.settings.dynRes === false || this.mode !== 'play' || document.hidden) return;
    this.frN = (this.frN || 0) + 1;
    this.frT = (this.frT || 0) + dt;
    if (this.frT < 2) return;
    const fps = this.frN / this.frT;
    this.frN = 0; this.frT = 0;
    this.resScale = this.resScale || 1;
    let next = this.resScale;
    if (fps < 45 && this.resScale > 0.55) next = Math.max(0.55, this.resScale * 0.87);
    else if (fps > 58 && this.resScale < 1) next = Math.min(1, this.resScale * 1.1);
    if (next !== this.resScale) { this.resScale = next; this.applyPixelRatio(); this.resize(); }
  }

  applyPixelRatio() {
    const st = this.save.settings;
    const dpr = window.devicePixelRatio || 1;
    const base = st.quality === 'low' ? Math.min(dpr, 1) * 0.7 : st.quality === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(base * (st.dynRes === false ? 1 : this.resScale || 1));
    if (this.composer) this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  updateIdle(dt) {
    const cam = this.camera;
    if (this.mode === 'menu' || this.mode === 'garage') {
      const P = this.player;
      this.orbitA += dt * (this.mode === 'garage' ? 0.25 : 0.09);
      if (this.mode === 'menu') {
        // a low, slow cinematic orbit with the car framed right of centre (the menu sits on the left)
        P.sync(0.016);
        const r = 9.5;
        cam.position.set(P.x + Math.cos(this.orbitA) * r, P.y + 1.35, P.z + Math.sin(this.orbitA) * r);
        cam.fov = 42;
        cam.updateProjectionMatrix();
        const dx = P.x - cam.position.x; const dz = P.z - cam.position.z; const l = Math.hypot(dx, dz) || 1;
        const side = (this.camera.aspect || 1.6) > 1 ? 2.6 : 0;
        cam.lookAt(P.x + (dz / l) * side, P.y + 0.75, P.z - (dx / l) * side);
      } else {
        const r = 7.5;
        cam.position.set(P.x + Math.cos(this.orbitA) * r, P.y + 2.2, P.z + Math.sin(this.orbitA) * r);
        cam.fov = 55;
        cam.updateProjectionMatrix();
        cam.lookAt(P.x, P.y + 0.8, P.z);
      }
    }
    this.audio.update({ rpm: 0, throttle: 0, active: false, skid: 0, nitro: false, speedNorm: 0, siren: 0, sirenFast: false, heli: 0, slowmo: false });
  }

  updatePlay(dt) {
    const P = this.player;
    if (this.sb.on) {
      this.sb.meter -= dt / 5;
      if (this.sb.meter <= 0) { this.sb.meter = 0; this.toggleSB(); }
    }
    const wdt = dt * (this.sb.on ? 0.35 : 1);
    const pdt = dt * (this.sb.on ? 0.6 : 1);
    this.resetCooldown = Math.max(0, (this.resetCooldown || 0) - dt);
    this.infractionT = Math.max(0, this.infractionT - dt);

    let inp = this.readInput();
    if (this.freeze > 0) {
      this.freeze -= dt;
      inp = { throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false };
    }
    if (this.event && this.event.countdown > 0) inp = { ...inp, throttle: 0, nitro: false, brake: 0, handbrake: true }; // held on the line (brake alone would reverse)
    if (inp.nitro && !P.boosting && P.nitro > 0) this.audio.nitroStart();
    inp.steerBoost = this.sb.on ? 1.6 : 1;

    const steps = clamp(Math.ceil((P.speed * pdt) / 1.5), 1, 4);
    let impact = 0;
    for (let k = 0; k < steps; k++) {
      P.update(pdt / steps, inp, this.world);
      impact = Math.max(impact, P.impact);
    }
    if (impact > 4) this.onWallHit(P, impact);
    // into the sea: tow back to the nearest road
    if (P.y < SEA_Y - 0.9 && this.freeze <= 0) {
      this.resetCooldown = 0;
      this.resetCar();
      this.popup('SPLASHDOWN', 'blue');
    }
    if (P.landed > 0.55) {
      const air = P.landed;
      this.popup(`AIR ${air.toFixed(1)}s`, 'blue');
      this.addNitro(air * 0.35);
      this.sb.meter = Math.min(1, this.sb.meter + air * 0.12);
      this.shake = Math.max(this.shake, 0.5);
      if (this.pursuit) this.pursuit.bounty += Math.round(air * 150);
    }
    P.sync(pdt);

    this.updateCops(wdt);
    this.updateRacers(wdt);
    const remotes = this.multi.bodies();
    const movers = [P, ...this.cops, ...this.racers.map((r) => r.v), ...remotes, ...(this.barrierPts || [])];
    this.traffic.update(wdt, P.x, P.z, movers);
    this.resolveCollisions();
    this.nearMisses();
    this.updateDrift(pdt);
    this.updateEffects(dt, wdt);

    // passive meters
    this.addNitro(pdt * 0.03);
    if (P.speed > 45) this.sb.meter = Math.min(1, this.sb.meter + pdt * 0.02);
    this.save.stats.topSpeed = Math.max(this.save.stats.topSpeed, P.speed);
    this.save.stats.distance = (this.save.stats.distance || 0) + P.speed * pdt;
    this.updateSpeedCams();
    this.msT = (this.msT || 0) - dt;
    if (this.msT <= 0) { this.msT = 2; this.checkMilestones(); }

    if (this.pursuit) this.updatePursuit(wdt);
    else if (!this.event) this.detectPolice();
    if (this.heli) this.updateHeli(wdt);
    this.updateRoadblocks();
    if (!this.pursuit && !this.event) this.maintainPatrols(dt);
    if (this.event) this.updateEvent(dt, wdt);
    this.updatePrompt();
    if (this.gps) {
      this.gps.t -= dt;
      if (this.gps.t <= 0) { this.gps.t = 1; this.updateGpsRoute(); }
      if (Math.hypot(this.gps.x - P.x, this.gps.z - P.z) < 20) { this.popup('You have arrived', 'gold'); this.gps = null; }
    }
    this.updateCamera(dt);
    this.updateHud();
    this.updateSound();
  }

  addNitro(n) {
    const P = this.player;
    P.nitro = Math.min(P.s.nitroCap, P.nitro + n);
  }

  onWallHit(v, impact) {
    const c = v.contact;
    if (c) {
      const n = Math.min(14, Math.round(impact));
      for (let k = 0; k < n; k++) this.fx.sparks.spawn(c.x, v.y + 0.5, c.z, (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, { life: 0.5, s0: 0.5, s1: 0.1, op: 1, grav: -18 });
    }
    if (v === this.player) {
      this.shake = Math.max(this.shake, Math.min(1.2, impact / 18));
      this.audio.crash(impact);
      if (this.pursuit && impact > 15) this.pursuit.bounty += 50;
    }
  }

  updateDrift(dt) {
    const P = this.player;
    const d = this.drift;
    const slip = Math.abs(P.vS);
    if (P.grounded && slip > 4 && P.speed > 12) {
      d.score += slip * P.speed * dt * 0.6;
      d.idle = 0;
    } else if (d.score > 0) {
      d.idle += dt;
      if (d.idle > 0.45) {
        const sc = Math.round(d.score);
        const dev = this.event;
        if (dev && dev.type === 'drift' && dev.countdown <= 0 && !dev.results && sc > 60) dev.driftTotal += sc;
        this.save.stats.bestDrift = Math.max(this.save.stats.bestDrift || 0, sc);
        if (sc > 120) {
          this.popup(`DRIFT ${sc.toLocaleString('en-US')}`, 'purple');
          this.addNitro(Math.min(1.2, sc / 1600));
          this.sb.meter = Math.min(1, this.sb.meter + sc / 7000);
          if (this.pursuit) this.pursuit.bounty += Math.round(sc * 0.2);
        }
        d.score = 0;
      }
    }
  }

  updateEffects(dt, wdt) {
    const P = this.player;
    const slipping = P.grounded && ((Math.abs(P.vS) > 3.5 && P.speed > 8) || (P.braking && P.speed > 18) || (this.readInput().throttle > 0 && P.vF > 0 && P.vF < 8 && P.s.accel > 15));
    this.skidding = slipping ? Math.min(1, Math.abs(P.vS) / 10 + (P.braking ? 0.4 : 0.2)) : 0;
    if (slipping) {
      this.skidAcc += P.speed * dt;
      const fx = Math.sin(P.h);
      const fz = Math.cos(P.h);
      const rx = -fz;
      const rz = fx;
      const back = P.parts.dims.L / 2 - 0.85;
      const side = P.parts.dims.W / 2 - 0.14;
      if (this.skidAcc > 0.9) {
        this.skidAcc = 0;
        [-1, 1].forEach((s) => this.fx.skids.add(P.x - fx * back + rx * side * s, P.y, P.z - fz * back + rz * side * s, P.h));
      }
      if (Math.random() < 0.5) {
        const s = Math.random() < 0.5 ? -1 : 1;
        this.fx.smoke.spawn(P.x - fx * back + rx * side * s, P.y + 0.3, P.z - fz * back + rz * side * s, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, { life: 1.4, s0: 0.8, s1: 4.5, op: 0.35, drag: 1.2 });
      }
    }
    this.fx.smoke.update(wdt);
    this.fx.sparks.update(wdt);
    this.fx.rain.update(dt, this.camera);
    {
      const fx2 = Math.sin(P.h);
      const fz2 = Math.cos(P.h);
      const back = P.parts.dims.L / 2;
      const side = P.parts.dims.W * 0.31;
      const y = P.y + 0.72;
      const pts = [-1, 1].map((sd) => [P.x - fx2 * back - fz2 * side * sd, y, P.z - fz2 * back + fx2 * side * sd]);
      const k = clamp((P.speed - 30) / 30, 0, 1) * (this.tod && this.tod.lamps > 0.3 ? 1 : 0.4);
      this.fx.trails.update(this.camMode === 2 ? null : pts, k);
    }
    this.root.classList.toggle('nos', P.boosting);
  }

  // ───────────────────────── collisions ─────────────────────────
  resolveCollisions() {
    const bodies = [this.player, ...this.cops, ...this.racers.map((r) => r.v), ...this.traffic.cars, ...this.multi.bodies()];
    const P = this.player;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (dx > 6 || dx < -6 || dz > 6 || dz < -6) continue;
        if (Math.abs(a.y - b.y) > 1.8) continue;
        const cp = this.capsule(a, b);
        let cx = cp.x2 - cp.x1;
        let cz = cp.z2 - cp.z1;
        let d = Math.hypot(cx, cz);
        const R = a.bodyR + b.bodyR;
        if (d >= R) continue;
        if (d < 1e-4) { cx = dx; cz = dz; d = Math.hypot(dx, dz) || 1; }
        const nx = cx / d;
        const nz = cz / d;
        if (a.kind === 'remote' && b.kind === 'remote') continue;
        // remote cars are driven by someone else: they push, they don't get pushed
        const ma = a.kind === 'remote' ? 1e6 : a.role === 'block' ? 6 : a.mass;
        const mb = b.kind === 'remote' ? 1e6 : b.role === 'block' ? 6 : b.mass;
        const pen = R - d;
        a.x -= nx * pen * (mb / (ma + mb));
        a.z -= nz * pen * (mb / (ma + mb));
        b.x += nx * pen * (ma / (ma + mb));
        b.z += nz * pen * (ma / (ma + mb));
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv >= 0) continue;
        const va = a.vx * nx + a.vz * nz; // how hard each car was driving into the other
        const vb = -(b.vx * nx + b.vz * nz);
        const jimp = (-(1 + 0.25) * rv) / (1 / ma + 1 / mb);
        a.vx -= (jimp * nx) / ma;
        a.vz -= (jimp * nz) / ma;
        b.vx += (jimp * nx) / mb;
        b.vz += (jimp * nz) / mb;
        this.onCarHit(a, b, -rv, (cp.x1 + cp.x2) / 2, (cp.z1 + cp.z2) / 2, va, vb);
      }
    }
  }

  // closest points between two cars' centre-line segments
  capsule(a, b) {
    const ax = Math.sin(a.h);
    const az = Math.cos(a.h);
    const bxv = Math.sin(b.h);
    const bzv = Math.cos(b.h);
    const p1x = a.x - ax * a.halfLen;
    const p1z = a.z - az * a.halfLen;
    const d1x = 2 * ax * a.halfLen;
    const d1z = 2 * az * a.halfLen;
    const p2x = b.x - bxv * b.halfLen;
    const p2z = b.z - bzv * b.halfLen;
    const d2x = 2 * bxv * b.halfLen;
    const d2z = 2 * bzv * b.halfLen;
    const rx = p1x - p2x;
    const rz = p1z - p2z;
    const A = d1x * d1x + d1z * d1z;
    const E = d2x * d2x + d2z * d2z;
    const F = d2x * rx + d2z * rz;
    const C = d1x * rx + d1z * rz;
    const B = d1x * d2x + d1z * d2z;
    const den = A * E - B * B;
    let s = den > 1e-6 ? clamp((B * F - C * E) / den, 0, 1) : 0;
    let t = (B * s + F) / E;
    if (t < 0) { t = 0; s = clamp(-C / A, 0, 1); } else if (t > 1) { t = 1; s = clamp((B - C) / A, 0, 1); }
    return { x1: p1x + d1x * s, z1: p1z + d1z * s, x2: p2x + d2x * t, z2: p2z + d2z * t };
  }

  nearMisses() {
    const P = this.player;
    const list = [...this.cops, ...this.traffic.cars];
    for (const o of list) {
      const dx = o.x - P.x;
      const dz = o.z - P.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 196) {
        o.nearMissed = false;
        continue;
      }
      const cp = this.capsule(P, o);
      this.checkNearMiss(o, Math.hypot(cp.x2 - cp.x1, cp.z2 - cp.z1) - P.bodyR - o.bodyR);
    }
  }

  checkNearMiss(o, gap) {
    const P = this.player;
    if (o.nearMissed || gap <= 0.05 || gap > 1.5 || (o.wreck > 0) || o.role === 'wreck') return;
    const rel = Math.hypot(P.vx - o.vx, P.vz - o.vz);
    if (rel < 18 || P.speed < 20) return;
    o.nearMissed = true;
    this.save.stats.nearMisses = (this.save.stats.nearMisses || 0) + 1;
    this.popup('NEAR MISS', 'blue');
    this.audio.whoosh();
    this.addNitro(0.3);
    this.sb.meter = Math.min(1, this.sb.meter + 0.08);
    if (this.pursuit) this.pursuit.bounty += 100;
  }

  onCarHit(a, b, impact, x, z, va = 0, vb = 0) {
    const P = this.player;
    if (impact > 5) {
      for (let k = 0; k < Math.min(12, impact); k++) this.fx.sparks.spawn(x, 0.7, z, (Math.random() - 0.5) * 10, Math.random() * 5, (Math.random() - 0.5) * 10, { life: 0.45, s0: 0.5, s1: 0.1, op: 1, grav: -18 });
    }
    [a, b].forEach((v) => {
      if (v.kind === 'traffic' && impact > 3) {
        v.nearMissed = true;
        if (this.traffic.wreckCar(v) && (a === P || b === P)) {
          this.infractionT = 3;
          if (this.pursuit) {
            this.pursuit.bounty += 250;
            this.popup('PROPERTY DAMAGE +250', 'gold');
          }
        }
      }
    });
    const other = a === P ? b : b === P ? a : null;
    if (other) {
      this.shake = Math.max(this.shake, Math.min(1, impact / 20));
      if (impact > 4) this.audio.crash(impact);
      if (other.kind === 'cop' && other.role !== 'wreck' && impact > 5 && this.time > (other.hitT || 0)) {
        other.hitT = this.time + 0.35; // one damage event per hit, not per frame of contact
        this.infractionT = 3;
        const playerPush = a === P ? va : vb;
        const copPush = a === P ? vb : va;
        // the player only scores real damage when they are the one doing the ramming
        if (playerPush >= copPush) other.hp -= impact * (impact > 10 ? 4.5 : 2);
        if (!this.pursuit && !this.event) this.startPursuit(0);
        if (this.pursuit) this.pursuit.bounty += Math.round(impact * 10);
        if (other.hp <= 0) this.wreckCop(other, true);
      }
    } else {
      // cop vs cop / cop vs traffic damage
      [a, b].forEach((v) => {
        if (v.kind === 'cop' && v.role !== 'wreck' && impact > 25) {
          v.hp -= (impact - 25) * 1.5;
          if (v.hp <= 0) this.wreckCop(v, false);
        }
      });
    }
  }

  // ───────────────────────── police ─────────────────────────
  createCop(tierIdx, x, z, h, role) {
    const tier = COP_TIERS[tierIdx];
    const parts = this.factory.build(tier.style, tierIdx === 2 ? '#1c2028' : '#0f1115', { cop: true, modelKey: 'cop', paint2: '#f1f1f1', caliper: 3 });
    this.scene.add(parts.group);
    const stats = { top: tier.top, accel: tier.accel, grip: 7.5 * tier.handling, steer: 2.1 * tier.handling, nitroCap: 3, nitroPower: 1.45, brake: 30, mass: tier.mass };
    const v = new Vehicle(stats, parts, { kind: 'cop' });
    v.place(x, z, h, role === 'chase' ? 22 : 0);
    v.role = role;
    v.hp = tierIdx === 2 ? 180 : 100;
    v.tier = tierIdx;
    v.nav = null;
    v.stuck = 0;
    v.reverseT = 0;
    v.wreckT = 0;
    v.goal = null;
    v.flashOffset = Math.random();
    this.cops.push(v);
    v.sync(0.016);
    return v;
  }

  removeCop(c) {
    this.factory.dispose(c.parts);
    const i = this.cops.indexOf(c);
    if (i >= 0) this.cops.splice(i, 1);
  }

  wreckCop(c, byPlayer) {
    if (c.role === 'wreck') return;
    c.role = 'wreck';
    c.wreckT = 7;
    c.spin = (Math.random() - 0.5) * 5;
    c.boosting = false;
    if (c.parts.lightbar) {
      c.parts.lightbar.red.emissiveIntensity = 0;
      c.parts.lightbar.blue.emissiveIntensity = 0;
    }
    for (let k = 0; k < 10; k++) this.fx.smoke.spawn(c.x, 1, c.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4, { life: 2.2, s0: 1.5, s1: 6, op: 0.5, color: 0x555555, drag: 0.8 });
    this.audio.boom();
    if (byPlayer || this.pursuit) {
      this.save.stats.takedowns += 1;
      if (this.pursuit) {
        this.pursuit.bounty += 1000;
        this.pursuit.takedowns += 1;
      }
      this.popup('COP TAKEDOWN +1,000', 'gold');
      this.sb.meter = Math.min(1, this.sb.meter + 0.25);
      this.addNitro(0.6);
    }
  }

  // Follow a road route toward (gx, gz). Replans every 1.5 s or when the goal moves.
  navigate(c, gx, gz) {
    const C = this.world.city;
    let n = c.nav;
    if (!n || this.time - n.t > 1.5 || Math.hypot(n.gx - gx, n.gz - gz) > 60 || n.i >= n.pts.length - 2) {
      const pts = [];
      const rd = C.nearestRoad(c.x, c.z, c.y);
      let start;
      if (rd && rd.d < rd.e.hw + 12) {
        const e = rd.e;
        const fwd = Math.sin(c.h) * rd.dx + Math.cos(c.h) * rd.dz >= 0 || c.speed < 3;
        start = fwd ? e.b : e.a;
        // the rest of the current road up to the junction ahead
        if (fwd) { for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > rd.s + 2) pts.push({ x: e.pts[i][0], z: e.pts[i][1] }); } else {
          for (let i = e.pts.length - 1; i >= 0; i--) if (e.cum[i] < rd.s - 2) pts.push({ x: e.pts[i][0], z: e.pts[i][1] });
        }
      } else start = C.nearestNode(c.x, c.z).id;
      const steps = C.route(start, C.nearestNode(gx, gz).id);
      if (steps) C.routePoints(steps).forEach((q, k) => { if (k > 0 || !pts.length) pts.push(q); });
      pts.push({ x: gx, z: gz });
      n = c.nav = { pts, i: 0, t: this.time, gx, gz };
    }
    const pts = n.pts;
    // move the index to the point nearest the car (never backwards)
    while (n.i < pts.length - 1) {
      const a = pts[n.i];
      const b = pts[n.i + 1];
      const da = Math.hypot(a.x - c.x, a.z - c.z);
      const db = Math.hypot(b.x - c.x, b.z - c.z);
      if (db <= da || da < 6) n.i++;
      else break;
    }
    // look ahead along the route
    const L = 12 + c.speed * 0.5;
    let acc = Math.hypot(pts[n.i].x - c.x, pts[n.i].z - c.z);
    let j = n.i;
    while (j < pts.length - 1 && acc < L) {
      acc += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].z - pts[j].z);
      j++;
    }
    // sharp turn coming up?
    const D = Math.max(25, c.speed * 1.6);
    let corner = false;
    let k = n.i;
    let dd = 0;
    const h0 = k < pts.length - 1 ? headingTo(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z) : c.h;
    while (k < pts.length - 2 && dd < D) {
      dd += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
      k++;
      if (Math.abs(wrapAngle(headingTo(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z) - h0)) > 0.6) { corner = true; break; }
    }
    return { x: pts[j].x, z: pts[j].z, corner };
  }

  drive(c, tx, tz, cruise, dt, extra = {}) {
    if (c.reverseT > 0) {
      c.reverseT -= dt;
      return { throttle: 0, brake: 1, steer: c.revSteer, handbrake: false };
    }
    const desired = headingTo(tx - c.x, tz - c.z);
    const diff = wrapAngle(desired - c.h);
    const steer = this.avoid(c, clamp(-diff * 2.2, -1, 1));
    const sp = c.speed;
    let throttle = sp < cruise ? 1 : 0;
    let brake = 0;
    let handbrake = false;
    if (Math.abs(diff) > 1.0 && sp > 16) {
      throttle = 0.2;
      brake = 0.6;
      handbrake = sp > 24;
    }
    if (extra.cornerSpeed && sp > extra.cornerSpeed) {
      throttle = 0;
      brake = clamp((sp - extra.cornerSpeed) / 8, 0, 1);
    }
    if (throttle > 0.5 && sp < 2.2) {
      c.stuck += dt;
      if (c.stuck > 1.1) {
        c.reverseT = 1.0;
        c.revSteer = steer > 0 ? -1 : 1;
        c.stuck = 0;
      }
    } else c.stuck = Math.max(0, c.stuck - dt);
    return { throttle, brake, steer, handbrake, nitro: !!extra.nitro && Math.abs(diff) < 0.25, topScale: extra.topScale || 1 };
  }

  // Steer around traffic and other AI cars in the way.
  avoid(c, steer) {
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    const look = 14 + c.speed * 0.7;
    let bias = 0;
    const check = (o) => {
      if (o === c || o.role === 'wreck' || o.role === 'block') return;
      const dx = o.x - c.x;
      const dz = o.z - c.z;
      const al = dx * fx + dz * fz;
      if (al <= 0 || al > look) return;
      const lat = -dx * fz + dz * fx;
      if (Math.abs(lat) > 3.6) return;
      bias += (lat >= 0 ? -1 : 1) * (1 - al / look) * 1.5;
    };
    this.traffic.cars.forEach(check);
    this.cops.forEach(check);
    this.racers.forEach((r) => check(r.v));
    return clamp(steer + bias, -1, 1);
  }

  updateCops(dt) {
    const P = this.player;
    const W = this.world;
    for (const c of [...this.cops]) {
      const dx = P.x - c.x;
      const dz = P.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (c.role === 'wreck') {
        c.coast(dt, W);
        c.wreckT -= dt;
        if (Math.random() < 0.15) this.fx.smoke.spawn(c.x, 1.2, c.z, 0, 2.5, 0, { life: 2, s0: 1, s1: 5, op: 0.35, color: 0x444444 });
        if (c.wreckT <= 0 && dist > 90) this.removeCop(c);
        else c.sync(dt);
        continue;
      }
      if (c.role === 'block') {
        c.coast(dt, W);
        c.sync(dt);
        continue;
      }
      let inp;
      const pur = this.pursuit;
      if (c.role === 'chase' && pur) {
        const direct = !pur.cooldown && dist < 85 && (dist < 22 || W.los(c.x, c.z, P.x, P.z));
        if (direct) {
          const lead = clamp(dist / 45, 0, 1.1);
          // close in hard, but ease off near the player so cops box you in instead of wrecking themselves
          const cruise = dist < 8 ? Math.max(0, P.speed - 4) : dist < 35 ? P.speed + 6 + dist * 0.4 : 999;
          inp = this.drive(c, P.x + P.vx * lead, P.z + P.vz * lead, cruise, dt, { nitro: pur.heat >= 4 && dist > 35 });
          if (dist < 8 && c.speed > P.speed - 1) { inp.throttle = 0; inp.brake = 1; } // box the player in, don't shove them
          c.nav = null;
        } else {
          const goal = pur.cooldown ? pur.lastKnown : P;
          const t = this.navigate(c, goal.x, goal.z);
          inp = this.drive(c, t.x, t.z, pur.cooldown ? 26 : 999, dt, { cornerSpeed: t.corner ? 19 : 0 });
        }
        inp.topScale = dist > 140 ? 1.14 : 1;
      } else {
        if (c.role === 'chase') c.role = 'patrol';
        if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 25) {
          const gn = this.world.city.randomNode();
          c.goal = { x: gn.x, z: gn.z };
          c.nav = null;
        }
        const t = this.navigate(c, c.goal.x, c.goal.z);
        inp = this.drive(c, t.x, t.z, 15, dt, { cornerSpeed: t.corner ? 9 : 0 });
      }
      c.update(dt, inp, W);
      // wedged out of sight for a while: tow it back onto the nearest road
      c.slowT = c.speed < 2 ? (c.slowT || 0) + dt : 0;
      if (c.slowT > 6 && dist > 60 && !W.los(c.x, c.z, P.x, P.z)) {
        c.slowT = 0;
        this.placeOnRoad(c, c.x, c.z, c.h);
        c.nav = null;
        c.reverseT = 0;
        c.stuck = 0;
      }
      if (c.impact > 20) {
        c.hp -= (c.impact - 20) * 2;
        if (c.hp <= 0) this.wreckCop(c, false);
      }
      c.sync(dt);
    }
  }

  maintainPatrols(dt) {
    const P = this.player;
    this.patrolT -= dt;
    const patrols = this.cops.filter((c) => c.role === 'patrol');
    patrols.forEach((c) => {
      if (Math.hypot(c.x - P.x, c.z - P.z) > 900) this.removeCop(c);
    });
    if (patrols.length < PATROL_COUNT && this.patrolT <= 0) {
      this.patrolT = 2;
      const sp = this.spawnPoint(300, 650, null);
      if (sp) this.createCop(0, sp.x, sp.z, sp.h, 'patrol');
    }
  }

  // A spot on a street-level road between minD and maxD from the player, in the right-hand lane,
  // preferring spots behind the player (or ahead) and out of sight.
  spawnPoint(minD, maxD, behind) {
    const P = this.player;
    const C = this.world.city;
    const fx = Math.sin(P.h);
    const fz = Math.cos(P.h);
    let best = null;
    let bs = -1;
    for (let k = 0; k < 60; k++) {
      const e = C.edges[Math.floor(Math.random() * C.edges.length)];
      if (e.len < 30) continue;
      const q = C.at(e, e.t0 + 8 + Math.random() * Math.max(1, e.len - e.t0 - e.t1 - 16));
      if (q.lift > 0.3) continue;
      const d = Math.hypot(q.x - P.x, q.z - P.z);
      if (d < minD || d > maxD) continue;
      let s = Math.random();
      const isBehind = (q.x - P.x) * fx + (q.z - P.z) * fz < 0;
      if (behind !== null && isBehind === behind) s += 1;
      if (!this.world.los(q.x, q.z, P.x, P.z)) s += 0.6;
      if (s > bs) {
        // face along the road, toward the player
        const dir = (P.x - q.x) * q.dx + (P.z - q.z) * q.dz >= 0 ? 1 : -1;
        const tx = q.dx * dir;
        const tz = q.dz * dir;
        const off = e.T.median + e.T.laneW * 0.5;
        bs = s;
        best = { x: q.x - tz * off, z: q.z + tx * off, h: Math.atan2(tx, tz) };
      }
    }
    return best;
  }

  detectPolice() {
    if (this.freeze > 0) return;
    if (this.multi.active) {
      const h = this.multi.accompliceHeat();
      if (h) { this.startPursuit(h); this.popup('ACCOMPLICE · the cops are after you too', 'red'); return; }
    }
    const P = this.player;
    const wanted = (this.save.carHeat[this.save.car] || 0) >= 2;
    const speeding = P.speed > 33.4;
    if (!speeding && !wanted && this.infractionT <= 0) return;
    for (const c of this.cops) {
      if (c.role !== 'patrol') continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d < 75 && this.world.los(c.x, c.z, P.x, P.z)) {
        this.startPursuit(0);
        if (speeding) this.popup('SPEEDING', 'red');
        return;
      }
    }
  }

  startPursuit(baseHeat) {
    const carHeat = this.save.carHeat[this.save.car] || 0;
    const heat = clamp(Math.max(1, baseHeat, carHeat), 1, 5);
    const P = this.player;
    this.pursuit = {
      heat, baseHeat: heat, bounty: 0, time: 0, unseen: 0, cooldown: false, cool: 0, coolMax: 1, busted: 0,
      lastKnown: { x: P.x, z: P.z }, spawnT: 1.5, rbT: 12, siren: 1, takedowns: 0,
    };
    this.cops.forEach((c) => {
      if (c.role === 'patrol' && Math.hypot(c.x - P.x, c.z - P.z) < 600) { c.role = 'chase'; c.nav = null; }
    });
    this.save.stats.pursuits += 1;
    this.bigMessage('PURSUIT', `Heat level ${heat}`, 'red', 1800);
  }

  updatePursuit(dt) {
    const pur = this.pursuit;
    pur.dur = (pur.dur || 0) + dt;
    const st0 = this.save.stats;
    st0.longestPursuit = Math.max(st0.longestPursuit || 0, pur.dur);
    st0.maxHeat = Math.max(st0.maxHeat || 0, pur.heat || 0);
    const P = this.player;
    const W = this.world;
    pur.time += dt;
    const crew = this.multi.active ? this.multi.pursuitNear(500) : { heat: 0, n: 0 };
    if (!pur.cooldown) pur.bounty += dt * 12 * pur.heat * (1 + 0.25 * crew.n);
    let heat = Math.max(pur.baseHeat, crew.heat);
    for (let h = 5; h >= 1; h--) {
      if (pur.bounty >= HEAT_BOUNTY[h]) { heat = Math.max(heat, h); break; }
    }
    if (heat > pur.heat) {
      pur.heat = heat;
      this.popup(`HEAT LEVEL ${heat}`, 'red');
      if (heat >= 3) pur.rbT = Math.min(pur.rbT, 6);
    }
    const chasing = this.cops.filter((c) => c.role === 'chase');
    pur.spawnT -= dt;
    if (chasing.length < COPS_FOR_HEAT[pur.heat] && pur.spawnT <= 0) {
      pur.spawnT = pur.cooldown ? 5 : 2.2; // search units keep arriving during cooldown, more slowly
      // units arrive from behind and from up ahead, so outrunning them on a straight isn't enough
      const sp = this.spawnPoint(170, 290, Math.random() < 0.5);
      if (sp) {
        const tier = pur.heat >= 5 ? (Math.random() < 0.5 ? 2 : 1) : pur.heat >= 3 ? 1 : 0;
        const c = this.createCop(tier, sp.x, sp.z, sp.h, 'chase');
        c.nav = null;
      }
    }
    let seen = false;
    let nearest = Infinity;
    let nearCount = 0;
    const view = pur.cooldown ? 110 : 175;
    chasing.forEach((c) => {
      const d = Math.hypot(c.x - P.x, c.z - P.z) + (Math.abs(c.y - P.y) > 3 ? 40 : 0); // a level apart (freeway) counts as far
      if (d < nearest) nearest = d;
      if (d < 14) nearCount++;
      if (!seen && d < view && W.los(c.x, c.z, P.x, P.z)) seen = true;
      if (pur.cooldown && d > 450) this.removeCop(c);
    });
    if (this.heli && Math.hypot(this.heli.x - P.x, this.heli.z - P.z) < (pur.cooldown ? 60 : 150)) seen = true;
    if (!pur.cooldown) {
      if (seen) {
        pur.unseen = 0;
        pur.lastKnown = { x: P.x, z: P.z };
      } else {
        pur.unseen += dt;
        if (pur.unseen > (pur.heat >= 3 ? 6 : 5)) {
          pur.cooldown = true;
          pur.cool = pur.coolMax = 12 + pur.heat * 4;
          this.popup('COOLDOWN · stay hidden', 'green');
        }
      }
    } else if (seen) {
      pur.cooldown = false;
      pur.unseen = 0;
      this.popup('SPOTTED!', 'red');
    } else {
      pur.cool -= dt;
      if (pur.cool <= 0) {
        this.evade();
        return;
      }
    }
    // busted when stopped next to a cop, or boxed in by two or more units at low speed
    const pinned = (P.speed < 6 && nearest < 12) || (P.speed < 12 && nearCount >= 2);
    if (!pur.cooldown && pinned) pur.busted += dt / Math.max(1.4, 3.4 - nearCount * 0.5);
    else pur.busted = Math.max(0, pur.busted - dt * 0.5);
    if (pur.busted >= 1) {
      this.bust();
      return;
    }
    if (pur.heat >= 3) {
      pur.rbT -= dt;
      if (pur.rbT <= 0) pur.rbT = this.spawnRoadblock() ? 40 - pur.heat * 4 : 4;
    }
    if (pur.heat >= 5 && !this.heli) this.spawnHeli();
    pur.siren = clamp(1 - nearest / 240, 0, 1);
    pur.nearest = nearest;
  }

  evade() {
    const pur = this.pursuit;
    const bounty = Math.round(pur.bounty);
    const cash = Math.round(bounty * 0.5);
    const s = this.save;
    s.bountyTotal += bounty;
    s.money += cash;
    s.carHeat[s.car] = Math.max(s.carHeat[s.car] || 0, pur.heat);
    s.stats.evaded += 1;
    this.bigMessage('EVADED', `+${bounty.toLocaleString('en-US')} bounty · ${fmtMoney(cash)}`, 'green', 3200);
    this.multi.note(`evaded the police · +${bounty.toLocaleString('en-US')} bounty`, 'green');
    this.audio.evaded();
    const ev = this.event;
    this.endPursuit();
    this.persist();
    if (ev && ev.type === 'pursuit') {
      const ok = bounty >= ev.def.bountyTarget;
      this.finishEvent(ok, ok ? 'Pursuit target reached' : `Needed ${ev.def.bountyTarget.toLocaleString('en-US')} bounty, you earned ${bounty.toLocaleString('en-US')}`);
    }
  }

  bust() {
    const pur = this.pursuit;
    const s = this.save;
    const fine = Math.min(s.money, 500 * pur.heat + Math.round(pur.bounty * 0.1));
    s.money -= fine;
    s.carHeat[s.car] = 0;
    s.stats.busted += 1;
    this.infractionT = 0;
    this.persist();
    this.freeze = 3.2;
    this.bigMessage('BUSTED', `Fine ${fmtMoney(fine)} · bounty lost`, 'red', 3000);
    this.multi.note('got BUSTED', 'red');
    this.audio.busted();
    const ev = this.event;
    this.endPursuit();
    this.later(3000, () => {
      if (ev && ev.type === 'pursuit' && this.event === ev) {
        this.finishEvent(false, 'You were busted');
        return;
      }
      this.fadeThen(() => {
        this.toSafehouse();
        this.cops.slice().forEach((c) => { if (Math.hypot(c.x - this.player.x, c.z - this.player.z) < 300) this.removeCop(c); });
      });
    });
  }

  endPursuit() {
    const P = this.player;
    this.pursuit = null;
    this.cops.slice().forEach((c) => {
      if (c.role === 'chase') {
        if (Math.hypot(c.x - P.x, c.z - P.z) > 140 || this.cops.filter((x) => x.role === 'patrol').length >= PATROL_COUNT) this.removeCop(c);
        else { c.role = 'patrol'; c.goal = null; c.nav = null; }
      }
    });
    this.roadblocks.slice().forEach((rb) => this.removeRoadblock(rb));
    if (this.heli) this.removeHeli();
  }

  // Block the road ~200 m ahead of the player: a line of cruisers across it with one gap,
  // plus a spike strip in the gap at high heat.
  spawnRoadblock() {
    const P = this.player;
    const C = this.world.city;
    if (P.speed < 15) return false;
    const rd = C.nearestRoad(P.x, P.z, P.y);
    if (!rd || rd.d > rd.e.hw || rd.e.type === 'expressway') return false;
    let e = rd.e;
    let dir = P.vx * rd.dx + P.vz * rd.dz >= 0 ? 1 : -1;
    let sPos = rd.s;
    let left = 180 + Math.random() * 60;
    for (let guard = 0; guard < 12; guard++) {
      const room = dir > 0 ? e.len - sPos : sPos;
      if (left <= room) { sPos += dir * left; break; }
      left -= room;
      const node = C.nodes[dir > 0 ? e.b : e.a];
      // the arriving direction, then the straightest way on
      const ax = -(node.out.find((o) => o.ei === e.id) || { dx: 0 }).dx;
      const az = -(node.out.find((o) => o.ei === e.id) || { dz: 0 }).dz;
      let next = null;
      let bc = 0.5;
      node.out.forEach((o) => {
        if (o.ei === e.id) return;
        const cos = o.dx * ax + o.dz * az;
        if (cos > bc) { bc = cos; next = o; }
      });
      if (!next) return false;
      e = C.edges[next.ei];
      if (e.type === 'expressway') return false;
      dir = next.fwd ? 1 : -1;
      sPos = next.fwd ? 0 : e.len;
    }
    // keep it out of junctions
    if (sPos < e.t0 + 12 || sPos > e.len - e.t1 - 12) return false;
    const q = C.at(e, sPos);
    if (q.lift > 0.3) return false;
    const tx = q.dx * dir;
    const tz = q.dz * dir;
    const rx = -tz;
    const rz = tx;
    const hw = e.hw;
    const n = Math.max(3, Math.floor((2 * hw) / 5.2));
    const span = (2 * hw) / n;
    const slots = Array.from({ length: n }, (_, k) => -hw + span * (k + 0.5));
    const gap = Math.floor(Math.random() * n);
    const rb = { cars: [], spike: null, x: q.x, z: q.z, dirX: tx, dirZ: tz, near: false, passed: false };
    const across = Math.atan2(rx, rz);
    slots.forEach((o, idx) => {
      if (idx === gap) return;
      rb.cars.push(this.createCop(1, q.x + rx * o, q.z + rz * o, across + (Math.random() - 0.5) * 0.3, 'block'));
    });
    if (this.pursuit.heat >= 4) {
      const o = slots[gap];
      const sx = q.x + rx * o - tx * 9;
      const sz = q.z + rz * o - tz * 9;
      const tex = canvasTexture(128, 32, (g, w, h) => {
        g.fillStyle = '#1a1a1a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#d0d4da';
        for (let t = 0; t < w; t += 8) {
          g.beginPath();
          g.moveTo(t, h);
          g.lineTo(t + 4, 0);
          g.lineTo(t + 8, h);
          g.fill();
        }
      });
      const geo = new THREE.PlaneGeometry(5, 1.1);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.6 }));
      mesh.rotation.y = Math.atan2(-rz, rx);
      mesh.position.set(sx, this.world.groundAt(sx, sz, q.y).h + 0.05, sz);
      this.scene.add(mesh);
      rb.spike = { x: sx, z: sz, ax: tx, az: tz, mesh, hit: false };
    }
    this.roadblocks.push(rb);
    this.popup('ROADBLOCK AHEAD', 'red');
    return true;
  }

  updateRoadblocks() {
    const P = this.player;
    this.roadblocks.slice().forEach((rb) => {
      const rel = (P.x - rb.x) * rb.dirX + (P.z - rb.z) * rb.dirZ;
      const d = Math.hypot(P.x - rb.x, P.z - rb.z);
      if (d < 45) rb.near = true;
      if (rb.near && !rb.passed && rel > 30 && this.pursuit) {
        rb.passed = true;
        this.pursuit.bounty += 750;
        this.popup('ROADBLOCK EVADED +750', 'gold');
      }
      const sp = rb.spike;
      if (sp && !sp.hit) {
        const ox = P.x - sp.x;
        const oz = P.z - sp.z;
        const al = Math.abs(ox * sp.ax + oz * sp.az);
        const la = Math.abs(-ox * sp.az + oz * sp.ax);
        if (la < 3.4 && al < 2.0) {
          sp.hit = true;
          P.spiked = 9;
          this.popup('TIRES SPIKED!', 'red');
          this.audio.pop();
        }
      }
      if (d > 420) this.removeRoadblock(rb);
    });
  }

  removeRoadblock(rb) {
    rb.cars.forEach((c) => { if (this.cops.includes(c) && c.role === 'block') this.removeCop(c); });
    if (rb.spike) {
      this.scene.remove(rb.spike.mesh);
      rb.spike.mesh.geometry.dispose();
      rb.spike.mesh.material.map.dispose();
      rb.spike.mesh.material.dispose();
    }
    this.roadblocks.splice(this.roadblocks.indexOf(rb), 1);
  }

  spawnHeli() {
    const P = this.player;
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, metalness: 0.5, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10), dark);
    body.scale.set(1, 0.85, 1.9);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), dark);
    tail.position.set(0, 0.3, -4);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 0.45), dark);
    rotor.position.y = 1.6;
    const rotor2 = rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    const rotorGroup = new THREE.Group();
    rotorGroup.add(rotor, rotor2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 3 }));
    beacon.position.set(0, -1.2, 1);
    g.add(body, tail, rotorGroup, beacon);
    const spot = new THREE.SpotLight(0xe8f0ff, 9, 120, 0.22, 0.4, 0);
    const coneGeo = new THREE.ConeGeometry(7, 1, 24, 1, true);
    coneGeo.translate(0, -0.5, 0);
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(g, spot, spot.target, cone);
    const a = Math.random() * Math.PI * 2;
    this.heli = { group: g, rotor: rotorGroup, spot, cone, beacon, x: P.x + Math.cos(a) * 220, z: P.z + Math.sin(a) * 220, vx: 0, vz: 0 };
    this.popup('HELICOPTER INBOUND', 'red');
  }

  updateHeli(dt) {
    const H = this.heli;
    const P = this.player;
    const dx = P.x - H.x;
    const dz = P.z - H.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(52, d * 0.9);
    H.vx = damp(H.vx, (dx / d) * sp, 1.2, dt);
    H.vz = damp(H.vz, (dz / d) * sp, 1.2, dt);
    H.x += H.vx * dt;
    H.z += H.vz * dt;
    H.alt = damp(H.alt || P.y + 42, P.y + 42, 0.8, dt);
    H.group.position.set(H.x, H.alt, H.z);
    H.group.rotation.set(Math.hypot(H.vx, H.vz) * 0.004, headingTo(H.vx, H.vz), 0);
    H.rotor.rotation.y += dt * 38;
    H.beacon.visible = Math.floor(this.time * 2) % 2 === 0;
    H.spot.position.set(H.x, H.alt - 1, H.z);
    H.spot.target.position.set(P.x, P.y, P.z);
    const v = new THREE.Vector3(P.x - H.x, P.y - H.alt + 1, P.z - H.z);
    const len = v.length();
    H.cone.position.set(H.x, H.alt - 1, H.z);
    H.cone.scale.set(1, len, 1);
    H.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), v.normalize());
  }

  removeHeli() {
    const H = this.heli;
    [H.group, H.spot, H.spot.target, H.cone].forEach((o) => this.scene.remove(o));
    H.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    H.cone.geometry.dispose();
    H.cone.material.dispose();
    H.spot.dispose();
    this.heli = null;
  }

  // ───────────────────────── events ─────────────────────────
  startEvent(def, opts = {}) {
    this.lastEventDef = def;
    this.fadeThen(() => this.setupEvent(def, opts));
  }

  startRival(idx) {
    const r = RIVALS[idx];
    const def = { id: `rival${r.rank}`, name: `Blacklist #${r.rank}`, type: 'rival', route: r.route, reward: r.reward, rival: r, rivalIdx: idx };
    this.startRoam();
    this.startEvent(def);
  }

  setupEvent(def, opts = {}) {
    if (this.pursuit) this.endPursuit();
    const type = def.type;
    const ev = { def, type, time: 0, countdown: 0, player: { cp: 0, pwp: 1 }, results: null, mp: opts.mp || null };
    this.event = ev;
    this.gps = null;
    this.refreshMarkers();
    if (type === 'pursuit') {
      ev.countdown = 0;
      this.startPursuit(2);
      this.popup(`Earn ${def.bountyTarget.toLocaleString('en-US')} bounty, then evade`, 'gold');
      return;
    }
    const closed = LOOP_KINDS.has(type) || (type === 'drift' && !!def.laps);
    ev.loop = closed;
    const C = this.world.city;
    const exp = expandRoute(C, def.route, closed);
    ev.path = exp.path;
    ev.cum = exp.cum;
    ev.total = 0;
    ev.cpIdx = exp.cpIdx;
    this.buildRaceBarriers(exp.nodes);
    ev.laps = closed ? def.laps || 2 : 1;
    ev.seq = [];
    for (let lap = 0; lap < ev.laps; lap++) exp.cpIdx.slice(1).forEach((pi) => ev.seq.push({ pi, lap }));
    const p0 = ev.path[0];
    // the grid sits on the route just past the start junction, two abreast
    const slots = [[6, -4.5], [6, 4.5], [16, -4.5], [16, 4.5]];
    const slotPos = ([b, l]) => {
      const q = pathAt(ev.path, ev.cum, 30 - b);
      const hw = ev.path[Math.min(q.i, ev.path.length - 1)].hw || 8;
      const lat = l * Math.min(1, Math.max(0, hw - 1.6) / 4.5);
      const elevated = q.y - C.terrainAt(q.x, q.z).h > 0.3;
      return { x: q.x - q.dz * lat, z: q.z + q.dx * lat, h: Math.atan2(q.dx, q.dz), y: elevated ? q.y : null };
    };
    const P = this.player;
    const racing = RACE_KINDS.has(type);
    if (type === 'drift') ev.driftTotal = 0;
    if (type === 'knockout') ev.out = [];
    // online races: a grid of up to 10, two abreast, in the order the host sent
    const mpSlot = ev.mp ? [6 + Math.floor(ev.mp.slot / 2) * 7.5 - 12, ev.mp.slot % 2 ? 4.5 : -4.5] : null;
    const ps = slotPos(mpSlot || (racing ? slots[2] : [10, 0]));
    const h = ps.h;
    P.place(ps.x, ps.z, h, 0, ps.y);
    P.nitro = P.s.nitroCap;
    this.camH = h;
    this.racers.forEach((r) => this.factory.dispose(r.v.parts));
    this.racers = [];
    if (racing && !ev.mp) {
      const count = type === 'rival' ? 1 : 3;
      const used = [0, 1, 3];
      for (let k = 0; k < count; k++) {
        let def2;
        let stats;
        let name;
        let color;
        if (type === 'rival') {
          def2 = carById(def.rival.car);
          stats = carStats(def2, { engine: 3, nitro: 2, handling: 2 });
          stats.top *= def.rival.skill;
          stats.accel *= def.rival.skill;
          name = def.rival.name;
          color = def.rival.color;
        } else {
          def2 = CARS[(k + 1 + CARS.indexOf(this.playerDef)) % CARS.length];
          stats = { ...P.s, top: P.s.top * (0.93 + k * 0.03), accel: P.s.accel * (0.95 + k * 0.025) };
          name = RACER_NAMES[(k * 3 + def.id.length) % RACER_NAMES.length];
          color = ['#00d1ff', '#ff2d95', '#7cff4f'][k];
        }
        const parts = this.factory.build(def2.style, color, { flames: true, modelKey: def2.id });
        this.scene.add(parts.group);
        const v = new Vehicle(stats, parts, { kind: 'car' });
        const sp = slotPos(slots[used[k]]);
        v.place(sp.x, sp.z, sp.h, 0, sp.y);
        v.nitro = stats.nitroCap;
        v.stuck = 0;
        v.reverseT = 0;
        this.racers.push({ v, name, wp: 1, lap: 0, cp: 0, done: false, time: 0, lane: (k - 1) * 4 });
      }
    }
    if (type === 'speedtrap') {
      ev.cams = [];
      for (let k = 1; k < exp.wpIdx.length; k++) {
        const a = ev.cum[exp.wpIdx[k - 1]];
        const b = ev.cum[exp.wpIdx[k]];
        const q = pathAt(ev.path, ev.cum, lerp(a, b, 0.6));
        ev.cams.push({ x: q.x, z: q.z, dx: q.dx, dz: q.dz, speed: 0, hit: false });
      }
      ev.total = 0;
    }
    if (type === 'tollbooth') ev.timeLeft = this.cpTime(0) + 4;
    if (type === 'timetrial') ev.targetTime = Math.round(ev.cum[ev.cum.length - 1] / (def.pace || 36)) + 4;
    this.traffic.cars.forEach((v) => {
      if (Math.hypot(v.x - p0.x, v.z - p0.z) < 160) this.traffic.spawnAround(v, p0.x, p0.z, 220, 420);
    });
    this.cops.slice().forEach((c) => { if (Math.hypot(c.x - p0.x, c.z - p0.z) < 200) this.removeCop(c); });
    ev.countdown = ev.mp ? this.multi.countdown() : 3.99;
    ev.lastCount = Math.ceil(ev.countdown) + 1;
    this.updateGate();
  }

  // Glowing chevron barriers close every side street along the route.
  buildRaceBarriers(nodes) {
    this.clearRaceBarriers();
    if (!this.chevronTex) {
      this.chevronTex = canvasTexture(256, 64, (g, w, h) => {
        g.fillStyle = '#0c0b0a';
        g.fillRect(0, 0, w, h);
        for (let x = -32; x < w; x += 64) {
          g.fillStyle = '#ffb000';
          g.beginPath();
          g.moveTo(x + 10, 6); g.lineTo(x + 34, 6); g.lineTo(x + 58, 32); g.lineTo(x + 34, 58); g.lineTo(x + 10, 58); g.lineTo(x + 34, 32);
          g.fill();
          g.strokeStyle = '#fff3c4';
          g.lineWidth = 3;
          g.stroke();
        }
        g.fillStyle = '#ffb000';
        g.fillRect(0, 0, w, 3);
        g.fillRect(0, h - 3, w, 3);
      });
      this.chevronTex.wrapS = THREE.RepeatWrapping;
      this.chevronMat = new THREE.MeshBasicMaterial({ map: this.chevronTex, color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide });
      this.barrierBaseMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6 });
    }
    const C = this.world.city;
    const allowed = new Map();
    const outEdge = new Map();
    nodes.forEach((n, p) => {
      const set = allowed.get(n.id) || new Set();
      if (n.prevEdge !== null) set.add(n.prevEdge);
      if (n.nextEdge !== null) set.add(n.nextEdge);
      if (n.nextEdge !== null && !outEdge.has(n.id)) outEdge.set(n.id, n.nextEdge);
      // run-off past the finish: leave the straightest way on open
      if (p === nodes.length - 1 && n.prevEdge !== null) {
        const node = C.nodes[n.id];
        const arr = node.out.find((o) => o.ei === n.prevEdge);
        let best = null;
        let bc = 0.3;
        node.out.forEach((o) => {
          if (o.ei === n.prevEdge || !arr) return;
          const cos = -(o.dx * arr.dx + o.dz * arr.dz);
          if (cos > bc) { bc = cos; best = o.ei; }
        });
        if (best !== null) set.add(best);
      }
      allowed.set(n.id, set);
    });
    this.barriers = [];
    this.barrierPts = [];
    allowed.forEach((set, id) => {
      const node = C.nodes[id];
      if (node.deg < 3) return;
      const oe = outEdge.get(id);
      const od = oe !== undefined ? node.out.find((o) => o.ei === oe) : null;
      node.out.forEach((o) => {
        if (set.has(o.ei)) return;
        const e = C.edges[o.ei];
        const dist = Math.min((node.trim[o.ei] || e.hw) + 4, e.len * 0.5);
        const q = C.at(e, o.fwd ? dist : e.len - dist);
        if (q.lift > 4) return; // passes overhead
        const ox = q.dx * (o.fwd ? 1 : -1);
        const oz = q.dz * (o.fwd ? 1 : -1);
        const w = 2 * (e.hw + Math.min(e.T.sidewalk || 0, 4));
        const rot = Math.atan2(ox, oz);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.5), this.chevronMat);
        panel.geometry.attributes.uv.array.forEach((v, idx, arr) => { if (idx % 2 === 0) arr[idx] = v * (w / 4); });
        panel.position.set(q.x, q.y + 1.25, q.z);
        panel.rotation.y = rot;
        if (od && Math.cos(rot) * od.dx - Math.sin(rot) * od.dz < 0) panel.scale.x = -1;
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.6), this.barrierBaseMat);
        base.position.set(q.x, q.y + 0.25, q.z);
        base.rotation.y = rot;
        this.scene.add(panel, base);
        // across the road: u axis along (-oz, ox)
        const col = this.world.addCollider(this.world.obb(q.x, q.z, -oz, ox, w / 2, 0.4, q.y - 1, q.y + 2.2, 'barrier'));
        this.barriers.push({ meshes: [panel, base], col });
        for (let t = -w / 2 + 1; t <= w / 2 - 1; t += 2.5) {
          this.barrierPts.push({ x: q.x - oz * t, z: q.z + ox * t, y: q.y, speed: 0, trafficSpeed: 0 });
        }
      });
    });
  }

  clearRaceBarriers() {
    (this.barriers || []).forEach((b) => {
      b.meshes.forEach((m) => { this.scene.remove(m); m.geometry.dispose(); });
      if (b.col) this.world.removeCollider(b.col);
    });
    this.barriers = [];
    this.barrierPts = [];
  }

  // time allowed to reach checkpoint k of a tollbooth run (road distance from the previous one)
  cpTime(k) {
    const ev = this.event;
    const s = ev.seq[k];
    if (!s) return 0;
    const prev = k > 0 ? ev.seq[k - 1].pi : 0;
    return (ev.cum[s.pi] - ev.cum[prev]) / 29 + 2;
  }

  updateGate() {
    const ev = this.event;
    if (!ev || !ev.seq) { this.gate.group.visible = false; this.trapGate.group.visible = false; return; }
    const pc = ev.player.cp;
    if (pc >= ev.seq.length) { this.gate.group.visible = false; } else {
      const s = ev.seq[pc];
      const p = ev.path[s.pi];
      const prev = ev.path[Math.max(0, s.pi - 1)];
      const isFinal = pc === ev.seq.length - 1;
      const lapEnd = ev.loop && s.pi === ev.path.length - 1;
      this.setGate(this.gate, p.x, p.z, p.x - prev.x, p.z - prev.z, isFinal ? 'finish' : lapEnd ? 'lap' : 'cp');
    }
    if (ev.cams) {
      const cam = ev.cams.find((c) => !c.hit);
      if (cam) this.setGate(this.trapGate, cam.x, cam.z, cam.dx, cam.dz, 'trap');
      else this.trapGate.group.visible = false;
    }
  }

  updateRacers(dt) {
    const ev = this.event;
    if (!ev || !ev.path) return;
    const path = ev.path;
    const W = this.world;
    const P = this.player;
    this.racers.forEach((r) => {
      const v = r.v;
      let inp;
      if (ev.countdown > 0) inp = { throttle: 0, brake: 0, handbrake: true, steer: 0 };
      else if (r.done) inp = { throttle: 0, brake: 0.4, steer: 0 };
      else {
        // track the nearest path point
        for (let k = 0; k < 6 && !r.done; k++) {
          const a = path[r.wp];
          const prev = path[r.wp - 1] || a;
          if (Math.hypot(a.x - v.x, a.z - v.z) < 9 || this.passed(v, prev, a)) this.advanceRacer(r);
          else break;
        }
        const cum = ev.cum;
        const total = cum[cum.length - 1];
        const base = cum[r.wp] - Math.hypot(path[r.wp].x - v.x, path[r.wp].z - v.z);
        let sT = base + (r.slowAhead ? 7 + v.speed * 0.3 : 10 + v.speed * 0.45);
        if (sT > total && ev.loop && r.lap + 1 < ev.laps) sT -= total;
        const tq = pathAt(path, cum, sT);
        // corner speed: the tightest bend ahead within braking range
        const gripF = v.s.grip / 7.5;
        const range = Math.max(40, (v.speed * v.speed) / 22 + 25);
        let allowed = 999;
        for (let j = r.wp + 2; j < path.length - 2; j++) {
          const dj = cum[j] - base;
          if (dj > range) break;
          const a = path[j - 2];
          const b = path[j];
          const c = path[j + 2];
          const th = Math.abs(wrapAngle(headingTo(c.x - b.x, c.z - b.z) - headingTo(b.x - a.x, b.z - a.z)));
          if (th < 0.08) continue;
          const R = Math.max(6, (cum[j + 2] - cum[j - 2]) / 2 / th);
          const vc = Math.sqrt(19 * gripF * R);
          allowed = Math.min(allowed, Math.sqrt(vc * vc + 2 * 11 * Math.max(0, dj - 8)));
        }
        // spread across the road on straights
        const hw = path[tq.i].hw || 8;
        const lane = r.lane * clamp((hw - 2) / 6, 0, 1) * (allowed > v.speed + 8 ? 1 : 0.3);
        const tx = tq.x - tq.dz * lane;
        const tz = tq.z + tq.dx * lane;
        const ahead = this.raceProgress(r) - this.playerProgress();
        const band = ahead > 0 ? (ahead > 150 ? 0.9 : 0.97) : ahead < -200 ? 1.1 : 1.03;
        inp = this.drive(v, tx, tz, 999, dt, { topScale: band, nitro: allowed > v.speed + 20 });
        if (v.speed > allowed + 2) { inp.throttle = 0; inp.brake = clamp((v.speed - allowed) / 10, 0.2, 1); }
        r.slowAhead = allowed < v.speed + 6;
        // wedged somewhere for a while: put the car back on the route (only out of the player's sight)
        // no progress along the route for a while (wedged, or shuffling back and forth)
        if (r.wp !== r.lastWp) { r.lastWp = r.wp; r.stuckT = 0; } else r.stuckT = (r.stuckT || 0) + dt;
        if (r.stuckT > 5 && (Math.hypot(v.x - P.x, v.z - P.z) > 45 || !W.los(P.x, P.z, v.x, v.z))) {
          r.stuckT = 0;
          const q = pathAt(path, cum, cum[Math.min(r.wp, path.length - 1)] + 4);
          const el = q.y - W.city.terrainAt(q.x, q.z).h > 0.3;
          v.place(q.x, q.z, Math.atan2(q.dx, q.dz), 8, el ? q.y : null);
          v.stuck = 0;
          v.reverseT = 0;
        }
      }
      v.update(dt, inp, W);
      v.sync(dt);
    });
    void P;
  }

  passed(v, a, b) {
    return (v.x - b.x) * (b.x - a.x) + (v.z - b.z) * (b.z - a.z) > 0;
  }

  advanceRacer(r) {
    const ev = this.event;
    const i = r.wp;
    while (ev.seq[r.cp] && ev.seq[r.cp].lap === r.lap && ev.seq[r.cp].pi <= i) r.cp++;
    if (i >= ev.path.length - 1) {
      if (ev.loop && r.lap + 1 < ev.laps) {
        r.lap++;
        r.wp = 1;
        return;
      }
      r.done = true;
      r.time = ev.time;
      return;
    }
    r.wp++;
  }

  raceProgress(r) {
    const ev = this.event;
    if (r.done) return 1e9 - r.time;
    const s = ev.seq[r.cp];
    if (!s) return r.cp * 1e5;
    const p = ev.path[s.pi];
    return r.cp * 1e5 - Math.hypot(p.x - r.v.x, p.z - r.v.z);
  }

  playerProgress() {
    const ev = this.event;
    const pl = ev.player;
    if (pl.done) return 1e9 - pl.time;
    const s = ev.seq[pl.cp];
    if (!s) return pl.cp * 1e5;
    const p = ev.path[s.pi];
    return pl.cp * 1e5 - Math.hypot(p.x - this.player.x, p.z - this.player.z);
  }

  updateEvent(dt, wdt) {
    const ev = this.event;
    if (ev.results) return;
    ev.topSpeed = Math.max(ev.topSpeed || 0, this.player.speed);
    if (ev.countdown > 0) {
      ev.countdown = ev.mp ? this.multi.countdown() : ev.countdown - dt;
      const n = Math.ceil(ev.countdown);
      if (n !== ev.lastCount) {
        ev.lastCount = n;
        if (n > 3) this.bigMessage('GET READY', `${ev.def.name}${ev.mp ? ` · ${ev.mp.grid.length} racers` : ''}`, 'gold', 1100);
        else if (n > 0) { this.bigMessage(String(n), ev.def.name, 'gold', 900); this.audio.beep(false); } else { this.bigMessage('GO!', '', 'green', 900); this.audio.beep(true); }
      }
      return;
    }
    if (ev.type === 'pursuit') return;
    ev.time += wdt;
    const P = this.player;
    const pl = ev.player;
    // player checkpoints
    const s = ev.seq[pl.cp];
    if (s) {
      const p = ev.path[s.pi];
      if (Math.hypot(p.x - P.x, p.z - P.z) < 26) {
        pl.cp++;
        pl.pwp = s.pi + 1;
        if (ev.loop && s.pi === ev.path.length - 1) pl.pwp = 1;
        this.audio.chime();
        if (ev.type === 'tollbooth' && pl.cp < ev.seq.length) {
          const add = this.cpTime(pl.cp) + 1.5;
          ev.timeLeft += add;
          this.popup(`+${add.toFixed(1)}s`, 'green');
        }
        if (pl.cp >= ev.seq.length) {
          pl.done = true;
          pl.time = ev.time;
          this.onPlayerFinish();
          return;
        }
        if (ev.loop && ev.seq[pl.cp].lap > s.lap) {
          this.popup(`LAP ${ev.seq[pl.cp].lap + 1}/${ev.laps}`, 'gold');
          if (ev.type === 'knockout' && this.knockout(s.lap + 1)) return;
        }
        this.updateGate();
      }
    }
    // keep the guidance waypoint moving along the path
    const tw = ev.path[pl.pwp];
    void tw;
    const lim = ev.seq[pl.cp] ? ev.seq[pl.cp].pi : 0;
    for (let k = 0; k < 40 && pl.pwp < lim && Math.hypot(ev.path[pl.pwp].x - P.x, ev.path[pl.pwp].z - P.z) < 30; k++) pl.pwp++;
    if (ev.cams) {
      ev.cams.forEach((c) => {
        if (!c.hit && Math.hypot(c.x - P.x, c.z - P.z) < 22) {
          c.hit = true;
          c.speed = Math.round(P.speed * 3.6);
          ev.total += c.speed;
          this.popup(`SPEED TRAP ${this.speedUnits(P.speed)} ${this.unitLabel().toLowerCase()}`, 'blue');
          this.audio.chime();
          this.updateGate();
        }
      });
    }
    if (ev.type === 'tollbooth') {
      ev.timeLeft -= wdt;
      if (ev.timeLeft <= 0) {
        ev.timeLeft = 0;
        this.finishEvent(false, 'Out of time');
      }
    }
  }

  onPlayerFinish() {
    const ev = this.event;
    const pl = ev.player;
    if (ev.mp) { this.multi.onFinish(pl.time); return; }
    if (ev.type === 'speedtrap') {
      ev.cams.forEach((c) => { if (!c.hit) c.hit = true; });
      const ok = ev.total >= ev.def.target;
      this.finishEvent(ok, `Total ${ev.total} km/h · target ${ev.def.target} km/h`);
      return;
    }
    if (ev.type === 'tollbooth') {
      this.finishEvent(true, `${ev.timeLeft.toFixed(2)}s to spare`);
      return;
    }
    if (ev.type === 'drift') {
      ev.driftTotal += Math.round(this.drift.score);
      this.drift.score = 0;
      const ok = ev.driftTotal >= ev.def.target;
      this.finishEvent(ok, `Drift score ${ev.driftTotal.toLocaleString('en-US')} · target ${ev.def.target.toLocaleString('en-US')}`);
      return;
    }
    if (ev.type === 'timetrial') {
      const ok = pl.time <= ev.targetTime;
      this.finishEvent(ok, ok ? `${(ev.targetTime - pl.time).toFixed(2)}s under the target` : `${(pl.time - ev.targetTime).toFixed(2)}s over the target`);
      return;
    }
    const ahead = this.racers.filter((r) => r.done && r.time < pl.time).length;
    const place = ahead + 1;
    ev.place = place;
    if (ev.type === 'rival') this.finishEvent(place === 1, place === 1 ? `You beat ${ev.def.rival.name}` : `${ev.def.rival.name} wins`);
    else this.finishEvent(place === 1, place === 1 ? (ev.type === 'knockout' ? 'Last one standing' : 'You won the race') : `You finished ${['1st', '2nd', '3rd', '4th'][place - 1]}`);
  }

  // knockout: as the player completes a lap, whoever is last is out (the player too)
  knockout(lap) {
    const ev = this.event;
    if (!this.racers.length) return false;
    const me = this.playerProgress();
    let last = null;
    this.racers.forEach((r) => { const pr = this.raceProgress(r); if (!r.done && (!last || pr < last.pr)) last = { r, pr }; });
    if (!last || me < last.pr) {
      ev.player.out = lap;
      this.finishEvent(false, `Knocked out on lap ${lap}`);
      return true;
    }
    ev.out.push({ name: last.r.name, lap });
    this.factory.dispose(last.r.v.parts);
    this.racers = this.racers.filter((r) => r !== last.r);
    this.popup(`${last.r.name.toUpperCase()} IS OUT`, 'red');
    this.audio.chime();
    return false;
  }

  finishEvent(win, detail, tableHtml = null) {
    const ev = this.event;
    if (!ev || ev.results) return;
    const s = this.save;
    const def = ev.def;
    let reward = 0;
    const place = ev.place || (win ? 1 : 0);
    if (win) {
      reward = def.reward;
      if (def.type === 'rival') {
        if (s.rank === def.rivalIdx) s.rank += 1;
      } else {
        s.done[def.id] = true;
      }
      s.stats.racesWon += 1;
      this.audio.win();
    } else if (ev.type !== 'rival' && place === 2) reward = Math.round(def.reward * 0.35);
    else if (ev.type !== 'rival' && place === 3) reward = Math.round(def.reward * 0.15);
    s.money += reward;
    this.persist();
    ev.results = { win, detail, reward };
    this.gate.group.visible = false;
    this.trapGate.group.visible = false;
    this.overlay = 'results';
    this.audio.suspend();
    let table = tableHtml || '';
    if (!tableHtml && ev.path && RACE_KINDS.has(ev.type)) {
      const rows = [{ name: 'You', me: true, prog: ev.player.done ? 1e9 - ev.player.time : ev.player.out ? -1e9 + ev.player.out : this.playerProgress(), time: ev.player.done ? ev.player.time : null, out: ev.player.out }];
      this.racers.forEach((r) => rows.push({ name: r.name, prog: this.raceProgress(r), time: r.done ? r.time : null }));
      (ev.out || []).forEach((o) => rows.push({ name: o.name, prog: -1e9 + o.lap, time: null, out: o.lap }));
      rows.sort((a, b) => b.prog - a.prog);
      table = `<table>${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td style="text-align:right">${r.time !== null ? fmtTime(r.time) : r.out ? `OUT · LAP ${r.out}` : 'Racing'}</td></tr>`).join('')}</table>`;
    }
    const unlocked = def.type === 'rival' && win ? `<p style="color:#39e27d">Blacklist rank ${s.rank}/${RIVALS.length}.${CARS.some((c) => c.req === s.rank) ? ' New cars unlocked in the garage.' : ''}${s.rank === RIVALS.length ? ' You are the Most Wanted.' : ''}</p>` : '';
    const placeWord = ['WINNER', '2ND PLACE', '3RD PLACE', '4TH PLACE', '5TH PLACE', '6TH PLACE', '7TH PLACE', '8TH PLACE', '9TH PLACE', '10TH PLACE'][(ev.place || (win ? 1 : 4)) - 1];
    const headline = win ? (ev.type === 'rival' ? 'RIVAL BEATEN' : 'WINNER') : ev.place ? placeWord : 'FAILED';
    const t = ev.player.done ? ev.player.time : ev.time;
    this.setScreen(`<div class="mp-wrap mp-panel mp-results">
      <div class="mp-win ${win ? '' : 'lose'}"><b>${headline}</b><span>${fmtTime(t)} @ ${this.speedUnits(ev.topSpeed || 0)} ${this.unitLabel()}</span><span>CASH: ${Math.round(reward).toLocaleString('en-US')}</span></div>
      <div class="mp-h"><small>${esc(def.name)} · ${esc(detail)}</small></div>${table}${unlocked}
      <div class="mp-btns"><button class="mp-b primary" data-act="continue">Continue</button>${ev.mp ? '' : '<button class="mp-b" data-act="retry">Retry</button>'}</div></div>`);
  }

  closeResults() {
    this.cleanupEvent();
    this.resume();
  }

  cleanupEvent() {
    if (this.pursuit && this.event && this.event.type === 'pursuit') this.endPursuit();
    this.racers.forEach((r) => this.factory.dispose(r.v.parts));
    this.racers = [];
    this.event = null;
    this.clearRaceBarriers();
    this.gate.group.visible = false;
    this.trapGate.group.visible = false;
    if (this.overlay === 'results') this.overlay = null;
    this.refreshMarkers();
  }

  updatePrompt() {
    const P = this.player;
    let target = null;
    if (!this.event && this.freeze <= 0) {
      for (const m of this.markers) {
        if (Math.hypot(m.x - P.x, m.z - P.z) < 16 && P.speed < 14) { target = m; break; }
      }
    }
    if (target !== this.promptTarget) {
      this.promptTarget = target;
      const pr = this.ui.prompt;
      if (!target) pr.hidden = true;
      else {
        pr.hidden = false;
        const key = this.isTouch ? 'TAP' : 'ENTER';
        if (target.kind === 'safehouse') pr.innerHTML = `<kbd>${key}</kbd>Enter the garage`;
        else {
          const d = target.def;
          pr.innerHTML = `<kbd>${key}</kbd>${EVENT_LABEL[d.type]}: ${esc(d.name)} · ${fmtMoney(d.reward)}${this.save.done[d.id] ? ' · won' : ''}`;
        }
      }
    }
  }

  // ───────────────────────── camera, HUD, sound ─────────────────────────
  updateCamera(dt) {
    const P = this.player;
    const cam = this.camera;
    const back = this.keys.has('back') || (this.pad && this.pad.back);
    this.camH = dampAngle(this.camH, P.h + (back ? Math.PI : 0), back ? 30 : this.camMode === 2 ? 25 : 5, dt);
    const sp = P.speed;
    const fx = Math.sin(this.camH);
    const fz = Math.cos(this.camH);
    let look;
    if (this.camMode === 2 && !back) {
      cam.position.set(P.x + Math.sin(P.h) * 2.4, P.y + 0.85, P.z + Math.cos(P.h) * 2.4);
      look = new THREE.Vector3(P.x + Math.sin(P.h) * 30, P.y + 0.9, P.z + Math.cos(P.h) * 30);
    } else {
      let dist = (this.camMode === 1 ? 9.5 : 6.2) + clamp(sp / 80, 0, 1) * 1.3;
      const height = this.camMode === 1 ? 3.4 : 1.9;
      for (let k = 0; k < 5 && this.world.insideBuilding(P.x - fx * dist, P.z - fz * dist); k++) dist *= 0.7;
      this.camY = damp(this.camY, P.y + height, 7, dt);
      const gx = P.x - fx * dist;
      const gz = P.z - fz * dist;
      this.camY = Math.max(this.camY, this.world.groundAt(gx, gz, P.y + 2).h + 0.8);
      cam.position.set(gx, this.camY, gz);
      look = new THREE.Vector3(P.x + fx * 5, P.y + 1.1, P.z + fz * 5);
    }
    if (this.shake > 0.01 && this.save.settings.shake) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    this.shake = damp(this.shake, 0, 5, dt);
    const fov = 62 + clamp(sp / 70, 0, 1.3) * 13 + (P.boosting ? 9 : 0) - (this.sb.on ? 6 : 0);
    cam.fov = damp(cam.fov, fov, 4, dt);
    cam.updateProjectionMatrix();
    cam.lookAt(look);
  }

  updateAmbient(dt) {
    const cam = this.camera;
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.physSky.position.copy(cam.position);
    this.sky.material.uniforms.time.value = this.time;
    if (this.chevronTex) this.chevronTex.offset.x = -this.time * 0.9;
    this.world.animate(this.time);
    this.world.cull(cam.position);
    const P = this.player;
    const fx = Math.sin(P.h);
    const fz = Math.cos(P.h);
    if (this.sunDir) {
      // snap the shadow camera to texel-sized steps to stop shadow edges shimmering
      const step = 180 / this.sun.shadow.mapSize.x;
      const sx = Math.round(P.x / step) * step;
      const sz = Math.round(P.z / step) * step;
      this.sun.position.set(sx + this.sunDir.x * 400, this.sunDir.y * 400, sz + this.sunDir.z * 400);
      this.sun.position.y += P.y;
      this.sun.target.position.set(sx, P.y, sz);
    }
    this.headlight.position.set(P.x + fx * 1.8, P.y + 0.9, P.z + fz * 1.8);
    this.headlight.target.position.set(P.x + fx * 30, P.y, P.z + fz * 30);
    const phase = Math.floor(this.time * 7) % 2;
    const chasing = [];
    this.cops.forEach((c) => {
      const lb = c.parts.lightbar;
      if (!lb || c.role === 'wreck') return;
      const on = c.role === 'chase' || c.role === 'block';
      const ph = (Math.floor((this.time + c.flashOffset) * 7) % 2) === 0;
      lb.red.emissiveIntensity = on ? (ph ? 7 : 0.2) : 0.3;
      lb.blue.emissiveIntensity = on ? (ph ? 0.2 : 7) : 0.3;
      if (on) chasing.push(c);
    });
    chasing.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    this.copLights.forEach((l, i) => {
      const c = chasing[i];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.x, c.y + 2.4, c.z);
      l.color.set((phase + i) % 2 ? 0xff1030 : 0x2050ff);
      l.intensity = this.tod && this.tod.lamps > 0.3 ? 5 : 2.5;
    });
    if (this.world.beaconMat) this.world.beaconMat.emissiveIntensity = Math.sin(this.time * 3) > 0 ? 3 : 0.3;
    this.markers.forEach((m) => { m.icon.position.y = 7 + Math.sin(this.time * 2) * 0.4; });
    void dt;
  }

  gearInfo() {
    const P = this.player;
    const frac = clamp(P.vF / P.s.top, 0, 1.2);
    const edges = [0, 0.16, 0.3, 0.45, 0.6, 0.78, 1.0];
    if (P.vF < -0.5) return { gear: 'R', rpm: 1500 + Math.min(4000, -P.vF * 300) };
    if (P.speed < 0.6 && !(this.readInput().throttle > 0)) return { gear: 'N', rpm: 900 };
    let g = 1;
    while (g < 6 && frac > edges[g]) g++;
    const lo = edges[g - 1];
    const hi = edges[g];
    return { gear: g, rpm: 1100 + 6400 * clamp((frac - lo) / (hi - lo), 0, 1.05) };
  }

  updateSound() {
    const P = this.player;
    const gi = this.gearInfo();
    this.gi = gi;
    if (typeof gi.gear === 'number' && typeof this.lastGear === 'number' && gi.gear > this.lastGear) this.audio.shift();
    this.lastGear = gi.gear;
    const inp = this.readInput();
    const pur = this.pursuit;
    this.audio.update({
      rpm: gi.rpm, throttle: inp.throttle, active: true, skid: this.skidding || 0, nitro: P.boosting, speedNorm: clamp(P.speed / 80, 0, 1),
      siren: pur ? pur.siren : 0, sirenFast: pur ? pur.heat >= 3 && pur.nearest < 60 : false, heli: this.heli ? clamp(1 - Math.hypot(this.heli.x - P.x, this.heli.z - P.z) / 200, 0, 1) : 0, slowmo: this.sb.on,
    });
  }

  setText(el, key, val) {
    if (this.hudCache[key] !== val) {
      this.hudCache[key] = val;
      el.textContent = val;
    }
  }

  updateHud() {
    const P = this.player;
    const ui = this.ui;
    const s = this.save;
    const pur = this.pursuit;
    const ev = this.event;
    this.setText(ui.money, 'money', fmtMoney(s.money));
    const heat = pur ? pur.heat : 0;
    const carHeat = s.carHeat[s.car] || 0;
    ui.heat.forEach((el, i) => { el.className = i < heat ? 'on' : !pur && i < carHeat ? 'car' : ''; });
    ui.heatBox.classList.toggle('flash', !!pur);
    this.setText(ui.bounty, 'bounty', pur ? `BOUNTY ${Math.round(pur.bounty).toLocaleString('en-US')}` : '');

    // event info
    let name = '';
    let stats = '';
    if (ev && ev.countdown <= 0) {
      name = `${EVENT_LABEL[ev.type]} · ${ev.def.name}`;
      if (RACE_KINDS.has(ev.type)) {
        let pos;
        let n;
        if (ev.mp) ({ pos, n } = this.multi.racePosition(ev.player.done ? 1e9 - ev.player.time : this.playerProgress()));
        else {
          const rows = [this.playerProgress(), ...this.racers.map((r) => this.raceProgress(r))];
          pos = rows.filter((v) => v > rows[0]).length + 1;
          n = rows.length;
        }
        this.setText(ui.raceP1, 'rp1', String(pos));
        this.setText(ui.raceP2, 'rp2', String(n));
        this.setText(ui.raceTime, 'rtime', fmtTime(ev.time));
        const lapTxt = ev.loop ? `LAP ${Math.min(ev.laps, (ev.seq[ev.player.cp] || ev.seq[ev.seq.length - 1]).lap + 1)}/${ev.laps} · ` : '';
        this.setText(ui.racePct, 'rpct', `${lapTxt}COMPLETE ${this.completion()}%`);
        stats = '';
      } else if (ev.type === 'speedtrap') {
        stats = `TRAPS ${ev.cams.filter((c) => c.hit).length}/${ev.cams.length} · ${ev.total} / ${ev.def.target} km/h`;
      } else if (ev.type === 'tollbooth') {
        stats = `TIME ${ev.timeLeft.toFixed(1)}s · CP ${ev.player.cp}/${ev.seq.length}`;
      } else if (ev.type === 'drift') {
        stats = `DRIFT ${Math.round(ev.driftTotal + this.drift.score).toLocaleString('en-US')} / ${ev.def.target.toLocaleString('en-US')} · CP ${ev.player.cp}/${ev.seq.length}`;
      } else if (ev.type === 'timetrial') {
        const left = ev.targetTime - ev.time;
        stats = `TIME ${fmtTime(ev.time)} · TARGET ${fmtTime(ev.targetTime)} · ${left >= 0 ? `${left.toFixed(1)}s left` : `${(-left).toFixed(1)}s over`}`;
      } else if (ev.type === 'pursuit') {
        stats = `BOUNTY ${Math.round(pur ? pur.bounty : 0).toLocaleString('en-US')} / ${ev.def.bountyTarget.toLocaleString('en-US')}`;
      }
    } else if (ev) name = ev.def.name;
    ui.race.hidden = !(ev && ev.countdown <= 0 && !ev.results && RACE_KINDS.has(ev.type));
    this.setText(ui.evName, 'evName', name);
    this.setText(ui.evStats, 'evStats', stats);

    // pursuit meters
    ui.pur.hidden = !pur;
    if (pur) {
      let label;
      if (pur.cooldown) label = `COOLDOWN ${Math.ceil(pur.cool)}s`;
      else if (pur.busted > 0.05) label = 'BUSTED!';
      else label = `PURSUIT · ${this.cops.filter((c) => c.role === 'chase').length} UNITS`;
      this.setText(ui.purLabel, 'purLabel', label);
      ui.purLabel.style.color = pur.cooldown ? '#39e27d' : '#ff4d6d';
      ui.evade.style.width = `${pur.cooldown ? (1 - pur.cool / pur.coolMax) * 100 : (pur.unseen / 5) * 100}%`;
      ui.bust.style.width = `${pur.busted * 100}%`;
    }

    // GPS arrow: next checkpoint during events, otherwise the GPS route
    let target = null;
    let label = '';
    if (ev && ev.path && ev.countdown <= 0 && !ev.results) {
      const pl = ev.player;
      const s2 = ev.seq[pl.cp];
      if (s2) {
        target = ev.path[Math.min(pl.pwp, s2.pi)];
        const cp = ev.path[s2.pi];
        label = `${Math.round(Math.hypot(cp.x - P.x, cp.z - P.z))} m`;
      }
    } else if (this.gps) {
      const r = this.gps.route;
      target = r.find((p, i) => i > 0 && Math.hypot(p.x - P.x, p.z - P.z) > 25) || r[r.length - 1];
      label = `${this.gps.label} · ${Math.round(Math.hypot(this.gps.x - P.x, this.gps.z - P.z))} m`;
    }
    ui.gps.hidden = !target;
    if (target) {
      const rel = wrapAngle(headingTo(target.x - P.x, target.z - P.z) - P.h);
      ui.arrow.style.transform = `rotate(${-rel}rad)`;
      this.setText(ui.gpsText, 'gps', label);
    }

    // speedometer
    this.setText(ui.spd, 'spd', String(this.speedUnits(P.speed)));
    const gi = this.gi || { gear: 'N', rpm: 900 };
    this.setText(ui.gear, 'gear', String(gi.gear));
    ui.nos.style.width = `${(P.nitro / P.s.nitroCap) * 100}%`;
    ui.sbm.style.width = `${this.sb.meter * 100}%`;
    this.drawTach(gi.rpm);
    this.drawMinimap();
  }

  completion() {
    const ev = this.event;
    const pl = ev.player;
    if (pl.done) return 100;
    const s = ev.seq[pl.cp];
    if (!s) return 100;
    const p = ev.path[s.pi];
    const prev = pl.cp > 0 ? ev.path[ev.seq[pl.cp - 1].pi] : ev.path[0];
    const seg = Math.max(1, Math.hypot(p.x - prev.x, p.z - prev.z));
    const frac = clamp(1 - Math.hypot(p.x - this.player.x, p.z - this.player.z) / seg, 0, 1);
    return Math.floor(((pl.cp + frac) / ev.seq.length) * 100);
  }

  // Analog rev counter: white face, numbered ticks x1000, red line, needle,
  // with nitrous (green) and speedbreaker (amber) arcs around the outside.
  drawTach(rpm) {
    const g = this.tachCtx;
    const S = 240;
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    const a0 = Math.PI * 0.72;
    const a1 = Math.PI * 2.1;
    const R = 92;
    const P = this.player;
    // outer meters
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.beginPath(); g.arc(c, c, R + 16, a0, a1); g.stroke();
    const mid = (a0 + a1) / 2;
    g.strokeStyle = '#ffb000';
    g.beginPath(); g.arc(c, c, R + 16, a0, a0 + (mid - a0) * clamp(this.sb.meter, 0, 1)); g.stroke();
    g.strokeStyle = P.boosting ? '#d8ff6a' : '#86d000';
    g.beginPath(); g.arc(c, c, R + 16, a1 - (a1 - mid) * clamp(P.nitro / P.s.nitroCap, 0, 1), a1); g.stroke();
    // face
    const grd = g.createRadialGradient(c, c, 10, c, c, R + 6);
    grd.addColorStop(0, 'rgba(25,25,28,.55)');
    grd.addColorStop(1, 'rgba(10,10,12,.85)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, R + 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(c, c, R, a0, a1); g.stroke();
    // red zone 8-10
    g.lineWidth = 6;
    g.strokeStyle = '#d61f1f';
    g.beginPath(); g.arc(c, c, R - 4, a0 + (a1 - a0) * 0.8, a1); g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k <= 20; k++) {
      const a = a0 + ((a1 - a0) * k) / 20;
      const major = k % 2 === 0;
      g.lineWidth = major ? 3 : 1.5;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(c + Math.cos(a) * (R - (major ? 12 : 7)), c + Math.sin(a) * (R - (major ? 12 : 7)));
      g.lineTo(c + Math.cos(a) * (R - 1), c + Math.sin(a) * (R - 1));
      g.stroke();
      if (major) g.fillText(String(k / 2), c + Math.cos(a) * (R - 24), c + Math.sin(a) * (R - 24));
    }
    g.font = 'bold 9px sans-serif';
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText('RPM X1000', c, c + 4);
    // needle
    const f = clamp(rpm / 10000, 0, 1);
    const a = a0 + (a1 - a0) * f;
    g.strokeStyle = '#ff9a1a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(c - Math.cos(a) * 10, c - Math.sin(a) * 10);
    g.lineTo(c + Math.cos(a) * (R - 6), c + Math.sin(a) * (R - 6));
    g.stroke();
    g.fillStyle = '#222';
    g.beginPath(); g.arc(c, c, 7, 0, Math.PI * 2); g.fill();
  }

  drawMinimap() {
    const g = this.miniCtx;
    const S = 240;
    const P = this.player;
    const zoom = 0.45 + clamp(1 - P.speed / 70, 0, 1) * 0.25; // px per metre
    const k = MAP_PX / (MAP_HALF * 2);
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(P.h), Math.sin(P.h));
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0a0d14';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2 + 30);
    g.rotate(rot);
    g.scale(zoom / k, zoom / k);
    g.drawImage(this.world.mapCanvas, -(P.x + MAP_HALF) * k, -(P.z + MAP_HALF) * k);
    g.restore();
    const toMini = (x, z) => {
      const dx = (x - P.x) * zoom;
      const dz = (z - P.z) * zoom;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return [S / 2 + dx * c - dz * s, S / 2 + 30 + dx * s + dz * c];
    };
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    let route = null;
    const ev = this.event;
    if (ev && ev.path && !ev.results) {
      const pl = ev.player;
      const end = ev.seq[pl.cp] ? ev.seq[pl.cp].pi : ev.path.length - 1;
      route = [{ x: P.x, z: P.z }, ...ev.path.slice(Math.min(pl.pwp, end), end + 1)];
    } else if (this.gps) route = this.gps.route;
    if (route) {
      g.strokeStyle = '#ffb000';
      g.lineWidth = 5;
      g.lineJoin = 'round';
      g.beginPath();
      route.forEach((p, i) => { const [x, y] = toMini(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
    const dot = (x, z, color, r = 5) => {
      const [mx, my] = toMini(x, z);
      if (Math.hypot(mx - S / 2, my - S / 2) > S / 2 - 6) return;
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.fill();
    };
    if (!this.event) this.markers.forEach((m) => dot(m.x, m.z, TYPE_COLOR[m.kind], 7));
    if (!this.event && this.cams) this.cams.forEach((c) => dot(c.x, c.z, (this.save.cams[c.def.id] || 0) >= c.def.target ? '#39e27d' : '#ffffff', 3.5));
    const ph = Math.floor(this.time * 6) % 2;
    this.cops.forEach((c) => dot(c.x, c.z, c.role === 'patrol' ? '#8fa8ff' : c.role === 'wreck' ? '#555' : ph ? '#ff2d55' : '#2b6bff', 5));
    this.racers.forEach((r) => dot(r.v.x, r.v.z, '#ffffff', 5));
    if (this.heli) dot(this.heli.x, this.heli.z, '#ff2d55', 8);
    this.multi.drawMinimapDots(dot);
    g.restore();
    // player arrow
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(S / 2, S / 2 + 30 - 10);
    g.lineTo(S / 2 + 7, S / 2 + 30 + 8);
    g.lineTo(S / 2 - 7, S / 2 + 30 + 8);
    g.fill();
  }

  // ───────────────────────── teardown ─────────────────────────
  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.multi) this.multi.leave(true);
    this.timers.forEach((id) => clearTimeout(id));
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerdown', this.onDocDown, true);
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.ro) this.ro.disconnect();
    this.audio.close();
    const textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          ['map', 'emissiveMap'].forEach((k) => { if (m[k]) textures.add(m[k]); });
          m.dispose();
        });
      }
    });
    textures.forEach((t) => t.dispose());
    if (this.envRT) this.envRT.dispose();
    if (this.composer) this.composer.dispose();
    if (this.cubeRT) this.cubeRT.dispose();
    if (this.hdriEnv) this.hdriEnv.rt.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch { /* ignore */ }
    this.root.remove();
  }
}
