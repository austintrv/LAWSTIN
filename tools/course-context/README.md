# Shared course context

A local MCP server for the five existing school course `AI & CLOUD` folders. Google Drive remains the source of truth. LAWSTIN contains the integration code only. Private course context and Git history never belong in this public repository. Work is excluded.

Read [MAC-SETUP.md](MAC-SETUP.md) for the Mac workflow and connection checks.

## Develop and package

```sh
npm ci --prefix tools/course-context
npm run context:test
npm run context:package
```

The last command builds standalone Node bundles and two ZIPs in the ignored `.context-build/` directory. The Mac installer and plugin do not need `node_modules`; Node 20+ and Git must be installed on the Mac. `npm run context:setup` builds the package and runs the Mac installer from a local checkout. It refuses to configure desktop apps from a cloud/Linux workspace.

The generated portable plugin contains root `plugin.json`, `mcp.json`, the bundled stdio server, its launcher, and the `course-handoff` skill. It has no remote service, credentials, UI, or public listing. Local plugin availability depends on the target ChatGPT Desktop client/account.

## Tools

| Tool | Behavior |
| --- | --- |
| `list_courses` | List configured school courses. |
| `read_course_context` | Read the four allowlisted shared Markdown files and checkpoint external changes. |
| `write_course_handoff` | Replace only Current work, using a matching revision and private before/after checkpoints. |
| `record_course_fact` | Add one dated durable fact to the existing Log, using a matching revision. |
| `checkpoint_course_context` | Checkpoint direct edits and list local history. |
| `read_course_memory_version` | Read an old AI memory without restoring it. |
| `search_course_context` | Literal search in one course's shared context only. |

The file allowlist is `AI-MEMORY.md`, `CLAUDE-CONTEXT.md`, `AGENTS.md`, and `CLAUDE.md`. Each configured path must be inside its course. Symlink context files, unknown course IDs, and arbitrary file paths are refused. Separate per-course locks serialize MCP writes on the Mac; SHA-256 revisions reject stale handoffs. External editors and Drive sync do not honor those locks, so the file is rechecked immediately before saving. A post-write checkpoint failure returns `saved: true` with a warning rather than inviting an unsafe retry.

Private history uses separate local repositories outside Drive and existing checkouts. Git environment overrides are removed; global Git config is disabled for these operations, no credential lookup or push occurs, and repositories with any remote are refused. Commits use a local identity and do not execute hooks. Source course files are never copied or searched.

If a process exits mid-write, its lock is preserved rather than automatically removed while another client might be acquiring it. Fully quit the AI apps before removing only the stale lock directory identified in the error, then retry.

Read/checkpoint calls record local history when context changed. There is no background watcher or scheduled job, and history is not an off-device backup. An MCP connection shares selected saved context, not the AIs' full chat histories.
