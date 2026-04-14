# End-to-End Integration Test

## Prerequisites
- PostgreSQL running (default: localhost:5432)
- Node.js 18+
- Database user and name created

## Step 1: Create `.env` file

Create `dechta-client/backend/.env`:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/dechta
JWT_SECRET=test_secret_key_min_32_chars_long_for_jwt_signing_here
JWT_EXPIRES_IN=30d
NODE_ENV=development
PORT=5001
CLIENT_URL=http://localhost:5173
```

## Step 2: Initialize Database with UNIFIED_SCHEMA.sql

```bash
cd "C:\Users\LOKI\OneDrive\Desktop\D\Dechta"
psql -U postgres -d dechta -f UNIFIED_SCHEMA.sql
```

If database doesn't exist:
```bash
createdb -U postgres dechta
psql -U postgres -d dechta -f UNIFIED_SCHEMA.sql
```

## Step 3: Insert Test Data

Run this SQL to populate test data aligned with UNIFIED_SCHEMA.sql:

```sql
-- Users
INSERT INTO users (phone_number, email, user_type, status, is_verified, is_approved, profile_complete)
VALUES 
  ('9876543210', 'client@example.com', 'client', 'active', true, true, true),
  ('9876543211', 'vendor@example.com', 'vendor', 'active', true, true, true)
ON CONFLICT DO NOTHING;

-- Client Profiles
INSERT INTO client_profiles (user_id, full_name, avatar_url)
SELECT id, 'Test Client', 'https://api.example.com/avatar.jpg'
FROM users WHERE phone_number = '9876543210'
ON CONFLICT DO NOTHING;

-- Vendor Profiles  
INSERT INTO vendor_profiles (user_id, business_name, owner_name, business_address, category)
SELECT id, 'Test Hardware Store', 'Vendor Owner', '123 Market St', 'hardware'
FROM users WHERE phone_number = '9876543211'
ON CONFLICT DO NOTHING;

-- Products (with unified schema columns)
INSERT INTO products (vendor_id, product_name, category, mrp, selling_price, stock, unit, brand, description, image_url, approval_status, is_active, gst_percent)
SELECT vp.id, 'Test Hammer', 'hardware', 500, 399, 50, 'pcs', 'XYZ Brand', 'Durable hammer for construction', 'https://api.example.com/hammer.jpg', 'approved', true, 18
FROM vendor_profiles vp
WHERE vp.business_name = 'Test Hardware Store'
ON CONFLICT DO NOTHING;

-- Addresses
INSERT INTO addresses (user_id, tag, address_text, is_default)
SELECT id, 'home', '456 Main Street, City', true
FROM users WHERE phone_number = '9876543210'
ON CONFLICT DO NOTHING;

-- OTP Verifications  
INSERT INTO otp_verifications (phone_number, otp, is_verified, created_at, expires_at)
VALUES ('9876543212', '1234', true, NOW(), NOW() + interval '5 minutes')
ON CONFLICT DO NOTHING;

-- Vehicle Pricing
INSERT INTO vehicle_pricing (vehicle_type, display_name, base_fare, rate_per_km, min_km, is_active)
VALUES 
  ('2w', '2-Wheeler', 50, 10, 0, true),
  ('3w', '3-Wheeler', 100, 15, 0, true),
  ('4w', '4-Wheeler', 150, 20, 0, true)
ON CONFLICT DO NOTHING;
```

## Step 4: Start Backend Server

```bash
cd "C:\Users\LOKI\OneDrive\Desktop\D\Dechta\dechta-client\backend"
npm install
npm run dev
```

Expected output:
```
✅ PostgreSQL connection verified
✅ Unified schema mode enabled
🚀 Dechta CLIENT backend running on port 5001 [development]
📡 Health: http://localhost:5001/api/health
📦 Products: http://localhost:5001/api/products
```

## Step 5: Test API Endpoints (Real Data)

### 5.1 Get Products (Real Data from `products` table)
```bash
curl -X GET http://localhost:5001/api/products
```

Expected: Returns test hammer product with `product_name`, `selling_price`, `stock` from UNIFIED_SCHEMA

### 5.2 Send OTP
```bash
curl -X POST http://localhost:5001/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

Expected: `{ "success": true, "data": {"phone": "9876543210"}, "message": "OTP sent..." }`

### 5.3 Verify OTP & Login (Real user from `users` table)
```bash
curl -X POST http://localhost:5001/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "otp": "1234", "name": "Test Client"}'
```

Expected: Returns JWT token + user data from `users` + `client_profiles` joined

### 5.4 Get User Profile (With Token)
```bash
curl -X GET http://localhost:5001/api/auth/profile \
  -H "Authorization: Bearer <JWT_TOKEN_FROM_5.3>"
```

Expected: Real user data from unified schema (`users` + `client_profiles`)

### 5.5 Get Vehicle Pricing (Real Data from `vehicle_pricing` table)
```bash
curl -X GET http://localhost:5001/api/pricing/vehicles
```

Expected: Returns `[ {vehicle_type, display_name, base_fare, rate_per_km}, ... ]`

### 5.6 Place Order (Real Data Save to `orders` table)
```bash
curl -X POST http://localhost:5001/api/orders \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"id": 1, "name": "Hammer", "qty": 2, "price": 399, "vendor_id": 1}],
    "total_amount": 798,
    "delivery_address": "789 Delivery St"
  }'
```

Expected: Order saved to `orders` table, returns `bookingId` (real order ID from DB)

### 5.7 Get My Orders (Real Data from `orders` table)
```bash
curl -X GET http://localhost:5001/api/orders/my \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Expected: Returns orders from `orders` table joined with `products`

## Step 6: Verify Frontend Fetches Real Data

1. **Start Frontend**:
   ```bash
   cd "C:\Users\LOKI\OneDrive\Desktop\D\Dechta\dechta-client\frontend"
   npm install
   npm run dev
   ```

2. **Open Frontend** at `http://localhost:5173`

3. **Verify Real Data Flows**:
   - **Products Page**: Should show test hammer (from `products` table)
   - **Login**: Use phone `9876543210`, OTP `1234` → logs in with real user data
   - **My Orders**: Shows test orders (from `orders` table after placing one)
   - **Addresses**: Shows saved addresses (from `addresses` table)

## Success Criteria

✅ **Backend**:
- Database connects with UNIFIED_SCHEMA tables
- All endpoints return real data from correct tables/columns
- OTP uses `otp_verifications.otp` (not `otp_code`)
- Products use `products.product_name`, `approval_status`, `vendor_profiles`
- Orders save to unified `orders` table (not legacy `bookings`)

✅ **Frontend**:
- Fetches and displays real product data
- User login creates records in `users` + `client_profiles`
- Orders shown from real `orders` table
- All form submissions persist to unified schema

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `DATABASE_URL is not set` | Create `.env` file in `backend/` directory |
| `relation "products" does not exist` | Run `UNIFIED_SCHEMA.sql` first |
| `relation "cprofiles" does not exist` | Schema migration complete—cprofiles no longer used |
| `otp_code` column not found | Fixed in `otp.service.js`—uses `otp` column now |
| No products showing | Insert test data via SQL script in Step 3 |
| CORS errors | Ensure `CLIENT_URL` in `.env` matches frontend URL |

## Next Steps

Once all tests pass:
1. ✅ Backend fetches real data from unified schema
2. ✅ Frontend displays that real data
3. ✅ Schema fully aligned (no legacy tables)
4. 🚀 Project ready for production deployment
