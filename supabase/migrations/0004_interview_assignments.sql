-- Admin-created AI interview assignments with deadlines.
-- Each student can attempt each assignment only once.
create table interview_assignments (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  interview_type    interview_type not null default 'hr',
  difficulty        smallint not null default 2 check (difficulty between 1 and 5),
  planned_questions smallint not null default 5 check (planned_questions between 3 and 8),
  deadline          timestamptz,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

alter table interview_assignments enable row level security;
create policy ia_read on interview_assignments for select to authenticated using (true);

-- Link interview sessions to an assignment (nullable for free-practice interviews)
alter table interview_sessions add column if not exists assignment_id uuid references interview_assignments(id);
