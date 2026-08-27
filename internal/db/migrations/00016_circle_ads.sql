-- +goose Up
CREATE TABLE IF NOT EXISTS circle_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE,
  purchased_at    timestamptz NOT NULL DEFAULT now(),
  price_kobo      bigint NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  founding_member boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS ads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL,
  creative_key  text NOT NULL,
  cta_url       text NOT NULL,
  budget_kobo   bigint NOT NULL,
  spent_kobo    bigint NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'pending',
  target        jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_impressions (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id   uuid NOT NULL,
  user_id uuid NOT NULL,
  at      timestamptz DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS ad_impressions;
DROP TABLE IF EXISTS ads;
DROP TABLE IF EXISTS circle_memberships;
