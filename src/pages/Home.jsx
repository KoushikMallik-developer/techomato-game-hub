import { useEffect, useRef, useState } from 'react';
import { games, genres, coverUrl } from '../games/registry.js';
import { Link, navigate } from '../router.jsx';
import { assetBase } from '../config.js';
import { Icon } from '../components/Brand.jsx';

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Cover({ game, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`t-cover ${className}`} style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      {!failed && <img src={coverUrl(game, assetBase())} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />}
    </div>
  );
}

const slug = (g) => `${g.id}.play`;

// Right side of the hero: the featured game in a dark window, cycling through the library
function Stage() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const g = games[i];
  useEffect(() => {
    if (paused || reduceMotion() || games.length < 2) return undefined;
    timer.current = setTimeout(() => setI((k) => (k + 1) % games.length), 7000);
    return () => clearTimeout(timer.current);
  }, [i, paused]);
  return (
    <div className="t-stage t-reveal t-reveal-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="t-window">
        <div className="t-win-bar">
          <span className="t-dots"><span /><span /><span /></span>
          <span>{slug(g)}</span>
          <span className="t-live"><i />live</span>
        </div>
        <Link to={`/play/${g.id}`} className="t-win-art" aria-label={`Play ${g.title}`}>
          {games.map((x, k) => <Cover key={x.id} game={x} eager={k === 0} className={k === i ? 'on' : ''} />)}
          <span className="t-win-play"><Icon name="play" size={22} /></span>
        </Link>
        <div className="t-win-pick" role="tablist" aria-label="Choose a featured game">
          {games.map((x, k) => (
            <button key={x.id} role="tab" aria-selected={k === i} onClick={() => (k === i ? navigate(`/play/${x.id}`) : setI(k))}>
              {x.title}
              {k === i && !paused && <i className="t-timer" />}
            </button>
          ))}
        </div>
      </div>
      <div className="t-float t-float-a" key={`a${g.id}`}>
        <span className="t-tiny t-muted">Now featured</span>
        <strong className="t-h3">{g.title}</strong>
        <span className="t-chip t-chip-accent">{g.genre}</span>
      </div>
      <div className="t-float t-float-b" key={`b${g.id}`}>
        <span className="t-float-ic"><Icon name={g.badges.includes('Online') ? 'users' : 'gamepad'} size={18} /></span>
        <div className="t-stack">
          <strong>{g.badges.slice(0, 2).join(' · ')}</strong>
          <span className="t-tiny t-muted">{g.badges.slice(2).join(' · ') || 'Play solo'}</span>
        </div>
      </div>
    </div>
  );
}

function GameCard({ game }) {
  return (
    <Link to={`/play/${game.id}`} className="t-card t-game" style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      <Cover game={game} />
      <div className="t-game-body">
        <div className="t-between">
          <span className="t-chip">{game.genre}</span>
          <span className="t-tiny t-muted t-mono">{game.badges[0]}</span>
        </div>
        <h3 className="t-h3">{game.title}</h3>
        <p className="t-ink2 t-small">{game.tagline}</p>
        <ul className="t-checks">
          {game.features.slice(0, 3).map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}
        </ul>
        <span className="t-game-go">Play now <Icon name="arrow" size={16} /></span>
      </div>
    </Link>
  );
}

