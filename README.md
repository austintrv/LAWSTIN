# Lawstin

Austin’s personal quiz app for Fall 2026 (International Law, Asylum Law, Professional Responsibility).

- Front end: React + Vite, hosted on GitHub Pages. Installs to the iPhone Home Screen and Mac Dock as a full-screen app.
- Data: Supabase project `vbqfmgsrxurdazujbbuk` (tables `questions`, `progress`, `answers`, `runs`). Row-level security limits every read and write to Austin’s account.
- App logic lives in three database functions: `get_state`, `record_answer`, `mark_question` (see `supabase/schema.sql`).
- New questions are written Tue/Thu/Sat mornings by a Claude scheduled task using the `daily-law-quiz` skill.

## Working on it
```
npm install
npm run dev      # local preview
npm run build    # type-check and build to dist/
```
Pushing to `main` rebuilds and publishes the site through GitHub Actions.
