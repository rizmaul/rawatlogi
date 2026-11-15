import { Field } from "../ui";
import type { RecordFormContext } from "./types";
export function EvidenceForm({ form }: { form: RecordFormContext }) {
  const { data, set, readOnly, state, sources, product, copy, editing } = form;
  const approvalRequirements=[data.verdict!=='supported'?'Set the assessment to “supported”.':'',!data.claim.trim()?'Write the specific claim this source supports.':'',!data.limitations.trim()?'Record the limitations and applicability.':''].filter(Boolean);
  return (
    <>
      <Field label="Linked product">
        <select
          disabled={editing}
          required
          value={data.productId}
          onChange={(e) => set("productId", e.target.value)}
        >
          <option value="">Choose product</option>
          {state.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.data.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Publication title">
        <input
          required
          value={data.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Source URL">
        <input
          type="url"
          required
          value={data.url}
          onChange={(e) => set("url", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Year">
          <input
            value={data.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </Field>
        <Field label="Study type">
          <input
            value={data.studyType}
            onChange={(e) => set("studyType", e.target.value)}
            placeholder="e.g. randomized trial, review"
          />
        </Field>
      </div>
      <Field label="Authors">
        <input
          value={data.authors}
          onChange={(e) => set("authors", e.target.value)}
        />
      </Field>
      <Field label="Abstract / source notes">
        <textarea
          rows={6}
          value={data.abstract}
          onChange={(e) => set("abstract", e.target.value)}
        />
      </Field>
      <Field label="What have you actually read?">
        <select
          value={data.access}
          onChange={(e) => set("access", e.target.value)}
        >
          <option value="abstract">Abstract only</option>
          <option value="full-text">Full text reviewed</option>
        </select>
      </Field>
      <Field
        label="Specific claim supported by this source"
        hint="Record population, formulation, duration, and outcome where relevant. Distinguish ingredient from finished-product evidence."
      >
        <textarea
          rows={4}
          value={data.claim}
          onChange={(e) => {
            set("claim", e.target.value);
            set("approved", false);
          }}
        />
      </Field>
      <Field label="Limitations, uncertainty & applicability">
        <textarea
          rows={4}
          value={data.limitations}
          onChange={(e) => {
            set("limitations", e.target.value);
            set("approved", false);
          }}
          placeholder="What does this study not establish about this product?"
        />
      </Field>
      <Field label="Your assessment">
        <select
          value={data.verdict}
          onChange={(e) => {
            set("verdict", e.target.value);
            set("approved", false);
          }}
        >
          {["unreviewed", "supported", "uncertain", "unsupported"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <div id="evidence-approval-help" className="approval-help" role="status">
        <strong>{approvalRequirements.length?'Before you can approve this claim':'This claim is ready for your approval'}</strong>
        {approvalRequirements.length>0&&<ul>{approvalRequirements.map(item=><li key={item}>{item}</li>)}</ul>}
        <p>You can save this source without approval. Approval is only needed before AI drafting can use its scientific claim.</p>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          disabled={approvalRequirements.length>0}
          aria-describedby="evidence-approval-help"
          checked={data.approved}
          onChange={(e) => set("approved", e.target.checked)}
        />
        <span>
          I reviewed this source and approve the recorded claim, with its
          limitations, for drafting.
        </span>
      </label>
      <p className="fine-print">
        Editing linked evidence returns approved, unpublished posts to draft for
        another review.
      </p>
    </>
  );
}
