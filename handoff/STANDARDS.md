# Lawstin build standards (for implementers and reviewers)

Lawstin is a single-user law-school study web app (React 18 + Vite + TypeScript, CSS modules, Supabase backend) installed on an iPhone Home Screen and a Mac Dock. Repo: /home/user/LAWSTIN. Read `/home/user/LAWSTIN/AI-MEMORY.md` before working; its "Rules" and "Austin's design preferences" sections are binding.

## Design rules (binding)
1. No small explanatory helper text, captions, placeholder promises, process notes or source references in the UI. The app explains itself through plain names, structure and on-tap detail. Never add a sentence that explains a control.
2. No marketing slogans, hero banners, institution labels.
3. No plain paragraphs for updates or summaries: use visual, tappable elements (cards, chips, bubbles).
4. Native Apple feel: no pinch zoom, no long-press selection on controls, nothing that visibly swaps after appearing.
5. Typography: weights 400 (body), 600 (labels, primary lines, headings under 22px), 700 only for titles and big numbers 22px and up. Never 500 or 650. One card style (reuse the existing card classes and tokens in `src/base.css`), one small-label style, even gaps. Use existing CSS variables for colors; no new hard-coded colors unless a token is added for light AND dark.
6. Full-screen views share one header: title centered, Close (36px gray circle, 44px tap area) on the right, Back or Star on the left. Buttons: red primary, gray secondary. Reuse the existing header/button classes; do not invent new ones.
7. Desktop (1000px and wider) is its own design: every full-screen view fills the window, two columns up to `--study-width` (1400px). Never a phone column stretched or centered with gutters.
8. No Print buttons.
9. Quiz: always allow going back; no forced rounds; leaving keeps his place.
10. Joy matters: smooth animation and satisfying feedback, but every animation must be disabled under `prefers-reduced-motion: reduce`.
11. Plain words, curly quotes (’ “ ”) in UI strings, sentence case. No em dashes in UI strings.

## Engineering rules
- Free tier only. Never commit or print secrets. Do not touch `auth`. No deleting rows.
- Backend changes only as additive SQL files in `supabase/migrations/` (do not apply them; the lead applies them). Prefer no backend change: private per-user state goes in `app_settings` rows (key/value text) like the existing `study:v1:*`, `written:v1:*` families.
- The app must NOT invent legal content. It may rearrange, schedule, test, search and display existing verified content (questions with `rule`, `authority`, explained choices; study materials; syllabus units) and store Austin's own words.
- Do not change the shape of: `questions`, `progress`, `answers`, `runs`, `study_materials`, `study_runs`, the six study-material JSON formats and their validators (`src/helpers/studyMaterials.ts`), `syllabus:v1:<course>` rows, `get_state`/`record_answer`/`mark_question` signatures. Scheduled content tasks and `skills/` depend on them.
- Keep the "How Lawstin works" sheet (`HowItWorks` in `src/pages/_index.tsx`) accurate whenever logic it describes changes.
- Offline: answers queue offline today; anything new that saves must survive offline (queue or local cache) and never lose typed text.
- Accessibility: every overlay uses `useModalFocus` and `useBackClose`, closes on Escape, has visible focus, keyboard reachable controls, tap targets at least 44px.
- Keep code compact and in the style of the surrounding file. No new npm dependencies. Remove dead code you replace. No comments that narrate the change.
- Commit your work to your own branch (named `codex/<package-id>`), based on the latest `main`. Do not push to `main`, and do not edit AI-MEMORY.md; the lead (Claude) reviews, merges and records.

## Verification every work package must do before reporting
1. `npm test` (unit), `npm run build` (type-check + build), `npm run test:browser` all pass. Add unit tests for new pure logic in `tests/*.test.ts`, and extend `tests/browser/study-flows.mjs` when a user flow is added or changed.
2. Exercise what you changed with the mocked harness (`tests/browser/mock.mjs`: `open({width,height,dark,hash,now,emptyState,prefs,reducedMotion})`; keep throwaway scripts and screenshots out of the repo, `artifacts/` is git-ignored). Check only the screens you added or changed, not the whole app: each one at 390x844 and 1440x900 in light and dark, plus 820x1180 in one theme. `tests/browser/capture.mjs --only <scenes>` captures a subset; do not run the full capture at every size. LOOK at your screenshots and fix what looks wrong: overflow, clipped text, uneven gaps, unreadable dark-mode colors, phone layout stretched on desktop. If a harness step waits a long time on something, fix the harness instead of waiting it out. Run the full browser suite once at the end, not after every change.
3. `s.errors` from the harness is empty (no console errors, no unhandled requests) apart from deliberate offline tests.
4. Offline (`s.setOffline(true)`), keyboard-only use, and `reducedMotion:true` still work for what you touched.
If the harness mock (`tests/browser/mock.mjs`) or capture script (`tests/browser/capture.mjs`) needs to know about a new screen or request, update them.

## Report format (final message)
Under 350 words: what you changed (files), anything in the brief you did NOT do and why, decisions you made where the brief was silent, test results (exact pass counts), the sizes/themes you looked at, and known rough edges. Be exact; do not claim checks you did not run.

## Notes for Codex
- Repo path is wherever your checkout lives; paths in briefs are relative to the repo root.
- Browser tests need Chromium. If `LAWSTIN_CHROMIUM_PATH` is unset and `/usr/bin/chromium` is missing, run `npx playwright install chromium` in your own environment. If you still cannot run a browser, say so plainly in your report; do not claim visual checks you did not make.
- Each brief lists the files you own. Avoid edits outside them; if you must, keep them minimal and name them in your report, because other packages run in parallel.
- Finish with the report described above as your final message or PR description.
