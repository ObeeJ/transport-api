-- +goose Up
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS admin_user_id uuid;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS logo_r2_key text;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#000';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS fund_rules jsonb DEFAULT '{}';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS invite_link_token text UNIQUE;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS sector text;

-- +goose Down
ALTER TABLE institutions DROP COLUMN IF EXISTS sector;
ALTER TABLE institutions DROP COLUMN IF EXISTS invite_link_token;
ALTER TABLE institutions DROP COLUMN IF EXISTS fund_rules;
ALTER TABLE institutions DROP COLUMN IF EXISTS primary_color;
ALTER TABLE institutions DROP COLUMN IF EXISTS logo_r2_key;
ALTER TABLE institutions DROP COLUMN IF EXISTS admin_user_id;
