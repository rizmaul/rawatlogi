import { test } from "node:test";
import assert from "node:assert/strict";
import { imageContentType, imageUrl } from "../shared/images";
import { productSchema } from "../shared/model";
test("image byte signatures distinguish supported formats from misleading types", () => {
  assert.equal(
    imageContentType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(
    imageContentType(new Uint8Array([255, 216, 255, 224])),
    "image/jpeg",
  );
  assert.equal(
    imageContentType(new TextEncoder().encode("RIFF0000WEBP")),
    "image/webp",
  );
  assert.equal(
    imageContentType(new TextEncoder().encode('<svg onload="bad">')),
    null,
  );
  assert.equal(imageContentType(new Uint8Array()), null);
});
test("existing products remain valid without an image; storage keys must be UUIDs", () => {
  const p = {
    name: "Test",
    category: "Skincare",
    affiliateUrl: "https://example.com/test",
  };
  assert.equal(productSchema.parse(p).imageId, null);
  assert.equal(
    productSchema.safeParse({ ...p, imageId: "../other-file" }).success,
    false,
  );
  assert.equal(imageUrl("abc"), "/api/images/abc");
});
