# Lawstin — AI memory

## How to use this file
- Claude and ChatGPT both read this file before working on Lawstin and keep it current. It holds project facts only.
- Claude is the primary AI for this project; ChatGPT (or Gemini/Codex) steps in when Claude’s usage is low.
- For how to do a task covered by a skill (for example writing quiz questions with `daily-law-quiz`), follow that skill in full. Don't restate skill rules here.
- Add durable facts or standing rules under Log as `- YYYY-MM-DD (Claude|ChatGPT): fact`. Merge or replace outdated lines instead of piling up.
- When stopping mid-task (usage limit, switching apps), update Current work so the other AI can pick up.
- Two copies exist: `Desktop/LAWSTIN/AI-MEMORY.md` and `AI-MEMORY.md` at the root of the GitHub repo. Update both together; if they differ, the one with the newer Log entry is current.

## What Lawstin is
- Austin’s law-school assistant for all five Fall 2026 courses at UH Law Center: International Law (`il`), Asylum Law (`asy`), Professional Responsibility (`pr`), Civil Clinic (`clinic`), and Civil Procedure Tutoring (`tutoring`). Single user. Clinic and Tutoring have reserved course workspaces; their task lists are deferred. The quiz database’s existing three-course enum stays unchanged.
- Installed to the iPhone Home Screen and the Mac Dock as a full-screen web app (no browser bars). It must look and feel like a polished, company-made Apple-style app. No small explanatory helper text or captions anywhere in the UI.
- Four-choice questions; each choice has a role (`correct`, `sneaky`, `average`, `bad`) and its own explanation. Spaced review: a miss returns in 1 day; correct answers move out to 3, 7, 16, then 35 days. Rounds of 10, daily goal 20.
- Screens: Courses (five-course directory, study-tool sidebar on desktop and horizontal tools on phone), Study (default tab: red italic time-of-day greeting, course filter, streak flame, goal ring, course rows, Practice exam, Written practice, Missed, Starred, Latest update card), Progress, Activity, Settings sheet from the red “A” avatar. Quiz: tap a choice again to deselect; Check button slides up only when a choice is selected; full review screen after each answer (verdict, your answer, correct answer, rule, other choices, Ask about this, Harder version); red score ring at the end.

## Where things live
- Live app: https://austintrv.github.io/LAWSTIN/
- Code (live source): GitHub repo `austintrv/LAWSTIN`, branch `main`. Pushing to `main` builds and publishes through GitHub Actions (`.github/workflows/deploy.yml`). React 18 + Vite + TypeScript, CSS modules; `npm run build` type-checks and builds.
- `Desktop/LAWSTIN/app/` is a copy of the repo, not a git checkout. Make code changes in the repo, then refresh the copy.
- `Desktop/LAWSTIN/floot-export/` is the original Floot export (code + data JSON). The original icon and launch-screen PNGs are in `Desktop/LAWSTIN/`.
- `skills/`: content-writing skills (`skills/daily-law-quiz/SKILL.md`, `skills/lawstin-study-materials/SKILL.md`) and `skills/README.md`, which lists the standards every content task follows and maps Claude’s tool names for other AIs. Also in `Desktop/LAWSTIN/skills/`.
- Lawstin claude.ai Project: `claude/lawstin-setup.md` (same facts) and `floot-features/` (the original Floot patches).

## Backend (Supabase)
- Project “Lawstin”, id `vbqfmgsrxurdazujbbuk`, region us-east-2, free plan. URL `https://vbqfmgsrxurdazujbbuk.supabase.co`. The publishable key is in `src/helpers/supabase.ts`.
- Sign-in: email + password (Supabase Auth). Row-level security limits every table to Austin’s account (`public.is_owner()` checks the email trevinoaustin10@gmail.com).
- Tables: `questions`, `progress`, `answers`, `runs` (see `supabase/schema.sql`), plus `app_settings` (notification and email settings), `push_subscriptions`, and `server_secrets` (service-role only).
- App logic is in database functions: `get_state` (everything the app shows), `record_answer` (saves an answer and updates the review schedule), `mark_question` (star, flag, “I guessed”).
- `server_secrets` holds: Web Push keys (`vapid_public`, `vapid_private_jwk`), the scheduler key (`cron_key`), `gemini_api_key`, `resend_api_key`. Never print, copy, or commit these values. The public Web Push key is also in `src/helpers/pushClient.ts`.
- Supabase’s dashboard prompt for Edge Function secrets was paused when this was set up, so the functions read keys from `server_secrets` instead.

