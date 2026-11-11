# Package 2C — Professional Responsibility under exam conditions

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 1 is merged. Branch: `codex/2c-exam-conditions` from the latest `main`. Runs in parallel with 2A and 2B.

## Why
Pro Res (Dec 9) is closed-book multiple choice in MPRE style. What works for that exam: timed sets under real conditions, a record of each attempt, an error log by rule, and learning to tell the right answer from the nearly right one. Today the practice exam has no going back, no flagging, nothing saved afterwards, and the “wrong answer” screen on Progress uses words (“Sneaky distractor”) he could not decode.

## Files you own
`src/components/QuizSession.tsx` + css (exam mode), `src/components/ExamPicker.tsx`, `src/pages/ProgressTab.tsx`, new `src/components/tools/ExamHistory.tsx`, `src/components/tools/MissedRules.tsx`, `src/components/tools/CloseCalls.tsx` (+ css), new `src/helpers/useExams.ts`, `src/helpers/missedRules.ts`, tests, harness additions. Do not edit `src/pages/_index.tsx`, `StudyTab.tsx`, `WrittenPractice.tsx`, `Courses.tsx`.

## Tool contract
Package 2A builds a host: any file `src/components/tools/<Name>.tsx` default-exporting a full-screen component with props `{ course?: CourseCode; arg?: string; onClose: () => void }` opens at `#/tool/<Name>/<course>/<arg>`. Until 2A merges, link to your tools with that hash from the places you own (Progress, exam results) and test by rendering them directly.

## 1. A practice exam that behaves like an exam
- Move freely: Previous and Next through all questions, change an answer any time before finishing. (No explanations until the end, as now.)
- Flag a question; a question map (numbered dots: answered, unanswered, flagged, current) opens from the header and jumps to any question. On desktop the map sits in the side column.
- “Finish” asks once when questions are unanswered or flagged (“3 unanswered”, buttons Finish and Go back). Time running out finishes automatically and scores unanswered ones as missed.
- Sizes: 10, 25, 60 and All; a size larger than the unseen-plus-seen bank for that choice is not offered, so no question repeats inside one exam. Timing stays two minutes a question, or untimed.
- Header follows the shared pattern (Close right, title centered “Question 7 of 25”, timer and map left). Keyboard: A–D or 1–4 to answer, arrows to move, F to flag, M for the map; Escape asks before ending (1B).
- Leaving mid-exam and coming back within three hours resumes it with the clock where it stopped.

## 2. Every exam is kept
- `useExams`: saves `exam:v1:<ISO time>` in `app_settings` when an exam finishes: `{at, course, size, timed, seconds, score, total, byTopic: [{topic, right, total}], wrong: [questionId], flagged: [questionId]}`. Same synced, offline-safe store as other private rows; add the family to “Export my data”, the mock harness, and sign-out cleanup.
- `ExamHistory` tool: a list of past exams (date, course, score as a ring, time per question) with a score trend at the top; opening one shows its topic table and its missed questions, each reviewable with explanations; “Retake the missed” starts a set of just those.
- Results screen: add how this exam compares with the last one of the same course (“+2 since Nov 14” as a chip, not a sentence).
- Progress tab: a “Practice exams” card showing the last five scores as dots and opening `ExamHistory`. Hidden until one exam exists.

## 3. Rules you miss (`MissedRules`, `missedRules.ts`)
An error log built only from data that exists: every question has a `rule`, an `authority`, and four explained choices with roles.
- A rule is “missed” when its question’s latest answer was wrong, or it has been missed before and has not since been answered right on two different days in a row. Pure function, unit tested.
- The tool lists rules grouped by topic, worst first: the rule text (first sentence visible, tap to expand), authority, times missed, last missed, and which kind of wrong answer caught him. A red “Drill these” starts a practice session of exactly those questions; a rule leaves the list when it is clean.
- Works for all three courses; `course` narrows it. Progress tab gets a “Rules you miss” row with the count, opening the tool.

## 4. Close calls (`CloseCalls`)
A twenty-second exercise: for a question he has already seen, show the fact pattern and only two choices — the correct one and the “sneaky” one — in random order. He picks; both explanations appear with the rule. Next.
- Order: questions where he picked the sneaky choice first, then guessed ones, then others seen. Ten per round, then a result (“8 of 10”) with red “Next round” and gray “Done”.
- Does not call `record_answer` and does not move the review schedule; logs one `drill` study event per round like Match, counted once per day per question.
- Keyboard: 1/2 or A/B, Enter for next.

## 5. Plain words for wrong answers
On Progress and on the answer review, replace “Sneaky distractor / Average distractor / Really bad answer” with “Close call / Plausible / Way off”, and “Correct but guessed” with “Right, but guessed”. Section title “Which wrong answers catch you” becomes “How you miss”. Tapping a row opens a sheet listing his own answers of that kind (question prompt, what he chose, the right choice; tap to open the question). The “Close call” sheet has a “Practice close calls” button. The database values (`sneaky`, `average`, `bad`) and the content skills keep their names; this is display only. Remove the red “How this works” link there if 1A left it; the rows now explain themselves on tap.

## Tests
Unit: missed-rule state machine; exam summary; close-call ordering; size options versus bank size. Browser: take a 10-question exam using Previous, a changed answer, a flag and the map; finish with one unanswered; reload and see it in history; retake the missed; a close-calls round by keyboard; the Progress sheets. Add new screens to `tests/browser/capture.mjs`.

## Done
Everything in STANDARDS “Verification”. List each numbered item as done / changed / not done.
