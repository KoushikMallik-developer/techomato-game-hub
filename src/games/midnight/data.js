// Midnight Pursuit: shared constants, helpers, game data tables and save system.
// The city itself (roads, districts, terrain) is generated in city.js.

export const CAR_R = 2.1; // collision radius of every car
export const SAVE_KEY = 'gamehub-midnight-pursuit-v1';

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
export const headingTo = (dx, dz) => Math.atan2(dx, dz); // heading 0 = +z, forward = (sin h, cos h)

// ───────────── cars ─────────────
// top: top speed (m/s), accel: m/s² off the line, handling: grip/steering multiplier,
// nitro: seconds of boost, req: blacklist rivals you must beat before you can buy it.
export const CARS = [
  { id: 'kestrel', name: 'Kestrel GT', cls: 'D', price: 0, req: 0, top: 56, accel: 13, handling: 1.0, nitro: 3.0, color: '#c8322a', style: 'coupe', blurb: 'A light rear-drive coupe. Forgiving and eager.' },
  { id: 'vanta', name: 'Vanta RS', cls: 'C', price: 14000, req: 0, top: 61, accel: 15, handling: 1.12, nitro: 3.2, color: '#e8e8e8', style: 'hatch', blurb: 'Turbo hot hatch that loves tight downtown corners.' },
  { id: 'brigand', name: 'Brigand V8', cls: 'C', price: 22000, req: 2, top: 65, accel: 16.5, handling: 0.92, nitro: 3.8, color: '#1d1e24', style: 'muscle', blurb: 'Big-block muscle. Brutal in a straight line, heavy in the bends.' },
  { id: 'sable', name: 'Sable GT', cls: 'B', price: 31000, req: 3, top: 67, accel: 16.5, handling: 1.15, nitro: 3.5, color: '#1f4d3a', style: 'gt', blurb: 'Long-nosed grand tourer. Stable at speed, smooth through sweepers.' },
  { id: 'tundra', name: 'Tundra Evo', cls: 'B', price: 36000, req: 4, top: 66, accel: 17.5, handling: 1.3, nitro: 3.4, color: '#2d6cdf', style: 'rally', blurb: 'All-wheel-drive rally weapon with outstanding grip.' },
  { id: 'corsair', name: 'Corsair SS', cls: 'A', price: 52000, req: 5, top: 72, accel: 19.5, handling: 1.02, nitro: 4.4, color: '#b3121c', style: 'muscle', blurb: 'Supercharged modern muscle. Huge nitrous, wants a firm hand.' },
  { id: 'nightfall', name: 'Nightfall SV', cls: 'A', price: 65000, req: 6, top: 75, accel: 20, handling: 1.18, nitro: 3.8, color: '#f2b705', style: 'super', blurb: 'Mid-engine V12 supercar. Serious speed.' },
  { id: 'vortex', name: 'Vortex R', cls: 'A', price: 88000, req: 7, top: 76, accel: 21, handling: 1.36, nitro: 3.6, color: '#e8e8e8', style: 'track', blurb: 'Road-legal track car. Massive downforce, corners like it is on rails.' },
  { id: 'phantom', name: 'Phantom X', cls: 'S', price: 120000, req: 7, top: 84, accel: 23, handling: 1.25, nitro: 4.2, color: '#7a2cff', style: 'hyper', blurb: 'Hypercar prototype. The fastest thing in the city.' },
  { id: 'zenith', name: 'Zenith EV', cls: 'S', price: 160000, req: 8, top: 88, accel: 26, handling: 1.28, nitro: 4.0, color: '#0ec2c2', style: 'hyper', electric: true, blurb: 'Quad-motor electric hyper GT. Instant torque, silent and savage. Beat the whole Blacklist to buy it.' },
];
export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

