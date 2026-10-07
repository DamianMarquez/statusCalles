import { useCallback, useState } from 'react';
import MapView from './components/map/MapView.js';
import { AuthProvider, useAuth } from './auth/AuthContext.js';
import { AuthPanel } from './auth/AuthPanel.js';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.js';
import { MyReports } from './components/users/MyReports.js';
import type { OwnedReportDto } from './api/reportTypes.js';

type Section = 'map' | 'my-reports' | 'analytics';

function AppContent() {
  const [section, setSection] = useState<Section>('map');
  const [startReportOnOpen, setStartReportOnOpen] = useState(false);
  const { user, openAuthDialog } = useAuth();

  function openOwnedReport(report: OwnedReportDto) {
    const url = new URL(window.location.href);
    for (const key of ['types', 'statuses', 'period', 'fromDate', 'toDate', 'minSeverity']) {
      url.searchParams.delete(key);
    }
    url.searchParams.set('onlyMine', 'true');
    url.searchParams.set('focusLat', String(report.location.latitude));
    url.searchParams.set('focusLng', String(report.location.longitude));
    url.searchParams.set('focusId', report.id);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSection('map');
  }

  function showMyReports() {
    if (!user) {
      openAuthDialog();
      return;
    }
    setSection('my-reports');
  }

  const markReportStartHandled = useCallback(() => setStartReportOnOpen(false), []);
  const createReportFromEmptyState = useCallback(() => {
    setStartReportOnOpen(true);
    setSection('map');
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Street Status, inicio"
          onClick={(event) => {
            event.preventDefault();
            setSection('map');
          }}
        >
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
            aria-current={section === 'my-reports' ? 'page' : undefined}
            onClick={showMyReports}
          >
            Mis reportes
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
      {section === 'map' ? (
        <MapView
          startReportOnOpen={startReportOnOpen}
          onStartReportHandled={markReportStartHandled}
        />
      ) : section === 'my-reports' && user ? (
        <MyReports onViewMap={openOwnedReport} onCreateReport={createReportFromEmptyState} />
      ) : section === 'analytics' ? (
        <AnalyticsDashboard />
      ) : (
        <MapView />
      )}
      <nav className="mobile-nav" aria-label="Navegación móvil">
        <button
          type="button"
          aria-current={section === 'map' ? 'page' : undefined}
          onClick={() => setSection('map')}
        >
          🗺<span>Mapa</span>
        </button>
        <button
          type="button"
          aria-current={section === 'my-reports' ? 'page' : undefined}
          onClick={showMyReports}
        >
          📍<span>Mis reportes</span>
        </button>
        <button
          type="button"
          aria-current={section === 'analytics' ? 'page' : undefined}
          onClick={() => setSection('analytics')}
        >
          📊<span>Analytics</span>
        </button>
      </nav>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
