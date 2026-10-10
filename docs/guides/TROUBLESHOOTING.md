# 🔧 Troubleshooting 400 Error

## Quick Fix - Most Likely Issues

### **Issue 1: Frontend Needs Token but User Not Logged In**

The 400 error is likely happening because:
1. Frontend tries to call `/api/v1/me` to get user info
2. No JWT token exists (user not logged in yet)
3. API returns 400 Bad Request

**This is NORMAL on first visit!**

### **Solution: Just Login**

1. Go to http://localhost:5173
2. Click **"Login"** or **"Sign Up"**
3. Use test credentials OR create new account
4. The 400 error will disappear after login

---

## Test Credentials

### **Existing Test Student:**
```
Email: test1791262986396@speakready.com
Password: Test@123
```

### **OR Create New Account:**
1. Click "Sign Up"
2. Fill in details
3. Register Number format: `CSE20A001` (or any format)
4. Login after signup

---

## Verify Servers Are Running

### **Check API:**
```bash
curl http://localhost:4001/health
```
Expected: `{"ok":true}`

### **Check Frontend:**
Open http://localhost:5173 - should see login page

---

## Common Issues & Fixes

### **1. CORS Error (Cross-Origin)**

**Symptom**: Console shows "CORS policy blocked"

**Fix**: Check `apps/api/.env`:
```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Restart API if changed:
```bash
npm run dev:api
```

---

### **2. Supabase Connection Error**

**Symptom**: "Failed to fetch" or database errors

**Fix**: Verify Supabase credentials in `apps/web/.env`:
```bash
VITE_SUPABASE_URL=https://jqdbewyhuozkyhsfgjjz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

### **3. API Not Responding**

**Symptom**: "Network Error" or no response

**Fix**: Restart API server:
```bash
# Kill existing
taskkill /F /IM node.exe

# Restart
npm run dev:api
```

---

### **4. Frontend Build Error**

**Symptom**: Blank page or build errors

**Fix**: Restart frontend:
```bash
npm run dev:web
```

---

## Debug Steps

### **Step 1: Check Browser Console**

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for the exact error message
4. Check which URL is returning 400

### **Step 2: Check Network Tab**

1. Open DevTools → Network tab
2. Reload page
3. Find the red (failed) request
4. Click it → see Request/Response details
5. Note the URL and error message

### **Step 3: Check API Logs**

Look at the terminal running `npm run dev:api`:
- Should show incoming requests
- Will show any errors
- Check for authentication failures

---

## Expected Behavior

### **Before Login:**
```
✗ GET /api/v1/me → 401/400 (expected - no token)
```

### **After Login:**
```
✓ GET /api/v1/me → 200 OK (returns user profile)
✓ GET /api/v1/assessments → 200 OK
✓ GET /api/v1/readiness → 200 OK
```

---

## Quick Test Script

Save this as `test-connection.html` and open in browser:

```html
<!DOCTYPE html>
<html>
<head><title>SpeakReady Connection Test</title></head>
<body>
  <h1>SpeakReady Connection Test</h1>
  <button onclick="testAPI()">Test API</button>
  <button onclick="testFrontend()">Test Frontend</button>
  <pre id="output"></pre>
  
  <script>
    async function testAPI() {
      const output = document.getElementById('output');
      try {
        const res = await fetch('http://localhost:4001/health');
        const data = await res.json();
        output.textContent = 'API Test: ' + JSON.stringify(data, null, 2);
      } catch (e) {
        output.textContent = 'API Error: ' + e.message;
      }
    }
    
    async function testFrontend() {
      const output = document.getElementById('output');
      try {
        const res = await fetch('http://localhost:5173');
        output.textContent = 'Frontend: ' + (res.ok ? 'Running ✓' : 'Error');
      } catch (e) {
        output.textContent = 'Frontend Error: ' + e.message;
      }
    }
  </script>
</body>
</html>
```

---

## Still Having Issues?

### **Nuclear Option - Full Restart:**

```bash
# Kill all Node processes
taskkill /F /IM node.exe

# Clear npm cache (rarely needed)
npm cache clean --force

# Reinstall dependencies (rarely needed)
rm -rf node_modules package-lock.json
npm install

# Restart servers
npm run dev
```

---

## Contact Information

If you're still stuck:

1. **Check API Terminal**: Look for error messages
2. **Check Browser Console**: Copy the exact error
3. **Check Network Tab**: Note which endpoint fails
4. **Provide Details**: URL, error code, request headers

---

## Most Common Solution

**90% of 400 errors = Not logged in yet**

Just login with test credentials:
```
Email: test1791262986396@speakready.com
Password: Test@123
```

Or create a new account at http://localhost:5173/auth/signup

The 400 error should disappear! ✅
