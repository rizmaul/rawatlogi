import { ArrowRight, BookOpen, CalendarDays, Package, PenLine, Plus } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";

export function OverviewPage({ workspace }: { workspace: Workspace }) {
  const { state, setModal, openProduct, navigate, approved, scheduled } =
    workspace;
  const recent = usePaged(state.products, 5);
  const stats = [
    [state.products.length, "Products", Package, "products"],
    [approved, "Approved claims", BookOpen, "research"],
    [
      state.posts.filter((p) => p.data.status === "draft").length,
      "Drafts",
      PenLine,
      "studio",
    ],
    [scheduled, "Scheduled", CalendarDays, "calendar"],
  ] as const;
  return (
    <>
      <section className="stats">
        {stats.map(([n, label, Icon, dest]) => (
          <button className="stat" key={label} onClick={() => navigate(dest)}>
            <Icon size={16} />
            <strong>{n}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>
      <div className="section-title">
        <h2>
          Recent products <span className="count">{state.products.length}</span>
        </h2>
        <button className="text-btn" onClick={() => navigate("products")}>
          Catalog <ArrowRight size={15} />
        </button>
      </div>
      {state.products.length ? (
        <div className="data-list">
          {recent.items.map((p) => (
            <ProductCard
              key={p.id}
              record={p}
              state={state}
              onClick={() => openProduct(p.id)}
            />
          ))}
        </div>
      ) : (
        <button
          className="secondary"
          onClick={() => setModal({ kind: "product" })}
        >
          <Plus size={16} />
          Add your first product
        </button>
      )}
      <Pagination {...recent} label="Recent product pages" />
    </>
  );
}
