// MCP server (Streamable HTTP, stateless JSON responses) at POST /mcp.
// Auth: "Authorization: Bearer <MCP_TOKEN>". Every tool calls the existing /api routes
// internally, so it gets the same validation and safeguards as the dashboard.
import type { Hono } from "hono";
import type { Env } from "./index";
import { isLocalRequest, mcpTokenValid } from "./auth";
import { fromJakarta } from "../shared/model";
import { taskInstructions, promptKeys, type PromptOverrides } from "../shared/prompts";
import { writingBudgets } from "../shared/writing";
import { areaKeys, areas, evidenceLevelKeys, evidenceLevels, series, seriesKeys } from "../shared/brand";
import { schemas as taskSchemas } from "../scripts/ai-tasks.mjs";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "fieldnote", title: "Fieldnote affiliate studio", version: "0.2.0" };
const INSTRUCTIONS = `Fieldnote stores affiliate products, scientific evidence, research/writing sessions, X/Threads drafts and a WIB posting calendar.
You (the AI client) do the thinking; Fieldnote stores and validates.
Research: get_research_brief -> search_publications (real Europe PMC records) -> analyse ONLY those records -> save_research_session (cite sourceId values from the search). Then create_evidence for sources worth keeping.
Writing: get_writing_brief -> write X and Threads segments following its instructions and budgets -> save_writing_session (validated: exact affiliate URL once per platform, disclosure, lengths, only approved evidence IDs).
Approving evidence or posts and marking posts published should reflect the user's explicit decision. Nothing is posted to X/Threads automatically.
Dates: scheduledAtJakarta uses "YYYY-MM-DDTHH:mm" in Asia/Jakarta (WIB).`;

type Json = Record<string, any>;
class ToolError extends Error {}
type Ctx = {
  call: (method: string, path: string, body?: unknown, raw?: Uint8Array) => Promise<any>;
  image: (id: string) => Promise<{ base64: string; mimeType: string; bytes: number }>;
};
// A tool may return MCP content blocks directly (e.g. an image) instead of JSON text.
type RawContent = { __content: Json[] };
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run: (args: Json, ctx: Ctx) => Promise<unknown>;
};

const S = {
  str: (description: string, extra: Json = {}) => ({ type: "string", description, ...extra }),
  num: (description: string, extra: Json = {}) => ({ type: "number", description, ...extra }),
  bool: (description: string) => ({ type: "boolean", description }),
  obj: (properties: Json, required: string[] = [], description?: string) => ({
    type: "object",
    properties,
    required,
    additionalProperties: false,
    ...(description ? { description } : {}),
  }),
  arr: (items: Json, description: string) => ({ type: "array", items, description }),
};
const page = {
  page: S.num("1-based page", { minimum: 1, default: 1 }),
  pageSize: S.num("Items per page (max 50)", { minimum: 1, maximum: 50, default: 20 }),
};
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

function need(args: Json, key: string) {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new ToolError(`"${key}" is required.`);
  return v.trim();
}
function paged<T>(items: T[], args: Json) {
  const size = Math.min(50, Math.max(1, Math.floor(Number(args.pageSize) || 20)));
  const total = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(total, Math.max(1, Math.floor(Number(args.page) || 1)));
  return { page: current, totalPages: total, totalItems: items.length, items: items.slice((current - 1) * size, current * size) };
}
const state = (ctx: Ctx) => ctx.call("GET", "/api/state");
function find(list: any[], id: string, label: string) {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ToolError(`${label} not found: ${id}`);
  return r;
}
const productSummary = (p: any, s: any) => ({
  id: p.id,
  name: p.data.name,
  variant: p.data.variant,
  category: p.data.category,
  confirmed: p.data.confirmed,
  price: p.data.price,
  evidence: s.evidence.filter((e: any) => e.data.productId === p.id).length,
  posts: s.posts.filter((x: any) => x.data.productId === p.id).length,
  updatedAt: p.updatedAt,
});
const postSummary = (p: any) => ({
  id: p.id,
  productId: p.data.productId,
  title: p.data.title,
  platform: p.data.platform,
  status: p.data.status,
  scheduledAt: p.data.scheduledAt,
  firstSegment: p.data.segments[0],
});
const sessionSummary = (x: any) => ({
  id: x.id,
  kind: x.kind,
  productId: x.productId,
  title: x.topic.title,
  status: x.status,
  progress: x.progress,
  error: x.error,
  createdAt: x.createdAt,
});
async function update(ctx: Ctx, kind: "product" | "evidence" | "post", id: string, changes: Json) {
  const s = await state(ctx);
  const list = kind === "product" ? s.products : kind === "evidence" ? s.evidence : s.posts;
  const record = find(list, id, kind);
  const data = { ...record.data, ...changes };
  // New segments without new images: keep images aligned to the remaining segments.
  if (kind === "post" && changes.segments && !changes.segmentImages)
    data.segmentImages = (record.data.segmentImages ?? []).slice(0, changes.segments.length);
  return ctx.call("PUT", `/api/records/${kind}/${id}`, { version: record.version, data });
}
async function promptOverrides(ctx: Ctx): Promise<PromptOverrides> {
  return (await ctx.call("GET", "/api/settings/prompts")).overrides;
}
async function imageBytes(args: Json) {
  if (args.imageBase64) return base64Bytes(String(args.imageBase64));
  if (!args.imageUrl) throw new ToolError("Provide imageBase64 or imageUrl.");
  const url = new URL(String(args.imageUrl));
  if (url.protocol !== "https:") throw new ToolError("imageUrl must be https.");
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!r.ok) throw new ToolError(`Image download failed: HTTP ${r.status}`);
  const buffer = await r.arrayBuffer();
  if (buffer.byteLength > 5 * 1024 * 1024) throw new ToolError("Image is larger than 5 MB.");
  return new Uint8Array(buffer);
}
function base64Bytes(value: string) {
  const clean = value.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    throw new ToolError("imageBase64 is not valid base64.");
  }
}

