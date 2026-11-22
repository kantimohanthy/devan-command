"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/supabase/server";

const httpsUrl = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((u) => (u && /^https:\/\//.test(u) ? u : null));
const text = (max: number) => z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v).slice(0, max)));
const isoDate = z
  .string()
  .nullish()
  .transform((d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null));
const int = z.union([z.number(), z.string()]).nullish().transform((v) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? Math.round(n) : null;
});

const STATUS_MAP: Record<string, string> = {
  "to apply": "to_apply",
  applied: "applied",
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
  skipped: "skipped",
  skip: "skipped",
};

const oldJob = z.object({
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(200),
  location: text(200),
  mode: text(20),
  contract: text(80),
  posted: isoDate,
  status: text(40),
  fit: text(10),
  next_action: text(500),
  salary_min: int,
  salary_max: int,
  url: httpsUrl,
});

const oldOpportunity = z.object({
  name: z.string().min(1).max(300),
  type: text(120),
  category: text(120),
  eligibility: text(4000),
  requirements: text(4000),
  deadline: text(200),
  deadline_date: isoDate,
  funding: text(2000),
  status: text(60),
  url: httpsUrl,
  verified: z.boolean().nullish(),
});

export async function importOldJobs(rows: unknown[]) {
  const { supabase } = await requireOwner();
  const parsed = z.array(z.unknown()).max(200).parse(rows);
  const clean = parsed.flatMap((r) => {
    const j = oldJob.safeParse(r);
    if (!j.success) return [];
    const d = j.data;
    const loc = d.location ?? "";
    return [{
      title: d.title,
      company: d.company,
      location: d.location,
      mode: /remote/i.test(`${d.mode} ${loc}`) ? "remote" : /hybrid/i.test(loc) ? "hybrid" : "onsite",
      contract: d.contract,
      posted: d.posted,
      status: STATUS_MAP[(d.status ?? "").toLowerCase()] ?? "to_apply",
      fit: d.fit && ["A", "B", "C"].includes(d.fit) ? d.fit : null,
      next_action: d.next_action,
      salary_min: d.salary_min,
      salary_max: d.salary_max,
      url: d.url,
    }];
  });
  // skip rows already tracked (same URL, or same title+company)
  const { data: existing } = await supabase.from("jobs").select("url,title,company");
  const seen = new Set((existing ?? []).flatMap((e) => [e.url, `${e.title}|${e.company}`.toLowerCase()]).filter(Boolean));
  const fresh = clean.filter((c) => {
    const k = `${c.title}|${c.company}`.toLowerCase();
    if ((c.url && seen.has(c.url)) || seen.has(k)) return false;
    if (c.url) seen.add(c.url);
    seen.add(k);
    return true;
  });
  if (!fresh.length) return { received: parsed.length, valid: clean.length, inserted: 0 };
  const { error, data } = await supabase.from("jobs").insert(fresh).select("id");
  if (!error) return { received: parsed.length, valid: clean.length, inserted: data?.length ?? 0 };
  // batch failed: fall back to one-by-one so a single bad row can't block the rest
  let inserted = 0;
  let lastError = error.message;
  for (const row of fresh) {
    const r = await supabase.from("jobs").insert(row);
    if (r.error) lastError = r.error.message; else inserted++;
  }
  return { received: parsed.length, valid: clean.length, inserted, error: inserted < fresh.length ? lastError : undefined };
}

export async function importOldOpportunities(rows: unknown[]) {
  const { supabase } = await requireOwner();
  const parsed = z.array(z.unknown()).max(200).parse(rows);
  const clean = parsed.flatMap((r) => {
    const o = oldOpportunity.safeParse(r);
    if (!o.success) return [];
    return [{ ...o.data, status: o.data.status || "To review", verified: !!o.data.verified }];
  });
  const { data: existing } = await supabase.from("opportunities").select("name");
  const seen = new Set((existing ?? []).map((e) => e.name.toLowerCase()));
  const fresh = clean.filter((c) => !seen.has(c.name.toLowerCase()) && (seen.add(c.name.toLowerCase()), true));
  if (!fresh.length) return { received: parsed.length, valid: clean.length, inserted: 0 };
  const { error, data } = await supabase.from("opportunities").insert(fresh).select("id");
  if (error) throw new Error("Opportunity import failed: " + error.message);
  return { received: parsed.length, valid: clean.length, inserted: data?.length ?? 0 };
}

export async function finishImport(summary: string) {
  const { supabase } = await requireOwner();
  await supabase.from("notifications").insert({ kind: "success", title: "Old tracker imported", body: summary.slice(0, 500) });
  revalidatePath("/");
  revalidatePath("/opportunities");
}
