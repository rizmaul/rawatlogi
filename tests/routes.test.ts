import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHref } from "../src/lib/routes";
test("new-session and session-detail URLs preserve their context", () => {
  assert.equal(parseRoute("/research/new", "?product=abc").page, "researchNew");
  assert.equal(parseRoute("/studio/new", "?product=abc").selected, "abc");
  assert.equal(routeHref("researchNew", "abc"), "/research/new?product=abc");
  assert.equal(
    parseRoute("/research/sessions/session-1").sessionId,
    "session-1",
  );
  assert.equal(parseRoute("/studio/sessions/session-2").page, "studioSession");
  assert.equal(routeHref("studioSession", "s1"), "/studio/sessions/s1");
});
test("each workspace section has a distinct directly loadable path", () => {
  for (const [page, path] of [
    ["overview", "/"],
    ["products", "/products"],
    ["research", "/research"],
    ["studio", "/studio"],
    ["calendar", "/calendar"],
    ["settings", "/settings"],
  ] as const) {
    assert.equal(routeHref(page), path);
    assert.equal(parseRoute(path).page, page);
    assert.equal(parseRoute(path).notFound, false);
  }
});
test("product detail paths preserve exact identity", () => {
  assert.equal(routeHref("products", "product 42"), "/products/product%2042");
  assert.deepEqual(parseRoute("/products/product%2042"), {
    page: "products",
    selected: "product 42",
    notFound: false,
  });
  assert.equal(parseRoute("/products/abc/extra").notFound, true);
  assert.equal(parseRoute("/products/%ZZ").notFound, true);
});
test("research and studio URLs preserve selected product across reloads", () => {
  assert.equal(routeHref("research", "p&2"), "/research?product=p%262");
  assert.equal(parseRoute("/research", "?product=p%262").selected, "p&2");
  assert.equal(parseRoute("/studio", "?product=p%262").selected, "p&2");
  assert.equal(parseRoute("/products", "?product=ignore").selected, "");
});
test("trailing slashes resolve and unknown routes show not found", () => {
  assert.equal(parseRoute("/calendar/").page, "calendar");
  assert.equal(parseRoute("/does-not-exist").notFound, true);
});
