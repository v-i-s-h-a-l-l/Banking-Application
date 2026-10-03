import { PrismaClient } from '@prisma/client';
import { createLogger } from '@banking/logger';

const logger = createLogger('transfer-service:db');
let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    (client as any).$on('warn', (e: { message: string }) => logger.warn({ msg: e.message }));
    (client as any).$on('error', (e: { message: string }) => logger.error({ msg: e.message }));
    _prisma = client;
  }
  return _prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
