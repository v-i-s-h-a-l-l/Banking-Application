import amqplib from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@banking/logger';
import { EXCHANGE_NAME, EXCHANGE_TYPE, QUEUES, ROUTING_KEYS } from '@banking/contracts';
import type { BaseEvent } from '@banking/contracts';

const logger = createLogger('notification-worker');

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://banking:banking_secret@localhost:5672';
const RECONNECT_DELAY_MS = 5000;

const prisma = new PrismaClient();

async function handleEvent(event: BaseEvent): Promise<void> {
  // Idempotency: check if already processed
  const eventId = (event as any).eventId ?? event.aggregateId;

  const existing = await prisma.notificationRecord.findUnique({
    where: { eventId },
  });

  if (existing) {
    logger.info({ eventId }, 'Notification already delivered — skipping (idempotent)');
    return;
  }

  // Generate notification message based on event type
  let message = '';
  let recipientId = '';

  switch (event.eventType) {
    case 'transfer.created':
      message = `Transfer of ${(event.payload as any).amount} ${(event.payload as any).currency} initiated.`;
      recipientId = (event.payload as any).initiatedByUserId ?? 'unknown';
      break;
    case 'transfer.completed':
      message = `Transfer completed successfully. Amount: ${(event.payload as any).amount} ${(event.payload as any).currency}.`;
      recipientId = (event.payload as any).initiatedByUserId ?? 'unknown';
      break;
    case 'transfer.failed':
      message = `Transfer failed: ${(event.payload as any).reason}.`;
      recipientId = (event.payload as any).initiatedByUserId ?? 'unknown';
      break;
    default:
      message = `Event received: ${event.eventType}`;
      recipientId = 'system';
  }

  // Persist notification
  await prisma.notificationRecord.create({
    data: {
      eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      recipientId,
      message,
    },
  });

  logger.info(
    { eventId, eventType: event.eventType, recipientId, message },
    'Notification delivered',
  );
}

async function connect(): Promise<void> {
  let connObj: any = null;

  while (true) {
    try {
      logger.info('Connecting to RabbitMQ...');
      const connection: any = await (amqplib as any).connect(RABBITMQ_URL);
      connObj = connection;
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      const { queue } = await channel.assertQueue(QUEUES.NOTIFICATION, {
        durable: true,
        arguments: { 'x-queue-type': 'classic' },
      });

      await channel.bindQueue(queue, EXCHANGE_NAME, ROUTING_KEYS.TRANSFER_ALL);

      channel.prefetch(10);

      channel.consume(queue, async (msg: any) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString()) as BaseEvent;
          await handleEvent(content);
          channel.ack(msg);
        } catch (err) {
          logger.error({ err }, 'Failed to process notification message');
          // Nack without requeue after 3 attempts (dead-letter in production)
          channel.nack(msg, false, false);
        }
      });

      logger.info('Notification worker listening for events');

      connection.on('error', (err: any) => {
        logger.error({ err }, 'RabbitMQ connection error');
        connObj = null;
      });

      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed — reconnecting...');
        setTimeout(() => connect(), RECONNECT_DELAY_MS);
      });

      return; // success

    } catch (err) {
      logger.error({ err }, `Failed to connect to RabbitMQ — retrying in ${RECONNECT_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  }
}

async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

connect().catch((err) => {
  logger.error({ err }, 'Fatal: notification worker failed');
  process.exit(1);
});
