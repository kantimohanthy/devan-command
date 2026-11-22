import { atsRefFromUrl, normalizeUrl, requisitionKey } from "./keys";
import { compensationText, experienceLevel, extractEligibility } from "./eligibility";
import { clip } from "./text";
import { sponsorStance } from "./sponsor";
import type { Listing } from "./types";

export type JobIndex = {
  bySourceExternal: Map<string, string>; // `${slug}|${externalId}` -> job id
  byRequisition: Map<string, string>; // requisition key -> job id
  byOfficialUrl: Map<string, string>; // normalized official url -> job id
};

export type Plan =
  | { kind: "insert"; reqKey: string | null; officialUrl: string | null }
  | { kind: "refresh"; jobId: string; via: "same-source" | "requisition" | "official-url"; reqKey: string | null; officialUrl: string | null };

/**
 * Decide whether a listing is new or a repeat. Matching is by source id, then by employer
 * requisition id, then by exact official URL. Company + title alone is never a match.
 */
export function planListing(l: Listing, idx: JobIndex): Plan {
  const officialUrl = normalizeUrl(l.officialUrl);
  const reqKey = requisitionKey(atsRefFromUrl(l.officialUrl) ?? atsRefFromUrl(l.discoveryUrl));
  const same = idx.bySourceExternal.get(`${l.sourceSlug}|${l.externalId}`);
  if (same) return { kind: "refresh", jobId: same, via: "same-source", reqKey, officialUrl };
  if (reqKey && idx.byRequisition.has(reqKey)) return { kind: "refresh", jobId: idx.byRequisition.get(reqKey)!, via: "requisition", reqKey, officialUrl };
  if (officialUrl && idx.byOfficialUrl.has(officialUrl)) return { kind: "refresh", jobId: idx.byOfficialUrl.get(officialUrl)!, via: "official-url", reqKey, officialUrl };
  return { kind: "insert", reqKey, officialUrl };
}

/** Facts a refresh may overwrite. Status, shortlist, notes, fit, CV and history are never in here. */
export function sourceFacts(l: Listing, now: string) {
  const e = extractEligibility(l);
  return {
    eligibility: { ...e, sponsorStance: sponsorStance(l.descriptionText) },
    italy_status: e.italy,
    compensation: compensationText(l.salaryText, l.descriptionText),
    sponsorship: e.sponsorship ? clip(e.sponsorship, 600) : null,
    experience_level: experienceLevel(l.title, l.seniority),
    employment_type: l.employmentType ? clip(l.employmentType, 60) : null,
    description_excerpt: clip(l.descriptionText.replace(/\s+/g, " "), 1500),
    listing_expires_at: l.expiresAt,
    last_checked: now,
    source_status: "open" as const,
  };
}

export const PROTECTED_JOB_FIELDS = ["status", "shortlisted", "shortlisted_at", "notes", "fit", "cv_variant", "applied_at"] as const;

export function newJobRow(l: Listing, plan: Extract<Plan, { kind: "insert" }>, now: string) {
  const f = sourceFacts(l, now);
  const mode = f.eligibility.office === "unknown" ? "onsite" : f.eligibility.office;
  return {
    title: clip(l.title, 300)!,
    company: clip(l.company, 200)!,
    location: clip(l.locationText, 200),
    mode,
    contract: clip(l.employmentType, 80),
    url: plan.officialUrl ?? normalizeUrl(l.discoveryUrl),
    official_url: plan.officialUrl,
    requisition_key: plan.reqKey,
    posted: l.postedAt ? l.postedAt.slice(0, 10) : null,
    status: "to_apply" as const,
    first_seen: now,
    ...f,
  };
}

export function buildIndex(rows: { job_id: string; source_slug: string; external_id: string }[], jobs: { id: string; requisition_key: string | null; official_url: string | null; url: string | null }[]): JobIndex {
  const idx: JobIndex = { bySourceExternal: new Map(), byRequisition: new Map(), byOfficialUrl: new Map() };
  for (const r of rows) idx.bySourceExternal.set(`${r.source_slug}|${r.external_id}`, r.job_id);
  for (const j of jobs) {
    if (j.requisition_key) idx.byRequisition.set(j.requisition_key, j.id);
    for (const raw of [j.official_url, j.url]) {
      const u = normalizeUrl(raw);
      if (u && !idx.byOfficialUrl.has(u)) idx.byOfficialUrl.set(u, j.id);
    }
  }
  return idx;
}
