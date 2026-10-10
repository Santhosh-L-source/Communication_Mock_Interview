-- Proctoring events for assessments (lighter than interview proctoring — camera/mic only, no MediaPipe)
create table assessment_proctor_events (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references attempts(id) on delete cascade,
  register_no     text not null references profiles(register_no) on update cascade,
  event_type      proctor_event not null,
  severity        severity_level not null,
  confidence      numeric(4,3) check (confidence between 0 and 1),
  detected_by     text not null default 'browser' check (detected_by in ('browser','server')),
  occurred_at     timestamptz not null,
  duration_ms     int,
  snapshot_path   text,
  details         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index on assessment_proctor_events (attempt_id, occurred_at);
