import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { getTestDatabaseUrl } from './config.js';
import { DrizzleMapFeaturesRepository } from './map-features-repository.drizzle.js';
import { replaceInfrastructurePoints } from '../external/infrastructure-points.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const repository = new DrizzleMapFeaturesRepository(database);
const calmingSource = randomUUID();
const worksSource = randomUUID();
const marker = `test-${randomUUID()}`;

describe('map features PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'calming test', 'tests', 'x', 'https://example.invalid', 'test'),
              ($3, $4, 'works test', 'tests', 'x', 'https://example.invalid', 'test')`,
      [calmingSource, `calming-${marker}`, worksSource, `works-${marker}`],
    );
    await replaceInfrastructurePoints(pool, calmingSource, [
      {
        externalId: `${marker}-bump`,
        type: 'SPEED_BUMP',
        name: '',
        longitude: -58.4,
        latitude: -34.6,
        metadata: { calming: 'bump' },
      },
    ]);
    await replaceInfrastructurePoints(pool, worksSource, [
      {
        externalId: `${marker}-active`,
        type: 'PUBLIC_WORK',
        name: `Obra vigente ${marker}`,
        longitude: -58.41,
        latitude: -34.61,
        metadata: { startDate: '2025-01-01', endDate: '2999-12-31' },
      },
      {
        externalId: `${marker}-expired`,
        type: 'PUBLIC_WORK',
        name: `Obra terminada ${marker}`,
        longitude: -58.42,
        latitude: -34.62,
        metadata: { startDate: '2020-01-01', endDate: '2021-01-01' },
      },
      {
        externalId: `${marker}-no-dates`,
        type: 'PUBLIC_WORK',
        name: `Obra sin fechas ${marker}`,
        longitude: -58.43,
        latitude: -34.63,
        metadata: { startDate: null, endDate: null },
      },
      {
        externalId: `${marker}-old-open`,
        type: 'PUBLIC_WORK',
        name: `Obra vieja sin fin ${marker}`,
        longitude: -58.44,
        latitude: -34.64,
        metadata: { startDate: '2019-09-30', endDate: null },
      },
      {
        externalId: `${marker}-recent-open`,
        type: 'PUBLIC_WORK',
        name: `Obra reciente sin fin ${marker}`,
        longitude: -58.45,
        latitude: -34.65,
        metadata: { startDate: new Date().toISOString().slice(0, 10), endDate: null },
      },
    ]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM mobility_infrastructure WHERE source_id = ANY($1::uuid[])', [
      [calmingSource, worksSource],
    ]);
    await pool.query('DELETE FROM geographic_sources WHERE id = ANY($1::uuid[])', [
      [calmingSource, worksSource],
    ]);
    await pool.end();
  });

  it('returns speed reducers as points with their source', async () => {
    const features = await repository.findFeatures(['calming']);
    const ours = features.find((feature) => feature.source === `calming-${marker}`);
    expect(ours).toMatchObject({ type: 'SPEED_BUMP', longitude: -58.4, latitude: -34.6 });
  });

  it('returns only public works in force: future end date, or recent start without an end date', async () => {
    const names = (await repository.findFeatures(['works']))
      .map((feature) => feature.name)
      .filter((name) => name.includes(marker));
    expect(names.sort()).toEqual([`Obra reciente sin fin ${marker}`, `Obra vigente ${marker}`]);
  });

  it('does not mix categories', async () => {
    const calming = await repository.findFeatures(['calming']);
    expect(calming.some((feature) => feature.type === 'PUBLIC_WORK')).toBe(false);
  });
});
