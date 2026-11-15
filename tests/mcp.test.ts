import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import app from "../worker/index";

const TOKEN = "t".repeat(40);
async function setup(mode = "local", extra: Record<string, unknown> = {}) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "mcp",
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-11-01",
      d1Databases: ["DB"],
      r2Buckets: ["BUCKET"],
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of ["0001_initial.sql", "0002_sessions_settings.sql"])
    for (const statement of (await readFile(new URL("../migrations/" + file, import.meta.url), "utf8"))
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  const env: any = {
    DB: db,
    BUCKET: await mf.getR2Bucket("BUCKET"),
    APP_MODE: mode,
    LOCAL_RUNNER_TOKEN: "runner",
    SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    MCP_TOKEN: TOKEN,
    ...extra,
  };
  const host = mode === "local" ? "http://localhost" : "https://rawatlogi.example.com";
  let id = 0;
  const rpc = async (method: string, params: unknown = {}, token = TOKEN) => {
    const r = await app.request(
      host + "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer " + token },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      },
      env,
    );
    return { status: r.status, body: (await r.json()) as any };
  };
  const tool = async (name: string, args: unknown = {}) => {
    const { body } = await rpc("tools/call", { name, arguments: args });
    const text = body.result.content[0].text;
    return { isError: !!body.result.isError, text, data: body.result.isError ? null : JSON.parse(text) };
  };
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await app.request(host + "/api" + path, init, env);
    return { status: r.status, body: (await r.json()) as any };
  };
  return { mf, env, rpc, tool, api };
}

const url = "https://s.shopee.co.id/abc123";
const draft = {
  title: "Cek varian",
  x: ["Cek ukuran dan varian dulu sebelum checkout.", `Tautan afiliasi: ${url}`],
  threads: [`Lagi bandingkan pilihan? Mulai dari ukuran dan varian.\n\nTautan afiliasi: ${url}`],
  sourceIds: [],
  warnings: [],
};

test("MCP: auth, handshake, tool listing and the full Claude-driven workflow", async () => {
  const { mf, rpc, tool } = await setup();
  try {
    assert.equal((await rpc("tools/list", {}, "wrong-token-wrong-token-wrong-token!!")).status, 401);
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.body.result.protocolVersion, "2025-06-18");
    assert.ok(init.body.result.capabilities.tools);
    const list = await rpc("tools/list");
    const names = list.body.result.tools.map((t: any) => t.name);
    for (const n of ["create_product", "save_research_session", "save_writing_session", "update_post", "update_prompts", "get_writing_brief"])
      assert.ok(names.includes(n), n);
    assert.equal((await rpc("nope/method")).body.error.code, -32601);

    const product = await tool("create_product", { name: "Test Gel", category: "Skincare", affiliateUrl: url });
    assert.equal(product.isError, false);
    const productId = product.data.id;
    // Writing requires a confirmed product.
    assert.equal((await tool("save_writing_session", { productId, topic: { title: "Cek varian" }, draft })).isError, true);
    await tool("update_product", { productId, confirmed: true });
    const brief = await tool("get_writing_brief", { productId });
    assert.ok(brief.data.instructions.writer.includes("VOICE"));
    assert.deepEqual(brief.data.approvedEvidence, []);
    // Invented evidence IDs and missing disclosure are rejected.
    assert.equal((await tool("save_writing_session", { productId, topic: { title: "Cek varian" }, draft: { ...draft, sourceIds: ["fake"] } })).isError, true);
    const writing = await tool("save_writing_session", { productId, topic: { title: "Cek varian" }, draft });
    assert.equal(writing.isError, false, writing.text);
    assert.equal(writing.data.postIds.length, 2);

    const posts = await tool("list_posts", { productId });
    assert.equal(posts.data.totalItems, 2);
    const scheduled = await tool("update_post", { postId: writing.data.postIds[0], scheduledAtJakarta: "2026-11-20T09:00" });
    assert.equal(scheduled.data.data.scheduledAt, "2026-11-20T02:00:00.000Z");
    const calendar = await tool("get_calendar", { from: "2026-11-20", to: "2026-11-20" });
    assert.equal(calendar.data.length, 1);

    const source = { title: "Ceramide trial", sourceId: "PMC1", url: "https://europepmc.org/article/PMC/PMC1", year: "2024", authors: "A", abstract: "Abstract", studyType: "RCT" };
    const report = { summary: "Ringkasan", findings: [{ claim: "Klaim", sourceIds: ["PMC9"], confidence: "supported", limitations: "Kecil" }], nextSteps: [], warnings: [] };
    assert.equal((await tool("save_research_session", { productId, topic: { title: "Ceramide barrier" }, sources: [source], report })).isError, true);
    report.findings[0].sourceIds = ["PMC1"];
    const research = await tool("save_research_session", { productId, topic: { title: "Ceramide barrier" }, sources: [source], report });
    assert.equal(research.isError, false, research.text);
    const session = await tool("get_session", { sessionId: research.data.sessionId });
    assert.equal(session.data.status, "completed");
    assert.equal(session.data.result.author, "Claude via MCP");

    const prompts = await tool("update_prompts", { prompts: { plan: "Custom plan" } });
    assert.deepEqual(prompts.data.overrides, { plan: "Custom plan" });
    await tool("update_prompts", { prompts: { plan: "" } });
    assert.equal((await tool("get_prompts")).data.find((p: any) => p.key === "plan").custom, false);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const image = await tool("upload_product_image", { productId, imageBase64: png.toString("base64") });
    assert.equal(image.isError, false, image.text);
    assert.equal(image.data.product.data.imageId, image.data.image.id);
    assert.equal((await tool("delete_product", { productId })).isError, true);
    const settings = await tool("get_ai_settings");
    assert.equal(settings.data.apiKey, undefined);
  } finally {
    await mf.dispose();
  }
});

