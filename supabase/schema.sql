-- Lawstin database (Supabase project vbqfmgsrxurdazujbbuk).
-- This is the schema as applied. Austin's login is created separately in Supabase Auth.

create type public.course_code as enum ('asy','il','pr');
create type public.choice_role as enum ('average','bad','correct','sneaky');

create table public.questions (
  id text primary key,                -- {course}-{YYYYMMDD}-{nn}
  course public.course_code not null,
  topic text not null,
  subtopic text,
  class_day integer,
  class_date date,
  source text,
  source_files jsonb not null default '[]'::jsonb,
  source_section text,
  batch text,
  retired boolean not null default false,
  stem text not null,
  prompt text not null,
  choices jsonb not null,             -- [{id:"A".."D", role, text, why}]
  answer text not null,
  rule text,
  authority text,
  verified jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progress (
  question_id text primary key references public.questions(id) on delete cascade,
  seen integer not null default 0,
  correct integer not null default 0,
  wrong integer not null default 0,
  box integer not null default 0,     -- spaced-review box 0–5
  due date,
  last_choice text,
  last_correct boolean,
  last_at timestamptz,
  miss_sneaky integer not null default 0,
  miss_average integer not null default 0,
  miss_bad integer not null default 0,
  flag_note text,
  flag_at timestamptz,
  starred boolean not null default false,
  guessed integer not null default 0
);

create table public.answers (
  id bigserial primary key,
  question_id text not null references public.questions(id) on delete cascade,
  choice text not null,
  is_correct boolean not null,
  role public.choice_role not null,
  local_date date not null,
  answered_at timestamptz not null default now()
);
create index answers_local_date_idx on public.answers(local_date);
create index answers_question_idx on public.answers(question_id);

create table public.runs (
  run_date date primary key,
  added integer not null default 0,
  by_course jsonb not null default '{}'::jsonb,
  retired integer not null default 0,
  fixed integer not null default 0,
  check_counts jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Only Austin's account can read or change anything.
create or replace function public.is_owner() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'email') = 'trevinoaustin10@gmail.com', false)
$$;

alter table public.questions enable row level security;
alter table public.progress enable row level security;
alter table public.answers enable row level security;
alter table public.runs enable row level security;

create policy owner_read on public.questions for select to authenticated using ((select public.is_owner()));
create policy owner_all on public.progress for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.answers for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_read on public.runs for select to authenticated using ((select public.is_owner()));

-- Everything the app shows, in one call.
create or replace function public.get_state(p_today date default current_date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Not signed in'; end if;
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'course', q.course, 'topic', q.topic, 'subtopic', q.subtopic,
        'classDay', q.class_day, 'classDate', q.class_date, 'source', q.source, 'batch', q.batch,
        'stem', q.stem, 'prompt', q.prompt, 'choices', q.choices, 'answer', q.answer,
        'rule', q.rule, 'authority', q.authority) order by q.created_at)
      from public.questions q where not q.retired), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
        'questionId', p.question_id, 'seen', p.seen, 'correct', p.correct, 'wrong', p.wrong,
        'box', p.box, 'due', p.due, 'lastChoice', p.last_choice, 'lastCorrect', p.last_correct,
        'lastAt', p.last_at, 'missSneaky', p.miss_sneaky, 'missAverage', p.miss_average,
        'missBad', p.miss_bad, 'guessed', p.guessed, 'starred', p.starred, 'flagged', p.flag_at is not null))
      from public.progress p), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(jsonb_build_object(
        'date', r.run_date, 'added', r.added, 'byCourse', r.by_course, 'note', r.note) order by r.run_date desc)
      from (select * from public.runs order by run_date desc limit 60) r), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', d.local_date, 'answered', d.answered, 'correct', d.correct))
      from (select local_date, count(*)::int answered, (count(*) filter (where is_correct))::int correct
            from public.answers where local_date >= p_today - 120 group by local_date) d), '[]'::jsonb)
  );
end $$;

-- Save one answer and update the review schedule.
create or replace function public.record_answer(p_question_id text, p_choice text, p_local_date date)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  q record; prev public.progress; picked jsonb; is_right boolean; prev_seen int; new_box int; intervals int[] := array[0,1,3,7,16,35];
  r public.progress; pick_role public.choice_role;
