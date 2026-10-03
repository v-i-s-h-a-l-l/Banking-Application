import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createTransfer, getTransfer, listTransfersForAccount } from './service.js';
import { ValidationError } from '@banking/errors';
import { createLogger } from '@banking/logger';

const logger = createLogger('transfer-service:routes');

const createTransferSchema = z.object({
  sourceAccountId: z.string().min(1, 'Source account is required'),
  destinationAccountId: z.string().min(1, 'Destination account is required'),
  amount: z.number().int().positive('Amount must be positive'),  // Integer minor units
  description: z.string().min(1).max(500).trim(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function transferRoutes(app: FastifyInstance) {
  const jwtVerify = async (req: FastifyRequest) => {
    await req.jwtVerify();
  };

  // POST /transfers
  app.post(
    '/transfers',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const idempotencyKey = req.headers['idempotency-key'] as string;

      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required');
      }
      if (idempotencyKey.length > 128) {
        throw new ValidationError('Idempotency-Key must be 128 chars or less');
      }

      const parsed = createTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid transfer data', parsed.error.flatten());
      }

      const correlationId = (req.headers['x-correlation-id'] as string) ?? req.id;

      const transfer = await createTransfer({
        sourceAccountId: parsed.data.sourceAccountId,
        destinationAccountId: parsed.data.destinationAccountId,
        amountMinor: BigInt(parsed.data.amount),
        description: parsed.data.description,
        idempotencyKey,
        initiatedByUserId: userId,
        correlationId,
      });

      reply.code(202).send({ success: true, data: { transfer } });
    },
  );

  // GET /transfers/:id
  app.get(
    '/transfers/:id',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { id } = req.params as { id: string };
      const transfer = await getTransfer(id, userId);
      reply.send({ success: true, data: { transfer } });
    },
  );

  // GET /accounts/:accountId/transfers
  app.get(
    '/accounts/:accountId/transfers',
    { preHandler: [jwtVerify as any] },
    async (req, reply) => {
      const { sub: userId } = req.user as { sub: string };
      const { accountId } = req.params as { accountId: string };
      const query = paginationSchema.parse(req.query);
      const result = await listTransfersForAccount(accountId, userId, query.page, query.limit);
      reply.send({
        success: true,
        data: result.transfers,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / query.limit),
        },
      });
    },
  );

  // GET /health
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'transfer-service' });
  });

  // GET /ready
  app.get('/ready', async (_req, reply) => {
    try {
      const { getPrisma } = await import('./db.js');
      await getPrisma().$queryRaw`SELECT 1`;
      reply.send({ status: 'ready', service: 'transfer-service' });
    } catch {
      reply.code(503).send({ status: 'not_ready', service: 'transfer-service' });
    }
  });
}
