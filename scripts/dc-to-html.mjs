// Convert a static Claude Design artboard (.dc.html) into plain HTML for render-image.mjs.
// Removes the Design runtime (support.js and the x-dc logic script) and unwraps <x-dc>/<helmet>.
// Artboards that rely on {{holes}} or runtime state are not supported: keep image artboards static.
// Usage: node scripts/dc-to-html.mjs <input.dc.html> <output.html> [blobId=localFile ...]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [input, output, ...maps] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node scripts/dc-to-html.mjs <input.dc.html> <output.html> [blobId=localFile ...]");
  process.exit(2);
}
let html = readFileSync(input, "utf8");
html = html
  .replace(/<script\s+src="\.\/support\.js"\s*><\/script>\s*/g, "")
  .replace(/<script\s+type="text\/x-dc"[\s\S]*?<\/script>\s*/g, "")
  .replace(/<\/?x-dc>\s*/g, "")
  .replace(/<\/?helmet>\s*/g, "");
// Uploaded Design assets (/_blob/<id>) -> local files supplied on the command line.
for (const m of maps) {
  const [id, file] = m.split("=");
  html = html.split(`/_blob/${id}`).join(pathToFileURL(resolve(file)).href);
}
if (/\{\{[^}]+\}\}/.test(html)) console.warn("Warning: unresolved {{holes}} remain; the render will show them literally.");
if (/\/_blob\//.test(html)) console.warn("Warning: /_blob/ asset URLs remain; pass blobId=localFile mappings.");
writeFileSync(output, html);
console.log(`Wrote ${output}`);
