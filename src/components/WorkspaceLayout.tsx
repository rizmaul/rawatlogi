import {
  AlertCircle,
  Check,
  Leaf,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Workspace } from "../hooks/useWorkspace";
import { Empty } from "./ui";
import { AppLink } from "./AppLink";
import { routeHref } from "../lib/routes";

export function WorkspaceLayout({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: ReactNode;
}) {
  const {
    page,
    setModal,
    error,
    setError,
    notice,
    loading,
    online,
    refresh,
    navigate,
    scheduled,
    nav,
    headings,
  } = workspace;
  return (
    <div className="app">
      <aside className="sidebar">
        <AppLink
          href="/"
          className="brand"
          onNavigate={() => navigate("overview")}
        >
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          rawatlogi<span className="brand-dot">.</span>
        </AppLink>
        {/* Phone header actions (the desktop top bar is hidden on small screens). */}
        <div className="mobile-actions">
          <span
            className={"status-dot " + (online ? "on" : "")}
            title={online ? "API connected" : "API not reachable"}
          />
          <button className="icon-btn" aria-label="Refresh workspace" onClick={refresh}>
            <RefreshCw size={17} />
          </button>
        </div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <AppLink
              key={key}
              href={routeHref(
                key,
                key === "products" ? "" : workspace.selected,
              )}
              className={
                page === key ||
                (key === "research" && page.startsWith("research")) ||
                (key === "studio" && (page.startsWith("studio") || page.startsWith("post")))
                  ? "active"
                  : ""
              }
              onNavigate={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
              {key === "calendar" && scheduled > 0 && (
                <span className="nav-count">{scheduled}</span>
              )}
            </AppLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <AppLink
            href="/settings"
            onNavigate={() => navigate("settings")}
            className={page === "settings" ? "active" : ""}
          >
            <Settings2 size={18} />
            Settings
          </AppLink>
        </div>
      </aside>
      {/* Phone navigation: fixed bottom tab bar. */}
      <nav className="mobile-tabbar" aria-label="Main">
        {[...nav, ["settings", "Settings", Settings2] as const].map(([key, label, Icon]) => (
          <AppLink
            key={key}
            href={routeHref(key, key === "products" || key === "settings" ? "" : workspace.selected)}
            className={
              page === key ||
              (key === "research" && page.startsWith("research")) ||
              (key === "studio" && (page.startsWith("studio") || page.startsWith("post")))
                ? "active"
                : ""
            }
            onNavigate={() => navigate(key)}
          >
            <Icon size={19} />
            <span>{label}</span>
            {key === "calendar" && scheduled > 0 && <span className="nav-count">{scheduled}</span>}
          </AppLink>
        ))}
      </nav>
      <main>
        <header className="topbar">
          <span />
          <div className="row">
            <span
              className={"status-dot " + (online ? "on" : "")}
              title={online ? "API connected" : "API not reachable"}
            />
            <button
              className="icon-btn"
              title="Refresh workspace"
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{headings[page][0]}</h1>
            </div>
            <button
              className="primary"
              aria-label="Add product"
              onClick={() => setModal({ kind: "product" })}
            >
              <Plus size={17} />
              <span className="hide-sm">Add product</span>
            </button>
          </div>
          {error && (
            <div role="alert" className="banner error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="icon-btn" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              <Check size={17} />
              {notice}
            </div>
          )}
          {loading ? (
            <div className="panel">
              <Empty title="Loading…" icon={RefreshCw}>
                {""}
              </Empty>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
