-- +goose Up
CREATE TABLE IF NOT EXISTS trust_scores (
  user_id       uuid PRIMARY KEY,
  score         int NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  tier          text NOT NULL DEFAULT 'new',
  components    jsonb NOT NULL DEFAULT '{}',
  recomputed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  phone_e164      text NOT NULL,
  whatsapp_opt_in boolean DEFAULT true,
  vehicle_type    text,
  home_base_lat   numeric,
  home_base_lng   numeric,
  status          text DEFAULT 'active',
  rating          numeric DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_offers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL,
  driver_id  uuid,
  partner_id uuid,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','accepted','declined','expired'))
);

-- +goose Down
DROP TABLE IF EXISTS ride_offers;
DROP TABLE IF EXISTS partner_drivers;
DROP TABLE IF EXISTS trust_scores;
