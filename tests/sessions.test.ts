import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import app from "../worker/index";
import { defaultAPIConfig } from "../shared/ai";
test("encrypted settings, generated topics, independent session lifecycle and source validation", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "sessions",
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-11-01",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    for (const file of ["0001_initial.sql", "0002_sessions_settings.sql"])
      for (const statement of (
        await readFile(
          new URL("../migrations/" + file, import.meta.url),
          "utf8",
        )
      )
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
    const request = async (
      path: string,
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
      worker = false,
    ) => {
      const r = await app.request(
        "http://localhost/api" + path,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(worker ? { Authorization: "Bearer worker-test" } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        env,
      );
      return { status: r.status, data: (await r.json()) as any };
    };
    let settings = await request("/settings/ai");
    assert.equal(settings.data.hasApiKey, false);
    settings = await request(
      "/settings/ai",
      { ...defaultAPIConfig, apiKey: "fixture-secret" },
      "PUT",
    );
    assert.equal(settings.status, 200);
    assert.equal(settings.data.hasApiKey, true);
    assert.equal(
      JSON.stringify(settings.data).includes("fixture-secret"),
      false,
    );
    const stored = await db
      .prepare("SELECT data FROM app_settings WHERE id='ai'")
      .first<{ data: string }>();
    assert.equal(stored!.data.includes("fixture-secret"), false);
    await request("/settings/ai", { ...defaultAPIConfig, apiKey: "" }, "PUT");
    assert.equal(
      (await request("/runner/config", undefined, "GET", true)).data.apiKey,
      "fixture-secret",
    );
    assert.equal((await request("/runner/config")).status, 401);
    // Legacy settings inherit the exact existing provider/model options, not defaults.
    let content = (await request('/runner/config?purpose=content', undefined, 'GET', true)).data;
    assert.equal(content.model, defaultAPIConfig.model);
    assert.equal(content.apiKey, 'fixture-secret');
    settings = await request('/settings/ai', {...defaultAPIConfig, apiKey:'', content:{model:'premium-fixture',effort:'high',protocol:'chat-completions',outputFormat:'json_object',maxOutputTokens:8192}}, 'PUT');
    assert.equal(settings.data.content.model,'premium-fixture');
    assert.equal(JSON.stringify(settings.data).includes('fixture-secret'),false);
    assert.equal((await request('/runner/config',undefined,'GET',true)).data.model,defaultAPIConfig.model);
    content = (await request('/runner/config?purpose=content',undefined,'GET',true)).data;
    assert.equal(content.model,'premium-fixture');assert.equal(content.effort,'high');assert.equal(content.protocol,'chat-completions');assert.equal(content.apiKey,'fixture-secret');
    await request('/settings/ai',{...defaultAPIConfig,apiKey:'',model:'research-updated'},'PUT');
    assert.equal((await request('/settings/ai')).data.content.model,'premium-fixture');
    const contentTest=await request('/settings/ai/test',{purpose:'content'});
    assert.equal(contentTest.status,202);
    let testJob=(await request('/runner/claim',{},'POST',true)).data.job;
    assert.equal(testJob.payload.modelPurpose,'content');
    await request('/runner/'+testJob.id+'/finish',{claimToken:testJob.claimToken,result:{ok:true,model:'premium-fixture',effort:'high'},execution:{purpose:'content',model:'premium-fixture',effort:'high'}},'POST',true);
    assert.equal((await request('/runner/config?purpose=wrong',undefined,'GET',true)).status,400);
    const product = (
      await request("/records/product", {
        name: "Test moisturizer",
        category: "Skincare",
        affiliateUrl: "https://example.com/product",
        confirmed: true,
      })
    ).data;
    const topicsJob = await request("/topics/generate", {
      kind: "research",
      productId: product.id,
      guidance: "Focus on limitations",
    });
    assert.equal(topicsJob.status, 202);
    let job = (await request("/runner/claim", {}, "POST", true)).data.job;
    assert.equal(job.payload.kind, "questions");
    assert.equal(job.payload.purpose, "research");
    assert.equal(
      (
        await request(
          "/runner/" + job.id + "/finish",
          {
            claimToken: job.claimToken,
            result: {
              topics: [
                {
                  title: "What can ingredient studies establish?",
                  question: "Question",
                  searchQuery: "ceramide topical trial",
                  rationale: "Relevance",
                },
              ],
              warnings: [],
            },
          },
          "POST",
          true,
        )
      ).status,
      200,
    );
    const sessions = await request("/sessions", {
      kind: "research",
      productId: product.id,
      topics: [
        { title: "First research topic" },
        { title: "Second research topic" },
      ],
    });
    assert.equal(sessions.status, 202);
    assert.equal(sessions.data.ids.length, 2);
    let state = (await request("/state")).data;
    assert.equal(state.sessions.length, 2);
    assert.equal(
      state.sessions.every((s: any) => s.status === "queued"),
      true,
    );
    assert.equal(JSON.stringify(state).includes("fixture-secret"), false);
    job = (await request("/runner/claim", {}, "POST", true)).data.job;
    assert.equal(job.payload.kind, "research");
    await request(
      "/runner/" + job.id + "/heartbeat",
      {
        claimToken: job.claimToken,
        progress: "Analyzing retrieved publications",
      },
      "POST",
      true,
    );
    state = (await request("/state")).data;
    assert.equal(
      state.sessions.find((s: any) => s.jobId === job.id).status,
      "in_progress",
    );
    const report = {
      summary: "No relevant evidence retrieved.",
      findings: [
        {
          claim: "Uncertain",
          sourceIds: ["invented"],
          confidence: "uncertain",
          limitations: "No source",
        },
      ],
      nextSteps: [],
      warnings: [],
    };
    assert.equal(
      (
        await request(
          "/runner/" + job.id + "/finish",
          { claimToken: job.claimToken, result: report, sources: [] },
          "POST",
          true,
        )
      ).status,
      400,
    );
    report.findings[0].sourceIds = [];
    assert.equal(
      (
        await request(
          "/runner/" + job.id + "/finish",
          { claimToken: job.claimToken, result: report, sources: [] },
          "POST",
          true,
        )
      ).status,
      200,
    );
    state = (await request("/state")).data;
    assert.equal(
      state.sessions.filter((s: any) => s.status === "completed").length,
      1,
    );
    assert.equal(
      state.evidence.length,
      0,
      "Research must not auto-approve or create claims",
    );
    job = (await request("/runner/claim", {}, "POST", true)).data.job;
    await request(
      "/runner/" + job.id + "/finish",
      { claimToken: job.claimToken, error: "Test gateway failure" },
      "POST",
      true,
    );
    state = (await request("/state")).data;
    const failed = state.sessions.find((s: any) => s.jobId === job.id);
    assert.equal(failed.status, "failed");
    assert.equal(
      (await request("/sessions/" + failed.id + "/retry", {})).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/runner/" + job.id + "/finish",
          { claimToken: job.claimToken, result: report },
          "POST",
          true,
        )
      ).status,
      409,
    );
    assert.equal(
      (await request("/records/product/" + product.id, undefined, "DELETE"))
        .status,
      400,
    );
    job = (await request("/runner/claim", {}, "POST", true)).data.job;
    await request(
      "/runner/" + job.id + "/finish",
      { claimToken: job.claimToken, result: report, sources: [] },
      "POST",
      true,
    );
    const writing = await request("/sessions", {
      kind: "writing",
      productId: product.id,
      topics: [{ title: "Educational affiliate introduction" }],
    });
    assert.equal(writing.status, 202);
    job = (await request("/runner/claim", {}, "POST", true)).data.job;
    assert.equal(job.payload.kind, "writing");
    const drafted = await request(
      "/runner/" + job.id + "/finish",
      {
        claimToken: job.claimToken,
        result: {
          title: "Educational post",
          x: ["Tautan afiliasi https://example.com/product"],
          threads: ["Tautan afiliasi https://example.com/product"],
          sourceIds: [],
          warnings: ["No approved claims"],
        },
        execution: {purpose:'content',model:'premium-fixture',effort:'high'},
      },
      "POST",
      true,
    );
    assert.equal(drafted.status, 200);
    state = (await request("/state")).data;
    assert.equal(state.posts.length, 2);
    assert.equal(state.sessions.find((s:any)=>s.kind==='writing').result.execution.model,'premium-fixture');
    assert.equal(JSON.parse(state.jobs.find((j:any)=>j.id===job.id).result).execution.purpose,'content');
    assert.equal(
      state.sessions.find((s: any) => s.kind === "writing").status,
      "completed",
    );
    const connection = await request("/settings/ai/test", {});
    assert.equal(connection.status, 202);
    job = (await request("/runner/claim", {}, "POST", true)).data.job;
    assert.equal(job.payload.kind, "connection-test");
    assert.equal(
      (
        await request(
          "/runner/" + job.id + "/finish",
          {
            claimToken: job.claimToken,
            result: { ok: true, model: "deepseek-v4.1-flash", effort: "max" },
          },
          "POST",
          true,
        )
      ).status,
      200,
    );
    await request(
      "/settings/ai",
      { ...defaultAPIConfig, clearApiKey: true },
      "PUT",
    );
    assert.equal((await request("/settings/ai")).data.hasApiKey, false);
  } finally {
    await mf.dispose();
  }
});
