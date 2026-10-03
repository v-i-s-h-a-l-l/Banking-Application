import { getPrisma } from './db.js';
import { transitionTransfer, failTransfer } from './state-machine.js';
import { validateAccount, debitAccount, creditAccount } from './account-client.js';
import { createLogger } from '@banking/logger';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@banking/errors';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('transfer-service:service');

export interface CreateTransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  description: string;
  idempotencyKey: string;
  initiatedByUserId: string;
  correlationId: string;
}

// ============================================================
// Create transfer (idempotent)
// ============================================================

export async function createTransfer(
  input: CreateTransferInput,
): Promise<Record<string, unknown>> {
  const prisma = getPrisma();

  // Idempotency check
  const existing = await prisma.transfer.findFirst({
    where: {
      initiatedByUserId: input.initiatedByUserId,
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (existing) {
    logger.info(
      { transferId: existing.id, idempotencyKey: input.idempotencyKey },
      'Duplicate transfer request — returning existing',
    );
    return serializeTransfer(existing);
  }

  // Validate accounts exist and are active
  const [sourceAccount, destAccount] = await Promise.all([
    validateAccount(input.sourceAccountId),
    validateAccount(input.destinationAccountId),
  ]);

  // Validate source != destination using resolved IDs
  if (sourceAccount.id === destAccount.id) {
    throw new ValidationError('Source and destination accounts must differ');
  }

  // Ownership check — initiating user must own the source account
  if (sourceAccount.userId !== input.initiatedByUserId) {
    throw new ForbiddenError('You do not own the source account');
  }

  // Currency check
  if (sourceAccount.currency !== destAccount.currency) {
    throw new ValidationError('Cross-currency transfers are not supported');
  }

  // Create transfer in CREATED state using canonical account UUIDs
  const transfer = await prisma.transfer.create({
    data: {
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destAccount.id,
      amountMinor: input.amountMinor,
      currency: sourceAccount.currency,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      initiatedByUserId: input.initiatedByUserId,
      correlationId: input.correlationId,
      status: 'CREATED',
    },
  });

  // Record initial event + outbox in one transaction
  await transitionTransfer(
    transfer.id,
    'PROCESSING',
    input.correlationId,
    'transfer.created',
    {
      payload: {
        transferId: transfer.id,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: input.amountMinor.toString(),
        currency: sourceAccount.currency,
        description: input.description,
        initiatedByUserId: input.initiatedByUserId,
      },
    },
  );

  logger.info({ transferId: transfer.id }, 'Transfer created, executing...');

  // Execute transfer asynchronously but return immediately
  // The transfer is now PROCESSING — UI polls for final state
  executeTransfer(transfer.id, input.correlationId).catch((err) => {
    logger.error({ err, transferId: transfer.id }, 'Transfer execution failed');
  });

  const updated = await prisma.transfer.findUnique({ where: { id: transfer.id } });
  return serializeTransfer(updated!);
}

// ============================================================
// Execute transfer state machine
// CREATED → PROCESSING → DEBITED → CREDITED → COMPLETED
// Any failure → FAILED
// ============================================================

async function executeTransfer(transferId: string, correlationId: string): Promise<void> {
  const prisma = getPrisma();

  const transfer = await prisma.transfer.findUnique({ where: { id: transferId } });
  if (!transfer) return;

  const amount = transfer.amountMinor.toString();

  try {
    // DEBIT source
    await debitAccount(
      transfer.sourceAccountId,
      amount,
      transferId,
      `Transfer debit: ${transfer.description}`,
    );

    await transitionTransfer(transferId, 'DEBITED', correlationId);

    // CREDIT destination
    await creditAccount(
      transfer.destinationAccountId,
      amount,
      transferId,
      `Transfer credit: ${transfer.description}`,
    );

    await transitionTransfer(
      transferId,
      'CREDITED',
      correlationId,
    );

    // COMPLETE
    await transitionTransfer(
      transferId,
      'COMPLETED',
      correlationId,
      'transfer.completed',
      {
        payload: {
          transferId,
          sourceAccountId: transfer.sourceAccountId,
          destinationAccountId: transfer.destinationAccountId,
          amount,
          currency: transfer.currency,
        },
      },
    );

    logger.info({ transferId }, 'Transfer completed successfully');
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, transferId }, 'Transfer failed during execution');
    await failTransfer(transferId, reason, correlationId).catch((e) =>
      logger.error({ err: e, transferId }, 'Failed to mark transfer as failed'),
    );
  }
}

// ============================================================
// Get transfer (ownership enforced)
// ============================================================

export async function getTransfer(
  transferId: string,
  requestingUserId: string,
): Promise<Record<string, unknown>> {
  const prisma = getPrisma();
  const transfer = await prisma.transfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new NotFoundError('Transfer');
  if (transfer.initiatedByUserId !== requestingUserId) throw new ForbiddenError();
  return serializeTransfer(transfer);
}

// ============================================================
// List transfers for user's account
// ============================================================

export async function listTransfersForAccount(
  accountId: string,
  requestingUserId: string,
  page = 1,
  limit = 20,
): Promise<{ transfers: Record<string, unknown>[]; total: number }> {
  const prisma = getPrisma();

  // Verify user owns this account via account-service
  const account = await validateAccount(accountId);
  if (account.userId !== requestingUserId) throw new ForbiddenError();

  const skip = (page - 1) * limit;

  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({
      where: {
        OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }],
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transfer.count({
      where: {
        OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }],
      },
    }),
  ]);

  return { transfers: transfers.map(serializeTransfer), total };
}

// ============================================================
// Recovery: find stuck PROCESSING/DEBITED transfers and retry
// ============================================================

export async function recoverStuckTransfers(): Promise<void> {
  const prisma = getPrisma();
  const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 min

  const stuck = await prisma.transfer.findMany({
    where: {
      status: { in: ['PROCESSING', 'DEBITED'] },
      updatedAt: { lt: stuckThreshold },
    },
    take: 10,
  });

  for (const transfer of stuck) {
    logger.warn({ transferId: transfer.id, status: transfer.status }, 'Recovering stuck transfer');

    if (transfer.status === 'PROCESSING') {
      // Hasn't even debited yet — safe to fail
      await failTransfer(transfer.id, 'Stuck in PROCESSING — recovery timeout', transfer.correlationId);
    } else if (transfer.status === 'DEBITED') {
      // Debited but not credited — must credit to restore consistency
      await executeTransfer(transfer.id, transfer.correlationId);
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function serializeTransfer(transfer: {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  status: string;
  idempotencyKey: string;
  initiatedByUserId: string;
  correlationId: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: transfer.id,
    sourceAccountId: transfer.sourceAccountId,
    destinationAccountId: transfer.destinationAccountId,
    amountMinor: transfer.amountMinor.toString(),
    currency: transfer.currency,
    description: transfer.description,
    status: transfer.status,
    idempotencyKey: transfer.idempotencyKey,
    initiatedByUserId: transfer.initiatedByUserId,
    correlationId: transfer.correlationId,
    failureReason: transfer.failureReason,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    completedAt: transfer.completedAt,
  };
}
