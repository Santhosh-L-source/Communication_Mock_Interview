-- Store admission year instead of static year_of_study.
-- year_of_study is computed: if month >= 6, (current_year - admission_year + 1), else (current_year - admission_year).
alter table profiles add column if not exists admission_year smallint;

-- Backfill: derive admission_year from existing year_of_study
update profiles
  set admission_year = extract(year from now())::int - year_of_study + 1
where year_of_study is not null and admission_year is null;
