-- +goose Up
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id        uuid NOT NULL,
  account_id    uuid NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_kobo   bigint NOT NULL CHECK (amount_kobo > 0),
  currency      text NOT NULL DEFAULT 'NGN',
  balance_after bigint NOT NULL,
  purpose       text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_txn ON ledger_entries(txn_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account_time ON ledger_entries(account_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS ledger_entries;
