# Package 4C — Say what it is, not just its citation

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first (the 2026-11-11 and 2026-11-12 Log entries describe the current app). Branch: `codex/4c-plain-names` from the latest `main`. Commit and push after each numbered section.

## Why (Austin, 2026-11-12)
“Shortform citations everywhere. I look at them and they do nothing for me because there are so many. I need to know what it actually is. The Match thing is good but I don’t use it much because it does not say what the rule is. That is not the only place.”

A line like “Rule 3.8(d)” or “AP I art. 52(2)” tells a student nothing unless he already knows it. Today the app shows a bare `authority` string in many places and Match pairs a rule with only that string.

## The rule for the whole app
A citation never stands alone. Wherever an authority is shown, what it is comes first in plain words, and the citation follows as the smaller, secondary line. Where space allows only one line, show the plain words.

## What the app may use (it must not write legal content)
Everything needed already exists in verified data:
- A question has `rule` (the full statement), `subtopic` (often a plain name, sometimes itself a bare citation such as “Rule 1.18”), `topic`, and `authority`.
- Study materials have `title`, `topic`, `subtopic`, `authority`, and their own text (flashcard `front`/`back`, outline section `heading`/`text`, flowchart node `question`, comparison row `label`, drill `statement`/`why`, hypothetical `issue`).
The app only selects and arranges these words; it never paraphrases or generates a description.

## 1. One helper (`src/helpers/plainName.ts`, pure, unit tested)
- `isBareCitation(text)`: true for strings that are only a citation (rule numbers, article/section numbers, reporter cites, “§”, “art.”, “Rule N”, a case name with no description), false for descriptive phrases.
- `plainName(item, context)` → `{ name, cite }` for a question or material: `name` is the best descriptive words available, tried in this order and skipping any candidate that `isBareCitation`: the subtopic; a material’s title or section heading; the topic; and last the first clause of the rule itself (cut at the first period, semicolon or 90 characters at a word boundary). `cite` is the authority, or empty when the authority is already contained in the name.
- `describeAuthority(authority, index)`: for a place that only has an authority string (for example an authorities list), find the questions and materials that carry the same authority (normalize spacing, case and straight/curly quotes) and return the most common non-citation subtopic among them, plus the first sentence of one of their rules for on-tap detail. Build the index once per data change.
Tests: a table of real-shaped strings for `isBareCitation`; fallbacks in order; an authority shared by three questions resolves to their common subtopic; nothing is invented when no descriptive words exist (returns the rule’s first clause, never an empty name).

## 2. Match (`src/components/MatchGame.tsx`, `src/helpers/matchPairs.ts`)
- The pair is a plain name on one side and the rule on the other: left tile = `plainName(...).name` with the citation small beneath it; right tile = the rule, shown as its first sentence (up to four lines) so tiles stay readable. Skip questions whose name would be only the rule’s own first clause (nothing to match).
- When a pair is matched it stays on the board as one joined card showing the name, the citation and the full rule, so he reads the rule at the moment he gets it right. A wrong pick shows, on the tile he chose, what that rule actually belongs to before it resets.
- The result screen lists every pair of the round as name, citation and full rule, misses first, each row opening the Topic page for that rule’s unit.
- Keep rounds, timing, scoring, `drill` logging and keyboard use as they are.

## 3. Everywhere else a citation stands alone
Audit every place `authority` is rendered (grep `authority` across `src/`) and apply the rule. Known places:
- Rulebook (Read and Recall): each rule is headed by its plain name; citation beneath; in Recall the prompt is the plain name, never only a citation.
- Topic page: rules list and the Authorities list (each authority row = plain name first, citation second, tap shows the first sentence of the rule and filters the page).
- Search: results and the preview pane lead with the plain name; the citation is still searchable and shown second.
- Quiz review: the Rule card is titled with the plain name; the citation is the small line.
- Rules you miss, Close calls, exam history review rows, Missed topics lesson: same.
- Flashcards and “State the rule” cards: the front never consists of only a citation; a rule card’s front is its plain name (citation second).
- Readers: flowchart steps, outline sections, comparison rows, drill explanations and hypothetical issues show their authority as a secondary line under descriptive words that already exist in that item; where an item shows only an authority chip, pair it with the item’s own heading or label.
- Course sheet weak spots, Progress coverage rows and update bubbles already use topic names; leave them.
Anything else you find: fix it and list it in your report.

## 4. Keep the content tasks in step
- `skills/daily-law-quiz/SKILL.md` and `skills/lawstin-study-materials/SKILL.md` (the lead has already added the rule that `subtopic` must be descriptive words and `authority` must name what it cites); do not change them further. Do not change stored data or validators.
- Add one line to the “How Lawstin works” sheet only if it describes Match; keep it true.

## Verification
The lighter rule in STANDARDS: check only the screens you change (Match, Rulebook, Topic, Search, quiz review, Rules you miss, a flashcard, one of each reader) at 390x844 and 1440x900 in light and dark, plus 820x1180 once; run the full browser suite once at the end. The mock data’s authorities are placeholders like “sample authority 4.1 (placeholder)”; add a few realistic bare citations and descriptive subtopics to `tests/browser/mock.mjs` so the screens show the real problem.

## Done
List each numbered section as done / changed / not done, and every place you changed in section 3.