## Edge Functions (code in `supabase/functions/`)
- `ai`: the AI tutor (Ask about this, Harder version, Written practice issue-spotter and grading) on the Gemini API free tier. Uses `gemini-3.5-flash` with low thinking (about 7–10 seconds) and falls back to `gemini-3.5-flash-lite` on a rate limit, overload, or timeout. Grounded in the stored rules; must not invent authorities. Harder-version questions get ids starting `ai-` and are never saved.
- `notify`: Web Push notifications and the Sunday summary email (Resend, sender `onboarding@resend.dev`, delivers only to Austin’s address). Jobs: `tick` (hourly; evening reminder at 6pm Houston on days he hasn’t studied, Sunday email at 11am Houston), `newQuestions`, and the Settings test buttons.
- Deploying an Edge Function needs the Supabase connector (Claude) or the Supabase CLI. Keep the `ai` and `notify` functions’ shared code in `supabase/functions/_shared/`.

## Study materials
- `src/data/study-materials.json` is the app-readable, verified study library. `src/helpers/studyMaterials.ts` defines the six formats and validates provenance, verification stamps, dates, and decision trees. Both the build and the app reject structurally invalid items. `src/data/study-taxonomy.json` reuses exact topic/subtopic strings read from the question database.
- `content/study-checks/` preserves item-level checker decisions and run counts. `npm run study:preflight` reads a private current history summary; `npm run study:publish` appends only independently checked items with matching audit counts. Follow the study skill; a structural validator does not establish legal accuracy.
- Private card schedules, checkoffs, confidence, notes, highlights, and stars use `app_settings` keys beginning `study:v1:`. Existing owner-only RLS applies. Each field/item is a separate row; unsent changes are cached per authenticated user and retried. Do not put private study records in Git. No new tables, migrations, question rows, or question RPC changes were needed.
- Flashcards share `reviewSchedule` with questions (miss: 1 day; correct: 3, 7, 16, 35 days), interleave courses, and prioritize topic accuracy below 70% with two answers, sneaky misses, and guesses. Written hypotheticals save the student’s analysis before revealing the model analysis.
- Desktop/web uses a top navigation, wide layouts, course sidebar, reading panels, and scroll-driven reveals. Phone uses bottom tabs and full-screen readers. Honor reduced-motion preferences and keyboard/focus access. Sources remain available in each study item.

## Scheduling
- pg_cron job `lawstin-tick` calls `notify` hourly. A trigger on `runs` sends the new-questions notification when an update writes its run row.
- Study materials: ChatGPT task “Lawstin study update”, Tuesday/Thursday/Saturday at 9:15 a.m. America/Chicago, follows `skills/lawstin-study-materials/SKILL.md`. Reads quiz history and exact taxonomy through Supabase; builds only from selected Drive course passages. No-op runs read no source files and write nothing. Routine verified content updates publish through the repository’s existing GitHub Pages workflow.
- New questions: Claude scheduled task “Lawstin question update”, Tue/Thu/Sat 7:45am Houston, following the `daily-law-quiz` skill (Opus writes, an independent Sonnet checker must pass every question) and writing to Supabase with `mcp__Supabase__execute_sql`.
- If ChatGPT adds questions by hand, follow the same rules as the skill: question ids `{course}-{YYYYMMDD}-{nn}`, exactly four choices A–D with one of each role, `verified` set only after an independent check, then a `runs` row for the day. Do not change the schema, RLS, database functions, or `auth` schema, and never delete rows.

