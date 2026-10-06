import type { CreateUser, PublicUser, UserProfile } from '../domain/user.js';

export interface AuthRepository {
  createUser(input: CreateUser): Promise<PublicUser | null>;
  findUserByEmail(email: string): Promise<(PublicUser & { passwordHash: string }) | null>;
  findPublicUser(userId: string): Promise<PublicUser | null>;
  findProfile(userId: string): Promise<UserProfile | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findUserForSession(tokenHash: string, now: Date): Promise<PublicUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
}
