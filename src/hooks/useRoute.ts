import { useEffect, useState } from "react";
import { parseRoute, routeHref } from "../lib/routes";
import type { Page } from "../types";
export function useRoute() {
  const read = () =>
    parseRoute(window.location.pathname, window.location.search);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const titles: Record<Page, string> = {
      overview: "Workspace",
      products: route.selected ? "Product details" : "Product catalog",
      research: "Research library",
      studio: "Writing studio",
      calendar: "Posting calendar",
      settings: "Workspace settings",
      post: "Post",
      postNew: "New post",
    };
    document.title =
      (route.notFound ? "Page not found" : titles[route.page]) + " — Rawatlogi";
  }, [route.page, route.selected, route.notFound]);
  useEffect(() => {
    const pop = () => setRoute(read());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function go(page: Page, productId = "", query: Record<string, string> = {}) {
    const href = routeHref(page, productId, query);
    if (window.location.pathname + window.location.search !== href)
      window.history.pushState(null, "", href);
    setRoute(read());
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function selectProduct(id: string) {
    if (
      ["products", "research", "studio", "researchNew", "studioNew", "postNew"].includes(
        route.page,
      )
    )
      go(route.page, id);
    else setRoute((r) => ({ ...r, selected: id }));
  }
  return { ...route, go, selectProduct };
}
