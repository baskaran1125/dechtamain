-- ==================================================================================
-- DECHTA PLATFORM - UNIFIED DATABASE SCHEMA
-- ==================================================================================
-- Comprehensive schema supporting: Driver App, Worker App, Vendor Dashboard, Admin
-- PostgreSQL 13+  |  Single Schema  |  Production Ready
-- 
-- This schema consolidates:
-- - driver.sql (Driver Application)
-- - worker.sql (Worker Application)  
-- - vendor.sql (Vendor Management)
-- - Admin schema (Management & Control)
-- - Client backend schema (Customer-facing)
-- ==================================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================================================
-- ENUMS
-- ==================================================================================
CREATE TYPE user_type_enum AS ENUM ('driver', 'worker', 'vendor', 'client', 'admin');
CREATE TYPE user_status_enum AS ENUM ('active', 'inactive', 'suspended', 'banned');
CREATE TYPE job_status_enum AS ENUM ('pending', 'in_progress', 'completed', 'cancelled', 'disputed');
CREATE TYPE job_type_enum AS ENUM ('delivery', 'task', 'service', 'temporary', 'contract', 'permanent');
CREATE TYPE document_status_enum AS ENUM ('pending', 'verified', 'rejected', 'expired');
CREATE TYPE transaction_type_enum AS ENUM ('credit', 'debit', 'payment', 'withdrawal', 'refund', 'bonus', 'commission');
CREATE TYPE transaction_status_enum AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE order_status_enum AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_status_enum AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- ==================================================================================
-- 1. UTILITY FUNCTIONS
-- ==================================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==================================================================================
-- 2. CORE AUTHENTICATION & USERS
-- ==================================================================================

-- Master users table for all user types
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  user_type user_type_enum NOT NULL,
  status user_status_enum DEFAULT 'active',
  is_approved BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_users_uuid ON users(uuid);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- OTP Verification (unified for all apps)
CREATE TABLE IF NOT EXISTS otp_verifications (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  otp VARCHAR(6) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  verified_at TIMESTAMPTZ
);

CREATE INDEX idx_otp_phone ON otp_verifications(phone_number);
CREATE INDEX idx_otp_expires ON otp_verifications(expires_at);

-- OAuth Tokens (Google, Apple, etc.)
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'apple', 'facebook'
  provider_id VARCHAR(255) NOT NULL UNIQUE,
  provider_email VARCHAR(255),
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_provider ON oauth_credentials(provider, provider_id);

DROP TRIGGER IF EXISTS trg_oauth_updated_at ON oauth_credentials;
CREATE TRIGGER trg_oauth_updated_at BEFORE UPDATE ON oauth_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 3. USER PROFILES (Role-specific extended info)
-- ==================================================================================

-- Driver Profile
CREATE TABLE IF NOT EXISTS driver_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  driver_id VARCHAR(50) UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  blood_group VARCHAR(5),
  gender VARCHAR(10),
  emergency_contact VARCHAR(20),
  preferred_zone VARCHAR(100),
  avatar_url TEXT,
  referral_code VARCHAR(50) UNIQUE,
  referred_by_code VARCHAR(50),
  commission_rate NUMERIC(5,4) DEFAULT 0.10,
  is_online BOOLEAN DEFAULT FALSE,
  is_registered BOOLEAN DEFAULT FALSE,
  vehicle_count INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 5.0,
  total_deliveries BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_driver_referral ON driver_profiles(referral_code);
CREATE INDEX idx_driver_online ON driver_profiles(is_online);

DROP TRIGGER IF EXISTS trg_driver_profile_updated_at ON driver_profiles;
CREATE TRIGGER trg_driver_profile_updated_at BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Worker Profile
CREATE TABLE IF NOT EXISTS worker_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  state VARCHAR(50),
  city VARCHAR(50),
  area VARCHAR(100),
  address TEXT,
  qualification VARCHAR(100),
  aadhar_number VARCHAR(12) UNIQUE,
  pan_number VARCHAR(10) UNIQUE,
  referral_code VARCHAR(50) UNIQUE,
  rating NUMERIC(3,2) DEFAULT 0,
  total_jobs BIGINT DEFAULT 0,
  skill_categories TEXT[],
  role VARCHAR(50) DEFAULT 'worker' CHECK (role IN ('worker','supervisor','lead','admin')),
  avatar_url TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_worker_referral ON worker_profiles(referral_code);
CREATE INDEX idx_worker_area ON worker_profiles(area);

