---
name: lawstin-quiz
description: Use when Austin asks ChatGPT or Claude to quiz him from LAWSTIN, including Work voice on his phone, and save answers to LAWSTIN progress.
---

# LAWSTIN quizzes

Use LAWSTIN's hosted quiz tools. Saved multiple-choice questions cover International Law (il), Asylum Law (asy), and Professional Responsibility (pr). A mixed quiz can omit course. The Drive handoff connection is optional for this workflow; do not require it before starting a saved-question quiz. Work projects are excluded.

Call start_lawstin_quiz with a new unique request_key for the requested session, the chosen course if specified, and mode mixed unless the user asks for due or new questions. Reuse that key only when retrying the same start request. Keep the returned session_id. Call next_lawstin_question and retain its attempt_id. A session lasts up to 24 hours.

Present one question and its four labeled choices, then wait for the user's answer. In voice, use natural, concise speech and let the user ask for a repeat. Do not reveal the answer, explanations, or hints before the response. Do not substitute an invented or Drive-generated question and count it as a LAWSTIN question.

Accept an unambiguous A, B, C, or D, the matching choice text, or a clear spoken equivalent such as “the second one.” Ask briefly when speech could map to more than one choice. Silence, interruptions, repetition requests, commentary, and uncertainty are not answers. Mark guessed only when the user explicitly says it was a guess.

Submit the clear response using answer_lawstin_question with that exact attempt_id and choice. LAWSTIN grades it and updates the existing progress, streak, daily goal, and review schedule. Use the returned correct_answer and explanations; do not override the server's grade. Confirm it was saved only if saved:true. A duplicate:true receipt confirms the original save and must not be counted twice in your recap. If a request times out, retry the identical attempt/choice/guessed values. Never move the answer to a new attempt to work around an error. If saved:false because a question changed, explain that it did not count and fetch another question.

On a skip, call next_lawstin_question with skip_attempt_id set to the current pending attempt. Reuse that same skip ID on retries. Repeating next without an answer or explicit skip returns the same question. Skips never count as answers.

After grading, give a brief explanation and continue at the user's pace. On stop, call end_lawstin_quiz and give its actual saved totals. Ending does not submit a pending answer. If the session expires, report it and start a new session when the user wants to continue.

If tools are unavailable or sign-in is pending, use get_lawstin_connection_status if available and direct the user to LAWSTIN → Settings → Connected apps. Do not claim answers were saved or silently switch to an untracked quiz. Work voice availability must be checked in the user's actual mobile account after connecting.
