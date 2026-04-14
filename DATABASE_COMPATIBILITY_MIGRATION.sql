-- ============================================================================
-- DECHTA SINGLE-DB COMPATIBILITY MIGRATION
-- Run this after UNIFIED_SCHEMA.sql.
-- Purpose:
--   1) Keep the unified schema intact.
--   2) Add legacy tables / columns still used by the active backend.
--   3) Reduce 500s caused by missing tables or renamed columns.
--
-- Notes:
--   - This is a compatibility layer, not the final normalized design.
--   - Worker profile ID handling is still structurally inconsistent in code;
--     that path needs a code refactor if you want strict unified-model FK use.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) ENUM COMPATIBILITY
-- ----------------------------------------------------------------------------
-- The current backend uses mixed-case / legacy order statuses.
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'Pending';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'Assigned';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'Out for Delivery';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'arrived_pickup';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'picked_up';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'arrived_dropoff';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'missed';

-- ----------------------------------------------------------------------------
-- 2) SHARED TABLE COMPATIBILITY COLUMNS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_number VARCHAR(20) UNIQUE NOT NULL,
  phone VARCHAR(20),
  otp VARCHAR(6) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_verification_mobile ON otp_verification(mobile_number);
CREATE INDEX IF NOT EXISTS idx_otp_verification_expires ON otp_verification(expires_at);

-- Admin onboarding queries read these columns from users in mixed-schema installs.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- Driver auth / profile flow still uses these legacy columns.
ALTER TABLE driver_profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS tshirt_size VARCHAR(20),
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS license_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS is_pilot_this_week BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_login_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_login_minutes INTEGER DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.vehicles') IS NOT NULL THEN
    ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS model_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100);
  END IF;

  IF to_regclass('public.driver_vehicles') IS NOT NULL THEN
    ALTER TABLE driver_vehicles
      ADD COLUMN IF NOT EXISTS model_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS weight_capacity NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100),
      ADD COLUMN IF NOT EXISTS body_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
  END IF;
END $$;

-- Worker profile flow still uses a legacy shape.
ALTER TABLE worker_profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS skill_category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_profile_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline';

-- Product controller expects legacy vendor-dashboard columns.
-- NOTE: the active vendor backend still writes UUID vendor ids into products.
-- If you want strict FK alignment with vendor_profiles.id, the vendor backend
-- must be refactored to use the unified vendor identity first.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS detailed_description TEXT,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS warranty TEXT,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN DEFAULT FALSE;

-- Order controller expects delivery workflow columns on the orders table.
-- NOTE: the active vendor backend also writes UUID vendor ids into orders.
-- The unified schema currently models orders.vendor_id as a bigint FK.
-- That is a separate model decision and cannot be fully resolved with ADD COLUMN.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_id BIGINT,
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS driver_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS client_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS drop_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS drop_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS vendor_shop_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS delivery_pricing_json JSONB,
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS final_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vehicle_option_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS vehicle_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS vehicle_desc TEXT,
  ADD COLUMN IF NOT EXISTS model_id_requested VARCHAR(100),
  ADD COLUMN IF NOT EXISTS model_name_requested VARCHAR(100),
  ADD COLUMN IF NOT EXISTS weight_capacity_requested NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS body_type_requested VARCHAR(100),
  ADD COLUMN IF NOT EXISTS dimensions_requested VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_tag VARCHAR(30),
  ADD COLUMN IF NOT EXISTS delivery_area VARCHAR(160),
  ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS delivery_state VARCHAR(120),
  ADD COLUMN IF NOT EXISTS delivery_pincode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS delivery_landmark VARCHAR(200),
  ADD COLUMN IF NOT EXISTS schedule_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS instructions_json JSONB,
  ADD COLUMN IF NOT EXISTS gst_json JSONB,
  ADD COLUMN IF NOT EXISTS order_meta JSONB,
  ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(6);

