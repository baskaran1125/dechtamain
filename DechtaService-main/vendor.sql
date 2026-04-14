-- ================================================================
-- DECHTA SERVICE — VENDOR DASHBOARD SCHEMA
-- PostgreSQL 13+  |  8 Tables  |  3 Triggers  |  2 Functions
-- Production Ready - Safe to run on existing database
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- UTILITY FUNCTION: Auto-update updated_at timestamp
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ================================================================
-- 1. VENDORS - Vendor shop profile and authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name      VARCHAR(100),
  shop_name       VARCHAR(150)  NOT NULL,
  email           VARCHAR(100)  UNIQUE,
  phone           VARCHAR(20)   NOT NULL UNIQUE,
  gst_number      VARCHAR(50),
  location        VARCHAR(150),
  area            VARCHAR(100),
  bank_account_no VARCHAR(20),
  ifsc_code       VARCHAR(20),
  bank_name       VARCHAR(100),
  shop_address    TEXT,
  status          VARCHAR(30)   DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','active','inactive','suspended')),
  is_active       BOOLEAN       DEFAULT TRUE,
  self_delivery   BOOLEAN       DEFAULT FALSE,
  verification_status VARCHAR(30) DEFAULT 'pending'
                    CHECK (verification_status IN ('pending','verified','rejected')),
  kyc_rejection_reason TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_phone       ON vendors(phone);
CREATE INDEX IF NOT EXISTS idx_vendor_email       ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendor_status      ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendor_is_active   ON vendors(is_active);

