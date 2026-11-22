"use client";

import { useTransition } from "react";
import { setJobStatus } from "@/app/actions";
import { STATUS_LABEL, type Job, type JobStatus } from "@/lib/types";

const ORDER: JobStatus[] = ["interview", "offer", "in_progress", "applied", "to_apply", "rejected", "skipped"];

export default function JobBoard({ jobs }: { jobs: Job[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-8">
      {ORDER.map((status) => {
        const list = jobs.filter((j) => j.status === status);
        if (!list.length) return null;
        return (
          <section key={status}>
            <h3 className="mb-3 text-xs uppercase tracking-widest text-mist">
              {STATUS_LABEL[status]} · {list.length}
            </h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {list.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-sky">
                        {j.title}
                      </a>
                    ) : (
                      <span className="font-medium">{j.title}</span>
                    )}
                    <p className="truncate text-sm text-mist">{j.company} · {j.location ?? j.mode}</p>
                  </div>
                  <select
                    aria-label={`Status for ${j.title}`}
                    disabled={pending}
                    defaultValue={j.status}
                    onChange={(e) => start(() => setJobStatus(j.id, e.target.value as JobStatus))}
                    className="rounded-lg border border-line bg-ink px-2 py-1 text-sm"
                  >
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
