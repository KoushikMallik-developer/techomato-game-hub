import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fb, accountsEnabled } from './firebase.js';
import { ensureProfile, updateProfile as saveProfile, loadProfile, cleanName, validName, providerPhoto, defaultAvatar } from './profile.js';
import { flushAndClear, onSyncState, setSignedInHint, syncState } from './sync.js';
import { publishRoom } from './friends.js';
import { ACCOUNT_GAMES } from './games.js';

const Ctx = createContext(null);
export const useAccount = () => useContext(Ctx);

// Firebase error codes -> something a player can act on
export function authMessage(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/missing-password': 'Enter your password.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/email-already-in-use': 'An account with that email already exists. Try signing in.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection and try again.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': '',
    'auth/account-exists-with-different-credential': 'That email is already used with a different sign-in method. Sign in with the original one.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
    'auth/unauthorized-domain': 'This website is not authorised for sign-in yet (add it in Firebase > Authentication > Settings > Authorized domains).',
    'auth/requires-recent-login': 'For safety, sign out, sign in again, then retry.',
  };
  if (c in map) return map[c];
  return (e && e.message) || 'Something went wrong. Try again.';
}

export function AccountProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(!accountsEnabled);
  const [modal, setModal] = useState(null); // null | 'signin' | 'signup'
  const [sync, setSync] = useState(syncState());
  const uidRef = useRef(null);

  useEffect(() => onSyncState(setSync), []);

  useEffect(() => {
    if (!accountsEnabled) return undefined;
    let off = () => {};
    let dead = false;
    fb().then(({ auth, au }) => {
      if (dead) return;
      au.getRedirectResult(auth).catch(() => {});
      off = au.onAuthStateChanged(auth, async (u) => {
        uidRef.current = u ? u.uid : null;
        setSignedInHint(!!u);
        setUser(u);
        if (!u) { setProfile(null); setReady(true); return; }
        try {
          let p = await ensureProfile(u);
          // profiles made before photos existed: adopt the Google / GitHub picture once (null = the player chose an emoji)
          const photo = providerPhoto(u);
          if (p && photo && !(p.avatar && 'photo' in p.avatar)) {
            const out = await saveProfile(u.uid, { avatar: { ...(p.avatar || defaultAvatar(u.uid)), photo } }).catch(() => null);
            if (out) p = { ...p, ...out };
          }
          setProfile(p);
        } catch (e) { console.warn('[account] profile', e); }
        setReady(true);
      });
    }).catch((e) => { console.warn('[account] init', e); setReady(true); });
    return () => { dead = true; off(); };
  }, []);

  // tell friends which room I'm hosting (net.js announces it)
  useEffect(() => {
    if (!user) return undefined;
    const on = (e) => { const d = e.detail || {}; publishRoom(user.uid, d.game, d.code || null).catch(() => {}); };
    window.addEventListener('gamehub-room', on);
    return () => window.removeEventListener('gamehub-room', on);
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (!uidRef.current) return null;
    const p = await loadProfile(uidRef.current);
    setProfile(p);
    return p;
  }, []);

  const value = useMemo(() => {
    const oauth = async (make) => {
      const { auth, au } = await fb();
      const provider = make(au);
      try { await au.signInWithPopup(auth, provider); } catch (e) {
        if (e.code === 'auth/popup-blocked') { await au.signInWithRedirect(auth, provider); return; }
        throw e;
      }
      setModal(null);
    };
    return {
      enabled: accountsEnabled, ready, user, profile, sync,
      signedIn: !!user,
      openAuth: (m = 'signin') => setModal(m),
      closeAuth: () => setModal(null),
      modal,
      refreshProfile,
      signInGoogle: () => oauth((au) => new au.GoogleAuthProvider()),
      signInGithub: () => oauth((au) => new au.GithubAuthProvider()),
      async signInEmail(email, password) {
        const { auth, au } = await fb();
        await au.signInWithEmailAndPassword(auth, email.trim(), password);
        setModal(null);
      },
      async signUpEmail(email, password, name) {
        if (!validName(name)) throw Object.assign(new Error('Pick a display name with at least 3 letters or numbers.'), { code: 'app/name' });
        const { auth, au } = await fb();
        const cred = await au.createUserWithEmailAndPassword(auth, email.trim(), password);
        await au.updateProfile(cred.user, { displayName: cleanName(name) });
        au.sendEmailVerification(cred.user).catch(() => {});
        setModal(null);
      },
      async resetPassword(email) {
        const { auth, au } = await fb();
        await au.sendPasswordResetEmail(auth, email.trim());
      },
      async signOut() {
        const { auth, au } = await fb();
        await flushAndClear();
        await au.signOut(auth);
      },
      async saveProfile(patch) {
        const out = await saveProfile(user.uid, patch);
        setProfile((p) => ({ ...p, ...out }));
      },
      // erase the account: cloud saves, scores, friendships, profile, then the login itself
      async deleteAccount() {
        const { auth, db, fs, au } = await fb();
        const u = auth.currentUser;
        const uid = u.uid;
        const del = (ref) => fs.deleteDoc(ref).catch(() => {});
        // re-check the login first (throws auth/requires-recent-login before anything is deleted)
        await u.getIdToken(true);
        const scores = await fs.getDocs(fs.query(fs.collection(db, 'scores'), fs.where('uid', '==', uid)));
        await Promise.all(scores.docs.map((d) => del(d.ref)));
        const fr = await fs.getDocs(fs.query(fs.collection(db, 'friendships'), fs.where('users', 'array-contains', uid)));
        await Promise.all(fr.docs.map((d) => del(d.ref)));
        await Promise.all(Object.keys(ACCOUNT_GAMES).map((g) => del(fs.doc(db, 'users', uid, 'saves', g))));
        await del(fs.doc(db, 'users', uid, 'private', 'weekly'));
        if (profile?.friendCode) await del(fs.doc(db, 'friendCodes', profile.friendCode));
        await del(fs.doc(db, 'users', uid));
        await au.deleteUser(u);
      },
    };
  }, [ready, user, profile, sync, modal, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
