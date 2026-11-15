import { Check, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import {
  evidenceSchema,
  productSchema,
  type RecordItem,
} from "../../shared/model";
import { blankEvidence, blankProduct } from "../lib/data";
import type { Modal, State } from "../types";
import { EvidenceForm } from "./forms/EvidenceForm";
import { ProductForm } from "./forms/ProductForm";
export function RecordEditor({
  modal,
  state,
  selected,
  busy,
  close,
  save,
  remove,
  notify,
}: {
  modal: Modal;
  state: State;
  selected: string;
  busy: boolean;
  close: () => void;
  save: (k: string, d: any, r?: RecordItem<any>) => Promise<void>;
  remove: (k: string, r: RecordItem<any>) => void;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<any>(
    () =>
      modal.record?.data || {
        ...(modal.kind === "product"
          ? blankProduct
          : { ...blankEvidence, productId: selected }),
        ...("initial" in modal ? modal.initial : {}),
      },
  );
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const set = (key: string, value: any) =>
    setData((d: any) => ({ ...d, [key]: value }));
  const readOnly = false;
  const product = state.products.find((p) => p.id === data.productId);
  const sources = state.evidence.filter(
    (e) => e.data.productId === data.productId,
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (imageUploading) {
      setError("Wait for the image upload to finish.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const schema = modal.kind === "product" ? productSchema : evidenceSchema;
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(" · "));
        return;
      }
      await save(modal.kind, parsed.data, modal.record);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied. Open the platform and publish manually.");
    } catch {
      setError("Clipboard unavailable. Select and copy the text manually.");
    }
  }
  const form = {
    data,
    set,
    readOnly: !!readOnly,
    state,
    sources,
    product,
    copy,
    editing: !!modal.record,
    setImageUploading,
  };
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={modal.kind + " editor"}
        className="modal"
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">
              {modal.kind === "product" ? "PRODUCT" : "EVIDENCE"}
            </div>
            <h2>
              {modal.kind === "product"
                ? modal.record
                  ? "Edit product"
                  : "A new product, a new story"
                : "Review the evidence"}
            </h2>
          </div>
          <button
            className="icon-btn"
            aria-label="Close editor"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && (
              <div role="alert" className="banner error">
                {error}
              </div>
            )}
            {modal.kind === "product" && <ProductForm form={form} />}
            {modal.kind === "evidence" && <EvidenceForm form={form} />}
          </div>
          <div className="modal-actions">
            {modal.record && !readOnly && (
              <button
                type="button"
                className="danger text-btn"
                onClick={() => remove(modal.kind, modal.record!)}
              >
                <Trash2 size={15} />
                Delete
              </button>
            )}
            <span className="push" />
            <button type="button" className="secondary" onClick={close}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="submit"
                className="primary"
                disabled={busy || saving || imageUploading}
              >
                <Check size={16} />
                {saving ? "Saving…" : "Save " + modal.kind}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
