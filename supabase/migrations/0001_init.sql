-- 0001_init.sql
create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type user_role        as enum ('student','trainer','mentor','coordinator','admin');
create type skill_dimension  as enum ('reading','writing','listening','speaking');
create type question_type    as enum ('mcq','short_text','long_text','listening_mcq','spoken','interview');
create type content_status   as enum ('draft','approved','retired');
create type attempt_kind     as enum ('baseline','practice','reattempt','scheduled');
create type attempt_status   as enum ('in_progress','submitted','evaluating','evaluated','abandoned');
create type interview_type   as enum ('hr','self_intro','project','technical','situational','jam');
create type interview_status as enum ('setup','in_progress','completed','terminated','scoring','scored','error');
create type speaker_kind     as enum ('ai','student');
create type integrity_status as enum ('clean','needs_review','flagged','cleared','confirmed_cheating');
create type proctor_event    as enum ('no_face','multiple_faces','face_mismatch','looking_away',
  'phone_detected','book_or_notes','second_voice','tab_switch','window_blur','fullscreen_exit',
  'copy_paste','camera_off','mic_off','virtual_camera','multiple_displays','script_reading','random_check');
create type severity_level   as enum ('info','low','medium','high');
create type evaluator_kind   as enum ('auto','ai','trainer');
create type alert_status     as enum ('open','in_progress','resolved','dismissed');

-- ---------- People ----------
create table cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  department  text,
  batch_year  int,
  created_at  timestamptz not null default now()
);

create table profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  role                   user_role not null default 'student',
  full_name              text not null,
  email                  text not null unique,
  register_no            text unique,  -- college register number: the key other systems use
  department             text,
  year_of_study          smallint check (year_of_study between 1 and 5),
  cohort_id              uuid references cohorts(id),
  target_roles           text[] not null default '{}',
  resume_path            text,          -- storage: resumes/{id}/resume.pdf
  reference_face_path    text,          -- storage: reference-faces/{id}/enrolled.jpg
  recording_consent_at   timestamptz,
  proctoring_consent_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (role <> 'student' or register_no is not null)   -- every student must have one
);
create index on profiles (cohort_id);

create table staff_assignments (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles(id) on delete cascade,
  relation    text not null check (relation in ('trainer','mentor')),
  cohort_id   uuid references cohorts(id) on delete cascade,
  student_id  uuid references profiles(id) on delete cascade,
  check (cohort_id is not null or student_id is not null)
);
create index on staff_assignments (staff_id);

-- ---------- Content ----------
create table rubrics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  applies_to  text not null check (applies_to in ('writing','speaking','interview')),
  version     int  not null default 1,
  is_active   boolean not null default true,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (name, version)
);

create table rubric_criteria (
  id                uuid primary key default gen_random_uuid(),
  rubric_id         uuid not null references rubrics(id) on delete cascade,
  key               text not null,          -- e.g. 'grammar', 'situation_handling'
  label             text not null,
  group_name        text not null,          -- 'language_delivery' | 'content_thinking' | 'presence'
  weight            numeric(5,2) not null check (weight > 0),
  scored_by         text not null check (scored_by in ('computed','ai','ai_vision')),
  band_descriptors  jsonb not null,         -- {"0": "...", "1": "...", ... "4": "..."}
  applies_to_types  interview_type[],       -- null = all types
  sort_order        int not null default 0,
  unique (rubric_id, key)
);

create table questions (
  id               uuid primary key default gen_random_uuid(),
  dimension        skill_dimension not null,
  sub_skill        text not null,
  type             question_type not null,
  interview_type   interview_type,
  difficulty       smallint not null check (difficulty between 1 and 5),
  context          text,                  -- 'hr', 'technical', 'email', 'gd' ...
  prompt           text not null,
  passage          text,
  media_path       text,                  -- storage: question-media/...
  options          jsonb,                 -- MCQ options
  answer_key       jsonb,
  expected_points  text[],                -- what a good answer covers
  rubric_id        uuid references rubrics(id),
  time_limit_s     int,
  status           content_status not null default 'draft',
  source           text not null default 'trainer' check (source in ('trainer','ai')),
  version          int not null default 1,
  created_by       uuid references profiles(id),
  approved_by      uuid references profiles(id),
  created_at       timestamptz not null default now()
);
create index on questions (dimension, sub_skill, difficulty) where status = 'approved';

