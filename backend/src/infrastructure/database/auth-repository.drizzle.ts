import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type { AuthRepository } from '../../modules/users/application/auth-repository.js';
import type { CreateUser, PublicUser, UserProfile } from '../../modules/users/domain/user.js';

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  display_name: string;
  password_hash?: string;
  created_at: Date | string;
  report_count?: number | string;
  confirmations_given?: number | string;
  confirmed_reports?: number | string;
  resolved_reports?: number | string;
  useful_feedback?: number | string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: new Date(row.created_at),
  };
}

const userProjection = sql`id, email, display_name, created_at`;

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async createUser(input: CreateUser): Promise<PublicUser | null> {
    try {
      const result = await this.database.execute<UserRow>(sql`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (${input.email}, ${input.displayName}, ${input.passwordHash})
        RETURNING ${userProjection}
      `);
      const row = result.rows[0];
      return row ? toPublicUser(row) : null;
    } catch (error) {
      let cause: unknown = error;
      while (cause && typeof cause === 'object') {
        if ('code' in cause && cause.code === '23505') return null;
        cause = 'cause' in cause ? cause.cause : null;
      }
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<(PublicUser & { passwordHash: string }) | null> {
    const result = await this.database.execute<UserRow>(sql`
      SELECT ${userProjection}, password_hash
      FROM users
      WHERE lower(email) = ${email}
      LIMIT 1
    `);
    const row = result.rows[0];
    return row?.password_hash ? { ...toPublicUser(row), passwordHash: row.password_hash } : null;
  }

  async findPublicUser(userId: string): Promise<PublicUser | null> {
    const result = await this.database.execute<UserRow>(sql`
      SELECT ${userProjection} FROM users WHERE id = ${userId}::uuid LIMIT 1
    `);
    const row = result.rows[0];
    return row ? toPublicUser(row) : null;
  }

  async findProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.database.execute<UserRow>(sql`
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.created_at,
        (SELECT COUNT(*) FROM street_reports r WHERE r.user_id = u.id) AS report_count,
        (SELECT COUNT(*) FROM report_feedback f WHERE f.user_id = u.id AND f.type = 'CONFIRM') AS confirmations_given,
        (SELECT COUNT(DISTINCT f.report_id) FROM report_feedback f JOIN street_reports r ON r.id = f.report_id
          WHERE r.user_id = u.id AND f.type = 'CONFIRM') AS confirmed_reports,
        (SELECT COUNT(*) FROM street_reports r WHERE r.user_id = u.id AND r.status = 'RESOLVED') AS resolved_reports,
        (SELECT COUNT(*) FROM report_feedback f JOIN street_reports r ON r.id = f.report_id
          WHERE f.user_id = u.id AND ((f.type = 'RESOLVED' AND r.status = 'RESOLVED') OR (f.type = 'CONFIRM' AND r.status = 'ACTIVE'))) AS useful_feedback
      FROM users u
      WHERE u.id = ${userId}::uuid
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...toPublicUser(row),
      reportCount: Number(row.report_count ?? 0),
      confirmationsGiven: Number(row.confirmations_given ?? 0),
      reputation: {
        confirmedReports: Number(row.confirmed_reports ?? 0),
        resolvedReports: Number(row.resolved_reports ?? 0),
        usefulFeedback: Number(row.useful_feedback ?? 0),
      },
    };
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.execute(sql`DELETE FROM auth_sessions WHERE expires_at <= NOW()`);
    await this.database.execute(sql`
      INSERT INTO auth_sessions (token_hash, user_id, expires_at)
      VALUES (${tokenHash}, ${userId}::uuid, ${expiresAt})
    `);
  }

  async findUserForSession(tokenHash: string, now: Date): Promise<PublicUser | null> {
    const result = await this.database.execute<UserRow>(sql`
      SELECT u.id, u.email, u.display_name, u.created_at
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.expires_at > ${now}
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? toPublicUser(row) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.execute(sql`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash}`);
  }
}
