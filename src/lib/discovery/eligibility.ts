import type { Eligibility, ItalyStatus, Listing } from "./types";
import { snippet } from "./text";

// Deterministic rules. "Remote", "Europe", "EMEA" or a board's "worldwide" label alone never
// make a role "confirmed" from Italy; a confirmation needs explicit wording or an Italian office.

const ITALY = /\b(italy|italia|italian republic|rome|roma|milan|milano|turin|torino|naples|napoli|bologna|florence|firenze)\b/i;
const EU_WIDE = /\b(europe|european union|\beu\b|emea|cet|cest|european time ?zones?)\b/i;
const WORLDWIDE_TEXT = /\b(?:work from anywhere(?!\s+(?:in|within|across)\s+(?!the world))|anywhere in the world|(?:remote|hire|hiring|open|candidates|applicants) (?:\w+ )?worldwide|worldwide remote|(?:we )?hire globally|globally remote|from any country)\b/i;

// Phrases that restrict a role to other countries (checked in description and location)
const COUNTRY_LOCK: Array<[RegExp, string]> = [
  [/\b(?:u\.?s\.?a?|united states|us)[- ]only\b/i, "US only"],
  [/\bonly (?:open to|available to|accepting) (?:candidates|applicants)? ?(?:based |located |residing )?in the (?:u\.?s\.?|united states)/i, "US only"],
  [/\bmust (?:be|reside|live)(?: currently)? (?:based |located |residing )?in the (?:u\.?s\.?a?|united states|us)\b/i, "Must be in the US"],
  [/\b(?:legally )?authori[sz]ed to work in the (?:u\.?s\.?|united states)\b/i, "Requires US work authorization"],
  [/\bmust (?:be|reside|live) (?:based |located )?in (?:the )?(uk|united kingdom|canada|india|germany|france|spain|brazil|latam|latin america|australia|philippines|mexico|poland|portugal|netherlands)\b/i, "Must be in $1"],
  [/\b(uk|canada|india|germany|latam|brazil|australia)[- ]only\b/i, "$1 only"],
  [/\b(?:within|in) (?:the )?(?:us|u\.s\.|united states) time ?zones?\b/i, "US time zones only"],
];

const US_STATE_OR_CITY = /\b(new york|san francisco|seattle|austin|boston|chicago|los angeles|denver|dallas|fremont|san jose|mountain view|palo alto|sunnyvale|washington,? d\.?c\.?|[a-z .]+,\s?(?:ca|ny|tx|wa|ma|co|il|fl|ga|nc|va|or|az|ut|nj|pa|md))\b/i;
const ONSITE = /\b(on-?site|in[- ]office|in person|5 days\/week in-office|days? (?:per|a) week in (?:the )?office)\b/i;
const HYBRID = /\bhybrid\b/i;
const RELOCATION = /\breloca(?:te|tion)\b/i;
const SPONSOR = /\b(visa sponsorship|sponsor(?:ship)?|right to work|work permit|work authori[sz]ation|skilled worker visa)\b/i;
const TZ = /\b(?:utc|gmt)\s?[+-]\s?\d{1,2}(?::\d{2})?(?:\s?(?:to|-|–)\s?(?:utc|gmt)?\s?[+-]\s?\d{1,2})?|\b(?:cet|cest|est|edt|pst|pdt|ct|et|pt) (?:time ?zone|hours|overlap)\b|\b\d+\s?hours? overlap\b/i;

