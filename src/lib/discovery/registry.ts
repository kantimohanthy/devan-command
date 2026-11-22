// Versioned allowlist of discovery sources. Runtime state (last sync, errors) lives in the
// `sources` table. A source shows "Connected" only after a successful end-to-end import.

export type Method = "api" | "rss" | "greenhouse" | "mcp" | "manual";

export type SourceDef = {
  slug: string;
  name: string;
  kind: "board" | "employer";
  method: Method;
  methodNote: string; // how DEVAN collects, and why
  homepage: string;
  docs?: string;
  terms?: string; // attribution / permitted-use rules DEVAN follows
  hosts?: string[]; // pasted links from these hosts are attributed to this source
  automated: boolean; // has a scheduled/one-tap sync adapter
  minHoursBetweenSyncs?: number;
  config?: { queries?: string[]; board?: string; careersUrl?: string; careersCheckedOn?: string; endpoint?: string };
};

export const SOURCES: SourceDef[] = [
  {
    slug: "himalayas",
    name: "Himalayas",
    kind: "board",
    method: "api",
    methodNote: "Documented public JSON API, search endpoint, no key. Reads page 1 of each saved query (partial by design).",
    homepage: "https://himalayas.app",
    docs: "https://himalayas.app/docs/remote-jobs-api",
    terms: "Credit Himalayas with a link; Apply must use applicationLink; never republish to other boards. Data refreshes every 24h.",
    hosts: ["himalayas.app"],
    automated: true,
    minHoursBetweenSyncs: 0.25,
    config: { queries: ["python", "backend", "machine learning", "network engineer", "internship"] },
  },
  {
    slug: "weworkremotely",
    name: "We Work Remotely",
    kind: "board",
    method: "rss",
    methodNote: "Public RSS feed https://weworkremotely.com/remote-jobs.rss. Only engineering/data categories are kept. WWR's region label is not trusted on its own.",
    homepage: "https://weworkremotely.com",
    docs: "https://weworkremotely.com/remote-jobs.rss",
    terms: "Link back to the WWR listing. Personal, low-frequency use.",
    hosts: ["weworkremotely.com"],
    automated: true,
    minHoursBetweenSyncs: 0.25,
  },
  {
    slug: "remotive",
    name: "Remotive",
    kind: "board",
    method: "api",
    methodNote: "Documented public API https://remotive.com/api/remote-jobs (software-dev category). Public feed is small and delayed 24h by Remotive's terms.",
    homepage: "https://remotive.com",
    docs: "https://github.com/remotive-com/remote-jobs-api",
    terms: "Max ~4 requests/day (DEVAN enforces 6h between syncs); link back to the Remotive URL and mention Remotive as the source.",
    hosts: ["remotive.com"],
    automated: true,
    minHoursBetweenSyncs: 6,
    config: { endpoint: "https://remotive.com/api/remote-jobs?category=software-dev" },
  },
  {
    slug: "hiringcafe",
    name: "HiringCafe",
    kind: "board",
    method: "mcp",
    methodNote: "MCP service at https://hiringcafe.com/api/mcp, evaluated for on-demand search only (no bulk import). Use “Test connection” to probe from the deployment.",
    homepage: "https://hiring.cafe",
    docs: "https://hiringcafe.com/api/mcp",
    hosts: ["hiring.cafe", "hiringcafe.com"],
    automated: false,
    config: { endpoint: "https://hiringcafe.com/api/mcp" },
  },
  ...(
    [
      ["wttj", "Welcome to the Jungle", "https://www.welcometothejungle.com", ["welcometothejungle.com", "app.welcometothejungle.com"]],
      ["ycombinator", "Y Combinator Jobs", "https://www.ycombinator.com/jobs", ["ycombinator.com", "workatastartup.com"]],
      ["accel", "Accel portfolio jobs", "https://jobs.accel.com", ["jobs.accel.com"]],
      ["workinstartups", "Work in Startups", "https://workinstartups.com", ["workinstartups.com"]],
      ["flexa", "Flexa", "https://flexa.careers", ["flexa.careers"]],
      ["higherin", "Higherin", "https://higherin.com", ["higherin.com"]],
      ["grb", "Graduate Recruitment Bureau", "https://www.grb.uk.com", ["grb.uk.com"]],
      ["milkround", "Milkround", "https://www.milkround.com", ["milkround.com"]],
      ["prospects", "Prospects", "https://www.prospects.ac.uk", ["prospects.ac.uk"]],
      ["visajobs", "VisaJobs.uk", "https://visajobs.uk", ["visajobs.uk"]],
    ] as const
  ).map(([slug, name, homepage, hosts]) => ({
    slug,
    name,
    kind: "board" as const,
    method: "manual" as const,
    methodNote:
      "No documented public API or feed verified yet. Paste a vacancy link: DEVAN reads the page's schema.org JobPosting data (or the employer's ATS API when the link resolves to one) and keeps this board as the discovery source. Next step: job-alert emails once Gmail reading is enabled.",
    homepage,
    hosts: [...hosts],
    automated: false,
  })),
  ...(
    [
      ["neuralink", "Neuralink", "neuralink", "https://neuralink.com/careers"],
      ["unconventional", "Unconventional AI", "unconventionalinc", "https://unconv.ai/careers/"],
      ["figure", "Figure", "figureai", "https://www.figure.ai/careers"],
      ["colossal", "Colossal Biosciences", "colossalbiosciences", "https://colossal.com/careers/"],
    ] as const
  ).map(([slug, name, board, careersUrl]) => ({
    slug,
    name,
    kind: "employer" as const,
    method: "greenhouse" as const,
    methodNote: `Careers page resolves to Greenhouse board “${board}”. Read with the documented Greenhouse Job Board API (full list each sync).`,
    homepage: careersUrl,
    docs: "https://developers.greenhouse.io/job-board.html",
    hosts: [new URL(careersUrl).hostname.replace(/^www\./, "")],
    automated: true,
    minHoursBetweenSyncs: 0.1,
    config: { board, careersUrl, careersCheckedOn: "2026-11-22" },
  })),
];

// Boom left Greenhouse: its careers page now redirects (/go/jobs/<uuid>) to Rippling Recruiting.
// Rippling's public board feed is not documented for third-party use, so Boom is link-import only.
SOURCES.splice(SOURCES.findIndex((s) => s.kind === "employer"), 0, {
  slug: "boom",
  name: "Boom Supersonic",
  kind: "employer",
  method: "manual",
  methodNote:
    "Careers page now redirects to Rippling Recruiting (ats.rippling.com/boom-supersonic). Rippling's public board feed is undocumented for third parties, so DEVAN does not poll it. Paste a Boom job link and DEVAN reads that page.",
  homepage: "https://boomsupersonic.com/careers",
  hosts: ["boomsupersonic.com", "ats.rippling.com"],
  automated: false,
  config: { careersUrl: "https://boomsupersonic.com/careers", careersCheckedOn: "2026-11-22" },
});

export const sourceBySlug = (slug: string) => SOURCES.find((s) => s.slug === slug);

export function sourceForHost(hostname: string): SourceDef | undefined {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return SOURCES.find((s) => s.hosts?.some((x) => h === x || h.endsWith("." + x)));
}

export const WATCH_SLUGS = SOURCES.filter((s) => s.kind === "employer").map((s) => s.slug);
