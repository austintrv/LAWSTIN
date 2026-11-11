# Package 1A — Numbers you can trust (Study engine)

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Branch: `codex/1a-numbers` from the latest `main`.

## Why
Austin does not trust the Study screen. A review found: the daily goal shrinks while he answers, so “Done for today” arrives early; after three missed days the goal jumped 12 → 43, after two weeks 60; “N to go today”, “About N min”, the Finals tiles and the session counter show different totals for the same thing; three different “due” counts exist; a course whose final has passed still fills the queue; and the session picks courses at random although International Law is the first final.

## Files you own
`src/pages/_index.tsx`, `src/pages/_index.module.css`, new files under `src/pages/`, `src/helpers/studyEngine.tsx`, `src/helpers/studySession.ts`, `tests/study-session.test.ts`, `tests/browser/study-flows.mjs`. Do not edit `src/components/*` except to change an import path (package 1B owns those).

## Step 0 — split the big file (own commit, no behaviour change)
`src/pages/_index.tsx` is 1,300 lines and every later package touches it. Split it mechanically:
- `src/pages/_index.tsx`: app shell only (tabs, routing, overlays, session state).
- `src/pages/StudyTab.tsx`: `StudyView` and everything only it uses (hero, finals card, To do card, tools list, update card).
- `src/pages/ProgressTab.tsx`, `src/pages/ActivityTab.tsx`: those views.
- `src/components/HowItWorks.tsx`, `src/components/BottomSheet.tsx`, `src/components/ExamPicker.tsx`, `src/components/TopicTools.tsx`.
Keep `_index.module.css` as the shared stylesheet. All three test commands must pass before you continue. Delete the dead code while you are there: unused `Target` import, the `missed` branch in `resumeStudy`, CSS rules `.pills/.pill`, `.note p`, `.empty p`, `.wordmark span`.

## Step 1 — one definition for every number
Put the math in pure functions in `studySession.ts`/`studyEngine.tsx` with unit tests; the views only display.

1. **The goal holds still.** Today’s goal = (what the plan would still ask for now) + (what he has already done today), so each answer moves one from “to go” to “done” instead of shrinking the goal. Also keep the highest value seen today in localStorage (`lawstin-day-goal`, `{date, goal}`), so the goal never drops during a day. Same rule when the finals plan is off (fixed goal).
2. **No mountain after missed days.** Goal range is 5 to 40. Per course, at most 10 overdue reviews count toward one day; the rest roll forward. Unseen material is still spread over the days left (finishing two days early).
3. **Course numbers add up.** The per-course targets shown in “How Lawstin works” and on the Finals tiles must sum to the goal. When the cap applies, scale the course targets down proportionally (largest remainder rounding).
4. **“To go” can never exceed what exists.** to go = min(goal − done today, items actually ready). “About N min” uses the same number. When nothing is ready it reads “Nothing ready today”.
5. **A course filter changes every number.** With Intl Law selected: the ring, “N to go today”, the minutes, the rows and the session all describe Intl Law only. Its “to go” is that course’s remaining target for today (the same number its Finals tile shows as “N today”).
6. **One “ready to review” count** = due questions + due cards for the current filter. Use it for the hero row, the greeting line and the Home Screen badge (badge: all courses that still have a final ahead).
7. **Passed finals step aside.** While any final is still ahead, a course whose final has passed is left out of “All”: its queues, sessions, goal, greeting counts and badge. It stays selectable in the course switch and in Courses. After the last final everything returns to “All”.
8. **Nearest final first.** `buildRound` in mixed mode picks each course’s share of new questions in proportion to its plan target (so the nearest final dominates), and takes due reviews from every course that has them instead of the globally oldest five. Keep the randomness inside a course. Pure and testable with a seeded/injected random.
9. **Missed topics.** The Study row count stays the number of missed topics. The lesson still covers at most four at a time; when more remain, its last screen’s primary button is “Review N more” and continues with the next ones.
10. **Progress tab.** “Answers given” counts everything that counts toward a day (same total as Activity). “Correct but guessed” leaves the wrong-answer bars: show it as its own row with its count, and make every bar a share that cannot exceed 100%.
11. **Update cards agree.** The Study “Latest update” card and the Activity update card compute “N new questions” with one shared function.
12. **Numbers do not roll on load.** `Num` shows the final value on first paint and animates only when the value later changes (and never under reduced motion).

## Step 2 — keep the sheet true
Update `HowItWorks` so every sentence matches the new rules: the goal formula, the 5–40 range and the 10-review limit, that course numbers add up to the goal, the first right answer coming back in 3 days, what “Ready to review” and the streak count. Keep it short and visual (rows, chips, the ladder); do not add paragraphs. Package 4A will redesign it; here it only has to be accurate.

## Tests to add
Unit: goal is stable across a simulated day of answers; never decreases; range and proportional scaling; filter numbers equal tile numbers; “to go” ≤ ready; passed-course exclusion and return after the last final; picker share follows targets; missed-lesson continuation. Browser: answer five questions and assert the ring total did not change and “to go” dropped by five; switch to a course and assert hero “to go” equals that course’s Finals tile.

## Done
Everything in STANDARDS “Verification”. In your report, list each numbered item as done / changed / not done.