test("production: API needs a valid Cloudflare Access token, gateway routes are blocked, MCP still works", async () => {
  const team = "rawatlogi-test.cloudflareaccess.com", aud = "aud-tag-123";
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", alg: "RS256" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) =>
    String(input) === `https://${team}/cdn-cgi/access/certs`
      ? new Response(JSON.stringify({ keys: [jwk] }))
      : realFetch(input, init)) as typeof fetch;
  const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
  async function jwt(claims: Record<string, unknown>) {
    const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" }) + "." + b64(claims);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(head));
    return head + "." + Buffer.from(sig).toString("base64url");
  }
  const now = Math.floor(Date.now() / 1000);
  const { mf, api, tool } = await setup("production", { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud });
  try {
    assert.equal((await api("/state")).status, 401);
    const good = await jwt({ aud: [aud], iss: `https://${team}`, exp: now + 300, email: "owner@example.com" });
    const ok = await api("/state", { headers: { "Cf-Access-Jwt-Assertion": good } });
    assert.equal(ok.status, 200);
    const wrongAud = await jwt({ aud: ["other"], iss: `https://${team}`, exp: now + 300 });
    assert.equal((await api("/state", { headers: { "Cf-Access-Jwt-Assertion": wrongAud } })).status, 401);
    const expired = await jwt({ aud: [aud], iss: `https://${team}`, exp: now - 10 });
    assert.equal((await api("/state", { headers: { "Cf-Access-Jwt-Assertion": expired } })).status, 401);
    const tampered = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
    assert.equal((await api("/state", { headers: { "Cf-Access-Jwt-Assertion": tampered } })).status, 401);
    const blocked = await api("/topics/generate", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": good, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /local app/);
    assert.equal((await api("/runner/claim", { method: "POST", headers: { Authorization: "Bearer runner" } })).status, 400);
    // MCP authenticates with its own bearer token, independent of Access.
    const created = await tool("create_product", { name: "Cloud Gel", category: "Skincare", affiliateUrl: url });
    assert.equal(created.isError, false, created.text);
    assert.equal((await tool("queue_topic_suggestions", { kind: "research", productId: created.data.id })).isError, true);
  } finally {
    globalThis.fetch = realFetch;
    await mf.dispose();
  }
});

