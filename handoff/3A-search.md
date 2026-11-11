# Package 3A — Find anything, and a tab bar that makes sense

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 2 is merged. Branch: `codex/3a-search` from the latest `main`. Runs in parallel with 3B.

## Why
Two finals are open-notes essays, where speed of lookup matters, and there is no search across the app. The only search box (Courses) matches raw JSON, so “il” or “verified” matches everything and results show no reason. The Rulebook was three taps away. On the Mac there are no shortcuts for moving around. A newcomer could not guess what lives in “Activity” versus “Progress”: missed topics (a to-do) and an Updates feed that duplicates Study sit in Activity.

## Files you own
`src/pages/_index.tsx` (tabs, routes, shortcuts), `src/pages/ProgressTab.tsx`, `src/pages/ActivityTab.tsx` (to be folded in), new `src/pages/SearchTab.tsx` (+ css), new `src/helpers/searchIndex.ts`, the search line in `src/components/Courses.tsx` (~117) only, `public/manifest*` shortcuts if any, tests, harness. Do not edit `StudyTab.tsx` beyond links, nor files 3B owns (`src/components/tools/Topic.tsx`, `Notes.tsx`, `useNotes.ts`, the rest of `Courses.tsx`).

## 1. One search index (`searchIndex.ts`, pure, unit tested)
Built in memory from what the app already loads; no backend change.
- Sources: rules (each question’s `rule`, `authority`, topic, subtopic — never the fact pattern, choices or answer of a question, so search cannot spoil practice); study materials by their real text fields per kind (title, topic, authority, flashcard front/back, outline headings and text, comparison labels and cells, flowchart questions and outcomes, drill statements, hypothetical titles and questions only); syllabus units; Clinic and Tutoring tasks; graded essay prompts; his own notes when package 3B’s `useNotes` exists (import defensively through a small optional provider so either package can merge first).
- Matching: case and accent insensitive, straight and curly quotes equal, every word must match, prefix matches allowed, exact phrase and authority matches rank first, then title, then body. Returns a snippet with the matched words marked.
- Fast enough to run on each keystroke for a few thousand items (precompute normalized text once per data change).

## 2. Search tab
Tabs become **Study · Courses · Search · Progress** (bottom bar on phone, top bar on desktop).
- A search field at the top (focus on arrival on desktop; on phone focus when tapped), course chips to narrow (All, Intl Law, Asylum, Pro Res, Clinic, Tutoring).
- Results grouped by kind with a count — Rules, Flashcards, Flowcharts, Rule reviews, Comparisons, Sorting drills, Hypotheticals, Topics, Notes, Tasks, Essays — each row showing course dot, title, and the snippet. Tapping opens the thing itself: a rule opens the Rulebook scrolled to it; a material opens its reader; a topic opens `#/tool/Topic/<course>/<unit>` when that tool exists, else the topic sheet; a task opens its workspace; an essay opens it in Written practice history.
- Before he types: recent searches as chips (kept locally, clearable) and each course’s units as a browsable list (tap a unit = same as a Topic result).
- No results: the query with nearby suggestions from the index (closest topic and authority names) as chips. No explanatory sentences.
- Desktop: results left, a preview of the highlighted result right (rule text, card, or material summary), Enter opens it. Arrow keys move through results.
- Replace the Courses page search with this index (same results component, limited to that course and to materials).

## 3. Activity folds into Progress
- Progress keeps its tiles, “How you miss”, practice exams, rules you miss and the coverage cards, and gains from Activity: the study calendar, the last-14-days chart, the Missed topics list, and Updates (collapsed to the newest, expandable).
- On desktop arrange Progress as a real dashboard within the page width (coverage cards as the main column, the rest in a side column); on phone order it: tiles, calendar, missed topics, how you miss, coverage, exams, updates.
- `#/activity` redirects to `#/progress`. Remove the Activity tab code. Check that push notifications and the service worker (`public/sw.js`, `supabase/functions/notify/index.ts`) do not link to `#/activity`; if they do, report it instead of editing the function.

## 4. Keyboard on the Mac
- ⌘K or `/` opens Search from anywhere (not while typing in a field for `/`). ⌘1–⌘4 switch tabs. `G` then `S/C/P` is not needed.
- `?` opens a “Keyboard shortcuts” sheet listing every shortcut in the app as rows with key caps (quiz A–D/1–4, Enter, arrows, Escape; exam F and M; flashcard keys; search). Settings gets a “Keyboard shortcuts” row on desktop that opens the same sheet. This sheet is on-tap detail, which the design rules allow.
- Escape in Search clears the field, then leaves focus.

## 5. Deep links
A hash that matches nothing lands on Study without breaking Back. `#/q/<id>` keeps working.

## Tests
Unit: index ranking, quote and accent folding, no question stems in results, snippets. Browser: search a rule by a word from its authority and open it; course chip narrows; ⌘K from Progress; arrow and Enter on desktop; `#/activity` redirect; calendar and missed topics present on Progress at 390, 820, 1440. Update `tests/browser/capture.mjs` for the new tab set.

## Done
Everything in STANDARDS “Verification”. Update the tab list in the “How Lawstin works” sheet if it mentions tabs. List each numbered item as done / changed / not done.
