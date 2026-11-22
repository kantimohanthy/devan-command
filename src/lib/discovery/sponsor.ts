// Sponsorship: the vacancy's own wording + the GOV.UK Register of Licensed Sponsors.
// Pure helpers here; the network lookup lives in sponsor-lookup.ts.

export type SponsorStance = "offered" | "not_offered" | "mentioned" | "unknown";

const NOT_OFFERED = /\b(?:(?:unable|not able|cannot|can't|can ?not|do not|don't|does not|will not|won't|no)\s+(?:to\s+)?(?:offer\s+|provide\s+)?(?:visa\s+)?sponsor(?:ship)?|sponsorship (?:is )?not (?:available|offered|provided)|without (?:the need for )?(?:visa )?sponsorship|without (?:the need for )?(?:company |employer )?assistance in (?:securing|obtaining) a visa|must (?:already )?have (?:the )?right to work|(?:us|u\.s\.) work authori[sz]ation is required)\b/i;
const OFFERED = /\b(?:(?:visa )?sponsorship (?:is |will be )?(?:available|offered|provided|possible)|(?:we|this role|the company) (?:can|will|are able to|is able to|offers?) (?:offer |provide )?(?:visa )?sponsor(?:ship)?|skilled worker (?:visa )?sponsorship (?:available|offered)|open to sponsoring)\b/i;

export function sponsorStance(text: string | null | undefined): SponsorStance {
  if (!text) return "unknown";
  if (NOT_OFFERED.test(text)) return "not_offered";
  if (OFFERED.test(text)) return "offered";
  if (/sponsor/i.test(text)) return "mentioned";
  return "unknown";
}

const LEGAL_NOISE = /\b(limited|ltd|plc|llp|lp|inc|incorporated|llc|corp|corporation|co|the|t\/a)\b/g;

export function normalizeOrg(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RegisterRow = { name: string; town: string; county: string; rating: string; route: string };

/** Match an employer to register rows. Exact normalized equality is "exact"; anything looser goes to review. */
export function matchSponsor(employer: string, rows: RegisterRow[]) {
  const q = normalizeOrg(employer);
  if (!q) return { confidence: "none" as const, best: null, candidates: [] as RegisterRow[] };
  const exact = rows.filter((r) => normalizeOrg(r.name) === q);
  if (exact.length) return { confidence: "exact" as const, best: exact[0], candidates: exact.slice(0, 5) };
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  const probable = rows.filter((r) => {
    const n = normalizeOrg(r.name);
    if (!n) return false;
    if (n.startsWith(q + " ") || q.startsWith(n + " ")) return true;
    const nt = new Set(n.split(" "));
    return qTokens.length >= 2 && qTokens.every((t) => nt.has(t));
  });
  return probable.length
    ? { confidence: "probable" as const, best: probable[0], candidates: probable.slice(0, 8) }
    : { confidence: "none" as const, best: null, candidates: [] as RegisterRow[] };
}

/** Minimal CSV line parser (quoted fields, escaped quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
