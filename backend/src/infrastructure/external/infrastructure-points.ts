import type { Pool } from 'pg';

export interface InfrastructurePoint {
  /** Identificador estable dentro de la fuente. */
  externalId: string;
  type: string;
  name: string;
  longitude: number;
  latitude: number;
  metadata: Record<string, unknown>;
}

export interface SourceDefinition {
  slug: string;
  name: string;
  provider: string;
  dataset: string;
  sourceUrl: string;
  license: string;
}

/** Registra (o actualiza) la fuente y la deja en PROCESSING. */
export async function registerSource(pool: Pool, source: SourceDefinition): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO geographic_sources (slug, name, provider, dataset, source_url, license, last_status, last_attempt_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', NOW(), NOW())
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, provider = EXCLUDED.provider, dataset = EXCLUDED.dataset,
       source_url = EXCLUDED.source_url, license = EXCLUDED.license,
       last_status = 'PROCESSING', last_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
     RETURNING id::text AS id`,
    [source.slug, source.name, source.provider, source.dataset, source.sourceUrl, source.license],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`No se pudo registrar la fuente ${source.slug}.`);
  return id;
}

export async function markSourceSucceeded(pool: Pool, sourceId: string, count: number) {
  await pool.query(
    `UPDATE geographic_sources SET last_status = 'SUCCEEDED', last_sync_at = NOW(),
       last_record_count = $2, last_error = NULL, updated_at = NOW() WHERE id = $1::uuid`,
    [sourceId, count],
  );
}

export async function markSourceFailed(pool: Pool, sourceId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : 'Error de importación').slice(0, 4000);
  await pool.query(
    `UPDATE geographic_sources SET last_status = 'FAILED', last_error = $2, updated_at = NOW() WHERE id = $1::uuid`,
    [sourceId, message],
  );
}

/**
 * Reemplaza todos los puntos de una fuente en una transacción. Si las comunas ya están
 * importadas, descarta los puntos que caen fuera de CABA (las cajas de consulta la superan).
 */
export async function replaceInfrastructurePoints(
  pool: Pool,
  sourceId: string,
  points: InfrastructurePoint[],
): Promise<{ inserted: number; outsideCaba: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const communes = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM communes');
    const filterByCommunes = (communes.rows[0]?.n ?? 0) > 0;
    await client.query('DELETE FROM mobility_infrastructure WHERE source_id = $1::uuid', [
      sourceId,
    ]);
    let inserted = 0;
    for (let start = 0; start < points.length; start += 500) {
      const batch = points.slice(start, start + 500);
      const values: unknown[] = [sourceId];
      const rows = batch.map((point, index) => {
        const base = 2 + index * 6;
        values.push(
          point.externalId,
          point.type,
          point.name,
          point.longitude,
          point.latitude,
          JSON.stringify(point.metadata),
        );
        return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}::float8, $${base + 4}::float8, $${base + 5}::jsonb)`;
      });
      const result = await client.query(
        `INSERT INTO mobility_infrastructure (source_id, external_id, type, name, geometry, metadata, updated_at)
         SELECT $1::uuid, v.external_id, v.type, v.name, v.pt, v.metadata, NOW()
         FROM (
           SELECT v.*, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326) AS pt
           FROM (VALUES ${rows.join(', ')}) AS v(external_id, type, name, lng, lat, metadata)
         ) v
         ${
           filterByCommunes
             ? 'WHERE EXISTS (SELECT 1 FROM communes c WHERE c.geometry && v.pt AND ST_Intersects(c.geometry, v.pt))'
             : ''
         }
         ON CONFLICT (source_id, external_id) DO NOTHING`,
        values,
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return { inserted, outsideCaba: points.length - inserted };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
