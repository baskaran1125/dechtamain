# Driver App Order Filtering Implementation - Complete Analysis

## Overview
This document maps out how orders are displayed to drivers and filtered based on vehicle type matching in the Dechta delivery platform.

---

## 1. WHERE AVAILABLE ORDERS ARE DISPLAYED TO DRIVERS

### Frontend Component: Orders Screen
**File:** `DechtaService-main/driver-app/app/(tabs)/orders.tsx`

#### Key Component
```tsx
export default function OrdersScreen() {
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [isOnline, setIsOnline] = useState(false);

  // Fetches available orders when tab is focused
  useFocusEffect(
    useCallback(() => {
      loadOnlineStatus();
      fetchHistory(historyFilter);
    }, [historyFilter])
  );

  // Loads online status from API
  const loadOnlineStatus = async () => {
    try {
      const profile = await DriverAPI.getProfile();
      if (profile.success && profile.data?.profile) {
        const online = profile.data.profile.is_online || false;
        setIsOnline(online);
        if (online) fetchAvailableOrders();  // TRIGGERS ORDER FETCH
        else setAvailableOrders([]); // Clear orders if offline
      }
    } catch {
      fetchAvailableOrders();
    }
  };

  // Fetches and displays available orders
  const fetchAvailableOrders = async () => {
    try {
      setLoadingOrders(true);
      const result = await OrdersAPI.getAvailable();  // API CALL
      
      if (result.success) {
        // Check if driver is offline from response
        if (result.isOnline === false) {
          setAvailableOrders([]);
          setLoadingOrders(false);
          return;
        }
        
        // NORMALIZE ORDER DATA
        const normalized = (result.data || []).map((o: any) => ({
          id: String(o.id),
          type: o.product_name || o.order_type || 'Delivery',
          vehicle_type: o.vehicle_type ? String(o.vehicle_type).trim() : 'Unknown',
          payout: o.delivery_fee || o.total_amount || 0,
          distance: o.distance_text || 'Calculating...',
          pickup: o.vendor_shop_name || o.pickup_address || 'Pickup',
          drop: o.delivery_address || o.client_address || 'Drop',
          pickup_lat: o.pickup_latitude,
          pickup_lng: o.pickup_longitude,
          drop_lat: o.delivery_latitude,
          drop_lng: o.delivery_longitude,
          status: 'Pending',
        }));
        
        setAvailableOrders(normalized);  // STATE UPDATED WITH ORDERS
      }
    } catch (e) {
      console.log('Fetch orders error:', e);
    } finally {
      setLoadingOrders(false);
    }
  };
}
```

#### API Endpoint Called
**File:** `DechtaService-main/driver-app/services/api.js`
```javascript
export const OrdersAPI = {
  // Get available orders
  getAvailable: () => apiRequest('/api/orders/available'),
  
  // Get active trip
  getActive: () => apiRequest('/api/orders/active'),
  
  // Accept an order
  accept: (orderId) =>
    apiRequest(`/api/orders/${orderId}/accept`, { method: 'POST' }),
};
```

---

## 2. HOW ORDERS ARE FILTERED BASED ON DRIVER VEHICLE TYPE

### Backend API Endpoint: /api/orders/available
**File:** `DechtaService-main/backend/src/controllers/ordersController.js` (Lines 334-404)

#### Step 1: Fetch Driver's Vehicle Profile
```javascript
async function getAvailableOrders(request, reply) {
  const driverId = request.driver.id;

  try {
    // CHECK: Driver is online
    if (!request.driver.is_online) {
      return reply.send({ success: true, data: [], isOnline: false });
    }

    // CHECK: Orders table exists
    if (!(await tableExists('orders'))) {
      return reply.send({ success: true, data: [], isOnline: true });
    }

    // FETCH: Driver's vehicle profile from DB
    const vehicle = await getDriverVehicleProfile(driverId);
    if (!vehicle) {
      return reply.send({ success: true, data: [], isOnline: true });
    }

    // BUILD: Vehicle matcher object from driver profile
    const vehicleMatcher = buildDriverVehicleMatcher(vehicle);

    // VALIDATE: Driver has vehicle type
    if (!vehicleMatcher.vehicleClass) {
      request.log.warn(
        { driverId, rawVehicleType: vehicle.vehicle_type }, 
        'Driver has no valid vehicle_type registered. Cannot fetch orders.'
      );
      return reply.send({ success: true, data: [], isOnline: true });
    }
```

