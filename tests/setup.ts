import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Workflow tests are always deterministic: they exercise the mock runtime,
// never a live harness — even when the developer's .env selects trueforge
// (vitest loads .env files into process.env like Vite does).
process.env.AGENT_PROVIDER = "mock";

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
