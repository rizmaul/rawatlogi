// Attach a PNG/JPEG/WebP to one segment of a Rawatlogi post through the MCP endpoint,
// without passing the image bytes through the AI's context.
// Usage: node scripts/upload-segment-image.mjs <postId> <segmentIndex> <image file>
// Env: RAWATLOGI_MCP_URL (default http://127.0.0.1:8787/mcp), RAWATLOGI_MCP_TOKEN (default: MCP_TOKEN in .dev.vars).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [postId, index, file] = process.argv.slice(2);
if (!postId || index === undefined || !file) {
  console.error("Usage: node scripts/upload-segment-image.mjs <postId> <segmentIndex> <image file>");
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.RAWATLOGI_MCP_URL || "http://127.0.0.1:8787/mcp";
let token = process.env.RAWATLOGI_MCP_TOKEN;
if (!token) {
  const vars = readFileSync(resolve(root, ".dev.vars"), "utf8");
  token = vars.match(/^MCP_TOKEN\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
}
if (!token) throw new Error("No MCP token: set RAWATLOGI_MCP_TOKEN or run npm run setup.");
const bytes = readFileSync(resolve(file));
if (bytes.length > 5 * 1024 * 1024) throw new Error("Image is larger than 5 MB.");
const r = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "upload_post_segment_image",
      arguments: { postId, segmentIndex: Number(index), imageBase64: bytes.toString("base64") },
    },
  }),
});
const body = await r.json();
const result = body.result;
if (!r.ok || !result || result.isError) {
  console.error("Upload failed:", result?.content?.[0]?.text || body.error?.message || r.status);
  process.exit(1);
}
const data = JSON.parse(result.content[0].text);
console.log(
  `Attached image ${data.image.id} (${data.image.contentType}, ${data.image.size} bytes) to post ${postId} segment ${index}.`,
);
console.log("segmentImages:", JSON.stringify(data.post.data.segmentImages));
