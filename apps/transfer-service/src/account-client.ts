import fetch from 'node-fetch';
import { createLogger } from '@banking/logger';
import { ServiceUnavailableError, InsufficientFundsError } from '@banking/errors';

const logger = createLogger('transfer-service:account-client');

const ACCOUNT_SERVICE_URL = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3002';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'internal-secret';
const TIMEOUT_MS = 10000;

const headers = {
  'Content-Type': 'application/json',
  'x-internal-secret': INTERNAL_SECRET,
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateAccount(accountId: string): Promise<{
  id: string;
  userId: string;
  status: string;
  currency: string;
  balanceMinor: string;
}> {
  try {
    const res = await withTimeout(
      fetch(`${ACCOUNT_SERVICE_URL}/internal/accounts/${accountId}/validate`, {
        headers,
      }),
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.json() as any;
      throw new ServiceUnavailableError(`Account service: ${body?.error?.message ?? res.statusText}`);
    }
    const body = await res.json() as any;
    return body.data;
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    logger.error({ err, accountId }, 'Failed to validate account');
    throw new ServiceUnavailableError('Account service');
  }
}

export async function debitAccount(
  accountId: string,
  amountMinor: string,
  transferId: string,
  description: string,
): Promise<void> {
  try {
    const res = await withTimeout(
      fetch(`${ACCOUNT_SERVICE_URL}/internal/accounts/${accountId}/debit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amountMinor, transferId, description }),
      }),
      TIMEOUT_MS,
    );

    if (!res.ok) {
      const body = await res.json() as any;
      const code = body?.error?.code;
      if (code === 'INSUFFICIENT_FUNDS') throw new InsufficientFundsError();
      if (code === 'ACCOUNT_INACTIVE') throw new Error('Account inactive');
      throw new ServiceUnavailableError(`Account debit failed: ${body?.error?.message ?? res.statusText}`);
    }
  } catch (err) {
    if (
      err instanceof InsufficientFundsError ||
      err instanceof ServiceUnavailableError
    ) throw err;
    logger.error({ err, accountId, transferId }, 'Debit request failed');
    throw new ServiceUnavailableError('Account service');
  }
}

export async function creditAccount(
  accountId: string,
  amountMinor: string,
  transferId: string,
  description: string,
): Promise<void> {
  try {
    const res = await withTimeout(
      fetch(`${ACCOUNT_SERVICE_URL}/internal/accounts/${accountId}/credit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amountMinor, transferId, description }),
      }),
      TIMEOUT_MS,
    );

    if (!res.ok) {
      const body = await res.json() as any;
      throw new ServiceUnavailableError(`Account credit failed: ${body?.error?.message ?? res.statusText}`);
    }
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    logger.error({ err, accountId, transferId }, 'Credit request failed');
    throw new ServiceUnavailableError('Account service');
  }
}
