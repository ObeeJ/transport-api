-- +goose Up
-- Remove all hardcoded Lagos starter hubs unconditionally.
-- Hubs are now configured per-deployment via the SEED_HUBS env var.
DELETE FROM hubs
WHERE name IN ('Main Gate', 'Bode Thomas Bus Stop', 'Yaba Roundabout', 'Iyana-Ipaja');

-- +goose Down
INSERT INTO hubs (id, institution_id, name, lat, lng, active, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Main Gate',            6.4474, 3.4525, true, NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Bode Thomas Bus Stop', 6.4933, 3.3686, true, NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Yaba Roundabout',       6.5095, 3.3711, true, NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Iyana-Ipaja',           6.6079, 3.2880, true, NOW())
ON CONFLICT (name) DO NOTHING;
