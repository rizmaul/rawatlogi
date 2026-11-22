import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z, ZodError } from "zod";
import { imageContentType, MAX_IMAGE_BYTES } from "../shared/images";
import { isLocalRequest } from "./auth";
import { registerDraftRoutes } from "./drafts";
import { registerMcp } from "./mcp";
import {
  productSchema,
  evidenceSchema,
  postSchema,
  type Product,
  type Evidence,
  type Post,
  type RecordItem,
} from "../shared/model";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_MODE: string;
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
app.use("/api/*", async (c, next) => {
  const mode = c.env.APP_MODE;
  if (mode !== "local" && mode !== "production")
    return c.json({ error: "APP_MODE must be local or production." }, 503);
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
  const [products, evidence, posts] = await Promise.all([
    list<Product>(c.env.DB, "product"),
    list<Evidence>(c.env.DB, "evidence"),
    list<Post>(c.env.DB, "post"),
  ]);
  return c.json({ products, evidence, posts });
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
    sessions: (await c.env.DB.prepare("SELECT * FROM sessions ORDER BY created_at").all()).results,
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
registerDraftRoutes(app);
app.all("/api/*", (c) => c.json({ error: "Endpoint not found" }, 404));
registerMcp(app);
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