export function extractEligibility(l: Pick<Listing, "countryRestrictions" | "locationText" | "remote" | "descriptionText" | "timezoneText">): Eligibility {
  const evidence: string[] = [];
  const desc = l.descriptionText ?? "";
  const loc = l.locationText ?? "";
  const both = `${loc}\n${desc}`;

  // office attendance
  let office: Eligibility["office"] = "unknown";
  if (HYBRID.test(loc) || HYBRID.test(desc.slice(0, 1500))) office = "hybrid";
  else if (l.remote === true || /\bremote\b/i.test(loc)) office = "remote";
  else if (ONSITE.test(desc) || (loc && !/remote/i.test(loc))) office = "onsite";

  // a country rule inside a benefits sentence ("ESPP … (US only)") is not a location rule
  const BENEFIT = /\b(espp|stock|401\(?k\)?|benefit|insurance|health|dental|vision|pension|equity|perk|discount|pto|leave)\b/i;
  const lock = COUNTRY_LOCK.map(([re, label]) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (let m = g.exec(both); m; m = g.exec(both)) {
      const start = Math.max(both.lastIndexOf("\n", m.index), both.lastIndexOf(". ", m.index)) + 1;
      const end = both.indexOf("\n", m.index) === -1 ? both.length : both.indexOf("\n", m.index);
      const sentence = both.slice(start, end);
      if (!BENEFIT.test(sentence)) return { label: label.replace("$1", (m[1] ?? "").toUpperCase()), text: snippet(both.slice(m.index - Math.min(m.index, 90)), re) };
    }
    return null;
  }).find(Boolean);

  let italy: ItalyStatus = "unknown";
  const countries = l.countryRestrictions;

  if (countries && countries.length > 0) {
    if (countries.some((c) => /^(it|italy|italia)$/i.test(c.trim()))) {
      italy = lock ? "possible" : "confirmed";
      evidence.push(`Source location restrictions include Italy: ${countries.join(", ")}`);
      if (lock) evidence.push(`But the listing text says ${lock.label}: “${lock.text}” (conflict, review)`);
    } else {
      italy = "excluded";
      evidence.push(`Source location restrictions exclude Italy: ${countries.slice(0, 12).join(", ")}${countries.length > 12 ? "…" : ""}`);
    }
  } else if (lock) {
    italy = "excluded";
    evidence.push(`${lock.label}: “${lock.text}”`);
  } else if (office !== "remote" && ITALY.test(loc)) {
    italy = "confirmed";
    evidence.push(`Office location in Italy: “${loc}”`);
  } else if (office !== "remote" && loc && US_STATE_OR_CITY.test(loc)) {
    italy = "excluded";
    evidence.push(`${office === "unknown" ? "Location" : "On-site/hybrid"} outside Italy: “${loc}”`);
  } else if (office === "remote") {
    const it = snippet(both, /\b(italy|italia)\b/i);
    const wwRaw = snippet(desc, WORLDWIDE_TEXT);
    // hedged wording ("many roles may…", "see individual listing") or a US-only HQ line never confirms
    const hedged = !!wwRaw && /\b(may|might|some|many|certain|most|depending|see (?:the )?individual|case[- ]by[- ]case)\b/i.test(wwRaw);
    const usHq = /\bheadquarters:\s*remote\s*-\s*(?:us|usa|united states)\b/i.test(desc);
    const ww = wwRaw && !hedged && !usHq ? wwRaw : null;
    if (it) {
      italy = "confirmed";
      evidence.push(`Listing names Italy: “${it}”`);
    } else if (ww) {
      italy = "confirmed";
      evidence.push(`Listing text says anywhere/worldwide: “${ww}”`);
    } else {
      italy = EU_WIDE.test(both) || (countries && countries.length === 0) || /anywhere/i.test(loc) || wwRaw ? "possible" : "unknown";
      if (wwRaw && !ww) evidence.push(`Worldwide wording is hedged or the HQ line says US: “${wwRaw}”`);
      else if (countries && countries.length === 0) evidence.push("Source metadata says worldwide, but the listing text does not confirm it");
      else if (/anywhere/i.test(loc)) evidence.push(`Board region label only: “${loc}”`);
      else if (EU_WIDE.test(both)) evidence.push(`Region only (not a country list): “${snippet(both, EU_WIDE)}”`);
    }
  } else if (loc && !ITALY.test(loc)) {
    italy = "excluded";
    evidence.push(`Location outside Italy: “${loc}”`);
  }

  const tzSrc = l.timezoneText || snippet(desc, TZ);
  const relocation = snippet(desc, RELOCATION);
  const sponsorship = snippet(desc, SPONSOR);
  if (relocation) evidence.push(`Relocation wording: “${relocation}”`);

  return {
    italy,
    office,
    remoteCountries: countries && countries.length ? countries : null,
    officeLocation: office !== "remote" && loc ? loc : null,
    timezone: tzSrc ?? null,
    relocation,
    sponsorship,
    evidence,
  };
}

export function experienceLevel(title: string, seniority: string | null): string | null {
  if (seniority) return seniority.slice(0, 60);
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b|\btirocin/.test(t)) return "Internship";
  if (/\bgraduate\b|\bnew grad\b|\bentry[- ]level\b/.test(t)) return "Graduate / entry";
  if (/\bjunior\b|\bjr\.?\b/.test(t)) return "Junior";
  if (/\bprincipal\b|\bstaff\b|\bdirector\b|\bhead of\b|\bvp\b|\bchief\b/.test(t)) return "Staff+ / leadership";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t)) return "Senior";
  return null; // Unknown — never guessed
}

const PAY = /(?:[$€£]\s?\d[\d,.]*\s?[kK]?(?!\s?(?:million|billion|bn|mn)\b)(?:\s?(?:-|–|to)\s?[$€£]?\s?\d[\d,.]*\s?[kK]?)?(?:\s?(?:usd|eur|gbp))?(?:\s?(?:per|\/)\s?(?:year|yr|annum|hour|hr|month))?)|(?:\b(?:usd|eur|gbp)\s?\d[\d,.]*(?:\s?(?:-|–)\s?\d[\d,.]*)?)/i;
const PAY_CONTEXT = /\b(salary|pay|compensation|base|per (?:year|hour|annum|month)|\/\s?(?:yr|hr|hour|year)|stipend|ote|hourly|annual|range|wage|rate)\b/i;
const NOT_PAY = /\b(raised|funding|valuation|million|billion|revenue|series [a-e]|investors?)\b/i;

/** Compensation exactly as stated; null means Unknown. */
export function compensationText(structured: string | null, description: string): string | null {
  if (structured && structured.trim()) return structured.trim().slice(0, 300);
  const re = new RegExp(PAY.source, "gi");
  for (let m = re.exec(description); m; m = re.exec(description)) {
    const around = description.slice(Math.max(0, m.index - 90), m.index + m[0].length + 60);
    if (PAY_CONTEXT.test(around) && !NOT_PAY.test(around)) {
      // keep the figure plus the words right before it ("base salary range is"), trimmed to word boundaries
      const lead = description.slice(Math.max(0, m.index - 40), m.index).replace(/^\S*\s/, "");
      return `${lead}${m[0]}`.replace(/\s+/g, " ").trim().slice(0, 300);
    }
  }
  return null;
}
