import Link from "next/link";
import { requireOwner } from "@/lib/supabase/server";
import OpportunityStatus from "./OpportunityStatus";

export const dynamic = "force-dynamic";

type Opp = {
  id: string; name: string; type: string | null; category: string | null; eligibility: string | null;
  requirements: string | null; deadline: string | null; deadline_date: string | null; funding: string | null;
  status: string; url: string | null; verified: boolean;
};

function daysLeft(d: string | null) {
  if (!d) return null;
  const ms = new Date(d + "T23:59:59Z").getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { supabase } = await requireOwner();
  const { c } = await searchParams;
  const { data } = await supabase
    .from("opportunities")
    .select("id,name,type,category,eligibility,requirements,deadline,deadline_date,funding,status,url,verified")
    .order("deadline_date", { ascending: true, nullsFirst: false });
  const all = (data ?? []) as Opp[];
  const categories = [...new Set(all.map((o) => o.category ?? "Other"))].sort();
  const list = c ? all.filter((o) => (o.category ?? "Other") === c) : all;
  const upcoming = all.filter((o) => { const d = daysLeft(o.deadline_date); return d !== null && d >= 0 && d <= 30; });

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="wordmark text-2xl">devan</Link>
        <Link href="/" className="text-sm text-mist hover:text-snow">← Jobs</Link>
      </header>

      <h1 className="mt-10 text-3xl font-semibold">Masters, fellowships & programmes</h1>
      <p className="mt-2 text-mist">
        {all.length} tracked · {upcoming.length} deadlines in the next 30 days
      </p>

      {all.length === 0 && (
        <div className="card mt-10 p-8 text-center">
          <p>Nothing here yet. Your old tracker is encrypted, so bring it in with your password.</p>
          <Link href="/import" className="press mt-4 inline-block rounded-xl bg-volt px-5 py-3 font-semibold text-void">Import old tracker</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8 rounded-2xl border border-maroon/60 bg-maroon/10 p-4">
          <h2 className="text-xs uppercase tracking-widest text-snow">Due within 30 days</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((o) => (
              <li key={o.id}><span className="text-volt">{daysLeft(o.deadline_date)}d</span> · {o.name}</li>
            ))}
          </ul>
        </section>
      )}

      {categories.length > 1 && (
        <nav className="mt-8 flex flex-wrap gap-2 text-sm">
          <Link href="/opportunities" className={`rounded-full border px-3 py-1 ${!c ? "border-sky text-sky" : "border-line text-mist"}`}>All</Link>
          {categories.map((cat) => (
            <Link key={cat} href={`/opportunities?c=${encodeURIComponent(cat)}`}
              className={`rounded-full border px-3 py-1 ${c === cat ? "border-sky text-sky" : "border-line text-mist"}`}>{cat}</Link>
          ))}
        </nav>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {list.map((o) => {
          const d = daysLeft(o.deadline_date);
          return (
            <li key={o.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-widest text-sky">{[o.category, o.type].filter(Boolean).join(" · ")}</p>
                  {o.url ? (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-semibold hover:text-sky">{o.name}</a>
                  ) : (
                    <p className="mt-1 text-lg font-semibold">{o.name}</p>
                  )}
                  <p className="mt-1 text-sm text-mist">
                    {o.deadline ?? "No deadline"}{d !== null && d >= 0 ? ` · ${d} days left` : d !== null ? " · closed" : ""}
                    {o.verified ? " · ✓ verified" : ""}
                  </p>
                </div>
                <OpportunityStatus id={o.id} status={o.status} />
              </div>
              {(o.funding || o.eligibility || o.requirements) && (
                <details className="mt-3 text-sm text-mist">
                  <summary className="cursor-pointer text-snow/80">Details</summary>
                  {o.funding && <p className="mt-2"><span className="text-snow">Funding:</span> {o.funding}</p>}
                  {o.eligibility && <p className="mt-1"><span className="text-snow">Eligibility:</span> {o.eligibility}</p>}
                  {o.requirements && <p className="mt-1"><span className="text-snow">Requirements:</span> {o.requirements}</p>}
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
