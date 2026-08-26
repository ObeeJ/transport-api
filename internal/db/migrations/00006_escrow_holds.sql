-- +goose Up
CREATE TABLE IF NOT EXISTS escrow_holds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id             uuid NOT NULL UNIQUE,
  from_account_id    uuid NOT NULL,
  to_account_id      uuid NOT NULL,
  amount_kobo        bigint NOT NULL CHECK (amount_kobo > 0),
  currency           text NOT NULL DEFAULT 'NGN',
  purpose            text NOT NULL,
  reference_id       uuid,
  state              text NOT NULL CHECK (state IN ('held','released','refunded','frozen','expired')),
  release_conditions jsonb NOT NULL DEFAULT '{}',
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_escrow_state_expires ON escrow_holds(state, expires_at) WHERE state = 'held';
CREATE INDEX IF NOT EXISTS idx_escrow_reference ON escrow_holds(reference_id);

-- +goose Down
DROP TABLE IF EXISTS escrow_holds;
