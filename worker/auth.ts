// Request authentication.
// - local mode: loopback hosts only (unchanged behaviour).
// - production mode: Cloudflare Access JWT required for /api/*; fails closed if Access is not configured.
// - /mcp: bearer MCP_TOKEN in both modes.
export type AuthEnv = {
  APP_MODE: string;
  MCP_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
export const isLocalRequest = (url: string) =>
  LOCAL_HOSTS.includes(new URL(url).hostname);

function b64urlBytes(value: string) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
}
const b64urlJson = (value: string) =>
  JSON.parse(new TextDecoder().decode(b64urlBytes(value)));

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

let certCache: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;
async function accessKeys(team: string, refresh = false) {
  if (!refresh && certCache?.team === team && Date.now() - certCache.at < 3600_000)
    return certCache.keys;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Cloudflare Access certificates unavailable");
  const { keys } = (await response.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys)
    map.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  certCache = { team, at: Date.now(), keys: map };
  return map;
}

// Verifies the Cf-Access-Jwt-Assertion token (RS256, audience, issuer, expiry).
export async function verifyAccessToken(token: string, env: AuthEnv) {
  const team = env.ACCESS_TEAM_DOMAIN ?? "";
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !env.ACCESS_AUD) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson(parts[0]),
      claims = b64urlJson(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    let key = (await accessKeys(team)).get(header.kid);
    if (!key) key = (await accessKeys(team, true)).get(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlBytes(parts[2]) as BufferSource,
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !ok ||
      !aud.includes(env.ACCESS_AUD) ||
      claims.iss !== `https://${team}` ||
      typeof claims.exp !== "number" ||
      claims.exp < now ||
      (typeof claims.nbf === "number" && claims.nbf > now + 60)
    )
      return null;
    return { email: typeof claims.email === "string" ? claims.email : "" };
  } catch {
    return null;
  }
}

export function accessTokenFrom(request: Request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? "";
}
