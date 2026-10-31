import { useCallback, useEffect, useState } from 'react';
import { useAccount, authMessage } from '../account/AuthContext.jsx';
import { ACCOUNT_GAMES } from '../account/games.js';
import { ACHIEVEMENTS } from '../account/achievements.js';
import { AVATARS, AVATAR_COLORS, defaultAvatar, gravatarUrl, loadProfile, providerPhoto } from '../account/profile.js';
import { addFriendByUid, acceptRequest, friendshipWith, removeFriendship } from '../account/friends.js';
import { Avatar, AccountsOff, SignInPrompt } from '../components/Account.jsx';
import { Link, navigate } from '../router.jsx';
import { Icon } from '../components/Brand.jsx';

const LABELS = { level: 'Level', matches: 'Matches', wins: 'Wins', kills: 'Kills', rank: 'Rank points', stars: 'Stars', bosses: 'Bosses', endless: 'Endless best wave', races: 'Races won', takedowns: 'Takedowns', cars: 'Cars owned' };
const fmt = (n) => Number(n || 0).toLocaleString();
const since = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '');
const copy = (t) => { try { navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } };

function FriendButton({ me, other }) {
  const [rel, setRel] = useState(undefined); // undefined loading, null none, else friendship
  const [err, setErr] = useState('');
  const load = useCallback(() => friendshipWith(me, other).then(setRel).catch(() => setRel(null)), [me, other]);
  useEffect(() => { load(); }, [load]);
  const run = (fn) => async () => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(authMessage(e)); } };
  if (rel === undefined) return null;
  return (
    <div className="t-row" style={{ flexWrap: 'wrap' }}>
      {!rel && <button className="t-btn t-btn-accent t-btn-sm" onClick={run(() => addFriendByUid(me, other))}><Icon name="users" size={16} />Add friend</button>}
      {rel && rel.status === 'pending' && rel.from === me && <span className="t-chip">Request sent</span>}
      {rel && rel.status === 'pending' && rel.from !== me && <button className="t-btn t-btn-accent t-btn-sm" onClick={run(() => acceptRequest(rel.id))}>Accept friend request</button>}
      {rel && rel.status === 'accepted' && <span className="t-chip t-chip-pass"><Icon name="check" size={14} />Friends</span>}
      {rel && <button className="t-btn t-btn-ghost t-btn-sm" onClick={run(() => removeFriendship(rel.id))}>{rel.status === 'accepted' ? 'Remove' : 'Cancel'}</button>}
      {err && <span className="t-form-err">{err}</span>}
    </div>
  );
}

function Editor({ acc, onDone }) {
  const p = acc.profile;
  const [name, setName] = useState(p.name);
  const [avatar, setAvatar] = useState(p.avatar || defaultAvatar(acc.user.uid));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const photo = providerPhoto(acc.user);
  const provider = (acc.user.providerData || []).some((p) => p.providerId === 'github.com') ? 'GitHub' : 'Google';
  const useGravatar = async () => setAvatar({ ...avatar, photo: await gravatarUrl(acc.user.email) });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await acc.saveProfile({ name, avatar }); onDone(); } catch (x) { setErr(authMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form className="t-card t-stack" style={{ gap: 14, marginBottom: 20 }} onSubmit={save}>
      <label className="t-field">Display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required /></label>
      <div className="t-field">Avatar
        <div className="t-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Avatar avatar={avatar} uid={acc.user.uid} size={56} />
          {photo && <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => setAvatar({ ...avatar, photo })}>Use my {provider} photo</button>}
          {!photo && acc.user.email && <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={useGravatar}>Use my Gravatar</button>}
          {avatar.photo && <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => setAvatar({ ...avatar, photo: null })}>Use an emoji instead</button>}
        </div>
        <div className="t-pick">{AVATARS.map((em) => (
          <button type="button" key={em} className={avatar.emoji === em ? 'on' : ''} onClick={() => setAvatar({ ...avatar, emoji: em })} aria-label={`Avatar ${em}`}>{em}</button>
        ))}</div>
        <div className="t-pick">{AVATAR_COLORS.map((c) => (
          <button type="button" key={c} className={avatar.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} aria-label={`Colour ${c}`} />
        ))}</div>
      </div>
      {err && <p className="t-form-err">{err}</p>}
      <div className="t-row"><button className="t-btn t-btn-accent t-btn-sm" disabled={busy}>Save</button><button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={onDone}>Cancel</button></div>
      <p className="t-tiny t-muted">Names and pictures appear on leaderboards the next time your progress syncs. A Gravatar link contains a hash of your email address and is public.</p>
    </form>
  );
}

