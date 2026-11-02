-- Preserve the question bank's existing read-only policy while grading chat answers.
create or replace function public.answer_chat_quiz(p_attempt_id uuid, p_choice text, p_guessed boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare a public.chat_quiz_attempts; s public.chat_quiz_sessions; q public.questions; r jsonb; latest jsonb;
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
  select * into q from public.questions where id = a.question_id;
  if not found or q.retired or to_jsonb(q) <> a.question_snapshot then
    update public.chat_quiz_attempts set status = 'changed' where id = a.id;
    return jsonb_build_object('saved',false,'status','question_changed','session_id',s.id,'message','The saved question changed. Ask for the next question; this answer was not counted.');
  end if;
  -- The question bank is read-only to authenticated clients. Recheck its snapshot
  -- after grading; an intervening content edit rolls back all answer/progress writes.
  begin
    r := public.record_answer(q.id,p_choice,v_today);
    select to_jsonb(question) into latest from public.questions question where id = a.question_id;
    if latest is distinct from a.question_snapshot then
      raise exception using errcode = 'PQC01', message = 'Question changed during grading';
    end if;
  exception when sqlstate 'PQC01' then
    update public.chat_quiz_attempts set status = 'changed' where id = a.id;
    return jsonb_build_object('saved',false,'status','question_changed','session_id',s.id,'message','The saved question changed. Ask for the next question; this answer was not counted.');
  end;
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
