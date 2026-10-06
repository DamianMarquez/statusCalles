import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  pgEnum,
  pgTable,
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