create table assessments (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  is_baseline   boolean not null default false,
  duration_min  int not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table assessment_items (
  assessment_id  uuid references assessments(id) on delete cascade,
  question_id    uuid references questions(id),
  position       int not null,
  points         numeric(5,2) not null default 1,
  primary key (assessment_id, question_id)
);

create table assessment_schedules (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  cohort_id      uuid not null references cohorts(id) on delete cascade,
  opens_at       timestamptz not null,
  closes_at      timestamptz not null check (closes_at > opens_at),
  max_attempts   int not null default 1
);

-- ---------- Attempts ----------
create table attempts (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references profiles(id) on delete cascade,
  register_no    text not null references profiles(register_no) on update cascade,
  assessment_id  uuid references assessments(id),
  schedule_id    uuid references assessment_schedules(id),
  kind           attempt_kind not null,
  status         attempt_status not null default 'in_progress',
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  total_score    numeric(5,2)
);
create index on attempts (student_id, started_at desc);
create index on attempts (register_no);

create table responses (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references attempts(id) on delete cascade,
  question_id      uuid not null references questions(id),
  answer_text      text,
  selected_option  text,
  audio_path       text,                  -- storage: recordings/...
  duration_s       numeric(6,2),
  is_correct       boolean,
  saved_at         timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------- AI interviews ----------
create table interview_sessions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references profiles(id) on delete cascade,
  register_no       text not null references profiles(register_no) on update cascade,
  interview_type    interview_type not null,
  difficulty        smallint not null default 2 check (difficulty between 1 and 5),
  company_style     text,
  rubric_id         uuid references rubrics(id),
  status            interview_status not null default 'setup',
  planned_questions smallint not null default 6,
  started_at        timestamptz,
  ended_at          timestamptz,
  end_reason        text,                 -- 'completed' | 'student_left' | 'integrity_terminated' | 'error'
  transcript_path   text,                 -- storage: transcripts/{register_no}/{id}/transcript.json
  overall_score     numeric(5,2),
  integrity_score   numeric(5,2) not null default 100,
  integrity_status  integrity_status not null default 'clean',
  device_info       jsonb,                -- browser, camera label, screen info
  ai_models         jsonb,                -- models + versions used, for audit
  created_at        timestamptz not null default now()
);
create index on interview_sessions (student_id, created_at desc);
create index on interview_sessions (register_no, ended_at desc);
create index on interview_sessions (integrity_status) where integrity_status in ('needs_review','flagged');

create table interview_turns (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references interview_sessions(id) on delete cascade,
  seq           int not null,
  speaker       speaker_kind not null,
  question_id   uuid references questions(id),
  is_follow_up  boolean not null default false,
  text          text not null,
  audio_path    text,
  started_ms    int,                      -- offset from session start
  ended_ms      int,
  words         jsonb,                    -- [{w, start, end, conf, speaker, filler}]
  metrics       jsonb,                    -- {wpm, pause_ratio, fillers_per_min, longest_pause_s, gaze_on_screen_pct}
  unique (session_id, seq)
);

-- ---------- Anti-cheat ----------
create table proctoring_events (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references interview_sessions(id) on delete cascade,
  register_no         text not null references profiles(register_no) on update cascade,
  turn_id             uuid references interview_turns(id),
  event_type          proctor_event not null,
  severity            severity_level not null,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  detected_by         text not null check (detected_by in ('browser','server','audio_ai','vision_ai')),
  occurred_at         timestamptz not null,
  offset_ms           int,
  duration_ms         int,
  snapshot_path       text,               -- proctoring-evidence/{register_no}/{session}/{id}.jpg
  evidence_json_path  text,               -- proctoring-evidence/{register_no}/{session}/{id}.json
  transcript_excerpt  text,               -- also kept in the row for quick display
  details             jsonb not null default '{}',
  ai_verdict          text check (ai_verdict in ('confirmed','rejected','uncertain')),
  ai_verdict_detail   jsonb,
  penalty             numeric(5,2) not null default 0,
  created_at          timestamptz not null default now()
);
create index on proctoring_events (session_id, occurred_at);
create index on proctoring_events (register_no, occurred_at desc);

create table integrity_reviews (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references interview_sessions(id) on delete cascade,
  register_no  text not null references profiles(register_no) on update cascade,
  reviewer_id  uuid not null references profiles(id),
  decision     integrity_status not null check (decision in ('cleared','confirmed_cheating','needs_review')),
  notes        text not null,
  created_at   timestamptz not null default now()
);

-- ---------- Scoring ----------
create table evaluations (
  id                    uuid primary key default gen_random_uuid(),
  response_id           uuid references responses(id) on delete cascade,
  interview_session_id  uuid references interview_sessions(id) on delete cascade,
  register_no           text not null references profiles(register_no) on update cascade,
  evaluator             evaluator_kind not null,
  rubric_id             uuid references rubrics(id),
  rubric_version        int,
  model_id              text,             -- e.g. 'gemini-flash', 'groq/whisper-large-v3-turbo'
  overall               numeric(5,2) not null,
  feedback              jsonb,            -- strengths, improvements, better answers
  metrics               jsonb,
  status                text not null default 'final' check (status in ('final','needs_review','superseded')),
  supersedes_id         uuid references evaluations(id),   -- set on trainer override
  override_reason       text,
  created_by            uuid references profiles(id),
  created_at            timestamptz not null default now(),
  check (num_nonnulls(response_id, interview_session_id) = 1)
);
create index on evaluations (register_no, created_at desc);

create table criterion_scores (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references evaluations(id) on delete cascade,
  criterion_key  text not null,
  turn_id        uuid references interview_turns(id),  -- null = whole session
  band           smallint check (band between 0 and 4),
  score          numeric(5,2),            -- marks after weighting; null when N/A
  weight         numeric(5,2) not null,
  reason         text,
  evidence       jsonb                    -- quotes from the answer
);
create index on criterion_scores (evaluation_id);

-- ---------- Progress ----------
create table readiness_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references profiles(id) on delete cascade,
  register_no        text not null references profiles(register_no) on update cascade,
  reading            numeric(5,2),
  writing            numeric(5,2),
  listening          numeric(5,2),
  speaking           numeric(5,2),
  interview          numeric(5,2),
  overall            numeric(5,2) not null,
  level              smallint not null check (level between 1 and 4),
  weakest_dimension  skill_dimension,
  weakest_sub_skill  text,
  cause              text,                -- 'baseline' | 'evaluation:{id}' | 'recalc'
  created_at         timestamptz not null default now()
);
create index on readiness_snapshots (student_id, created_at desc);
create index on readiness_snapshots (register_no, created_at desc);

