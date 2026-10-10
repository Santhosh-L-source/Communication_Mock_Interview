# 🎙️ SpeakReady - AI Placement Communication & Mock Interview Platform

**SpeakReady** is an enterprise-grade, AI-powered placement communication readiness and mock interview platform designed for institutions and placement training programs.

Students take baseline communication assessments (Reading, Listening, Writing, Speaking), obtain a 4-dimensional readiness profile, follow a personalized practice plan curated by an AI coach agent, and participate in interactive AI-conducted mock interviews equipped with real-time browser-based anti-cheat / malpractice proctoring.

Trainers and administrators review scores, override marks with audited rationale, manage question banks, inspect proctoring evidence queues, and expose student metrics to external placement portals via authenticated API access.

---

## 🏗️ Architecture & Monorepo Structure

```
├── apps/
│   ├── api/                  # Express.js + TypeScript + Socket.IO API server (port 4001)
│   │   ├── src/ai/           # LLM orchestration (Gemini, Groq, Ollama), Whisper STT, vision
│   │   ├── src/coach/        # AI Coach autonomous practice recommendation agent
│   │   ├── src/interview/    # Live interview gateway, turn manager, proctoring evaluator
│   │   ├── src/jobs/         # pg-boss background asynchronous task queue & workers
│   │   ├── src/modules/      # Admin, assessments, cohorts, evaluations, integrity, students
│   │   ├── src/scoring/      # Multi-dimensional rubric scoring, speech metrics, integrity
│   │   └── src/seed/         # Idempotent database seeder & account generation scripts
│   └── web/                  # React 18 + Vite + Tailwind CSS SPA (port 5173)
│       ├── src/components/   # Reusable UI components, layout, router progress, scorebars
│       ├── src/features/     # Audio recording pipeline & MediaPipe vision proctoring engine
│       ├── src/lib/          # API client, Supabase Auth context, route preloader, PWA SW
│       └── src/pages/        # Student, Staff, Admin, and Authentication portals
├── packages/
│   └── shared/               # Shared TypeScript types, Zod schemas, rubrics, criteria definitions
├── docs/                     # Detailed architectural, optimization, testing, and integration docs
│   ├── architecture/         # Complete architecture diagrams and data models
│   ├── guides/               # Quick start, presentation content, setup guides, troubleshooting
│   ├── integration/          # External REST API client & OpenAPI specification
│   ├── optimizations/        # Caching, MediaPipe performance, PWA service worker, audio fixes
│   └── testing/              # Automated test suites and manual validation guides
├── scripts/                  # Management scripts (quick admin creation, migrations, startup)
└── supabase/                 # PostgreSQL schema migrations (33 tables, RLS, triggers, views)
```

---

## 🌟 Key Features

### 1. 🤖 Multi-LLM AI Interviewer & Voice Pipeline
- **Adaptive Questioning**: Plans dynamic interview roadmaps tailored to the role (HR, Technical, Self-Intro, Project, Situational, JAM).
- **Speech-to-Text & Real-Time Audio**: Powered by Groq Whisper STT with browser speech synthesis (Web Speech API).
- **Multi-Parameter Rubric Scoring**: Scores candidates across 13 distinct communication criteria out of 100 points (Grammar, Vocabulary, Pronunciation, Fluency, Fillers, Relevance, Structure, Situation Handling, Technical Depth, Examples, Confidence, Eye Contact, Professional Etiquette).
- **Fallback Resilience**: Graceful multi-tier fallback: Google Gemini $\rightarrow$ Groq LLaMA $\rightarrow$ Local Ollama $\rightarrow$ Deterministic Built-in Heuristics (`AI_MOCK=true`).

### 2. 🛡️ In-Browser Anti-Cheat & Proctoring Engine (MediaPipe)
- **Computer Vision Analysis**: Real-time on-device face detection, gaze tracking, multiple face detection, and device presence detection via MediaPipe Tasks Vision WebAssembly.
- **System Event Monitoring**: Detection of tab switching, window blurring, fullscreen exits, virtual cameras, and clipboard manipulation.
- **Evidence Auditing**: Captures snapshots during violations and streams them securely to Supabase Storage.
- **Independent Scoring**: Malpractice severity index is tracked separately from communication competency scores.

### 3. 🎯 Autonomous AI Coach Agent
- Dynamically analyzes student performance after each assessment or mock interview.
- Generates tailored daily/weekly practice tasks to target specific weak criteria.
- Automatically escalates persistent difficulties to assigned faculty trainers.

### 4. 📊 Comprehensive Admin & Trainer Portal
- **Master Student Directory**: Search and filter by department, year of study, section, and roll number.
- **Batch Assessment & Interview Scheduling**: Schedule deadlines, assign interview blueprints to entire cohorts, and manage single-attempt limits.
- **Score Override & Audit Logs**: Allows faculty to adjust scores with mandatory justification, recorded in tamper-evident audit logs.
- **Export Capabilities**: Clean CSV and spreadsheet report exports without formula injection risks.

