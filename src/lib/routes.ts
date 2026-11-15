import type { Page } from "../types";
export type Route = {
  page: Page;
  selected: string;
  notFound: boolean;
  sessionId?: string;
  postId?: string;
};
const paths: Record<Page, string> = {
  overview: "/",
  products: "/products",
  research: "/research",
  studio: "/studio",
  calendar: "/calendar",
  settings: "/settings",
  researchNew: "/research/new",
  studioNew: "/studio/new",
  researchSession: "/research/sessions",
  studioSession: "/studio/sessions",
  post: "/studio/posts",
  postNew: "/studio/posts/new",
};
// For session and post pages the second argument is that record's ID.
export function routeHref(page: Page, productId = "", params: Record<string, string> = {}) {
  if (page === "researchSession" || page === "studioSession" || page === "post")
    return paths[page] + "/" + encodeURIComponent(productId);
  if (page === "postNew") {
    const q = new URLSearchParams({ ...(productId ? { product: productId } : {}), ...params }).toString();
    return paths.postNew + (q ? "?" + q : "");
  }
  if (page === "products")
    return productId
      ? "/products/" + encodeURIComponent(productId)
      : "/products";
  const query =
    productId &&
    ["research", "studio", "researchNew", "studioNew"].includes(page)
      ? "?product=" + encodeURIComponent(productId)
      : "";
  return paths[page] + query;
}
export function parseRoute(pathname: string, search = ""): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  const selected = new URLSearchParams(search).get("product") || "";
  if (path === "/studio/posts/new")
    return { page: "postNew", selected, notFound: false };
  const post = path.match(/^\/studio\/posts\/([^/]+)$/);
  if (post) {
    try {
      return { page: "post", selected: "", postId: decodeURIComponent(post[1]), notFound: false };
    } catch {}
  }
  const session = path.match(/^\/(research|studio)\/sessions\/([^/]+)$/);
  if (session) {
    try {
      return {
        page: session[1] === "research" ? "researchSession" : "studioSession",
        selected: "",
        sessionId: decodeURIComponent(session[2]),
        notFound: false,
      };
    } catch {}
  }
  if (path.startsWith("/products/")) {
    const id = path.slice("/products/".length);
    try {
      if (!id.includes("/"))
        return {
          page: "products",
          selected: decodeURIComponent(id),
          notFound: false,
        };
    } catch {}
  }
  const page = (Object.entries(paths) as [Page, string][]).find(
    ([, v]) => v === path,
  )?.[0];
  return page
    ? { page, selected: page === "products" ? "" : selected, notFound: false }
    : { page: "overview", selected: "", notFound: true };
}
