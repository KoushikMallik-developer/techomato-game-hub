// Cloud saves and score publishing. The games keep reading and writing their own localStorage save; this
// module copies it to users/{uid}/saves/{game} and back:
//   hydrateGame(game)  before a game starts: pick the better of this device's save and the cloud's
//   pushGame(game)     afterwards (every few minutes, when the tab hides, when the game closes): upload the save,
//                      refresh the profile summary and achievements, update the leaderboards
// "Better" means more progress (see ACCOUNT_GAMES[game].progress). The save that loses is kept in
// localStorage under `<key>__backup`. A local save that belongs to a different account (shared computer)
// is never uploaded: it is set aside and replaced by the signed-in account's cloud save.
import { fb, accountsEnabled } from './firebase.js';
import { ACCOUNT_GAMES, GLOBAL_BOARD, boardsFor } from './games.js';
import { earned } from './achievements.js';
import { currentWeek, submitScore } from './leaderboard.js';

const OWNER_KEY = 'gamehub-save-owner';
const MAX_SAVE_CHARS = 180000;
const HINT_KEY = 'gamehub-acct';
const lastPushed = {};
const cloudProgress = {}; // best progress known to be in the cloud, per game
const hydrated = {}; // `${uid}:${game}` once this session has reconciled the local and cloud save

// set by the account provider so signed-out visitors never load Firebase just to start a game
export function setSignedInHint(on) { try { if (on) localStorage.setItem(HINT_KEY, '1'); else localStorage.removeItem(HINT_KEY); } catch { /* storage blocked */ } }
const hinted = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } };

// ── tiny status feed for the UI ──
let state = { status: 'idle', at: 0, error: '' };
const subs = new Set();
const setState = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };
export const syncState = () => state;
export function onSyncState(fn) { subs.add(fn); return () => subs.delete(fn); }

const owners = () => { try { return JSON.parse(localStorage.getItem(OWNER_KEY) || '{}') || {}; } catch { return {}; } };
const setOwner = (game, uid) => { try { const o = owners(); if (uid) o[game] = uid; else delete o[game]; localStorage.setItem(OWNER_KEY, JSON.stringify(o)); } catch { /* storage blocked */ } };
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

async function currentUser() {
  const { auth } = await fb();
  await auth.authStateReady();
  return auth.currentUser;
}

export async function hydrateGame(game) {
  const def = ACCOUNT_GAMES[game];
  if (!def || !accountsEnabled || !hinted()) return;
  try {
    const user = await currentUser();
    if (!user) return;
    setState({ status: 'syncing', error: '' });
    const { db, fs } = await fb();
    const snap = await fs.getDoc(fs.doc(db, 'users', user.uid, 'saves', game));
    const raw = localStorage.getItem(def.key);
    const local = parse(raw);
    const owner = owners()[game];
    const foreign = !!(raw && owner && owner !== user.uid);
    if (foreign) { try { localStorage.setItem(`${def.key}__backup`, raw); } catch { /* full */ } }
    const lp = local && !foreign ? def.progress(local) : 0;
    hydrated[`${user.uid}:${game}`] = true; // set first: the pushes below must not re-enter this function
    if (snap.exists()) {
      const c = snap.data();
      if (c.progress > lp || foreign) {
        if (raw && !foreign && lp > 0) { try { localStorage.setItem(`${def.key}__backup`, raw); } catch { /* full */ } }
        localStorage.setItem(def.key, c.json);
        lastPushed[game] = c.json;
        cloudProgress[game] = c.progress;
      } else if (lp > c.progress) {
        await pushGame(game, { force: true });
      } else {
        cloudProgress[game] = c.progress;
        setOwner(game, user.uid);
      }
    } else if (foreign) {
      localStorage.removeItem(def.key); // a stranger's save on this computer: start this account fresh
    } else if (local) {
      await pushGame(game, { force: true });
    }
    setOwner(game, user.uid);
    setState({ status: 'synced', at: Date.now() });
  } catch (e) {
    Object.keys(hydrated).forEach((k) => { if (k.endsWith(`:${game}`)) delete hydrated[k]; });
    console.warn('[sync] hydrate failed', e);
    setState({ status: 'error', error: e.code || e.message || 'sync failed' });
  }
}

