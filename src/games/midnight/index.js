// Midnight Pursuit entry point. GameHub calls mount(container) and keeps the returned cleanup function.
// A loading screen shows while the city is generated.
import { Game } from './game.js';

export const engine = 'three';

const LOADER_CSS = `
.mp-loader{position:absolute;inset:0;background:#000;display:grid;place-content:center;justify-items:center;gap:.6em;font-family:'Chakra Petch','Segoe UI',sans-serif;z-index:20}
.mp-loader .lights{display:flex;gap:.45em}
.mp-loader .lights i{width:3.2em;height:1.2em;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);animation:mpl 1.2s infinite ease-in-out}
.mp-loader .lights i:nth-child(1){background:#6a4cff;animation-delay:0s}
.mp-loader .lights i:nth-child(2){background:#d8d2c8;animation-delay:.2s}
.mp-loader .lights i:nth-child(3){background:#ff3b45;animation-delay:.4s}
.mp-loader b{color:#e8e8e8;letter-spacing:.12em;font-size:1.1em}
@keyframes mpl{0%,100%{filter:brightness(.6)}50%{filter:brightness(1.6) drop-shadow(0 0 10px currentColor)}}`;

export function mount(container, opts = {}) {
  const loader = document.createElement('div');
  loader.className = 'mp-loader';
  loader.innerHTML = `<style>${LOADER_CSS}</style><div class="lights"><i></i><i></i><i></i></div><b>LOADING...</b>`;
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
      loader.querySelector('b').textContent = 'Could not start the game';
      return;
    }
    setTimeout(() => loader.remove(), 250);
  }, 60);
  function destroy() {
    destroyed = true;
    clearTimeout(timer);
    loader.remove();
    if (game) game.destroy();
  }
  return destroy;
}
