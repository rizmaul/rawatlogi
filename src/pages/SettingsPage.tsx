import { Download } from "lucide-react";
import { APISettings } from "../components/APISettings";
import { PromptSettings } from "../components/PromptSettings";
import type { Workspace } from "../hooks/useWorkspace";
export function SettingsPage({ workspace }: { workspace: Workspace }) {
  return (
    <>
      <div className="settings-grid">
        <APISettings />
        <section className="panel padded">
          <h2>Backup</h2>
          <button className="secondary space-top" onClick={workspace.download}>
            <Download size={16} />
            Export workspace JSON
          </button>
        </section>
      </div>
      <PromptSettings />
    </>
  );
}
