# SpeakReady - Complete System Architecture

**Version:** 1.0  
**Last Updated:** 2026-10-06  
**Tech Stack:** React + Vite | Express + Node.js | PostgreSQL (Supabase) | Claude AI

---

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [System Architecture Diagram](#system-architecture-diagram)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Architecture](#database-architecture)
6. [Real-time Communication Flow](#real-time-communication-flow)
7. [AI Integration Architecture](#ai-integration-architecture)
8. [Authentication & Authorization](#authentication--authorization)
9. [Complete Data Flow - Interview Journey](#complete-data-flow---interview-journey)
10. [Storage Architecture](#storage-architecture)
11. [Directory Structure](#directory-structure)
12. [API Endpoints Reference](#api-endpoints-reference)
13. [Security Architecture](#security-architecture)
14. [Performance & Scalability](#performance--scalability)

---

## 1. High-Level Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ React 18 + Vite 6 (Progressive Web App)                    │    │
│  │ • Service Worker (Offline Support)                         │    │
│  │ • MediaPipe (Face Detection)                               │    │
│  │ • Socket.io Client (Real-time)                             │    │
│  │ • React Router (Navigation)                                │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                              │
│  ┌──────────────────────┐    ┌─────────────────────────────────┐  │
│  │   REST API Server    │    │   WebSocket Server              │  │
│  │   Express.js         │    │   Socket.io                     │  │
│  │   • Auth Middleware  │    │   • Interview Gateway           │  │
│  │   • CORS Enabled     │    │   • Real-time Proctoring        │  │
│  │   • Rate Limiting    │    │   • Live Question Delivery      │  │
│  └──────────────────────┘    └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │             Supabase (Backend-as-a-Service)                 │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────┐  ┌────────┐ │  │
│  │  │ PostgreSQL  │  │   Auth   │  │  Storage   │  │Realtime│ │  │
│  │  │   Database  │  │   (JWT)  │  │  (S3-like) │  │ (WS)   │ │  │
│  │  └─────────────┘  └──────────┘  └────────────┘  └────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      AI SERVICES LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Claude API (Anthropic)                    │  │
│  │  • Interview Evaluation (Sonnet 4.5)                        │  │
│  │  • Feedback Generation                                      │  │
│  │  • Question Variations                                      │  │
│  │  • Coaching Agent                                           │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture Diagram

### Full Request Flow

```
┌──────────────┐
│   Browser    │
│ (React App)  │
└──────┬───────┘
       │
       ├─────────────────────────────────────────────────────────┐
       │                                                          │
       ▼ HTTP/REST                                    ▼ WebSocket (Socket.io)
┌──────────────────┐                            ┌────────────────────┐
│  Express Server  │                            │  Interview Gateway │
│  (Port 4001)     │                            │  (Port 4001)       │
│                  │                            │                    │
│  Routes:         │                            │  Events:           │
│  • /api/v1/me    │                            │  • interview:start │
│  • /api/v1/      │                            │  • student:answer  │
│    assessments   │                            │  • ai:question     │
│  • /api/v1/      │                            │  • proctor:*       │
│    interviews    │                            │                    │
│  • /api/v1/admin │                            └────────┬───────────┘
└────────┬─────────┘                                     │
         │                                               │
         ├───────────────┬───────────────┬──────────────┤
         ▼               ▼               ▼              ▼
┌────────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
│   Supabase     │ │ Storage  │ │   AI Module  │ │  Job Queue   │
│   (PostgreSQL) │ │ (S3-like)│ │  (Claude)    │ │ (BullMQ)     │
└────────────────┘ └──────────┘ └──────────────┘ └──────────────┘
```

---

## 3. Frontend Architecture

### React Application Structure

```
apps/web/
├── public/
│   ├── service-worker.js         # Offline caching & PWA
│   ├── manifest.json              # PWA manifest
│   └── mediapipe/                 # Face detection models (35MB)
│
├── src/
│   ├── main.tsx                   # App entry point
│   ├── App.tsx                    # Root router & auth provider
│   │
│   ├── components/                # Shared UI components
│   │   ├── Layout.tsx            # Nav + header + footer
│   │   ├── ui.tsx                # Button, Card, Modal, etc.
│   │   ├── Scores.tsx            # Score display components
│   │   └── RouterProgress.tsx    # Loading bar
│   │
│   ├── pages/                     # Route components (lazy loaded)
│   │   ├── auth/
│   │   │   └── AuthPages.tsx     # Login, Reset Password
│   │   ├── student/
│   │   │   ├── Dashboard.tsx     # Student home
│   │   │   ├── Practice.tsx      # Practice assessments
│   │   │   ├── History.tsx       # Past attempts
│   │   │   ├── InterviewSetup.tsx # Pre-interview checks
│   │   │   ├── InterviewRoom.tsx  # Live interview (WebSocket)
│   │   │   └── InterviewReport.tsx # Post-interview results
│   │   ├── staff/
│   │   │   ├── Staff.tsx         # Coordinator dashboard
│   │   │   ├── Integrity.tsx     # Integrity review queue
│   │   │   ├── Questions.tsx     # Question bank management
│   │   │   └── Reports.tsx       # Readiness reports
│   │   └── admin/
│   │       └── Admin.tsx         # Admin users, setup, audit logs
│   │
│   ├── features/                  # Feature-specific logic
│   │   └── interview/
│   │       └── SpokenAnswer.tsx  # Audio recording component
│   │
│   ├── lib/                       # Core utilities
│   │   ├── api.ts                # REST API client (fetch wrapper)
│   │   ├── auth.tsx              # AuthContext & useAuth hook
│   │   ├── supabase.ts           # Supabase client setup
│   │   ├── socket.ts             # Socket.io client setup
│   │   ├── route-preload.ts      # Route preloading logic
│   │   ├── format.ts             # Date/time formatters
│   │   └── service-worker-registration.ts
│   │
│   ├── index.css                  # Tailwind imports
│   └── vite-env.d.ts             # TypeScript definitions
│
└── vite.config.ts                 # Vite build config (optimized)
```

### Frontend State Management

```
┌───────────────────────────────────────────────────────────┐
│                  React Context Providers                  │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  AuthProvider (lib/auth.tsx)                             │
│  ├─ User session (JWT token)                             │
│  ├─ Profile data (role, name, register_no)               │
│  ├─ signOut(), refresh()                                 │
│  └─ Loading states                                       │
│                                                           │
│  Local Component State (useState)                        │
│  ├─ Form inputs                                          │
│  ├─ Modal visibility                                     │
│  ├─ Loading spinners                                     │
│  └─ Error messages                                       │
│                                                           │
│  Real-time State (Socket.io events)                      │
│  ├─ Interview questions (ai:question)                    │
│  ├─ Timer updates (interview:timer)                      │
│  ├─ Proctor snapshots (proctor:request_snapshot)         │
│  └─ Live alerts (Supabase Realtime)                      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Frontend Data Flow

```
Component Mount
     ↓
useEffect() → api('/endpoint') → REST API
     ↓                               ↓
Display Data ← JSON Response ← Supabase Query
     ↓
User Interaction (click, type, etc.)
     ↓
Event Handler → api('/endpoint', {method: 'POST', body})
     ↓                               ↓
Update UI ← Success Response ← Database Write
     ↓
Re-fetch or Optimistic Update
```

### Key Frontend Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 18.3.1 |
| **Vite** | Build tool & dev server | 6.4.3 |
| **TypeScript** | Type safety | 7.0.2 |
| **Tailwind CSS** | Styling | 4.3.3 |
| **React Router** | Client-side routing | 7.18.4 |
| **Socket.io Client** | WebSocket communication | 4.8.4 |
| **MediaPipe** | Face detection | 1.0.1 |
| **Recharts** | Data visualization | 3.10.1 |
| **Supabase JS** | Auth & data client | 2.117.2 |

---

## 4. Backend Architecture

### Express Server Structure

```
apps/api/
├── src/
│   ├── index.ts                   # Server entry point
│   ├── app.ts                     # Express app builder
│   ├── config.ts                  # Environment variables
│   │
│   ├── auth.ts                    # JWT verification middleware
│   ├── db.ts                      # PostgreSQL connection pool
│   ├── supabase.ts                # Supabase service client
│   ├── storage.ts                 # File upload/download
│   ├── audit.ts                   # Audit log helper
│   │
│   ├── modules/                   # REST API route modules
│   │   ├── me.ts                 # /api/v1/me/* (profile, notifications)
│   │   ├── assessments.ts        # /api/v1/assessments/*
│   │   ├── questions.ts          # /api/v1/questions/*
│   │   ├── interviews.ts         # /api/v1/interviews/*
│   │   ├── integrity.ts          # /api/v1/integrity/*
│   │   ├── evaluations.ts        # /api/v1/evaluations/*
│   │   ├── students.ts           # /api/v1/students/*
│   │   ├── cohorts.ts            # /api/v1/cohorts/*
│   │   ├── admin.ts              # /api/v1/admin/*
│   │   ├── external.ts           # /api/v1/external/* (API keys)
│   │   ├── attemptsService.ts    # Assessment attempt logic
│   │   └── externalService.ts    # External API webhook handler
│   │
│   ├── interview/                 # Interview system (WebSocket)
│   │   ├── gateway.ts            # Socket.io server setup
│   │   ├── live.ts               # Room management
│   │   ├── interviewer.ts        # AI interviewer logic
│   │   ├── proctor.ts            # Integrity monitoring
│   │   └── finalize.ts           # Post-interview processing
│   │
│   ├── ai/                        # AI service integrations
│   │   ├── llm.ts                # Claude API wrapper
│   │   ├── stt.ts                # Speech-to-text (Whisper)
│   │   └── vision.ts             # Face verification
│   │
│   ├── scoring/                   # Evaluation logic
│   │   ├── evaluate.ts           # Interview scoring
│   │   ├── rubric.ts             # Rubric application
│   │   ├── speech.ts             # Speech metrics (pace, clarity)
│   │   ├── integrity.ts          # Integrity scoring
│   │   ├── readiness.ts          # Readiness calculation
│   │   └── mock.ts               # Mock AI for testing
│   │
│   ├── coach/                     # AI coaching agent
│   │   └── agent.ts              # Personalized practice planner
│   │
│   ├── jobs/                      # Background job queue
│   │   ├── boss.ts               # BullMQ queue setup
│   │   └── workers.ts            # Job processors
│   │
│   ├── lib/                       # Shared utilities
│   │   ├── access.ts             # Permission checks
│   │   ├── errors.ts             # Error handling middleware
│   │   ├── logger.ts             # Pino logger
│   │   └── notify.ts             # Notification system
│   │
│   └── seed/                      # Database seeding
│       ├── seed.ts               # Seed script
│       ├── data.ts               # Sample data
│       ├── create-admin.ts       # Admin user creator
│       └── create-api-key.ts     # API key generator
│
└── test/
    ├── e2e.test.ts                # End-to-end tests
    ├── scoring.test.ts            # Scoring logic tests
    └── setup-env.ts               # Test environment setup
```

### Backend Middleware Stack

```
HTTP Request
     ↓
1. Helmet (security headers)
     ↓
2. CORS (origin validation)
     ↓
3. Pino-HTTP (request logging)
     ↓
4. Body Parser (JSON parsing)
     ↓
5. requireAuth (JWT verification)
     ↓
6. Route Handler
     ↓
7. Error Handler (catch & format)
     ↓
HTTP Response
```

### Backend Module Responsibilities

| Module | Routes | Responsibilities |
|--------|--------|------------------|
| **me** | `/api/v1/me/*` | User profile, notifications, settings |
| **assessments** | `/api/v1/assessments/*` | MCQ assessments, attempts, results |
| **questions** | `/api/v1/questions/*` | Question CRUD, AI generation |
| **interviews** | `/api/v1/interviews/*` | Interview sessions, reports |
| **integrity** | `/api/v1/integrity/*` | Integrity reviews, alerts |
| **evaluations** | `/api/v1/evaluations/*` | Manual evaluations, feedback |
| **students** | `/api/v1/students/*` | Student list, progress tracking |
| **cohorts** | `/api/v1/cohorts/*` | Cohort management |
| **admin** | `/api/v1/admin/*` | Users, rubrics, system config |
| **external** | `/api/v1/external/*` | Webhook endpoints (API key auth) |

---

## 5. Database Architecture

### Database Schema (PostgreSQL via Supabase)

```
┌─────────────────────────────────────────────────────────────┐
│                     CORE ENTITIES                           │
└─────────────────────────────────────────────────────────────┘

auth.users (Supabase managed)
├── id (uuid, PK)
├── email
├── encrypted_password
└── raw_user_meta_data (jsonb)

profiles (application users)
├── id (uuid, PK, FK → auth.users)
├── role (enum: student, coordinator, admin)
├── full_name
├── email
├── register_no (unique, nullable)
├── department
├── year_of_study
├── cohort_id (FK → cohorts)
├── target_roles (text[])
└── unread_notifications (int)

cohorts
├── id (uuid, PK)
├── name
├── academic_year
└── institution

staff_assignments (coordinators → cohorts)
├── staff_id (FK → profiles)
└── cohort_id (FK → cohorts)

┌─────────────────────────────────────────────────────────────┐
│                  ASSESSMENT SYSTEM                          │
└─────────────────────────────────────────────────────────────┘

questions
├── id (uuid, PK)
├── type (enum: mcq, short_answer, code, essay)
├── difficulty (enum: easy, medium, hard)
├── category (hr, technical, behavioral)
├── text
├── options (jsonb[])
├── answer_key (encrypted)
└── for_student_id (nullable, for AI practice)

assessments
├── id (uuid, PK)
├── title
├── kind (enum: practice, graded, mock)
├── duration_min
└── is_published

assessment_items
├── assessment_id (FK → assessments)
├── question_id (FK → questions)
└── points

assessment_schedules
├── id (uuid, PK)
├── assessment_id (FK → assessments)
├── cohort_id (FK → cohorts)
├── open_at
├── close_at
└── attempt_limit

attempts
├── id (uuid, PK)
├── student_id (FK → profiles)
├── assessment_id (FK → assessments)
├── status (enum: in_progress, submitted, graded)
├── started_at
├── submitted_at
├── score
└── proctoring_enabled

responses
├── id (uuid, PK)
├── attempt_id (FK → attempts)
├── question_id (FK → questions)
├── answer (jsonb)
├── is_correct
└── points_earned

┌─────────────────────────────────────────────────────────────┐
│                  INTERVIEW SYSTEM                           │
└─────────────────────────────────────────────────────────────┘

interview_sessions
├── id (uuid, PK)
├── student_id (FK → profiles)
├── interview_type (enum: hr, technical, behavioral)
├── status (enum: setup, in_progress, completed, abandoned)
├── duration_min
├── started_at
├── ended_at
├── plan (jsonb[]) -- array of questions
├── overall_score
└── ended_reason

interview_turns
├── id (uuid, PK)
├── session_id (FK → interview_sessions)
├── seq (int)
├── speaker (enum: ai, student)
├── question_id (FK → questions, nullable)
├── is_follow_up
├── text
├── audio_url
├── transcript
├── started_ms (offset from session start)
├── ended_ms
└── metrics (jsonb) -- speech metrics, plan_id

interview_assignments (assigned interviews)
├── id (uuid, PK)
├── student_id (FK → profiles)
├── interview_type
├── assigned_by (FK → profiles)
├── due_at
├── is_completed
└── session_id (FK → interview_sessions, nullable)

┌─────────────────────────────────────────────────────────────┐
│               EVALUATION & SCORING                          │
└─────────────────────────────────────────────────────────────┘

rubrics
├── id (uuid, PK)
├── name
├── description
└── is_active

rubric_criteria
├── id (uuid, PK)
├── rubric_id (FK → rubrics)
├── dimension (content, clarity, confidence, etc.)
├── weight
└── max_score

evaluations
├── id (uuid, PK)
├── register_no (indexed)
├── kind (enum: interview, assessment, manual)
├── source_id (uuid, nullable) -- session or attempt id
├── overall_score
├── feedback
└── evaluated_at

criterion_scores
├── evaluation_id (FK → evaluations)
├── criterion_id (FK → rubric_criteria)
├── score
└── feedback

readiness_snapshots (periodic student readiness)
├── id (uuid, PK)
├── student_id (FK → profiles)
├── snapshot_date
├── readiness_score
└── breakdown (jsonb)

┌─────────────────────────────────────────────────────────────┐
│                INTEGRITY MONITORING                         │
└─────────────────────────────────────────────────────────────┘

alerts
├── id (uuid, PK)
├── student_id (FK → profiles)
├── session_id (FK → interview_sessions, nullable)
├── attempt_id (FK → attempts, nullable)
├── kind (enum: integrity, performance, engagement)
├── severity (enum: low, medium, high, critical)
├── reason
└── evidence_url

integrity_reviews
├── id (uuid, PK)
├── session_id (FK → interview_sessions)
├── reviewed_by (FK → profiles)
├── status (enum: pending, cleared, flagged)
├── notes
└── reviewed_at

interventions
├── id (uuid, PK)
├── alert_id (FK → alerts)
├── staff_id (FK → profiles)
├── action_taken
└── outcome

┌─────────────────────────────────────────────────────────────┐
│                  AI COACHING SYSTEM                         │
└─────────────────────────────────────────────────────────────┘

practice_plans
├── id (uuid, PK)
├── student_id (FK → profiles)
├── status (enum: draft, active, completed)
├── goal
└── created_at

plan_items
├── id (uuid, PK)
├── plan_id (FK → practice_plans)
├── question_id (FK → questions)
├── priority (enum: high, medium, low)
├── status (enum: pending, completed, skipped)
├── reason (why agent picked it)
└── completed_at

agent_runs
├── id (uuid, PK)
├── student_id (FK → profiles)
├── trigger (enum: scheduled, manual, event)
├── status (enum: running, completed, failed)
└── output (jsonb)

agent_steps
├── run_id (FK → agent_runs)
├── seq (int)
├── tool_name
├── input (jsonb)
└── output (jsonb)

┌─────────────────────────────────────────────────────────────┐
│                  SYSTEM MANAGEMENT                          │
└─────────────────────────────────────────────────────────────┘

notifications
├── id (uuid, PK)
├── user_id (FK → profiles)
├── title
├── body
├── link
├── is_read
└── created_at

api_clients (external integrations)
├── id (uuid, PK)
├── name
├── api_key (hashed)
├── is_active
└── last_used_at

webhooks
├── id (uuid, PK)
├── name
├── url
├── secret (HMAC signing key)
├── is_active
└── last_status

ai_usage (AI cost tracking)
├── id (uuid, PK)
├── model
├── tokens_in
├── tokens_out
├── cost_usd
└── created_at

audit_logs
├── id (uuid, PK)
├── actor_id (FK → profiles)
├── action
├── resource_type
├── resource_id
├── changes (jsonb)
└── created_at
```

### Database Relationships Diagram

```
auth.users (Supabase)
    ↓
profiles (1:1)
    ├─→ cohorts (N:1)
    ├─→ staff_assignments (1:N) ← coordinators only
    ├─→ attempts (1:N) ← students
    ├─→ interview_sessions (1:N) ← students
    ├─→ evaluations (1:N) ← via register_no
    ├─→ practice_plans (1:N) ← students
    ├─→ alerts (1:N)
    └─→ notifications (1:N)

assessments
    ├─→ assessment_items (1:N)
    │       └─→ questions (N:1)
    ├─→ assessment_schedules (1:N)
    │       └─→ cohorts (N:1)
    └─→ attempts (1:N)
            └─→ responses (1:N)
                    └─→ questions (N:1)

interview_sessions
    ├─→ interview_turns (1:N)
    │       └─→ questions (N:1, nullable)
    ├─→ integrity_reviews (1:N)
    └─→ alerts (1:N)

rubrics
    └─→ rubric_criteria (1:N)
            └─→ criterion_scores (1:N)
                    └─→ evaluations (N:1)

practice_plans
    └─→ plan_items (1:N)
            └─→ questions (N:1)

agent_runs
    └─→ agent_steps (1:N)
```

---

## 6. Real-time Communication Flow

### WebSocket Architecture (Socket.io)

```
┌──────────────────────────────────────────────────────────────┐
│                   SOCKET.IO EVENTS                           │
└──────────────────────────────────────────────────────────────┘

CLIENT → SERVER
├── interview:start (sessionId)
├── student:answer (seq, audioBlob)
├── student:skip (seq)
├── proctor:snapshot (imageData, reason)
└── disconnect

SERVER → CLIENT
├── ai:question (seq, text, is_follow_up, number, total)
├── interview:timer (total_ms, remaining_ms)
├── proctor:request_snapshot (reason: 'random_check' | 'audio_received')
├── interview:ended (reason, report_url)
└── error (message)
```

### Interview Room Flow (WebSocket)

```
┌─────────────┐
│   Student   │
│   Browser   │
└──────┬──────┘
       │
       │ 1. Connect to Socket.io
       ├─────────────────────────────────────────────┐
       │                                             │
       ▼                                             ▼
┌──────────────────┐                       ┌─────────────────┐
│  Interview Room  │                       │  Socket Server  │
│  (React)         │                       │  (gateway.ts)   │
└──────┬───────────┘                       └────────┬────────┘
       │                                             │
       │ 2. Emit: interview:start {sessionId}       │
       ├────────────────────────────────────────────▶
       │                                             │
       │                                    3. Verify auth
       │                                    4. Load session
       │                                    5. Join room
       │                                             │
       │ 6. Receive: ai:question {seq, text, ...}   │
       ◀────────────────────────────────────────────┤
       │                                             │
7. Browser speaks question                          │
   (Web Speech API)                                 │
       │                                             │
8. Student speaks answer                            │
   (MediaRecorder API)                              │
       │                                             │
       │ 9. Emit: student:answer {seq, audioBlob}   │
       ├────────────────────────────────────────────▶
       │                                             │
       │                                   10. Transcribe audio
       │                                       (Whisper API)
       │                                   11. Analyze speech
       │                                       (pace, clarity)
       │                                   12. Save turn to DB
       │                                   13. Ask AI interviewer
       │                                       (Claude API)
       │                                             │
       │ 14. Receive: ai:question {next question}   │
       ◀────────────────────────────────────────────┤
       │                                             │
       │ ... repeat steps 7-14 ...                  │
       │                                             │
       │ 15. Timer expires OR all questions done    │
       │                                             │
       │ 16. Receive: interview:ended {reason}      │
       ◀────────────────────────────────────────────┤
       │                                             │
17. Navigate to report page                         │
       │                                             │
       ▼                                             ▼
```

### Proctoring Flow (Face Detection + WebSocket)

```
┌──────────────┐
│ MediaPipe    │
│ Face Mesh    │
└──────┬───────┘
       │ Continuous face detection (30 FPS)
       │
       ▼
┌──────────────────────────────────────────┐
│  Integrity Checks (client-side)          │
├──────────────────────────────────────────┤
│  • No face detected (> 2s)               │
│  • Multiple faces detected               │
│  • Face not looking at screen            │
│  • Tab switch detected                   │
└──────┬───────────────────────────────────┘
       │
       ├─── Local Alert (UI notification)
       │
       └─── Emit: proctor:snapshot {imageData, reason}
                  ↓
       ┌─────────────────────────┐
       │   Socket Server         │
       │   (proctor.ts)          │
       └──────┬──────────────────┘
              │
              ├─── Upload image to Storage
              │
              ├─── Calculate integrity score
              │
              ├─── Create alert if threshold exceeded
              │
              └─── Real-time notification to staff
                   (Supabase Realtime)
                          ↓
                   ┌─────────────────────┐
                   │  Staff Dashboard    │
                   │  (Live Alerts)      │
                   └─────────────────────┘
```

---

## 7. AI Integration Architecture

### Claude API Integration Flow

```
┌──────────────────────────────────────────────────────────────┐
│                  AI SERVICE LAYER (ai/llm.ts)                │
└──────────────────────────────────────────────────────────────┘

Request Entry Points:
├── Interview Evaluation (POST /api/v1/interviews/:id/finalize)
├── Question Generation (POST /api/v1/questions/generate)
├── Coaching Agent (Background Job)
└── Assessment Grading (POST /api/v1/attempts/:id/grade)

        ↓

┌──────────────────────────────────────────────────────────────┐
│                      Claude API Call                         │
├──────────────────────────────────────────────────────────────┤
│  Model: claude-sonnet-4-5-20250929                           │
│  Max Tokens: 2048-4096                                       │
│  Temperature: 0.3 (consistent evaluation)                    │
│  System Prompt: Role-specific instructions                   │
└──────────────────────────────────────────────────────────────┘

        ↓

Interview Evaluation Prompt Structure:
┌──────────────────────────────────────────────────────────────┐
│  System: You are an expert HR interviewer...                 │
│                                                              │
│  Context:                                                    │
│  - Interview type: {technical/hr/behavioral}                 │
│  - Target roles: {software engineer, etc.}                   │
│  - Duration: {10 minutes}                                    │
│                                                              │
│  Transcript:                                                 │
│  Q1: [AI question]                                           │
│  A1: [Student answer with speech metrics]                    │
│  Q2: [AI question]                                           │
│  A2: [Student answer]                                        │
│  ...                                                         │
│                                                              │
│  Task: Evaluate this interview across dimensions:           │
│  - Content Quality (relevance, depth)                        │
│  - Clarity of Expression                                     │
│  - Confidence Level                                          │
│  - Structure (intro, body, conclusion)                       │
│  - Time Management                                           │
│                                                              │
│  Output format (JSON):                                       │
│  {                                                           │
│    "overall_score": 0-100,                                   │
│    "dimensions": {                                           │
│      "content": {"score": 0-100, "feedback": "..."},        │
│      "clarity": {"score": 0-100, "feedback": "..."},        │
│      ...                                                     │
│    },                                                        │
│    "strengths": ["...", "..."],                              │
│    "improvements": ["...", "..."],                           │
│    "detailed_feedback": "..."                                │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘

        ↓

┌──────────────────────────────────────────────────────────────┐
│                  Response Processing                         │
├──────────────────────────────────────────────────────────────┤
│  1. Parse JSON response                                      │
│  2. Validate schema                                          │
│  3. Apply rubric weights                                     │
│  4. Store in evaluations table                               │
│  5. Create criterion_scores entries                          │
│  6. Update interview_sessions.overall_score                  │
│  7. Send notification to student                             │
│  8. Log AI usage (tokens, cost)                              │
└──────────────────────────────────────────────────────────────┘
```

### AI Interviewer Logic (Conversational AI)

```
┌──────────────────────────────────────────────────────────────┐
│              AI Interviewer Flow (interviewer.ts)            │
└──────────────────────────────────────────────────────────────┘

Interview Start:
  ↓
1. Generate greeting (dynamic based on type)
   "Hello! I'm your AI interviewer for this {type} interview..."
  ↓
2. Ask first planned question from question bank
  ↓
  
Student answers
  ↓
  
3. Analyze answer quality (quick check)
   - Too short (< 20 words) → Ask follow-up
   - Vague → Ask for specific example
   - Good → Move to next question
  ↓
  
4. AI decides next action:
   ┌─────────────────────────────────────────┐
   │  Claude API: "What should I ask next?"  │
   │                                         │
   │  Context:                               │
   │  - Plan: [remaining questions]          │
   │  - Transcript so far                    │
   │  - Student's performance level          │
   │  - Time remaining                       │
   │                                         │
   │  Options:                               │
   │  a) Ask follow-up on current topic      │
   │  b) Move to next planned question       │
   │  c) Skip to closing (if time low)       │
   └─────────────────────────────────────────┘
  ↓
5. Deliver next question via WebSocket
  ↓
  
Repeat 3-5 until:
- All questions asked
- Time limit reached
- Student disconnects
  ↓
  
6. Closing statement
   "Thank you for completing the interview..."
  ↓
  
7. Trigger finalization
   - Full transcript sent to Claude API
   - Comprehensive evaluation generated
   - Report available to student
```

### Speech-to-Text Flow (Whisper)

```
Student speaks → MediaRecorder → Audio Blob (WebM/MP3)
                                       ↓
                         Upload to server (Base64 or FormData)
                                       ↓
                         ┌──────────────────────┐
                         │  ai/stt.ts           │
                         │  (Whisper API)       │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │  Audio Processing    │
                         │  • Format conversion │
                         │  • Noise reduction   │
                         │  • Send to Whisper   │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │  Transcript + Timing │
                         │  {                   │
                         │    text: "...",      │
                         │    words: [...],     │
                         │    confidence: 0.95  │
                         │  }                   │
                         └──────────┬───────────┘
                                    │
                         Save to interview_turns.transcript
                                    │
                         Calculate speech metrics:
                         • Words per minute (pace)
                         • Filler words (um, uh, like)
                         • Pauses (long silences)
                         • Vocabulary richness
                                    ↓
                         Store in interview_turns.metrics
```

---

## 8. Authentication & Authorization

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     SIGN UP FLOW                             │
└──────────────────────────────────────────────────────────────┘

Student Registration:
  1. Browser → supabase.auth.signUp({
       email, password,
       options: {
         data: {
           full_name, register_no, department, year_of_study
         }
       }
     })
  2. Supabase Auth creates auth.users entry
  3. Database trigger: handle_new_user()
  4. Trigger creates profiles entry (role='student')
  5. Email verification sent (optional)
  6. Return session (JWT token)

Staff/Admin Creation (Admin-initiated):
  1. Admin → POST /api/v1/admin/users
  2. Server → supabase.auth.admin.createUser({
       email, password,
       email_confirm: true,
       app_metadata: { role: 'coordinator' }
     })
  3. Trigger creates profiles entry (role from app_metadata)
  4. Notification sent to new user

┌──────────────────────────────────────────────────────────────┐
│                      LOGIN FLOW                              │
└──────────────────────────────────────────────────────────────┘

  1. Browser → supabase.auth.signInWithPassword({email, password})
  2. Supabase Auth validates credentials
  3. Return session object:
     {
       access_token: "eyJhbGc...",  // JWT token
       refresh_token: "...",
       user: {id, email, ...}
     }
  4. Browser stores in localStorage
  5. Browser → GET /api/v1/me (with Authorization header)
  6. Server verifies JWT, returns profile data
  7. AuthContext sets {session, me}
  8. Router redirects based on role:
     - student → /
     - coordinator → /staff/reports
     - admin → /staff

┌──────────────────────────────────────────────────────────────┐
│                   API REQUEST FLOW                           │
└──────────────────────────────────────────────────────────────┘

Every API Request:
  Browser → fetch('/api/v1/interviews', {
    headers: {
      'Authorization': 'Bearer eyJhbGc...',
      'Content-Type': 'application/json'
    }
  })
       ↓
  Express Middleware: requireAuth(req, res, next)
       ↓
  1. Extract token from Authorization header
  2. Verify JWT signature (Supabase public key)
  3. Check expiration (1 hour default)
  4. Decode payload: {sub: user_id, role, ...}
  5. Attach to req.user
       ↓
  Route Handler: async (req, res) => {
    const userId = req.user.id
    const role = req.user.role
    // ... permission checks
  }
```

### Authorization Matrix

```
┌──────────────────────────────────────────────────────────────┐
│                     ROLE PERMISSIONS                         │
└──────────────────────────────────────────────────────────────┘

Resource              | Student | Coordinator | Admin
──────────────────────|─────────|─────────────|───────
Own Profile           | Read    | Read/Write  | Read/Write
Other Profiles        | No      | Read (dept) | Read/Write
Assessments (list)    | Own     | Assigned    | All
Assessment Attempts   | Own     | View (dept) | All
Interviews (list)     | Own     | View (dept) | All
Interview Sessions    | Own     | View (dept) | All
Questions (list)      | Public  | All         | All
Questions (create)    | No      | Yes         | Yes
Questions (AI gen)    | Own     | Yes         | Yes
Integrity Reviews     | No      | View (dept) | All
Integrity Actions     | No      | No          | Yes
Evaluations           | Own     | View (dept) | All
Readiness Reports     | Own     | View (dept) | All
Practice Plans        | Own     | No          | No
Alerts                | No      | View (dept) | All
Notifications         | Own     | Own         | Own
Users (create)        | No      | No          | Yes
Cohorts               | View    | View        | CRUD
Rubrics               | View    | View        | CRUD
System Settings       | No      | No          | Yes
API Keys              | No      | No          | Yes
Audit Logs            | No      | No          | Read
AI Usage Stats        | No      | No          | Read
```

### Row-Level Security (RLS)

```sql
-- Example: Students can only see their own attempts
CREATE POLICY attempts_select ON attempts
  FOR SELECT
  USING (student_id = auth.uid());

-- Coordinators can see attempts from their assigned cohorts
CREATE POLICY attempts_select ON attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff_assignments sa
      JOIN profiles p ON p.cohort_id = sa.cohort_id
      WHERE sa.staff_id = auth.uid()
        AND p.id = attempts.student_id
    )
    OR public.app_role() = 'admin'
  );

-- Custom function for permission checks
CREATE FUNCTION public.can_view_student(student_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN (
    auth.uid() = student_uuid  -- own data
    OR public.app_role() = 'admin'  -- admins see all
    OR EXISTS (  -- coordinators see assigned cohorts
      SELECT 1 FROM staff_assignments sa
      JOIN profiles p ON p.cohort_id = sa.cohort_id
      WHERE sa.staff_id = auth.uid()
        AND p.id = student_uuid
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 9. Complete Data Flow - Interview Journey

### End-to-End Interview Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: SETUP                                                 │
└─────────────────────────────────────────────────────────────────┘

1. Student navigates to /interviews
   ↓
2. Browser → GET /api/v1/interviews/assignments
   ↓
3. Server queries interview_assignments table
   ↓
4. Display list of assigned interviews + practice option
   ↓
5. Student clicks "Start Interview"
   ↓
6. Browser → POST /api/v1/interviews
   Body: {interview_type: 'hr', is_practice: false}
   ↓
7. Server:
   a) Create interview_sessions entry (status='setup')
   b) Load questions from question bank
   c) Ask AI to create interview plan
   d) Store plan in session.plan (jsonb array)
   e) Return session ID
   ↓
8. Navigate to /interviews/:id/setup
   ↓
9. Setup page checks:
   - Camera permission
   - Microphone permission
   - Face detection working (MediaPipe)
   - Stable internet connection
   ↓
10. All checks passed → Button: "Enter Interview Room"

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: INTERVIEW ROOM (REAL-TIME)                            │
└─────────────────────────────────────────────────────────────────┘

11. Navigate to /interviews/:id/room
    ↓
12. Connect to Socket.io server
    ↓
13. Emit: interview:start {sessionId}
    ↓
14. Server:
    a) Update session status='in_progress', started_at=now()
    b) Join room: `session:{sessionId}`
    c) Start session timer (duration_min * 60_000ms)
    d) Load plan and existing turns
    e) If no turns yet, create greeting turn
    ↓
15. Receive: ai:question {seq:1, text:"Hello! I'm your...", ...}
    ↓
16. Browser speaks question (Web Speech API)
    ↓
17. Student clicks "Start Recording"
    ↓
18. MediaRecorder starts (audio/webm codec)
    Face detection active (MediaPipe @ 30 FPS)
    ↓
19. Student speaks answer (30-60 seconds)
    ↓
20. Student clicks "Stop" OR auto-stop after 2 minutes
    ↓
21. MediaRecorder.stop() → audioBlob ready
    ↓
22. Emit: student:answer {seq:1, audioBlob}
    ↓
23. Server receives audio:
    a) Validate size (< 8MB)
    b) Upload to storage bucket 'recordings'
    c) Transcribe with Whisper API
    d) Calculate speech metrics:
       - Words per minute (target: 120-150)
       - Filler words count
       - Long pauses (> 2s)
    e) Save interview_turns entry:
       - speaker='student'
       - audio_url, transcript, metrics
    f) Call AI interviewer:
       - Send full transcript so far
       - Ask what to ask next
       - Get follow-up OR next planned question
    g) Save AI's next question as new turn
    h) Emit: ai:question {seq:2, text:"...", is_follow_up:false}
    ↓
24. REPEAT steps 16-23 until:
    - All questions asked
    - Time limit reached (timer expires)
    - Student leaves/disconnects
    ↓
25. Timer expires OR student clicks "End Interview"
    ↓
26. Server:
    a) Send final message: "Thank you for..."
    b) Update session: status='completed', ended_at=now()
    c) Emit: interview:ended {reason:'time_limit'}
    ↓
27. Browser navigates to /interviews/:id/report (loading...)

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: POST-INTERVIEW PROCESSING (BACKGROUND)                │
└─────────────────────────────────────────────────────────────────┘

28. Background job triggers (jobs/workers.ts):
    ↓
29. Load full interview transcript:
    SELECT * FROM interview_turns
    WHERE session_id = $1 ORDER BY seq
    ↓
30. Format for AI evaluation:
    Q1: [AI question]
    A1: [Student answer] [Speech: 125 WPM, 2 fillers, 0 long pauses]
    Q2: [AI follow-up question]
    A2: [Student answer] [Speech: 140 WPM, 1 filler, 1 long pause]
    ...
    ↓
31. Send to Claude API with evaluation prompt
    ↓
32. Receive structured evaluation:
    {
      overall_score: 78,
      dimensions: {
        content: {score: 80, feedback: "..."},
        clarity: {score: 75, feedback: "..."},
        confidence: {score: 82, feedback: "..."},
        structure: {score: 70, feedback: "..."},
        time_management: {score: 78, feedback: "..."}
      },
      strengths: ["Good technical depth", "Clear examples"],
      improvements: ["More structured answers", "Watch filler words"],
      detailed_feedback: "You demonstrated solid..."
    }
    ↓
33. Store evaluation:
    a) Create evaluations entry
    b) Create criterion_scores for each dimension
    c) Update interview_sessions.overall_score
    d) Calculate readiness impact
    ↓
34. Create notification for student:
    "Your {type} interview results are ready!"
    ↓
35. Send webhook to external systems (if configured)

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: REPORT VIEWING                                        │
└─────────────────────────────────────────────────────────────────┘

36. Student on /interviews/:id/report
    ↓
37. Poll: GET /api/v1/interviews/:id until status='completed'
    ↓
38. GET /api/v1/interviews/:id/evaluation
    ↓
39. Display:
    - Overall score (big number)
    - Dimension breakdown (radar chart)
    - Strengths (green boxes)
    - Areas to improve (yellow boxes)
    - Detailed AI feedback
    - Turn-by-turn transcript with metrics
    - Comparison with past interviews
    ↓
40. Student can:
    - Share report (generate link)
    - Download as PDF
    - Schedule another practice interview
    - View coaching suggestions
```

### Integrity Monitoring Flow (Parallel)

```
During Interview (Steps 18-24 above):

Every Frame (30 FPS):
  MediaPipe detects faces
       ↓
  Check integrity rules:
  ├─ No face detected > 2 seconds
  ├─ Multiple faces detected
  ├─ Face not looking at screen (head pose)
  └─ Face quality too low
       ↓
  If violation detected:
       ├─ Show local warning (UI)
       ├─ Capture snapshot
       └─ Emit: proctor:snapshot {imageData, reason}
              ↓
  Server:
       ├─ Upload image to 'proctoring-evidence' bucket
       ├─ Increment violation counter
       ├─ If threshold exceeded (3+ violations):
       │    └─ Create alert (severity='high')
       │         └─ Notify admins via Supabase Realtime
       └─ Store in interview_turns.metrics

Random Checks (every 1-2 minutes):
  Server emits: proctor:request_snapshot {reason:'random_check'}
       ↓
  Browser captures current frame
       ↓
  Emit: proctor:snapshot {imageData, reason:'random_check'}
       ↓
  Server stores for later review

Post-Interview:
  If alerts created:
       ↓
  Create integrity_review entry (status='pending')
       ↓
  Notify admin: "Interview {id} needs integrity review"
       ↓
  Admin reviews snapshots + video
       ↓
  Mark as: cleared | flagged
       ↓
  If flagged: Score invalidated, student notified
```

---

## 10. Storage Architecture

### File Storage (Supabase Storage)

```
Storage Buckets:
├── recordings/                 # Audio files from interviews
│   └── {session_id}/{turn_seq}.webm
│
├── transcripts/                # Text transcripts (backup)
│   └── {session_id}/full.txt
│
├── proctoring-evidence/        # Integrity snapshots
│   └── {session_id}/{timestamp}.jpg
│
├── reference-faces/            # Face verification baseline
│   └── {student_id}/baseline.jpg
│
├── question-media/             # Question attachments
│   └── {question_id}/image.png
│
└── resumes/                    # Student resumes (future)
    └── {student_id}/resume.pdf
```

### Storage Access Flow

```
Upload:
  Browser → POST /api/v1/storage/upload
       ↓
  Server:
    1. Validate file size/type
    2. Generate unique path
    3. supabase.storage.from('bucket').upload(path, file)
    4. Store URL in database
       ↓
  Return: {url, path}

Download (Signed URL):
  Browser → GET /api/v1/storage/download?path=...
       ↓
  Server:
    1. Check permission (can user access this file?)
    2. supabase.storage.from('bucket').createSignedUrl(path, expiresIn)
    3. Return: {signed_url} (valid for 1 hour)
       ↓
  Browser opens signed_url (direct to Supabase)
```

---

## 11. Directory Structure

### Complete Project Structure

```
speakready/
├── package.json                    # Root workspace config
├── turbo.json                      # Monorepo build orchestration
├── .gitignore
├── README.md
├── COMPLETE_ARCHITECTURE.md        # This file
├── PERFORMANCE_OPTIMIZATIONS.md
└── PRESENTATION_CONTENT.md

├── packages/                       # Shared packages
│   └── shared/                     # Shared types/utils
│       ├── src/
│       │   ├── types.ts           # Common TypeScript types
│       │   └── validation.ts      # Shared validation schemas
│       └── package.json

├── apps/                           # Applications
│   ├── web/                        # Frontend (React + Vite)
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   ├── manifest.json
│   │   │   ├── service-worker.js
│   │   │   └── mediapipe/         # 35MB WASM models
│   │   ├── src/                   # Source code (see Frontend section)
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                        # Backend (Express + Node.js)
│       ├── src/                    # Source code (see Backend section)
│       ├── test/                   # Test files
│       ├── tsconfig.json
│       └── package.json

├── supabase/                       # Database migrations
│   ├── config.toml                 # Supabase config
│   ├── migrations/
│   │   ├── 0001_init.sql          # Initial schema
│   │   ├── 0002_app.sql           # App-specific tables
│   │   ├── 0003_interview_config.sql
│   │   ├── 0004_interview_assignments.sql
│   │   ├── 0005_admission_year.sql
│   │   ├── 0006_duration_min.sql
│   │   ├── 0007_practice_flag.sql
│   │   └── 0008_assessment_proctoring.sql
│   └── seed.sql                    # Sample data

└── scripts/                        # Utility scripts
    ├── start.ps1                   # Windows start script
    └── deploy.sh                   # Deployment script
```

---

## 12. API Endpoints Reference

### Complete API Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     REST API ENDPOINTS                          │
└─────────────────────────────────────────────────────────────────┘

Public:
GET    /health                      # Health check

Auth Required (All routes below need JWT):

── ME (Current User) ──
GET    /api/v1/me                   # Get current user profile
PATCH  /api/v1/me                   # Update profile
GET    /api/v1/me/notifications     # Get notifications
POST   /api/v1/me/notifications/read # Mark all as read
GET    /api/v1/me/progress          # Get progress summary
GET    /api/v1/me/readiness         # Get readiness score

── ASSESSMENTS ──
GET    /api/v1/assessments          # List available assessments
GET    /api/v1/assessments/:id      # Get assessment details
GET    /api/v1/assessments/:id/schedule # Get schedule info
POST   /api/v1/attempts             # Start new attempt
GET    /api/v1/attempts/:id         # Get attempt details
POST   /api/v1/attempts/:id/submit  # Submit attempt
GET    /api/v1/attempts/:id/result  # Get results

── QUESTIONS ──
GET    /api/v1/questions            # List questions (no answers)
GET    /api/v1/questions/:id        # Get question details
POST   /api/v1/questions            # Create question (staff/admin)
PATCH  /api/v1/questions/:id        # Update question
DELETE /api/v1/questions/:id        # Delete question
POST   /api/v1/questions/generate   # AI generate variations

── INTERVIEWS ──
GET    /api/v1/interviews/assignments # Get assigned interviews
POST   /api/v1/interviews           # Create interview session
GET    /api/v1/interviews/:id       # Get session details
GET    /api/v1/interviews/:id/turns # Get transcript
GET    /api/v1/interviews/:id/evaluation # Get AI evaluation
POST   /api/v1/interviews/:id/finalize # Trigger evaluation (internal)

── INTEGRITY ──
GET    /api/v1/integrity/reviews    # List pending reviews (admin)
GET    /api/v1/integrity/reviews/:id # Get review details
PATCH  /api/v1/integrity/reviews/:id # Update review status
GET    /api/v1/integrity/alerts     # List alerts (admin)

── EVALUATIONS ──
GET    /api/v1/evaluations          # List evaluations
GET    /api/v1/evaluations/:id      # Get evaluation details
POST   /api/v1/evaluations          # Create manual evaluation (staff)

── STUDENTS (Coordinator/Admin) ──
GET    /api/v1/students             # List students
GET    /api/v1/students/:id         # Get student details
GET    /api/v1/students/:id/progress # Get progress data
GET    /api/v1/students/:id/history # Get attempt history

── COHORTS ──
GET    /api/v1/cohorts              # List cohorts
GET    /api/v1/cohorts/:id          # Get cohort details
POST   /api/v1/cohorts              # Create cohort (admin)
PATCH  /api/v1/cohorts/:id          # Update cohort
DELETE /api/v1/cohorts/:id          # Delete cohort

── ADMIN ──
GET    /api/v1/admin/users          # List all users
POST   /api/v1/admin/users          # Create user (staff/admin)
PATCH  /api/v1/admin/users/:id      # Update user
DELETE /api/v1/admin/users/:id      # Delete user
GET    /api/v1/admin/rubrics        # List rubrics
POST   /api/v1/admin/rubrics        # Create rubric
PATCH  /api/v1/admin/rubrics/:id    # Update rubric
GET    /api/v1/admin/audit          # Get audit logs
GET    /api/v1/admin/ai-usage       # Get AI cost stats
GET    /api/v1/admin/system         # System health
POST   /api/v1/admin/webhooks       # Create webhook
GET    /api/v1/admin/api-keys       # List API keys
POST   /api/v1/admin/api-keys       # Generate API key

── EXTERNAL (API Key Auth) ──
POST   /api/v1/external/webhook     # Receive webhooks
GET    /api/v1/external/students/:id # Get student data (external)
POST   /api/v1/external/evaluations # Submit external evaluation
```

---

## 13. Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: NETWORK SECURITY                                      │
├─────────────────────────────────────────────────────────────────┤
│  • HTTPS Only (TLS 1.3)                                         │
│  • CORS (Whitelist origins)                                     │
│  • Helmet.js (Security headers)                                 │
│  • Rate Limiting (100 req/min per IP)                           │
│  • DDoS Protection (Cloudflare/Vercel)                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: AUTHENTICATION                                        │
├─────────────────────────────────────────────────────────────────┤
│  • JWT Tokens (HS256, 1 hour expiry)                            │
│  • Supabase Auth (Built-in security)                            │
│  • Password Hashing (bcrypt)                                    │
│  • Session Management (Refresh tokens)                          │
│  • API Key Auth (HMAC-SHA256 for external)                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: AUTHORIZATION                                         │
├─────────────────────────────────────────────────────────────────┤
│  • Role-Based Access Control (RBAC)                             │
│  • Row-Level Security (RLS) in PostgreSQL                       │
│  • Route Guards (frontend + backend)                            │
│  • Resource Ownership Checks                                    │
│  • Department/Cohort Isolation                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: DATA SECURITY                                         │
├─────────────────────────────────────────────────────────────────┤
│  • Encryption at Rest (AES-256)                                 │
│  • Encryption in Transit (TLS 1.3)                              │
│  • Answer Key Encryption (never sent to client)                 │
│  • Signed URLs for file access (1 hour expiry)                  │
│  • Database Backups (Daily, encrypted)                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5: INPUT VALIDATION                                      │
├─────────────────────────────────────────────────────────────────┤
│  • Request Body Validation (schema-based)                       │
│  • SQL Injection Prevention (Parameterized queries)             │
│  • XSS Prevention (CSP headers, sanitization)                   │
│  • File Upload Validation (type, size, content)                 │
│  • Audio Size Limits (8MB max)                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6: AUDIT & MONITORING                                    │
├─────────────────────────────────────────────────────────────────┤
│  • Audit Logs (All sensitive actions)                           │
│  • Request Logging (Pino logger)                                │
│  • Error Tracking (Sentry - optional)                           │
│  • Real-time Alerts (Integrity violations)                      │
│  • AI Usage Tracking (Cost monitoring)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Security Best Practices Implemented

```
✅ No sensitive data in frontend code
✅ Answer keys never sent to client
✅ JWT verified on every API request
✅ Row-level security on all tables
✅ HTTPS enforced in production
✅ CORS configured for known origins only
✅ File uploads validated and scanned
✅ Audio recordings size-limited
✅ Database credentials in environment variables
✅ API keys hashed before storage
✅ Webhook payloads signed (HMAC)
✅ Rate limiting on all endpoints
✅ SQL injection impossible (parameterized queries)
✅ XSS prevention (CSP headers + React auto-escaping)
✅ CSRF protection (SameSite cookies)
✅ Service worker only in production
✅ No console.log in production (Terser removes it)
```

---

## 14. Performance & Scalability

### Current Performance

```
Frontend:
├── Initial Load:        2-2.5s (cold cache)
├── Navigation:          <100ms (with preloading)
├── Repeat Visits:       <500ms (service worker)
├── Lighthouse Score:    85+
└── Bundle Size:         277KB (Brotli compressed)

Backend:
├── API Response Time:   <200ms (average)
├── WebSocket Latency:   <50ms
├── AI Evaluation:       3-5 seconds (per interview)
├── Transcription:       1-2 seconds (per answer)
└── Database Queries:    <50ms (with indexes)

Real-time:
├── Face Detection:      30 FPS
├── Audio Streaming:     Real-time (WebRTC)
└── WebSocket Events:    <50ms latency
```

### Scalability Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     HORIZONTAL SCALING                          │
└─────────────────────────────────────────────────────────────────┘

Frontend (Static):
  Cloudflare CDN / Vercel Edge
  ├── Global distribution (200+ locations)
  ├── Auto-scaling (unlimited)
  └── Brotli/Gzip compression (automatic)

Backend (Stateless):
  Node.js Instances (Docker containers)
  ├── Load Balancer (Nginx/HAProxy)
  ├── Auto-scale: 2-10 instances
  ├── No session state (JWT tokens)
  └── Shared Redis for rate limiting

WebSocket (Stateful):
  Socket.io with Redis Adapter
  ├── Sticky sessions (IP hash)
  ├── Shared room state (Redis)
  └── Horizontal scaling supported

Database:
  Supabase (PostgreSQL)
  ├── Connection pooling (pg-bouncer)
  ├── Read replicas (future)
  ├── Automatic backups
  └── Vertical scaling (upgrade plan)

Storage:
  Supabase Storage (S3-compatible)
  ├── CDN for downloads
  ├── Automatic compression
  └── Unlimited scalability

AI:
  Claude API (Anthropic)
  ├── Rate limit: 10,000 req/min
  ├── Auto-scaling (managed)
  └── Fallback to queue on limit

Background Jobs:
  BullMQ (Redis-backed)
  ├── Multiple worker processes
  ├── Job priorities & retries
  └── Auto-scale workers
```

### Capacity Planning

```
Current Capacity (Single Server):
├── Concurrent Interviews:   100
├── API Requests/sec:        500
├── Database Connections:    100
└── Storage:                 Unlimited (Supabase)

Bottlenecks & Solutions:
├── AI API Rate Limit:       Queue jobs, batch requests
├── Database Connections:    Connection pooling
├── WebSocket Memory:        Redis adapter for scaling
└── Audio Transcription:     Background job queue

Estimated Load (1000 students):
├── Peak Concurrent Interviews:  50 (5% at once)
├── Daily API Requests:          100,000
├── Storage Usage:               500GB/month (50MB per interview)
└── AI Cost:                     $200/month (avg $0.20 per interview)

Scaling Roadmap:
├── 1-500 students:    Single server (current)
├── 500-2000:          Add read replica, CDN
├── 2000-5000:         Multi-region, caching layer
└── 5000+:             Microservices, Kubernetes
```

---

## 15. Technology Decision Rationale

### Why React + Vite?

```
✅ Fast development (HMR, instant feedback)
✅ Large ecosystem (libraries, tools)
✅ Progressive Web App capable
✅ Excellent TypeScript support
✅ Easy to optimize (code splitting, lazy loading)
✅ Team familiarity
```

### Why Express.js?

```
✅ Minimal, flexible framework
✅ Large middleware ecosystem
✅ Easy WebSocket integration (Socket.io)
✅ TypeScript support
✅ Battle-tested for production
```

### Why Supabase (PostgreSQL)?

```
✅ Full PostgreSQL power (complex queries, JOINs)
✅ Built-in auth (JWT, social login)
✅ Row-level security (data isolation)
✅ Real-time subscriptions (live updates)
✅ S3-compatible storage
✅ Generous free tier
✅ Automatic backups
✅ Open source (self-hostable)
```

### Why Claude API?

```
✅ Best-in-class AI for evaluation
✅ Excellent reasoning capability
✅ Consistent, structured output
✅ Long context window (100K tokens)
✅ Lower cost than GPT-4
✅ Strong safety guardrails
```

### Why Socket.io?

```
✅ Real-time bidirectional communication
✅ Automatic reconnection
✅ Room-based broadcasting
✅ Fallback to polling (if WebSocket unavailable)
✅ Cross-browser compatibility
```

---

## Appendix: Quick Reference

### Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_KEY=...
CLAUDE_API_KEY=sk-...
PORT=4001
CORS_ORIGINS=http://localhost:5173
STORAGE_DRIVER=supabase
AI_MOCK=false
RUN_JOBS=true

# Frontend (.env)
VITE_API_URL=http://localhost:4001
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
```

### Common Commands

```bash
# Development
npm run dev              # Start frontend + backend
npm run dev:web          # Frontend only
npm run dev:api          # Backend only

# Build
npm run build            # Build frontend
npm run typecheck        # Check TypeScript

# Database
npm run seed             # Seed database
npm run create-admin     # Create admin user

# Testing
npm test                 # Run tests
```

---

**END OF ARCHITECTURE DOCUMENT**

This comprehensive architecture document covers every aspect of the SpeakReady platform. Use it as a reference for development, onboarding new team members, or presenting to stakeholders.

**Last Updated:** 2026-10-06  
**Document Version:** 1.0  
**Project Version:** 1.0.0
