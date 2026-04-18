# Driver Order Filtering - Quick Reference Guide

## 🎯 Quick Answer: How Orders Get to Drivers

```
1. Driver goes ONLINE
   ↓
2. Orders Screen fetches available orders
   ↓
3. Backend filters ALL pending orders through matching logic
   ↓
4. Vehicle type NORMALIZED to canonical form ("3w", "2w", "4w")
   ↓
5. Order matches driver's vehicle class?
   ├─ YES → Further check weight, model, dimensions, body type
   ├─ ALL MATCH → Order appears to driver
   └─ NO → Order hidden
```

---

## 📍 Key File Locations

```
FRONTEND:
├─ driver-app/app/(tabs)/orders.tsx        ← Order list display
├─ driver-app/app/(tabs)/index.tsx         ← Load vehicle type
├─ driver-app/app/register.tsx             ← Select vehicle type
└─ driver-app/services/api.js              ← API calls

BACKEND:
├─ backend/src/controllers/ordersController.js  ← Matching logic
└─ backend/INIT_MISSING_TABLES.sql              ← DB schema

DATABASE:
├─ vehicles table                          ← Driver vehicle info
└─ orders table                            ← Order details
```

---

## 🔍 Vehicle Type Matching Examples

### Input Variations → Canonical Form

```
"3 Wheeler"        → "3w"
"3-wheeler"        → "3w"
"3wheeler"         → "3w"
"3w"               → "3w"
"Auto Rickshaw"    → "3w"
"auto"             → "3w"

"2 Wheeler"        → "2w"
"Bike"             → "2w"
"Motorcycle"       → "2w"

"4 Wheeler"        → "4w"
"Truck"            → "4w"
"Van"              → "4w"
```

---

## ✅ Matching Checklist

```
Order WILL appear to driver if:
  ✅ Driver is ONLINE
  ✅ Order status = "pending"
  ✅ Order not assigned (driver_id IS NULL)
  ✅ Vendor accepted order (v_status = "accepted")
  ✅ Vehicle class matches (after normalization)
  ✅ Weight capacity sufficient (if order requests)
  ✅ Model ID matches (if order specifies)
  ✅ Dimensions match (if order specifies)
  ✅ Body type matches (if order specifies)
```

---

## 🚀 Backend Filtering Flow

```
getAvailableOrders(driverId):
  1. Check: driver.is_online?
  2. Fetch: driver vehicle profile
  3. Build: vehicleMatcher from profile
  4. Query: SELECT all pending orders (100 limit)
  5. Filter: matchesOrderWithDriverVehicle(order, matcher) for each
  6. Return: Top 20 matched orders
```

---

## 💾 Database Tables

### vehicles (or driver_vehicles)
```sql
vehicle_type      VARCHAR(50)    -- "3wheeler", "4wheeler", etc
model_id          VARCHAR(100)   -- "3w_500kg", "4w_1200kg", etc
weight_capacity   INTEGER        -- 500, 1200, 1700, 2500, etc
body_type         VARCHAR(50)    -- "Open" or "Closed"
dimensions        VARCHAR(100)   -- "5.5 ft", "7 ft", etc
```

### orders
```sql
vehicle_type                 VARCHAR(50)    -- "3w", "3wheeler", etc
model_id_requested          VARCHAR(100)   -- specific model needed
weight_capacity_requested   INTEGER        -- cargo weight
dimensions_requested        VARCHAR(100)   -- cargo dimensions
body_type_requested         VARCHAR(50)    -- "Open" or "Closed"
```

---

## 🔧 Matching Functions (Backend)

### 1. canonicalVehicleClass(value)
**Input:** Any vehicle type string
**Output:** "2w", "3w", or "4w" (canonical form)
**Usage:** Normalizes all vehicle type variations

### 2. buildDriverVehicleMatcher(vehicle)
**Input:** Driver vehicle profile
**Output:** Matcher object with:
- vehicleClass
- weightCapacity
- modelCandidates (Set)
- bodyType
- dimensions
**Usage:** Extracts matching criteria from driver profile

### 3. matchesOrderWithDriverVehicle(order, matcher)
**Input:** Order record + matcher object
**Output:** true/false
**Logic:**
1. Check vehicle class (mandatory)
2. Check weight capacity (if order requests)
3. Check model ID (if order specifies)
4. Check dimensions (if order specifies)
5. Check body type (if order specifies)

### 4. normalizeToken(value)
**Input:** Any string
**Output:** Lowercase, no spaces/special chars
**Usage:** Standardizes text for comparison

---

## 📱 Frontend API Call

```javascript
// File: driver-app/services/api.js
OrdersAPI.getAvailable()  // GET /api/orders/available

// Returns: { success, data: [...orders], isOnline: boolean }
```

```tsx
// File: driver-app/app/(tabs)/orders.tsx
const result = await OrdersAPI.getAvailable();
const normalized = result.data.map(o => ({
  id: o.id,
  vehicle_type: o.vehicle_type || 'Unknown',
  payout: o.delivery_fee,
  distance: o.distance_text,
  // ...
}));
setAvailableOrders(normalized);
```

---

## 🐛 Debugging Commands

### Check Driver Vehicle
```sql
SELECT id, vehicle_type, model_id, weight_capacity 
FROM vehicles WHERE driver_id = 1;
```

### Check Pending Orders
```sql
SELECT id, vehicle_type, model_id_requested, weight_capacity_requested, status, v_status
FROM orders 
WHERE status = 'pending' AND driver_id IS NULL AND v_status = 'accepted'
ORDER BY created_at DESC LIMIT 20;
```

### Check Logs
Look for:
```
driverId: 1
driverVehicleClass: "3w"
matchedOrdersCount: X
```

If matchedOrdersCount is 0 but orders exist → vehicle type mismatch

---

## 🎓 Real Example

```
DRIVER:
- vehicle_type: "3wheeler"
- model_id: "3w_500kg"
- weight_capacity: 500
- is_online: true

ORDER:
- vehicle_type: "3w"          ← Different format!
- weight_capacity_requested: 0
- status: "pending"
- v_status: "accepted"
- driver_id: NULL

RESULT: ✅ VISIBLE
Reason: Both normalize to "3w" after canonicalization
```

---

## 🔗 Code References

| What | File | Lines |
|------|------|-------|
| Main API endpoint | ordersController.js | 334-404 |
| Matching logic | ordersController.js | 243-267 |
| Vehicle matcher builder | ordersController.js | 193-228 |
| Canonicalization | ordersController.js | 69-77 |
| Get driver vehicle | ordersController.js | 274-319 |
| Order fetch component | orders.tsx | 245-270 |
| Driver profile loading | index.tsx | 270-290 |
| Vehicle registration | register.tsx | 152-160 |
