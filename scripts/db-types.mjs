import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Generate fully before writing so a CLI failure cannot erase checked-in types.
const target = process.argv.includes("--linked") ? "--linked" : "--local";
const types = execFileSync(
  "supabase",
  ["gen", "types", "typescript", target, "--schema", "public"],
  { encoding: "utf8" },
);
writeFileSync("src/types/database.ts", types);
console.log(`Generated database types (${target}).`);
