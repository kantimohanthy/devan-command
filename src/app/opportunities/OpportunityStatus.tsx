"use client";

import { useTransition } from "react";
import { setOpportunityStatus } from "./actions";

export const OPP_STATUSES = ["To review", "Preparing", "Applied", "Interview", "Accepted", "Rejected", "Not eligible", "Skipped"];

export default function OpportunityStatus({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const options = OPP_STATUSES.includes(status) ? OPP_STATUSES : [status, ...OPP_STATUSES];
  return (
    <select
      aria-label="Status"
      disabled={pending}
      defaultValue={status}
      onChange={(e) => start(() => setOpportunityStatus(id, e.target.value))}
      className="rounded-lg border border-line bg-ink px-2 py-1 text-sm"
    >
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
