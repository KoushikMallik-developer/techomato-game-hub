// What the account system knows about each game: where its save lives, how far a save has progressed
// (used to pick the better save when a device and the cloud disagree), which leaderboards it feeds and the
// numbers shown on a profile. Everything is derived from the save the game already writes, so the games
// themselves need no changes.
//
// If you change a board id or cap here, change the same entry in firestore.rules.
const n = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + n(b), 0);

export const ACCOUNT_GAMES = {
  ascendants: {
    title: 'Ascendants',
    key: 'ascendants-save',
    level: (s) => Math.floor(Math.sqrt(n(s.xp) / 120)) + 1,
    progress: (s) => n(s.xp),
    points: (s) => Math.floor(n(s.xp) / 10) + n(s.stats?.wins) * 50,
    boards: [
      { id: 'wins', label: 'Victories', get: (s) => n(s.stats?.wins) },
      { id: 'kills', label: 'Eliminations', get: (s) => n(s.stats?.kills) },
      { id: 'xp', label: 'Total XP', get: (s) => n(s.xp) },
    ],
    summary: (s) => ({ level: Math.floor(Math.sqrt(n(s.xp) / 120)) + 1, matches: n(s.stats?.matches), wins: n(s.stats?.wins), kills: n(s.stats?.kills) }),
  },
  'core-breach': {
    title: 'Core Breach',
    key: 'core-breach-save',
    level: (s) => { let l = 1; let left = n(s.prog?.xp); while (left >= 1000 + 250 * (l - 1)) { left -= 1000 + 250 * (l - 1); l++; } return l; },
    progress: (s) => n(s.prog?.xp),
    points: (s) => Math.floor(n(s.prog?.xp) / 10) + n(s.stats?.wins) * 50,
    boards: [
      { id: 'xp', label: 'Total XP', get: (s) => n(s.prog?.xp) },
      { id: 'wins', label: 'Match wins', get: (s) => n(s.stats?.wins) },
      { id: 'kills', label: 'Kills', get: (s) => n(s.stats?.kills) },
    ],
    summary: (s) => ({ level: ACCOUNT_GAMES['core-breach'].level(s), matches: n(s.stats?.matches), wins: n(s.stats?.wins), kills: n(s.stats?.kills), rank: n(s.prog?.rp) }),
  },
  'horde-surge': {
    title: 'Horde Surge',
    key: 'horde-surge-save',
    level: (s) => Math.max(1, n(s.level)),
    progress: (s) => Math.max(1, n(s.level)) * 1000 + sum(s.stars),
    points: (s) => Math.max(1, n(s.level)) * 100 + sum(s.stars) * 20,
    boards: [
      { id: 'level', label: 'Highest level', get: (s) => Math.max(1, n(s.level)) },
      { id: 'stars', label: 'Stars earned', get: (s) => sum(s.stars) },
      { id: 'kills', label: 'Units that fell in battle', get: (s) => n(s.stats?.kills) },
    ],
    summary: (s) => ({ level: Math.max(1, n(s.level)), stars: sum(s.stars), wins: n(s.stats?.wins), bosses: n(s.stats?.bosses) }),
  },
  'midnight-pursuit': {
    title: 'Midnight Pursuit',
    key: 'gamehub-midnight-pursuit-v1',
    level: (s) => n(s.rank) + 1,
    progress: (s) => n(s.rank) * 10000 + n(s.stats?.racesWon) * 100 + n(s.stats?.pursuits) + (Array.isArray(s.owned) ? s.owned.length : 0) * 50,
    points: (s) => n(s.rank) * 500 + n(s.stats?.racesWon) * 100 + n(s.stats?.takedowns) * 20,
    boards: [
      { id: 'races', label: 'Races won', get: (s) => n(s.stats?.racesWon) },
      { id: 'bounty', label: 'Total bounty', get: (s) => n(s.bountyTotal) },
      { id: 'speed', label: 'Top speed (km/h)', get: (s) => Math.round(n(s.stats?.topSpeed) * 3.6), noWeekly: true },
    ],
    summary: (s) => ({ level: n(s.rank) + 1, races: n(s.stats?.racesWon), takedowns: n(s.stats?.takedowns), cars: Array.isArray(s.owned) ? s.owned.length : 0 }),
  },
};

export const GLOBAL_BOARD = 'global_points';

// every board as a flat list: { id: 'ascendants_wins', game, label, ... } plus the global one
export function allBoards() {
  const out = [{ id: GLOBAL_BOARD, game: null, label: 'Hub points', noWeekly: false }];
  Object.entries(ACCOUNT_GAMES).forEach(([game, g]) => g.boards.forEach((b) => out.push({ ...b, id: `${game}_${b.id}`, game })));
  return out;
}

export function boardsFor(game) {
  if (!game) return [{ id: GLOBAL_BOARD, game: null, label: 'Hub points' }];
  return ACCOUNT_GAMES[game].boards.map((b) => ({ ...b, id: `${game}_${b.id}`, game }));
}

export function readLocalSave(game) {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_GAMES[game].key) || 'null'); } catch { return null; }
}
