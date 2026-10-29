// Leaderboards: one document per player per board per period in `scores`
// (id `<board>__<period>__<uid>`, period is 'all' or an ISO week like '2026-W44').
// The rules (firestore.rules) cap every board, only let a score go up, and rate-limit updates.
import { fb } from './firebase.js';

// ISO week of a date, e.g. 2026-W44 (weekly boards reset on Monday, UTC)
export function currentWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

export const scoreId = (board, period, uid) => `${board}__${period}__${uid}`;

export async function submitScore(user, who, board, period, score) {
  const { db, fs } = await fb();
  try {
    await fs.setDoc(fs.doc(db, 'scores', scoreId(board, period, user.uid)), {
      board, period, uid: user.uid, name: who.name, avatar: who.avatar || null, score, updatedAt: fs.serverTimestamp(),
    });
    return true;
  } catch (e) {
    // too soon after the last update, or a value the rules don't accept: the next sync will try again
    console.warn(`[scores] ${board} not updated`, e.code || e);
    return false;
  }
}

export async function topScores(board, period, n = 50) {
  const { db, fs } = await fb();
  const q = fs.query(fs.collection(db, 'scores'), fs.where('board', '==', board), fs.where('period', '==', period), fs.orderBy('score', 'desc'), fs.limit(n));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function myScore(board, period, uid) {
  const { db, fs } = await fb();
  const snap = await fs.getDoc(fs.doc(db, 'scores', scoreId(board, period, uid)));
  return snap.exists() ? snap.data().score : null;
}

// 1-based rank of a score on a board (a cheap server-side count)
export async function rankOf(board, period, score) {
  const { db, fs } = await fb();
  const q = fs.query(fs.collection(db, 'scores'), fs.where('board', '==', board), fs.where('period', '==', period), fs.where('score', '>', score));
  const snap = await fs.getCountFromServer(q);
  return snap.data().count + 1;
}
