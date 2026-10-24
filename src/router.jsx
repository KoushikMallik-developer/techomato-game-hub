// A tiny router (no dependency): "/" is the library, "/play/<id>" a game.
// Uses normal URLs; set window.GAMEHUB_HASH = true before the app loads to use "#/play/<id>" instead
// (for hosts that can't serve index.html for every path).
import { useEffect, useState } from 'react';

const hashMode = () => typeof window !== 'undefined' && !!window.GAMEHUB_HASH;
const base = () => (import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

export function currentPath() {
  if (hashMode()) return location.hash.replace(/^#/, '') || '/';
  const p = location.pathname.slice(base().length);
  return p || '/';
}

export function href(path) {
  return hashMode() ? `#${path}` : `${base()}${path}`;
}

export function navigate(path) {
  if (hashMode()) location.hash = path;
  else {
    history.pushState(null, '', href(path));
    window.dispatchEvent(new Event('gamehub-nav'));
  }
  window.scrollTo({ top: 0 });
}

export function usePath() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    window.addEventListener('gamehub-nav', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
      window.removeEventListener('gamehub-nav', on);
    };
  }, []);
  return path;
}

export function Link({ to, onClick, ...rest }) {
  return (
    <a
      href={href(to)}
      onClick={(e) => {
        onClick && onClick(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
