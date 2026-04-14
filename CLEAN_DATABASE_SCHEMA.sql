-- ============================================================================
-- DECHTA PLATFORM — CONSOLIDATED DATABASE SCHEMA (v2)
-- ============================================================================
-- Single, clean, deduplicated schema for the entire Dechta platform.
-- Supports: Client App, Driver App, Worker App, Vendor Dashboard, Admin Panel.
--
-- Run this on a FRESH PostgreSQL database to get a fully working system.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A: CORE IDENTITY & AUTH
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. USERS  (central identity for ALL user types)
-- Columns serve both the admin Drizzle schema AND the client/service backends.
-- Admin uses: name, email, password, role, verification_status, rejection_reason
-- Client/Service uses: phone_number, user_type, password_hash, is_verified, etc.
-- Both map to the same row via mapUserRow() in admin storage.ts
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                          BIGSERIAL PRIMARY KEY,
  -- Admin panel columns (Drizzle schema)
  name                        TEXT,
  email                       VARCHAR(255) UNIQUE,
  password                    TEXT,
  role                        TEXT DEFAULT 'buyer',                        -- buyer/vendor/admin
  verification_status         VARCHAR(20) DEFAULT 'pending',              -- pending/verified/rejected
  rejection_reason            TEXT,
  phone                       TEXT,
  owner_name                  TEXT,
  whatsapp_number             TEXT,
  business_address            TEXT,
  warehouse_address           TEXT,
  google_maps_location        TEXT,
  years_of_business_experience TEXT,
  business_type               TEXT,
  -- Client/Service columns
  phone_number                VARCHAR(20) UNIQUE,
  password_hash               TEXT,
  user_type                   VARCHAR(20) DEFAULT 'client',               -- client/driver/vendor/worker/admin
  status                      VARCHAR(30) DEFAULT 'active',               -- active/suspended/banned
  is_verified                 BOOLEAN DEFAULT FALSE,
  is_approved                 BOOLEAN DEFAULT FALSE,
  profile_complete            BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_type  ON users(user_type);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. CLIENT PROFILES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_profiles (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name           VARCHAR(120),
  avatar_url          TEXT,
  company             VARCHAR(200),
  area                TEXT,
  service_preference  VARCHAR(50) DEFAULT 'vendor',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_profiles_user ON client_profiles(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. OAUTH CREDENTIALS  (Google login etc.)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(30) NOT NULL DEFAULT 'google',
  provider_id         VARCHAR(255) NOT NULL UNIQUE,
  provider_email      VARCHAR(255),
  avatar_url          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. OTP VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verification (
  id                  BIGSERIAL PRIMARY KEY,
  phone               VARCHAR(20) NOT NULL,
  otp_code            VARCHAR(10) NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  verified            BOOLEAN DEFAULT FALSE,
  attempts            INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verification(phone);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. SESSION STORAGE  (connect-pg-simple)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid                 VARCHAR NOT NULL PRIMARY KEY,
  sess                JSONB NOT NULL,
  expire              TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. ADDRESSES  (client saved addresses)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag                 VARCHAR(30) DEFAULT 'other',
  address_text        TEXT NOT NULL,
  is_default          BOOLEAN DEFAULT FALSE,
  lat                 NUMERIC(10,7),
  lng                 NUMERIC(10,7),
  area                TEXT,
  city                TEXT,
  state               TEXT,
  pincode             VARCHAR(20),
  landmark            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B: VENDORS
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 7. VENDORS  (legacy — used by DechtaService vendor controller)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                  BIGSERIAL PRIMARY KEY,
  phone               VARCHAR(20) UNIQUE NOT NULL,
  shop_name           VARCHAR(255) NOT NULL,
  owner_name          VARCHAR(100) NOT NULL,
  shop_address        TEXT,
  shop_latitude       NUMERIC(10,8),
  shop_longitude      NUMERIC(11,8),
  location_label      TEXT,
  location_updated_at TIMESTAMPTZ,
  gst_number          VARCHAR(20),
  email               VARCHAR(255),
  is_active           BOOLEAN DEFAULT TRUE,
  status              VARCHAR(50) DEFAULT 'active',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 8. VENDOR PROFILES  (unified schema — linked to users)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT REFERENCES users(id) ON DELETE SET NULL,
  business_name         VARCHAR(255),
  owner_name            VARCHAR(100),
  business_address      TEXT,
  business_latitude     NUMERIC(10,8),
  business_longitude    NUMERIC(11,8),
  location_label        TEXT,
  location_updated_at   TIMESTAMPTZ,
  category              VARCHAR(100) DEFAULT 'general',
  email                 VARCHAR(255),
  gst_number            VARCHAR(20),
  is_active             BOOLEAN DEFAULT TRUE,
  approval_status       VARCHAR(30) DEFAULT 'pending',
  verification_status   VARCHAR(30) DEFAULT 'pending',
  rejection_reason      TEXT,
  google_maps_location  TEXT,
  business_type         VARCHAR(100),
  years_of_experience   INTEGER,
  whatsapp_number       VARCHAR(20),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user ON vendor_profiles(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 9. VENDOR DOCUMENTS  (admin panel onboarding)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_documents (
  id                          BIGSERIAL PRIMARY KEY,
  vendor_id                   BIGINT NOT NULL,
  gst_number                  TEXT,
  pan_number                  TEXT,
  udyam_registration_number   TEXT,
  bank_account_details        TEXT,
  gst_url                     TEXT,
  pan_url                     TEXT,
  aadhar_url                  TEXT,
  cancelled_cheque_url        TEXT,
  gst_certificate_url         TEXT,
  shop_license_url            TEXT,
  business_license_url        TEXT,
  pan_image_url               TEXT,
  registration_certificate_url TEXT,
  passbook_cancelled_cheque_url TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION C: PRODUCTS & CATALOG
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 10. CATALOG ITEMS  (admin catalog — product templates)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_items (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  description         TEXT NOT NULL,
  image_url           TEXT,
  brand               TEXT,
  detailed_description TEXT,
  product_quality     TEXT,
  warranty            TEXT,
  hsn_code            TEXT,
  stock               INTEGER DEFAULT 0,
  unit                TEXT DEFAULT 'pcs',
  is_bulk             BOOLEAN DEFAULT FALSE,
  bulk_discount       NUMERIC,
  mrp                 NUMERIC,
  selling_price       NUMERIC,
  gst_percent         NUMERIC DEFAULT 18,
  length_cm           NUMERIC,
  width_cm            NUMERIC,
  height_cm           NUMERIC,
  weight_kg           NUMERIC,
  self_delivery       BOOLEAN DEFAULT FALSE,
  vehicle_type        TEXT,
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 11. PRODUCTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                    BIGSERIAL PRIMARY KEY,
  uuid                  UUID,
  vendor_id             BIGINT,
  catalog_item_id       INTEGER REFERENCES catalog_items(id),
  product_name          VARCHAR(255),
  name                  VARCHAR(255),
  description           TEXT,
  detailed_description  TEXT,
  category              VARCHAR(100) DEFAULT 'general',
  mrp                   NUMERIC(12,2),
  price                 NUMERIC,                                          -- admin Drizzle alias
  cost_price            NUMERIC,
  selling_price         NUMERIC(12,2),
  total_price           NUMERIC(12,2),
  stock                 INTEGER DEFAULT 0,
  stock_quantity        INTEGER DEFAULT 0,
  unit                  VARCHAR(20) DEFAULT 'pcs',
  weight_kg             NUMERIC(10,2),
  image_url             TEXT,
  images                JSONB DEFAULT '[]'::jsonb,
  brand                 VARCHAR(100),
  warranty              TEXT,
  gst_percent           NUMERIC(5,2) DEFAULT 18,
  gst                   TEXT,
  hsn_code              TEXT,
  discount_percent      NUMERIC,
  is_active             BOOLEAN DEFAULT TRUE,
  status_active         BOOLEAN DEFAULT FALSE,
  status                VARCHAR(50) DEFAULT 'pending',
  approval_status       VARCHAR(30) DEFAULT 'pending',
  rejection_reason      TEXT,
  is_bulk               BOOLEAN DEFAULT FALSE,
  bulk_discount         NUMERIC,
  is_boosted            BOOLEAN DEFAULT FALSE,
  search_tags           TEXT,
  fts_vector            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_vendor   ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(approval_status);


-- ────────────────────────────────────────────────────────────────────────────
-- 12. VEHICLE PRICING  (delivery rate card)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_pricing (
  id                  BIGSERIAL PRIMARY KEY,
  vehicle_type        TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  base_fare           NUMERIC NOT NULL,
  rate_per_km         NUMERIC NOT NULL,
  min_km              NUMERIC DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 13. MANPOWER PRICING  (service pricing — like Urban Company)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manpower_pricing (
  id                  BIGSERIAL PRIMARY KEY,
  service_category    TEXT NOT NULL,
  service_name        TEXT NOT NULL,
  service_code        TEXT NOT NULL UNIQUE,
  description         TEXT,
  base_price          NUMERIC NOT NULL,
  rate_per_hour       NUMERIC NOT NULL,
  min_hours           NUMERIC DEFAULT 1,
  estimated_duration  TEXT,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION D: ORDERS
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 14. ORDERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                        BIGSERIAL PRIMARY KEY,
  user_id                   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  product_id                BIGINT REFERENCES products(id) ON DELETE SET NULL,
  vendor_id                 BIGINT,
  assigned_driver_id        BIGINT,                                          -- admin Drizzle alias
  quantity                  INTEGER DEFAULT 1,
  status                    VARCHAR(50) DEFAULT 'Pending',

  -- Pricing
  order_amount              NUMERIC(12,2),
  discount_amount           NUMERIC(12,2) DEFAULT 0,
  tax_amount                NUMERIC(12,2) DEFAULT 0,
  final_amount              NUMERIC(12,2),
  delivery_fee              NUMERIC(12,2) DEFAULT 0,
  delivery_distance_km      NUMERIC(10,2),
  delivery_pricing_json     JSONB,
  tip_amount                NUMERIC(12,2) DEFAULT 0,
  items_total               NUMERIC(12,2),
  final_total               NUMERIC(12,2),
  total_amount              NUMERIC(12,2),

  -- Customer info
  customer_name             VARCHAR(120),
  customer_phone            VARCHAR(20),
  client_id                 VARCHAR(100),
  client_name               VARCHAR(120),
  client_phone              VARCHAR(20),

  -- Vendor info
  vendor_shop_name          VARCHAR(255),
  product_name              VARCHAR(255),

  -- Addresses
  delivery_address_id       BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  pickup_address            TEXT,
  delivery_address          TEXT,
  address_text              TEXT,
  address_tag               VARCHAR(30),
  delivery_area             VARCHAR(160),
  delivery_city             VARCHAR(120),
  delivery_state            VARCHAR(120),
  delivery_pincode          VARCHAR(20),
  delivery_landmark         VARCHAR(200),

  -- Coordinates
  pickup_latitude           NUMERIC(10,8),
  pickup_longitude          NUMERIC(11,8),
  drop_latitude             NUMERIC(10,7),
  drop_longitude            NUMERIC(10,7),
  delivery_latitude         NUMERIC(10,8),
  delivery_longitude        NUMERIC(11,8),

  -- Vehicle/model info
  vehicle_type              VARCHAR(50),
  vehicle_option_id         VARCHAR(80),
  vehicle_name              VARCHAR(160),
  vehicle_desc              TEXT,
  model_id_requested        VARCHAR(120),
  model_name_requested      VARCHAR(120),
  weight_capacity_requested NUMERIC(10,2),
  dimensions_requested      VARCHAR(120),
  body_type_requested       VARCHAR(60),

  -- Driver assignment
  driver_id                 BIGINT,
  driver_name               VARCHAR(100),
  driver_number             VARCHAR(20),
  delivery_otp              VARCHAR(6),

  -- Worker assignment
  assigned_worker_id        TEXT,

  -- Schedule & notes
  order_type                VARCHAR(50),
  scheduled_delivery_date   DATE,
  schedule_time             VARCHAR(10),
  delivery_notes            TEXT,
  instructions_json         JSONB,
  gst_json                  JSONB,
  order_meta                JSONB,
  items                     JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  order_date                TIMESTAMPTZ DEFAULT NOW(),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user      ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor     ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver     ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_product    ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION E: DRIVERS
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 15. DRIVER PROFILES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_profiles (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT REFERENCES users(id) ON DELETE SET NULL,
  driver_id             VARCHAR(50) UNIQUE,
  full_name             VARCHAR(120),
  mobile_number         VARCHAR(20),
  phone_number          VARCHAR(20),
  date_of_birth         DATE,
  blood_group           VARCHAR(10),
  emergency_contact     VARCHAR(20),
  preferred_zone        VARCHAR(100),
  avatar_url            TEXT,
  referral_code         VARCHAR(30),
  is_approved           BOOLEAN DEFAULT FALSE,
  is_online             BOOLEAN DEFAULT FALSE,
  is_registered         BOOLEAN DEFAULT FALSE,
  is_pilot_this_week    BOOLEAN DEFAULT FALSE,
  status                VARCHAR(30) DEFAULT 'offline',
  current_latitude      NUMERIC(10,7),
  current_longitude     NUMERIC(10,7),
  last_location_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_user ON driver_profiles(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 16. DRIVER VEHICLES  (legacy — DechtaService)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_vehicles (
  id                    BIGSERIAL PRIMARY KEY,
  driver_id             BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_type          VARCHAR(50),
  model_id              VARCHAR(80),
  model_name            VARCHAR(120),
  weight_capacity       NUMERIC(10,2),
  dimensions            VARCHAR(120),
  body_type             VARCHAR(60),
  registration_number   VARCHAR(30),
  vehicle_number        VARCHAR(30),
  vehicle_verified      BOOLEAN DEFAULT FALSE,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicles_driver ON driver_vehicles(driver_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 17. VEHICLES  (unified)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id                    BIGSERIAL PRIMARY KEY,
  driver_id             BIGINT REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_type          VARCHAR(50),
  vehicle_number        VARCHAR(30),
  license_plate         VARCHAR(30),
  registration_number   VARCHAR(30),
  model_id              VARCHAR(80),
  model_name            VARCHAR(120),
  weight_capacity       NUMERIC(10,2),
  dimensions            VARCHAR(120),
  body_type             VARCHAR(60),
  status                VARCHAR(30) DEFAULT 'active',
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(driver_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 18. DRIVER BANK ACCOUNTS  (legacy — DechtaService)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_bank_accounts (
  id                    BIGSERIAL PRIMARY KEY,
  driver_id             BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  account_holder_name   VARCHAR(120),
  account_number        VARCHAR(50),
  ifsc_code             VARCHAR(20),
  bank_branch           VARCHAR(120),
  upi_id                VARCHAR(100),
  bank_verified         BOOLEAN DEFAULT FALSE,
  is_verified           BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_bank_driver ON driver_bank_accounts(driver_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 19. BANK ACCOUNTS  (unified — all user types)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_holder_name   VARCHAR(120),
  account_number        VARCHAR(50),
  ifsc_code             VARCHAR(20),
  bank_branch           VARCHAR(120),
  upi_id                VARCHAR(100),
  is_verified           BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 20. DRIVER DOCUMENTSS  (legacy — double-s name used by DechtaService)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_documentss (
  id                    BIGSERIAL PRIMARY KEY,
  driver_id             BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  aadhar_url            TEXT,
  pan_url               TEXT,
  license_url           TEXT,
  rc_url                TEXT,
  verification_status   VARCHAR(30) DEFAULT 'pending',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON driver_documentss(driver_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 21. DRIVER DOCUMENTS  (admin Drizzle — single-s)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_documents (
  id                    BIGSERIAL PRIMARY KEY,
  driver_id             BIGINT NOT NULL,
  photo_url             TEXT,
  aadhar_url            TEXT,
  address_proof_url     TEXT,
  rc_book_url           TEXT,
  license_url           TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 22. USER DOCUMENTS  (unified — all user types)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_documents (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type         VARCHAR(30) NOT NULL,
  document_url          TEXT,
  front_url             TEXT,
  back_url              TEXT,
  status                VARCHAR(20) DEFAULT 'pending',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_documents_user ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_type ON user_documents(user_id, document_type);


-- ────────────────────────────────────────────────────────────────────────────
-- 23. DRIVER STATS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_stats (
  id                        BIGSERIAL PRIMARY KEY,
  driver_id                 BIGINT NOT NULL UNIQUE REFERENCES driver_profiles(id) ON DELETE CASCADE,
  driver_name               VARCHAR(120),
  avatar_url                TEXT,
  total_earnings            NUMERIC(15,2) DEFAULT 0,
  total_orders_completed    INTEGER DEFAULT 0,
  weekly_orders_completed   INTEGER DEFAULT 0,
  weekly_earnings           NUMERIC(15,2) DEFAULT 0,
  weekly_login_minutes      INTEGER DEFAULT 0,
  weekly_completion_score   NUMERIC(5,2) DEFAULT 0,
  rating                    NUMERIC(3,1) DEFAULT 5.0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 24. DRIVER GPS LOCATIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_gps_locations (
  id                  BIGSERIAL PRIMARY KEY,
  driver_id           BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  trip_id             BIGINT,
  latitude            NUMERIC(10,7) NOT NULL,
  longitude           NUMERIC(10,7) NOT NULL,
  accuracy            NUMERIC(8,2),
  speed               NUMERIC(8,2),
  heading             NUMERIC(6,2),
  recorded_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_gps_driver ON driver_gps_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_gps_trip   ON driver_gps_locations(trip_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 25. LOCATION UPDATES  (unified real-time location)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_updates (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  latitude            NUMERIC NOT NULL,
  longitude           NUMERIC NOT NULL,
  heading             NUMERIC DEFAULT 0,
  speed               NUMERIC DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_updates_entity ON location_updates(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_user   ON location_updates(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 26. DELIVERY TRIPS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_trips (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  driver_id             BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  status                VARCHAR(30) DEFAULT 'accepted',
  payout_amount         NUMERIC(12,2) DEFAULT 0,
  distance_text         VARCHAR(50),
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  arrived_pickup_at     TIMESTAMPTZ,
  picked_up_at          TIMESTAMPTZ,
  arrived_dropoff_at    TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         TEXT,
  otp_verified          BOOLEAN DEFAULT FALSE,
  pickup_photo_url      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_order   ON delivery_trips(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver  ON delivery_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_status  ON delivery_trips(status);


-- ────────────────────────────────────────────────────────────────────────────
-- 27. DRIVER ORDER IGNORES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_order_ignores (
  id                  BIGSERIAL PRIMARY KEY,
  driver_id           BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  order_id            BIGINT,
  ignored_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 28. DRIVER PACKAGE PHOTOS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_package_photos (
  id                  BIGSERIAL PRIMARY KEY,
  trip_id             BIGINT NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  driver_id           BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  photo_url           TEXT NOT NULL,
  step                INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 29. DRIVER WALLETS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_wallets (
  id                  BIGSERIAL PRIMARY KEY,
  driver_id           BIGINT NOT NULL UNIQUE REFERENCES driver_profiles(id) ON DELETE CASCADE,
  balance             NUMERIC(15,2) DEFAULT 0,
  outstanding_dues    NUMERIC(15,2) DEFAULT 0,
  today_earnings      NUMERIC(15,2) DEFAULT 0,
  total_trips         INTEGER DEFAULT 0,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 30. DRIVER TRANSACTIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  wallet_id           BIGINT REFERENCES driver_wallets(id) ON DELETE SET NULL,
  trip_id             BIGINT REFERENCES delivery_trips(id) ON DELETE SET NULL,
  type                VARCHAR(20) NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  description         TEXT,
  balance_after       NUMERIC(15,2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 31. DRIVER REFERRALS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_referrals (
  id                  BIGSERIAL PRIMARY KEY,
  referrer_id         BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  referred_id         BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  bonus_paid          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION F: VENDOR FINANCE
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 32. VENDOR WALLETS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_wallets (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  balance             NUMERIC(15,2) DEFAULT 0,
  last_updated        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_wallets_vendor ON vendor_wallets(vendor_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 33. VENDOR PAYMENT ORDERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payment_orders (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  cashfree_order_id   VARCHAR(120) NOT NULL UNIQUE,
  amount              NUMERIC(12,2) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_orders_vendor ON vendor_payment_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_orders_cf     ON vendor_payment_orders(cashfree_order_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 34. VENDOR WITHDRAWALS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_withdrawals (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  method              VARCHAR(20) NOT NULL,
  upi_id              VARCHAR(100),
  account_number      VARCHAR(50),
  ifsc_code           VARCHAR(20),
  account_name        VARCHAR(100),
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reference_id        VARCHAR(100) UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_withdrawals_vendor ON vendor_withdrawals(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_withdrawals_status ON vendor_withdrawals(status);


-- ────────────────────────────────────────────────────────────────────────────
-- 35. VENDOR QUERIES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_queries (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  subject             VARCHAR(255) NOT NULL,
  message             TEXT NOT NULL,
  status              VARCHAR(20) DEFAULT 'open',
  response            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_queries_vendor ON vendor_queries(vendor_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 36. INVOICES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  order_id            BIGINT,
  invoice_number      VARCHAR(50) UNIQUE NOT NULL,
  items               JSONB DEFAULT '[]'::jsonb,
  subtotal            NUMERIC(12,2) DEFAULT 0,
  tax_amount          NUMERIC(12,2) DEFAULT 0,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(5,2) DEFAULT 18,
  customer_name       VARCHAR(100),
  customer_phone      VARCHAR(20),
  customer_gst        VARCHAR(20),
  customer_address    TEXT,
  status              VARCHAR(20) DEFAULT 'Generated',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 37. SETTLEMENTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  status              VARCHAR(20) DEFAULT 'pending',
  transaction_id      VARCHAR(120) UNIQUE,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_vendor      ON settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_settlements_transaction  ON settlements(transaction_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 38. TICKETS  (vendor support tickets)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id                  BIGSERIAL PRIMARY KEY,
  vendor_id           BIGINT NOT NULL,
  subject             VARCHAR(255) NOT NULL,
  message             TEXT NOT NULL,
  status              VARCHAR(20) DEFAULT 'Open',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_vendor ON tickets(vendor_id);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION G: ADMIN PANEL — JOBS, CLIENTS, SUPPORT, CHAT
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 39. JOBS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                    BIGSERIAL PRIMARY KEY,
  client_id             BIGINT,
  title                 TEXT,
  job_title             VARCHAR(255),
  description           TEXT,
  job_type              VARCHAR(50),
  status                VARCHAR(30) DEFAULT 'pending',
  deadline              TIMESTAMPTZ,
  assigned_driver_id    INTEGER,
  assigned_worker_id    UUID,
  assigned_user_id      BIGINT,
  assigned_user_type    VARCHAR(20),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);


-- ────────────────────────────────────────────────────────────────────────────
-- 40. SUPPORT TICKETS  (admin panel)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL,
  subject             TEXT NOT NULL,
  description         TEXT NOT NULL,
  status              TEXT DEFAULT 'open' NOT NULL,
  priority            TEXT DEFAULT 'medium' NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 41. CONVERSATIONS  (chat)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                    BIGSERIAL PRIMARY KEY,
  participant1_type     TEXT NOT NULL,
  participant1_id       TEXT NOT NULL,
  participant2_type     TEXT NOT NULL,
  participant2_id       TEXT NOT NULL,
  title                 TEXT,
  conversation_type     TEXT DEFAULT 'direct' NOT NULL,
  support_ticket_id     INTEGER REFERENCES support_tickets(id),
  related_entity_type   TEXT,
  related_entity_id     INTEGER,
  last_message_at       TIMESTAMPTZ,
  status                TEXT DEFAULT 'active' NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 42. MESSAGES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                  BIGSERIAL PRIMARY KEY,
  conversation_id     INTEGER REFERENCES conversations(id) NOT NULL,
  sender_type         TEXT NOT NULL,
  sender_id           TEXT NOT NULL,
  content             TEXT NOT NULL,
  message_type        TEXT DEFAULT 'text' NOT NULL,
  file_url            TEXT,
  file_name           TEXT,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 43. TYPING INDICATORS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS typing_indicators (
  id                  BIGSERIAL PRIMARY KEY,
  conversation_id     INTEGER REFERENCES conversations(id) NOT NULL,
  user_type           TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  last_typing_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 44. APP SETTINGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id                  BIGSERIAL PRIMARY KEY,
  key                 TEXT NOT NULL UNIQUE,
  value               TEXT NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 45. BANNERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id                  BIGSERIAL PRIMARY KEY,
  title               TEXT NOT NULL,
  subtitle            TEXT,
  image_url           TEXT NOT NULL,
  link_url            TEXT,
  target_pages        TEXT DEFAULT 'all' NOT NULL,
  position            TEXT DEFAULT 'hero' NOT NULL,
  active              TEXT DEFAULT 'true' NOT NULL,
  display_order       INTEGER DEFAULT 0 NOT NULL,
  start_date          TIMESTAMPTZ,
  end_date            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 46. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                  BIGSERIAL PRIMARY KEY,
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  target_app          TEXT NOT NULL,
  target_users        TEXT,
  type                TEXT DEFAULT 'info' NOT NULL,
  image_url           TEXT,
  link_url            TEXT,
  scheduled_at        TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  status              TEXT DEFAULT 'draft' NOT NULL,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 47. NOTIFICATION READS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
  id                  BIGSERIAL PRIMARY KEY,
  notification_id     INTEGER REFERENCES notifications(id) NOT NULL,
  user_id             INTEGER REFERENCES users(id) NOT NULL,
  read_at             TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION H: WORKERS
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 48. WORKER AUTH USERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_auth_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               VARCHAR(20) UNIQUE NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 49. WORKER PROFILES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                 VARCHAR(20) UNIQUE NOT NULL,
  full_name             VARCHAR(120),
  skill_category        VARCHAR(100),
  state                 VARCHAR(100),
  city                  VARCHAR(100),
  area                  VARCHAR(200),
  address               TEXT,
  is_approved           BOOLEAN DEFAULT FALSE,
  is_profile_complete   BOOLEAN DEFAULT FALSE,
  is_online             BOOLEAN DEFAULT FALSE,
  wallet_balance        NUMERIC(15,2) DEFAULT 0,
  total_jobs            INTEGER DEFAULT 0,
  avatar_url            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 50. WORKER TRANSACTIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  worker_id           UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  amount              NUMERIC(12,2) NOT NULL,
  description         TEXT,
  transaction_type    VARCHAR(20) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_transactions_worker ON worker_transactions(worker_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 51. WORKER PAYMENT ORDERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_payment_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  cashfree_order_id   VARCHAR(120) NOT NULL UNIQUE,
  amount              NUMERIC(10,2) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_worker ON worker_payment_orders(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_cf     ON worker_payment_orders(cashfree_order_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 52. WORKER DOCUMENTS  (admin panel onboarding)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id             UUID NOT NULL,
  photo_url             TEXT,
  aadhar_url            TEXT,
  pan_url               TEXT,
  skill_certificate_url TEXT,
  bank_mandate_url      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION I: LEGACY ADMIN DRIZZLE TABLES
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 53. DRIVERS  (legacy — admin getOpsOrders)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT NOT NULL,
  vehicle_type        TEXT NOT NULL,
  vehicle_number      TEXT NOT NULL,
  license_number      TEXT NOT NULL,
  status              TEXT DEFAULT 'active' NOT NULL,
  photo_url           TEXT,
  driver_type         TEXT,
  bank_account_number TEXT,
  bank_ifsc           TEXT,
  bank_name           TEXT,
  bank_branch         TEXT,
  location            TEXT,
  service_rating      NUMERIC DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 54. WORKER SKILLS  (legacy — admin manpower management)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_skills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  phone               TEXT NOT NULL,
  state               TEXT,
  city                TEXT,
  area                TEXT,
  referral_code       TEXT,
  rating              NUMERIC DEFAULT 0,
  reviews_count       NUMERIC DEFAULT 0,
  is_approved         BOOLEAN DEFAULT FALSE,
  is_online           BOOLEAN DEFAULT FALSE,
  is_frozen           BOOLEAN DEFAULT FALSE,
  approved_by         UUID,
  qualification       TEXT,
  aadhar_number       TEXT,
  pan_number          TEXT,
  service_address     TEXT,
  bank_account_number TEXT,
  bank_ifsc           TEXT,
  bank_name           TEXT,
  bank_branch         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 55. WORKER DETAILS  (legacy — admin skill details)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           UUID NOT NULL REFERENCES worker_skills(id) ON DELETE CASCADE,
  skill_name          TEXT,
  experience          TEXT,
  category            TEXT
);


-- ────────────────────────────────────────────────────────────────────────────
-- 56. WALLETS  (legacy — admin worker_skills wallet)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  worker_id           UUID PRIMARY KEY,
  total_earned        NUMERIC DEFAULT 0,
  platform_fees       NUMERIC DEFAULT 0,
  wallet_balance      NUMERIC DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 57. CLIENTS  (legacy — admin client management)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT NOT NULL,
  company             TEXT,
  area                TEXT NOT NULL,
  address             TEXT,
  service_type        TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION J: TRIGGERS & SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to key tables
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','client_profiles','vendor_profiles','products','orders',
    'driver_profiles','driver_vehicles','vehicles','driver_bank_accounts',
    'bank_accounts','driver_documentss','user_documents','driver_stats',
    'delivery_trips','vendor_wallets','vendor_withdrawals','invoices',
    'settlements','tickets','vendor_queries','worker_profiles'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I; 
       CREATE TRIGGER trg_%s_updated_at 
       BEFORE UPDATE ON %I 
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- Seed: Default vehicle pricing
INSERT INTO vehicle_pricing (vehicle_type, display_name, base_fare, rate_per_km, min_km, is_active)
VALUES
  ('2w', 'Two Wheeler',   30, 8,  2, true),
  ('3w', 'Three Wheeler', 50, 12, 2, true),
  ('4w', 'Four Wheeler',  80, 15, 3, true)
ON CONFLICT (vehicle_type) DO NOTHING;

-- Seed: Default admin user (password: admin123)
INSERT INTO users (name, email, password, role, phone_number, user_type, is_verified, is_approved, verification_status)
VALUES ('Admin', 'admin@dechta.com', 'admin123', 'admin', '0000000000', 'admin', true, true, 'verified')
ON CONFLICT (email) DO NOTHING;


-- ============================================================================
-- SCHEMA COMPLETE — 57 tables
-- ============================================================================
