import { Download } from "lucide-react";
import type { Workspace } from "../hooks/useWorkspace";
export function SettingsPage({ workspace }: { workspace: Workspace }) {
  return (
    <div className="settings-grid">
      <section className="panel padded">
        <h2>Backup</h2>
        <button className="secondary space-top" onClick={workspace.download}>
          <Download size={16} />
          Export workspace JSON
        </button>
      </section>
    </div>
  );
}
