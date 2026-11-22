import "server-only";

// Outbound requests for discovery. Allowlisted hosts for adapters; user-pasted URLs go through
// guardedFetch, which refuses non-https, IP literals and private/internal hostnames.

const UA = "DEVAN/1.0 (private personal job tracker; contact via kantimohanthy.com)";

export class SourceError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function getText(url: string, opts: { timeoutMs?: number; maxBytes?: number; accept?: string; method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: { "user-agent": UA, accept: opts.accept ?? "*/*", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    cache: "no-store",
    redirect: "follow",
  });
  const max = opts.maxBytes ?? 5_000_000;
  const reader = res.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new SourceError(`Response larger than ${Math.round(max / 1e6)} MB`);
      }
      chunks.push(value);
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  return { status: res.status, ok: res.ok, url: res.url, headers: res.headers, text };
}

export async function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const r = await getText(url, { timeoutMs, accept: "application/json" });
  if (r.status === 429) throw new SourceError("Rate limited by provider (429)", 429);
  if (!r.ok) throw new SourceError(`HTTP ${r.status} from ${new URL(url).hostname}`, r.status);
  try {
    return JSON.parse(r.text) as T;
  } catch {
    throw new SourceError("Provider returned invalid JSON");
  }
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost|metadata\.google\.internal)$/i;
const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

export function assertPublicHttps(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SourceError("That is not a valid link.");
  }
  if (u.protocol !== "https:") throw new SourceError("Only https:// links can be imported.");
  if (u.username || u.password) throw new SourceError("Links with credentials are not allowed.");
  if (PRIVATE_HOST.test(u.hostname) || IP_LITERAL.test(u.hostname) || !u.hostname.includes(".")) {
    throw new SourceError("That host is not allowed.");
  }
  if (u.port && u.port !== "443") throw new SourceError("Non-standard ports are not allowed.");
  return u;
}

/** One user-triggered page read, with the final redirect target re-checked. */
export async function guardedFetch(raw: string) {
  const u = assertPublicHttps(raw);
  const r = await getText(u.toString(), { timeoutMs: 12000, maxBytes: 3_000_000, accept: "text/html,application/xhtml+xml,application/json" });
  assertPublicHttps(r.url || u.toString());
  if (!r.ok) throw new SourceError(`The page answered HTTP ${r.status}.`, r.status);
  return r;
}
