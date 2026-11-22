// Requisition keys: the most stable id we can find for an employer vacancy.
// Two listings share a key only when they point at the same ATS requisition.

export function normalizeUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|src$|gh_src$|lever-source|fbclid|gclid)/i.test(k)) url.searchParams.delete(k);
    }
    url.hostname = url.hostname.toLowerCase();
    let s = url.toString();
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export type AtsRef =
  | { vendor: "greenhouse"; board: string | null; id: string }
  | { vendor: "lever"; company: string; id: string }
  | { vendor: "ashby"; org: string; id: string }
  | { vendor: "workable"; account: string; id: string };

export function atsRefFromUrl(u: string | null): AtsRef | null {
  if (!u) return null;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  const h = url.hostname.toLowerCase();
  const p = url.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(h)) {
    // boards.greenhouse.io/{board}/jobs/{id} · job-boards.greenhouse.io/{board}/jobs/{id} · ?token= on embed
    const i = p.indexOf("jobs");
    if (i > 0 && /^\d+$/.test(p[i + 1] ?? "")) return { vendor: "greenhouse", board: p[i - 1], id: p[i + 1] };
    const tok = url.searchParams.get("token");
    const board = url.searchParams.get("for");
    if (tok && /^\d+$/.test(tok)) return { vendor: "greenhouse", board, id: tok };
  }
  const ghj = url.searchParams.get("gh_jid");
  if (ghj && /^\d+$/.test(ghj)) return { vendor: "greenhouse", board: null, id: ghj };
  if (h === "jobs.lever.co" || h === "jobs.eu.lever.co") {
    if (p[0] && /^[0-9a-f-]{36}$/i.test(p[1] ?? "")) return { vendor: "lever", company: p[0], id: p[1] };
  }
  if (h === "jobs.ashbyhq.com") {
    if (p[0] && /^[0-9a-f-]{36}$/i.test(p[1] ?? "")) return { vendor: "ashby", org: p[0], id: p[1] };
  }
  if (h === "apply.workable.com" && p[0] && p[1] === "j" && p[2]) return { vendor: "workable", account: p[0], id: p[2] };
  return null;
}

/** Greenhouse requisition ids are globally unique, so the board name is not part of the key. */
export function requisitionKey(ref: AtsRef | null): string | null {
  if (!ref) return null;
  switch (ref.vendor) {
    case "greenhouse":
      return `greenhouse:${ref.id}`;
    case "lever":
      return `lever:${ref.company.toLowerCase()}:${ref.id.toLowerCase()}`;
    case "ashby":
      return `ashby:${ref.org.toLowerCase()}:${ref.id.toLowerCase()}`;
    case "workable":
      return `workable:${ref.account.toLowerCase()}:${ref.id}`;
  }
}
