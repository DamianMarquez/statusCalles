import MapView from './components/map/MapView.js';

export default function App() {
  return (
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
        <span className="location-pill">
          <span className="location-dot" /> Ciudad de Buenos Aires
        </span>
      </header>
      <MapView />
    </main>
  );
}
