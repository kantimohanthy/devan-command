import Link from "next/link";
import Orb from "@/components/Orb";
import SwipeDeck from "@/components/SwipeDeck";
import JobsTable, { type RankedJob } from "@/components/jobs/JobsTable";
import OpportunityList, { daysLeft, type Opp } from "@/components/OpportunityList";
import Shell, { type NavId } from "@/components/shell/Shell";
import { AddJobForm, NoteForm } from "@/components/Forms";
import { requireOwner } from "@/lib/supabase/server";
import { importStarterJobs, markNotificationRead, setJobStatus } from "./actions";
import { setOpportunityStatus } from "./opportunities/actions";
import { applySync, syncPending } from "./sync-actions";
import type { Job, JobSourceLink, Note, Notification, SponsorCheck } from "@/lib/types";
import { applyFilters, parseCommand, type JobFilters } from "@/lib/discovery/command";
import { sponsorStance } from "@/lib/discovery/sponsor";
import { WATCH_SLUGS } from "@/lib/discovery/registry";
import { fitScore } from "@/lib/fit";
import { pickNextMove } from "@/lib/next-move";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "fra1";

const QUICK: { id: string; label: string; f: JobFilters }[] = [
  { id: "shortlist", label: "Shortlisted", f: { shortlisted: true } },
  { id: "italy", label: "Open from Italy", f: { italy: "confirmed" } },
  { id: "watch", label: "Watchlist employers", f: { watchlist: true } },
  { id: "new", label: "New this week", f: { newWithinDays: 7 } },
];

const TABS = ["today", "jobs", "masters", "funding", "programmes", "notes"] as const;
type Tab = (typeof TABS)[number];

// Which tab each old-tracker category lives under
const GROUP = (c: string | null) => {
  const cat = c ?? "";
  if (cat === "Not eligible") return "archive";
  if (cat.startsWith("Masters")) return "masters";
  if (cat.startsWith("Funding") || /fellowship|ai safety/i.test(cat)) return "funding";
  return "programmes";
};

const romeHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(new Date()));
const greeting = () => { const h = romeHour(); return h < 5 ? "Still up, sir" : h < 12 ? "Good morning, sir" : h < 18 ? "Good afternoon, sir" : "Good evening, sir"; };
const today = () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" }).format(new Date());
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

