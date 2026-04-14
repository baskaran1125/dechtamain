# 🔧 FRONTEND SERVER RESTART - REQUIRED FIX

**Problem:** Frontend still calling localhost:5173 instead of 5001  
**Root Cause:** Dev server hasn't restarted after code changes  
**Solution:** Clear cache and restart frontend

---

## ⚡ IMMEDIATE ACTION REQUIRED

### Step 1: Stop Frontend Dev Server
**In your frontend terminal, press:**
```
Ctrl+C
```

### Step 2: Clear Browser Cache
**In your browser:**
1. Open DevTools: `F12` or `Ctrl+Shift+I`
2. Right-click refresh button → Select "Empty cache and hard refresh"
3. OR: `Ctrl+Shift+Delete` to open Clear Browsing Data
4. Select "Cached images and files"
5. Click "Clear data"

### Step 3: Clear Frontend Build Cache
**In your frontend directory:**
```bash
cd C:\Users\LOKI\OneDrive\Desktop\D\Dechta\dechta-client\frontend

# Remove node modules cache
rmdir node_modules\.vite /s /q

# Or just remove dist folder
rmdir dist /s /q
```

### Step 4: Restart Frontend Dev Server
```bash
cd C:\Users\LOKI\OneDrive\Desktop\D\Dechta\dechta-client\frontend
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Press q to quit
```

### Step 5: Test in Browser
1. Open `http://localhost:5173`
2. Open DevTools: `F12`
3. Go to Network tab
4. Try vendor login
5. Watch requests - they should go to `http://localhost:5001`

---

## ✅ Verification

### Check Network Requests
In browser DevTools → Network tab, you should see:
- ✅ Request to `/api/vendors/auth/send-otp`
- ✅ Sent to: `http://localhost:5001` (shown as `localhost:5173/api/...` due to proxy)
- ✅ Response: 200 OK with `{ success: true }`

### Check Console
```javascript
// In browser console, test directly:
fetch('http://localhost:5001/api/vendors/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '9876543210' })
})
.then(r => r.json())
.then(d => console.log(d))
```

Expected response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "phone": "9876543210",
  "provider": "mock",
  "dev_otp": "1234"
}
```

---

## 🔍 Configuration Overview

### Frontend .env
```
VITE_API_URL=http://localhost:5001
VITE_GOOGLE_CLIENT_ID=...
```

### Vite Proxy (vite.config.js)
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5001',
      changeOrigin: true,
    }
  }
}
```

### API Client (apiClient.js)
```javascript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
```

**Flow:**
1. Frontend code calls: `fetch('http://localhost:5001/api/vendors/...')`
2. Vite proxy intercepts: `/api/*` → `http://localhost:5001`
3. Request reaches backend successfully

---

## 📋 Complete Setup Checklist

- [ ] Backend running on port 5001
  ```bash
  cd dechta-client/backend && npm run dev
  ```

- [ ] Frontend cache cleared (browser + disk)
  - Hard refresh in browser
  - Delete .vite folder
  - Delete dist folder

- [ ] Frontend dev server restarted
  ```bash
  cd dechta-client/frontend && npm run dev
  ```

- [ ] Verify in browser console
  ```javascript
  const BASE_URL = 'http://localhost:5001'; // Should be this
  ```

- [ ] Test API call in DevTools → Network tab
  - POST to `/api/vendors/auth/send-otp`
  - Should see 200 response

---

## 🚀 After Restart

### Test Vendor Auth Flow
1. Frontend opens `http://localhost:5173`
2. Click "Vendor Login"
3. Enter phone: `9876543210`
4. Click "Send OTP"
5. Should see: "OTP sent successfully"

### Check Network Tab
You should see requests like:
```
POST http://localhost:5173/api/vendors/auth/send-otp
  └─ Proxied to: http://localhost:5001/api/vendors/auth/send-otp
  └─ Status: 200
  └─ Response: { success: true, ... }
```

---

## 🆘 Still Having Issues?

### If still getting 500 error:

1. **Check backend is running:**
   ```bash
   curl http://localhost:5001/api/health
   ```
   Should return: `{ status: "ok" }`

2. **Check backend logs:**
   - Look for error messages in backend terminal
   - Should see incoming request from frontend

3. **Test backend directly:**
   ```bash
   curl -X POST http://localhost:5001/api/vendors/auth/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone": "9876543210"}'
   ```
   Should return: `{ success: true, ... }`

4. **Clear everything and restart:**
   ```bash
   # Kill both servers
   Ctrl+C in both terminals
   
   # Clear frontend cache
   cd frontend && rmdir node_modules\.vite /s /q && rmdir dist /s /q
   
   # Restart both
   # Terminal 1: cd backend && npm run dev
   # Terminal 2: cd frontend && npm run dev
   ```

---

## 📞 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Still getting 500 error | Hard refresh browser (Ctrl+Shift+R) |
| CORS error | Vite proxy should handle - restart dev server |
| Network shows 5173 in URL | Normal - proxy shows frontend URL, proxies to 5001 |
| Backend not responding | Check backend is running on 5001 |
| Old code still running | Clear .vite folder and hard refresh |

---

## ✨ Summary

**What to do NOW:**
1. Press `Ctrl+C` in frontend terminal
2. Hard refresh browser: `Ctrl+Shift+R`
3. Clear .vite cache: `rmdir node_modules\.vite /s /q`
4. Restart: `npm run dev` in frontend folder
5. Test in browser

**Expected result:** Vendor auth endpoints working! 🎉

---

**Status:** Ready for testing  
**Next Step:** Follow the 5 steps above