test("segment images: validated, protected while used, cleaned up when replaced", async () => {
  const { mf, env, tool } = await setup();
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64").toString("base64");
    const product = await tool("create_product", { name: "Gel", category: "Skincare", affiliateUrl: url });
    const missing = await tool("create_post", { productId: product.data.id, title: "T", platform: "x", segments: ["a", "b"], segmentImages: ["00000000-0000-4000-8000-000000000000", null] });
    assert.equal(missing.isError, true);
    assert.match(missing.text, /segment image is unavailable/);
    const post = await tool("create_post", { productId: product.data.id, title: "T", platform: "x", segments: ["a", "b"] });
    const first = await tool("upload_post_segment_image", { postId: post.data.id, segmentIndex: 1, imageBase64: png });
    assert.equal(first.isError, false, first.text);
    assert.deepEqual(first.data.post.data.segmentImages, [null, first.data.image.id]);
    assert.equal((await tool("upload_post_segment_image", { postId: post.data.id, segmentIndex: 5, imageBase64: png })).isError, true);
    // In use: deleting the image file is refused.
    const r = await app.request("http://localhost/api/images/" + first.data.image.id, { method: "DELETE" }, env);
    assert.deepEqual(await r.json(), { kept: true });
    // Replacing removes the old, now unreferenced file.
    const second = await tool("upload_post_segment_image", { postId: post.data.id, segmentIndex: 1, imageBase64: png });
    assert.equal(await env.BUCKET.head("products/" + first.data.image.id), null);
    assert.ok(await env.BUCKET.head("products/" + second.data.image.id));
    // Dropping a segment via MCP keeps images aligned.
    const trimmed = await tool("update_post", { postId: post.data.id, segments: ["only one"] });
    assert.deepEqual(trimmed.data.data.segmentImages, [null]);
    assert.equal(await env.BUCKET.head("products/" + second.data.image.id), null);
  } finally {
    await mf.dispose();
  }
});

test("image brief: segment suggestions, product photo, image prompt; get_image returns image content", async () => {
  const { mf, rpc, tool } = await setup();
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64").toString("base64");
    const product = await tool("create_product", { name: "Gel", category: "Skincare", affiliateUrl: url, confirmed: true });
    const photo = await tool("upload_product_image", { productId: product.data.id, imageBase64: png });
    const post = await tool("create_post", {
      productId: product.data.id,
      title: "Gel vs cream",
      platform: "x",
      segments: ["Gel atau cream buat kulit kering?", "Humectant menarik air, occlusive menahan air supaya nggak cepat menguap dari kulit.", `Tautan afiliasi: ${url}`],
    });
    const brief = await tool("get_image_brief", { postId: post.data.id });
    assert.equal(brief.isError, false, brief.text);
    assert.deepEqual(brief.data.post.segments.map((s: any) => s.suggestion), ["thumbnail", "explainer", "none"]);
    assert.equal(brief.data.product.photoImageId, photo.data.image.id);
    assert.equal(brief.data.sizes.thumbnail, "1600x900");
    assert.match(brief.data.instructions, /Ilustrasi konsep/);
    const { body } = await rpc("tools/call", { name: "get_image", arguments: { imageId: photo.data.image.id } });
    assert.equal(body.result.content[0].type, "image");
    assert.equal(body.result.content[0].mimeType, "image/png");
    assert.equal(Buffer.from(body.result.content[0].data, "base64").toString("base64"), png);
    assert.equal((await tool("get_image", { imageId: "not-an-id" })).isError, true);
  } finally {
    await mf.dispose();
  }
});

test("brand posts: no product, no affiliate link, no evidence; approvable without disclosure", async () => {
  const { mf, tool } = await setup();
  try {
    const post = await tool("create_post", { title: "Kenalan", platform: "x", segments: ["Halo, ini Rawatlogi."] });
    assert.equal(post.isError, false, post.text);
    assert.equal(post.data.data.productId, "");
    const approved = await tool("update_post", { postId: post.data.id, status: "approved" });
    assert.equal(approved.isError, false, approved.text);
    const withLink = await tool("create_post", { title: "x", platform: "x", segments: ["Beli di https://s.shopee.co.id/abc"] });
    assert.equal(withLink.isError, true);
    const withEvidence = await tool("create_post", { title: "x", platform: "x", segments: ["a"], sourceIds: ["e1"] });
    assert.equal(withEvidence.isError, true);
    const brief = await tool("get_image_brief", { postId: post.data.id });
    assert.equal(brief.isError, false, brief.text);
    assert.match(brief.data.product.note, /Brand post/);
  } finally {
    await mf.dispose();
  }
});
