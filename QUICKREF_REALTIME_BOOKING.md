# Quick Reference: Real-Time Booking Status & Vehicle Matching

## 🚀 Quick Start

### Real-Time Status Updates (5-second polling)
- ✅ **File**: `dechta-client/frontend/src/App.jsx` (Line ~131)
- ✅ **Result**: Orders update automatically without refresh
- ✅ **Status**: "Placed" → "Processing" → "Out for Delivery" → "Delivered"

### Vehicle Matching Diagnostic
- ✅ **Endpoint**: `GET /api/orders/debug/vehicle-match`
- ✅ **Auth**: Required (driver token)
- ✅ **Response**: Shows why orders match/don't match your vehicle

---

## 📋 Testing Checklist

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| **Polling** | Place order → Check bookings | Status updates in 5s | [ ] |
| **Status Labels** | Accept order | Shows "Processing" not "Confirmed" | [ ] |
| **Vehicle Matching** | 3W driver → See 3W orders only | No 2W/4W orders shown | [ ] |
| **Diagnostic API** | Call `/debug/vehicle-match` | JSON shows your vehicle & matching | [ ] |

---

## 🔍 Debugging Flow

```
Problem: 3-wheeler driver sees 2-wheeler orders
                    ↓
1️⃣  Call /api/orders/debug/vehicle-match
                    ↓
2️⃣  Check driverVehicleClass = "3w"?
    ✅ Yes → Go to step 3
    ❌ No → Vehicle type not saved
            Fix: Re-register driver
                    ↓
3️⃣  Check orderMatchDetails
    ✅ All matched=true → Vehicle matching works!
    ❌ Some matched=false → Check failureReasons
                    ↓
4️⃣  Check failureReasons
    "Vehicle class mismatch: order needs 2w, driver has 3w"
    → This is correct! 2W order should NOT match 3W driver
```

---

## 🛠️ Quick Fixes

### Issue: Orders not updating in real-time

**Check**: Is polling running?
```javascript
// In browser DevTools Console:
// Watch for network requests to /api/orders/my every 5 seconds
```

**Fix**: Clear cache and refresh
```bash
CTRL+SHIFT+DELETE (or CMD+SHIFT+DELETE)
→ Clear browsing data
→ Refresh page
```

---

### Issue: 3-wheeler driver sees 2-wheeler orders

**Debug**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/orders/debug/vehicle-match
```

**Check Response**:
```json
{
  "vehicleMatcher": {
    "vehicleClass": "3w"  // ← Should be "3w" for 3-wheeler
  },
  "orderMatchDetails": [
    {
      "matched": false,
      "failureReasons": ["Vehicle class mismatch: order needs 2w, driver has 3w"]
      // ✅ Correct! 2W order should not match 3W driver
    }
  ]
}
```

**If vehicleClass is "2w" but should be "3w"**:
- Driver's vehicle type wasn't saved
- Solution: Re-register driver with correct vehicle type

---

## 📊 Status Mapping Reference

| Backend Status | Frontend Display | Description |
|---|---|---|
| `pending` | "Placed" | Order received, waiting for driver |
| `confirmed` | "Processing" | Driver accepted order |
| `shipped` | "Out for Delivery" | Driver picked up, delivering |
| `delivered` | "Delivered" | Order completed |

---

## 🔧 Configuration Quick Edits

### Change Polling Interval
**File**: `dechta-client/frontend/src/App.jsx`

```javascript
// Line ~165 - Current: 5000ms (5 seconds)
}, 5000);  // ← Change to desired milliseconds
```

**Options**:
- `3000` = 3 sec (responsive, more API calls)
- `5000` = 5 sec (balanced) ← Current
- `10000` = 10 sec (less load, slower updates)

---

## 📞 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Status doesn't update | Polling not running | Check DevTools Network tab for `/api/orders/my` requests |
| Shows wrong status | Backend not updating | Check order status in database |
| Vehicle types don't match | Vehicle type not saved | Re-register driver |
| Diagnostic endpoint 404 | Route not added | Rebuild backend |

---

## 💾 Database Queries for Quick Debug

```sql
-- Check all orders and their statuses
SELECT id, vehicle_type, status, created_at FROM orders LIMIT 10;

-- Check specific driver's vehicle
SELECT * FROM vehicles WHERE driver_id = 123;

-- Check if order has correct vehicle_type
SELECT id, vehicle_type, status FROM orders WHERE id = 456;

-- Count orders by vehicle type
SELECT vehicle_type, COUNT(*) FROM orders GROUP BY vehicle_type;
```

---

## ✨ Features After Fixes

| Feature | Before | After |
|---------|--------|-------|
| **Status Updates** | Manual refresh needed | Automatic every 5s |
| **Order Labels** | "Dispatched" (unclear) | "Out for Delivery" (clear) |
| **Vehicle Matching** | No debugging info | Full diagnostic endpoint |
| **Vehicle Filtering** | Might show wrong types | Correct filtering with debug |

---

## 🎯 Success Criteria

- ✅ Orders update status every 5 seconds automatically
- ✅ Status displays as: "Placed" → "Processing" → "Out for Delivery" → "Delivered"
- ✅ Vehicle matching works: 3W driver only sees 3W orders
- ✅ Diagnostic endpoint helps debug issues
- ✅ No manual refresh needed for status updates

---

**Quick Test**: 
1. Open DevTools (F12)
2. Go to Network tab
3. Place an order
4. Watch for `/api/orders/my` requests every 5 seconds
5. See status change in UI without refresh ✅

**Version**: 1.0 | **Date**: April 18, 2026
