# Lawstin

Austin’s law-school assistant: courses, study materials, and daily practice, with layouts for iPhone, Mac, and the web.

- Front end: React + Vite, hosted on GitHub Pages. Installs to the iPhone Home Screen and Mac Dock as a full-screen app.
- Courses: International Law, Asylum Law, Professional Responsibility, Civil Clinic, and Civil Procedure Tutoring. Clinic and Tutoring have reserved workspaces; task lists are planned for a later update.
- Study tools: flashcards, interactive flowcharts, rule review, comparison tables, sorting drills, and written hypotheticals, with search, checkoffs, highlights, confidence ratings, and printing.
- Data: Supabase project `vbqfmgsrxurdazujbbuk`. Row-level security limits private reads and writes to Austin’s account. Verified study content lives in `src/data/study-materials.json`; private study progress syncs through namespaced rows in the existing `app_settings` table, with a local retry queue.
- App logic lives in three database functions: `get_state`, `record_answer`, `mark_question` (see `supabase/schema.sql`).
- New questions are written Tue/Thu/Sat mornings by a Claude scheduled task using the `daily-law-quiz` skill.
- Study materials use `skills/lawstin-study-materials/SKILL.md`: Tuesday, Thursday, and Saturday at 9:15 a.m. Houston time, after Claude’s question update. Every item requires an independent check against selected Google Drive course passages.

## Working on it
```
npm install
npm run dev      # local preview
npm run build    # type-check and build to dist/
npm test         # publication, review scheduling, and sync regression checks
npm run study:check
```
Pushing to `main` rebuilds and publishes the site through GitHub Actions.

The initial library contains 45 checked materials from the October 26 classes. `content/fall-review-inventory.json` records the original review library for further source-checked backfill. Its entries are not published legal content.

On Austin’s Mac, `npm run sync:desktop` refreshes the Desktop memory and skill copies. The command stops without writing when `Desktop/LAWSTIN` is not mounted.
