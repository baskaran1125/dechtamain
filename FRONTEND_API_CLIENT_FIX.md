# ✅ FRONTEND API CLIENT - VENDOR AUTH ENDPOINTS ADDED

**Issue:** Frontend couldn't call vendor authentication endpoints  
**Root Cause:** API client was missing vendor auth functions  
**Status:** ✅ **FIXED**

---

## 🎯 What Was Fixed

### Problem
Frontend trying to call `/api/vendors/auth/send-otp` but API client had no function for it.

### Solution
Added 6 new vendor authentication functions to `src/api/apiClient.js`:

**New Functions:**
1. ✅ `vendorSendOtp(phone)` → `POST /api/vendors/auth/send-otp`
2. ✅ `vendorVerifyOtp(phone, otp)` → `POST /api/vendors/auth/verify-otp`
3. ✅ `vendorRegister(...)` → `POST /api/vendors/auth/register`
4. ✅ `vendorGetProfile()` → `GET /api/vendors/me`
5. ✅ `vendorUpdateProfile(updates)` → `PUT /api/vendors/me`
6. ✅ `vendorGetDashboard()` → `GET /api/vendors/dashboard`

---

## 📝 How to Use in Frontend Components

### Example 1: Vendor Registration Flow

```javascript
import { vendorSendOtp, vendorVerifyOtp, vendorRegister } from '@/api/apiClient';

// Step 1: Send OTP
const handleSendOtp = async (phone) => {
  try {
    const response = await vendorSendOtp(phone);
    console.log('OTP sent:', response);
    // Show OTP input form
  } catch (error) {
    console.error('Failed to send OTP:', error.message);
  }
};

// Step 2: Verify OTP (if new vendor)
const handleVerifyOtp = async (phone, otp) => {
  try {
    const response = await vendorVerifyOtp(phone, otp);
    if (response.isNewVendor) {
      console.log('New vendor - show registration form');
    } else {
      // Existing vendor - save token and redirect
      localStorage.setItem('dechta_token', response.token);
      window.location.href = '/vendor/dashboard';
    }
  } catch (error) {
    console.error('Failed to verify OTP:', error.message);
  }
};

// Step 3: Register new vendor
const handleRegister = async (formData) => {
  try {
    const response = await vendorRegister(
      formData.phone,
      formData.otp,
      formData.businessName,
      formData.ownerName,
      formData.email,
      formData.category,
      formData.businessAddress
    );
    
    // Save token and redirect
    localStorage.setItem('dechta_token', response.token);
    window.location.href = '/vendor/dashboard';
  } catch (error) {
    console.error('Registration failed:', error.message);
  }
};
```

### Example 2: Get Vendor Profile

```javascript
import { vendorGetProfile } from '@/api/apiClient';

const VendorProfilePage = () => {
  const [profile, setProfile] = React.useState(null);
  
  React.useEffect(() => {
    vendorGetProfile()
      .then(data => setProfile(data.vendor))
      .catch(error => console.error('Failed to load profile:', error));
  }, []);
  
  return <div>{profile && <h1>{profile.businessName}</h1>}</div>;
};
```

### Example 3: Get Vendor Dashboard

```javascript
import { vendorGetDashboard } from '@/api/apiClient';

const VendorDashboard = () => {
  const [dashboard, setDashboard] = React.useState(null);
  
  React.useEffect(() => {
    vendorGetDashboard()
      .then(data => setDashboard(data.dashboard))
      .catch(error => console.error('Failed to load dashboard:', error));
  }, []);
  
  return (
    <div>
      {dashboard && (
        <>
          <p>Total Products: {dashboard.totalProducts}</p>
          <p>Total Orders: {dashboard.totalOrders}</p>
          <p>Total Revenue: ${dashboard.totalRevenue}</p>
        </>
      )}
    </div>
  );
};
```

### Example 4: Update Vendor Profile

```javascript
import { vendorUpdateProfile } from '@/api/apiClient';

const updateVendorProfile = async (updates) => {
  try {
    const response = await vendorUpdateProfile({
      businessName: 'New Store Name',
      businessAddress: '456 New Street',
      // ... other fields
    });
    console.log('Profile updated:', response.vendor);
  } catch (error) {
    console.error('Failed to update profile:', error.message);
  }
};
```

---

## 📂 File Updated

**File:** `dechta-client/frontend/src/api/apiClient.js`

**Changes:**
- Added vendor auth section (lines 92-119)
- 6 new export functions for vendor endpoints
- All functions use existing `request()` helper
- Automatic token handling via localStorage
- Base URL controlled by `VITE_API_URL` env var

---

## 🔄 API Flow

### Vendor Registration Flow
```
Frontend Component
    ↓
vendorSendOtp(phone)
    ↓
POST /api/vendors/auth/send-otp
    ↓
Backend receives OTP, sends SMS/mock OTP
    ↓
Frontend gets OTP input
    ↓
vendorVerifyOtp(phone, otp)
    ↓
POST /api/vendors/auth/verify-otp
    ↓
If new vendor:
  Backend returns { isNewVendor: true }
  ↓
  vendorRegister(...)
  ↓
  POST /api/vendors/auth/register
  ↓
  Backend creates user + vendor_profiles
  ↓
  Backend returns { token, vendor }

If existing vendor:
  Backend returns { token, vendor }
```

