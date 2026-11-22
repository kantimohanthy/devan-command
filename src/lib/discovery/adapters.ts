import "server-only";
import { getJson, getText, guardedFetch, SourceError } from "./fetch";
import { atsRefFromUrl } from "./keys";
import { findJobPosting, fromAshby, fromGreenhouse, fromHimalayas, fromJobPosting, fromLever, fromRemotive, parseWwrRss, type GreenhouseJob, type HimalayasJob, type RemotiveJob } from "./normalize";
import { SOURCES, sourceBySlug, sourceForHost, type SourceDef } from "./registry";
import { htmlToText } from "./text";
import type { AdapterResult, Listing } from "./types";

const MAX_LISTINGS = 150;

export async function runAdapter(src: SourceDef): Promise<AdapterResult> {
  switch (src.method) {
    case "api":
      return src.slug === "himalayas" ? himalayas(src) : remotive(src);
    case "rss":
      return wwr();
    case "greenhouse":
      return greenhouse(src);
    default:
      throw new SourceError(`${src.name} has no automated adapter. Use link import.`);
  }
}

async function himalayas(src: SourceDef): Promise<AdapterResult> {
  const listings: Listing[] = [];
  let fetched = 0;
  const seen = new Set<string>();
  for (const q of src.config?.queries ?? []) {
    const data = await getJson<{ jobs?: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent&page=1`);
    for (const j of data.jobs ?? []) {
      fetched++;
      const l = fromHimalayas(j);
      if (l && !seen.has(l.externalId)) {
        seen.add(l.externalId);
        listings.push(l);
      }
    }
  }
  return { listings: listings.slice(0, MAX_LISTINGS), complete: false, fetched, filteredOut: 0, message: "Page 1 of each saved query (partial by design)" };
}

async function remotive(src: SourceDef): Promise<AdapterResult> {
  const data = await getJson<{ "job-count"?: number; jobs?: RemotiveJob[] }>(src.config!.endpoint!);
  const jobs = data.jobs ?? [];
  const listings = jobs.map(fromRemotive).filter((x): x is Listing => !!x);
  return { listings: listings.slice(0, MAX_LISTINGS), complete: data["job-count"] === jobs.length && listings.length <= MAX_LISTINGS, fetched: jobs.length, filteredOut: 0 };
}

async function wwr(): Promise<AdapterResult> {
  const r = await getText("https://weworkremotely.com/remote-jobs.rss", { accept: "application/rss+xml,application/xml", maxBytes: 8_000_000 });
  if (!r.ok) throw new SourceError(`HTTP ${r.status} from weworkremotely.com`, r.status);
  const { items, total, filteredOut } = parseWwrRss(r.text);
  return { listings: items.slice(0, MAX_LISTINGS), complete: false, fetched: total, filteredOut, message: "RSS shows recent items only; never treated as a full list" };
}

async function greenhouse(src: SourceDef): Promise<AdapterResult> {
  const board = src.config!.board!;
  const data = await getJson<{ jobs?: GreenhouseJob[]; meta?: { total?: number } }>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, 20000);
  const jobs = data.jobs ?? [];
  const listings = jobs.map((j) => fromGreenhouse(j, board, src.name, src.slug)).filter((x): x is Listing => !!x);
  const complete = (data.meta?.total == null || data.meta.total === jobs.length) && listings.length <= MAX_LISTINGS;
  return { listings: listings.slice(0, MAX_LISTINGS), complete, fetched: jobs.length, filteredOut: 0 };
}

/** User-pasted vacancy link → one Listing, attributed to the board it came from. */
export async function listingFromUrl(raw: string): Promise<{ listing: Listing; method: string }> {
  const url = new URL(raw.trim());
  const board = sourceForHost(url.hostname);
  const attribute = (l: Listing): Listing => ({ ...l, sourceSlug: board?.slug ?? "manual", discoveryUrl: l.discoveryUrl ?? url.toString() });
  const ref = atsRefFromUrl(url.toString());

  if (ref?.vendor === "greenhouse") {
    const gh = ref.board ?? SOURCES.find((s) => s.kind === "employer" && s.hosts?.some((h) => url.hostname.endsWith(h)))?.config?.board;
    if (gh) {
      const j = await getJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(gh)}/jobs/${ref.id}`);
      const emp = SOURCES.find((s) => s.config?.board === gh);
      const l = fromGreenhouse(j, gh, emp?.name ?? gh, emp?.slug ?? "manual");
      if (l) return { listing: emp ? { ...l, discoveryUrl: url.toString() } : attribute(l), method: "Greenhouse Job Board API" };
    }
  }
  if (ref?.vendor === "lever") {
    const j = await getJson<Record<string, unknown>>(`https://api.lever.co/v0/postings/${encodeURIComponent(ref.company)}/${ref.id}`);
    const l = fromLever(j, ref.company);
    if (l) return { listing: attribute(l), method: "Lever Postings API" };
  }
  if (ref?.vendor === "ashby") {
    const d = await getJson<{ jobs?: Record<string, unknown>[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.org)}?includeCompensation=true`);
    const j = (d.jobs ?? []).find((x) => String(x.id).toLowerCase() === ref.id.toLowerCase());
    if (!j) throw new SourceError("Ashby says this posting is no longer on the board.");
    const l = fromAshby(j, ref.org);
    if (l) return { listing: attribute(l), method: "Ashby Posting API" };
  }

  const page = await guardedFetch(url.toString());
  const ld = findJobPosting(page.text);
  if (ld) {
    const l = fromJobPosting(ld, page.url || url.toString(), board?.slug ?? "manual");
    if (l) return { listing: attribute(l), method: "schema.org JobPosting on the page" };
  }
  // last resort: page title only, everything else Unknown
  const meta = (prop: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i").exec(page.text)?.[1] ?? null;
  const t = meta("og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.text)?.[1];
  let title = t ? htmlToText(t).slice(0, 300) : null;
  const employer = board?.kind === "employer" ? board.name : null;
  if (title && employer) title = title.replace(new RegExp(`\\s*[|–-]\\s*${employer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  const site = meta("og:site_name");
  const company = employer ?? (site && !/recruit|careers|jobs|greenhouse|lever|ashby|workable|rippling/i.test(site) ? site : url.hostname.replace(/^www\./, ""));
  if (!title) throw new SourceError("No job data found on that page.");
  return {
    method: "page title and summary only (no structured job data; other fields Unknown)",
    listing: attribute({
      sourceSlug: board?.slug ?? "manual",
      externalId: url.toString(),
      title,
      company,
      discoveryUrl: url.toString(),
      officialUrl: url.toString(),
      locationText: null,
      countryRestrictions: null,
      timezoneText: null,
      remote: null,
      employmentType: null,
      seniority: null,
      salaryText: null,
      descriptionText: htmlToText(meta("og:description") ?? meta("description") ?? ""),
      postedAt: null,
      expiresAt: null,
      original: { note: "No structured data; fields are Unknown" },
    }),
  };
}

// ---------- HiringCafe MCP probe / on-demand search ----------
type RpcResult = { status: number; body: unknown; session: string | null; contentType: string | null };

async function rpc(endpoint: string, payload: unknown, session: string | null): Promise<RpcResult> {
  const r = await getText(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
    accept: "application/json, text/event-stream",
    headers: { "content-type": "application/json", ...(session ? { "mcp-session-id": session } : {}) },
    timeoutMs: 15000,
    maxBytes: 2_000_000,
  });
  let body: unknown = r.text.slice(0, 4000);
  const ct = r.headers.get("content-type");
  try {
    if (ct?.includes("event-stream")) {
      const data = r.text.split("\n").filter((x) => x.startsWith("data:")).map((x) => x.slice(5).trim()).pop();
      body = data ? JSON.parse(data) : body;
    } else body = JSON.parse(r.text);
  } catch {
    /* keep raw text */
  }
  return { status: r.status, body, session: r.headers.get("mcp-session-id"), contentType: ct };
}