#### Step 2: Fetch All Pending Orders (Pre-Filter)
```javascript
    // FETCH: All pending orders where vendor accepted and no driver assigned
    const result = await db.query(
      `SELECT o.*
       FROM orders o
       WHERE LOWER(COALESCE(o.status::text, '')) = 'pending'
         AND o.driver_id IS NULL
         AND LOWER(COALESCE(o.v_status::text, 'pending')) = 'accepted'
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
```

**Pre-Filter Conditions:**
- ✅ `status = 'pending'` - Order not yet completed/cancelled
- ✅ `driver_id IS NULL` - No driver assigned
- ✅ `v_status = 'accepted'` - Vendor has accepted order
- ⏱️ Limited to 100 orders (ordered by creation time, newest first)

#### Step 3: Filter By Vehicle Type Match
```javascript
    // FILTER: Apply vehicle-based matching logic
    const mapped = (result.rows || [])
      .filter((o) => matchesOrderWithDriverVehicle(o, vehicleMatcher))
      .slice(0, 20)  // Return top 20 matched orders
      .map((o) => ({
        ...o,
        normalized_status: normalizeOrderStatus(o.status),
      }));

    // LOG: Matching details for debugging
    request.log.debug({
      driverId,
      driverVehicleClass: vehicleMatcher.vehicleClass,
      driverModelCandidates: Array.from(vehicleMatcher.modelCandidates),
      driverBodyType: vehicleMatcher.bodyType,
      driverDimensions: vehicleMatcher.dimensions,
      driverWeightCapacity: vehicleMatcher.weightCapacity,
      totalCandidates,
      matchedOrdersCount: mapped.length,
    }, 'Orders fetched and matched');

    return reply.send({ success: true, data: mapped, isOnline: true });
```

---

## 3. VEHICLE TYPE MATCHING LOGIC

### A. Canonicalization (Vehicle Type Normalization)

**File:** `DechtaService-main/backend/src/controllers/ordersController.js` (Lines 69-77)

```javascript
function canonicalVehicleClass(value) {
  const token = normalizeToken(value);  // Trim, lowercase, remove special chars
  if (!token) return '';
  
  if (token.includes('2w') || token.includes('2wheel') || 
      token.includes('bike') || token.includes('motorcycle')) 
    return '2w';
  
  if (token.includes('3w') || token.includes('3wheel') || 
      token.includes('auto') || token.includes('autorickshaw')) 
    return '3w';
  
  if (token.includes('4w') || token.includes('4wheel') || 
      token.includes('truck') || token.includes('van')) 
    return '4w';
  
  return token;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '')      // Remove spaces, underscores, hyphens
    .replace(/[^a-z0-9]/g, '');    // Remove special characters
}
```

**Examples:**
| Input | Output |
|-------|--------|
| "3 Wheeler" | "3w" |
| "3-wheeler" | "3w" |
| "3wheeler" | "3w" |
| "3w" | "3w" |
| "Auto Rickshaw" | "3w" |
| "2 Wheeler" | "2w" |
| "4 Wheeler" | "4w" |
| "Truck" | "4w" |

### B. Build Driver Vehicle Matcher

**File:** `DechtaService-main/backend/src/controllers/ordersController.js` (Lines 193-228)

```javascript
function buildDriverVehicleMatcher(vehicle) {
  // Extract and normalize vehicle class
  const vehicleClass = canonicalVehicleClass(vehicle?.vehicle_type);
  const explicitWeight = toNumberOrNull(vehicle?.weight_capacity ?? vehicle?.weight_capacity_kg);

  // Collect all possible model ID variations
  const explicitModelCandidates = [
    normalizeModelId(vehicle?.model_id),
    normalizeModelId(vehicle?.selected_model_id),
    normalizeModelId(vehicle?.specific_model_id),
    normalizeModelId(vehicle?.vehicle_option_id),
    normalizeModelId(vehicle?.option_id),
  ].filter((token) => isLikelyModelIdToken(token));

  // Derive weight from model if not explicitly set
  const derivedWeightFromModels = explicitModelCandidates
    .map((candidate) => deriveWeightFromModelToken(candidate))
    .find((value) => value != null);

  const weightCapacity = explicitWeight ?? derivedWeightFromModels ?? null;
  const derivedModel = deriveModelIdFromVehicleClassAndWeight(vehicleClass, weightCapacity);
  
  const modelCandidates = new Set(explicitModelCandidates);
  if (derivedModel) modelCandidates.add(derivedModel);

  return {
    vehicleClass,                    // e.g., "3w"
    weightCapacity,                  // e.g., 500
    bodyType: String(vehicle?.body_type || '').trim().toLowerCase(),  // "open" or "closed"
    dimensions: normalizeDimension(
      vehicle?.dimensions ||
      vehicle?.cargo_dimensions ||
      vehicle?.load_dimensions ||
      ''
    ),
    modelCandidates,                 // Set of valid model IDs
  };
}
```

### C. Match Order with Driver Vehicle

**File:** `DechtaService-main/backend/src/controllers/ordersController.js` (Lines 243-267)

```javascript
function matchesOrderWithDriverVehicle(order, matcher) {
  // 1. VEHICLE CLASS MATCH (MANDATORY)
  const orderVehicleClass = canonicalVehicleClass(order?.vehicle_type);
  if (!orderVehicleClass || !matcher?.vehicleClass || 
      orderVehicleClass !== matcher.vehicleClass) {
    return false;  // No match if vehicle types differ
  }

  // 2. WEIGHT CAPACITY CHECK (Optional)
  const orderWeight = toNumberOrNull(order?.weight_capacity_requested);
  if (orderWeight != null && matcher.weightCapacity != null && 
      matcher.weightCapacity < orderWeight) {
    return false;  // Driver capacity insufficient
  }

  // 3. MODEL ID MATCH (Optional if order specifies)
  const orderModel = normalizeModelId(order?.model_id_requested);
  if (orderModel && matcher.modelCandidates.size > 0 && 
      !matcher.modelCandidates.has(orderModel)) {
    return false;  // Driver's model not in order's accepted models
  }

  // 4. DIMENSIONS MATCH (Optional if order specifies)
  const orderDimensions = normalizeDimension(order?.dimensions_requested);
  if (orderDimensions && matcher.dimensions && 
      orderDimensions !== matcher.dimensions) {
    return false;  // Cargo dimensions don't match
  }

  // 5. BODY TYPE MATCH (Optional if order specifies)
  const orderBodyType = String(order?.body_type_requested || '').trim().toLowerCase();
  if (isStrictBodyType(orderBodyType)) {
    if (!isStrictBodyType(matcher.bodyType)) return false;
    if (orderBodyType !== matcher.bodyType) return false;  // Must match exactly
  }

  return true;  // ALL CHECKS PASSED
}
```

**Matching Logic Summary:**
```
Condition 1: Vehicle Class (REQUIRED)
  ✅ PASS if: canonicalVehicleClass(order.vehicle_type) === driver.vehicleClass
  ❌ FAIL if: Types don't match (e.g., "3w" ≠ "2w")