DROP TRIGGER IF EXISTS trg_worker_profile_updated_at ON worker_profiles;
CREATE TRIGGER trg_worker_profile_updated_at BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vendor Profile
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  business_address TEXT,
  business_latitude NUMERIC(10,8),
  business_longitude NUMERIC(11,8),
  location_label TEXT,
  location_updated_at TIMESTAMPTZ,
  warehouse_address TEXT,
  google_maps_location TEXT,
  business_type VARCHAR(100),
  years_of_experience INTEGER,
  whatsapp_number VARCHAR(20),
  gst_number VARCHAR(20) UNIQUE,
  verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  total_products INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_gst ON vendor_profiles(gst_number);

DROP TRIGGER IF EXISTS trg_vendor_profile_updated_at ON vendor_profiles;
CREATE TRIGGER trg_vendor_profile_updated_at BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Legacy-compatible Vendor table used by vendor dashboard + admin onboarding joins
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  shop_name VARCHAR(255),
  owner_name VARCHAR(100),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  shop_address TEXT,
  shop_latitude NUMERIC(10,8),
  shop_longitude NUMERIC(11,8),
  location_label TEXT,
  location_updated_at TIMESTAMPTZ,
  gst_number VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_phone ON vendors(phone);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Client Profile (Customer)
CREATE TABLE IF NOT EXISTS client_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  company VARCHAR(100),
  service_preference VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_client_profile_updated_at ON client_profiles;
CREATE TRIGGER trg_client_profile_updated_at BEFORE UPDATE ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Admin Profile
CREATE TABLE IF NOT EXISTS admin_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  admin_id VARCHAR(50) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('admin', 'supervisor', 'dispatcher', 'support')),
  access_level INTEGER DEFAULT 1 CHECK (access_level BETWEEN 1 AND 5),
  permissions JSONB DEFAULT '{}',
  department VARCHAR(100),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_email ON admin_profiles(admin_id);
CREATE INDEX idx_admin_role ON admin_profiles(role);

DROP TRIGGER IF EXISTS trg_admin_profile_updated_at ON admin_profiles;
CREATE TRIGGER trg_admin_profile_updated_at BEFORE UPDATE ON admin_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 4. DOCUMENTS & KYC
-- ==================================================================================

CREATE TABLE IF NOT EXISTS user_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'aadhar', 'pan', 'license', 'passport', 'gst', 'address_proof'
  document_url TEXT NOT NULL,
  front_url TEXT,
  back_url TEXT,
  status document_status_enum DEFAULT 'pending',
  rejection_reason TEXT,
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON user_documents(user_id);
CREATE INDEX idx_documents_type ON user_documents(document_type);
CREATE INDEX idx_documents_status ON user_documents(status);

DROP TRIGGER IF EXISTS trg_documents_updated_at ON user_documents;
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON user_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bank Accounts (unified)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  account_holder_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  ifsc_code VARCHAR(20) NOT NULL,
  bank_name VARCHAR(100),
  bank_branch VARCHAR(100),
  upi_id VARCHAR(100),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_user ON bank_accounts(user_id);

DROP TRIGGER IF EXISTS trg_bank_updated_at ON bank_accounts;
CREATE TRIGGER trg_bank_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 5. ADDRESSES & LOCATIONS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag VARCHAR(50) DEFAULT 'other', -- 'home', 'work', 'warehouse', 'other'
  address_text TEXT NOT NULL,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_default ON addresses(user_id, is_default);

