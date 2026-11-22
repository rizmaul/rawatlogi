import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "./index";
import { draftResultSchema, postSchema } from "../shared/model";
import { validateWritingResult } from "../shared/writing";

export function registerDraftRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/drafts", async (c) => {
    const body = z
      .object({ productId: z.string().min(1), draft: draftResultSchema })
      .parse(await c.req.json());
    const row = await c.env.DB.prepare(
      "SELECT data FROM records WHERE id=? AND kind='product'",
    )
      .bind(body.productId)
      .first<{ data: string }>();
    if (!row) throw new HTTPException(404, { message: "Product not found" });
    const product = JSON.parse(row.data);
    const time = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    if (!product.confirmed)
      throw new HTTPException(400, {
        message: "Confirm the exact product before saving drafts.",
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
    await c.env.DB.batch(statements);
    return c.json({ postIds, warnings: draft.warnings }, 201);
  });
}