export const UPGRADES = [
  { key: 'engine', name: 'Engine', desc: 'Top speed and acceleration' },
  { key: 'nitro', name: 'Nitrous', desc: 'Bigger tank, stronger boost' },
  { key: 'handling', name: 'Suspension & Tires', desc: 'Grip and steering response' },
];
const CLASS_COST = { D: 1, C: 1.3, B: 1.7, A: 2.3, S: 3 };
export const upgradeCost = (car, level) => Math.round([2000, 4500, 8000][level] * CLASS_COST[car.cls] / 100) * 100;

export const PAINTS = ['#c8322a', '#e8e8e8', '#1d1e24', '#2d6cdf', '#f2b705', '#7a2cff', '#17a66b', '#ff6a00', '#ff2d95', '#5f7484'];

export function carStats(def, up = {}) {
  const e = up.engine || 0;
  const n = up.nitro || 0;
  const h = up.handling || 0;
  return {
    top: def.top * (1 + 0.045 * e),
    accel: def.accel * 0.85 * (1 + 0.08 * e),
    grip: 7.5 * def.handling * (1 + 0.08 * h),
    steer: 2.1 * def.handling * (1 + 0.06 * h),
    nitroCap: def.nitro * (1 + 0.25 * n),
    nitroPower: 1.5 + 0.1 * n,
    brake: 30,
    mass: def.style === 'muscle' ? 1.25 : 1,
  };
}

export const COP_TIERS = [
  { name: 'Patrol', top: 57, accel: 14, handling: 1.0, mass: 1.2, style: 'sedan' },
  { name: 'Interceptor', top: 68, accel: 17, handling: 1.1, mass: 1.3, style: 'sedan' },
  { name: 'Rhino', top: 64, accel: 16, handling: 0.95, mass: 2.4, style: 'suv' },
];

// ───────────── events & blacklist ─────────────
// Routes are waypoints on the map (x, z in metres); the race follows the fastest roads between them.
export const EVENTS = [
  { id: 'e1', name: 'Harbor Run', type: 'sprint', route: [[-760, -60], [-200, 120], [350, 380], [560, 640]], reward: 3000 },
  { id: 'e2', name: 'Downtown Loop', type: 'circuit', route: [[-100, 0], [150, -100], [250, 150], [0, 230]], laps: 2, reward: 3500 },
  { id: 'e3', name: 'Ocean Trap', type: 'speedtrap', route: [[-1000, 820], [-500, 840], [0, 820], [250, 650]], target: 560, reward: 3000 },
  { id: 'e4', name: 'Ridge Tollbooth', type: 'tollbooth', route: [[-1000, -680], [-760, -520], [-600, -770], [-380, -700], [-330, -430]], reward: 3500 },
  { id: 'e5', name: 'Highway Kings', type: 'sprint', route: [[-1060, 300], [-1060, -560], [-500, -1040], [300, -1010], [940, -700]], reward: 5000 },
  { id: 'e6', name: 'Heat Wave', type: 'pursuit', marker: [80, -150], bountyTarget: 6000, reward: 5000 },
  { id: 'e7', name: 'Industrial Ring', type: 'circuit', route: [[560, -700], [800, -560], [700, -420], [480, -560]], laps: 3, reward: 5500 },
  { id: 'e8', name: 'Midnight Express', type: 'sprint', route: [[330, -990], [300, -300], [-90, 585], [-500, 560]], reward: 6500 },
  { id: 'e9', name: 'Main Street Trap', type: 'speedtrap', route: [[-372, -760], [-350, -300], [-335, 100], [-310, 540]], target: 600, reward: 6000 },
  { id: 'e10', name: 'Cross-Town Toll', type: 'tollbooth', route: [[-800, 300], [-400, 0], [0, -400], [500, -100], [800, 100]], reward: 6000 },
  { id: 'e11', name: 'Dockside Drift', type: 'drift', route: [[800, -560], [700, -420], [480, -560], [560, -700]], laps: 2, target: 30000, reward: 4500 },
  { id: 'e12', name: 'Ridge Drift', type: 'drift', route: [[-380, -700], [-600, -770], [-760, -520], [-1000, -680]], target: 25000, reward: 5000 },
  { id: 'e13', name: 'Coastal Time Trial', type: 'timetrial', route: [[560, 640], [250, 650], [0, 820], [-500, 840], [-1000, 820]], pace: 36, reward: 4500 },
  { id: 'e14', name: 'Rush Hour Trial', type: 'timetrial', route: [[-90, 585], [300, -300], [330, -990]], pace: 37, reward: 6000 },
  { id: 'e15', name: 'Downtown Knockout', type: 'knockout', route: [[250, 150], [0, 230], [-100, 0], [150, -100]], laps: 3, reward: 7000 },
  { id: 'e16', name: 'Industrial Knockout', type: 'knockout', route: [[700, -420], [480, -560], [560, -700], [800, -560]], laps: 3, reward: 8000 },
];
export const EVENT_LABEL = { sprint: 'Sprint', circuit: 'Circuit', speedtrap: 'Speed Trap', tollbooth: 'Tollbooth', pursuit: 'Pursuit', rival: 'Blacklist', drift: 'Drift', timetrial: 'Time Trial', knockout: 'Knockout' };
export const SAFEHOUSE = [560, 40];

