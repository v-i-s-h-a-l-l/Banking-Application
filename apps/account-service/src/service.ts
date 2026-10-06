import { getPrisma } from './db.js';
import {
  NotFoundError,
  ForbiddenError,
  InsufficientFundsError,
  AccountInactiveError,
  ConflictError,
} from '@banking/errors';
import { createLogger } from '@banking/logger';
import type { LedgerEntryType } from '@banking/contracts';

const logger = createLogger('account-service:service');

// Generate a deterministic account number
function generateAccountNumber(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ACC${ts}${rand}`;
}

// ============================================================
// Account creation
// ============================================================

export async function createAccount(
  userId: string,
  accountType: 'SAVINGS' | 'CURRENT' = 'SAVINGS',
  currency = 'INR',
): Promise<Record<string, unknown>> {
  const prisma = getPrisma();

  const accountNumber = generateAccountNumber();

  const initialBalance = BigInt(1000000); // ₹10,000.00
  const account = await prisma.account.create({
    data: {
      userId,
      accountNumber,
      accountType,
      currency,
      balanceMinor: initialBalance,
      ledgerEntries: {
        create: {
          entryType: 'CREDIT',
          amountMinor: initialBalance,
          balanceAfter: initialBalance,
          description: 'Opening Deposit',
        },
      },
    },
    select: {
      id: true,
      userId: true,
      accountNumber: true,
      accountType: true,
      status: true,
      balanceMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  logger.info({ accountId: account.id, userId }, 'Account created');
  return serializeAccount(account);
}

// ============================================================
// Get account — enforce ownership
// ============================================================

export async function getAccount(
  accountId: string,
  requestingUserId: string,
): Promise<Record<string, unknown>> {
  const prisma = getPrisma();

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      userId: true,
      accountNumber: true,
      accountType: true,
      status: true,
      balanceMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  if (!account) throw new NotFoundError('Account');
  if (account.userId !== requestingUserId) throw new ForbiddenError();

  return serializeAccount(account);
}

// ============================================================
// Get all accounts for a user
// ============================================================

export async function getUserAccounts(userId: string): Promise<Record<string, unknown>[]> {
  const prisma = getPrisma();

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      accountNumber: true,
      accountType: true,
      status: true,
      balanceMinor: true,
      currency: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return accounts.map((acc: any) => serializeAccount(acc));
}

// ============================================================
// Debit — called by Transfer Service (internal)
// MUST be called inside a distributed transaction guard
// Uses SELECT FOR UPDATE to prevent concurrent over-drafts
// ============================================================

export async function debitAccount(
  accountId: string,
  amountMinor: bigint,
  transferId: string,
  description: string,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx: any) => {
    // Row-level lock
    const accounts = await tx.$queryRaw<Array<{
      id: string;
      balance_minor: bigint;
      status: string;
    }>>`
      SELECT id, balance_minor, status
      FROM accounts.accounts
      WHERE id::text = ${accountId}::text
      FOR UPDATE
    `;

    if (accounts.length === 0) throw new NotFoundError('Account');
    const account = accounts[0]!;

    if (account.status !== 'ACTIVE') throw new AccountInactiveError();

    if (account.balance_minor < amountMinor) {
      throw new InsufficientFundsError();
    }

    const newBalance = account.balance_minor - amountMinor;

    // Update balance
    await tx.$executeRaw`
      UPDATE accounts.accounts
      SET balance_minor = ${newBalance}, updated_at = NOW()
      WHERE id::text = ${accountId}::text
    `;

    // Immutable ledger entry
    await tx.ledgerEntry.create({
      data: {
        accountId,
        entryType: 'DEBIT',
        amountMinor,
        balanceAfter: newBalance,
        transferId,
        description,
      },
    });

    logger.info(
      { accountId, transferId, amountMinor: amountMinor.toString(), newBalance: newBalance.toString() },
      'Account debited',
    );
  });
}

// ============================================================
// Credit — called by Transfer Service (internal)
// ============================================================

export async function creditAccount(
  accountId: string,
  amountMinor: bigint,
  transferId: string,
  description: string,
): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx: any) => {
    const accounts = await tx.$queryRaw<Array<{
      id: string;
      balance_minor: bigint;
      status: string;
    }>>`
      SELECT id, balance_minor, status
      FROM accounts.accounts
      WHERE id::text = ${accountId}::text
      FOR UPDATE
    `;

    if (accounts.length === 0) throw new NotFoundError('Account');
    const account = accounts[0]!;

    if (account.status !== 'ACTIVE') throw new AccountInactiveError();

    const newBalance = account.balance_minor + amountMinor;

    await tx.$executeRaw`
      UPDATE accounts.accounts
      SET balance_minor = ${newBalance}, updated_at = NOW()
      WHERE id::text = ${accountId}::text
    `;

    await tx.ledgerEntry.create({
      data: {
        accountId,
        entryType: 'CREDIT',
        amountMinor,
        balanceAfter: newBalance,
        transferId,
        description,
      },
    });

    logger.info(
      { accountId, transferId, amountMinor: amountMinor.toString(), newBalance: newBalance.toString() },
      'Account credited',
    );
  });
}

// ============================================================
// Get ledger (transaction history)
// ============================================================

export async function getLedger(
  accountId: string,
  requestingUserId: string,
  page = 1,
  limit = 20,
): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  const prisma = getPrisma();

  // Ownership check
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (!account) throw new NotFoundError('Account');
  if (account.userId !== requestingUserId) throw new ForbiddenError();

  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        entryType: true,
        amountMinor: true,
        balanceAfter: true,
        transferId: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.ledgerEntry.count({ where: { accountId } }),
  ]);

  return {
    entries: entries.map((e: { id: string; entryType: string; amountMinor: bigint; balanceAfter: bigint; transferId: string | null; description: string; createdAt: Date }) => ({
      ...e,
      amountMinor: e.amountMinor.toString(),
      balanceAfter: e.balanceAfter.toString(),
    })),
    total,
  };
}

// ============================================================
// Internal: validate account exists and is active (no ownership check)
// Used by Transfer Service
// ============================================================

export async function validateAccountForTransfer(accountIdOrNumber: string): Promise<{
  id: string;
  userId: string;
  status: string;
  currency: string;
  balanceMinor: bigint;
}> {
  const prisma = getPrisma();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountIdOrNumber);
  const account = await prisma.account.findFirst({
    where: isUuid
      ? { OR: [{ id: accountIdOrNumber }, { accountNumber: accountIdOrNumber }] }
      : { accountNumber: accountIdOrNumber },
    select: { id: true, userId: true, status: true, currency: true, balanceMinor: true },
  });
  if (!account) throw new NotFoundError('Account');
  if (account.status !== 'ACTIVE') throw new AccountInactiveError();
  return account;
}

// ============================================================
// Helpers
// ============================================================

function serializeAccount(account: {
  id: string;
  userId: string;
  accountNumber: string;
  accountType: string;
  status: string;
  balanceMinor: bigint;
  currency: string;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: account.id,
    userId: account.userId,
    accountNumber: account.accountNumber,
    accountType: account.accountType,
    status: account.status,
    balanceMinor: account.balanceMinor.toString(),
    currency: account.currency,
    createdAt: account.createdAt,
  };
}
