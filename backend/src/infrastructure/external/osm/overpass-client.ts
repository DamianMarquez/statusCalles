/** Servidores públicos de Overpass, en orden de preferencia (el primero que responda). */
export const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export function overpassUrlsFromEnv(): string[] {
  return process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : DEFAULT_OVERPASS_URLS;
}

/** Caja que rodea a CABA; el cruce con el callejero o con las comunas descarta lo de afuera. */
export const CABA_BOUNDS = { south: -34.7052, west: -58.5315, north: -34.5265, east: -58.3351 };

export function boundsToOverpass(
  bounds: { south: number; west: number; north: number; east: number } = CABA_BOUNDS,
): string {
  return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
}

/**
 * Ejecuta una consulta Overpass probando cada servidor, con reintentos y espera creciente.
 * Los servidores públicos rechazan o demoran consultas grandes: conviene pedir zonas chicas.
 */
export async function fetchOverpassElements<T>(
  query: string,
  urls: string[] = overpassUrlsFromEnv(),
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<T[]> {
  let lastError: unknown = new Error('No hay servidores de Overpass configurados.');
  const attempts = options.attempts ?? 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'street-status-importer',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 200_000),
        });
        if (!response.ok) throw new Error(`Overpass (${url}) respondió ${response.status}.`);
        const body = (await response.json()) as { elements?: T[] };
        return body.elements ?? [];
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000 * (attempt + 1)));
  }
  throw lastError;
}
