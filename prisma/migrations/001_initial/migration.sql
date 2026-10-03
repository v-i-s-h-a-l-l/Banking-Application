-- Banking Platform Initial Migration
-- Creates schemas and tables with proper constraints

-- ============================================================
-- CREATE SCHEMAS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS transfers;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================
-- AUTH SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS auth.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON auth.users(email);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ,
  ip_address     TEXT,
  user_agent     TEXT
);

CREATE INDEX idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON auth.sessions(refresh_token);

CREATE TABLE IF NOT EXISTS auth.login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  success     BOOLEAN NOT NULL,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_user_id ON auth.login_attempts(user_id);
CREATE INDEX idx_login_attempts_created_at ON auth.login_attempts(created_at);

-- ============================================================
-- ACCOUNTS SCHEMA
-- ============================================================

CREATE TYPE accounts.account_type AS ENUM ('SAVINGS', 'CURRENT');
CREATE TYPE accounts.account_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE accounts.ledger_entry_type AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE IF NOT EXISTS accounts.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  account_number  TEXT NOT NULL UNIQUE,
  account_type    accounts.account_type NOT NULL DEFAULT 'SAVINGS',
  status          accounts.account_status NOT NULL DEFAULT 'ACTIVE',
  balance_minor   BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  currency        TEXT NOT NULL DEFAULT 'INR',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user_id ON accounts.accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts.accounts(account_number);

-- Ledger entries: IMMUTABLE, no UPDATE or DELETE allowed
CREATE TABLE IF NOT EXISTS accounts.ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts.accounts(id),
  entry_type      accounts.ledger_entry_type NOT NULL,
  amount_minor    BIGINT NOT NULL CHECK (amount_minor > 0),
  balance_after   BIGINT NOT NULL CHECK (balance_after >= 0),
  transfer_id     UUID,  -- References transfers.transfers
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_account_id ON accounts.ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_transfer_id ON accounts.ledger_entries(transfer_id);
CREATE INDEX idx_ledger_entries_created_at ON accounts.ledger_entries(created_at);

-- Prevent mutation of ledger entries
CREATE RULE no_update_ledger AS ON UPDATE TO accounts.ledger_entries DO INSTEAD NOTHING;
CREATE RULE no_delete_ledger AS ON DELETE TO accounts.ledger_entries DO INSTEAD NOTHING;

-- ============================================================
-- TRANSFERS SCHEMA
-- ============================================================

CREATE TYPE transfers.transfer_status AS ENUM (
  'CREATED', 'PROCESSING', 'DEBITED', 'CREDITED', 'COMPLETED', 'FAILED'
);

CREATE TABLE IF NOT EXISTS transfers.transfers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id      UUID NOT NULL,
  destination_account_id UUID NOT NULL,
  amount_minor           BIGINT NOT NULL CHECK (amount_minor > 0),
  currency               TEXT NOT NULL DEFAULT 'INR',
  description            TEXT NOT NULL,
  status                 transfers.transfer_status NOT NULL DEFAULT 'CREATED',
  idempotency_key        TEXT NOT NULL,
  initiated_by_user_id   UUID NOT NULL,
  correlation_id         TEXT NOT NULL,
  failure_reason         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,

  CONSTRAINT uq_user_idempotency UNIQUE (initiated_by_user_id, idempotency_key)
);

CREATE INDEX idx_transfers_source_account ON transfers.transfers(source_account_id);
CREATE INDEX idx_transfers_dest_account ON transfers.transfers(destination_account_id);
CREATE INDEX idx_transfers_status ON transfers.transfers(status);
CREATE INDEX idx_transfers_created_at ON transfers.transfers(created_at);

-- Immutable state transition log
CREATE TABLE IF NOT EXISTS transfers.transfer_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id  UUID NOT NULL REFERENCES transfers.transfers(id),
  from_status  transfers.transfer_status,
  to_status    transfers.transfer_status NOT NULL,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_events_transfer_id ON transfers.transfer_events(transfer_id);

-- Transactional Outbox
CREATE TABLE IF NOT EXISTS transfers.outbox_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  correlation_id TEXT NOT NULL,
  payload        JSONB NOT NULL,
  transfer_id    UUID NOT NULL REFERENCES transfers.transfers(id),
  published_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,
  attempts       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_unpublished ON transfers.outbox_events(published_at, attempts)
  WHERE published_at IS NULL;
CREATE INDEX idx_outbox_transfer_id ON transfers.outbox_events(transfer_id);

-- ============================================================
-- AUDIT SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS audit.audit_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT NOT NULL UNIQUE,
  event_type     TEXT NOT NULL,
  aggregate_id   TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload        JSONB NOT NULL,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_aggregate_id ON audit.audit_records(aggregate_id);
CREATE INDEX idx_audit_event_type ON audit.audit_records(event_type);

CREATE TABLE IF NOT EXISTS audit.notification_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT NOT NULL UNIQUE,
  event_type    TEXT NOT NULL,
  aggregate_id  TEXT NOT NULL,
  recipient_id  TEXT NOT NULL,
  message       TEXT NOT NULL,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_recipient_id ON audit.notification_records(recipient_id);

-- ============================================================
-- UPDATED_AT triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts.accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transfers_updated_at
  BEFORE UPDATE ON transfers.transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
