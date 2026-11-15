import { Field } from "../ui";
import type { RecordFormContext } from "./types";
import { ProductImageUpload } from "../ProductImageUpload";
export function ProductForm({ form }: { form: RecordFormContext }) {
  const { data, set, readOnly, state, sources, product, copy, editing } = form;
  return (
    <>
      <ProductImageUpload
        imageId={data.imageId ?? null}
        onChange={(id) => set("imageId", id)}
        onBusy={form.setImageUploading}
      />
      <Field
        label="Shopee affiliate link"
        hint="Saved exactly as entered. Product details are entered manually."
      >
        <input
          required
          type="url"
          value={data.affiliateUrl}
          onChange={(e) => set("affiliateUrl", e.target.value)}
          placeholder="https://s.shopee.co.id/…"
        />
      </Field>
      <div className="form-grid">
        <Field label="Product name">
          <input
            required
            value={data.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Brand + product name"
          />
        </Field>
        <Field label="Exact variant / size">
          <input
            value={data.variant}
            onChange={(e) => set("variant", e.target.value)}
            placeholder="e.g. 30 ml, fragrance-free"
          />
        </Field>
        <Field label="Category">
          <select
            value={data.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {["Skincare", "Haircare", "Bodycare", "Makeup", "Other"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </Field>
        <Field label="Price (IDR) · optional">
          <input
            type="number"
            min="0"
            value={data.price ?? ""}
            onChange={(e) =>
              set(
                "price",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
      </div>
      <Field label="Manufacturer / packaging source URL">
        <input
          type="url"
          value={data.manufacturerUrl}
          onChange={(e) => set("manufacturerUrl", e.target.value)}
          placeholder="https://brand.example/product"
        />
      </Field>
      <Field
        label="Ingredients / composition"
        hint="Transcribe from packaging or manufacturer. Include concentrations only when disclosed."
      >
        <textarea
          rows={4}
          value={data.ingredients}
          onChange={(e) => set("ingredients", e.target.value)}
        />
      </Field>
      <Field label="Advertised claims · unverified">
        <textarea
          rows={3}
          value={data.advertisedClaims}
          onChange={(e) => set("advertisedClaims", e.target.value)}
          placeholder="Claims to investigate, not facts to publish"
        />
      </Field>
      <Field label="Commission (%) · optional">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={data.commission ?? ""}
          onChange={(e) =>
            set(
              "commission",
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
        />
      </Field>
      <Field label="Your notes">
        <textarea
          rows={3}
          value={data.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <label className="check-field">
        <input
          type="checkbox"
          checked={data.confirmed}
          onChange={(e) => set("confirmed", e.target.checked)}
        />
        <span>
          I have confirmed the exact product and variant against the product
          source.
        </span>
      </label>
    </>
  );
}
