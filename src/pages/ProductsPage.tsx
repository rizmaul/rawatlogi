import { Plus } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { Empty } from "../components/ui";
import { Pagination, SearchBar, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";
import { ProductDetailPage } from "./ProductDetailPage";

export function ProductsPage({ workspace }: { workspace: Workspace }) {
  const {
    selected,
    state,
    setModal,
    filter,
    setFilter,
    product,
    openProduct,
    productsFiltered,
  } = workspace;
  const paged = usePaged(productsFiltered, 15, filter);
  if (selected && !product)
    return (
      <section className="panel">
        <Empty
          title="Product not found"
          action={
            <a className="secondary" href="/products">
              Back to catalog
            </a>
          }
        >
          This product may have been deleted.
        </Empty>
      </section>
    );
  if (product) return <ProductDetailPage workspace={workspace} />;
  return (
    <>
      <div className="toolbar">
        <SearchBar
          value={filter}
          onSearch={setFilter}
          label="Search products"
          placeholder="Name, variant, or category"
        />
        <span className="muted">
          {productsFiltered.length} / {state.products.length}
        </span>
      </div>
      {paged.items.length ? (
        <div className="data-list">
          {paged.items.map((p) => (
            <ProductCard
              key={p.id}
              record={p}
              state={state}
              onClick={() => openProduct(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={filter ? "No matching products" : "No products yet"}
            action={
              !filter && (
                <button
                  className="secondary"
                  onClick={() => setModal({ kind: "product" })}
                >
                  Add a product <Plus size={16} />
                </button>
              )
            }
          >
            {filter ? "Try another search." : ""}
          </Empty>
        </div>
      )}
      <Pagination {...paged} label="Product pages" />
    </>
  );
}
