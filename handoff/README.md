# Lawstin upgrade — work packages for Codex

Claude investigated the app, decided the plan and reviews every diff. Codex builds each package.

How to run one package: in Codex, on repo `austintrv/LAWSTIN`, base branch `main`, say:

> Follow `handoff/<file>` exactly, including `handoff/STANDARDS.md`. Work on the branch named in the brief and push it.

Then tell Claude the package is ready. Claude reviews it, runs the checks, merges it to `main` and writes the next briefs.

| Stage | Package | Brief | Can run alongside |
|---|---|---|---|
| 1 Trust | 1A Numbers you can trust | `1A-numbers.md` | 1B |
| 1 Trust | 1B Nothing gets lost | `1B-safety.md` | 1A |
| 2 Fit each exam | 2A, 2B, 2C | written after stage 1 merges | |
| 3 Find and own | 3A, 3B | written after stage 2 merges | |
| 4 Polish, joy, longevity | 4A, 4B | written after stage 3 merges | |

Rollback point: branch `rollback-2026-11-11` is `main` as it was before this work.

This folder is removed when the last stage merges.
