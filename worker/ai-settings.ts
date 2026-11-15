import { HTTPException } from "hono/http-exception";
import {
  apiConfigSchema,
  defaultAPIConfig,
  type APIConfig,
  modelProfile,
  selectModelConfig,
  type ModelPurpose,
} from "../shared/ai";
import { cleanPromptOverrides, type PromptOverrides } from "../shared/prompts";
export type SettingsEnv = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  SETTINGS_ENCRYPTION_KEY?: string;
};
function b64(data: Uint8Array) {
  return btoa(String.fromCharCode(...data));
}
function bytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function key(env: SettingsEnv) {
  if (!env.SETTINGS_ENCRYPTION_KEY)
    throw new Error(
      "Settings encryption is not initialized. Run npm run setup and restart the API.",
    );
  const data = bytes(env.SETTINGS_ENCRYPTION_KEY);
  if (data.length !== 32) throw new Error("Invalid settings encryption key.");
  return crypto.subtle.importKey(
    "raw",
    data as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(value: string, env: SettingsEnv) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(env),
    new TextEncoder().encode(value),
  );
  return { iv: b64(iv), value: b64(new Uint8Array(data)) };
}
async function decrypt(value: { iv: string; value: string }, env: SettingsEnv) {
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(value.iv) as BufferSource },
      await key(env),
      bytes(value.value) as BufferSource,
    ),
  );
}
export async function readAIConfig(env: SettingsEnv, purpose: ModelPurpose = "research"): Promise<APIConfig> {
  const row = await env.DB.prepare(
    "SELECT data FROM app_settings WHERE id='ai'",
  ).first<{ data: string }>();
  const saved = row ? JSON.parse(row.data) : {};
  const config = apiConfigSchema.parse({ ...defaultAPIConfig, ...saved });
  const apiKey = saved.encryptedKey
    ? await decrypt(saved.encryptedKey, env)
    : (env.OPENAI_API_KEY ?? "");
  return selectModelConfig({ ...config, content: config.content ?? modelProfile(config), apiKey }, purpose);
}
export async function publicAIConfig(env: SettingsEnv) {
  const { apiKey, ...config } = await readAIConfig(env);
  return { ...config, hasApiKey: !!apiKey };
}
export async function saveAIConfig(env: SettingsEnv, input: unknown) {
  const value = input as Record<string, unknown>;
  const config = apiConfigSchema.parse(value);
  const current = await readAIConfig(env);
  const supplied = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (supplied.length > 1000) throw new Error("API key is too long.");
  const selected = value.clearApiKey === true ? "" : supplied || current.apiKey;
  const normalized = { ...config, content: config.content ?? current.content ?? modelProfile(current) };
  const prompts = (await readSavedSettings(env)).prompts;
  const data = { ...normalized, encryptedKey: await encrypt(selected, env), ...(prompts ? { prompts } : {}) };
  await env.DB.prepare(
    "INSERT INTO app_settings(id,data,updated_at) VALUES('ai',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
  )
    .bind(JSON.stringify(data), new Date().toISOString())
    .run();
  return { ...normalized, hasApiKey: !!selected };
}
async function readSavedSettings(env: SettingsEnv): Promise<Record<string, any>> {
  const row = await env.DB.prepare(
    "SELECT data FROM app_settings WHERE id='ai'",
  ).first<{ data: string }>();
  return row ? JSON.parse(row.data) : {};
}
export async function readPromptOverrides(env: SettingsEnv): Promise<PromptOverrides> {
  return cleanPromptOverrides((await readSavedSettings(env)).prompts);
}
// Stores only prompts that differ from the defaults; blank or default text resets that prompt.
export async function savePromptOverrides(env: SettingsEnv, input: unknown) {
  let prompts: PromptOverrides;
  try {
    prompts = cleanPromptOverrides(input);
  } catch (e) {
    throw new HTTPException(400, { message: (e as Error).message });
  }
  const saved = await readSavedSettings(env);
  if (!saved.baseUrl) Object.assign(saved, defaultAPIConfig);
  await env.DB.prepare(
    "INSERT INTO app_settings(id,data,updated_at) VALUES('ai',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
  )
    .bind(JSON.stringify({ ...saved, prompts }), new Date().toISOString())
    .run();
  return prompts;
}
