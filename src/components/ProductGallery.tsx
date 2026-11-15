import { useState } from "react";
import type { Product, RecordItem } from "../../shared/model";
import { imageUrl } from "../../shared/images";
import { searchProducts } from "../lib/catalog";
import { Pagination, SearchBar, usePaged } from "./Pager";
export function ProductGallery({
  products,
  onSelect,
}: {
  products: RecordItem<Product>[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const paged = usePaged(searchProducts(products, query), 12, query);
  return (
    <>
      <div className="toolbar">
        <h2>Select a product</h2>
        <SearchBar
          value={query}
          onSearch={setQuery}
          label="Search product catalog"
          placeholder="Name, variant, or category"
        />
      </div>
      {paged.items.length ? (
        <div className="selection-grid">
          {paged.items.map((p) => (
            <button
              key={p.id}
              className="selection-card"
              onClick={() => onSelect(p.id)}
            >
              <div className="selection-image">
                {p.data.imageId ? (
                  <img src={imageUrl(p.data.imageId)} alt="" />
                ) : (
                  <span>{p.data.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="grow">
                <h3>{p.data.name}</h3>
                <p>
                  {[p.data.variant, p.data.category].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No matching products.</p>
      )}
      <Pagination {...paged} label="Product pages" />
    </>
  );
}