export const RIVALS = [
  { rank: 8, name: 'Tommy "Wrench" Hale', car: 'vanta', color: '#9be15d', events: 1, bounty: 1500, skill: 0.9, reward: 6000, route: [[-760, -60], [-200, 120], [350, 380]] },
  { rank: 7, name: 'Lena "Spark" Ortiz', car: 'sable', color: '#ffd166', events: 2, bounty: 2500, skill: 0.93, reward: 8000, route: [[-100, 0], [150, -100], [250, 150], [0, 230], [-300, 450]] },
  { rank: 6, name: 'Viktor "Bulldog" Brandt', car: 'brigand', color: '#c0c0c0', events: 3, bounty: 4000, skill: 0.95, reward: 11000, route: [[560, -700], [800, -560], [700, -420], [300, -300], [-90, 585]] },
  { rank: 5, name: 'Dax "Static" Moreno', car: 'vanta', color: '#00d1ff', events: 4, bounty: 5000, skill: 0.95, reward: 10000, route: [[-900, 200], [-500, -100], [-100, -300], [200, -600]] },
  { rank: 4, name: 'Mira "Vixen" Kade', car: 'brigand', color: '#ff2d55', events: 6, bounty: 9000, skill: 0.98, reward: 18000, route: [[700, 100], [400, 0], [100, 300], [-300, 450], [-700, 650]] },
  { rank: 3, name: 'Kenji "Ronin" Arai', car: 'tundra', color: '#f4f4f4', events: 8, bounty: 15000, skill: 1.0, reward: 26000, route: [[-1000, -680], [-700, -520], [-500, -470], [-380, -700], [-640, -1000], [-1010, -920]] },
  { rank: 2, name: 'Sasha "Blitz" Volkova', car: 'nightfall', color: '#ff8800', events: 10, bounty: 25000, skill: 1.02, reward: 40000, route: [[940, -440], [600, -360], [0, 0], [-560, 250], [-985, 410], [-1060, -160]] },
  { rank: 1, name: '"Ghost"', car: 'phantom', color: '#15151a', events: 12, bounty: 40000, skill: 1.04, reward: 75000, route: [[-1000, 800], [0, 820], [300, 540], [330, -990], [-500, -1040], [-1060, -160], [-700, 0], [100, -150]] },
];

export const RACER_NAMES = ['Rook', 'Jinx', 'Mako', 'Vega', 'Kilo', 'Nova', 'Rex', 'Blaze', 'Echo', 'Zed'];
export const HEAT_BOUNTY = [0, 0, 2500, 7000, 15000, 30000]; // bounty needed for heat level n
export const COPS_FOR_HEAT = [0, 2, 3, 4, 6, 7];

