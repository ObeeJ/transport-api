-- +goose Up
CREATE TABLE IF NOT EXISTS kyc_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE,
  nin_hash           text,
  nin_verified       boolean NOT NULL DEFAULT false,
  bvn_hash           text,
  bvn_verified       boolean NOT NULL DEFAULT false,
  selfie_match_score numeric,
  tier               int NOT NULL DEFAULT 0,
  provider           text DEFAULT 'prembly',
  raw_response       jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  job_type     text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','failed')),
  attempts     int NOT NULL DEFAULT 0,
  result       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kyc_jobs_queue ON kyc_jobs(status, created_at) WHERE status = 'queued';

-- +goose Down
DROP TABLE IF EXISTS kyc_jobs;
DROP TABLE IF EXISTS kyc_records;
