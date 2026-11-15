import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, Play, PenLine } from "lucide-react";
import {
  questionsResultSchema,
  type Topic,
  type SessionKind,
} from "../../shared/sessions";
import { imageUrl } from "../../shared/images";
import type { Workspace } from "../hooks/useWorkspace";
import { Field } from "./ui";
export function TopicPlanner({
  workspace,
  kind,
}: {
  workspace: Workspace;
  kind: SessionKind;
}) {
  const { product, state, mutate, route, setNotice, newPost } = workspace;
  const [guidance, setGuidance] = useState(""),
    [manual, setManual] = useState(""),
    [topics, setTopics] = useState<Topic[]>([]),
    [starting, setStarting] = useState(false),
    [error, setError] = useState(""),
    [jobId, setJobId] = useState("");
  const job = jobId
    ? state.jobs.find((j) => j.id === jobId)
    : state.jobs.find(
        (j) =>
          j.payload.kind === "questions" &&
          j.payload.purpose === kind &&
          j.payload.productId === product?.id,
      );
  const suggestions = useMemo(() => {
    if (!job?.result || job.status !== "completed") return null;
    try {
      const parsed = JSON.parse(job.result);
      return questionsResultSchema.parse({
        topics: parsed.topics,
        warnings: parsed.warnings,
      });
    } catch {
      return null;
    }
  }, [job?.result, job?.status]);
  if (!product) return null;
  function add(topic: Topic) {
    setTopics((current) =>
      current.length >= 10 ||
      current.some((t) => t.title.toLowerCase() === topic.title.toLowerCase())
        ? current
        : [...current, { ...topic }],
    );
  }
  async function generate() {
    setError("");
    try {
      const value = await mutate("/topics/generate", {
        kind,
        productId: product!.id,
        guidance,
      });
      setJobId(value.id);
      setNotice(
        "Topic generation queued. You can keep adding your own topics.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function start() {
    setStarting(true);
    setError("");
    try {
      await mutate("/sessions", {
        kind,
        productId: product!.id,
        guidance,
        topics,
      });
      route.go(kind === "research" ? "research" : "studio", product!.id);
      setNotice(`${topics.length} separate sessions created.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  const generating = job && ["queued", "running"].includes(job.status);
  return (
    <>
      <section className="selected-product panel padded">
        <div className="selected-thumb">
          {product.data.imageId ? (
            <img src={imageUrl(product.data.imageId)} alt={product.data.name} />
          ) : (
            <span>{product.data.name[0]}</span>
          )}
        </div>
        <div>
          <h2>{product.data.name}</h2>
          <p className="muted">
            {product.data.variant || "Variant not recorded"} ·{" "}
            {product.data.category}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            route.go(kind === "research" ? "researchNew" : "studioNew")
          }
        >
          Change product
        </button>
      </section>
      <section className="panel padded topic-builder">
        <div className="section-title">
          <div>
            <h2>
              {kind === "research"
                ? "What would you like to investigate?"
                : "What stories would you like to tell?"}
            </h2>
          </div>
        </div>
        <Field
          label="Guidance for the AI (optional)"
        >
          <textarea
            rows={3}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder={
              kind === "research"
                ? "e.g. Fokus pada bukti ceramide untuk skin barrier, keterbatasan riset, dan relevansi untuk kulit sensitif."
                : "e.g. Buat angle edukatif untuk pemula, hindari klaim berlebihan, fokus pada membaca komposisi."
            }
          />
        </Field>
        <button className="primary" disabled={!!generating} onClick={generate}>
          <Sparkles size={16} />
          {generating
            ? "Generating topics…"
            : "Generate " +
              (kind === "research" ? "questions & topics" : "content topics")}
        </button>
        {generating && (
          <p className="muted">
            {job.status === "queued"
              ? "Waiting for API worker"
              : "Generating…"}
          </p>
        )}
        {job?.status === "failed" && (
          <p role="alert" className="error-text">
            {job.error}
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {suggestions && (
          <div className="suggestion-list">
            <div className="section-title">
              <h3>Suggested topics</h3>
              <button
                className="text-btn"
                onClick={() => {
                  for (const topic of suggestions.topics) add(topic);
                }}
              >
                Add all suggestions
              </button>
            </div>
            {suggestions.topics.map((topic) => (
              <article className="topic-suggestion" key={topic.title}>
                <div>
                  <strong>{topic.title}</strong>
                  <p>{topic.question}</p>
                  <small>{topic.rationale}</small>
                </div>
                <button
                  className="secondary"
                  disabled={
                    topics.length >= 10 ||
                    topics.some((t) => t.title === topic.title)
                  }
                  onClick={() => add(topic)}
                >
                  <Plus size={14} />
                  Add
                </button>
              </article>
            ))}
            {suggestions.warnings.map((w, i) => (
              <p key={i} className="fine-print">
                {w}
              </p>
            ))}
          </div>
        )}
      </section>
      <section className="panel padded">
        <div className="section-title">
          <h2>
            Your topics <span className="count">{topics.length} / 10</span>
          </h2>
        </div>
        <div className="manual-topic">
          <input
            aria-label="Add your own topic"
            placeholder={
              kind === "research"
                ? "Write your own research question or topic…"
                : "Write your own content topic…"
            }
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim().length >= 3) {
                e.preventDefault();
                add({
                  title: manual.trim(),
                  question: manual.trim(),
                  searchQuery: "",
                  rationale: "Added manually",
                });
                setManual("");
              }
            }}
          />
          <button
            className="secondary"
            disabled={manual.trim().length < 3 || topics.length >= 10}
            onClick={() => {
              add({
                title: manual.trim(),
                question: manual.trim(),
                searchQuery: "",
                rationale: "Added manually",
              });
              setManual("");
            }}
          >
            <Plus size={15} />
            Add my topic
          </button>
        </div>
        {topics.map((topic, index) => (
          <article className="planned-topic" key={index}>
            <div className="row between">
              <strong>Topic {index + 1}</strong>
              <button
                className="icon-btn danger"
                aria-label={"Remove topic " + (index + 1)}
                onClick={() =>
                  setTopics((ts) => ts.filter((_, i) => i !== index))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <Field label="Title">
              <input
                aria-label={"Topic " + (index + 1) + " title"}
                value={topic.title}
                onChange={(e) =>
                  setTopics((ts) =>
                    ts.map((t, i) =>
                      i === index ? { ...t, title: e.target.value } : t,
                    ),
                  )
                }
              />
            </Field>
            <Field
              label={kind === "research" ? "Question / scope" : "Content brief"}
            >
              <textarea
                rows={2}
                value={topic.question}
                onChange={(e) =>
                  setTopics((ts) =>
                    ts.map((t, i) =>
                      i === index ? { ...t, question: e.target.value } : t,
                    ),
                  )
                }
              />
            </Field>
            {kind === "research" && (
              <Field
                label="Search terms (optional, blank = AI plans the query)"
              >
                <input
                  value={topic.searchQuery}
                  onChange={(e) =>
                    setTopics((ts) =>
                      ts.map((t, i) =>
                        i === index ? { ...t, searchQuery: e.target.value } : t,
                      ),
                    )
                  }
                />
              </Field>
            )}
          </article>
        ))}
        <div className="row between space-top">
          <span />
          <button
            className="primary"
            disabled={
              starting ||
              !topics.length ||
              topics.some((t) => t.title.trim().length < 3) ||
              (kind === "writing" && !product.data.confirmed)
            }
            onClick={start}
          >
            <Play size={15} />
            {starting
              ? "Creating sessions…"
              : `Start ${topics.length || ""} ${kind === "research" ? "research" : "writing"} session${topics.length === 1 ? "" : "s"}`}
          </button>
        </div>
        {kind === "writing" && !product.data.confirmed && (
          <p className="error-text">
            Confirm the product before starting writing sessions.
          </p>
        )}
        {kind === "writing" && (
          <button className="text-btn space-top" onClick={() => newPost()}>
            <PenLine size={14} />
            Write a draft manually instead
          </button>
        )}
      </section>
    </>
  );
}
