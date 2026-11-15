// Request authentication.
// - local mode: loopback hosts only (unchanged behaviour).
// - production mode: dashboard and API are public.
// - /mcp: bearer MCP_TOKEN in both modes.
export type AuthEnv = {
  APP_MODE: string;
  MCP_TOKEN?: string;
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
export const isLocalRequest = (url: string) =>
  LOCAL_HOSTS.includes(new URL(url).hostname);

// Constant-time comparison of two secrets (hash first so lengths match).
export async function secretEquals(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x),
    v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function mcpTokenValid(header: string | undefined, env: AuthEnv) {
  if (!env.MCP_TOKEN || env.MCP_TOKEN.length < 32) return false;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return !!match && (await secretEquals(match[1].trim(), env.MCP_TOKEN));
}
