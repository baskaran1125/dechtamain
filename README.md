# 🚀 Dechta Platform - Unified Integration

A comprehensive multi-app platform integrating Driver App, Worker App, Vendor Dashboard, and Admin Panel with a unified PostgreSQL database and Node.js backend API.

## 📊 Project Overview

| Component | Status | Purpose |
|-----------|--------|---------|
| **Database** | 📋 Ready | Single PostgreSQL schema (26+ tables, fully normalized) |
| **Backend API** | 🔧 Setup Guide | Express.js with JWT auth, OTP verification, multi-role support |
| **Driver App** | 📱 React/Mobile | Real-time delivery tracking, job management, earnings |
| **Worker App** | 📱 React/Mobile | Task-based jobs, skill management, wallet system |
| **Vendor Dashboard** | 💼 Web | Product management, inventory, order tracking |
| **Admin Dashboard** | 🛠️ Web | User management, analytics, system control |

## 🗄️ Database Architecture

### Schema Files
- **`UNIFIED_SCHEMA.sql`** - Complete schema with all tables, indexes, functions, triggers (35KB)
- **`IMPLEMENTATION_GUIDE.md`** - Step-by-step setup and integration guide

### Key Tables (26+)

**Core**
- `users` - All user types with polymorphic design
- `otp_verifications` - OTP-based authentication
- `oauth_credentials` - Google/Apple/Facebook OAuth

**Profiles**
- `driver_profiles` - Driver-specific data
- `worker_profiles` - Worker-specific data
- `vendor_profiles` - Vendor/business data
- `client_profiles` - Customer data
- `admin_profiles` - Admin users

**Documents & KYC**
- `user_documents` - Unified KYC documents
- `bank_accounts` - Payment account details

**Operations**
- `jobs` - Unified job management
- `deliveries` - Delivery tracking
- `products` - Vendor products
- `orders` - Customer orders
- `worker_skills` - Worker expertise
- `vehicles` - Driver vehicle info

**Financial**
- `wallets` - Account balances
- `transactions` - Transaction history
- `ratings` - User ratings & reviews

**Support**
- `support_tickets` - Support system
- `conversations` - Messaging system
- `messages` - Chat history
- `notifications` - System notifications

**Configuration**
- `vehicle_pricing` - Delivery rates
- `service_pricing` - Service rates
- `banners` - Marketing content
- `app_settings` - System settings
- `location_updates` - Real-time location tracking

## 🚀 Quick Start

### 1. Database Setup

```bash
# Install PostgreSQL if not already installed
# Then connect to PostgreSQL:

psql -U postgres -c "CREATE DATABASE dechta_production;"
psql -U postgres -d dechta_production -f UNIFIED_SCHEMA.sql

# Verify in PgAdmin or psql
psql -U postgres -d dechta_production -c "\dt"  # List tables
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Configure your database credentials
# DATABASE_URL=postgresql://user:password@localhost:5432/dechta_production

# Start server
npm start
# Server running on http://localhost:5000
```

### 3. Frontend Apps

```bash
# Build all frontend apps
npm install
npm start

# Available at:
# - Driver: http://localhost:3001
# - Worker: http://localhost:3002
# - Vendor: http://localhost:3003
# - Client: http://localhost:3004
# - Admin: http://localhost:3005
```

## 🔐 Authentication Flow

```
User → Send OTP (SMS) → Verify OTP → Create/Fetch User → JWT Token → API Access
```

### OTP Endpoints

```javascript
// Send OTP
POST /api/v1/auth/send-otp
{
  "phoneNumber": "+919876543210",
  "userType": "driver"  // driver | worker | vendor | client
}

// Verify OTP & Login
POST /api/v1/auth/verify-otp
{
  "phoneNumber": "+919876543210",
  "otp": "123456",
  "userType": "driver"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "phoneNumber": "+919876543210",
    "userType": "driver"
  },
  "expiresIn": "7d"
}
```

## 📡 API Structure

### Endpoints by Module

**Authentication**
```
POST   /api/v1/auth/send-otp              Send OTP
POST   /api/v1/auth/verify-otp            Verify OTP & Login
POST   /api/v1/auth/refresh-token         Refresh JWT
POST   /api/v1/auth/logout                Logout
```

**Jobs**
```
GET    /api/v1/jobs                       List jobs
POST   /api/v1/jobs                       Create job
GET    /api/v1/jobs/:id                   Get job details
PATCH  /api/v1/jobs/:id                   Update job
PATCH  /api/v1/jobs/:id/status            Update status
PATCH  /api/v1/jobs/:id/accept            Accept job
```

**Drivers**
```
GET    /api/v1/drivers/profile            Get profile
PATCH  /api/v1/drivers/profile            Update profile
GET    /api/v1/drivers/earnings           Get earnings
POST   /api/v1/drivers/documents          Upload docs
GET    /api/v1/drivers/deliveries         Get deliveries
```

**Workers**
```
GET    /api/v1/workers/profile            Get profile
PATCH  /api/v1/workers/profile            Update profile
GET    /api/v1/workers/skills             Get skills
POST   /api/v1/workers/skills             Add skill
GET    /api/v1/workers/jobs               Get jobs
```

**Wallet & Payments**
```
GET    /api/v1/wallet/balance             Get balance
POST   /api/v1/wallet/add-funds           Add funds
POST   /api/v1/wallet/withdraw            Withdraw
GET    /api/v1/wallet/transactions        Get history
```

**Products & Orders**
```
GET    /api/v1/products                   List products
POST   /api/v1/products                   Create product
GET    /api/v1/orders                     Get orders
POST   /api/v1/orders                     Create order
```

