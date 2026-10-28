# Lawstin skills

These are the instructions the AI follows when it writes study content for Lawstin. Claude and ChatGPT both use them.

## daily-law-quiz
- `daily-law-quiz/SKILL.md` is a copy of the skill Claude’s scheduled task “Lawstin question update” runs every Tuesday, Thursday and Saturday at 7:45am Houston time. It writes the multiple-choice questions.
- The copy saved in Austin’s Claude account is the one that runs. If the skill changes there, refresh this copy.
- Any new content task (flashcards, flowcharts, rule summaries) should follow the same standards as this skill:
  - **Sources:** build only from Austin’s Drive course materials (`UHLC 2L FALL`), with each item tied to a source file and section. International Law is a closed universe.
  - **Which classes:** only classes whose date has passed.
  - **Topics:** reuse the existing topic strings so stats line up across features.
  - **Weighting:** weight toward recent classes, weak topics, and rules Austin half-knows (sneaky misses and “I guessed”).
  - **Verification:** an independent check, by a separate pass that sees only the drafts and the source passages and none of the drafting notes, before anything reaches the app. Drop what fails. A missing item costs less than a wrong one.
  - **Writing:** plain, literal writing with curly quotes, and a short run note saying what was added.
  - **Balanced choices:** in multiple-choice items and sorting drills, no answer may stand out by length, detail, or wording; wrong options are as specific and lawyerly as the right one.
  - **Usage:** decide whether to run before reading any files, and read only the sections needed.

## lawstin-study-materials
- `lawstin-study-materials/SKILL.md` controls ChatGPT’s study-material update on Tuesday, Thursday, and Saturday at 9:15 a.m. America/Chicago, after Claude’s question update.
- It adds independently checked flashcards, flowcharts, rule review, comparisons, sorting drills, and hypotheticals to the repository library. It reads quiz history for recent classes, weak topics, sneaky misses, and guessed answers, and reuses the exact question taxonomy.
- `npm run study:preflight`, `npm run study:publish`, and `npm run study:check` enforce the publication workflow. No-op runs write nothing. Item-level check records live in `content/study-checks/`.

## Tool names
The skill names Claude’s tools. When another AI runs it, use the equivalent:
- `mcp__Google_Drive__read_file_content` / `search_files`: your Google Drive access.
- The Agent tool with `model: "sonnet"`: a separate verification pass with no access to your drafting notes (a second chat, a sub-task, or a different model).
- `mcp__Supabase__execute_sql`: Supabase SQL access. If you don’t have Supabase access, don’t write to the database. Put the content where the AI-MEMORY.md says to, or leave the SQL in a file and note it under Current work for Claude to apply.
