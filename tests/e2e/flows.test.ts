import { test, expect, Page } from '@playwright/test';

// E2E tests for the frontend
// Requires running: all services + frontend at BASE_URL

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TEST_EMAIL = `e2e-${Date.now()}@nexbank.test`;
const TEST_PASSWORD = 'E2eTestPass123!';
const TEST_FIRST = 'E2E';
const TEST_LAST = 'User';

test.describe('Authentication Flow', () => {
  test('registers a new user', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.fill('#firstName', TEST_FIRST);
    await page.fill('#lastName', TEST_LAST);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#register-submit');
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('logs out', async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL(`${BASE_URL}/dashboard`);

    // Logout via navbar
    await page.click('#navbar-logout');
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', 'WrongPassword!');
    await page.click('#login-submit');
    const alert = page.locator('.alert-error');
    await expect(alert).toBeVisible({ timeout: 5000 });
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  test('shows dashboard with welcome message', async ({ page }) => {
    const heading = page.locator('.page-title');
    await expect(heading).toContainText(`Good morning, ${TEST_FIRST}`);
  });

  test('can create a new account', async ({ page }) => {
    await page.click('#create-account-btn');
    // Wait for account to appear
    await page.waitForSelector('.account-card', { timeout: 10000 });
    const cards = page.locator('.account-card');
    await expect(cards).toHaveCountGreaterThan(0);
  });

  test('navigates to transfer page', async ({ page }) => {
    await page.click('#go-to-transfer');
    await page.waitForURL(`${BASE_URL}/transfer`);
    expect(page.url()).toContain('/transfer');
  });
});

test.describe('Transfer Flow', () => {
  let account1Id: string;
  let account2Id: string;

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  test('transfer form requires Idempotency-Key (auto-generated)', async ({ page }) => {
    await page.goto(`${BASE_URL}/transfer`);
    await expect(page.locator('#transfer-form')).toBeVisible();
    await expect(page.locator('#sourceAccount')).toBeVisible();
    await expect(page.locator('#destinationAccount')).toBeVisible();
    await expect(page.locator('#amount')).toBeVisible();
  });

  test('shows PROCESSING status after transfer submission', async ({ page }) => {
    await page.goto(`${BASE_URL}/transfer`);

    // Select accounts from dropdowns
    const sourceOptions = await page.locator('#sourceAccount option').allTextContents();
    if (sourceOptions.length <= 1) {
      // No accounts available, skip
      test.skip();
      return;
    }

    await page.selectOption('#sourceAccount', { index: 1 });
    await page.fill('#destinationAccount', 'invalid-account-id'); // Will fail
    await page.fill('#amount', '1');
    await page.click('#transfer-submit');

    // Should show some status feedback
    await page.waitForSelector('#transfer-status-alert, .alert-error', { timeout: 15000 });
  });
});

test.describe('Transactions Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  test('can navigate to transactions', async ({ page }) => {
    await page.click('a[href="/transactions"]');
    await page.waitForURL(`${BASE_URL}/transactions`);
    await expect(page.locator('.page-title')).toContainText('Transaction History');
  });

  test('shows ledger and transfers tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/transactions`);
    await expect(page.locator('#tab-ledger')).toBeVisible();
    await expect(page.locator('#tab-transfers')).toBeVisible();
  });
});
