-- +goose Up
CREATE TABLE IF NOT EXISTS pricing_settings (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fuel_price_naira  numeric NOT NULL DEFAULT 900,
  driver_margin_pct numeric NOT NULL DEFAULT 0.30,
  platform_fee_pct  numeric NOT NULL DEFAULT 0.03,
  platform_fee_min  bigint NOT NULL DEFAULT 1000,
  platform_fee_max  bigint NOT NULL DEFAULT 15000,
  surge_morning     numeric NOT NULL DEFAULT 1.2,
  surge_evening     numeric NOT NULL DEFAULT 1.3,
  updated_by        uuid,
  updated_at        timestamptz DEFAULT now()
);
INSERT INTO pricing_settings(id) VALUES(1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS vehicle_types (
  code          text PRIMARY KEY,
  display_name  text NOT NULL,
  km_per_litre  numeric NOT NULL,
  default_seats int NOT NULL,
  fuel_type     text NOT NULL DEFAULT 'petrol'
);
INSERT INTO vehicle_types VALUES
 ('keke','Keke',35,3,'petrol'),
 ('small_car','Small car',14,4,'petrol'),
 ('sedan','Sedan',11,4,'petrol'),
 ('big_suv','Big SUV',7,6,'petrol'),
 ('van','Van',9,8,'petrol'),
 ('hiace','Hiace bus',8,14,'petrol'),
 ('coaster','Coaster bus',6,25,'diesel')
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS vehicle_types;
DROP TABLE IF EXISTS pricing_settings;
