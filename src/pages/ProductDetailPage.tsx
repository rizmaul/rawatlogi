import {
  ArrowRight,
  ChevronLeft,
  ExternalLink,
  PenLine,
  Plus,
  Sparkles,
} from "lucide-react";
import { Tag } from "../components/ui";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";
import { dateTime, rupiah } from "../lib/data";
import { imageUrl } from "../../shared/images";
export function ProductDetailPage({ workspace }: { workspace: Workspace }) {
  const {
    setSelected,
    setModal,
    platform,
    product,
    relatedEvidence,
    relatedPosts,
    navigate,
    newPost,
    approved,
  } = workspace;
  const evidencePage = usePaged(relatedEvidence, 5, product?.id);
  const postPage = usePaged(relatedPosts, 5, product?.id);
  if (!product) return null;
  return (
    <>
      <button className="text-btn back" onClick={() => setSelected("")}>
        <ChevronLeft size={16} />
        All products
      </button>
      <div className="product-hero">
        <div className="product-monogram">
          {product.data.imageId ? (
            <img
              className="detail-product-image"
              src={imageUrl(product.data.imageId)}
              alt={product.data.name}
            />
          ) : (
            product.data.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <div className="row">
            <Tag>{product.data.category}</Tag>
            <Tag tone={product.data.confirmed ? "green" : "amber"}>
              {product.data.confirmed
                ? "Product confirmed"
                : "Needs confirmation"}
            </Tag>
          </div>
          <h2>{product.data.name}</h2>
          <p>
            {product.data.variant || "Variant not recorded"}{" "}
            <span className="slash">/</span> {rupiah(product.data.price)}
          </p>
          <a href={product.data.affiliateUrl} target="_blank" rel="noreferrer">
            Open affiliate link <ExternalLink size={14} />
          </a>
        </div>
        <button
          className="secondary"
          onClick={() => setModal({ kind: "product", record: product })}
        >
          <PenLine size={15} />
          Edit details
        </button>
      </div>
      <div className="detail-layout">
        <div>
          <section className="panel padded">
            <dl>
              <dt>Ingredients / composition</dt>
              <dd>
                {product.data.ingredients || "Not recorded"}
              </dd>
              <dt>
                Advertised claims (unverified)
              </dt>
              <dd>{product.data.advertisedClaims || "No claims recorded."}</dd>
              <dt>Manufacturer source</dt>
              <dd>
                {product.data.manufacturerUrl ? (
                  <a
                    href={product.data.manufacturerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source <ExternalLink size={13} />
                  </a>
                ) : (
                  "Not recorded"
                )}
              </dd>
              <dt>Affiliate commission</dt>
              <dd>
                {product.data.commission === null
                  ? "Unknown"
                  : `${product.data.commission}%`}
              </dd>
              <dt>Your notes</dt>
              <dd>{product.data.notes || "—"}</dd>
            </dl>
          </section>
          <section className="panel padded">
            <div className="section-title">
              <h2>
                Linked evidence{" "}
                <span className="count">{relatedEvidence.length}</span>
              </h2>
              <button
                className="text-btn"
                onClick={() => {
                  navigate("research");
                }}
              >
                Find research <ArrowRight size={14} />
              </button>
            </div>
            {relatedEvidence.length ? (
              <div className="data-list">
                {evidencePage.items.map((e) => (
                  <button
                    className="data-row"
                    key={e.id}
                    onClick={() => setModal({ kind: "evidence", record: e })}
                  >
                    <span className="grow">
                      <span className="title">{e.data.title}</span>
                      <span className="sub">
                        {e.data.year} ·{" "}
                        {e.data.access === "abstract" ? "abstract" : "full text"}
                      </span>
                    </span>
                    <Tag tone={e.data.approved ? "green" : "amber"}>
                      {e.data.approved ? "approved" : e.data.verdict}
                    </Tag>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No linked sources.</p>
            )}
            <Pagination {...evidencePage} label="Linked evidence pages" />
          </section>
        </div>
        <div>
          <section className="panel padded">
            <div className="section-title">
              <h2>Connected content</h2>
              <button
                className="icon-btn"
                title="New post"
                onClick={() => newPost()}
              >
                <Plus size={17} />
              </button>
            </div>
            {relatedPosts.length ? (
              <div className="data-list">
                {postPage.items.map((p) => (
                  <button
                    className="data-row"
                    onClick={() => workspace.openPost(p.id)}
                    key={p.id}
                  >
                    <span className={"platform small " + p.data.platform}>
                      {p.data.platform === "x" ? "𝕏" : "@"}
                    </span>
                    <span className="grow">
                      <span className="title">{p.data.title}</span>
                      <span className="sub">
                        {p.data.scheduledAt
                          ? dateTime(p.data.scheduledAt) + " WIB"
                          : "Not scheduled"}
                      </span>
                    </span>
                    <Tag>{p.data.status}</Tag>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No posts.</p>
            )}
            <Pagination {...postPage} label="Connected post pages" />
            <button className="primary full" onClick={() => navigate("studio")}>
              <Sparkles size={16} />
              Open writing studio
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
