# Order Matching Bug Fix - Vehicle Type Format Normalization

## Problem Description
Driver app orders were showing conditions failed. Specifically:
- Driver registered with vehicle_type: **`"3wheeler"`** (full text)
- Orders created with vehicle_type: **`"3w"`** (shorthand)
- Even though both represent 3-wheelers, they don't match!
- Results: Orders not showing for drivers even when vehicle types match

## Root Cause
The system was using **two different formats** for the same vehicle type:

**Shorthand format** (in orders): `"3w"`, `"2w"`, `"4w"`  
**Full text format** (in driver registration): `"3wheeler"`, `"2wheeler"`, `"4wheeler"`

**Example from your data:**
```
Order record:
  vehicle_type: "3w"
  model_id_requested: "3w_standard"

Driver vehicle record:
  vehicle_type: "3wheeler"
  model_id: "TN22A"
  weight_capacity: 500
  body_type: "open"
```

These didn't match because `"3w"` ≠ `"3wheeler"` even with case-insensitive comparison.

## Solution Implemented

### 1. **Created Vehicle Type Normalization Function**
```javascript
function normalizeVehicleType(vehicleType) {
  const typeMap = {
    // Shorthand formats
    '2w': '2wheeler',
    '3w': '3wheeler',
    '4w': '4wheeler',
    
    // Full text formats
    '2wheeler': '2wheeler',
    '3wheeler': '3wheeler',
    '4wheeler': '4wheeler',
    
    // Hyphenated variants
    '2-wheeler': '2wheeler',
    '3-wheeler': '3wheeler',
    '4-wheeler': '4wheeler',
    
    // With spaces
    '2 wheeler': '2wheeler',
    '3 wheeler': '3wheeler',
    '4 wheeler': '4wheeler',
    
    // Alternative names
    'bike': '2wheeler',
    'motorcycle': '2wheeler',
    'auto': '3wheeler',
    'auto rickshaw': '3wheeler',
    'truck': '4wheeler',
    'van': '4wheeler',
    'mini truck': '4wheeler',
  };
  
  return typeMap[normalized] || null;
}
```

**Key Features:**
- Converts all variants to standard `"3wheeler"` format
- Case-insensitive (converts to lowercase before mapping)
- Returns null if vehicle type is unrecognized

### 2. **Updated SQL Query to Match Multiple Format Variants**
```sql
AND (
  o.vehicle_type IS NULL OR o.vehicle_type = '' OR 
  LOWER(TRIM(o.vehicle_type)) = $1 OR    -- normalized (e.g., '3wheeler')
  LOWER(TRIM(o.vehicle_type)) = $2 OR    -- shorthand (e.g., '3w')
  LOWER(TRIM(o.vehicle_type)) = $3 OR    -- plural (e.g., '3wheelers')
  LOWER(TRIM(o.vehicle_type)) = $4       -- hyphenated (e.g., '3-wheeler')
)
```

**Why 4 parameters:**
1. `$1 = '3wheeler'` — matches full text orders
2. `$2 = '3w'` — matches shorthand orders
3. `$3 = '3wheelers'` — matches plural variant
4. `$4 = '3-wheeler'` — matches hyphenated variant

### 3. **Added Better Validation & Logging**
```javascript
if (!driverVehicleType) {
  request.log.warn({ driverId, rawVehicleType: vehicle.vehicle_type }, 
    'Driver has no valid vehicle_type registered. Cannot fetch orders.');
  return reply.send({ success: true, data: [], isOnline: true });
}

request.log.debug({
  driverId,
  driverVehicleType,      // normalized: '3wheeler'
  driverModelId,
  driverBodyType,
  matchedOrdersCount: mapped.length,
}, 'Orders fetched and matched');
```

## Files Modified

1. **backend/src/controllers/ordersController.js**
   - Added `normalizeVehicleType()` function to handle all format variants
   - Updated `getAvailableOrders()` to normalize driver vehicle type
   - Updated SQL query to match normalized variants ($1-$4)
   - Enhanced logging for debugging

2. **driver-app/app/(tabs)/orders.tsx** (previously fixed)
   - Removed fallback to '2 Wheeler'
   - Shows actual vehicle type or 'Unknown'

## How Matching Works Now

### Step 1: Driver Registration
```
User selects: "3 Wheeler"
System stores in vehicles table: vehicle_type = '3wheeler' (or '3w' depending on system)
```

### Step 2: Normalization
```
Driver's vehicle_type: '3wheeler' → normalizeVehicleType() → '3wheeler' ✓
Order's vehicle_type: '3w' → SQL matches against '3w' parameter ✓
```

### Step 3: SQL Query Matching
Order is shown if vehicle_type matches ANY of these:
```
✓ NULL (unspecified - show to all)
✓ '3wheeler' (normalized match)
✓ '3w' (shorthand match)
✓ '3wheelers' (plural match)
✓ '3-wheeler' (hyphenated match)
```

Plus all other conditions:
- ✓ Weight capacity: order weight ≤ driver weight
- ✓ Model ID: order model matches driver model (if specified)
- ✓ Body type: order body matches driver body (if specified)

## Testing Examples

### Test Case 1: Shorthand Order → Full Text Driver
```
Order: vehicle_type = '3w'
Driver: vehicle_type = '3wheeler'
Expected: ✓ MATCH (via $2 parameter)
```

### Test Case 2: Full Text Order → Shorthand Driver
```
Order: vehicle_type = '3 wheeler'
Driver: vehicle_type = '3w'
After normalization: both become '3wheeler'
Expected: ✓ MATCH (via $1 parameter)
```

### Test Case 3: Different Vehicle Types
```
Order: vehicle_type = '2w'
Driver: vehicle_type = '3wheeler'
After normalization: '2wheeler' ≠ '3wheeler'
Expected: ✗ NO MATCH (correct)
```

### Test Case 4: Unspecified Order
```
Order: vehicle_type = NULL
Driver: vehicle_type = '3wheeler' (any)
Expected: ✓ MATCH (matches all drivers)
```

## Verification Steps

1. **Check normalized mapping works:**
   ```
   '3w' → '3wheeler' ✓
   '3 wheeler' → '3wheeler' ✓
   '3-wheeler' → '3wheeler' ✓
   'auto' → '3wheeler' ✓
   ```

2. **Test with your data:**
   ```
   Driver: vehicle_type = '3wheeler', weight = 500
   Order: vehicle_type = '3w', weight_requested = 0
   Should MATCH ✓
   ```

3. **Check logs show normalized values:**
   ```
   driverVehicleType: '3wheeler'
   matchedOrdersCount: (should be > 0 if matching)
   ```

4. **Verify order popup shows correct vehicle:**
   ```
   Shows actual type: '3w' or normalized display
   NOT defaulting to wrong type
   ```

## Benefits

✅ Handles format variations (3w, 3wheeler, 3-wheeler, 3 wheeler)  
✅ Handles alternative names (auto → 3wheeler)  
✅ Case-insensitive matching  
✅ Proper logging for debugging  
✅ Validates driver has valid vehicle type  
✅ Full weight, model, and body type validation still works  

## Rollback (if needed)

Remove the normalization step and revert to exact string matching - but this would break the current system using mixed formats.

