import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z, ZodError } from "zod";
import { ProviderError } from "../shared/ai";
import {
  readSessions,
  registerSessionRoutes,
  finishBodySchema,
  finishSpecial,
} from "./session-routes";
import { imageContentType, MAX_IMAGE_BYTES } from "../shared/images";
import { isLocalRequest } from "./auth";
import { registerExternalSessionRoutes } from "./external-sessions";
import { registerMcp } from "./mcp";
import {
  productSchema,
  evidenceSchema,
  postSchema,
  draftResultSchema,
  type Product,
  type Evidence,
  type Post,
  type RecordItem,
} from "../shared/model";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_MODE: string;
  LOCAL_RUNNER_TOKEN: string;
  OPENAI_API_KEY?: string;
  SETTINGS_ENCRYPTION_KEY?: string;
  BUCKET: R2Bucket;
  MCP_TOKEN?: string;
  // Set only by the MCP handler on internal sub-requests; never present on real requests.
  MCP_INTERNAL?: boolean;
};
type Row = {
  id: string;
  kind: string;
  data: string;
  version: number;
  created_at: string;
  updated_at: string;
};
const app = new Hono<{ Bindings: Env }>();
const now = () => new Date().toISOString();
const item = <T>(r: Row): RecordItem<T> => ({
  id: r.id,
  data: JSON.parse(r.data),
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
async function get<T>(db: D1Database, id: string, kind: string) {
  const r = await db
    .prepare("SELECT * FROM records WHERE id=? AND kind=?")
    .bind(id, kind)
    .first<Row>();
  if (!r) throw new HTTPException(404, { message: "Record not found" });
  return item<T>(r);
}
async function list<T>(db: D1Database, kind: string) {
  const r = await db
    .prepare("SELECT * FROM records WHERE kind=? ORDER BY updated_at DESC")
    .bind(kind)
    .all<Row>();
  return r.results.map(item<T>);
}
const fail = (message: string) => {
  throw new HTTPException(400, { message });
};
app.onError((err, c) => {
  if (err instanceof ProviderError) return c.json({ error: err.message }, 502);
  if (err instanceof ZodError)
    return c.json(
      {
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status);
  console.error(err.message);
  return c.json(
    { error: "The request failed. Check the local API terminal." },
    500,
  );
});
// Gateway generation needs the local Node worker, so these routes are local-only.
const LOCAL_ONLY = [
  /^POST \/api\/jobs$/,
  /^POST \/api\/jobs\/[^/]+\/retry$/,
  /^POST \/api\/topics\/generate$/,
  /^POST \/api\/sessions$/,
  /^POST \/api\/sessions\/[^/]+\/retry$/,
  /^POST \/api\/settings\/ai\/test$/,
  /^[A-Z]+ \/api\/runner\//,
];
app.use("/api/*", async (c, next) => {
  const mode = c.env.APP_MODE;
  if (mode !== "local" && mode !== "production")
    return c.json({ error: "APP_MODE must be local or production." }, 503);
  if (
    mode === "production" &&
    LOCAL_ONLY.some((r) => r.test(`${c.req.method} ${c.req.path}`))
  )
    return c.json(
      {
        error:
          "Gateway generation runs only in the local app. In the cloud, use MCP tools (save_research_session / save_writing_session).",
      },
      400,
    );
  c.header("Cache-Control", "no-store");
  if (c.env.MCP_INTERNAL === true) return next();
  if (mode === "local") {
    if (!isLocalRequest(c.req.url))
      return c.json({ error: "Local mode accepts loopback hosts only." }, 503);
    const origin = c.req.header("origin");
    if (
      origin &&
      ![
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8787",
        "http://127.0.0.1:8787",
      ].includes(origin)
    )
      return c.json({ error: "Origin not allowed" }, 403);
  } else {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin)
      return c.json({ error: "Origin not allowed" }, 403);
  }
  if (c.req.header("sec-fetch-site") === "cross-site")
    return c.json({ error: "Cross-site requests are not allowed" }, 403);
  await next();
});
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    mode: c.env.APP_MODE,
    provider: "api",
    timeZone: "Asia/Jakarta",
  }),
);
app.post("/api/images", async (c) => {
  if (!c.env.BUCKET)
    throw new HTTPException(503, {
      message: "Image storage is not active. Restart the local API.",
    });
  const declared = Number(c.req.header("content-length") || 0);
  if (declared > MAX_IMAGE_BYTES)
    throw new HTTPException(413, {
      message: "Choose an image smaller than 5 MB.",
    });
  const reader = c.req.raw.body?.getReader();
  if (!reader) fail("Choose an image to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES)
        throw new HTTPException(413, {
          message: "Choose an image smaller than 5 MB.",
        });
      chunks.push(value);
    }
  } finally {
    await reader!.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = imageContentType(bytes);
  if (!contentType)
    throw new HTTPException(415, {
      message: "Use a JPEG, PNG, or WebP image.",
    });
  const id = crypto.randomUUID();
  await c.env.BUCKET.put("products/" + id, bytes, {
    httpMetadata: { contentType },
    customMetadata: { uploadedAt: now() },
  });
  return c.json({ id, contentType, size }, 201);
});
app.get("/api/images/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const object = await c.env.BUCKET?.get("products/" + id);
  if (!object) throw new HTTPException(404, { message: "Image not found" });
  c.header(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(object.body);
});
// True when a product photo or any post segment still uses this image.
async function imageReferenced(db: D1Database, id: string) {
  const row = await db
    .prepare(
      "SELECT id FROM records WHERE (kind='product' AND json_extract(data,'$.imageId')=?1) OR (kind='post' AND EXISTS (SELECT 1 FROM json_each(json_extract(data,'$.segmentImages')) WHERE value=?1)) LIMIT 1",
    )
    .bind(id)
    .first();
  return !!row;
}
// Delete images that no record references any more (e.g. replaced segment images).
async function cleanupImages(env: Env, ids: (string | null | undefined)[]) {
  for (const id of new Set(ids.filter((v): v is string => !!v)))
    if (!(await imageReferenced(env.DB, id)))
      await env.BUCKET?.delete("products/" + id);
}
app.delete("/api/images/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  if (await imageReferenced(c.env.DB, id)) return c.json({ kept: true });
  await c.env.BUCKET?.delete("products/" + id);
  return c.json({ deleted: true });
});
app.get("/api/state", async (c) => {
  const [products, evidence, posts, jobs] = await Promise.all([
    list<Product>(c.env.DB, "product"),
    list<Evidence>(c.env.DB, "evidence"),
    list<Post>(c.env.DB, "post"),
    c.env.DB.prepare(
      "SELECT id,status,created_at,updated_at,error,result,payload FROM jobs ORDER BY created_at DESC LIMIT 30",
    ).all<{
      id: string;
      status: string;
      created_at: string;
      updated_at: string;
      error: string | null;
      result: string | null;
      payload: string;
    }>(),
  ]);
  return c.json({
    products,
    evidence,
    posts,
    sessions: await readSessions(c.env.DB),
    jobs: jobs.results.map((j) => ({
      id: j.id,
      status: j.status,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
      error: j.error,
      result: j.result,
      payload: JSON.parse(j.payload),
    })),
  });
});
app.get("/api/export", async (c) => {
  const records = await c.env.DB.prepare(
    "SELECT * FROM records ORDER BY created_at",
  ).all();
  const jobs = await c.env.DB.prepare(
    "SELECT id,status,payload,result,error,created_at,updated_at FROM jobs",
  ).all();
  c.header(
    "Content-Disposition",
    'attachment; filename="rawatlogi-backup.json"',
  );
  return c.json({
    schemaVersion: 2,
    exportedAt: now(),
    records: records.results,
    jobs: jobs.results,
    sessions: await readSessions(c.env.DB),
  });
});
const schemas = {
  product: productSchema,
  evidence: evidenceSchema,
  post: postSchema,
};
async function validateLinks(
  db: D1Database,
  kind: string,
  data: any,
  bucket?: R2Bucket,
) {
  if (kind === "product") {
    if (
      data.imageId &&
      (!bucket || !(await bucket.head("products/" + data.imageId)))
    )
      fail("The selected image is unavailable. Upload it again before saving.");
    return;
  }
  const brandPost = kind === "post" && !data.productId;
  const p = brandPost
    ? null
    : await get<Product>(db, data.productId, "product");
  if (kind === "evidence") return;
  for (const imageId of data.segmentImages ?? [])
    if (imageId && (!bucket || !(await bucket.head("products/" + imageId))))
      fail("A segment image is unavailable. Upload it again before saving.");
  if (brandPost) {
    if (data.sourceIds.length)
      fail(
        "Brand posts have no product, so they cannot cite product evidence.",
      );
    if (data.segments.some((s: string) => /https?:\/\/\S*shopee/i.test(s)))
      fail(
        "Brand posts cannot carry an affiliate link. Link the post to its product instead.",
      );
    return;
  }
  if (!p!.data.confirmed && data.status !== "draft")
    fail("Confirm the exact product and variant before approving content.");
  for (const id of data.sourceIds) {
    const source = await get<Evidence>(db, id, "evidence");
    if (source.data.productId !== data.productId)
      fail("A source belongs to a different product.");
    if (data.status !== "draft" && !source.data.approved)
      fail("A linked claim is not approved. Review the evidence first.");
  }
}
app.post("/api/records/:kind", async (c) => {
  const kind = c.req.param("kind") as keyof typeof schemas;
  if (!schemas[kind]) throw new HTTPException(404);
  const data = schemas[kind].parse(await c.req.json());
  await validateLinks(c.env.DB, kind, data, c.env.BUCKET);
  const id = crypto.randomUUID(),
    stamp = now();
  await c.env.DB.prepare(
    "INSERT INTO records(id,kind,data,created_at,updated_at) VALUES(?,?,?,?,?)",
  )
    .bind(id, kind, JSON.stringify(data), stamp, stamp)
    .run();
  return c.json(await get(c.env.DB, id, kind), 201);
});
app.put("/api/records/:kind/:id", async (c) => {
  const kind = c.req.param("kind") as keyof typeof schemas;
  if (!schemas[kind]) throw new HTTPException(404);
  const body = z
    .object({ version: z.number().int().positive(), data: z.unknown() })
    .parse(await c.req.json());
  const previous = await get<any>(c.env.DB, c.req.param("id"), kind),
    data = schemas[kind].parse(body.data);
  if (previous.version !== body.version)
    throw new HTTPException(409, {
      message: "This record changed. Reload before saving.",
    });
  if (kind !== "product" && previous.data.productId !== (data as any).productId)
    fail("Product links cannot be changed. Create a separate record.");
  if (kind === "post" && previous.data.status === "published")
    fail("Published records are read-only. Create a new draft for revisions.");
  await validateLinks(c.env.DB, kind, data, c.env.BUCKET);
  if (kind === "post" && (data as Post).status === "published")
    (data as Post).publishedAt = now();
  const result = await c.env.DB.prepare(
    "UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND kind=? AND version=?",
  )
    .bind(JSON.stringify(data), now(), previous.id, kind, body.version)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message: "Record changed; reload before saving.",
    });
  if (kind === "post")
    await cleanupImages(
      c.env,
      (previous.data.segmentImages ?? []).filter(
        (id: string | null) => !(data as Post).segmentImages.includes(id),
      ),
    );
  // A photo-only change does not alter the claims in an approved text post.
  const productContentChanged =
    kind === "product" &&
    Object.keys(data).some(
      (key) =>
        key !== "imageId" &&
        JSON.stringify((data as any)[key]) !==
          JSON.stringify(previous.data[key]),
    );
  if (kind === "evidence" || productContentChanged) {
    const posts = await list<Post>(c.env.DB, "post");
    const affected = posts.filter(
      (p) =>
        p.data.status === "approved" &&
        (kind === "evidence"
          ? p.data.sourceIds.includes(previous.id)
          : p.data.productId === previous.id),
    );
    if (affected.length)
      await c.env.DB.batch(
        affected.map((p) =>
          c.env.DB.prepare(
            "UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?",
          ).bind(
            JSON.stringify({
              ...p.data,
              status: "draft",
              warnings: [
                ...p.data.warnings,
                `Linked ${kind === "evidence" ? "evidence" : "product details"} changed. Review this draft again.`,
              ],
            }),
            now(),
            p.id,
            p.version,
          ),
        ),
      );
  }
  return c.json(await get(c.env.DB, previous.id, kind));
});
app.delete("/api/records/:kind/:id", async (c) => {
  const kind = c.req.param("kind"),
    id = c.req.param("id");
  if (!Object.keys(schemas).includes(kind)) throw new HTTPException(404);
  const record = await get<any>(c.env.DB, id, kind);
  if (kind === "product") {
    const session = await c.env.DB.prepare(
      "SELECT id FROM sessions WHERE product_id=? LIMIT 1",
    )
      .bind(id)
      .first();
    if (session)
      fail("This product has linked sessions. Preserve it for traceability.");
    const [e, p] = await Promise.all([
      list<Evidence>(c.env.DB, "evidence"),
      list<Post>(c.env.DB, "post"),
    ]);
    if (
      e.some((r) => r.data.productId === id) ||
      p.some((r) => r.data.productId === id)
    )
      fail(
        "This product has linked research or posts. Preserve it for traceability.",
      );
  }
  if (
    kind === "evidence" &&
    (await list<Post>(c.env.DB, "post")).some((p) =>
      p.data.sourceIds.includes(id),
    )
  )
    fail(
      "This evidence is linked to a post. Keep its history; revoke approval instead.",
    );
  if (kind === "post" && record.data.status === "published")
    fail("Published records cannot be deleted.");
  await c.env.DB.prepare("DELETE FROM records WHERE id=? AND kind=?")
    .bind(id, kind)
    .run();
  if (kind === "post")
    await cleanupImages(c.env, record.data.segmentImages ?? []);
  return c.json({ ok: true });
});
app.get("/api/research/search", async (c) => {
  const query = z.string().trim().min(3).max(300).parse(c.req.query("q"));
  const u = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  u.search = new URLSearchParams({
    query,
    format: "json",
    resultType: "core",
    pageSize: "12",
    sort: "RELEVANCE",
  }).toString();
  try {
    const response = await fetch(u, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Research service unavailable");
    const data = (await response.json()) as any;
    const strip = (v: unknown) =>
      String(v ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return c.json({
      count: data.hitCount,
      results: (data.resultList?.result ?? []).map((r: any) => ({
        title: strip(r.title),
        sourceId: `${r.source}:${r.id}`,
        year: r.pubYear ?? "",
        authors: strip(r.authorString),
        abstract: strip(r.abstractText),
        studyType: (r.pubTypeList?.pubType ?? []).join(", "),
        url: r.pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pmid)}/`
          : `https://europepmc.org/article/${encodeURIComponent(r.source)}/${encodeURIComponent(r.id)}`,
        fullTextUrl: r.pmcid
          ? `https://europepmc.org/articles/${encodeURIComponent(r.pmcid)}`
          : null,
      })),
    });
  } catch (error) {
    console.error(
      "Europe PMC retrieval failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    try {
      const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
      const searchUrl = new URL(base + "esearch.fcgi");
      searchUrl.search = new URLSearchParams({
        db: "pubmed",
        term: query,
        retmode: "json",
        retmax: "12",
        tool: "rawatlogi-personal-studio",
      }).toString();
      const found = await fetch(searchUrl, {
        signal: AbortSignal.timeout(15000),
      });
      if (!found.ok) throw new Error("PubMed search unavailable");
      const search = (await found.json()) as any;
      const ids: string[] = search.esearchresult?.idlist ?? [];
      if (!ids.length)
        return c.json({
          count: Number(search.esearchresult?.count ?? 0),
          provider: "PubMed",
          results: [],
        });
      const summaryUrl = new URL(base + "esummary.fcgi");
      summaryUrl.search = new URLSearchParams({
        db: "pubmed",
        id: ids.join(","),
        retmode: "json",
        tool: "rawatlogi-personal-studio",
      }).toString();
      const fetched = await fetch(summaryUrl, {
        signal: AbortSignal.timeout(15000),
      });
      if (!fetched.ok) throw new Error("PubMed summaries unavailable");
      const summaries = (await fetched.json()) as any;
      return c.json({
        count: Number(search.esearchresult?.count ?? 0),
        provider: "PubMed (metadata fallback)",
        results: ids.map((id) => {
          const r = summaries.result[id];
          return {
            title: String(r.title ?? "Untitled").replace(/<[^>]*>/g, " "),
            sourceId: `MED:${id}`,
            year: String(r.pubdate ?? "").slice(0, 4),
            authors: (r.authors ?? []).map((a: any) => a.name).join(", "),
            abstract: "",
            studyType: (r.pubtype ?? []).join(", "),
            url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
            fullTextUrl: null,
          };
        }),
      });
    } catch {
      return c.json(
        {
          error:
            "Research services could not be reached. Try again or add a publication URL manually.",
        },
        502,
      );
    }
  }
});
app.post("/api/jobs", async (c) => {
  const request = z
    .object({
      productId: z.string(),
      angle: z.string().trim().min(3).max(2000),
    })
    .parse(await c.req.json());
  const product = await get<Product>(c.env.DB, request.productId, "product");
  if (!product.data.confirmed) fail("Confirm the product and variant first.");
  const evidence = (await list<Evidence>(c.env.DB, "evidence")).filter(
    (e) => e.data.productId === product.id && e.data.approved,
  );
  const running = await c.env.DB.prepare(
    "SELECT id FROM jobs WHERE status IN ('queued','running') AND json_extract(payload,'$.productId')=?",
  )
    .bind(product.id)
    .first();
  if (running)
    throw new HTTPException(409, {
      message: "A draft job for this product is already queued or running.",
    });
  const id = crypto.randomUUID(),
    stamp = now();
  await c.env.DB.prepare(
    "INSERT INTO jobs(id,status,payload,created_at,updated_at) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      "queued",
      JSON.stringify({ ...request, product, evidence }),
      stamp,
      stamp,
    )
    .run();
  return c.json({ id, status: "queued" }, 202);
});
app.post("/api/jobs/:id/retry", async (c) => {
  const r = await c.env.DB.prepare(
    "UPDATE jobs SET status='queued',error=NULL,claim_token=NULL,updated_at=? WHERE id=? AND status='failed'",
  )
    .bind(now(), c.req.param("id"))
    .run();
  if (!r.meta.changes) fail("Only a failed job can be retried.");
  await c.env.DB.prepare(
    "UPDATE sessions SET status='queued',progress='Waiting for API worker',error=NULL,updated_at=? WHERE job_id=?",
  )
    .bind(now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.use("/api/runner/*", async (c, next) => {
  if (
    !c.env.LOCAL_RUNNER_TOKEN ||
    c.req.header("Authorization") !== `Bearer ${c.env.LOCAL_RUNNER_TOKEN}`
  )
    return c.json({ error: "Runner authentication required" }, 401);
  await next();
});
registerSessionRoutes(app);
registerExternalSessionRoutes(app);
app.post("/api/runner/claim", async (c) => {
  const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
  await c.env.DB.prepare(
    "UPDATE jobs SET status='failed',error='Runner stopped or timed out. Retry this job.',claim_token=NULL,updated_at=? WHERE status='running' AND updated_at<?",
  )
    .bind(now(), cutoff)
    .run();
  await c.env.DB.prepare(
    "UPDATE sessions SET status='failed',progress='Worker timed out',error='Worker stopped or timed out. Retry this session.',updated_at=? WHERE status='in_progress' AND job_id IN(SELECT id FROM jobs WHERE status='failed')",
  )
    .bind(now())
    .run();
  const row = await c.env.DB.prepare(
    "SELECT id,payload FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
  ).first<{ id: string; payload: string }>();
  if (!row) return c.json({ job: null });
  const token = crypto.randomUUID();
  const r = await c.env.DB.prepare(
    "UPDATE jobs SET status='running',claim_token=?,updated_at=? WHERE id=? AND status='queued'",
  )
    .bind(token, now(), row.id)
    .run();
  if (r.meta.changes)
    await c.env.DB.prepare(
      "UPDATE sessions SET status='in_progress',progress='Preparing API request',updated_at=? WHERE job_id=?",
    )
      .bind(now(), row.id)
      .run();
  return c.json({
    job: r.meta.changes
      ? { id: row.id, claimToken: token, payload: JSON.parse(row.payload) }
      : null,
  });
});
app.post("/api/runner/:id/finish", async (c) => {
  const body = finishBodySchema.parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "SELECT id,payload FROM jobs WHERE id=? AND status='running' AND claim_token=?",
  )
    .bind(c.req.param("id"), body.claimToken)
    .first<{ id: string; payload: string }>();
  if (!row)
    throw new HTTPException(409, {
      message: "Job is no longer owned by this runner",
    });
  if (body.error) {
    await c.env.DB.prepare(
      "UPDATE sessions SET status='failed',progress='Needs attention',error=?,updated_at=? WHERE job_id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='running' AND claim_token=?)",
    )
      .bind(body.error, now(), row.id, row.id, body.claimToken)
      .run();
    await c.env.DB.prepare(
      "UPDATE jobs SET status='failed',error=?,claim_token=NULL,updated_at=? WHERE id=? AND claim_token=?",
    )
      .bind(body.error, now(), row.id, body.claimToken)
      .run();
    return c.json({ ok: true });
  }
  if (!body.result) fail("Missing result");
  const payload = JSON.parse(row.payload);
  if (
    payload.kind === "questions" ||
    payload.kind === "research" ||
    payload.kind === "connection-test"
  )
    return c.json(await finishSpecial(c.env, row, payload, body));
  const result = draftResultSchema.parse(body.result);
  const allowed = new Set(payload.evidence.map((e: any) => e.id));
  if (result.sourceIds.some((id) => !allowed.has(id)))
    fail("Generated result cited an unknown source.");
  const stamp = now(),
    ids = [crypto.randomUUID(), crypto.randomUUID()];
  const statements = (["x", "threads"] as const).map((platform, index) => {
    const data = postSchema.parse({
      productId: payload.productId,
      title: result.title,
      platform,
      segments: result[platform],
      sourceIds: result.sourceIds,
      status: "draft",
      warnings: result.warnings,
      area: result.area ?? null,
      evidenceLevel: result.evidenceLevel ?? null,
      series: result.series ?? null,
    });
    return c.env.DB.prepare(
      "INSERT INTO records(id,kind,data,created_at,updated_at) SELECT ?,'post',?,?,? WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND status='running' AND claim_token=?)",
    ).bind(
      ids[index],
      JSON.stringify(data),
      stamp,
      stamp,
      row.id,
      body.claimToken,
    );
  });
  if (payload.sessionId)
    statements.push(
      c.env.DB.prepare(
        "UPDATE sessions SET status='completed',progress='Drafts ready for review',result=?,error=NULL,updated_at=? WHERE job_id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='running' AND claim_token=?)",
      ).bind(
        JSON.stringify({
          postIds: ids,
          warnings: result.warnings,
          ...(body.execution ? { execution: body.execution } : {}),
        }),
        stamp,
        row.id,
        row.id,
        body.claimToken,
      ),
    );
  statements.push(
    c.env.DB.prepare(
      "UPDATE jobs SET status='completed',result=?,claim_token=NULL,updated_at=? WHERE id=? AND status='running' AND claim_token=?",
    ).bind(
      JSON.stringify({
        postIds: ids,
        usage: body.usage ?? null,
        ...(body.execution ? { execution: body.execution } : {}),
      }),
      stamp,
      row.id,
      body.claimToken,
    ),
  );
  await c.env.DB.batch(statements);
  return c.json({ ok: true, postIds: ids });
});
app.all("/api/*", (c) => c.json({ error: "Endpoint not found" }, 404));
registerMcp(app);
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
