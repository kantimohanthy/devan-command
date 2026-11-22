import Link from "next/link";
import Orb from "@/components/Orb";
import SwipeDeck from "@/components/SwipeDeck";
import JobBoard from "@/components/JobBoard";
import OpportunityList, { daysLeft, type Opp } from "@/components/OpportunityList";
import { AddJobForm, NoteForm } from "@/components/Forms";
import { requireOwner } from "@/lib/supabase/server";
import { importStarterJobs, markNotificationRead, signOut } from "./actions";
import { applySync, syncPending } from "./sync-actions";
import type { Job, Note, Notification } from "@/lib/types";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(new Date()));
  return h < 5 ? "Still up, sir" : h < 12 ? "Good morning, sir" : h < 18 ? "Good afternoon, sir" : "Good evening, sir";
}

// Which tab each old-tracker category lives under
const GROUP = (c: string | null) => {
  const cat = c ?? "";
  if (cat === "Not eligible") return "archive";
  if (cat.startsWith("Masters")) return "masters";
  if (cat.startsWith("Funding") || /fellowship|ai safety/i.test(cat)) return "funding";
  return "programmes";
};

const TABS = [
  { id: "today", label: "Today" },
  { id: "jobs", label: "Jobs" },
  { id: "masters", label: "Masters" },
  { id: "funding", label: "Fellowships & funding" },
  { id: "programmes", label: "Programmes & more" },
  { id: "notes", label: "Notepad" },
] as const;

