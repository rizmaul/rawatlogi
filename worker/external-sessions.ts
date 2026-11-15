import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "./index";
import { researchResultSchema, topicSchema } from "../shared/sessions";
import { draftResultSchema, postSchema } from "../shared/model";
import { validateWritingResult } from "../shared/writing";
import { finishBodySchema, validateResearchCitations } from "./session-routes";

// Sessions whose thinking was done by an external AI (e.g. Claude over MCP).
// They are stored as completed sessions with the same validation as gateway jobs.
const sourceSchema = finishBodySchema.shape.sources.unwrap().element;
const common = {
  productId: z.string().min(1),
  topic: topicSchema,
  guidance: z.string().trim().max(4000).default(""),
  author: z.string().trim().min(1).max(80).default("Claude via MCP"),
};
export const externalSessionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("research"),
    ...common,
    searchQuery: z.string().trim().max(300).default(""),
    report: researchResultSchema,
    sources: z.array(sourceSchema).max(12).default([]),
  }),
  z.object({ kind: z.literal("writing"), ...common, draft: draftResultSchema }),
]);

export function registerExternalSessionRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/sessions/external", async (c) => {
    const body = externalSessionSchema.parse(await c.req.json());
    const row = await c.env.DB.prepare(
      "SELECT data FROM records WHERE id=? AND kind='product'",
    )
      .bind(body.productId)
      .first<{ data: string }>();
    if (!row) throw new HTTPException(404, { message: "Product not found" });
    const product = JSON.parse(row.data);
    const time = new Date().toISOString(),
      sessionId = crypto.randomUUID(),
      jobId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    let result: Record<string, unknown>, sources: unknown[] = [];
    if (body.kind === "research") {
      validateResearchCitations(body.report, body.sources);
      result = { ...body.report, author: body.author, searchQuery: body.searchQuery };
      sources = body.sources;
    } else {
      if (!product.confirmed)
        throw new HTTPException(400, {
          message: "Confirm the exact product before saving writing sessions.",
        });
      const approved = await c.env.DB.prepare(
        "SELECT id FROM records WHERE kind='evidence' AND json_extract(data,'$.productId')=? AND json_extract(data,'$.approved')=1",
      )
        .bind(body.productId)
        .all<{ id: string }>();
      let draft;
      try {
        draft = validateWritingResult(
          body.draft,
          product.affiliateUrl,
          approved.results.map((r) => r.id),
        );
      } catch (e) {
        throw new HTTPException(400, { message: (e as Error).message });
      }
      const postIds = [crypto.randomUUID(), crypto.randomUUID()];
      (["x", "threads"] as const).forEach((platform, i) => {
        const data = postSchema.parse({
          productId: body.productId,
          title: draft.title,
          platform,
          segments: draft[platform],
          sourceIds: draft.sourceIds,
          status: "draft",
          warnings: draft.warnings,
          area: draft.area ?? null,
          evidenceLevel: draft.evidenceLevel ?? null,
          series: draft.series ?? null,
        });
        statements.push(
          c.env.DB.prepare(
            "INSERT INTO records(id,kind,data,created_at,updated_at) VALUES(?,'post',?,?,?)",
          ).bind(postIds[i], JSON.stringify(data), time, time),
        );
      });
      result = { postIds, warnings: draft.warnings, author: body.author };
    }
    const payload = {
      kind: body.kind,
      source: "external",
      author: body.author,
      sessionId,
      productId: body.productId,
      topic: body.topic,
      guidance: body.guidance,
      angle: body.topic.question || body.topic.title,
    };
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO jobs(id,status,payload,result,created_at,updated_at) VALUES(?,'completed',?,?,?,?)",
      ).bind(jobId, JSON.stringify(payload), JSON.stringify(result), time, time),
      c.env.DB.prepare(
        "INSERT INTO sessions(id,kind,product_id,topic,guidance,status,progress,job_id,result,sources,created_at,updated_at) VALUES(?,?,?,?,?,'completed','Ready for your review',?,?,?,?,?)",
      ).bind(
        sessionId,
        body.kind,
        body.productId,
        JSON.stringify(body.topic),
        body.guidance,
        jobId,
        JSON.stringify(result),
        JSON.stringify(sources),
        time,
        time,
      ),
    );
    await c.env.DB.batch(statements);
    return c.json({ sessionId, jobId, ...result }, 201);
  });
}