// ───────────── time of day ─────────────
export const TOD = {
  overcast: {
    label: 'Overcast', sky: ['#5f5c60', '#9a8f86', '#c4b39c'], fog: '#9c968b', fogNear: 110, fogFar: 1350,
    hemi: ['#ddd2c4', '#4d4439', 1.05], sun: ['#ffe2bd', 2.2], sunDir: [0.663, 0.574, 0.482],
    clouds: { cover: 0.72, lit: '#e3d3bd', dark: '#4b4642' },
    windows: 0.25, lamps: 0.15, headlights: false, stars: false, exposure: 0.62, hdriHemi: 0.18, skyGain: 1.0,
  },
  night: {
    label: 'Night', sky: ['#02030a', '#0b1230', '#1d2446'], fog: '#0b1024', fogNear: 80, fogFar: 900,
    hemi: ['#5262a0', '#0a0a14', 0.45], sun: ['#9fb4ff', 0.35], sunDir: [-0.5, 0.7, -0.3],
    clouds: { cover: 0.45, lit: '#3d3442', dark: '#07080d' },
    windows: 1.15, lamps: 1.0, headlights: true, stars: true, exposure: 0.8, hdriHemi: 0.6, envScale: 0.35,
  },
  sunset: {
    label: 'Sunset', sky: ['#2a1b4a', '#c4547a', '#ffb36b'], fog: '#b9707a', fogNear: 120, fogFar: 1250,
    hemi: ['#ffd1b0', '#3a2a40', 0.85], sun: ['#ffb070', 2.4], sunDir: [0.802, 0.133, 0.583],
    clouds: { cover: 0.45, lit: '#ffb98a', dark: '#5b3c4a' },
    windows: 0.5, lamps: 0.45, headlights: true, stars: false, exposure: 0.55, hdriHemi: 0.2, skyGain: 1.1,
  },
  day: {
    label: 'Day', sky: ['#3d7fd6', '#8fc0f0', '#dbe9f5'], fog: '#c4d8ea', fogNear: 180, fogFar: 1700,
    hemi: ['#ffffff', '#556070', 1.25], sun: ['#fff4e0', 3.0], sunDir: [0.477, 0.734, 0.482],
    windows: 0.0, lamps: 0.0, headlights: false, stars: false, exposure: 0.5, hdriHemi: 0.18, skyGain: 1.0,
  },
};

