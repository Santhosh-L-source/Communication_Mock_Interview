# 🚀 SpeakReady - Quick Start Guide

## ✅ SYSTEM IS READY!

Your SpeakReady platform is **fully operational** and ready to use!

---

## 🌐 Access the Application

### **Frontend (Student/Admin Interface)**
```
http://localhost:5173
```

### **Backend API**
```
http://localhost:4001
Health Check: http://localhost:4001/health
```

---

## 👤 Create Your First Admin User

### **Option 1: Quick Signup (Recommended)**

1. Open http://localhost:5173
2. Click **"Sign Up"**
3. Fill in:
   ```
   Email: admin@speakready.com
   Password: Admin@2024
   Full Name: System Admin
   Register Number: ADMIN001
   Department: Administration
   Year of Study: 4
   ```
4. Click "Sign Up"
5. Go to **Supabase Dashboard** → SQL Editor
6. Run this query:
   ```sql
   UPDATE profiles 
   SET role = 'admin' 
   WHERE email = 'admin@speakready.com';
   ```
7. **Logout and Login again** - You now have admin access!

### **Option 2: See CREATE-ADMIN.md for alternative methods**

---

## 📚 What's Already Set Up

### ✅ Database (Supabase)
- **33 tables** created and ready
- **3 rubrics** loaded (Interview, Writing, Speaking)
- **71 questions** in question bank
- **7 assessments** configured
- **6 storage buckets** for files

### ✅ Backend Services
- Express.js API on port 4001
- Socket.IO for real-time interviews
- pg-boss background workers running
- AI providers configured:
  - ✅ Groq (Whisper STT + LLM)
  - ✅ Gemini (backup LLM)

### ✅ Frontend
- React + Vite dev server on port 5173
- Tailwind CSS styling
- React Router for navigation
- Socket.IO client ready

---

## 🎯 Quick Test Workflow

### **1. Create Admin & Student**

#### As Admin:
1. Login with your admin account
2. Go to **Admin → Users → Bulk Invite**
3. Upload CSV or create individual students:
   ```csv
   register_no,full_name,email,department,year_of_study
   CSE20A001,John Doe,john@test.com,CSE,3
   CSE20A002,Jane Smith,jane@test.com,CSE,3
   ```

### **2. Student Takes Baseline Assessment**

1. Logout from admin
2. Signup as student:
   ```
   Email: john@test.com
   Register Number: CSE20A001
   Name: John Doe
   Department: CSE
   Year: 3
   ```
3. After login, you'll be redirected to **Baseline Assessment**
4. Answer questions:
   - **MCQ questions**: Select answers
   - **Writing questions**: Type text
   - **Speaking questions**: Click record, speak, stop
5. Click **"Submit Assessment"**
6. Wait 30-60 seconds for **AI scoring**
7. View your **Readiness Profile** on dashboard

### **3. Assign AI Interview**

1. Login as admin
2. Go to **Admin → Interviews → Assign**
3. Select:
   - **Cohort** or specific students
   - **Interview Type**: HR / Technical / Situational
   - **Difficulty**: 1-5
   - **Duration**: 10 minutes
4. Click **"Assign"**
5. Students get notification

### **4. Student Takes AI Interview**

1. Login as student
2. Click on **"Interview Assigned"** notification
3. **Setup Phase**:
   - Allow camera & microphone
   - Face enrollment (MediaPipe captures reference)
   - Consent to recording & proctoring
   - System checks (fullscreen, browser)
4. Click **"Start Interview"**
5. **Interview Room**:
   - AI speaks questions (browser TTS)
   - Student answers (audio recorded)
   - Proctoring runs (face detection, gaze tracking)
   - 6 questions with potential follow-ups
6. **Interview Ends**:
   - Transcript saved
   - Report generated in 30-60 seconds
7. View **detailed score report** with 13 criteria

### **5. Admin Reviews Results**

1. Go to **Admin → All Scores**
2. See all student performance:
   - Baseline assessments
   - AI interviews
   - Practice exercises
3. Filter by department, cohort, date
4. Expand rows to see detailed breakdowns

### **6. Review Proctoring Events**

1. Go to **Admin → Integrity Review**
2. See flagged sessions (if any cheating detected)
3. Click session to view:
   - Timeline of events
   - Evidence photos
   - Transcript excerpts
4. Make decision: **Clear** or **Confirm Cheating**

---

## 🎨 Features to Test

### **Student Features**
- ✅ Baseline assessment (all question types)
- ✅ AI interview with real-time proctoring
- ✅ Practice exercises from AI coach
- ✅ Readiness profile & progress tracking
- ✅ Interview reports with detailed feedback