-- ---------- Coaching ----------
create table practice_plans (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles(id) on delete cascade,
  week_start  date not null,
  summary     text,
  status      text not null default 'active' check (status in ('active','completed','replaced')),
  agent_run_id uuid,
  created_at  timestamptz not null default now(),
  unique (student_id, week_start)
);

create table plan_items (
  id                    uuid primary key default gen_random_uuid(),
  plan_id               uuid not null references practice_plans(id) on delete cascade,
  question_id           uuid references questions(id),
  interview_type        interview_type,
  target_dimension      skill_dimension not null,
  target_sub_skill      text,
  due_date              date,
  status                text not null default 'pending' check (status in ('pending','done','skipped')),
  result_evaluation_id  uuid references evaluations(id)
);

create table agent_runs (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references profiles(id) on delete cascade,
  trigger          text not null,          -- 'evaluation_completed' | 'weekly' | 'manual'
  idempotency_key  text not null unique,
  state            text not null,          -- current state-machine state
  context          jsonb not null default '{}',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  error            text
);

create table agent_steps (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id) on delete cascade,
  seq         int not null,
  step        text not null,
  tool        text,
  input       jsonb,
  output      jsonb,
  verified    boolean,
  created_at  timestamptz not null default now(),
  unique (run_id, seq)
);

