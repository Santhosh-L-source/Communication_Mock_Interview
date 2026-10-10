# SpeakReady - Mermaid Architecture Diagrams

Copy and paste these diagrams into any Mermaid-compatible viewer:
- https://mermaid.live
- GitHub (in .md files)
- Notion
- VSCode (with Mermaid extension)

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[React App + Vite]
        SW[Service Worker]
        MediaPipe[MediaPipe Face Detection]
    end
    
    subgraph "Application Layer"
        API[REST API Server<br/>Express.js]
        WS[WebSocket Server<br/>Socket.io]
    end
    
    subgraph "Data Layer"
        Supabase[Supabase BaaS]
        DB[(PostgreSQL)]
        Auth[Auth Module]
        Storage[File Storage]
        Realtime[Realtime Subscriptions]
    end
    
    subgraph "AI Services"
        Claude[Claude API<br/>Anthropic]
        Whisper[Whisper API<br/>OpenAI]
    end
    
    Browser -->|HTTPS REST| API
    Browser -->|WebSocket| WS
    Browser -->|JWT Auth| Auth
    
    API --> DB
    API --> Storage
    API --> Claude
    WS --> DB
    WS --> Claude
    WS --> Whisper
    
    Supabase --> DB
    Supabase --> Auth
    Supabase --> Storage
    Supabase --> Realtime
    
    Browser -.->|Offline Cache| SW
    Browser -->|Face Detection| MediaPipe
    
    style Browser fill:#4F46E5,color:#fff
    style API fill:#10B981,color:#fff
    style WS fill:#10B981,color:#fff
    style Claude fill:#FF6B6B,color:#fff
    style DB fill:#3B82F6,color:#fff
```

---

## 2. Complete Interview Flow

```mermaid
sequenceDiagram
    participant S as Student Browser
    participant A as API Server
    participant W as WebSocket Server
    participant D as Database
    participant C as Claude AI
    participant ST as Whisper STT
    
    Note over S,ST: PHASE 1: SETUP
    S->>A: POST /api/v1/interviews (start interview)
    A->>C: Generate interview plan
    C-->>A: Planned questions
    A->>D: Create interview_sessions
    D-->>A: session_id
    A-->>S: session_id
    S->>S: Check camera/mic/face detection
    
    Note over S,ST: PHASE 2: INTERVIEW ROOM (REAL-TIME)
    S->>W: Connect Socket.io
    S->>W: Emit: interview:start {sessionId}
    W->>D: Update status='in_progress'
    W-->>S: Emit: ai:question {seq:1, text:"Hello..."}
    S->>S: Speak question (TTS)
    S->>S: Record answer (MediaRecorder)
    S->>W: Emit: student:answer {seq:1, audioBlob}
    
    W->>ST: Transcribe audio
    ST-->>W: transcript
    W->>D: Save turn (student answer)
    W->>C: What should I ask next?
    C-->>W: Next question
    W->>D: Save turn (AI question)
    W-->>S: Emit: ai:question {seq:2, text:"..."}
    
    Note over S,ST: REPEAT until time expires
    
    W->>D: Update status='completed'
    W-->>S: Emit: interview:ended
    S->>S: Navigate to report page
    
    Note over S,ST: PHASE 3: EVALUATION (BACKGROUND)
    A->>D: Load full transcript
    A->>C: Evaluate interview
    C-->>A: Structured evaluation
    A->>D: Save evaluation + scores
    A->>D: Create notification
    
    Note over S,ST: PHASE 4: VIEW REPORT
    S->>A: GET /api/v1/interviews/:id/evaluation
    A->>D: Fetch evaluation
    D-->>A: Evaluation data
    A-->>S: Display results
