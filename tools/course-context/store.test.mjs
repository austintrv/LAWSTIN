import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ContextStore, revision, replaceCurrentWork } from "./store.mjs";
import { COURSES } from "./courses.mjs";
import { setupMac, codexConfig, discoverSemester } from "./setup.mjs";
import { claudeImport, managedInstructions, mergeInstructions } from "./instructions.mjs";

const MEMORY = "# Sample course\n\n## Course\nKeep this rule.\n\n## Current work\n- Earlier task.\n\n## Log\n- A durable fact.\n";
async function fixture(t, all = false) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lawstin-context-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const semester = path.join(temp, "drive", "UHLC 2L FALL");
  const courses = [];
  for (const course of all ? COURSES : COURSES.slice(0, 1)) {
    const root = path.join(semester, course.folder), contextDir = path.join(root, "AI & CLOUD");
    await fs.mkdir(contextDir, { recursive: true });
    await fs.writeFile(path.join(contextDir, "AI-MEMORY.md"), MEMORY);
    await fs.writeFile(path.join(contextDir, "CLAUDE-CONTEXT.md"), "Historical preferences.\n");
    courses.push({ ...course, root, contextDir });
  }
  const stateDir = path.join(temp, "private-state"), configFile = path.join(temp, "config.json");
  const config = { version: 1, stateDir, courses };
  await fs.writeFile(configFile, JSON.stringify(config));
  return { temp, semester, courses, config, configFile, stateDir, store: await ContextStore.open(configFile) };
}

test("reading creates allowlisted private history and does not duplicate unchanged checkpoints", async t => {
  const f = await fixture(t), first = await f.store.read("il"), again = await f.store.read("il");
  assert.equal(first.files["AI-MEMORY.md"], MEMORY);
  assert.equal(first.revision, revision(MEMORY));
  assert.equal(first.checkpoint, again.checkpoint);
  assert.equal((await f.store.history("il")).length, 1);
  const repo = path.join(f.stateDir, "history", "il");
  assert.equal(execFileSync("git", ["-C", repo, "remote"], { encoding: "utf8" }), "");
  assert.deepEqual(execFileSync("git", ["-C", repo, "ls-files"], { encoding: "utf8" }).trim().split("\n"), ["AI-MEMORY.md", "CLAUDE-CONTEXT.md"]);
});

test("handoff preserves rules and log, rejects stale writes, and retains the previous version", async t => {
  const f = await fixture(t), before = await f.store.read("il");
  const saved = await f.store.writeHandoff("il", before.revision, "- Goal: continue.\n- Next: verify the outline.", "Codex");
  assert.equal(saved.saved, true);
  const after = await fs.readFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), "utf8");
  assert.ok(after.includes("Keep this rule.")); assert.ok(after.includes("- A durable fact."));
  assert.ok(after.includes("- Next: verify the outline.")); assert.ok(!after.includes("Earlier task."));
  await assert.rejects(f.store.writeHandoff("il", before.revision, "- An obsolete overwrite.", "Claude Desktop"), /changed since/);
  assert.equal(await f.store.readVersion("il", before.checkpoint), MEMORY);
  assert.equal(await fs.readFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), "utf8"), after);
});

test("two AI clients cannot both save from the same revision", async t => {
  const f = await fixture(t), second = await ContextStore.open(f.configFile), before = await f.store.read("il");
  const outcomes = await Promise.allSettled([
    f.store.writeHandoff("il", before.revision, "- Claude's task.", "Claude Code"),
    second.writeHandoff("il", before.revision, "- Codex's task.", "Codex"),
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
});

test("a durable fact is dated, preserves current work, and is not duplicated", async t => {
  const f = await fixture(t), before = await f.store.read("il");
  const saved = await f.store.recordFact("il", before.revision, "Use the assigned syllabus for the course map.", "Codex");
  const after = await f.store.read("il");
  assert.match(after.files["AI-MEMORY.md"], /## Log\n- \d{4}-\d{2}-\d{2} \(Codex\): Use the assigned syllabus/);
  assert.ok(after.files["AI-MEMORY.md"].includes("- Earlier task."));
  assert.ok(after.files["AI-MEMORY.md"].includes("- A durable fact."));
  const again = await f.store.recordFact("il", saved.revision, "Use the assigned syllabus for the course map.", "Codex");
  assert.equal(again.revision, saved.revision);
  await assert.rejects(f.store.recordFact("il", saved.revision, "First\n## Different section", "Codex"), /one factual paragraph/);
});

test("an after-save Git failure reports saved memory and a pending checkpoint", async t => {
  const f = await fixture(t), before = await f.store.read("il"), snapshot = f.store.snapshot.bind(f.store);
  let calls = 0;
  f.store.snapshot = (...args) => ++calls === 2 ? Promise.reject(new Error("test disk failure")) : snapshot(...args);
  const saved = await f.store.writeHandoff("il", before.revision, "- This was saved.", "Codex");
  assert.equal(saved.saved, true); assert.match(saved.warning, /checkpoint failed/);
  const actual = await fs.readFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), "utf8");
  assert.ok(actual.includes("This was saved.")); assert.equal(saved.revision, revision(actual));
});

test("a crashed writer's lock is preserved instead of racing a newer writer", async t => {
  const f = await fixture(t), directory = path.join(f.stateDir, "locks", "il");
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, "pid"), "2147483647");
  await assert.rejects(f.store.read("il"), /previous process exited/);
  assert.equal(await fs.readFile(path.join(directory, "pid"), "utf8"), "2147483647");
  assert.equal(await fs.readFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), "utf8"), MEMORY);
});

