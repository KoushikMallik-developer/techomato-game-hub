import { useEffect, useRef, useState } from 'react';
import { assetBase } from '../config.js';
import { Icon } from './Brand.jsx';

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
    <div className="t-stage-play" style={{ '--c1': game.colors[0], '--c2': game.colors[1] }}>
      <div className="t-window t-game-win" style={{ width: maxW }}>
        <div className="t-win-bar">
          <span className="t-dots"><span /><span /><span /></span>
          <span>{game.id}.play</span>
          <span className="t-row" style={{ gap: 10 }}>
            {status === 'ready' && <span className="t-live"><i />live</span>}
            {canFullscreen && (
              <button className="t-win-btn" onClick={toggleFullscreen} aria-label={full ? 'Exit full screen' : 'Full screen'}>
                <Icon name={full ? 'shrink' : 'expand'} size={15} />
              </button>
            )}
          </span>
        </div>
        <div ref={wrapRef} className={`t-frame game-frame${full ? ' full' : ''}`} style={{ aspectRatio: ratio }}>
          <div ref={mountRef} className="t-mount" />
          {status === 'loading' && <div className="t-overlay"><span className="t-spinner" />Loading {game.title}</div>}
          {status === 'error' && <div className="t-overlay">{game.title} didn't load. Check your connection and reload the page.</div>}
        </div>
      </div>
      <div className="t-stage-bar" style={{ width: maxW }}>
        {narrow && !game.portrait ? <p className="t-small t-muted">Turn your phone sideways or go full screen for the best view.</p> : <p className="t-small t-muted">Click the game to start. Progress saves on this device.</p>}
        {canFullscreen && (
          <button className="t-btn t-btn-ghost t-btn-sm" onClick={toggleFullscreen}>
            <Icon name={full ? 'shrink' : 'expand'} size={16} />
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>
    </div>
  );
}
