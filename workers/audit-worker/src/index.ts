import amqplib from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@banking/logger';
import { EXCHANGE_NAME, EXCHANGE_TYPE, QUEUES, ROUTING_KEYS } from '@banking/contracts';
import type { BaseEvent } from '@banking/contracts';

const logger = createLogger('audit-worker');

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://banking:banking_secret@localhost:5672';
const RECONNECT_DELAY_MS = 5000;

const prisma = new PrismaClient();

async function handleEvent(event: BaseEvent): Promise<void> {
  const eventId = (event as any).eventId ?? `${event.aggregateId}-${event.eventType}`;

  // Idempotent: skip already-processed events
  const existing = await prisma.auditRecord.findUnique({ where: { eventId } });
  if (existing) {
    logger.info({ eventId }, 'Audit record already exists — skipping (idempotent)');
    return;
  }

  await prisma.auditRecord.create({
    data: {
      eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      payload: event.payload as any,
    },
  });

  logger.info(
    { eventId, eventType: event.eventType, aggregateId: event.aggregateId },
    'Audit record stored',
  );
}

async function connect(): Promise<void> {
  while (true) {
    try {
      logger.info('Connecting to RabbitMQ...');
      const connection: any = await (amqplib as any).connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      const { queue } = await channel.assertQueue(QUEUES.AUDIT, {
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
          logger.error({ err }, 'Failed to process audit message');
          channel.nack(msg, false, false);
        }
      });

      logger.info('Audit worker listening for events');

      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed — reconnecting...');
        setTimeout(() => connect(), RECONNECT_DELAY_MS);
      });

      return;
    } catch (err) {
      logger.error({ err }, `RabbitMQ connect failed — retrying in ${RECONNECT_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  }
}

process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

connect().catch((err) => {
  logger.error({ err }, 'Fatal: audit worker failed');
  process.exit(1);
});
