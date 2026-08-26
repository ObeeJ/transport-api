-- +goose Up
CREATE TABLE IF NOT EXISTS outbox_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id  uuid NOT NULL,
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed','dead')),
  attempts      int NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  last_error    text
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, next_retry_at)
  WHERE status IN ('pending','failed');

-- +goose Down
DROP TABLE IF EXISTS outbox_events;