### Protected Endpoint Flow
```
Frontend Component (with JWT token)
    ↓
vendorGetProfile() or vendorGetDashboard()
    ↓
request() helper adds Authorization header
    ↓
GET /api/vendors/me or /api/vendors/dashboard
    ↓
Backend middleware verifies token
    ↓
Backend controller executes
    ↓
Response returned to frontend
```

---

## ✅ Configuration

### Environment Variables (in frontend `.env`)

```env
# Optional - defaults to http://localhost:5001
VITE_API_URL=http://localhost:5001

# Or for production
VITE_API_URL=https://api.yourdomain.com
```

### Token Storage
- Key: `dechta_token`
- Stored in: localStorage
- Retrieved automatically by API client

### Authentication Header
Automatically added to all requests:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 🧪 Testing Vendor Endpoints

### Test in Browser Console

```javascript
// Import the client
import * as api from '/src/api/apiClient.js';

// Test 1: Send OTP
await api.vendorSendOtp('9876543210');
// Response: { success: true, message: "OTP sent successfully", dev_otp: "1234" }

// Test 2: Verify OTP
await api.vendorVerifyOtp('9876543210', '1234');
// Response: { success: true, token: "...", vendor: {...} }

// Test 3: Save token
localStorage.setItem('dechta_token', '<token_from_test_2>');

// Test 4: Get Profile
await api.vendorGetProfile();
// Response: { success: true, vendor: {...} }

// Test 5: Get Dashboard
await api.vendorGetDashboard();
// Response: { success: true, dashboard: {...} }
```

---

## 📋 Complete API Client Functions List

### Customer Auth (Already Existed)
- `sendOtp(phone)` - Send OTP to customer
- `verifyOtp(phone, otp, name)` - Verify customer OTP
- `getProfile()` - Get customer profile
- `updateProfile(updates)` - Update customer profile
- `googleAuth(idToken)` - Google OAuth login
- `completeGoogleProfile(phone, name)` - Complete Google OAuth flow

### Vendor Auth (NEW)
- ✅ `vendorSendOtp(phone)` - Send OTP to vendor
- ✅ `vendorVerifyOtp(phone, otp)` - Verify vendor OTP
- ✅ `vendorRegister(...)` - Register new vendor
- ✅ `vendorGetProfile()` - Get vendor profile
- ✅ `vendorUpdateProfile(updates)` - Update vendor profile
- ✅ `vendorGetDashboard()` - Get vendor dashboard

### Products
- `fetchProducts(params)` - Get all products
- `fetchProductById(id)` - Get product details
- `fetchNearbyProducts(lat, lng, radius)` - Get nearby products
- `fetchCategories()` - Get product categories
- `fetchSearchResults(query)` - Search products
- `fetchGroupedProducts(limit)` - Get grouped products

### Vendors
- `fetchActiveVendors()` - Get active vendors
- `fetchVendorProducts(vendorId)` - Get vendor's products

### Orders
- `placeOrder(orderData)` - Place order
- `fetchMyOrders()` - Get user's orders

### Pricing
- `fetchVehiclePricing()` - Get vehicle pricing
- `fetchDeliveryCharge(...)` - Calculate delivery charge

### Addresses
- `fetchAddresses()` - Get user addresses
- `saveAddress(...)` - Save new address
- `updateAddress(id, updates)` - Update address
- `deleteAddress(id)` - Delete address

### Location
- `searchLocations(query)` - Search locations
- `reverseGeocode(lat, lng)` - Get address from coordinates
- `getMapsKey()` - Get maps API key

---

## 🚀 Quick Start

### Step 1: Update Your Component
Import the new vendor functions:
```javascript
import { 
  vendorSendOtp, 
  vendorVerifyOtp, 
  vendorRegister,
  vendorGetProfile,
  vendorGetDashboard 
} from '@/api/apiClient';
```

### Step 2: Use in Your Code
```javascript
// Send OTP to vendor
const response = await vendorSendOtp(phoneNumber);

// Verify OTP
const result = await vendorVerifyOtp(phoneNumber, otpCode);

// If new vendor, register
if (result.isNewVendor) {
  const registered = await vendorRegister(
    phoneNumber, 
    otpCode, 
    businessName, 
    ownerName,
    email, 
    category, 
    businessAddress
  );
  
  // Save token
  localStorage.setItem('dechta_token', registered.token);
}

// Get profile with token
const profile = await vendorGetProfile();

// Get dashboard stats
const dashboard = await vendorGetDashboard();
```

---

## ✨ Summary

✅ **6 new vendor authentication functions added**  
✅ **Automatic token handling**  
✅ **Proper error handling**  
✅ **Ready to use in components**  
✅ **All endpoints properly mapped**  

---

## 📞 Next Steps

1. **Use the new functions** in your vendor components
2. **Test vendor registration** flow
3. **Verify token storage** in localStorage
4. **Check dashboard** displays real data
5. **Deploy to production** when ready

---

**Status:** ✅ READY  
**File Updated:** `src/api/apiClient.js`  
**Functions Added:** 6 vendor auth endpoints
