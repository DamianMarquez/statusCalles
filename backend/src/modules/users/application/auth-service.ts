import { createHash, randomBytes } from 'node:crypto';
import type { AuthRepository } from './auth-repository.js';
import { hashPassword, verifyPassword } from '../domain/password-hasher.js';
import { isValidEmail, normalizeEmail, type PublicUser, type UserProfile } from '../domain/user.js';

const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const dummyPasswordHash = `scrypt$32768$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;

export class InvalidCredentialsError extends Error {}
export class EmailAlreadyRegisteredError extends Error {}
export class InvalidRegistrationError extends Error {}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async register(input: { email: string; displayName: string; password: string }) {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    if (
      !isValidEmail(email) ||
      displayName.length < 1 ||
      displayName.length > 80 ||
      input.password.length < 12 ||
      input.password.length > 128
    ) {
      throw new InvalidRegistrationError();
    }
    const user = await this.repository.createUser({
      email,
      displayName,
      passwordHash: await hashPassword(input.password),
    });
    if (!user) throw new EmailAlreadyRegisteredError();
    return this.startSession(user);
  }

  async login(emailInput: string, password: string) {
    const userWithPassword = await this.repository.findUserByEmail(normalizeEmail(emailInput));
    const validPassword = await verifyPassword(
      password,
      userWithPassword?.passwordHash ?? dummyPasswordHash,
    );
    if (!userWithPassword || !validPassword) {
      throw new InvalidCredentialsError();
    }
    const user = {
      id: userWithPassword.id,
      email: userWithPassword.email,
      displayName: userWithPassword.displayName,
      createdAt: userWithPassword.createdAt,
    };
    return this.startSession(user);
  }

  async getUserForToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.repository.findUserForSession(digestToken(token), this.clock());
  }

  async logout(token: string | undefined): Promise<void> {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      await this.repository.deleteSession(digestToken(token));
    }
  }

  getProfile(userId: string): Promise<UserProfile | null> {
    return this.repository.findProfile(userId);
  }

  private async startSession(user: PublicUser) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(this.clock().getTime() + sessionDurationMs);
    await this.repository.createSession(user.id, digestToken(token), expiresAt);
    return { user, token, expiresAt };
  }
}
