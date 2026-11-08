-- Voice questions: short open-ended prompts for spoken quizzes in Claude and ChatGPT.
-- Each question stores its own answer key (model answer, key points, likely mistakes)
-- and a compact follow-up bank (rule, cases, notes) so the assistant can judge a
-- spoken answer and handle follow-ups without searching Drive. The assistant grades;
-- the database records the verdict on its own spaced-review schedule.

create table public.voice_questions (
  id text primary key check (id ~ '^(il|asy|pr)-voice-[0-9]{8}-[0-9]{2}$'),
  course public.course_code not null,
  topic text not null check (length(btrim(topic)) > 0),
  subtopic text,
  class_day integer,
  class_date date,
  batch text,
  prompt text not null check (length(btrim(prompt)) between 5 and 240),
  answer text not null check (length(btrim(answer)) > 0),
  key_points jsonb not null check (jsonb_typeof(key_points) = 'array' and jsonb_array_length(key_points) between 1 and 6),
  partial text,
  wrong_turns jsonb not null default '[]'::jsonb check (jsonb_typeof(wrong_turns) = 'array'),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 6000),
  authority text,
  source_files jsonb not null default '[]'::jsonb,
  source_section text,
  sources jsonb not null default '[]'::jsonb,
  verified jsonb not null check (jsonb_typeof(verified) = 'object' and verified ? 'at' and verified ? 'checker'),
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id like course::text || '-voice-%')
);
create index voice_questions_course_idx on public.voice_questions(course, topic) where not retired;

create table public.voice_progress (
  question_id text primary key references public.voice_questions(id) on delete cascade,
  seen integer not null default 0,
  correct integer not null default 0,
  partial integer not null default 0,
  missed integer not null default 0,
  guessed integer not null default 0,
  box integer not null default 0 check (box between 0 and 5),
  due date,
  last_verdict text check (last_verdict in ('correct','partial','missed')),
  last_at timestamptz
);

create table public.voice_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course public.course_code,
  topic text check (topic is null or length(topic) between 1 and 120),
  mode text not null default 'mixed' check (mode in ('mixed','due','new')),
  request_key text not null check (length(request_key) between 1 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  closed_at timestamptz,
  unique (owner_id, request_key)
);
create index voice_quiz_sessions_owner_idx on public.voice_quiz_sessions(owner_id, created_at desc);

create table public.voice_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.voice_quiz_sessions(id) on delete cascade,
  question_id text not null references public.voice_questions(id),
  question_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','answered','skipped','changed')),
  verdict text check (verdict in ('correct','partial','missed')),
  heard text check (heard is null or length(heard) <= 1500),
  guessed boolean not null default false,
  result jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check ((status = 'answered') = (result is not null))
);
create index voice_quiz_attempts_session_idx on public.voice_quiz_attempts(session_id, created_at);
create unique index voice_quiz_one_pending on public.voice_quiz_attempts(session_id) where status = 'pending';

alter table public.voice_questions enable row level security;
alter table public.voice_progress enable row level security;
alter table public.voice_quiz_sessions enable row level security;
alter table public.voice_quiz_attempts enable row level security;
-- The bank is read-only to the app's signed-in owner, like public.questions.
create policy owner_read on public.voice_questions for select to authenticated using ((select public.is_owner()));
create policy owner_all on public.voice_progress for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.voice_quiz_sessions for all to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()))
  with check ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_all on public.voice_quiz_attempts for all to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()))
  with check ((select public.is_owner()) and owner_id = (select auth.uid()));
revoke all on public.voice_questions, public.voice_progress, public.voice_quiz_sessions, public.voice_quiz_attempts from anon, authenticated;
grant select on public.voice_questions to authenticated;
grant select, insert, update on public.voice_progress, public.voice_quiz_sessions, public.voice_quiz_attempts to authenticated;
grant all on public.voice_questions, public.voice_progress, public.voice_quiz_sessions, public.voice_quiz_attempts to service_role;

