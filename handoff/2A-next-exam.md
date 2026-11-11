# Package 2A — The next exam drives Study

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 1 (1A and 1B) is merged. Branch: `codex/2a-next-exam` from the latest `main`. Runs in parallel with 2B and 2C.

## Why
Finals: International Law Dec 2 (essay, printed notes allowed), Asylum Dec 7 (open-book essay), Professional Responsibility Dec 9 (closed-book multiple choice). A reviewer playing Austin the night before each final found that the night before looks like any other night: “45 to go today”, a multiple-choice session for an essay exam, tomorrow’s exam visible only as a small tile below the fold. Exam morning still asks for a 35-minute grind. On Dec 10 the app still says “6 to go today” with nothing worth opening. Practice never ends, so his real six-question bursts have no finish. After missed days the streak dies without a word.

## Files you own
`src/pages/_index.tsx`, `src/pages/StudyTab.tsx`, `src/pages/_index.module.css`, `src/helpers/studySession.ts`, `src/helpers/studyEngine.tsx` (greeting lines included), `src/components/HowItWorks.tsx`, new `src/components/CourseSheet.tsx`, `src/components/SessionRecap.tsx`, `src/components/ToolHost.tsx`, tests. Do not edit `QuizSession.tsx`, `WrittenPractice.tsx`, `Courses.tsx`, `ProgressTab.tsx` (2B and 2C own them) beyond a one-line prop if unavoidable; say so in your report.

## 1. A home for course tools (do this first; 2B and 2C plug into it)
Tools built by other packages live in `src/components/tools/<Name>.tsx`, each default-exporting a full-screen component with props `{ course?: CourseCode; arg?: string; onClose: () => void }`.
- Build `ToolHost`: the route `#/tool/<name>/<course?>/<arg?>` opens that tool full-screen over the current tab (lazy, `import.meta.glob("../components/tools/*.tsx")`, so the app builds whether or not a tool exists yet). Back/Close returns to where he was, like the other overlays (`useBackClose`).
- Export `hasTool(name)` so a row can hide when its tool is not in the build.
- Names other packages will ship: `IssueSpot`, `CloseCalls`, `MissedRules`, `ExamHistory`. Later stages add more.

## 2. Each final gets its own sheet
Tapping a Finals tile (and the course name in the eve card below) opens `CourseSheet`, a bottom sheet (centered panel on desktop) for that course. No sentences; rows and chips only:
- Title: course name. Chips: the date (“Dec 2”), days left, and the format in plain words (“Essay”, “Printed notes” / “Essay”, “Open book” / “Multiple choice”, “Closed book”) from `EXAMS`.
- “Today” rows, best first, chosen by format, each with its count or length and one tap to start:
  - Essay courses: Spot the issues · 3 min (`#/tool/IssueSpot/<course>`, hidden until that tool exists), Write an essay · 15 or 45 min (45 in the last 7 days), Review N (due questions + cards), N new.
  - Pro Res: Timed set · 25 questions (opens the practice-exam picker preset to Pro Res), Rules you miss · N (`#/tool/MissedRules/pr`), Close calls (`#/tool/CloseCalls/pr`), Review N, N new.
- “Weak spots”: up to five units marked Shaky, or with missed topics, as tappable chips (open the existing topic sheet).
- A coverage strip: one segment per unit taught, colored by status (reuse the Progress segmented bar).

## 3. The night before, the morning of, and after
Use the injected “today” (the harness passes `now`) so this is testable. Pure helper `examMoment(today)` → `{ kind: "normal" | "eve" | "morning" | "done", course? }`.
- **Eve** (a final is tomorrow): the hero card becomes that exam’s card. Title “International Law tomorrow”. One red button “Last pass”: a session for that course only — its missed questions first, then questions and cards from Shaky units, then anything due — at most 25 items, and it ends (it is not endless). Under it, rows: Weak spots (chips as above), Rulebook, and by format: essay courses get Spot the issues and Write an essay · 45 min; Pro Res gets Timed set · 25 and Rule recall (Rulebook in Recall mode). Tonight’s goal is the last pass only; the other courses stay reachable through the course switch and are not counted. The greeting comes from a calm exam-eve set (add 8–10 lines in the existing voice).
- **Morning** (a final is today): hero title “International Law today”. One gray button “Warm up · 10 min”: read-through of his ten weakest rules for that course (Rulebook Read mode filtered; no grading). No ring, no “to go”, no other course pressure. Good-luck greeting set (8–10 lines).
- **Done** (the last final has passed): no ring and no “to go”. Hero title “Fall finals done”. Three tiles: answers given, essays written, units Solid (all courses, this semester). A gray button “Keep practicing” starts ordinary practice. The To do card moves above the tools. The How sheet says there is no daily goal now.
- Between finals nothing special is needed beyond 1A’s rule that passed courses leave “All”.

## 4. A finish line
- When he reaches today’s goal inside a session, celebrate inside the quiz at that moment (the existing goal celebration, currently only on the Study tab), once per day.
- When he closes or finishes a practice session with three or more answers, show `SessionRecap` before returning to Study: answered and right (big numbers), units that changed status this session as chips (“Laws of War · Learning → Solid”), and the next review date. Buttons: red “Done”, gray “Keep going”. Fewer than three answers closes straight away. Never shown for exams (they have results) or under two seconds after open.
- The streak chip becomes tappable: a small sheet with the last 14 days as dots, the current streak and the best streak.
- After a broken streak (no study yesterday, streak was 2 or more), the greeting comes from a welcome-back set (8–10 lines, warm, no guilt), and the hero shows today’s goal as usual (1A already caps it).

## 5. Keep the sheet true
Update `HowItWorks` for: last pass, exam morning, finals done, the recap, and the streak.

## Tests
Unit: `examMoment` on Dec 1, 2, 3, 6, 7, 8, 9, 10; last-pass contents and cap; recap status changes. Browser (harness `now:`): eve hero on 2026-12-01 at 390 and 1440, morning on 12-02, done on 12-10, tile opens CourseSheet with format-specific rows, recap after five answers, goal celebration inside the quiz. Add these screens to `tests/browser/capture.mjs`.

## Done
Everything in STANDARDS “Verification”. List each numbered item as done / changed / not done.
