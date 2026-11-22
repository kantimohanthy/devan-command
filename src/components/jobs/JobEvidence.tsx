"use client";

import { SponsorCheckButton } from "@/app/sources/SourceForms";
import type { Job } from "@/lib/types";

const SOURCE_NAME: Record<string, string> = {
  himalayas: "Himalayas", weworkremotely: "We Work Remotely", remotive: "Remotive", hiringcafe: "HiringCafe", wttj: "Welcome to the Jungle",
  ycombinator: "Y Combinator Jobs", accel: "Accel portfolio", workinstartups: "Work in Startups", flexa: "Flexa", higherin: "Higherin", grb: "GRB",
  milkround: "Milkround", prospects: "Prospects", visajobs: "VisaJobs.uk", boom: "Boom Supersonic", neuralink: "Neuralink (Greenhouse)",
  unconventional: "Unconventional AI (Greenhouse)", figure: "Figure (Greenhouse)", colossal: "Colossal (Greenhouse)", manual: "Pasted link",
};
export const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Rome" }).format(new Date(d)) : null;
const UK = /\b(uk|united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|bristol|leeds|cambridge|oxford|gb)\b/i;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-mist">{k}</dt>
      <dd className={v === "Unknown" || v === "Not stated" ? "text-mist" : "text-snow"}>{v}</dd>
    </>
  );
}

export default function JobEvidence({ j }: { j: Job }) {
  const links = j.links ?? [];
  const e = j.eligibility;
  return (
    <div className="flex flex-col gap-6 text-sm">
      <section>
        <h3 className="text-[13px] font-medium text-mist">Where can you do it from</h3>
        <ul className="mt-2 space-y-1.5">
          {(e?.evidence ?? []).length ? (
            e!.evidence!.map((x, i) => <li key={i} className="leading-relaxed text-snow/90">{x}</li>)
          ) : (
            <li className="text-mist">The listing gives no location rule. Treat it as unknown.</li>
          )}
        </ul>
      </section>

      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2">
        <Row k="Office" v={e?.office ? `${e.office}${e.officeLocation ? `, ${e.officeLocation}` : ""}` : "Unknown"} />
        <Row k="Remote countries" v={e?.remoteCountries?.join(", ") ?? "Not stated"} />
        <Row k="Time zone" v={e?.timezone ?? "Not stated"} />
        <Row k="Relocation" v={e?.relocation ?? "Not stated"} />
        <Row k="Pay" v={j.compensation ?? "Unknown"} />
        <Row k="Sponsorship" v={j.sponsorship ? `${e?.sponsorStance === "offered" ? "Offered" : e?.sponsorStance === "not_offered" ? "Not offered" : "Mentioned"}: “${j.sponsorship}”` : "Not stated"} />
        <Row k="Level" v={j.experience_level ?? "Unknown"} />
        <Row k="Enrolment / graduation" v="Unknown" />
        <Row k="Listing expires" v={j.listing_expires_at ? `${fmtDate(j.listing_expires_at)} (from the source, not a verified deadline)` : "Not stated"} />
      </dl>

      {UK.test(j.location ?? "") && (
        <section>
          <h3 className="text-[13px] font-medium text-mist">UK visa sponsor register</h3>
          {j.sponsorCheck && (
            <p className="mt-2 text-snow/90">
              {j.sponsorCheck.confidence === "exact"
                ? `Listed as ${j.sponsorCheck.matched_name}, ${j.sponsorCheck.town} (${j.sponsorCheck.route}).`
                : j.sponsorCheck.confidence === "probable"
                  ? `Possible matches, check by hand: ${(j.sponsorCheck.candidates ?? []).map((c) => c.name).join("; ")}.`
                  : "No licensed sponsor with this name."}{" "}
              <span className="text-mist">Register {j.sponsorCheck.register_file}, checked {fmtDate(j.sponsorCheck.checked_at)}.</span>
            </p>
          )}
          <div className="mt-2"><SponsorCheckButton jobId={j.id} /></div>
        </section>
      )}

      {links.length > 0 && (
        <section>
          <h3 className="text-[13px] font-medium text-mist">Found via</h3>
          <ul className="mt-2 space-y-2">
            {links.map((l) => (
              <li key={l.source_slug + l.external_id} className="well px-3 py-2">
                <span className="text-snow">{SOURCE_NAME[l.source_slug] ?? l.source_slug}</span>
                <span className="block text-xs text-mist">First seen {fmtDate(l.first_seen)}, last seen {fmtDate(l.last_seen)}</span>
                <span className="mt-1 flex gap-4 text-xs">
                  {l.discovery_url && <a className="text-sky hover:underline" href={l.discovery_url} target="_blank" rel="noopener noreferrer">Listing</a>}
                  {l.official_url && <a className="text-sky hover:underline" href={l.official_url} target="_blank" rel="noopener noreferrer">Official vacancy</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {j.description_excerpt && (
        <section>
          <h3 className="text-[13px] font-medium text-mist">From the listing</h3>
          <p className="mt-2 max-w-prose leading-relaxed text-snow/80">{j.description_excerpt}</p>
        </section>
      )}
    </div>
  );
}