### 5. 🔌 External Placement Portal Integration
- Authenticated `GET /api/v1/external/students/{register_no}` endpoint secured with revocable API keys.
- Complete [OpenAPI Specification](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/integration/openapi.yaml) and standalone [JavaScript SDK Client](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/integration/speakready-client.js).

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.x or higher
- **Package Manager**: npm v10+
- **Browser**: Google Chrome or Microsoft Edge (WebRTC & WebAudio support)
- **Database**: PostgreSQL 15+ (Local instance or Supabase project)

---

### Step 1: Database Setup (Supabase)

1. Create a project on [Supabase](https://supabase.com).
2. Navigate to the SQL Editor and execute the 8 migration files in order from `supabase/migrations/`:
   - `0001_init.sql` (Base tables, auth hooks, storage buckets, RLS)
   - `0002_app.sql` (Assessments, cohorts, submissions, rubric criteria)
   - `0003_interview_config.sql` (AI interview configuration & question types)
   - `0004_interview_assignments.sql` (Campus drive & interview assignments)
   - `0005_admission_year.sql` (Student year and admission batch tagging)
   - `0006_duration_min.sql` (Configurable interview duration in minutes)
   - `0007_practice_flag.sql` (Self-practice vs assigned assessment flags)
   - `0008_assessment_proctoring.sql` (Assessment-level proctoring rules)

*(Alternatively, run `scripts/run-migrations.bat` / `scripts/run-migrations.sh` with your connection string).*

---

### Step 2: Environment Configuration

Copy the example environment files:

```bash
# Backend API configuration
cp apps/api/.env.example apps/api/.env

# Frontend Web configuration
cp apps/web/.env.example apps/web/.env
```

Configure your credentials in `apps/api/.env`:
```env
PORT=4001
CORS_ORIGINS=http://localhost:5173
PUBLIC_API_URL=http://localhost:4001
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
SUPABASE_URL=https://[PROJECT_ID].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_SECRET]

# Free AI Keys (Set AI_MOCK=true for offline local testing)
AI_MOCK=false
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

Configure `apps/web/.env`:
```env
VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:4001
```

---

### Step 3: Install Dependencies & Seed Database

```bash
# 1. Install monorepo dependencies
npm install

# 2. Seed initial rubrics, question bank, and baseline assessments
npm run seed

# 3. Create initial Administrator account
npm run create-admin -- admin@college.edu "System Admin" "SecurePassword123!"
```

---

### Step 4: Run Development Servers

```bash
# Start both API (:4001) and Web (:5173) in parallel
npm run dev
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:4001](http://localhost:4001)
- **Health Check**: [http://localhost:4001/api/v1/health](http://localhost:4001/api/v1/health)

---

## 🧪 Verification & Testing

### TypeScript Type Checking
```bash
npm run typecheck
```
*Validates `@speakready/api`, `@speakready/web`, and `@speakready/shared` without emitting files.*

### Production Build
```bash
npm run build
```
*Compiles the Vite React application with Terser minification, Brotli/Gzip pre-compression, and vendor chunking.*

### Unit & Rubric Scoring Tests
```bash
npm test
```
*Runs the Vitest suite across rubric scoring calculations, filler word counting, fluency formulas, and proctoring rule sets.*

---

## 📚 Documentation Index

| Topic | Document Link |
|---|---|
| **Complete System Architecture** | [COMPLETE_ARCHITECTURE.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/architecture/COMPLETE_ARCHITECTURE.md) |
| **Architecture Diagram & Data Flows** | [MASTER_ARCHITECTURE_DIAGRAM.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/architecture/MASTER_ARCHITECTURE_DIAGRAM.md) |
| **Mermaid Visualizations** | [MERMAID_DIAGRAMS.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/architecture/MERMAID_DIAGRAMS.md) |
| **Quick Start Guide** | [QUICK-START.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/guides/QUICK-START.md) |
| **Platform Setup Guide** | [SETUP-GUIDE.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/guides/SETUP-GUIDE.md) |
| **External API Integration** | [docs/integration/README.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/integration/README.md) |
| **Performance Optimizations** | [PERFORMANCE_OPTIMIZATIONS.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/optimizations/PERFORMANCE_OPTIMIZATIONS.md) |
| **MediaPipe & Proctoring Fixes** | [CAMERA-MIC-ENFORCEMENT.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/optimizations/CAMERA-MIC-ENFORCEMENT.md) |
| **Troubleshooting Guide** | [TROUBLESHOOTING.md](file:///c:/Users/victus/OneDrive/Attachments/OneDrive/Desktop/speakready/docs/guides/TROUBLESHOOTING.md) |

---

## 🔒 Security & Privacy Notice
- **API Keys & Credentials**: Never commit `.env` files. Ensure secrets are managed using environment variables or cloud secret managers in production.
- **Biometric Evidence**: Proctoring image snapshots are stored in private, restricted-access Supabase storage buckets protected by Row Level Security (RLS).
- **Role-Based Access**: Role validation (`student`, `trainer`, `coordinator`, `admin`) is enforced at both the JWT middleware layer and database RLS policies.
