-- ================================================================
-- DECHTA SERVICE — WORKER APPLICATION SCHEMA
-- PostgreSQL 13+  |  11 Tables  |  3 Triggers  |  2 Functions
-- Production Ready - Safe to run on existing database
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- 1. WORKER_AUTH_USERS - Base worker authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_auth_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(100) UNIQUE,
  phone       VARCHAR(20)  NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_auth_email ON worker_auth_users(email);
CREATE INDEX IF NOT EXISTS idx_worker_auth_phone ON worker_auth_users(phone);


-- ================================================================
-- 2. WORKER_PROFILES - Worker detailed profile information
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_profiles (
  id                  UUID        PRIMARY KEY REFERENCES worker_auth_users(id) ON DELETE CASCADE,
  full_name           VARCHAR(100) NOT NULL,
  phone               VARCHAR(20),
  email               VARCHAR(100),
  password_hash       VARCHAR(255),
  state               VARCHAR(50),
  city                VARCHAR(50),
  area                VARCHAR(100),
  address             TEXT,
  role                VARCHAR(50)  DEFAULT 'worker'
                        CHECK (role IN ('worker','supervisor','lead','admin')),
  qualification       VARCHAR(100),
  photo_url           TEXT,
  aadhar_number       VARCHAR(12),
  pan_number          VARCHAR(10),
  skills              TEXT[],
  skill_category      VARCHAR(50),
  id_proof_type       VARCHAR(30),
  id_proof_url        JSONB,
  referral_code       VARCHAR(50)  UNIQUE,
  rating              NUMERIC(3,2) DEFAULT 0,
  total_jobs          NUMERIC      DEFAULT 0,
  wallet_balance      NUMERIC(12,2) DEFAULT 0,
  status              VARCHAR(20)  DEFAULT 'inactive'
                        CHECK (status IN ('active','inactive','suspended','banned')),
  is_approved         BOOLEAN      DEFAULT FALSE,
  is_profile_complete BOOLEAN      DEFAULT FALSE,
  is_active           BOOLEAN      DEFAULT FALSE,
  is_suspended        BOOLEAN      DEFAULT FALSE,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_profile_phone        ON worker_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_worker_profile_status       ON worker_profiles(status);
CREATE INDEX IF NOT EXISTS idx_worker_profile_is_approved  ON worker_profiles(is_approved);
CREATE INDEX IF NOT EXISTS idx_worker_profile_referral_code ON worker_profiles(referral_code);

DROP TRIGGER IF EXISTS trg_worker_profile_updated_at ON worker_profiles;
CREATE TRIGGER trg_worker_profile_updated_at BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 3. WORKER_SKILLS - Detailed skill inventory
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_skills (
  id          BIGSERIAL   PRIMARY KEY,
  worker_id   UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill_name  VARCHAR(100) NOT NULL,
  proficiency VARCHAR(20) DEFAULT 'intermediate'
                CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
  years_exp   INTEGER     DEFAULT 0,
  verified    BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_worker ON worker_skills(worker_id);
CREATE INDEX IF NOT EXISTS idx_skill_name   ON worker_skills(skill_name);


-- ================================================================
-- 4. WORKER_DOCUMENTS - KYC and identity documents
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_documents (
  id                    BIGSERIAL    PRIMARY KEY,
  worker_id             UUID         NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  aadhar_front_url      TEXT,
  aadhar_back_url       TEXT,
  aadhar_status         VARCHAR(20)  DEFAULT 'pending'
                          CHECK (aadhar_status IN ('pending','verified','rejected')),
  pan_front_url         TEXT,
  pan_back_url          TEXT,
  pan_status            VARCHAR(20)  DEFAULT 'pending'
                          CHECK (pan_status IN ('pending','verified','rejected')),
  id_proof_front_url    TEXT,
  id_proof_back_url     TEXT,
  id_proof_status       VARCHAR(20)  DEFAULT 'pending'
                          CHECK (id_proof_status IN ('pending','verified','rejected')),
  address_proof_url     TEXT,
  address_proof_status  VARCHAR(20)  DEFAULT 'pending'
                          CHECK (address_proof_status IN ('pending','verified','rejected')),
  police_verification   BOOLEAN      DEFAULT FALSE,
  bank_details_verified BOOLEAN      DEFAULT FALSE,
  kyc_complete          BOOLEAN      DEFAULT FALSE,
  created_at            TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_doc_worker ON worker_documents(worker_id);

DROP TRIGGER IF EXISTS trg_worker_doc_updated_at ON worker_documents;
CREATE TRIGGER trg_worker_doc_updated_at BEFORE UPDATE ON worker_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 5. WORKER_BANK_ACCOUNTS - Banking details for payment
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_bank_accounts (
  id                   BIGSERIAL    PRIMARY KEY,
  worker_id            UUID         NOT NULL UNIQUE REFERENCES worker_profiles(id) ON DELETE CASCADE,
  account_holder_name  VARCHAR(100) NOT NULL,
  account_number       VARCHAR(20)  NOT NULL,
  ifsc_code            VARCHAR(20)  NOT NULL,
  bank_name            VARCHAR(100),
  bank_branch          VARCHAR(100),
  upi_id               VARCHAR(100),
  is_verified          BOOLEAN      DEFAULT FALSE,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_account_worker ON worker_bank_accounts(worker_id);

DROP TRIGGER IF EXISTS trg_bank_account_updated_at ON worker_bank_accounts;
CREATE TRIGGER trg_bank_account_updated_at BEFORE UPDATE ON worker_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 6. WORKER_JOBS - Jobs assigned to workers
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_jobs (
  id              BIGSERIAL    PRIMARY KEY,
  worker_id       UUID         NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  job_title       VARCHAR(150) NOT NULL,
  description     TEXT,
  location        VARCHAR(200),
  latitude        NUMERIC(10,8),
  longitude       NUMERIC(11,8),
  job_type        VARCHAR(50)  DEFAULT 'temporary'
                    CHECK (job_type IN ('temporary','contract','permanent')),
  required_skills TEXT[],
  estimated_hours NUMERIC(8,2),
  pay_per_hour    NUMERIC(10,2),
  total_payment   NUMERIC(12,2),
  status          VARCHAR(30)  DEFAULT 'open'
                    CHECK (status IN ('open','assigned','in_progress','completed','cancelled','disputed')),
  start_date      DATE,
  end_date        DATE,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  rating          NUMERIC(3,2),
  feedback        TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_worker   ON worker_jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_job_status   ON worker_jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_type     ON worker_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_job_date     ON worker_jobs(start_date);

DROP TRIGGER IF EXISTS trg_job_updated_at ON worker_jobs;
CREATE TRIGGER trg_job_updated_at BEFORE UPDATE ON worker_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 7. WORKER_WALLET - Payment tracking and wallet
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_wallet (
  id                    BIGSERIAL    PRIMARY KEY,
  worker_id             UUID         NOT NULL UNIQUE REFERENCES worker_profiles(id) ON DELETE CASCADE,
  balance               NUMERIC(12,2) DEFAULT 0,
  total_earnings        NUMERIC(12,2) DEFAULT 0,
  total_withdrawals     NUMERIC(12,2) DEFAULT 0,
  pending_payments      NUMERIC(12,2) DEFAULT 0,
  last_payment_date     TIMESTAMPTZ,
  last_withdrawal_date  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_worker ON worker_wallet(worker_id);

DROP TRIGGER IF EXISTS trg_wallet_updated_at ON worker_wallet;
CREATE TRIGGER trg_wallet_updated_at BEFORE UPDATE ON worker_wallet
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 8. WORKER_TRANSACTIONS - Transaction history for auditing
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_transactions (
  id             BIGSERIAL     PRIMARY KEY,
  worker_id      UUID          NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  wallet_id      BIGINT        REFERENCES worker_wallet(id) ON DELETE SET NULL,
  job_id         BIGINT        REFERENCES worker_jobs(id) ON DELETE SET NULL,
  type           VARCHAR(30)   NOT NULL
                   CHECK (type IN ('credit','debit','payment','withdrawal','refund','bonus')),
  amount         NUMERIC(12,2) NOT NULL,
  description    TEXT,
  balance_after  NUMERIC(12,2),
  status         VARCHAR(30)   DEFAULT 'completed'
                   CHECK (status IN ('pending','completed','failed','cancelled')),
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_worker   ON worker_transactions(worker_id);
CREATE INDEX IF NOT EXISTS idx_transaction_type     ON worker_transactions(type);
CREATE INDEX IF NOT EXISTS idx_transaction_status   ON worker_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transaction_date     ON worker_transactions(created_at DESC);


-- ================================================================
-- 9. WORKER_OTP_VERIFICATION - OTP-based authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_otp_verification (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(20) NOT NULL,
  otp             VARCHAR(6)  NOT NULL,
  is_verified     BOOLEAN     DEFAULT FALSE,
  attempts        INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_otp_phone     ON worker_otp_verification(phone);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON worker_otp_verification(expires_at);


-- ================================================================
-- 10. WORKER_SUPPORT_TICKETS - Support system for workers
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_support_tickets (
  id              BIGSERIAL    PRIMARY KEY,
  worker_id       UUID         NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  ticket_number   VARCHAR(50)  NOT NULL UNIQUE,
  subject         VARCHAR(200) NOT NULL,
  category        VARCHAR(50)  NOT NULL
                    CHECK (category IN ('payment','job','account','documents','technical','other')),
  description     TEXT         NOT NULL,
  priority        VARCHAR(20)  DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  status          VARCHAR(30)  DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_worker    ON worker_support_tickets(worker_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status    ON worker_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_priority  ON worker_support_tickets(priority);

DROP TRIGGER IF EXISTS trg_ticket_updated_at ON worker_support_tickets;
CREATE TRIGGER trg_ticket_updated_at BEFORE UPDATE ON worker_support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- 11. WORKER_ADMIN_ACCOUNTS - Admin/dispatcher accounts
-- ================================================================
CREATE TABLE IF NOT EXISTS worker_admin_accounts (
  id              BIGSERIAL     PRIMARY KEY,
  admin_id        VARCHAR(50)   NOT NULL UNIQUE,
  full_name       VARCHAR(100)  NOT NULL,
  email           VARCHAR(100)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255)  NOT NULL,
  phone           VARCHAR(20)   UNIQUE,
  role            VARCHAR(30)   DEFAULT 'dispatcher'
                    CHECK (role IN ('admin','supervisor','dispatcher','support')),
  access_level    INTEGER       DEFAULT 1 CHECK (access_level BETWEEN 1 AND 5),
  permissions     JSONB,
  is_active       BOOLEAN       DEFAULT TRUE,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_email        ON worker_admin_accounts(email);
CREATE INDEX IF NOT EXISTS idx_admin_role         ON worker_admin_accounts(role);
CREATE INDEX IF NOT EXISTS idx_admin_is_active    ON worker_admin_accounts(is_active);

DROP TRIGGER IF EXISTS trg_admin_updated_at ON worker_admin_accounts;
CREATE TRIGGER trg_admin_updated_at BEFORE UPDATE ON worker_admin_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ================================================================
-- VIEW: worker_dashboard_stats - For admin dashboard analytics
-- ================================================================
CREATE OR REPLACE VIEW worker_dashboard_stats AS
SELECT
  wp.id AS worker_id,
  wp.full_name,
  wp.role,
  wp.status,
  wp.rating,
  COUNT(DISTINCT wj.id) AS total_jobs,
  COUNT(DISTINCT CASE WHEN wj.status = 'completed' THEN wj.id END) AS completed_jobs,
  COALESCE(SUM(CASE WHEN wj.status = 'completed' THEN wj.total_payment ELSE 0 END), 0) AS total_earnings,
  COALESCE(ww.balance, 0) AS wallet_balance,
  COALESCE(ww.pending_payments, 0) AS pending_payments,
  COUNT(DISTINCT CASE WHEN wst.status = 'open' THEN wst.id END) AS open_tickets
FROM worker_profiles wp
LEFT JOIN worker_jobs wj ON wj.worker_id = wp.id
LEFT JOIN worker_wallet ww ON ww.worker_id = wp.id
LEFT JOIN worker_support_tickets wst ON wst.worker_id = wp.id
GROUP BY wp.id, wp.full_name, wp.role, wp.status, wp.rating, ww.balance, ww.pending_payments;


-- ================================================================
-- FUNCTION: init_worker_records
-- Auto-creates wallet and documents when worker profile created
-- ================================================================
CREATE OR REPLACE FUNCTION init_worker_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO worker_wallet (worker_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO worker_documents (worker_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO worker_bank_accounts (worker_id, account_holder_name, account_number, ifsc_code)
    VALUES (NEW.id, NEW.full_name, '', '') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_worker ON worker_profiles;
CREATE TRIGGER trg_init_worker AFTER INSERT ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION init_worker_records();


-- ================================================================
-- FUNCTION: update_worker_earnings
-- Update wallet balance after job completion
-- ================================================================
CREATE OR REPLACE FUNCTION update_worker_earnings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE worker_wallet
    SET
      balance = balance + COALESCE(NEW.total_payment, 0),
      total_earnings = total_earnings + COALESCE(NEW.total_payment, 0),
      last_payment_date = NOW()
    WHERE worker_id = NEW.worker_id;

    INSERT INTO worker_transactions
      (worker_id, job_id, type, amount, description, status)
    VALUES (
      NEW.worker_id,
      NEW.id,
      'credit',
      COALESCE(NEW.total_payment, 0),
      'Payment for job: ' || NEW.job_title,
      'completed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_earnings ON worker_jobs;
CREATE TRIGGER trg_update_earnings AFTER UPDATE ON worker_jobs
  FOR EACH ROW EXECUTE FUNCTION update_worker_earnings();


-- ================================================================
-- END OF WORKER SCHEMA
-- 11 tables | 2 functions | 3 triggers | 1 view
-- ================================================================
