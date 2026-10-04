import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import httpProxy from '@fastify/http-proxy';
import { createLogger } from '@banking/logger';
import { toHttpError, UnauthorizedError } from '@banking/errors';

import path from 'path';
import fs from 'fs';

try {
  if (typeof process.loadEnvFile === 'function') {
    const candidatePaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../../.env'),
      path.resolve(process.cwd(), '../.env'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        process.loadEnvFile(p);
        break;
      }
    }
  }
} catch {}

const logger = createLogger('api-gateway');

const PORT = Number(process.env.PORT ?? process.env.API_GATEWAY_PORT ?? 3000);
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-to-a-strong-random-secret-min-32-chars';
const RAW_CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const ALLOWED_ORIGINS = RAW_CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3001';
const ACCOUNT_SERVICE_URL = process.env.ACCOUNT_SERVICE_URL ?? 'http://127.0.0.1:3002';
const TRANSFER_SERVICE_URL = process.env.TRANSFER_SERVICE_URL ?? 'http://127.0.0.1:3003';

// Routes that do NOT require authentication
const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/refresh',
  'GET /health',
  'GET /ready',
]);

async function buildApp() {
  const app = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (RAW_CORS_ORIGIN === '*' || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
        return cb(null, true);
      }
      if (/\.vercel\.app$/.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    keyGenerator: (req) => `${req.ip}-${req.routeOptions?.url ?? req.url}`,
  });
  await app.register(jwt, { secret: JWT_SECRET });

  // ── Request logging & correlation IDs ──────────────────────────────

  app.addHook('onRequest', (req, _reply, done) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ?? req.id;
    req.headers['x-request-id'] = req.id;
    req.headers['x-correlation-id'] = correlationId;

    logger.info({
      requestId: req.id,
      correlationId,
      method: req.method,
      url: req.url,
      ip: req.ip,
    }, 'Gateway request');

    done();
  });

  // ── Auth middleware ─────────────────────────────────────────────────

  app.addHook('preHandler', async (req, reply) => {
    const urlPath = req.url.split('?')[0];
    const routeKey = `${req.method} ${urlPath}`;
    if (PUBLIC_ROUTES.has(routeKey)) return;

    // Skip internal routes (should never reach gateway in prod)
    if (req.url.includes('/internal/')) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }

    try {
      await req.jwtVerify();
    } catch {
      throw new UnauthorizedError();
    }
  });

  // ── Error handler ───────────────────────────────────────────────────

  app.setErrorHandler((error, req, reply) => {
    const { statusCode, code, message, details } = toHttpError(error);
    if (statusCode >= 500) logger.error({ err: error, requestId: req.id }, 'Gateway error');
    reply.code(statusCode).send({
      success: false,
      error: { code, message, details },
      meta: {
        requestId: req.id,
        correlationId: req.headers['x-correlation-id'],
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ── Proxy routes ────────────────────────────────────────────────────

  // Auth service: /api/auth/* → auth-service
  await app.register(httpProxy, {
    upstream: AUTH_SERVICE_URL,
    prefix: '/api/auth',
    rewritePrefix: '/auth',
    http2: false,
  });

  // Account service: /api/accounts/* → account-service
  await app.register(httpProxy, {
    upstream: ACCOUNT_SERVICE_URL,
    prefix: '/api/accounts',
    rewritePrefix: '/accounts',
    http2: false,
  });

  // Transfer service: /api/transfers/* → transfer-service
  await app.register(httpProxy, {
    upstream: TRANSFER_SERVICE_URL,
    prefix: '/api/transfers',
    rewritePrefix: '/transfers',
    http2: false,
  });

  // Transfer service: /api/accounts/:id/transfers → transfer-service
  await app.register(httpProxy, {
    upstream: TRANSFER_SERVICE_URL,
    prefix: '/api/accounts-transfers',
    rewritePrefix: '/accounts',
    http2: false,
  });

  // ── Health / Ready ──────────────────────────────────────────────────

  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'api-gateway' });
  });

  app.get('/ready', async (_req, reply) => {
    const checks = await Promise.allSettled([
      fetch(`${AUTH_SERVICE_URL}/ready`).then((r) => ({ service: 'auth', ok: r.ok })),
      fetch(`${ACCOUNT_SERVICE_URL}/ready`).then((r) => ({ service: 'account', ok: r.ok })),
      fetch(`${TRANSFER_SERVICE_URL}/ready`).then((r) => ({ service: 'transfer', ok: r.ok })),
    ]);

    const results = checks.map((c) =>
      c.status === 'fulfilled' ? c.value : { service: 'unknown', ok: false },
    );

    const allReady = results.every((r) => r.ok);
    reply.code(allReady ? 200 : 503).send({ status: allReady ? 'ready' : 'degraded', services: results });
  });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'API Gateway started');
  } catch (err) {
    logger.error({ err }, 'Failed to start API Gateway');
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
