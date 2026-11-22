"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/supabase/server";
import { listingFromUrl, probeMcp, runAdapter, searchMcp } from "@/lib/discovery/adapters";
import { assertPublicHttps } from "@/lib/discovery/fetch";
import { flagMissing, ingestListings } from "@/lib/discovery/ingest";
import { sourceBySlug } from "@/lib/discovery/registry";
import { lookupUkSponsor } from "@/lib/discovery/sponsor-lookup";

type State = { ok: boolean; message: string; detail?: string[] } | null;

const msg = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error").slice(0, 500);

export async function syncSource(slug: string): Promise<State> {
  const parsed = z.string().regex(/^[a-z0-9_-]{1,60}$/).safeParse(slug);
  const src = parsed.success ? sourceBySlug(parsed.data) : undefined;
  if (!src || !src.automated) return { ok: false, message: "That source has no automated sync." };
  const { supabase } = await requireOwner();

  // provider rate limits: never call more often than the source allows
  const { data: state } = await supabase.from("sources").select("last_attempt_at").eq("slug", src.slug).maybeSingle();
  const minMs = (src.minHoursBetweenSyncs ?? 1) * 3600_000;
  if (state?.last_attempt_at && Date.now() - Date.parse(state.last_attempt_at) < minMs) {
    const mins = Math.ceil((minMs - (Date.now() - Date.parse(state.last_attempt_at))) / 60000);
    const every = minMs >= 3600_000 ? `${src.minHoursBetweenSyncs} h` : `${Math.round(minMs / 60000)} min`;
    return { ok: false, message: `${src.name} allows one sync every ${every}. Try again in ${mins} min.` };
  }

  const startedAt = new Date().toISOString();
  await supabase.from("sources").upsert({ slug: src.slug, last_attempt_at: startedAt }, { onConflict: "owner,slug" });
  const run = await supabase.from("source_runs").insert({ source_slug: src.slug, trigger: "manual", started_at: startedAt }).select("id").single();

  try {
    const res = await runAdapter(src);
    const stats = await ingestListings(supabase, res);
    const ok = stats.errors === 0 || stats.errors < res.listings.length;
    let flagged = 0;
    if (res.complete && ok && stats.errors === 0) flagged = await flagMissing(supabase, src.slug, startedAt);
    const message = [res.message, flagged ? `${flagged} no longer listed (flagged, not closed)` : null, ...stats.errorSamples].filter(Boolean).join(" · ");
    await supabase.from("source_runs").update({
      finished_at: new Date().toISOString(), ok, complete: res.complete, fetched: stats.fetched, filtered_out: stats.filteredOut,
      new_unique: stats.newUnique, duplicates: stats.duplicates, errors: stats.errors, message: message.slice(0, 2000) || null,
    }).eq("id", run.data?.id ?? "");
    await supabase.from("sources").upsert(
      { slug: src.slug, last_attempt_at: startedAt, ...(ok ? { last_success_at: new Date().toISOString(), last_error: null } : { last_error: stats.errorSamples[0] ?? "All rows failed" }), ...(src.config?.careersCheckedOn ? { careers_checked_on: src.config.careersCheckedOn } : {}) },
      { onConflict: "owner,slug" },
    );
    revalidatePath("/sources");
    revalidatePath("/");
    return { ok, message: `${src.name}: ${stats.newUnique} new, ${stats.duplicates} already known, ${stats.errors} errors (read ${stats.fetched}${stats.filteredOut ? `, ${stats.filteredOut} off-topic skipped` : ""}).`, detail: stats.errorSamples };
  } catch (e) {
    // an outage or failed page never closes or changes existing jobs
    await supabase.from("source_runs").update({ finished_at: new Date().toISOString(), ok: false, errors: 1, message: msg(e) }).eq("id", run.data?.id ?? "");
    await supabase.from("sources").upsert({ slug: src.slug, last_attempt_at: startedAt, last_error: msg(e) }, { onConflict: "owner,slug" });
    revalidatePath("/sources");
    return { ok: false, message: `${src.name} sync failed: ${msg(e)}. Existing jobs were not changed.` };
  }
}

export async function syncSourceForm(_: State, form: FormData): Promise<State> {
  return syncSource(String(form.get("slug") ?? ""));
}

