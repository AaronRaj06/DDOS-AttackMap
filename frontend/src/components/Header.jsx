import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const CONNECTION = { connecting: 'Connecting', connected: 'Connected', reconnecting: 'Reconnecting' };
const MODE = { demo: 'Demo data', live: 'Radar trends', unavailable: 'No data' };

export default function Header({ connection, mode, paused, onPause, view, onView, reduced, onMotion, kiosk, onKiosk }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="header">
      <h1>Global DoS Attack Map</h1>
      <div className="header-badges">
        <span className={`badge ${connection}`} role="status">{CONNECTION[connection]}</span>
        {mode && <span className={`badge mode-${mode}`}>{MODE[mode]}</span>}
      </div>

      {kiosk ? (
        <button type="button" className="skip-link exit-kiosk" onClick={() => onKiosk(false)}>Exit kiosk mode</button>
      ) : (
        <>
          <button
            type="button"
            ref={toggleRef}
            className="btn menu-button"
            aria-expanded={open}
            aria-controls="header-actions"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'close' : 'menu'} />Menu
          </button>
          <div id="header-actions" className="actions" data-open={open}>
            <button type="button" className="btn" aria-pressed={paused} onClick={onPause}>
              <Icon name={paused ? 'play' : 'pause'} />{paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn" onClick={() => onView(view === 'globe' ? 'map' : 'globe')}>
              <Icon name={view === 'globe' ? 'map' : 'globe'} />{view === 'globe' ? 'Flat map' : '3D globe'}
            </button>
            <button type="button" className="btn" aria-pressed={reduced} onClick={onMotion}>
              <Icon name="motion" />Reduce motion
            </button>
            <button type="button" className="btn" onClick={() => onKiosk(true)}>
              <Icon name="expand" />Kiosk
            </button>
            <a className="btn" href="/export?limit=1000" download>
              <Icon name="download" />Export CSV
            </a>
          </div>
        </>
      )}
    </header>
  );
}
