-- Practice interviews are not stored permanently; this flag marks them for cleanup.
alter table interview_sessions add column if not exists is_practice boolean not null default false;
