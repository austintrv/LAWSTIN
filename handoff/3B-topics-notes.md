# Package 3B — One page per topic, and notes of his own

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 2 is merged. Branch: `codex/3b-topics-notes` from the latest `main`. Runs in parallel with 3A.

## Why
Everything Austin has on one topic is scattered: its rules live in the Rulebook, cards in Flashcards, a flowchart and a rule review in Courses, his misses in Missed topics, a hypothetical somewhere else. For the Asylum open-book exam he needs each ground’s framework on one screen; for International Law he may bring printed notes, and nothing in the app helps him build or check those notes. There is no place to write his own words for the three exam courses at all (a `study:v1:notes:` key family has a validator and tests but no screen). Print buttons are banned by Austin; copying text out is fine.

## Files you own
New `src/components/tools/Topic.tsx`, `src/components/tools/Notes.tsx` (+ css), new `src/helpers/useNotes.ts`, `src/components/Courses.tsx` + css (course page; not its search line ~117, which 3A replaces), `src/components/Rulebook.tsx` only to accept a topic filter if it lacks one, tests, harness. Do not edit `src/pages/*`.

## Tool contract
`src/components/tools/<Name>.tsx` default-exports a full-screen component with props `{ course?: CourseCode; arg?: string; onClose: () => void }`, opened at `#/tool/<Name>/<course>/<arg>` (host from 2A; `arg` is URL-encoded).

## 1. Topic page (`Topic`, `#/tool/Topic/<course>/<unit topic>`)
One syllabus unit (a `topic` plus its `also` names; see `coverage` in `studyEngine.tsx`). Shared full-screen header; two columns on desktop. Sections appear only when they have content; no empty boxes and no captions:
- Header chips: course, status (New / Shaky / Learning / Solid / Not covered — same words and colors as Progress), class dates.
- “Practice” row of buttons by exam format: questions on this topic (count), cards (count due), and for essay courses Spot the issues / Write an essay when a hypothetical exists for the topic; for Pro Res, Close calls.
- Rules: every rule for this unit (from questions), grouped by subtopic, authority beneath, collapsed to the first sentence with tap to expand. A marker on rules he has missed.
- Framework: the unit’s flowchart(s) and rule review(s) rendered inline in reading form (reuse the reader’s components), comparisons below. This is the open-book “everything for this ground” view.
- Authorities: the distinct `authority` values for the unit as a compact list (tap one = search for it when the Search tab exists, else filter this page).
- Your misses: his missed questions here (prompt only, tap to review).
- My notes: his notes for this unit (section 2), editable in place.
- Previous / next unit in class order, in the header on desktop and at the bottom on phone.
Link to it from the course page (a “Topics” list in class order with status dots, replacing nothing else yet), from Missed-lesson and quiz-review topic names if that needs no edit outside your files (otherwise report it), and replace the topic bottom sheet’s contents with a button to this page only if that sheet lives in files you own.

## 2. My notes (`useNotes`, `Notes` tool, `#/tool/Notes/<course>`)
His own words, never generated.
- Storage: one `app_settings` row per unit. Use the existing `study:v1:notes:` family if its validator shape fits (see `studyProgressStore.ts`, `useStudyMaterials.ts` and their tests); otherwise add `notes:v1:<course>:<unit>` and say so. Rows hold `{text, inNotes: boolean, at}`. Offline-safe: saved locally on every change, flushed on blur, unmount and page hide, retried on reconnect, last write wins by time. Never lose typed text (package 1B fixed the same class of bug in workspace notes; follow that pattern).
- Editor: plain text with simple structure that survives copy: lines starting with `-` render as bullets, `#` as headings; no toolbar beyond bullet and heading buttons. Comfortable reading font and width; grows with content.
- The Notes tool shows the whole course in class order: each unit as a section with its notes and an “In my notes” tick. Units with nothing written are visibly empty rows he can tap to start. A progress strip at the top shows units ticked out of units taught. On desktop: unit list left, editor right, and a third collapsible column with that unit’s verified rules and framework to consult while writing.
- “Copy all” puts the whole course’s notes on the clipboard as clean text with unit headings (so he can paste into Word or Docs and print there); “Share” uses the system share sheet where available. No Print button. A toast confirms.
- Course page gets a “My notes” button for the three exam courses. Notes are included in “Export my data” if that code is in a file you own; otherwise report it.

## 3. Course page tidy-up (only what the above needs)
The course page now has: Review cards, Practice questions, Rulebook, My notes, Written practice (essay courses), then Topics (class order), then Study materials. Keep it one screen of clear choices; do not add a sixth button style.

## Tests
Unit: notes merge and last-write-wins; copy-all formatting; topic page data assembly for a unit with `also` names. Browser: open a topic from the course page at 390 and 1440; type notes, leave within 300 ms, return, text is there; offline edit syncs once after reconnect; tick “In my notes” and see the strip move; Copy all puts expected text on the clipboard (grant clipboard permission in the test). Add the new screens to `tests/browser/capture.mjs`.

## Done
Everything in STANDARDS “Verification”. List each numbered item as done / changed / not done.
