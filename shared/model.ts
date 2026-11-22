import { z } from "zod";
import { areaKeys, evidenceLevelKeys, seriesKeys, evidenceLevelIssue, type Area, type EvidenceLevel, type Series } from "./brand.ts";
const areaEnum = z.enum(areaKeys as [Area, ...Area[]]);
const evidenceLevelEnum = z.enum(evidenceLevelKeys as [EvidenceLevel, ...EvidenceLevel[]]);
const seriesEnum = z.enum(seriesKeys as [Series, ...Series[]]);

export const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL");
const text = z.string().trim();
export const productSchema = z.object({
  name: text.min(1).max(180),
  variant: text.max(180).default(""),
  category: z.enum(["Skincare", "Haircare", "Bodycare", "Makeup", "Other"]),
  affiliateUrl: httpUrl,
  manufacturerUrl: z.union([httpUrl, z.literal("")]).default(""),
  ingredients: text.max(12000).default(""),
  advertisedClaims: text.max(6000).default(""),
  notes: text.max(6000).default(""),
  price: z.number().nonnegative().nullable().default(null),
  commission: z.number().min(0).max(100).nullable().default(null),
  confirmed: z.boolean().default(false),
  imageId: z.string().uuid().nullable().default(null),
});
export const evidenceSchema = z
  .object({
    productId: text.min(1),
    title: text.min(1).max(1000),
    url: httpUrl,
    sourceId: text.max(100).default(""),
    year: text.max(12).default(""),
    authors: text.max(3000).default(""),
    abstract: text.max(40000).default(""),
    access: z.enum(["abstract", "full-text"]).default("abstract"),
    studyType: text.max(250).default(""),
    claim: text.max(6000).default(""),
    limitations: text.max(6000).default(""),
    verdict: z
      .enum(["unreviewed", "supported", "uncertain", "unsupported"])
      .default("unreviewed"),
    approved: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.approved && (v.verdict !== "supported" || !v.claim || !v.limitations))
      ctx.addIssue({
        code: "custom",
        message: "Approval requires a supported claim and recorded limitations",
      });
  });
export const postSchema = z
  .object({
    // Empty = a brand post (e.g. the Rawatlogi introduction): no product, no affiliate link, no evidence.
    productId: text.default(""),
    title: text.min(1).max(250),
    platform: z.enum(["x", "threads"]),
    segments: z.array(text.min(1).max(10000)).min(1).max(12),
    // Optional image per segment, aligned by index (null = no image).
    segmentImages: z.array(z.string().uuid().nullable()).max(12).default([]),
    sourceIds: z.array(text).max(30).default([]),
    // Rawatlogi design-system labels shown on images and used for hashtags.
    area: areaEnum.nullable().default(null),
    evidenceLevel: evidenceLevelEnum.nullable().default(null),
    series: seriesEnum.nullable().default(null),
    status: z.enum(["draft", "approved", "published"]).default("draft"),
    scheduledAt: z.string().datetime().nullable().default(null),
    publishedUrl: z.union([httpUrl, z.literal("")]).default(""),
    publishedAt: z.string().datetime().nullable().default(null),
    warnings: z.array(text.max(2000)).max(30).default([]),
  })
  .superRefine((v, ctx) => {
    const levelIssue = evidenceLevelIssue(v.evidenceLevel, v.sourceIds);
    if (v.status !== "draft" && levelIssue)
      ctx.addIssue({ code: "custom", message: "Level bukti: " + levelIssue });
    if (v.segmentImages.length > v.segments.length)
      ctx.addIssue({
        code: "custom",
        message: "There are more segment images than segments",
      });
    if (
      v.status !== "draft" &&
      v.segments.some(
        (s) => weightedLength(s, v.platform) > limitFor(v.platform),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "A segment exceeds the platform length limit",
      });
    if (v.status !== "draft" && v.productId && !v.segments.some(hasDisclosure))
      ctx.addIssue({
        code: "custom",
        message: "Include a clear affiliate disclosure before approval",
      });
    if (v.status === "published" && !v.publishedUrl)
      ctx.addIssue({
        code: "custom",
        message: "Record the published post URL",
      });
  });
export type Product = z.infer<typeof productSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Post = z.infer<typeof postSchema>;
export type RecordItem<T> = {
  id: string;
  data: T;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export function limitFor(platform: "x" | "threads") {
  return platform === "x" ? 280 : 500;
}
// Conservative estimate: URLs count as 23 for X; non-ASCII characters count as 2.
export function weightedLength(value: string, platform: "x" | "threads") {
  if (platform === "threads") return Array.from(value).length;
  return Array.from(value.replace(/https?:\/\/[^\s]+/g, "a".repeat(23))).reduce(
    (sum, c) => sum + (c.codePointAt(0)! > 0x10ff ? 2 : 1),
    0,
  );
}
export function hasDisclosure(value: string) {
  return /\b(afiliasi|affiliate)\b/i.test(value);
}
export const draftResultSchema = z
  .object({
    title: text.min(1).max(250),
    x: z.array(text.min(1).max(10000)).min(1).max(12),
    threads: z.array(text.min(1).max(10000)).min(1).max(12),
    sourceIds: z.array(text).max(30),
    warnings: z.array(text.max(2000)).max(30),
    // Rawatlogi design-system labels (optional for older clients).
    area: areaEnum.optional(),
    evidenceLevel: evidenceLevelEnum.optional(),
    series: seriesEnum.optional(),
  })
  .strict();
export type DraftResult = z.infer<typeof draftResultSchema>;
export function jakartaInput(iso: string | null) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function fromJakarta(value: string) {
  if (!value) return null;
  return new Date(value + ":00+07:00").toISOString();
}
export function jakartaDay(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
}
