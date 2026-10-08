import { useCallback, useEffect, useState } from 'react';
import MapView from './components/map/MapView.js';
import { AuthProvider, useAuth } from './auth/AuthContext.js';
import { AuthPanel } from './auth/AuthPanel.js';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.js';
import { MyReports } from './components/users/MyReports.js';
import type { OwnedReportDto } from './api/reportTypes.js';
import { HowToUse } from './components/tutorial/HowToUse.js';

type Section = 'map' | 'my-reports' | 'analytics';

function AppContent() {
  const [section, setSection] = useState<Section>('map');
  const [isTutorial, setIsTutorial] = useState(() => window.location.pathname === '/como-usar');
  const [startReportOnOpen, setStartReportOnOpen] = useState(false);
  const { user, openAuthDialog } = useAuth();

  useEffect(() => {
    const syncPath = () => {
      const tutorial = window.location.pathname.replace(/\/$/, '') === '/como-usar';
      setIsTutorial(tutorial);
      if (!tutorial) setSection('map');
    };
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  function navigateTo(path: '/' | '/como-usar') {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setIsTutorial(path === '/como-usar');
    if (path === '/') setSection('map');
  }

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
    setIsTutorial(false);
    setSection('map');
  }

  function showMyReports() {
    navigateTo('/');
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
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Street Status, inicio"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/');
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Street Status</span>
        </a>
        <nav className="primary-nav app-nav" aria-label="Navegación principal">
          <button
            type="button"
            aria-current={section === 'map' && !isTutorial ? 'page' : undefined}
            onClick={() => navigateTo('/')}
          >
            <span className="app-nav__icon" aria-hidden="true">
              🗺
            </span>
            <span>Mapa</span>
          </button>
          <button
            type="button"
            aria-current={section === 'my-reports' ? 'page' : undefined}
            onClick={showMyReports}
          >
            <span className="app-nav__icon" aria-hidden="true">
              📍
            </span>
            <span>Mis reportes</span>
          </button>
          <button
            type="button"
            aria-current={section === 'analytics' ? 'page' : undefined}
            onClick={() => {
              navigateTo('/');
              setSection('analytics');
            }}
          >
            <span className="app-nav__icon" aria-hidden="true">
              📊
            </span>
            <span>Estadísticas</span>
          </button>
          <button
            type="button"
            aria-current={isTutorial ? 'page' : undefined}
            onClick={() => navigateTo('/como-usar')}
          >
            <span className="app-nav__icon" aria-hidden="true">
              ℹ️
            </span>
            <span>Cómo usar</span>
          </button>
        </nav>
        <div className="topbar__actions">
          <span className="location-pill">
            <span className="location-dot" /> Ciudad de Buenos Aires
          </span>
          <AuthPanel />
        </div>
      </header>
      {isTutorial ? (
        <HowToUse />
      ) : section === 'map' ? (
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
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
