import Home from './pages/Home.jsx';
import GamePage from './pages/GamePage.jsx';
import { Link, navigate, usePath } from './router.jsx';
import { SITE_NAME, TAGLINE } from './config.js';
import { games } from './games/registry.js';

function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffcf4a" />
          <stop offset=".55" stopColor="#ff3d8b" />
          <stop offset="1" stopColor="#8b5cff" />
        </linearGradient>
      </defs>
      <path d="M16 2 L28.1 9 V23 L16 30 L3.9 23 V9 Z" fill="url(#lg)" />
      <path d="M16 5.5 L25.2 10.8 V21.2 L16 26.5 L6.8 21.2 V10.8 Z" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth=".8" />
      <path d="M13 10.5 L22 16 L13 21.5 Z" fill="#0b0918" />
    </svg>
  );
}

function NotFound() {
  return (
    <div className="center-page">
      <p className="eyebrow">Error 404</p>
      <h1 className="glitch" data-text="Lost signal">Lost signal</h1>
      <p>This page doesn't exist. Pick a game from the library instead.</p>
      <Link className="btn" to="/">Open the library</Link>
    </div>
  );
}

const quickPlay = () => navigate(`/play/${games[Math.floor(Math.random() * games.length)].id}`);

export default function App() {
  const path = usePath();
  const m = path.match(/^\/play\/([\w-]+)/);
  let page;
  if (path === '/' || path === '') page = <Home />;
  else if (m) page = <GamePage key={m[1]} id={m[1]} />;
  else page = <NotFound />;
  const [first, ...rest] = SITE_NAME.split(' ');
  return (
    <div className="app">
      <div className="bg-grid" aria-hidden="true" />
      <header className="site-header">
        <Link to="/" className="brand" aria-label={`${SITE_NAME} home`}>
          <Logo />
          <span className="brand-text">
            <span className="brand-name">{first}</span>
            {rest.length > 0 && <span className="brand-sub">{rest.join(' ')}</span>}
          </span>
        </Link>
        <nav aria-label="Main">
          <Link to="/" className={path === '/' ? 'on' : ''}>Library</Link>
          {games.map((g) => (
            <Link key={g.id} to={`/play/${g.id}`} className={`nav-game${path === `/play/${g.id}` ? ' on' : ''}`} style={{ '--c1': g.colors[0] }}>
              {g.title}
            </Link>
          ))}
        </nav>
        <button className="btn btn-sm" onClick={quickPlay}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1 L3 9 H8 L7 15 L13 7 H8 Z" /></svg>
          Quick play
        </button>
      </header>
      <main>{page}</main>
      <footer className="site-footer">
        <div className="footer-brand">
          <Logo />
          <div>
            <strong>{SITE_NAME}</strong>
            <span>{TAGLINE}</span>
          </div>
        </div>
        <ul className="footer-games">
          {games.map((g) => (
            <li key={g.id}><Link to={`/play/${g.id}`}>{g.title}</Link></li>
          ))}
        </ul>
        <span className="footer-note">Free 3D games that run in your browser on phone and desktop.</span>
      </footer>
    </div>
  );
}
