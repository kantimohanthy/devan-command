// The single recommended next action on Today, chosen by fixed rules (no model), with its reason.

export type MoveJob = { id: string; title: string; company: string; status: string; shortlisted?: boolean | null; url?: string | null; official_url?: string | null; fit: number };
export type MoveOpp = { id: string; name: string; status: string; deadline_date: string | null; url: string | null; category: string | null };

export type NextMove =
  | { kind: "deadline"; title: string; reason: string; href: string | null; oppId: string; due: string }
  | { kind: "interview"; title: string; reason: string; href: string | null; jobId: string }
  | { kind: "apply"; title: string; reason: string; href: string | null; jobId: string }
  | { kind: "review"; title: string; reason: string; href: string; jobId?: string }
  | { kind: "clear"; title: string; reason: string; href: string };

const OPEN_OPP = new Set(["To review", "Preparing"]);
const dayMs = 86400000;

/** Calendar days from today (Rome) to the deadline date: 0 = today, 1 = tomorrow. */
export function daysUntil(date: string, now = Date.now()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(now)); // YYYY-MM-DD
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / dayMs);
}

export function pickNextMove(jobs: MoveJob[], opps: MoveOpp[], now = Date.now()): NextMove {
  const urgent = opps
    .filter((o) => o.deadline_date && OPEN_OPP.has(o.status) && o.category !== "Not eligible")
    .map((o) => ({ o, d: daysUntil(o.deadline_date!, now) }))
    .filter((x) => x.d >= 0 && x.d <= 3)
    .sort((a, b) => a.d - b.d)[0];
  if (urgent) {
    const when = urgent.d === 0 ? "today" : urgent.d === 1 ? "tomorrow" : `in ${urgent.d} days`;
    return {
      kind: "deadline",
      title: `Submit ${urgent.o.name}`,
      reason: `It closes ${when} and it's still marked “${urgent.o.status}”.`,
      href: urgent.o.url,
      oppId: urgent.o.id,
      due: urgent.o.deadline_date!,
    };
  }
  const interview = jobs.find((j) => j.status === "interview");
  if (interview) {
    return { kind: "interview", title: `Prepare for ${interview.company}`, reason: `You have an interview stage open for ${interview.title}.`, href: interview.official_url ?? interview.url ?? null, jobId: interview.id };
  }
  const short = jobs.filter((j) => j.shortlisted && j.status === "to_apply").sort((a, b) => b.fit - a.fit)[0];
  if (short) {
    return { kind: "apply", title: `Apply to ${short.company}`, reason: `${short.title} is on your shortlist with a fit of ${short.fit}.`, href: short.official_url ?? short.url ?? null, jobId: short.id };
  }
  const best = jobs.filter((j) => j.status === "to_apply").sort((a, b) => b.fit - a.fit)[0];
  if (best && best.fit >= 40) {
    return { kind: "review", title: `Look at ${best.title}`, reason: `${best.company} is your best unreviewed match (fit ${best.fit}). Shortlist it or skip it.`, href: `/?tab=jobs&job=${best.id}`, jobId: best.id };
  }
  return { kind: "clear", title: "Find new roles", reason: "Nothing urgent. Run a sync to pull fresh listings.", href: "/sources" };
}
