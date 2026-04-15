# Wallet Endpoint Fix - Critical Database Schema Update

## Status: SCHEMA FIXED, AWAITING DATABASE INITIALIZATION

### Problem
Driver wallet endpoint returning **500 Internal Server Error** because required database tables and columns don't exist.

### Root Cause
The wallet controller queries for columns that were missing from the database schema definition:
- `driver_wallets` table was missing critical columns
- `driver_stats` table was missing breakdown columns  
- `driver_transactions` table was missing wallet_id and balance_after columns
- `driver_profiles` table missing commission_rate column

### What Was Fixed
Updated `INIT_MISSING_TABLES.sql` with correct schema:

#### 1. driver_wallets table
**Added missing columns:**
```sql
outstanding_dues NUMERIC(15, 2) DEFAULT 0.00,
dues_limit NUMERIC(15, 2) DEFAULT 300.00,
today_earnings NUMERIC(15, 2) DEFAULT 0.00,
total_trips BIGINT DEFAULT 0,
total_commission_deducted NUMERIC(15, 2) DEFAULT 0.00,
last_updated TIMESTAMPTZ DEFAULT NOW(),
```

#### 2. driver_stats table  
**Added breakdown columns:**
```sql
total_gross_earnings NUMERIC(15, 2) DEFAULT 0.00,
total_commission_paid NUMERIC(15, 2) DEFAULT 0.00,
weekly_earnings NUMERIC(15, 2) DEFAULT 0.00,
weekly_gross_earnings NUMERIC(15, 2) DEFAULT 0.00,
weekly_commission_paid NUMERIC(15, 2) DEFAULT 0.00,
weekly_orders_completed BIGINT DEFAULT 0,
```

#### 3. driver_transactions table
**Added transaction tracking columns:**
```sql
wallet_id BIGINT REFERENCES driver_wallets(id) ON DELETE CASCADE,
type VARCHAR(50),
balance_after NUMERIC(15, 2),
```

#### 4. driver_profiles table
**Added via ALTER:**
```sql
ALTER TABLE driver_profiles
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 3) DEFAULT 0.10;
```

## How to Apply Fix

### Quick Option (Recommended): Single Script
```bash
cd DechtaService-main/backend
node run-init-tables.js
```

This will:
1. Connect to PostgreSQL
2. Execute the corrected INIT_MISSING_TABLES.sql
3. Create all 29 tables with correct schema
4. Add missing columns to existing tables

### Alternative Option 1: psql CLI
```bash
psql -h localhost -U postgres -d dechta -f INIT_MISSING_TABLES.sql
```

### Alternative Option 2: PostgreSQL GUI
1. Open pgAdmin or SQL client
2. Connect to `dechta` database
3. Copy contents of `INIT_MISSING_TABLES.sql`
4. Execute as SQL script

### Alternative Option 3: Validation + Init
```bash
cd DechtaService-main/backend
node validate-and-init-db.js
```

This checks schema first before initializing.

## After Running Initialization

### Step 1: Verify Tables Were Created
```bash
cd DechtaService-main/backend
node check-tables-status.js
```

Should show:
```
✅ All required tables exist!
```

### Step 2: Restart Backend
```bash
cd DechtaService-main/backend
npm start
```

The backend needs to restart to reload the schema cache.

### Step 3: Test Wallet Endpoint
```bash
# In your browser or with curl:
curl http://localhost:5000/api/wallet \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "balance": 0,
    "outstandingDues": 0,
    "duesLimit": 300,
    "todayEarnings": 0,
    "totalTrips": 0,
    "commission": {
      "ratePct": 10,
      "totalGross": 0,
      ...
    },
    "transactions": []
  }
}
```

## What Gets Fixed After Initialization
- ✅ `GET /api/wallet` → Returns driver wallet data
- ✅ `POST /api/wallet/withdraw` → Withdrawal requests work
- ✅ `POST /api/wallet/add-money` → Top-up functionality
- ✅ `POST /api/orders/accept` → Creates delivery_trips with otp_verified
- ✅ `POST /api/orders/trips/{tripId}/complete` → OTP verification works
- ✅ Driver earnings and stats tracking

## Files Modified
- **INIT_MISSING_TABLES.sql** — Updated with correct column definitions
- **run-init-tables.js** — Created helper to execute initialization
- **check-tables-status.js** — Created diagnostic tool
- **validate-and-init-db.js** — Created comprehensive validation script

## Troubleshooting

### "relation \"driver_wallets\" does not exist"
The SQL hasn't been executed yet. Run:
```bash
node run-init-tables.js
```

### "column \"outstanding_dues\" of relation \"driver_wallets\" does not exist"
You ran an old version of init SQL. Make sure to:
1. Pull the latest INIT_MISSING_TABLES.sql
2. Run it again to add the missing columns

### Connection error when running script
1. Verify PostgreSQL is running
2. Check .env file has correct DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
3. Test connection: `node test-connection.js`

### "permission denied for schema public"
Database user doesn't have privileges. Run as postgres:
```bash
psql -h localhost -U postgres -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO your_db_user;"
```

## Timeline
- Created on: 2026-04-14
- Status: Ready for execution
- Impact: Critical blocker for wallet and transaction features

## Testing Checklist
After initialization:
- [ ] Run `node check-tables-status.js` → All tables exist
- [ ] Restart backend
- [ ] Test: GET /api/wallet → 200 OK
- [ ] Test: POST /api/wallet/withdraw → Creates transaction
- [ ] Test: POST /api/orders/accept → Creates delivery_trip
- [ ] Test: Full order lifecycle → Complete order
- [ ] Check driver stats updated

---

**Note:** The schema is correct. You just need to execute the SQL against your database.
