-- Add duration_min (minutes) as the primary interview length control.
-- planned_questions stays but becomes auto-derived from duration; constraints relaxed.

-- 1. interview_config
alter table interview_config
  add column if not exists duration_min smallint not null default 10;
alter table interview_config
  add constraint interview_config_duration_min_check check (duration_min between 5 and 30);
alter table interview_config
  drop constraint if exists interview_config_planned_questions_check;
alter table interview_config
  add constraint interview_config_planned_questions_check check (planned_questions between 2 and 15);

-- 2. interview_assignments
alter table interview_assignments
  add column if not exists duration_min smallint not null default 10;
alter table interview_assignments
  add constraint interview_assignments_duration_min_check check (duration_min between 5 and 30);
alter table interview_assignments
  drop constraint if exists interview_assignments_planned_questions_check;
alter table interview_assignments
  add constraint interview_assignments_planned_questions_check check (planned_questions between 2 and 15);

-- 3. interview_sessions (nullable for old rows)
alter table interview_sessions
  add column if not exists duration_min smallint;
