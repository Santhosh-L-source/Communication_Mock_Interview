# SpeakReady - Quick Reference Card

**Print this or keep it handy for quick access!**

---

## 🚀 **Application Access**

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:4001 |
| **API Health** | http://localhost:4001/health |

---

## 🔐 **Login Credentials**

### Admin Account
```
Email:    admin@speakready.test
Password: test123 (or admin123, password, Admin@123)
Role:     Admin
```

**Can't login?** → Create new admin (see below)

---

## 📊 **Database**

### Supabase Dashboard
```
URL: https://supabase.com/dashboard/project/jqdbewyhuozkyhsfgjjz
Project ID: jqdbewyhuozkyhsfgjjz
```

### Connection Details
```
Host: aws-0-ap-southeast-2.pooler.supabase.com
Port: 5432
Database: postgres
User: postgres.jqdbewyhuozkyhsfgjjz
Password: Tamil123@#!@#
```

---

## ⚡ **Quick Commands**

### Start Application
```bash
npm run dev              # Start both frontend + backend
npm run dev:web          # Frontend only
npm run dev:api          # Backend only
```

### Create Admin User
```bash
cd apps/api
npm run create-admin -- email@test.com "Name" password123
```

### Database Operations
```bash
cd apps/api
npm run seed             # Seed sample data
```

---

## 🛠️ **Troubleshooting**

| Problem | Solution |
|---------|----------|
| Can't login | Try default passwords or create new admin |
| Port in use | Kill process: `taskkill /F /IM node.exe` |
| API not responding | Restart: `npm run dev:api` |
| Frontend not loading | Restart: `npm run dev:web` |
| Database error | Check Supabase connection |

---

## 📝 **Create New Admin (Easy Method)**

1. Go to: https://supabase.com/dashboard/project/jqdbewyhuozkyhsfgjjz
2. Click **Authentication** → **Users** → **Add user**
3. Email: `youremail@test.com` | Password: `yourpass123`
4. ✅ Auto Confirm Email: **YES**
5. Click **Table Editor** → **profiles**
6. Find your user → Change `role` to `admin` → Save
7. Login at http://localhost:5173

---

## 🔑 **Key File Locations**

| File | Purpose |
|------|---------|
| `PROJECT_CREDENTIALS.md` | Full credentials & instructions |
| `COMPLETE_ARCHITECTURE.md` | System architecture docs |
| `MASTER_ARCHITECTURE_DIAGRAM.md` | Visual architecture |
| `apps/api/.env` | Environment variables |
| `apps/web/src/` | Frontend source code |
| `apps/api/src/` | Backend source code |

---

## 🎯 **User Roles**

| Role | Access |
|------|--------|
| **student** | Dashboard, Practice, Interviews, History |
| **coordinator** | View students, Reports, Progress |
| **admin** | Full access: Users, Questions, Settings, Reports |

---

## 📞 **Support Resources**

- **Documentation:** See all `.md` files in project root
- **Supabase Docs:** https://supabase.com/docs
- **Claude API:** https://docs.anthropic.com/

---

## 🔒 **Security Reminders**

- ✅ Never commit `PROJECT_CREDENTIALS.md` to Git
- ✅ Change default passwords before production
- ✅ Keep Service Role Key private
- ✅ Use strong passwords (12+ chars)

---

**Last Updated:** 2026-10-06  
**Version:** 1.0  
**Status:** Development

---

## 📋 **Common Tasks Checklist**

- [ ] Login as admin
- [ ] Create test student account
- [ ] Start practice assessment
- [ ] Start interview with camera
- [ ] Check face detection working
- [ ] Record audio answer
- [ ] View AI evaluation results
- [ ] Check staff dashboard
- [ ] Review integrity alerts
- [ ] Manage question bank

---

**📌 Bookmark this page for quick reference!**