export async function importFromUrl(_: State, form: FormData): Promise<State> {
  const raw = String(form.get("url") ?? "").trim();
  const { supabase } = await requireOwner();
  try {
    assertPublicHttps(raw);
    const { listing, method } = await listingFromUrl(raw);
    const startedAt = new Date().toISOString();
    const stats = await ingestListings(supabase, { listings: [listing], fetched: 1, filteredOut: 0 });
    await supabase.from("source_runs").insert({
      source_slug: listing.sourceSlug, trigger: "url", started_at: startedAt, finished_at: new Date().toISOString(), ok: stats.errors === 0,
      complete: false, fetched: 1, new_unique: stats.newUnique, duplicates: stats.duplicates, errors: stats.errors, message: `Link import via ${method}`,
    });
    if (stats.errors) return { ok: false, message: stats.errorSamples[0] ?? "Import failed." };
    if (listing.sourceSlug !== "manual") {
      await supabase.from("sources").upsert({ slug: listing.sourceSlug, last_success_at: new Date().toISOString() }, { onConflict: "owner,slug" });
    }
    revalidatePath("/sources");
    revalidatePath("/");
    return { ok: true, message: `${stats.newUnique ? "Added" : "Already tracked, refreshed"}: ${listing.title} · ${listing.company} (read with ${method}).` };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function testHiringCafe(): Promise<State> {
  const { supabase } = await requireOwner();
  const src = sourceBySlug("hiringcafe")!;
  try {
    const probe = await probeMcp(src.config!.endpoint!);
    await supabase.from("sources").upsert({ slug: "hiringcafe", probe, last_attempt_at: new Date().toISOString(), last_error: (probe as { error?: string }).error ?? null }, { onConflict: "owner,slug" });
    revalidatePath("/sources");
    const p = probe as { auth?: string; tools?: { name: string }[]; initializeStatus?: number };
    return { ok: p.auth === "none", message: `HiringCafe MCP: HTTP ${p.initializeStatus}, auth ${p.auth}, tools: ${(p.tools ?? []).map((t) => t.name).join(", ") || "none listed"}` };
  } catch (e) {
    await supabase.from("sources").upsert({ slug: "hiringcafe", last_attempt_at: new Date().toISOString(), last_error: msg(e), probe: { error: msg(e), checkedAt: new Date().toISOString() } }, { onConflict: "owner,slug" });
    revalidatePath("/sources");
    return { ok: false, message: `HiringCafe MCP probe failed: ${msg(e)}` };
  }
}

export type McpSearchState = { ok: boolean; message: string; text?: string; links?: string[] } | null;

export async function searchHiringCafe(_: McpSearchState, form: FormData): Promise<McpSearchState> {
  await requireOwner();
  const q = z.string().trim().min(2).max(200).safeParse(form.get("q"));
  if (!q.success) return { ok: false, message: "Type what to search for." };
  try {
    const loc = z.string().trim().max(100).safeParse(form.get("location") ?? "");
    const r = await searchMcp(sourceBySlug("hiringcafe")!.config!.endpoint!, q.data, loc.success && loc.data ? loc.data : undefined);
    return { ok: true, message: `On-demand search via tool “${r.tool}” (${r.argument}). Results are not imported until you add a link.`, text: r.text, links: r.links };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function checkUkSponsor(jobId: string): Promise<State> {
  const id = z.string().uuid().safeParse(jobId);
  if (!id.success) return { ok: false, message: "Bad job id." };
  const { supabase, user } = await requireOwner();
  const { data: job } = await supabase.from("jobs").select("id,company").eq("id", id.data).eq("owner", user.id).maybeSingle();
  if (!job) return { ok: false, message: "Not found." };
  try {
    const m = await lookupUkSponsor(job.company);
    await supabase.from("uk_sponsor_checks").insert({
      job_id: job.id, query_name: job.company.slice(0, 300), matched_name: m.best?.name ?? null, town: m.best?.town ?? null, rating: m.best?.rating ?? null,
      route: m.best?.route ?? null, register_file: m.file.slice(0, 300), confidence: m.confidence, needs_review: m.confidence === "probable", candidates: m.candidates,
    });
    revalidatePath("/");
    return { ok: true, message: m.confidence === "exact" ? `On the register: ${m.best!.name} (${m.best!.town})` : m.confidence === "probable" ? `Possible matches; needs your review` : "No matching licensed sponsor found" };
  } catch (e) {
    return { ok: false, message: `Register lookup failed: ${msg(e)}` };
  }
}
