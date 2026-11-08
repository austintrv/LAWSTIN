---
name: "lawstin-voice-questions"
description: "Write short open-ended voice questions for Lawstin (Intl Law, Asylum Law, Pro Res), each with a stored answer key and follow-up bank built from Austin’s Drive notes and slides, with an independent accuracy check. Use as the last step of the scheduled question update or when Austin asks for more voice questions."
---

# Lawstin voice questions

Voice questions are what Claude and ChatGPT ask Austin in voice mode through the LAWSTIN connector (`start_lawstin_voice_quiz`). Each is one short spoken question with no answer choices. The assistant judges his spoken answer against the stored key and answers follow-ups from the stored context, so the key must be complete enough that it never has to search Drive mid-quiz.

Database: Supabase project `vbqfmgsrxurdazujbbuk`, table `public.voice_questions` (migration `supabase/migrations/20261108_voice_questions.sql`). Write with `mcp__Supabase__execute_sql` (INSERT only; never change the schema or delete rows; retire with `retired = true`). Progress lives in `voice_progress` and is written only by the connector.

## Keeping usage low
- When this runs after the multiple-choice update, reuse the Drive passages that run already extracted. Do not open new files for voice questions unless a weak voice topic needs an outline section.
- Default: **3 per run, 1 per course**, from the newest class covered that run. Skip a course whose unanswered voice backlog is 15 or more:
  ```sql
  SELECT q.course, count(*) FROM voice_questions q LEFT JOIN voice_progress p ON p.question_id = q.id
  WHERE NOT q.retired AND coalesce(p.seen,0) = 0 GROUP BY 1;
  ```
- Voice topics he missed or got partial (`SELECT q.course, q.topic, q.subtopic, sum(p.missed) missed, sum(p.partial) partial FROM voice_questions q JOIN voice_progress p ON p.question_id = q.id GROUP BY 1,2,3 HAVING sum(p.missed + p.partial) > 0;`) may take the course’s slot instead, with a new question on the same rule.
- The independent check runs in the same Sonnet checker call as the multiple-choice batch when possible.

## Fields
| Field | What goes in it |
|---|---|
| `id` | `{course}-voice-{YYYYMMDD}-{nn}` |
| `course`, `topic`, `subtopic` | Reuse existing topic and subtopic strings from `questions` / `study_materials` exactly |
| `class_day`, `class_date`, `batch` | The class the material was taught in; `batch` = today |
| `prompt` | ONE question, at most 25 words, easy to follow when heard once. No lettered options, no “which of the following,” no long fact patterns (a one-clause scenario is fine). Answerable in two to four spoken sentences. |
| `answer` | Model answer, one to three sentences of plain speech |
| `key_points` | Two to four short ideas; all present in substance = correct. Ideas, not exact words. |
| `partial` | One sentence on what earns partial credit |
| `wrong_turns` | One to three `{said, fix}` likely mistakes: the losing argument or dissent, the neighboring rule, the old rule |
| `context` | The follow-up bank: `{rule, cases: [{name, point}], notes: [...]}`. Rule in one to three sentences; each case with the point it stands for; two to five short facts a follow-up would need. Under about 250 words. |
| `authority` | Case names, rule numbers |
| `source_files`, `source_section`, `sources` | Drive file ids, the heading inside them, and `{file_id, title, section, url}` |
| `verified` | `{at, rounds, checker, notes}`, written only after the check passes |

Mix question types in a batch: yes/no with why (“Does social distinction require literal visibility?”), “What is the test for…,” “Why did the court in X hold…,” “What’s the difference between X and Y?,” and one-line scenarios (“A prosecutor learns of new evidence after conviction. What must she do?”).

## Rules
- Every legal statement comes from Austin’s notes, slides, outline, or (Asylum, Pro Res) textbook passage named in `source_section`. International Law is a closed universe. If the source does not settle a point, leave it out or write a different question.
- No references to “the notes,” class numbers, paragraph numbers, or the professor inside `prompt`, `answer`, `key_points`, or `context`.
- Plain, literal language; curly quotes and apostrophes in prose fields; no em-dashes.
- Only classes whose date has passed.

## Check (required)
Give an independent checker (`general-purpose`, `model: "sonnet"`) only the drafts file and the verbatim source passages. It replies per question `<id> | PASS`, `<id> | FIX | <field> | <problem> | <corrected text> | <source location>`, or `<id> | FAIL | <reason>`, checking: the model answer and every key point are correct under the source; nothing in `context` or `wrong_turns` goes beyond or contradicts the source; case names, courts, years, and rule subsections are accurate; the prompt has one defensible answer. Apply FIX text as given (a FIX that changes the answer or a key point gets one more fresh check); drop FAILs.

## Write
```bash
python3 - <<'PY'
import json
qs = json.load(open('voice.json'))
assert all(q.get('verified') for q in qs)
def dq(s):
    tag = 'v'
    while f'${tag}$' in s: tag += 'x'
    return f'${tag}${s}${tag}$'
cols = ['id','course','topic','subtopic','class_day','class_date','batch','prompt','answer','key_points','partial',
        'wrong_turns','context','authority','source_files','source_section','sources','verified']
types = {'class_day':'int','class_date':'date','key_points':'jsonb','wrong_turns':'jsonb','context':'jsonb',
         'source_files':'jsonb','sources':'jsonb','verified':'jsonb'}
rec = ', '.join(f"{c} {types.get(c,'text')}" for c in cols)
sel = ', '.join('course::public.course_code' if c == 'course' else c for c in cols)
open('voice.sql','w').write(f"INSERT INTO public.voice_questions ({', '.join(cols)}) SELECT {sel} FROM jsonb_to_recordset("
  f"{dq(json.dumps(qs, ensure_ascii=False))}::jsonb) AS x({rec});")
PY
```
Run `voice.sql` in one `mcp__Supabase__execute_sql` call, then confirm with `SELECT course, count(*) FROM voice_questions WHERE batch = '<today>' GROUP BY 1`. Mention the count in the run note only as “plus N voice questions.”
