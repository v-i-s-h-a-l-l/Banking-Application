import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createAccount,
  getAccount,
  getUserAccounts,
  getLedger,
  debitAccount,
  creditAccount,
  validateAccountForTransfer,
} from './service.js';
import { ValidationError } from '@banking/errors';
import { createLogger } from '@banking/logger';

const logger = createLogger('account-service:routes');

// Middleware: require internal service key for internal endpoints
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'internal-secret';

function assertInternal(req: FastifyRequest): void {
  const secret = req.headers['x-internal-secret'];
  if (secret !== INTERNAL_SECRET) {
    throw { statusCode: 403, message: 'Forbidden' };
  }
}

const createAccountSchema = z.object({
  accountType: z.enum(['SAVINGS', 'CURRENT']).optional(),
  currency: z.string().length(3).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function accountRoutes(app: FastifyInstance) {
  // JWT verification hook
  const jwtVerify = async (req: FastifyRequest) => {
    await req.jwtVerify();
  };

  // POST /accounts — create account for authenticated user
  app.post(
    '/accounts',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const parsed = createAccountSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());

      const account = await createAccount(
        userId,
        parsed.data.accountType,
        parsed.data.currency,
      );
      reply.code(201).send({ success: true, data: { account } });
    },
  );

  // GET /accounts — list user's accounts
  app.get(
    '/accounts',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const accounts = await getUserAccounts(userId);
      reply.send({ success: true, data: { accounts } });
    },
  );

  // GET /accounts/:id
  app.get(
    '/accounts/:id',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { id } = req.params as { id: string };
      const account = await getAccount(id, userId);
      reply.send({ success: true, data: { account } });
    },
  );

  // GET /accounts/:id/ledger — transaction history
  app.get(
    '/accounts/:id/ledger',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { id } = req.params as { id: string };
      const query = paginationSchema.parse(req.query);
      const result = await getLedger(id, userId, query.page, query.limit);
      reply.send({
        success: true,
        data: result.entries,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / query.limit),
        },
      });
    },
  );

  // POST /accounts/:id/debit — user debiting their own account (e.g. FD, RD, savings goals)
  app.post(
    '/accounts/:id/debit',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { id } = req.params as { id: string };
      const body = req.body as { amountMinor?: number | string; description?: string };
      if (!body?.amountMinor || BigInt(body.amountMinor) <= 0n) {
        throw new ValidationError('Amount must be positive');
      }
      // Check ownership
      await getAccount(id, userId);
      const account = await debitAccount(
        id,
        BigInt(body.amountMinor),
        null,
        body.description || 'Account Debit',
      );
      reply.send({ success: true, data: { account } });
    },
  );

  // POST /accounts/:id/credit — user crediting their own account (e.g. FD / RD closure, payouts)
  app.post(
    '/accounts/:id/credit',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { id } = req.params as { id: string };
      const body = req.body as { amountMinor?: number | string; description?: string };
      if (!body?.amountMinor || BigInt(body.amountMinor) <= 0n) {
        throw new ValidationError('Amount must be positive');
      }
      // Check ownership
      await getAccount(id, userId);
      const account = await creditAccount(
        id,
        BigInt(body.amountMinor),
        null,
        body.description || 'Account Credit',
      );
      reply.send({ success: true, data: { account } });
    },
  );

  // ── Internal endpoints (called by Transfer Service) ──────────────────

  // POST /internal/accounts/:id/debit
  app.post('/internal/accounts/:id/debit', async (req, reply) => {
    assertInternal(req);
    const { id } = req.params as { id: string };
    const body = req.body as { amountMinor: string; transferId: string; description: string };
    await debitAccount(id, BigInt(body.amountMinor), body.transferId, body.description);
    reply.send({ success: true });
  });

  // POST /internal/accounts/:id/credit
  app.post('/internal/accounts/:id/credit', async (req, reply) => {
    assertInternal(req);
    const { id } = req.params as { id: string };
    const body = req.body as { amountMinor: string; transferId: string; description: string };
    await creditAccount(id, BigInt(body.amountMinor), body.transferId, body.description);
    reply.send({ success: true });
  });

  // GET /internal/accounts/:id/validate
  app.get('/internal/accounts/:id/validate', async (req, reply) => {
    assertInternal(req);
    const { id } = req.params as { id: string };
    const account = await validateAccountForTransfer(id);
    reply.send({
      success: true,
      data: {
        ...account,
        balanceMinor: account.balanceMinor.toString(),
      },
    });
  });

  // GET /health
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'account-service' });
  });

  // GET /ready
  app.get('/ready', async (_req, reply) => {
    try {
      const { getPrisma } = await import('./db.js');
      await getPrisma().$queryRaw`SELECT 1`;
      reply.send({ status: 'ready', service: 'account-service' });
    } catch {
      reply.code(503).send({ status: 'not_ready', service: 'account-service' });
    }
  });
}
