-- Study materials move out of the repository into the database, so content updates
-- no longer commit to main. Clinic and Tutoring get a task list.

create table if not exists public.study_materials (
  id text primary key,
  course text not null check (course in ('il','asy','pr')),
  kind text not null check (kind in ('flashcard','flowchart','outline','comparison','drill','hypothetical')),
  batch text not null,
  data jsonb not null,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data->>'id' = id and data->>'course' = course and data->>'kind' = kind)
);

create table if not exists public.study_runs (
  id text primary key,
  run_date date not null,
  data jsonb not null,
  checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (data->>'id' = id)
);

create table if not exists public.course_tasks (
  id uuid primary key default gen_random_uuid(),
  course text not null check (course in ('clinic','tutoring')),
  title text not null check (length(btrim(title)) between 1 and 300),
  notes text not null default '',
  due date,
  flagged boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists course_tasks_open on public.course_tasks (course, due) where done_at is null;

alter table public.study_materials enable row level security;
alter table public.study_runs enable row level security;
alter table public.course_tasks enable row level security;
create policy owner_read on public.study_materials for select to authenticated using ((select public.is_owner()));
create policy owner_read on public.study_runs for select to authenticated using ((select public.is_owner()));
create policy owner_all on public.course_tasks for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- Atomic publication for the study-material task. Item-level validation happens in
-- scripts/publish-study-batch.ts first; this function refuses overwrites and partial runs.
create or replace function public.publish_study_batch(p jsonb) returns jsonb
language plpgsql set search_path to '' as $$
declare
  r jsonb := p->'run';
  m jsonb;
  n int := 0;
begin
  if r is null or coalesce(r->>'id', '') = '' or coalesce(r->>'run_date', '') = '' then raise exception 'Batch requires a run with id and run_date'; end if;
  if exists (select 1 from public.study_runs where id = r->>'id') then raise exception 'Run % is already published', r->>'id'; end if;
  if jsonb_typeof(p->'materials') <> 'array' or jsonb_array_length(p->'materials') = 0 then raise exception 'Batch has no materials'; end if;
  if (r->>'added')::int <> jsonb_array_length(p->'materials') then raise exception 'Added count does not match materials'; end if;
  if jsonb_typeof(p->'checks') <> 'array' or jsonb_array_length(p->'checks') < jsonb_array_length(p->'materials') then raise exception 'Checker results are required for every draft'; end if;
  for m in select value from jsonb_array_elements(p->'materials') loop
    if jsonb_typeof(m->'verified') <> 'object' or coalesce(m->'verified'->>'checker', '') = '' then raise exception 'Unverified material %', m->>'id'; end if;
    if m->>'batch' <> r->>'run_date' then raise exception 'Batch date mismatch for %', m->>'id'; end if;
    if exists (select 1 from public.study_materials where id = m->>'id') then raise exception 'Refusing to overwrite %', m->>'id'; end if;
    insert into public.study_materials (id, course, kind, batch, data) values (m->>'id', m->>'course', m->>'kind', m->>'batch', m);
    n := n + 1;
  end loop;
  insert into public.study_runs (id, run_date, data, checks, created_at)
    values (r->>'id', (r->>'run_date')::date, r, p->'checks', coalesce((r->>'created_at')::timestamptz, now()));
  return jsonb_build_object('run', r->>'id', 'added', n);
end $$;
revoke all on function public.publish_study_batch(jsonb) from public, anon, authenticated;
