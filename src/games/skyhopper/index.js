// Sky Hopper entry point. GameHub calls mount(container) and keeps the returned cleanup function.
// Scenery models are the Horde Surge ones (public/models/hordesurge, CC0); they're optional, the game has fallbacks.
import { Game, PRELOAD } from './game.js';
import { loadAll } from '../hordesurge/assets.js';

export const engine = 'three';

export function mount(container, opts = {}) {
  const loader = document.createElement('div');
  loader.style.cssText = 'position:absolute;inset:0;background:linear-gradient(#7ec8ff,#d9f0ff);display:grid;place-content:center;color:#fff;font:1.3em "Lilita One","Arial Black",system-ui,sans-serif;letter-spacing:.1em;z-index:20;text-shadow:0 2px 0 rgba(0,0,0,.25)';
  loader.textContent = 'LOADING...';
  container.appendChild(loader);
  let game = null; let destroyed = false;
  Promise.race([loadAll(PRELOAD), new Promise((r) => setTimeout(r, 8000))]).then(() => {
    if (destroyed) return;
    try { game = new Game(container, opts); } catch (e) { console.error(e); loader.textContent = 'Could not start the game'; return; }
    setTimeout(() => loader.remove(), 200);
  });
  return function destroy() { destroyed = true; loader.remove(); if (game) game.destroy(); };
}