DROP TRIGGER IF EXISTS trg_vendor_updated_at ON vendors;
CREATE TRIGGER trg_vendor_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 2. VENDOR_AUTH - OTP-based authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_auth (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID        REFERENCES vendors(id) ON DELETE CASCADE,
  phone         VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  otp           VARCHAR(6),
  otp_expires   TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_auth_phone ON vendor_auth(phone);
CREATE INDEX IF NOT EXISTS idx_vendor_auth_vendor ON vendor_auth(vendor_id);

DROP TRIGGER IF EXISTS trg_vendor_auth_updated_at ON vendor_auth;
CREATE TRIGGER trg_vendor_auth_updated_at BEFORE UPDATE ON vendor_auth
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 3. PRODUCTS - Vendor inventory with pricing and GST
-- ================================================================
CREATE TABLE IF NOT EXISTS products (
  id                     BIGSERIAL        PRIMARY KEY,
  vendor_id              UUID             NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  brand                  VARCHAR(100),
  name                   VARCHAR(150)     NOT NULL,
  description            VARCHAR(500),
  detailed_description   TEXT,
  product_quality        VARCHAR(50),
  warranty               VARCHAR(100),
  measurements           VARCHAR(100),
  category               VARCHAR(100)     NOT NULL,
  mrp                    NUMERIC(12,2)    NOT NULL,
  selling_price          NUMERIC(12,2)    NOT NULL,
  total_price            NUMERIC(12,2),
  stock_quantity         INTEGER          DEFAULT 0,
  unit                   VARCHAR(20)      DEFAULT 'pcs',
  images                 JSONB,
  hsn_code               VARCHAR(20),
  gst_percent            NUMERIC(5,2)     DEFAULT 18,
  is_bulk                BOOLEAN          DEFAULT FALSE,
  bulk_discount_percent  NUMERIC(5,2)     DEFAULT 0,
  length_cm              NUMERIC(10,2),
  width_cm               NUMERIC(10,2),
  height_cm              NUMERIC(10,2),
  weight_kg              NUMERIC(10,2),
  predicted_vehicle_type VARCHAR(50),
  is_active              BOOLEAN          DEFAULT TRUE,
  is_boosted             BOOLEAN          DEFAULT FALSE,
  status                 VARCHAR(30)      DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','active','inactive')),
  reject_reason          TEXT,
  rating                 INTEGER          DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  self_delivery          BOOLEAN          DEFAULT FALSE,
  created_at             TIMESTAMPTZ      DEFAULT NOW(),
  updated_at             TIMESTAMPTZ      DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_vendor        ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_product_status        ON products(status);
CREATE INDEX IF NOT EXISTS idx_product_is_active     ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_product_category      ON products(category);
CREATE INDEX IF NOT EXISTS idx_product_is_boosted    ON products(is_boosted);

DROP TRIGGER IF EXISTS trg_product_updated_at ON products;
CREATE TRIGGER trg_product_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 4. ORDERS - Vendor-side orders from customers
-- ================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                 BIGSERIAL      PRIMARY KEY,
  vendor_id          UUID           REFERENCES vendors(id) ON DELETE SET NULL,
  driver_id          UUID,
  order_number       VARCHAR(50)    UNIQUE,
  product_id         BIGINT         REFERENCES products(id) ON DELETE SET NULL,
  product_name       VARCHAR(200),
  quantity           INTEGER        NOT NULL DEFAULT 1,
  mrp                NUMERIC(12,2),
  selling_price      NUMERIC(12,2),
  items_total        NUMERIC(12,2),
  gst_amount         NUMERIC(12,2),
  delivery_fee       NUMERIC(10,2)  DEFAULT 0,
  final_total        NUMERIC(12,2),
  customer_name      VARCHAR(100)   NOT NULL,
  customer_phone     VARCHAR(20)    NOT NULL,
  customer_email     VARCHAR(100),
  pickup_address     TEXT,
  pickup_landmark    VARCHAR(100),
  pickup_latitude    NUMERIC(10,8),
  pickup_longitude   NUMERIC(11,8),
  delivery_address   TEXT           NOT NULL,
  delivery_landmark  VARCHAR(100),
  delivery_latitude  NUMERIC(10,8),
  delivery_longitude NUMERIC(11,8),
  delivery_date      DATE,
  delivery_time_slot VARCHAR(50),
  distance_km        NUMERIC(8,2),
  vehicle_type       VARCHAR(50),
  status             VARCHAR(30)    DEFAULT 'pending'
                       CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled','returned')),
  payment_status     VARCHAR(30)    DEFAULT 'pending'
                       CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_method     VARCHAR(50),
  notes              TEXT,
  created_at         TIMESTAMPTZ    DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_vendor        ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_date          ON orders(created_at DESC);

DROP TRIGGER IF EXISTS trg_order_updated_at ON orders;
CREATE TRIGGER trg_order_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 5. INVOICES - GST invoices for accounting
-- ================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id             BIGSERIAL      PRIMARY KEY,
  vendor_id      UUID           NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  order_id       BIGINT         REFERENCES orders(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50)    NOT NULL UNIQUE,
  invoice_date   DATE           NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE,
  subtotal       NUMERIC(12,2)  NOT NULL,
  gst_amount     NUMERIC(12,2)  NOT NULL DEFAULT 0,
  total_amount   NUMERIC(12,2)  NOT NULL,
  items          JSONB,
  status         VARCHAR(30)    DEFAULT 'draft'
                   CHECK (status IN ('draft','issued','paid','overdue','cancelled')),
  notes          TEXT,
  created_at     TIMESTAMPTZ    DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_vendor  ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status  ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_number  ON invoices(invoice_number);

DROP TRIGGER IF EXISTS trg_invoice_updated_at ON invoices;
CREATE TRIGGER trg_invoice_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 6. VENDOR_SETTLEMENTS - Payment settlements to vendors
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_settlements (
  id               BIGSERIAL      PRIMARY KEY,
  vendor_id        UUID           NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  settlement_date  DATE           NOT NULL DEFAULT CURRENT_DATE,
  period_start     DATE,
  period_end       DATE,
  total_orders     INTEGER        DEFAULT 0,
  gross_amount     NUMERIC(12,2)  DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,
  adjustments      NUMERIC(12,2)  DEFAULT 0,
  net_settlement   NUMERIC(12,2)  NOT NULL,
  status           VARCHAR(30)    DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','processing','settled','failed')),
  settled_at       TIMESTAMPTZ,
  settlement_bank  VARCHAR(50),
  reference_number VARCHAR(100),
  notes            TEXT,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_vendor   ON vendor_settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_settlement_status   ON vendor_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_date     ON vendor_settlements(settlement_date DESC);

DROP TRIGGER IF EXISTS trg_settlement_updated_at ON vendor_settlements;
CREATE TRIGGER trg_settlement_updated_at BEFORE UPDATE ON vendor_settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 7. VENDOR_SUPPORT_TICKETS - Support tickets system
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_support_tickets (
  id             BIGSERIAL      PRIMARY KEY,
  vendor_id      UUID           NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  ticket_number  VARCHAR(50)    NOT NULL UNIQUE,
  subject        VARCHAR(200)   NOT NULL,
  category       VARCHAR(50)    NOT NULL
                   CHECK (category IN ('order','product','payment','account','technical','other')),
  description    TEXT           NOT NULL,
  priority       VARCHAR(30)    DEFAULT 'normal'
                   CHECK (priority IN ('low','normal','high','urgent')),
  status         VARCHAR(30)    DEFAULT 'open'
                   CHECK (status IN ('open','in_progress','pending_info','resolved','closed','reopened')),
  admin_response TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ    DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_vendor     ON vendor_support_tickets(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status     ON vendor_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_priority   ON vendor_support_tickets(priority);

DROP TRIGGER IF EXISTS trg_ticket_updated_at ON vendor_support_tickets;
CREATE TRIGGER trg_ticket_updated_at BEFORE UPDATE ON vendor_support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 8. VENDOR_QUERIES - General queries and feedback
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_queries (
  id          BIGSERIAL      PRIMARY KEY,
  vendor_id   UUID           NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  subject     VARCHAR(200)   NOT NULL,
  message     TEXT           NOT NULL,
  query_type  VARCHAR(50)    NOT NULL
                CHECK (query_type IN ('inquiry','suggestion','complaint','general')),
  status      VARCHAR(30)    DEFAULT 'new'
                CHECK (status IN ('new','viewed','replied','resolved','closed')),
  reply       TEXT,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ    DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_vendor   ON vendor_queries(vendor_id);
CREATE INDEX IF NOT EXISTS idx_query_status   ON vendor_queries(status);
CREATE INDEX IF NOT EXISTS idx_query_date     ON vendor_queries(created_at DESC);

DROP TRIGGER IF EXISTS trg_query_updated_at ON vendor_queries;
CREATE TRIGGER trg_query_updated_at BEFORE UPDATE ON vendor_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- VIEW: vendor_dashboard_stats - For vendor dashboard analytics
-- ================================================================
CREATE OR REPLACE VIEW vendor_dashboard_stats AS
SELECT
  v.id AS vendor_id,
  v.shop_name,
  COUNT(DISTINCT p.id) AS total_products,
  COUNT(DISTINCT CASE WHEN p.is_active = TRUE THEN p.id END) AS active_products,
  COUNT(DISTINCT CASE WHEN p.is_boosted = TRUE THEN p.id END) AS boosted_products,
  COUNT(DISTINCT CASE WHEN p.status = 'pending' THEN p.id END) AS pending_approval_products,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) AS delivered_orders,
  COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.final_total ELSE 0 END), 0) AS total_revenue,
  COALESCE(AVG(p.rating), 0) AS avg_product_rating,
  COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) AS pending_orders
FROM vendors v
LEFT JOIN products p ON p.vendor_id = v.id
LEFT JOIN orders o ON o.vendor_id = v.id
GROUP BY v.id, v.shop_name;


-- ================================================================
-- FUNCTION: init_vendor_records
-- Auto-creates vendor_auth entry when vendor is created
-- ================================================================
CREATE OR REPLACE FUNCTION init_vendor_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO vendor_auth (vendor_id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_vendor ON vendors;
CREATE TRIGGER trg_init_vendor AFTER INSERT ON vendors
  FOR EACH ROW EXECUTE FUNCTION init_vendor_records();


-- ================================================================
-- FUNCTION: calculate_product_total_price
-- Automatically calculate total_price (selling_price + GST)
-- ================================================================
CREATE OR REPLACE FUNCTION calculate_product_total_price()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.selling_price IS NOT NULL AND NEW.gst_percent IS NOT NULL THEN
    NEW.total_price = NEW.selling_price + (NEW.selling_price * NEW.gst_percent / 100);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_total_price ON products;
CREATE TRIGGER trg_calculate_total_price BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION calculate_product_total_price();


-- ================================================================
-- FUNCTION: update_vendor_settlement
-- Auto-create settlement records on specific dates
-- ================================================================
CREATE OR REPLACE FUNCTION update_vendor_settlement()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_vendor_id UUID;
  v_period_start DATE;
  v_period_end DATE;
  v_total_pending NUMERIC(12,2);
BEGIN

  FOR v_vendor_id IN
    SELECT DISTINCT vendor_id FROM vendors WHERE is_active = TRUE
  LOOP
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT COALESCE(SUM(final_total), 0)
    INTO v_total_pending
    FROM orders
    WHERE vendor_id = v_vendor_id
      AND status = 'delivered'
      AND DATE(created_at) >= v_period_start
      AND DATE(created_at) <= v_period_end;

    INSERT INTO vendor_settlements
      (vendor_id, period_start, period_end, net_settlement, status)
    VALUES (v_vendor_id, v_period_start, v_period_end, v_total_pending, 'pending')
    ON CONFLICT DO NOTHING;

  END LOOP;

END;
$$;


-- ================================================================
-- 9. VENDOR_WALLETS - Vendor monetary wallet for balance
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_wallets (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID          NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  balance         NUMERIC(12,2) DEFAULT 0,
  last_updated    TIMESTAMPTZ   DEFAULT NOW(),
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_wallet_vendor ON vendor_wallets(vendor_id);


-- ================================================================
-- 10. VENDOR_PAYMENT_ORDERS - Track payment orders for add money
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_payment_orders (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  cashfree_order_id   VARCHAR(120)  NOT NULL UNIQUE,
  amount              NUMERIC(10,2) NOT NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_vendor ON vendor_payment_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pay_cf_id ON vendor_payment_orders(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_pay_pending ON vendor_payment_orders(status) WHERE status = 'PENDING';


-- ================================================================
-- 11. VENDOR_WITHDRAWALS - Track withdrawal requests
-- ================================================================
CREATE TABLE IF NOT EXISTS vendor_withdrawals (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  method          VARCHAR(20)   NOT NULL, -- 'upi' or 'bank'
  upi_id          VARCHAR(100),
  account_number  VARCHAR(20),
  ifsc_code       VARCHAR(20),
  account_name    VARCHAR(100),
  status          VARCHAR(30)   DEFAULT 'PENDING',
  reference_id    VARCHAR(50),
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_vendor ON vendor_withdrawals(vendor_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON vendor_withdrawals(status);


-- ================================================================
-- END OF VENDOR SCHEMA (UPDATED)
-- 11 tables | 2 functions | 3 triggers | 1 view
-- ================================================================
