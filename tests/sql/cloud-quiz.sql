-- Run as the database owner. All fixture rows and progress changes roll back.
begin;
insert into public.questions(id,course,topic,stem,prompt,choices,answer,created_at)
values ('__cloud_quiz_fixture__','il','Connector test','A neutral test scenario.','Choose A.',
  '[{"id":"A","role":"correct","text":"First option","why":"Fixture explanation."},{"id":"B","role":"sneaky","text":"Second option","why":"Fixture distractor."},{"id":"C","role":"average","text":"Third option","why":"Fixture distractor."},{"id":"D","role":"bad","text":"Fourth option","why":"Fixture distractor."}]',
  'A',now()+interval '1 minute');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where lower(email)='trevinoaustin10@gmail.com'),
  'email','trevinoaustin10@gmail.com','role','authenticated')::text,true);
set local role authenticated;
do $$
declare first jsonb; repeated jsonb; answer jsonb; duplicate jsonb; pending jsonb; ended jsonb; guessed jsonb;
  v_session uuid; v_attempt uuid; v_guess_session uuid; v_guess_attempt uuid; v_changed_session uuid; v_changed_attempt uuid;
  v_before bigint; v_days_before integer; v_today date := (now() at time zone 'America/Chicago')::date;
begin
  select count(*) into v_before from public.answers;
  select coalesce(sum((d->>'answered')::integer),0) into v_days_before from jsonb_array_elements(public.get_state(v_today)->'days') d where d->>'date'=v_today::text;
  first := public.start_chat_quiz('__cloud_quiz_fixture_session__','il','new');
  if first->'question'->>'id' <> '__cloud_quiz_fixture__' then raise exception 'Fixture was not selected'; end if;
  if first->'question' ?| array['answer','rule','authority'] or exists(select 1 from jsonb_array_elements(first->'question'->'choices') c where c ?| array['role','why']) then
    raise exception 'Answer key leaked before submission';
  end if;
  v_session := (first->>'session_id')::uuid; v_attempt := (first->>'attempt_id')::uuid;
  repeated := public.start_chat_quiz('__cloud_quiz_fixture_session__','il','new');
  if repeated->>'attempt_id' <> v_attempt::text then raise exception 'Start retry changed the pending question'; end if;
  repeated := public.next_chat_quiz_question(v_session);
  if repeated->>'attempt_id' <> v_attempt::text then raise exception 'Repeat changed the pending question'; end if;
  if (select count(*) from public.answers) <> v_before then raise exception 'Reading a question recorded an answer'; end if;
  answer := public.answer_chat_quiz(v_attempt,'A',false);
  if answer->>'saved' <> 'true' or answer->>'correct' <> 'true' or (answer->'progress'->>'seen')::int <> 1
    or (answer->'progress'->>'due')::date <> v_today+3 then raise exception 'Answer did not use the existing review rules'; end if;
  duplicate := public.answer_chat_quiz(v_attempt,'A',false);
  if duplicate->>'duplicate' <> 'true' or (select count(*) from public.answers) <> v_before+1 then raise exception 'Retry counted twice'; end if;
  begin
    perform public.answer_chat_quiz(v_attempt,'B',false);
    raise exception 'Different answer was accepted on a used attempt';
  exception when raise_exception then
    if sqlerrm <> 'This attempt already has a different saved answer' then raise; end if;
  end;
  pending := public.next_chat_quiz_question(v_session);
  if pending ? 'attempt_id' then
    repeated := public.next_chat_quiz_question(v_session,(pending->>'attempt_id')::uuid);
    perform public.next_chat_quiz_question(v_session,(pending->>'attempt_id')::uuid);
    if (select count(*) from public.answers) <> v_before+1 then raise exception 'Skip recorded an answer'; end if;
  end if;
  ended := public.end_chat_quiz(v_session);
  if (ended->>'answered')::int <> 1 or (ended->>'correct')::int <> 1 then raise exception 'Session score counted an unsubmitted question'; end if;

  insert into public.chat_quiz_sessions(request_key) values('__cloud_quiz_fixture_guess__') returning id into v_guess_session;
  insert into public.chat_quiz_attempts(session_id,question_id,question_snapshot,question_dto)
    select v_guess_session,q.id,to_jsonb(q),first->'question' from public.questions q where id='__cloud_quiz_fixture__' returning id into v_guess_attempt;
  guessed := public.answer_chat_quiz(v_guess_attempt,'B',true);
  if guessed->>'correct' <> 'false' or (guessed->'progress'->>'seen')::int <> 2 or (guessed->'progress'->>'guessed')::int <> 1
    or (guessed->'progress'->>'due')::date <> v_today+1 then raise exception 'Guessed answer did not update LAWSTIN correctly'; end if;
  perform public.answer_chat_quiz(v_guess_attempt,'B',true);
  if (select count(*) from public.answers) <> v_before+2 then raise exception 'Guessed retry counted twice'; end if;
  if (select coalesce(sum((d->>'answered')::integer),0) from jsonb_array_elements(public.get_state(v_today)->'days') d where d->>'date'=v_today::text) <> v_days_before+2 then
    raise exception 'The app state did not include chat answers';
  end if;

  insert into public.chat_quiz_sessions(request_key) values('__cloud_quiz_fixture_changed__') returning id into v_changed_session;
  insert into public.chat_quiz_attempts(session_id,question_id,question_snapshot,question_dto)
    values(v_changed_session,'__cloud_quiz_fixture__','{}',first->'question') returning id into v_changed_attempt;
  answer := public.answer_chat_quiz(v_changed_attempt,'A',false);
  if answer->>'saved' <> 'false' or answer->>'status' <> 'question_changed' or (select count(*) from public.answers) <> v_before+2 then
    raise exception 'A changed question was graded or counted';
  end if;
end $$;

-- A second identity sees no sessions and cannot call quiz functions.
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"other@example.invalid","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.chat_quiz_sessions) <> 0 or (select count(*) from public.chat_quiz_attempts) <> 0 then raise exception 'RLS exposed another account'; end if;
  begin
    perform public.start_chat_quiz('unauthorized','il','mixed');
    raise exception 'A non-owner started a quiz';
  exception when raise_exception then
    if sqlerrm <> 'Not signed in' then raise; end if;
  end;
end $$;
reset role;
rollback;
