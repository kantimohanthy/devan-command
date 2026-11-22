"use client";

import { useTransition } from "react";
import { setJobStatus, toggleShortlist } from "@/app/actions";
import { SponsorCheckButton } from "@/app/sources/SourceForms";
import { ITALY_LABEL, STATUS_LABEL, type Job, type JobStatus } from "@/lib/types";

const ORDER: JobStatus[] = ["interview", "offer", "in_progress", "applied", "to_apply", "rejected", "skipped"];
const SOURCE_NAME: Record<string, string> = {
  himalayas: "Himalayas", weworkremotely: "We Work Remotely", remotive: "Remotive", hiringcafe: "HiringCafe", wttj: "Welcome to the Jungle",
  ycombinator: "Y Combinator Jobs", accel: "Accel portfolio", workinstartups: "Work in Startups", flexa: "Flexa", higherin: "Higherin", grb: "GRB",
  milkround: "Milkround", prospects: "Prospects", visajobs: "VisaJobs.uk", boom: "Boom Supersonic (Rippling page)", neuralink: "Neuralink (Greenhouse)",
  unconventional: "Unconventional AI (Greenhouse)", figure: "Figure (Greenhouse)", colossal: "Colossal (Greenhouse)", manual: "Pasted link",
};
const fmtDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(d)) : null);
const UK = /\b(uk|united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|bristol|leeds|cambridge|oxford|gb)\b/i;

export default function JobBoard({ jobs }: { jobs: Job[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-8">
      {ORDER.map((status) => {
        const list = jobs.filter((j) => j.status === status);
        if (!list.length) return null;
        return (
          <section key={status}>
            <h3 className="mb-3 text-xs uppercase tracking-widest text-mist">{STATUS_LABEL[status]} · {list.length}</h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {list.map((j) => {
                const it = j.italy_status ? ITALY_LABEL[j.italy_status] : null;
                const href = j.official_url ?? j.url;
                const discovered = (j.links?.length ?? 0) > 0;
                return (
                  <li key={j.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        aria-pressed={!!j.shortlisted}
                        aria-label={j.shortlisted ? `Remove ${j.title} from shortlist` : `Shortlist ${j.title}`}
                        disabled={pending}
                        onClick={() => start(() => toggleShortlist(j.id, !j.shortlisted))}
                        className={`press text-lg leading-none ${j.shortlisted ? "text-volt" : "text-line hover:text-mist"}`}
                      >
                        ★
                      </button>
                      <div className="min-w-0 flex-1">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-sky">{j.title}</a>
                        ) : (
                          <span className="font-medium">{j.title}</span>
                        )}
                        <p className="truncate text-sm text-mist">{j.company} · {j.location ?? j.mode}</p>
                        {discovered && (
                          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                            {it && <span className={`rounded-full border px-2 py-0.5 ${it.tone}`}>{it.text}</span>}
                            <span className="rounded-full border border-line px-2 py-0.5 text-mist">{j.compensation ? "Pay stated" : "Pay unknown"}</span>
                            {j.experience_level && <span className="rounded-full border border-line px-2 py-0.5 text-mist">{j.experience_level}</span>}
                            {j.source_status === "not_in_latest_full_sync" && <span className="rounded-full border border-maroon px-2 py-0.5 text-[#ff9aa8]">Not in latest full sync</span>}
                          </p>
                        )}
                      </div>
                      <select
                        aria-label={`Status for ${j.title}`}
                        disabled={pending}
                        defaultValue={j.status}
                        onChange={(e) => start(() => setJobStatus(j.id, e.target.value as JobStatus))}
                        className="rounded-lg border border-line bg-ink px-2 py-1 text-sm"
                      >
                        {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>

                    {discovered && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-mist hover:text-snow">Source &amp; evidence</summary>
                        <div className="mt-3 grid gap-4 rounded-xl border border-line bg-ink/60 p-4 sm:grid-cols-2">
                          <div>
                            <h4 className="text-xs uppercase tracking-widest text-mist">Found via</h4>
                            <ul className="mt-1 space-y-1">
                              {j.links!.map((l) => (
                                <li key={l.source_slug + l.external_id}>
                                  <span className="text-snow">{SOURCE_NAME[l.source_slug] ?? l.source_slug}</span>
                                  {l.discovery_url && <> · <a className="text-sky" href={l.discovery_url} target="_blank" rel="noopener noreferrer">listing</a></>}
                                  {l.official_url && <> · <a className="text-sky" href={l.official_url} target="_blank" rel="noopener noreferrer">official vacancy</a></>}
                                  <span className="block text-xs text-mist">First seen {fmtDate(l.first_seen)} · last seen {fmtDate(l.last_seen)}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-3 text-xs text-mist">Last checked {fmtDate(j.last_checked) ?? "—"}{j.listing_expires_at ? ` · listing expires ${fmtDate(j.listing_expires_at)} (source date, not a verified deadline)` : " · deadline unknown"}</p>
                          </div>
                          <div>
                            <h4 className="text-xs uppercase tracking-widest text-mist">Eligibility evidence</h4>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-mist">
                              {(j.eligibility?.evidence ?? []).length ? j.eligibility!.evidence!.map((e, i) => <li key={i}>{e}</li>) : <li>No location evidence in the listing. Unknown.</li>}
                            </ul>
                            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                              <dt className="text-mist">Office</dt><dd>{j.eligibility?.office ?? "unknown"}{j.eligibility?.officeLocation ? ` · ${j.eligibility.officeLocation}` : ""}</dd>
                              <dt className="text-mist">Remote countries</dt><dd>{j.eligibility?.remoteCountries?.join(", ") ?? "Not stated"}</dd>
                              <dt className="text-mist">Time zone</dt><dd>{j.eligibility?.timezone ?? "Not stated"}</dd>
                              <dt className="text-mist">Relocation</dt><dd>{j.eligibility?.relocation ?? "Not stated"}</dd>
                              <dt className="text-mist">Pay</dt><dd>{j.compensation ?? "Unknown"}</dd>
                              <dt className="text-mist">Sponsorship</dt><dd>{j.sponsorship ? `${j.eligibility?.sponsorStance ?? ""} · “${j.sponsorship}”` : "Not stated"}</dd>
                              <dt className="text-mist">Experience</dt><dd>{j.experience_level ?? "Unknown"}</dd>
                              <dt className="text-mist">Enrollment / graduation</dt><dd>Unknown (not extracted yet)</dd>
                            </dl>
                            {UK.test(j.location ?? "") && (
                              <div className="mt-3">
                                {j.sponsorCheck && (
                                  <p className="mb-2 text-xs">
                                    UK register ({j.sponsorCheck.register_file}): {j.sponsorCheck.confidence === "exact" ? `listed as ${j.sponsorCheck.matched_name}, ${j.sponsorCheck.town} · ${j.sponsorCheck.route}` : j.sponsorCheck.confidence === "probable" ? `needs review: ${(j.sponsorCheck.candidates ?? []).map((c) => c.name).join("; ")}` : "no licensed sponsor match"} · checked {fmtDate(j.sponsorCheck.checked_at)}
                                  </p>
                                )}
                                <SponsorCheckButton jobId={j.id} />
                              </div>
                            )}
                          </div>
                          {j.description_excerpt && <p className="text-xs text-mist sm:col-span-2">From the listing: {j.description_excerpt.slice(0, 600)}{j.description_excerpt.length > 600 ? "…" : ""}</p>}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
