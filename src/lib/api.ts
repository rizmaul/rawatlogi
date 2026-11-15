export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: any = await r
    .json()
    .catch(() => ({ error: "The API returned an invalid response" }));
  if (!r.ok) throw new Error(value.error || "Request failed");
  return value as T;
}
