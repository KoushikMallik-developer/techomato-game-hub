// Friends: friendships/{a_b} (a < b) holds { users: [a, b], from, status: 'pending' | 'accepted' }.
// Players add each other with a friend code (friendCodes/{code} -> uid). While you host an online room,
// your profile carries { game, code } so friends can see it and join.
import { fb } from './firebase.js';
import { loadProfile } from './profile.js';

const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);
const pairId = (a, b) => pairOf(a, b).join('_');

// everyone connected to me, with their profiles: [{ id, other, from, status, profile }]
export async function loadFriendships(uid) {
  const { db, fs } = await fb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'friendships'), fs.where('users', 'array-contains', uid)));
  const rows = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, other: x.users.find((u) => u !== uid), from: x.from, status: x.status };
  });
  const profiles = await Promise.all(rows.map((r) => loadProfile(r.other).catch(() => null)));
  return rows.map((r, i) => ({ ...r, profile: profiles[i] })).filter((r) => r.profile);
}

export async function sendRequest(uid, rawCode) {
  const { db, fs } = await fb();
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new Error('Friend codes have 8 letters and numbers.');
  const c = await fs.getDoc(fs.doc(db, 'friendCodes', code));
  if (!c.exists()) throw new Error('No player has that friend code.');
  const other = c.data().uid;
  if (other === uid) throw new Error("That's your own code.");
  const ref = fs.doc(db, 'friendships', pairId(uid, other));
  const existing = await fs.getDoc(ref).catch(() => null);
  if (existing && existing.exists()) throw new Error(existing.data().status === 'accepted' ? 'You are already friends.' : 'A request is already pending.');
  await fs.setDoc(ref, { users: pairOf(uid, other), from: uid, status: 'pending', createdAt: fs.serverTimestamp() });
}

export async function acceptRequest(id) {
  const { db, fs } = await fb();
  await fs.updateDoc(fs.doc(db, 'friendships', id), { status: 'accepted' });
}

export async function removeFriendship(id) {
  const { db, fs } = await fb();
  await fs.deleteDoc(fs.doc(db, 'friendships', id));
}

// friendship between me and someone else (for the button on their profile), or null
export async function friendshipWith(uid, other) {
  const { db, fs } = await fb();
  const snap = await fs.getDoc(fs.doc(db, 'friendships', pairId(uid, other))).catch(() => null);
  return snap && snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addFriendByUid(uid, other) {
  const { db, fs } = await fb();
  await fs.setDoc(fs.doc(db, 'friendships', pairId(uid, other)), { users: pairOf(uid, other), from: uid, status: 'pending', createdAt: fs.serverTimestamp() });
}

// show (or clear, with code = null) the room I'm hosting on my profile
export async function publishRoom(uid, game, code) {
  const { db, fs } = await fb();
  await fs.updateDoc(fs.doc(db, 'users', uid), { room: code ? { game, code, at: Date.now() } : null });
}
