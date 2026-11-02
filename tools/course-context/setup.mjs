import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { COURSES } from "./courses.mjs";
import { ContextStore, readOptional, atomicWrite } from "./store.mjs";
import { managedInstructions, mergeInstructions, claudeImport } from "./instructions.mjs";

const normalize = value => value.normalize("NFC");
async function child(parent, name) {
  const names = await fs.readdir(parent);
  const matches = names.filter(candidate => normalize(candidate) === normalize(name));
  if (matches.length !== 1) throw new Error(`Expected one '${name}' folder in ${parent}.`);
  return fs.realpath(path.join(parent, matches[0]));
}

export async function locateCourses(semester) {
  const root = await fs.realpath(semester);
  const found = [];
  for (const course of COURSES) {
    const courseRoot = await child(root, course.folder);
    const contextDir = await child(courseRoot, "AI & CLOUD");
    const memory = await fs.lstat(path.join(contextDir, "AI-MEMORY.md"));
    if (!memory.isFile() || memory.isSymbolicLink()) throw new Error(`${course.name}: AI-MEMORY.md must be an existing regular Markdown file.`);
    found.push({ id: course.id, name: course.name, root: courseRoot, contextDir });
  }
  return found;
}

export async function discoverSemester(home) {
  const mounts = [];
  const cloud = path.join(home, "Library", "CloudStorage");
  for (const name of await fs.readdir(cloud).catch(() => [])) {
    if (name.startsWith("GoogleDrive-")) mounts.push(path.join(cloud, name, "My Drive"));
  }
  for (const name of await fs.readdir(home)) {
    if (name === "My Drive" || name.startsWith("My Drive (")) mounts.push(path.join(home, name));
  }
  const found = new Set();
  for (const mount of mounts) {
    const semester = path.join(mount, "UHLC 2L FALL");
    try { await locateCourses(semester); found.add(await fs.realpath(semester)); } catch { /* A different account or an unmounted Drive. */ }
  }
  if (found.size === 1) return [...found][0];
  return null;
}

export function codexConfig(existing, launch) {
  const begin = "# LAWSTIN-COURSE-CONTEXT:START";
  const end = "# LAWSTIN-COURSE-CONTEXT:END";
  const section = `${begin}\n[mcp_servers.lawstin-courses]\ncommand = ${JSON.stringify(launch.command)}\nargs = ${JSON.stringify(launch.args)}\n${end}`;
  const text = existing || "";
  const startAt = text.indexOf(begin), endAt = text.indexOf(end);
  if ((startAt < 0) !== (endAt < 0) || (startAt >= 0 && endAt < startAt)) throw new Error("Incomplete LAWSTIN block in Codex config; inspect it before replacing.");
  if (startAt >= 0) return text.slice(0, startAt) + section + text.slice(endAt + end.length);
  if (/^\s*\[mcp_servers\.(?:lawstin-courses|"lawstin-courses"|'lawstin-courses')(?:\.|\])/m.test(text)) {
    throw new Error("Codex already has an unmanaged lawstin-courses entry. Rename that entry before running setup; it was preserved.");
  }
  return text.trimEnd() + (text.trim() ? "\n\n" : "") + section + "\n";
}

async function safeUpdate(file, content, backups) {
  const old = await readOptional(file);
  if (old === content) return false;
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  if (old !== null && backups) {
    await fs.mkdir(backups, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(backups, `${path.basename(file)}.${Date.now()}.previous`), old, { mode: 0o600, flag: "wx" });
  }
  await atomicWrite(file, content);
  return true;
}

function mergeServer(text, launch) {
  const data = text ? JSON.parse(text) : {};
  if (!data || Array.isArray(data) || typeof data !== "object" || (data.mcpServers && (Array.isArray(data.mcpServers) || typeof data.mcpServers !== "object"))) throw new Error("Invalid existing MCP configuration; no settings were replaced.");
  data.mcpServers = { ...data.mcpServers, "lawstin-courses": launch };
  return JSON.stringify(data, null, 2) + "\n";
}

export async function setupMac({ home = os.homedir(), semester, sourceDir, platform = process.platform } = {}) {
  if (platform !== "darwin") throw new Error("Run this installer on your Mac. The cloud workspace cannot configure local desktop apps.");
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Install Node.js 20 or newer before running setup.");
  execFileSync("git", ["--version"], { stdio: "pipe", timeout: 15_000 });
  let selected = semester || await discoverSemester(home);
  if (!selected) selected = execFileSync("osascript", ["-e", 'POSIX path of (choose folder with prompt "Choose UHLC 2L FALL inside your Google Drive. Choose the actual folder, not a Finder alias.")'], { encoding: "utf8" }).trim();
  const courses = await locateCourses(selected);
  const stateDir = path.join(home, "Library", "Application Support", "LAWSTIN", "course-context");
  const configFile = path.join(stateDir, "config.json");
  const runtime = path.join(stateDir, "runtime");
  const launch = { command: process.execPath, args: [path.join(runtime, "server.cjs"), "--config", configFile] };
  const claudeDesktop = path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  const claudeCode = path.join(home, ".claude.json");
  const codex = path.join(home, ".codex", "config.toml");
  // Parse and prepare all existing app settings before writing any of them.
  const updates = [
    [claudeDesktop, mergeServer(await readOptional(claudeDesktop), launch)],
    [claudeCode, mergeServer(await readOptional(claudeCode), launch)],
    [codex, codexConfig(await readOptional(codex), launch)],
  ];
  for (const file of ["server.cjs", "setup.cjs", "cli.cjs"]) await fs.access(path.join(sourceDir, file));
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  if (await fs.realpath(sourceDir) !== await fs.realpath(runtime)) {
    for (const file of ["server.cjs", "setup.cjs", "cli.cjs"]) await fs.copyFile(path.join(sourceDir, file), path.join(runtime, file));
  }
  const config = { version: 1, stateDir, courses };
  const backups = path.join(stateDir, "settings-before-setup");
  await safeUpdate(configFile, JSON.stringify(config, null, 2) + "\n", backups);
  await safeUpdate(path.join(stateDir, "node-path"), process.execPath + "\n");
  const store = await ContextStore.open(configFile);
  // Baseline private history before changing course instructions. No remote exists.
  for (const course of courses) await store.read(course.id);
  for (const course of courses) {
    for (const [dir, inner] of [[course.root, false], [course.contextDir, true]]) {
      const agents = path.join(dir, "AGENTS.md"), claude = path.join(dir, "CLAUDE.md");
      await safeUpdate(agents, mergeInstructions(await readOptional(agents), managedInstructions(course.id, inner)));
      await safeUpdate(claude, claudeImport(await readOptional(claude)));
    }
    await store.read(course.id);
  }
  for (const [file, text] of updates) await safeUpdate(file, text, backups);
  return { courses: courses.map(({ id, name }) => ({ id, name })), configFile, runtime, configured: ["Claude Code", "Claude Desktop", "Codex"], chatgpt: "Install the packaged LAWSTIN Course Context plugin in ChatGPT Desktop. Local execution must be available.", next: "Fully quit and reopen your AI apps. Ask each to list courses and read one course. Claude Code may ask you to trust this MCP server." };
}

if (/(?:^|[/\\])setup\.(?:mjs|cjs)$/.test(process.argv[1] || "")) {
  const flag = process.argv.indexOf("--drive-root");
  setupMac({ semester: flag >= 0 ? process.argv[flag + 1] : undefined, sourceDir: path.dirname(path.resolve(process.argv[1])) })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`LAWSTIN setup: ${error.message}`); process.exitCode = 1; });
}
