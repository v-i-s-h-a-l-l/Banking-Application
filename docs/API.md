# API Documentation

Base URL: `http://localhost:3000/api` (local) or `https://banking-api-gateway.fly.dev/api` (prod)

## Authentication

All endpoints (except auth) require:
```
Authorization: Bearer <access_token>
```

---

## Auth Service

### POST /auth/register
Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response 201:**
```json
{ "success": true, "data": { "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." } } }
```

---

### POST /auth/login

**Request:**
```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "uuid-v4",
    "expiresIn": 900,
    "user": { "id": "...", "email": "..." }
  }
}
```

---

### POST /auth/refresh

**Request:**
```json
{ "refreshToken": "uuid-v4" }
```

**Response 200:**
```json
{ "success": true, "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }
```

---

### POST /auth/logout

**Request:**
```json
{ "refreshToken": "uuid-v4" }
```

---

## Account Service

### POST /accounts
Create an account.

**Request:**
```json
{ "accountType": "SAVINGS" }
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "account": {
      "id": "uuid",
      "accountNumber": "ACC12345678",
      "accountType": "SAVINGS",
      "balanceMinor": "0",
      "currency": "INR",
      "status": "ACTIVE"
    }
  }
}
```

> Note: `balanceMinor` is a string representing integer paise (100 paise = ₹1)

---

### GET /accounts
List all accounts for authenticated user.

---

### GET /accounts/:id
Get single account (user must own it).

---

### GET /accounts/:id/ledger?page=1&limit=20
Get immutable ledger entries (transaction history).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "entryType": "DEBIT",
      "amountMinor": "100000",
      "balanceAfter": "900000",
      "description": "Transfer debit: Payment",
      "transferId": "uuid",
      "createdAt": "2026-10-01T12:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

---

## Transfer Service

### POST /transfers

**Required header:** `Idempotency-Key: <unique-per-user-per-transfer>`

**Request:**
```json
{
  "sourceAccountId": "uuid",
  "destinationAccountId": "uuid",
  "amount": 10000,
  "description": "Monthly rent"
}
```
> `amount` is in **integer minor units** (paise). `10000` = ₹100.00

**Response 202 Accepted:**
```json
{
  "success": true,
  "data": {
    "transfer": {
      "id": "uuid",
      "status": "PROCESSING",
      "amountMinor": "10000",
      "currency": "INR",
      "sourceAccountId": "uuid",
      "destinationAccountId": "uuid",
      "correlationId": "uuid",
      "createdAt": "2026-10-01T12:00:00Z"
    }
  }
}
```

> **Important:** `202 Accepted` means the transfer was accepted and is being processed.
> The frontend **must poll** `GET /transfers/:id` to get the final status.
> Never display success merely because 202 was received.

---

### GET /transfers/:id
Get transfer status (must own the transfer).

**Response:**
```json
{
  "success": true,
  "data": {
    "transfer": {
      "id": "uuid",
      "status": "COMPLETED",
      "amountMinor": "10000",
      "completedAt": "2026-10-01T12:00:05Z",
      "failureReason": null
    }
  }
}
```

**Status values:** `CREATED` → `PROCESSING` → `DEBITED` → `CREDITED` → `COMPLETED` | `FAILED`

---

## Error Format

All errors follow this shape:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient funds",
    "details": null
  },
  "meta": {
    "requestId": "uuid",
    "correlationId": "uuid",
    "timestamp": "2026-10-01T12:00:00Z"
  }
}
```

**Error codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `INSUFFICIENT_FUNDS` | 422 | Not enough balance |
| `ACCOUNT_LOCKED` | 423 | Too many failed logins |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Downstream service down |
