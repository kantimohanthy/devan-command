import "server-only";
import { getJson, getText, SourceError } from "./fetch";
import { matchSponsor, normalizeOrg, parseCsvLine, type RegisterRow } from "./sponsor";

// GOV.UK publishes the register as a CSV attached to this publication; the file name carries the date.
const CONTENT_API = "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

export async function lookupUkSponsor(employer: string) {
  const meta = await getJson<{ details?: { attachments?: { url?: string; title?: string; content_type?: string }[]; documents?: string[] } }>(CONTENT_API);
  const att = (meta.details?.attachments ?? []).find((a) => /\.csv($|\?)/i.test(a.url ?? "") || /csv/i.test(a.content_type ?? ""));
  let csvUrl = att?.url ?? null;
  if (!csvUrl) {
    const docs = (meta.details?.documents ?? []).join(" ");
    csvUrl = /href="(https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+\.csv)"/i.exec(docs)?.[1] ?? null;
  }
  if (!csvUrl || !/^https:\/\/assets\.publishing\.service\.gov\.uk\//.test(csvUrl)) throw new SourceError("Could not find the register CSV on GOV.UK.");
  const file = decodeURIComponent(csvUrl.split("/").pop() ?? "");
  const r = await getText(csvUrl, { timeoutMs: 45000, maxBytes: 60_000_000, accept: "text/csv" });
  if (!r.ok) throw new SourceError(`GOV.UK register download failed (HTTP ${r.status}).`);

  // Only keep rows sharing a token with the employer, to keep memory low.
  const tokens = normalizeOrg(employer).split(" ").filter((t) => t.length > 2);
  const lines = r.text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const ci = { name: col(/organisation name/), town: col(/town|city/), county: col(/county/), rating: col(/type|rating/), route: col(/route/) };
  if (ci.name < 0) throw new SourceError("Register CSV format changed; review needed.");
  const rows: RegisterRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (!tokens.some((t) => low.includes(t))) continue;
    const f = parseCsvLine(lines[i]);
    rows.push({ name: f[ci.name] ?? "", town: f[ci.town] ?? "", county: f[ci.county] ?? "", rating: f[ci.rating] ?? "", route: f[ci.route] ?? "" });
  }
  const m = matchSponsor(employer, rows);
  return { file, ...m };
}
