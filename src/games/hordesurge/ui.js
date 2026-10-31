// Horde Surge interface style: bright, chunky and bouncy. Thick ink outlines, candy gradients,
// a hard drop shadow under every button (they squash when pressed), and small inline SVG icons.

export const ICON = {
  castle: '<svg viewBox="0 0 24 24"><path d="M3 21V9h3v2h2V9h3v2h2V9h3v2h2V9h3v12h-7v-5a2 2 0 0 0-4 0v5z" fill="currentColor"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="currentColor"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z" fill="currentColor"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.6-1-2.6 1-1.4 2.2-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" fill="currentColor"/><circle cx="7.5" cy="11" r="1.5" fill="#1d1f45"/><circle cx="10" cy="7" r="1.5" fill="#1d1f45"/><circle cx="15" cy="7.5" r="1.5" fill="#1d1f45"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="currentColor"/><path d="M12 7l1.5 3 3.3.4-2.4 2.3.6 3.3L12 14.4 9 16l.6-3.3-2.4-2.3 3.3-.4z" fill="#1d1f45"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><path d="M3 10h18v4H3zM5 14h14v7H5z" fill="currentColor"/><path d="M11 10h2v11h-2zM12 9C9 9 7 8 7 6.2 7 4.6 9.5 4 12 9zm0 0c3 0 5-1 5-2.8C17 4.6 14.5 4 12 9z" fill="#1d1f45"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M10 2h4l.6 2.6 2.2 1.3 2.6-.8 2 3.4-2 1.9v2.6l2 1.9-2 3.4-2.6-.8-2.2 1.3L14 22h-4l-.6-2.6-2.2-1.3-2.6.8-2-3.4 2-1.9V11L2.6 9.1l2-3.4 2.6.8 2.2-1.3z" fill="currentColor"/><circle cx="12" cy="12" r="3.2" fill="#1d1f45"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3z" fill="currentColor"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.4 5H8a4.5 4.5 0 1 0 4-3.5V9L6.5 4.5 12 0z" fill="currentColor"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path d="M12 2c5 0 8.5 3.4 8.5 8 0 2.6-1.2 4.4-3 5.5V19a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3.5c-1.8-1.1-3-2.9-3-5.5C3.5 5.4 7 2 12 2z" fill="currentColor"/><circle cx="8.6" cy="10.5" r="2.2" fill="#1d1f45"/><circle cx="15.4" cy="10.5" r="2.2" fill="#1d1f45"/><path d="M10.5 15h3l-1.5 2.2z" fill="#1d1f45"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>',
  meteor: '<svg viewBox="0 0 24 24"><circle cx="15" cy="15" r="6" fill="currentColor"/><path d="M3 3l8 8M6 2l7 7M2 6l7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="13.5" cy="13.5" r="1.6" fill="#1d1f45"/><circle cx="17" cy="17" r="1.1" fill="#1d1f45"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="currentColor"/><circle cx="5" cy="11" r="3" fill="currentColor"/><circle cx="19" cy="11" r="3" fill="currentColor"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7zM0 21c0-3 2-5 5-5 1 0 2 .3 2.6.8C6 18 5.5 19.5 5.5 21zM24 21c0-3-2-5-5-5-1 0-2 .3-2.6.8 1.6 1.2 2.1 2.7 2.1 4.2z" fill="currentColor"/></svg>',
  cannon: '<svg viewBox="0 0 24 24"><path d="M3 9l13-5 2 5-13 5z" fill="currentColor"/><circle cx="8" cy="17" r="4" fill="currentColor"/><circle cx="8" cy="17" r="1.6" fill="#1d1f45"/><path d="M17 5l4-1.5.8 2-4 1.6z" fill="currentColor"/></svg>',
  tank: '<svg viewBox="0 0 24 24"><path d="M7 8h8l2 3H5z" fill="currentColor"/><path d="M14 9h9v1.6h-9z" fill="currentColor"/><rect x="2" y="12" width="18" height="4" rx="1" fill="currentColor"/><rect x="2.5" y="16.5" width="17" height="4" rx="2" fill="currentColor"/><g fill="#1d1f45"><circle cx="6" cy="18.5" r="1"/><circle cx="11" cy="18.5" r="1"/><circle cx="16" cy="18.5" r="1"/></g></svg>',
  plane: '<svg viewBox="0 0 24 24"><path d="M11 2h2l1 7 8 3v2l-8-1-.5 5 3 2v1.5L12 20.5 7.5 21.5V20l3-2-.5-5-8 1v-2l8-3z" fill="currentColor"/></svg>',
  jet: '<svg viewBox="0 0 24 24"><path d="M12 1l2 8 8 7v2l-8-3-1 4 3 2v2l-4-1-4 1v-2l3-2-1-4-8 3v-2l8-7z" fill="currentColor"/></svg>',
  paw: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5" ry="4.2" fill="currentColor"/><ellipse cx="6" cy="10" rx="2" ry="2.6" fill="currentColor"/><ellipse cx="18" cy="10" rx="2" ry="2.6" fill="currentColor"/><ellipse cx="9.3" cy="6" rx="2" ry="2.6" fill="currentColor"/><ellipse cx="14.7" cy="6" rx="2" ry="2.6" fill="currentColor"/></svg>',
  scroll: '<svg viewBox="0 0 24 24"><path d="M6 3h11a3 3 0 0 1 3 3v1h-4v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h3z" fill="currentColor"/><path d="M8 8h6M8 11.5h6M8 15h4" stroke="#1d1f45" stroke-width="1.6" stroke-linecap="round"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" fill="currentColor"/><path d="M9 3v15M15 6v15" stroke="#1d1f45" stroke-width="1.4" fill="none"/></svg>',
  infinity: '<svg viewBox="0 0 24 24"><path d="M7 8.5a3.5 3.5 0 1 0 0 7c2.6 0 4.4-3.5 5-3.5s2.4 3.5 5 3.5a3.5 3.5 0 1 0 0-7c-2.6 0-4.4 3.5-5 3.5S9.6 8.5 7 8.5z" stroke="currentColor" stroke-width="2.6" fill="none"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><path d="M4 6h16v15H4z" fill="currentColor"/><path d="M4 6h16v4H4z" fill="#ff4f7a"/><path d="M8 3v5M16 3v5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.5 15.5l2.2 2.2 4.8-4.8" stroke="#1d1f45" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  snow: '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2zM2 11h20v2H2zM4.2 5.6l1.4-1.4 14.2 14.2-1.4 1.4zM18.4 4.2l1.4 1.4L5.6 19.8l-1.4-1.4z" fill="currentColor"/></svg>',
  bomb: '<svg viewBox="0 0 24 24"><circle cx="10" cy="14" r="7" fill="currentColor"/><path d="M13.5 7.5l2-2 3 3-2 2z" fill="currentColor"/><path d="M18 4l1-2M20 5.5l2-1M19.5 7.5l2 .5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
};

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800&display=swap');
.hs{--ink:#1d1f45;--ink2:#2c2f63;--sun:#ffd23f;--grass:#3fd86b;--sky:#2b8cff;--rose:#ff4f7a;
  position:absolute;inset:0;overflow:hidden;font-family:"Lilita One","Arial Black",system-ui,sans-serif;color:#fff;
  user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent;background:#7ec8ff;letter-spacing:.02em}
.hs *{box-sizing:border-box}
.hs [hidden]{display:none!important}
.hs svg{display:block;width:1em;height:1em}
.hs canvas.hs-c{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}
.hs .sm{font-family:Nunito,system-ui,sans-serif;font-weight:800;letter-spacing:0}
.hs-out{text-shadow:-.06em -.06em 0 var(--ink),.06em -.06em 0 var(--ink),-.06em .06em 0 var(--ink),.06em .06em 0 var(--ink),0 .12em 0 var(--ink)}

/* ── HUD ── */
.hs-hud{position:absolute;inset:0;pointer-events:none}
.hs-top{position:absolute;left:0;right:0;top:0;padding:.65em .7em;display:flex;align-items:center;gap:.55em}
.hs-round{pointer-events:auto;width:2.5em;height:2.5em;flex:none;border-radius:.8em;border:.16em solid var(--ink);background:linear-gradient(#fff,#d9e4ff);color:var(--ink);display:grid;place-items:center;font-size:1em;cursor:pointer;box-shadow:0 .2em 0 var(--ink)}
.hs-round svg{width:1.1em;height:1.1em}
.hs-round:active{transform:translateY(.15em);box-shadow:0 .05em 0 var(--ink)}
.hs-lvl{flex:none;display:grid;place-items:center;width:2.9em;height:3.1em;line-height:.9;color:var(--ink);background:linear-gradient(var(--sun),#ffae00);border:.16em solid var(--ink);border-radius:.7em .7em 1.45em 1.45em;box-shadow:0 .2em 0 var(--ink)}
.hs-lvl small{font-size:.55em}
.hs-lvl b{font-size:1.25em;font-weight:400}
.hs-bars{flex:1;display:grid;gap:.35em;min-width:0}
.hs-meter{display:flex;align-items:center;gap:.3em}
.hs-meter .ic{flex:none;width:1.9em;height:1.9em;border-radius:50%;display:grid;place-items:center;border:.15em solid var(--ink);box-shadow:0 .15em 0 var(--ink);font-size:.9em}
.hs-meter.base .ic{background:#ff6b6b;color:#fff}
.hs-meter.hp .ic{background:#45e07c;color:#fff;width:1.6em;height:1.6em}
.hs-track{position:relative;flex:1;height:1.35em;border-radius:1em;background:var(--ink);border:.14em solid var(--ink);overflow:hidden}
.hs-meter.hp .hs-track{height:1.05em}
.hs-track i{position:absolute;left:0;top:0;bottom:0;border-radius:1em}
.hs-track .trail{background:#fff;transition:width .5s .25s}
.hs-track .fill{transition:width .12s}
.hs-meter.base .fill{background:linear-gradient(#ff9a9a,#ff4a5a 55%,#d8243a)}
.hs-meter.hp .fill{background:linear-gradient(#a6ffbf,#3fd86b 55%,#20a64c)}
.hs-track .fill::after{content:'';position:absolute;left:.4em;right:.4em;top:.15em;height:.25em;border-radius:1em;background:rgba(255,255,255,.55)}
.hs-track b{position:absolute;inset:0;display:grid;place-items:center;font-size:.8em;font-weight:400}
.hs-coins{flex:none;display:flex;align-items:center;gap:.3em;padding:.25em .7em .25em .3em;border-radius:2em;background:rgba(29,31,69,.75);border:.14em solid var(--ink);font-size:1.05em}
.hs-coins.bump{animation:hsbump .35s}
@keyframes hsbump{40%{transform:scale(1.18)}}
.hs-coin{display:inline-block;flex:none;width:1.2em;height:1.2em;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7c4 0 15%,#ffd23f 40%,#e99a00);border:.12em solid #9a5a00;vertical-align:-.2em;box-shadow:inset 0 -.12em 0 rgba(0,0,0,.18)}
.hs-count{position:absolute;left:.8em;bottom:1em;display:flex;align-items:center;gap:.45em;padding:.3em .7em;border-radius:2em;background:rgba(29,31,69,.7);border:.14em solid var(--ink);font-size:1.15em}
.hs-count .d{width:.8em;height:.8em;border-radius:50%;border:.12em solid var(--ink)}
.hs-count .vs{font-size:.7em;opacity:.7}
.hs-champ{position:absolute;right:.9em;bottom:1em;width:5.4em;height:5.4em;border-radius:50%;pointer-events:auto;border:.18em solid var(--ink);cursor:pointer;font:inherit;color:#fff;
  background:conic-gradient(var(--sun) var(--p,0%),rgba(29,31,69,.75) 0);display:grid;place-items:center;box-shadow:0 .25em 0 var(--ink)}
.hs-champ span{width:4.2em;height:4.2em;border-radius:50%;background:var(--ink2);display:grid;place-items:center;font-size:.85em;line-height:1.05;text-align:center;border:.15em solid var(--ink)}
.hs-champ.ready{animation:hspulse .9s infinite}
.hs-champ.ready span{background:linear-gradient(#ffe066,#ff9f1a);color:var(--ink)}
.hs-champ:active{transform:translateY(.15em)}
@keyframes hspulse{50%{transform:scale(1.08)}}
.hs-hint{position:absolute;left:0;right:0;bottom:24%;text-align:center;font-size:1.35em;animation:hsblink 1.2s infinite;pointer-events:none}
@keyframes hsblink{50%{opacity:.35}}
.hs-banner{position:absolute;left:0;right:0;top:26%;text-align:center;pointer-events:none;font-size:2.6em;transform:scale(.5) rotate(-4deg);opacity:0;transition:transform .3s cubic-bezier(.3,1.6,.5,1),opacity .2s}
.hs-banner.on{transform:scale(1) rotate(-3deg);opacity:1}
.hs-banner small{display:block;font-size:.45em;color:var(--sun)}
.hs-banner.on{animation:hsbanner 1.2s ease-out}
@keyframes hsbanner{0%{letter-spacing:.4em;filter:blur(2px)}25%{letter-spacing:.02em;filter:none}}
.hs-float{position:absolute;pointer-events:none;font-size:1.3em;white-space:nowrap;transform:translate(-50%,-50%);will-change:transform}
.hs-vig{position:absolute;inset:0;pointer-events:none;transition:box-shadow .2s}
/* boss health, power-up chips, combo counter and the danger glow */
.hs-boss{position:absolute;left:50%;top:4.4em;width:min(16em,52%);transform:translateX(-50%);display:grid;gap:.15em;justify-items:center;animation:hsdrop .4s cubic-bezier(.3,1.6,.5,1)}
.hs-boss b{font-weight:400;font-size:.85em;color:#ffb3b3;letter-spacing:.08em}
.hs-boss .hs-track{width:100%;height:1em;box-shadow:0 .15em 0 var(--ink),0 0 1em rgba(255,60,80,.45)}
.hs-boss .fill{background:linear-gradient(#ffb36b,#ff4a3a 55%,#b81d2a)}
@keyframes hsdrop{from{transform:translate(-50%,-1.5em);opacity:0}}
.hs-fx{position:absolute;left:.7em;top:4.4em;display:grid;gap:.35em}
.hs-fx .chip{position:relative;display:flex;align-items:center;gap:.35em;padding:.25em .7em .35em .3em;border-radius:2em;background:rgba(29,31,69,.8);border:.14em solid var(--ink);box-shadow:0 0 .9em var(--c);font-size:.85em;overflow:hidden;animation:hschip .35s cubic-bezier(.3,1.6,.5,1)}
.hs-fx .chip svg{width:1.5em;height:1.5em;padding:.2em;border-radius:50%;background:var(--c);color:#fff;border:.12em solid var(--ink)}
.hs-fx .chip i{position:absolute;left:0;bottom:0;height:.22em;width:var(--t,100%);background:var(--c)}
@keyframes hschip{from{transform:translateX(-3em) scale(.6);opacity:0}}
/* sits above the hero button so it never covers the cannon */
.hs-combo{position:absolute;right:1em;bottom:7.3em;display:grid;justify-items:end;line-height:.9;--cc:#fff}
.hs-combo b{font-weight:400;font-size:2em;color:var(--cc)}
.hs-combo small{font-size:.75em;letter-spacing:.2em;opacity:.9}
.hs-combo i{display:block;height:.25em;margin-top:.2em;border-radius:1em;background:var(--cc);width:100%;max-width:5em;box-shadow:0 0 .6em var(--cc)}
.hs-combo[data-tier="1"]{--cc:#ffe066}.hs-combo[data-tier="2"]{--cc:#ffae00}.hs-combo[data-tier="3"]{--cc:#ff6b3a}.hs-combo[data-tier="4"]{--cc:#ff4f9a}.hs-combo[data-tier="5"]{--cc:#c08bff}
.hs-combo.pop b{animation:hscpop .45s cubic-bezier(.3,1.8,.5,1)}
@keyframes hscpop{0%{transform:scale(1.9) rotate(-8deg)}100%{transform:none}}
.hs-danger{position:absolute;left:0;right:0;bottom:0;height:30%;pointer-events:none;opacity:0;background:linear-gradient(transparent,rgba(255,30,60,.35));transition:opacity .3s}
.hs.danger .hs-danger{opacity:1;animation:hsblink .8s infinite}
.hs-star{color:var(--sun);font-size:1.15em;-webkit-text-stroke:.06em var(--ink);paint-order:stroke fill}

/* ── buttons ── */
.hs-btn{pointer-events:auto;border:.16em solid var(--ink);font:inherit;color:#fff;cursor:pointer;border-radius:1em;padding:.55em 1.3em;font-size:1.1em;display:inline-flex;align-items:center;justify-content:center;gap:.4em;
  background:linear-gradient(#6fd0ff,#2b8cff);box-shadow:inset 0 -.25em 0 rgba(0,0,0,.18),inset 0 .18em 0 rgba(255,255,255,.35),0 .25em 0 var(--ink);transition:transform .08s,box-shadow .08s}
.hs-btn svg{width:1.05em;height:1.05em}
.hs-btn:active{transform:translateY(.18em);box-shadow:inset 0 -.15em 0 rgba(0,0,0,.18),0 .07em 0 var(--ink)}
.hs-btn.green{background:linear-gradient(#8dff9e,#25c058)}
.hs-play{position:relative;overflow:hidden}
.hs-play::after{content:'';position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-20deg);animation:hsshine 2.6s ease-in-out infinite}
@keyframes hsshine{60%,100%{left:130%}}
.hs-btn:not(:disabled):hover,.hs-tile:hover{filter:brightness(1.08)}
.hs-btn.gold{background:linear-gradient(#ffe680,#ffae00);color:var(--ink)}
.hs-btn.red{background:linear-gradient(#ff9aa6,#e5304a)}
.hs-btn.ghost{background:linear-gradient(#4a4e8c,#2c2f63)}
.hs-btn.sel{background:linear-gradient(#ffe680,#ffae00);color:var(--ink)}
.hs-btn:disabled{filter:grayscale(.85) brightness(.9);cursor:default;transform:none}
.hs-btn .hs-coin{width:1em;height:1em}

/* ── screens ── */
.hs-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:.9em;padding:1.1em;pointer-events:auto;text-align:center;overflow:auto;touch-action:pan-y}
.hs-screen>*{flex-shrink:0;animation:hsin .45s cubic-bezier(.3,1.4,.5,1) backwards}
.hs-screen>:nth-child(2){animation-delay:.05s}.hs-screen>:nth-child(3){animation-delay:.1s}.hs-screen>:nth-child(4){animation-delay:.15s}.hs-screen>:nth-child(5){animation-delay:.2s}.hs-screen>:nth-child(6){animation-delay:.25s}
@keyframes hsin{from{opacity:0;transform:translateY(1.2em) scale(.92)}}
.hs-screen>.hs-topbar,.hs-screen>.hs-confetti{animation:none}
.hs-screen>.hs-logo{animation:hsin .45s cubic-bezier(.3,1.4,.5,1) backwards,hsbob 3s .45s ease-in-out infinite}
.hs-screen>.hs-play{animation:hsin .45s .15s cubic-bezier(.3,1.4,.5,1) backwards,hspulse 1.6s .6s ease-in-out infinite}
.hs-screen.dim{background:radial-gradient(circle at 50% 40%,rgba(43,47,110,.55),rgba(14,15,40,.82))}
.hs-topbar{position:absolute;right:.7em;top:.7em;display:flex;gap:.5em;align-items:center}
.hs-logo{position:relative;line-height:.84;font-size:3.6em;transform:rotate(-4deg);animation:hsbob 3s ease-in-out infinite}
.hs-logo .a{display:block;color:#fff}
.hs-logo .b{display:block;color:var(--sun);font-size:1.12em}
.hs-logo span{-webkit-text-stroke:.09em var(--ink);paint-order:stroke fill;text-shadow:0 .1em 0 var(--ink),0 .2em .3em rgba(0,0,0,.25)}
@keyframes hsbob{50%{transform:rotate(-2deg) translateY(-.06em)}}
.hs-where{display:flex;align-items:center;gap:.5em;font-size:1.05em;padding:.3em .9em;border-radius:2em;background:rgba(29,31,69,.6);border:.14em solid var(--ink)}
.hs-where .boss{color:#ff8a8a}
.hs-road{display:flex;align-items:center}
.hs-road i{width:1.5em;height:1.5em;border-radius:50%;border:.15em solid var(--ink);background:#7a7fb8;display:grid;place-items:center;font-style:normal;font-size:.75em;color:var(--ink)}
.hs-road i.done{background:var(--sun)}
.hs-road i.cur{background:#fff;transform:scale(1.35);box-shadow:0 0 0 .2em var(--sun)}
.hs-road i.boss{width:1.9em;height:1.9em;background:#ff6b6b;color:var(--ink)}
.hs-road i.boss.done{background:var(--sun)}
.hs-road i svg{width:1.1em;height:1.1em}
.hs-road u{width:1.4em;height:.3em;background:var(--ink);text-decoration:none}
.hs-play{font-size:1.9em;padding:.42em 2.1em;animation:hspulse 1.6s ease-in-out infinite}
.hs-nav{display:flex;justify-content:center;gap:.55em;flex-wrap:wrap;margin-top:.2em}
.hs-tile{pointer-events:auto;position:relative;min-width:4.6em;padding:.45em .5em .35em;border-radius:1em;border:.16em solid var(--ink);font:inherit;color:var(--ink);cursor:pointer;display:grid;justify-items:center;gap:.15em;font-size:.95em;
  background:linear-gradient(#fff,#d7e2ff);box-shadow:inset 0 -.22em 0 rgba(0,0,0,.12),0 .25em 0 var(--ink)}
.hs-tile svg{width:1.7em;height:1.7em}
.hs-tile.pet svg{color:#ff8a3a}.hs-tile.arms svg{color:#5a6a3a}.hs-tile.quest svg{color:#9b6bff}
.hs-tile.up svg{color:#25c058}.hs-tile.skin svg{color:#ff4f8b}.hs-tile.champ svg{color:#2b8cff}.hs-tile.gift svg{color:#ffae00}.hs-tile.gear svg{color:#7a7fb8}
.hs-tile:active{transform:translateY(.18em);box-shadow:0 .07em 0 var(--ink)}
.hs-tile .dot{position:absolute;top:-.35em;right:-.35em;width:1.2em;height:1.2em;border-radius:50%;background:#ff3b4a;border:.14em solid var(--ink);animation:hspulse 1s infinite}
.hs-panel{background:linear-gradient(#34387a,#24275a);border:.18em solid var(--ink);border-radius:1.3em;padding:.9em 1em;width:min(30em,100%);text-align:left;box-shadow:0 .35em 0 var(--ink),0 1em 2em rgba(0,0,0,.3)}
.hs-panel h2{margin:-.2em 0 .5em;font-size:1.6em;font-weight:400;text-align:center}
.hs-row{display:flex;align-items:center;gap:.7em;padding:.55em .55em;margin:.3em 0;border-radius:.9em;background:rgba(0,0,0,.18)}
.hs-row .t{flex:1;min-width:0}
.hs-row .t small{display:block;font-family:Nunito,system-ui,sans-serif;font-weight:700;font-size:.78em;opacity:.8;letter-spacing:0}
.hs-row .t b{color:var(--sun);font-weight:400}
.hs-row .hs-btn{font-size:.9em;padding:.4em .8em}
.hs-pips{display:flex;gap:.16em;margin-top:.3em;flex-wrap:wrap}
.hs-pips i{width:.6em;height:.6em;border-radius:.2em;background:rgba(255,255,255,.18)}
.hs-pips i.on{background:var(--sun);box-shadow:0 0 .4em rgba(255,210,63,.6)}
.hs-sw{width:2.6em;height:2.6em;border-radius:50% 50% 45% 45%;border:.16em solid var(--ink);flex:none;box-shadow:inset 0 -.3em 0 rgba(0,0,0,.15),inset .3em .3em 0 rgba(255,255,255,.25);position:relative}
.hs-sw::before,.hs-sw::after{content:'';position:absolute;top:32%;width:.45em;height:.55em;border-radius:50%;background:#fff;box-shadow:inset .08em .1em 0 .1em var(--ink)}
.hs-sw::before{left:26%}.hs-sw::after{right:26%}
.hs-ribbon{position:relative;font-size:2.5em;padding:.15em 1.2em;background:linear-gradient(#ffe680,#ffae00);color:var(--ink);border:.08em solid var(--ink);border-radius:.25em;box-shadow:0 .12em 0 var(--ink);transform:rotate(-2deg)}
.hs-ribbon.lose{background:linear-gradient(#ff9aa6,#e5304a);color:#fff}
.hs-stars{display:flex;gap:.2em;font-size:3.2em;color:var(--sun)}
.hs-stars span{display:block;-webkit-text-stroke:.07em var(--ink);paint-order:stroke fill;text-shadow:0 .08em 0 var(--ink);opacity:0;transform:scale(2.4) rotate(-30deg);animation:hsstar .45s cubic-bezier(.3,1.7,.5,1) forwards}
.hs-stars span:nth-child(2){animation-delay:.25s;transform-origin:center;font-size:1.25em;margin-top:-.15em}
.hs-stars span:nth-child(3){animation-delay:.5s}
.hs-stars span.off{color:#4a4e8c}
@keyframes hsstar{to{opacity:1;transform:scale(1) rotate(0)}}
.hs-reward{display:grid;gap:.25em;width:min(20em,100%)}
.hs-reward div{display:flex;justify-content:space-between;padding:.35em .7em;border-radius:.7em;background:rgba(0,0,0,.2)}
.hs-reward div.best{background:rgba(255,79,154,.35);box-shadow:0 0 .8em rgba(255,79,154,.5)}
.hs-reward div.total{background:var(--sun);color:var(--ink);font-size:1.25em;border:.12em solid var(--ink)}
.hs-reward span{font-family:Nunito,system-ui,sans-serif;font-weight:800;letter-spacing:0}
.hs-actions{display:flex;gap:.6em;flex-wrap:wrap;justify-content:center;align-items:center}
.hs-tip{font-family:Nunito,system-ui,sans-serif;font-weight:700;opacity:.9;max-width:26em;letter-spacing:0}
.hs-days{display:grid;grid-template-columns:repeat(4,1fr);gap:.45em}
.hs-day{border-radius:.9em;border:.15em solid var(--ink);background:#3d418a;padding:.4em .2em;text-align:center;display:grid;justify-items:center;gap:.2em;font-size:.9em}
.hs-day.now{background:linear-gradient(#ffe680,#ffae00);color:var(--ink);animation:hspulse 1.2s infinite}
.hs-day.got{opacity:.45}
.hs-day.big{grid-column:span 2}
.hs-opts{display:flex;gap:.3em;flex-wrap:wrap;justify-content:flex-end}
.hs-opts .hs-btn{font-size:.78em;padding:.35em .7em}
.hs-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hs-confetti i{position:absolute;top:-1em;width:.6em;height:.9em;border-radius:.15em;animation:hsfall linear forwards}
@keyframes hsfall{to{transform:translateY(110vh) rotate(720deg)}}
.hs.short .hs-screen{gap:.4em;padding:.5em}
.hs.short .hs-logo{font-size:2em}
.hs.short .hs-where,.hs.short .hs-road{display:none}
.hs.short .hs-play{font-size:1.4em;padding:.35em 1.6em}
.hs.short .hs-nav{margin-top:0}
.hs.short .hs-tile{font-size:.75em}
.hs.short .hs-panel{padding:.6em .8em}
.hs.short .hs-panel h2{font-size:1.2em;margin-bottom:.2em}
.hs.short .hs-topbar{top:.4em;right:.4em}
.hs.short .hs-stars{font-size:2em}
.hs.short .hs-ribbon{font-size:1.6em}
/* ── super powers: a row of round buttons with a cooldown sweep ── */
.hs-powers{position:absolute;left:50%;bottom:.9em;transform:translateX(-50%);display:flex;gap:.45em;pointer-events:none}
.hs.tall .hs-powers{bottom:4.2em}
.hs-pow{pointer-events:auto;position:relative;width:3.3em;height:3.3em;border-radius:50%;border:.16em solid var(--ink);cursor:pointer;color:#fff;font:inherit;display:grid;place-items:center;padding:0;
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 70%,#fff),var(--c) 60%,color-mix(in srgb,var(--c) 70%,#000));box-shadow:0 .22em 0 var(--ink);transition:transform .1s}
.hs-pow svg{position:relative;z-index:1;width:1.6em;height:1.6em;filter:drop-shadow(0 .08em 0 rgba(0,0,0,.35))}
.hs-pow .cd{position:absolute;inset:0;border-radius:50%;background:conic-gradient(rgba(14,15,40,.78) var(--cd,0%),transparent 0);z-index:2;pointer-events:none}
.hs-pow kbd{position:absolute;top:-.35em;left:-.3em;z-index:3;font:inherit;font-size:.62em;width:1.5em;height:1.5em;display:grid;place-items:center;border-radius:50%;background:var(--ink);border:.12em solid #fff4}
.hs-pow .nm{position:absolute;bottom:-1.15em;left:50%;transform:translateX(-50%);font-size:.6em;white-space:nowrap;z-index:3}
.hs-pow.ready{animation:hspowglow 1.1s ease-in-out infinite}
.hs-pow.ready:hover{transform:translateY(-.12em) scale(1.05)}
.hs-pow:active{transform:translateY(.15em);box-shadow:0 .05em 0 var(--ink)}
.hs-pow:not(.ready){filter:saturate(.55);cursor:default}
@keyframes hspowglow{50%{box-shadow:0 .22em 0 var(--ink),0 0 1.1em .2em var(--c)}}
.hs.short .hs-pow{width:2.7em;height:2.7em}
.hs.short .hs-pow .nm{display:none}

/* ── mission toast, treasure chest, pets, missions ── */
.hs-toast{position:absolute;left:50%;top:5.2em;transform:translate(-50%,-1em);opacity:0;pointer-events:none;z-index:6;padding:.4em 1em;border-radius:2em;background:linear-gradient(#5ce07a,#25a94f);border:.14em solid var(--ink);box-shadow:0 .2em 0 var(--ink);font-size:.95em;white-space:nowrap;transition:transform .3s cubic-bezier(.3,1.6,.5,1),opacity .25s}
.hs-toast.on{transform:translate(-50%,0);opacity:1}
.hs-chestui{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:2.2em 1em 2.4em;pointer-events:none}
.hs-chestui>*{pointer-events:auto}
.hs-loot{display:grid;justify-items:center;gap:.1em;padding:.7em 2.2em .6em;border-radius:1.3em;border:.18em solid var(--ink);background:linear-gradient(#34387a,#24275a);box-shadow:0 0 0 .2em var(--c) inset,0 .35em 0 var(--ink),0 0 2.5em color-mix(in srgb,var(--c) 70%,transparent);animation:hsloot .55s cubic-bezier(.3,1.6,.5,1)}
.hs-loot .hs-coin{width:3.2em;height:3.2em;border-width:.2em;animation:hscoinspin 1.6s ease-in-out infinite}
.hs-loot b{font-size:2.6em;color:var(--sun);line-height:1}
.hs-loot small{font-size:.9em;letter-spacing:.12em;opacity:.85}
@keyframes hsloot{from{transform:scale(.2) translateY(3em);opacity:0}}
@keyframes hscoinspin{50%{transform:scaleX(.25)}}
.hs-ribbon.rare{background:linear-gradient(#bfe8ff,#58a8ff)}
.hs-ribbon.epic{background:linear-gradient(#e2c8ff,#9b6bff);color:#fff}
.hs-petic{flex:none;width:2.6em;height:2.6em;border-radius:50%;display:grid;place-items:center;background:var(--c);border:.16em solid var(--ink);color:#fff;box-shadow:inset 0 -.25em 0 rgba(0,0,0,.18)}
.hs-petic svg{width:1.5em;height:1.5em}
.hs-prog{position:relative;height:1.15em;margin-top:.35em;border-radius:1em;background:rgba(0,0,0,.35);overflow:hidden}
.hs-prog i{position:absolute;left:0;top:0;bottom:0;border-radius:1em;background:linear-gradient(#ffe680,#ffae00)}
.hs-prog b{position:absolute;inset:0;display:grid;place-items:center;font-size:.7em;font-weight:400;color:#fff;text-shadow:0 .08em 0 var(--ink)}
.hs-row.mission.ready{box-shadow:inset 0 0 0 .14em #5ce07a}

/* ── arsenal ── */
.hs-wic{flex:none;width:2.8em;height:2.8em;border-radius:.8em;display:grid;place-items:center;border:.16em solid var(--ink);color:#fff;box-shadow:inset 0 -.25em 0 rgba(0,0,0,.2)}
.hs-wic svg{width:1.7em;height:1.7em}
.hs-wic.cannon{background:linear-gradient(#c9a46a,#8a6a3a)}.hs-wic.tank{background:linear-gradient(#8aa060,#4f6a35)}.hs-wic.plane{background:linear-gradient(#7fd0ff,#2b8cff)}.hs-wic.jet{background:linear-gradient(#c08bff,#5a3ad8)}
.hs-tags{display:flex;flex-wrap:wrap;gap:.25em;margin-top:.3em}
.hs-tags i{font-style:normal;font-family:Nunito,system-ui,sans-serif;font-weight:800;font-size:.68em;letter-spacing:0;padding:.1em .5em;border-radius:1em;background:rgba(255,210,63,.2);color:var(--sun)}
.hs-row.weapon.locked{opacity:.6}

/* ── home: game modes ── */
.hs-modes{display:flex;gap:.55em;justify-content:center;flex-wrap:wrap;width:min(34em,100%)}
.hs-mode{pointer-events:auto;flex:1 1 9em;min-width:0;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:.5em;align-items:center;text-align:left;padding:.55em .75em;border-radius:1.1em;border:.16em solid var(--ink);font:inherit;color:#fff;cursor:pointer;
  background:linear-gradient(135deg,var(--a),var(--b));box-shadow:inset 0 -.22em 0 rgba(0,0,0,.2),inset 0 .15em 0 rgba(255,255,255,.3),0 .25em 0 var(--ink);transition:transform .1s}
.hs-mode svg{grid-row:span 2;width:2em;height:2em;filter:drop-shadow(0 .1em 0 rgba(0,0,0,.25))}
.hs-mode b{font-weight:400;font-size:1.05em;text-shadow:0 .08em 0 var(--ink)}
.hs-mode small{font-family:Nunito,system-ui,sans-serif;font-weight:800;font-size:.72em;opacity:.92;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hs-mode.map{--a:#3fd86b;--b:#1f9a6a}.hs-mode.endless{--a:#9b6bff;--b:#5a3ad8}.hs-mode.daily{--a:#ffae00;--b:#ff5a3a}
.hs-mode.daily.done{--a:#7a7fb8;--b:#4a4e8c}
.hs-mode:active{transform:translateY(.18em);box-shadow:0 .07em 0 var(--ink)}
.hs-mode:hover:not(:disabled){transform:translateY(-.1em)}
.hs-mode:disabled{filter:grayscale(.8) brightness(.85);cursor:default}
.hs-modic{display:grid;place-items:center;width:2em;height:2em;border-radius:50%;background:var(--sun);color:var(--ink);border:.14em solid var(--ink);flex:none}
.hs-modic svg{width:1.1em;height:1.1em}

/* ── world map ── */
.hs-screen.map{pointer-events:none;justify-content:space-between;padding:.7em;background:linear-gradient(transparent 60%,rgba(14,15,40,.35))}
.hs-screen.map>*{pointer-events:auto}
.hs-maptop{display:flex;align-items:center;justify-content:space-between;width:100%;gap:.5em}
.hs-maphint{pointer-events:none!important;position:absolute;top:3.6em;left:0;right:0;margin:0;font-size:.85em;opacity:.9;animation:hsblink 2s infinite}
.hs-mapcard{width:min(24em,100%)}
.lvlcard{text-align:center;padding:.7em 1em .9em;animation:hsin .35s cubic-bezier(.3,1.4,.5,1)}
.lvlcard h2{margin:0 0 .1em}
.lvlcard .sub{font-family:Nunito,system-ui,sans-serif;font-weight:800;opacity:.9;letter-spacing:0}
.lvlcard .boss{color:#ff8a8a}
.lvlcard .hs-stars{justify-content:center;font-size:1.8em;margin:.15em 0}
.lvlcard .hs-stars span{animation-duration:.3s}
.lvlcard .newfoe{display:inline-block;margin:.2em 0 .35em;padding:.15em .7em;border-radius:1em;background:#ff4f7a;border:.12em solid var(--ink);font-size:.85em;animation:hspulse 1.2s infinite}
.lvlcard .foes{display:flex;flex-wrap:wrap;gap:.3em;justify-content:center;margin:.2em 0 .6em}
.lvlcard .foe{display:flex;align-items:center;gap:.3em;padding:.12em .55em .12em .25em;border-radius:1em;background:rgba(0,0,0,.25);font-family:Nunito,system-ui,sans-serif;font-weight:800;font-size:.75em;letter-spacing:0}
.lvlcard .foe i{width:.95em;height:.95em;border-radius:50% 50% 45% 45%;border:.12em solid var(--ink)}
.lvlcard.locked{opacity:.85}
.lvlcard .hs-play{font-size:1.4em}

/* ── new enemy card, endless result ── */
.foecard{text-align:center;display:grid;justify-items:center;gap:.3em;width:min(20em,100%)}
.foecard h2{margin:.1em 0 0}
.foecard .hs-tip{margin:0}
.hs-sw.big{width:4.5em;height:4.5em;animation:hsbob 1.4s ease-in-out infinite}
.hs-bigwave{display:grid;font-size:3.4em;line-height:.95;color:var(--sun)}
.hs-bigwave small{font-size:.3em;color:#fff;letter-spacing:.2em}
.gold{color:var(--sun)}
.hs.short .hs-modes{font-size:.8em}
.hs.short .hs-maphint{display:none}
/* ── super power store and loadout, chapter arrows, level twist ── */
.hs-credits{margin:.4em 0 0;font-family:Nunito,system-ui,sans-serif;font-weight:700;font-size:.78em;letter-spacing:0}
.hs-credits summary{cursor:pointer;opacity:.85}
.hs-credits p{margin:.4em 0 0;line-height:1.35;opacity:.85}
.hs-credits a{color:var(--sun)}
.hs-panel.wide{width:min(46em,100%);max-height:72vh;overflow:auto}
.hs-tile.pow svg{color:#ffb000}
.hs-slots{display:flex;justify-content:center;gap:.6em;margin:.2em 0 .7em}
.hs-slot{position:relative;width:3.6em;height:3.6em;border-radius:50%;border:.16em solid var(--ink);display:grid;place-items:center;color:#fff;font:inherit;cursor:pointer;padding:0;box-shadow:0 .22em 0 var(--ink);
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 70%,#fff),var(--c) 60%,color-mix(in srgb,var(--c) 70%,#000))}
.hs-slot svg{width:1.7em;height:1.7em}
.hs-slot small{position:absolute;bottom:-1.3em;left:50%;transform:translateX(-50%);font-size:.58em;white-space:nowrap}
.hs-slot.empty{background:rgba(255,255,255,.08);border-style:dashed;color:#fff6;font-size:1.4em;cursor:default;box-shadow:none}
.hs-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.5em,1fr));gap:.5em;margin-top:1em}
.hs-pcard{display:grid;justify-items:center;align-content:start;gap:.2em;text-align:center;padding:.55em .45em;border-radius:1em;border:.14em solid var(--ink);background:rgba(255,255,255,.07)}
.hs-pcard.on{background:color-mix(in srgb,var(--c) 30%,transparent);box-shadow:0 0 0 .14em var(--c) inset}
.hs-pcard.shop{opacity:.85}
.hs-pcard .ic{width:2.4em;height:2.4em;border-radius:50%;display:grid;place-items:center;border:.14em solid var(--ink);color:#fff;background:var(--c)}
.hs-pcard .ic svg{width:1.4em;height:1.4em}
.hs-pcard small{font-family:Nunito,system-ui,sans-serif;font-weight:700;font-size:.72em;letter-spacing:0;opacity:.85;line-height:1.2}
.hs-pcard i{font-style:normal;font-size:.62em;color:var(--sun)}
.hs-pcard .hs-btn{font-size:.85em;padding:.35em .9em;margin-top:.15em}
.hs-chapters{display:flex;align-items:center;gap:.4em}
.hs-chapters .hs-round{font-size:1.1em;font-weight:900}
.hs-chapters .hs-round:disabled{opacity:.35;cursor:default}
.lvlcard .twist{font-family:Nunito,system-ui,sans-serif;font-weight:700;font-size:.85em;letter-spacing:0;margin:.15em 0;opacity:.9}
.lvlcard .twist b{color:var(--sun)}
@media (prefers-reduced-motion: reduce){.hs *{animation:none!important}}
`;
