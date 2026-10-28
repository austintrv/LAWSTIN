import fs from "node:fs";
import { libraryErrors } from "../src/helpers/studyMaterials";

// Validates a library-shaped file: a checked batch ({materials, run}) or an export ({materials, runs}).
const path = process.argv[2] ?? "tests/fixtures/study-library.json";
try {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const library = { schema_version: 1, materials: raw.materials, runs: raw.runs ?? (raw.run ? [raw.run] : []) };
  const errors = libraryErrors(library);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Validated ${library.materials.length} verified materials and ${library.runs.length} study runs.`);
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
