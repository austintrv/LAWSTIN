import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("cloud package preserves identity and prompts while replacing the local runtime with OAuth", async () => {
  execFileSync(process.execPath, [path.join(import.meta.dirname, "build-cloud-package.mjs")], { stdio: "pipe", timeout: 30_000 });
  const archive = path.resolve(import.meta.dirname, "../../.context-build/lawstin-course-context-cloud-plugin.zip");
  const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).trim().split("\n").filter(file => !file.endsWith("/"));
  const root = "lawstin-course-context-cloud/";
  assert.deepEqual(entries.sort(), ["plugin.json", ".codex-plugin/plugin.json", "mcp.json", "skills/course-handoff/SKILL.md", "skills/lawstin-quiz/SKILL.md"].map(file => root + file).sort());
  const read = file => execFileSync("unzip", ["-p", archive, root + file], { encoding: "utf8" });
  const manifest = JSON.parse(read("plugin.json")), legacy = JSON.parse(read(".codex-plugin/plugin.json"));
  assert.equal(manifest.name, "lawstin-course-context");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(legacy.name, manifest.name);
  assert.equal(legacy.version, manifest.version);
  assert.deepEqual(legacy.interface, manifest.extensions["com.openai"].interface);
  assert.equal(legacy.interface.defaultPrompt, "Read my course's latest shared handoff before we continue.");
  const server = JSON.parse(read("mcp.json")).mcpServers["lawstin-courses"];
  assert.equal(server.type, "streamable-http");
  assert.equal(server.url, "https://vbqfmgsrxurdazujbbuk.supabase.co/functions/v1/course-cloud/mcp");
  assert.deepEqual(server.extensions["com.openai"].auth.client, { mode: "dcr" });
  assert.equal(server.command, undefined);
  assert.match(read("skills/lawstin-quiz/SKILL.md"), /saved:true/);
});

test("packaged desktop plugin starts through its real launcher with a pinned Node runtime", async t => {
  execFileSync(process.execPath, [path.join(import.meta.dirname, "build-package.mjs")], { stdio: "pipe", timeout: 30_000 });
  const output = path.resolve(import.meta.dirname, "../../.context-build");
  const plugin = path.join(output, "lawstin-course-context");
  const manifest = JSON.parse(await fs.readFile(path.join(plugin, "plugin.json"), "utf8"));
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "lawstin-course-context");
  assert.ok(manifest.extensions["com.openai"].interface.shortDescription.length <= 30);
  const mcp = JSON.parse(await fs.readFile(path.join(plugin, "mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers["lawstin-courses"].type, "stdio");
  assert.equal(mcp.mcpServers["lawstin-courses"].command, "/bin/sh");
  const zipEntries = execFileSync("unzip", ["-Z1", path.join(output, "lawstin-course-context-plugin.zip")], { encoding: "utf8" }).trim().split("\n").filter(file => !file.endsWith("/"));
  assert.deepEqual(zipEntries.sort(), ["launch.sh", "mcp.json", "plugin.json", "server.cjs", "skills/course-handoff/SKILL.md"].map(name => `lawstin-course-context/${name}`).sort());

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lawstin-plugin-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const home = path.join(temp, "home"), stateDir = path.join(home, "Library", "Application Support", "LAWSTIN", "course-context");
  const root = path.join(temp, "drive", "course"), contextDir = path.join(root, "AI & CLOUD");
  await fs.mkdir(contextDir, { recursive: true }); await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(contextDir, "AI-MEMORY.md"), "# Test\n\n## Current work\n- Continue.\n\n## Log\n");
  await fs.writeFile(path.join(stateDir, "node-path"), process.execPath + "\n");
  const configFile = path.join(stateDir, "config.json");
  await fs.writeFile(configFile, JSON.stringify({ version: 1, stateDir, courses: [{ id: "il", name: "International Law", root, contextDir }] }));
  const client = new Client({ name: "packaged-plugin-test", version: "1.0.0" });
  t.after(() => client.close());
  const transport = new StdioClientTransport({ command: "/bin/sh", args: [path.join(plugin, "launch.sh")], env: { HOME: home, PATH: process.env.PATH, LAWSTIN_CONTEXT_CONFIG: configFile }, stderr: "pipe" });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 7);
  const read = await client.callTool({ name: "read_course_context", arguments: { course: "il" } });
  assert.equal(read.isError, undefined);
  assert.match(JSON.parse(read.content[0].text).checkpoint, /^[a-f0-9]{40}$/);

  if (process.platform !== "darwin") {
    assert.throws(() => execFileSync(process.execPath, [path.join(output, "LAWSTIN Course Setup", "setup.cjs")], { encoding: "utf8", stdio: "pipe" }), error => error.status === 1 && error.stderr.includes("Run this installer on your Mac"));
  }
});
