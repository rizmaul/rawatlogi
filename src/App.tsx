import { RecordEditor } from "./components/RecordEditor";
import { WorkspaceLayout } from "./components/WorkspaceLayout";
import { useWorkspace } from "./hooks/useWorkspace";
import { CalendarPage } from "./pages/CalendarPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ResearchPage } from "./pages/ResearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StudioPage } from "./pages/StudioPage";
import { PostPage } from "./pages/PostPage";
export function App() {
  const workspace = useWorkspace();
  const pages = {
    overview: OverviewPage,
    products: ProductsPage,
    research: ResearchPage,
    studio: StudioPage,
    calendar: CalendarPage,
    settings: SettingsPage,
    post: PostPage,
    postNew: PostPage,
  };
  const PageComponent = pages[workspace.page];
  return (
    <>
      <WorkspaceLayout workspace={workspace}>
        {workspace.notFound ? (
          <NotFoundPage />
        ) : (
          <PageComponent workspace={workspace} />
        )}
      </WorkspaceLayout>
      {workspace.modal && (
        <RecordEditor
          key={
            workspace.modal.kind +
            ("record" in workspace.modal
              ? workspace.modal.record?.id || "new"
              : "new")
          }
          modal={workspace.modal}
          state={workspace.state}
          selected={workspace.selected}
          busy={workspace.busy}
          close={() => workspace.setModal(null)}
          save={workspace.save}
          remove={workspace.remove}
          notify={workspace.setNotice}
        />
      )}
    </>
  );
}
