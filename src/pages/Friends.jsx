import { useCallback, useEffect, useState } from 'react';
import { useAccount, authMessage } from '../account/AuthContext.jsx';
import { ACCOUNT_GAMES } from '../account/games.js';
import { acceptRequest, loadFriendships, removeFriendship, sendRequest } from '../account/friends.js';
import { Avatar, AccountsOff, SignInPrompt } from '../components/Account.jsx';
import { Link } from '../router.jsx';
import { Icon } from '../components/Brand.jsx';

const copy = (t) => { try { navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } };
const liveRoom = (p) => (p.room && p.room.code && Date.now() - (p.room.at || 0) < 6 * 3600 * 1000 ? p.room : null);

export default function Friends() {
  const acc = useAccount();
  const [rows, setRows] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const uid = acc && acc.user ? acc.user.uid : null;

  const load = useCallback(() => (uid ? loadFriendships(uid).then(setRows).catch(() => setRows([])) : null), [uid]);
  useEffect(() => { load(); }, [load]);

  if (!acc || !acc.enabled) return <AccountsOff />;
  if (!acc.ready) return <div className="t-empty-page"><p className="t-muted">Loading…</p></div>;
  if (!uid) return <SignInPrompt what="your friends" />;

  const act = (fn, done = '') => async () => { setErr(''); setOk(''); try { await fn(); if (done) setOk(done); await load(); } catch (e) { setErr(authMessage(e)); } };
  const add = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setOk('');
    try { await sendRequest(uid, code); setCode(''); setOk('Friend request sent.'); await load(); } catch (x) { setErr(x.message || authMessage(x)); } finally { setBusy(false); }
  };

  const friends = (rows || []).filter((r) => r.status === 'accepted');
  const incoming = (rows || []).filter((r) => r.status === 'pending' && r.from !== uid);
  const outgoing = (rows || []).filter((r) => r.status === 'pending' && r.from === uid);

  return (
    <div className="t-wrap t-page">
      <div className="t-stack" style={{ gap: 8, marginBottom: 24 }}>
        <span className="t-eyebrow">Friends</span>
        <h1 className="t-h1 t-page-h">Play together</h1>
        <p className="t-ink2">Add friends with their code. When a friend hosts an online room, its code shows up here so you can jump in.</p>
      </div>

      <div className="t-g2">
        <div className="t-card t-stack" style={{ gap: 6 }}>
          <span className="t-small t-muted">Your friend code</span>
          <span className="t-mono t-big" style={{ fontSize: 30, letterSpacing: '.14em' }}>{acc.profile ? acc.profile.friendCode : '…'}</span>
          <div className="t-row"><button className="t-btn t-btn-ghost t-btn-sm" onClick={() => acc.profile && copy(acc.profile.friendCode)}><Icon name="copy" size={14} />Copy</button></div>
        </div>
        <form className="t-card t-stack" style={{ gap: 10 }} onSubmit={add}>
          <label className="t-field">Add a friend
            <input className="t-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="8-character code" autoComplete="off" required />
          </label>
          <div className="t-row"><button className="t-btn t-btn-accent t-btn-sm" disabled={busy}>Send request</button></div>
          {err && <p className="t-form-err" role="alert">{err}</p>}
          {ok && <p className="t-form-ok" role="status">{ok}</p>}
        </form>
      </div>

      {incoming.length > 0 && (<>
        <h2 className="t-h3" style={{ margin: '32px 0 12px' }}>Requests</h2>
        <div className="t-stack" style={{ gap: 10 }}>
          {incoming.map((r) => (
            <div key={r.id} className="t-card t-between">
              <Link to={`/profile/${r.other}`} className="t-row" style={{ textDecoration: 'none', gap: 12 }}><Avatar avatar={r.profile.avatar} uid={r.other} /><b>{r.profile.name}</b></Link>
              <div className="t-row">
                <button className="t-btn t-btn-accent t-btn-sm" onClick={act(() => acceptRequest(r.id))}>Accept</button>
                <button className="t-btn t-btn-ghost t-btn-sm" onClick={act(() => removeFriendship(r.id))}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      </>)}

      <div className="t-between" style={{ margin: '32px 0 12px' }}>
        <h2 className="t-h3">Friends {rows ? `(${friends.length})` : ''}</h2>
        <button className="t-btn t-btn-ghost t-btn-sm" onClick={load}>Refresh</button>
      </div>
      {rows === null && <p className="t-muted">Loading…</p>}
      {rows && friends.length === 0 && <p className="t-muted">No friends yet. Share your code, or add someone from the leaderboards.</p>}
      <div className="t-stack" style={{ gap: 10 }}>
        {friends.map((r) => {
          const room = liveRoom(r.profile);
          return (
            <div key={r.id} className="t-card t-between" style={{ flexWrap: 'wrap' }}>
              <Link to={`/profile/${r.other}`} className="t-row" style={{ textDecoration: 'none', gap: 12 }}>
                <Avatar avatar={r.profile.avatar} uid={r.other} /><b>{r.profile.name}</b>
              </Link>
              <div className="t-row" style={{ flexWrap: 'wrap' }}>
                {room ? (<>
                  <span className="t-live" style={{ color: 'var(--leaf)' }}><i />{(ACCOUNT_GAMES[room.game] || {}).title || room.game}</span>
                  <span className="t-mono"><b>{room.code}</b></span>
                  <button className="t-btn t-btn-ghost t-btn-sm" onClick={() => copy(room.code)}><Icon name="copy" size={14} />Copy code</button>
                  <Link className="t-btn t-btn-accent t-btn-sm" to={`/play/${room.game}`}>Join</Link>
                </>) : <span className="t-small t-muted">Not hosting a room</span>}
                <button className="t-btn t-btn-ghost t-btn-sm" onClick={act(() => removeFriendship(r.id))}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>

      {outgoing.length > 0 && (<>
        <h2 className="t-h3" style={{ margin: '32px 0 12px' }}>Sent requests</h2>
        <div className="t-stack" style={{ gap: 10 }}>
          {outgoing.map((r) => (
            <div key={r.id} className="t-card t-between">
              <span className="t-row" style={{ gap: 12 }}><Avatar avatar={r.profile.avatar} uid={r.other} /><b>{r.profile.name}</b></span>
              <button className="t-btn t-btn-ghost t-btn-sm" onClick={act(() => removeFriendship(r.id))}>Cancel</button>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
