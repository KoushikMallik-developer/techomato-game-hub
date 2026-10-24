import { useEffect, useRef, useState } from 'react';
import { assetBase } from '../config.js';

// Mounts a game inside the frame and cleans it up on unmount. Every game module exports
// mount(container, opts) and returns a cleanup function; the module is loaded lazily.
export default function GameCanvas({ game }) {
  const wrapRef = useRef(null);
  const mountRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [full, setFull] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-aspect-ratio: 4/5)').matches);

  useEffect(() => {
    let cancelled = false;
    let cleanup = null;
    setStatus('loading');
    game.load()
      .then((mod) => {
        if (cancelled || !mountRef.current) return;
        cleanup = mod.mount(mountRef.current, { assetBase: assetBase() });
        setStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [game]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrapRef.current || document.webkitFullscreenElement === wrapRef.current);
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(max-aspect-ratio: 4/5)') : null;
    const onMq = () => setNarrow(!!(mq && mq.matches));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    mq && mq.addEventListener('change', onMq);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      mq && mq.removeEventListener('change', onMq);
    };
  }, []);

  const el = typeof document !== 'undefined' ? document.documentElement : null;
  const canFullscreen = !!(el && (el.requestFullscreen || el.webkitRequestFullscreen));
  const toggleFullscreen = async () => {
    const w = wrapRef.current;
    if (!w) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        await (w.requestFullscreen || w.webkitRequestFullscreen).call(w);
        // landscape games: try to turn the phone sideways while fullscreen
        if (!game.portrait && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* the browser refused; nothing else to do */ }
  };

  // games that suit a tall screen get a tall frame on phones held upright
  const tall = narrow && game.portrait;
  const { width, height } = game.size;
  const ratio = tall ? '9 / 16' : `${width} / ${height}`;
  const maxW = tall ? 'min(100%, 46vh)' : `min(100%, ${(78 * width) / height}vh)`;
  return (
    <div className="stage" style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      <div className="frame-wrap hud" style={{ width: maxW }}>
        <div ref={wrapRef} className={`game-frame${full ? ' full' : ''}`} style={{ aspectRatio: ratio }}>
          <div ref={mountRef} className="game-mount" />
          {status === 'loading' && (
            <div className="game-overlay">
              <span className="spinner" />
              <span className="overlay-title">Loading {game.title}</span>
              <span className="loadbar"><i /></span>
            </div>
          )}
          {status === 'error' && <div className="game-overlay">{game.title} didn't load. Check your connection and reload the page.</div>}
        </div>
      </div>
      <div className="stage-bar" style={{ width: maxW }}>
        <p className="stage-status"><i className={`live-dot${status === 'ready' ? '' : ' idle'}`} />{status === 'ready' ? 'Running' : status === 'error' ? 'Error' : 'Loading'}</p>
        {narrow && !game.portrait && <p className="stage-hint">Turn your phone sideways or go full screen for the best view.</p>}
        {canFullscreen && (
          <button className="btn btn-ghost" onClick={toggleFullscreen}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {full ? <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" /> : <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />}
            </svg>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>
    </div>
  );
}
