import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIndex, newJobRow, planListing, sourceFacts, type JobIndex } from "./plan";
import { clip, httpsOrNull } from "./text";
import type { AdapterResult, Listing } from "./types";

export type IngestStats = { fetched: number; filteredOut: number; newUnique: number; duplicates: number; errors: number; errorSamples: string[]; jobIds: string[] };

async function loadIndex(sb: SupabaseClient): Promise<JobIndex> {
  const [{ data: links }, { data: jobs }] = await Promise.all([
    sb.from("job_sources").select("job_id,source_slug,external_id"),
    sb.from("jobs").select("id,requisition_key,official_url,url"),
  ]);
  return buildIndex(links ?? [], jobs ?? []);
}

function sourceRow(l: Listing, jobId: string, now: string) {
  return {
    job_id: jobId,
    source_slug: l.sourceSlug,
    external_id: clip(l.externalId, 300)!,
    discovery_url: httpsOrNull(l.discoveryUrl),
    official_url: httpsOrNull(l.officialUrl),
    original: { ...l.original, title: l.title, company: l.company, location: l.locationText, salary: l.salaryText },
    last_seen: now,
  };
}

/**
 * Writes listings without ever touching status, shortlist, notes, fit, CV choice or history.
 * Every listing keeps its own attribution row, so a cross-posting shows all its sources.
 */
export async function ingestListings(sb: SupabaseClient, result: Pick<AdapterResult, "listings" | "fetched" | "filteredOut">): Promise<IngestStats> {
  const now = new Date().toISOString();
  const idx = await loadIndex(sb);
  const stats: IngestStats = { fetched: result.fetched, filteredOut: result.filteredOut, newUnique: 0, duplicates: 0, errors: 0, errorSamples: [], jobIds: [] };
  const fail = (msg: string) => {
    stats.errors++;
    if (stats.errorSamples.length < 5) stats.errorSamples.push(msg.slice(0, 300));
  };

  for (const l of result.listings) {
    try {
      const plan = planListing(l, idx);
      let jobId: string;
      if (plan.kind === "insert") {
        const row = newJobRow(l, plan, now);
        const ins = await sb.from("jobs").insert(row).select("id").single();
        if (ins.error?.code === "23505" && row.url) {
          // same URL already tracked (e.g. added by hand): link to it instead of duplicating
          const ex = await sb.from("jobs").select("id").eq("url", row.url).maybeSingle();
          if (!ex.data) throw new Error(ins.error.message);
          jobId = ex.data.id;
          stats.duplicates++;
          await sb.from("jobs").update(sourceFacts(l, now)).eq("id", jobId);
        } else if (ins.error) {
          throw new Error(ins.error.message);
        } else {
          jobId = ins.data.id;
          stats.newUnique++;
        }
      } else {
        jobId = plan.jobId;
        stats.duplicates++;
        const patch: Record<string, unknown> = sourceFacts(l, now);
        if (plan.reqKey) patch.requisition_key = plan.reqKey;
        if (plan.officialUrl) patch.official_url = plan.officialUrl;
        const up = await sb.from("jobs").update(patch).eq("id", jobId);
        if (up.error?.code === "23505") {
          delete patch.requisition_key;
          await sb.from("jobs").update(patch).eq("id", jobId);
        } else if (up.error) throw new Error(up.error.message);
      }
      const link = await sb.from("job_sources").upsert(sourceRow(l, jobId, now), { onConflict: "owner,source_slug,external_id" });
      if (link.error) throw new Error(link.error.message);
      idx.bySourceExternal.set(`${l.sourceSlug}|${l.externalId}`, jobId);
      if (plan.reqKey) idx.byRequisition.set(plan.reqKey, jobId);
      if (plan.officialUrl) idx.byOfficialUrl.set(plan.officialUrl, jobId);
      stats.jobIds.push(jobId);
    } catch (e) {
      fail(`${l.title} @ ${l.company}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return stats;
}

/**
 * After a COMPLETE, successful sync only: listings this source used to show but no longer lists
 * are flagged "not in latest full sync". Nothing is ever closed automatically, and a partial or
 * failed sync changes nothing.
 */
export async function flagMissing(sb: SupabaseClient, slug: string, runStartedAt: string) {
  const { data: stale } = await sb.from("job_sources").select("job_id").eq("source_slug", slug).lt("last_seen", runStartedAt);
  const ids = [...new Set((stale ?? []).map((r) => r.job_id))];
  if (!ids.length) return 0;
  // keep open if any other source saw it during this run window
  const { data: fresh } = await sb.from("job_sources").select("job_id").in("job_id", ids).gte("last_seen", runStartedAt);
  const stillSeen = new Set((fresh ?? []).map((r) => r.job_id));
  const target = ids.filter((id) => !stillSeen.has(id));
  if (!target.length) return 0;
  await sb.from("jobs").update({ source_status: "not_in_latest_full_sync" }).in("id", target).eq("source_status", "open");
  return target.length;
}
