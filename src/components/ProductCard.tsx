import type { Product, RecordItem } from "../../shared/model";
import { rupiah } from "../lib/data";
import type { State } from "../types";
import { Tag } from "./ui";
import { AppLink } from "./AppLink";
import { routeHref } from "../lib/routes";
import { imageUrl } from "../../shared/images";
export function ProductCard({
  record: r,
  state,
  onClick,
}: {
  record: RecordItem<Product>;
  state: State;
  onClick: () => void;
}) {
  const e = state.evidence.filter((e) => e.data.productId === r.id).length,
    p = state.posts.filter((p) => p.data.productId === r.id).length;
  return (
    <AppLink
      href={routeHref("products", r.id)}
      className="data-row"
      onNavigate={onClick}
    >
      {r.data.imageId ? (
        <img
          className="thumb lg"
          src={imageUrl(r.data.imageId)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="thumb lg">{r.data.name.slice(0, 1).toUpperCase()}</span>
      )}
      <span className="grow">
        <span className="title">{r.data.name}</span>
        <span className="sub">
          {[r.data.variant, r.data.category].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="meta hide-sm">{rupiah(r.data.price)}</span>
      <span className="meta">
        {e} src · {p} posts
      </span>
      {!r.data.confirmed && <Tag tone="amber">To verify</Tag>}
    </AppLink>
  );
}
