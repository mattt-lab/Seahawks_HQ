import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { SEASON, LAST_UPDATED } from '../data/current.js';
import { version as APP_VERSION } from '../../package.json';

function formatLastUpdated(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const TITLES = {
  '/': 'Gameday',
  '/schedule': 'Schedule & Standings',
  '/roster': 'Roster & Injuries',
  '/predictor': 'Predictor',
};

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    document.title = `Seahawks HQ — ${TITLES[location.pathname] ?? ''}`;
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div>
      <div className="site-header">
        <header className="header">
          <NavLink to="/" className="wordmark">
            <span className="dot" />Seahawks&nbsp;HQ
          </NavLink>
          <div className="data-as-of">
            {SEASON} season
            {LAST_UPDATED && <> · Data as of {formatLastUpdated(LAST_UPDATED)}</>}
          </div>
        </header>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Gameday</NavLink>
          <NavLink to="/schedule" className={({ isActive }) => (isActive ? 'active' : '')}>Schedule</NavLink>
          <NavLink to="/roster" className={({ isActive }) => (isActive ? 'active' : '')}>Roster</NavLink>
          <NavLink to="/predictor" className={({ isActive }) => (isActive ? 'active' : '')}>Predictor</NavLink>
        </nav>
      </div>
      <div className="wrap">
        <Outlet />
        <footer style={{ textAlign: 'center', padding: '20px 0 4px', fontSize: 11, color: 'var(--muted)', letterSpacing: '1px' }}>
          v{APP_VERSION}
        </footer>
      </div>
    </div>
  );
}
