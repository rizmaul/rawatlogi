import { useState } from "react";
import { Download, ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { imageUrl, MAX_IMAGE_BYTES } from "../../shared/images";

// Upload a JPEG/PNG/WebP and return its image ID.
export async function uploadImage(file: File) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Choose an image smaller than 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a JPEG, PNG, or WebP image.");
  const response = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const value = (await response.json()) as { id?: string; error?: string };
  if (!response.ok || !value.id) throw new Error(value.error || "Image upload failed.");
  return value.id;
}

// Optional image attached to one post segment.
export function SegmentImage({
  imageId,
  index,
  readOnly,
  onChange,
  onUploaded,
  onBusy,
  onAskClaude,
}: {
  imageId: string | null;
  index: number;
  readOnly: boolean;
  onChange: (id: string | null) => void;
  onUploaded: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onAskClaude?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function pick(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    onBusy(true);
    try {
      const id = await uploadImage(file);
      onUploaded(id);
      onChange(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="segment-image">
      {imageId ? (
        <a href={imageUrl(imageId)} target="_blank" rel="noreferrer" className="segment-thumb">
          <img src={imageUrl(imageId)} alt={`Image for post ${index + 1}`} />
        </a>
      ) : null}
      <div className="row wrap-row">
        {!readOnly && (
          <label className={"secondary sm image-picker " + (busy ? "disabled" : "")}>
            <ImagePlus size={13} />
            {busy ? "Uploading…" : imageId ? "Replace image" : "Add image"}
            <input
              aria-label={`Upload image for post ${index + 1}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {!readOnly && onAskClaude && (
          <button type="button" className="text-btn" onClick={onAskClaude} title="Copy a request for Claude">
            <Sparkles size={13} />
            Design with Claude
          </button>
        )}
        {imageId && (
          <a className="text-btn" href={imageUrl(imageId)} download={`post-${index + 1}`}>
            <Download size={13} />
            Download
          </a>
        )}
        {imageId && !readOnly && (
          <button type="button" className="text-btn danger" onClick={() => onChange(null)}>
            <Trash2 size={13} />
            Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