const productFields = {
  name: S.str("Exact product name"),
  variant: S.str("Exact variant / size"),
  category: S.str("Category", { enum: ["Skincare", "Haircare", "Bodycare", "Makeup", "Other"] }),
  affiliateUrl: S.str("Affiliate link (http/https)"),
  manufacturerUrl: S.str("Manufacturer or packaging source URL, or empty"),
  ingredients: S.str("Ingredients as printed; leave empty if unknown"),
  advertisedClaims: S.str("Seller claims (unverified)"),
  notes: S.str("Your notes"),
  price: { type: ["number", "null"], description: "Price in IDR" },
  commission: { type: ["number", "null"], description: "Commission % (0-100)" },
  confirmed: S.bool("Product and variant confirmed by the user"),
  imageId: { type: ["string", "null"], description: "Image UUID from upload_product_image" },
};
const evidenceFields = {
  title: S.str("Publication title"),
  url: S.str("Publication URL"),
  sourceId: S.str("Source ID from search_publications"),
  year: S.str("Year"),
  authors: S.str("Authors"),
  abstract: S.str("Abstract text"),
  access: S.str("What was reviewed", { enum: ["abstract", "full-text"] }),
  studyType: S.str("Study design"),
  claim: S.str("The narrow claim this source supports"),
  limitations: S.str("Population, formulation, duration and other limitations"),
  verdict: S.str("Assessment", { enum: ["unreviewed", "supported", "uncertain", "unsupported"] }),
  approved: S.bool("Approved for use in drafts (requires verdict=supported, claim and limitations)"),
};
const postFields = {
  title: S.str("Internal title"),
  platform: S.str("Platform", { enum: ["x", "threads"] }),
  segments: S.arr({ type: "string" }, "Publishable segments (thread parts)"),
  segmentImages: S.arr({ type: ["string", "null"] }, "Image ID per segment by index (null = none); see upload_post_segment_image"),
  area: { type: ["string", "null"], enum: [...areaKeys, null], description: "Rawatlogi area label" },
  evidenceLevel: { type: ["string", "null"], enum: [...evidenceLevelKeys, null], description: "Level bukti; riset-* only with approved evidence in sourceIds" },
  series: { type: ["string", "null"], enum: [...seriesKeys, null], description: "Rawatlogi content series" },
  sourceIds: S.arr({ type: "string" }, "Evidence record IDs used"),
  status: S.str("Status", { enum: ["draft", "approved", "published"] }),
  scheduledAtJakarta: { type: ["string", "null"], description: 'Schedule in WIB, "YYYY-MM-DDTHH:mm"; null to unschedule' },
  publishedUrl: S.str("Real published post URL (required for published)"),
  warnings: S.arr({ type: "string" }, "Review notes"),
};
const topicField = S.obj(
  {
    title: S.str("Topic title (3-300 chars)"),
    question: S.str("Question or brief"),
    searchQuery: S.str("English publication search terms"),
    rationale: S.str("Why this topic is useful"),
  },
  ["title"],
);
function postChanges(args: Json) {
  const { scheduledAtJakarta, ...rest } = args;
  if (scheduledAtJakarta !== undefined) {
    if (scheduledAtJakarta !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAtJakarta))
      throw new ToolError('scheduledAtJakarta must look like "2026-11-20T09:00".');
    rest.scheduledAt = scheduledAtJakarta === null ? null : fromJakarta(scheduledAtJakarta);
  }
  return rest;
}
const pick = (args: Json, keys: string[]) =>
  Object.fromEntries(Object.entries(args).filter(([k]) => keys.includes(k)));

