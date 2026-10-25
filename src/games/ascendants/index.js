// Ascendants entry point. GameHub calls mount(container) and keeps the returned cleanup function.
import { Game } from './game.js';

export const engine = 'three';

const LOADER_CSS = `
.ascl{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,#1d2f6b,#070b1c);display:grid;place-content:center;justify-items:center;gap:1em;font-family:Unbounded,Manrope,system-ui,sans-serif;z-index:20;color:#fff}
.ascl b{font-size:2.4em;font-weight:800;letter-spacing:.06em;background:linear-gradient(180deg,#fff,#ffd166 60%,#ff9a2e);-webkit-background-clip:text;background-clip:text;color:transparent}
.ascl i{display:block;width:12em;height:3px;background:#ffffff22;overflow:hidden;position:relative;border-radius:2px}
.ascl i:after{content:'';position:absolute;left:-40%;top:0;bottom:0;width:40%;background:#ffd166;animation:ascl 1s infinite ease-in-out}
.ascl small{letter-spacing:.3em;opacity:.7;font-family:Manrope,sans-serif;font-weight:700}
@keyframes ascl{to{left:100%}}`;

export function mount(container, opts = {}) {
  const loader = document.createElement('div');
  loader.className = 'ascl';
  loader.innerHTML = `<style>${LOADER_CSS}</style><b>ASCENDANTS</b><i></i><small>RAISING THE ISLAND</small>`;
  container.appendChild(loader);
  let game = null;
  let destroyed = false;
  const timer = setTimeout(() => {
    if (destroyed) return;
    try {
      game = new Game(container, opts);
      destroy.game = game;
    } catch (e) {
      console.error(e);
      loader.querySelector('small').textContent = 'COULD NOT START THE GAME';
      return;
    }
    setTimeout(() => loader.remove(), 250);
  }, 80);
  function destroy() {
    destroyed = true;
    clearTimeout(timer);
    loader.remove();
    if (game) game.destroy();
  }
  return destroy;
}
