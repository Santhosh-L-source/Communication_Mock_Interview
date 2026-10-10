-- 0002_app.sql: what the running app needs on top of 0001_init.sql
-- (sign-up trigger, extra columns, remaining RLS, storage buckets, webhooks)

-- ---------- Extra columns ----------
alter table interview_sessions add column if not exists plan jsonb not null default '[]';   -- planned questions
alter table profiles add column if not exists coach_paused boolean not null default false;   -- trainer can pause the agent
alter table questions add column if not exists for_student_id uuid references profiles(id) on delete cascade; -- AI practice made for one student
alter table plan_items add column if not exists reason text;                                 -- why the agent picked it

-- ---------- Webhooks for other projects ----------
create table if not exists webhooks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  secret      text not null,                -- used to sign payloads (HMAC-SHA256)
  is_active   boolean not null default true,
  last_status int,
  last_error  text,
  created_at  timestamptz not null default now()
);

-- ---------- New sign-ups get a profile ----------
-- Students sign up with full_name, register_no, department, year_of_study in user metadata.
-- Staff are created by an admin through the API, which sets app_metadata.role (browsers cannot set app_metadata).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  app  jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, full_name, email, register_no, department, year_of_study, cohort_id)
  values (
    new.id,
    coalesce(nullif(app->>'role', '')::user_role, 'student'),
    coalesce(nullif(meta->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(upper(trim(coalesce(meta->>'register_no', ''))), ''),
    nullif(meta->>'department', ''),
    nullif(meta->>'year_of_study', '')::smallint,
    coalesce(nullif(app->>'cohort_id', ''), nullif(meta->>'cohort_id', ''))::uuid
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security for every remaining table ----------
-- The React app reads through the Node API; these policies are the safety net for direct access.
alter table cohorts              enable row level security;
alter table staff_assignments    enable row level security;
alter table rubrics              enable row level security;
alter table rubric_criteria      enable row level security;
alter table questions            enable row level security;
alter table assessments          enable row level security;
alter table assessment_items     enable row level security;
alter table assessment_schedules enable row level security;
alter table attempts             enable row level security;
alter table responses            enable row level security;
alter table integrity_reviews    enable row level security;
alter table practice_plans       enable row level security;
alter table plan_items           enable row level security;
alter table agent_runs           enable row level security;
alter table agent_steps          enable row level security;
alter table alerts               enable row level security;
alter table interventions        enable row level security;
alter table notifications        enable row level security;
alter table ai_usage             enable row level security;
alter table api_clients          enable row level security;
alter table webhooks             enable row level security;

-- Only Node (service role) changes profiles: a student must not edit their own register number or role.
drop policy if exists profiles_update_self on profiles;

create policy cohorts_read on cohorts for select to authenticated using (true);
create policy rubrics_read on rubrics for select to authenticated using (true);
create policy rubric_criteria_read on rubric_criteria for select to authenticated using (true);
create policy assessments_read on assessments for select to authenticated using (true);
create policy schedules_read on assessment_schedules for select to authenticated using (true);
-- questions: no browser policy (answer keys must not leak); served by Node without answer_key.

create policy attempts_select on attempts for select using (public.can_view_student(student_id));
create policy responses_select on responses for select using (
  exists (select 1 from attempts a where a.id = attempt_id and public.can_view_student(a.student_id)));
create policy evaluations_select on evaluations for select using (
  exists (select 1 from profiles p where p.register_no = evaluations.register_no and public.can_view_student(p.id)));
create policy criterion_scores_select on criterion_scores for select using (
  exists (select 1 from evaluations e join profiles p on p.register_no = e.register_no
          where e.id = evaluation_id and public.can_view_student(p.id)));
create policy snapshots_select on readiness_snapshots for select using (public.can_view_student(student_id));
create policy plans_select on practice_plans for select using (public.can_view_student(student_id));
create policy plan_items_select on plan_items for select using (
  exists (select 1 from practice_plans pp where pp.id = plan_id and public.can_view_student(pp.student_id)));
create policy agent_runs_select on agent_runs for select using (
  public.app_role() <> 'student' and public.can_view_student(student_id));
create policy agent_steps_select on agent_steps for select using (
  exists (select 1 from agent_runs r where r.id = run_id and public.app_role() <> 'student' and public.can_view_student(r.student_id)));
create policy alerts_select on alerts for select using (
  public.app_role() <> 'student' and public.can_view_student(student_id));
create policy interventions_select on interventions for select using (
  exists (select 1 from alerts al where al.id = alert_id and public.app_role() <> 'student' and public.can_view_student(al.student_id)));
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy reviews_select on integrity_reviews for select using (
  public.app_role() in ('admin','trainer') and exists (
    select 1 from interview_sessions s where s.id = session_id and public.can_view_student(s.student_id)));
create policy ai_usage_admin on ai_usage for select using (public.app_role() = 'admin');
create policy staff_assignments_read on staff_assignments for select using (
  staff_id = auth.uid() or public.app_role() = 'admin');
-- api_clients, webhooks: no browser policies at all.

-- ---------- Storage buckets (all private) ----------
insert into storage.buckets (id, name, public) values
  ('proctoring-evidence', 'proctoring-evidence', false),
  ('transcripts',         'transcripts',         false),
  ('recordings',          'recordings',          false),
  ('reference-faces',     'reference-faces',     false),
  ('resumes',             'resumes',             false),
  ('question-media',      'question-media',      false)
on conflict (id) do nothing;

create policy question_media_read on storage.objects for select to authenticated
  using (bucket_id = 'question-media');