export const tools: Tool[] = [
  {
    name: "get_workspace_summary",
    title: "Workspace summary",
    description: "Counts and the most recent products, sessions and scheduled posts.",
    inputSchema: S.obj({}),
    annotations: READ,
    async run(_, ctx) {
      const s = await state(ctx);
      return {
        counts: {
          products: s.products.length,
          evidence: s.evidence.length,
          approvedEvidence: s.evidence.filter((e: any) => e.data.approved).length,
          posts: s.posts.length,
          drafts: s.posts.filter((p: any) => p.data.status === "draft").length,
          scheduled: s.posts.filter((p: any) => p.data.scheduledAt && p.data.status !== "published").length,
          sessions: s.sessions.length,
        },
        recentProducts: s.products.slice(0, 5).map((p: any) => productSummary(p, s)),
        recentSessions: s.sessions.slice(0, 5).map(sessionSummary),
        upcomingPosts: s.posts
          .filter((p: any) => p.data.scheduledAt && p.data.status !== "published")
          .sort((a: any, b: any) => a.data.scheduledAt.localeCompare(b.data.scheduledAt))
          .slice(0, 10)
          .map(postSummary),
      };
    },
  },
  {
    name: "list_products",
    title: "List products",
    description: "Search and page through products (name, variant, category).",
    inputSchema: S.obj({ query: S.str("Search text"), ...page }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      const q = String(args.query ?? "").toLowerCase().trim();
      const items = s.products.filter((p: any) =>
        `${p.data.name} ${p.data.variant} ${p.data.category}`.toLowerCase().includes(q),
      );
      return paged(items.map((p: any) => productSummary(p, s)), args);
    },
  },
  {
    name: "get_product",
    title: "Get product",
    description: "Full product record with its evidence, posts and sessions.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      return {
        ...p,
        evidence: s.evidence.filter((e: any) => e.data.productId === id),
        posts: s.posts.filter((x: any) => x.data.productId === id).map(postSummary),
        sessions: s.sessions.filter((x: any) => x.productId === id).map(sessionSummary),
      };
    },
  },
  {
    name: "create_product",
    title: "Create product",
    description: "Add a product. Unknown facts stay empty; do not infer ingredients from a name or link.",
    inputSchema: S.obj(productFields, ["name", "category", "affiliateUrl"]),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", "/api/records/product", pick(args, Object.keys(productFields))),
  },
  {
    name: "update_product",
    title: "Update product",
    description: "Change product fields (only the fields given). Editing content resets approved posts of this product to draft.",
    inputSchema: S.obj({ productId: S.str("Product ID"), ...productFields }, ["productId"]),
    annotations: WRITE,
    run: (args, ctx) => update(ctx, "product", need(args, "productId"), pick(args, Object.keys(productFields))),
  },
  {
    name: "delete_product",
    title: "Delete product",
    description: "Delete a product. Refused if it has evidence, posts or sessions.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: DELETE,
    run: (args, ctx) => ctx.call("DELETE", `/api/records/product/${encodeURIComponent(need(args, "productId"))}`),
  },
  {
    name: "upload_product_image",
    title: "Upload product image",
    description: "Upload a JPEG/PNG/WebP (max 5 MB) as base64 or from an https URL. With productId the image is attached to the product.",
    inputSchema: S.obj({
      productId: S.str("Attach to this product (optional)"),
      imageBase64: S.str("Image bytes as base64 or data: URL"),
      imageUrl: S.str("https URL of the image"),
    }),
    annotations: { ...WRITE, openWorldHint: true },
    async run(args, ctx) {
      const image = await ctx.call("POST", "/api/images", undefined, await imageBytes(args));
      if (args.productId) {
        const product = await update(ctx, "product", String(args.productId), { imageId: image.id });
        return { image, product };
      }
      return { image };
    },
  },
  {
    name: "upload_post_segment_image",
    title: "Attach image to a post segment",
    description: "Upload a JPEG/PNG/WebP (max 5 MB, base64 or https URL) and attach it to one segment of a post (0-based segmentIndex). Replaces that segment's previous image. Use update_post with segmentImages to remove or reorder images.",
    inputSchema: S.obj(
      {
        postId: S.str("Post ID"),
        segmentIndex: S.num("0-based segment index", { minimum: 0 }),
        imageBase64: S.str("Image bytes as base64 or data: URL"),
        imageUrl: S.str("https URL of the image"),
      },
      ["postId", "segmentIndex"],
    ),
    annotations: { ...WRITE, openWorldHint: true },
    async run(args, ctx) {
      const post = find((await state(ctx)).posts, need(args, "postId"), "Post");
      const index = Number(args.segmentIndex);
      if (!Number.isInteger(index) || index < 0 || index >= post.data.segments.length)
        throw new ToolError(`segmentIndex must be 0-${post.data.segments.length - 1}.`);
      const image = await ctx.call("POST", "/api/images", undefined, await imageBytes(args));
      const segmentImages = post.data.segments.map((_: string, i: number) =>
        i === index ? image.id : (post.data.segmentImages?.[i] ?? null),
      );
      return { image, post: await update(ctx, "post", post.id, { segmentImages }) };
    },
  },
  {
    name: "get_image_brief",
    title: "Image brief for a post",
    description: "Everything needed to design a post's images (thumbnail for segment 1, explainer/data images for segments 2-3): post segments and current images, product facts and photo ID, approved evidence for charts, recent research findings (unreviewed), suggested image per segment, sizes, and the saved image-design prompt. Design with Claude Design, render PNG, then attach with upload_post_segment_image (or scripts/upload-segment-image.mjs for large files).",
    inputSchema: S.obj({ postId: S.str("Post ID") }, ["postId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      const post = find(s.posts, need(args, "postId"), "Post");
      const p = post.data.productId ? find(s.products, post.data.productId, "Product") : null;
      const prompts = taskInstructions(await promptOverrides(ctx));
      const science = /humectant|emollient|occlusive|ceramide|barrier|lapisan|studi|penelitian|riset|dibanding|\bvs\b|%|lemak|air/i;
      const segments = post.data.segments.map((text: string, index: number) => {
        const linkOnly = text.replace(/https?:\/\/\S+/g, "").trim().length < 60;
        const suggestion =
          index === 0 ? "thumbnail" : linkOnly ? "none" : index <= 2 && science.test(text) ? "explainer" : "optional";
        return { index, text, currentImageId: post.data.segmentImages?.[index] ?? null, suggestion };
      });
      const research = s.sessions
        .filter((x: any) => x.kind === "research" && p && x.productId === p.id && x.status === "completed" && x.result?.findings)
        .slice(0, 3)
        .map((x: any) => ({
          sessionId: x.id,
          topic: x.topic.title,
          findings: x.result.findings.map((f: any) => ({ claim: f.claim, confidence: f.confidence, limitations: f.limitations, sourceIds: f.sourceIds })),
          sources: x.sources.map((src: any) => ({ sourceId: src.sourceId, title: src.title, year: src.year, authors: src.authors?.slice(0, 120), hasAbstract: !!src.abstract })),
        }));
      return {
        post: {
          id: post.id,
          platform: post.data.platform,
          title: post.data.title,
          status: post.data.status,
          segments,
          // Labels for the image: AreaLabel, EvidenceLabel and the series eyebrow.
          area: post.data.area ? areas[post.data.area as keyof typeof areas].label : null,
          evidenceLevel: post.data.evidenceLevel ? evidenceLevels[post.data.evidenceLevel as keyof typeof evidenceLevels].label : null,
          series: post.data.series ? series[post.data.series as keyof typeof series].label : null,
          labelNote: post.data.evidenceLevel ? undefined : "No Level bukti saved: use Ilustrasi konsep unless approvedEvidence is used.",
        },
        product: p
          ? {
              id: p.id,
              name: p.data.name,
              variant: p.data.variant,
              category: p.data.category,
              ingredients: p.data.ingredients,
              photoImageId: p.data.imageId,
              note: "Use get_image with photoImageId to see the product photo; embed it unchanged.",
            }
          : { note: "Brand post: no product. Use brand visuals (wordmark, labels, series), no product photo, and no AreaLabel/EvidenceLabel unless the copy is about one area or claim." },
        approvedEvidence: s.evidence
          .filter((e: any) => p && e.data.productId === p.id && e.data.approved)
          .map((e: any) => ({ id: e.id, title: e.data.title, year: e.data.year, authors: e.data.authors, claim: e.data.claim, limitations: e.data.limitations })),
        researchFindingsUnreviewed: research,
        sizes: post.data.platform === "x"
          ? { thumbnail: "1600x900", explainer: "1600x900 or 1200x1200" }
          : { thumbnail: "1080x1350", explainer: "1080x1350 or 1080x1080" },
        instructions: prompts.imageDesign,
        workflow: [
          "1. Pick images per segment (follow suggestion; at most 3).",
          "2. Design them in Claude Design (Design artifact), one artboard per image at the exact size, in the Fieldnote style from the instructions.",
          "3. Render each artboard to PNG at that size (scripts/render-image.mjs in the Fieldnote project).",
          "4. Attach each PNG: scripts/upload-segment-image.mjs <postId> <segmentIndex> <file.png> (or upload_post_segment_image with imageBase64 for small files).",
          "5. get_post to confirm segmentImages, then tell the user the alt text for each image.",
        ],
      };
    },
  },
  {
    name: "get_image",
    title: "View an image",
    description: "Return a stored image (product photo or segment image) as image content so you can see it or embed it in a design.",
    inputSchema: S.obj({ imageId: S.str("Image ID") }, ["imageId"]),
    annotations: READ,
    async run(args, ctx) {
      const img = await ctx.image(need(args, "imageId"));
      return { __content: [{ type: "image", data: img.base64, mimeType: img.mimeType }, { type: "text", text: `${img.mimeType}, ${img.bytes} bytes` }] } as RawContent;
    },
  },
  {
    name: "search_publications",
    title: "Search publications",
    description: "Search Europe PMC (PubMed fallback) for real publications. Use English scientific terms. Returns up to 12 records with sourceId values to cite.",
    inputSchema: S.obj({ query: S.str("English search query (3-300 chars)") }, ["query"]),
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: (args, ctx) => ctx.call("GET", "/api/research/search?q=" + encodeURIComponent(need(args, "query"))),
  },
  {
    name: "get_research_brief",
    title: "Research brief",
    description: "Everything needed to research a product: product facts, existing evidence, the saved research prompts and the report format for save_research_session.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      const prompts = taskInstructions(await promptOverrides(ctx));
      return {
        product: { id: p.id, ...p.data },
        existingEvidence: s.evidence.filter((e: any) => e.data.productId === id),
        instructions: { queryPlanning: prompts.plan, analysis: prompts.research },
        reportSchema: taskSchemas.research,
        workflow: "Use search_publications, analyse only the returned records, cite their sourceId values, then call save_research_session with the same sources.",
      };
    },
  },
  {
    name: "save_research_session",
    title: "Save research session",
    description: "Store a completed research session you wrote. Findings may cite only sourceId values present in sources; supported findings need a source. Findings are not approved claims.",
    inputSchema: S.obj(
      {
        productId: S.str("Product ID"),
        topic: topicField,
        guidance: S.str("Guidance or scope"),
        searchQuery: S.str("Query used"),
        author: S.str("Who wrote it, e.g. 'Claude via MCP'"),
        sources: S.arr({ type: "object" }, "Publication objects exactly as returned by search_publications (max 12)"),
        report: S.obj(
          {
            summary: S.str("Briefing (Bahasa Indonesia)"),
            findings: S.arr(
              S.obj(
                {
                  claim: S.str("Finding"),
                  sourceIds: S.arr({ type: "string" }, "Cited sourceId values"),
                  confidence: S.str("Confidence", { enum: ["supported", "uncertain", "unsupported"] }),
                  limitations: S.str("Limitations"),
                },
                ["claim", "sourceIds", "confidence", "limitations"],
              ),
              "Findings (max 20)",
            ),
            nextSteps: S.arr({ type: "string" }, "Next steps"),
            warnings: S.arr({ type: "string" }, "Warnings"),
          },
          ["summary", "findings", "nextSteps", "warnings"],
        ),
      },
      ["productId", "topic", "report"],
    ),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", "/api/sessions/external", { kind: "research", ...args }),
  },
  {
    name: "get_writing_brief",
    title: "Writing brief",
    description: "Everything needed to write X/Threads drafts: product, approved evidence, the saved writer/editor prompts, platform budgets and the draft format for save_writing_session.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      const prompts = taskInstructions(await promptOverrides(ctx));
      return {
        product: { id: p.id, ...p.data },
        productConfirmed: p.data.confirmed,
        approvedEvidence: s.evidence
          .filter((e: any) => e.data.productId === id && e.data.approved)
          .map((e: any) => ({ id: e.id, title: e.data.title, url: e.data.url, claim: e.data.claim, limitations: e.data.limitations, access: e.data.access })),
        instructions: { writer: prompts.writing, editor: prompts.writingEdit },
        platformBudgets: writingBudgets(p.data.affiliateUrl),
        draftSchema: taskSchemas.writing,
        workflow: "Write a draft following the writer instructions, self-edit with the editor instructions, then call save_writing_session. sourceIds may only contain approvedEvidence ids.",
      };
    },
  },
  {
    name: "save_writing_session",
    title: "Save writing session",
    description: "Store drafts you wrote as a completed writing session: creates one X and one Threads draft post. Validated for exact affiliate URL once per platform, affiliate disclosure in that segment, lengths, and approved evidence IDs. Product must be confirmed.",
    inputSchema: S.obj(
      {
        productId: S.str("Product ID"),
        topic: topicField,
        guidance: S.str("Guidance used"),
        author: S.str("Who wrote it"),
        draft: S.obj(
          {
            title: S.str("Internal title"),
            x: S.arr({ type: "string" }, "X segments (1-4, <=280 weighted chars)"),
            threads: S.arr({ type: "string" }, "Threads segments (1-4, <=500 chars)"),
            sourceIds: S.arr({ type: "string" }, "Approved evidence IDs used"),
            warnings: S.arr({ type: "string" }, "Review notes"),
            area: S.str("Area", { enum: areaKeys }),
            evidenceLevel: S.str("Level bukti (riset-* needs approved evidence)", { enum: evidenceLevelKeys }),
            series: S.str("Content series", { enum: seriesKeys }),
          },
          ["title", "x", "threads", "sourceIds", "warnings", "area", "evidenceLevel", "series"],
        ),
      },
      ["productId", "topic", "draft"],
    ),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", "/api/sessions/external", { kind: "writing", ...args }),
  },
  {
    name: "list_evidence",
    title: "List evidence",
    description: "Saved evidence records, optionally for one product or approval state.",
    inputSchema: S.obj({ productId: S.str("Product ID"), approved: S.bool("Filter by approval"), ...page }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      return paged(
        s.evidence.filter(
          (e: any) =>
            (!args.productId || e.data.productId === args.productId) &&
            (args.approved === undefined || e.data.approved === args.approved),
        ),
        args,
      );
    },
  },
  {
    name: "create_evidence",
    title: "Create evidence",
    description: "Save a source for a product. Approve only after the claim was actually reviewed.",
    inputSchema: S.obj({ productId: S.str("Product ID"), ...evidenceFields }, ["productId", "title", "url"]),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", "/api/records/evidence", pick(args, ["productId", ...Object.keys(evidenceFields)])),
  },
  {
    name: "update_evidence",
    title: "Update evidence",
    description: "Change evidence fields (e.g. assess and approve, or revoke approval). Changing evidence resets approved posts that use it to draft.",
    inputSchema: S.obj({ evidenceId: S.str("Evidence ID"), ...evidenceFields }, ["evidenceId"]),
    annotations: WRITE,
    run: (args, ctx) => update(ctx, "evidence", need(args, "evidenceId"), pick(args, Object.keys(evidenceFields))),
  },
  {
    name: "delete_evidence",
    title: "Delete evidence",
    description: "Delete evidence. Refused if a post uses it.",
    inputSchema: S.obj({ evidenceId: S.str("Evidence ID") }, ["evidenceId"]),
    annotations: DELETE,
    run: (args, ctx) => ctx.call("DELETE", `/api/records/evidence/${encodeURIComponent(need(args, "evidenceId"))}`),
  },
  {
    name: "list_posts",
    title: "List posts",
    description: "Drafts and posts with filters.",
    inputSchema: S.obj({
      productId: S.str("Product ID"),
      status: S.str("Status", { enum: ["draft", "approved", "published"] }),
      platform: S.str("Platform", { enum: ["x", "threads"] }),
      scheduled: S.bool("true = scheduled only, false = unscheduled only"),
      ...page,
    }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      return paged(
        s.posts
          .filter(
            (p: any) =>
              (!args.productId || p.data.productId === args.productId) &&
              (!args.status || p.data.status === args.status) &&
              (!args.platform || p.data.platform === args.platform) &&
              (args.scheduled === undefined || !!p.data.scheduledAt === args.scheduled),
          )
          .map(postSummary),
        args,
      );
    },
  },
  {
    name: "get_post",
    title: "Get post",
    description: "Full post record with all segments.",
    inputSchema: S.obj({ postId: S.str("Post ID") }, ["postId"]),
    annotations: READ,
    run: async (args, ctx) => find((await state(ctx)).posts, need(args, "postId"), "Post"),
  },
  {
    name: "create_post",
    title: "Create post",
    description: "Create a single post manually. Leave productId empty for a brand post (no product, no affiliate link, no evidence). Prefer save_writing_session for product drafts.",
    inputSchema: S.obj({ productId: S.str("Product ID; empty for a brand post"), ...postFields }, ["title", "platform", "segments"]),
    annotations: WRITE,
    run: (args, ctx) =>
      ctx.call("POST", "/api/records/post", postChanges(pick(args, ["productId", ...Object.keys(postFields)]))),
  },
  {
    name: "update_post",
    title: "Update post",
    description: "Edit, schedule (scheduledAtJakarta), approve, or mark published with publishedUrl. Published posts are read-only.",
    inputSchema: S.obj({ postId: S.str("Post ID"), ...postFields }, ["postId"]),
    annotations: WRITE,
    run: (args, ctx) => update(ctx, "post", need(args, "postId"), postChanges(pick(args, Object.keys(postFields)))),
  },
  {
    name: "delete_post",
    title: "Delete post",
    description: "Delete an unpublished post.",
    inputSchema: S.obj({ postId: S.str("Post ID") }, ["postId"]),
    annotations: DELETE,
    run: (args, ctx) => ctx.call("DELETE", `/api/records/post/${encodeURIComponent(need(args, "postId"))}`),
  },
  {
    name: "get_calendar",
    title: "Posting calendar",
    description: "Scheduled posts between two WIB dates (inclusive).",
    inputSchema: S.obj({ from: S.str("YYYY-MM-DD"), to: S.str("YYYY-MM-DD") }, ["from", "to"]),
    annotations: READ,
    async run(args, ctx) {
      const from = fromJakarta(need(args, "from") + "T00:00"),
        to = fromJakarta(need(args, "to") + "T23:59");
      if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) throw new ToolError("Use YYYY-MM-DD dates.");
      return (await state(ctx)).posts
        .filter((p: any) => p.data.scheduledAt && p.data.scheduledAt >= from && p.data.scheduledAt <= to)
        .sort((a: any, b: any) => a.data.scheduledAt.localeCompare(b.data.scheduledAt))
        .map(postSummary);
    },
  },
  {
    name: "list_sessions",
    title: "List sessions",
    description: "Research and writing sessions.",
    inputSchema: S.obj({
      kind: S.str("Kind", { enum: ["research", "writing"] }),
      productId: S.str("Product ID"),
      status: S.str("Status", { enum: ["queued", "in_progress", "completed", "failed"] }),
      ...page,
    }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      return paged(
        s.sessions
          .filter(
            (x: any) =>
              (!args.kind || x.kind === args.kind) &&
              (!args.productId || x.productId === args.productId) &&
              (!args.status || x.status === args.status),
          )
          .map(sessionSummary),
        args,
      );
    },
  },
  {
    name: "get_session",
    title: "Get session",
    description: "Session with its report or drafts and retrieved sources.",
    inputSchema: S.obj({ sessionId: S.str("Session ID") }, ["sessionId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      const session = find(s.sessions, need(args, "sessionId"), "Session");
      const ids: string[] = session.result?.postIds ?? [];
      return { ...session, posts: s.posts.filter((p: any) => ids.includes(p.id)) };
    },
  },
  {
    name: "list_jobs",
    title: "List jobs",
    description: "Recent jobs (latest 30), including sessions saved through MCP.",
    inputSchema: S.obj({ status: S.str("Status", { enum: ["queued", "running", "completed", "failed"] }), ...page }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      return paged(
        s.jobs
          .filter((j: any) => !args.status || j.status === args.status)
          .map((j: any) => ({ id: j.id, status: j.status, kind: j.payload.kind ?? "writing", productId: j.payload.productId, angle: j.payload.angle, error: j.error, createdAt: j.createdAt })),
        args,
      );
    },
  },
  {
    name: "queue_gateway_sessions",
    title: "Queue gateway sessions (local only)",
    description: "Queue research/writing sessions for the app's own API gateway worker. Local app only; needs the Node worker running and an API key.",
    inputSchema: S.obj(
      {
        kind: S.str("Kind", { enum: ["research", "writing"] }),
        productId: S.str("Product ID"),
        guidance: S.str("Guidance"),
        topics: S.arr(topicField, "1-10 topics"),
      },
      ["kind", "productId", "topics"],
    ),
    annotations: { ...WRITE, openWorldHint: true },
    run: (args, ctx) => ctx.call("POST", "/api/sessions", args),
  },
  {
    name: "queue_topic_suggestions",
    title: "Queue topic suggestions (local only)",
    description: "Ask the app's gateway model for topic suggestions; poll list_jobs for the result. Local app only.",
    inputSchema: S.obj(
      { kind: S.str("Kind", { enum: ["research", "writing"] }), productId: S.str("Product ID"), guidance: S.str("Guidance") },
      ["kind", "productId"],
    ),
    annotations: { ...WRITE, openWorldHint: true },
    run: (args, ctx) => ctx.call("POST", "/api/topics/generate", args),
  },
  {
    name: "retry_session",
    title: "Retry failed session (local only)",
    description: "Re-queue a failed gateway session.",
    inputSchema: S.obj({ sessionId: S.str("Session ID") }, ["sessionId"]),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", `/api/sessions/${encodeURIComponent(need(args, "sessionId"))}/retry`, {}),
  },
  {
    name: "get_prompts",
    title: "Get AI prompts",
    description: "Default and customised prompts used by the app's gateway generation and the briefs.",
    inputSchema: S.obj({}),
    annotations: READ,
    async run(_, ctx) {
      const r = await ctx.call("GET", "/api/settings/prompts");
      return promptKeys.map((k) => ({ key: k, ...r.info[k], custom: k in r.overrides, text: r.overrides[k] ?? r.defaults[k] }));
    },
  },
  {
    name: "update_prompts",
    title: "Update AI prompts",
    description: `Set prompt text by key (${promptKeys.join(", ")}). An empty string resets that prompt to its default. Other prompts are kept.`,
    inputSchema: S.obj({ prompts: { type: "object", additionalProperties: { type: "string" }, description: "key -> text" } }, ["prompts"]),
    annotations: WRITE,
    async run(args, ctx) {
      const changes = (args.prompts ?? {}) as Record<string, string>;
      const unknown = Object.keys(changes).filter((k) => !promptKeys.includes(k as any));
      if (unknown.length) throw new ToolError("Unknown prompt keys: " + unknown.join(", "));
      const merged: Record<string, string> = { ...(await promptOverrides(ctx)) };
      for (const [k, v] of Object.entries(changes)) {
        if (typeof v !== "string" || !v.trim()) delete merged[k];
        else merged[k] = v;
      }
      return ctx.call("PUT", "/api/settings/prompts", { prompts: merged });
    },
  },
  {
    name: "get_ai_settings",
    title: "Get gateway AI settings",
    description: "Gateway model settings (the API key is never returned).",
    inputSchema: S.obj({}),
    annotations: READ,
    run: (_, ctx) => ctx.call("GET", "/api/settings/ai"),
  },
  {
    name: "export_workspace",
    title: "Export workspace",
    description: "Full JSON backup (records, jobs, sessions). Excludes keys, settings and image bytes.",
    inputSchema: S.obj({}),
    annotations: READ,
    run: (_, ctx) => ctx.call("GET", "/api/export"),
  },
];

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
async function handleMessage(msg: any, ctx: Ctx) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string")
    return rpcError(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations: { title, ...annotations },
          })),
        },
      };
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const data: any = await tool.run(params.arguments ?? {}, ctx);
        if (data && Array.isArray(data.__content)) return { jsonrpc: "2.0", id, result: { content: data.__content } };
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          result: { isError: true, content: [{ type: "text", text: (e as Error).message || "Tool failed" }] },
        };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export function registerMcp(app: Hono<{ Bindings: Env }>) {
  app.on(["GET", "DELETE"], "/mcp", (c) =>
    c.json(rpcError(null, -32000, "This server supports POST only (stateless)."), 405, { Allow: "POST" }),
  );
  app.post("/mcp", async (c) => {
    if (c.env.APP_MODE === "local" && !isLocalRequest(c.req.url))
      return c.json(rpcError(null, -32001, "Local mode accepts loopback hosts only."), 403);
    const origin = c.req.header("origin");
    if (origin && !isLocalRequest(origin) && origin !== new URL(c.req.url).origin)
      return c.json(rpcError(null, -32001, "Origin not allowed"), 403);
    if (!(await mcpTokenValid(c.req.header("authorization"), c.env)))
      return c.json(rpcError(null, -32001, "Unauthorized: send Authorization: Bearer <MCP_TOKEN>."), 401, {
        "WWW-Authenticate": 'Bearer realm="fieldnote-mcp"',
      });
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(rpcError(null, -32700, "Parse error"), 400);
    }
    const internalEnv = { ...c.env, MCP_INTERNAL: true };
    const ctx: Ctx = {
      async call(method, path, payload, raw) {
        const r = await app.request(
          "http://localhost" + path,
          {
            method,
            headers: raw
              ? { "Content-Type": "application/octet-stream", "Content-Length": String(raw.byteLength) }
              : { "Content-Type": "application/json" },
            body: raw ? (raw as BufferSource) : payload === undefined ? undefined : JSON.stringify(payload),
          },
          internalEnv,
        );
        const data: any = await r.json().catch(() => null);
        if (!r.ok) throw new ToolError(data?.error || `Request failed with HTTP ${r.status}`);
        return data;
      },
      async image(id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ToolError("Invalid image ID.");
        const r = await app.request("http://localhost/api/images/" + id, { method: "GET" }, internalEnv);
        if (!r.ok) throw new ToolError("Image not found.");
        const bytes = new Uint8Array(await r.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { base64: btoa(binary), mimeType: r.headers.get("Content-Type") || "image/png", bytes: bytes.length };
      },
    };
    c.header("Cache-Control", "no-store");
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleMessage(m, ctx)))).filter(Boolean);
      return out.length ? c.json(out) : c.body(null, 202);
    }
    const out = await handleMessage(body, ctx);
    return out ? c.json(out) : c.body(null, 202);
  });
}
