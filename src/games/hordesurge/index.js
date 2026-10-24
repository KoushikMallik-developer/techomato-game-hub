// Horde Surge entry point. GameHub calls mount(container) and keeps the returned cleanup function.
import { Game } from './game.js';

export const engine = 'three';

const LOADER_CSS = `
.hs-loader{position:absolute;inset:0;background:linear-gradient(#7ec8ff,#d9f0ff);display:grid;place-content:center;justify-items:center;gap:.8em;font-family:"Lilita One","Arial Black",system-ui,sans-serif;z-index:20;color:#fff}
.hs-loader .dots{display:flex;gap:.5em}
.hs-loader .dots i{width:1.4em;height:1.4em;border-radius:50% 50% 45% 45%;background:#3fd86b;box-shadow:inset 0 -.25em 0 rgba(0,0,0,.18);animation:hsl .7s infinite ease-in-out}
.hs-loader .dots i:nth-child(2){animation-delay:.12s}.hs-loader .dots i:nth-child(3){animation-delay:.24s}
.hs-loader b{letter-spacing:.1em;font-size:1.2em;text-shadow:0 2px 0 rgba(0,0,0,.25)}
@keyframes hsl{50%{transform:translateY(-.7em) scaleY(1.1)}}`;

export function mount(container, opts = {}) {
  const loader = document.createElement('div');
  loader.className = 'hs-loader';
  loader.innerHTML = `<style>${LOADER_CSS}</style><div class="dots"><i></i><i></i><i></i></div><b>LOADING...</b>`;
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
