// k6 Load Test — Transfer endpoint
// Run: k6 run tests/load/transfer.js
// Requires services running at http://localhost:3000

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 10  },  // Ramp up
    { duration: '60s', target: 50  },  // Sustained load
    { duration: '30s', target: 100 },  // Peak
    { duration: '30s', target: 0   },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed:   ['rate<0.05'],
    transfer_errors:   ['rate<0.10'],
  },
};

const errorRate = new Rate('transfer_errors');
const transferLatency = new Trend('transfer_latency');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

// Setup: create user, login, create 2 accounts
// In real k6 setup you'd use the setup() function
export function setup() {
  const email = `loadtest-${Date.now()}@nexbank.test`;
  const password = 'LoadTest123!';

  // Register
  const regRes = http.post(`${BASE_URL}/auth/register`, JSON.stringify({
    email,
    password,
    firstName: 'Load',
    lastName: 'Test',
  }), { headers: { 'Content-Type': 'application/json' } });

  if (regRes.status !== 201) {
    throw new Error(`Registration failed: ${regRes.status}`);
  }

  // Login
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email, password,
  }), { headers: { 'Content-Type': 'application/json' } });

  const loginBody = JSON.parse(loginRes.body);
  const token = loginBody.data.accessToken;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Create 2 accounts
  const acc1Res = http.post(`${BASE_URL}/accounts`, JSON.stringify({ accountType: 'SAVINGS' }), { headers });
  const acc2Res = http.post(`${BASE_URL}/accounts`, JSON.stringify({ accountType: 'SAVINGS' }), { headers });

  return {
    token,
    account1Id: JSON.parse(acc1Res.body).data.account.id,
    account2Id: JSON.parse(acc2Res.body).data.account.id,
  };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
    'Idempotency-Key': uuidv4(),
  };

  const start = Date.now();

  // POST /transfers
  const res = http.post(`${BASE_URL}/transfers`, JSON.stringify({
    sourceAccountId: data.account1Id,
    destinationAccountId: data.account2Id,
    amount: 1,  // 1 paise
    description: 'Load test transfer',
  }), { headers });

  transferLatency.add(Date.now() - start);

  const ok = check(res, {
    'transfer accepted': (r) => r.status === 202,
    'has transfer id': (r) => JSON.parse(r.body).data?.transfer?.id !== undefined,
  });

  errorRate.add(!ok);

  sleep(1);
}
