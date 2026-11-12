alter table public.course_tasks add column if not exists repeat text
  check (repeat is null or repeat in ('weekly', 'fortnightly'));
