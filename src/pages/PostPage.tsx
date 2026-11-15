import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Sparkles, Trash2 } from "lucide-react";
import { fromJakarta, postSchema, type Post, type RecordItem } from "../../shared/model";
import { imageUrl } from "../../shared/images";
import { blankPost } from "../lib/data";
import { Empty } from "../components/ui";
import { PostForm } from "../components/forms/PostForm";
import type { Workspace } from "../hooks/useWorkspace";

// Full-page post editor ("Content notebook"): /studio/posts/:id and /studio/posts/new.
export function PostPage({ workspace }: { workspace: Workspace }) {
  const { route, state, loading } = workspace;
  const isNew = route.page === "postNew";
  const record = isNew ? undefined : state.posts.find((p) => p.id === route.postId);
  if (!isNew && !record)
    return loading ? null : (
      <section className="panel">
        <Empty
          title="Post not found"
          action={
            <button className="secondary" onClick={() => route.go("studio")}>
              Back to writing
            </button>
          }
        >
          It may have been deleted.
        </Empty>
      </section>
    );
  // Remount when switching posts so the form starts from the right record.
  return <PostEditor key={record?.id ?? "new"} workspace={workspace} record={record} />;
}

function PostEditor({ workspace, record }: { workspace: Workspace; record?: RecordItem<Post> }) {
  const { route, state, selected, mutate, setNotice, busy } = workspace;
  const [data, setData] = useState<any>(() => {
    if (record) return { ...record.data, segmentImages: record.data.segmentImages ?? [] };
    const date = new URLSearchParams(window.location.search).get("date");
    return {
      ...blankPost,
      productId: selected || state.products[0]?.id || "",
      scheduledAt: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? fromJakarta(date + "T09:00") : null,
    };
  });
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false);
  // Images uploaded on this page; unreferenced ones are deleted when leaving (the API keeps saved ones).
  const uploaded = useRef(new Set<string>());
  useEffect(() => {
    const cleanup = () => {
      for (const id of uploaded.current)
        void fetch(imageUrl(id), { method: "DELETE", keepalive: true }).catch(() => {});
      uploaded.current.clear();
    };
    // pagehide covers full navigations/reloads, where React cleanup does not run.
    window.addEventListener("pagehide", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, []);
  const readOnly = record?.data.status === "published";
  const set = (key: string, value: unknown) => setData((d: any) => ({ ...d, [key]: value }));
  const product = state.products.find((p) => p.id === data.productId);
  const sources = state.evidence.filter((e) => e.data.productId === data.productId);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied");
    } catch {
      setError("Clipboard unavailable. Select and copy the text manually.");
    }
  }
  async function save() {
    if (uploading) return setError("Wait for the image upload to finish.");
    const parsed = postSchema.safeParse({
      ...data,
      segmentImages: (data.segmentImages ?? []).slice(0, data.segments.length),
    });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join(" · "));
    setError("");
    setSaving(true);
    try {
      const saved = await mutate(
        "/records/post" + (record ? "/" + record.id : ""),
        record ? { version: record.version, data: parsed.data } : parsed.data,
        record ? "PUT" : "POST",
      );
      setNotice("Post saved");
      if (!record) route.go("post", saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  // Request text for Claude (with the Rawatlogi MCP + rawatlogi-post-image skill).
  function askClaude(segmentIndex?: number) {
    if (!record) return;
    const target =
      segmentIndex === undefined
        ? "the post (thumbnail for segment 1, explainer images where they help)"
        : `segment ${segmentIndex + 1} (segmentIndex ${segmentIndex})`;
    void copy(
      `Use the rawatlogi-post-image skill: design the image for ${target} of Rawatlogi post ${record.id} ("${data.title}") in Claude Design, then attach it to the post.`,
    ).then(() => setNotice("Request copied. Paste it into Claude Code."));
  }
  async function remove() {
    if (!record || !confirm("Delete this post?")) return;
    try {
      await mutate("/records/post/" + record.id, undefined, "DELETE");
      setNotice("Post deleted");
      route.go("studio");
    } catch {}
  }
  return (
    <div className="post-page">
      <div className="post-page-bar">
        <button className="text-btn" onClick={() => history.length > 1 ? history.back() : route.go("studio")}>
          <ChevronLeft size={15} />
          Back
        </button>
        <div className="row">
          {record && !readOnly && (
            <button type="button" className="secondary sm" onClick={() => askClaude()}>
              <Sparkles size={14} />
              <span className="hide-sm">Design images with Claude</span>
            </button>
          )}
          {record && !readOnly && (
            <button type="button" className="text-btn danger" onClick={remove}>
              <Trash2 size={14} />
              Delete
            </button>
          )}
          {!readOnly && (
            <button className="primary" disabled={busy || saving || uploading} onClick={save}>
              <Check size={15} />
              {saving ? "Saving…" : "Save post"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="banner error">
          {error}
        </div>
      )}
      {readOnly && <p className="muted">Published posts are read-only.</p>}
      <section className="panel padded">
        <PostForm
          form={{
            data,
            set,
            readOnly: !!readOnly,
            state,
            sources,
            product,
            copy,
            editing: !!record,
            setImageUploading: setUploading,
            trackImage: (id) => uploaded.current.add(id),
            askClaude: record ? askClaude : undefined,
          }}
        />
      </section>
    </div>
  );
}