Condition 2: Weight Capacity (Optional - only if order requests)
  ✅ PASS if: order.weight_capacity_requested ≤ driver.weightCapacity
  ❌ FAIL if: order requests more capacity than driver has

Condition 3: Model ID (Optional - only if both specify)
  ✅ PASS if: order.model_id matches driver.modelCandidates set
  ❌ FAIL if: order requires model driver doesn't have

Condition 4: Dimensions (Optional - only if both specify)
  ✅ PASS if: order.dimensions === driver.dimensions
  ❌ FAIL if: cargo doesn't fit driver's space

Condition 5: Body Type (Optional - only if order specifies)
  ✅ PASS if: order.body_type matches driver.body_type
  ❌ FAIL if: order needs closed vehicle but driver has open
```

---

## 4. DRIVER PROFILE VEHICLE TYPE FIELD

### A. Driver Registration (Vehicle Type Selection)

**File:** `DechtaService-main/driver-app/app/register.tsx`

```tsx
// Vehicle type selection during registration
const vehicleModelsData: any = {
  '3wheeler': [
    { id: '3w_500kg', name: '500 kg', weight: '500 kg', length: '5.5 ft' }
  ],
  '4wheeler': [
    { id: '4w_750kg',  name: '750 kg',  weight: '750 kg',  length: '6 ft' },
    { id: '4w_1200kg', name: '1200 kg', weight: '1200 kg', length: '7 ft' },
    { id: '4w_1700kg', name: '1700 kg', weight: '1700 kg', length: '8 ft' },
    { id: '4w_2500kg', name: '2500 kg', weight: '2500 kg', length: '10 ft' },
  ],
  '2wheeler': [
    { id: '2w_standard', name: 'Standard', weight: '20 kg', length: '3 ft' }
  ],
};

