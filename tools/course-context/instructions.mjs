export const START = "<!-- LAWSTIN-COURSE-CONTEXT:START -->";
export const END = "<!-- LAWSTIN-COURSE-CONTEXT:END -->";

export function managedInstructions(id, inContextFolder = false) {
  const prefix = inContextFolder ? "" : "AI & CLOUD/";
  return `${START}
## Shared course handoff

- This course uses one shared memory: \`${prefix}AI-MEMORY.md\`. Read it and \`${prefix}CLAUDE-CONTEXT.md\` before working. Current user instructions and current course source files control over historical context.
- Claude Code, Claude Desktop, Codex, and ChatGPT Desktop share these same files. Keep the current goal, completed work, next steps, blockers, and verification in the memory's **Current work** section. Replace stale status; preserve useful unfinished work. Keep durable facts in the existing memory sections or Log.
- If the LAWSTIN course-context MCP is connected, read this course with \`read_course_context\` (course \`${id}\`). Save handoffs with \`write_course_handoff\`, using the returned revision and your application name. If a stale edit is refused, reread and merge the newer work before retrying.
- Coding agents can edit the shared Markdown files directly. Before stopping or switching AIs, call \`checkpoint_course_context\` for \`${id}\` when available. If the MCP is unavailable, update the same Drive file and report that the private Git checkpoint is pending. Never claim a connection or checkpoint succeeded without checking.
- The Mac setup keeps private, course-specific Git history outside Drive, with no remote. Never copy course memory, client details, private student work, or credentials into the public LAWSTIN repository. Keep client/student source files in their original course folders. Work projects are excluded.
- A Finder alias is a pointer, not another copy of the notes. Use the actual Drive folder. Wait for Drive to finish syncing before switching computers; stale-edit checks only see changes already synced to this Mac.
${END}`;
}

export function mergeInstructions(existing, block) {
  const current = existing || "";
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error("Incomplete LAWSTIN instructions block; inspect it before replacing.");
  if (start >= 0) return current.slice(0, start) + block + current.slice(end + END.length);
  return current.trimEnd() + (current.trim() ? "\n\n" : "") + block + "\n";
}

export function claudeImport(existing) {
  const current = existing || "";
  if (/^@(?:\.\/)?AGENTS\.md\s*$/m.test(current)) return current;
  return "@AGENTS.md\n" + (current.trim() ? "\n" + current : "");
}
