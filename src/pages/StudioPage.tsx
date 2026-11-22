import { Plus } from "lucide-react";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";

export function StudioPage({ workspace }: { workspace: Workspace }) {
  const {
    selected,
    setSelected,
    state,
    newPost,
    postsFiltered,
    postCard,
  } = workspace;
  const posts = usePaged(postsFiltered, 10, selected);
  return (
    <>
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
    </>
  );
}
