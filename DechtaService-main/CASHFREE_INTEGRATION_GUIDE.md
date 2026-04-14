# Cashfree Payment Integration Guide

## Overview
The vendor dashboard now supports both **Cashfree** and **Razorpay** payment gateways for adding money to wallet and processing settlements.

## Frontend Implementation

### 1. Added UI Components

#### WalletPage.jsx
- Added "Add Money" and "Withdraw" buttons in the top-right header
- Integrated modal rendering for payment flows
- Added state management for modals

#### AddMoneyModal.jsx
- Updated to support both Cashfree and Razorpay payment methods
- Added payment method selection UI
- Integrated with Cashfree SDK (`https://sdk.cashfree.com/js/checkout/unminified/cashfree.js`)
- Integrated with Razorpay SDK (`https://checkout.razorpay.com/v1/checkout.js`)

#### WithdrawMoneyModal.jsx
- Already fully implemented with UPI and Bank Transfer support

### 2. API Integration

Updated `apiClient.js` with new endpoints:

```javascript
// Cashfree Payment
export const createCashfreeSession = (amount, email, phone) =>
  api.post('/vendors/wallet/create-cashfree-session', { amount, email, phone });

export const verifyCashfreePayment = (paymentSessionId, paymentId) =>
  api.post('/vendors/wallet/verify-cashfree-payment', { paymentSessionId, paymentId });

// Razorpay Payment
export const createRazorpayOrder = (amount) =>
  api.post('/vendors/wallet/create-order', { amount });

export const verifyRazorpayPayment = (orderData) =>
  api.post('/vendors/wallet/verify-payment', orderData);

// Withdrawal
export const withdrawalRequest = (withdrawalData) =>
  api.post('/vendors/wallet/withdraw', withdrawalData);
```

## Backend Requirements

### Required Environment Variables

```env
# Cashfree Configuration
CASHFREE_APP_ID=your_app_id
CASHFREE_SECRET_KEY=your_secret_key
CASHFREE_API_URL=https://api.cashfree.com/pg
CASHFREE_RETURN_URL=https://yourdomain.com/wallet/callback

# Razorpay Configuration (if using Razorpay)
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

### Required Endpoints

#### 1. Create Cashfree Payment Session
```
POST /api/vendors/wallet/create-cashfree-session
Headers: Authorization: Bearer {token}
Body: {
  amount: number,
  email: string,
  phone: string
}
Response: {
  sessionId: string,
  paymentLink: string?
}
```

**Implementation Steps:**
1. Validate amount (minimum ₹100, maximum ₹100,000)
2. Create a unique order ID
3. Call Cashfree API to create payment session
4. Store payment session in database for verification
5. Return sessionId to frontend

**Cashfree API Example:**
```javascript
const cashfreeResponse = await fetch('https://api.cashfree.com/pg/orders', {
  method: 'POST',
  headers: {
    'X-Client-Id': CASHFREE_APP_ID,
    'X-Client-Secret': CASHFREE_SECRET_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    order_id: uniqueOrderId,
    order_amount: amount,
    order_currency: 'INR',
    customer_details: {
      customer_email: email,
      customer_phone: phone
    },
    order_meta: {
      return_url: CASHFREE_RETURN_URL
    }
  })
});
```

#### 2. Verify Cashfree Payment
```
POST /api/vendors/wallet/verify-cashfree-payment
Headers: Authorization: Bearer {token}
Body: {
  paymentSessionId: string,
  paymentId: string
}
Response: {
  success: boolean,
  amount: number,
  transactionId: string
}
```

**Implementation Steps:**
1. Verify payment with Cashfree API
2. Update vendor wallet balance
3. Record transaction in database
4. Return success status

#### 3. Create Razorpay Order (Existing)
```
POST /api/vendors/wallet/create-order
Headers: Authorization: Bearer {token}
Body: {
  amount: number
}
Response: {
  orderId: string,
  currency: string
}
```

#### 4. Verify Razorpay Payment (Existing)
```
POST /api/vendors/wallet/verify-payment
Headers: Authorization: Bearer {token}
Body: {
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string
}
Response: {
  success: boolean,
  amount: number
}
```

#### 5. Withdrawal Request
```
POST /api/vendors/wallet/withdraw
Headers: Authorization: Bearer {token}
Body: {
  amount: number,
  withdrawalMethod: 'upi' | 'bank',
  upiId?: string,
  accountNumber?: string,
  ifscCode?: string,
  accountName?: string
}
Response: {
  success: boolean,
  withdrawalId: string
}
```

### Database Schema Updates

#### wallet_transactions table
```sql
CREATE TABLE wallet_transactions (
  id PRIMARY KEY,
  vendor_id FOREIGN KEY,
  type ENUM('add_money', 'settlement', 'withdrawal'),
  amount DECIMAL(10, 2),
  payment_gateway ENUM('cashfree', 'razorpay'),
  transaction_id VARCHAR(255),
  status ENUM('pending', 'completed', 'failed'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### cashfree_payments table
```sql
CREATE TABLE cashfree_payments (
  id PRIMARY KEY,
  vendor_id FOREIGN KEY,
  order_id VARCHAR(255),
  session_id VARCHAR(255),
  payment_id VARCHAR(255),
  amount DECIMAL(10, 2),
  status VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Frontend Environment Variables

Add to `.env` file in vendor-dashboard:
```env
REACT_APP_RAZORPAY_KEY=your_razorpay_key
REACT_APP_API_URL=http://localhost:5000
```

## Payment Flow

### Add Money via Cashfree
1. User clicks "Add Money" button
2. Selects amount (predefined or custom)
3. Selects Cashfree as payment method
4. Frontend creates session via `/create-cashfree-session`
5. Cashfree script loads and opens checkout
6. User completes payment
7. Cashfree redirects to callback URL
8. Backend verifies payment and updates wallet
9. Success message shown to user

### Add Money via Razorpay
1. User clicks "Add Money" button
2. Selects amount
3. Selects Razorpay as payment method
4. Frontend creates order via `/create-order`
5. Razorpay script loads and opens checkout
6. User completes payment
7. Razorpay returns payment details to handler
8. Frontend verifies payment via `/verify-payment`
9. Wallet updated on success

### Withdraw Money
1. User clicks "Withdraw" button
2. Enters amount (min ₹100)
3. Selects withdrawal method (UPI or Bank)
4. Enters bank/UPI details
5. Reviews and confirms
6. Frontend sends request to `/withdraw`
7. Backend processes withdrawal
8. Success message shown with processing time

## Testing

### Cashfree Test Cards
Use their test environment credentials during development.

### Razorpay Test Cards
- Test Card: 4111 1111 1111 1111
- Expiry: Any future date
- CVV: Any 3 digits

## Security Considerations

1. **Payment Verification**: Always verify payments on the backend before crediting wallet
2. **Token Validation**: All endpoints require valid JWT token
3. **Amount Validation**: Validate minimum and maximum amounts
4. **Duplicate Prevention**: Prevent duplicate payment processing for same transaction ID
5. **HTTPS**: Ensure all payment endpoints use HTTPS in production
6. **Rate Limiting**: Implement rate limiting on payment endpoints
7. **Audit Logging**: Log all payment transactions for compliance

## Error Handling

Frontend displays user-friendly error messages:
- "Payment failed. Please try again."
- "Invalid amount. Please enter between ₹100 - ₹100,000"
- "Bank details must be verified to withdraw funds"
- "Payment verification failed"

## Support

For Cashfree issues: https://cashfree.com/developers
For Razorpay issues: https://razorpay.com/developers
