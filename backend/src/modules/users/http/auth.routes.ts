import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthService,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationError,
} from '../application/auth-service.js';
import { cookieOptions, sessionCookieName } from './auth-context.js';

interface RegistrationBody {
  email: string;
  displayName: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

const authBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    password: { type: 'string', minLength: 12, maxLength: 128 },
  },
} as const;

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(sessionCookieName, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

function originIsAllowed(request: FastifyRequest, allowedOrigins: string[]): boolean {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.includes(origin);
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: { service: AuthService; allowedOrigins: string[] },
): Promise<void> {
  const { service, allowedOrigins } = options;
  const protectOrigin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!originIsAllowed(request, allowedOrigins)) {
      return reply.code(403).send({ code: 'INVALID_ORIGIN', message: 'Solicitud no permitida.' });
    }
  };

  app.post<{ Body: RegistrationBody }>(
    '/auth/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      preHandler: protectOrigin,
      schema: {
        body: {
          ...authBodySchema,
          required: ['email', 'displayName', 'password'],
          properties: {
            ...authBodySchema.properties,
            displayName: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await service.register(request.body);
        setSessionCookie(reply, session.token, session.expiresAt);
        return reply.code(201).send({ user: session.user });
      } catch (error) {
        if (error instanceof EmailAlreadyRegisteredError) {
          return reply.code(409).send({
            code: 'REGISTRATION_UNAVAILABLE',
            message: 'No se pudo completar el registro.',
          });
        }
        if (error instanceof InvalidRegistrationError) {
          return reply
            .code(400)
            .send({ code: 'INVALID_REGISTRATION', message: 'Revisá los datos del registro.' });
        }
        throw error;
      }
    },
  );

  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      preHandler: protectOrigin,
      schema: { body: authBodySchema },
    },
    async (request, reply) => {
      try {
        const session = await service.login(request.body.email, request.body.password);
        await service.logout(request.cookies[sessionCookieName]);
        setSessionCookie(reply, session.token, session.expiresAt);
        return { user: session.user };
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          return reply
            .code(401)
            .send({ code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' });
        }
        throw error;
      }
    },
  );

  app.post('/auth/logout', { preHandler: protectOrigin }, async (request, reply) => {
    await service.logout(request.cookies[sessionCookieName]);
    reply.clearCookie(sessionCookieName, cookieOptions());
    return { status: 'ok' };
  });

  app.get('/auth/session', async (request) => ({ user: request.authUser }));

  app.get('/users/me', async (request, reply) => {
    if (!request.authUser) {
      return reply
        .code(401)
        .send({ code: 'AUTHENTICATION_REQUIRED', message: 'Iniciá sesión para continuar.' });
    }
    const profile = await service.getProfile(request.authUser.id);
    if (!profile)
      return reply.code(404).send({ code: 'USER_NOT_FOUND', message: 'Perfil no disponible.' });
    return profile;
  });
}
