// Every game on the site is one entry here.
// To add a game: create src/games/<name>/index.js exporting mount(container, opts) that returns a cleanup
// function, then add an entry below. `load` is a dynamic import so each game is code-split.

export const games = [
  {
    id: 'horde-surge',
    badges: ['3D', 'Phone ready'],
    features: ['Up to 1,400 units per side', 'Gates, crates, barriers and bosses', 'Champions, skins and upgrades', 'Endless levels across five worlds'],
    title: 'Horde Surge',
    genre: 'Action',
    emoji: '💥',
    engine: 'three',
    colors: ['#3fd86b', '#2b8cff'],
    tagline: 'Fire a crowd up the lane, multiply it through gates, smash crates and bosses, and storm the enemy fortress.',
    controls: [
      ['Hold mouse / Space', 'Fire units from the cannon'],
      ['Drag / A D / Arrows', 'Move the cannon'],
      ['C / E or the round button', 'Launch your champion when charged'],
      ['P / Esc', 'Pause'],
      ['Touch', 'Hold and drag anywhere to aim and fire'],
    ],
    size: { width: 1280, height: 720 },
    portrait: true, // plays well on a phone held upright
    load: () => import('./hordesurge/index.js'),
  },
  {
    id: 'core-breach',
    badges: ['3D', 'Online', 'Phone ready'],
    features: ['Eight agents with four abilities each', 'Three maps, buy rounds and the Core', 'Smart bots or online with friends', 'Ranks, missions and weapon skins'],
    title: 'Core Breach',
    genre: 'Shooter',
    emoji: '🎯',
    engine: 'three',
    colors: ['#ff4655', '#0f1923'],
    tagline: 'Tactical 5v5 shooter: eight agents with abilities, buy rounds, plant the Core — vs bots, deathmatch or online.',
    controls: [
      ['W A S D', 'Move (Shift walk, Ctrl or Z crouch, Space jump)'],
      ['Mouse', 'Aim; left click fire, right click zoom/scope'],
      ['R / 1 2 3 / wheel', 'Reload / switch weapon'],
      ['C Q E X', 'Ready an ability, click to use (X = ultimate)'],
      ['F (hold)', 'Plant or defuse the Core'],
      ['B / Tab', 'Buy menu / scoreboard'],
      ['Enter', 'Chat (online)'],
      ['Esc', 'Menu'],
      ['Touch', 'Left stick move, drag right side to look, on-screen buttons'],
    ],
    size: { width: 1280, height: 720 },
    load: () => import('./corebreach/index.js'),
  },
  {
    id: 'midnight-pursuit',
    badges: ['3D', 'Online', 'Open world'],
    features: ['A coastal city to drive anywhere', 'Police pursuits and a rival Blacklist', 'Cars, upgrades and custom paint', 'Free roam and races online'],
    title: 'Midnight Pursuit',
    genre: 'Racing',
    emoji: '🚓',
    engine: 'three',
    colors: ['#ffb000', '#2b1055'],
    tagline: 'Open-world 3D street racing: police pursuits, a Blacklist of rivals, cars and upgrades.',
    controls: [
      ['W A S D / Arrows', 'Drive'],
      ['Space', 'Handbrake / drift'],
      ['Shift / N', 'Nitrous'],
      ['Q / E', 'Speedbreaker (slow motion)'],
      ['C / B', 'Camera / look back'],
      ['M', 'Map and GPS'],
      ['Enter', 'Start event / garage'],
      ['R', 'Reset car'],
      ['Esc / P', 'Pause'],
      ['F', 'Fullscreen'],
      ['Gamepad', 'RT gas, LT brake, A nitrous, B drift, X slow-mo'],
    ],
    size: { width: 1280, height: 720 },
    load: () => import('./midnight/index.js'),
  },
];

export const genres = ['All', ...new Set(games.map((g) => g.genre))];
export const getGame = (id) => games.find((g) => g.id === id);
// cover art lives in public/covers/<id>.jpg
export const coverUrl = (g, base = '/') => `${base}covers/${g.id}.jpg`;
