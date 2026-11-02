import fs from "node:fs/promises";
const files = ["cloud-handler.mjs", "cloud-context.mjs", "google-bridge.mjs", "memory.mjs", "courses.mjs"];
for (const file of files) await fs.copyFile(`tools/course-context/${file}`, `supabase/functions/course-cloud/${file}`);
console.log("Prepared the cloud function from the shared connector source.");