// Submission logic
const submitRegistration = async () => {
  // VALIDATION: 3/4 wheelers require model + body type
  if ((regData.vehicleType === '3wheeler' || regData.vehicleType === '4wheeler') && 
      !regData.specificModelId) {
    Alert.alert('Vehicle Model Missing', 'Please select a vehicle model.');
    return;
  }

  if ((regData.vehicleType === '3wheeler' || regData.vehicleType === '4wheeler') && 
      !regData.bodyType) {
    Alert.alert('Body Type Missing', 'Please select body type (Open or Closed).');
    return;
  }

  // SUBMIT: Registration with vehicle data
  const result = await DriverAPI.register({
    fullName: regData.fullName,
    vehicleType: regData.vehicleType,              // "2wheeler", "3wheeler", "4wheeler"
    specificModelId: safeVehicleData.specificModelId,  // e.g., "3w_500kg"
    vehicleModelName: safeVehicleData.vehicleModelName,
    vehicleWeight: safeVehicleData.vehicleWeight,
    vehicleDimensions: safeVehicleData.vehicleDimensions,
    bodyType: safeVehicleData.bodyType,            // "Open" or "Closed"
    vehicleNumber: regData.vehicleNumber,
    // ... other fields
  });
};
```

### B. Load Vehicle Type in Home Tab

**File:** `DechtaService-main/driver-app/app/(tabs)/index.tsx` (Lines 186-290)

```tsx
export default function HomeScreen() {
  const [vehicleType, setVehicleType] = 
    useState<"2wheeler" | "3wheeler" | "4wheeler">("4wheeler");

  // Load online status and vehicle type
  const loadOnlineStatus = async () => {
    try {
      const profile = await DriverAPI.getProfile();
      if (profile.success && profile.data?.profile) {
        const p = profile.data.profile;
        const online = p.is_online || false;
        setIsOnline(online);
        
        // LOAD: Vehicle type from profile
        if (profile.data?.vehicle?.vehicle_type) {
          setVehicleType(profile.data.vehicle.vehicle_type as any);
        }
      }
    } catch (error) {
      console.error('Failed to load online status:', error);
    }
  };

  // Display vehicle icon based on type
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );
}
```

**Vehicle Type UI Display:**
```tsx
{vehicleType === "2wheeler" ? (
  <Icon>🛵</Icon>  // Bike emoji
) : vehicleType === "3wheeler" ? (
  <Icon>🛺</Icon>  // Auto-rickshaw emoji
) : (
  <Icon>🚚</Icon>  // Truck emoji
)}
```

---

## 5. DATABASE SCHEMA

### Driver Vehicles Table

**File:** `DechtaService-main/backend/INIT_MISSING_TABLES.sql` (Lines 68-90)

```sql
CREATE TABLE IF NOT EXISTS driver_vehicles (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER,
  vehicle_type VARCHAR(50),        -- e.g., "3wheeler", "4wheeler", "2wheeler"
  model_id VARCHAR(100),           -- e.g., "3w_500kg", "4w_1200kg"
  selected_model_id VARCHAR(100),
  specific_model_id VARCHAR(100),
  weight_capacity INTEGER,         -- e.g., 500, 1200, 1700, 2500
  weight_capacity_kg INTEGER,
  body_type VARCHAR(50),           -- "Open" or "Closed"
  vehicle_number VARCHAR(50),
  registration_number VARCHAR(50),
  dimensions VARCHAR(100),         -- e.g., "5.5 ft", "7 ft"
  cargo_dimensions VARCHAR(100),
  load_dimensions VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Orders Table (Vehicle Matching Fields)

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER,               -- NULL until assigned
  status VARCHAR(50),              -- "pending", "assigned", "in_transit", "delivered"
  v_status VARCHAR(50),            -- vendor status: "accepted", "rejected"
  vehicle_type VARCHAR(50),        -- e.g., "3w", "3wheeler"
  model_id_requested VARCHAR(100), -- specific model needed
  weight_capacity_requested INTEGER,
  dimensions_requested VARCHAR(100),
  body_type_requested VARCHAR(50), -- "Open", "Closed"
  delivery_fee DECIMAL,
  created_at TIMESTAMP
);
```

---

## 6. ORDER VISIBILITY CONDITIONS SUMMARY

An order will **APPEAR** to a driver if ALL conditions are met:

| Condition | Check | Required? |
|-----------|-------|-----------|
| **Driver Status** | `driver.is_online = true` | ✅ YES |
| **Order Status** | `order.status = 'pending'` | ✅ YES |
| **Driver Assigned** | `order.driver_id IS NULL` | ✅ YES |
| **Vendor Accepted** | `order.v_status = 'accepted'` | ✅ YES |
| **Vehicle Class Match** | `canonicalVehicleClass(order.vehicle_type) == driver.vehicleClass` | ✅ YES |
| **Weight Capacity** | `order.weight_capacity_requested ≤ driver.weight_capacity` | ❌ NO (Optional) |
| **Model ID** | `order.model_id_requested ∈ driver.modelCandidates` | ❌ NO (Optional) |
| **Dimensions** | `order.dimensions_requested == driver.dimensions` | ❌ NO (Optional) |
| **Body Type** | `order.body_type_requested == driver.body_type` | ❌ NO (Optional) |

---

## 7. REAL-WORLD EXAMPLE

### Scenario: 3-Wheeler Driver Seeing 3-Wheeler Orders

```
DRIVER PROFILE (ID: 1)
├─ vehicle_type: "3wheeler"
├─ model_id: "3w_500kg"
├─ weight_capacity: 500 kg
├─ body_type: "Open"
└─ is_online: true

