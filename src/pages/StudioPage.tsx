import { SessionList, statusTone } from "../components/SessionList";
import { Plus, RefreshCw } from "lucide-react";
import { Tag } from "../components/ui";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";
import { dateTime } from "../lib/data";

export function StudioPage({ workspace }: { workspace: Workspace }) {
  const {
    selected,
    setSelected,
    state,
    getProduct,
    mutate,
    newPost,
    activeJobs,
    postsFiltered,
    postCard,
  } = workspace;
  const posts = usePaged(postsFiltered, 10, selected);
  const jobs = usePaged(state.jobs, 10);
  return (
    <>
      <SessionList workspace={workspace} kind="writing" />
      <div className="section-title">
        <h2>
          Drafts & posts <span className="count">{postsFiltered.length}</span>
        </h2>
        <div className="row">
          {selected && (
            <button className="text-btn" onClick={() => setSelected("")}>
              Show all
            </button>
          )}
          <button
            className="secondary"
            disabled={!state.products.length}
            onClick={() => newPost()}
          >
            <Plus size={16} />
            Write manually
          </button>
        </div>
      </div>
      {postsFiltered.length ? (
        <div className="data-list">{posts.items.map(postCard)}</div>
      ) : (
        <p className="muted">No drafts yet.</p>
      )}
      <Pagination {...posts} label="Post pages" />
      <div className="section-title">
        <h2>
          Jobs <span className="count">{state.jobs.length}</span>
        </h2>
        {activeJobs.length > 0 && (
          <Tag tone="amber">{activeJobs.length} active</Tag>
        )}
      </div>
      {state.jobs.length ? (
        <div className="data-list">
          {jobs.items.map((j) => (
            <div className="data-row" key={j.id}>
              <span className="grow">
                <span className="title">
                  {getProduct(j.payload.productId)?.data.name ||
                    j.payload.kind ||
                    "Job"}
                </span>
                <span className={"sub" + (j.error ? " error-text" : "")}>
                  {j.error || j.payload.angle}
                </span>
              </span>
              <span className="meta">{dateTime(j.createdAt)}</span>
              <Tag tone={statusTone(j.status)}>{j.status}</Tag>
              {j.status === "failed" && (
                <button
                  className="secondary sm"
                  onClick={() =>
                    mutate("/jobs/" + j.id + "/retry", {}).catch(() => {})
                  }
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No jobs yet.</p>
      )}
      <Pagination {...jobs} label="Job pages" />
    </>
  );
}