-- Real-time Location Updates (for drivers/workers in transit)
CREATE TABLE IF NOT EXISTS location_updates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL, -- 'driver', 'worker'
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  heading NUMERIC(5,2) DEFAULT 0,
  speed NUMERIC(5,2) DEFAULT 0,
  accuracy NUMERIC(5,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_location_user ON location_updates(user_id);
CREATE INDEX idx_location_updated ON location_updates(updated_at DESC);
CREATE INDEX idx_location_coords ON location_updates(latitude, longitude);

-- ==================================================================================
-- 6. SKILLS & EXPERTISE (for workers)
-- ==================================================================================

CREATE TABLE IF NOT EXISTS worker_skills (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(100) NOT NULL,
  skill_category VARCHAR(50) NOT NULL,
  proficiency VARCHAR(20) DEFAULT 'intermediate' CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
  years_of_experience INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_user ON worker_skills(user_id);
CREATE INDEX idx_skills_category ON worker_skills(skill_category);

-- ==================================================================================
-- 7. VEHICLES (for drivers)
-- ==================================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_type VARCHAR(50) NOT NULL, -- '2w', '3w', '4w'
  model_id VARCHAR(100),
  model_name VARCHAR(100),
  weight_capacity NUMERIC(10,2),
  dimensions VARCHAR(100),
  body_type VARCHAR(50),
  vehicle_number VARCHAR(50) UNIQUE NOT NULL,
  license_plate VARCHAR(50),
  registration_number VARCHAR(50),
  rc_book_url TEXT,
  insurance_url TEXT,
  pollution_certificate_url TEXT,
  fitness_certificate_url TEXT,
  status user_status_enum DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicle_driver ON vehicles(driver_id);

DROP TRIGGER IF EXISTS trg_vehicle_updated_at ON vehicles;
CREATE TRIGGER trg_vehicle_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 8. JOBS & TASKS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  client_id BIGINT REFERENCES client_profiles(id) ON DELETE SET NULL,
  job_title VARCHAR(150) NOT NULL,
  description TEXT,
  job_type job_type_enum DEFAULT 'task',
  category VARCHAR(100),
  location VARCHAR(200),
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  status job_status_enum DEFAULT 'pending',
  required_skills TEXT[],
  priority priority_enum DEFAULT 'normal',
  estimated_hours NUMERIC(8,2),
  estimated_duration VARCHAR(100),
  pay_amount NUMERIC(12,2),
  payment_type VARCHAR(50) DEFAULT 'hourly', -- 'hourly', 'fixed', 'daily'
  start_date DATE,
  end_date DATE,
  deadline TIMESTAMPTZ,
  assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_user_type user_type_enum, -- 'driver', 'worker'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rating NUMERIC(3,2),
  feedback TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(job_type);
CREATE INDEX idx_jobs_assigned ON jobs(assigned_user_id);
CREATE INDEX idx_jobs_date ON jobs(start_date, end_date);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Delivery-specific tracking
CREATE TABLE IF NOT EXISTS deliveries (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id BIGINT REFERENCES driver_profiles(id) ON DELETE SET NULL,
  status order_status_enum DEFAULT 'pending',
  pickup_location TEXT,
  delivery_location TEXT,
  distance_km NUMERIC(10,2),
  estimated_delivery_time TIMESTAMPTZ,
  actual_delivery_time TIMESTAMPTZ,
  payment_amount NUMERIC(12,2),
  commission_amount NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_job ON deliveries(job_id);
CREATE INDEX idx_delivery_driver ON deliveries(driver_id);

DROP TRIGGER IF EXISTS trg_delivery_updated_at ON deliveries;
CREATE TRIGGER trg_delivery_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 9. PRODUCTS & INVENTORY
-- ==================================================================================

CREATE TABLE IF NOT EXISTS catalog_items (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  detailed_description TEXT,
  image_url TEXT,
  brand VARCHAR(100),
  hsn_code VARCHAR(50),
  unit VARCHAR(20) DEFAULT 'pcs',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalog_category ON catalog_items(category);

-- Vendor Products with pricing
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  vendor_id BIGINT NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  catalog_item_id BIGINT REFERENCES catalog_items(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  stock INTEGER DEFAULT 0,
  mrp NUMERIC(12,2),
  selling_price NUMERIC(12,2) NOT NULL,
  cost_price NUMERIC(12,2),
  gst_percent NUMERIC(5,2) DEFAULT 18,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  is_bulk BOOLEAN DEFAULT FALSE,
  bulk_discount NUMERIC(5,2),
  approval_status VARCHAR(50) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  status_active BOOLEAN DEFAULT TRUE,
  search_tags JSONB DEFAULT '[]',
  fts_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_approval ON products(approval_status, is_active);
CREATE INDEX idx_products_fts ON products USING GIN(fts_vector);

DROP TRIGGER IF EXISTS trg_product_updated_at ON products;
CREATE TRIGGER trg_product_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vendor Inventory Tracking
CREATE TABLE IF NOT EXISTS vendor_inventory (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_location VARCHAR(255),
  stock_quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  last_restocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, product_id)
);

CREATE INDEX idx_inventory_vendor ON vendor_inventory(vendor_id);
CREATE INDEX idx_inventory_product ON vendor_inventory(product_id);

-- ==================================================================================
-- 10. ORDERS & TRANSACTIONS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  vendor_id BIGINT REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  pickup_address TEXT,
  pickup_latitude NUMERIC(10,8),
  pickup_longitude NUMERIC(11,8),
  delivery_address TEXT,
  delivery_latitude NUMERIC(10,8),
  delivery_longitude NUMERIC(11,8),
  quantity INTEGER NOT NULL DEFAULT 1,
  status order_status_enum DEFAULT 'pending',
  order_amount NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  delivery_distance_km NUMERIC(10,2),
  tip_amount NUMERIC(12,2) DEFAULT 0,
  items_total NUMERIC(12,2),
  final_total NUMERIC(12,2),
  vehicle_type VARCHAR(40),
  delivery_pricing_json JSONB,
  delivery_address_id BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  scheduled_delivery_date DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_vendor ON orders(vendor_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 11. FINANCIAL - WALLETS & TRANSACTIONS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(15,2) DEFAULT 0,
  total_earnings NUMERIC(15,2) DEFAULT 0,
  total_withdrawals NUMERIC(15,2) DEFAULT 0,
  pending_payments NUMERIC(15,2) DEFAULT 0,
  total_commissions NUMERIC(15,2) DEFAULT 0,
  last_payment_date TIMESTAMPTZ,
  last_withdrawal_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_user ON wallets(user_id);

DROP TRIGGER IF EXISTS trg_wallet_updated_at ON wallets;
CREATE TRIGGER trg_wallet_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Unified Transaction History
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id BIGINT REFERENCES wallets(id) ON DELETE SET NULL,
  related_entity_type VARCHAR(50), -- 'job', 'delivery', 'order', 'order_item'
  related_entity_id BIGINT,
  transaction_type transaction_type_enum NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  status transaction_status_enum DEFAULT 'completed',
  balance_after NUMERIC(15,2),
  reference_id VARCHAR(100),
  payment_method VARCHAR(50), -- 'bank_transfer', 'wallet', 'upi', 'cheque'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transaction_status ON transactions(status);
CREATE INDEX idx_transaction_date ON transactions(created_at DESC);
CREATE INDEX idx_transaction_entity ON transactions(related_entity_type, related_entity_id);

-- ==================================================================================
-- 12. RATINGS & REVIEWS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS ratings (
  id BIGSERIAL PRIMARY KEY,
  rater_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rated_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  rating NUMERIC(3,2) NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  categories JSONB, -- {cleanliness: 4.5, professionalism: 5, punctuality: 4}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ratings_rated_user ON ratings(rated_user_id);
CREATE INDEX idx_ratings_job ON ratings(job_id);

-- ==================================================================================
-- 13. SUPPORT & TICKETS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'payment', 'job', 'account', 'delivery', 'technical', 'other'
  priority priority_enum DEFAULT 'normal',
  status ticket_status_enum DEFAULT 'open',
  assigned_to BIGINT REFERENCES admin_profiles(id) ON DELETE SET NULL,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_user ON support_tickets(user_id);
CREATE INDEX idx_ticket_status ON support_tickets(status);
CREATE INDEX idx_ticket_priority ON support_tickets(priority);

DROP TRIGGER IF EXISTS trg_ticket_updated_at ON support_tickets;
CREATE TRIGGER trg_ticket_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 14. CONVERSATIONS & MESSAGING
-- ==================================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  participant1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  conversation_type VARCHAR(50) DEFAULT 'direct', -- 'direct', 'group', 'support'
  support_ticket_id BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL,
  related_entity_type VARCHAR(50),
  related_entity_id BIGINT,
  last_message_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_participant1 ON conversations(participant1_id);
CREATE INDEX idx_conversation_participant2 ON conversations(participant2_id);
CREATE INDEX idx_conversation_updated ON conversations(last_message_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  attachment_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_conversation ON messages(conversation_id);
CREATE INDEX idx_message_sender ON messages(sender_id);

-- ==================================================================================
-- 15. NOTIFICATIONS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL, -- 'info', 'promo', 'alert', 'update', 'order_status'
  target_app VARCHAR(50), -- 'driver', 'worker', 'vendor', 'client', 'admin'
  related_entity_type VARCHAR(50),
  related_entity_id BIGINT,
  image_url TEXT,
  link_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_user ON notifications(user_id);
CREATE INDEX idx_notification_type ON notifications(notification_type);
CREATE INDEX idx_notification_read ON notifications(is_read);

-- ==================================================================================
-- 16. PRICING & RATES
-- ==================================================================================

-- Vehicle pricing for delivery services
CREATE TABLE IF NOT EXISTS vehicle_pricing (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type VARCHAR(50) UNIQUE NOT NULL, -- '2w', '3w', '4w'
  display_name VARCHAR(100) NOT NULL,
  base_fare NUMERIC(10,2) NOT NULL,
  rate_per_km NUMERIC(10,2) NOT NULL,
  min_km NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_vehicle_pricing_updated_at ON vehicle_pricing;
CREATE TRIGGER trg_vehicle_pricing_updated_at BEFORE UPDATE ON vehicle_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Service/Manpower pricing (like UrbanCompany)
CREATE TABLE IF NOT EXISTS service_pricing (
  id BIGSERIAL PRIMARY KEY,
  service_category VARCHAR(100) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  service_code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  base_price NUMERIC(12,2) NOT NULL,
  rate_per_hour NUMERIC(12,2) NOT NULL,
  min_hours NUMERIC(5,2) DEFAULT 1,
  estimated_duration VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_category ON service_pricing(service_category);

DROP TRIGGER IF EXISTS trg_service_pricing_updated_at ON service_pricing;
CREATE TRIGGER trg_service_pricing_updated_at BEFORE UPDATE ON service_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 17. CONTENT & MARKETING
-- ==================================================================================

CREATE TABLE IF NOT EXISTS banners (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  image_url TEXT NOT NULL,
  link_url TEXT,
  target_pages VARCHAR(255) DEFAULT 'all',
  position VARCHAR(50) DEFAULT 'hero', -- 'hero', 'sidebar', 'inline', 'popup'
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_banner_updated_at ON banners;
CREATE TRIGGER trg_banner_updated_at BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================================================================================
-- 18. SYSTEM & SETTINGS
-- ==================================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settings_key ON app_settings(key);

-- Admin Activity Log
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES admin_profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id BIGINT,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_admin ON admin_activity_logs(admin_id);
CREATE INDEX idx_activity_date ON admin_activity_logs(created_at DESC);

-- ==================================================================================
-- 19. AUTO-INIT FUNCTIONS
-- ==================================================================================

-- Auto-create wallet when new user is created
CREATE OR REPLACE FUNCTION init_user_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_user ON users;
CREATE TRIGGER trg_init_user AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION init_user_records();

-- Update wallet balance after job completion
CREATE OR REPLACE FUNCTION update_earnings_on_job_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE wallets
    SET
      balance = balance + COALESCE(NEW.pay_amount, 0),
      total_earnings = total_earnings + COALESCE(NEW.pay_amount, 0),
      last_payment_date = NOW()
    WHERE user_id = NEW.assigned_user_id;
    
    INSERT INTO transactions (user_id, related_entity_type, related_entity_id, transaction_type, amount, description, status)
    VALUES (
      NEW.assigned_user_id,
      'job',
      NEW.id,
      'credit',
      COALESCE(NEW.pay_amount, 0),
      'Payment for job: ' || NEW.job_title,
      'completed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_completion ON jobs;
CREATE TRIGGER trg_job_completion AFTER UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_earnings_on_job_completion();

-- ==================================================================================
-- 20. SEED DATA
-- ==================================================================================

-- Vehicle Pricing
INSERT INTO vehicle_pricing (vehicle_type, display_name, base_fare, rate_per_km, min_km) VALUES
  ('2w', 'Two-Wheeler', 29, 4, 0),
  ('3w', 'Three-Wheeler', 149, 8, 0),
  ('4w', '4 Wheeler Cargo', 399, 15, 0)
ON CONFLICT (vehicle_type) DO NOTHING;

-- Service Categories (Examples)
INSERT INTO service_pricing (service_category, service_name, service_code, base_price, rate_per_hour) VALUES
  ('Cleaning', 'Home Cleaning', 'CLEAN_HOME', 299, 150),
  ('Repairs', 'Electrical Repair', 'REPAIR_ELEC', 399, 200),
  ('Plumbing', 'Plumbing Service', 'PLUMB_SVC', 299, 180)
ON CONFLICT (service_code) DO NOTHING;

-- App Settings
INSERT INTO app_settings (key, value, value_type, description) VALUES
  ('platform_name', 'Dechta', 'string', 'Platform name'),
  ('commission_driver', '0.10', 'number', 'Driver commission rate'),
  ('commission_worker', '0.15', 'number', 'Worker commission rate'),
  ('commission_vendor', '0.05', 'number', 'Vendor commission rate'),
  ('max_otp_attempts', '3', 'number', 'Maximum OTP verification attempts'),
  ('otp_expiry_minutes', '5', 'number', 'OTP expiry time in minutes')
ON CONFLICT (key) DO NOTHING;

-- ==================================================================================
-- END UNIFIED SCHEMA
-- ==================================================================================
-- Tables: 26+ | Views: 1+ | Functions: 3+ | Triggers: 15+
-- Ready for production deployment
-- ==================================================================================
