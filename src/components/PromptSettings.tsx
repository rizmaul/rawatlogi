import { useEffect, useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import type { PromptKey } from "../../shared/prompts";
import { api } from "../lib/api";
import { Tag } from "./ui";

type PromptResponse = {
  overrides: Partial<Record<PromptKey, string>>;
  defaults: Record<PromptKey, string>;
  info: Record<PromptKey, { label: string; usedBy: string; placeholders?: string[] }>;
};

// Edit every AI prompt. Saved prompts apply to jobs that start after saving.
export function PromptSettings() {
  const [data, setData] = useState<PromptResponse | null>(null),
    [drafts, setDrafts] = useState<Partial<Record<PromptKey, string>>>({}),
    [open, setOpen] = useState<PromptKey | "">(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<PromptResponse>("/settings/prompts")
      .then((d) => {
        setData(d);
        setDrafts({ ...d.defaults, ...d.overrides });
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!data)
    return (
      <section className="panel padded">
        <h2>AI prompts</h2>
        {error ? <p className="error-text">{error}</p> : <p className="muted">Loading…</p>}
      </section>
    );
  const keys = Object.keys(data.defaults) as PromptKey[];
  const isCustom = (k: PromptKey) => (drafts[k] ?? "").trim() !== data.defaults[k];
  const dirty = keys.some(
    (k) => (drafts[k] ?? "").trim() !== (data.overrides[k] ?? data.defaults[k]),
  );
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const prompts = Object.fromEntries(
        keys.filter(isCustom).map((k) => [k, drafts[k] ?? ""]),
      );
      const { overrides } = await api<Pick<PromptResponse, "overrides">>(
        "/settings/prompts",
        { prompts },
        "PUT",
      );
      setData((d) => d && { ...d, overrides });
      setMessage("Prompts saved. New jobs use them.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded prompt-settings">
      <div className="row between">
        <h2>AI prompts</h2>
        <button className="primary" disabled={busy || !dirty} onClick={save}>
          <Save size={15} />
          {busy ? "Saving…" : "Save prompts"}
        </button>
      </div>
      <div className="data-list space-top">
        {keys.map((k) => (
          <div className="data-row block" key={k}>
            <button
              className="row between prompt-toggle"
              aria-expanded={open === k}
              onClick={() => setOpen(open === k ? "" : k)}
            >
              <span className="grow">
                <span className="title">{data.info[k].label}</span>
                <span className="sub">{data.info[k].usedBy}</span>
              </span>
              {isCustom(k) && <Tag tone="blue">custom</Tag>}
            </button>
            {open === k && (
              <div className="prompt-editor">
                <textarea
                  aria-label={data.info[k].label + " prompt"}
                  rows={14}
                  value={drafts[k] ?? ""}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [k]: e.target.value }));
                    setMessage("");
                  }}
                />
                <div className="row between">
                  <small className="muted">
                    {(drafts[k] ?? "").length.toLocaleString()} chars
                    {data.info[k].placeholders?.length
                      ? " · must keep " + data.info[k].placeholders!.join(", ")
                      : ""}
                    {k === "writing" || k === "writingEdit"
                      ? " · {{voice}} inserts Writing voice & rules"
                      : ""}
                  </small>
                  <button
                    className="text-btn"
                    disabled={!isCustom(k)}
                    onClick={() =>
                      setDrafts((d) => ({ ...d, [k]: data.defaults[k] }))
                    }
                  >
                    <RotateCcw size={13} />
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {message && (
        <p role="status" className="success-message">
          <Check size={15} />
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
