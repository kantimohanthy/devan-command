// Pure normalizers: provider payload -> Listing. Fixture-tested; no network here.
import type { Listing } from "./types";
import { clip, decodeEntities, htmlToText, httpsOrNull } from "./text";

const iso = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// ---------- Himalayas (https://himalayas.app/docs/remote-jobs-api) ----------
export type HimalayasJob = {
  title?: string; companyName?: string; companySlug?: string; employmentType?: string;
  minSalary?: number | null; maxSalary?: number | null; currency?: string | null; salaryPeriod?: string | null;
  seniority?: string | string[] | null; locationRestrictions?: Array<{ alpha2?: string; name?: string } | string> | null;
  timezoneRestrictions?: Array<number | string> | null; description?: string; excerpt?: string;
  pubDate?: number; expiryDate?: number; applicationLink?: string; guid?: string;
};

export function fromHimalayas(j: HimalayasJob): Listing | null {
  const title = str(j.title), company = str(j.companyName);
  const id = str(j.guid) ?? str(j.applicationLink);
  if (!title || !company || !id) return null;
  const countries = Array.isArray(j.locationRestrictions)
    ? j.locationRestrictions.map((c) => (typeof c === "string" ? c : c.name ?? c.alpha2 ?? "")).filter(Boolean)
    : null;
  const salary =
    j.minSalary || j.maxSalary
      ? `${j.currency ?? ""} ${j.minSalary ?? "?"}–${j.maxSalary ?? "?"} per ${j.salaryPeriod ?? "annual"} (Himalayas)`.trim()
      : null;
  const tz = Array.isArray(j.timezoneRestrictions) && j.timezoneRestrictions.length ? `UTC offsets allowed: ${j.timezoneRestrictions.join(", ")}` : null;
  const seniority = Array.isArray(j.seniority) ? j.seniority.join(", ") : str(j.seniority);
  return {
    sourceSlug: "himalayas",
    externalId: id,
    title,
    company,
    discoveryUrl: httpsOrNull(j.guid),
    officialUrl: httpsOrNull(j.applicationLink), // Himalayas terms: Apply must use applicationLink
    locationText: countries ? (countries.length ? `Remote — ${countries.join(", ")}` : "Remote — worldwide (per Himalayas)") : "Remote",
    countryRestrictions: countries,
    timezoneText: tz,
    remote: true,
    employmentType: str(j.employmentType),
    seniority,
    salaryText: salary,
    descriptionText: htmlToText(j.description ?? j.excerpt ?? ""),
    postedAt: iso(j.pubDate),
    expiresAt: iso(j.expiryDate),
    original: { locationRestrictions: j.locationRestrictions ?? null, timezoneRestrictions: j.timezoneRestrictions ?? null, seniority: j.seniority ?? null, employmentType: j.employmentType ?? null },
  };
}

// ---------- Remotive (https://github.com/remotive-com/remote-jobs-api) ----------
export type RemotiveJob = {
  id?: number; url?: string; title?: string; company_name?: string; category?: string; job_type?: string;
  publication_date?: string; candidate_required_location?: string; salary?: string; description?: string;
};

export function fromRemotive(j: RemotiveJob): Listing | null {
  const title = str(j.title), company = str(j.company_name);
  if (!title || !company || j.id == null) return null;
  return {
    sourceSlug: "remotive",
    externalId: String(j.id),
    title,
    company,
    discoveryUrl: httpsOrNull(j.url), // Remotive terms: link back to this URL and credit Remotive
    officialUrl: null, // Remotive does not expose the employer requisition
    locationText: str(j.candidate_required_location) ? `Remote — ${j.candidate_required_location}` : "Remote",
    countryRestrictions: null,
    timezoneText: null,
    remote: true,
    employmentType: str(j.job_type),
    seniority: null,
    salaryText: str(j.salary),
    descriptionText: htmlToText(j.description),
    postedAt: iso(j.publication_date),
    expiresAt: null,
    original: { candidate_required_location: j.candidate_required_location ?? null, category: j.category ?? null, salary: j.salary ?? null },
  };
}

// ---------- Remote OK (public JSON API https://remoteok.com/api) ----------
// Body is [legalNotice, ...jobs]. salary_min/max are USD integers; 0 means not published.
export type RemoteOkJob = {
  id?: string | number; slug?: string; epoch?: number | string; date?: string; company?: string; position?: string;
  tags?: string[]; description?: string; location?: string; salary_min?: number; salary_max?: number; url?: string; apply_url?: string;
};

