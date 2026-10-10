-- Global interview settings controlled by admins.
-- Single-row table: the boolean PK + CHECK ensures exactly one row.
create table interview_config (
  id                boolean primary key default true check (id),
  interview_type    interview_type not null default 'hr',
  difficulty        smallint not null default 2 check (difficulty between 1 and 5),
  planned_questions smallint not null default 5 check (planned_questions between 3 and 8),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references profiles(id)
);

insert into interview_config (interview_type, difficulty, planned_questions)
values ('hr', 2, 5);

alter table interview_config enable row level security;
create policy interview_config_read on interview_config for select to authenticated using (true);

-- Deadline on assessments so admin can set a completion date
alter table assessments add column if not exists deadline timestamptz;
