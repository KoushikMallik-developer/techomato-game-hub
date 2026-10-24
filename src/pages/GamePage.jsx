import { useEffect } from 'react';
import GameCanvas from '../components/GameCanvas.jsx';
import { games, getGame } from '../games/registry.js';
import { Link } from '../router.jsx';
import { SITE_NAME } from '../config.js';
import { Cover } from './Home.jsx';

// "W A S D / Arrows" -> keycaps for each key group
function Keys({ text }) {
  const parts = text.split(/\s*\/\s*/);
  return (
    <span className="keys">
      {parts.map((p, i) => (
        <span key={i} className="key-group">
          {i > 0 && <span className="or">or</span>}
          <kbd>{p}</kbd>
        </span>
      ))}
    </span>
  );
}

export default function GamePage({ id }) {
  const game = getGame(id);

  useEffect(() => {
    document.title = game ? `${game.title} – ${SITE_NAME}` : SITE_NAME;
    return () => { document.title = SITE_NAME; };
  }, [game]);

  if (!game) {
    return (
      <div className="center-page">
        <h1>Game not found</h1>
        <p>There's no game at this address.</p>
        <Link className="btn" to="/">Open the library</Link>
      </div>
    );
  }

  const others = games.filter((g) => g.id !== game.id);
  return (
    <div className="play-page" style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      <div className="play-glow" aria-hidden="true" />
      <div className="play-head">
        <Link to="/" className="back">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 L5 8 L10 13" /></svg>
          Library
        </Link>
        <div className="play-title">
          <div>
            <p className="eyebrow"><i className="live-dot" /> Now playing</p>
            <h1>{game.title}</h1>
          </div>
          <ul className="badges">
            <li>{game.genre}</li>
            {game.badges.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      </div>

      <GameCanvas key={game.id} game={game} />

      <div className="play-info">
        <section className="panel">
          <h2>Controls</h2>
          <ul className="control-list">
            {game.controls.map(([keys, action]) => (
              <li key={keys}>
                <Keys text={keys} />
                <span className="action">{action}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>About the game</h2>
          <p className="about">{game.tagline}</p>
          <ul className="feature-list">
            {game.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </section>
      </div>

      {others.length > 0 && (
        <section className="more">
          <div className="section-head">
            <div>
              <p className="eyebrow">Up next</p>
              <h2>Play next</h2>
            </div>
          </div>
          <div className="more-row">
            {others.map((g) => (
              <Link key={g.id} to={`/play/${g.id}`} className="mini" style={{ '--c1': g.colors[0], '--c2': g.colors[1] }}>
                <Cover game={g} />
                <span className="mini-text">
                  <strong>{g.title}</strong>
                  <span>{g.genre}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
