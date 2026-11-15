import { ChevronLeft } from "lucide-react";
import { ProductGallery } from "../components/ProductGallery";
import { TopicPlanner } from "../components/TopicPlanner";
import type { Workspace } from "../hooks/useWorkspace";
import { Empty } from "../components/ui";
export function NewSessionPage({ workspace }: { workspace: Workspace }) {
  const kind = workspace.page === "researchNew" ? "research" : "writing";
  return (
    <>
      <button
        className="text-btn back"
        onClick={() =>
          workspace.route.go(kind === "research" ? "research" : "studio")
        }
      >
        <ChevronLeft size={15} />
        Back to {kind === "research" ? "research library" : "writing studio"}
      </button>
      {workspace.selected ? (
        workspace.product ? (
          <TopicPlanner
            key={workspace.selected + kind}
            workspace={workspace}
            kind={kind}
          />
        ) : (
          <div className="panel">
            <Empty
              title="Product not found"
              action={
                <button
                  className="secondary"
                  onClick={() => workspace.setSelected("")}
                >
                  Choose another product
                </button>
              }
            >
              This product is no longer available.
            </Empty>
          </div>
        )
      ) : (
        <ProductGallery
          products={workspace.state.products}
          onSelect={workspace.setSelected}
        />
      )}
    </>
  );
}
