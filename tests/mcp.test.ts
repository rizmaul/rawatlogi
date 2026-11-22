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
    for (const n of ["create_product", "create_evidence", "save_drafts", "update_post", "get_discovery_brief", "get_writing_brief"])
      assert.ok(names.includes(n), n);
    assert.equal((await rpc("nope/method")).body.error.code, -32601);

    const product = await tool("create_product", { name: "Test Gel", category: "Skincare", affiliateUrl: url, ingredients: "Aqua, Glycerin", advertisedClaims: "Moisturizes", price: 50000, manufacturerUrl: "https://brand.example.com/gel", notes: "Exact variant checked at official brand page" });
    assert.equal(product.isError, false);
    assert.equal(product.data.setup.imageStatus, "pending");
    const productId = product.data.id;
    const discovery = await tool("get_discovery_brief", { area: "kulit", focus: "viral product" });
    assert.equal(discovery.isError, false, discovery.text);
    assert.equal(discovery.data.area.key, "kulit");
    assert.equal(discovery.data.existingProducts.length, 1);
    assert.equal(discovery.data.existingProducts[0].ingredients, "Aqua, Glycerin");
    assert.equal(discovery.data.existingProducts[0].advertisedClaims, "Moisturizes");
    assert.equal(discovery.data.existingProducts[0].price, 50000);
    assert.equal(discovery.data.existingProducts[0].posts, 0);
    assert.ok(discovery.data.searchHints.sources.includes("site:femaledaily.com"));
    assert.ok(Array.isArray(discovery.data.instructions) && discovery.data.instructions.length >= 5);
    // Writing requires a confirmed product.
    assert.equal((await tool("save_drafts", { productId, topic: { title: "Cek varian" }, draft })).isError, true);
    await tool("update_product", { productId, confirmed: true });
    const brief = await tool("get_writing_brief", { productId });
    assert.ok(brief.data.platformBudgets.x);
    assert.deepEqual(brief.data.approvedEvidence, []);
    // Invented evidence IDs and missing disclosure are rejected.
    assert.equal((await tool("save_drafts", { productId, topic: { title: "Cek varian" }, draft: { ...draft, sourceIds: ["fake"] } })).isError, true);
    const writing = await tool("save_drafts", { productId, topic: { title: "Cek varian" }, draft });
    assert.equal(writing.isError, false, writing.text);
    assert.equal(writing.data.postIds.length, 2);

    const posts = await tool("list_posts", { productId });
    assert.equal(posts.data.totalItems, 2);
    const scheduled = await tool("update_post", { postId: writing.data.postIds[0], scheduledAtJakarta: "2026-11-20T09:00" });
    assert.equal(scheduled.data.data.scheduledAt, "2026-11-20T02:00:00.000Z");
    const calendar = await tool("get_calendar", { from: "2026-11-20", to: "2026-11-20" });
    assert.equal(calendar.data.length, 1);

    const researchBrief = await tool("get_research_brief", { productId, focus: "ceramide barrier" });
    assert.equal(researchBrief.isError, false, researchBrief.text);
    assert.ok(researchBrief.data.searchHints.sources.includes("site:europepmc.org"));
    assert.ok(Array.isArray(researchBrief.data.instructions) && researchBrief.data.instructions.length >= 5);

    const evidence = await tool("create_evidence", { productId, title: "Ceramide trial", url: "https://europepmc.org/article/PMC/PMC1", sourceId: "PMC1", claim: "Narrow finding", limitations: "Small trial", verdict: "supported", approved: false });
    assert.equal(evidence.isError, false, evidence.text);
    const saved = await tool("get_product", { productId });
    assert.equal(saved.data.evidence.length, 1);
    assert.equal(saved.data.evidence[0].data.approved, false);
    assert.equal(saved.data.sessions, undefined);
    const snapshot = await tool("export_workspace");
    assert.equal(snapshot.data.sessions.length, 0);
    assert.equal(snapshot.data.jobs.length, 0);
    for (const removed of ["save_research_session", "save_writing_session", "list_sessions", "get_session", "list_jobs"])
      assert.equal(names.includes(removed), false, removed);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const image = await tool("upload_product_image", { productId, imageBase64: png.toString("base64") });
    assert.equal(image.isError, false, image.text);
    assert.equal(image.data.product.data.imageId, image.data.image.id);
    const savedProduct = await tool("get_product", { productId });
    assert.equal(savedProduct.data.data.imageId, image.data.image.id);
    assert.equal(savedProduct.data.data.ingredients, "Aqua, Glycerin");
    assert.equal(savedProduct.data.data.manufacturerUrl, "https://brand.example.com/gel");
    const alreadyIllustrated = await tool("create_product", { name: "Other Gel", category: "Skincare", affiliateUrl: url, imageId: image.data.image.id });
    assert.equal(alreadyIllustrated.isError, false, alreadyIllustrated.text);
    assert.equal(alreadyIllustrated.data.setup.imageStatus, "attached");
    assert.equal((await tool("delete_product", { productId })).isError, true);
  } finally {
    await mf.dispose();
  }
});

test("production: API is public, cross-site requests stay blocked, MCP requires a token", async () => {
  const { mf, api, tool, rpc } = await setup("production");
  try {
    assert.equal((await api("/state")).status, 200);
    const created = await api("/records/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Public Gel",
        category: "Skincare",
        affiliateUrl: url,
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(
      (await api("/state", { headers: { Origin: "https://other.example" } }))
        .status,
      403,
    );
    assert.equal(
      (await api("/state", { headers: { "sec-fetch-site": "cross-site" } }))
        .status,
      403,
    );
    assert.equal((await rpc("tools/list", {}, "wrong-token")).status, 401);
    const product = await tool("create_product", {
      name: "Cloud Gel",
      category: "Skincare",
      affiliateUrl: url,
    });
    assert.equal(product.isError, false, product.text);
  } finally {
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

test("image brief: segment suggestions, product photo; get_image returns image content", async () => {
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
    assert.match(brief.data.post.labelNote, /Ilustrasi konsep/);
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


test("retired sessions do not prevent product deletion and remain in backups", async () => {
  const { mf, env, tool, api } = await setup();
  try {
    const product = await tool("create_product", { name: "Legacy product", category: "Skincare", affiliateUrl: url });
    const productId = product.data.id;
    await env.DB.prepare("INSERT INTO jobs(id,status,payload,created_at,updated_at) VALUES('legacy-job','completed','{}','2026-11-18','2026-11-18')").run();
    await env.DB.prepare("INSERT INTO sessions(id,kind,product_id,topic,status,job_id,result,created_at,updated_at) VALUES('legacy-session','research',?,'{}','completed','legacy-job','{\"summary\":\"Keep this research\"}','2026-11-18','2026-11-18')").bind(productId).run();
    for (const statement of (await readFile(new URL("../migrations/0003_archive_sessions.sql", import.meta.url), "utf8")).split(";").map((s) => s.trim()).filter(Boolean))
      await env.DB.prepare(statement).run();
    const deleted = await api("/records/product/" + productId, { method: "DELETE" });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const backup = await tool("export_workspace");
    assert.equal(backup.data.sessions[0].product_id, productId);
    assert.equal(JSON.parse(backup.data.sessions[0].result).summary, "Keep this research");
    assert.equal(backup.data.jobs.length, 1);
  } finally {
    await mf.dispose();
  }
});