-- ---------- Alerts ----------
create table alerts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('persistent_weakness','missed_plan','integrity')),
  dimension    skill_dimension,
  session_id   uuid references interview_sessions(id),
  severity     severity_level not null,
  reason       text not null,
  status       alert_status not null default 'open',
  assigned_to  uuid references profiles(id),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create table interventions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  staff_id    uuid not null references profiles(id),
  action      text not null,
  notes       text,
  due_date    date,
  outcome     text,
  created_at  timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Operations ----------
create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,              -- 'evaluation.override', 'evidence.view', 'role.change' ...
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create table ai_usage (
  id             bigint generated always as identity primary key,
  purpose        text not null,           -- 'interviewer' | 'scoring' | 'vision_check' | 'stt' | 'tts'
  provider       text not null,
  model          text,
  input_tokens   int,
  output_tokens  int,
  audio_seconds  numeric(8,2),
  latency_ms     int,
  cost_usd       numeric(10,5),
  session_id     uuid,
  created_at     timestamptz not null default now()
);

-- Systems allowed to read scores through the Node API (e.g. the other project)
create table api_clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  key_hash      text not null unique,     -- SHA-256 of the API key; the key itself is never stored
  scopes        text[] not null default '{scores:read}',
  is_active     boolean not null default true,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------- Register number on every score row ----------
-- Node only passes student_id; these triggers copy the register number in.
create or replace function public.fill_register_no() returns trigger
language plpgsql as $$
begin
  if new.register_no is null then
    select register_no into new.register_no from profiles where id = new.student_id;
  end if;
  return new;
end $$;

create trigger attempts_register_no  before insert on attempts
  for each row execute function public.fill_register_no();
create trigger sessions_register_no  before insert on interview_sessions
  for each row execute function public.fill_register_no();
create trigger snapshots_register_no before insert on readiness_snapshots
  for each row execute function public.fill_register_no();

create or replace function public.fill_evaluation_register_no() returns trigger
language plpgsql as $$
begin
  if new.register_no is null then
    if new.response_id is not null then
      select a.register_no into new.register_no
      from responses r join attempts a on a.id = r.attempt_id
      where r.id = new.response_id;
    else
      select s.register_no into new.register_no
      from interview_sessions s where s.id = new.interview_session_id;
    end if;
  end if;
  return new;
end $$;

create trigger evaluations_register_no before insert on evaluations
  for each row execute function public.fill_evaluation_register_no();

create or replace function public.fill_register_no_from_session() returns trigger
language plpgsql as $$
begin
  if new.register_no is null then
    select register_no into new.register_no from interview_sessions where id = new.session_id;
  end if;
  return new;
end $$;

create trigger proctoring_register_no before insert on proctoring_events
  for each row execute function public.fill_register_no_from_session();
create trigger reviews_register_no    before insert on integrity_reviews
  for each row execute function public.fill_register_no_from_session();

-- ---------- Export for other projects (keyed by register number) ----------
create schema if not exists export;

-- One row per student with their latest scores
create or replace view export.student_scores as
select
  p.register_no,
  p.full_name,
  p.department,
  p.year_of_study,
  c.name                 as cohort,
  rs.reading, rs.writing, rs.listening, rs.speaking, rs.interview,
  rs.overall             as readiness_score,
  rs.level               as readiness_level,
  rs.created_at          as readiness_updated_at,
  li.id                  as last_interview_id,
  li.interview_type      as last_interview_type,
  case when li.integrity_status in ('clean','cleared')
       then li.overall_score end as last_interview_score,   -- hidden until integrity is clear
  li.integrity_status    as last_interview_integrity,
  li.ended_at            as last_interview_at,
  (select count(*) from interview_sessions s
    where s.register_no = p.register_no and s.status = 'scored') as interviews_completed
