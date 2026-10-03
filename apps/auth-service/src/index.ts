import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { createLogger } from '@banking/logger';
import { toHttpError, isAppError } from '@banking/errors';
import { authRoutes } from './routes.js';
import { disconnectPrisma } from './db.js';

const logger = createLogger('auth-service');

const PORT = Number(process.env.AUTH_SERVICE_PORT ?? 3001);
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-to-a-strong-random-secret-min-32-chars';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

async function buildApp() {
  const app = Fastify({
    logger: false,  // we use our own logger
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, { global: true });
  await app.register(cors, { origin: CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  });
  await app.register(jwt, { secret: JWT_SECRET });

  // Request logging
  app.addHook('onRequest', (req, _reply, done) => {
    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
    }, 'Incoming request');
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    logger.info({
      requestId: req.id,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');
    done();
  });

  // Global error handler
  app.setErrorHandler((error, req, reply) => {
    const { statusCode, code, message, details } = toHttpError(error);

    if (!isAppError(error)) {
      logger.error({ err: error, requestId: req.id }, 'Unhandled error');
    }

    reply.code(statusCode).send({
      success: false,
      error: { code, message, details },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  });

  await app.register(authRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'Auth service started');
  } catch (err) {
    logger.error({ err }, 'Failed to start auth service');
    process.exit(1);
  }

  const shutdown = async () => {
    logger.info('Shutting down auth service...');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
