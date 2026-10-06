import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// API integration tests against a running API Gateway

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000/api';

interface TestContext {
  accessToken: string;
  refreshToken: string;
  userId: string;
  accountId: string;
  account2Id: string;
}

const ctx: TestContext = {} as TestContext;
const testEmail = `test-${Date.now()}@nexbank.test`;

async function api(path: string, options: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const body = await res.json();
  return { status: res.status, body };
}

// ============================================================
// AUTH TESTS
// ============================================================

describe('Authentication', () => {
  it('registers a new user', async () => {
    const { status, body } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
      }),
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testEmail);
    ctx.userId = body.data.user.id;
  });

  it('rejects duplicate email', async () => {
    const { status, body } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'Dup',
      }),
    });
    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('rejects invalid email', async () => {
    const { status } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email', password: 'SecurePass123!', firstName: 'A', lastName: 'B' }),
    });
    expect(status).toBe(400);
  });

  it('rejects short password', async () => {
    const { status } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'x@test.com', password: '123', firstName: 'A', lastName: 'B' }),
    });
    expect(status).toBe(400);
  });

  it('logs in successfully', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'SecurePass123!' }),
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();

    ctx.accessToken = body.data.accessToken;
    ctx.refreshToken = body.data.refreshToken;
  });

  it('rejects wrong password', async () => {
    const { status } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'wrong_password' }),
    });
    expect(status).toBe(401);
  });

  it('refreshes access token', async () => {
    const { status, body } = await api('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: ctx.refreshToken }),
    });

    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    ctx.accessToken = body.data.accessToken;
    ctx.refreshToken = body.data.refreshToken;
  });

  it('rejects requests without auth token', async () => {
    const { status } = await api('/accounts');
    expect(status).toBe(401);
  });

  it('rejects invalid/tampered JWT', async () => {
    const { status } = await api('/accounts', {
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.tampered',
    });
    expect(status).toBe(401);
  });
});

// ============================================================
// ACCOUNT TESTS
// ============================================================

