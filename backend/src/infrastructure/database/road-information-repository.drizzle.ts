import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import { ROAD_INFORMATION_CONFIRMATION_THRESHOLD } from '../../modules/streets/domain/road-information.js';
import type {
  RoadInformationHistoryEntry,
  RoadInformationPatch,
  RoadInformationProfile,
  RoadInformationProposal,
} from '../../modules/streets/domain/road-information.js';
import type {
  RoadInformationRepository,
  SegmentRoadInformation,
} from '../../modules/streets/application/road-information-service.js';

interface InformationRow extends Record<string, unknown> {
  segment_id: string;
  street_id: string;
  street_name: string;
  road_type: RoadInformationProfile['roadType'];
  surface_type: RoadInformationProfile['surfaceType'];
  surface_condition: RoadInformationProfile['surfaceCondition'];
  special_treatments: RoadInformationProfile['specialTreatments'];
  updated_at: Date | string | null;
}

interface ProposalRow extends Record<string, unknown> {
  id: string;
  author_id: string;
  road_type: RoadInformationPatch['roadType'] | null;
  surface_type: RoadInformationPatch['surfaceType'] | null;
  surface_condition: RoadInformationPatch['surfaceCondition'] | null;
  special_treatments: RoadInformationPatch['specialTreatments'] | null;
  status: 'PROPOSED' | 'CONFIRMED';
  created_at: Date | string;
  confirmed_at: Date | string | null;
  confirmations: number | string;
  user_has_confirmed: boolean;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapInformation(row: InformationRow, proposals: ProposalRow[], userId: string | null) {
  const profile: RoadInformationProfile = {
    roadType: row.road_type,
    surfaceType: row.surface_type,
    surfaceCondition: row.surface_condition,
    specialTreatments: row.special_treatments,
    updatedAt: iso(row.updated_at),
  };
  const mappedProposals: RoadInformationProposal[] = proposals.map((proposal) => {
    const attributes: RoadInformationPatch = {};
    if (proposal.road_type) attributes.roadType = proposal.road_type;
    if (proposal.surface_type) attributes.surfaceType = proposal.surface_type;
    if (proposal.surface_condition) attributes.surfaceCondition = proposal.surface_condition;
    if (proposal.special_treatments) attributes.specialTreatments = proposal.special_treatments;
    return {
      id: proposal.id,
      isAuthor: proposal.author_id === userId,
      attributes,
      confirmations: Number(proposal.confirmations),
      requiredConfirmations: ROAD_INFORMATION_CONFIRMATION_THRESHOLD,
      status: proposal.status,
      createdAt: iso(proposal.created_at)!,
      confirmedAt: iso(proposal.confirmed_at),
      userHasConfirmed: proposal.user_has_confirmed,
    };
  });
  const history: RoadInformationHistoryEntry[] = [];
  return {
    segmentId: row.segment_id,
    streetId: row.street_id,
    streetName: row.street_name,
    profile,
    proposals: mappedProposals,
    history,
  } satisfies SegmentRoadInformation;
}

function mapHistory(
  rows: Array<{
    id: string;
    road_type: RoadInformationPatch['roadType'] | null;
    surface_type: RoadInformationPatch['surfaceType'] | null;
    surface_condition: RoadInformationPatch['surfaceCondition'] | null;
    special_treatments: RoadInformationPatch['specialTreatments'] | null;
    created_at: Date | string;
  }>,
): RoadInformationHistoryEntry[] {
  return rows.map((row) => ({
    id: row.id,
    ...(row.road_type ? { roadType: row.road_type } : {}),
    ...(row.surface_type ? { surfaceType: row.surface_type } : {}),
    ...(row.surface_condition ? { surfaceCondition: row.surface_condition } : {}),
    ...(row.special_treatments ? { specialTreatments: row.special_treatments } : {}),
    appliedAt: iso(row.created_at)!,
  }));
}

export class DrizzleRoadInformationRepository implements RoadInformationRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findForSegment(
    segmentId: string,
    userId: string | null,
  ): Promise<SegmentRoadInformation | null> {
    const information = await this.database.execute<InformationRow>(sql`
      SELECT ss.id::text AS segment_id, s.id::text AS street_id,
        s.official_name AS street_name, current.road_type, current.surface_type,
        current.surface_condition, current.special_treatments::text[] AS special_treatments,
        current.updated_at
      FROM street_segments ss
      JOIN streets s ON s.id = ss.street_id
      LEFT JOIN street_segment_information current ON current.segment_id = ss.id
      WHERE ss.id = ${segmentId}::uuid
      LIMIT 1
    `);
    const row = information.rows[0];
    if (!row) return null;
    const proposals = await this.database.execute<ProposalRow>(sql`
      SELECT p.id::text, p.author_id::text AS author_id, p.road_type, p.surface_type,
        p.surface_condition, p.special_treatments::text[] AS special_treatments,
        p.status, p.created_at, p.confirmed_at,
        COUNT(c.user_id)::int AS confirmations,
        COALESCE(BOOL_OR(c.user_id = ${userId}::uuid), FALSE) AS user_has_confirmed
      FROM street_segment_information_proposals p
      LEFT JOIN street_segment_information_confirmations c ON c.proposal_id = p.id
      WHERE p.segment_id = ${segmentId}::uuid AND p.status = 'PROPOSED'
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 20
    `);
    const history = await this.database.execute<{
      id: string;
      road_type: RoadInformationPatch['roadType'] | null;
      surface_type: RoadInformationPatch['surfaceType'] | null;
      surface_condition: RoadInformationPatch['surfaceCondition'] | null;
      special_treatments: RoadInformationPatch['specialTreatments'] | null;
      created_at: Date | string;
    }>(sql`
      SELECT id::text, road_type, surface_type, surface_condition,
        special_treatments::text[] AS special_treatments, created_at
      FROM street_segment_information_history
      WHERE segment_id = ${segmentId}::uuid
      ORDER BY created_at DESC LIMIT 20
    `);
    return { ...mapInformation(row, proposals.rows, userId), history: mapHistory(history.rows) };
  }

