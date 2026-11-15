import { Plus } from "lucide-react";
import type { Workspace } from "../hooks/useWorkspace";
import type { SessionKind } from "../../shared/sessions";
import { imageUrl } from "../../shared/images";
import { routeHref } from "../lib/routes";
import { dateTime } from "../lib/data";
import { AppLink } from "./AppLink";
import { Tag } from "./ui";
import { Pagination, usePaged } from "./Pager";
export const statusTone = (status: string) =>
  status === "completed" ? "green" : status === "failed" ? "red" : "amber";
export function SessionList({
  workspace,
  kind,
}: {
  workspace: Workspace;
  kind: SessionKind;
}) {
  const sessions = workspace.state.sessions.filter(
    (s) =>
      s.kind === kind &&
      (!workspace.selected || s.productId === workspace.selected),
  );
  const paged = usePaged(sessions, 10, workspace.selected);
  const destination = kind === "research" ? "researchSession" : "studioSession";
  return (
    <>
      <div className="section-title">
        <h2>
          Sessions <span className="count">{sessions.length}</span>
        </h2>
        <button
          className="primary"
          onClick={() =>
            workspace.route.go(
              kind === "research" ? "researchNew" : "studioNew",
            )
          }
        >
          <Plus size={15} />
          New session
        </button>
      </div>
      {sessions.length ? (
        <div className="data-list">
          {paged.items.map((session) => {
            const product = workspace.getProduct(session.productId);
            return (
              <AppLink
                key={session.id}
                className="data-row"
                href={routeHref(destination, session.id)}
                onNavigate={() => workspace.route.go(destination, session.id)}
              >
                {product?.data.imageId ? (
                  <img
                    className="thumb"
                    src={imageUrl(product.data.imageId)}
                    alt=""
                  />
                ) : (
                  <span className="thumb">{product?.data.name[0] || "?"}</span>
                )}
                <span className="grow">
                  <span className="title">{session.topic.title}</span>
                  <span className={"sub" + (session.error ? " error-text" : "")}>
                    {session.error ||
                      (session.status === "completed"
                        ? product?.data.name
                        : session.progress)}
                  </span>
                </span>
                <span className="meta">{dateTime(session.createdAt)}</span>
                <Tag tone={statusTone(session.status)}>
                  {session.status.replace("_", " ")}
                </Tag>
              </AppLink>
            );
          })}
        </div>
      ) : (
        <p className="muted">No sessions yet.</p>
      )}
      <Pagination {...paged} label="Session pages" />
    </>
  );
}
