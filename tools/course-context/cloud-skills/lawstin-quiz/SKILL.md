---
name: lawstin-quiz
description: Use when Austin asks ChatGPT or Claude to quiz him from LAWSTIN, including in voice mode on his phone, and save answers to LAWSTIN progress. Voice mode uses short open-ended questions; text chat can use the saved multiple-choice questions.
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

## Voice quizzes (short answers, no choices)

Use the voice tools whenever the conversation is spoken (Claude or ChatGPT voice mode) or Austin asks for short, spoken, rapid-fire, or open-ended questions. The multiple-choice questions are long to hear read aloud; do not read lettered choices in voice.

Call start_lawstin_voice_quiz with a new request_key, the course if he named one, and a topic if he named a topic, doctrine, or case. Each question arrives with answer_key_private. Say only question.prompt, in a natural voice. Keep the key private: no hints, no reading the model answer, before he answers.

Judge the answer by meaning, not wording, against key_points:
- correct: every key point is there in substance, even in his own phrasing or a different order.
- partial: the right conclusion without the reason, or some key points missing (partial_credit describes the line).
- missed: the wrong conclusion, one of the listed wrong_turns, or no real answer.
If his answer is cut off or unclear, ask him to finish before grading. A repeat request, a clarifying question, or silence is not an answer.

Call grade_lawstin_voice_answer with the attempt_id, your verdict, a one-sentence summary of what he said as heard, and guessed only if he says he guessed. Confirm the verdict only after saved:true. Then reply in one to three spoken sentences: the verdict, what he got right, and the missing piece or correction from the key. Do not reread the whole key.

Follow-ups: answer from the key's context (rule, cases, notes) first; it was built from his class notes. If the follow-up goes beyond it, call get_lawstin_topic_notes for that course and topic or case name. Search the Drive course context only if both come up empty, and say when an answer is not in his materials instead of filling the gap from general knowledge. When he is ready, call next_lawstin_voice_question.

On a skip, pass the pending attempt_id as skip_attempt_id. On stop, call end_lawstin_voice_quiz and give its totals and the topics to review in a sentence. Voice answers count toward his streak and daily goal and come back on their own review schedule.