**Admin**
```
GET    /api/v1/admin/users                List users
GET    /api/v1/admin/jobs                 List all jobs
PATCH  /api/v1/admin/users/:id/status     Update user status
GET    /api/v1/admin/analytics            Get analytics
```

## 📋 User Types & Roles

### User Types (Enum)
1. **driver** - Delivery/logistics personnel
2. **worker** - Task-based service providers
3. **vendor** - Product sellers/suppliers
4. **client** - End customers/buyers
5. **admin** - Platform administrators

### Admin Roles
- **admin** - Full system access
- **supervisor** - Monitor operations
- **dispatcher** - Assign jobs
- **support** - Handle customer issues

## 🔄 Data Model Relationships

```
users (1) ──→ driver_profiles (1:1)
users (1) ──→ worker_profiles (1:1)
users (1) ──→ vendor_profiles (1:1)
users (1) ──→ client_profiles (1:1)
users (1) ──→ admin_profiles (1:1)

users (1) ──→ wallets (1:1)
users (1) ──→ bank_accounts (1:1)
users (1) ──→ addresses (1:N)
users (1) ──→ user_documents (1:N)
users (1) ──→ transactions (1:N)

vendors (1) ──→ products (1:N)
vendors (1) ──→ vendor_inventory (1:N)
products (1) ──→ orders (1:N)

jobs (1) ──→ deliveries (1:N)
jobs (1) ──→ ratings (1:N)
```

## 🛠️ Technology Stack

**Backend**
- Node.js 18+
- Express.js
- PostgreSQL 13+
- JWT Authentication
- Bcrypt (Password hashing)

**Frontend**
- React 18+
- React Router v6
- Axios
- Tailwind CSS / Material-UI
- Mapbox/Google Maps

**DevOps**
- Docker & Docker Compose
- GitHub Actions (CI/CD)
- AWS/Digital Ocean (Hosting)
- Nginx (Reverse proxy)

## 📁 Project Structure

```
dechta-unified/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── config/          # Database, JWT, OAuth
│   │   ├── middleware/      # Auth, error handling
│   │   ├── models/          # ORM models
│   │   ├── routes/          # API endpoints
│   │   ├── controllers/     # Business logic
│   │   ├── services/        # Services (auth, wallet, jobs)
│   │   └── utils/           # Helpers, validators
│   └── package.json
├── frontend/                # React apps
│   ├── apps/
│   │   ├── driver/          # Driver app
│   │   ├── worker/          # Worker app
│   │   ├── vendor/          # Vendor dashboard
│   │   ├── client/          # Client app
│   │   └── admin/           # Admin dashboard
│   └── shared/              # Shared components, hooks
├── docs/                    # Documentation
├── UNIFIED_SCHEMA.sql       # Database schema
├── IMPLEMENTATION_GUIDE.md  # Setup guide
└── README.md                # This file
```

## ✅ Implementation Checklist

- [ ] Database schema created and tested
- [ ] Backend API setup with authentication
- [ ] Driver app implementation
- [ ] Worker app implementation
- [ ] Vendor dashboard implementation
- [ ] Admin dashboard implementation
- [ ] Integration testing across all apps
- [ ] Load testing (target: 1000 concurrent users)
- [ ] Security audit and penetration testing
- [ ] Performance optimization
- [ ] Documentation completed
- [ ] Staging deployment
- [ ] Production deployment

## 🔐 Security Considerations

1. **Authentication**
   - OTP verification (5-minute expiry)
   - JWT tokens with 7-day expiry
   - Refresh token mechanism
   - Password hashing with bcrypt

2. **Authorization**
   - Role-based access control (RBAC)
   - User type restrictions
   - Admin access levels (1-5)

3. **Data Protection**
   - HTTPS/TLS encryption
   - Database connection pooling
   - SQL injection prevention (parameterized queries)
   - CORS properly configured

4. **Payment Security**
   - PCI compliance for payment processing
   - Secure wallet transactions
   - Transaction audit trail
   - Encrypted bank account storage

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## 📈 Performance Metrics

**Target SLAs**
- API Response Time: < 200ms (p95)
- Database Query Time: < 100ms (p95)
- Uptime: 99.5%
- Concurrent Users: 10,000+

**Database Optimization**
- Connection pooling: 20 connections
- Query timeout: 30 seconds
- Index on all foreign keys
- Partial indexes for active records

## 🤝 Contributing

1. Create a feature branch
2. Implement changes with tests
3. Submit pull request
4. Code review by team
5. Merge to main

## 📞 Support

For issues or questions:
1. Check IMPLEMENTATION_GUIDE.md
2. Review API documentation
3. Check database logs
4. Contact development team

## 📄 License

Proprietary - Dechta Platform

## 📝 Version History

**v1.0** (2024)
- Initial unified schema
- Multi-app integration
- Complete API endpoints
- Admin dashboard
- Production-ready

---

**Last Updated:** April 2024
**Maintained by:** Dechta Development Team

## Next Steps

1. ✅ **Database**: Run `UNIFIED_SCHEMA.sql` in PostgreSQL
2. 🔧 **Backend**: Setup Express server following `IMPLEMENTATION_GUIDE.md`
3. 🎨 **Frontend**: Build UI components for each app
4. 🧪 **Testing**: Run comprehensive test suite
5. 🚀 **Deployment**: Deploy to staging environment first

**Ready to integrate?** Follow the `IMPLEMENTATION_GUIDE.md` for detailed step-by-step instructions!
