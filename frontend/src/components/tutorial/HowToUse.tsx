import { useState } from 'react';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';
import {
  NO_STREET_CONDITION_COLOR,
  STREET_CONDITION_LEVELS,
} from '../map/streetConditionCatalog.js';
import { CategoriesDemo } from './CategoriesDemo.js';
import { PopupsDemo } from './PopupsDemo.js';
import { StreetModesDemo } from './StreetModesDemo.js';
import { ZonesDemo } from './ZonesDemo.js';

const INDEX = [
  { id: 'tutorial-map-title', label: 'Explorar' },
  { id: 'tutorial-streets-title', label: 'Calles' },
  { id: 'tutorial-categories-title', label: 'Marcas y categorías' },
  { id: 'tutorial-zones-title', label: 'Zonas' },
  { id: 'tutorial-popups-title', label: 'Leyenda y popups' },
  { id: 'tutorial-filters-title', label: 'Filtros' },
  { id: 'tutorial-contribute-title', label: 'Reportar' },
  { id: 'tutorial-road-title', label: 'Informar una calle' },
  { id: 'tutorial-account-title', label: 'Seguimiento' },
] as const;

const demoReports = [
  {
    type: 'POTHOLE',
    title: 'Bache · Av. Corrientes',
    status: 'Activo',
    severity: 'Alta',
    age: 'hace 12 min',
  },
  {
    type: 'FLOOD',
    title: 'Inundación · Palermo',
    status: 'Activo',
    severity: 'Media',
    age: 'hace 1 h',
  },
  {
    type: 'ROAD_WORK',
    title: 'Obra · San Telmo',
    status: 'Antiguo',
    severity: 'Baja',
    age: 'hace 2 días',
  },
];