export function fromRemoteOk(j: RemoteOkJob): Listing | null {
  const title = str(j.position), company = str(j.company);
  if (!title || !company || j.id == null || j.id === "") return null;
  const min = typeof j.salary_min === "number" && j.salary_min > 0 ? j.salary_min : null;
  const max = typeof j.salary_max === "number" && j.salary_max > 0 ? j.salary_max : null;
  const loc = str(j.location);
  return {
    sourceSlug: "remoteok",
    externalId: String(j.id),
    title,
    company,
    discoveryUrl: httpsOrNull(j.url), // Remote OK terms: link back and credit Remote OK
    officialUrl: null, // apply_url usually routes through remoteok.com, not the employer requisition
    locationText: loc ? `Remote — ${loc}` : "Remote",
    countryRestrictions: null, // free-text location only; never treated as a structured list
    timezoneText: null,
    remote: true,
    employmentType: null,
    seniority: null,
    salaryText: min || max ? `USD ${min ?? "?"}–${max ?? "?"} per year (Remote OK)` : null,
    descriptionText: htmlToText(j.description ?? ""),
    postedAt: iso(j.date) ?? iso(typeof j.epoch === "string" ? Number(j.epoch) : j.epoch),
    expiresAt: null,
    original: { location: j.location ?? null, tags: (j.tags ?? []).slice(0, 20), apply_url: j.apply_url ?? null },
  };
}

/** Keeps listings whose tags or title match one of the saved interests. */
export function remoteOkMatches(j: RemoteOkJob, interests: string[]): boolean {
  const hay = [j.position ?? "", ...(j.tags ?? [])].join(" ").toLowerCase();
  return interests.some((t) => hay.includes(t.toLowerCase()));
}

// ---------- We Work Remotely RSS ----------
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return null;
  return decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim() || null;
};

export function parseWwrRss(xml: string): { items: Listing[]; total: number; filteredOut: number } {
  const raw = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const items: Listing[] = [];
  let filteredOut = 0;
  for (const it of raw) {
    const category = tag(it, "category") ?? "";
    if (!/programming|dev ?ops|sys ?admin|back-?end|full-?stack|front-?end|data|engineer|software|machine learning|ai\b/i.test(category)) {
      filteredOut++;
      continue;
    }
    const fullTitle = tag(it, "title") ?? "";
    const idx = fullTitle.indexOf(":");
    const company = idx > 0 ? fullTitle.slice(0, idx).trim() : "Unknown company";
    const title = idx > 0 ? fullTitle.slice(idx + 1).trim() : fullTitle;
    const link = httpsOrNull(tag(it, "link")) ?? httpsOrNull(tag(it, "guid"));
    if (!title || !link) continue;
    const region = tag(it, "region");
    const country = tag(it, "country");
    items.push({
      sourceSlug: "weworkremotely",
      externalId: tag(it, "guid") ?? link,
      title,
      company,
      discoveryUrl: link,
      officialUrl: null,
      locationText: [region, country].filter(Boolean).join(" · ") || "Remote",
      countryRestrictions: null,
      timezoneText: null,
      remote: true,
      employmentType: tag(it, "type"),
      seniority: null,
      salaryText: null,
      descriptionText: htmlToText(tag(it, "description")),
      postedAt: iso(tag(it, "pubDate")),
      expiresAt: iso(tag(it, "expires_at")),
      original: { region, country, category, state: tag(it, "state") },
    });
  }
  return { items, total: raw.length, filteredOut };
}

// ---------- Greenhouse Job Board API (boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true) ----------
export type GreenhouseJob = {
  id?: number; title?: string; absolute_url?: string; updated_at?: string; first_published?: string;
  location?: { name?: string }; content?: string; company_name?: string;
};

export function fromGreenhouse(j: GreenhouseJob, board: string, company: string, sourceSlug: string): Listing | null {
  const title = str(j.title);
  if (!title || j.id == null) return null;
  const loc = str(j.location?.name);
  return {
    sourceSlug,
    externalId: String(j.id),
    title,
    company: str(j.company_name) ?? company,
    discoveryUrl: `https://job-boards.greenhouse.io/${board}/jobs/${j.id}`,
    officialUrl: httpsOrNull(j.absolute_url) ?? `https://job-boards.greenhouse.io/${board}/jobs/${j.id}`,
    locationText: loc,
    countryRestrictions: null,
    timezoneText: null,
    remote: loc ? /remote/i.test(loc) : null,
    employmentType: null,
    seniority: null,
    salaryText: null,
    descriptionText: htmlToText(decodeEntities(j.content ?? "")),
    postedAt: iso(j.first_published ?? j.updated_at),
    expiresAt: null,
    original: { location: loc, board },
  };
}

// ---------- schema.org JobPosting (JSON-LD), for manual URL import ----------
type LD = Record<string, unknown>;
export function findJobPosting(html: string): LD | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const b of blocks) {
    const body = b.replace(/^<script[^>]*>|<\/script>$/gi, "");
    try {
      const data = JSON.parse(body) as unknown;
      const stack: unknown[] = [data];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === "object") {
          const o = n as LD;
          const t = o["@type"];
          if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return o;
          if (o["@graph"]) stack.push(o["@graph"]);
        }
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return null;
}