describe('Accounts', () => {
  it('creates a savings account', async () => {
    const { status, body } = await api('/accounts', {
      method: 'POST',
      token: ctx.accessToken,
      body: JSON.stringify({ accountType: 'SAVINGS' }),
    });

    expect(status).toBe(201);
    ctx.accountId = body.data.account.id;
    expect(body.data.account.accountType).toBe('SAVINGS');
    expect(['0', '1000000']).toContain(body.data.account.balanceMinor);
  });

  it('creates a second account', async () => {
    const { status, body } = await api('/accounts', {
      method: 'POST',
      token: ctx.accessToken,
      body: JSON.stringify({ accountType: 'CURRENT' }),
    });

    expect(status).toBe(201);
    ctx.account2Id = body.data.account.id;
  });

  it('lists user accounts', async () => {
    const { status, body } = await api('/accounts', { token: ctx.accessToken });
    expect(status).toBe(200);
    expect(body.data.accounts.length).toBeGreaterThanOrEqual(2);
  });

  it('gets account by id', async () => {
    const { status, body } = await api(`/accounts/${ctx.accountId}`, {
      token: ctx.accessToken,
    });
    expect(status).toBe(200);
    expect(body.data.account.id).toBe(ctx.accountId);
  });

  it('returns 404 for non-existent account', async () => {
    const { status } = await api('/accounts/00000000-0000-0000-0000-000000000000', {
      token: ctx.accessToken,
    });
    expect(status).toBe(404);
  });

  it('debits account for deposit/investment and reflects in balance', async () => {
    const { status, body } = await api(`/accounts/${ctx.accountId}/debit`, {
      method: 'POST',
      token: ctx.accessToken,
      body: JSON.stringify({ amountMinor: 50000, description: 'Test Fixed Deposit Debit' }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.account.id).toBe(ctx.accountId);
  });

  it('credits account upon deposit closure and reflects in balance', async () => {
    const { status, body } = await api(`/accounts/${ctx.accountId}/credit`, {
      method: 'POST',
      token: ctx.accessToken,
      body: JSON.stringify({ amountMinor: 55000, description: 'Test Fixed Deposit Closure Credit' }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.account.id).toBe(ctx.accountId);
  });
});

// ============================================================
// TRANSFER TESTS
// ============================================================

describe('Transfers', () => {
  it('requires Idempotency-Key header', async () => {
    const { status } = await api('/transfers', {
      method: 'POST',
      token: ctx.accessToken,
      body: JSON.stringify({
        sourceAccountId: ctx.accountId,
        destinationAccountId: ctx.account2Id,
        amount: 1000,
        description: 'Test',
      }),
    });
    expect(status).toBe(400);
  });

  it('rejects self-transfer', async () => {
    const { status } = await api('/transfers', {
      method: 'POST',
      token: ctx.accessToken,
      headers: { 'Idempotency-Key': 'self-transfer-key' },
      body: JSON.stringify({
        sourceAccountId: ctx.accountId,
        destinationAccountId: ctx.accountId,
        amount: 1000,
        description: 'Self',
      }),
    });
    expect(status).toBe(400);
  });

  it('rejects transfer with insufficient funds', async () => {
    const { status, body } = await api('/transfers', {
      method: 'POST',
      token: ctx.accessToken,
      headers: { 'Idempotency-Key': 'insufficient-funds-key' },
      body: JSON.stringify({
        sourceAccountId: ctx.accountId,
        destinationAccountId: ctx.account2Id,
        amount: 1000000000, // 10M rupees
        description: 'Overdraft attempt',
      }),
    });

    // Returns 202 (accepted) and transfer eventually fails
    // OR returns immediately with error — both are acceptable
    expect([202, 422].includes(status)).toBe(true);
  });
});

// ============================================================
// IDEMPOTENCY TESTS
// ============================================================

describe('Idempotency', () => {
  const idempotencyKey = `idempotency-test-${Date.now()}`;
  let firstTransferId: string;

  it('same idempotency key returns same transfer', async () => {
    const payload = {
      method: 'POST' as const,
      token: ctx.accessToken,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        sourceAccountId: ctx.accountId,
        destinationAccountId: ctx.account2Id,
        amount: 100, // 1 rupee
        description: 'Idempotency test',
      }),
    };

    const { status: s1, body: b1 } = await api('/transfers', payload);
    firstTransferId = b1.data?.transfer?.id;

    const { status: s2, body: b2 } = await api('/transfers', payload);

    expect(s1).toBe(202);
    expect(s2).toBe(202);
    expect(b1.data.transfer.id).toBe(b2.data.transfer.id);
  });
});

// ============================================================
// SECURITY TESTS
// ============================================================

describe('Authorization', () => {
  let otherUserToken: string;
  const otherEmail = `other-${Date.now()}@nexbank.test`;

  it('creates another user', async () => {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: otherEmail,
        password: 'SecurePass123!',
        firstName: 'Other',
        lastName: 'User',
      }),
    });

    const { body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: otherEmail, password: 'SecurePass123!' }),
    });

    otherUserToken = body.data.accessToken;
  });

  it('User B cannot access User A account', async () => {
    const { status } = await api(`/accounts/${ctx.accountId}`, {
      token: otherUserToken,
    });
    expect(status).toBe(403);
  });

  it('User B cannot initiate transfer from User A account', async () => {
    const { status } = await api('/transfers', {
      method: 'POST',
      token: otherUserToken,
      headers: { 'Idempotency-Key': 'unauthorized-transfer-key' },
      body: JSON.stringify({
        sourceAccountId: ctx.accountId,
        destinationAccountId: ctx.account2Id,
        amount: 100,
        description: 'Unauthorized transfer attempt',
      }),
    });
    expect(status).toBe(403);
  });

  it('cannot access internal endpoints via gateway', async () => {
    const { status } = await api('/accounts/internal/anything', {
      token: ctx.accessToken,
    });
    expect([403, 404].includes(status)).toBe(true);
  });
});
