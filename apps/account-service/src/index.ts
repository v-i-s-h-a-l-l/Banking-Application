import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { createLogger } from '@banking/logger';
import { toHttpError, isAppError } from '@banking/errors';
import { accountRoutes } from './routes.js';
import { disconnectPrisma } from './db.js';

const logger = createLogger('account-service');

const PORT = Number(process.env.ACCOUNT_SERVICE_PORT ?? 3002);
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-to-a-strong-random-secret-min-32-chars';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

// Fault injection (dev only)
const FAIL_ACCOUNT_SERVICE = process.env.FAIL_ACCOUNT_SERVICE === 'true';
const ARTIFICIAL_LATENCY_MS = Number(process.env.ARTIFICIAL_LATENCY_MS ?? 0);

async function buildApp() {
  const app = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });

  await app.register(helmet, { global: true });
  await app.register(cors, { origin: CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  });
  await app.register(jwt, { secret: JWT_SECRET });

  // Fault injection hook (dev only)
  if (process.env.NODE_ENV !== 'production') {
    app.addHook('onRequest', async (req, reply) => {
      if (ARTIFICIAL_LATENCY_MS > 0) {
        await new Promise((r) => setTimeout(r, ARTIFICIAL_LATENCY_MS));
      }
      if (FAIL_ACCOUNT_SERVICE && !req.url.includes('/health')) {
        reply.code(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Fault injected' } });
      }
    });
  }

  app.addHook('onRequest', (req, _reply, done) => {
    logger.info({ requestId: req.id, method: req.method, url: req.url }, 'Request');
    done();
  });

  app.setErrorHandler((error, req, reply) => {
    const { statusCode, code, message, details } = toHttpError(error);
    if (!isAppError(error)) logger.error({ err: error, requestId: req.id }, 'Unhandled error');
    reply.code(statusCode).send({
      success: false,
      error: { code, message, details },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  });

  await app.register(accountRoutes);
  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'Account service started');
  } catch (err) {
    logger.error({ err }, 'Failed to start');
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
