// Hostinger writes dashboard environment variables to a .env file instead of the process environment.
// Imported first by server.js so the variables exist before api/ask.js reads them.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of [join(here, ".env"), join(process.cwd(), ".env")]) {
  if (existsSync(file)) {
    try { process.loadEnvFile(file); } catch (e) { console.error("Could not read", file, e.message); }
    break;
  }
}