export default async function Command({ searchParams }: { searchParams: Promise<{ tab?: string; c?: string; all?: string; cmd?: string; f?: string; job?: string; view?: string; status?: string }> }) {
  const { supabase } = await requireOwner();
  const sp = await searchParams;
  const cmd = (sp.cmd ?? "").slice(0, 300);
  const parsed = cmd ? parseCommand(cmd) : null;
  const tab: Tab = parsed || sp.job ? "jobs" : (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "today";

  const [{ data: jobs }, { data: opps }, { data: notes }, { data: notifs }, { data: linkRows }, { data: sponsorRows }, pending] = await Promise.all([
    supabase.from("jobs").select("id,title,company,location,mode,contract,url,posted,status,applied_at,official_url,shortlisted,italy_status,eligibility,compensation,sponsorship,experience_level,employment_type,description_excerpt,listing_expires_at,first_seen,last_checked,source_status").order("posted", { ascending: false, nullsFirst: false }),
    supabase.from("opportunities").select("id,name,type,category,eligibility,requirements,deadline,deadline_date,funding,status,url,verified").order("deadline_date", { ascending: true, nullsFirst: false }),
    supabase.from("notes").select("id,body,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("notifications").select("id,kind,title,body,created_at,read_at").is("read_at", null).order("created_at", { ascending: false }).limit(10),
    supabase.from("job_sources").select("job_id,source_slug,external_id,discovery_url,official_url,first_seen,last_seen"),
    supabase.from("uk_sponsor_checks").select("job_id,matched_name,town,rating,route,register_file,confidence,needs_review,candidates,checked_at").order("checked_at", { ascending: false }),
    syncPending(),
  ]);

  const linksBy = new Map<string, JobSourceLink[]>();
  for (const l of (linkRows ?? []) as (JobSourceLink & { job_id: string })[]) linksBy.set(l.job_id, [...(linksBy.get(l.job_id) ?? []), l]);
  const sponsorBy = new Map<string, SponsorCheck>();
  for (const r of (sponsorRows ?? []) as (SponsorCheck & { job_id: string })[]) if (!sponsorBy.has(r.job_id)) sponsorBy.set(r.job_id, r);

  const allJobs: RankedJob[] = ((jobs ?? []) as Job[]).map((j) => {
    const f = fitScore(j);
    return { ...j, links: linksBy.get(j.id) ?? [], sources: (linksBy.get(j.id) ?? []).map((l) => l.source_slug), sponsorCheck: sponsorBy.get(j.id) ?? null, fit: f.score, fitReasons: f.reasons };
  });
  const quick = QUICK.find((q) => q.id === sp.f);
  const activeFilters: JobFilters | null = parsed ? parsed.filters : quick ? quick.f : null;
  const shownJobs = activeFilters
    ? applyFilters(allJobs.map((j) => ({ ...j, shortlisted: !!j.shortlisted, italy_status: j.italy_status ?? null, experience_level: j.experience_level ?? null, compensation: j.compensation ?? null, description_excerpt: j.description_excerpt ?? null, sponsorship: j.sponsorship ?? null, first_seen: j.first_seen ?? null, listing_expires_at: j.listing_expires_at ?? null })), activeFilters, WATCH_SLUGS, sponsorStance)
    : allJobs;

  const allOpps = (opps ?? []) as Opp[];
  const isOpenOpp = (o: Opp) => { const d = daysLeft(o.deadline_date); return d === null || d >= 0; };
  const finished = (o: Opp) => ["Applied", "Rejected", "Not eligible", "Skipped", "Accepted"].includes(o.status);
  const dueSoon = allOpps.filter((o) => { const d = daysLeft(o.deadline_date); return d !== null && d >= 0 && d <= 30 && !finished(o) && GROUP(o.category) !== "archive"; });
  const due7 = dueSoon.filter((o) => (daysLeft(o.deadline_date) ?? 99) <= 7).length;

  const toReview = allJobs.filter((j) => j.status === "to_apply");
  const n = {
    review: toReview.length,
    shortlisted: allJobs.filter((j) => j.shortlisted && !["rejected", "skipped"].includes(j.status)).length,
    applied: allJobs.filter((j) => j.status === "applied").length,
    interviews: allJobs.filter((j) => j.status === "interview" || j.status === "offer").length,
  };
  const counts: Partial<Record<NavId, number>> = {
    jobs: n.review,
    masters: allOpps.filter((o) => GROUP(o.category) === "masters" && isOpenOpp(o)).length,
    funding: allOpps.filter((o) => GROUP(o.category) === "funding" && isOpenOpp(o)).length,
    programmes: allOpps.filter((o) => GROUP(o.category) === "programmes" && isOpenOpp(o)).length,
  };

  const move = pickNextMove(allJobs, allOpps);
  const topMatches = [...toReview].sort((a, b) => b.fit - a.fit).slice(0, 6);

  // opportunity tabs
  const inTab = allOpps.filter((o) => GROUP(o.category) === tab);
  const cats = [...new Set(inTab.map((o) => o.category ?? "Other"))].sort();
  const shownOpps = inTab.filter((o) => (sp.c ? (o.category ?? "Other") === sp.c : true) && (sp.all ? true : isOpenOpp(o)));
  const href = (q: Record<string, string | undefined>) => "/?" + new URLSearchParams(Object.entries({ tab, ...q }).filter(([, v]) => v) as [string, string][]).toString();
  const TITLES: Record<Tab, string> = { today: "", jobs: "Jobs", masters: "Masters", funding: "Fellowships & funding", programmes: "Programmes", notes: "Notepad" };

  return (
    <Shell active={tab} counts={counts}>
      {tab === "today" && (
        <div className="flex flex-col gap-8">
          <header className="flex items-center gap-4">
            <div className="-my-4 -ml-3 shrink-0"><Orb size={88} /></div>
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{greeting()}.</h1>
              <p className="text-mist">{today()}, Rome</p>
            </div>
          </header>

          {pending && (
            <form action={applySync} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-medium text-snow">{pending.title}</p>
                <p className="mt-1 text-sm text-mist">{pending.summary}</p>
              </div>
              <button className="press shrink-0 rounded-lg border border-sky/60 px-4 py-2 text-sm text-sky hover:bg-sky/10">Update tracker</button>
            </form>
          )}

          {/* The one thing to do next */}
          <section aria-labelledby="next-move" className="relative overflow-hidden rounded-2xl border border-sky/25 bg-gradient-to-br from-[#16224a] to-panel p-6 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 opacity-40 sm:-right-16 sm:-top-16 sm:opacity-80"><Orb size={260} /></div>
            <div className="relative max-w-xl">
              <p className="text-sm text-sky">Your next move</p>
              <h2 id="next-move" className="mt-2 text-2xl font-semibold leading-snug sm:text-[30px]">{move.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-snow/80">{move.reason}{move.kind === "deadline" ? ` Deadline ${fmtDay(move.due)}.` : ""}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {move.href && (
                  <a href={move.href} {...(move.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="press rounded-lg bg-volt px-4 py-2.5 text-sm font-semibold text-void">
                    {move.kind === "deadline" || move.kind === "apply" ? "Open official form" : move.kind === "clear" ? "Open Sources" : "Open details"}
                  </a>
                )}
                {move.kind === "deadline" && (
                  <form action={setOpportunityStatus.bind(null, move.oppId, "Applied")}>
                    <button className="press rounded-lg border border-line px-4 py-2.5 text-sm text-snow hover:border-sky/60">I submitted it</button>
                  </form>
                )}
                {move.kind === "apply" && (
                  <form action={setJobStatus.bind(null, move.jobId, "applied")}>
                    <button className="press rounded-lg border border-line px-4 py-2.5 text-sm text-snow hover:border-sky/60">I applied</button>
                  </form>
                )}
              </div>
            </div>
          </section>

          <nav aria-label="Pipeline" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "To review", v: n.review, href: "/?tab=jobs" },
              { label: "Shortlisted", v: n.shortlisted, href: "/?tab=jobs&f=shortlist" },
              { label: "Applied", v: n.applied, href: "/?tab=jobs&status=applied" },
              { label: "Interviews", v: n.interviews, href: "/?tab=jobs&status=active" },
              { label: "Due in 7 days", v: due7, href: "#deadlines", warn: due7 > 0 },
            ].map((k) => (
              <Link key={k.label} href={k.href} className="press card px-4 py-3 last:col-span-2 hover:border-sky/50 sm:last:col-span-1">
                <span className={`num block text-2xl font-semibold ${k.warn ? "text-amber" : "text-snow"}`}>{k.v}</span>
                <span className="text-sm text-mist">{k.label}</span>
              </Link>
            ))}
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section id="deadlines" aria-labelledby="deadlines-h" className="card p-5">
              <div className="flex items-baseline justify-between">
                <h2 id="deadlines-h" className="font-medium">Deadlines</h2>
                <span className="text-sm text-mist">next 30 days, Rome time</span>
              </div>
              {dueSoon.length === 0 ? (
                <p className="mt-4 text-mist">Nothing due in the next 30 days.</p>
              ) : (
                <ol className="mt-4 flex flex-col">
                  {dueSoon.slice(0, 12).map((o) => {
                    const d = daysLeft(o.deadline_date)!;
                    const tone = d <= 3 ? "text-amber" : d <= 7 ? "text-amber/80" : "text-mist";
                    return (
                      <li key={o.id} className="grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                        <span className={`num text-sm ${tone}`}>{fmtDay(o.deadline_date!)}</span>
                        <span className="min-w-0">
                          {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky">{o.name}</a> : o.name}
                          <span className="block truncate text-xs text-mist">{o.category}</span>
                        </span>
                        <span className={`num text-sm ${tone}`}>{d === 0 ? "today" : d === 1 ? "tomorrow" : `${d} days`}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {dueSoon.length > 12 && <Link href="/?tab=masters" className="mt-3 inline-block text-sm text-sky hover:underline">See all {dueSoon.length}</Link>}
            </section>

            <section aria-labelledby="matches-h" className="card p-5">
              <div className="flex items-baseline justify-between">
                <h2 id="matches-h" className="font-medium">Best matches</h2>
                <Link href="/?tab=jobs" className="text-sm text-sky hover:underline">All jobs</Link>
              </div>
              <ul className="mt-4 flex flex-col gap-1">
                {topMatches.map((j) => (
                  <li key={j.id}>
                    <Link href={`/?tab=jobs&job=${j.id}`} className="press flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raise">
                      <span className="relative h-9 w-9 shrink-0">
                        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-line)" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-sky)" strokeWidth="3" strokeDasharray={`${(j.fit / 100) * 94.2} 94.2`} strokeLinecap="round" />
                        </svg>
                        <span className="num absolute inset-0 grid place-items-center text-[11px] font-semibold">{j.fit}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-snow">{j.title}</span>
                        <span className="block truncate text-xs text-mist">{j.company}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {notifs && notifs.length > 0 && (
            <section aria-label="Updates" className="flex flex-col gap-2">
              {(notifs as Notification[]).map((x) => (
                <form key={x.id} action={markNotificationRead.bind(null, x.id)} className="flex items-center gap-3 rounded-xl border border-line/70 px-4 py-2.5 text-sm">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.kind === "warning" ? "bg-amber" : "bg-sky"}`} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="text-snow">{x.title}</span>{x.body && <span className="text-mist"> {x.body}</span>}</span>
                  <button className="press text-xs text-mist hover:text-snow">Dismiss</button>
                </form>
              ))}
            </section>
          )}
        </div>
      )}

      {tab !== "today" && (
        <header className="mb-6 flex flex-wrap items-end gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">{TITLES[tab]}</h1>
          {tab === "jobs" && (
            <div className="flex flex-wrap gap-1.5 sm:ml-auto">
              {QUICK.map((q) => (
                <Link key={q.id} href={sp.f === q.id ? "/?tab=jobs" : `/?tab=jobs&f=${q.id}`} className={`press rounded-lg border px-3 py-1.5 text-sm ${sp.f === q.id && !parsed ? "border-sky/70 text-sky" : "border-line text-mist hover:text-snow"}`}>{q.label}</Link>
              ))}
              <Link href={sp.view === "swipe" ? "/?tab=jobs" : "/?tab=jobs&view=swipe"} className="press rounded-lg border border-line px-3 py-1.5 text-sm text-mist hover:text-snow">{sp.view === "swipe" ? "Table view" : "Swipe through"}</Link>
            </div>
          )}
        </header>
      )}

      {tab === "jobs" && (
        <div>
          {parsed && (
            <section className="card mb-6 p-5">
              <p className="text-sm text-mist">You asked</p>
              <p className="mt-1 text-snow">{cmd}</p>
              {parsed.readBack.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">{parsed.readBack.map((r) => <li key={r} className="rounded-md bg-raise px-2 py-1 text-snow/80">{r}</li>)}</ul>
              ) : <p className="mt-2 text-sm text-mist">No filters recognised, so everything is shown.</p>}
              {parsed.notice && <p className="mt-3 text-sm text-amber">{parsed.notice}</p>}
              <p className="mt-3 text-sm text-sky">{shownJobs.length} {shownJobs.length === 1 ? "match" : "matches"} · <Link href="/?tab=jobs" className="underline">clear</Link></p>
            </section>
          )}
          {allJobs.length === 0 ? (
            <section className="card flex flex-col items-center gap-4 p-8 text-center">
              <p>Your job tracker is empty.</p>
              <form action={importStarterJobs}><button className="press rounded-lg bg-volt px-5 py-3 font-semibold text-void">Import the 42 jobs from 21–22 Nov</button></form>
            </section>
          ) : sp.view === "swipe" ? (
            <div className="mx-auto max-w-sm"><SwipeDeck jobs={toReview} /></div>
          ) : (
            <JobsTable key={`${sp.f ?? ""}|${cmd}|${sp.status ?? ""}`} jobs={shownJobs as RankedJob[]} initialJob={sp.job} initialStatus={activeFilters ? "all" : sp.status ?? "open"} />
          )}
          <details className="mt-10 max-w-xl">
            <summary className="cursor-pointer text-sm text-mist hover:text-snow">Track a job by hand</summary>
            <div className="mt-4"><AddJobForm /></div>
          </details>
        </div>
      )}

      {(tab === "masters" || tab === "funding" || tab === "programmes") && (
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Link href={href({ all: sp.all })} className={`press rounded-lg border px-3 py-1.5 ${!sp.c ? "border-sky/70 text-sky" : "border-line text-mist hover:text-snow"}`}>All</Link>
            {cats.map((cat) => (
              <Link key={cat} href={href({ c: cat, all: sp.all })} className={`press rounded-lg border px-3 py-1.5 ${sp.c === cat ? "border-sky/70 text-sky" : "border-line text-mist hover:text-snow"}`}>{cat}</Link>
            ))}
            <Link href={href({ c: sp.c, all: sp.all ? undefined : "1" })} className="ml-auto text-sm text-mist hover:text-snow">{sp.all ? "Hide closed" : "Show closed too"}</Link>
          </div>
          <p className="my-4 text-sm text-mist">{shownOpps.length} shown, soonest deadline first</p>
          <OpportunityList items={shownOpps} />
          {tab === "programmes" && allOpps.some((o) => GROUP(o.category) === "archive") && (
            <details className="mt-8 text-sm text-mist">
              <summary className="cursor-pointer">Marked not eligible ({allOpps.filter((o) => GROUP(o.category) === "archive").length})</summary>
              <div className="mt-4"><OpportunityList items={allOpps.filter((o) => GROUP(o.category) === "archive")} /></div>
            </details>
          )}
        </div>
      )}

      {tab === "notes" && (
        <section className="max-w-2xl">
          <NoteForm />
          <ul className="mt-4 flex flex-col gap-2">
            {((notes ?? []) as Note[]).map((x) => <li key={x.id} className="card whitespace-pre-wrap px-4 py-3 text-sm">{x.body}</li>)}
          </ul>
        </section>
      )}
    </Shell>
  );
}
