import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const source = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(source, "../../.context-build");
const plugin = path.join(output, "lawstin-course-context-cloud");
await fs.rm(plugin, { recursive: true, force: true });
await fs.mkdir(path.join(plugin, ".codex-plugin"), { recursive: true });
const description = "Quiz from LAWSTIN, save study progress, and share five courses' existing Drive handoffs through a cloud connection.";
const presentation = {
  displayName: "LAWSTIN Course Context", shortDescription: "Course handoffs and quizzes",
  longDescription: "Ask LAWSTIN's saved questions in chat or Work voice and record answers in the usual progress and review schedule. Read and update the five existing Drive course handoffs with private cloud version history. Cloud sign-in and the optional Google handoff bridge need one-time setup. Work projects and course source documents are excluded.",
  developerName: "Austin", category: "Productivity", capabilities: [],
  defaultPrompt: "Read my course's latest shared handoff before we continue.",
};
const author = { name: "Austin", email: "trevinoaustin10@gmail.com" };
const identity = { name: "lawstin-course-context", version: "2.0.0", description, author };
if (presentation.shortDescription.length > 30) throw new Error("Plugin subtitle exceeds 30 characters.");
const json = (file, value) => fs.writeFile(path.join(plugin, file), JSON.stringify(value, null, 2) + "\n");
await json("plugin.json", {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", ...identity,
  extensions: { "com.openai": { interface: presentation } },
});
await json(".codex-plugin/plugin.json", { ...identity, interface: presentation, keywords: [], skills: "./skills" });
await json("mcp.json", {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: { "lawstin-courses": {
    type: "streamable-http", url: "https://vbqfmgsrxurdazujbbuk.supabase.co/functions/v1/course-cloud/mcp",
    extensions: { "com.openai": { auth: { type: "oauth", client: { mode: "dcr" }, baseScopes: ["email", "profile"], defaultScopes: ["email", "profile"] } } },
  } },
});
for (const skill of ["course-handoff", "lawstin-quiz"]) {
  await fs.mkdir(path.join(plugin, "skills", skill), { recursive: true });
  await fs.copyFile(path.join(source, "cloud-skills", skill, "SKILL.md"), path.join(plugin, "skills", skill, "SKILL.md"));
}
const archive = path.join(output, "lawstin-course-context-cloud-plugin.zip");
await fs.rm(archive, { force: true });
execFileSync("zip", ["-q", "-r", archive, path.basename(plugin)], { cwd: output });
console.log(JSON.stringify({ plugin: archive }, null, 2));
