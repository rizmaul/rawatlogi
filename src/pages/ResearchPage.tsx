import { ExternalLink, Plus } from "lucide-react";
import { Tag } from "../components/ui";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";

export function ResearchPage({ workspace }: { workspace: Workspace }) {
  const { selected, state, setModal, results, searching, searched, getProduct } =
    workspace;
  const evidence = state.evidence.filter(
    (e) => !selected || e.data.productId === selected,
  );
  const evidencePage = usePaged(evidence, 10, selected);
  const resultPage = usePaged(results, 10, results);
  return (
    <>
      {searched && (
        <>
          <div className="section-title">
            <h2>
              Publication results <span className="count">{results.length}</span>
            </h2>
          </div>
          {results.length ? (
            <div className="data-list">
              {resultPage.items.map((r) => (
                <div className="data-row" key={r.sourceId}>
                  <span className="grow">
                    <a
                      className="title"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.title} <ExternalLink size={12} />
                    </a>
                    <span className="sub">{r.authors}</span>
                  </span>
                  <span className="meta">{r.year}</span>
                  {!r.abstract && <Tag tone="amber">Metadata only</Tag>}
                  <button
                    className="secondary sm"
                    disabled={!selected}
                    onClick={() =>
                      setModal({
                        kind: "evidence",
                        initial: { ...r, productId: selected, access: "abstract" },
                      })
                    }
                  >
                    Review & link
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !searching && <p className="muted">No results.</p>
          )}
          <Pagination {...resultPage} label="Publication pages" />
        </>
      )}
      <div className="section-title">
        <h2>
          Saved evidence <span className="count">{evidence.length}</span>
        </h2>
        <button
          className="secondary"
          disabled={!state.products.length}
          onClick={() =>
            setModal({
              kind: "evidence",
              initial: { productId: selected || state.products[0]?.id },
            })
          }
        >
          <Plus size={16} />
          Add source
        </button>
      </div>
      {evidence.length ? (
        <div className="data-list">
          {evidencePage.items.map((e) => (
            <button
              className="data-row"
              key={e.id}
              onClick={() => setModal({ kind: "evidence", record: e })}
            >
              <span className="grow">
                <span className="title">{e.data.title}</span>
                <span className="sub">{e.data.claim || "—"}</span>
              </span>
              {!selected && (
                <span className="meta hide-sm">
                  {getProduct(e.data.productId)?.data.name}
                </span>
              )}
              <span className="meta">
                {e.data.year}
                {e.data.access === "abstract" ? " · abstract" : " · full text"}
              </span>
              <Tag tone={e.data.approved ? "green" : "amber"}>
                {e.data.approved ? "approved" : e.data.verdict}
              </Tag>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No saved evidence.</p>
      )}
      <Pagination {...evidencePage} label="Evidence pages" />
    </>
  );
}