test("an external edit during checkpointing is preserved", async t => {
  const f = await fixture(t), before = await f.store.read("il"), snapshot = f.store.snapshot.bind(f.store);
  f.store.snapshot = async (...args) => {
    const result = await snapshot(...args);
    await fs.writeFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), MEMORY + "External edit.\n");
    return result;
  };
  await assert.rejects(f.store.writeHandoff("il", before.revision, "- New task.", "Codex"), /changed during checkpointing/);
  assert.match(await fs.readFile(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), "utf8"), /External edit/);
});

test("work projects, arbitrary paths, and context symlinks are refused", async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.read("work"), /not configured/);
  await assert.rejects(f.store.read("../il"), /not configured/);
  await assert.rejects(f.store.file(f.courses[0], "../../private"), /four shared context/);
  await fs.symlink(path.join(f.courses[0].contextDir, "AI-MEMORY.md"), path.join(f.courses[0].contextDir, "AGENTS.md"));
  await assert.rejects(f.store.read("il"), /regular file/);
});

test("history refuses remotes instead of risking publication", async t => {
  const f = await fixture(t); await f.store.read("il");
  execFileSync("git", ["-C", path.join(f.stateDir, "history", "il"), "remote", "add", "origin", "https://example.invalid/private"]);
  await assert.rejects(f.store.read("il"), /no Git remotes/);
});

test("state inside Drive or another Git checkout and duplicate course IDs are refused", async t => {
  const f = await fixture(t);
  f.config.stateDir = path.join(f.courses[0].root, "state");
  await fs.writeFile(f.configFile, JSON.stringify(f.config));
  await assert.rejects(ContextStore.open(f.configFile), /outside the synced/);
  const publicRepo = path.join(f.temp, "public-repo"); await fs.mkdir(publicRepo);
  execFileSync("git", ["-C", publicRepo, "init", "--quiet"]);
  f.config.stateDir = path.join(publicRepo, "private-state");
  await fs.writeFile(f.configFile, JSON.stringify(f.config));
  await assert.rejects(ContextStore.open(f.configFile), /outside existing Git checkouts/);
  f.config.stateDir = f.stateDir; f.config.courses.push(f.config.courses[0]);
  await fs.writeFile(f.configFile, JSON.stringify(f.config));
  await assert.rejects(ContextStore.open(f.configFile), /duplicate IDs/);
});

test("search reads only context files for the selected course", async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.courses[0].root, "private-submission.txt"), "A durable fact from a private submission");
  const found = await f.store.search("il", "durable");
  assert.equal(found.matches.length, 1); assert.equal(found.matches[0].file, "AI-MEMORY.md");
  assert.equal(found.matches[0].line, 10);
});

test("malformed handoffs and non-commit revision syntax are refused", async t => {
  const f = await fixture(t), before = await f.store.read("il");
  await assert.rejects(f.store.writeHandoff("il", before.revision, "## Log\nReplace everything", "Codex"), /top-level headings/);
  await assert.rejects(f.store.readVersion("il", "HEAD:../../private"), /full commit hash/);
  assert.throws(() => replaceCurrentWork("No section", "A task"), /no '## Current work'/);
});

test("managed instructions preserve existing content and stay idempotent", () => {
  const block = managedInstructions("il"), original = "# Existing instructions\nCustom rule.\n";
  const once = mergeInstructions(original, block);
  assert.ok(once.startsWith(original.trimEnd()));
  assert.equal(mergeInstructions(once, block), once);
  assert.equal(claudeImport(claudeImport("Custom Claude rule.\n")), "@AGENTS.md\n\nCustom Claude rule.\n");
  assert.throws(() => mergeInstructions("<!-- LAWSTIN-COURSE-CONTEXT:START -->", block), /Incomplete/);
});

