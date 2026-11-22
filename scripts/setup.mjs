import { randomBytes } from "node:crypto";
import {
  existsSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
if (!existsSync(".dev.vars")) writeFileSync(".dev.vars", "");
mkdirSync("dist", { recursive: true });
// Bearer token for the MCP endpoint (http://127.0.0.1:8787/mcp). Never printed.
if (!/^MCP_TOKEN=/m.test(readFileSync(".dev.vars", "utf8")))
  appendFileSync(
    ".dev.vars",
    `
MCP_TOKEN="${randomBytes(32).toString("base64url")}"
`,
  );
if (!existsSync("dist/index.html"))
  writeFileSync(
    "dist/index.html",
    "<!doctype html><title>Rawatlogi</title><p>Run npm run dev for the dashboard.</p>",
  );
const r = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
process.exit(r.status ?? 1);
