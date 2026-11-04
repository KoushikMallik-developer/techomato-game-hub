// Tomatoku entry point. GameHub calls mount(container) and keeps the returned cleanup function.
import { Game } from './game.js';

export const engine = 'canvas';

export function mount(container, opts = {}) {
  const game = new Game(container, opts);
  return function destroy() { game.destroy(); };
}