test("Codex settings preserve unrelated servers and reject unmanaged name collisions", () => {
  const original = 'model = "sample"\n\n[mcp_servers.other]\ncommand = "other"\n';
  const launch = { command: "/path with spaces/node", args: ["/path with spaces/server.cjs", "--config", "/config"] };
  const once = codexConfig(original, launch);
  assert.ok(once.startsWith(original.trimEnd())); assert.equal(codexConfig(once, launch), once);
  assert.throws(() => codexConfig('[mcp_servers."lawstin-courses"]\ncommand = "other"', launch), /unmanaged/);
});

test("Mac setup covers five courses, preserves app settings and work, and can be rerun", async t => {
  const f = await fixture(t, true), home = path.join(f.temp, "home"), sourceDir = path.join(f.temp, "installer");
  await fs.mkdir(sourceDir); await fs.mkdir(home);
  for (const name of ["server.cjs", "setup.cjs", "cli.cjs"]) await fs.writeFile(path.join(sourceDir, name), "// test runtime\n");
  await fs.writeFile(path.join(home, ".claude.json"), JSON.stringify({ projects: { "/work": { trust: true } }, mcpServers: { other: { command: "keep" } } }));
  await fs.mkdir(path.join(home, ".codex"));
  await fs.writeFile(path.join(home, ".codex", "config.toml"), 'model = "sample"\n');
  const work = path.join(f.semester, "WORK"); await fs.mkdir(work); await fs.writeFile(path.join(work, "AI-MEMORY.md"), "Do not change");
  const options = { home, sourceDir, semester: f.semester, platform: "darwin" };
  const installed = await setupMac(options);
  assert.equal(installed.courses.length, 5);
  const codeConfig = JSON.parse(await fs.readFile(path.join(home, ".claude.json"), "utf8"));
  assert.equal(codeConfig.mcpServers.other.command, "keep"); assert.equal(codeConfig.projects["/work"].trust, true);
  assert.ok(codeConfig.mcpServers["lawstin-courses"].args.includes(installed.configFile));
  const store = await ContextStore.open(installed.configFile), before = await store.history("il");
  await setupMac(options);
  assert.equal((await store.history("il")).length, before.length);
  assert.equal(await fs.readFile(path.join(work, "AI-MEMORY.md"), "utf8"), "Do not change");
  for (const course of f.courses) {
    assert.equal(await fs.readFile(path.join(course.contextDir, "AI-MEMORY.md"), "utf8"), MEMORY);
    assert.equal(await fs.readFile(path.join(course.root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  }
});

test("malformed app settings stop setup before writing course instructions", async t => {
  const f = await fixture(t, true), home = path.join(f.temp, "home"); await fs.mkdir(home);
  await fs.writeFile(path.join(home, ".claude.json"), "not JSON");
  await assert.rejects(setupMac({ home, sourceDir: f.temp, semester: f.semester, platform: "darwin" }));
  await assert.rejects(fs.access(path.join(f.courses[0].root, "AGENTS.md")), { code: "ENOENT" });
});

test("Drive discovery finds the real mount and ignores other accounts without all five courses", async t => {
  const f = await fixture(t, true), home = path.join(f.temp, "home"), mount = path.join(home, "Library", "CloudStorage", "GoogleDrive-personal", "My Drive");
  await fs.mkdir(mount, { recursive: true }); await fs.symlink(f.semester, path.join(mount, "UHLC 2L FALL"));
  await fs.mkdir(path.join(home, "Library", "CloudStorage", "GoogleDrive-other", "My Drive"), { recursive: true });
  assert.equal(await discoverSemester(home), await fs.realpath(f.semester));
});

test("real MCP client discovers tools, reads context, saves a handoff, and sees stale-edit errors", async t => {
  const f = await fixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(import.meta.dirname, "server.mjs"), "--config", f.configFile], stderr: "pipe" });
  const client = new Client({ name: "lawstin-context-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 7);
  const read = await client.callTool({ name: "read_course_context", arguments: { course: "il" } });
  const context = JSON.parse(read.content[0].text); assert.equal(context.files["AI-MEMORY.md"], MEMORY);
  const args = { course: "il", expected_revision: context.revision, current_work: "- Next: study.", actor: "ChatGPT Desktop" };
  const saved = await client.callTool({ name: "write_course_handoff", arguments: args });
  assert.equal(JSON.parse(saved.content[0].text).saved, true);
  assert.equal((await client.callTool({ name: "write_course_handoff", arguments: args })).isError, true);
});
