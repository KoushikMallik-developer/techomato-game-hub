import { useEffect } from 'react';
import GameCanvas from '../components/GameCanvas.jsx';
import { games, getGame } from '../games/registry.js';
import { Link } from '../router.jsx';
import { SITE_NAME } from '../config.js';
import { Cover } from './Home.jsx';
import { Icon } from '../components/Brand.jsx';
import { SyncBadge } from '../components/Account.jsx';
import { useAccount } from '../account/AuthContext.jsx';

// "W A S D / Arrows" -> keycaps for each key group
function Keys({ text }) {
  const parts = text.split(/\s*\/\s*/);
  return (
    <span className="t-keys">
      {parts.map((p, i) => (
        <span key={i} className="t-row" style={{ gap: 6 }}>
          {i > 0 && <span className="t-tiny t-muted">or</span>}
          <kbd>{p}</kbd>
        </span>
      ))}
    </span>
  );
}

export default function GamePage({ id }) {
  const game = getGame(id);
  const acc = useAccount();
  // with accounts configured, playing needs a signed-in account so progress and scores can be saved
  const gated = !!(acc && acc.enabled && !(acc.ready && acc.user));

  useEffect(() => {
    document.title = game ? `${game.title} – ${SITE_NAME}` : SITE_NAME;
    return () => { document.title = `${SITE_NAME} – Play in your browser`; };
  }, [game]);

  if (!game) {
    return (
      <div className="t-empty-page">
        <h1 className="t-h2">Game not found</h1>
        <p className="t-muted">There's no game at this address.</p>
        <Link className="t-btn t-btn-accent" to="/">Open the library</Link>
      </div>
    );
  }

  const others = games.filter((g) => g.id !== game.id);
  return (
    <div className="t-wrap t-play" style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      <Link to="/" className="t-back"><Icon name="back" size={18} />Library</Link>
      <div className="t-between t-play-head">
        <div className="t-stack" style={{ gap: 6 }}>
          <h1 className="t-h1 t-page-h">{game.title}</h1>
          <p className="t-ink2">{game.tagline}</p>
        </div>
        <div className="t-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="t-chip t-chip-accent">{game.genre}</span>
          {game.badges.map((b) => <span key={b} className="t-chip">{b}</span>)}
        </div>
      </div>

      {gated ? (
        <div className="t-gate t-card">
          <span className="t-gate-ic"><Icon name={acc.ready ? 'lock' : 'cloud'} size={26} /></span>
          {acc.ready ? (<>
            <h2 className="t-h3">Sign in to play {game.title}</h2>
            <p className="t-muted" style={{ maxWidth: 440 }}>Your progress, scores and leaderboard rank are saved to your account, so you can pick up on any device. It's free.</p>
            <div className="t-row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="t-btn t-btn-accent" onClick={() => acc.openAuth('signin')}>Sign in</button>
              <button className="t-btn t-btn-ghost" onClick={() => acc.openAuth('signup')}>Create account</button>
            </div>
          </>) : <p className="t-muted">Checking your account…</p>}
        </div>
      ) : (<>
        <GameCanvas key={game.id} game={game} />
        <div style={{ marginTop: 12 }}><SyncBadge /></div>
      </>)}

      <div className="t-play-info">
        <section className="t-card">
          <h2 className="t-h3" style={{ marginBottom: 16 }}>Controls</h2>
          <ul className="t-controls">
            {game.controls.map(([keys, action]) => (
              <li key={keys}><Keys text={keys} /><span className="t-ink2 t-small">{action}</span></li>
            ))}
          </ul>
        </section>
        <section className="t-card">
          <h2 className="t-h3" style={{ marginBottom: 16 }}>About the game</h2>
          <ul className="t-checks">
            {game.features.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}
          </ul>
        </section>
      </div>

      {others.length > 0 && (
        <section className="t-more">
          <h2 className="t-h3" style={{ marginBottom: 14 }}>Play next</h2>
          <div className="t-more-row">
            {others.map((g) => (
              <Link key={g.id} to={`/play/${g.id}`} className="t-card t-mini">
                <Cover game={g} />
                <span className="t-stack">
                  <strong className="t-h3" style={{ fontSize: 17 }}>{g.title}</strong>
                  <span className="t-small t-muted">{g.genre}</span>
                </span>
                <Icon name="arrow" size={18} className="t-mini-go" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
