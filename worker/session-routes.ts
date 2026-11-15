import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "./index";
import {
  questionsResultSchema,
  researchResultSchema,
  sessionRequestSchema,
  type TopicSession,
} from "../shared/sessions";
import { publicAIConfig, readAIConfig, saveAIConfig, readPromptOverrides, savePromptOverrides } from "./ai-settings";
import { defaultPrompts, promptInfo, taskInstructions } from "../shared/prompts";
import { executionSchema } from "../shared/ai";
const stamp = () => new Date().toISOString();
export async function readSessions(db: D1Database): Promise<TopicSession[]> {
  const rows = await db
    .prepare("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 500")
    .all<any>();
  return rows.results.map((r) => ({
    id: r.id,
    kind: r.kind,
    productId: r.product_id,
    topic: JSON.parse(r.topic),
    guidance: r.guidance,
    status: r.status,
    progress: r.progress,
    jobId: r.job_id,
    result: r.result ? JSON.parse(r.result) : null,
    sources: JSON.parse(r.sources),
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
async function snapshot(env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM records WHERE id=? AND kind='product'",
  )
    .bind(id)
    .first<any>();
  if (!row) throw new HTTPException(404, { message: "Product not found" });
  const product = {
    id: row.id,
    data: JSON.parse(row.data),
    version: row.version,
  };
  const rows = await env.DB.prepare(
    "SELECT * FROM records WHERE kind='evidence' AND json_extract(data,'$.productId')=? AND json_extract(data,'$.approved')=1",
  )
    .bind(id)
    .all<any>();
  return {
    product,
    evidence: rows.results.map((r) => ({
      id: r.id,
      data: JSON.parse(r.data),
      version: r.version,
    })),
  };
}
export function registerSessionRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/settings/ai", async (c) => c.json(await publicAIConfig(c.env)));
  app.put("/api/settings/ai", async (c) =>
    c.json(await saveAIConfig(c.env, await c.req.json())),
  );
  app.post("/api/settings/ai/test", async (c) => {
    const { purpose } = z.object({ purpose: z.enum(["research", "content"]).default("research") }).parse(await c.req.json());
    const config = await readAIConfig(c.env, purpose);
    if (!config.apiKey)
      throw new HTTPException(400, {
        message: "Add an API key before testing the connection.",
      });
    const id = crypto.randomUUID(),
      time = stamp();
    await c.env.DB.prepare(
      "INSERT INTO jobs(id,status,payload,created_at,updated_at) VALUES(?,'queued',?,?,?)",
    )
      .bind(
        id,
        JSON.stringify({
          kind: "connection-test",
          modelPurpose: purpose,
          productId: "",
          angle: "API connection test",
        }),
        time,
        time,
      )
      .run();
    return c.json({ id, status: "queued" }, 202);
  });
  app.get("/api/settings/prompts", async (c) =>
    c.json({ overrides: await readPromptOverrides(c.env), defaults: defaultPrompts, info: promptInfo }),
  );
  app.put("/api/settings/prompts", async (c) => {
    const { prompts } = z.object({ prompts: z.record(z.string()) }).parse(await c.req.json());
    return c.json({ overrides: await savePromptOverrides(c.env, prompts) });
  });
  app.get("/api/runner/config", async (c) => {
    const purpose = z.enum(["research", "content"]).parse(c.req.query("purpose") ?? "research");
    const config = await readAIConfig(c.env, purpose);
    const prompts = taskInstructions(await readPromptOverrides(c.env));
    return c.json({ ...config, jsonSuffix: prompts.jsonSuffix, prompts });
  });
  app.get("/api/sessions", async (c) => c.json(await readSessions(c.env.DB)));
  app.post("/api/topics/generate", async (c) => {
    const request = z
      .object({
        kind: z.enum(["research", "writing"]),
        productId: z.string(),
        guidance: z.string().trim().max(4000).default(""),
      })
      .parse(await c.req.json());
    const config = await readAIConfig(c.env);
    if (!config.apiKey)
      throw new HTTPException(400, {
        message: "Add an API key in Workspace settings first.",
      });
    const context = await snapshot(c.env, request.productId);
    const id = crypto.randomUUID(),
      time = stamp();
    await c.env.DB.prepare(
      "INSERT INTO jobs(id,status,payload,created_at,updated_at) VALUES(?,'queued',?,?,?)",
    )
      .bind(
        id,
        JSON.stringify({
          ...request,
          ...context,
          kind: "questions",
          purpose: request.kind,
          angle: request.guidance || "Suggest product topics",
        }),
        time,
        time,
      )
      .run();
    return c.json({ id, status: "queued" }, 202);
  });
  app.post("/api/sessions", async (c) => {
    const request = sessionRequestSchema.parse(await c.req.json());
    const config = await readAIConfig(c.env);
    if (!config.apiKey)
      throw new HTTPException(400, {
        message: "Add an API key in Workspace settings first.",
      });
    const context = await snapshot(c.env, request.productId);
    if (request.kind === "writing" && !context.product.data.confirmed)
      throw new HTTPException(400, {
        message: "Confirm the exact product before starting writing sessions.",
      });
    const time = stamp(),
      ids: string[] = [],
      statements: D1PreparedStatement[] = [];
    for (const topic of request.topics) {
      const id = crypto.randomUUID(),
        jobId = crypto.randomUUID();
      ids.push(id);
      const payload = {
        ...context,
        kind: request.kind,
        sessionId: id,
        productId: request.productId,
        topic,
        guidance: request.guidance,
        angle: topic.question || topic.title,
      };
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO jobs(id,status,payload,created_at,updated_at) VALUES(?,'queued',?,?,?)",
        ).bind(jobId, JSON.stringify(payload), time, time),
      );
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO sessions(id,kind,product_id,topic,guidance,status,progress,job_id,created_at,updated_at) VALUES(?,?,?,?,?,'queued','Waiting for API worker',?,?,?)",
        ).bind(
          id,
          request.kind,
          request.productId,
          JSON.stringify(topic),
          request.guidance,
          jobId,
          time,
          time,
        ),
      );
    }
    await c.env.DB.batch(statements);
    return c.json({ ids, status: "queued" }, 202);
  });
  app.post("/api/sessions/:id/retry", async (c) => {
    const session = await c.env.DB.prepare(
      "SELECT job_id FROM sessions WHERE id=? AND status='failed'",
    )
      .bind(c.req.param("id"))
      .first<{ job_id: string }>();
    if (!session)
      throw new HTTPException(400, {
        message: "Only a failed session can be retried.",
      });
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE jobs SET status='queued',error=NULL,claim_token=NULL,updated_at=? WHERE id=? AND status='failed'",
      ).bind(stamp(), session.job_id),
      c.env.DB.prepare(
        "UPDATE sessions SET status='queued',progress='Waiting for API worker',error=NULL,updated_at=? WHERE id=?",
      ).bind(stamp(), c.req.param("id")),
    ]);
    return c.json({ ok: true });
  });
  app.post("/api/runner/:id/heartbeat", async (c) => {
    const body = z
      .object({ claimToken: z.string(), progress: z.string().max(200) })
      .parse(await c.req.json());
    const result = await c.env.DB.prepare(
      "UPDATE jobs SET updated_at=? WHERE id=? AND status='running' AND claim_token=?",
    )
      .bind(stamp(), c.req.param("id"), body.claimToken)
      .run();
    if (!result.meta.changes)
      throw new HTTPException(409, { message: "Job ownership expired" });
    await c.env.DB.prepare(
      "UPDATE sessions SET status='in_progress',progress=?,updated_at=? WHERE job_id=?",
    )
      .bind(body.progress, stamp(), c.req.param("id"))
      .run();
    return c.json({ ok: true });
  });
}
export const finishBodySchema = z.object({
  claimToken: z.string(),
  result: z.unknown().optional(),
  error: z.string().max(2000).optional(),
  sources: z
    .array(
      z
        .object({
          title: z.string().max(2000),
          sourceId: z.string().max(150),
          url: z
            .string()
            .url()
            .refine((u) => /^https?:/.test(u)),
          year: z.string().max(20),
          authors: z.string().max(4000),
          abstract: z.string().max(40000),
          studyType: z.string().max(1000),
          fullTextUrl: z.string().nullable().optional(),
        })
        .strict(),
    )
    .max(12)
    .optional(),
  usage: z.unknown().optional(),
  execution: executionSchema.optional(),
});
// Findings may cite only supplied sources; "supported" needs at least one.
export function validateResearchCitations(
  result: z.infer<typeof researchResultSchema>,
  sources: { sourceId: string }[],
) {
  const allowed = new Set(sources.map((s) => s.sourceId));
  for (const finding of result.findings) {
    if (finding.sourceIds.some((id) => !allowed.has(id)))
      throw new HTTPException(400, {
        message: "Research output cited a source that was not retrieved.",
      });
    if (finding.confidence === "supported" && !finding.sourceIds.length)
      throw new HTTPException(400, {
        message: "Supported findings require retrieved sources.",
      });
  }
}
export async function finishSpecial(
  env: Env,
  row: { id: string },
  payload: any,
  body: z.infer<typeof finishBodySchema>,
) {
  const time = stamp();
  let result: unknown;
  if (payload.kind === "connection-test")
    result = z
      .object({ ok: z.literal(true), model: z.string(), effort: z.string() })
      .strict()
      .parse(body.result);
  else if (payload.kind === "questions")
    result = questionsResultSchema.parse(body.result);
  else {
    result = researchResultSchema.parse(body.result);
    validateResearchCitations(result as z.infer<typeof researchResultSchema>, body.sources ?? []);
  }
  const statements: D1PreparedStatement[] = [];
  if (payload.sessionId)
    statements.push(
      env.DB.prepare(
        "UPDATE sessions SET status='completed',progress='Ready for your review',result=?,sources=?,error=NULL,updated_at=? WHERE job_id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='running' AND claim_token=?)",
      ).bind(
        JSON.stringify({ ...(result as any), ...(body.execution ? { execution: body.execution } : {}) }),
        JSON.stringify(body.sources ?? []),
        time,
        row.id,
        row.id,
        body.claimToken,
      ),
    );
  statements.push(
    env.DB.prepare(
      "UPDATE jobs SET status='completed',result=?,claim_token=NULL,updated_at=? WHERE id=? AND status='running' AND claim_token=?",
    ).bind(
      JSON.stringify({ ...(result as any), usage: body.usage ?? null, ...(body.execution ? { execution: body.execution } : {}) }),
      time,
      row.id,
      body.claimToken,
    ),
  );
  await env.DB.batch(statements);
  return { ok: true };
}
