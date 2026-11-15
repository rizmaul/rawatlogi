import { Copy, ExternalLink, Plus } from "lucide-react";
import {
  fromJakarta,
  jakartaInput,
  limitFor,
  weightedLength,
} from "../../../shared/model";
import { Field } from "../ui";
import { SegmentImage } from "../SegmentImage";
import { areas, brandHashtags, evidenceLevelIssue, evidenceLevels, series } from "../../../shared/brand";
import type { RecordFormContext } from "./types";
export function PostForm({ form }: { form: RecordFormContext }) {
  const { data, set, readOnly, state, sources, product, copy, editing } = form;
  const images: (string | null)[] = data.segmentImages ?? [];
  const setImage = (i: number, id: string | null) =>
    set(
      "segmentImages",
      data.segments.map((_: string, j: number) => (j === i ? id : (images[j] ?? null))),
    );
  return (
    <div className="post-editor-grid">
      <div>
        <div className="form-grid">
          <Field label="Linked product">
            <select
              disabled={editing || readOnly}
              
              value={data.productId}
              onChange={(e) => set("productId", e.target.value)}
            >
              <option value="">No product (brand post)</option>
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Platform">
            <select
              disabled={readOnly}
              value={data.platform}
              onChange={(e) => set("platform", e.target.value)}
            >
              <option value="x">X</option>
              <option value="threads">Threads</option>
            </select>
          </Field>
        </div>
        <Field label="Internal title">
          <input
            disabled={readOnly}
            required
            value={data.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="A clear label for your calendar"
          />
        </Field>
        {data.segments.map((segment: string, i: number) => (
          <div className="segment" key={i}>
            <div className="row between">
              <label htmlFor={"segment-" + i}>Post {i + 1}</label>
              <span
                className={
                  weightedLength(segment, data.platform) >
                  limitFor(data.platform)
                    ? "error-text"
                    : ""
                }
              >
                {weightedLength(segment, data.platform)} /{" "}
                {limitFor(data.platform)}
                {data.platform === "x" ? " est." : ""}
              </span>
            </div>
            <textarea
              id={"segment-" + i}
              disabled={readOnly}
              required
              rows={5}
              value={segment}
              onChange={(e) =>
                set(
                  "segments",
                  data.segments.map((s: string, j: number) =>
                    j === i ? e.target.value : s,
                  ),
                )
              }
            />
            <SegmentImage
              imageId={images[i] ?? null}
              index={i}
              readOnly={readOnly}
              onChange={(id) => setImage(i, id)}
              onUploaded={form.trackImage ?? (() => {})}
              onBusy={form.setImageUploading}
              onAskClaude={form.askClaude && (() => form.askClaude!(i))}
            />
            <div className="row between">
              <button
                type="button"
                className="text-btn"
                onClick={() => copy(segment)}
              >
                <Copy size={13} />
                Copy text
              </button>
              {!readOnly && data.segments.length > 1 && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    set(
                      "segments",
                      data.segments.filter((_: string, j: number) => j !== i),
                    );
                    set(
                      "segmentImages",
                      images.filter((_, j: number) => j !== i),
                    );
                  }}
                >
                  Remove segment
                </button>
              )}
            </div>
          </div>
        ))}
        {!readOnly && data.segments.length < 12 && (
          <button
            type="button"
            className="secondary"
            onClick={() => set("segments", [...data.segments, ""])}
          >
            <Plus size={15} />
            Add segment
          </button>
        )}
        <h3>Linked evidence</h3>
        {sources.length ? (
          sources.map((e) => (
            <label className="check-field source-check" key={e.id}>
              <input
                disabled={readOnly}
                type="checkbox"
                checked={data.sourceIds.includes(e.id)}
                onChange={(v) =>
                  set(
                    "sourceIds",
                    v.target.checked
                      ? [...data.sourceIds, e.id]
                      : data.sourceIds.filter((id: string) => id !== e.id),
                  )
                }
              />
              <span>
                {e.data.title}
                <small>
                  {e.data.approved ? "Approved claim" : "Not approved"} ·{" "}
                  {e.data.claim || "No claim recorded"}
                </small>
              </span>
            </label>
          ))
        ) : (
          <p className="muted">No evidence for this product.</p>
        )}
      </div>
      <aside className="post-side">
        <h3>Rawatlogi labels</h3>
        <Field label="Area">
          <select
            disabled={readOnly}
            value={data.area ?? ""}
            onChange={(e) => set("area", e.target.value || null)}
          >
            <option value="">Not set</option>
            {Object.entries(areas).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Level bukti">
          <select
            disabled={readOnly}
            value={data.evidenceLevel ?? ""}
            onChange={(e) => set("evidenceLevel", e.target.value || null)}
          >
            <option value="">Not set</option>
            {Object.entries(evidenceLevels).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        {evidenceLevelIssue(data.evidenceLevel, data.sourceIds) && (
          <p className="error-text">
            {data.sourceIds.length
              ? "Linked evidence means this should be Riset terbatas or Riset kuat."
              : "Riset labels need approved evidence linked below."}
          </p>
        )}
        <Field label="Series">
          <select
            disabled={readOnly}
            value={data.series ?? ""}
            onChange={(e) => set("series", e.target.value || null)}
          >
            <option value="">Not set</option>
            {Object.entries(series).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        <div className="row between">
          <small className="muted">{brandHashtags(data).join(" ")}</small>
          <button
            type="button"
            className="text-btn"
            onClick={() => copy(brandHashtags(data).join(" "))}
          >
            <Copy size={13} />
            Copy hashtags
          </button>
        </div>
        <small className="muted">Hashtags for TikTok, Instagram and Threads captions; none on X.</small>
        <h3>Publishing plan</h3>
        <Field label="Date & time · Jakarta (WIB)">
          <input
            disabled={readOnly}
            type="datetime-local"
            name="scheduledAt"
            defaultValue={jakartaInput(data.scheduledAt)}
            onChange={(e) => set("scheduledAt", fromJakarta(e.target.value))}
          />
        </Field>
        <Field label="Status">
          <select
            disabled={readOnly}
            value={data.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="draft">Draft · needs review</option>
            <option value="approved">Approved · ready to post</option>
            <option value="published">Published · record URL below</option>
          </select>
        </Field>
        <Field label="Published post URL">
          <input
            disabled={readOnly}
            type="url"
            value={data.publishedUrl}
            onChange={(e) => set("publishedUrl", e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <div className="publishing-actions">
          <button
            type="button"
            className="secondary full"
            onClick={() => copy(data.segments.join("\n\n"))}
          >
            <Copy size={15} />
            Copy all segments
          </button>
          <a
            className="secondary full"
            href={
              data.platform === "x"
                ? "https://x.com/compose/post"
                : "https://www.threads.net/"
            }
            target="_blank"
            rel="noreferrer"
          >
            Open {data.platform === "x" ? "X" : "Threads"}{" "}
            <ExternalLink size={14} />
          </a>
          {product && (
            <a
              className="text-btn"
              href={product.data.affiliateUrl}
              target="_blank"
              rel="noreferrer"
            >
              Product affiliate link <ExternalLink size={13} />
            </a>
          )}
        </div>
        {data.warnings.length > 0 && (
          <div className="warnings">
            <h4>Review notes</h4>
            {data.warnings.map((w: string, i: number) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
        {readOnly && data.publishedUrl && (
          <a href={data.publishedUrl} target="_blank" rel="noreferrer">
            View published post <ExternalLink size={14} />
          </a>
        )}
      </aside>
    </div>
  );
}
