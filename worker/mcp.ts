// MCP server (Streamable HTTP, stateless JSON responses) at POST /mcp.
// Auth: "Authorization: Bearer <MCP_TOKEN>". Every tool calls the existing /api routes
// internally, so it gets the same validation and safeguards as the dashboard.
import type { Hono } from "hono";
import type { Env } from "./index";
import { isLocalRequest, mcpTokenValid } from "./auth";
import { fromJakarta } from "../shared/model";
import { writingBudgets } from "../shared/writing";
import { areaKeys, areas, evidenceLevelKeys, evidenceLevels, series, seriesKeys } from "../shared/brand";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "rawatlogi", title: "Rawatlogi affiliate studio", version: "0.2.0" };
const INSTRUCTIONS = `Rawatlogi stores affiliate products, scientific evidence, X/Threads drafts and a WIB posting calendar.
You (the AI client) do the thinking; Rawatlogi stores and validates.
Discovery (also for first-time product lookups): get_discovery_brief -> inspect and synthesize multiple independent articles -> verify exact product facts, ingredients, claims, price and image from primary sources -> present candidates and ask for the user's selection and affiliateUrl -> create_product with the researched fields -> upload_product_image with productId -> get_product to verify the saved fields and image. Do not stop at product creation or silently omit image setup. Compare the existing catalog and search niche/premium alternatives when similar products exist.
Research: get_research_brief -> first fill missing product facts through official product/packaging sources and update_product -> search real scientific publications (Europe PMC / PubMed) using your own web search -> analyse ONLY retrieved records -> create_evidence for each useful source with its claim, limitations and verdict (approved: false).
Writing: get_writing_brief -> write X and Threads segments following its instructions and budgets -> save_drafts (validated: exact affiliate URL once per platform, disclosure, lengths, only approved evidence IDs).
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
  sourceId: S.str("Publication source ID (e.g. PMC or PubMed ID)"),
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
    description: "Counts and the most recent products and scheduled posts.",
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
        },
        recentProducts: s.products.slice(0, 5).map((p: any) => productSummary(p, s)),
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
    description: "Full product record with its evidence and posts.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      return {
        ...p,
        evidence: s.evidence.filter((e: any) => e.data.productId === id),
        posts: s.posts.filter((x: any) => x.data.productId === id).map(postSummary),
      };
    },
  },
  {
    name: "create_product",
    title: "Create product",
    description: "Add the selected product after user approval and receipt of their affiliate link. Include researched variant, manufacturerUrl, ingredients, advertisedClaims, price and source notes. Unknown facts stay empty; never infer ingredients. Then upload_product_image with the returned id and verify with get_product before reporting setup complete.",
    inputSchema: S.obj(productFields, ["name", "category", "affiliateUrl"]),
    annotations: WRITE,
    async run(args, ctx) {
      const product = await ctx.call("POST", "/api/records/product", pick(args, Object.keys(productFields)));
      return {
        ...product,
        setup: {
          imageStatus: product.data.imageId ? "attached" : "pending",
          nextStep: product.data.imageId
            ? "Call get_product to verify saved product facts and image."
            : "Call upload_product_image with productId and the verified exact-variant photo (imageUrl or imageBase64), then get_product. If unavailable or upload fails, report image setup as pending and request a photo; do not create another product.",
        },
      };
    },
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
    description: "Delete a product. Refused if it has evidence or posts.",
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
    description: "Everything needed to design a post's images (thumbnail for segment 1, explainer/data images for segments 2-3): post segments and current images, product facts and photo ID, approved evidence for charts, recent research findings (unreviewed), suggested image per segment, and sizes. Design with Claude Design, render PNG, then attach with upload_post_segment_image (or scripts/upload-segment-image.mjs for large files).",
    inputSchema: S.obj({ postId: S.str("Post ID") }, ["postId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      const post = find(s.posts, need(args, "postId"), "Post");
      const p = post.data.productId ? find(s.products, post.data.productId, "Product") : null;
      const science = /humectant|emollient|occlusive|ceramide|barrier|lapisan|studi|penelitian|riset|dibanding|\bvs\b|%|lemak|air/i;
      const segments = post.data.segments.map((text: string, index: number) => {
        const linkOnly = text.replace(/https?:\/\/\S+/g, "").trim().length < 60;
        const suggestion =
          index === 0 ? "thumbnail" : linkOnly ? "none" : index <= 2 && science.test(text) ? "explainer" : "optional";
        return { index, text, currentImageId: post.data.segmentImages?.[index] ?? null, suggestion };
      });
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
        sizes: post.data.platform === "x"
          ? { thumbnail: "1600x900", explainer: "1600x900 or 1200x1200" }
          : { thumbnail: "1080x1350", explainer: "1080x1350 or 1080x1080" },
        workflow: [
          "1. Pick images per segment (follow suggestion; at most 3).",
          "2. Design them in Claude Design (Design artifact), one artboard per image at the exact size, in the Rawatlogi style.",
          "3. Render each artboard to PNG at that size (scripts/render-image.mjs in the Rawatlogi project).",
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
    name: "get_discovery_brief",
    title: "Indonesian market discovery brief",
    description: "Start here for discovery or a first product lookup: broad article synthesis, full product facts, catalog comparison, niche/premium alternatives and product image setup.",
    inputSchema: S.obj({
      area: S.str("Optional Rawatlogi area", { enum: areaKeys }),
      focus: S.str("Optional focus, e.g. 'viral product', 'ingredient trend', 'BPOM alert', 'brand post'"),
    }),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx);
      const areaKey = typeof args.area === "string" && args.area in areas ? (args.area as keyof typeof areas) : null;
      const focus = typeof args.focus === "string" && args.focus.trim() ? args.focus.trim() : "trending Indonesian products & ingredients";
      const areaKeywords: Record<keyof typeof areas, string[]> = {
        kulit: ["skincare viral Indonesia", "tren kandungan skincare", "rekomendasi pelembap sunscreen"],
        rambut: ["haircare viral Indonesia", "tren perawatan rambut rontok ketombe", "shampoo serum rambut"],
        gigi: ["pasta gigi viral Indonesia", "perawatan gigi mulut sensitif", "rekomendasi mouthwash"],
        mata: ["tetes mata perawatan mata Indonesia", "kesehatan mata layar gadget"],
        badan: ["bodycare viral Indonesia", "body lotion sabun mandi tren", "perawatan kuku kulit tubuh"],
      };
      return {
        area: areaKey ? { key: areaKey, ...areas[areaKey] } : "all",
        focus,
        existingProducts: s.products.map((p: any) => ({
          id: p.id,
          name: p.data.name,
          variant: p.data.variant,
          category: p.data.category,
          confirmed: p.data.confirmed,
          ingredients: p.data.ingredients,
          advertisedClaims: p.data.advertisedClaims,
          price: p.data.price,
          posts: s.posts.filter((post: any) => post.data.productId === p.id).length,
        })),
        areas,
        series,
        searchHints: {
          region: "Indonesia (id)",
          sources: ["site:femaledaily.com", "site:beautyjournal.id", "site:kompas.com", "site:detik.com", "site:kumparan.com", "site:tempo.co", "site:antaranews.com", "site:cnnindonesia.com", "site:cnbcindonesia.com", "site:tirto.id", "site:liputan6.com", "site:suara.com", "site:popbela.com", "site:parapuan.co", "site:stylo.grid.id"],
          primarySources: ["Official brand product pages and packaging", "Official Indonesian stores for exact-variant prices and photos", "site:cekbpom.pom.go.id"],
          coverage: { targetArticles: 8, minimumIndependentDomains: 5, minimumArticlesPerCandidate: 2, preferredRecencyDays: 90 },
          queries: areaKey ? areaKeywords[areaKey] : Object.values(areaKeywords).flat(),
          alternativeQueries: [focus + " produk niche Indonesia", focus + " premium high end Indonesia", focus + " dermocosmetic official store Indonesia"],
        },
        productFactChecklist: ["name", "variant", "category", "manufacturerUrl", "ingredients", "advertisedClaims", "price", "commission", "notes", "image"],
        instructions: [
          "1. Search in Indonesian across multiple query angles and outlets, not just the first results. Target at least 8 inspected articles from 5 independent domains, preferably within 90 days. These are coverage targets, not permission to fabricate: disclose inaccessible pages, sparse coverage and older dates; never claim a trend based only on search snippets.",
          "2. Deduplicate syndicated stories, press releases and repeated listicles; identify sponsored content. Build a shortlist of 3-5 products using at least 2 independent articles per candidate where available. Synthesize agreements, disagreements and dates across articles rather than copying the first article's recommendations. If coverage is insufficient, label the candidate tentative and explain the gap.",
          "3. Compare candidates to existingProducts by use case, category, active ingredients and price, not name alone. Avoid exact duplicates. When similar products exist, run an additional search round for niche formulations, underserved use cases and premium/higher-priced alternatives. Include at least one differentiated niche or premium option when verified options exist, stating its closest catalog match and meaningful difference. Verify local availability and dated IDR price; higher price does not prove efficacy or commission. Never invent alternatives to meet a quota.",
          "4. At the FIRST lookup, explicitly search each candidate's exact name/variant plus ingredients/INCI/komposisi, claims/manfaat, official brand page, size, price and product photo. Inspect official brand pages, packaging and official stores; use BPOM for registration checks where accessible, not as efficacy proof. Capture manufacturerUrl, full printed ingredients, advertisedClaims (unverified marketing), category, variant and dated price. Never borrow facts or photos from another variant or market. Record source URLs, access dates, conflicts and unavailable fields in notes. Commission stays null unless supplied or verified; never invent the affiliateUrl.",
          "5. Present a cited comparison in Bahasa Indonesia: product/variant, ingredients and claims, price/date, why it merits a post, combined article evidence with URLs and publication dates, catalog overlap/differentiation, useful post angle and uncertainties. Distinguish popularity signals from scientific evidence. Ask the user which product to add and for their affiliateUrl.",
          "6. After selection and affiliateUrl, create_product with ALL verified fields and source notes. Set confirmed true only if the user explicitly confirmed the exact product/variant; otherwise false. Then upload_product_image with productId using an exact-variant photo from the official brand/store (JPEG/PNG/WebP, max 5 MB). Record the image source URL in notes. Do not generate a substitute packaging photo. If blocked or unavailable, ask for a photo and clearly report image setup pending. Do not silently stop after create_product or duplicate the product on retry.",
          "7. Call get_product to verify the saved fields and attached imageId. Report complete only after image attachment succeeds; otherwise report saved product plus pending image and missing facts. Never infer unknown ingredients or treat marketing claims as approved evidence.",
          "8. For topics without a specific product, propose a brand post or research angle aligned with Rawatlogi's series.",
        ],
      };
    },
  },
  {
    name: "get_research_brief",
    title: "Research brief",
    description: "Product facts, existing evidence, and search/analysis prompt instructions so an external AI can search scientific literature itself and save directly via create_evidence.",
    inputSchema: S.obj({
      productId: S.str("Product ID"),
      focus: S.str("Optional research focus, ingredient, or claim to investigate"),
    }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      const focus = typeof args.focus === "string" && args.focus.trim() ? args.focus.trim() : "active ingredients, advertised claims, and safety";
      return {
        product: { id: p.id, ...p.data },
        focus,
        existingEvidence: s.evidence.filter((e: any) => e.data.productId === id),
        searchHints: {
          sources: ["site:europepmc.org", "site:pubmed.ncbi.nlm.nih.gov", "site:pmc.ncbi.nlm.nih.gov"],
          guidance: "Search in English using active ingredient names, INCI terms, and study types (systematic review, meta-analysis, randomized controlled trial).",
        },
        instructions: [
          "1. Use your own web search to find real peer-reviewed publications (prefer Europe PMC or PubMed) for the product's active ingredients, advertised claims, or the requested focus. Avoid duplicating existingEvidence.",
          "2. Never fabricate citations, abstracts, or numbers—only include publications you actually retrieved and inspected.",
          "3. Write the report in Bahasa Indonesia, marking each finding's confidence ('supported', 'uncertain', 'unsupported') and explicit limitations (e.g. abstract-only, small sample, in-vitro).",
          "4. Save useful retrieved publications directly with create_evidence, including title, sourceId, url, year, authors, abstract, studyType, access, narrow claim, limitations and verdict; approved must be false. Present your synthesis to the user with citations. No session is created.",
          "5. For sources worth keeping long-term, call create_evidence (approved: false) so the user can review and approve them.",
        ],
      };
    },
  },
  {
    name: "get_writing_brief",
    title: "Writing brief",
    description: "Everything needed to write X/Threads drafts: product, approved evidence, and platform budgets for save_drafts.",
    inputSchema: S.obj({ productId: S.str("Product ID") }, ["productId"]),
    annotations: READ,
    async run(args, ctx) {
      const s = await state(ctx), id = need(args, "productId");
      const p = find(s.products, id, "Product");
      return {
        product: { id: p.id, ...p.data },
        productConfirmed: p.data.confirmed,
        approvedEvidence: s.evidence
          .filter((e: any) => e.data.productId === id && e.data.approved)
          .map((e: any) => ({ id: e.id, title: e.data.title, url: e.data.url, claim: e.data.claim, limitations: e.data.limitations, access: e.data.access })),
        platformBudgets: writingBudgets(p.data.affiliateUrl),
        workflow: "Write X and Threads drafts within platformBudgets, then call save_drafts. sourceIds may only contain approvedEvidence ids.",
      };
    },
  },
  {
    name: "save_drafts",
    title: "Save drafts",
    description: "Save drafts directly: creates one X and one Threads draft post. Validated for exact affiliate URL once per platform, affiliate disclosure in that segment, lengths, and approved evidence IDs. Product must be confirmed.",
    inputSchema: S.obj(
      {
        productId: S.str("Product ID"),
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
      ["productId", "draft"],
    ),
    annotations: WRITE,
    run: (args, ctx) => ctx.call("POST", "/api/drafts", { productId: args.productId, draft: args.draft }),
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
    description: "Create a single post manually. Leave productId empty for a brand post (no product, no affiliate link, no evidence). Prefer save_drafts for product drafts.",
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
        "WWW-Authenticate": 'Bearer realm="rawatlogi-mcp"',
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