begin
  if not public.is_owner() then raise exception 'Not signed in'; end if;
  if p_choice not in ('A','B','C','D') then raise exception 'Choice not found'; end if;
  select id, answer, choices into q from public.questions where id = p_question_id;
  if not found then raise exception 'Question not found'; end if;
  select c into picked from jsonb_array_elements(q.choices) c where c->>'id' = p_choice;
  if picked is null then raise exception 'Choice not found'; end if;
  pick_role := (picked->>'role')::public.choice_role;
  is_right := p_choice = q.answer;
  select * into prev from public.progress where question_id = q.id;
  prev_seen := coalesce(prev.seen, 0);
  if not is_right then new_box := 1;
  elsif prev_seen = 0 then new_box := 2;
  else new_box := least(greatest(coalesce(prev.box,0), 1) + 1, 5); end if;

  insert into public.progress as pr (question_id, seen, correct, wrong, box, due, last_choice, last_correct, last_at, miss_sneaky, miss_average, miss_bad)
  values (q.id, 1, case when is_right then 1 else 0 end, case when is_right then 0 else 1 end, new_box,
          p_local_date + intervals[new_box + 1], p_choice, is_right, now(),
          case when not is_right and pick_role = 'sneaky' then 1 else 0 end,
          case when not is_right and pick_role not in ('sneaky','bad') then 1 else 0 end,
          case when not is_right and pick_role = 'bad' then 1 else 0 end)
  on conflict (question_id) do update set
    seen = pr.seen + 1,
    correct = pr.correct + case when is_right then 1 else 0 end,
    wrong = pr.wrong + case when is_right then 0 else 1 end,
    box = excluded.box, due = excluded.due, last_choice = excluded.last_choice,
    last_correct = excluded.last_correct, last_at = excluded.last_at,
    miss_sneaky = pr.miss_sneaky + excluded.miss_sneaky,
    miss_average = pr.miss_average + excluded.miss_average,
    miss_bad = pr.miss_bad + excluded.miss_bad
  returning * into r;

  insert into public.answers (question_id, choice, is_correct, role, local_date)
  values (q.id, p_choice, is_right, pick_role, p_local_date);

  return jsonb_build_object('correct', is_right, 'progress', jsonb_build_object(
    'questionId', r.question_id, 'seen', r.seen, 'correct', r.correct, 'wrong', r.wrong, 'box', r.box,
    'due', r.due, 'lastChoice', r.last_choice, 'lastCorrect', r.last_correct, 'lastAt', r.last_at,
    'missSneaky', r.miss_sneaky, 'missAverage', r.miss_average, 'missBad', r.miss_bad,
    'guessed', r.guessed, 'starred', r.starred, 'flagged', r.flag_at is not null));
end $$;

-- Star, flag, or mark a lucky guess.
create or replace function public.mark_question(p_action text, p_question_id text, p_starred boolean default null, p_note text default null, p_local_date date default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare prev_guessed int; note text;
begin
  if not public.is_owner() then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.questions where id = p_question_id) then raise exception 'Question not found'; end if;
  if p_action = 'guess' then
    select guessed into prev_guessed from public.progress where question_id = p_question_id;
    if not found then raise exception 'Answer the question first'; end if;
    update public.progress set box = 1, due = p_local_date + 1, guessed = prev_guessed + 1 where question_id = p_question_id;
  elsif p_action = 'star' then
    insert into public.progress (question_id, starred) values (p_question_id, coalesce(p_starred,false))
    on conflict (question_id) do update set starred = excluded.starred;
  elsif p_action = 'flag' then
    note := coalesce(nullif(btrim(left(p_note, 2000)), ''), '(no note)');
    insert into public.progress (question_id, flag_note, flag_at) values (p_question_id, note, now())
    on conflict (question_id) do update set flag_note = excluded.flag_note, flag_at = excluded.flag_at;
  else raise exception 'Unknown action'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.get_state(date), public.record_answer(text,text,date), public.mark_question(text,text,boolean,text,date) from public, anon;
grant execute on function public.get_state(date), public.record_answer(text,text,date), public.mark_question(text,text,boolean,text,date) to authenticated;
