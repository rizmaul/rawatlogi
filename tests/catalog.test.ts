import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogPage } from "../src/lib/catalog";
import { productSchema, type RecordItem, type Product } from "../shared/model";
test("product chooser paginates search matches and clamps empty/out-of-range pages", () => {
  const products: RecordItem<Product>[] = Array.from(
    { length: 19 },
    (_, i) => ({
      id: String(i),
      data: productSchema.parse({
        name: "Product " + i,
        variant: i % 2 ? "100 ml" : "30 ml",
        category: i % 2 ? "Haircare" : "Skincare",
        affiliateUrl: "https://example.com/" + i,
      }),
      version: 1,
      createdAt: "",
      updatedAt: "",
    }),
  );
  assert.equal(catalogPage(products, "", 1).items.length, 8);
  assert.equal(catalogPage(products, "", 2).items[0].id, "8");
  assert.equal(catalogPage(products, "", 3).items.length, 3);
  assert.equal(catalogPage(products, "100 ml", 1).count, 9);
  assert.equal(catalogPage(products, "haircare", 2).items.length, 1);
  assert.equal(catalogPage(products, "not-found", 99).current, 1);
  assert.equal(catalogPage(products, "", -5).current, 1);
});