// ───────────── save ─────────────
export function defaultSave() {
  return {
    money: 6000,
    owned: ['kestrel'],
    car: 'kestrel',
    upg: {},
    paint: {},
    carHeat: {},
    done: {},
    rank: 0, // blacklist rivals beaten
    bountyTotal: 0,
    stats: { pursuits: 0, evaded: 0, busted: 0, takedowns: 0, topSpeed: 0, racesWon: 0, bestDrift: 0, nearMisses: 0, distance: 0, maxHeat: 0, longestPursuit: 0 },
    custom: {}, // per car: { finish, rim, caliper, glow }
    cams: {}, // speed camera bests (km/h)
    milestones: {},
    version: 2,
    settings: { quality: 'medium', tod: 'overcast', rain: false, units: 'kmh', volume: 70, shake: true, style: 'rockport', blur: true, dynRes: true },
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      ...base,
      ...s,
      stats: { ...base.stats, ...(s.stats || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
      // older saves had a 5-rival Blacklist: three easier rivals were added in front of them
      rank: (s.version || 1) < 2 ? (s.rank || 0) + (s.rank ? 3 : 0) : s.rank || 0,
      version: 2,
    };
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

// ───────────── speed cameras around the city ─────────────
// x, z on a road; target in km/h earns a one-time bonus
export const SPEED_CAMS = [
  { id: 'c1', name: 'Ocean Boulevard', x: -500, z: 840, target: 230, reward: 2000 },
  { id: 'c2', name: 'Ring Highway West', x: -1060, z: -100, target: 260, reward: 2500 },
  { id: 'c3', name: 'Harbor Gate', x: -200, z: 120, target: 180, reward: 1500 },
  { id: 'c4', name: 'Main Street', x: -350, z: -300, target: 200, reward: 2000 },
  { id: 'c5', name: 'Industrial Way', x: 700, z: -420, target: 190, reward: 1500 },
  { id: 'c6', name: 'Expressway North', x: 300, z: -1010, target: 270, reward: 3000 },
  { id: 'c7', name: 'Midtown Avenue', x: 150, z: -100, target: 170, reward: 1500 },
  { id: 'c8', name: 'Hillside Pass', x: -760, z: -520, target: 180, reward: 2000 },
];

// ───────────── milestones ─────────────
export const MILESTONES = [
  { id: 'm1', name: 'First Blood', desc: 'Win a race', test: (s) => s.stats.racesWon >= 1, reward: 1500 },
  { id: 'm2', name: 'Hot Wheels', desc: 'Reach 250 km/h', test: (s) => s.stats.topSpeed * 3.6 >= 250, reward: 2500 },
  { id: 'm3', name: 'Ton Up', desc: 'Reach 300 km/h', test: (s) => s.stats.topSpeed * 3.6 >= 300, reward: 6000 },
  { id: 'm4', name: 'Ghost Rider', desc: 'Evade the police 5 times', test: (s) => s.stats.evaded >= 5, reward: 4000 },
  { id: 'm5', name: 'Wrecking Crew', desc: 'Take down 10 police cars', test: (s) => s.stats.takedowns >= 10, reward: 5000 },
  { id: 'm6', name: 'Sideways', desc: 'Score a 10,000 drift', test: (s) => s.stats.bestDrift >= 10000, reward: 3000 },
  { id: 'm7', name: 'Threading the Needle', desc: '50 near misses', test: (s) => s.stats.nearMisses >= 50, reward: 3000 },
  { id: 'm8', name: 'Road Trip', desc: 'Drive 100 km', test: (s) => s.stats.distance >= 100000, reward: 5000 },
  { id: 'm9', name: 'Most Wanted', desc: 'Reach heat level 5', test: (s) => s.stats.maxHeat >= 5, reward: 6000 },
  { id: 'm10', name: 'Public Enemy', desc: 'Earn 100,000 total bounty', test: (s) => s.bountyTotal >= 100000, reward: 10000 },
  { id: 'm11', name: 'Camera Shy', desc: 'Beat the target on every speed camera', test: (s) => SPEED_CAMS.every((c) => (s.cams[c.id] || 0) >= c.target), reward: 12000 },
  { id: 'm12', name: 'Collector', desc: 'Own 5 cars', test: (s) => s.owned.length >= 5, reward: 8000 },
  { id: 'm13', name: 'Event Master', desc: 'Win every event', test: (s) => EVENTS.every((e) => s.done[e.id]), reward: 20000 },
  { id: 'm14', name: 'Blacklist Champion', desc: 'Beat every Blacklist rival', test: (s) => s.rank >= RIVALS.length, reward: 30000 },
  { id: 'm15', name: 'Marathon Chase', desc: 'Survive a 3-minute pursuit', test: (s) => s.stats.longestPursuit >= 180, reward: 5000 },
  { id: 'm16', name: 'Tuner', desc: 'Max out every upgrade on one car', test: (s) => Object.values(s.upg).some((u) => (u.engine || 0) + (u.nitro || 0) + (u.handling || 0) >= 9), reward: 4000 },
];

// visual customization
export const FINISHES = [['gloss', 'Gloss'], ['metallic', 'Metallic'], ['matte', 'Matte'], ['pearl', 'Pearl']];
export const RIM_FINISHES = [['silver', 'Silver'], ['gunmetal', 'Gunmetal'], ['black', 'Black'], ['gold', 'Gold']];
export const CALIPERS = [[0, 'Red'], [1, 'Yellow'], [2, 'Blue'], [3, 'Black']];
export const UNDERGLOW = [[null, 'Off'], ['#00e5ff', 'Cyan'], ['#ff2d95', 'Pink'], ['#7a2cff', 'Purple'], ['#39e27d', 'Green'], ['#ffb000', 'Amber']];