export default function Profile({ uid }) {
  const acc = useAccount();
  const own = acc && acc.user && (!uid || uid === acc.user.uid);
  const target = uid || (acc && acc.user && acc.user.uid);
  const [other, setOther] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!acc || !acc.enabled || !target || own) return undefined;
    let dead = false;
    setOther(undefined);
    loadProfile(target).then((p) => { if (!dead) setOther(p); }).catch(() => { if (!dead) setOther(null); });
    return () => { dead = true; };
  }, [target, own, acc && acc.enabled]);

  if (!acc || !acc.enabled) return <AccountsOff />;
  if (!acc.ready) return <div className="t-empty-page"><p className="t-muted">Loading…</p></div>;
  if (!target) return <SignInPrompt what="your profile" />;

  const p = own ? acc.profile : other;
  if (p === undefined || (own && !p)) return <div className="t-empty-page"><p className="t-muted">Loading profile…</p></div>;
  if (p === null) {
    return (
      <div className="t-empty-page">
        <h1 className="t-h2">Player not found</h1>
        <p className="t-muted">This profile doesn't exist.</p>
        <Link className="t-btn t-btn-accent" to="/leaderboard">See the leaderboards</Link>
      </div>
    );
  }

  const unlocked = p.achievements || {};
  const total = Object.values(p.points || {}).reduce((a, b) => a + b, 0);
  const played = Object.entries(ACCOUNT_GAMES).filter(([id]) => p.summary && p.summary[id]);
  const room = p.room && p.room.code && Date.now() - (p.room.at || 0) < 6 * 3600 * 1000 ? p.room : null;

  const remove = async () => {
    if (!window.confirm('Delete your account? Your cloud saves, scores, friends and profile will be erased. This cannot be undone.')) return;
    try { await acc.deleteAccount(); navigate('/'); } catch (e) { setMsg(authMessage(e)); }
  };

  return (
    <div className="t-wrap t-page">
      <div className="t-card t-prof-head">
        <Avatar avatar={p.avatar} uid={target} size={84} />
        <div className="t-stack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
          <h1 className="t-h1" style={{ fontSize: 'clamp(28px,4vw,44px)', overflowWrap: 'anywhere' }}>{p.name}</h1>
          <div className="t-row t-small t-muted" style={{ flexWrap: 'wrap', gap: 8 }}>
            {since(p.createdAt) && <span>Member since {since(p.createdAt)}</span>}
            <span>·</span><span><b className="t-ink2">{fmt(total)}</b> hub points</span>
            <span>·</span><span>{Object.keys(unlocked).length}/{ACHIEVEMENTS.length} achievements</span>
          </div>
          {room && (
            <div className="t-row t-small" style={{ flexWrap: 'wrap' }}>
              <span className="t-live" style={{ color: 'var(--leaf)' }}><i />Hosting a room</span>
              <span className="t-mono"><b>{room.code}</b></span>
              <span className="t-muted">in {(ACCOUNT_GAMES[room.game] || {}).title || room.game}</span>
              <button className="t-btn t-btn-sm t-btn-ghost" onClick={() => copy(room.code)}><Icon name="copy" size={14} />Copy code</button>
              <Link className="t-btn t-btn-sm t-btn-accent" to={`/play/${room.game}`}>Open game</Link>
            </div>
          )}
        </div>
        <div className="t-stack" style={{ gap: 10, alignItems: 'flex-end' }}>
          {own
            ? <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => setEditing((e) => !e)}>Edit profile</button>
            : acc.user && <FriendButton me={acc.user.uid} other={target} />}
          {!own && !acc.user && <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => acc.openAuth('signin')}>Sign in to add friend</button>}
        </div>
      </div>

      {own && editing && <Editor acc={acc} onDone={() => setEditing(false)} />}
      {own && (
        <div className="t-card t-between" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="t-stack" style={{ gap: 2 }}>
            <span className="t-small t-muted">Your friend code</span>
            <span className="t-mono t-big" style={{ fontSize: 28, letterSpacing: '.14em' }}>{p.friendCode}</span>
          </div>
          <div className="t-row" style={{ flexWrap: 'wrap' }}>
            <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => copy(p.friendCode)}><Icon name="copy" size={14} />Copy</button>
            <Link className="t-btn t-btn-accent t-btn-sm" to="/friends">Friends</Link>
          </div>
        </div>
      )}

      <h2 className="t-h3" style={{ margin: '28px 0 12px' }}>Games</h2>
      {played.length === 0 && <p className="t-muted">{own ? 'Play any game while signed in and your stats show up here.' : 'No games played yet.'}</p>}
      <div className="t-g3">
        {played.map(([id, g]) => (
          <div key={id} className="t-card t-stack" style={{ gap: 10 }}>
            <div className="t-between"><h3 className="t-h3">{g.title}</h3><span className="t-chip t-chip-accent">Level {p.summary[id].level}</span></div>
            <div className="t-statgrid">
              {Object.entries(p.summary[id]).filter(([k]) => k !== 'level').map(([k, v]) => (
                <div key={k}><b>{fmt(v)}</b><span className="t-tiny t-muted">{LABELS[k] || k}</span></div>
              ))}
            </div>
            <Link className="t-small t-accent" to={`/play/${id}`}>Play {g.title} →</Link>
          </div>
        ))}
      </div>

      <h2 className="t-h3" style={{ margin: '36px 0 12px' }}>Achievements</h2>
      <div className="t-ach">
        {ACHIEVEMENTS.map((a) => {
          const on = !!unlocked[a.id];
          return (
            <div key={a.id} className={`t-card t-ach-i${on ? ' on' : ''}`}>
              <span className="t-ach-ic"><Icon name={on ? a.icon : 'lock'} size={20} /></span>
              <div className="t-stack" style={{ gap: 2 }}><b>{a.name}</b><span className="t-small t-muted">{a.desc}</span></div>
            </div>
          );
        })}
      </div>

      {own && (
        <div className="t-card" style={{ marginTop: 40 }}>
          <h3 className="t-h3">Account</h3>
          <p className="t-small t-muted" style={{ margin: '6px 0 14px' }}>{acc.user.email || 'Signed in with a social account'}</p>
          <div className="t-row" style={{ flexWrap: 'wrap' }}>
            <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => acc.signOut().then(() => navigate('/'))}><Icon name="logout" size={16} />Sign out</button>
            <button className="t-btn t-btn-sm t-danger" onClick={remove}>Delete account</button>
          </div>
          {msg && <p className="t-form-err" style={{ marginTop: 10 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
