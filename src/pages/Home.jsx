import { useEffect, useRef, useState } from 'react';
import { games, genres, coverUrl } from '../games/registry.js';
import { Link, navigate } from '../router.jsx';
import { assetBase } from '../config.js';

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n) => String(n).padStart(2, '0');

export function Cover({ game, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`cover ${className}`} style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      {!failed && (
        <img src={coverUrl(game, assetBase())} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

const PlayIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5 L13 8 L4 13.5 Z" /></svg>;

// The featured game, full width: a real in-game shot with the title over it. Cycles through the library.
function Showcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const g = games[i];
  useEffect(() => {
    if (paused || reduceMotion() || games.length < 2) return undefined;
    timer.current = setTimeout(() => setI((k) => (k + 1) % games.length), 8000);
    return () => clearTimeout(timer.current);
  }, [i, paused]);
  return (
    <section
      className="showcase hud"
      style={{ '--c1': g.colors[0], '--c2': g.colors[1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Featured games"
    >
      <div className="showcase-art">
        {games.map((x, k) => (
          <Cover key={x.id} game={x} eager={k === 0} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="scanlines" aria-hidden="true" />
      <div className="showcase-counter" aria-hidden="true">
        <span>{pad(i + 1)}</span> / {pad(games.length)}
      </div>
      <div className="showcase-text" key={g.id}>
        <p className="eyebrow"><i className="live-dot" /> Featured · {g.genre}</p>
        <h1 className="showcase-title">{g.title}</h1>
        <p className="showcase-tag">{g.tagline}</p>
        <div className="showcase-actions">
          <Link to={`/play/${g.id}`} className="btn btn-play">
            <PlayIcon />
            Play now
          </Link>
          <ul className="badges">
            {g.badges.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      </div>
      <div className="showcase-pick" role="tablist" aria-label="Choose a featured game">
        {games.map((x, k) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={k === i}
            className={k === i ? 'on' : ''}
            style={{ '--c1': x.colors[0] }}
            onClick={() => (k === i ? navigate(`/play/${x.id}`) : setI(k))}
          >
            <span className="pick-num">{pad(k + 1)}</span>
            <Cover game={x} />
            <span className="pick-text">
              <strong>{x.title}</strong>
              <small>{x.genre}</small>
            </span>
            {k === i && !paused && <i className="timer" />}
          </button>
        ))}
      </div>
    </section>
  );
}

// Facts drawn from the registry, so they stay true as games are added.
function Stats() {
  const online = games.filter((g) => g.badges.includes('Online')).length;
  const items = [
    [games.length, 'Games'],
    [genres.length - 1, 'Genres'],
    [online, 'With online rooms'],
    [0, 'Downloads needed'],
  ];
  return (
    <section className="stats" aria-label="At a glance">
      {items.map(([n, label]) => (
        <div key={label} className="stat">
          <strong>{pad(n)}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
  );
}

// Tilts toward the pointer and moves a glare highlight with it.
function useTilt() {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el || reduceMotion() || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return { ref, onPointerMove: onMove, onPointerLeave: onLeave };
}

function GameCard({ game, index }) {
  const tilt = useTilt();
  return (
    <Link
      to={`/play/${game.id}`}
      className="card"
      style={{ '--c1': game.colors[0], '--c2': game.colors[1], '--delay': `${index * 80}ms` }}
      {...tilt}
    >
      <div className="card-art">
        <Cover game={game} />
        <span className="card-num">{pad(index + 1)}</span>
        <ul className="card-badges">
          {game.badges.map((b) => <li key={b}>{b}</li>)}
        </ul>
        <span className="card-play"><PlayIcon /> Play</span>
        <i className="card-glare" aria-hidden="true" />
      </div>
      <div className="card-body">
        <p className="card-genre">{game.genre}</p>
        <h3>{game.title}</h3>
        <p className="card-tag">{game.tagline}</p>
        <ul className="card-features">
          {game.features.slice(0, 3).map((f) => <li key={f}>{f}</li>)}
        </ul>
        <div className="card-foot">
          <span>Three.js · Browser</span>
          <span className="card-go">Launch <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8 H13 M9 4 L13 8 L9 12" /></svg></span>
        </div>
      </div>
    </Link>
  );
}

const PERKS = [
  ['Nothing to install', 'Every game runs in the browser tab. Progress saves on your device.', <path key="p" d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" />],
  ['Phone or keyboard', 'Touch controls appear on phones; on a computer use keyboard, mouse or a gamepad.', <path key="p" d="M6 9h4M8 7v4M15 10h.01M18 8h.01M7 4h10a5 5 0 0 1 5 5v3a5 5 0 0 1-9 3h-2a5 5 0 0 1-9-3V9a5 5 0 0 1 5-5Z" />],
  ['Play with friends', 'Core Breach and Midnight Pursuit have online rooms: share a code and join.', <path key="p" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3" />],
];

export default function Home() {
  const [genre, setGenre] = useState('All');
  const list = genre === 'All' ? games : games.filter((g) => g.genre === genre);
  return (
    <>
      <Showcase />
      <Stats />
      <section className="library">
        <div className="section-head">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Choose your game</h2>
          </div>
          <div className="chips" role="group" aria-label="Filter by genre">
            {genres.map((g) => (
              <button key={g} className={`chip ${g === genre ? 'on' : ''}`} aria-pressed={g === genre} onClick={() => setGenre(g)}>
                {g === 'All' ? 'All games' : g}
              </button>
            ))}
          </div>
        </div>
        <div className="grid">
          {list.map((g) => <GameCard key={g.id} game={g} index={games.indexOf(g)} />)}
        </div>
      </section>
      <section className="perks">
        {PERKS.map(([title, text, icon]) => (
          <div key={title} className="perk">
            <span className="perk-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
