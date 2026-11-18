import { readFileSync } from "node:fs";
import { validatePacket } from "./validate.mjs";
try {
  validatePacket(JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log("Valid LAWSTIN review packet.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
