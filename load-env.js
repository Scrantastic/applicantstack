// Hostinger writes dashboard environment variables to a .env file instead of the process environment.
// Imported first by server.js so the variables exist before api/ask.js reads them.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const envFiles = [...new Set([join(here, ".env"), join(process.cwd(), ".env"), join(here, "..", ".env")])];
export const envStatus = [];
for (const file of envFiles) {
  const found = existsSync(file);
  let loaded = false;
  if (found) {
    try { process.loadEnvFile(file); loaded = true; } catch (e) { console.error("Could not read", file, e.message); }
  }
  envStatus.push({ file, found, loaded });
}