## Rules
- Any scheduled or by-hand content task (questions, flashcards, flowcharts, rule summaries) follows the standards in `skills/README.md`: sourced from the Drive course materials, past classes only, existing topic strings, an independent verification pass before anything reaches the app, plain writing with curly quotes.
- An AI without Supabase access doesn’t change the database. New tables or functions go in `supabase/migrations/` as a SQL file plus a Current work note; Claude applies them.
- Floot is no longer used. Don't call Floot tools or write to the Floot project.
- Keep everything free-tier: Supabase free, GitHub Pages, Gemini free tier, Resend free.
- Never commit keys, passwords, or tokens to the repo.

## Current work
- 2026-10-28: Further source-checked backfill is tracked in `content/fall-review-inventory.json` (25 original units, 20 maps, 231 cards, 10 sorting drills, 6 hypotheticals). The six study-tool formats are implemented; the original legal corpus has not been bulk published without a fresh Drive check. The initial 45-item library covers October 26 material. The scheduled study task can fill older coverage within the backlog limits.
- 2026-10-28: The cloud workspace cannot access Austin’s actual `Desktop/LAWSTIN`. The repo memory and skills are current; run `npm run sync:desktop` from this checkout on the Mac to refresh the Desktop copies. Do not claim that the unmounted Desktop was updated.
- Clinic and Tutoring task lists remain deferred at Austin’s request.

## Log
- 2026-10-28 (Claude): Moved Lawstin off Floot to Supabase + GitHub Pages for autonomy and to avoid vendor usage caps. All 15 questions, 5 progress rows, 5 answers, and the Oct 27 run moved over and were checked against the Floot export.
- 2026-10-28 (Claude): Ported the planned Floot features (review screen, deselect, score ring, Latest update card, streak flame, goal check, Settings, notifications, weekly email, AI tutor, Written practice, new icon and launch screens). Tested at iPhone size; test answers were mocked so nothing was written to Austin’s record.
- 2026-10-28 (Claude): The first Gemini key belonged to a Google project with prepaid billing and no credits, which returns 402 on every model. The working key comes from an AI Studio project with no billing. Gemini 3.8 Flash was overloaded and timed out past Supabase’s 150-second function limit, so the tutor is pinned to 3.5 Flash with a Flash-Lite fallback.
- 2026-10-28 (Claude): Test weekly email sent successfully. Push encryption verified by decrypting a test payload; a real notification still needs Austin to turn on notifications from the Home Screen app.
- 2026-10-28 (Claude): Added `skills/` with the daily-law-quiz skill and a README of shared content standards so ChatGPT’s scheduled task for flashcards and flowcharts follows the same sourcing and verification as the questions.

- 2026-10-28 (ChatGPT): Reframed Lawstin as the full school assistant; added the five-course Courses tab, reserved Clinic/Tutoring workspaces, and six study formats from Fall review with search, section checkoffs, confidence, highlighting, saved written analysis, print, mixed flashcards, and spaced review. Added wide web layouts and a separate desktop sign-in presentation while preserving Lawstin’s typography, red accent, dark mode, and phone navigation.
- 2026-10-28 (ChatGPT): Added 45 Drive-sourced October 26 study materials (15 per study course: 10 cards plus one each of flowchart, rule review, comparison, sorting drill, and hypothetical). Thirty were kept without changes; 15 received cited corrections or productive-recall prompt revisions and passed fresh independent checks; none were dropped. Read current quiz history and reused its exact topic/subtopic names. No topics met the weak threshold, and no sneaky misses or guesses were recorded.
- 2026-10-28 (ChatGPT): Added the study-material skill, private preflight, audited publisher, validation/build gates, and regression coverage for publication safety, review intervals, mixed queues, and sync races. Study progress sync uses existing protected settings rows; no database schema changes. The Desktop sync helper is ready, but the actual Desktop copy is inaccessible from this cloud workspace.
- 2026-10-28 (ChatGPT): Enabled the scheduled task “Lawstin study update” for Tuesday, Thursday, and Saturday at 9:15 a.m. America/Chicago, following the repository study skill. Validated 14 regression checks and interactive browser flows at 320/390/768/1440 pixels using mocked writes. Confirmed the existing quiz tables still contain 15 questions, 5 progress rows, 5 answers, and 1 quiz run.
