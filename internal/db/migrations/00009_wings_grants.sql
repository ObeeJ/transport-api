-- +goose Up
CREATE TABLE IF NOT EXISTS wings_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  amount       bigint NOT NULL,
  purpose      text NOT NULL,
  source_id    uuid,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','spent','expired','clawed_back','locked')),
  spent_at     timestamptz,
  locked_until timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wings_user_active ON wings_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wings_expiry ON wings_grants(expires_at) WHERE status = 'active';

-- +goose Down
DROP TABLE IF EXISTS wings_grants;
