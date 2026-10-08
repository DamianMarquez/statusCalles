import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  pgEnum,
  pgTable,
  jsonb,
  integer,
  smallint,
  timestamp,
  uniqueIndex,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { REPORT_STATUSES, REPORT_TYPES } from '../../modules/reports/domain/street-report.js';
import { REPORT_FEEDBACK_TYPES } from '../../modules/reports/domain/report-feedback.js';
import { USER_ROLES } from '../../modules/users/domain/user.js';
import { STREET_ROAD_CLASSES } from '../../modules/streets/domain/street-road-class.js';

const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
});

export const reportTypeEnum = pgEnum('report_type', REPORT_TYPES);
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES);
export const reportFeedbackTypeEnum = pgEnum('report_feedback_type', REPORT_FEEDBACK_TYPES);
export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const reportModerationStatusEnum = pgEnum('report_moderation_status', ['VISIBLE', 'HIDDEN']);
export const reportFlagReasonEnum = pgEnum('report_flag_reason', [
  'SPAM',
  'INAPPROPRIATE',
  'FALSE_INFORMATION',
  'OTHER',
]);
export const streetRoadClassEnum = pgEnum('street_road_class', STREET_ROAD_CLASSES);

const geometryMultiLineString = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(MultiLineString,4326)',
});
const geometryMultiPolygon = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(MultiPolygon,4326)',
});
const geometryAny = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(Geometry,4326)',
});

export const geographicSources = pgTable(
  'geographic_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    provider: varchar('provider', { length: 120 }).notNull(),
    dataset: varchar('dataset', { length: 120 }).notNull(),
    sourceUrl: text('source_url').notNull(),
    license: varchar('license', { length: 80 }).notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastStatus: varchar('last_status', { length: 20 }).notNull().default('NEVER'),
    lastRecordCount: integer('last_record_count'),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('geographic_sources_slug_unique').on(table.slug)],
);

export const mobilityInfrastructure = pgTable(
  'mobility_infrastructure',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => geographicSources.id),
    externalId: varchar('external_id', { length: 180 }).notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    geometry: geometryAny('geometry').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('mobility_infrastructure_source_external_unique').on(
      table.sourceId,
      table.externalId,
    ),
    index('mobility_infrastructure_geometry_gix').using('gist', table.geometry),
    index('mobility_infrastructure_type_idx').on(table.type),
  ],
);

export const communes = pgTable(
  'communes',
  {
    id: integer('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    geometry: geometryMultiPolygon('geometry').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => geographicSources.id),
    metadata: jsonb('metadata').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('communes_geometry_gix').using('gist', table.geometry)],
);

export const neighborhoods = pgTable(
  'neighborhoods',
  {
    id: integer('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 120 }).notNull(),
    communeId: integer('commune_id')
      .notNull()
      .references(() => communes.id),
    geometry: geometryMultiPolygon('geometry').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => geographicSources.id),
    metadata: jsonb('metadata').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('neighborhoods_name_normalized_unique').on(table.normalizedName),
    index('neighborhoods_commune_id_idx').on(table.communeId),
    index('neighborhoods_geometry_gix').using('gist', table.geometry),
  ],
);

export const streets = pgTable(
  'streets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceCode: varchar('source_code', { length: 100 }).notNull(),
    officialName: varchar('official_name', { length: 200 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 200 }).notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => geographicSources.id),
    metadata: jsonb('metadata').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('streets_source_code_name_unique').on(table.sourceCode, table.normalizedName),
    index('streets_name_normalized_idx').on(table.normalizedName),
  ],
);

export const streetSegments = pgTable(
  'street_segments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceSegmentId: varchar('source_segment_id', { length: 100 }).notNull(),
    streetId: uuid('street_id')
      .notNull()
      .references(() => streets.id),
    neighborhoodId: integer('neighborhood_id').references(() => neighborhoods.id),
    communeId: integer('commune_id').references(() => communes.id),
    roadClass: streetRoadClassEnum('road_class').notNull().default('UNKNOWN'),
    geometry: geometryMultiLineString('geometry').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => geographicSources.id),
    metadata: jsonb('metadata').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('street_segments_source_id_unique').on(table.sourceSegmentId),
    index('street_segments_street_id_idx').on(table.streetId),
    index('street_segments_neighborhood_id_idx').on(table.neighborhoodId),
    index('street_segments_commune_id_idx').on(table.communeId),
    index('street_segments_geometry_gix').using('gist', table.geometry),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('USER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const streetReports = pgTable(
  'street_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    streetId: uuid('street_id').references(() => streets.id, { onDelete: 'set null' }),
    streetSegmentId: uuid('street_segment_id').references(() => streetSegments.id, {
      onDelete: 'set null',
    }),
    type: reportTypeEnum('type').notNull(),
    severity: smallint('severity').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    location: geographyPoint('location').notNull(),
    status: reportStatusEnum('status').notNull().default('ACTIVE'),
    moderationStatus: reportModerationStatusEnum('moderation_status').notNull().default('VISIBLE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('street_reports_severity_range_check', sql`${table.severity} BETWEEN 1 AND 4`),
    index('street_reports_location_gix').using('gist', table.location),
    index('street_reports_created_at_idx').on(table.createdAt),
    index('street_reports_user_id_idx').on(table.userId),
    index('street_reports_street_id_idx').on(table.streetId),
    index('street_reports_segment_id_idx').on(table.streetSegmentId),
  ],
);

export const reportFlags = pgTable(
  'report_flags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => streetReports.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: reportFlagReasonEnum('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('report_flags_report_user_unique').on(table.reportId, table.userId),
    index('report_flags_reviewed_created_idx').on(table.reviewedAt, table.createdAt),
  ],
);

export const moderationAudit = pgTable('moderation_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  moderatorId: uuid('moderator_id')
    .notNull()
    .references(() => users.id),
  reportId: uuid('report_id')
    .notNull()
    .references(() => streetReports.id),
  previousStatus: reportModerationStatusEnum('previous_status').notNull(),
  newStatus: reportModerationStatusEnum('new_status').notNull(),
  note: varchar('note', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reportFeedback = pgTable(
  'report_feedback',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => streetReports.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    voterId: uuid('voter_id'),
    type: reportFeedbackTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('report_feedback_report_voter_unique').on(table.reportId, table.voterId),
    uniqueIndex('report_feedback_report_user_unique')
      .on(table.reportId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    index('report_feedback_user_id_idx').on(table.userId),
    check(
      'report_feedback_actor_check',
      sql`(${table.userId} IS NOT NULL AND ${table.voterId} IS NULL) OR (${table.userId} IS NULL AND ${table.voterId} IS NOT NULL)`,
    ),
  ],
);
