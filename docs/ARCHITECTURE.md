# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                           │
│            Vite + TypeScript + React Router                  │
│                    Port: 5173                                │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (proxied via Vite dev server)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                              │
│                Fastify + @fastify/http-proxy                 │
│                    Port: 3000                                │
│  • JWT validation       • Rate limiting                      │
│  • Request correlation  • CORS                               │
│  • Routing              • Error normalization                │
└────────────┬────────────┬────────────┬────────────────────────┘
             │            │            │
    ┌────────▼───┐ ┌──────▼────┐ ┌────▼──────────┐
    │   Auth     │ │  Account  │ │   Transfer    │
    │  Service   │ │  Service  │ │   Service     │
    │  :3001     │ │  :3002    │ │   :3003       │
    └────────────┘ └───────────┘ └───────┬───────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
                 ┌───────▼────────┐
                 │   PostgreSQL   │
                 │  (4 schemas)   │
                 └───────┬────────┘
                         │
              ┌──────────▼──────────┐
              │  Transactional      │
              │  Outbox             │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │     RabbitMQ        │
              │  Topic Exchange:    │
              │  banking.events     │
              └─────┬─────┬─────────┘
                    │     │
          ┌─────────▼─┐ ┌─▼───────────┐
          │Notification│ │   Audit     │
          │  Worker    │ │   Worker    │
          └───────────┘ └─────────────┘
```

## Database Schema Architecture

```
PostgreSQL: banking_platform
├── auth
│   ├── users           (id, email, password_hash, ...)
│   ├── sessions        (id, user_id, refresh_token, expires_at, ...)
│   └── login_attempts  (id, user_id, success, ip_address, ...)
│
├── accounts
│   ├── accounts        (id, user_id, account_number, balance_minor [BIGINT], ...)
│   └── ledger_entries  (IMMUTABLE: id, account_id, entry_type, amount_minor, ...)
│
├── transfers
│   ├── transfers       (id, source_account_id, dest_account_id, amount_minor, status, ...)
│   ├── transfer_events (IMMUTABLE state log: id, transfer_id, from_status, to_status, ...)
│   └── outbox_events   (id, event_type, payload, published_at, attempts, ...)
│
└── audit
    ├── audit_records        (id, event_id [UNIQUE], event_type, payload, ...)
    └── notification_records (id, event_id [UNIQUE], recipient_id, message, ...)
```

## Transfer State Machine

```
CREATED ──────────────────────────────────────────────► FAILED
   │                                                       ▲
   ▼                                                       │
PROCESSING ────────────────────────────────────────────────┤
   │                                                       │
   ▼                                                       │
DEBITED ─────────────────────────────────────────────────►│
   │                                                       │
   ▼                                                       │
CREDITED ────────────────────────────────────────────────►│
   │
   ▼
COMPLETED
```

**Rules:**
- Only forward transitions (no rollback)
- COMPLETED and FAILED are terminal states
- Every transition is persisted atomically with outbox event
- Row-level locking (`SELECT FOR UPDATE`) prevents race conditions

## Transactional Outbox Pattern

```
Transfer Service DB Transaction:
  BEGIN;
    UPDATE transfers SET status = 'COMPLETED';
    INSERT INTO outbox_events (...) VALUES (...);
  COMMIT;

Outbox Worker (every 2s):
  SELECT * FROM outbox_events WHERE published_at IS NULL;
  → Publish to RabbitMQ
  → UPDATE outbox_events SET published_at = NOW();

Workers consume with:
  channel.ack(msg)  // after idempotent processing
```

## Financial Safety Invariants

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | No negative balance | DB CHECK constraint + row lock |
| 2 | No duplicate transfer | UNIQUE (user_id, idempotency_key) |
| 3 | No duplicate debit | Ledger immutability + transferId |
| 4 | No duplicate credit | Ledger immutability + transferId |
| 5 | Debit == Credit | Same amount passed to both operations |
| 6 | Failed transfers don't lose money | FAILED only from CREATED/PROCESSING (before debit) or requires manual reversal from DEBITED |
| 7 | Ledger entries immutable | DB RULE preventing UPDATE/DELETE |
| 8 | Ownership enforced | User.id checked on every account operation |
| 9 | One terminal state | State machine validation |
| 10 | Money conserved | Source debit == Destination credit |

## Security Architecture

- **Password hashing**: bcrypt (12 rounds)
- **JWT**: Short-lived access tokens (15 min) + long-lived refresh (7 days)
- **Session management**: Refresh token rotation on each use
- **Account lockout**: 5 failed attempts in 15 minutes
- **Authorization**: Every account/transfer operation verifies ownership
- **Internal services**: Protected by `x-internal-secret` header (mTLS recommended for production)
- **Rate limiting**: 100 req/min per IP per endpoint
- **Input validation**: Zod schemas on all inputs
- **SQL injection**: Prevented by Prisma ORM
- **Secret redaction**: Logger never logs passwords, tokens, or OTPs

## Event Schema

All events published to RabbitMQ follow this structure:

```json
{
  "eventId": "uuid",
  "eventType": "transfer.completed",
  "aggregateId": "transfer-uuid",
  "timestamp": "2026-10-01T12:00:00.000Z",
  "correlationId": "request-uuid",
  "payload": { ... event-specific data ... }
}
```
