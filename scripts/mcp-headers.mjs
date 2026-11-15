// Prints the Authorization header for the local Fieldnote MCP server (used by .mcp.json headersHelper).
// Reads MCP_TOKEN from .dev.vars at connect time so the token is never copied into other config files.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vars = readFileSync(resolve(root, ".dev.vars"), "utf8");
const token = vars.match(/^MCP_TOKEN\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
if (!token) {
  console.error("MCP_TOKEN missing in .dev.vars. Run npm run setup.");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
