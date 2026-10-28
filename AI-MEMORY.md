# Lawstin — AI memory

## How to use this file
- Claude and ChatGPT both read this file before working on Lawstin and keep it current. It holds project facts only.
- Claude is the primary AI for this project; ChatGPT (or Gemini/Codex) steps in when Claude’s usage is low.
- For how to do a task covered by a skill (for example writing quiz questions with `daily-law-quiz`), follow that skill in full. Don't restate skill rules here.
- Add durable facts or standing rules under Log as `- YYYY-MM-DD (Claude|ChatGPT): fact`. Merge or replace outdated lines instead of piling up.
- When stopping mid-task (usage limit, switching apps), update Current work so the other AI can pick up.
- Two copies exist: `Desktop/LAWSTIN/AI-MEMORY.md` and `AI-MEMORY.md` at the root of the GitHub repo. Update both together; if they differ, the one with the newer Log entry is current.

## What Lawstin is
- Austin’s personal law-school quiz app for his Fall 2026 2L courses at UH Law Center: International Law (`il`), Asylum Law (`asy`), Professional Responsibility (`pr`). Single user.
- Installed to the iPhone Home Screen and the Mac Dock as a full-screen web app (no browser bars). It must look and feel like a polished, company-made Apple-style app. No small explanatory helper text or captions anywhere in the UI.
- Four-choice questions; each choice has a role (`correct`, `sneaky`, `average`, `bad`) and its own explanation. Spaced review: a miss returns in 1 day; correct answers move out to 3, 7, 16, then 35 days. Rounds of 10, daily goal 20.
- Screens: Study (default tab: red italic time-of-day greeting, course filter, streak flame, goal ring, course rows, Practice exam, Written practice, Missed, Starred, Latest update card), Progress, Activity, Settings sheet from the red “A” avatar. Quiz: tap a choice again to deselect; Check button slides up only when a choice is selected; full review screen after each answer (verdict, your answer, correct answer, rule, other choices, Ask about this, Harder version); red score ring at the end.

## Where things live
- Live app: https://austintrv.github.io/LAWSTIN/
- Code (live source): GitHub repo `austintrv/LAWSTIN`, branch `main`. Pushing to `main` builds and publishes through GitHub Actions (`.github/workflows/deploy.yml`). React 18 + Vite + TypeScript, CSS modules; `npm run build` type-checks and builds.
- `Desktop/LAWSTIN/app/` is a copy of the repo, not a git checkout. Make code changes in the repo, then refresh the copy.
- `Desktop/LAWSTIN/floot-export/` is the original Floot export (code + data JSON). The original icon and launch-screen PNGs are in `Desktop/LAWSTIN/`.
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

## Scheduling
- pg_cron job `lawstin-tick` calls `notify` hourly. A trigger on `runs` sends the new-questions notification when an update writes its run row.
- New questions: Claude scheduled task “Lawstin question update”, Tue/Thu/Sat 7:45am Houston, following the `daily-law-quiz` skill (Opus writes, an independent Sonnet checker must pass every question) and writing to Supabase with `mcp__Supabase__execute_sql`.
- If ChatGPT adds questions by hand, follow the same rules as the skill: question ids `{course}-{YYYYMMDD}-{nn}`, exactly four choices A–D with one of each role, `verified` set only after an independent check, then a `runs` row for the day. Do not change the schema, RLS, database functions, or `auth` schema, and never delete rows.

## Rules
- Floot is no longer used. Don't call Floot tools or write to the Floot project.
- Keep everything free-tier: Supabase free, GitHub Pages, Gemini free tier, Resend free.
- Never commit keys, passwords, or tokens to the repo.

## Current work
- 2026-10-28: Austin plans to have ChatGPT add study features he liked from his Fall review site (https://austintrv.github.io/fall-review/, repo `austintrv/fall-review`) into Lawstin, keeping Lawstin’s design. ChatGPT: record what you add and anything left unfinished here and in the Log.

## Log
- 2026-10-28 (Claude): Moved Lawstin off Floot to Supabase + GitHub Pages for autonomy and to avoid vendor usage caps. All 15 questions, 5 progress rows, 5 answers, and the Oct 27 run moved over and were checked against the Floot export.
- 2026-10-28 (Claude): Ported the planned Floot features (review screen, deselect, score ring, Latest update card, streak flame, goal check, Settings, notifications, weekly email, AI tutor, Written practice, new icon and launch screens). Tested at iPhone size; test answers were mocked so nothing was written to Austin’s record.
- 2026-10-28 (Claude): The first Gemini key belonged to a Google project with prepaid billing and no credits, which returns 402 on every model. The working key comes from an AI Studio project with no billing. Gemini 3.8 Flash was overloaded and timed out past Supabase’s 150-second function limit, so the tutor is pinned to 3.5 Flash with a Flash-Lite fallback.
- 2026-10-28 (Claude): Test weekly email sent successfully. Push encryption verified by decrypting a test payload; a real notification still needs Austin to turn on notifications from the Home Screen app.
