const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, 'report_figures');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Mock sample accounts & user data
  const mockUser = {
    id: "usr_8921a8f2",
    email: "rohit.sharma@enterprise.bank",
    firstName: "Rohit",
    lastName: "Sharma",
  };

  const mockAccounts = [
    {
      id: "acc_9812401",
      accountNumber: "ACC202684910",
      accountType: "SAVINGS",
      balanceMinor: "4850000", // ₹48,500.00
      currency: "INR",
      status: "ACTIVE",
      createdAt: "2026-09-15T08:30:00.000Z",
    },
    {
      id: "acc_9812402",
      accountNumber: "ACC202693812",
      accountType: "CURRENT",
      balanceMinor: "12500000", // ₹125,000.00
      currency: "INR",
      status: "ACTIVE",
      createdAt: "2026-09-20T10:15:00.000Z",
    },
  ];

  const mockLedger = [
    {
      id: "led_001",
      accountId: "acc_9812401",
      entryType: "CREDIT",
      amountMinor: "1000000",
      balanceAfter: "1000000",
      description: "Initial Account Deposit",
      transferId: null,
      createdAt: "2026-09-15T08:30:00.000Z",
    },
    {
      id: "led_002",
      accountId: "acc_9812401",
      entryType: "CREDIT",
      amountMinor: "4000000",
      balanceAfter: "5000000",
      description: "Corporate Salary Credit - Tech Corp",
      transferId: "tx_991823a",
      createdAt: "2026-09-30T12:00:00.000Z",
    },
    {
      id: "led_003",
      accountId: "acc_9812401",
      entryType: "DEBIT",
      amountMinor: "150000",
      balanceAfter: "4850000",
      description: "Vendor Settlement - Cloud Infrastructure",
      transferId: "tx_991824b",
      createdAt: "2026-10-02T14:45:00.000Z",
    },
  ];

  // Intercept API routes
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { user: mockUser } }),
      });
    }

    if (url.includes('/api/accounts') && url.includes('/ledger')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: mockLedger,
          pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
        }),
      });
    }

    if (url.includes('/api/accounts') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockAccounts }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} }),
    });
  });

  console.log("Navigating to Login Page...");
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot_1_login.png'), fullPage: true });
  console.log("Captured: screenshot_1_login.png");

  console.log("Navigating to Register Page...");
  await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot_2_register.png'), fullPage: true });
  console.log("Captured: screenshot_2_register.png");

  // Inject session tokens into localStorage for authenticated pages
  await page.evaluate(({ user }) => {
    localStorage.setItem('access_token', 'mock_jwt_access_token_header_payload_signature');
    localStorage.setItem('refresh_token', 'mock_refresh_token_uuidv4');
  }, { user: mockUser });

  console.log("Navigating to Dashboard...");
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot_3_dashboard.png'), fullPage: true });
  console.log("Captured: screenshot_3_dashboard.png");

  console.log("Navigating to Transfer Page...");
  await page.goto('http://localhost:5173/transfer', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot_4_transfer.png'), fullPage: true });
  console.log("Captured: screenshot_4_transfer.png");

  console.log("Navigating to Transactions Page...");
  await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot_5_transactions.png'), fullPage: true });
  console.log("Captured: screenshot_5_transactions.png");

  await browser.close();
  console.log("All screenshots captured successfully.");
}

capture().catch((err) => {
  console.error("Capture error:", err);
  process.exit(1);
});