### **Admin Features**
- ✅ Bulk user creation (CSV upload)
- ✅ Cohort management
- ✅ Interview assignment
- ✅ Live interview monitoring
- ✅ Score viewing & export
- ✅ Integrity review
- ✅ Audit log
- ✅ System dashboard (AI usage, active sessions)

### **AI Features**
- ✅ Speech-to-text (Groq Whisper)
- ✅ AI scoring (Gemini/Groq)
- ✅ Intelligent follow-up questions
- ✅ Personalized feedback
- ✅ Coach agent (practice recommendations)
- ✅ Anti-cheat verification

---

## 🔧 Server Management

### **Check Status**
```bash
# API health
curl http://localhost:4001/health

# Frontend
curl http://localhost:5173
```

### **Restart Servers**

If servers stopped or you need to restart:

```bash
# Kill existing processes
taskkill /F /IM node.exe

# Start both servers
npm run dev

# OR separately:
npm run dev:api   # Terminal 1
npm run dev:web   # Terminal 2
```

### **View Logs**

API logs show:
- HTTP requests
- Socket.IO connections
- AI API calls
- Background job processing
- Database queries

---

## 📊 Database Access

### **Supabase Dashboard**
```
https://supabase.com/dashboard/project/jqdbewyhuozkyhsfgjjz
```

### **Quick SQL Queries**

```sql
-- See all students
SELECT register_no, full_name, department 
FROM profiles 
WHERE role = 'student';

-- Check recent interviews
SELECT s.register_no, s.interview_type, s.status, s.overall_score
FROM interview_sessions s
ORDER BY s.created_at DESC
LIMIT 10;

-- View readiness scores
SELECT p.register_no, p.full_name, 
       r.reading, r.writing, r.listening, r.speaking, r.interview, r.overall
FROM profiles p
JOIN readiness_snapshots r ON r.student_id = p.id
WHERE p.role = 'student'
ORDER BY r.created_at DESC;

-- Proctoring events summary
SELECT event_type, COUNT(*) as count, AVG(penalty) as avg_penalty
FROM proctoring_events
GROUP BY event_type
ORDER BY count DESC;
```

---

## 🐛 Troubleshooting

### **Issue: Servers not starting**
```bash
# Check if ports are busy
netstat -ano | findstr :4001
netstat -ano | findstr :5173

# Kill processes
taskkill /F /PID <process_id>
```

### **Issue: Database connection failed**
- Check `apps/api/.env` has correct `DATABASE_URL`
- Verify Supabase project is active
- Test connection: `npm run seed` (should work)

### **Issue: AI not working**
- Check `AI_MOCK=false` in `apps/api/.env`
- Verify API keys set:
  - `GROQ_API_KEY` (required for Whisper + LLM)
  - `GEMINI_API_KEY` (backup)
- Test: Take assessment with speaking question

### **Issue: Camera/Mic not detected**
- Use **Chrome or Edge** (MediaPipe requirement)
- Allow camera/mic permissions in browser
- Check browser console for errors

### **Issue: Proctoring not working**
- MediaPipe models loading? (Check Network tab)
- Face visible in camera?
- Sufficient lighting?

---

## 📈 Performance Notes

### **Expected Response Times**
- Page load: <1 second
- API calls: 50-200ms
- Speech transcription: 2-5 seconds
- AI scoring: 1-3 seconds per question
- Interview report: 30-60 seconds total

### **Concurrent Users**
- Local dev: 10-20 concurrent interviews
- Production (Render free): 30-50 concurrent
- Database: 500MB free tier sufficient for 200 students

---

## 🎯 Next Steps

1. ✅ **Test student journey**: Signup → Baseline → Interview
2. ✅ **Test admin panel**: Create users → Assign → Review
3. ✅ **Test proctoring**: Intentionally trigger events during interview
4. ✅ **Review scoring**: Check rubrics, adjust criteria weights if needed
5. ✅ **Customize content**: Add your own questions to database
6. ✅ **Deploy to production**: See README.md for deployment guide

---

## 📞 Support

- **Database Issues**: Check Supabase Dashboard logs
- **API Errors**: Check terminal running `npm run dev:api`
- **Frontend Errors**: Check browser console (F12)
- **Background Jobs**: Check `ai_usage` table for AI call logs

---

## 🎉 You're All Set!

**SpeakReady is running and ready for testing!**

Open http://localhost:5173 and start exploring! 🚀

---

**Pro Tip**: Keep both terminal windows open to see real-time logs:
- Terminal 1: API logs (HTTP, Socket.IO, Jobs)
- Terminal 2: Frontend build logs (Vite HMR)
