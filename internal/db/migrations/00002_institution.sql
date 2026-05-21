-- +goose Up
-- Create the default institution if it doesn't exist yet.
INSERT INTO institutions (id, name, slug, active, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Institution',
    'default',
    true,
    now(),
    now()
) ON CONFLICT (slug) DO NOTHING;

-- Backfill institution_id on all existing rows using the default institution.
UPDATE users              SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE recipients         SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE giver_deposits     SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE driver_profiles    SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE hubs               SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE trips              SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE roster_entries     SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE attendances        SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = '00000000-0000-0000-0000-000000000000';

-- +goose Down
UPDATE users              SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE recipients         SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE giver_deposits     SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE driver_profiles    SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE hubs               SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE trips              SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE roster_entries     SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
UPDATE attendances        SET institution_id = '00000000-0000-0000-0000-000000000000' WHERE institution_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM institutions WHERE slug = 'default';
