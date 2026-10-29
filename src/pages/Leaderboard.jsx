import { useEffect, useState } from 'react';
import { useAccount } from '../account/AuthContext.jsx';
import { ACCOUNT_GAMES, boardsFor } from '../account/games.js';
import { currentWeek, topScores, myScore, rankOf } from '../account/leaderboard.js';
import { defaultAvatar } from '../account/profile.js';
import { Avatar, AccountsOff } from '../components/Account.jsx';
import { Link } from '../router.jsx';
import { Icon } from '../components/Brand.jsx';

const fmt = (n) => Number(n).toLocaleString();

export default function Leaderboard() {
  const acc = useAccount();
  const [game, setGame] = useState(''); // '' = the whole hub
  const [boardIdx, setBoardIdx] = useState(0);
  const [period, setPeriod] = useState('all'); // 'all' | 'week'
  const [rows, setRows] = useState(null);
  const [mine, setMine] = useState(null);
  const [err, setErr] = useState('');

  const boards = boardsFor(game);
  const board = boards[Math.min(boardIdx, boards.length - 1)];
  const per = period === 'week' && !board.noWeekly ? currentWeek() : 'all';
  const uid = acc && acc.user ? acc.user.uid : null;

  useEffect(() => { setBoardIdx(0); }, [game]);
  useEffect(() => {
    if (!acc || !acc.enabled) return undefined;
    let dead = false;
    setRows(null); setMine(null); setErr('');
    (async () => {
      try {
        const list = await topScores(board.id, per, 50);
        if (dead) return;
        setRows(list);
        if (uid) {
          const s = await myScore(board.id, per, uid);
          if (dead || s == null) return;
          const inTop = list.findIndex((r) => r.uid === uid);
          setMine({ score: s, rank: inTop >= 0 ? inTop + 1 : await rankOf(board.id, per, s) });
        }
      } catch (e) {
        if (!dead) setErr(e.code === 'failed-precondition' ? 'The leaderboard index is still building. Try again in a minute.' : 'Could not load the leaderboard.');
      }
    })();
    return () => { dead = true; };
  }, [board.id, per, uid, acc && acc.enabled]);

  if (!acc || !acc.enabled) return <AccountsOff />;
  return (
    <div className="t-wrap t-page">
      <div className="t-stack" style={{ gap: 8, marginBottom: 24 }}>
        <span className="t-eyebrow">Leaderboards</span>
        <h1 className="t-h1 t-page-h">Top players</h1>
        <p className="t-ink2">Scores come from the progress each game saves to your account. Weekly boards reset every Monday (UTC).</p>
      </div>

      <div className="t-tabs" role="tablist" aria-label="Game" style={{ marginBottom: 12 }}>
        <button className="t-tab" role="tab" aria-selected={game === ''} onClick={() => setGame('')}>All games</button>
        {Object.entries(ACCOUNT_GAMES).map(([id, g]) => (
          <button key={id} className="t-tab" role="tab" aria-selected={game === id} onClick={() => setGame(id)}>{g.title}</button>
        ))}
      </div>

      <div className="t-between" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="t-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {boards.length > 1 && boards.map((b, i) => (
            <button key={b.id} className={`t-chip t-chipbtn${i === boardIdx ? ' on' : ''}`} onClick={() => setBoardIdx(i)}>{b.label}</button>
          ))}
        </div>
        <div className="t-tabs" role="tablist" aria-label="Period">
          <button className="t-tab" role="tab" aria-selected={period === 'all'} onClick={() => setPeriod('all')}>All time</button>
          <button className="t-tab" role="tab" aria-selected={period === 'week'} onClick={() => setPeriod('week')}>This week</button>
        </div>
      </div>
      {period === 'week' && board.noWeekly && <p className="t-small t-muted" style={{ marginBottom: 12 }}>This board only tracks an all-time best.</p>}

      <div className="t-card t-lb">
        <div className="t-lb-head t-small t-muted"><span>#</span><span>Player</span><span style={{ textAlign: 'right' }}>{board.label}</span></div>
        {err && <p className="t-form-err" style={{ padding: 16 }}>{err}</p>}
        {!err && rows === null && <p className="t-muted" style={{ padding: 24 }}>Loading…</p>}
        {!err && rows && rows.length === 0 && (
          <p className="t-muted" style={{ padding: 24 }}>No scores yet. Play a game while signed in and you'll be the first.</p>
        )}
        {rows && rows.map((r, i) => (
          <Link key={r.uid} to={`/profile/${r.uid}`} className={`t-lb-row${r.uid === uid ? ' me' : ''}`}>
            <span className={`t-lb-rank${i < 3 ? ` r${i + 1}` : ''}`}>{i < 3 ? <Icon name="trophy" size={16} /> : null}{i + 1}</span>
            <span className="t-row" style={{ gap: 10, minWidth: 0 }}><Avatar avatar={r.avatar || defaultAvatar(r.uid)} uid={r.uid} size={30} /><span className="t-lb-name">{r.name}</span></span>
            <b className="t-mono" style={{ textAlign: 'right' }}>{fmt(r.score)}</b>
          </Link>
        ))}
        {uid && mine && !(rows || []).some((r) => r.uid === uid) && (
          <div className="t-lb-row me" style={{ borderTop: '1px dashed var(--line)' }}>
            <span className="t-lb-rank">{mine.rank}</span><span><b>You</b></span><b className="t-mono" style={{ textAlign: 'right' }}>{fmt(mine.score)}</b>
          </div>
        )}
      </div>
      {!uid && (
        <p className="t-small t-muted" style={{ marginTop: 14 }}>
          <button className="t-linkbtn" onClick={() => acc.openAuth('signin')}>Sign in</button> to appear on the boards.
        </p>
      )}
    </div>
  );
}
