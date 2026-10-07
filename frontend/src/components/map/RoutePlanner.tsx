import { useState, type FormEvent } from 'react';
import { calculateRoute, type CalculatedRoute, type RouteOption } from '../../api/routingApi.js';

function parsePoint(value: string): { latitude: number; longitude: number } | null {
  const [latitudeText, longitudeText, ...rest] = value.split(',').map((part) => part.trim());
  if (!latitudeText || !longitudeText || rest.length > 0) return null;
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export function RoutePlanner({ onRoute }: { onRoute: (route: CalculatedRoute | null) => void }) {
  const [open, setOpen] = useState(false);
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [option, setOption] = useState<RouteOption>('FASTEST');
  const [route, setRoute] = useState<CalculatedRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const origin = parsePoint(originText);
    const destination = parsePoint(destinationText);
    if (!origin || !destination) {
      setError('Ingresá cada ubicación como latitud, longitud.');
      return;
    }
    setLoading(true);
    try {
      const result = await calculateRoute(origin, destination, option);
      setRoute(result);
      onRoute(result);
    } catch (cause) {
      setRoute(null);
      onRoute(null);
      setError(cause instanceof Error ? cause.message : 'No pudimos calcular la ruta.');
    } finally {
      setLoading(false);
    }
  }

  function clearRoute() {
    setRoute(null);
    onRoute(null);
  }

  return (
    <aside
      className={`route-planner${open ? ' route-planner--open' : ''}`}
      aria-label="Planificador de ruta"
    >
      <button
        type="button"
        className="route-planner__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">↗</span> Cómo llegar
      </button>
      {open && (
        <div className="route-planner__panel">
          <div className="route-planner__heading">
            <div>
              <span>RUTAS EN CABA</span>
              <h2>Planificá tu recorrido</h2>
            </div>
            <button type="button" aria-label="Cerrar planificador" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <p className="route-planner__hint">
            Ingresá latitud y longitud separadas por coma. Las dos ubicaciones deben estar dentro de
            CABA.
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Desde{' '}
              <input
                aria-label="Desde"
                value={originText}
                onChange={(event) => setOriginText(event.target.value)}
                placeholder="-34.6037, -58.3816"
                autoComplete="off"
              />
            </label>
            <label>
              Hasta{' '}
              <input
                aria-label="Hasta"
                value={destinationText}
                onChange={(event) => setDestinationText(event.target.value)}
                placeholder="-34.5895, -58.3974"
                autoComplete="off"
              />
            </label>
            <label>
              Preferencia
              <select
                aria-label="Preferencia"
                value={option}
                onChange={(event) => setOption(event.target.value as RouteOption)}
              >
                <option value="FASTEST">Más rápida</option>
                <option value="AVOID_BAD_STREETS">Evitar calles malas</option>
                <option value="AVOID_BLOCKED_STREETS">Evitar calles bloqueadas</option>
              </select>
            </label>
            {error && (
              <p className="route-planner__error" role="alert">
                {error}
              </p>
            )}
            <div className="route-planner__actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Calculando…' : 'Calcular ruta'}
              </button>
              {route && (
                <button type="button" className="route-planner__clear" onClick={clearRoute}>
                  Limpiar
                </button>
              )}
            </div>
          </form>
          {route && (
            <section className="route-planner__result" aria-label="Resultado de la ruta">
              <strong>Ruta calculada según los criterios seleccionados</strong>
              <span>
                {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
              </span>
              {route.warnings.map((warning) => (
                <p className="route-planner__warning" key={warning}>
                  ⚠️ {warning}
                </p>
              ))}
              {route.affectedSegments.length > 0 && (
                <details>
                  <summary>Tramos con señales ({route.affectedSegments.length})</summary>
                  <ul>
                    {route.affectedSegments.map((segment) => (
                      <li key={segment.id}>
                        <strong>{segment.officialName}</strong>
                        <span>
                          {segment.score === null
                            ? 'Score no disponible'
                            : `Score ${segment.score}/100`}
                        </span>
                        <small>{segment.reasons.join(' · ')}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
