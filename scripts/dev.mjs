import { spawn } from "node:child_process";
import { resolve } from "node:path";
const processes = [];
const run = (label, file, args = []) => {
  const p = spawn(process.execPath, [resolve(file), ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  for (const stream of [p.stdout, p.stderr])
    stream.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
  processes.push(p);
  p.on("exit", (code) => {
    if (code && !stopping) {
      console.error(`${label} stopped with exit ${code}`);
      stop(code);
    }
  });
  return p;
};
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of processes) p.kill();
  setTimeout(() => process.exit(code), 300).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
run("api", "node_modules/wrangler/bin/wrangler.js", [
  "dev",
  "--ip",
  "127.0.0.1",
  "--port",
  "8787",
]);
run("web", "node_modules/vite/bin/vite.js", ["--host", "127.0.0.1"]);
run("ai-worker", "scripts/runner.mjs");
console.log(
  "Fieldnote dashboard: http://127.0.0.1:5173 — close this process to stop the app.",
);
