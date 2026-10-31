// Core Breach entry point. GameHub calls mount(container) and keeps the returned cleanup function.
import { Game } from './game.js';

export const engine = 'three';

const LOADER_CSS = `
.cbl{position:absolute;inset:0;background:#0f1923;display:grid;place-content:center;justify-items:center;gap:.8em;font-family:'Rajdhani','Bahnschrift','Arial Narrow',sans-serif;z-index:20;color:#ece8e1}
.cbl b{font-size:2.4em;letter-spacing:.12em}
.cbl b span{color:#ff4655}
.cbl i{display:block;width:12em;height:3px;background:#ece8e122;overflow:hidden;position:relative}
.cbl i:after{content:'';position:absolute;left:-40%;top:0;bottom:0;width:40%;background:#ff4655;animation:cbl 1s infinite ease-in-out}
.cbl small{letter-spacing:.3em;opacity:.7}
@keyframes cbl{to{left:100%}}`;

export function mount(container, opts = {}) {
  const loader = document.createElement('div');
  loader.className = 'cbl';
  loader.innerHTML = `<style>${LOADER_CSS}</style><b>CORE<span>BREACH</span></b><i></i><small>LOADING MAP</small>`;
  container.appendChild(loader);
  let game = null;
  let destroyed = false;
  const timer = setTimeout(() => {
    if (destroyed) return;
    try {
      game = new Game(container, opts);
      destroy.game = game;
      container.__game = game; // handy for automated play-testing
    } catch (e) {
      console.error(e);
      loader.querySelector('small').textContent = 'COULD NOT START THE GAME';
      return;
    }
    setTimeout(() => loader.remove(), 200);
  }, 60);
  function destroy() {
    destroyed = true;
    clearTimeout(timer);
    loader.remove();
    if (game) game.destroy();
  }
  return destroy;
}