-- Voice answers count toward the day (streak, daily goal, Activity) like flashcards.
alter table public.study_events drop constraint if exists study_events_kind_check;
alter table public.study_events add constraint study_events_kind_check check (kind in ('card','drill','voice'));

-- A pending question is returned again until graded or explicitly skipped. The answer
-- key travels with the question so the assistant can judge a spoken answer; the tool
-- instructions keep it private until Austin answers.
create function public.next_voice_quiz_question(p_session_id uuid, p_skip_attempt_id uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare s public.voice_quiz_sessions; a public.voice_quiz_attempts; q public.voice_questions;
  v_today date := (now() at time zone 'America/Chicago')::date; v_left integer;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from public.voice_quiz_sessions where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Voice quiz session not found'; end if;
  if s.closed_at is not null or s.expires_at <= now() then raise exception 'Voice quiz session ended; start a new one'; end if;
  if p_skip_attempt_id is not null then
    update public.voice_quiz_attempts set status = 'skipped'
      where id = p_skip_attempt_id and session_id = s.id and owner_id = auth.uid() and status = 'pending';
  end if;
  select * into a from public.voice_quiz_attempts where session_id = s.id and status = 'pending';
  if found then
    select * into q from public.voice_questions where id = a.question_id;
  else
    select question.* into q from public.voice_questions question
    left join public.voice_progress p on p.question_id = question.id
    where not question.retired and (s.course is null or question.course = s.course)
      and (s.topic is null or question.topic ilike '%' || s.topic || '%' or question.subtopic ilike '%' || s.topic || '%')
      and not exists (select 1 from public.voice_quiz_attempts old where old.session_id = s.id and old.question_id = question.id)
      and (s.mode <> 'new' or coalesce(p.seen,0) = 0)
      and (s.mode <> 'due' or (p.seen > 0 and p.due <= v_today))
    order by case when p.seen > 0 and p.due <= v_today then 0 when coalesce(p.seen,0) = 0 then 1 else 2 end,
      (select count(*) from public.voice_quiz_attempts old join public.voice_questions previous on previous.id = old.question_id
        where old.session_id = s.id and previous.course = question.course),
      p.due asc nulls last, question.class_date desc nulls last, question.id
    limit 1;
    if not found then
      return jsonb_build_object('session_id',s.id,'complete',true,'message','No more matching voice questions in this session.');
    end if;
    insert into public.voice_quiz_attempts(session_id, question_id, question_snapshot)
      values (s.id, q.id, to_jsonb(q)) returning * into a;
  end if;
  select count(*) into v_left from public.voice_questions question
    where not question.retired and (s.course is null or question.course = s.course)
      and (s.topic is null or question.topic ilike '%' || s.topic || '%' or question.subtopic ilike '%' || s.topic || '%')
      and not exists (select 1 from public.voice_quiz_attempts old where old.session_id = s.id and old.question_id = question.id);
  return jsonb_build_object('session_id',s.id,'attempt_id',a.id,'remaining_after_this',v_left,
    'question',jsonb_build_object('id',q.id,'course',q.course,'topic',q.topic,'subtopic',q.subtopic,'prompt',q.prompt),
    'answer_key_private',jsonb_build_object('answer',q.answer,'key_points',q.key_points,'partial_credit',q.partial,
      'wrong_turns',q.wrong_turns,'context',q.context,'authority',q.authority));
end $$;

create function public.start_voice_quiz(p_request_key text, p_course public.course_code default null,
  p_mode text default 'mixed', p_topic text default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_request_key is null or length(p_request_key) not between 1 and 120 then raise exception 'Provide a session request key'; end if;
  if p_mode is null or p_mode not in ('mixed','due','new') then raise exception 'Unknown quiz mode'; end if;
  insert into public.voice_quiz_sessions(course,mode,topic,request_key)
    values (p_course,p_mode,nullif(btrim(p_topic),''),p_request_key)
    on conflict (owner_id,request_key) do update set request_key = excluded.request_key returning id into v_id;
  return public.next_voice_quiz_question(v_id);
end $$;

-- Review schedule matches the app: miss 1 day; correct 3, 7, 16, 35 days.
-- Partial (or right but guessed) steps back one box so it returns sooner.
create function public.answer_voice_quiz(p_attempt_id uuid, p_verdict text, p_heard text default null, p_guessed boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare a public.voice_quiz_attempts; s public.voice_quiz_sessions; q public.voice_questions; prev public.voice_progress;
  r public.voice_progress; v_result jsonb; v_today date := (now() at time zone 'America/Chicago')::date;
  intervals int[] := array[0,1,3,7,16,35]; new_box int; v_effective text;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_verdict is null or p_verdict not in ('correct','partial','missed') or p_guessed is null then
    raise exception 'Give a verdict: correct, partial, or missed';
  end if;
  select * into a from public.voice_quiz_attempts where id = p_attempt_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Voice question attempt not found'; end if;
  if a.status = 'answered' then
    if a.verdict <> p_verdict or a.guessed <> p_guessed then raise exception 'This attempt already has a different saved verdict'; end if;
    return a.result || jsonb_build_object('duplicate',true);
  end if;
  if a.status <> 'pending' then raise exception 'This question was skipped or changed'; end if;
  select * into s from public.voice_quiz_sessions where id = a.session_id and owner_id = auth.uid();
  if not found or s.closed_at is not null or s.expires_at <= now() then raise exception 'Voice quiz session ended; start a new one'; end if;
  select * into q from public.voice_questions where id = a.question_id;
  if not found or q.retired or to_jsonb(q) <> a.question_snapshot then
    update public.voice_quiz_attempts set status = 'changed' where id = a.id;
    return jsonb_build_object('saved',false,'status','question_changed','session_id',s.id,
      'message','This voice question changed. Ask for the next one; this answer was not counted.');
  end if;
  v_effective := case when p_verdict = 'correct' and p_guessed then 'partial' else p_verdict end;
  select * into prev from public.voice_progress where question_id = q.id;
  new_box := case
    when v_effective = 'missed' then 1
    when v_effective = 'partial' then greatest(coalesce(prev.box,0) - 1, 1)
    when coalesce(prev.seen,0) = 0 then 2
    else least(greatest(coalesce(prev.box,0),1) + 1, 5) end;
  insert into public.voice_progress as vp (question_id, seen, correct, partial, missed, guessed, box, due, last_verdict, last_at)
  values (q.id, 1, (p_verdict = 'correct')::int, (p_verdict = 'partial')::int, (p_verdict = 'missed')::int, p_guessed::int,
    new_box, v_today + intervals[new_box + 1], p_verdict, now())
  on conflict (question_id) do update set seen = vp.seen + 1, correct = vp.correct + excluded.correct,
    partial = vp.partial + excluded.partial, missed = vp.missed + excluded.missed, guessed = vp.guessed + excluded.guessed,
    box = excluded.box, due = excluded.due, last_verdict = excluded.last_verdict, last_at = excluded.last_at
  returning * into r;
  insert into public.study_events(kind, item_id, correct, local_date) values ('voice', q.id, v_effective = 'correct', v_today);
  v_result := jsonb_build_object('saved',true,'duplicate',false,'attempt_id',a.id,'session_id',s.id,'question_id',q.id,
    'verdict',p_verdict,'guessed',p_guessed,'model_answer',q.answer,'authority',q.authority,'local_date',v_today,
    'progress',jsonb_build_object('seen',r.seen,'correct',r.correct,'partial',r.partial,'missed',r.missed,'box',r.box,'due',r.due));
  update public.voice_quiz_attempts set status = 'answered', verdict = p_verdict, heard = left(nullif(btrim(p_heard),''),1500),
    guessed = p_guessed, result = v_result, answered_at = now() where id = a.id;
  return v_result;
end $$;

create function public.end_voice_quiz(p_session_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare s public.voice_quiz_sessions;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from public.voice_quiz_sessions where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Voice quiz session not found'; end if;
  update public.voice_quiz_sessions set closed_at = coalesce(closed_at,now()) where id = s.id;
  update public.voice_quiz_attempts set status = 'skipped' where session_id = s.id and status = 'pending';
  return (select jsonb_build_object('ended',true,'session_id',s.id,'answered',count(*),
    'correct',count(*) filter (where verdict = 'correct'),
    'partial',count(*) filter (where verdict = 'partial'),
    'missed',count(*) filter (where verdict = 'missed'),
    'to_review',coalesce(jsonb_agg(jsonb_build_object('topic',q.topic,'subtopic',q.subtopic,'verdict',t.verdict))
      filter (where t.verdict <> 'correct'),'[]'::jsonb))
    from public.voice_quiz_attempts t join public.voice_questions q on q.id = t.question_id
    where t.session_id = s.id and t.status = 'answered');
end $$;

-- Deeper follow-ups: the verified study library, saved-question rules, and voice
-- answer keys for one topic, straight from the database (no Drive search).
create function public.voice_topic_notes(p_course public.course_code, p_topic text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_topic text := nullif(btrim(p_topic),'');
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  if v_topic is null or length(v_topic) > 120 then raise exception 'Name a topic or case'; end if;
  return jsonb_build_object('course',p_course,'topic',v_topic,
    'study_materials',coalesce((select jsonb_agg(m.item order by m.kind, m.id) from (
      select sm.id, sm.kind, jsonb_strip_nulls(jsonb_build_object('title',sm.data->'title','topic',sm.data->'topic','subtopic',sm.data->'subtopic',
        'authority',sm.data->'authority','front',sm.data->'front','back',sm.data->'back','reason',sm.data->'reason',
        'sections',sm.data->'sections','columns',sm.data->'columns','rows',sm.data->'rows')) item
      from public.study_materials sm
      where not sm.retired and sm.course = p_course::text and sm.kind in ('flashcard','outline','comparison')
        and (sm.data->>'topic' ilike '%'||v_topic||'%' or sm.data->>'subtopic' ilike '%'||v_topic||'%'
          or sm.data->>'authority' ilike '%'||v_topic||'%' or sm.data->>'title' ilike '%'||v_topic||'%')
      order by sm.data->>'class_date' desc limit 12) m), '[]'::jsonb),
    'saved_question_rules',coalesce((select jsonb_agg(jsonb_build_object('subtopic',x.subtopic,'rule',x.rule,'authority',x.authority)) from (
      select q.subtopic, q.rule, q.authority from public.questions q
      where not q.retired and q.course = p_course and q.rule is not null
        and (q.topic ilike '%'||v_topic||'%' or q.subtopic ilike '%'||v_topic||'%' or q.authority ilike '%'||v_topic||'%')
      order by q.class_date desc limit 8) x), '[]'::jsonb),
    'voice_keys',coalesce((select jsonb_agg(jsonb_build_object('prompt',v.prompt,'answer',v.answer,'context',v.context)) from (
      select vq.prompt, vq.answer, vq.context from public.voice_questions vq
      where not vq.retired and vq.course = p_course
        and (vq.topic ilike '%'||v_topic||'%' or vq.subtopic ilike '%'||v_topic||'%' or vq.authority ilike '%'||v_topic||'%')
      order by vq.class_date desc limit 8) v), '[]'::jsonb));
end $$;

revoke execute on function public.start_voice_quiz(text,public.course_code,text,text), public.next_voice_quiz_question(uuid,uuid),
  public.answer_voice_quiz(uuid,text,text,boolean), public.end_voice_quiz(uuid), public.voice_topic_notes(public.course_code,text) from public, anon;
grant execute on function public.start_voice_quiz(text,public.course_code,text,text), public.next_voice_quiz_question(uuid,uuid),
  public.answer_voice_quiz(uuid,text,text,boolean), public.end_voice_quiz(uuid), public.voice_topic_notes(public.course_code,text) to authenticated;
