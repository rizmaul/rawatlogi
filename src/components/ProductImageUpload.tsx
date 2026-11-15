import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { imageUrl, MAX_IMAGE_BYTES } from "../../shared/images";

export function ProductImageUpload({
  imageId,
  onChange,
  onBusy,
}: {
  imageId: string | null;
  onChange: (id: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tracked = useRef(new Set<string>(imageId ? [imageId] : []));
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      // The API only removes unreferenced files; saved product images are retained.
      for (const id of tracked.current)
        void fetch(imageUrl(id), { method: "DELETE", keepalive: true }).catch(
          () => {},
        );
    },
    [],
  );
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    setBusy(true);
    onBusy(true);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        signal: controller.current.signal,
      });
      const value = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !value.id)
        throw new Error(value.error || "Image upload failed.");
      tracked.current.add(value.id);
      onChange(value.id);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="product-image-upload">
      <div className="image-preview">
        {imageId ? (
          <img src={imageUrl(imageId)} alt="Selected product preview" />
        ) : (
          <ImagePlus size={32} />
        )}
      </div>
      <div>
        <strong>Product image</strong>
        <p>
          A recognizable photo for your catalog. JPEG, PNG, or WebP, up to 5 MB.
        </p>
        <label className={"secondary image-picker " + (busy ? "disabled" : "")}>
          <ImagePlus size={15} />
          {busy ? "Uploading…" : imageId ? "Replace image" : "Upload image"}
          <input
            aria-label="Upload product image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {imageId && (
          <button
            type="button"
            className="text-btn danger remove-image"
            disabled={busy}
            onClick={() => onChange(null)}
          >
            <Trash2 size={13} />
            Remove image
          </button>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <small>Image changes are saved with the product.</small>
      </div>
    </section>
  );
}
