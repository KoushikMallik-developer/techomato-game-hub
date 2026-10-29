// Firebase (Spark / free tier): Authentication + Firestore. Loaded lazily, so visitors who never sign in
// don't download it. Config comes from VITE_FIREBASE_* variables (see .env.example); these values are public
// identifiers, access is enforced by firestore.rules. Without them, accounts are simply switched off and the
// games keep using local saves.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const accountsEnabled = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let ready = null;
// Resolves to { app, auth, db, au, fs }: the instances plus the auth / firestore module namespaces.
export function fb() {
  if (!accountsEnabled) return Promise.reject(new Error('accounts-disabled'));
  if (!ready) {
    ready = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]).then(([a, au, fs]) => {
      const app = a.initializeApp(cfg);
      return { app, auth: au.getAuth(app), db: fs.getFirestore(app), au, fs };
    });
  }
  return ready;
}
