import {
  isValidTransition,
  type TransferStatus,
  type EventType,
} from '@banking/contracts';
import { InvalidTransferStateError } from '@banking/errors';
import { getPrisma } from './db.js';
import { createLogger } from '@banking/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('transfer-service:state-machine');

/**
 * Transition a transfer to a new status.
 * Validates the transition, persists both the status update AND
 * an outbox event in the SAME database transaction.
 */
export async function transitionTransfer(
  transferId: string,
  toStatus: TransferStatus,
  correlationId: string,
  eventType?: EventType,
  eventPayload?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx: any) => {
    // Lock the transfer row to prevent race conditions
    const transfers = await tx.$queryRaw<Array<{ id: string; status: TransferStatus }>>`
      SELECT id, status
      FROM transfers.transfers
      WHERE id::text = ${transferId}::text
      FOR UPDATE
    `;

    if (transfers.length === 0) {
      throw new Error(`Transfer ${transferId} not found`);
    }

    const transfer = transfers[0]!;
    const fromStatus = transfer.status as TransferStatus;

    if (!isValidTransition(fromStatus, toStatus)) {
      throw new InvalidTransferStateError(fromStatus, toStatus);
    }

    // Update transfer status
    await tx.transfer.update({
      where: { id: transferId },
      data: {
        status: toStatus,
        ...(toStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });

    // Persist state transition event
    await tx.transferEvent.create({
      data: {
        transferId,
        fromStatus: fromStatus,
        toStatus,
        metadata: metadata ?? {},
      },
    });

    // If we need to publish an outbox event, insert it in the same transaction
    if (eventType && eventPayload) {
      await tx.outboxEvent.create({
        data: {
          eventType,
          aggregateId: transferId,
          correlationId,
          payload: {
            eventId: uuidv4(),
            eventType,
            aggregateId: transferId,
            timestamp: new Date().toISOString(),
            correlationId,
            ...eventPayload,
          },
          transferId,
        },
      });
    }

    logger.info({ transferId, fromStatus, toStatus }, 'Transfer state transition');
  });
}

// Convenience: transition to FAILED with reason
export async function failTransfer(
  transferId: string,
  reason: string,
  correlationId: string,
): Promise<void> {
  const prisma = getPrisma();

  // Get current status first
  const transfer = await prisma.transfer.findUnique({
    where: { id: transferId },
    select: { status: true, sourceAccountId: true, destinationAccountId: true, amountMinor: true, currency: true },
  });

  if (!transfer) return;

  const fromStatus = transfer.status as TransferStatus;
  if (!isValidTransition(fromStatus, 'FAILED')) {
    logger.warn({ transferId, fromStatus }, 'Cannot transition to FAILED from current status');
    return;
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.transfer.update({
      where: { id: transferId },
      data: {
        status: 'FAILED',
        failureReason: reason,
      },
    });

    await tx.transferEvent.create({
      data: {
        transferId,
        fromStatus,
        toStatus: 'FAILED',
        metadata: { reason },
      },
    });

    await tx.outboxEvent.create({
      data: {
        eventType: 'transfer.failed',
        aggregateId: transferId,
        correlationId,
        payload: {
          eventId: uuidv4(),
          eventType: 'transfer.failed',
          aggregateId: transferId,
          timestamp: new Date().toISOString(),
          correlationId,
          payload: {
            transferId,
            reason,
            sourceAccountId: transfer.sourceAccountId,
            destinationAccountId: transfer.destinationAccountId,
            amount: transfer.amountMinor.toString(),
            currency: transfer.currency,
          },
        },
        transferId,
      },
    });
  });
}
