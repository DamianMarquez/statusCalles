import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { getTestDatabaseUrl } from './config.js';
import { DrizzleRoadInformationRepository } from './road-information-repository.drizzle.js';
import { DrizzleStreetScoreRepository } from './street-score-repository.drizzle.js';
import { StreetScoreService } from '../../modules/streets/application/street-score-service.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const repository = new DrizzleRoadInformationRepository(database);
const streetScoreService = new StreetScoreService(new DrizzleStreetScoreRepository(database));
const sourceId = randomUUID();
const streetId = randomUUID();
const segmentId = randomUUID();
const userIds = Array.from({ length: 4 }, () => randomUUID());
const proposalIds: string[] = [];

describe('road information PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'Information test', 'Street Status tests', 'Road information', 'https://example.invalid', 'test')`,
      [sourceId, `road-info-${sourceId}`],
    );
    await pool.query(
      `INSERT INTO streets (id, source_code, official_name, normalized_name, source_id)
       VALUES ($1, $2, 'Calle de prueba', 'calle de prueba', $3)`,
      [streetId, `street-${streetId}`, sourceId],
    );
    await pool.query(
      `INSERT INTO street_segments (id, source_segment_id, street_id, road_class, geometry, source_id)
       VALUES ($1, $2, $3, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.4 -34.6, -58.39 -34.6))', 4326), $4)`,
      [segmentId, `segment-${segmentId}`, streetId, sourceId],
    );
    for (let index = 0; index < userIds.length; index++) {
      await pool.query(
        `INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, 'test-hash')`,
        [userIds[index], `road-info-${userIds[index]}@example.test`, `Road info ${index}`],
      );
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_segment_information_history WHERE segment_id = $1', [
      segmentId,
    ]);
    await pool.query('DELETE FROM street_segment_information WHERE segment_id = $1', [segmentId]);
    await pool.query('DELETE FROM street_segment_information_proposals WHERE segment_id = $1', [
      segmentId,
    ]);
    await pool.query('DELETE FROM street_segments WHERE id = $1', [segmentId]);
    await pool.query('DELETE FROM streets WHERE id = $1', [streetId]);
    await pool.query('DELETE FROM geographic_sources WHERE id = $1', [sourceId]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  it('keeps proposals pending until three distinct non-authors confirm and applies partial updates with history', async () => {
    const [authorId, firstVoter, secondVoter, thirdVoter] = userIds;
    const created = await repository.createProposal(segmentId, authorId!, {
      surfaceType: 'CONCRETE_ASPHALT',
    });
    const proposalId = created?.proposals[0]?.id;
    expect(proposalId).toBeTruthy();
    proposalIds.push(proposalId!);
    expect(created?.profile.surfaceType).toBeNull();
    expect(created?.proposals[0]).toMatchObject({ confirmations: 0, status: 'PROPOSED' });

    expect(await repository.confirmProposal(proposalId!, authorId!)).toMatchObject({
      information: null,
      reason: 'AUTHOR',
    });
    await repository.confirmProposal(proposalId!, firstVoter!);
    expect(await repository.confirmProposal(proposalId!, firstVoter!)).toMatchObject({
      information: null,
      reason: 'DUPLICATE',
    });
    await repository.confirmProposal(proposalId!, secondVoter!);
    const confirmed = await repository.confirmProposal(proposalId!, thirdVoter!);
    expect(confirmed.information?.profile).toMatchObject({
      surfaceType: 'CONCRETE_ASPHALT',
      roadType: null,
      surfaceCondition: null,
    });
    expect(confirmed.information?.history).toHaveLength(1);

    const next = await repository.createProposal(segmentId, firstVoter!, {
      surfaceType: 'ASPHALT',
      surfaceCondition: 'POOR',
    });
    const nextProposalId = next?.proposals[0]?.id;
    expect(nextProposalId).toBeTruthy();
    proposalIds.push(nextProposalId!);
    await repository.confirmProposal(nextProposalId!, authorId!);
    await repository.confirmProposal(nextProposalId!, secondVoter!);
    const updated = await repository.confirmProposal(nextProposalId!, thirdVoter!);
    expect(updated.information?.profile).toMatchObject({
      surfaceType: 'ASPHALT',
      surfaceCondition: 'POOR',
    });
    expect(updated.information?.history).toHaveLength(2);
    expect(updated.information?.history[1]).toMatchObject({
      surfaceType: 'CONCRETE_ASPHALT',
    });
    const viewport = await streetScoreService.findConditionInViewport(
      { south: -34.61, north: -34.59, west: -58.41, east: -58.38 },
      16,
    );
    expect(
      viewport.features.find((feature) => feature.id === segmentId)?.properties.roadInformation,
    ).toMatchObject({ surfaceType: 'ASPHALT', surfaceCondition: 'POOR' });
  }, 30_000);

  it.each([
    { label: 'one treatment', values: ['SPEED_BUMP'] as const },
    { label: 'multiple treatments', values: ['BUS_STOP', 'GUTTER'] as const },
    { label: 'an explicitly empty list', values: [] as const },
  ])('round-trips $label through proposal and community confirmation', async ({ values }) => {
    const [authorId, firstVoter, secondVoter, thirdVoter] = userIds;
    const created = await repository.createProposal(segmentId, authorId!, {
      specialTreatments: [...values],
    });
    const proposal = created?.proposals[0];
    expect(proposal?.attributes.specialTreatments).toEqual(values);
    expect(proposal?.status).toBe('PROPOSED');

    for (const voterId of [firstVoter, secondVoter, thirdVoter]) {
      const result = await repository.confirmProposal(proposal!.id, voterId!);
      expect(result.information).toBeTruthy();
    }

    const confirmed = await repository.findForSegment(segmentId, authorId!);
    expect(confirmed?.profile.specialTreatments).toEqual(values);
    expect(confirmed?.history[0]?.specialTreatments).toEqual(values);
  }, 30_000);
});
