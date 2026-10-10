# 🚀 SpeakReady Setup Guide

## Current Status
✅ **Task #1 Complete**: Dependencies installed  
⏳ **Task #2 In Progress**: Database migrations (requires manual action)

---

## 📋 Next Steps (Do These Now!)

### **Step 1: Run Database Migrations** ⚠️ REQUIRED

You have **8 migration files** that create 33 tables in your Supabase database.

#### **Option A: Supabase Dashboard** (Easiest)

1. Open https://supabase.com/dashboard
2. Select project: `jqdbewyhuozkyhsfgjjz`
3. Click **"SQL Editor"** in left sidebar
4. For each migration file (in order):
   ```
   supabase/migrations/0001_init.sql   ← Start here
   supabase/migrations/0002_app.sql
   supabase/migrations/0003_interview_config.sql
   supabase/migrations/0004_interview_assignments.sql
   supabase/migrations/0005_admission_year.sql
   supabase/migrations/0006_duration_min.sql
   supabase/migrations/0007_practice_flag.sql
   supabase/migrations/0008_assessment_proctoring.sql
   ```
   - Open the file in your editor
   - Copy all content (Ctrl+A, Ctrl+C)
   - Paste in Supabase SQL Editor
   - Click **"Run"** ▶️
   - Wait for "Success" message
   - Move to next file

#### **Option B: Supabase CLI** (Faster if you have CLI)

```bash
# Install CLI (if not installed)
npm install -g supabase

# Run the helper script
# Windows:
run-migrations.bat

# Mac/Linux:
./run-migrations.sh
```

#### **Verify Migrations Worked:**

In Supabase Dashboard → **Table Editor**, you should see 33 tables:
- ✓ profiles
- ✓ cohorts
- ✓ interview_sessions
- ✓ interview_turns
- ✓ proctoring_events
- ✓ rubrics
- ✓ rubric_criteria
- ✓ questions
- ✓ assessments
- ✓ And 24 more...

---

### **Step 2: Seed Database** (After migrations)

Once migrations are complete, run:

```bash
npm run seed
```

This will:
- ✓ Create interview rubric (13 criteria)
- ✓ Create writing rubric (8 criteria)
- ✓ Add 100+ sample questions
- ✓ Create baseline assessment

**Expected output:**
```
✓ Rubrics created: Interview, Writing
✓ Questions added: 120 total
✓ Baseline assessment created
```

---

### **Step 3: Create Admin User**

```bash
npm run create-admin -- admin@college.edu "Admin Name" "your-strong-password"
```

This creates an admin account you'll use to login.

**Example:**
```bash
npm run create-admin -- admin@test.com "John Admin" "Admin@123"
```

---

### **Step 4: Start Servers**

Open **2 terminal windows**:

#### Terminal 1 - Backend (API + Socket.IO):
```bash
npm run dev:api
```

Should see:
```
SpeakReady API on :4001 (AI live, storage supabase)
```

#### Terminal 2 - Frontend (React + Vite):
```bash
npm run dev:web
```

Should see:
```
  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

---

## 🧪 Testing the System

### **Test 1: Admin Login**
1. Open http://localhost:5173
2. Click "Login"
3. Use admin credentials from Step 3
4. Should see Admin Dashboard

### **Test 2: Create Student**
1. In Admin Panel → Users → Bulk Invite
2. Create CSV:
   ```csv
   register_no,full_name,email,department,year_of_study
   CSE20A001,John Doe,john@test.com,CSE,3
   CSE20A002,Jane Smith,jane@test.com,CSE,3
   ```
3. Upload → Students created

### **Test 3: Student Baseline**
1. Logout, go to Signup
2. Use student email: john@test.com
3. Register number: CSE20A001
4. After login, take baseline assessment
5. Answer questions (MCQ, text, audio recording)
6. Submit → Wait 30-60 sec for AI scoring
7. Should see readiness profile

### **Test 4: AI Interview**
1. Admin → Interviews → Assign
2. Select cohort, type: HR Mock
3. Student logs in → sees assigned interview
4. Click "Start Setup"
5. Allow camera/mic
6. Face enrollment
7. Start interview
8. AI asks questions (browser speaks)
9. Student answers (audio recorded)
10. Interview ends → Report generated

---

## 🔧 Troubleshooting

### **Issue: npm run seed fails**
- Make sure migrations ran successfully
- Check DATABASE_URL in apps/api/.env

### **Issue: AI Mock mode**
- Check apps/api/.env: `AI_MOCK=false`
- Check you have API keys:
  - GROQ_API_KEY (currently set)
  - GEMINI_API_KEY (optional backup)

### **Issue: Camera not working**
- Use Chrome or Edge (MediaPipe requires these)
- HTTPS required in production (works on localhost)

### **Issue: Socket.IO not connecting**
- Check API is running on :4001
- Check CORS_ORIGINS includes http://localhost:5173

---

## 📊 What Gets Created

### **Database (33 tables)**
```
People:      profiles, cohorts, staff_assignments
Content:     rubrics, rubric_criteria, questions, assessments
Tests:       attempts, responses, evaluations, criterion_scores
Interviews:  interview_sessions, interview_turns
Anti-cheat:  proctoring_events, integrity_reviews
Progress:    readiness_snapshots, practice_plans, plan_items
Coaching:    agent_runs, agent_steps, alerts
Operations:  audit_log, ai_usage, api_clients, webhooks
```

### **Storage Buckets (6 private)**
```
proctoring-evidence/   # Cheating screenshots
transcripts/           # Interview transcripts
recordings/            # Audio files
reference-faces/       # Enrolled student photos
assessment-files/      # Written test uploads
profile-photos/        # Student avatars
```

### **Sample Data (from seed)**
```
Rubrics:     2 (Interview, Writing)
Questions:   120+ (MCQ, writing, speaking, interview)
Assessments: 1 (Baseline - mix of all types)
```

---

## 🎯 Success Checklist

Before moving to next phase, verify:

- [ ] All 8 migrations ran without errors
- [ ] 33 tables visible in Supabase
- [ ] Seed script ran successfully
- [ ] Admin user created
- [ ] API running on :4001
- [ ] Frontend running on :5173
- [ ] Can login as admin
- [ ] Can create student accounts
- [ ] Student can take baseline assessment
- [ ] AI scoring works (check Groq API key)

---

## 📞 Need Help?

If stuck on migrations:
1. Check Supabase logs: Dashboard → Database → Logs
2. Common error: "type already exists" means migration already ran
3. To reset: Dashboard → Database → Drop all tables (careful!)

---

## ⚡ Quick Start Commands

```bash
# Full setup (after migrations)
npm run seed
npm run create-admin -- admin@test.com "Admin" "Pass123"
npm run dev  # Starts both API + Web

# Individual servers
npm run dev:api   # API only
npm run dev:web   # Frontend only

# Utilities
npm run typecheck  # Check TypeScript
npm test           # Run API tests
```

---

**Ready to proceed?** Complete the migration step above, then tell me "migrations done" and I'll continue with automated testing! 🚀
