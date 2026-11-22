"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { setJobStatus, toggleShortlist } from "@/app/actions";
import { ITALY_LABEL, STATUS_LABEL, type Job, type JobStatus } from "@/lib/types";
import type { FitReason } from "@/lib/fit";
import JobEvidence, { fmtDate } from "./JobEvidence";

export type RankedJob = Job & { fit: number; fitReasons: FitReason[] };

const STATUS_FILTERS: { id: string; label: string; match: (s: JobStatus) => boolean }[] = [
  { id: "open", label: "To review", match: (s) => s === "to_apply" || s === "in_progress" },
  { id: "applied", label: "Applied", match: (s) => s === "applied" },
  { id: "active", label: "Interviews & offers", match: (s) => s === "interview" || s === "offer" },
  { id: "closed", label: "Skipped & rejected", match: (s) => s === "skipped" || s === "rejected" },
  { id: "all", label: "All", match: () => true },
];
const SORTS = { fit: "Best fit", new: "Newest", company: "Company" } as const;

/** The money figure inside a stated-pay sentence, for the table column. */
export function payShort(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /(?:[$€£]|\b(?:usd|eur|gbp)\s?)\s?\d[\d,.]*\s?[kK]?(?:\s?(?:-|–|to)\s?(?:[$€£]|(?:usd|eur|gbp)\s?)?\s?\d[\d,.]*\s?[kK]?)?(?:\s?(?:per|\/)\s?(?:year|yr|annum|hour|hr|month))?/i.exec(text);
  return m ? m[0].trim() : "See listing";
}

function FitBadge({ score }: { score: number }) {
  const tone = score >= 60 ? "text-void bg-sky" : score >= 40 ? "text-sky border border-sky/50" : "text-mist border border-line";
  return <span className={`num inline-flex h-7 w-9 items-center justify-center rounded-md text-[13px] font-semibold ${tone}`} title="Fit score">{score}</span>;
}

function ItalyChip({ s }: { s: Job["italy_status"] }) {
  if (!s) return null;
  const map = { confirmed: "text-sky", possible: "text-snow/70", excluded: "text-rose", unknown: "text-mist" } as const;
  const short = { confirmed: "Open from Italy", possible: "Maybe from Italy", excluded: "Not from Italy", unknown: "Italy unclear" } as const;
  return <span className={`text-xs ${map[s]}`}>{short[s]}</span>;
}