export default async function Command({ searchParams }: { searchParams: Promise<{ tab?: string; c?: string; all?: string }> }) {
  const { supabase } = await requireOwner();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "today";

  const [{ data: jobs }, { data: opps }, { data: notes }, { data: notifs }] = await Promise.all([
    supabase.from("jobs").select("id,title,company,location,mode,contract,url,posted,status,applied_at").order("posted", { ascending: false, nullsFirst: false }),
    supabase.from("opportunities").select("id,name,type,category,eligibility,requirements,deadline,deadline_date,funding,status,url,verified").order("deadline_date", { ascending: true, nullsFirst: false }),
    supabase.from("notes").select("id,body,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("notifications").select("id,kind,title,body,created_at,read_at").is("read_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  const pending = await syncPending();
  const allJobs = (jobs ?? []) as Job[];
  const allOpps = (opps ?? []) as Opp[];
  const count = (s: Job["status"]) => allJobs.filter((j) => j.status === s).length;
  const deck = allJobs.filter((j) => j.status === "to_apply");

  const closed = (o: Opp) => ["Rejected", "Not eligible", "Skipped", "Accepted"].includes(o.status);
  const open = (o: Opp) => { const d = daysLeft(o.deadline_date); return d === null || d >= 0; };
  const dueSoon = allOpps.filter((o) => { const d = daysLeft(o.deadline_date); return d !== null && d >= 0 && d <= 30 && !closed(o) && GROUP(o.category) !== "archive"; });
  const activeJobs = allJobs.filter((j) => ["in_progress", "interview", "offer"].includes(j.status));
  const tabCount: Record<string, number> = {
    jobs: deck.length,
    masters: allOpps.filter((o) => GROUP(o.category) === "masters" && open(o)).length,
    funding: allOpps.filter((o) => GROUP(o.category) === "funding" && open(o)).length,
    programmes: allOpps.filter((o) => GROUP(o.category) === "programmes" && open(o)).length,
  };

  // list for the opportunity tabs
  const inTab = allOpps.filter((o) => GROUP(o.category) === tab);
  const cats = [...new Set(inTab.map((o) => o.category ?? "Other"))].sort();
  const shown = inTab.filter((o) => (sp.c ? (o.category ?? "Other") === sp.c : true) && (sp.all ? true : open(o)));
  const href = (q: Record<string, string | undefined>) =>
    "/?" + new URLSearchParams(Object.entries({ tab, ...q }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
      <header className="flex items-center justify-between">
        <span className="wordmark text-2xl">devan</span>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/import" className="text-mist hover:text-snow">Import</Link>
          <form action={signOut}><button className="press text-mist hover:text-snow">Lock</button></form>
        </nav>
      </header>

      <section className="mt-6 flex flex-col items-center text-center">
        <Orb size={tab === "today" ? 200 : 110} />
        <h1 className="mt-2 text-3xl font-semibold">{greeting()}.</h1>
        <p className="mt-2 text-mist">
          {deck.length} jobs to review · {count("applied")} applied · {count("interview")} interviews · {dueSoon.length} deadlines in 30 days
        </p>
      </section>

      <nav className="sticky top-0 z-20 -mx-5 mt-8 flex gap-2 overflow-x-auto bg-void/90 px-5 py-3 backdrop-blur">
        {TABS.map((t) => (
          <Link key={t.id} href={`/?tab=${t.id}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm ${tab === t.id ? "border-volt bg-volt text-void" : "border-line text-mist hover:text-snow"}`}>
            {t.label}{tabCount[t.id] ? <span className="ml-1 opacity-70">{tabCount[t.id]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "today" && (
        <div className="mt-6 flex flex-col gap-10">
          {pending && (
            <form action={applySync} className="card flex flex-col gap-3 border-volt/60 p-5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-semibold text-volt">{pending.title}</p>
                <p className="mt-1 text-sm text-mist">{pending.summary}</p>
              </div>
              <button className="press shrink-0 rounded-xl bg-volt px-5 py-3 font-semibold text-void">Update tracker</button>
            </form>
          )}
          {notifs && notifs.length > 0 && (
            <section className="flex flex-col gap-2">
              {(notifs as Notification[]).map((n) => (
                <form key={n.id} action={markNotificationRead.bind(null, n.id)}
                  className={`card flex items-center justify-between gap-3 px-4 py-3 ${n.kind === "warning" ? "border-maroon" : ""}`}>
                  <div>
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-sm text-mist">{n.body}</p>}
                  </div>
                  <button className="press text-xs text-mist hover:text-snow">Dismiss</button>
                </form>
              ))}
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xs uppercase tracking-widest text-mist">Deadlines in the next 30 days</h2>
            {dueSoon.length === 0 ? <p className="card p-5 text-mist">Nothing due. {allOpps.length === 0 && <Link href="/import" className="text-sky">Import your old tracker →</Link>}</p> : (
              <ul className="card divide-y divide-line">
                {dueSoon.map((o) => {
                  const d = daysLeft(o.deadline_date)!;
                  return (
                    <li key={o.id} className="flex items-center gap-4 px-4 py-3">
                      <span className={`w-12 shrink-0 text-right font-semibold ${d <= 3 ? "text-maroon" : d <= 10 ? "text-volt" : "text-sky"}`}>{d === 0 ? "today" : `${d}d`}</span>
                      <div className="min-w-0 flex-1">
                        {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky">{o.name}</a> : o.name}
                        <p className="text-xs text-mist">{o.category} · {o.status}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {activeJobs.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-widest text-mist">Jobs in motion</h2>
              <JobBoard jobs={activeJobs} />
            </section>
          )}

          {deck.length > 0 && (
            <section className="mx-auto w-full max-w-sm">
              <h2 className="mb-3 text-xs uppercase tracking-widest text-mist">Swipe: {deck.length} jobs waiting</h2>
              <SwipeDeck jobs={deck} />
            </section>
          )}
        </div>
      )}

      {tab === "jobs" && (
        <div className="mt-6">
          {allJobs.length === 0 ? (
            <section className="card flex flex-col items-center gap-4 p-8 text-center">
              <p>Your job tracker is empty.</p>
              <form action={importStarterJobs}><button className="press rounded-xl bg-volt px-5 py-3 font-semibold text-void">Import the 42 jobs from 21–22 Nov</button></form>
            </section>
          ) : (
            <div className="grid gap-12 lg:grid-cols-[minmax(0,380px)_1fr]">
              <section>
                <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">Swipe deck</h2>
                <SwipeDeck jobs={deck} />
              </section>
              <section>
                <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">All {allJobs.length} jobs</h2>
                <JobBoard jobs={allJobs} />
              </section>
            </div>
          )}
          <section className="mt-12 max-w-xl">
            <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">Track a job</h2>
            <AddJobForm />
          </section>
        </div>
      )}

      {(tab === "masters" || tab === "funding" || tab === "programmes") && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={href({ all: sp.all })} className={`rounded-full border px-3 py-1 ${!sp.c ? "border-sky text-sky" : "border-line text-mist"}`}>All</Link>
            {cats.map((cat) => (
              <Link key={cat} href={href({ c: cat, all: sp.all })}
                className={`rounded-full border px-3 py-1 ${sp.c === cat ? "border-sky text-sky" : "border-line text-mist"}`}>{cat}</Link>
            ))}
            <Link href={href({ c: sp.c, all: sp.all ? undefined : "1" })} className="ml-auto text-xs text-mist hover:text-snow">
              {sp.all ? "Hide closed deadlines" : "Show closed deadlines too"}
            </Link>
          </div>
          <p className="my-4 text-sm text-mist">{shown.length} shown, soonest deadline first</p>
          <OpportunityList items={shown} />
          {tab === "programmes" && allOpps.some((o) => GROUP(o.category) === "archive") && (
            <details className="mt-8 text-sm text-mist">
              <summary className="cursor-pointer">Marked not eligible ({allOpps.filter((o) => GROUP(o.category) === "archive").length})</summary>
              <div className="mt-4"><OpportunityList items={allOpps.filter((o) => GROUP(o.category) === "archive")} /></div>
            </details>
          )}
        </div>
      )}

      {tab === "notes" && (
        <section className="mt-6 max-w-2xl">
          <NoteForm />
          <ul className="mt-4 flex flex-col gap-2">
            {((notes ?? []) as Note[]).map((n) => (
              <li key={n.id} className="card whitespace-pre-wrap px-4 py-3 text-sm">{n.body}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
