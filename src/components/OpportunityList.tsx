import { daysUntil } from "@/lib/next-move";
import OpportunityStatus from "@/app/opportunities/OpportunityStatus";

export type Opp = {
  id: string; name: string; type: string | null; category: string | null; eligibility: string | null;
  requirements: string | null; deadline: string | null; deadline_date: string | null; funding: string | null;
  status: string; url: string | null; verified: boolean;
};

export function daysLeft(d: string | null) {
  return d ? daysUntil(d) : null;
}

export default function OpportunityList({ items }: { items: Opp[] }) {
  if (!items.length) return <p className="card p-6 text-mist">Nothing here yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((o) => {
        const d = daysLeft(o.deadline_date);
        return (
          <li key={o.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-sky">{[o.category, o.type].filter(Boolean).join(" · ")}</p>
                {o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-lg font-semibold hover:text-sky">{o.name}</a>
                ) : (
                  <p className="mt-1 text-lg font-semibold">{o.name}</p>
                )}
                <p className="mt-1 text-sm text-mist">
                  {o.deadline ?? "No deadline"}
                  {d !== null && d >= 0 ? <span className={d <= 14 ? "text-amber" : ""}> · {d === 0 ? "closes today" : d === 1 ? "closes tomorrow" : `${d} days left`}</span> : d !== null ? " · closed" : ""}
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
  );
}