-- ----------------------------------------------------------------------------
-- 3) LEGACY VENDOR TABLES USED BY THE CURRENT BACKEND
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  shop_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  shop_address TEXT,
  shop_latitude NUMERIC(10,8),
  shop_longitude NUMERIC(11,8),
  location_label TEXT,
  location_updated_at TIMESTAMPTZ,
  gst_number VARCHAR(20),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS shop_latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS shop_longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS vendor_wallets (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  balance NUMERIC(15,2) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_wallets_vendor ON vendor_wallets(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_payment_orders (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  cashfree_order_id VARCHAR(120) NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_orders_vendor ON vendor_payment_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_orders_cf ON vendor_payment_orders(cashfree_order_id);

CREATE TABLE IF NOT EXISTS vendor_withdrawals (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(20) NOT NULL,
  upi_id VARCHAR(100),
  account_number VARCHAR(50),
  ifsc_code VARCHAR(20),
  account_name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reference_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_withdrawals_vendor ON vendor_withdrawals(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_withdrawals_status ON vendor_withdrawals(status);

CREATE TABLE IF NOT EXISTS vendor_queries (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_queries_vendor ON vendor_queries(vendor_id);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  order_id BIGINT,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 18,
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20),
  customer_gst VARCHAR(20),
  customer_address TEXT,
  status VARCHAR(20) DEFAULT 'Generated',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);

CREATE TABLE IF NOT EXISTS settlements (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  transaction_id VARCHAR(120) UNIQUE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_vendor ON settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_settlements_transaction ON settlements(transaction_id);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'Open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_vendor ON tickets(vendor_id);

-- ----------------------------------------------------------------------------
-- 4) LEGACY DRIVER TABLES USED BY THE CURRENT BACKEND
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_stats (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL UNIQUE,
  driver_name VARCHAR(100),
  avatar_url TEXT,
  total_earnings NUMERIC(12,2) DEFAULT 0,
  total_orders_completed INTEGER DEFAULT 0,
  weekly_orders_completed INTEGER DEFAULT 0,
  weekly_earnings NUMERIC(12,2) DEFAULT 0,
  weekly_login_minutes INTEGER DEFAULT 0,
  weekly_completion_score NUMERIC(5,2) DEFAULT 0,
  total_distance_km NUMERIC(12,2) DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_stats_driver ON driver_stats(driver_id);

CREATE TABLE IF NOT EXISTS driver_vehicles (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  vehicle_type VARCHAR(50) NOT NULL,
  model_id VARCHAR(100),
  model_name VARCHAR(100),
  weight_capacity NUMERIC(10,2),
  dimensions VARCHAR(100),
  body_type VARCHAR(50),
  registration_number VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicles_driver ON driver_vehicles(driver_id);

CREATE TABLE IF NOT EXISTS driver_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  account_holder_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  ifsc_code VARCHAR(20) NOT NULL,
  bank_branch VARCHAR(100),
  upi_id VARCHAR(100),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_bank_driver ON driver_bank_accounts(driver_id);

CREATE TABLE IF NOT EXISTS driver_referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_id BIGINT NOT NULL,
  bonus_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_referrals_referrer ON driver_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_driver_referrals_referred ON driver_referrals(referred_id);

CREATE TABLE IF NOT EXISTS driver_gps_locations (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  trip_id BIGINT,
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  accuracy NUMERIC(6,2),
  speed NUMERIC(6,2),
  heading NUMERIC(6,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_gps_driver ON driver_gps_locations(driver_id);

CREATE TABLE IF NOT EXISTS driver_documentss (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  aadhar_url TEXT,
  pan_url TEXT,
  license_url TEXT,
  rc_url TEXT,
  verification_status VARCHAR(20) DEFAULT 'pending',
  verification_rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON driver_documentss(driver_id);

CREATE TABLE IF NOT EXISTS driver_wallets (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL UNIQUE,
  balance NUMERIC(15,2) DEFAULT 0,
  outstanding_dues NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_wallets_driver ON driver_wallets(driver_id);

CREATE TABLE IF NOT EXISTS driver_transactions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  transaction_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_transactions_driver ON driver_transactions(driver_id);

CREATE TABLE IF NOT EXISTS driver_notifications (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver ON driver_notifications(driver_id);

CREATE TABLE IF NOT EXISTS driver_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT,
  sender_id BIGINT,
  receiver_id BIGINT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_chat_trip ON driver_chat_messages(trip_id);

CREATE TABLE IF NOT EXISTS driver_package_photos (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL,
  driver_id BIGINT NOT NULL,
  photo_url TEXT NOT NULL,
  step INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_package_photos_trip ON driver_package_photos(trip_id);

CREATE TABLE IF NOT EXISTS driver_login_sessions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  token TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_driver_login_sessions_driver ON driver_login_sessions(driver_id);

CREATE TABLE IF NOT EXISTS driver_leaderboard_cache (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL UNIQUE,
  rank_position INTEGER,
  score NUMERIC(12,2) DEFAULT 0,
  weekly_orders_completed INTEGER DEFAULT 0,
  weekly_earnings NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_order_ignores (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  ignored_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_order_ignores_driver ON driver_order_ignores(driver_id);

CREATE TABLE IF NOT EXISTS driver_support_tickets (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_support_driver ON driver_support_tickets(driver_id);

-- ----------------------------------------------------------------------------
-- 5) LEGACY WORKER TABLES USED BY THE CURRENT BACKEND
-- ----------------------------------------------------------------------------
-- These tables use UUID ids because the current worker controller generates UUIDs.
CREATE TABLE IF NOT EXISTS worker_auth_users (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  cashfree_order_id VARCHAR(120) NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_worker ON worker_payment_orders(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_cf ON worker_payment_orders(cashfree_order_id);

CREATE TABLE IF NOT EXISTS worker_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  transaction_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_transactions_worker ON worker_transactions(worker_id);

-- ----------------------------------------------------------------------------
-- 6) ORDER / DELIVERY TABLE USED BY THE CURRENT DRIVER FLOW
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_trips (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  driver_id BIGINT NOT NULL,
  status VARCHAR(30) DEFAULT 'accepted',
  distance_text VARCHAR(100),
  payout_amount NUMERIC(12,2) DEFAULT 0,
  delivery_otp VARCHAR(6),
  pickup_photo_url TEXT,
  arrived_pickup_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  arrived_dropoff_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  otp_verified BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_order ON delivery_trips(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver ON delivery_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_status ON delivery_trips(status);

-- ----------------------------------------------------------------------------
-- 7) OPTIONAL COMPATIBILITY ALIASES FOR HIGH-USE VIEWS
-- ----------------------------------------------------------------------------
-- These views help read-only queries in older code paths map to the unified model.
-- They do not replace the legacy tables above.
CREATE OR REPLACE VIEW legacy_vendor_profile_view AS
SELECT
  id,
  phone,
  shop_name,
  owner_name,
  shop_address,
  gst_number,
  email,
  is_active,
  status,
  created_at,
  updated_at
FROM vendors;
