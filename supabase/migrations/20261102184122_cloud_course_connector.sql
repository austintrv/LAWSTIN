-- Cloud handoffs and chat quizzes. Existing answer/review functions stay authoritative.
create table public.chat_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course public.course_code,
  mode text not null default 'mixed' check (mode in ('mixed','due','new')),
  request_key text not null check (length(request_key) between 1 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  closed_at timestamptz,
  unique (owner_id, request_key)
);
create index chat_quiz_sessions_owner_idx on public.chat_quiz_sessions(owner_id, created_at desc);

create table public.chat_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.chat_quiz_sessions(id) on delete cascade,
  question_id text not null references public.questions(id),
  question_snapshot jsonb not null,
  question_dto jsonb not null,
  status text not null default 'pending' check (status in ('pending','answered','skipped','changed')),
  choice text check (choice in ('A','B','C','D')),
  guessed boolean not null default false,
  result jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check ((status = 'answered') = (result is not null))
);
create index chat_quiz_attempts_owner_idx on public.chat_quiz_attempts(owner_id);
create index chat_quiz_attempts_session_idx on public.chat_quiz_attempts(session_id, created_at);
create unique index chat_quiz_one_pending on public.chat_quiz_attempts(session_id) where status = 'pending';

create table public.course_context_sources (
  owner_id uuid not null references auth.users(id) on delete cascade,
  course text not null check (course in ('il','asy','pr','clinic','tutoring')),
  name text not null,
  folder_id text not null,
  primary key (owner_id, course)
);
create table public.course_context_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course text not null check (course in ('il','asy','pr','clinic','tutoring')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  memory_revision text not null check (memory_revision ~ '^[a-f0-9]{64}$'),
  files jsonb not null check (jsonb_typeof(files) = 'object' and octet_length(files::text) <= 4194304),
  created_at timestamptz not null default now(),
  unique (owner_id, course, content_hash)
);
create index course_context_versions_history_idx on public.course_context_versions(owner_id, course, created_at desc);
create table public.course_cloud_config (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  bridge_url text,
  updated_at timestamptz not null default now()
);

alter table public.chat_quiz_sessions enable row level security;
alter table public.chat_quiz_attempts enable row level security;
alter table public.course_context_sources enable row level security;
alter table public.course_context_versions enable row level security;
alter table public.course_cloud_config enable row level security;
create policy owner_all on public.chat_quiz_sessions for all to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()))
  with check ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_all on public.chat_quiz_attempts for all to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()))
  with check ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_read on public.course_context_sources for select to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_read on public.course_context_versions for select to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_insert on public.course_context_versions for insert to authenticated
  with check ((select public.is_owner()) and owner_id = (select auth.uid()));
create policy owner_read on public.course_cloud_config for select to authenticated
  using ((select public.is_owner()) and owner_id = (select auth.uid()));
revoke all on public.chat_quiz_sessions, public.chat_quiz_attempts, public.course_context_sources,
  public.course_context_versions, public.course_cloud_config from anon, authenticated;
grant select, insert, update on public.chat_quiz_sessions, public.chat_quiz_attempts to authenticated;
grant select on public.course_context_sources, public.course_context_versions, public.course_cloud_config to authenticated;
grant insert on public.course_context_versions to authenticated;
grant all on public.chat_quiz_sessions, public.chat_quiz_attempts, public.course_context_sources,
  public.course_context_versions, public.course_cloud_config to service_role;