  async createProposal(
    segmentId: string,
    authorId: string,
    attributes: RoadInformationPatch,
  ): Promise<SegmentRoadInformation | null> {
    const exists = await this.database.execute<{ id: string }>(sql`
      SELECT id::text FROM street_segments WHERE id = ${segmentId}::uuid LIMIT 1
    `);
    if (!exists.rows[0]) return null;
    await this.database.execute(sql`
      INSERT INTO street_segment_information_proposals (
        segment_id, author_id, road_type, surface_type, surface_condition, special_treatments
      ) VALUES (
        ${segmentId}::uuid, ${authorId}::uuid, ${attributes.roadType ?? null}::road_type,
        ${attributes.surfaceType ?? null}::surface_type,
        ${attributes.surfaceCondition ?? null}::surface_condition,
        ${sql.param(attributes.specialTreatments ?? null)}::special_treatment[]
      )
    `);
    return this.findForSegment(segmentId, authorId);
  }

  async confirmProposal(
    proposalId: string,
    userId: string,
  ): Promise<{
    information: SegmentRoadInformation | null;
    reason?: 'NOT_FOUND' | 'AUTHOR' | 'DUPLICATE';
  }> {
    return this.database.transaction(async (tx) => {
      const proposalResult = await tx.execute<{
        id: string;
        segment_id: string;
        author_id: string;
        road_type: RoadInformationPatch['roadType'] | null;
        surface_type: RoadInformationPatch['surfaceType'] | null;
        surface_condition: RoadInformationPatch['surfaceCondition'] | null;
        special_treatments: RoadInformationPatch['specialTreatments'] | null;
        status: 'PROPOSED' | 'CONFIRMED';
      }>(sql`
        SELECT id::text, segment_id::text, author_id::text, road_type, surface_type,
          surface_condition, special_treatments::text[] AS special_treatments, status
        FROM street_segment_information_proposals
        WHERE id = ${proposalId}::uuid
        FOR UPDATE
      `);
      const proposal = proposalResult.rows[0];
      if (!proposal) return { information: null, reason: 'NOT_FOUND' };
      if (proposal.author_id === userId) return { information: null, reason: 'AUTHOR' };
      if (proposal.status === 'CONFIRMED') {
        const information = await this.readInTransaction(tx, proposal.segment_id, userId);
        return { information };
      }

      const inserted = await tx.execute<{ user_id: string }>(sql`
        INSERT INTO street_segment_information_confirmations (proposal_id, user_id)
        VALUES (${proposalId}::uuid, ${userId}::uuid)
        ON CONFLICT (proposal_id, user_id) DO NOTHING
        RETURNING user_id::text
      `);
      if (!inserted.rows[0]) return { information: null, reason: 'DUPLICATE' };

      const countResult = await tx.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM street_segment_information_confirmations
        WHERE proposal_id = ${proposalId}::uuid
      `);
      const confirmationCount = countResult.rows[0]?.count ?? 0;
      if (confirmationCount >= ROAD_INFORMATION_CONFIRMATION_THRESHOLD) {
        await tx.execute(sql`
          INSERT INTO street_segment_information (
            segment_id, road_type, surface_type, surface_condition, special_treatments,
            updated_by_proposal_id, updated_at
          ) VALUES (
            ${proposal.segment_id}::uuid, ${proposal.road_type}::road_type,
            ${proposal.surface_type}::surface_type,
            ${proposal.surface_condition}::surface_condition,
            ${sql.param(proposal.special_treatments)}::special_treatment[], ${proposalId}::uuid, NOW()
          )
          ON CONFLICT (segment_id) DO UPDATE SET
            road_type = COALESCE(EXCLUDED.road_type, street_segment_information.road_type),
            surface_type = COALESCE(EXCLUDED.surface_type, street_segment_information.surface_type),
            surface_condition = COALESCE(EXCLUDED.surface_condition, street_segment_information.surface_condition),
            special_treatments = COALESCE(EXCLUDED.special_treatments, street_segment_information.special_treatments),
            updated_by_proposal_id = EXCLUDED.updated_by_proposal_id,
            updated_at = NOW()
        `);
        await tx.execute(sql`
          UPDATE street_segment_information_proposals
          SET status = 'CONFIRMED', confirmed_at = NOW()
          WHERE id = ${proposalId}::uuid
        `);
        await tx.execute(sql`
          INSERT INTO street_segment_information_history (
            segment_id, proposal_id, road_type, surface_type, surface_condition,
            special_treatments, created_at
          )
          SELECT segment_id, ${proposalId}::uuid, road_type, surface_type,
            surface_condition, special_treatments, updated_at
          FROM street_segment_information
          WHERE segment_id = ${proposal.segment_id}::uuid
        `);
      }
      const information = await this.readInTransaction(tx, proposal.segment_id, userId);
      return { information };
    });
  }

  private async readInTransaction(
    tx: Parameters<Parameters<StreetStatusDatabase['transaction']>[0]>[0],
    segmentId: string,
    userId: string | null,
  ): Promise<SegmentRoadInformation | null> {
    const result = await tx.execute<InformationRow>(sql`
      SELECT ss.id::text AS segment_id, s.id::text AS street_id,
        s.official_name AS street_name, current.road_type, current.surface_type,
        current.surface_condition, current.special_treatments::text[] AS special_treatments,
        current.updated_at
      FROM street_segments ss
      JOIN streets s ON s.id = ss.street_id
      LEFT JOIN street_segment_information current ON current.segment_id = ss.id
      WHERE ss.id = ${segmentId}::uuid LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    const proposals = await tx.execute<ProposalRow>(sql`
      SELECT p.id::text, p.author_id::text AS author_id, p.road_type, p.surface_type,
        p.surface_condition, p.special_treatments::text[] AS special_treatments,
        p.status, p.created_at, p.confirmed_at,
        COUNT(c.user_id)::int AS confirmations,
        COALESCE(BOOL_OR(c.user_id = ${userId}::uuid), FALSE) AS user_has_confirmed
      FROM street_segment_information_proposals p
      LEFT JOIN street_segment_information_confirmations c ON c.proposal_id = p.id
      WHERE p.segment_id = ${segmentId}::uuid AND p.status = 'PROPOSED'
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT 20
    `);
    const history = await tx.execute<{
      id: string;
      road_type: RoadInformationPatch['roadType'] | null;
      surface_type: RoadInformationPatch['surfaceType'] | null;
      surface_condition: RoadInformationPatch['surfaceCondition'] | null;
      special_treatments: RoadInformationPatch['specialTreatments'] | null;
      created_at: Date | string;
    }>(sql`
      SELECT id::text, road_type, surface_type, surface_condition,
        special_treatments::text[] AS special_treatments, created_at
      FROM street_segment_information_history
      WHERE segment_id = ${segmentId}::uuid
      ORDER BY created_at DESC LIMIT 20
    `);
    return { ...mapInformation(row, proposals.rows, userId), history: mapHistory(history.rows) };
  }
}
