# Database Initialization Status & Fix Guide

## Current Problem
The wallet endpoint (`GET /api/wallet`) is returning **500 Internal Server Error** because the required database tables don't exist yet.

## Root Cause
The `INIT_MISSING_TABLES.sql` file was created but **not executed** against the PostgreSQL database. The backend code references these tables, but they don't exist in the database.

## Required Tables (29 total)
The INIT_MISSING_TABLES.sql file defines:
- ✓ delivery_trips
- ✓ driver_stats  
- ✓ driver_vehicles
- ✓ driver_bank_accounts
- ✓ driver_documentss
- ✓ driver_wallets (CRITICAL for wallet endpoint)
- ✓ driver_transactions
- ✓ driver_notifications
- ✓ driver_notification_prefs
- ✓ driver_gps_locations
- ... and ~19 more tables for orders, payments, promo codes, achievements, etc.

## Solution: Execute Database Initialization

### Step 1: Check Current Status
Run this command to see which tables are missing:
```bash
cd DechtaService-main/backend
node check-tables-status.js
```

This will show:
- ✅ Tables that exist
- ❌ Tables that are missing

### Step 2: Execute Initialization
Choose **ONE** of these methods:

#### Option A: Using Node.js Script (Recommended)
```bash
cd DechtaService-main/backend
node run-init-tables.js
```

This script will:
1. Connect to PostgreSQL
2. Execute all SQL statements in INIT_MISSING_TABLES.sql
3. Create all 29 missing tables with proper relationships and indexes

#### Option B: Using psql CLI
```bash
psql -h localhost -U postgres -d dechta -f INIT_MISSING_TABLES.sql
```

#### Option C: Manual in PostgreSQL GUI
1. Open pgAdmin or any SQL client
2. Connect to the `dechta` database
3. Copy & paste contents of `INIT_MISSING_TABLES.sql`
4. Execute

### Step 3: Verify Installation
```bash
cd DechtaService-main/backend
node check-tables-status.js
```

Should show:
```
✅ All required tables exist!
```

### Step 4: Restart Backend
After tables are created, restart the backend service to reload database schema cache:
```bash
# Kill any existing backend processes
# Then restart:
cd DechtaService-main/backend
npm start
```

## What Gets Fixed
After running initialization:
- ✅ `GET /api/wallet` → Returns driver wallet info (balance, earnings, transactions)
- ✅ `GET /api/orders/available` → Vehicle matching works correctly
- ✅ `POST /api/orders/accept` → Creates delivery_trips record
- ✅ `POST /api/orders/trips/{tripId}/complete` → Verifies otp_verified column exists
- ✅ Driver stats, profiles, and transaction tracking

## Files Involved
- **INIT_MISSING_TABLES.sql** — The initialization script (do NOT edit unless you know SQL)
- **run-init-tables.js** — Helper script to execute the SQL
- **check-tables-status.js** — Diagnostic script to verify tables exist

## Troubleshooting

### Error: "Connection refused"
Database is not running. Start PostgreSQL:
```bash
# On Windows (if using pgAdmin):
# Start PostgreSQL service in Services app
# Or start it via pgAdmin 4

# On Linux/Mac:
brew services start postgresql
# or
sudo systemctl start postgresql
```

### Error: "permission denied"
Make sure the database user has permissions:
```bash
psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE dechta TO postgres;"
```

### Error: "table already exists"
This is safe to ignore. The SQL uses `CREATE TABLE IF NOT EXISTS` so re-running is idempotent.

### Tables still missing after running script
1. Check the error messages in the output
2. Verify database connection with: `node test-connection.js`
3. Try running again with more detailed output: `node run-init-tables.js 2>&1 | tee init.log`

## Next Steps (After Initialization)
1. ✅ Test wallet endpoint: `curl http://localhost:5000/api/wallet`
2. ✅ Full order lifecycle: accept → pickup → dropoff → complete
3. ✅ Check driver stats are recorded
4. ✅ Verify transactions table populates

---

**CRITICAL:** The wallet endpoint cannot work until these tables are created. This is the blocking issue preventing drivers from accessing their wallet information.