export function HowToUse() {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    REPORT_TYPE_OPTIONS.map((item) => item.value),
  );
  const [demoStep, setDemoStep] = useState(0);
  const visibleReports = demoReports.filter((report) => selectedTypes.includes(report.type));

  function toggleType(type: string) {
    setSelectedTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  }

  return (
    <main className="tutorial-page">
      <header className="tutorial-hero">
        <span className="analytics-eyebrow">GUÍA RÁPIDA</span>
        <h1>Cómo usar Street Status</h1>
        <p>
          Explorá el estado de las calles de CABA, entendé la información y contribuí con reportes.
        </p>
        <a className="tutorial-hero__action" href="/">
          Explorar el mapa <span aria-hidden="true">→</span>
        </a>
      </header>

      <nav className="tutorial-index" aria-label="Índice de la guía">
        {INDEX.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.label}
          </a>
        ))}
      </nav>

      <section className="tutorial-section" aria-labelledby="tutorial-map-title">
        <div className="tutorial-copy">
          <span className="tutorial-step">01 · EXPLORAR</span>
          <h2 id="tutorial-map-title">Un mapa para orientarte</h2>
          <p>
            Acercá, alejá y desplazate por el mapa. Los marcadores muestran reportes comunitarios;
            las líneas coloreadas representan la condición física estimada de segmentos oficiales;
            en vistas lejanas se agrupan por calle. Las calles en gris no tienen datos suficientes
            todavía: no se calcula un puntaje y no significa que estén en buen estado.
          </p>
          <p>
            Usá <strong>Referencias</strong> para consultar tipos de reporte, estados y escala de
            score. Los datos oficiales disponibles se identifican en sus detalles como fuente
            oficial.
          </p>
          <p>
            El mapa base utiliza OpenStreetMap. Sus colaboradores mantienen los datos cartográficos;
            consultá su{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              atribución y licencia
            </a>
            .
          </p>
        </div>
        <div className="tutorial-map-demo" aria-label="Ejemplo local de reportes en el mapa">
          <div className="tutorial-map-demo__road tutorial-map-demo__road--one" />
          <div className="tutorial-map-demo__road tutorial-map-demo__road--two" />
          <span
            className="tutorial-map-demo__pin tutorial-map-demo__pin--pothole"
            aria-label="Bache"
          >
            ●
          </span>
          <span
            className="tutorial-map-demo__pin tutorial-map-demo__pin--flood"
            aria-label="Inundación"
          >
            ●
          </span>
          <span className="tutorial-map-demo__zone">58/100</span>
          <div className="tutorial-condition-demo" aria-label="Escala de condición ilustrativa">
            {STREET_CONDITION_LEVELS.map((level) => (
              <span key={level.value} style={{ background: level.color }}>
                {level.label}
              </span>
            ))}
            <span style={{ background: NO_STREET_CONDITION_COLOR, color: '#fff' }}>
              Sin datos · gris
            </span>
          </div>
          <small>Vista ilustrativa · datos de ejemplo</small>
        </div>
      </section>

      <section className="tutorial-section" aria-labelledby="tutorial-streets-title">
        <div className="tutorial-copy">
          <span className="tutorial-step">02 · CALLES</span>
          <h2 id="tutorial-streets-title">Estado, pavimento o ambos</h2>
          <p>
            Con el selector de calles elegís qué pintar: el <strong>estado</strong> según los
            reportes, el <strong>tipo de pavimento</strong> o las dos cosas a la vez. El pavimento
            parte de una base de OpenStreetMap y la comunidad puede corregirlo.
          </p>
        </div>
        <StreetModesDemo />
      </section>

      <section
        className="tutorial-section tutorial-section--reverse"
        aria-labelledby="tutorial-categories-title"
      >
        <div className="tutorial-copy">
          <span className="tutorial-step">03 · MARCAS Y CATEGORÍAS</span>
          <h2 id="tutorial-categories-title">Qué marca cada categoría</h2>
          <p>
            Las marcas se agrupan en categorías que podés encender o apagar desde el mapa. Las obras
            públicas vienen de BA Obras y los reductores de OpenStreetMap; ninguna de las dos es una
            fuente de cortes de tránsito en vivo.
          </p>
        </div>
        <CategoriesDemo />
      </section>

      <section className="tutorial-section" aria-labelledby="tutorial-zones-title">
        <div className="tutorial-copy">
          <span className="tutorial-step">04 · ZONAS</span>
          <h2 id="tutorial-zones-title">Comunas y barrios con color</h2>
          <p>
            Activá las zonas para ver las comunas o los barrios y elegí qué colorear: el estado de
            sus calles, el pavimento predominante, las obras y reductores, o los reportes críticos.
            Es una lectura resumida: tocá una zona para ver el detalle.
          </p>
        </div>
        <ZonesDemo />
      </section>

      <section
        className="tutorial-section tutorial-section--reverse"
        aria-labelledby="tutorial-popups-title"
      >
        <div className="tutorial-copy">
          <span className="tutorial-step">05 · LEYENDA Y POPUPS</span>
          <h2 id="tutorial-popups-title">Leer la leyenda y los detalles</h2>
          <p>
            La leyenda cambia según lo que mostrás. Al tocar una calle o una zona aparece un popup
            breve con lo esencial; desde el de una calle podés ir a sus reportes.
          </p>
        </div>
        <PopupsDemo />
      </section>

      <section
        className="tutorial-section tutorial-section--reverse"
        aria-labelledby="tutorial-filters-title"
      >
        <div className="tutorial-copy">
          <span className="tutorial-step">06 · FILTROS</span>
          <h2 id="tutorial-filters-title">Encontrá lo que necesitás</h2>
          <p>
            Filtrá por tipo de problema y elegí qué reportes querés ver. Esta demostración es local:
            cambiar los filtros no consulta ni modifica datos del servicio.
          </p>
          <fieldset className="tutorial-filter-demo">
            <legend>Tipos visibles</legend>
            {REPORT_TYPE_OPTIONS.map((item) => (
              <label key={item.value}>
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(item.value)}
                  onChange={() => toggleType(item.value)}
                />
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="tutorial-report-list" aria-live="polite">
          <strong>
            {visibleReports.length}{' '}
            {visibleReports.length === 1 ? 'reporte de ejemplo' : 'reportes de ejemplo'}
          </strong>
          {visibleReports.map((report) => (
            <article key={report.type}>
              <span>{report.title}</span>
              <small>
                {report.severity} · {report.status} · {report.age}
              </small>
            </article>
          ))}
          {visibleReports.length === 0 && <p>No hay reportes de ejemplo con estos filtros.</p>}
        </div>
      </section>

      <section className="tutorial-steps" aria-labelledby="tutorial-contribute-title">
        <div>
          <span className="tutorial-step">07 · REPORTAR</span>
          <h2 id="tutorial-contribute-title">Reportar y confirmar</h2>
          <p>
            Podés crear un reporte desde el mapa, elegir su ubicación, tipo y severidad, y sumar una
            descripción opcional. Los reportes pueden crearse sin cuenta. Para confirmar si un
            problema sigue o ya no existe, iniciá sesión y usá los botones del detalle.
          </p>
        </div>
        <div className="tutorial-interaction">
          <div className="tutorial-interaction__dots" aria-label={`Paso ${demoStep + 1} de 3`}>
            {[0, 1, 2].map((step) => (
              <span className={step === demoStep ? 'is-active' : ''} key={step} />
            ))}
          </div>
          <strong>
            {
              [
                'Elegí una ubicación en el mapa',
                'Describí el problema',
                'Revisá el detalle y su antigüedad',
              ][demoStep]
            }
          </strong>
          <p>
            {
              [
                'Marcá el punto exacto o usá tu ubicación actual.',
                'Seleccioná tipo y severidad. La descripción es opcional.',
                'El estado y la actividad comunitaria ayudan a interpretar cada reporte.',
              ][demoStep]
            }
          </p>
          <button type="button" onClick={() => setDemoStep((current) => (current + 1) % 3)}>
            Ver siguiente paso
          </button>
          <small>Demostración local · no envía reportes ni votos</small>
        </div>
      </section>

      <section className="tutorial-section" aria-labelledby="tutorial-road-title">
        <div className="tutorial-copy">
          <span className="tutorial-step">08 · INFORMAR UNA CALLE</span>
          <h2 id="tutorial-road-title">Corregí el pavimento de una calle</h2>
          <p>
            Si el pavimento que ves no coincide con la realidad, abrí la calle y proponé el tipo
            correcto. La base de OpenStreetMap es el punto de partida y los aportes de la comunidad
            la reemplazan. Además de los reportes, podés sumar datos de la vía: tipo, pavimento y
            condición.
          </p>
        </div>
      </section>

      <section className="tutorial-section" aria-labelledby="tutorial-account-title">
        <div className="tutorial-copy">
          <span className="tutorial-step">09 · SEGUIMIENTO</span>
          <h2 id="tutorial-account-title">Seguimiento de tus aportes</h2>
          <p>
            En <strong>Mis reportes</strong> consultás tus contribuciones, feedback y estado. Si sos
            su autor, podés marcar un reporte como resuelto o volver a activarlo.
          </p>
        </div>
      </section>

      <aside className="tutorial-note">
        <strong>Una estimación, no una medición profesional.</strong>
        <p>
          La condición física se calcula con baches, daños, irregularidades, elevaciones anómalas y
          hundimientos reportados. Cortes, obras, inundaciones y tráfico se muestran aparte como
          señales de circulación. La cobertura y confianza varían según los datos disponibles.
        </p>
        <p>
          Las zonas resumen solo lo que hay: con pocos tramos con puntaje se ven grises, y cero
          críticos no equivale a ausencia de problemas. Los datos de pavimento y reductores de
          OpenStreetMap son colaborativos (licencia ODbL) y los de obras provienen de BA Data.
        </p>
        <p>
          La interpretación para auto común, SUV/4x4, deportivo o rally es orientativa e
          ilustrativa; no constituye consejo de seguridad ni certificación del vehículo.
        </p>
      </aside>
    </main>
  );
}