```

---

## 3. Database Schema (Entity Relationship)

```mermaid
erDiagram
    PROFILES ||--o{ ATTEMPTS : "has"
    PROFILES ||--o{ INTERVIEW_SESSIONS : "has"
    PROFILES ||--o{ PRACTICE_PLANS : "has"
    PROFILES }o--|| COHORTS : "belongs to"
    PROFILES ||--o{ STAFF_ASSIGNMENTS : "manages"
    COHORTS ||--o{ STAFF_ASSIGNMENTS : "managed by"
    
    ASSESSMENTS ||--o{ ASSESSMENT_ITEMS : "contains"
    ASSESSMENTS ||--o{ ATTEMPTS : "attempted via"
    QUESTIONS ||--o{ ASSESSMENT_ITEMS : "used in"
    
    ATTEMPTS ||--o{ RESPONSES : "has"
    RESPONSES }o--|| QUESTIONS : "answers"
    
    INTERVIEW_SESSIONS ||--o{ INTERVIEW_TURNS : "has"
    INTERVIEW_TURNS }o--o| QUESTIONS : "may reference"
    INTERVIEW_SESSIONS ||--o{ INTEGRITY_REVIEWS : "reviewed via"
    
    EVALUATIONS ||--o{ CRITERION_SCORES : "scored on"
    RUBRICS ||--o{ RUBRIC_CRITERIA : "defines"
    RUBRIC_CRITERIA ||--o{ CRITERION_SCORES : "evaluated by"
    
    PRACTICE_PLANS ||--o{ PLAN_ITEMS : "contains"
    PLAN_ITEMS }o--|| QUESTIONS : "practices"
    
    PROFILES ||--o{ ALERTS : "flagged in"
    ALERTS ||--o{ INTERVENTIONS : "resolved via"
    
    PROFILES {
        uuid id PK
        text role
        text full_name
        text email
        text register_no UK
        text department
        int year_of_study
        uuid cohort_id FK
    }
    
    INTERVIEW_SESSIONS {
        uuid id PK
        uuid student_id FK
        text interview_type
        text status
        timestamp started_at
        timestamp ended_at
        jsonb plan
        int overall_score
    }
    
    INTERVIEW_TURNS {
        uuid id PK
        uuid session_id FK
        int seq
        text speaker
        text text
        text transcript
        text audio_url
        jsonb metrics
    }
    
    ATTEMPTS {
        uuid id PK
        uuid student_id FK
        uuid assessment_id FK
        text status
        timestamp started_at
        int score
    }
    
    EVALUATIONS {
        uuid id PK
        text register_no
        text kind
        int overall_score
        text feedback
        timestamp evaluated_at
    }
```

---

## 4. Frontend Component Architecture

```mermaid
graph TB
    subgraph "Entry Point"
        Main[main.tsx<br/>App Entry]
        App[App.tsx<br/>Root Router]
    end
    
    subgraph "Context Providers"
        AuthProvider[AuthProvider<br/>User Session]
    end
    
    subgraph "Layout"
        Layout[Layout.tsx<br/>Nav + Header]
    end
    
    subgraph "Student Pages"
        Dashboard[Dashboard.tsx]
        Practice[Practice.tsx]
        History[History.tsx]
        InterviewSetup[InterviewSetup.tsx]
        InterviewRoom[InterviewRoom.tsx<br/>WebSocket]
        InterviewReport[InterviewReport.tsx]
    end
    
    subgraph "Staff Pages"
        StaffDash[Staff.tsx]
        Integrity[Integrity.tsx]
        Questions[Questions.tsx]
        Reports[Reports.tsx]
    end
    
    subgraph "Admin Pages"
        AdminPage[Admin.tsx<br/>Users/Rubrics/System]
    end
    
    subgraph "Shared Components"
        UI[ui.tsx<br/>Button/Card/Modal]
        Scores[Scores.tsx]
        RouterProgress[RouterProgress.tsx]
    end
    
    subgraph "Core Libraries"
        API[api.ts<br/>Fetch Wrapper]
        Auth[auth.tsx<br/>useAuth Hook]
        Supabase[supabase.ts]
        Socket[socket.ts<br/>Socket.io Client]
        RoutePreload[route-preload.ts]
    end
    
    Main --> App
    App --> AuthProvider
    AuthProvider --> Layout
    Layout --> Dashboard
    Layout --> StaffDash
    Layout --> AdminPage
    
    Dashboard --> Practice
    Dashboard --> InterviewSetup
    InterviewSetup --> InterviewRoom
    InterviewRoom --> InterviewReport
    
    InterviewRoom --> Socket
    Dashboard --> API
    StaffDash --> API
    AdminPage --> API
    
    API --> Auth
    Auth --> Supabase
    
    Layout --> UI
    Dashboard --> UI
    Dashboard --> Scores
    
    style InterviewRoom fill:#FF6B6B,color:#fff
    style Socket fill:#FF6B6B,color:#fff
    style AuthProvider fill:#10B981,color:#fff
```

---

## 5. Backend Module Architecture

```mermaid
graph LR
    subgraph "HTTP Entry"
        Express[Express App]
        Middleware[Middleware Stack]
    end
    
    subgraph "Route Modules"
        Me[me.ts<br/>Profile/Notifications]
        Assessments[assessments.ts<br/>MCQ Tests]
        Questions[questions.ts<br/>Question Bank]
        Interviews[interviews.ts<br/>Session Management]
        Integrity[integrity.ts<br/>Reviews]
        Students[students.ts<br/>Progress Tracking]
        Admin[admin.ts<br/>System Config]
    end
    
    subgraph "WebSocket"
        Gateway[gateway.ts<br/>Socket.io Server]
        Interviewer[interviewer.ts<br/>AI Logic]
        Proctor[proctor.ts<br/>Integrity Monitor]
        Finalize[finalize.ts<br/>Post-Processing]
    end
    
    subgraph "AI Services"
        LLM[llm.ts<br/>Claude API]
        STT[stt.ts<br/>Whisper API]
        Vision[vision.ts<br/>Face Verification]
    end
    
    subgraph "Scoring"
        Evaluate[evaluate.ts<br/>Interview Scoring]
        Rubric[rubric.ts<br/>Rubric Application]
        Speech[speech.ts<br/>Speech Metrics]
        IntegrityScore[integrity.ts<br/>Integrity Scoring]
    end
    
    subgraph "Infrastructure"
        DB[(Database<br/>PostgreSQL)]
        Storage[Storage<br/>Supabase S3]
        Jobs[jobs/boss.ts<br/>BullMQ Queue]
    end
    
    Express --> Middleware
    Middleware --> Me
    Middleware --> Assessments
    Middleware --> Questions
    Middleware --> Interviews
    Middleware --> Admin
    
    Express --> Gateway
    Gateway --> Interviewer
    Gateway --> Proctor
    Gateway --> Finalize
    
    Interviewer --> LLM
    Finalize --> LLM
    Gateway --> STT
    Proctor --> Vision
    
    Finalize --> Evaluate
    Evaluate --> Rubric
    Evaluate --> Speech
    Proctor --> IntegrityScore
    
    Me --> DB
    Assessments --> DB
    Interviews --> DB
    Gateway --> DB
    
    Gateway --> Storage
    Proctor --> Storage
    
    Finalize --> Jobs
    
    style Gateway fill:#FF6B6B,color:#fff
    style LLM fill:#10B981,color:#fff
    style DB fill:#3B82F6,color:#fff
```

---

## 6. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Supabase Auth
    participant A as API Server
    participant D as Database
    
    Note over B,D: SIGN UP
    B->>S: signUp({email, password, metadata})
    S->>S: Create auth.users entry
    S->>D: Trigger: handle_new_user()
    D->>D: Create profiles entry
    S-->>B: Return session + JWT
    
    Note over B,D: LOGIN
    B->>S: signInWithPassword({email, password})
    S->>S: Verify credentials
    S-->>B: Return session + JWT
    B->>A: GET /api/v1/me (with JWT)
    A->>A: Verify JWT signature
    A->>A: Extract user_id from token
    A->>D: SELECT * FROM profiles WHERE id=user_id
    D-->>A: Profile data
    A-->>B: {profile, role, permissions}
    
    Note over B,D: API REQUEST (AUTHENTICATED)
    B->>A: GET /api/v1/interviews<br/>Header: Authorization: Bearer JWT
    A->>A: requireAuth() middleware
    A->>A: Verify JWT
    A->>A: Check expiration
    A->>A: Attach req.user
    A->>A: Check permissions
    A->>D: Query data (with RLS)
    D->>D: Apply Row-Level Security
    D-->>A: Filtered results
    A-->>B: Response
    
    Note over B,D: WEBSOCKET (AUTHENTICATED)
    B->>A: Connect Socket.io + JWT in handshake
    A->>A: Verify JWT
    A->>A: Extract user_id
    A->>A: Allow connection
    B->>A: Emit: interview:start
    A->>A: Verify user owns session
    A->>D: Load session data
    D-->>A: Session data
    A-->>B: Emit: ai:question
```

---

## 7. Interview Room Real-time Flow

```mermaid
stateDiagram-v2
    [*] --> Setup: Student clicks "Start Interview"
    
    Setup --> Checking: Check camera/mic
    Checking --> Ready: All checks passed
    Checking --> Setup: Failed (retry)
    
    Ready --> InProgress: Click "Enter Room"
    
    state InProgress {
        [*] --> WaitingForConnection
        WaitingForConnection --> Connected: WebSocket connected
        Connected --> AIQuestionReceived: Receive ai:question
        AIQuestionReceived --> Speaking: Browser speaks question
        Speaking --> Recording: Student clicks "Record"
        Recording --> Processing: Student clicks "Stop"
        Processing --> Transcribing: Server receives audio
        Transcribing --> Evaluating: Whisper returns transcript
        Evaluating --> NextQuestion: AI decides next
        NextQuestion --> AIQuestionReceived: Emit ai:question
        
        NextQuestion --> TimeUp: Timer expires
        NextQuestion --> AllDone: All questions asked
    }
    
    InProgress --> Completed: TimeUp OR AllDone
    Completed --> Evaluating_BG: Background evaluation
    Evaluating_BG --> ReportReady: AI returns evaluation
    
    ReportReady --> [*]
    
    note right of InProgress
        Real-time events:
        - ai:question
        - student:answer
        - proctor:snapshot
        - interview:timer
    end note
```

---

## 8. Data Flow - Student Journey

```mermaid
journey
    title Student Interview Journey
    section Pre-Interview
      Browse to dashboard: 5: Student
      View assigned interviews: 4: Student
      Click "Start Interview": 5: Student
      System creates session: 3: System, AI
    section Setup
      Check camera permission: 3: Student
      Check microphone: 3: Student
      Face detection test: 4: Student, MediaPipe
      Click "Enter Room": 5: Student
    section Interview
      Receive AI question: 5: Student, AI
      Listen to question: 4: Student
      Record answer: 5: Student
      Submit audio: 4: Student
      AI evaluates answer: 3: AI
      Receive next question: 5: Student, AI
      Repeat 6-7 times: 3: Student, AI
    section Post-Interview
      Time expires: 3: System
      Navigate to report: 4: Student
      View evaluation: 5: Student, AI
      Read feedback: 5: Student
      View progress chart: 5: Student
```

---

## 9. Deployment Architecture

```mermaid
graph TB
    subgraph "CDN / Edge"
        CF[Cloudflare<br/>or<br/>Vercel Edge]
    end
    
    subgraph "Frontend Hosting"
        Static[Static Files<br/>React Build]
        SW[Service Worker<br/>Cache Layer]
    end
    
    subgraph "Backend Hosting"
        LB[Load Balancer]
        API1[API Server 1<br/>Node.js]
        API2[API Server 2<br/>Node.js]
        API3[API Server N<br/>Node.js]
    end
    
    subgraph "Database"
        Primary[(PostgreSQL<br/>Primary)]
        Replica[(PostgreSQL<br/>Read Replica)]
    end
    
    subgraph "Caching"
        Redis[(Redis<br/>Session/Queue)]
    end
    
    subgraph "Storage"
        S3[Supabase Storage<br/>S3-compatible]
    end
    
    subgraph "External Services"
        Claude[Claude API]
        Whisper[Whisper API]
    end
    
    subgraph "Monitoring"
        Logs[Logs<br/>Pino/Winston]
        Metrics[Metrics<br/>Prometheus]
        Alerts[Alerts<br/>PagerDuty]
    end
    
    Users -->|HTTPS| CF
    CF -->|Cache Hit| Static
    CF -->|Cache Miss| Static
    Static --> SW
    
    Users -->|API Calls| CF
    CF --> LB
    LB --> API1
    LB --> API2
    LB --> API3
    
    API1 --> Primary
    API2 --> Primary
    API3 --> Replica
    
    API1 --> Redis
    API2 --> Redis
    API3 --> Redis
    
    API1 --> S3
    API1 --> Claude
    API1 --> Whisper
    
    API1 --> Logs
    API1 --> Metrics
    Metrics --> Alerts
    
    style CF fill:#FF6B6B,color:#fff
    style Primary fill:#3B82F6,color:#fff
    style Claude fill:#10B981,color:#fff
```

---

## 10. CI/CD Pipeline

```mermaid
graph LR
    subgraph "Development"
        Dev[Developer<br/>Local Machine]
        Git[Git Commit]
    end
    
    subgraph "Version Control"
        GitHub[GitHub<br/>Repository]
    end
    
    subgraph "CI Pipeline"
        Test[Run Tests<br/>Jest/Vitest]
        Lint[Lint Code<br/>ESLint]
        TypeCheck[Type Check<br/>TypeScript]
        Build[Build<br/>Vite/TSC]
    end
    
    subgraph "CD Pipeline"
        Deploy[Deploy to<br/>Staging]
        E2E[E2E Tests<br/>Playwright]
        Prod[Deploy to<br/>Production]
    end
    
    subgraph "Monitoring"
        Health[Health Checks]
        Rollback[Auto Rollback<br/>on Errors]
    end
    
    Dev --> Git
    Git --> GitHub
    GitHub -->|Push to main| Test
    Test --> Lint
    Lint --> TypeCheck
    TypeCheck --> Build
    Build -->|Success| Deploy
    Deploy --> E2E
    E2E -->|Pass| Prod
    Prod --> Health
    Health -->|Fail| Rollback
    
    style GitHub fill:#4F46E5,color:#fff
    style Build fill:#10B981,color:#fff
    style Prod fill:#FF6B6B,color:#fff
```

---

## 11. Microservices Vision (Future)

```mermaid
graph TB
    subgraph "API Gateway"
        Gateway[Kong / Nginx]
    end
    
    subgraph "Services"
        Auth[Auth Service<br/>User Management]
        Interview[Interview Service<br/>Real-time Interviews]
        Assessment[Assessment Service<br/>MCQ Tests]
        Evaluation[Evaluation Service<br/>AI Scoring]
        Notification[Notification Service<br/>Email/Push]
        Analytics[Analytics Service<br/>Reports]
    end
    
    subgraph "Data Stores"
        UserDB[(User DB)]
        InterviewDB[(Interview DB)]
        AssessmentDB[(Assessment DB)]
        Cache[(Redis Cache)]
    end
    
    subgraph "Message Queue"
        RabbitMQ[RabbitMQ<br/>Event Bus]
    end
    
    subgraph "External"
        Claude[Claude API]
        Email[SendGrid]
    end
    
    Gateway --> Auth
    Gateway --> Interview
    Gateway --> Assessment
    
    Auth --> UserDB
    Interview --> InterviewDB
    Interview --> Cache
    Assessment --> AssessmentDB
    
    Interview -->|Event: interview_completed| RabbitMQ
    RabbitMQ -->|Consume| Evaluation
    RabbitMQ -->|Consume| Notification
    
    Evaluation --> Claude
    Notification --> Email
    
    Analytics --> UserDB
    Analytics --> InterviewDB
    Analytics --> AssessmentDB
    
    style Gateway fill:#4F46E5,color:#fff
    style RabbitMQ fill:#FF6B6B,color:#fff
```

---

## 12. Security Architecture

```mermaid
graph TB
    subgraph "Client Side"
        Browser[User Browser]
        JWT[JWT Token<br/>localStorage]
    end
    
    subgraph "Network Layer"
        HTTPS[HTTPS/TLS 1.3]
        CORS[CORS Policy]
        RateLimit[Rate Limiter<br/>100 req/min]
    end
    
    subgraph "Application Layer"
        AuthMW[Auth Middleware<br/>JWT Verify]
        RoleMW[Role Check<br/>RBAC]
        Validation[Input Validation]
    end
    
    subgraph "Data Layer"
        RLS[Row Level Security]
        Encryption[Encryption at Rest<br/>AES-256]
        Audit[Audit Logs]
    end
    
    Browser -->|Requests| HTTPS
    HTTPS --> CORS
    CORS --> RateLimit
    RateLimit --> AuthMW
    AuthMW -->|Valid| RoleMW
    AuthMW -->|Invalid| Reject[Reject 401]
    RoleMW -->|Authorized| Validation
    RoleMW -->|Forbidden| Reject2[Reject 403]
    Validation --> RLS
    RLS --> Encryption
    
    Encryption --> Audit
    
    JWT -.->|Sent in Header| Browser
    
    style HTTPS fill:#10B981,color:#fff
    style AuthMW fill:#FF6B6B,color:#fff
    style RLS fill:#3B82F6,color:#fff
```

---

## How to Use These Diagrams

### 1. View Online
- Go to https://mermaid.live
- Copy any diagram code above
- Paste into editor
- Export as PNG/SVG

### 2. In GitHub
- Create or edit a `.md` file
- Paste diagram inside code fence with `mermaid` language:
  ````markdown
  ```mermaid
  graph TB
    A --> B
  ```
  ````
- GitHub automatically renders it

### 3. In VS Code
- Install "Markdown Preview Mermaid Support" extension
- Open this file
- Press `Ctrl+Shift+V` (preview mode)
- Diagrams render automatically

### 4. Export for Presentations
1. Open in https://mermaid.live
2. Click "Actions" → "Export"
3. Choose PNG (high resolution) or SVG
4. Use in PowerPoint/Google Slides

---

## Customization Tips

### Change Colors
```mermaid
graph LR
    A[Node A]
    B[Node B]
    
    style A fill:#FF6B6B,color:#fff
    style B fill:#4F46E5,color:#fff
```

### Add Icons (with FontAwesome)
```mermaid
graph LR
    A[fa:fa-user Student]
    B[fa:fa-server API]
    C[fa:fa-database Database]
    
    A --> B --> C
```

### Adjust Layout Direction
- `TB` = Top to Bottom
- `LR` = Left to Right
- `BT` = Bottom to Top
- `RL` = Right to Left

Example:
```mermaid
graph LR
    A --> B --> C
```

---

**END OF MERMAID DIAGRAMS**

All diagrams are copy-paste ready and can be rendered in:
- Mermaid Live Editor
- GitHub/GitLab
- Notion
- Confluence
- VS Code
- Obsidian
- Draw.io (with plugin)
