// Natural-language command → typed, explicit filters. Deterministic: no model decides scope.

export type JobFilters = {
  italy?: "confirmed";
  keywords?: string[];
  levels?: string[]; // matched against experience_level / title
  paid?: boolean;
  watchlist?: boolean;
  newWithinDays?: number;
  uk?: boolean;
  sponsorOffered?: boolean;
  shortlisted?: boolean;
  expiresWithinDays?: number;
  limit?: number;
  sources?: string[];
};

export type ParsedCommand = {
  intent: "find" | "prepare" | "unknown";
  filters: JobFilters;
  readBack: string[]; // how DEVAN understood it, shown to the user
  notice?: string;
};

const KEYWORDS: Array<[RegExp, string]> = [
  [/\bpython\b/i, "python"],
  [/\bback-?end\b/i, "backend"],
  [/\bfront-?end\b/i, "frontend"],
  [/\bfull-?stack\b/i, "full-stack"],
  [/\b(ml|machine learning)\b/i, "machine learning"],
  [/\b(ai|artificial intelligence)\b/i, "ai"],
  [/\b(network(ing)?|noc)\b/i, "network"],
  [/\b(devops|sre|site reliability|infrastructure)\b/i, "infrastructure"],
  [/\b(data engineer|data)\b/i, "data"],
  [/\b(research)\b/i, "research"],
  [/\b(speech|audio)\b/i, "speech"],
  [/\b(space|satellite|aerospace)\b/i, "space"],
  [/\b(robotics?)\b/i, "robotics"],
];
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function parseCommand(input: string): ParsedCommand {
  const t = input.trim().toLowerCase();
  const f: JobFilters = {};
  const read: string[] = [];
  if (!t) return { intent: "unknown", filters: f, readBack: [] };

  const intent: ParsedCommand["intent"] = /^\s*(prepare|draft|tailor|apply)\b/.test(t) ? "prepare" : /\b(find|show|list|search|get)\b/.test(t) ? "find" : "find";

  if (/\b(from|in|near) (rome|roma|italy|italia)\b|\bi can do from\b|\bfrom home in italy\b/.test(t)) {
    f.italy = "confirmed";
    read.push("Confirmed open from Italy only (explicit evidence)");
  }
  const kw = KEYWORDS.filter(([re]) => re.test(t)).map(([, k]) => k);
  if (kw.length) {
    f.keywords = kw;
    read.push(`Matches any of: ${kw.join(", ")}`);
  }
  const levels: string[] = [];
  if (/\bjunior\b/.test(t)) levels.push("junior");
  if (/\b(intern|internships?|tirocini?)\b/.test(t)) levels.push("intern");
  if (/\b(graduate|grad|entry[- ]level|new grad)\b/.test(t)) levels.push("graduate");
  if (levels.length) {
    f.levels = levels;
    read.push(`Level: ${levels.join(" or ")}`);
  }
  if (/\bpaid\b/.test(t)) {
    f.paid = true;
    read.push("Excludes listings that say unpaid/volunteer; pay Unknown is kept and labelled");
  }
  if (/\b(watch ?list|five (watch|companies)|my (five|5) (companies|employers))\b/.test(t)) {
    f.watchlist = true;
    read.push("Only the 5 watchlist employers");
  }
  if (/\bnew\b/.test(t)) {
    f.newWithinDays = 7;
    read.push("First seen in the last 7 days");
  }
  if (/\b(uk|united kingdom|britain|british|london)\b/.test(t)) {
    f.uk = true;
    read.push("UK roles");
  }
  if (/\b(sponsor(ship|s)?|visa)\b/.test(t)) {
    f.sponsorOffered = true;
    read.push("Vacancy text explicitly offers sponsorship");
  }
  if (/\bshortlist(ed)?\b/.test(t)) {
    f.shortlisted = true;
    read.push("Shortlisted only");
  }
  if (/\b(this week|next 7 days|within a week)\b/.test(t)) {
    f.expiresWithinDays = 7;
    read.push("Listing closes within 7 days (source expiry date; not a verified application deadline)");
  } else if (/\b(two weeks|next 14 days|fortnight)\b/.test(t)) {
    f.expiresWithinDays = 14;
    read.push("Listing closes within 14 days (source expiry date; not a verified application deadline)");
  }
  const n = /\b(?:the |top )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b(?= (?:shortlisted|roles|jobs|best))/.exec(t);
  if (n) {
    f.limit = Number(n[1]) || NUM[n[1]];
    read.push(`At most ${f.limit}`);
  }

  const notice =
    intent === "prepare"
      ? "Application preparation (tailored CV and letter per role) is not built yet. These are the records it would use; nothing was generated or submitted."
      : undefined;
  return { intent, filters: f, readBack: read, notice };
}

type FilterableJob = {
  title: string;
  company: string;
  italy_status: string | null;
  experience_level: string | null;
  compensation: string | null;
  description_excerpt: string | null;
  location: string | null;
  sponsorship: string | null;
  shortlisted: boolean | null;
  first_seen: string | null;
  listing_expires_at: string | null;
  sources?: string[];
  eligibility?: { sponsorStance?: string } | null;
};

export function applyFilters<T extends FilterableJob>(jobs: T[], f: JobFilters, watchSlugs: string[], stance: (text: string | null) => string, now = Date.now()): T[] {
  const day = 86400000;
  let out = jobs.filter((j) => {
    const hay = `${j.title} ${j.description_excerpt ?? ""}`.toLowerCase();
    if (f.italy && j.italy_status !== "confirmed") return false;
    if (f.keywords && !f.keywords.some((k) => hay.includes(k === "ai" ? " ai" : k) || (k === "backend" && hay.includes("back-end")))) return false;
    if (f.levels && !f.levels.some((lv) => `${j.experience_level ?? ""} ${j.title}`.toLowerCase().includes(lv))) return false;
    if (f.paid && /\b(unpaid|volunteer)\b/i.test(hay)) return false;
    if (f.watchlist && !(j.sources ?? []).some((s) => watchSlugs.includes(s))) return false;
    if (f.newWithinDays && (!j.first_seen || now - Date.parse(j.first_seen) > f.newWithinDays * day)) return false;
    if (f.uk && !/\b(uk|united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|bristol|leeds|cambridge|oxford)\b/i.test(`${j.location ?? ""}`)) return false;
    if (f.sponsorOffered && (j.eligibility?.sponsorStance ?? stance(j.sponsorship ?? j.description_excerpt)) !== "offered") return false;
    if (f.shortlisted && !j.shortlisted) return false;
    if (f.expiresWithinDays) {
      const e = j.listing_expires_at ? Date.parse(j.listing_expires_at) : NaN;
      if (!(e >= now && e - now <= f.expiresWithinDays * day)) return false;
    }
    return true;
  });
  if (f.paid) out = [...out].sort((a, b) => Number(!!b.compensation) - Number(!!a.compensation));
  if (f.limit) out = out.slice(0, f.limit);
  return out;
}