from profiles p
left join cohorts c on c.id = p.cohort_id
left join lateral (
  select * from readiness_snapshots r
  where r.register_no = p.register_no
  order by r.created_at desc limit 1) rs on true
left join lateral (
  select * from interview_sessions s
  where s.register_no = p.register_no and s.status = 'scored'
  order by s.ended_at desc limit 1) li on true
where p.role = 'student';

-- One row per scored interview, with marks per rubric criterion
create or replace view export.interview_results as
select
  s.register_no,
  s.id                   as session_id,
  s.interview_type,
  s.ended_at,
  case when s.integrity_status in ('clean','cleared')
       then s.overall_score end as overall_score,
  s.integrity_score,
  s.integrity_status,
  (select jsonb_object_agg(cs.criterion_key, cs.score)
     from criterion_scores cs
    where cs.evaluation_id = e.id and cs.turn_id is null) as criteria
from interview_sessions s
join evaluations e on e.interview_session_id = s.id and e.status = 'final'
where s.status = 'scored';

-- One row per interview: did the student cheat? (final admin decision + evidence counts)
create or replace view export.integrity_results as
select
  s.register_no,
  s.id                 as session_id,
  s.interview_type,
  s.started_at,
  s.ended_at,
  s.end_reason,
  s.integrity_score,
  s.integrity_status,                               -- clean | needs_review | flagged | cleared | confirmed_cheating
  (s.integrity_status = 'confirmed_cheating') as malpractice_confirmed,
  r.decision           as review_decision,
  r.notes              as review_notes,
  r.created_at         as reviewed_at,
  s.transcript_path,                                -- transcripts/{register_no}/{session}/transcript.json
  (select count(*) from proctoring_events e
    where e.session_id = s.id and e.severity = 'high'
      and coalesce(e.ai_verdict, 'uncertain') <> 'rejected') as high_severity_events,
  (select count(*) from proctoring_events e
    where e.session_id = s.id and e.snapshot_path is not null
      and e.event_type <> 'random_check') as evidence_photos
from interview_sessions s
left join lateral (
  select * from integrity_reviews ir
  where ir.session_id = s.id
  order by ir.created_at desc limit 1) r on true
where s.status in ('completed','terminated','scoring','scored');

-- One row per malpractice event with its photo and the transcript around it
create or replace view export.malpractice_evidence as
select
  e.register_no,
  e.session_id,
  e.id                 as event_id,
  e.event_type,
  e.severity,
  e.confidence,
  e.detected_by,
  e.ai_verdict,
  e.occurred_at,
  e.transcript_excerpt,
  e.snapshot_path,                                  -- proctoring-evidence/{register_no}/{session}/{event}.jpg
  e.evidence_json_path
from proctoring_events e
where e.event_type <> 'random_check'
  and coalesce(e.ai_verdict, 'uncertain') <> 'rejected';

