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
      <section className="map-stage" aria-label="Área del mapa">
        <div className="map-grid" aria-hidden="true" />
        <div className="map-message">
          <span className="map-icon" aria-hidden="true">
            ⌖
          </span>
          <p className="eyebrow">CABA · ARGENTINA</p>
          <h1>Tu ciudad, calle por calle.</h1>
          <p className="description">
            El mapa de Street Status estará disponible en la próxima etapa. Pronto vas a poder
            consultar el estado de las calles de Buenos Aires.
          </p>
          <span className="coming-soon">
            <span /> Mapa en preparación
          </span>
        </div>
        <div className="map-credit">OpenStreetMap · Leaflet</div>
      </section>
    </main>
  );
}
