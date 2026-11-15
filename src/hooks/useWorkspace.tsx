import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  Package,
  PenLine,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  fromJakarta,
  jakartaDay,
  type Post,
  type RecordItem,
} from "../../shared/model";
import { PostCard } from "../components/PostCard";
import { api } from "../lib/api";
import { emptyState } from "../lib/data";
import type { Modal, Page, State } from "../types";
import { useRoute } from "./useRoute";
export function useWorkspace() {
  const route = useRoute();
  const { page, selected } = route;
  const setSelected = route.selectProduct;
  const notFound = route.notFound;

  const [state, setState] = useState<State>(emptyState),
    [modal, setModal] = useState<Modal | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [online, setOnline] = useState(false);
  const [filter, setFilter] = useState(""),
    [researchQuery, setResearchQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false),
    [angle, setAngle] = useState(""),
    [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(
      () =>
        new Date(
          jakartaDay(new Date().toISOString()).slice(0, 7) + "-01T00:00:00Z",
        ),
    ),
    [platform, setPlatform] = useState("all");
  async function refresh() {
    try {
      const next = await api<State>("/state");
      setState(next);
      setOnline(true);
      setError("");
    } catch (e) {
      setOnline(false);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  const product = state.products.find((p) => p.id === selected),
    relatedEvidence = state.evidence.filter(
      (e) => e.data.productId === selected,
    ),
    relatedPosts = state.posts.filter((p) => p.data.productId === selected);
  const getProduct = (id: string) => state.products.find((p) => p.id === id);
  function openProduct(id: string) {
    route.go("products", id);
  }
  function navigate(p: Page) {
    route.go(p, p === "products" ? "" : selected);
    setFilter("");
  }
  async function mutate(path: string, body?: unknown, method?: string) {
    setBusy(true);
    try {
      const r = await api(path, body, method);
      await refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function save(kind: string, data: unknown, record?: RecordItem<any>) {
    const result = await mutate(
      "/records/" + kind + (record ? "/" + record.id : ""),
      record ? { version: record.version, data } : data,
      record ? "PUT" : "POST",
    );
    setModal(null);
    setNotice("Saved to your workspace");
    if (kind === "product") openProduct(result.id);
  }
  async function remove(kind: string, r: RecordItem<any>) {
    if (!confirm("Delete this " + kind + "? Linked history is protected."))
      return;
    try {
      await mutate("/records/" + kind + "/" + r.id, undefined, "DELETE");
      setModal(null);
      setNotice("Record deleted");
    } catch {}
  }
  async function search() {
    if (!researchQuery.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const r = await api(
        "/research/search?q=" + encodeURIComponent(researchQuery),
      );
      setResults(r.results);
      setNotice(
        `${r.count.toLocaleString()} matching publications; showing up to 12`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  async function generate() {
    try {
      await mutate("/jobs", { productId: selected, angle });
      setNotice("Queued");
    } catch {}
  }
  // Posts open as a full page (the "Content Notebook"), not a modal.
  function newPost(date?: string) {
    route.go("postNew", selected || state.products[0]?.id || "", date ? { date } : {});
  }
  function openPost(id: string) {
    route.go("post", id);
  }
  function download() {
    window.open("/api/export", "_blank", "noopener,noreferrer");
  }
  const approved = state.evidence.filter((e) => e.data.approved).length;
  const scheduled = state.posts.filter(
    (p) => p.data.scheduledAt && p.data.status !== "published",
  ).length;
  const activeJobs = state.jobs.filter((j) =>
    ["queued", "running"].includes(j.status),
  );
  const nav = [
    ["overview", "Workspace", LayoutDashboard],
    ["products", "Products", Package],
    ["research", "Research", BookOpen],
    ["studio", "Writing", PenLine],
    ["calendar", "Calendar", CalendarDays],
  ] as const;
  const headings: Record<Page, [string]> = {
    overview: ["Workspace"],
    products: ["Products"],
    research: ["Research"],
    studio: ["Writing"],
    calendar: ["Calendar"],
    settings: ["Settings"],
    researchNew: ["New research session"],
    studioNew: ["New writing session"],
    researchSession: ["Research session"],
    studioSession: ["Writing session"],
    post: ["Content notebook"],
    postNew: ["Content notebook"],
  };
  const productsFiltered = state.products.filter((p) =>
    `${p.data.name} ${p.data.variant} ${p.data.category}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const postsFiltered = state.posts.filter(
    (p) => !selected || p.data.productId === selected,
  );
  const postCard = (p: RecordItem<Post>) => (
    <PostCard
      key={p.id}
      record={p}
      productName={p.data.productId ? getProduct(p.data.productId)?.data.name || "Product" : "Brand post"}
      onClick={() => openPost(p.id)}
    />
  );

  return {
    route,
    page,
    selected,
    setSelected,
    notFound,
    state,
    setState,
    modal,
    setModal,
    error,
    setError,
    notice,
    setNotice,
    loading,
    setLoading,
    online,
    setOnline,
    filter,
    setFilter,
    researchQuery,
    setResearchQuery,
    results,
    setResults,
    searching,
    setSearching,
    searched,
    setSearched,
    angle,
    setAngle,
    busy,
    setBusy,
    month,
    setMonth,
    platform,
    setPlatform,
    refresh,
    product,
    relatedEvidence,
    relatedPosts,
    getProduct,
    openProduct,
    navigate,
    mutate,
    save,
    remove,
    search,
    generate,
    newPost,
    openPost,
    download,
    approved,
    scheduled,
    activeJobs,
    nav,
    headings,
    productsFiltered,
    postsFiltered,
    postCard,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
