import MapView from './components/map/MapView.js';
import { AuthProvider } from './auth/AuthContext.js';
import { AuthPanel } from './auth/AuthPanel.js';
import { useState } from 'react';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.js';

export default function App() {
  const [section, setSection] = useState<'map' | 'analytics'>('map');
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
          <nav className="primary-nav" aria-label="Navegación principal">
            <button
              type="button"
              aria-current={section === 'map' ? 'page' : undefined}
              onClick={() => setSection('map')}
            >
              Mapa
            </button>
            <button
              type="button"
              aria-current={section === 'analytics' ? 'page' : undefined}
              onClick={() => setSection('analytics')}
            >
              Analytics
            </button>
          </nav>
          <div className="topbar__actions">
            <span className="location-pill">
              <span className="location-dot" /> Ciudad de Buenos Aires
            </span>
            <AuthPanel />
          </div>
        </header>
        {section === 'map' ? <MapView /> : <AnalyticsDashboard />}
      </main>
    </AuthProvider>
  );
}
