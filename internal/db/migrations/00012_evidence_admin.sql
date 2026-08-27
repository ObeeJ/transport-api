-- +goose Up
CREATE TABLE IF NOT EXISTS evidence_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  kind          text NOT NULL,
  r2_key        text NOT NULL,
  r2_bucket     text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  uploaded_at   timestamptz DEFAULT now(),
  reviewed_by   uuid,
  review_status text CHECK (review_status IN ('pending','approved','rejected')),
  review_notes  text
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL,
  target_user uuid,
  target_ride uuid,
  action      text NOT NULL,
  reason      text NOT NULL,
  evidence    jsonb,
  created_at  timestamptz DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS admin_actions;
DROP TABLE IF EXISTS evidence_uploads;
