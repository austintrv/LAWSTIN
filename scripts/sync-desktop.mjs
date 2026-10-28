import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const desktop = path.join(os.homedir(), "Desktop", "LAWSTIN");
if (!fs.existsSync(desktop)) { console.error("Desktop/LAWSTIN is not mounted on this machine. No files changed."); process.exit(1); }
// Copy only documented handoff files; never remove Desktop files or overwrite credentials.
for (const file of ["AI-MEMORY.md", "skills/README.md", "skills/daily-law-quiz/SKILL.md", "skills/lawstin-study-materials/SKILL.md"]) {
  const target = path.join(desktop, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target);
}
console.log("Updated Desktop memory and skill copies.");
