"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, supabaseServer } from "@/lib/supabase/server";
import starter from "@/data/starter-jobs.json";

const STATUSES = ["to_apply", "in_progress", "applied", "interview", "offer", "rejected", "skipped"] as const;

// ---------- auth ----------
const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export async function signIn(_: unknown, form: FormData) {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Check your email and password." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for every failure: don't reveal which part was wrong.
  if (error) return { error: "Sign-in failed." };
  redirect("/");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- jobs ----------
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(STATUSES) });

export async function setJobStatus(id: string, status: (typeof STATUSES)[number]) {
  const input = statusSchema.parse({ id, status });
  const { supabase, user } = await requireOwner();
  // RLS already limits rows to the owner; the explicit owner filter is defence in depth.
  const { error } = await supabase
    .from("jobs")
    .update({ status: input.status, applied_at: input.status === "applied" ? new Date().toISOString() : undefined })
    .eq("id", input.id)
    .eq("owner", user.id);
  if (error) throw new Error("Could not update job.");
  revalidatePath("/");
}

const newJobSchema = z.object({
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).optional(),
  url: z.string().trim().url().startsWith("https://").max(1000).optional().or(z.literal("")),
});

export async function addJob(_: unknown, form: FormData) {
  const parsed = newJobSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Title, company and an https:// link please." };
  const { supabase } = await requireOwner();
  const loc = parsed.data.location ?? "";
  const { error } = await supabase.from("jobs").insert({
    title: parsed.data.title,
    company: parsed.data.company,
    location: loc || null,
    mode: /remote/i.test(loc) ? "remote" : /hybrid/i.test(loc) ? "hybrid" : "onsite",
    url: parsed.data.url || null,
  });
  if (error) return { error: error.code === "23505" ? "That job is already tracked." : "Could not save." };
  revalidatePath("/");
  return { ok: true };
}

/** One-time import of the jobs tracked on 21–22 Nov 2026. Only runs when the table is empty. */
export async function importStarterJobs() {
  const { supabase } = await requireOwner();
  const { count } = await supabase.from("jobs").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const rows = (starter as Array<Record<string, unknown>>).map((j) => ({ ...j }));
  const { error } = await supabase.from("jobs").insert(rows);
  if (error) throw new Error("Import failed.");
  await supabase.from("notifications").insert({
    kind: "success",
    title: `Imported ${rows.length} jobs from your 21 Nov tracker`,
  });
  revalidatePath("/");
}

// ---------- notes ----------
export async function addNote(_: unknown, form: FormData) {
  const body = z.string().trim().min(1).max(20000).safeParse(form.get("body"));
  if (!body.success) return { error: "Empty note." };
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("notes").insert({ body: body.data });
  if (error) return { error: "Could not save note." };
  revalidatePath("/");
  return { ok: true };
}

export async function markNotificationRead(id: string) {
  const nid = z.string().uuid().parse(id);
  const { supabase, user } = await requireOwner();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", nid).eq("owner", user.id);
  revalidatePath("/");
}
