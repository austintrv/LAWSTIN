import fs from "node:fs";
import { libraryErrors, type MaterialLibrary, type StudyMaterial, type StudyRun } from "../src/helpers/studyMaterials";

// The accuracy check happens in a separate agent, never in this script.
type Check = { id: string; result: "PASS" | "FIXED_PASS" | "DROP"; checker: string; source_locations: string[]; note: string };
const input = process.argv[2];
if (!input) throw new Error("Usage: npm run study:publish -- /private/path/batch.json");
const batch = JSON.parse(fs.readFileSync(input, "utf8")) as { materials: StudyMaterial[]; run: StudyRun; checks: Check[] };
const path = "src/data/study-materials.json";
const original = JSON.parse(fs.readFileSync(path, "utf8")) as MaterialLibrary;
const taxonomy = JSON.parse(fs.readFileSync("src/data/study-taxonomy.json", "utf8")) as { topics: { course: string; topic: string; subtopic: string }[] };
const fail = (message: string): never => { throw new Error(message); };
if (!Array.isArray(batch.materials) || !Array.isArray(batch.checks) || !batch.run) fail("Batch requires materials, run, and checker results");
if (!batch.materials.length) { console.log("No verified additions. No files written."); process.exit(0); }
if (original.runs.some(r => r.id === batch.run.id)) fail("This run is already published; nothing was changed");
const existing = new Set(original.materials.map(m => m.id));
const checkIds = new Set(batch.checks.map(c => c.id));
if (checkIds.size !== batch.checks.length) fail("Duplicate checker results");
const publishedIds = new Set(batch.materials.map(m => m.id));
if (publishedIds.size !== batch.materials.length) fail("Duplicate material IDs");
for (const m of batch.materials) {
  if (!taxonomy.topics.some(t => t.course === m.course && t.topic === m.topic && t.subtopic === m.subtopic)) fail(`Topic/subtopic not in the question taxonomy: ${m.id}`);
  if (existing.has(m.id)) fail(`Refusing to overwrite existing material: ${m.id}`);
  if (m.batch !== batch.run.run_date) fail(`Batch date mismatch: ${m.id}`);
  const check = batch.checks.find(c => c.id === m.id);
  if (!check || !["PASS", "FIXED_PASS"].includes(check.result) || !check.checker || !Array.isArray(check.source_locations) || !check.source_locations.length || !check.note
    || check.checker !== m.verified?.checker) fail(`Missing independent checker evidence: ${m.id}`);
}
for (const check of batch.checks) {
  if (!["PASS", "FIXED_PASS", "DROP"].includes(check.result) || !check.id || !check.checker || !check.note) fail("Invalid checker result");
  if ((check.result !== "DROP") !== publishedIds.has(check.id)) fail(`Checker result does not match published set: ${check.id}`);
}
const counts = {
  drafted: batch.checks.length, passed: batch.checks.filter(c => c.result === "PASS").length,
  fixedThenPassed: batch.checks.filter(c => c.result === "FIXED_PASS").length, dropped: batch.checks.filter(c => c.result === "DROP").length,
};
for (const k of Object.keys(counts) as (keyof typeof counts)[]) if (batch.run.check_counts[k] !== counts[k]) fail(`Checker count mismatch: ${k}`);
if (batch.run.added !== batch.materials.length) fail("Added count mismatch");
for (const field of ["course", "kind"] as const) {
  const actual: Record<string, number> = {};
  for (const m of batch.materials) actual[m[field]] = (actual[m[field]] ?? 0) + 1;
  const declared = field === "course" ? batch.run.by_course : batch.run.by_kind;
  for (const key of new Set([...Object.keys(actual), ...Object.keys(declared)])) if ((declared[key] ?? 0) !== (actual[key] ?? 0)) fail(`Incorrect ${field} count: ${key}`);
}
const next = { ...original, materials: [...original.materials, ...batch.materials], runs: [batch.run, ...original.runs] };
const errors = libraryErrors(next);
if (errors.length) fail(errors.join("\n"));
// Stage the manifest, then rename: a rejected or interrupted check cannot leave partial JSON.
const temp = `${path}.tmp`;
fs.writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
if (!/^[a-z0-9-]+$/.test(batch.run.id)) fail("Run ID must be a safe filename");
fs.mkdirSync("content/study-checks", { recursive: true });
fs.writeFileSync(`content/study-checks/${batch.run.id}.json`, JSON.stringify({ run: batch.run, checks: batch.checks }, null, 2) + "\n");
fs.renameSync(temp, path);
console.log(`Published ${batch.materials.length} verified materials to the repository library. Commit and deployment still required.`);