-- EVERYTHING for one student in one row: the only thing the other project needs to read.
-- Shape is versioned (v1): fields are only ever added, never renamed or removed.
create or replace view export.student_report as
select
  sc.register_no,
  sc.full_name,
  sc.department,
  sc.year_of_study,
  sc.cohort,
  jsonb_build_object(
    'reading', sc.reading, 'writing', sc.writing, 'listening', sc.listening,
    'speaking', sc.speaking, 'interview', sc.interview,
    'score', sc.readiness_score, 'level', sc.readiness_level,
    'updated_at', sc.readiness_updated_at)                        as readiness,
  exists (select 1 from export.integrity_results ir
           where ir.register_no = sc.register_no
             and ir.malpractice_confirmed)                         as malpractice_confirmed,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'session_id',            ir.session_id,
      'type',                  ir.interview_type,
      'started_at',            ir.started_at,
      'ended_at',              ir.ended_at,
      'end_reason',            ir.end_reason,
      'overall_score',         res.overall_score,
      'criteria',              res.criteria,
      'integrity_score',       ir.integrity_score,
      'integrity_status',      ir.integrity_status,
      'malpractice_confirmed', ir.malpractice_confirmed,
      'review', case when ir.review_decision is null then null else
                  jsonb_build_object('decision', ir.review_decision,
                                     'notes', ir.review_notes,
                                     'reviewed_at', ir.reviewed_at) end,
      'transcript_path',       ir.transcript_path,
      'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'event_id', me.event_id, 'type', me.event_type,
                   'severity', me.severity, 'ai_verdict', me.ai_verdict,
                   'occurred_at', me.occurred_at,
                   'transcript_excerpt', me.transcript_excerpt,
                   'photo_path', me.snapshot_path) order by me.occurred_at)
          from export.malpractice_evidence me
          where me.session_id = ir.session_id), '[]'::jsonb)
    ) order by ir.ended_at desc)
    from export.integrity_results ir
    left join export.interview_results res on res.session_id = ir.session_id
    where ir.register_no = sc.register_no), '[]'::jsonb)          as interviews,
  greatest(sc.readiness_updated_at,
           (select max(greatest(ir.ended_at, ir.reviewed_at))
              from export.integrity_results ir
             where ir.register_no = sc.register_no))               as updated_at
from export.student_scores sc;

-- Not exposed to browsers; read by Node (service role) or a read-only login
revoke all on schema export from anon, authenticated;
-- Optional direct database access for the other project (set the password in the dashboard, not in git):
--   create role score_reader login password '...';
--   grant usage on schema export to score_reader;
--   grant select on all tables in schema export to score_reader;
--   (student_report reads the other export views, so granting all of them is enough)

-- ================= RLS =================
-- Helper functions (security definer so they can read profiles)
create or replace function public.app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.can_view_student(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = target
      or public.app_role() in ('admin','coordinator')
      or exists (
           select 1 from staff_assignments sa
           join profiles p on p.id = target
           where sa.staff_id = auth.uid()
             and (sa.student_id = target or sa.cohort_id = p.cohort_id))
$$;

-- Enable RLS everywhere
alter table profiles            enable row level security;
alter table interview_sessions  enable row level security;
alter table interview_turns     enable row level security;
alter table proctoring_events   enable row level security;
alter table evaluations         enable row level security;
alter table criterion_scores    enable row level security;
alter table readiness_snapshots enable row level security;
alter table audit_log           enable row level security;
-- ...repeat for every table

-- Profiles: see yourself, staff see their students
create policy profiles_select on profiles for select using (public.can_view_student(id));
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

-- Interview data: student sees own; assigned staff see theirs
create policy sessions_select on interview_sessions for select using (public.can_view_student(student_id));
create policy turns_select on interview_turns for select using (
  exists (select 1 from interview_sessions s where s.id = session_id and public.can_view_student(s.student_id)));

-- Proctoring evidence: admins and assigned trainers only (not coordinators, not the student)
create policy proctoring_select on proctoring_events for select using (
  public.app_role() in ('admin','trainer') and exists (
    select 1 from interview_sessions s where s.id = session_id and public.can_view_student(s.student_id)));

-- Audit log: admins read; nobody updates or deletes
create policy audit_select on audit_log for select using (public.app_role() = 'admin');
revoke update, delete on audit_log from authenticated, anon;

-- Realtime for live alerts
alter publication supabase_realtime add table proctoring_events, alerts;

-- ================= Storage policies =================
-- Students upload and read only inside their own resumes folder
create policy resumes_own on storage.objects for all to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Evidence: no insert/update/delete policy for any user (only the service role writes).
-- Admins get read access; Node still hands out short signed URLs and logs each view.
create policy evidence_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'proctoring-evidence' and public.app_role() = 'admin');
