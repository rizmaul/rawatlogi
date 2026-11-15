import { test } from "node:test";
import assert from "node:assert/strict";
import {
  productSchema,
  evidenceSchema,
  postSchema,
  draftResultSchema,
  weightedLength,
  jakartaDay,
  jakartaInput,
  fromJakarta,
} from "../shared/model";
test("affiliate and source URLs reject executable protocols", () => {
  assert.equal(
    productSchema.safeParse({
      name: "Test",
      affiliateUrl: "javascript:alert(1)",
      category: "Skincare",
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      name: "Test",
      affiliateUrl: "https://s.shopee.co.id/test",
      category: "Skincare",
    }).success,
    true,
  );
});
test("a claim cannot be approved without a supported verdict and limitations", () => {
  const e = {
    productId: "p",
    title: "Study",
    url: "https://pubmed.ncbi.nlm.nih.gov/1/",
    approved: true,
  };
  assert.equal(evidenceSchema.safeParse(e).success, false);
  assert.equal(
    evidenceSchema.safeParse({
      ...e,
      claim: "Specific finding",
      limitations: "Ingredient evidence; formulation may differ",
      verdict: "supported",
    }).success,
    true,
  );
  assert.equal(
    evidenceSchema.safeParse({
      ...e,
      claim: "Specific finding",
      limitations: "Limitations",
      verdict: "uncertain",
    }).success,
    false,
  );
});
test("drafts may be long, approval enforces length and affiliate disclosure", () => {
  const post = {
    productId: "p",
    title: "Title",
    platform: "x",
    segments: ["a".repeat(290)],
  };
  assert.equal(postSchema.safeParse(post).success, true);
  assert.equal(
    postSchema.safeParse({ ...post, status: "approved" }).success,
    false,
  );
  assert.equal(
    postSchema.safeParse({
      ...post,
      segments: ["Tautan afiliasi: https://example.com/long-path"],
      status: "approved",
    }).success,
    true,
  );
  assert.equal(
    postSchema.safeParse({
      ...post,
      segments: ["Read this product"],
      status: "approved",
    }).success,
    false,
  );
});
test("published posts require a URL and traceable product", () => {
  const post = {
    productId: "p",
    title: "Title",
    platform: "threads",
    segments: ["Tautan afiliasi"],
    status: "published",
  };
  assert.equal(postSchema.safeParse(post).success, false);
  assert.equal(
    postSchema.safeParse({
      ...post,
      publishedUrl: "https://www.threads.net/@example/post/123",
    }).success,
    true,
  );
});
test("X links use fixed estimated length; Threads keeps literal length", () => {
  assert.equal(
    weightedLength("https://example.com/very-long-product-affiliate-url", "x"),
    23,
  );
  assert.equal(weightedLength("abc", "threads"), 3);
  assert.equal(weightedLength("😀", "x"), 2);
});
test("Jakarta scheduling preserves day across UTC midnight", () => {
  assert.equal(fromJakarta("2026-11-10T01:30"), "2026-11-09T18:30:00.000Z");
  assert.equal(jakartaDay("2026-11-09T18:30:00.000Z"), "2026-11-10");
  assert.equal(jakartaInput("2026-11-09T18:30:00.000Z"), "2026-11-10T01:30");
  assert.equal(fromJakarta(""), null);
});
test("generation result requires both platforms and explicit source IDs", () => {
  assert.equal(
    draftResultSchema.safeParse({
      title: "Test",
      x: ["a"],
      threads: ["b"],
      sourceIds: [],
      warnings: [],
    }).success,
    true,
  );
  assert.equal(
    draftResultSchema.safeParse({
      title: "Test",
      x: ["a"],
      threads: [],
      sourceIds: [],
      warnings: [],
    }).success,
    false,
  );
});
