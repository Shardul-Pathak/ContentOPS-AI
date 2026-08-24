import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test file gets its own throwaway SQLite database so tests never touch
// development data and can run in parallel. Must run before any module imports
// @prisma/client, because PrismaClient reads DATABASE_URL at instantiation.
const dir = mkdtempSync(path.join(os.tmpdir(), "content-ops-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

execSync("npx prisma migrate deploy", {
  env: process.env,
  stdio: "pipe",
  cwd: path.resolve(__dirname, ".."),
});
