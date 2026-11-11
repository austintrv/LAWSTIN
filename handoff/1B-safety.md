# Package 1B — Nothing gets lost, every overlay behaves

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Branch: `codex/1b-safety` from the latest `main`. Runs in parallel with 1A.

## Why
A hands-on review reproduced real data loss and broken overlays. Each item below was confirmed by running the app unless marked (code).

## Files you own
`src/components/*` (all), `src/helpers/useLogStudy.ts`, `src/helpers/useCourseTasks.ts`, `src/helpers/useStudyMaterials.ts`, `src/helpers/useWritten.ts`, `src/helpers/useModalFocus.ts`, `src/helpers/useBackClose.ts`, `src/helpers/offlineCache.ts`, `src/base.css`, tests. Do NOT edit `src/pages/_index.tsx`, `src/helpers/studyEngine.tsx` or `src/helpers/studySession.ts` (package 1A is splitting and rewriting them); if you need a change there, describe it in your report.

## Data safety
1. **Clinic hours are overwritten** (`TaskList.tsx` ~209–229). When the fetch fails the card shows 0/200, and adding 2 hours writes 2 over the real total. Offline, “Add hours” shows no error and reverts after reload. Fix: never render or save from a fallback; while the real value is unknown the add control is unavailable; cache the last known value locally; queue the change offline and send it later; a failed save says so and keeps the entry.
2. **Workspace notes are lost** (`TaskList.tsx` ~184–191). Leaving within 700 ms cancels the save; an offline edit never syncs. Fix: flush on unmount, on blur and on page hide; keep unsent text locally per course and retry when online.
3. **Essay drafts are deleted** (`WrittenPractice.tsx` ~66). Opening Written practice from the Study “Intl Law essay”/“Asylum essay” buttons or from a hypothetical wipes an unfinished draft. Fix: a draft is only cleared when he grades it or chooses to discard it. Keep one draft per prompt (keyed by hypothetical id or generated prompt), so starting something else never destroys the first. If a draft exists for the course he opens, show it as the first choice (“Continue your draft”) beside starting a new one.
4. **Study events vanish offline** (`useLogStudy.ts` ~25). Flashcard grades, Match rounds, drills and essays are inserted fire-and-forget. Fix: queue them like quiz answers (see `lawstin-answer-queue` in `useLawstinData.tsx`/`offlineCache.ts`): persist, send in order when online, once each (give each event a client id and make retries idempotent on the client side: remove from the queue only after success), keep the optimistic day count until the server confirms. Sign-out clears the queue like the others.
5. **Double counting.** Flashcard “again” rounds log a second `card` event for the same card (`Courses.tsx` ~279–281; 24 cards logged 25 events); drill Reset/Retry re-logs (`Courses.tsx` ~395). A card or drill counts once per day toward the goal.
6. **Study progress upsert has no retry** (`useStudyMaterials.ts` ~225–234, code). Add a retry with backoff and on reconnect.
7. **Grading offline hangs** on “Grading…” for 20+ seconds with no message. Fix: detect offline or a 15-second timeout, keep the essay as a saved draft marked ready to grade, say “Saved. Grade it when you’re back online.” in the existing inline message style, and offer “Grade now” when the connection returns. His text must be safe through reload.
8. **Export my data** (`SettingsPage.tsx` ~126) omits graded essays (`written:v1:*`). Include them.

## Overlays and keyboard
9. **“Write and grade” opens behind the reader**: Written practice renders at z-index 400 under the Courses dialog at 500, so nothing visible happens. It must open on top; Close returns to the reader.
10. **Escape** closes Written practice and Match (with the same draft safety as Close). In a timed exam, Escape and Close ask before ending (“End exam?” with End and Keep going) instead of ending instantly.
11. **Focus stays inside every overlay.** Tab currently walks out of the quiz, Written practice, Match, Missed lesson, Ask and both sheets onto the page behind. Make `useModalFocus` a real focus trap (cycle Tab/Shift+Tab, skip hidden elements, include `summary`), restore focus to the opener on close, and use it everywhere including `AskPanel` (which has none).
12. **Written practice is for essay courses.** Remove Pro Res from its course picker (Pro Res is multiple choice; see `EXAMS` in `studyEngine.tsx`).
13. **Exam header.** The practice-exam question view has Close on the left. Use the shared header: Close on the right.
14. **Flashcard screen readers**: the card button’s `aria-label` hides its text (`Courses.tsx` ~298). Let the prompt and answer be read.
15. **Reduced motion gaps** (code): transitions in `QuizSession.module.css` (`.prog i`, `.choice`, `.chev`, `.otherChev`, `.factToggle svg`), `WrittenPractice.module.css` (`.seg button`, `.barRow i b`, `.model summary svg`), `AskPanel.module.css` (`.starter`, `.send`); smooth scrolls at `QuizSession.tsx` ~595 and `AskPanel.tsx` ~123. All must stop under `prefers-reduced-motion: reduce`.
16. **Dark-mode contrast.** White text on the dark-mode red `#ff4560` is 3.35:1 on every primary button. Fix at the token level in `src/base.css` so primary buttons reach 4.5:1 in dark mode while still reading as the same red. Also raise these to 4.5:1 in both themes: “Not covered” label, green “Right …” pills, “Solid”, teal Asylum labels, white letters on course dots.
17. **Sheet Close buttons** are 30px with no enlarged tap area (`.x` in `_index.module.css` ~203 — that file belongs to 1A, so add the fix as a shared class in `base.css` or the BottomSheet styles and tell the lead which rule to delete). Target: 36px circle, 44px tap area, same as full-screen views.

## Tests to add
Browser tests (extend `tests/browser/study-flows.mjs`, mock additions in `tests/browser/mock.mjs`): hours survive a failed fetch and an offline add; notes survive a fast leave and an offline edit; an essay draft survives opening another prompt and a reload; an offline flashcard grade is sent exactly once after reconnect; Escape closes Written and Match; Tab never leaves an open overlay; “Write and grade” is visible on top of the reader.

## Done
Everything in STANDARDS “Verification”. In your report, list each numbered item as done / changed / not done.
