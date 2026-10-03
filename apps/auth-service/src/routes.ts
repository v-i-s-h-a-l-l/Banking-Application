import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from './validators.js';
import {
  registerUser,
  validateCredentials,
  createSession,
  rotateSession,
  revokeSession,
  getUserById,
} from './service.js';
import { ValidationError, toHttpError } from '@banking/errors';
import { createLogger } from '@banking/logger';

const logger = createLogger('auth-service:routes');

const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 min
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/auth/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid registration data', parsed.error.flatten());
    }

    const user = await registerUser(parsed.data);

    reply.code(201).send({
      success: true,
      data: { user },
    });
  });

  // POST /auth/login
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login data', parsed.error.flatten());
    }

    const ipAddress = req.ip;
    const user = await validateCredentials(parsed.data, ipAddress);

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS },
    );

    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400 * 1000);

    await createSession(user.id, refreshToken, expiresAt, ipAddress, req.headers['user-agent']);

    logger.info({ userId: user.id }, 'Login successful');

    reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
        user,
      },
    });
  });

  // POST /auth/refresh
  app.post('/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid refresh token', parsed.error.flatten());
    }

    const newRefreshToken = uuidv4();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400 * 1000);

    const userId = await rotateSession(
      parsed.data.refreshToken,
      newRefreshToken,
      newExpiresAt,
    );

    const user = await getUserById(userId);

    const accessToken = app.jwt.sign(
      { sub: userId, email: user.email },
      { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS },
    );

    reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      },
    });
  });

  // POST /auth/logout
  app.post(
    '/auth/logout',
    { preHandler: [async (req: FastifyRequest) => { await req.jwtVerify(); }] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (parsed.success) {
        await revokeSession(parsed.data.refreshToken);
      }
      reply.send({ success: true });
    },
  );

  // GET /auth/me  — internal route called by gateway
  app.get(
    '/auth/me',
    { preHandler: [async (req: FastifyRequest) => { await req.jwtVerify(); }] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { sub } = req.user as { sub: string };
      const user = await getUserById(sub);
      reply.send({ success: true, data: { user } });
    },
  );

  // GET /health
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'auth-service' });
  });

  // GET /ready
  app.get('/ready', async (_req, reply) => {
    try {
      const { getPrisma } = await import('./db.js');
      await getPrisma().$queryRaw`SELECT 1`;
      reply.send({ status: 'ready', service: 'auth-service' });
    } catch {
      reply.code(503).send({ status: 'not_ready', service: 'auth-service' });
    }
  });
}
