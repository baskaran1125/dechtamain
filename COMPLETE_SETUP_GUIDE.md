# Complete Project Setup & Testing Guide

## 🚀 Step 1: Start All Backend Services

### Option A: Automatic (Easiest)
```bash
# In main directory
start-all-backends.bat
```
This will open two terminal windows:
- Terminal 1: Vendor Backend (port 5000)
- Terminal 2: Client Backend (port 5001)

### Option B: Manual (if batch file doesn't work)

**Terminal 1 - Vendor Backend:**
```bash
cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\DechtaService-main\backend
npm start
```

**Terminal 2 - Client Backend:**
```bash
cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\dechta-client\backend
npm start
```

**Wait for both to show:**
- ✅ "Server listening at http://..."
- ✅ "Database connected"

---

## 🌐 Step 2: Start All Frontend Services

### Terminal 3 - Vendor Dashboard:
```bash
cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\DechtaService-main\vendor-dashboard
npm start
```

### Terminal 4 - Client App:
```bash
cd C:\Users\LOKI\OneDrive\Desktop\Dechta-main\Dechta-main\dechta-client\frontend
npm start
```

---

## ✅ Step 3: Verify All Services are Running

Open a browser and check:
- ✅ http://localhost:3000 (Client App)
- ✅ http://localhost:3001 (Vendor Dashboard)
- ✅ http://localhost:5000/health (Vendor Backend)
- ✅ http://localhost:5001/health (Client Backend)

---

## 🧪 Step 4: Test End-to-End Flow

### 1. Client Places Order
- Open http://localhost:3000
- Login as client
- Add items to cart
- Place order for delivery
- Note the Order ID

### 2. Driver Accepts Order
- Open driver app (check what port it's on)
- Login as driver
- Accept the order from client
- Start delivery

### 3. Driver Completes Delivery
- Confirm pickup
- Confirm delivery location
- Mark as delivered
- Driver should see earnings in wallet

### 4. Verify Vendor Wallet Updated
- Open http://localhost:3001 (Vendor Dashboard)
- Login as vendor
- Go to Wallet - should show new earnings
- Go to Billing - should show completed order

### 5. Verify Client Order Status
- Go back to http://localhost:3000
- Check order history
- Should show "Delivered" status

---

## 🔍 Troubleshooting

### If you see 401 errors:
- Make sure both backends are running
- Check tokens are valid
- Clear browser localStorage and login again

### If invoices still show ₹0:
- Make sure vendor backend is restarted (with our fixes)
- Clear browser cache

### If orders show no product names:
- Make sure database has orders with items
- Dashboard might need refresh

---

## 📝 Summary of Fixes Applied

✅ Fixed billing invoices 500 error (backend)
✅ Fixed online invoice amounts display (vendor dashboard)
✅ Fixed invoice details/items display (invoice component)
✅ Fixed dashboard order amounts (dashboard component)
✅ Added better field name handling for cross-service compatibility
