# Package 4A — One design, one name per thing

Read `handoff/STANDARDS.md` and `AI-MEMORY.md` first. Start only after stage 3 is merged. Branch: `codex/4a-one-design` from the latest `main`. Run 4B after this merges (both touch many files).

## Why
A strict review against Austin’s design rules measured: seven card styles (the Courses tab is a different design system from the rest), about twenty font sizes and five small-label styles, tap targets under 44px on many controls, three styles of completion screen, headers that differ between views, and Written practice, Flashcards and Match rendered as a stretched phone column at 1440px. A first-time-user review found one feature under many names and many doors, zero-count rows that look tappable but do nothing, and empty screens that say nothing.

## Scope: the whole UI, as a consistency pass. No new features.

## 1. Tokens first (`src/base.css`)
- Type scale, the only sizes allowed in CSS afterwards: 12 (small label), 13, 15, 17 (body), 20, 22, 28, 34, plus the existing display sizes for the greeting and big numbers (keep those to three). Small label = 12px/600, one color token; nothing under 12px (chart axes included).
- 700 only at 22px and up. Fix “Confidence” (18px) and the How-sheet counts (15px).
- One card: radius 20, the existing soft shadow, no border, one padding scale. Inner tiles: radius 14. Replace the bordered 16px and 22px variants (Courses tab, readers, Rulebook, Connected apps, Ask bubbles keep their bubble shape). Course tiles may keep a tint, but through one shared class.
- Section spacing: one gap between sections and one between cards, used by every tab.
- Remove hard-coded colors (`#5e5ce6`, `#e0a100`, `#f05a28` and any others you find) in favor of tokens with light and dark values.

## 2. One header, one button set, one finish screen
- Every full-screen view: centered title, Close right (36px circle, 44px tap area), Back or Star left. Bring into line: Match (timer moves under the header), Written practice, Connected apps (title “Connected apps”, Back), the quiz Star (into the header left on the review screen), all sheets (36px Close).
- Buttons: one red primary per screen, gray secondaries, same heights (52 primary, 44 minimum for any other). Fix “Done” text links, the 32px “Study” pill, 36px “Send flag”.
- One completion pattern for quiz, flashcards, Match, Missed lesson, exam, spot the issues: same title style, big number, chips, red primary plus gray “Done”.
- Every tap target at least 44px: course switch segments, To do rows, topic bubbles, Ask chips and Send, task Flag/Delete/Clear due, Add task/Add hours, exam and Written pills, Rulebook Read/Recall, avatar.

## 3. Desktop and tablet are their own designs
- 1000px and wider: Written practice (all states), Flashcards (card left, upcoming/answer context right; done screen two columns), Match (board fills, result two columns), spot the issues, exam setup and “How Lawstin works” use the window; nothing is a centered phone column. Quiz review: the left column is mostly empty because the fact pattern starts collapsed (Austin’s rule of 2026-11-01, keep it); place the rule and next-review cards in the left column under the collapsed fact pattern and keep the choices on the right.
- 700–999px (iPad portrait): every full-screen view fills the window like the quiz does; remove the floating inset panel style used by Flashcards, the six readers and the Rulebook (`Courses.module.css` ~184). Two-column tabs keep the bottom bar.

## 4. One name per thing, fewer doors
- Course order is always Intl Law, Asylum, Pro Res (fix the practice-exam picker). Short names “Intl Law / Asylum / Pro Res” in switches and chips; full names in titles.
- Flashcards: the noun is “Flashcards” and the action is “Review N cards” everywhere; remove duplicate entry points on the Courses home (keep the tile, drop the header button) so each screen has one door.
- “Rule review” (the outline material) is renamed “Outlines” in labels (`MATERIAL_LABELS`; display only, the stored kind stays `outline`). “Rulebook” stays.
- “Missed topics” is the only name for that feature (no “Mixed lesson”, no “Missed lesson” in visible text).
- “New” means an unseen question only. The Written practice “New” button becomes “New prompt”; “New task” stays.
- Rows with a count of zero are hidden, not dimmed. The flame chip, Finals tiles and ring row are obviously tappable (chevron or pressed state) or not tappable.
- Remove caption-style lines listed by the review unless they are data: quiz review “Seen 4 times · 2 right · 2 missed” (move into the tap-detail of the reason tag), Missed lesson “Missed before, right last time”, “N reviewed · N to revisit”.

## 5. “How Lawstin works”, rebuilt as things to tap
Keep every statement true to the code (see the Log entry of 2026-11-11 in AI-MEMORY). Replace paragraphs with: today’s goal as three course chips that add up; the review ladder as the five-step track with his own counts on each step; the status labels as chips with his count of units in each; rows for Ready to review, Not seen yet, Missed topics, streak, each opening the real thing. Add a visible “How Lawstin works” row at the end of Settings and keep the ring entry.

## 6. Empty and first-run states
New account or empty data: Progress, the calendar, Clinic/Tutoring notes, Starred, history lists each show one real object to act on (today’s square highlighted, a first task field focused, the first unit to start) instead of zeros and dashes. No explanatory sentences.

## 7. Connected apps
Turn the wall of instructions into steps as cards with a status chip and one action each; remove “UHLC” and the example-prompt paragraph (the example becomes a copyable chip). Keep the OAuth consent flow and all behavior unchanged; run `npm run context:test` since this screen belongs to the connector.

## 8. Truncation
Missed topics list, task titles and notes, topic names in chips: wrap to two lines instead of clipping at 390 and 320.

## How to verify
Write a small script (keep it in `tests/browser/` as `style-audit.mjs`) that walks the capture steps and collects computed font sizes, weights, card radii and tap-target sizes, failing on any value outside the rules above; run it at 390 and 1440 in light and dark and include its summary in your report. Then the usual STANDARDS verification, looking at every screen at 390, 820 and 1440 in both themes.

## Done
List each numbered item as done / changed / not done, with the audit summary.
