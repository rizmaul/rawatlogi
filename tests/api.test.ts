import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import app from "../worker/index";

test("real D1: product → evidence → drafts → review invalidation and runner contracts", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "test",
      modules: true,
      script: 'export default { fetch() { return new Response("test") } }',
      compatibilityDate: "2026-11-01",
      d1Databases: ["DB"],
      r2Buckets: ["BUCKET"],
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    const sql = await readFile(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
    const extra = await readFile(
      new URL("../migrations/0002_sessions_settings.sql", import.meta.url),
      "utf8",
    );
    for (const statement of extra
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
    const env: any = {
      DB: db,
      APP_MODE: "local",
      LOCAL_RUNNER_TOKEN: "test-token",
      BUCKET: await mf.getR2Bucket("BUCKET"),
    };
    const request = async (
      path: string,
      body?: any,
      method = "POST",
      headers: Record<string, string> = {},
    ) => {
      const response = await app.request(
        "http://localhost/api" + path,
        {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        },
        env,
      );
      return { status: response.status, value: (await response.json()) as any };
    };
    assert.equal(
      (
        await request("/state", undefined, "GET", {
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal((await request("/runner/claim", {})).status, 401);
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZ8AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const upload = await app.request(
      "http://localhost/api/images",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: png },
      env,
    );
    assert.equal(upload.status, 201);
    const image = (await upload.json()) as { id: string };
    const imageResponse = await app.request(
      "http://localhost/api/images/" + image.id,
      {},
      env,
    );
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("Content-Type"), "image/png");
    assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), png);
    assert.equal(
      (
        await app.request(
          "http://localhost/api/images",
          {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: "not really an image",
          },
          env,
        )
      ).status,
      415,
    );
    assert.equal(
      (
        await app.request(
          "http://localhost/api/images",
          {
            method: "POST",
            headers: { "Content-Length": String(6 * 1024 * 1024) },
            body: "oversize",
          },
          env,
        )
      ).status,
      413,
    );
    const p = await request("/records/product", {
      name: "TEST product",
      category: "Skincare",
      affiliateUrl: "https://example.com/test",
      confirmed: true,
      imageId: image.id,
    });
    assert.equal(p.status, 201);
    assert.equal(
      (await request("/images/" + image.id, undefined, "DELETE")).value.kept,
      true,
    );
    const disposableUpload = await app.request(
      "http://localhost/api/images",
      { method: "POST", body: png },
      env,
    );
    const disposable = (await disposableUpload.json()) as { id: string };
    assert.equal(
      (await request("/images/" + disposable.id, undefined, "DELETE")).value
        .deleted,
      true,
    );
    assert.equal(
      (
        await app.request(
          "http://localhost/api/images/" + disposable.id,
          {},
          env,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/records/product", {
          name: "Missing image",
          category: "Skincare",
          affiliateUrl: "https://example.com",
          imageId: crypto.randomUUID(),
        })
      ).status,
      400,
    );
    const product = p.value;
    const evidence = await request("/records/evidence", {
      productId: product.id,
      title: "TEST source",
      url: "https://example.com/source",
      claim: "Test-only finding",
      limitations: "Synthetic test, no scientific validity",
      verdict: "supported",
      approved: true,
    });
    assert.equal(evidence.status, 201);
    const post = await request("/records/post", {
      productId: product.id,
      title: "TEST post",
      platform: "x",
      segments: ["Tautan afiliasi https://example.com/test"],
      sourceIds: [evidence.value.id],
      status: "approved",
      scheduledAt: "2026-11-09T18:30:00.000Z",
    });
    assert.equal(post.status, 201);
    assert.equal(
      (
        await request(
          "/records/product/" + p.value.id,
          {
            version: p.value.version,
            data: { ...p.value.data, imageId: null },
          },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/state", undefined, "GET")).value.posts[0].data.status,
      "approved",
      "Photo-only changes must preserve text approval",
    );
    assert.equal(
      (await request("/records/product/" + product.id, undefined, "DELETE"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/records/evidence/" + evidence.value.id,
          { version: 1, data: { ...evidence.value.data, approved: false } },
          "PUT",
        )
      ).status,
      200,
    );
    let state = (await request("/state", undefined, "GET")).value;
    assert.equal(state.posts[0].data.status, "draft");
    assert.equal(
      (
        await request(
          "/records/product/" + product.id,
          { version: 999, data: product.data },
          "PUT",
        )
      ).status,
      409,
    );
    const job = await request("/jobs", {
      productId: product.id,
      angle: "Test cautious product introduction",
    });
    assert.equal(job.status, 202);
    assert.equal(
      (
        await request("/jobs", {
          productId: product.id,
          angle: "Duplicate job",
        })
      ).status,
      409,
    );
    const headers = { Authorization: "Bearer test-token" };
    const claimed = (await request("/runner/claim", {}, "POST", headers)).value
      .job;
    assert.equal(claimed.payload.evidence.length, 0);
    assert.equal(
      (
        await request(
          "/runner/" + claimed.id + "/finish",
          { claimToken: "wrong", error: "test" },
          "POST",
          headers,
        )
      ).status,
      409,
    );
    const result = {
      title: "Test result",
      x: ["Tautan afiliasi https://example.com/test"],
      threads: ["Tautan afiliasi https://example.com/test"],
      sourceIds: [],
      warnings: ["No approved evidence."],
    };
    const finished = await request(
      "/runner/" + claimed.id + "/finish",
      { claimToken: claimed.claimToken, result },
      "POST",
      headers,
    );
    assert.equal(finished.status, 200);
    assert.equal(
      (
        await request(
          "/runner/" + claimed.id + "/finish",
          { claimToken: claimed.claimToken, result },
          "POST",
          headers,
        )
      ).status,
      409,
    );
    state = (await request("/state", undefined, "GET")).value;
    assert.equal(state.posts.length, 3);
    assert.equal(state.jobs[0].status, "completed");
    const blocked = await app.request(
      "https://public.example/api/state",
      {},
      env,
    );
    assert.equal(blocked.status, 503);
  } finally {
    await mf.dispose();
  }
});