export default function Home() {
  const [genre, setGenre] = useState('All');
  const list = genre === 'All' ? games : games.filter((g) => g.genre === genre);
  const online = games.filter((g) => g.badges.includes('Online'));
  const first = games[0];
  return (
    <>
      <section className="t-wrap t-hero">
        <div className="t-stack t-hero-text">
          <span className="t-chip t-chip-pass t-reveal" style={{ alignSelf: 'flex-start' }}><Icon name="bolt" size={14} />{games.length} free games · no download</span>
          <h1 className="t-h1 t-hero-h t-reveal">Play hard.<br /><span className="t-accent">Play anywhere.</span></h1>
          <p className="t-lead t-ink2 t-reveal t-reveal-2">3D games that open in a browser tab and run on a phone or a computer. Battle royales, tower defense, shooters and police chases, with online rooms you can share with friends.</p>
          <div className="t-row t-reveal t-reveal-3" style={{ flexWrap: 'wrap' }}>
            <Link to={`/play/${first.id}`} className="t-btn t-btn-accent t-btn-lg"><Icon name="play" size={18} />Play {first.title}</Link>
            <a href="#library" className="t-btn t-btn-ghost t-btn-lg" onClick={(e) => { e.preventDefault(); document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' }); }}>Browse library</a>
          </div>
          <div className="t-stats t-reveal t-reveal-3">
            <div><span className="t-big">{games.length}</span><span className="t-small t-muted">games</span></div>
            <div><span className="t-big">50</span><span className="t-small t-muted">heroes a match</span></div>
            <div><span className="t-big">0</span><span className="t-small t-muted">installs</span></div>
          </div>
        </div>
        <Stage />
      </section>

      <section className="t-band" id="library">
        <div className="t-wrap t-section">
          <div className="t-between t-sec-head">
            <div className="t-stack" style={{ gap: 8 }}>
              <span className="t-eyebrow">Library</span>
              <h2 className="t-h2">Pick a game</h2>
            </div>
            <div className="t-tabs" role="tablist" aria-label="Filter by genre">
              {genres.map((g) => (
                <button key={g} role="tab" className="t-tab" aria-selected={g === genre} onClick={() => setGenre(g)}>{g === 'All' ? 'All games' : g}</button>
              ))}
            </div>
          </div>
          <div className="t-grid-games">
            {list.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        </div>
      </section>

      <section className="t-wrap t-section" id="online">
        <div className="t-dark-band">
          <div className="t-stack" style={{ gap: 18 }}>
            <span className="t-eyebrow t-eyebrow-dark">Play online</span>
            <h2 className="t-h2">Share a code.<br />Fight your friends.</h2>
            <p className="t-panel-muted">One player hosts a room and gets a short code. Everyone else types it in and joins the same match, straight from the browser. Bots fill the empty slots so a match is always full.</p>
            <div className="t-row" style={{ flexWrap: 'wrap' }}>
              {online.map((g) => <Link key={g.id} to={`/play/${g.id}`} className="t-btn t-btn-white t-btn-sm">{g.title}<Icon name="arrow" size={14} /></Link>)}
            </div>
          </div>
          <div className="t-room">
            <div className="t-win-bar"><span className="t-dots"><span /><span /><span /></span><span>room · lobby</span><span /></div>
            <div className="t-room-body">
              <div className="t-tiny t-panel-muted">ROOM CODE</div>
              <div className="t-room-code t-mono">Q3G7N</div>
              {[['Host', 'You', 'var(--accent)'], ['Player 2', 'Ananya', '#5B8DEF'], ['Player 3', 'Rohit', '#2F9E5A'], ['Bots', '47 waiting', '#6B7080']].map(([a, b, c]) => (
                <div key={a} className="t-room-row"><span className="t-av" style={{ background: c }}>{b[0]}</span><span>{b}</span><span className="t-tiny t-panel-muted">{a}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="t-wrap t-section" id="how" style={{ paddingTop: 0 }}>
        <div className="t-stack" style={{ gap: 8, marginBottom: 28 }}>
          <span className="t-eyebrow">How it works</span>
          <h2 className="t-h2">Open, tap, play.</h2>
        </div>
        <div className="t-g3">
          {[
            ['download', 'Nothing to install', 'Every game runs in the browser tab. Open the page and you are in.'],
            ['phone', 'Phone or keyboard', 'Touch controls appear on phones; on a computer use keyboard, mouse or a gamepad.'],
            ['save', 'Progress saves', 'Levels, unlocks and settings are kept on your device between visits.'],
          ].map(([ic, h, p]) => (
            <div key={h} className="t-card t-perk">
              <span className="t-perk-ic"><Icon name={ic} size={22} /></span>
              <h3 className="t-h3">{h}</h3>
              <p className="t-ink2">{p}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
