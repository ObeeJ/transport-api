-- +goose Up
-- Phase 5a: extend tenant scoping to the money / steward / safety tables that
-- were missing institution_id, and reconcile any default-institution row that
-- an older AutoMigrate seed created with a random UUID.
--
-- The columns themselves are added by GORM AutoMigrate (with a DEFAULT of the
-- canonical id), so on a fresh boot existing rows already carry the default.
-- This migration is the authoritative, idempotent backfill for databases that
-- predate those columns, plus the one-time seed-id reconciliation.

-- 1. Reconcile the default institution onto the canonical fixed id. If an older
--    boot seeded "default" with a random id, repoint it (and any rows that were
--    backfilled to that random id) onto the canonical id. ON CONFLICT keeps the
--    canonical row if it somehow already exists.
-- +goose StatementBegin
DO $$
DECLARE
    legacy_id uuid;
BEGIN
    SELECT id INTO legacy_id FROM institutions WHERE slug = 'default';
    IF legacy_id IS NOT NULL AND legacy_id <> '00000000-0000-0000-0000-000000000001' THEN
        -- Make sure the canonical row exists, then move data + drop the legacy row.
        INSERT INTO institutions (id, name, slug, active, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default Institution', 'default', true, now(), now())
        ON CONFLICT (id) DO NOTHING;
        -- Repoint already-scoped tables that may have been backfilled to legacy_id.
        UPDATE users           SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE recipients      SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE giver_deposits  SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE driver_profiles SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE hubs            SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE trips           SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE roster_entries  SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        UPDATE attendances     SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id = legacy_id;
        -- Update the slug-unique row to the canonical id last (avoids unique clash).
        UPDATE institutions    SET id = '00000000-0000-0000-0000-000000000001' WHERE id = legacy_id;
    END IF;
END $$;
-- +goose StatementEnd

-- 2. Backfill the newly added columns on the money / steward / safety tables.
--    Any row still on the zero-uuid (column default before this release) or NULL
--    is moved onto the canonical default institution.
UPDATE payouts             SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE wallets             SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE wallet_transactions SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE notifications       SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE steward_actions     SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE trip_attendances    SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE sos_alerts          SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
UPDATE recipient_appeals   SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';
-- strikes already defaults correctly via its model; normalise any zero rows too.
UPDATE strikes             SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL OR institution_id = '00000000-0000-0000-0000-000000000000';

-- +goose Down
-- Backfill is not reversible to a meaningful prior state (the zero-uuid carried
-- no tenant meaning). Down is a no-op; dropping the columns is handled by
-- reverting the model + AutoMigrate, not here.
SELECT 1;
