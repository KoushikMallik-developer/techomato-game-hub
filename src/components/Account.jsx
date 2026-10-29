import { useEffect, useRef, useState } from 'react';
import { useAccount, authMessage } from '../account/AuthContext.jsx';
import { defaultAvatar } from '../account/profile.js';
import { Link, navigate } from '../router.jsx';
import { Icon } from './Brand.jsx';

export function Avatar({ avatar, uid = '', size = 36 }) {
  const a = avatar || defaultAvatar(uid || 'x');
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [a.photo]);
  return (
    <span className="t-avatar" style={{ width: size, height: size, background: a.color, fontSize: size * 0.5 }} aria-hidden="true">
      {a.photo && !broken ? <img src={a.photo} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : a.emoji}
    </span>
  );
}

// the account button in the header: "Sign in" or the avatar with a menu
export function UserMenu() {
  const acc = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!acc || !acc.enabled) return null;
  if (!acc.ready) return <span className="t-icon-btn" aria-hidden="true" style={{ opacity: 0.4 }}><Icon name="user" size={18} /></span>;
  if (!acc.user) {
    return <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => acc.openAuth('signin')}>Sign in</button>;
  }
  const go = (to) => () => { setOpen(false); navigate(to); };
  return (
    <div className="t-menu" ref={ref}>
      <button className="t-avatar-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <Avatar avatar={acc.profile?.avatar} uid={acc.user.uid} size={40} />
      </button>
      {open && (
        <div className="t-menu-pop" role="menu">
          <div className="t-menu-head">
            <b>{acc.profile?.name || 'Player'}</b>
            <span className="t-tiny t-muted">{acc.user.email || 'Signed in'}</span>
          </div>
          <button role="menuitem" onClick={go(`/profile/${acc.user.uid}`)}><Icon name="user" size={16} />My profile</button>
          <button role="menuitem" onClick={go('/friends')}><Icon name="users" size={16} />Friends</button>
          <button role="menuitem" onClick={go('/leaderboard')}><Icon name="trophy" size={16} />Leaderboards</button>
          <button role="menuitem" onClick={() => { setOpen(false); acc.signOut().catch(() => {}); }}><Icon name="logout" size={16} />Sign out</button>
        </div>
      )}
    </div>
  );
}

// small status line on game pages: signed in and synced, or an invitation to sign in
export function SyncBadge() {
  const acc = useAccount();
  if (!acc || !acc.enabled || !acc.ready) return null;
  if (!acc.user) {
    return (
      <button className="t-sync t-sync-cta" onClick={() => acc.openAuth('signin')}>
        <Icon name="cloud" size={16} />Sign in to save your progress and join the leaderboards
      </button>
    );
  }
  const s = acc.sync;
  const text = s.status === 'syncing' ? 'Syncing progress…' : s.status === 'error' ? 'Could not sync. Will retry' : 'Progress saved to your account';
  return <span className={`t-sync${s.status === 'error' ? ' t-sync-err' : ''}`}><Icon name="cloud" size={16} />{text}</span>;
}

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);
const GitHubMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

// sign in / create account dialog
export function AuthModal() {
  const acc = useAccount();
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const first = useRef(null);

  useEffect(() => {
    if (acc && acc.modal) { setMode(acc.modal === 'signup' ? 'signup' : 'signin'); setErr(''); setInfo(''); }
  }, [acc && acc.modal]);
  useEffect(() => {
    if (!acc || !acc.modal) return undefined;
    const esc = (e) => { if (e.key === 'Escape') acc.closeAuth(); };
    document.addEventListener('keydown', esc);
    setTimeout(() => first.current && first.current.focus(), 30);
    return () => document.removeEventListener('keydown', esc);
  }, [acc && acc.modal]);

  if (!acc || !acc.modal) return null;
  const run = async (fn) => {
    setBusy(true); setErr(''); setInfo('');
    try { await fn(); } catch (e) { setErr(authMessage(e)); } finally { setBusy(false); }
  };
  const submit = (e) => {
    e.preventDefault();
    if (mode === 'signin') run(() => acc.signInEmail(email, password));
    else if (mode === 'signup') run(() => acc.signUpEmail(email, password, name));
    else run(async () => { await acc.resetPassword(email); setInfo('If an account exists for that email, a reset link is on its way.'); });
  };
  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';

  return (
    <div className="t-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) acc.closeAuth(); }}>
      <div className="t-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="t-icon-btn t-modal-x" onClick={acc.closeAuth} aria-label="Close"><Icon name="close" size={18} /></button>
        <h2 className="t-h3" id="auth-title">{title}</h2>
        <p className="t-muted t-small" style={{ marginTop: 6 }}>Save your progress across devices, climb the leaderboards and play with friends.</p>

        {mode !== 'reset' && (
          <div className="t-stack" style={{ gap: 10, margin: '18px 0 6px' }}>
            <button className="t-btn t-btn-ghost" disabled={busy} onClick={() => run(acc.signInGoogle)}><GoogleG />Continue with Google</button>
            <button className="t-btn t-btn-ghost" disabled={busy} onClick={() => run(acc.signInGithub)}><GitHubMark />Continue with GitHub</button>
            <div className="t-or"><span>or use email</span></div>
          </div>
        )}

        <form className="t-stack" style={{ gap: 12, marginTop: mode === 'reset' ? 18 : 0 }} onSubmit={submit}>
          {mode === 'signup' && (
            <label className="t-field">Display name
              <input ref={first} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" placeholder="Shown on leaderboards" required />
            </label>
          )}
          <label className="t-field">Email
            <input ref={mode === 'signup' ? undefined : first} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          {mode !== 'reset' && (
            <label className="t-field">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required />
            </label>
          )}
          {err && <p className="t-form-err" role="alert">{err}</p>}
          {info && <p className="t-form-ok" role="status">{info}</p>}
          <button className="t-btn t-btn-accent" disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        <div className="t-modal-foot t-small t-muted">
          {mode === 'signin' && (<>
            <button className="t-linkbtn" onClick={() => { setMode('signup'); setErr(''); }}>Create an account</button>
            <button className="t-linkbtn" onClick={() => { setMode('reset'); setErr(''); }}>Forgot password?</button>
          </>)}
          {mode === 'signup' && <button className="t-linkbtn" onClick={() => { setMode('signin'); setErr(''); }}>I already have an account</button>}
          {mode === 'reset' && <button className="t-linkbtn" onClick={() => { setMode('signin'); setErr(''); setInfo(''); }}>Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}

// shown on pages that need an account
export function SignInPrompt({ what = 'this page' }) {
  const acc = useAccount();
  return (
    <div className="t-empty-page">
      <h1 className="t-h2">Sign in to see {what}</h1>
      <p className="t-muted">Accounts are free. Your progress follows you to any device.</p>
      <div className="t-row">
        <button className="t-btn t-btn-accent" onClick={() => acc.openAuth('signin')}>Sign in</button>
        <button className="t-btn t-btn-ghost" onClick={() => acc.openAuth('signup')}>Create account</button>
      </div>
      <Link className="t-small t-muted" to="/">Back to the library</Link>
    </div>
  );
}

export function AccountsOff() {
  return (
    <div className="t-empty-page">
      <h1 className="t-h2">Accounts aren't set up yet</h1>
      <p className="t-muted">The site owner needs to add the Firebase settings (see .env.example). Games still work and save on this device.</p>
      <Link className="t-btn t-btn-accent" to="/">Open the library</Link>
    </div>
  );
}
