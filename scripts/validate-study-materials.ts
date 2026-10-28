import fs from "node:fs";
import { libraryErrors } from "../src/helpers/studyMaterials";

const path = process.argv[2] ?? "src/data/study-materials.json";
try {
  const library = JSON.parse(fs.readFileSync(path, "utf8"));
  const errors = libraryErrors(library);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Validated ${library.materials.length} verified materials and ${library.runs.length} study runs.`);
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
