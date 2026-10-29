// Site-wide achievements. Each test gets the per-game summaries known for the account
// ({ 'ascendants': { level, wins, kills, ... }, ... }) and the total hub points.
const g = (s, id, k) => (s[id] && s[id][k]) || 0;

export const ACHIEVEMENTS = [
  { id: 'welcome', name: 'Welcome aboard', desc: 'Sync progress from any game to your account', icon: 'gamepad', test: (s) => Object.keys(s).length > 0 },
  { id: 'all-rounder', name: 'All-rounder', desc: 'Play all four games while signed in', icon: 'globe', test: (s) => ['ascendants', 'core-breach', 'horde-surge', 'midnight-pursuit'].every((id) => s[id]) },
  { id: 'asc-victor', name: 'Last one standing', desc: 'Win an Ascendants match', icon: 'bolt', test: (s) => g(s, 'ascendants', 'wins') >= 1 },
  { id: 'asc-slayer', name: 'Ki master', desc: '100 eliminations in Ascendants', icon: 'bolt', test: (s) => g(s, 'ascendants', 'kills') >= 100 },
  { id: 'asc-10', name: 'Rising warrior', desc: 'Reach level 10 in Ascendants', icon: 'bolt', test: (s) => g(s, 'ascendants', 'level') >= 10 },
  { id: 'cb-win', name: 'Core secured', desc: 'Win a Core Breach match', icon: 'key', test: (s) => g(s, 'core-breach', 'wins') >= 1 },
  { id: 'cb-sharp', name: 'Sharpshooter', desc: '250 kills in Core Breach', icon: 'key', test: (s) => g(s, 'core-breach', 'kills') >= 250 },
  { id: 'cb-10', name: 'Veteran agent', desc: 'Reach level 10 in Core Breach', icon: 'key', test: (s) => g(s, 'core-breach', 'level') >= 10 },
  { id: 'hs-10', name: 'Crowd pleaser', desc: 'Reach level 10 in Horde Surge', icon: 'users', test: (s) => g(s, 'horde-surge', 'level') >= 10 },
  { id: 'hs-25', name: 'Horde master', desc: 'Reach level 25 in Horde Surge', icon: 'users', test: (s) => g(s, 'horde-surge', 'level') >= 25 },
  { id: 'hs-stars', name: 'Star collector', desc: 'Earn 100 stars in Horde Surge', icon: 'users', test: (s) => g(s, 'horde-surge', 'stars') >= 100 },
  { id: 'mp-racer', name: 'First win', desc: 'Win a race in Midnight Pursuit', icon: 'globe', test: (s) => g(s, 'midnight-pursuit', 'races') >= 1 },
  { id: 'mp-champ', name: 'Street champion', desc: 'Win 25 races in Midnight Pursuit', icon: 'globe', test: (s) => g(s, 'midnight-pursuit', 'races') >= 25 },
  { id: 'mp-blacklist', name: 'Blacklist climber', desc: 'Beat three Blacklist rivals', icon: 'globe', test: (s) => g(s, 'midnight-pursuit', 'level') >= 4 },
  { id: 'hub-1k', name: 'Getting serious', desc: 'Earn 1,000 hub points', icon: 'bolt', test: (s, pts) => pts >= 1000 },
  { id: 'hub-10k', name: 'Hub legend', desc: 'Earn 10,000 hub points', icon: 'bolt', test: (s, pts) => pts >= 10000 },
];

export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ids of the achievements earned by these summaries
export function earned(summaries, points) {
  return ACHIEVEMENTS.filter((a) => { try { return a.test(summaries, points); } catch { return false; } }).map((a) => a.id);
}
