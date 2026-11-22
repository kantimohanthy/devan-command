import Link from "next/link";
import { requireOwner } from "@/lib/supabase/server";
import { SOURCES, type SourceDef } from "@/lib/discovery/registry";
import { HiringCafePanel, SyncButton, UrlImport } from "./SourceForms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "fra1";

type Run = { source_slug: string; started_at: string; ok: boolean | null; complete: boolean; fetched: number; filtered_out: number; new_unique: number; duplicates: number; errors: number; message: string | null; trigger: string };
type State = { slug: string; last_success_at: string | null; last_attempt_at: string | null; last_error: string | null; probe: Record<string, unknown> | null; careers_checked_on: string | null };

const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(d)) + " Rome" : "Never");

function connection(s: SourceDef, st: State | undefined, runs: Run[]) {
  const okImport = runs.some((r) => r.ok && r.new_unique + r.duplicates > 0);
  if (s.method === "mcp") {
    const p = st?.probe as { auth?: string; tools?: unknown[]; error?: string } | null;
    if (!p) return { label: "Not tested", tone: "text-mist" };
    if (p.error) return { label: "Probe failed", tone: "text-[#ff9aa8]" };
    return { label: p.auth === "none" ? "Reachable · on-demand only" : `Auth ${p.auth}`, tone: p.auth === "none" ? "text-sky" : "text-[#ffcf70]" };
  }
  if (okImport) return { label: s.automated ? "Connected" : "Link import working", tone: "text-volt" };
  if (st?.last_error) return { label: "Error", tone: "text-[#ff9aa8]" };
  return { label: s.automated ? "Not synced yet" : "Manual link import", tone: "text-mist" };
}

export default async function SourcesPage() {
  const { supabase } = await requireOwner();
  const [{ data: states }, { data: runs }, { data: links }] = await Promise.all([
    supabase.from("sources").select("slug,last_success_at,last_attempt_at,last_error,probe,careers_checked_on"),
    supabase.from("source_runs").select("source_slug,started_at,ok,complete,fetched,filtered_out,new_unique,duplicates,errors,message,trigger").order("started_at", { ascending: false }).limit(300),
    supabase.from("job_sources").select("source_slug,job_id,jobs(status,shortlisted)"),
  ]);
  const st = new Map((states as State[] | null ?? []).map((s) => [s.slug, s]));
  const runsBy = new Map<string, Run[]>();
  for (const r of (runs as Run[] | null) ?? []) runsBy.set(r.source_slug, [...(runsBy.get(r.source_slug) ?? []), r]);
  const value = new Map<string, { jobs: number; shortlisted: number; applied: number; interviews: number }>();
  for (const l of (links ?? []) as unknown as { source_slug: string; jobs: { status: string; shortlisted: boolean } | null }[]) {
    const v = value.get(l.source_slug) ?? { jobs: 0, shortlisted: 0, applied: 0, interviews: 0 };
    v.jobs++;
    if (l.jobs?.shortlisted) v.shortlisted++;
    if (l.jobs && ["applied", "interview", "offer"].includes(l.jobs.status)) v.applied++;
    if (l.jobs && ["interview", "offer"].includes(l.jobs.status)) v.interviews++;
    value.set(l.source_slug, v);
  }

  const groups: [string, SourceDef[]][] = [
    ["Connected by API, RSS or MCP", SOURCES.filter((s) => s.kind === "board" && s.method !== "manual")],
    ["Employer watchlist", SOURCES.filter((s) => s.kind === "employer")],
    ["Link import (automated access not verified)", SOURCES.filter((s) => s.method === "manual")],
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="wordmark text-2xl">devan</Link>
        <Link href="/?tab=jobs" className="text-sm text-mist hover:text-snow">← Jobs</Link>
      </header>
      <h1 className="mt-10 text-3xl font-semibold">Sources</h1>
      <p className="mt-2 max-w-2xl text-mist">
        Where DEVAN looks, how, and what each source has produced. A failed or partial sync never closes a job. Jobs a full employer sync no longer lists are only flagged.
      </p>

      <div className="mt-8"><UrlImport /></div>

      {groups.map(([title, list]) => (
        <section key={title} className="mt-12">
          <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">{title}</h2>
          <ul className="flex flex-col gap-3">
            {list.map((s) => {
              const r = runsBy.get(s.slug) ?? [];
              const last = r[0];
              const c = connection(s, st.get(s.slug), r);
              const v = value.get(s.slug);
              const state = st.get(s.slug);
              return (
                <li key={s.slug} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold hover:text-sky">{s.name}</a>
                        <span className={`text-sm ${c.tone}`}>{c.label}</span>
                        <span className="text-xs uppercase tracking-widest text-mist">{s.method === "greenhouse" ? "Greenhouse API" : s.method.toUpperCase()}</span>
                      </div>
                      <p className="mt-1 text-sm text-mist">{s.methodNote}</p>
                      {s.terms && <p className="mt-1 text-xs text-mist">Rules followed: {s.terms}</p>}
                      {s.kind === "employer" && (
                        <p className="mt-1 text-xs text-mist">
                          Careers page: <a className="text-sky" href={s.config?.careersUrl} target="_blank" rel="noopener noreferrer">{s.config?.careersUrl}</a> · ATS verified {s.config?.careersCheckedOn}
                        </p>
                      )}
                    </div>
                    {s.automated && <SyncButton slug={s.slug} label="Sync now" />}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-mist">Last successful sync</dt><dd>{fmt(state?.last_success_at ?? null)}</dd></div>
                    <div><dt className="text-xs text-mist">Last run</dt><dd>{last ? `${last.new_unique} new · ${last.duplicates} dupes · ${last.errors} errors` : "—"}</dd></div>
                    <div><dt className="text-xs text-mist">Coverage</dt><dd>{last ? (last.complete ? "Full list" : "Partial (never closes jobs)") : "—"}</dd></div>
                    <div><dt className="text-xs text-mist">Value so far</dt><dd>{v ? `${v.jobs} roles · ${v.shortlisted} shortlisted · ${v.interviews} interviews` : "—"}</dd></div>
                  </dl>
                  {state?.last_error && <p className="mt-2 text-xs text-[#ff9aa8]">Last error: {state.last_error}</p>}
                  {last?.message && <p className="mt-1 text-xs text-mist">{last.message}</p>}
                  {s.method === "mcp" && (
                    <>
                      {state?.probe && <details className="mt-2 text-xs text-mist"><summary className="cursor-pointer">Last probe</summary><pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(state.probe, null, 2)}</pre></details>}
                      <HiringCafePanel />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
