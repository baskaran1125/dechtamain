# Dechta Platform - Implementation & Integration Guide

## 📋 Table of Contents
1. [Database Setup](#database-setup)
2. [File Structure & Organization](#file-structure--organization)
3. [Backend API Layer](#backend-api-layer)
4. [Frontend Integration](#frontend-integration)
5. [Authentication Flow](#authentication-flow)
6. [Data Migration](#data-migration)
7. [Deployment Checklist](#deployment-checklist)

---

## Database Setup

### Step 1: Create Database in PostgreSQL

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE dechta_production;
CREATE DATABASE dechta_staging;
CREATE DATABASE dechta_dev;

# Switch to database
\c dechta_production

# Run unified schema
\i UNIFIED_SCHEMA.sql
```

### Step 2: Verify Schema in PgAdmin

1. Open PgAdmin
2. Create new server connection:
   - Host: localhost (or your server)
   - Port: 5432
   - Username: postgres
   - Database: dechta_production

3. Verify tables exist under `Schemas → public → Tables`
4. Check indexes and functions are created

### Step 3: Environment Configuration

Create `.env` files for each environment:

```env
# .env.production
DATABASE_URL=postgresql://user:password@host:5432/dechta_production
NODE_ENV=production
JWT_SECRET=your-super-secret-key
JWT_EXPIRY=7d
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=3

# Firebase/OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Payment Gateway
CASHFREE_API_KEY=your-key
CASHFREE_SECRET_KEY=your-secret

# Storage
AWS_S3_BUCKET=dechta-uploads
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

---

## File Structure & Organization

### Recommended Project Structure

```
dechta-unified/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js          # Database connection
│   │   │   ├── jwt.js              # JWT configuration
│   │   │   └── passport.js         # OAuth configuration
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT verification
│   │   │   ├── errorHandler.js     # Error handling
│   │   │   └── validation.js       # Request validation
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Driver.js
│   │   │   ├── Worker.js
│   │   │   ├── Vendor.js
│   │   │   ├── Job.js
│   │   │   ├── Order.js
│   │   │   ├── Wallet.js
│   │   │   └── Transaction.js
│   │   ├── routes/
│   │   │   ├── auth.js             # Authentication endpoints
│   │   │   ├── users.js            # User management
│   │   │   ├── drivers.js          # Driver-specific routes
│   │   │   ├── workers.js          # Worker-specific routes
│   │   │   ├── vendors.js          # Vendor management
│   │   │   ├── jobs.js             # Job management
│   │   │   ├── orders.js           # Order processing
│   │   │   ├── wallet.js           # Wallet operations
│   │   │   ├── admin.js            # Admin operations
│   │   │   └── support.js          # Support tickets
│   │   ├── controllers/
│   │   │   └── [same structure as routes]
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── walletService.js
│   │   │   ├── jobService.js
│   │   │   ├── notificationService.js
│   │   │   ├── emailService.js
│   │   │   └── smsService.js
│   │   ├── utils/
│   │   │   ├── validators.js
│   │   │   ├── helpers.js
│   │   │   ├── logger.js
│   │   │   └── constants.js
│   │   ├── migrations/
│   │   │   └── [database migrations]
│   │   └── app.js                  # Express app setup
│   ├── .env.example
│   ├── package.json
│   └── server.js                   # Entry point
├── frontend/
│   ├── apps/
│   │   ├── driver/                 # Driver app
│   │   ├── worker/                 # Worker app
│   │   ├── vendor/                 # Vendor dashboard
│   │   ├── client/                 # Client/Customer app
│   │   └── admin/                  # Admin dashboard
│   ├── shared/
│   │   ├── hooks/
│   │   ├── components/
│   │   ├── utils/
│   │   └── api/
│   └── package.json
├── docs/
│   ├── API_DOCUMENTATION.md
│   ├── DATABASE_SCHEMA.md
│   ├── SETUP_GUIDE.md
│   └── DEPLOYMENT_GUIDE.md
├── docker-compose.yml              # Docker setup
├── UNIFIED_SCHEMA.sql              # Database schema
├── IMPLEMENTATION_GUIDE.md         # This file
└── README.md
```

---

## Backend API Layer

### 1. Setup Express Server

**File: `backend/src/app.js`**

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const driverRoutes = require('./routes/drivers');
const workerRoutes = require('./routes/workers');
const vendorRoutes = require('./routes/vendors');
const jobRoutes = require('./routes/jobs');
const orderRoutes = require('./routes/orders');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Logging
app.use(morgan('combined'));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Passport authentication
app.use(passport.initialize());
require('./config/passport');

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/drivers', driverRoutes);
app.use('/api/v1/workers', workerRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'API is running' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
```

### 2. Database Connection Pool

**File: `backend/src/config/database.js`**

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
```

### 3. Authentication Service

**File: `backend/src/services/authService.js`**

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/database');

class AuthService {
  // Send OTP via SMS
  async sendOTP(phoneNumber) {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes
    
    // Store OTP in database
    await pool.query(
      `INSERT INTO otp_verifications (phone_number, otp, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_number) DO UPDATE SET otp = $2, expires_at = $3`,
      [phoneNumber, otp, expiresAt]
    );
    
    // Send via SMS (Twilio/SNS)
    // await smsService.send(phoneNumber, `Your Dechta OTP is: ${otp}`);
    
    return { message: 'OTP sent successfully' };
  }

  // Verify OTP and create/login user
  async verifyOTPAndAuth(phoneNumber, otp, userType) {
    // Check OTP
    const result = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE phone_number = $1 AND otp = $2 AND expires_at > NOW()`,
      [phoneNumber, otp]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired OTP');
    }
    
    // Check if user exists
    let user = await pool.query(
      `SELECT * FROM users WHERE phone_number = $1`,
      [phoneNumber]
    );
    
    // Create user if doesn't exist
    if (user.rows.length === 0) {
      user = await pool.query(
        `INSERT INTO users (phone_number, user_type, is_verified)
         VALUES ($1, $2, true) RETURNING *`,
        [phoneNumber, userType]
      );
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.rows[0].id,
        uuid: user.rows[0].uuid,
        userType: user.rows[0].user_type
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );
    
    // Mark OTP as verified
    await pool.query(
      `UPDATE otp_verifications SET is_verified = true, verified_at = NOW()
       WHERE phone_number = $1`,
      [phoneNumber]
    );
    
    return {
      user: {
        id: user.rows[0].id,
        phoneNumber: user.rows[0].phone_number,
        userType: user.rows[0].user_type
      },
      token,
      expiresIn: process.env.JWT_EXPIRY
    };
  }

  // JWT token generation
  generateToken(userId, userType) {
    return jwt.sign(
      { id: userId, userType },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}

module.exports = new AuthService();
```

### 4. Authentication Middleware

**File: `backend/src/middleware/auth.js`**

```javascript
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
```

### 5. Sample Routes

**File: `backend/src/routes/jobs.js`**

```javascript
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const pool = require('../config/database');

// Get all jobs for a user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    const { status, type, limit = 10, offset = 0 } = req.query;
    
    let query = `SELECT * FROM jobs WHERE assigned_user_id = $1`;
    const params = [userId];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new job
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { jobTitle, description, jobType, payAmount, estimatedHours } = req.body;
    
    const result = await pool.query(
      `INSERT INTO jobs (job_title, description, job_type, pay_amount, estimated_hours, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [jobTitle, description, jobType, payAmount, estimatedHours, req.user.id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update job status
router.patch('/:jobId/status', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *`,
      [status, jobId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### 6. Wallet Service

**File: `backend/src/services/walletService.js`**

```javascript
const pool = require('../config/database');

class WalletService {
  // Get wallet balance
  async getWallet(userId) {
    const result = await pool.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  // Add funds to wallet
  async addFunds(userId, amount, transactionType, description) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update wallet
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
        [amount, userId]
      );
      
      // Create transaction record
      const transaction = await client.query(
        `INSERT INTO transactions (user_id, transaction_type, amount, description, status)
         VALUES ($1, $2, $3, $4, 'completed') RETURNING *`,
        [userId, transactionType, amount, description]
      );
      
      await client.query('COMMIT');
      return transaction.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Withdraw funds
  async withdrawFunds(userId, amount) {
    const wallet = await this.getWallet(userId);
    
    if (wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    return await this.addFunds(userId, -amount, 'withdrawal', 'Wallet withdrawal');
  }
}

module.exports = new WalletService();
```

---

## Frontend Integration

### 1. API Client Setup

**File: `frontend/shared/api/client.js`**

```javascript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Add token to requests
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
```

### 2. Authentication Hook

**File: `frontend/shared/hooks/useAuth.js`**

```javascript
import { useState, useCallback } from 'react';
import client from '../api/client';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendOTP = useCallback(async (phoneNumber, userType) => {
    setLoading(true);
    try {
      await client.post('/auth/send-otp', { phoneNumber, userType });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOTP = useCallback(async (phoneNumber, otp, userType) => {
    setLoading(true);
    try {
      const response = await client.post('/auth/verify-otp', {
        phoneNumber,
        otp,
        userType,
      });
      
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      setUser(response.data.user);
      setError(null);
      
      return response.data;
    } catch (err) {
      setError(err.response?.data?.error || 'OTP verification failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return { user, loading, error, sendOTP, verifyOTP, logout };
};
```

### 3. App Routing

**File: `frontend/apps/driver/App.jsx`**

```javascript
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/useAuth';
import LoginScreen from './pages/LoginScreen';
import Dashboard from './pages/Dashboard';
import JobsScreen from './pages/JobsScreen';
import ProfileScreen from './pages/ProfileScreen';

function App() {
  const { user } = useAuth();

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route 
          path="/dashboard" 
          element={user ? <Dashboard /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/jobs" 
          element={user ? <JobsScreen /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/profile" 
          element={user ? <ProfileScreen /> : <Navigate to="/login" />} 
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
```

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DECHTA AUTHENTICATION FLOW                    │
└─────────────────────────────────────────────────────────────────┘

1. User enters phone number and selects user_type (driver/worker/vendor/client)
   ↓
2. Backend generates 6-digit OTP and sends via SMS
   ↓
3. OTP stored in otp_verifications table with 5-minute expiry
   ↓
4. User enters OTP
   ↓
5. Backend verifies OTP:
   - Check OTP exists and not expired
   - Check not more than 3 attempts
   ↓
6. User lookup/creation:
   - If user exists → use existing user.id
   - If user doesn't exist → create new user with user_type
   ↓
7. Generate JWT token with user_id + user_type
   ↓
8. Mark OTP as verified in database
   ↓
9. Return token to frontend
   ↓
10. Frontend stores token in localStorage
    ↓
11. Token sent with every API request in Authorization header
    ↓
12. Backend middleware verifies JWT token
```

---

## Data Migration

### Migration Strategy

**Phase 1: Prepare**
- Backup existing databases
- Create new unified schema
- Set up staging environment

**Phase 2: Extract & Transform**
```sql
-- Migrate driver data
INSERT INTO users (phone_number, email, user_type, is_verified, is_approved)
SELECT mobile_number, NULL, 'driver', TRUE, is_approved FROM driver_profiles;

-- Migrate worker data
INSERT INTO users (phone_number, email, user_type, is_verified, is_approved)
SELECT phone, email, 'worker', TRUE, is_approved FROM worker_auth_users;

-- Migrate vendor data
INSERT INTO users (phone_number, email, user_type, is_verified, is_approved)
SELECT phone, email, 'vendor', TRUE, verification_status = 'verified' FROM users WHERE role = 'vendor';
```

**Phase 3: Validate**
- Count records: old vs new
- Verify referential integrity
- Check for missing data

**Phase 4: Switch**
- Update application connection strings
- Test all functionality
- Monitor for errors

---

## Deployment Checklist

- [ ] Database created and schema migrated
- [ ] Environment variables configured
- [ ] Backend API tested locally
- [ ] Frontend apps tested with API
- [ ] Authentication flow working
- [ ] JWT tokens valid
- [ ] Database backups configured
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Logging enabled
- [ ] Error handling tested
- [ ] Security headers added
- [ ] Database connections pooled
- [ ] CDN configured for assets
- [ ] Analytics integrated
- [ ] Monitoring alerts set up
- [ ] Load testing completed
- [ ] Backup restore tested
- [ ] Documentation updated
- [ ] Team trained
- [ ] Go-live date scheduled

---

## API Endpoint Reference

### Authentication
- `POST /auth/send-otp` - Send OTP to phone
- `POST /auth/verify-otp` - Verify OTP and get token
- `POST /auth/refresh-token` - Refresh JWT token
- `POST /auth/logout` - Logout user

### Jobs
- `GET /jobs` - List jobs for user
- `POST /jobs` - Create new job
- `GET /jobs/:id` - Get job details
- `PATCH /jobs/:id` - Update job
- `PATCH /jobs/:id/status` - Update job status
- `PATCH /jobs/:id/accept` - Accept job

### Wallet
- `GET /wallet/balance` - Get wallet balance
- `POST /wallet/add-funds` - Add funds
- `POST /wallet/withdraw` - Withdraw funds
- `GET /wallet/transactions` - Get transaction history

### Driver Routes
- `GET /drivers/profile` - Get driver profile
- `PATCH /drivers/profile` - Update profile
- `GET /drivers/earnings` - Get earnings
- `POST /drivers/documents` - Upload documents
- `GET /drivers/deliveries` - Get delivery history

### Worker Routes
- `GET /workers/profile` - Get worker profile
- `PATCH /workers/profile` - Update profile
- `GET /workers/skills` - Get skills
- `POST /workers/skills` - Add skill
- `GET /workers/jobs` - Get job history

### Vendor Routes
- `GET /vendors/profile` - Get vendor profile
- `POST /vendors/products` - Create product
- `GET /vendors/products` - Get vendor products
- `PATCH /vendors/products/:id` - Update product
- `GET /vendors/orders` - Get orders

### Admin Routes
- `GET /admin/users` - List all users
- `GET /admin/jobs` - List all jobs
- `PATCH /admin/users/:id/status` - Update user status
- `POST /admin/settings` - Update settings

---

## Support & Troubleshooting

For issues, check:
1. Database connectivity
2. JWT token validity
3. CORS configuration
4. Environment variables
5. API logs
6. Frontend console errors

---

**Last Updated:** 2024
**Version:** 1.0
