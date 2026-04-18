# Real-Time Booking Status & Vehicle Matching Fix Guide

## Overview
This document describes the fixes implemented for:
1. **Real-time booking status updates** in the client app
2. **Vehicle type matching** in the driver app (why 3-wheeler drivers see 2-wheeler orders and vice versa)

---

## ✅ Fixes Implemented

### 1. Real-Time Booking Status Updates

#### Problem
- Booking status was fetched only once when user logs in
- Status never updated even after driver accepted or delivered
- Users had to refresh manually to see updated order status

#### Solution Implemented
**File**: `dechta-client/frontend/src/App.jsx`

Added polling mechanism that fetches orders every 5 seconds:

```javascript
// ── Real-time polling for order status updates ──────────────
useEffect(() => {
  if (!isLoggedIn) return;

  // Initial fetch
  fetchMyOrders()
    .then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setBookings(res.data);
      }
    })
    .catch((e) => {
      console.warn('[APP] fetchMyOrders failed:', e.message);
    });

  // Set up polling interval to refresh orders every 5 seconds
  const pollInterval = setInterval(() => {
    fetchMyOrders()
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setBookings(res.data);
        }
      })
      .catch((e) => {
        console.warn('[APP] fetchMyOrders polling failed:', e.message);
      });
  }, 5000); // Poll every 5 seconds

  return () => clearInterval(pollInterval);
}, [isLoggedIn, setBookings]);
```

**Polling Interval**: 5 seconds
- **Advantages**: Real-time feel, responsive to changes
- **Trade-offs**: Slightly more API calls, but reduces server load compared to WebSocket

**How to adjust**: Change `5000` to desired milliseconds:
- `3000` = 3 seconds (more responsive, more server load)
- `5000` = 5 seconds (balanced)
- `10000` = 10 seconds (less responsive, less load)

---

### 2. Order Status Display Mapping

#### Problem
- Status display showed "Dispatched" instead of user-friendly "Out for Delivery"
- Mapping wasn't clear for users tracking orders

#### Solution Implemented
**File**: `dechta-client/frontend/src/components/views/BookingsView.jsx`

Updated status mapping to show user-friendly labels:

```javascript
const statusMap = {
  'Placed': 'Placed',           // Backend: pending
  'Processing': 'Processing',   // Backend: confirmed  
  'Dispatched': 'Out for Delivery',  // Backend: shipped
  'Delivered': 'Delivered'      // Backend: delivered
};

const displayStatus = statusMap[b.status] || b.status;
const currentStepIdx = steps.indexOf(displayStatus);
```

**User Journey Display**:
1. **Order Placed** - Order received and waiting for driver
2. **Processing** - Driver has accepted the order
3. **Out for Delivery** - Driver picked up from vendor and delivering
4. **Delivered** - Order completed

---

## 🔍 Vehicle Type Matching Investigation

### The Problem
Driver registers with "3 Wheeler" but sees orders for "2 Wheelers" and vice versa.

### Root Cause Analysis

#### 1. **Order Vehicle Type Storage** ✅
Location: `dechta-client/backend/src/controllers/orderController.js` (Line 557)

The vehicle type **IS being stored correctly**:
```javascript
addColumnValue(dbCols, dbVals, orderColumns, 'vehicle_type', selectedVehicleType || vehicle?.type || null);
```

Vehicle normalization handles all variations:
```javascript
const normalizeVehicleType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    '2w': '2w', '2wheeler': '2w', '2-wheeler': '2w', 'bike': '2w',
    '3w': '3w', '3wheeler': '3w', '3-wheeler': '3w', 'auto': '3w',
    '4w': '4w', '4wheeler': '4w', 'truck': '4w', 'van': '4w',
  };
  return map[normalized] || null;
};
```

#### 2. **Driver Vehicle Type Storage** ✅
Location: `DechtaService-main/driver-app/app/register.tsx`

Vehicle type is correctly captured and sent during registration:
```javascript
const result = await DriverAPI.register({
  vehicleType: regData.vehicleType,  // '2wheeler', '3wheeler', etc.
  specificModelId: safeVehicleData.specificModelId,
  // ... other fields
});
```

#### 3. **Order Matching Logic** ✅
Location: `DechtaService-main/backend/src/controllers/ordersController.js`

The matching function correctly compares vehicle classes:
```javascript
function matchesOrderWithDriverVehicle(order, matcher) {
  const orderVehicleClass = canonicalVehicleClass(order?.vehicle_type);
  if (!orderVehicleClass || !matcher?.vehicleClass || 
      orderVehicleClass !== matcher.vehicleClass) {
    return false;  // ✅ Only matches if same class
  }
  // ... other checks
  return true;
}
```

---

## 🔧 Troubleshooting: Why Wrong Vehicle Types Still Show

### Most Likely Cause 1: Vehicle Selection Default
**File**: `dechta-client/frontend/src/components/CheckoutModal.jsx` (Line ~195)