ORDER IN DATABASE (ID: 9)
├─ status: "pending"
├─ v_status: "accepted"
├─ driver_id: NULL
├─ vehicle_type: "3w"              ← Different format!
├─ model_id_requested: "3w_standard"
├─ weight_capacity_requested: 0
└─ body_type_requested: (empty)

MATCHING PROCESS:

Step 1: Normalize driver vehicle type
  Input:  "3wheeler"
  Output: "3w"

Step 2: Build matcher from driver profile
  vehicleClass: "3w"
  weightCapacity: 500
  modelCandidates: {"3w_500kg"}
  bodyType: "open"

Step 3: Check order against matcher
  Order vehicle_type: "3w" → canonicalVehicleClass = "3w" ✅ MATCH
  Order weight: 0 ≤ 500 ✅ OK
  Order model: "3w_standard" → not in modelCandidates (ignored) ✅ OK
  Order body_type: empty (unspecified, ignored) ✅ OK

Result: ✅ ORDER WILL APPEAR TO DRIVER
```

---

## 8. FILE LOCATIONS REFERENCE

| Functionality | File Path |
|---------------|-----------|
| **Order Display Component** | `DechtaService-main/driver-app/app/(tabs)/orders.tsx` |
| **Order Matching Logic** | `DechtaService-main/backend/src/controllers/ordersController.js` |
| **Driver Profile Loading** | `DechtaService-main/driver-app/app/(tabs)/index.tsx` |
| **Vehicle Type Registration** | `DechtaService-main/driver-app/app/register.tsx` |
| **API Endpoints** | `DechtaService-main/driver-app/services/api.js` |
| **Database Schema** | `DechtaService-main/backend/INIT_MISSING_TABLES.sql` |

---

## 9. KEY FUNCTIONS REFERENCE

### Backend Functions (ordersController.js)

| Function | Purpose | Location |
|----------|---------|----------|
| `getAvailableOrders()` | Main API endpoint that fetches and filters orders | Lines 334-404 |
| `matchesOrderWithDriverVehicle()` | Checks if order matches driver specs | Lines 243-267 |
| `buildDriverVehicleMatcher()` | Builds matcher object from driver profile | Lines 193-228 |
| `canonicalVehicleClass()` | Normalizes vehicle type to standard class | Lines 69-77 |
| `getDriverVehicleProfile()` | Fetches driver vehicle from DB | Lines 274-319 |
| `normalizeToken()` | Standardizes text for comparison | Lines 52-57 |
| `normalizeModelId()` | Normalizes model IDs | Lines 79-92 |

### Frontend Functions

| Function | Purpose | File |
|----------|---------|------|
| `fetchAvailableOrders()` | Calls API and displays orders | orders.tsx |
| `loadOnlineStatus()` | Checks if driver online | index.tsx, orders.tsx |
| `submitRegistration()` | Registers driver with vehicle info | register.tsx |

---

## 10. DEBUGGING TIPS

### Check Backend Logs
Look for debug logs when driver fetches orders:
```json
{
  "driverId": 1,
  "driverVehicleClass": "3w",
  "driverModelCandidates": ["3w_500kg"],
  "driverBodyType": "open",
  "driverWeightCapacity": 500,
  "totalCandidates": 10,
  "matchedOrdersCount": 5
}
```

### Verify Vehicle Type Match
```sql
-- Check driver's stored vehicle type
SELECT id, vehicle_type, model_id, weight_capacity FROM vehicles 
WHERE driver_id = 1;

-- Check orders visible to driver
SELECT id, vehicle_type, weight_capacity_requested, status, v_status 
FROM orders 
WHERE status = 'pending' AND driver_id IS NULL 
AND v_status = 'accepted'
ORDER BY created_at DESC;
```

### Common Issues
1. **Order not showing**: Driver offline or order status not "pending"
2. **Vehicle type mismatch**: Different formats (e.g., "3w" vs "3wheeler") - check canonicalization
3. **Weight capacity issue**: Order requests more capacity than driver provides
4. **Model mismatch**: Order specifies model driver doesn't have
5. **Body type conflict**: Order needs closed vehicle but driver has open