export async function pushGame(game, { force = false } = {}) {
  const def = ACCOUNT_GAMES[game];
  if (!def || !accountsEnabled || !hinted()) return;
  try {
    const user = await currentUser();
    if (!user) return;
    // signed in while the game was already running: reconcile with the cloud before uploading anything
    if (!hydrated[`${user.uid}:${game}`]) { await hydrateGame(game); if (!hydrated[`${user.uid}:${game}`]) return; }
    const raw = localStorage.getItem(def.key);
    if (!raw || raw.length > MAX_SAVE_CHARS) return;
    if (!force && raw === lastPushed[game]) return;
    const owner = owners()[game];
    if (owner && owner !== user.uid) return;
    const save = parse(raw);
    if (!save) return;
    const progress = def.progress(save);
    // never replace a cloud save that is further along (e.g. this device's save is older)
    if (cloudProgress[game] !== undefined && progress < cloudProgress[game]) return;
    setState({ status: 'syncing', error: '' });
    const { db, fs } = await fb();
    await fs.setDoc(fs.doc(db, 'users', user.uid, 'saves', game), { json: raw, progress, updatedAt: fs.serverTimestamp() });
    lastPushed[game] = raw;
    cloudProgress[game] = progress;
    setOwner(game, user.uid);
    await publishStats(user, game, save);
    setState({ status: 'synced', at: Date.now() });
  } catch (e) {
    console.warn('[sync] push failed', e);
    setState({ status: 'error', error: e.code || e.message || 'sync failed' });
  }
}

// profile summary + achievements + every board this game feeds (all-time and this week)
async function publishStats(user, game, save) {
  const { db, fs } = await fb();
  const def = ACCOUNT_GAMES[game];
  const uref = fs.doc(db, 'users', user.uid);
  const usnap = await fs.getDoc(uref);
  if (!usnap.exists()) return;
  const profile = usnap.data();

  const summary = { ...(profile.summary || {}), [game]: def.summary(save) };
  const pointsMap = { ...(profile.points || {}), [game]: def.points(save) };
  const total = Object.values(pointsMap).reduce((a, b) => a + b, 0);
  const have = new Set(Object.keys(profile.achievements || {}));
  const fresh = earned(summary, total).filter((id) => !have.has(id));
  const upd = [new fs.FieldPath('summary', game), summary[game], new fs.FieldPath('points', game), pointsMap[game], 'lastSeen', fs.serverTimestamp()];
  fresh.forEach((id) => upd.push(new fs.FieldPath('achievements', id), Date.now()));
  await fs.updateDoc(uref, ...upd);

  // weekly boards count progress since the start of the week, measured against the last values seen
  const pref = fs.doc(db, 'users', user.uid, 'private', 'weekly');
  const psnap = await fs.getDoc(pref);
  const week = currentWeek();
  const prev = psnap.exists() ? psnap.data() : { period: week, base: {}, last: {} };
  const base = prev.period === week ? { ...prev.base } : { ...prev.last };
  const last = { ...prev.last };

  const boards = boardsFor(game).map((b) => ({ id: b.id, value: b.get(save), noWeekly: b.noWeekly }));
  boards.push({ id: GLOBAL_BOARD, value: total });
  for (const b of boards) {
    if (base[b.id] === undefined) base[b.id] = b.value;
    if (last[b.id] === b.value) continue;
    if (b.value <= 0) { last[b.id] = b.value; continue; }
    let ok = await submitScore(user, profile, b.id, 'all', b.value);
    const gain = b.value - base[b.id];
    if (!b.noWeekly && gain > 0) ok = (await submitScore(user, profile, b.id, week, gain)) && ok;
    if (ok) last[b.id] = b.value; // a rejected or rate-limited update is retried on the next push
  }
  await fs.setDoc(pref, { period: week, base, last });
}

// push while a game is open: on a timer, when the tab hides, and when the game closes
export function startAutoSync(game, everyMs = 5 * 60 * 1000) {
  if (!ACCOUNT_GAMES[game] || !accountsEnabled) return () => {};
  const push = () => pushGame(game);
  const timer = setInterval(push, everyMs);
  const onHide = () => { if (document.visibilityState === 'hidden') push(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', push);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', push);
    push();
  };
}

// before signing out: upload what's on this device, then clear it so the next person starts clean
export async function flushAndClear() {
  if (!accountsEnabled || !hinted()) return;
  for (const game of Object.keys(ACCOUNT_GAMES)) await pushGame(game);
  Object.entries(ACCOUNT_GAMES).forEach(([game, def]) => {
    try {
      const raw = localStorage.getItem(def.key);
      if (raw) { localStorage.setItem(`${def.key}__backup`, raw); localStorage.removeItem(def.key); }
    } catch { /* storage blocked */ }
    delete lastPushed[game];
    delete cloudProgress[game];
    setOwner(game, null);
  });
  Object.keys(hydrated).forEach((k) => delete hydrated[k]);
  setState({ status: 'idle' });
}
