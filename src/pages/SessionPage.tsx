import { ChevronLeft, RefreshCw, BookOpen, ExternalLink } from "lucide-react";
import type { Workspace } from "../hooks/useWorkspace";
import type { ResearchReport } from "../../shared/sessions";
import { Empty, Tag } from "../components/ui";
import { Pagination, usePaged } from "../components/Pager";
import { statusTone } from "../components/SessionList";
import { imageUrl } from "../../shared/images";
export function SessionPage({ workspace }: { workspace: Workspace }) {
  const session = workspace.state.sessions.find(
    (s) => s.id === workspace.route.sessionId,
  );
  const findingPage = usePaged(
    (session?.kind === "research" && (session.result as ResearchReport | null)?.findings) || [],
    10,
    session?.id,
  );
  const sourcePage = usePaged(session?.sources ?? [], 10, session?.id);
  if (!session)
    return (
      <section className="panel">
        <Empty title="Session not found">
          Return to the library or studio to choose a session.
        </Empty>
      </section>
    );
  const product = workspace.getProduct(session.productId);
  const report =
    session.kind === "research"
      ? (session.result as ResearchReport | null)
      : null;
  const posts =
    session.kind === "writing" && session.result && "postIds" in session.result
      ? workspace.state.posts.filter((p) =>
          (session.result as { postIds: string[] }).postIds.includes(p.id),
        )
      : [];
  return (
    <>
      <button
        className="text-btn back"
        onClick={() =>
          workspace.route.go(
            session.kind === "research" ? "research" : "studio",
            session.productId,
          )
        }
      >
        <ChevronLeft size={15} />
        Back to{" "}
        {session.kind === "research" ? "research library" : "writing studio"}
      </button>
      <section className="panel padded session-heading">
        <div className="row between">
          <div>
            <Tag tone={statusTone(session.status)}>
              {session.status.replace("_", " ")}
            </Tag>
            <h2 className="space-top">{session.topic.title}</h2>
            <p>{session.topic.question}</p>
            <p className="muted">{session.progress}</p>
          </div>
          {product?.data.imageId && (
            <img
              className="session-hero-image"
              src={imageUrl(product.data.imageId)}
              alt={product.data.name}
            />
          )}
        </div>
        <p className="muted">
          {product?.data.name || "Product unavailable"}
          {session.result?.execution &&
            ` · ${session.result.execution.model} (${session.result.execution.effort})`}
          {session.result?.author && ` · by ${session.result.author}`}
        </p>
        {session.guidance && (
          <details>
            <summary>Your guidance</summary>
            <p>{session.guidance}</p>
          </details>
        )}
        {session.error && <div className="banner error">{session.error}</div>}
        {session.status === "failed" && (
          <button
            className="secondary"
            onClick={() =>
              workspace
                .mutate("/sessions/" + session.id + "/retry", {})
                .catch(() => {})
            }
          >
            <RefreshCw size={15} />
            Retry session
          </button>
        )}
      </section>
      {report && (
        <>
          <section className="panel padded report-summary">
            <div className="row between">
              <h2>Research briefing</h2>
            </div>
            <p className="preserve-lines">{report.summary}</p>
            {report.warnings.map((w, i) => (
              <p className="warning-note" key={i}>
                {w}
              </p>
            ))}
          </section>
          <div className="section-title">
            <h2>
              Findings <span className="count">{report.findings.length}</span>
            </h2>
          </div>
          <div className="data-list">
          {findingPage.items.map((finding, index) => (
            <div className="data-row block" key={index}>
              <div className="row between">
                <strong>{finding.claim}</strong>
                <Tag
                  tone={finding.confidence === "supported" ? "green" : "amber"}
                >
                  {finding.confidence}
                </Tag>
              </div>
              <p className="sub wrap">{finding.limitations}</p>
              <div className="source-links">
                {finding.sourceIds.map((id) => {
                  const source = session.sources.find((s) => s.sourceId === id);
                  return source ? (
                    <a
                      key={id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title} <ExternalLink size={12} />
                    </a>
                  ) : null;
                })}
              </div>
            </div>
          ))}
          </div>
          <Pagination {...findingPage} label="Finding pages" />
          {report.nextSteps.length > 0 && (
            <section className="panel padded">
              <h3>Next steps</h3>
              <ul>
                {report.nextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {posts.length > 0 && (
        <>
          <div className="section-title">
            <h2>Generated drafts</h2>
          </div>
          <div className="data-list">{posts.map(workspace.postCard)}</div>
        </>
      )}
      {session.kind === "research" && session.sources.length > 0 && (
        <>
          <div className="section-title">
            <h2>
              Retrieved publications{" "}
              <span className="count">{session.sources.length}</span>
            </h2>
          </div>
          <div className="data-list">
            {sourcePage.items.map((source) => (
              <div className="data-row" key={source.sourceId}>
                <span className="grow">
                  <a
                    className="title"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    title={source.abstract ? source.abstract.slice(0, 600) : undefined}
                  >
                    {source.title} <ExternalLink size={12} />
                  </a>
                  <span className="sub">{source.authors}</span>
                </span>
                <span className="meta">{source.year}</span>
                {!source.abstract && <Tag tone="amber">Metadata only</Tag>}
                <button
                  className="secondary sm"
                  onClick={() =>
                    workspace.setModal({
                      kind: "evidence",
                      initial: {
                        productId: session.productId,
                        title: source.title,
                        url: source.url,
                        sourceId: source.sourceId,
                        year: source.year,
                        authors: source.authors,
                        abstract: source.abstract,
                        studyType: source.studyType,
                        access: "abstract",
                        approved: false,
                        verdict: "unreviewed",
                        limitations: source.abstract
                          ? "Abstract only; applicability to this product requires review."
                          : "Only bibliographic metadata was retrieved. Read the source before approving a claim.",
                      },
                    })
                  }
                >
                  <BookOpen size={13} />
                  Review & link
                </button>
              </div>
            ))}
          </div>
          <Pagination {...sourcePage} label="Source pages" />
        </>
      )}
    </>
  );
}
