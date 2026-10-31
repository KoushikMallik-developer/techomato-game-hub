// Horde Surge entry point. GameHub calls mount(container) and keeps the returned cleanup function.
import { Game } from './game.js';
import { loadAll } from './assets.js';
import { loadSave, PETS, SKINS } from './data.js';
import { WEAPONS } from './weapons.js';

// models the first screen needs (bosses load when their level does); see public/models/hordesurge
const PRELOAD = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'Bush_1', 'Flowers', 'Rock_Moss_1', 'Rock_Moss_4',
  'PineTree_Snow_1', 'PineTree_Snow_3', 'CommonTree_Snow_4', 'Bush_Snow_1', 'Rock_Snow_2',
  'PalmTree_1', 'PalmTree_2', 'Cactus_1', 'Cactus_3', 'Cactus_4', 'CactusFlowers_2',
  'Barrel', 'Crate', 'Cart', 'Bonfire_Lit', 'Coin', 'Chest_Closed', 'Chest_Open', 'Crown', 'Bull', 'KnightCharacter',
];

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
  const label = loader.querySelector('b');
  const save = loadSave();
  const pet = PETS.find((p) => p.id === save.pet);
  const weapon = WEAPONS.find((w) => w.id === save.weapon && w.model);
  const skin = SKINS.find((k) => k.id === save.skin && k.model);
  // wait for the models (at most 12 s; anything missing falls back to the procedural look)
  const models = Promise.race([
    loadAll([...PRELOAD, ...(pet ? [pet.model] : []), ...(weapon ? [weapon.model] : []), ...(skin ? [skin.model] : [])], (k) => { label.textContent = `LOADING ${Math.round(k * 100)}%`; }),
    new Promise((r) => setTimeout(r, 12000)),
  ]);
  const timer = setTimeout(async () => {
    await models;
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
