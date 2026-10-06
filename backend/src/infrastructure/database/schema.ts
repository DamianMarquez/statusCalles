import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { REPORT_STATUSES, REPORT_TYPES } from '../../modules/reports/domain/street-report.js';

const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
});

export const reportTypeEnum = pgEnum('report_type', REPORT_TYPES);
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES);

export const streetReports = pgTable(
  'street_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: reportTypeEnum('type').notNull(),
    severity: smallint('severity').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    location: geographyPoint('location').notNull(),
    status: reportStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('street_reports_severity_range_check', sql`${table.severity} BETWEEN 1 AND 4`),
    index('street_reports_location_gix').using('gist', table.location),
    index('street_reports_created_at_idx').on(table.createdAt),
  ],
);
