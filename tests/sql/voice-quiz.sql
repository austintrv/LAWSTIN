-- Run as the database owner after the voice migration. All fixture rows and progress roll back.
begin;
insert into public.voice_questions(id,course,topic,subtopic,class_date,prompt,answer,key_points,partial,wrong_turns,context,authority,verified)
values ('il-voice-19990101-01','il','Connector test','Fixture','2026-10-26','Is this a neutral fixture question?','Yes. It is a fixture.',
  '["It is a fixture"]','Says yes without saying why.','[{"said":"No.","fix":"It is a fixture."}]',
  '{"rule":"Fixture rule.","cases":[{"name":"Fixture v. Test","point":"Fixtures exist."}],"notes":["Fixture note."]}',
  'Fixture v. Test','{"at":"2026-11-08T00:00:00Z","checker":"fixture","rounds":1,"notes":"fixture"}');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where lower(email)='trevinoaustin10@gmail.com'),
  'email','trevinoaustin10@gmail.com','role','authenticated')::text,true);
set local role authenticated;
do $$
declare first jsonb; again jsonb; graded jsonb; dup jsonb; ended jsonb; notes jsonb; v_session uuid; v_attempt uuid;
  v_events bigint; v_mcq bigint; v_today date := (now() at time zone 'America/Chicago')::date; v_s2 uuid; v_a2 uuid;
begin
  select count(*) into v_events from public.study_events;
  select count(*) into v_mcq from public.answers;
  first := public.start_voice_quiz('__voice_fixture__','il','new','Connector');
  if first->'question'->>'id' <> 'il-voice-19990101-01' then raise exception 'Fixture was not selected: %', first; end if;
  if first->'question' ?| array['answer','key_points','context'] then raise exception 'Key mixed into the spoken question'; end if;
  if first->'answer_key_private'->'key_points'->>0 <> 'It is a fixture' or first->'answer_key_private'->'context'->>'rule' <> 'Fixture rule.' then
    raise exception 'Answer key or follow-up bank missing';
  end if;
  v_session := (first->>'session_id')::uuid; v_attempt := (first->>'attempt_id')::uuid;
  again := public.start_voice_quiz('__voice_fixture__','il','new','Connector');
  if again->>'attempt_id' <> v_attempt::text then raise exception 'Start retry changed the pending question'; end if;
  again := public.next_voice_quiz_question(v_session);
  if again->>'attempt_id' <> v_attempt::text then raise exception 'Repeat changed the pending question'; end if;
  if (select count(*) from public.study_events) <> v_events then raise exception 'Reading a question recorded an answer'; end if;
  graded := public.answer_voice_quiz(v_attempt,'correct','Said it is a fixture.',false);
  if graded->>'saved' <> 'true' or (graded->'progress'->>'box')::int <> 2 or (graded->'progress'->>'due')::date <> v_today+3 then
    raise exception 'Correct verdict did not use the review schedule: %', graded;
  end if;
  dup := public.answer_voice_quiz(v_attempt,'correct','Said it is a fixture.',false);
  if dup->>'duplicate' <> 'true' or (select count(*) from public.study_events) <> v_events+1 then raise exception 'Retry counted twice'; end if;
  begin
    perform public.answer_voice_quiz(v_attempt,'missed',null,false);
    raise exception 'Different verdict accepted on a used attempt';
  exception when raise_exception then
    if sqlerrm <> 'This attempt already has a different saved verdict' then raise; end if;
  end;
  again := public.next_voice_quiz_question(v_session);
  if again->>'complete' <> 'true' then raise exception 'Topic filter leaked other questions: %', again; end if;
  ended := public.end_voice_quiz(v_session);
  if (ended->>'answered')::int <> 1 or (ended->>'correct')::int <> 1 then raise exception 'Session totals wrong: %', ended; end if;
  -- Partial after a correct steps back a box; missed resets to one day.
  first := public.start_voice_quiz('__voice_fixture_2__','il','mixed','Connector');
  graded := public.answer_voice_quiz((first->>'attempt_id')::uuid,'partial','Yes, no reason.',false);
  if (graded->'progress'->>'box')::int <> 1 or (graded->'progress'->>'due')::date <> v_today+1 then raise exception 'Partial schedule wrong: %', graded; end if;
  first := public.start_voice_quiz('__voice_fixture_3__','il','mixed','Connector');
  graded := public.answer_voice_quiz((first->>'attempt_id')::uuid,'correct',null,true);
  if (select correct from public.study_events order by id desc limit 1) then raise exception 'A guessed answer counted as fully correct'; end if;
  if (select count(*) from public.study_events where kind = 'voice') < 3 then raise exception 'Voice answers missing from the day totals'; end if;
  if (select count(*) from public.answers) <> v_mcq then raise exception 'Voice answers touched multiple-choice history'; end if;
  -- Skip never counts.
  first := public.start_voice_quiz('__voice_fixture_4__','il','mixed','Connector');
  again := public.next_voice_quiz_question((first->>'session_id')::uuid,(first->>'attempt_id')::uuid);
  if (select status from public.voice_quiz_attempts where id = (first->>'attempt_id')::uuid) <> 'skipped' then raise exception 'Skip not recorded'; end if;
  notes := public.voice_topic_notes('il','Connector');
  if jsonb_array_length(notes->'voice_keys') <> 1 then raise exception 'Topic notes missed the voice key: %', notes; end if;
  begin
    perform public.answer_voice_quiz((first->>'attempt_id')::uuid,'correct',null,false);
    raise exception 'A skipped question was graded';
  exception when raise_exception then
    if sqlerrm <> 'This question was skipped or changed' then raise; end if;
  end;
  raise notice 'voice quiz checks passed';
end $$;
rollback;
