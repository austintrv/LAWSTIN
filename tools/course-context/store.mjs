import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { COURSES, CONTEXT_FILES } from "./courses.mjs";

export const DEFAULT_STATE = path.join(os.homedir(), "Library", "Application Support", "LAWSTIN", "course-context");
export const DEFAULT_CONFIG = path.join(DEFAULT_STATE, "config.json");
export const revision = text => crypto.createHash("sha256").update(text).digest("hex");
const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);
const gitEnv = () => {
  // A calling agent may have Git variables for another checkout. Never inherit them.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: "0" };
};
const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], {
  encoding: "utf8", env: gitEnv(), stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
});

export async function readOptional(file) {
  try { return await fs.readFile(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function atomicWrite(file, text) {
  const temporary = `${file}.lawstin-${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, text, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function lock(directory, action) {
  await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fs.mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = await readOptional(path.join(directory, "pid"));
      if (owner && /^\d+$/.test(owner)) {
        try { process.kill(Number(owner), 0); }
        catch (check) {
          if (check.code === "ESRCH") throw new Error(`A previous process exited while saving and left a lock at ${directory}. Fully quit the AI apps before removing only that lock folder, then retry. It was preserved to avoid racing a newer writer.`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    try {
      await fs.writeFile(path.join(directory, "pid"), String(process.pid), { mode: 0o600 });
      return await action();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
  throw new Error("Another course-context process is saving. Retry after it finishes. A lock without a pid may need removal after a crashed process.");
}

export function replaceCurrentWork(memory, currentWork) {
  const section = /^## Current work\s*\r?$/m;
  const match = section.exec(memory);
  if (!match) throw new Error("AI-MEMORY.md has no '## Current work' section. Add it before saving a handoff.");
  if (/^#{1,2}\s/m.test(currentWork)) throw new Error("Use plain text or bullets inside the handoff, not top-level headings.");
  const start = match.index + match[0].length;
  const next = /^## /m.exec(memory.slice(start));
  const end = next ? start + next.index : memory.length;
  return memory.slice(0, start).trimEnd() + "\n" + currentWork.trim() + "\n\n" + memory.slice(end);
}

export class ContextStore {
  static async open(configFile = process.env.LAWSTIN_CONTEXT_CONFIG || DEFAULT_CONFIG) {
    const config = JSON.parse(await fs.readFile(configFile, "utf8"));
    if (config.version !== 1 || !Array.isArray(config.courses) || !path.isAbsolute(config.stateDir || "")) {
      throw new Error("Invalid course-context config. Run the Mac setup again.");
    }
    const ids = config.courses.map(course => course.id);
    if (new Set(ids).size !== ids.length || ids.some(id => !COURSES.some(course => course.id === id))) {
      throw new Error("Only the five configured school courses are supported; duplicate IDs and work projects are excluded.");
    }
    const state = await fs.realpath(await fs.mkdir(config.stateDir, { recursive: true, mode: 0o700 }).then(() => config.stateDir));
    let enclosingRepo;
    try { enclosingRepo = git(state, ["rev-parse", "--show-toplevel"]).trim(); } catch { /* Not in a checkout. */ }
    if (enclosingRepo) throw new Error("Private history must be outside existing Git checkouts, including the public LAWSTIN repository.");
    for (const course of config.courses) {
      if (!path.isAbsolute(course.root || "") || !path.isAbsolute(course.contextDir || "")) throw new Error("Course paths must be absolute.");
      const root = await fs.realpath(course.root);
      const context = await fs.realpath(course.contextDir);
      if (!inside(context, root) || inside(state, root) || inside(root, state)) throw new Error("Course context must be inside its course folder, with private Git history outside the synced course folder.");
      course.root = root; course.contextDir = context;
    }
    config.stateDir = state;
    return new ContextStore(config);
  }

  constructor(config) { this.config = config; }

  course(id) {
    const course = this.config.courses.find(value => value.id === id);
    if (!course) throw new Error(`Course '${id}' is not configured. Work is excluded.`);
    return course;
  }

  async file(course, name) {
    if (!CONTEXT_FILES.includes(name)) throw new Error("Only the four shared context Markdown files are accessible.");
    const candidate = path.join(course.contextDir, name);
    try {
      // Follow a normal file, but refuse links into another course or arbitrary files.
      const stat = await fs.lstat(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Context file '${name}' must be a regular file.`);
      if (!inside(await fs.realpath(candidate), course.contextDir)) throw new Error("Context file escaped its configured folder.");
      if (stat.size > 1024 * 1024) throw new Error(`Context file '${name}' exceeds 1 MiB.`);
      return await fs.readFile(candidate, "utf8");
    } catch (error) { if (error.code === "ENOENT" && name !== "AI-MEMORY.md") return null; throw error; }
  }

  async files(course) {
    const entries = await Promise.all(CONTEXT_FILES.map(async name => [name, await this.file(course, name)]));
    return Object.fromEntries(entries.filter(([, text]) => text !== null));
  }

  async snapshot(course, files, message) {
    const repo = path.join(this.config.stateDir, "history", course.id);
    await fs.mkdir(repo, { recursive: true, mode: 0o700 });
    try { await fs.access(path.join(repo, ".git")); }
    catch { git(repo, ["init", "--quiet"]); }
    if (git(repo, ["rev-parse", "--show-toplevel"]).trim() !== await fs.realpath(repo)) throw new Error("History must have its own Git repository.");
    if (git(repo, ["remote"]).trim()) throw new Error("Private course history must have no Git remotes. Remove the remote before continuing.");
    for (const name of CONTEXT_FILES) {
      const target = path.join(repo, name);
      if (Object.hasOwn(files, name)) await atomicWrite(target, files[name]);
      else await fs.rm(target, { force: true });
    }
    const tracked = git(repo, ["ls-files"]).trim().split("\n").filter(Boolean);
    if (tracked.some(name => !CONTEXT_FILES.includes(name))) throw new Error("Private history contains files outside the shared-context allowlist.");
    git(repo, ["add", "--all", "--", ...new Set([...Object.keys(files), ...tracked])]);
    if (git(repo, ["diff", "--cached", "--name-only"]).trim()) {
      git(repo, ["-c", "user.name=LAWSTIN Context", "-c", "user.email=context@localhost", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message]);
    }
    return git(repo, ["rev-parse", "HEAD"]).trim();
  }

  async list() {
    return this.config.courses.map(({ id, name }) => ({ id, name }));
  }

  async read(id) {
    const course = this.course(id);
    return lock(path.join(this.config.stateDir, "locks", id), async () => {
      const files = await this.files(course);
      const checkpoint = await this.snapshot(course, files, "Checkpoint current context");
      return { course: id, name: course.name, revision: revision(files["AI-MEMORY.md"]), checkpoint, files };
    });
  }

  async writeHandoff(id, expectedRevision, currentWork, actor) {
    if (typeof currentWork !== "string" || !currentWork.trim() || currentWork.length > 16_000) throw new Error("Provide a nonempty handoff of at most 16,000 characters.");
    return this.saveMemory(id, expectedRevision, actor, old => replaceCurrentWork(old, currentWork), "Handoff");
  }

  async recordFact(id, expectedRevision, fact, actor) {
    if (typeof fact !== "string" || !fact.trim() || fact.length > 2000 || /[\r\n]/.test(fact)) throw new Error("Provide one factual paragraph of at most 2,000 characters.");
    return this.saveMemory(id, expectedRevision, actor, old => {
      const match = /^## Log\s*\r?$/m.exec(old);
      if (!match) throw new Error("AI-MEMORY.md has no '## Log' section.");
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const entry = `- ${date} (${actor}): ${fact.trim()}`;
      if (old.includes(entry)) return old;
      const end = match.index + match[0].length;
      return old.slice(0, end).trimEnd() + "\n" + entry + "\n" + old.slice(end).replace(/^\s*\n/, "");
    }, "Fact");
  }

  async saveMemory(id, expectedRevision, actor, update, label) {
    if (!/^[a-f0-9]{64}$/.test(expectedRevision || "")) throw new Error("Read the course context first and provide its revision.");
    if (!["Claude Code", "Claude Desktop", "Codex", "ChatGPT Desktop"].includes(actor)) throw new Error("Identify the AI application saving the course context.");
    const course = this.course(id);
    return lock(path.join(this.config.stateDir, "locks", id), async () => {
      const before = await this.files(course);
      const old = before["AI-MEMORY.md"];
      if (revision(old) !== expectedRevision) throw new Error("The course memory changed since you read it. Read it again and merge your handoff with the newer work.");
      const next = update(old);
      await this.snapshot(course, before, `Before ${label.toLowerCase()} update`);
      // Recheck after the Git operation, which can overlap an external editor/Drive sync.
      if (revision(await this.file(course, "AI-MEMORY.md")) !== expectedRevision) throw new Error("The file changed during checkpointing. Read it again before saving.");
      if (next !== old) await atomicWrite(path.join(course.contextDir, "AI-MEMORY.md"), next);
      let checkpoint;
      try { checkpoint = await this.snapshot(course, { ...before, "AI-MEMORY.md": next }, `${label} saved by ${actor}`); }
      catch (error) {
        return { saved: true, course: id, revision: revision(next), warning: `The memory was saved, but the after-save checkpoint failed: ${error.message}. Run checkpoint_course_context; do not repeat the write with the old revision.` };
      }
      return { saved: true, course: id, revision: revision(next), checkpoint };
    });
  }

  async history(id, limit = 10) {
    const course = this.course(id);
    return lock(path.join(this.config.stateDir, "locks", id), async () => {
      const files = await this.files(course);
      await this.snapshot(course, files, "Checkpoint current context");
      const repo = path.join(this.config.stateDir, "history", id);
      return git(repo, ["log", `-${Math.max(1, Math.min(30, limit))}`, "--format=%H%x09%cI%x09%s"]).trim().split("\n").map(line => {
        const [commit, time, message] = line.split("\t"); return { commit, time, message };
      });
    });
  }

  async readVersion(id, commit) {
    if (!/^[a-f0-9]{40,64}$/.test(commit || "")) throw new Error("Provide a full commit hash from course history.");
    await this.history(id, 1);
    return git(path.join(this.config.stateDir, "history", id), ["show", `${commit}:AI-MEMORY.md`]);
  }

  async search(id, query) {
    if (typeof query !== "string" || !query.trim() || query.length > 200) throw new Error("Provide a search phrase of 1–200 characters.");
    const context = await this.read(id);
    const needle = query.toLocaleLowerCase();
    const matches = [];
    for (const [file, text] of Object.entries(context.files)) {
      text.split(/\r?\n/).forEach((line, index) => {
        if (matches.length < 40 && line.toLocaleLowerCase().includes(needle)) matches.push({ file, line: index + 1, text: line.slice(0, 2000) });
      });
    }
    return { course: id, matches, limit: 40 };
  }
}
