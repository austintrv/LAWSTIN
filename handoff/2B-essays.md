# Package 2B — Essays he will actually write

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 1 is merged. Branch: `codex/2b-essays` from the latest `main`. Runs in parallel with 2A and 2C.

## Why
Two of three finals are essays (International Law Dec 2, printed notes allowed; Asylum Dec 7, open book). In real use Austin has written zero essays; eleven verified hypotheticals sit untouched. He studies in six-question bursts late at night, mostly on the phone, and a blank 15-minute clock is too big a first step. The essay tools also lack what makes essay practice work: a small first step, rewriting, seeing a trend, and working with the rules beside him as the real exams allow.

## Files you own
`src/components/WrittenPractice.tsx` + css, `src/helpers/useWritten.ts`, new `src/components/tools/IssueSpot.tsx` (+ css), `src/components/Rulebook.tsx` + css, `src/components/Courses.tsx` + css (hypothetical reader only), tests, `tests/browser/mock.mjs`/`capture.mjs` additions. Do not edit `src/pages/*`, `QuizSession.tsx`, or the `ai` edge function.

## Tool contract
Package 2A builds a host: any file `src/components/tools/<Name>.tsx` that default-exports a full-screen component with props `{ course?: CourseCode; arg?: string; onClose: () => void }` opens at `#/tool/<Name>/<course>/<arg>`. Until 2A merges, open your tool from your own entry points and test it by rendering it directly.

## 1. Spot the issues (new, `IssueSpot`)
A three-to-five-minute exercise on one verified hypothetical (`Hypothetical` in `src/helpers/studyMaterials.ts`: `facts`, `prompt`, `answer[]` of `{issue, analysis, authority}`). No AI, works offline, invents no content.
- Shows the title, facts and the question, and a small count-up clock.
- He types the issues he sees, one per line (optional; he may also just think). Button “Show the issues”.
- Reveal: each checked issue as a card (issue as the title; tap to open its analysis and authority). He marks each one “Got it” or “Missed it”. His typed lines stay visible beside them (side by side on desktop, above on phone).
- Result: “4 of 6 issues”, the missed ones listed first. Buttons: red “Next fact pattern”, gray “Write it out · 15 min” (opens Written practice on the same hypothetical), “Done”.
- Picks hypotheticals for the course he has not spotted yet, weak topics first; `arg` may carry a specific hypothetical id.
- Saves `spot:v1:<hypotheticalId>` in `app_settings` (`{at, caught, total, missed: string[], lines}`) through the same synced store used for `written:v1:*` (works offline, retried). Logs one `drill` study event worth two answers, right in proportion to issues caught (see how Match logs). A result under half marks the topic weak the way a low essay score does.
- Entry points you own: the Written practice start screen (below) and a “Spot the issues” button beside “Write and grade” in the hypothetical reader.

## 2. Written practice start screen
- Courses offered: essay courses only.
- Two clear choices per course: “Spot the issues · 3 min” and “Write an essay” with a 15 / 45 switch. Default 45 when that course’s final is within 7 days, else the last length he used.
- If a draft exists it is the first row (“Continue your draft”, from 1B).
- Rename the screen heading: the title is “Written practice” and nothing on it says “Issue spotter”.
- At 1000px and wider this screen is a real two-column layout (start on the left; history and trend on the right), not full-width bars.

## 3. Rules beside the essay
Both essay exams allow notes, so practice should too. While writing or spotting, a “Rules” control opens that course’s Rulebook beside the essay: on desktop a right-hand column that can be shown or hidden without losing the text; on phone a sheet over the essay. Give `Rulebook` a search field at the top (filters rules and authorities as he types; clear button; keyboard focus on open) and let it start filtered to the essay’s topic with one tap to show all. The Rulebook search also applies when the Rulebook is opened normally.

## 4. Write it again, and see the trend
- A graded essay has “Write it again”: the same prompt, a fresh attempt, stored with `attemptOf: <first id>`. Its result shows both attempts side by side: scores, and the three rubric parts (issues, rules, application) with the change.
- History: group attempts under their prompt; at the top a trend for the chosen course: score over time as a small line of dots, and the average of each rubric part as three bars. Tapping a dot opens that essay. Spot results appear in the same history with their “4 of 6”.
- Keep everything already stored readable (old rows have no `attemptOf`).

## 5. Small things
- The essay clock keeps counting up; when it passes the chosen length it turns to the warning color. No hard stop.
- Word count stays where it is.

## Tests
Unit: spot scoring and weak-topic rule; attempt grouping and trend numbers; default length near a final. Browser: spot a hypothetical offline, reconnect, the result is saved once; start from the hypothetical reader; rules panel opens and closes without losing typed text at 390 and 1440; write it again shows two attempts; trend renders with the two mocked essays. Add the new screens to `tests/browser/capture.mjs`.

## Done
Everything in STANDARDS “Verification”. List each numbered item as done / changed / not done.
