# Admin Auth Fix - Restart Guide

## Changes Made

### 1. Backend Auth Robustness  
**File:** `dechta- admin/backend/services/authService.ts` (and `.js`)
- Now supports both `role` and `user_type` columns for admin detection
- Accepts `password` or `password_hash` fields
- Safely creates/updates fallback admin by detecting actual table schema
- Prevents 500 errors from schema mismatches during login

### 2. Port Configuration  
**Backend:** Changed from 5002 → **5003**
- File: `dechta- admin/backend/.env` → `PORT=5003`

**Frontend Proxy:** Updated to point to 5003
- File: `dechta- admin/frontend/vite.config.ts`
- Updated defaults from 5002 → 5003
- File: `dechta- admin/frontend/.env` (newly created)

## Critical: Restart Required

Both the backend and frontend must be restarted for changes to take effect.

### Step 1: Kill Old Processes
```bash
# Find and kill any existing Node processes on ports 5002, 5003, 5174
# On Windows (PowerShell as Admin):
netstat -ano | findstr :5002
taskkill /PID <PID> /F

netstat -ano | findstr :5003
taskkill /PID <PID> /F

netstat -ano | findstr :5174
taskkill /PID <PID> /F
```

### Step 2: Start Backend (Port 5003)
```bash
cd "dechta- admin/backend"
npm run dev
# OR if using node directly:
node --env-file=.env index.ts
```

### Step 3: Start Frontend (Port 5174, proxies to 5003)
```bash
cd "dechta- admin/frontend"
npm run dev
```

### Step 4: Test Login
1. Open browser: `http://localhost:5174`
2. Default credentials:
   - Email: `admin@example.com`
   - Password: `password123`
3. Expected results:
   - ✅ `/api/auth/me` returns 401 (not logged in) — NOT 500
   - ✅ `/api/auth/login` accepts credentials — NOT 500
   - ✅ Login succeeds and redirects to dashboard

## Troubleshooting

### Still Getting 500 on /api/auth/me
- Confirm backend is running on port **5003**: `curl http://localhost:5003/api/auth/me`
- Confirm session middleware is active in backend
- Check backend logs for errors

### Still Getting 500 on /api/auth/login
- Confirm frontend proxy points to 5003
- Clear browser cache and localStorage (Ctrl+Shift+Delete)
- Check Network tab in DevTools — confirm request goes to `http://localhost:5174/api/auth/login` (frontend proxies it to 5003)

### Port Still in Use
```bash
# Kill all Node processes and try again
taskkill /F /IM node.exe
```

## Expected Behavior After Restart

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Not logged in, visit app | 500 on `/api/auth/me` | 401 "Not logged in" (correct) |
| Try invalid login | 500 on `/api/auth/login` | 401 "Invalid email or password" (correct) |
| Login with correct creds | 500 or fails | ✅ Login succeeds |
| Session persists | N/A | ✅ Yes, via session cookie |

## Files Changed

1. `dechta- admin/backend/services/authService.ts` — Schema-agnostic auth
2. `dechta- admin/backend/services/authService.js` — Same (compiled version)
3. `dechta- admin/backend/.env` — PORT: 5002 → 5003
4. `dechta- admin/frontend/vite.config.ts` — Proxy defaults 5002 → 5003
5. `dechta- admin/frontend/.env` — NEW, explicit proxy config

## Key Points

- **Admin backend** now runs on **5003** (not 5002)
- **Admin frontend** still on **5174** but proxies to **5003**
- This prevents port collision with other services (like DechtaService driver app on 5000)
- Auth now gracefully handles schema variations (won't crash on missing columns)
