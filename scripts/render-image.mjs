// Render an HTML artboard to a PNG at an exact pixel size with headless Chrome or Edge.
// Usage: node scripts/render-image.mjs <input.html> <output.png> <width> <height>
import { spawnSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [input, output, w, h] = process.argv.slice(2);
const width = Number(w), height = Number(h);
if (!input || !output || !(width > 0) || !(height > 0)) {
  console.error("Usage: node scripts/render-image.mjs <input.html> <output.png> <width> <height>");
  process.exit(2);
}
const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error("No Chrome/Edge found. Set CHROME_PATH.");
  process.exit(1);
}
const out = resolve(output);
const r = spawnSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--virtual-time-budget=4000", // let web fonts and images load
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    pathToFileURL(resolve(input)).href,
  ],
  { encoding: "utf8", timeout: 60000 },
);
if (!existsSync(out)) {
  console.error("Render failed.", r.stderr?.slice(0, 500));
  process.exit(1);
}
const png = readFileSync(out);
const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
console.log(`Rendered ${out} (${size.width}x${size.height}, ${statSync(out).size} bytes)`);
if (size.width !== width || size.height !== height) {
  console.error(`Expected ${width}x${height}.`);
  process.exit(1);
}
