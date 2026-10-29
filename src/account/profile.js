// Player profiles: users/{uid}. Public to read (name, avatar, per-game summary, achievements), writable by the owner.
import { fb } from './firebase.js';

export const AVATARS = ['🍅', '🦊', '🐺', '🐉', '🦅', '🤖', '👾', '🚀', '⚡', '🔥', '🎯', '🏎️'];
export const AVATAR_COLORS = ['#C8381F', '#1F5FCC', '#2F5D3A', '#8E2413', '#6B3FA0', '#B8742A', '#0F7C8C', '#3A3D46'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
export const validName = (s) => cleanName(s).length >= 3;

// Photos may only come from these hosts (firestore.rules enforces the same list)
const PHOTO_HOST = /^https:\/\/(lh3\.googleusercontent\.com|avatars\.githubusercontent\.com|www\.gravatar\.com)\/.{1,400}$/;
export const okPhoto = (u) => typeof u === 'string' && u.length < 500 && PHOTO_HOST.test(u);

// the picture Google or GitHub gave this login, if any
export function providerPhoto(user) {
  const urls = [user.photoURL, ...(user.providerData || []).map((p) => p.photoURL)].filter(Boolean);
  const found = urls.find(okPhoto);
  return found ? found.replace(/=s\d+-c$/, '=s200-c') : null;
}

// Gravatar for an email address (opt-in: the public URL contains a hash of the email)
export async function gravatarUrl(email) {
  const data = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `https://www.gravatar.com/avatar/${hex}?s=200&d=404`;
}

export const defaultAvatar = (uid) => {
  let h = 0; for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { emoji: AVATARS[h % AVATARS.length], color: AVATAR_COLORS[(h >>> 3) % AVATAR_COLORS.length] };
};

export async function loadProfile(uid) {
  const { db, fs } = await fb();
  const snap = await fs.getDoc(fs.doc(db, 'users', uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

// the signed-in user's profile, created on first sign-in
export async function ensureProfile(user) {
  const existing = await loadProfile(user.uid);
  if (existing) return existing;
  const { db, fs } = await fb();
  let name = cleanName(user.displayName || (user.email || '').split('@')[0]);
  if (name.length < 3) name = `Player${Math.floor(100 + Math.random() * 900)}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const friendCode = rand(8);
    const doc = {
      name, avatar: { ...defaultAvatar(user.uid), photo: providerPhoto(user) }, friendCode, summary: {}, points: {}, achievements: {}, room: null,
      createdAt: fs.serverTimestamp(), lastSeen: fs.serverTimestamp(),
    };
    try {
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, 'friendCodes', friendCode), { uid: user.uid });
      batch.set(fs.doc(db, 'users', user.uid), doc);
      await batch.commit();
      return loadProfile(user.uid);
    } catch (e) {
      if (attempt === 4) throw e; // a taken friend code is rejected by the rules: try another
    }
  }
  return null;
}

export async function updateProfile(uid, patch) {
  const { db, fs } = await fb();
  const out = {};
  if (patch.name !== undefined) {
    if (!validName(patch.name)) throw new Error('Pick a name with at least 3 letters or numbers.');
    out.name = cleanName(patch.name);
  }
  if (patch.avatar) {
    out.avatar = { emoji: patch.avatar.emoji, color: patch.avatar.color, photo: okPhoto(patch.avatar.photo) ? patch.avatar.photo : null };
  }
  await fs.updateDoc(fs.doc(db, 'users', uid), out);
  return out;
}
