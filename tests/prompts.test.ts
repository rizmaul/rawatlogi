import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import app from "../worker/index";
import { defaultAPIConfig } from "../shared/ai";
import { cleanPromptOverrides, defaultPrompts, taskInstructions } from "../shared/prompts";

test("prompt overrides drop defaults/blanks, keep placeholders, and expand {{voice}}", () => {
  assert.deepEqual(cleanPromptOverrides({ plan: defaultPrompts.plan, research: "  ", bogus: "x" }), {});
  assert.throws(() => cleanPromptOverrides({ jsonSuffix: "Return JSON." }), /\{\{schema\}\}/);
  const t = taskInstructions({ voice: "MY VOICE", writing: "Writer {{voice}} end" });
  assert.equal(t.writing, "Writer MY VOICE end");
  assert.ok(t.writingEdit.includes("MY VOICE"));
  assert.ok(!taskInstructions().writing.includes("{{voice}}"));
});

test("saved prompts survive API settings saves and reach the runner only", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "prompts",
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-11-01",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    for (const file of ["0001_initial.sql", "0002_sessions_settings.sql"])
      for (const statement of (await readFile(new URL("../migrations/" + file, import.meta.url), "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run();
    const env: any = {
      DB: db,
      APP_MODE: "local",
      LOCAL_RUNNER_TOKEN: "worker-test",
      SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    };
    const request = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST", worker = false) => {
      const r = await app.request(
        "http://localhost/api" + path,
        {
          method,
          headers: { "Content-Type": "application/json", ...(worker ? { Authorization: "Bearer worker-test" } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        env,
      );
      return { status: r.status, data: (await r.json()) as any };
    };
    let prompts = await request("/settings/prompts");
    assert.deepEqual(prompts.data.overrides, {});
    assert.equal(prompts.data.defaults.plan, defaultPrompts.plan);
    const bad = await request("/settings/prompts", { prompts: { jsonSuffix: "no placeholder" } }, "PUT");
    assert.equal(bad.status, 400);
    const saved = await request("/settings/prompts", { prompts: { plan: "Custom plan prompt", research: defaultPrompts.research } }, "PUT");
    assert.deepEqual(saved.data.overrides, { plan: "Custom plan prompt" });
    // Saving API settings (with a key) must not wipe prompt overrides.
    await request("/settings/ai", { ...defaultAPIConfig, apiKey: "fixture-secret" }, "PUT");
    prompts = await request("/settings/prompts");
    assert.deepEqual(prompts.data.overrides, { plan: "Custom plan prompt" });
    const unauthorized = await request("/runner/config?purpose=research");
    assert.equal(unauthorized.status, 401);
    const config = await request("/runner/config?purpose=research", undefined, "GET", true);
    assert.equal(config.data.prompts.plan, "Custom plan prompt");
    assert.equal(config.data.prompts.research, defaultPrompts.research);
    assert.equal(config.data.jsonSuffix, defaultPrompts.jsonSuffix);
    const publicSettings = await request("/settings/ai");
    assert.equal(publicSettings.data.apiKey, undefined);
    assert.equal(publicSettings.data.hasApiKey, true);
  } finally {
    await mf.dispose();
  }
});