export async function probeMcp(endpoint: string) {
  const init = await rpc(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "devan", version: "1.0" } } }, null);
  const out: Record<string, unknown> = { checkedAt: new Date().toISOString(), initializeStatus: init.status, contentType: init.contentType };
  if (init.status === 401 || init.status === 403) return { ...out, auth: "required", detail: String(typeof init.body === "string" ? init.body : JSON.stringify(init.body)).slice(0, 500) };
  if (init.status >= 400) return { ...out, auth: "unknown", error: `initialize failed with HTTP ${init.status}`, detail: JSON.stringify(init.body).slice(0, 500) };
  await rpc(endpoint, { jsonrpc: "2.0", method: "notifications/initialized" }, init.session).catch(() => null);
  const tools = await rpc(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.session);
  const list = ((tools.body as { result?: { tools?: { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } }[] } })?.result?.tools ?? []).map((t) => ({
    name: t.name,
    description: (t.description ?? "").slice(0, 300),
    params: Object.keys(t.inputSchema?.properties ?? {}),
  }));
  return { ...out, auth: "none", serverInfo: (init.body as { result?: { serverInfo?: unknown } })?.result?.serverInfo ?? null, toolsStatus: tools.status, tools: list };
}

export async function searchMcp(endpoint: string, query: string, location?: string) {
  const init = await rpc(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "devan", version: "1.0" } } }, null);
  if (init.status >= 400) throw new SourceError(`HiringCafe MCP answered HTTP ${init.status}`);
  await rpc(endpoint, { jsonrpc: "2.0", method: "notifications/initialized" }, init.session).catch(() => null);
  const tl = await rpc(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.session);
  const tools = (tl.body as { result?: { tools?: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] } })?.result?.tools ?? [];
  const tool = tools.find((t) => /search/i.test(t.name)) ?? tools[0];
  if (!tool) throw new SourceError("HiringCafe MCP exposes no tools to this client.");
  const props = Object.keys(tool.inputSchema?.properties ?? {});
  const key = props.find((p) => /^(query|q|search|keywords?|title)$/i.test(p)) ?? props[0] ?? "query";
  const args: Record<string, string> = { [key]: query };
  if (location && props.includes("location")) args.location = location;
  const r = await rpc(endpoint, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: tool.name, arguments: args } }, init.session);
  const content = (r.body as { result?: { content?: { type: string; text?: string }[] }; error?: { message?: string } }) ?? {};
  if (content.error) throw new SourceError(`HiringCafe: ${content.error.message ?? "tool error"}`);
  const text = (content.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const links = [...new Set((text.match(/https:\/\/[^\s"'<>)\]]+/g) ?? []).map((u) => u.replace(/[?&]utm_[^#]*$/, "")))].slice(0, 30);
  return { tool: tool.name, argument: Object.keys(args).join(" + "), text: text.slice(0, 6000), links };
}

export { sourceBySlug };
