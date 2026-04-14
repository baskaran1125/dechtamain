-- ================================================================
-- DECHTA SERVICE — DRIVER APPLICATION SCHEMA
-- PostgreSQL 13+  |  26 Tables  |  7 Triggers  |  4 Functions
-- Production Ready - Safe to run on existing database
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- UTILITY FUNCTION: Auto-update updated_at timestamp on row changes
-- ================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ================================================================
-- 1. OTP_VERIFICATION - OTP login authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS otp_verification (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_number  VARCHAR(20)  NOT NULL UNIQUE,
  otp            VARCHAR(6)   NOT NULL,
  is_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  attempts       INTEGER      NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_mobile     ON otp_verification(mobile_number);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verification(expires_at);

DROP TRIGGER IF EXISTS trg_otp_updated_at ON otp_verification;
CREATE TRIGGER trg_otp_updated_at BEFORE UPDATE ON otp_verification
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 2. DRIVER_PROFILES - Core driver identity
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_profiles (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_number       VARCHAR(20)   NOT NULL UNIQUE,
  driver_id           VARCHAR(30)   UNIQUE,
  full_name           VARCHAR(100),
  dob                 DATE,
  blood_group         VARCHAR(5),
  tshirt_size         VARCHAR(10),
  emergency_contact   VARCHAR(20),
  preferred_zone      VARCHAR(100),
  avatar_url          TEXT,
  referral_code       VARCHAR(50)   UNIQUE,
  referred_by_code    VARCHAR(50),
  is_approved         BOOLEAN       NOT NULL DEFAULT FALSE,
  is_online           BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  is_registered       BOOLEAN       NOT NULL DEFAULT FALSE,
  status              VARCHAR(20)   NOT NULL DEFAULT 'offline'
                        CHECK (status IN ('online','offline','on_delivery')),
  is_pilot_this_week  BOOLEAN       NOT NULL DEFAULT FALSE,
  pilot_week_start    DATE,
  commission_rate     NUMERIC(5,4)  NOT NULL DEFAULT 0.10,
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_mobile        ON driver_profiles(mobile_number);
CREATE INDEX IF NOT EXISTS idx_driver_referral_code ON driver_profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_driver_is_online     ON driver_profiles(is_online);
CREATE INDEX IF NOT EXISTS idx_driver_is_approved   ON driver_profiles(is_approved);

DROP TRIGGER IF EXISTS trg_driver_profiles_updated_at ON driver_profiles;
CREATE TRIGGER trg_driver_profiles_updated_at BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 3. DRIVER_STATS - All-time + weekly performance metrics
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_stats (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                 UUID          NOT NULL UNIQUE
                              REFERENCES driver_profiles(id) ON DELETE CASCADE,
  total_earnings            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gross_earnings      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_commission_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_orders_completed    INTEGER       NOT NULL DEFAULT 0,
  total_orders_accepted     INTEGER       NOT NULL DEFAULT 0,
  total_orders_cancelled    INTEGER       NOT NULL DEFAULT 0,
  total_orders_missed       INTEGER       NOT NULL DEFAULT 0,
  total_distance_km         NUMERIC(10,2) NOT NULL DEFAULT 0,
  rating                    NUMERIC(3,2)  NOT NULL DEFAULT 5.0,
  driver_name               VARCHAR(100),
  avatar_url                TEXT,
  week_start_date           DATE          NOT NULL DEFAULT CURRENT_DATE,
  weekly_orders_completed   INTEGER       NOT NULL DEFAULT 0,
  weekly_orders_accepted    INTEGER       NOT NULL DEFAULT 0,
  weekly_earnings           NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekly_gross_earnings     NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekly_commission_paid    NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekly_login_minutes      INTEGER       NOT NULL DEFAULT 0,
  weekly_active_minutes     INTEGER       NOT NULL DEFAULT 0,
  weekly_completion_score   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pilot_eligible_next_week  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP     NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_driver_stats_updated_at ON driver_stats;
CREATE TRIGGER trg_driver_stats_updated_at BEFORE UPDATE ON driver_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 4. DRIVER_VEHICLES - Vehicle information
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_vehicles (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID         NOT NULL UNIQUE
                         REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_type         VARCHAR(50),
  model_id             VARCHAR(100),
  model_name           VARCHAR(100),
  weight_capacity      NUMERIC(8,2),
  dimensions           VARCHAR(100),
  body_type            VARCHAR(50),
  registration_number  VARCHAR(50)  UNIQUE,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  is_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_driver_vehicles_updated_at ON driver_vehicles;
CREATE TRIGGER trg_driver_vehicles_updated_at BEFORE UPDATE ON driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 5. DRIVER_BANK_ACCOUNTS - Banking details for withdrawals
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_bank_accounts (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID         NOT NULL UNIQUE
                         REFERENCES driver_profiles(id) ON DELETE CASCADE,
  account_holder_name  VARCHAR(100),
  account_number       VARCHAR(50),
  ifsc_code            VARCHAR(20),
  bank_branch          VARCHAR(100),
  upi_id               VARCHAR(100),
  is_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_bank_driver ON driver_bank_accounts(driver_id);

DROP TRIGGER IF EXISTS trg_driver_bank_updated_at ON driver_bank_accounts;
CREATE TRIGGER trg_driver_bank_updated_at BEFORE UPDATE ON driver_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 6. DRIVER_DOCUMENTSS - KYC documents (Aadhaar, PAN, License, RC)
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_documentss (
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                     UUID         NOT NULL UNIQUE
                                  REFERENCES driver_profiles(id) ON DELETE CASCADE,
  aadhar_front_url              TEXT,
  aadhar_back_url               TEXT,
  aadhar_status                 VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (aadhar_status IN ('pending','verified','rejected','incomplete')),
  pan_front_url                 TEXT,
  pan_back_url                  TEXT,
  pan_status                    VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (pan_status IN ('pending','verified','rejected','incomplete')),
  license_front_url             TEXT,
  license_back_url              TEXT,
  license_status                VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (license_status IN ('pending','verified','rejected','incomplete')),
  rc_front_url                  TEXT,
  rc_back_url                   TEXT,
  rc_status                     VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (rc_status IN ('pending','verified','rejected','incomplete')),
  verification_status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (verification_status IN ('pending','verified','rejected')),
  verification_rejection_reason TEXT,
  kyc_complete                  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at                    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON driver_documentss(driver_id);

DROP TRIGGER IF EXISTS trg_driver_docs_updated_at ON driver_documentss;
CREATE TRIGGER trg_driver_docs_updated_at BEFORE UPDATE ON driver_documentss
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 7. DRIVER_NOTIFICATION_PREFS - Notification settings
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_notification_prefs (
  driver_id   UUID      PRIMARY KEY
                REFERENCES driver_profiles(id) ON DELETE CASCADE,
  new_orders  BOOLEAN   NOT NULL DEFAULT TRUE,
  earnings    BOOLEAN   NOT NULL DEFAULT TRUE,
  promotions  BOOLEAN   NOT NULL DEFAULT TRUE,
  app_updates BOOLEAN   NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_notif_prefs_updated_at ON driver_notification_prefs;
CREATE TRIGGER trg_notif_prefs_updated_at BEFORE UPDATE ON driver_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 8. DRIVER_WALLETS - Wallet balance, commission, dues tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_wallets (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                UUID          NOT NULL UNIQUE
                             REFERENCES driver_profiles(id) ON DELETE CASCADE,
  balance                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_dues         NUMERIC(12,2) NOT NULL DEFAULT 0,
  dues_limit               NUMERIC(10,2) NOT NULL DEFAULT 300,
  today_earnings           NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_trips              INTEGER       NOT NULL DEFAULT 0,
  total_commission_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_updated             TIMESTAMP     NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_driver ON driver_wallets(driver_id);


-- ================================================================
-- 9. DRIVER_TRANSACTIONS - Wallet transaction log for auditing
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_transactions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID          NOT NULL
                  REFERENCES driver_wallets(id) ON DELETE CASCADE,
  trip_id       UUID,
  type          VARCHAR(20)   NOT NULL
                  CHECK (type IN ('credit','debit','commission','withdrawal')),
  amount        NUMERIC(12,2) NOT NULL,
  description   TEXT,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_wallet ON driver_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_date   ON driver_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_trip   ON driver_transactions(trip_id);
CREATE INDEX IF NOT EXISTS idx_tx_type   ON driver_transactions(type);


-- ================================================================
-- 10. ORDERS - Delivery requests from vendors
-- ================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                        BIGSERIAL     PRIMARY KEY,
  vendor_id                 UUID,
  driver_id                 UUID          REFERENCES driver_profiles(id) ON DELETE SET NULL,
  product_name              VARCHAR(255),
  quantity                  INTEGER,
  items_total               NUMERIC(10,2),
  final_total               NUMERIC(10,2),
  order_type                VARCHAR(50),
  client_id                 VARCHAR(100),
  client_name               VARCHAR(100),
  client_phone              VARCHAR(20),
  vendor_shop_name          VARCHAR(255),
  pickup_address            TEXT,
  pickup_latitude           NUMERIC(10,8),
  pickup_longitude          NUMERIC(11,8),
  delivery_address          TEXT,
  delivery_latitude         NUMERIC(10,8),
  delivery_longitude        NUMERIC(11,8),
  delivery_fee              NUMERIC(10,2),
  commission_rate           NUMERIC(5,4)  DEFAULT 0.10,
  vehicle_type              VARCHAR(50),
  model_id_requested        VARCHAR(100),
  model_name_requested      VARCHAR(100),
  weight_capacity_requested NUMERIC(8,2),
  dimensions_requested      VARCHAR(100),
  body_type_requested       VARCHAR(50),
  distance_km               NUMERIC(8,2),
  delivery_otp              VARCHAR(10),
  items                     JSONB,
  driver_name               VARCHAR(100),
  driver_number             VARCHAR(20),
  status                    VARCHAR(50)   NOT NULL DEFAULT 'Pending'
                              CHECK (status IN ('Pending','Assigned','Out for Delivery','Delivered','Cancelled','Missed')),
  order_date                TIMESTAMP     NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP     NOT NULL DEFAULT NOW(),
  is_bulk                   BOOLEAN       NOT NULL DEFAULT FALSE,
  self_delivery             BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_order_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_vendor ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_date   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_pending ON orders(status) WHERE status = 'Pending';

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 11. DELIVERY_TRIPS - Trip execution with financial tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS delivery_trips (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            BIGINT        REFERENCES orders(id) ON DELETE SET NULL,
  driver_id           UUID          NOT NULL
                        REFERENCES driver_profiles(id) ON DELETE CASCADE,
  gross_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  payout_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  distance_text       VARCHAR(100),
  distance_km         NUMERIC(8,2),
  status              VARCHAR(50)   NOT NULL DEFAULT 'accepted'
                        CHECK (status IN ('accepted','arrived_pickup','picked_up','arrived_dropoff','delivered','cancelled','missed')),
  started_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  arrived_pickup_at   TIMESTAMP,
  picked_up_at        TIMESTAMP,
  arrived_dropoff_at  TIMESTAMP,
  completed_at        TIMESTAMP,
  cancelled_at        TIMESTAMP,
  pickup_photo_url    TEXT,
  otp_verified        BOOLEAN       NOT NULL DEFAULT FALSE,
  cancel_reason       TEXT,
  active_minutes      INTEGER       GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NOT NULL AND picked_up_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (completed_at - picked_up_at))::INTEGER / 60)
      ELSE NULL
    END
  ) STORED,
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_driver ON delivery_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_order  ON delivery_trips(order_id);
CREATE INDEX IF NOT EXISTS idx_trip_status ON delivery_trips(status);
CREATE INDEX IF NOT EXISTS idx_trip_week   ON delivery_trips(driver_id, started_at);

DROP TRIGGER IF EXISTS trg_trips_updated_at ON delivery_trips;
CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON delivery_trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 12. DRIVER_LOGIN_SESSIONS - Online/offline tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_login_sessions (
  id               BIGSERIAL  PRIMARY KEY,
  driver_id        UUID       NOT NULL
                     REFERENCES driver_profiles(id) ON DELETE CASCADE,
  went_online_at   TIMESTAMP  NOT NULL DEFAULT NOW(),
  went_offline_at  TIMESTAMP,
  duration_minutes INTEGER    GENERATED ALWAYS AS (
    CASE
      WHEN went_offline_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (went_offline_at - went_online_at))::INTEGER / 60)
      ELSE NULL
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_sessions_driver ON driver_login_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_sessions_week   ON driver_login_sessions(driver_id, went_online_at);
CREATE INDEX IF NOT EXISTS idx_sessions_open   ON driver_login_sessions(driver_id) WHERE went_offline_at IS NULL;


-- ================================================================
-- 13. DRIVER_NOTIFICATIONS - In-app notification inbox
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_notifications (
  id          BIGSERIAL    PRIMARY KEY,
  driver_id   UUID         NOT NULL
                REFERENCES driver_profiles(id) ON DELETE CASCADE,
  title       TEXT         NOT NULL,
  message     TEXT         NOT NULL,
  type        VARCHAR(20)  NOT NULL DEFAULT 'info'
                CHECK (type IN ('info','offer','warning','success','order','promo','system')),
  is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_driver ON driver_notifications(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON driver_notifications(driver_id, is_read) WHERE is_read = FALSE;


-- ================================================================
-- 14. DRIVER_GPS_LOCATIONS - Live GPS tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_gps_locations (
  id           BIGSERIAL     PRIMARY KEY,
  driver_id    UUID          NOT NULL
                 REFERENCES driver_profiles(id) ON DELETE CASCADE,
  trip_id      UUID          REFERENCES delivery_trips(id) ON DELETE SET NULL,
  latitude     NUMERIC(10,8) NOT NULL,
  longitude    NUMERIC(11,8) NOT NULL,
  accuracy     NUMERIC(10,2),
  speed        NUMERIC(10,2),
  heading      NUMERIC(10,2),
  recorded_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_driver ON driver_gps_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_gps_trip   ON driver_gps_locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_gps_time   ON driver_gps_locations(recorded_at DESC);


-- ================================================================
-- 15. DRIVER_CHAT_MESSAGES - In-trip messaging
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_chat_messages (
  id           BIGSERIAL    PRIMARY KEY,
  trip_id      UUID         NOT NULL
                 REFERENCES delivery_trips(id) ON DELETE CASCADE,
  sender_type  VARCHAR(20)  NOT NULL
                 CHECK (sender_type IN ('driver','customer','system')),
  sender_id    UUID,
  message      TEXT         NOT NULL,
  is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_trip ON driver_chat_messages(trip_id, created_at);


-- ================================================================
-- 16. DRIVER_PACKAGE_PHOTOS - Pickup confirmation photos
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_package_photos (
  id           BIGSERIAL    PRIMARY KEY,
  trip_id      UUID         NOT NULL
                 REFERENCES delivery_trips(id) ON DELETE CASCADE,
  driver_id    UUID         NOT NULL
                 REFERENCES driver_profiles(id) ON DELETE CASCADE,
  photo_url    TEXT         NOT NULL,
  step         INTEGER      NOT NULL DEFAULT 0 CHECK (step IN (0,1)),
  uploaded_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_trip ON driver_package_photos(trip_id);


-- ================================================================
-- 17. DRIVER_LEADERBOARD_CACHE - Weekly leaderboard snapshot
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_leaderboard_cache (
  id               BIGSERIAL     PRIMARY KEY,
  driver_id        UUID          NOT NULL
                     REFERENCES driver_profiles(id) ON DELETE CASCADE,
  full_name        TEXT,
  weekly_earnings  NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekly_trips     INTEGER       NOT NULL DEFAULT 0,
  rank_position    INTEGER,
  week_start       DATE          NOT NULL,
  UNIQUE (driver_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_week ON driver_leaderboard_cache(week_start, rank_position);


-- ================================================================
-- 18. DRIVER_REFERRALS - Referral program tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_referrals (
  id            BIGSERIAL     PRIMARY KEY,
  referrer_id   UUID          NOT NULL
                  REFERENCES driver_profiles(id) ON DELETE CASCADE,
  referred_id   UUID          NOT NULL
                  REFERENCES driver_profiles(id) ON DELETE CASCADE,
  bonus_paid    BOOLEAN       NOT NULL DEFAULT FALSE,
  bonus_amount  NUMERIC(10,2) NOT NULL DEFAULT 500,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON driver_referrals(referrer_id);


-- ================================================================
-- 19. DRIVER_ADS - Promotional content
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_ads (
  id                  BIGSERIAL    PRIMARY KEY,
  title               TEXT,
  image_url           TEXT,
  redirect_url        TEXT,
  display_order       INTEGER      NOT NULL DEFAULT 0,
  target_driver_type  VARCHAR(50)  NOT NULL DEFAULT 'all'
                        CHECK (target_driver_type IN ('all','prime','normal')),
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,
  created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_active ON driver_ads(is_active, display_order);

DROP TRIGGER IF EXISTS trg_driver_ads_updated_at ON driver_ads;
CREATE TRIGGER trg_driver_ads_updated_at BEFORE UPDATE ON driver_ads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 20. AVIATION_RANKS - Rank progression system (8 ranks)
-- ================================================================
CREATE TABLE IF NOT EXISTS aviation_ranks (
  id          SMALLINT    PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  threshold   SMALLINT    NOT NULL,
  icon        VARCHAR(30) NOT NULL,
  color_bg    VARCHAR(10) NOT NULL,
  color_text  VARCHAR(10) NOT NULL
);

DELETE FROM aviation_ranks WHERE id IS NOT NULL;
INSERT INTO aviation_ranks (id, name, threshold, icon, color_bg, color_text) VALUES
  (1, 'Trainee',               0,  'user',  '#F1F5F9', '#475569'),
  (2, 'Second Officer',        16, 'award', '#CFFAFE', '#0369A1'),
  (3, 'Junior First Officer',  18, 'award', '#DBEAFE', '#1D4ED8'),
  (4, 'First Officer',         20, 'star',  '#E0E7FF', '#4338CA'),
  (5, 'Captain',               22, 'award', '#F3E8FF', '#7E22CE'),
  (6, 'Flight Captain',        24, 'crown', '#FEF3C7', '#B45309'),
  (7, 'Senior Flight Captain', 26, 'crown', '#FFEDD5', '#C2410C'),
  (8, 'Commercial Captain',    30, 'crown', '#FEE2E2', '#B91C1C')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, threshold = EXCLUDED.threshold;


-- ================================================================
-- 21. DRIVER_ACHIEVEMENTS - Badges and milestones
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_achievements (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        UUID          NOT NULL
                     REFERENCES driver_profiles(id) ON DELETE CASCADE,
  achievement_key  VARCHAR(80)   NOT NULL,
  title            VARCHAR(150)  NOT NULL,
  description      TEXT,
  earned_at        TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_achievements_driver ON driver_achievements(driver_id);


-- ================================================================
-- 22. DRIVER_SOS_ALERTS - Emergency SOS alerts
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_sos_alerts (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID          NOT NULL
                 REFERENCES driver_profiles(id) ON DELETE CASCADE,
  trip_id      UUID          REFERENCES delivery_trips(id) ON DELETE SET NULL,
  latitude     NUMERIC(10,8),
  longitude    NUMERIC(11,8),
  resolved     BOOLEAN       NOT NULL DEFAULT FALSE,
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_driver      ON driver_sos_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_sos_unresolved  ON driver_sos_alerts(resolved) WHERE resolved = FALSE;


-- ================================================================
-- 23. DRIVER_ORDER_IGNORES - Track ignored orders
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_order_ignores (
  id         BIGSERIAL  PRIMARY KEY,
  driver_id  UUID       NOT NULL
               REFERENCES driver_profiles(id) ON DELETE CASCADE,
  order_id   BIGINT     REFERENCES orders(id) ON DELETE SET NULL,
  ignored_at TIMESTAMP  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ignores_driver ON driver_order_ignores(driver_id);
CREATE INDEX IF NOT EXISTS idx_ignores_order  ON driver_order_ignores(order_id);


-- ================================================================
-- 24. DRIVER_PAYMENT_ORDERS - Cashfree top-up tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_payment_orders (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID          NOT NULL
                        REFERENCES driver_profiles(id) ON DELETE CASCADE,
  cashfree_order_id   VARCHAR(120)  NOT NULL UNIQUE,
  amount              NUMERIC(10,2) NOT NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELLED')),
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_driver  ON driver_payment_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_pay_cf_id   ON driver_payment_orders(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_pay_pending ON driver_payment_orders(status) WHERE status = 'PENDING';


-- ================================================================
-- 25. DRIVER_WITHDRAWAL_REQUESTS - Bank withdrawal tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_withdrawal_requests (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID          NOT NULL
                REFERENCES driver_profiles(id) ON DELETE CASCADE,
  wallet_id   UUID          NOT NULL
                REFERENCES driver_wallets(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  upi_id      VARCHAR(100),
  status      VARCHAR(20)   NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  note        TEXT,
  processed_at TIMESTAMP,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_driver ON driver_withdrawal_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON driver_withdrawal_requests(status) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_withdrawal_updated_at ON driver_withdrawal_requests;
CREATE TRIGGER trg_withdrawal_updated_at BEFORE UPDATE ON driver_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 26. DRIVER_SUPPORT_TICKETS - In-app support tickets
-- ================================================================
CREATE TABLE IF NOT EXISTS driver_support_tickets (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID          NOT NULL
                REFERENCES driver_profiles(id) ON DELETE CASCADE,
  trip_id     UUID          REFERENCES delivery_trips(id) ON DELETE SET NULL,
  category    VARCHAR(50)   NOT NULL DEFAULT 'general'
                CHECK (category IN ('payment','order','account','vehicle','other','general')),
  subject     VARCHAR(200)  NOT NULL,
  message     TEXT          NOT NULL,
  status      VARCHAR(20)   NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','resolved','closed')),
  response    TEXT,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_driver ON driver_support_tickets(driver_id);
CREATE INDEX IF NOT EXISTS idx_support_open   ON driver_support_tickets(status) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_support_updated_at ON driver_support_tickets;
CREATE TRIGGER trg_support_updated_at BEFORE UPDATE ON driver_support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- VIEW: earnings_summary - For earnings API endpoint
-- ================================================================
CREATE OR REPLACE VIEW earnings_summary AS
SELECT
  dt.driver_id,
  dt.id AS trip_id,
  o.product_name AS type,
  o.client_name,
  dt.gross_amount,
  dt.commission_amount,
  dt.payout_amount AS amount,
  (COALESCE(dp.commission_rate, 0.10) * 100)::NUMERIC(5,2) AS commission_rate_pct,
  DATE(dt.completed_at AT TIME ZONE 'Asia/Kolkata') AS date,
  DATE_TRUNC('week',  dt.completed_at AT TIME ZONE 'Asia/Kolkata') AS week_start,
  DATE_TRUNC('month', dt.completed_at AT TIME ZONE 'Asia/Kolkata') AS month_start,
  dt.active_minutes,
  dt.distance_text,
  dt.distance_km
FROM delivery_trips dt
JOIN orders o ON o.id = dt.order_id
JOIN driver_profiles dp ON dp.id = dt.driver_id
WHERE dt.status = 'delivered' AND dt.completed_at IS NOT NULL;


-- ================================================================
-- FUNCTION: init_driver_records
-- Auto-creates wallet, stats, docs, prefs on new driver
-- ================================================================
CREATE OR REPLACE FUNCTION init_driver_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO driver_wallets            (driver_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO driver_stats              (driver_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO driver_documentss         (driver_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO driver_notification_prefs (driver_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_driver ON driver_profiles;
CREATE TRIGGER trg_init_driver AFTER INSERT ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION init_driver_records();


-- ================================================================
-- FUNCTION: on_order_ignored
-- Increments total_orders_missed when order ignored
-- ================================================================
CREATE OR REPLACE FUNCTION on_order_ignored()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE driver_stats
  SET total_orders_missed = total_orders_missed + 1, updated_at = NOW()
  WHERE driver_id = NEW.driver_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_ignored ON driver_order_ignores;
CREATE TRIGGER trg_order_ignored AFTER INSERT ON driver_order_ignores
  FOR EACH ROW EXECUTE FUNCTION on_order_ignored();


-- ================================================================
-- FUNCTION: on_trip_accepted
-- Increments weekly_orders_accepted when trip created
-- ================================================================
CREATE OR REPLACE FUNCTION on_trip_accepted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE driver_stats
  SET weekly_orders_accepted = weekly_orders_accepted + 1,
      total_orders_accepted  = total_orders_accepted  + 1,
      updated_at             = NOW()
  WHERE driver_id = NEW.driver_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_accepted ON delivery_trips;
CREATE TRIGGER trg_trip_accepted AFTER INSERT ON delivery_trips
  FOR EACH ROW EXECUTE FUNCTION on_trip_accepted();


-- ================================================================
-- FUNCTION: on_trip_completed
-- Handles wallet credit, commission debit, stats update
-- ================================================================
CREATE OR REPLACE FUNCTION on_trip_completed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_wallet_id UUID;
  v_new_balance NUMERIC(12,2);
BEGIN

  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN

    UPDATE driver_wallets
    SET
      balance                   = balance + COALESCE(NEW.payout_amount, 0),
      today_earnings            = today_earnings + COALESCE(NEW.payout_amount, 0),
      total_trips               = total_trips + 1,
      total_commission_deducted = total_commission_deducted + COALESCE(NEW.commission_amount, 0),
      last_updated              = NOW()
    WHERE driver_id = NEW.driver_id
    RETURNING id, balance INTO v_wallet_id, v_new_balance;

    INSERT INTO driver_transactions
      (wallet_id, trip_id, type, amount, description, balance_after)
    VALUES (v_wallet_id, NEW.id, 'credit', COALESCE(NEW.payout_amount, 0),
            'Delivery payout — Trip ' || NEW.id::TEXT, v_new_balance);

    IF COALESCE(NEW.commission_amount, 0) > 0 THEN
      INSERT INTO driver_transactions
        (wallet_id, trip_id, type, amount, description, balance_after)
      VALUES (v_wallet_id, NEW.id, 'commission', NEW.commission_amount,
              'Commission deducted — Trip ' || NEW.id::TEXT, v_new_balance);
    END IF;

    UPDATE driver_stats
    SET
      total_orders_completed  = total_orders_completed  + 1,
      total_earnings          = total_earnings          + COALESCE(NEW.payout_amount, 0),
      total_gross_earnings    = total_gross_earnings    + COALESCE(NEW.gross_amount, 0),
      total_commission_paid   = total_commission_paid   + COALESCE(NEW.commission_amount, 0),
      weekly_orders_completed = weekly_orders_completed + 1,
      weekly_earnings         = weekly_earnings         + COALESCE(NEW.payout_amount, 0),
      weekly_gross_earnings   = weekly_gross_earnings   + COALESCE(NEW.gross_amount, 0),
      weekly_commission_paid  = weekly_commission_paid  + COALESCE(NEW.commission_amount, 0),
      weekly_active_minutes   = weekly_active_minutes   + COALESCE(NEW.active_minutes, 0),
      weekly_completion_score = CASE
        WHEN (weekly_orders_accepted) = 0 THEN 0
        ELSE LEAST(100, ROUND((weekly_orders_completed + 1)::NUMERIC / weekly_orders_accepted * 100, 2))
      END,
      updated_at = NOW()
    WHERE driver_id = NEW.driver_id;

    UPDATE orders SET status = 'Delivered', updated_at = NOW() WHERE id = NEW.order_id;

  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE driver_stats
    SET total_orders_cancelled = total_orders_cancelled + 1, updated_at = NOW()
    WHERE driver_id = NEW.driver_id;
    UPDATE orders SET status = 'Cancelled', updated_at = NOW() WHERE id = NEW.order_id;
  END IF;

  IF NEW.status = 'missed' AND OLD.status IS DISTINCT FROM 'missed' THEN
    UPDATE driver_stats
    SET total_orders_missed = total_orders_missed + 1, updated_at = NOW()
    WHERE driver_id = NEW.driver_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_completed ON delivery_trips;
CREATE TRIGGER trg_trip_completed AFTER UPDATE ON delivery_trips
  FOR EACH ROW EXECUTE FUNCTION on_trip_completed();


-- ================================================================
-- FUNCTION: on_online_status_change
-- Updates login sessions and weekly login minutes
-- ================================================================
CREATE OR REPLACE FUNCTION on_online_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN

  IF NEW.is_online = TRUE AND OLD.is_online = FALSE THEN
    INSERT INTO driver_login_sessions (driver_id, went_online_at)
    VALUES (NEW.id, NOW());
  END IF;

  IF NEW.is_online = FALSE AND OLD.is_online = TRUE THEN
    UPDATE driver_login_sessions
    SET went_offline_at = NOW()
    WHERE driver_id = NEW.id AND went_offline_at IS NULL;

    UPDATE driver_stats
    SET
      weekly_login_minutes = weekly_login_minutes + COALESCE((
        SELECT duration_minutes
        FROM   driver_login_sessions
        WHERE  driver_id = NEW.id AND went_offline_at IS NOT NULL
        ORDER BY went_offline_at DESC
        LIMIT 1
      ), 0),
      updated_at = NOW()
    WHERE driver_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_status ON driver_profiles;
CREATE TRIGGER trg_online_status
  BEFORE UPDATE OF is_online ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION on_online_status_change();


-- ================================================================
-- FUNCTION: weekly_pilot_reset()
-- Reset weekly counters, set pilot partner flags (Sundays 23:59 IST)
-- ================================================================
CREATE OR REPLACE FUNCTION weekly_pilot_reset()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_target_login_hrs NUMERIC := 38;
  v_target_score     NUMERIC := 65;
BEGIN

  INSERT INTO driver_leaderboard_cache
    (driver_id, full_name, weekly_earnings, weekly_trips, rank_position, week_start)
  SELECT
    ds.driver_id,
    dp.full_name,
    ds.weekly_earnings,
    ds.weekly_orders_completed,
    ROW_NUMBER() OVER (ORDER BY ds.weekly_orders_completed DESC, ds.weekly_earnings DESC),
    ds.week_start_date
  FROM driver_stats ds
  JOIN driver_profiles dp ON dp.id = ds.driver_id
  WHERE ds.weekly_orders_completed > 0
  ON CONFLICT (driver_id, week_start) DO UPDATE
    SET weekly_earnings = EXCLUDED.weekly_earnings,
        weekly_trips    = EXCLUDED.weekly_trips;

  UPDATE driver_profiles dp
  SET
    is_pilot_this_week = (
      (ds.weekly_login_minutes / 60.0) >= v_target_login_hrs
      AND ds.weekly_completion_score   >= v_target_score
    ),
    pilot_week_start   = DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata')::DATE + 7,
    updated_at         = NOW()
  FROM driver_stats ds
  WHERE ds.driver_id = dp.id;

  UPDATE driver_stats SET
    week_start_date         = DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata')::DATE + 7,
    weekly_orders_completed  = 0,
    weekly_orders_accepted   = 0,
    weekly_earnings          = 0,
    weekly_gross_earnings    = 0,
    weekly_commission_paid   = 0,
    weekly_login_minutes     = 0,
    weekly_active_minutes    = 0,
    weekly_completion_score  = 0,
    pilot_eligible_next_week = FALSE,
    updated_at               = NOW();

END;
$$;


-- ================================================================
-- FUNCTION: daily_earnings_reset()
-- Reset today_earnings at midnight IST
-- ================================================================
CREATE OR REPLACE FUNCTION daily_earnings_reset()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE driver_wallets
  SET today_earnings = 0,
      last_updated   = NOW();
END;
$$;


-- ================================================================
-- END OF SCHEMA
-- 26 tables | 4 functions | 7 triggers | 1 view
-- ================================================================
