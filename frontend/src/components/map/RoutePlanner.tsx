import { useState, type FormEvent } from 'react';
import { calculateRoute, type CalculatedRoute, type RouteOption } from '../../api/routingApi.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';
import { AddressSearchInput } from './AddressSearchInput.js';
import type { UserLocation } from './types.js';

export interface RouteLocation {
  id: string;
  type: 'STREET_NUMBER' | 'INTERSECTION' | 'PLACE';
  displayName: string;
  latitude: number;
  longitude: number;
  neighborhood?: string | null;
  commune?: string | null;
  source?: 'USIG' | 'BROWSER';
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export function RoutePlanner({
  onRoute,
  currentLocation,
  onRequestLocation,
  onSelectLocation,
}: {
  onRoute: (route: CalculatedRoute | null) => void;
  currentLocation: UserLocation | null;
  onRequestLocation: () => Promise<UserLocation | null>;
  onSelectLocation: (slot: 'origin' | 'destination', location: RouteLocation | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<RouteLocation | null>(null);
  const [destination, setDestination] = useState<RouteLocation | null>(null);
  const [option, setOption] = useState<RouteOption>('FASTEST');
  const [route, setRoute] = useState<CalculatedRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!origin || !destination) {
      setError('Buscá y seleccioná un origen y un destino.');
      return;
    }
    setLoading(true);
    try {
      const result = await calculateRoute(
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
        option,
      );
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

  function setLocation(slot: 'origin' | 'destination', location: RouteLocation | null) {
    if (slot === 'origin') setOrigin(location);
    else setDestination(location);
    onSelectLocation(slot, location);
    clearRoute();
    setError('');
  }

  function pickAddress(slot: 'origin' | 'destination', address: AddressSearchResult) {
    setLocation(slot, { ...address, source: 'USIG' });
  }

  async function useCurrentLocation() {
    const location = currentLocation ?? (await onRequestLocation());
    if (!location) return;
    setLocation('origin', {
      id: 'browser:current-location',
      type: 'PLACE',
      displayName: 'Mi ubicación',
      latitude: location.latitude,
      longitude: location.longitude,
      source: 'BROWSER',
    });
  }

  function swapLocations() {
    setOrigin(destination);
    setDestination(origin);
    onSelectLocation('origin', destination);
    onSelectLocation('destination', origin);
    clearRoute();
    setError('');
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
          <p className="route-planner__hint">Buscá una dirección o una intersección en CABA.</p>
          <form onSubmit={(event) => void submit(event)}>
            <div className="route-planner__location-field">
              <AddressSearchInput
                label="Desde"
                value={origin?.source === 'USIG' ? (origin as AddressSearchResult) : null}
                displayValue={origin?.displayName}
                searchEnabled={origin?.source !== 'BROWSER'}
                onSelect={(address) => pickAddress('origin', address)}
                onClear={() => setLocation('origin', null)}
              />
              <button
                className="route-planner__use-location"
                type="button"
                onClick={() => void useCurrentLocation()}
              >
                📍 {currentLocation ? 'Usar mi ubicación' : 'Encontrar mi ubicación'}
              </button>
            </div>
            <button
              className="route-planner__swap"
              type="button"
              aria-label="Intercambiar origen y destino"
              onClick={swapLocations}
            >
              ⇅
            </button>
            <AddressSearchInput
              label="Hasta"
              value={destination?.source === 'USIG' ? (destination as AddressSearchResult) : null}
              displayValue={destination?.displayName}
              searchEnabled={destination?.source !== 'BROWSER'}
              onSelect={(address) => pickAddress('destination', address)}
              onClear={() => setLocation('destination', null)}
            />
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
