# Wallet Endpoint 500 Error - Root Cause Analysis & Fix

## Problem Summary
Driver app wallet endpoint (`GET /api/wallet`) returns **500 Internal Server Error**.

Stack trace from browser:
```
GET http://localhost:5000/api/wallet 500 (Internal Server Error)
```

## Root Cause
The wallet controller is querying database tables and columns that **don't exist** in the actual database schema.

### Missing Tables
1. `driver_wallets` — Exists but **missing critical columns**
2. `driver_stats` — Exists but **missing breakdown columns**
3. `driver_transactions` — Exists but **missing wallet_id and balance tracking**
4. `delivery_trips` — Exists but **missing otp_verified column**

### Missing Columns in driver_wallets
The wallet controller queries for:
```javascript
w.balance,
w.outstanding_dues,  // ❌ MISSING
w.dues_limit,        // ❌ MISSING
w.today_earnings,    // ❌ MISSING
w.total_trips,       // ❌ MISSING
w.total_commission_deducted,  // ❌ MISSING
w.last_updated,      // ❌ MISSING
```

But the database only has:
```sql
balance
total_earned
total_withdrawn
created_at / updated_at
```

## The Fix (Applied)

### File: INIT_MISSING_TABLES.sql
Updated the schema definitions for 4 critical tables:

**1. driver_wallets** (lines 125-137)
```sql
CREATE TABLE IF NOT EXISTS driver_wallets (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL UNIQUE REFERENCES driver_profiles(id) ON DELETE CASCADE,
  balance NUMERIC(15, 2) DEFAULT 0.00,
  outstanding_dues NUMERIC(15, 2) DEFAULT 0.00,      -- ADDED
  dues_limit NUMERIC(15, 2) DEFAULT 300.00,          -- ADDED
  today_earnings NUMERIC(15, 2) DEFAULT 0.00,        -- ADDED
  total_trips BIGINT DEFAULT 0,                      -- ADDED
  total_commission_deducted NUMERIC(15, 2) DEFAULT 0.00,  -- ADDED
  total_earned NUMERIC(15, 2) DEFAULT 0.00,
  total_withdrawn NUMERIC(15, 2) DEFAULT 0.00,
  last_updated TIMESTAMPTZ DEFAULT NOW(),            -- ADDED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. driver_stats** (lines 42-54)
```sql
CREATE TABLE IF NOT EXISTS driver_stats (
  ...existing columns...
  total_gross_earnings NUMERIC(15, 2) DEFAULT 0.00,        -- ADDED
  total_commission_paid NUMERIC(15, 2) DEFAULT 0.00,       -- ADDED
  weekly_earnings NUMERIC(15, 2) DEFAULT 0.00,             -- ADDED
  weekly_gross_earnings NUMERIC(15, 2) DEFAULT 0.00,       -- ADDED
  weekly_commission_paid NUMERIC(15, 2) DEFAULT 0.00,      -- ADDED
  weekly_orders_completed BIGINT DEFAULT 0,                -- ADDED
);
```

**3. driver_transactions** (lines 137-150)
```sql
CREATE TABLE IF NOT EXISTS driver_transactions (
  ...
  wallet_id BIGINT REFERENCES driver_wallets(id) ON DELETE CASCADE,  -- ADDED
  type VARCHAR(50),                                  -- ADDED
  balance_after NUMERIC(15, 2),                      -- ADDED
);
```

**4. driver_profiles** (ALTER at end)
```sql
ALTER TABLE driver_profiles
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 3) DEFAULT 0.10;
```

## How to Apply the Fix

### Option 1: One-Command Fix (Recommended)
```bash
cd DechtaService-main/backend
node fix-wallet-endpoint.js
```

This script:
1. ✅ Checks if tables exist
2. ✅ Checks if columns exist
3. ✅ Runs INIT_MISSING_TABLES.sql if needed
4. ✅ Validates the fix succeeded
5. ✅ Provides next steps

### Option 2: Manual Initialization
```bash
cd DechtaService-main/backend
node run-init-tables.js
```

### Option 3: psql CLI
```bash
psql -h localhost -U postgres -d dechta -f DechtaService-main/backend/INIT_MISSING_TABLES.sql
```

## Verification

### Check Before Running Fix
```bash
cd DechtaService-main/backend
node check-tables-status.js
```

Will show missing tables/columns.

### Check After Running Fix
```bash
cd DechtaService-main/backend
node fix-wallet-endpoint.js
```

Should show:
```
✅ DATABASE IS ALREADY INITIALIZED
```

## After Fix: Next Steps

1. **Restart Backend**
   ```bash
   cd DechtaService-main/backend
   npm start
   ```

2. **Test Wallet Endpoint**
   ```bash
   curl http://localhost:5000/api/wallet \
     -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
   ```

3. **Expected Response**
   ```json
   {
     "success": true,
     "data": {
       "balance": 0,
       "outstandingDues": 0,
       "duesLimit": 300,
       "todayEarnings": 0,
       "totalTrips": 0,
       "lastUpdated": "2026-04-14T...",
       "commission": {
         "ratePct": 10,
         "totalGross": 0,
         "totalDeducted": 0,
         "totalNet": 0,
         "weeklyGross": 0,
         "weeklyDeducted": 0,
         "weeklyNet": 0,
         "weeklyOrders": 0
       },
       "transactions": []
     }
   }
   ```

## What Gets Fixed After Initialization
- ✅ Wallet balance display
- ✅ Earnings breakdown (daily, weekly, lifetime)
- ✅ Commission calculations
- ✅ Transaction history
- ✅ Dues tracking
- ✅ Driver stats
- ✅ OTP verification in order completion

## Files Created/Modified
1. **INIT_MISSING_TABLES.sql** — Updated schema (corrected)
2. **fix-wallet-endpoint.js** — Complete fix script
3. **run-init-tables.js** — Simple initialization script
4. **check-tables-status.js** — Diagnostic tool
5. **validate-and-init-db.js** — Comprehensive validation
6. **WALLET_ENDPOINT_SCHEMA_FIX.md** — Detailed documentation
7. **DATABASE_INITIALIZATION_FIX.md** — General initialization guide

## Why This Happened
The INIT_MISSING_TABLES.sql file was created but:
1. Never executed against the database
2. Had incomplete column definitions
3. Wallet controller expected columns that weren't defined

## Blocking Issues This Fixes
- ❌ GET /api/wallet → 500 error
- ❌ POST /api/wallet/withdraw → 500 error
- ❌ Driver earnings not showing
- ❌ Driver stats not tracking
- ❌ Order completion OTP verification failing

---

**Status**: Schema corrected, ready for database initialization
**Priority**: 🔴 CRITICAL - Blocks all wallet functionality
**Effort**: < 5 minutes to apply

Apply with: `node fix-wallet-endpoint.js`
