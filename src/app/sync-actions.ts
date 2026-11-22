"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/supabase/server";
import sync from "@/data/sync.json";

// Applies the batch DEVAN prepared (from Gmail + job search). Runs once per batch id.
export async function applySync() {
  const { supabase, user } = await requireOwner();
  const key = "sync_" + sync.id;
  const { data: done } = await supabase.from("answers").select("key").eq("key", key).maybeSingle();
  if (done) return;

  const { data: existing } = await supabase.from("jobs").select("id,title,company,url,status");
  const jobs = existing ?? [];
  let updated = 0, added = 0, opps = 0;

  for (const u of sync.jobUpdates) {
    const hit = jobs.find((j) => j.company.toLowerCase().includes(u.company.toLowerCase()) && j.title.toLowerCase().includes(u.title.toLowerCase()));
    if (hit && hit.status !== u.status) {
      const { error } = await supabase.from("jobs").update({ status: u.status, applied_at: u.applied_at }).eq("id", hit.id).eq("owner", user.id);
      if (!error) updated++;
    }
  }

  for (const j of sync.jobInserts as unknown as Array<Record<string, string>>) {
    const dupe = jobs.some((e) => (j.url && e.url === j.url) || (e.company.toLowerCase() === j.company.toLowerCase() && e.title.toLowerCase() === j.title.toLowerCase()));
    if (dupe) continue;
    const { error } = await supabase.from("jobs").insert({
      title: j.title, company: j.company, location: j.location ?? null, mode: j.mode ?? "onsite", contract: j.contract ?? null,
      posted: j.posted ?? null, status: j.status, applied_at: j.applied_at ?? null, url: j.url ?? null, notes: j.notes ?? null,
    });
    if (!error) added++;
  }

  for (const o of sync.opportunityUpserts as unknown as Array<Record<string, string>>) {
    const { data: hit } = await supabase.from("opportunities").select("id").ilike("name", o.name).maybeSingle();
    const res = hit
      ? await supabase.from("opportunities").update({ status: o.status }).eq("id", hit.id).eq("owner", user.id)
      : await supabase.from("opportunities").insert({ name: o.name, category: o.category ?? null, type: o.type ?? null, status: o.status, url: o.url ?? null });
    if (!res.error) opps++;
  }

  await supabase.from("answers").insert({ key, value: new Date().toISOString() });
  await supabase.from("notifications").insert({
    kind: "success",
    title: "Synced from Gmail & job search",
    body: `${updated} job statuses updated, ${added} jobs added, ${opps} programmes updated.`,
  });
  revalidatePath("/");
}

export async function syncPending() {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from("answers").select("key").eq("key", "sync_" + sync.id).maybeSingle();
  return data ? null : { title: sync.title, summary: sync.summary };
}
