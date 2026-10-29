-- Flashcard grades and sorting-drill answers count toward the day like quiz answers:
-- streak, daily goal, 7-day accuracy, and the Activity chart.
create table if not exists public.study_events (
  id bigserial primary key,
  kind text not null check (kind in ('card', 'drill')),
  item_id text not null,
  correct boolean not null,
  local_date date not null,
  at timestamptz not null default now()
);
create index if not exists study_events_day on public.study_events (local_date);
alter table public.study_events enable row level security;
create policy owner_all on public.study_events for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create or replace function public.get_state(p_today date default current_date)
returns jsonb language plpgsql stable set search_path to '' as $function$
begin
  if not (public.is_owner() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'Not signed in'; end if;
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
      from (select local_date, count(*)::int answered, (count(*) filter (where ok))::int correct
            from (select local_date, is_correct as ok from public.answers where local_date >= p_today - 120
                  union all
                  select local_date, correct from public.study_events where local_date >= p_today - 120) x
            group by local_date) d), '[]'::jsonb)
  );
end $function$;
