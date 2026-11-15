import { useEffect, useState } from "react";
import { Save, Check, PlugZap } from "lucide-react";
import { defaultAPIConfig, modelProfile, type APIConfig, type ModelPurpose } from "../../shared/ai";
import { api } from "../lib/api";
import { ModelProfileFields } from "./ModelProfileFields";
import { Field, Tag } from "./ui";
type PublicConfig = Omit<APIConfig, "apiKey"> & { hasApiKey: boolean };
export function APISettings() {
  const [config, setConfig] = useState<PublicConfig>({
      ...defaultAPIConfig,
      hasApiKey: false,
    }),
    [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [testId, setTestId] = useState("");
  useEffect(() => {
    api<PublicConfig>("/settings/ai")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!testId) return;
    let active = true;
    const poll = async () => {
      try {
        const state = await api("/state");
        const job = state.jobs.find((j: any) => j.id === testId);
        if (!active) return;
        if (job?.status === "completed") {
          const result = JSON.parse(job.result);
          setMessage(`Connected: ${result.model} · ${result.effort} effort`);
          setTestId("");
          setBusy(false);
        } else if (job?.status === "failed") {
          setMessage("");
          setError(job.error || "Connection test failed");
          setTestId("");
          setBusy(false);
        } else
          setMessage(
            job?.status === "running"
              ? "Testing the provider through the API worker…"
              : "Connection test queued. Keep the API worker running.",
          );
      } catch (e) {
        if (active) {
          setMessage("");
          setError((e as Error).message);
          setTestId("");
          setBusy(false);
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [testId]);
  function set(name: string, value: unknown) {
    setConfig((c) => ({ ...c, [name]: value }));
    setMessage("");
  }
  async function save(test: ModelPurpose | false = false) {
    setBusy(true);
    setError("");
    setMessage("");
    let queued = false;
    try {
      const saved = await api<PublicConfig>(
        "/settings/ai",
        { ...config, apiKey: key, clearApiKey: clearKey },
        "PUT",
      );
      setConfig(saved);
      setKey("");
      setClearKey(false);
      if (test) {
        const result = await api("/settings/ai/test", { purpose: test });
        setTestId(result.id);
        setMessage("Connection test queued.");
        queued = true;
      } else setMessage("API settings saved. New jobs use this configuration.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!queued) setBusy(false);
    }
  }
  return (
    <section className="panel padded api-settings">
      <div className="row between">
        <h2>API</h2>
        <Tag tone={config.hasApiKey ? "green" : "amber"}>
          {config.hasApiKey ? "Key configured" : "Key required"}
        </Tag>
      </div>
      <Field label="API base URL">
        <input
          type="url"
          value={config.baseUrl}
          onChange={(e) => set("baseUrl", e.target.value)}
          placeholder="https://rkapi.com/v1"
          autoComplete="off"
        />
      </Field>
      <section className="model-profile" aria-label="Research and utilities model settings">
        <h3>Research model</h3>
        <ModelProfileFields label="Research" profile={modelProfile(config)} onChange={profile => setConfig(c => ({...c, ...profile}))}/>
      </section>
      <section className="model-profile" aria-label="Content creation model settings">
        <h3>Content model</h3>
        <ModelProfileFields label="Content" profile={config.content ?? modelProfile(config)} onChange={profile => set('content', profile)}/>
      </section>
      <Field label="Concurrent jobs (1–8)">
        <input type="number" min="1" max="8" value={config.workerConcurrency} onChange={(e) => set("workerConcurrency", Number(e.target.value))} />
      </Field>
      <Field
        label={
          config.hasApiKey
            ? "Replace API key (blank keeps current)"
            : "API key"
        }
      >
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="new-password"
          placeholder={
            config.hasApiKey
              ? "A key is already stored"
              : "Paste your provider key"
          }
        />
      </Field>
      {config.hasApiKey && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={clearKey}
            onChange={(e) => setClearKey(e.target.checked)}
          />
          <span>Remove the stored API key when saving</span>
        </label>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => save(false)}>
          <Save size={15} />
          {busy ? "Working…" : "Save settings"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => save("research")}
        >
          <PlugZap size={15} />
          Save & test research
        </button>
        <button className="secondary" disabled={busy} onClick={() => save("content")}>
          <PlugZap size={15} /> Save & test content
        </button>
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