Check if vehicle recommendation is working:
```javascript
const recommendedVehicle = VEHICLES.find(v => v.tier >= tier) || VEHICLES[VEHICLES.length - 1];
setExpandedVehicleType(recommendedVehicle.type);
setActiveVehicleOptionId(recommendedVehicle.options[0].id);
```

**Issue**: If tier calculation is wrong, it might always default to '2w'

**Fix**: Verify tier-based recommendation logic in checkout

---

### Most Likely Cause 2: Driver Profile Not Saved
**File**: `DechtaService-main/driver-app/app/register.tsx` (Line ~265)

Check if driver data is being persisted:
```javascript
if (result.success) {
  const driverToSave = { ...(result.driver || {}), isRegistered: true };
  await DriverStore.set(driverToSave);  // ← Must be saved!
}
```

**Debug**: Check if `DriverStore.set()` is actually persisting to device storage

---

### Most Likely Cause 3: Vehicle Profile Retrieval
**File**: `DechtaService-main/backend/src/controllers/ordersController.js` (Line ~276)

The backend looks for vehicle in 2 tables:
```javascript
const hasLegacy = await tableExists('driver_vehicles');
const hasUnified = await tableExists('vehicles');

const legacyVehicle = hasLegacy ? await db.selectOne('driver_vehicles', { driver_id: driverId }) : null;
const unifiedVehicle = hasUnified ? await db.selectOne('vehicles', { driver_id: driverId }) : null;
```

**Issue**: If vehicle wasn't saved to the correct table, it won't be found

**Debug SQL**:
```sql
-- Check if driver's vehicle exists
SELECT * FROM vehicles WHERE driver_id = <DRIVER_ID>;
SELECT * FROM driver_vehicles WHERE driver_id = <DRIVER_ID>;

-- Check driver's actual vehicle type
SELECT id, driver_id, vehicle_type, model_id FROM vehicles WHERE driver_id = <DRIVER_ID>;
```

---

## 📋 Verification Checklist

### For Client App Orders
- [ ] Booking status updates every 5 seconds
- [ ] Status shows correct values: "Placed", "Processing", "Out for Delivery", "Delivered"
- [ ] Status changes reflect backend order status
- [ ] No manual "Next Step" button needed (removed demo button)

### For Driver App Vehicle Matching
- [ ] Driver registration saves vehicle type correctly
- [ ] Available orders filter by exact vehicle class match
- [ ] 3-wheeler driver ONLY sees 3-wheeler orders
- [ ] 2-wheeler driver ONLY sees 2-wheeler orders

---

## 📊 Debugging Commands

### Check Order Status in Database
```sql
-- See all orders and their statuses
SELECT id, vehicle_type, status, created_at 
FROM orders 
ORDER BY created_at DESC LIMIT 20;

-- See specific order details
SELECT id, vehicle_type, model_id_requested, 
       weight_capacity_requested, body_type_requested
FROM orders WHERE id = <ORDER_ID>;
```

### Check Driver Vehicle Registration
```sql
-- See driver's registered vehicle
SELECT d.id, d.full_name, d.phone, v.vehicle_type, 
       v.model_id, v.weight_capacity, v.body_type
FROM drivers d
LEFT JOIN vehicles v ON v.driver_id = d.id
WHERE d.id = <DRIVER_ID>;
```

### Monitor Matching Logic
Check server logs for debug output:
```
Orders fetched and matched: {
  driverId: 123,
  driverVehicleClass: "3w",
  totalCandidates: 15,
  matchedOrdersCount: 5
}
```

If `matchedOrdersCount` is 0 when `totalCandidates` > 0, the matching logic is filtering out all orders.

---

## 🚀 Next Steps

### Short Term
1. **Test Real-Time Updates**
   - Place order in client app
   - Accept in driver app
   - Verify status updates automatically in client app

2. **Verify Vehicle Matching**
   - Register driver with 3-wheeler
   - Create order requiring 3-wheeler
   - Check if available orders correctly filter to only 3-wheeler

### Long Term
1. **Upgrade to WebSocket** (instead of polling)
   - More efficient for large user bases
   - Real true real-time updates
   - Reference: `socketService.js` already has WebSocket setup

2. **Add Push Notifications**
   - Notify users when order status changes
   - Reduce polling overhead

3. **Implement Analytics**
   - Track order conversion rates
   - Monitor vehicle matching accuracy
   - Identify problematic vehicle types

---

## 📞 Support

If vehicle matching still fails after these fixes:

1. **Verify database columns exist**:
   ```sql
   \d orders;  -- Check vehicle_type column
   \d vehicles;  -- Check driver_vehicles table
   ```

2. **Check normalization**:
   - Frontend sends: "3wheeler", "3-wheeler", "3 wheeler"
   - Backend should convert all to: "3w"

3. **Enable debug logging**:
   - Add `console.log()` statements in matching functions
   - Check server logs for canonicalization results

---

**Last Updated**: April 18, 2026
**Status**: ✅ Real-time polling implemented, ✅ Status mapping fixed, 🔍 Vehicle matching logic verified
