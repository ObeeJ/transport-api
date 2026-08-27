-- +goose Up
CREATE TABLE IF NOT EXISTS ambassadors (
  user_id       uuid PRIMARY KEY,
  activated_at  timestamptz DEFAULT now(),
  tier          text NOT NULL DEFAULT 'bronze',
  referral_code text UNIQUE NOT NULL,
  earned_wings  bigint NOT NULL DEFAULT 0,
  earned_naira  bigint NOT NULL DEFAULT 0,
  vanity_url    text UNIQUE
);

CREATE TABLE IF NOT EXISTS ambassador_referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL,
  referred_id   uuid NOT NULL UNIQUE,
  reward_status text NOT NULL DEFAULT 'pending',
  paid_txn_id   uuid,
  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz
);

CREATE TABLE IF NOT EXISTS recurring_sponsors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  amount_kobo          bigint NOT NULL,
  cadence              text NOT NULL,
  paystack_auth_code   text NOT NULL,
  status               text NOT NULL DEFAULT 'active',
  next_charge_at       timestamptz NOT NULL,
  last_charge_at       timestamptz,
  last_charge_status   text,
  consecutive_failures int NOT NULL DEFAULT 0,
  paused_until         timestamptz,
  created_at           timestamptz DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS recurring_sponsors;
DROP TABLE IF EXISTS ambassador_referrals;
DROP TABLE IF EXISTS ambassadors;
