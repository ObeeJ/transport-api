-- +goose Up
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           text PRIMARY KEY,
  user_id       uuid NOT NULL,
  endpoint      text NOT NULL,
  request_hash  text NOT NULL,
  response_code int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- +goose Down
DROP TABLE IF EXISTS idempotency_keys;
