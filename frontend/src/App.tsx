import MapView from './components/map/MapView.js';
import { AuthProvider } from './auth/AuthContext.js';
import { AuthPanel } from './auth/AuthPanel.js';

export default function App() {
  return (
    <AuthProvider>
      <main className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Street Status, inicio">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Street Status</span>
          </a>
          <div className="topbar__actions">
            <span className="location-pill">
              <span className="location-dot" /> Ciudad de Buenos Aires
            </span>
            <AuthPanel />
          </div>
        </header>
        <MapView />
      </main>
    </AuthProvider>
  );
}
