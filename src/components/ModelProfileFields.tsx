import type { ModelProfile } from '../../shared/ai';
import { Field } from './ui';

export function ModelProfileFields({label, profile, onChange}: {label: string; profile: ModelProfile; onChange: (profile: ModelProfile) => void}) {
  function set(name: keyof ModelProfile, value: string | number) { onChange({...profile, [name]: value}); }
  return <div className="form-grid">
    <Field label="Model">
      <input value={profile.model} onChange={e=>set('model',e.target.value)} autoComplete="off" />
    </Field>
    <Field label="Effort">
      <select value={profile.effort} onChange={e=>set('effort',e.target.value)}><option value="max">Maximum</option><option value="high">High</option><option value="low">Low</option></select>
    </Field>
    <Field label="Protocol">
      <select value={profile.protocol} onChange={e=>set('protocol',e.target.value)}><option value="responses">Responses API</option><option value="chat-completions">Chat Completions API</option></select>
    </Field>
    <Field label="JSON mode">
      <select value={profile.outputFormat} onChange={e=>set('outputFormat',e.target.value)}><option value="json_schema">Strict JSON schema</option><option value="json_object">JSON object</option></select>
    </Field>
    <Field label="Max output tokens">
      <input type="number" min="1024" max="65536" step="1024" value={profile.maxOutputTokens} onChange={e=>set('maxOutputTokens',Number(e.target.value))}/>
    </Field>
  </div>;
}
