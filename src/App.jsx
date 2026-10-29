import { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import GamePage from './pages/GamePage.jsx';
import { Link, usePath, navigate } from './router.jsx';
import { SITE_NAME, TAGLINE } from './config.js';
import { Logo, Icon } from './components/Brand.jsx';
import { games } from './games/registry.js';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';
import Friends from './pages/Friends.jsx';
import { UserMenu, AuthModal } from './components/Account.jsx';
import { useAccount } from './account/AuthContext.jsx';

// light / dark, like Techomato: follows the system until the visitor picks one
function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('techomato-games-theme') || ''; } catch { return ''; } });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    try { if (theme) localStorage.setItem('techomato-games-theme', theme); } catch { /* storage blocked */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  return [dark, () => setTheme(dark ? 'light' : 'dark')];
}

function NotFound() {
  return (
    <div className="t-empty-page">
      <h1 className="t-h2">Nothing here</h1>
      <p className="t-muted">This page doesn't exist. Pick a game from the library instead.</p>
      <Link className="t-btn t-btn-accent" to="/">Open the library</Link>
    </div>
  );
}

const scrollTo = (id) => (e) => {
  e.preventDefault();
  const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (document.getElementById(id)) go(); else { navigate('/'); setTimeout(go, 80); }
};

export default function App() {
  const path = usePath();
  const [dark, toggle] = useTheme();
  const acc = useAccount();
  const m = path.match(/^\/play\/([\w-]+)/);
  const pr = path.match(/^\/profile(?:\/([\w-]+))?\/?$/);
  let page;
  if (path === '/' || path === '') page = <Home />;
  else if (m) page = <GamePage key={m[1]} id={m[1]} />;
  else if (path.startsWith('/leaderboard')) page = <Leaderboard />;
  else if (path.startsWith('/friends')) page = <Friends />;
  else if (pr) page = <Profile key={pr[1] || 'me'} uid={pr[1]} />;
  else page = <NotFound />;
  return (
    <div className="t-app">
      <a className="t-skip" href="#main" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.focus(); m.scrollIntoView(); } }}>Skip to content</a>
      <header className="t-nav">
        <div className="t-nav-in">
          <Link to="/" aria-label={`${SITE_NAME} home`} className="t-brand"><Logo /></Link>
          <nav className="t-links" aria-label="Main">
            <a href="#library" onClick={scrollTo('library')}>Library</a>
            <a href="#online" onClick={scrollTo('online')}>Play online</a>
            <a href="#how" onClick={scrollTo('how')}>How it works</a>
            {acc && acc.enabled && <Link to="/leaderboard">Leaderboards</Link>}
          </nav>
          <div className="t-row">
            <button className="t-icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Icon name={dark ? 'sun' : 'moon'} size={18} />
            </button>
            <UserMenu />
            <Link to={`/play/${games[0].id}`} className="t-btn t-btn-accent t-nav-cta" aria-label="Play now"><Icon name="play" size={16} /><span className="t-nav-cta-label">Play now</span></Link>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{page}</main>
      <AuthModal />
      <footer className="t-foot">
        <div className="t-wrap t-between t-foot-in">
          <div className="t-stack" style={{ gap: 6 }}>
            <Logo size={26} />
            <span className="t-muted t-small">{TAGLINE}</span>
          </div>
          <div className="t-row t-small t-muted" style={{ flexWrap: 'wrap' }}>
            <span>{games.length} games</span><span>·</span><span>Runs in your browser</span><span>·</span><span>Phone and desktop</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
