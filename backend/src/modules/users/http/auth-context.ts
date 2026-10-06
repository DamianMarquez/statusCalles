import type { PublicUser } from '../domain/user.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser: PublicUser | null;
  }
}

export const sessionCookieName = 'street_status_session';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api',
  };
}
