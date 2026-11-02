import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ContextStore } from "./store.mjs";
import { COURSES } from "./courses.mjs";

async function main() {
const configFlag = process.argv.indexOf("--config");
const store = await ContextStore.open(configFlag >= 0 ? process.argv[configFlag + 1] : undefined);
const server = new McpServer({ name: "lawstin-courses", version: "1.0.0" }, {
  instructions: "Shared context for five school courses only. Read the selected course at the start. Current source files and the user's current instructions control over old memory. Save a concise handoff before stopping. Private Git history is local, has no remote, and must never be published to LAWSTIN. Files can contain private clinic/student information. Work projects and course source documents are outside this server's scope.",
});
const course = z.enum(COURSES.map(value => value.id));
const readonly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const result = action => async args => {
  try { return { content: [{ type: "text", text: JSON.stringify(await action(args), null, 2) }] }; }
  catch (error) { return { isError: true, content: [{ type: "text", text: error.message }] }; }
};
server.registerTool("list_courses", {
  description: "List the five configured school courses. Work is excluded.", inputSchema: {}, annotations: readonly,
}, result(() => store.list()));
server.registerTool("read_course_context", {
  description: "Read a course's current shared AI memory, preferences, and instructions. Returns a revision required for handoff writes. Records a private local Git checkpoint if files changed outside MCP.",
  inputSchema: { course }, annotations: readonly,
}, result(args => store.read(args.course)));
server.registerTool("write_course_handoff", {
  description: "Replace only 'Current work' in the selected course's AI-MEMORY.md. Preserve useful unfinished work and include the goal, completed work, next steps, blockers, and verification as applicable. Read first; a stale revision is refused. Other sections are preserved. Creates private before/after Git checkpoints.",
  inputSchema: { course, expected_revision: z.string().regex(/^[a-f0-9]{64}$/), current_work: z.string().min(1).max(16000), actor: z.enum(["Claude Code", "Claude Desktop", "Codex", "ChatGPT Desktop"]) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, result(args => store.writeHandoff(args.course, args.expected_revision, args.current_work, args.actor)));
server.registerTool("record_course_fact", {
  description: "Record one durable, current course fact in AI-MEMORY.md's existing Log, dated in America/Chicago. Read first and supply its revision. Preserve course scope and exclude credentials and private details that do not belong in shared context. Other sections are preserved.",
  inputSchema: { course, expected_revision: z.string().regex(/^[a-f0-9]{64}$/), fact: z.string().min(1).max(2000), actor: z.enum(["Claude Code", "Claude Desktop", "Codex", "ChatGPT Desktop"]) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, result(args => store.recordFact(args.course, args.expected_revision, args.fact, args.actor)));
server.registerTool("checkpoint_course_context", {
  description: "Checkpoint shared context changes made directly by a coding agent/editor and list up to 30 recent local Git commits. Never uploads or pushes anything.",
  inputSchema: { course, limit: z.number().int().min(1).max(30).default(10) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, result(args => store.history(args.course, args.limit)));
server.registerTool("read_course_memory_version", {
  description: "Read an earlier version of AI-MEMORY.md from that course's private local Git history. Does not restore or overwrite the current file.",
  inputSchema: { course, commit: z.string().regex(/^[a-f0-9]{40,64}$/) }, annotations: readonly,
}, result(args => store.readVersion(args.course, args.commit)));
server.registerTool("search_course_context", {
  description: "Find a literal phrase in one selected course's shared context files. Does not search client files, student submissions, other courses, or work.",
  inputSchema: { course, query: z.string().min(1).max(200) }, annotations: readonly,
}, result(args => store.search(args.course, args.query)));

await server.connect(new StdioServerTransport());
}
main().catch(error => { console.error(`LAWSTIN course context: ${error.message}`); process.exitCode = 1; });
