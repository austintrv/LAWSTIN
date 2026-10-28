import fs from "node:fs";
import path from "node:path";
import { libraryErrors, type StudyMaterial, type StudyRun } from "../src/helpers/studyMaterials";

// The accuracy check happens in a separate agent, never in this script. This script validates a checked
// batch and writes one SQL statement for the Supabase connector; the database function refuses overwrites.
type Check = { id: string; result: "PASS" | "FIXED_PASS" | "DROP"; checker: string; source_locations: string[]; note: string };
type Brief = { coverage: { course: string; topic: string; subtopic: string }[]; library: { materials: { id: string }[]; run_ids?: string[] } };
const [input, briefPath] = process.argv.slice(2);
if (!input || !briefPath) throw new Error("Usage: npm run study:publish -- /private/path/batch.json /private/path/history.brief.json");
const batch = JSON.parse(fs.readFileSync(input, "utf8")) as { materials: StudyMaterial[]; run: StudyRun; checks: Check[] };
const brief = JSON.parse(fs.readFileSync(briefPath, "utf8")) as Brief;
const fail = (message: string): never => { throw new Error(message); };
if (!Array.isArray(brief.coverage) || !Array.isArray(brief.library?.materials)) fail("A current history brief with coverage and library is required");
if (!Array.isArray(batch.materials) || !Array.isArray(batch.checks) || !batch.run) fail("Batch requires materials, run, and checker results");
if (!batch.materials.length) { console.log("No verified additions. Nothing to publish."); process.exit(0); }
if (!/^[a-z0-9-]+$/.test(batch.run.id)) fail("Run ID must use lowercase letters, digits, and hyphens");
if (brief.library.run_ids?.includes(batch.run.id)) fail("This run is already published; nothing was changed");
const existing = new Set(brief.library.materials.map(m => m.id));
const checkIds = new Set(batch.checks.map(c => c.id));
if (checkIds.size !== batch.checks.length) fail("Duplicate checker results");
const publishedIds = new Set(batch.materials.map(m => m.id));
if (publishedIds.size !== batch.materials.length) fail("Duplicate material IDs");
for (const m of batch.materials) {
  if (!brief.coverage.some(t => t.course === m.course && t.topic === m.topic && t.subtopic === m.subtopic)) fail(`Topic/subtopic not in the question taxonomy: ${m.id}`);
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
const errors = libraryErrors({ schema_version: 1, materials: batch.materials, runs: [batch.run] });
if (errors.length) fail(errors.join("\n"));
const payload = JSON.stringify({ materials: batch.materials, run: batch.run, checks: batch.checks });
let tag = "lawstin";
while (payload.includes(`$${tag}$`)) tag += "x";
const out = path.join(".study-work", `${batch.run.id}.publish.sql`);
fs.mkdirSync(".study-work", { recursive: true });
fs.writeFileSync(out, `select public.publish_study_batch($${tag}$${payload}$${tag}$::jsonb);\n`);
console.log(`Validated ${batch.materials.length} checked materials. Run ${out} once through the Supabase connector (project vbqfmgsrxurdazujbbuk) to publish.`);
