import * as amqplib from 'amqplib';
import { createLogger } from '@banking/logger';
import { getPrisma } from './db.js';
import {
  EXCHANGE_NAME,
  EXCHANGE_TYPE,
} from '@banking/contracts';

const logger = createLogger('transfer-service:outbox');

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://banking:banking_secret@localhost:5672';
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 5;

// Disable if FAIL_RABBITMQ is set (fault injection)
const FAIL_RABBITMQ = process.env.FAIL_RABBITMQ === 'true';

let connection: amqplib.Connection | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;

async function getChannel(): Promise<amqplib.Channel> {
  if (channel) return channel as amqplib.Channel;

  if (FAIL_RABBITMQ) {
    throw new Error('RabbitMQ fault injected');
  }

  // amqplib@0.10+ returns Connection from connect()
  connection = await (amqplib as any).connect(RABBITMQ_URL) as amqplib.Connection;
  channel = await (connection as any).createChannel() as amqplib.Channel;

  await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

  (connection as any).on('error', (err: Error) => {
    logger.error({ err }, 'RabbitMQ connection error');
    channel = null;
    connection = null;
  });

  (connection as any).on('close', () => {
    logger.warn('RabbitMQ connection closed');
    channel = null;
    connection = null;
  });

  return channel as amqplib.Channel;
}

/**
 * Poll unpublished outbox events and publish them to RabbitMQ.
 * Idempotent: already-published events are skipped.
 * Retryable: failed publishes increment attempt counter.
 */
async function processOutbox(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const prisma = getPrisma();

  const events = await prisma.outboxEvent.findMany({
    where: {
      publishedAt: null,
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  if (events.length === 0) return;

  let ch: amqplib.Channel;
  try {
    ch = await getChannel();
  } catch (err) {
    logger.error({ err }, 'Cannot connect to RabbitMQ — will retry');
    return;
  }

  for (const event of events) {
    try {
      const routingKey = event.eventType;
      const message = Buffer.from(JSON.stringify(event.payload));

      ch.publish(EXCHANGE_NAME, routingKey, message, {
        persistent: true,
        messageId: event.id,
        timestamp: Math.floor(event.createdAt.getTime() / 1000),
        contentType: 'application/json',
      });

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });

      logger.info({ eventId: event.id, eventType: event.eventType }, 'Outbox event published');
    } catch (err) {
      logger.error({ err, eventId: event.id }, 'Failed to publish outbox event');
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { attempts: { increment: 1 }, failedAt: new Date() },
      });
      // Reset channel on publish error
      channel = null;
    }
  }
} catch (err: any) {
  logger.warn({ err: err?.message || err }, 'Outbox processing paused');
}
}

let pollTimer: NodeJS.Timeout | null = null;

export function startOutboxWorker(): void {
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Outbox worker started');

  const poll = async () => {
    try {
      await processOutbox();
    } catch (err) {
      logger.error({ err }, 'Outbox worker error');
    } finally {
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  poll();
}

export async function stopOutboxWorker(): Promise<void> {
  if (pollTimer) clearTimeout(pollTimer);
  if (channel) {
    try { await (channel as amqplib.Channel).close(); } catch { /* ignore */ }
  }
  if (connection) {
    try { await (connection as any).close(); } catch { /* ignore */ }
  }
}
