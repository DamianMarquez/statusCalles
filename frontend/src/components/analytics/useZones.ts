import { useEffect, useState } from 'react';
import { getZones, type ZoneLevel, type ZoneProperties } from '../../api/zonesApi.js';

/** Zonas con sus métricas. Es el estado actual de la ciudad: no depende del período elegido. */
export function useZones(level: ZoneLevel | null, retryKey = 0) {
  const [state, setState] = useState<{
    zones: ZoneProperties[] | null;
    loading: boolean;
    error: boolean;
  }>({ zones: null, loading: level !== null, error: false });

  useEffect(() => {
    if (level === null) return;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: false }));
    getZones(level, controller.signal)
      .then((collection) =>
        setState({
          zones: collection.features.map((feature) => feature.properties),
          loading: false,
          error: false,
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ zones: null, loading: false, error: true });
      });
    return () => controller.abort();
  }, [level, retryKey]);

  return state;
}