export default function JobsTable({ jobs, initialJob, initialStatus = "open" }: { jobs: RankedJob[]; initialJob?: string; initialStatus?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(STATUS_FILTERS.some((f) => f.id === initialStatus) ? initialStatus : "open");
  const [sort, setSort] = useState<keyof typeof SORTS>("fit");
  const [openId, setOpenId] = useState<string | null>(initialJob ?? null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, jobs.filter((j) => f.match(j.status)).length])), [jobs]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = STATUS_FILTERS.find((x) => x.id === status)!;
    const list = jobs.filter((j) => f.match(j.status) && (!t || `${j.title} ${j.company} ${j.location ?? ""}`.toLowerCase().includes(t)));
    return [...list].sort((a, b) =>
      sort === "fit" ? b.fit - a.fit || (b.first_seen ?? "").localeCompare(a.first_seen ?? "")
      : sort === "new" ? (b.first_seen ?? b.posted ?? "").localeCompare(a.first_seen ?? a.posted ?? "")
      : a.company.localeCompare(b.company),
    );
  }, [jobs, q, status, sort]);

  const open = jobs.find((j) => j.id === openId) ?? null;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("job", openId);
    else url.searchParams.delete("job");
    window.history.replaceState(null, "", url);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const star = (j: RankedJob) => (
    <button
      type="button"
      aria-pressed={!!j.shortlisted}
      aria-label={j.shortlisted ? `Remove ${j.title} from shortlist` : `Shortlist ${j.title}`}
      disabled={pending}
      onClick={(e) => { e.stopPropagation(); start(() => toggleShortlist(j.id, !j.shortlisted)); }}
      className={`press grid h-8 w-8 place-items-center rounded-md text-base ${j.shortlisted ? "text-amber" : "text-line hover:text-mist"}`}
    >
      ★
    </button>
  );

  return (
    <div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div role="tablist" aria-label="Job status" className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={status === f.id}
              onClick={() => setStatus(f.id)}
              className={`press shrink-0 rounded-lg px-3 py-1.5 text-sm ${status === f.id ? "bg-raise text-snow" : "text-mist hover:text-snow"}`}
            >
              {f.label} <span className="num text-mist">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 xl:ml-auto">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by role, company, city" aria-label="Filter jobs" className="well min-w-0 flex-1 px-3 py-1.5 text-sm outline-none focus:border-sky xl:w-64" />
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label="Sort jobs" className="well px-2 py-1.5 text-sm">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card mt-6 p-8 text-center text-mist">No jobs match. Clear the filter or run a sync from Sources.</p>
      ) : (
        <div className="card mt-5 overflow-hidden">
          <div className="hidden grid-cols-[3rem_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_8.5rem_2.5rem] gap-4 border-b border-line px-4 py-2.5 text-xs text-mist md:grid">
            <span>Fit</span><span>Role</span><span>Where</span><span>Pay</span><span>Status</span><span className="sr-only">Shortlist</span>
          </div>
          <ul>
            {rows.slice(0, 300).map((j) => (
              <li
                key={j.id}
                onClick={() => setOpenId(j.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpenId(j.id))}
                tabIndex={0}
                aria-label={`${j.title} at ${j.company}, fit ${j.fit}. Open details`}
                className={`grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-x-4 gap-y-1 border-b border-line/60 px-4 py-3 last:border-b-0 hover:bg-raise/60 md:grid-cols-[3rem_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_8.5rem_2.5rem] ${openId === j.id ? "bg-raise" : ""}`}
              >
                <FitBadge score={j.fit} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-snow">{j.title}</p>
                  <p className="truncate text-sm text-mist">{j.company}<span className="md:hidden"> · {j.location ?? j.mode}</span></p>
                </div>
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-sm text-snow/85">{j.location ?? j.mode}</p>
                  <ItalyChip s={j.italy_status} />
                </div>
                <p className={`hidden truncate text-sm md:block ${j.compensation ? "text-snow/85" : "text-mist"}`}>{payShort(j.compensation) ?? "Not stated"}</p>
                <span className="hidden text-sm text-mist md:block">{STATUS_LABEL[j.status]}</span>
                {star(j)}
              </li>
            ))}
          </ul>
          {rows.length > 300 && <p className="px-4 py-3 text-xs text-mist">Showing the top 300 of {rows.length}. Filter to see the rest.</p>}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-void/60 backdrop-blur-[2px]" onMouseDown={() => setOpenId(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${open.title} at ${open.company}`}
            onMouseDown={(e) => e.stopPropagation()}
            className="drawer-in flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-line bg-panel"
          >
            <div className="sticky top-0 z-10 border-b border-line bg-panel/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start gap-4">
                <FitBadge score={open.fit} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold leading-snug text-snow">{open.title}</h2>
                  <p className="mt-0.5 line-clamp-1 text-sm text-mist" title={open.location ?? undefined}>{open.company} · {open.location ?? open.mode}</p>
                  {open.posted && <p className="text-xs text-mist">Posted {fmtDate(open.posted)}</p>}
                </div>
                <button type="button" onClick={() => setOpenId(null)} aria-label="Close details" className="press grid h-8 w-8 place-items-center rounded-md text-mist hover:bg-raise hover:text-snow">✕</button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(open.official_url ?? open.url) && (
                  <a href={open.official_url ?? open.url!} target="_blank" rel="noopener noreferrer" className="press rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-void">Open official vacancy</a>
                )}
                <button type="button" disabled={pending} onClick={() => start(() => toggleShortlist(open.id, !open.shortlisted))} className="press rounded-lg border border-line px-3 py-2 text-sm text-snow hover:border-amber/70">
                  {open.shortlisted ? "Remove from shortlist" : "Add to shortlist"}
                </button>
                <select
                  aria-label="Status"
                  disabled={pending}
                  value={open.status}
                  onChange={(e) => start(() => setJobStatus(open.id, e.target.value as JobStatus))}
                  className="well px-2 py-2 text-sm"
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-6 px-6 py-6">
              <section>
                <h3 className="text-[13px] font-medium text-mist">Why it scores {open.fit}</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {open.fitReasons.map((r) => (
                    <li key={r.label} className={`rounded-md px-2 py-1 text-xs ${r.delta > 0 ? "bg-sky/10 text-sky" : r.delta < 0 ? "bg-rose/10 text-rose" : "bg-raise text-mist"}`}>
                      {r.label} <span className="num">{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
                    </li>
                  ))}
                </ul>
                {open.italy_status && <p className={`mt-3 text-sm ${open.italy_status === "excluded" ? "text-rose" : "text-snow/85"}`}>{ITALY_LABEL[open.italy_status].text}</p>}
              </section>
              <JobEvidence j={open} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