export function fromJobPosting(ld: LD, pageUrl: string, sourceSlug: string): Listing | null {
  const title = str(ld.title);
  const org = ld.hiringOrganization as LD | undefined;
  const company = str(org?.name) ?? new URL(pageUrl).hostname.replace(/^www\./, "");
  if (!title) return null;
  const locs = ([] as LD[]).concat((ld.jobLocation as LD | LD[]) ?? []);
  const places = locs
    .map((l) => (l?.address as LD | undefined) ?? {})
    .map((a) => [a.addressLocality, a.addressRegion, a.addressCountry].map((x) => (typeof x === "object" && x ? (x as LD).name : x)).filter(Boolean).join(", "))
    .filter(Boolean);
  const reqs = ([] as LD[]).concat((ld.applicantLocationRequirements as LD | LD[]) ?? []).map((r) => str(r?.name)).filter(Boolean) as string[];
  const remote = String(ld.jobLocationType ?? "").toUpperCase().includes("TELECOMMUTE");
  const sal = ld.baseSalary as LD | undefined;
  const val = sal?.value as LD | undefined;
  const salaryText = val ? `${sal?.currency ?? ""} ${val.minValue ?? val.value ?? "?"}${val.maxValue ? "–" + val.maxValue : ""} ${val.unitText ?? ""} (from page data)`.trim() : null;
  const ident = ld.identifier as LD | string | undefined;
  return {
    sourceSlug,
    externalId: (typeof ident === "object" && ident ? str(ident.value as string) : str(ident as string)) ?? pageUrl,
    title: decodeEntities(title),
    company: decodeEntities(company),
    discoveryUrl: pageUrl,
    officialUrl: httpsOrNull(ld.url) ?? pageUrl,
    locationText: clip([remote ? "Remote" : null, ...places].filter(Boolean).join(" · ") || null, 200),
    countryRestrictions: reqs.length ? reqs : null,
    timezoneText: null,
    remote: remote || null,
    employmentType: Array.isArray(ld.employmentType) ? (ld.employmentType as string[]).join(", ") : str(ld.employmentType),
    seniority: null,
    salaryText,
    descriptionText: htmlToText(decodeEntities(String(ld.description ?? ""))),
    postedAt: iso(ld.datePosted),
    expiresAt: iso(ld.validThrough),
    original: { jobLocation: places, applicantLocationRequirements: reqs, jobLocationType: ld.jobLocationType ?? null },
  };
}

// ---------- Lever / Ashby single postings (documented public posting APIs) ----------
export function fromLever(j: LD, company: string): Listing | null {
  const title = str(j.text);
  if (!title || !j.id) return null;
  const cat = (j.categories as LD) ?? {};
  const range = j.salaryRange as LD | undefined;
  return {
    sourceSlug: "manual",
    externalId: String(j.id),
    title,
    company,
    discoveryUrl: httpsOrNull(j.hostedUrl),
    officialUrl: httpsOrNull(j.hostedUrl),
    locationText: str(cat.location as string),
    countryRestrictions: null,
    timezoneText: null,
    remote: String(j.workplaceType ?? "").toLowerCase() === "remote" ? true : null,
    employmentType: str(cat.commitment as string),
    seniority: null,
    salaryText: range ? `${range.currency ?? ""} ${range.min ?? "?"}–${range.max ?? "?"} ${range.interval ?? ""}`.trim() : null,
    descriptionText: str(j.descriptionPlain as string) ?? htmlToText(String(j.description ?? "")),
    postedAt: iso(j.createdAt),
    expiresAt: null,
    original: { categories: cat, workplaceType: j.workplaceType ?? null },
  };
}

export function fromAshby(j: LD, org: string): Listing | null {
  const title = str(j.title);
  if (!title || !j.id) return null;
  const comp = j.compensation as LD | undefined;
  return {
    sourceSlug: "manual",
    externalId: String(j.id),
    title,
    company: org,
    discoveryUrl: httpsOrNull(j.jobUrl),
    officialUrl: httpsOrNull(j.jobUrl) ?? httpsOrNull(j.applyUrl),
    locationText: str(j.location as string),
    countryRestrictions: null,
    timezoneText: null,
    remote: j.isRemote === true ? true : null,
    employmentType: str(j.employmentType as string),
    seniority: null,
    salaryText: str(comp?.compensationTierSummary as string),
    descriptionText: str(j.descriptionPlain as string) ?? htmlToText(String(j.descriptionHtml ?? "")),
    postedAt: iso(j.publishedAt),
    expiresAt: null,
    original: { workplaceType: j.workplaceType ?? null, secondaryLocations: j.secondaryLocations ?? null },
  };
}
