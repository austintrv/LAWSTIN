# Lawstin upgrade — work packages for Codex

Claude investigated the app, decided the plan and reviews every diff. Codex builds each package.

How to run one package: in Codex, on repo `austintrv/LAWSTIN`, base branch `main`, say:

> Follow `handoff/<file>` exactly, including `handoff/STANDARDS.md`. Work on the branch named in the brief and push it.

Then tell Claude the package is ready. Claude reviews it, runs the checks, merges it to `main` and writes the next briefs.

| Stage | Package | Brief | Can run alongside |
|---|---|---|---|
| 1 Trust (merged) | 1A Numbers you can trust | `1A-numbers.md` | done |
| 1 Trust (merged) | 1B Nothing gets lost | `1B-safety.md` | done |
| 2 Fit each exam | 2A The next exam drives Study | `2A-next-exam.md` | 2B, 2C |
| 2 Fit each exam | 2B Essays he will actually write | `2B-essays.md` | 2A, 2C |
| 2 Fit each exam | 2C Pro Res under exam conditions | `2C-exam-conditions.md` | 2A, 2B |
| 3 Find and own | 3A Search and tabs | `3A-search.md` | 3B |
| 3 Find and own | 3B Topic pages and notes | `3B-topics-notes.md` | 3A |
| 4 Polish, joy, longevity | 4A One design | `4A-one-design.md` | run alone |
| 4 Polish, joy, longevity | 4B Joy and longevity | `4B-joy-longevity.md` | run alone, after 4A |

Start a stage only after Claude has merged the stage before it; each brief says so.

Rollback point: branch `rollback-2026-11-11` is `main` as it was before this work.

This folder is removed when the last stage merges.
