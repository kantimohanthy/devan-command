import Link from "next/link";
import Orb from "@/components/Orb";
import SwipeDeck from "@/components/SwipeDeck";
import JobBoard from "@/components/JobBoard";
import { AddJobForm, NoteForm } from "@/components/Forms";
import { requireOwner } from "@/lib/supabase/server";
import { importStarterJobs, markNotificationRead, signOut } from "./actions";
import type { Job, Note, Notification } from "@/lib/types";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(new Date()));
  return h < 5 ? "Still up, sir" : h < 12 ? "Good morning, sir" : h < 18 ? "Good afternoon, sir" : "Good evening, sir";
}

export default async function Command() {
  const { supabase } = await requireOwner();
  const [{ data: jobs }, { data: notes }, { data: notifs }] = await Promise.all([
    supabase.from("jobs").select("id,title,company,location,mode,contract,url,posted,status,applied_at").order("posted", { ascending: false, nullsFirst: false }),
    supabase.from("notes").select("id,body,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("notifications").select("id,kind,title,body,created_at,read_at").is("read_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  const all = (jobs ?? []) as Job[];
  const count = (s: Job["status"]) => all.filter((j) => j.status === s).length;
  const deck = all.filter((j) => j.status === "to_apply");

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
      <header className="flex items-center justify-between">
        <span className="wordmark text-2xl">devan</span>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/opportunities" className="text-mist hover:text-snow">Masters &amp; fellowships</Link>
          <Link href="/import" className="text-mist hover:text-snow">Import</Link>
          <form action={signOut}>
            <button className="press text-mist hover:text-snow">Lock</button>
          </form>
        </nav>
      </header>

      <section className="mt-6 flex flex-col items-center text-center">
        <Orb size={220} />
        <h1 className="mt-2 text-3xl font-semibold">{greeting()}.</h1>
        <p className="mt-2 text-mist">
          {deck.length} to review · {count("in_progress")} in progress · {count("applied")} applied · {count("interview")} interviews
        </p>
      </section>

      {notifs && notifs.length > 0 && (
        <section className="mt-10 flex flex-col gap-2">
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

      {all.length === 0 ? (
        <section className="card mt-10 flex flex-col items-center gap-4 p-8 text-center">
          <p>Your tracker is empty. Bring in the 42 jobs from 21–22 Nov?</p>
          <form action={importStarterJobs}>
            <button className="press rounded-xl bg-volt px-5 py-3 font-semibold text-void">Import my jobs</button>
          </form>
        </section>
      ) : (
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,380px)_1fr]">
          <section>
            <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">Swipe deck</h2>
            <SwipeDeck jobs={deck} />
          </section>
          <section className="mt-12 lg:mt-0">
            <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">All applications</h2>
            <JobBoard jobs={all} />
          </section>
        </div>
      )}

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">Track a job</h2>
          <AddJobForm />
        </section>
        <section>
          <h2 className="mb-4 text-xs uppercase tracking-widest text-mist">Notepad</h2>
          <NoteForm />
          <ul className="mt-4 flex flex-col gap-2">
            {((notes ?? []) as Note[]).map((n) => (
              <li key={n.id} className="card whitespace-pre-wrap px-4 py-3 text-sm">{n.body}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