-- A pending question is returned again until answered or explicitly skipped.
create function public.next_chat_quiz_question(p_session_id uuid, p_skip_attempt_id uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare s public.chat_quiz_sessions; a public.chat_quiz_attempts; q public.questions;
  dto jsonb; v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from public.chat_quiz_sessions where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Quiz session not found'; end if;
  if s.closed_at is not null or s.expires_at <= now() then raise exception 'Quiz session ended; start a new one'; end if;
  if p_skip_attempt_id is not null then
    update public.chat_quiz_attempts set status = 'skipped'
      where id = p_skip_attempt_id and session_id = s.id and owner_id = auth.uid() and status = 'pending';
  end if;
  select * into a from public.chat_quiz_attempts where session_id = s.id and status = 'pending';
  if found then return jsonb_build_object('session_id',s.id,'attempt_id',a.id,'question',a.question_dto); end if;

  select question.* into q from public.questions question
  left join public.progress p on p.question_id = question.id
  where not question.retired and (s.course is null or question.course = s.course)
    and not exists (select 1 from public.chat_quiz_attempts old where old.session_id = s.id and old.question_id = question.id)
    and (s.mode <> 'new' or coalesce(p.seen,0) = 0)
    and (s.mode <> 'due' or (p.seen > 0 and p.due <= v_today))
  order by case when p.seen > 0 and p.due <= v_today then 0 when coalesce(p.seen,0) = 0 then 1 else 2 end,
    (select count(*) from public.chat_quiz_attempts old join public.questions previous on previous.id = old.question_id
      where old.session_id = s.id and previous.course = question.course),
    p.due asc nulls last, question.created_at desc, question.id
  limit 1;
  if not found then
    return jsonb_build_object('session_id',s.id,'complete',true,'message','No more matching saved questions in this session.');
  end if;
  dto := jsonb_build_object('id',q.id,'course',q.course,'topic',q.topic,'subtopic',q.subtopic,
    'stem',q.stem,'prompt',q.prompt,'choices',(select jsonb_agg(jsonb_build_object('id',c->>'id','text',c->>'text') order by n)
      from jsonb_array_elements(q.choices) with ordinality as choices(c,n)));
  insert into public.chat_quiz_attempts(session_id, question_id, question_snapshot, question_dto)
    values (s.id,q.id,to_jsonb(q),dto) returning * into a;
  return jsonb_build_object('session_id',s.id,'attempt_id',a.id,'question',dto);
end $$;

create function public.start_chat_quiz(p_request_key text, p_course public.course_code default null, p_mode text default 'mixed')
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_request_key is null or length(p_request_key) not between 1 and 120 then raise exception 'Provide a session request key'; end if;
  if p_mode is null or p_mode not in ('mixed','due','new') then raise exception 'Unknown quiz mode'; end if;
  insert into public.chat_quiz_sessions(course,mode,request_key) values(p_course,p_mode,p_request_key)
    on conflict (owner_id,request_key) do update set request_key = excluded.request_key returning id into v_id;
  return public.next_chat_quiz_question(v_id);
end $$;

-- The attempt lock makes answer retries safe. Only this function calls record_answer.
create function public.answer_chat_quiz(p_attempt_id uuid, p_choice text, p_guessed boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare a public.chat_quiz_attempts; s public.chat_quiz_sessions; q public.questions; r jsonb;
  v_today date := (now() at time zone 'America/Chicago')::date; selected jsonb; correct_choice jsonb; p public.progress;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_choice is null or p_choice not in ('A','B','C','D') or p_guessed is null then raise exception 'Provide one clear answer, A, B, C, or D'; end if;
  select * into a from public.chat_quiz_attempts where id = p_attempt_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Question attempt not found'; end if;
  if a.status = 'answered' then
    if a.choice <> p_choice or a.guessed <> p_guessed then raise exception 'This attempt already has a different saved answer'; end if;
    return a.result || jsonb_build_object('duplicate',true);
  end if;
  if a.status <> 'pending' then raise exception 'This question was skipped or changed'; end if;
  select * into s from public.chat_quiz_sessions where id = a.session_id and owner_id = auth.uid();
  if not found or s.closed_at is not null or s.expires_at <= now() then raise exception 'Quiz session ended; start a new one'; end if;
  select * into q from public.questions where id = a.question_id for update;
  if not found or q.retired or to_jsonb(q) <> a.question_snapshot then
    update public.chat_quiz_attempts set status = 'changed' where id = a.id;
    return jsonb_build_object('saved',false,'status','question_changed','session_id',s.id,'message','The saved question changed. Ask for the next question; this answer was not counted.');
  end if;
  r := public.record_answer(q.id,p_choice,v_today);
  if p_guessed then
    perform public.mark_question('guess',q.id,null,null,v_today);
    select * into p from public.progress where question_id = q.id;
    r := jsonb_set(r,'{progress}',(r->'progress') || jsonb_build_object('guessed',p.guessed,'box',p.box,'due',p.due));
  end if;
  select c into selected from jsonb_array_elements(q.choices) c where c->>'id' = p_choice;
  select c into correct_choice from jsonb_array_elements(q.choices) c where c->>'id' = q.answer;
  r := r || jsonb_build_object('saved',true,'duplicate',false,'attempt_id',a.id,'session_id',s.id,
    'question_id',q.id,'choice',p_choice,'correct_answer',q.answer,'chosen_explanation',selected->>'why',
    'correct_explanation',correct_choice->>'why','rule',q.rule,'authority',q.authority,'local_date',v_today);
  update public.chat_quiz_attempts set status = 'answered', choice = p_choice, guessed = p_guessed,
    result = r, answered_at = now() where id = a.id;
  return r;
end $$;

create function public.end_chat_quiz(p_session_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare s public.chat_quiz_sessions;
begin
  if not public.is_owner() or auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from public.chat_quiz_sessions where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Quiz session not found'; end if;
  update public.chat_quiz_sessions set closed_at = coalesce(closed_at,now()) where id = s.id;
  update public.chat_quiz_attempts set status = 'skipped' where session_id = s.id and status = 'pending';
  return (select jsonb_build_object('ended',true,'session_id',s.id,'answered',count(*),
    'correct',count(*) filter (where (result->>'correct')::boolean),
    'wrong',count(*) filter (where not (result->>'correct')::boolean))
    from public.chat_quiz_attempts where session_id = s.id and status = 'answered');
end $$;

revoke execute on function public.start_chat_quiz(text,public.course_code,text), public.next_chat_quiz_question(uuid,uuid),
  public.answer_chat_quiz(uuid,text,boolean), public.end_chat_quiz(uuid) from public, anon;
grant execute on function public.start_chat_quiz(text,public.course_code,text), public.next_chat_quiz_question(uuid,uuid),
  public.answer_chat_quiz(uuid,text,boolean), public.end_chat_quiz(uuid) to authenticated;
