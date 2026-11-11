# Package 4B — Joy now, and a life after December 9

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after 4A is merged. Branch: `codex/4b-joy-longevity` from the latest `main`.

## Why
Austin wants to love the app so he studies more (“Joy matters”). A review found the rewards polite rather than fun (a 300 ms fade for right and wrong, nothing when grading a card), nothing that shows what he has learned rather than what is left, Clinic and Tutoring workspaces that cannot replace Reminders (no repeating tasks, hours are a single total), an evening reminder at 6pm for someone who studies from evening to 3am, and an app hard-wired to Fall 2026 that has nothing to say after the last final.

## 1. Feedback that feels good (all disabled under reduced motion; haptics via `src/helpers/haptics.tsx`)
- Right answer: the chosen choice confirms with a quick spring and check; wrong: a short shake and the correct one lights. Subtle, under 400 ms, no confetti on single answers.
- In-a-row: at 3, 5 and 10 the flame in the quiz bar pulses and the count ticks up.
- Grading a flashcard, a Match pair, a spotted issue: a small confirming motion and haptic.
- Daily goal reached: the ring completes with a satisfying fill wherever he is; one celebration per day.
- A unit reaching Solid for the first time: a chip toast (“Laws of War · Solid”) using the existing toast system.
- 20 more greeting lines in the existing voice for: comeback after a gap, late night (after midnight), a unit turning Solid yesterday, a personal best streak.

## 2. Show what he has learned
- Progress gets a “This week” card: units that moved up (as chips “Learning → Solid”), rules cleaned from “Rules you miss”, essays written with average score, best streak. Built from data already in the app plus a small local weekly snapshot of unit statuses (`lawstin-week-snapshot` in localStorage, also mirrored to one `app_settings` row `snapshot:v1:<week>` so both devices agree).
- Each Finals tile and CourseSheet shows readiness as “N of M units Solid” with the segmented bar, instead of only percent seen.

## 3. Clinic and Tutoring he can run from here
- Repeating tasks: a task can repeat weekly or every two weeks; completing it creates the next one. Store the repeat rule without a schema change if the existing `course_tasks` columns allow it (for example inside notes is NOT acceptable); otherwise add `supabase/migrations/<date>_task_repeat.sql` adding a nullable `repeat text` column (additive, RLS unchanged) and make the app work whether or not the column exists yet. Do not apply the migration; report it.
- Reorder tasks by drag (pointer and keyboard), stored in the existing order field if there is one, else by a local order list in `app_settings`.
- Clinic hours become a dated log: each addition is an entry (date, hours, optional note) kept in `workspace:clinic:log` in `app_settings`; the total and “to go” derive from the existing total row plus entries; entries can be edited or removed with undo. A small weekly bar chart of hours. The existing total row keeps working for the Sunday email.
- The Study “To do” card shows at most three tasks and never sits above the study hero or the eve card.

## 4. The semester becomes data
Today `FINALS`, `EXAMS`, course names, colors and Drive links are constants for Fall 2026.
- Add `semester:v1` (one `app_settings` row): `{ name: "Fall 2026", courses: [{ code, name, short, kind: "exam" | "workspace", format?: "essay" | "mc", notes?: "closed" | "open" | "printed", final?: "YYYY-MM-DD" }] }`. The current constants become the default used when the row is absent, so nothing changes until he edits it. Course codes stay `il`, `asy`, `pr`, `clinic`, `tutoring` (the database enum and the content tasks depend on them).
- Settings gets a “Semester” page: each course with its exam date and format, editable. Changing a date updates the plan, tiles, eve card and How sheet at once. A course can be given a new date after its final (for example Pro Res with an MPRE date), which brings it back into the plan with its question bank.
- After the last final: the “Fall finals done” hero (from 2A) gains a recap he can open any time from Progress: answers, days studied, longest streak, essays and average score, units Solid per course, his five most-missed rules. It is saved as `recap:v1:<semester name>` so it survives later changes.
- Document in your report exactly what a future semester with different courses would still require (the `course_code` enum, the content skills, the notify function), without doing it.

## 5. Reminders that fit how he studies
In `supabase/functions/notify/index.ts` and `_shared/` (the lead deploys; do not deploy):
- Evening reminder time becomes a setting (`notify_evening_hour`, default 21) editable in Settings as a time row; it skips when today’s goal is already met.
- The reminder text names the next exam and today’s remaining number from the same plan math as the app: move the pure plan functions the function needs into `supabase/functions/_shared/` in a way both the app and the function import, replacing the 77-line fork, with tests proving both give the same numbers.
- Tasks due today are mentioned in the reminder when there are any.
- Keep free-tier limits, the existing jobs and the Settings test buttons working. Keep this in its own commit so it can be deployed or held back separately.

## Tests
Unit: repeat rule next dates; hours log totals; semester row parsing with defaults and a moved date; weekly snapshot diff; shared plan math parity between app and function. Browser: complete a repeating task and see the next; add and undo hours; change a final’s date in Settings and see the tile move; reduced-motion run shows no animation on answer feedback. Update `tests/browser/capture.mjs`.

## Done
Everything in STANDARDS “Verification”, `npm run context:test` if you touched shared connector code. List each numbered item as done / changed / not done, and list every migration file you added.
