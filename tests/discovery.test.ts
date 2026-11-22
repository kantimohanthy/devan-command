import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fromGreenhouse, fromHimalayas, fromRemoteOk, remoteOkMatches, fromRemotive, parseWwrRss, findJobPosting, fromJobPosting } from "@/lib/discovery/normalize";
import { extractEligibility, compensationText } from "@/lib/discovery/eligibility";
import { atsRefFromUrl, normalizeUrl, requisitionKey } from "@/lib/discovery/keys";
import { buildIndex, newJobRow, planListing, sourceFacts, PROTECTED_JOB_FIELDS } from "@/lib/discovery/plan";
import { applyFilters, parseCommand } from "@/lib/discovery/command";
import { matchSponsor, parseCsvLine, sponsorStance } from "@/lib/discovery/sponsor";
import { sourceForHost, SOURCES } from "@/lib/discovery/registry";
import type { Listing } from "@/lib/discovery/types";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const him = JSON.parse(fx("himalayas.json")).jobs.map(fromHimalayas) as Listing[];
const rem = JSON.parse(fx("remotive.json")).jobs.map(fromRemotive) as Listing[];
const wwr = parseWwrRss(fx("wwr.rss"));
const gh = JSON.parse(fx("greenhouse.json")).jobs.map((j: object) => fromGreenhouse(j, "colossalbiosciences", "Colossal Biosciences", "colossal")) as Listing[];
const elig = (l: Parameters<typeof extractEligibility>[0]) => extractEligibility(l).italy;

describe("registry", () => {
  it("registers the 30 boards and 5 watch employers", () => {
    expect(SOURCES.filter((s) => s.kind === "board")).toHaveLength(30);
    expect(SOURCES.filter((s) => s.kind === "employer").map((s) => s.slug)).toEqual(["boom", "neuralink", "unconventional", "figure", "colossal"]);
    expect(SOURCES.filter((s) => s.method === "greenhouse").map((s) => s.config?.board)).toEqual(["neuralink", "unconventionalinc", "figureai", "colossalbiosciences"]);
    expect(sourceForHost("ats.rippling.com")?.slug).toBe("boom");
    expect(sourceForHost("app.welcometothejungle.com")?.slug).toBe("wttj");
    expect(sourceForHost("www.prospects.ac.uk")?.slug).toBe("prospects");
  });
});

describe("geographic eligibility", () => {
  it("confirms Italy only when Italy is explicitly listed", () => {
    expect(elig(him[0])).toBe("confirmed");
    expect(extractEligibility(him[0]).evidence[0]).toMatch(/Italy/);
  });
  it("keeps a US-only remote role out of Italy-confirmed results", () => {
    expect(elig(him[1])).toBe("excluded");
    expect(elig(rem[0])).toBe("excluded");
    const usBackend = wwr.items.find((i) => /Backend/.test(i.title))!;
    expect(elig(usBackend)).toBe("excluded"); // board says "Anywhere in the World", text says US-only
  });
  it("does not treat board 'worldwide' metadata, Europe or EMEA alone as confirmation", () => {
    expect(elig(him[2])).toBe("possible"); // empty locationRestrictions = worldwide per Himalayas, unconfirmed by text
    expect(elig(rem[1])).toBe("possible"); // "Europe"
    expect(elig({ countryRestrictions: null, locationText: "Remote — EMEA", remote: true, descriptionText: "", timezoneText: null })).toBe("possible");
    expect(elig({ countryRestrictions: null, locationText: "Remote", remote: true, descriptionText: "", timezoneText: null })).toBe("unknown");
  });
  it("confirms explicit worldwide wording in the listing itself, with evidence", () => {
    const nomad = wwr.items.find((i) => /Nomad/.test(i.company))!;
    const e = extractEligibility(nomad);
    expect(e.italy).toBe("confirmed");
    expect(e.evidence.join(" ")).toMatch(/anywhere in the world/i);
  });
  it("on-site US roles are excluded; on-site Rome roles are confirmed", () => {
    expect(elig(gh[0])).toBe("excluded");
    expect(elig({ countryRestrictions: null, locationText: "Rome, Italy", remote: false, descriptionText: "", timezoneText: null })).toBe("confirmed");
  });
  it("live regression: hedged worldwide wording with a US HQ is not a confirmation", () => {
    const desc = "Headquarters: Remote - US Modern Health is a platform. While many roles may function from anywhere in the world—see individual job listing for more—US based team members who live outside.";
    const e = extractEligibility({ countryRestrictions: null, locationText: "Anywhere in the World", remote: true, descriptionText: desc, timezoneText: null });
    expect(e.italy).toBe("possible");
    expect(e.evidence.join(" ")).toMatch(/hedged/);
  });
  it("live regression: funding amounts are never read as pay", () => {
    expect(compensationText(null, "backed by Kleiner Perkins and raised more than $170 million in less than two years")).toBeNull();
    expect(compensationText(null, "The base salary range for this role is $120,000 - $150,000 per year.")).toMatch(/\$120,000 - \$150,000 per year/);
  });
  it("live regression: a benefits line is not a location rule; the structured country list wins", () => {
    const e = extractEligibility({ countryRestrictions: ["United States"], locationText: "Remote — United States", remote: true, descriptionText: "Stock Purchase Plan (ESPP) with discounted stock for eligible employees (US only).", timezoneText: null });
    expect(e.italy).toBe("excluded");
    expect(e.evidence[0]).toMatch(/restrictions exclude Italy: United States/);
    const b = extractEligibility({ countryRestrictions: null, locationText: "Remote", remote: true, descriptionText: "Health insurance for US employees (US only). We hire anywhere in the world.", timezoneText: null });
    expect(b.italy).toBe("confirmed");
  });
  it("keeps unknowns unknown", () => {
    const e = extractEligibility({ countryRestrictions: null, locationText: null, remote: null, descriptionText: "Great team.", timezoneText: null });
    expect(e.italy).toBe("unknown");
    expect(e.sponsorship).toBeNull();
    expect(compensationText(null, "Great team.")).toBeNull();
  });
});

describe("requisition keys and dedupe", () => {
  it("extracts stable ATS ids", () => {
    expect(requisitionKey(atsRefFromUrl("https://colossal.com/careers/?gh_jid=7012345"))).toBe("greenhouse:7012345");
    expect(requisitionKey(atsRefFromUrl("https://job-boards.greenhouse.io/acmeeu/jobs/7012345"))).toBe("greenhouse:7012345");
    expect(requisitionKey(atsRefFromUrl("https://jobs.lever.co/acme/0f0e7c1a-1111-2222-3333-444455556666"))).toBe("lever:acme:0f0e7c1a-1111-2222-3333-444455556666");
    expect(normalizeUrl("https://x.com/job/1?utm_source=a#top")).toBe("https://x.com/job/1");
  });

  it("importing the same listing twice keeps one job and never overwrites user fields", () => {
    const now = "2026-11-22T12:00:00Z";
    const l = him[0];
    const first = planListing(l, buildIndex([], []));
    expect(first.kind).toBe("insert");
    const row = newJobRow(l, first as Extract<typeof first, { kind: "insert" }>, now);
    // simulate the saved job + attribution, with a user shortlist
    const saved = { id: "job-1", ...row, shortlisted: true, notes: "my note" };
    const idx = buildIndex([{ job_id: "job-1", source_slug: "himalayas", external_id: l.externalId }], [{ id: "job-1", requisition_key: saved.requisition_key, official_url: saved.official_url, url: saved.url }]);
    const second = planListing(l, idx);
    expect(second).toMatchObject({ kind: "refresh", jobId: "job-1", via: "same-source" });
    const patch = sourceFacts(l, now);
    for (const k of PROTECTED_JOB_FIELDS) expect(patch).not.toHaveProperty(k);
  });

  it("a cross-posting of the same requisition links to the existing job", () => {
    // Himalayas fixture applies via Greenhouse requisition 7012345; Colossal's board lists the same id
    const idx = buildIndex([], [{ id: "job-1", requisition_key: "greenhouse:7012345", official_url: null, url: null }]);
    expect(planListing(gh[0], idx)).toMatchObject({ kind: "refresh", jobId: "job-1", via: "requisition" });
  });

  it("never merges two distinct requisitions that share employer and title", () => {
    expect(gh[0].title).toBe(gh[1].title);
    const idx = buildIndex([{ job_id: "a", source_slug: "colossal", external_id: "7012345" }], [{ id: "a", requisition_key: "greenhouse:7012345", official_url: "https://colossal.com/careers/?gh_jid=7012345", url: null }]);
    expect(planListing(gh[1], idx).kind).toBe("insert");
  });
});

describe("normalizers keep original wording and explicit unknowns", () => {
  it("Himalayas: salary from structured fields, apply via applicationLink", () => {
    expect(him[0].salaryText).toMatch(/EUR 45000–60000/);
    expect(him[0].officialUrl).toBe("https://job-boards.greenhouse.io/acmeeu/jobs/7012345");
    expect(him[1].salaryText).toBeNull();
  });
  it("WWR: only engineering categories kept; Sales filtered", () => {
    expect(wwr.total).toBe(3);
    expect(wwr.filteredOut).toBe(1);
    expect(wwr.items.every((i) => i.officialUrl === null)).toBe(true);
  });
  it("Remotive: empty salary stays Unknown", () => {
    expect(rem[1].salaryText).toBeNull();
  });
  it("Greenhouse: HTML-escaped content is decoded, pay sentence kept verbatim", () => {
    expect(gh[0].descriptionText).toContain("Dallas TX");
    expect(compensationText(null, gh[0].descriptionText)).toMatch(/\$40\/hour/);
  });
  it("JSON-LD JobPosting is parsed from a page", () => {
    const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"JobPosting","title":"Graduate Software Engineer","hiringOrganization":{"name":"Brit Ltd"},"jobLocation":{"address":{"addressLocality":"London","addressCountry":"GB"}},"description":"&lt;p&gt;Visa sponsorship is available for this role.&lt;/p&gt;","datePosted":"2026-11-10","validThrough":"2026-11-28"}]}</script></html>`;
    const l = fromJobPosting(findJobPosting(html)!, "https://www.prospects.ac.uk/jobs/123", "prospects")!;
    expect(l.title).toBe("Graduate Software Engineer");
    expect(l.locationText).toBe("London, GB");
    expect(sponsorStance(l.descriptionText)).toBe("offered");
  });
});

describe("UK sponsorship", () => {
  it("reads the vacancy's own wording", () => {
    expect(sponsorStance("We are unable to offer visa sponsorship.")).toBe("not_offered");
    expect(sponsorStance("Skilled Worker visa sponsorship available.")).toBe("offered");
    expect(sponsorStance("Nothing about it")).toBe("unknown");
    // live regression (Colossal)
    expect(sponsorStance("US work authorization is required without the need for company assistance in securing a visa.")).toBe("not_offered");
  });
  it("only exact normalized names are auto-matched; looser matches need review", () => {
    const rows = [
      { name: "BRIT LIMITED", town: "London", county: "", rating: "Worker (A rating)", route: "Skilled Worker" },
      { name: "Brit Software Services Ltd", town: "Leeds", county: "", rating: "Worker (A rating)", route: "Skilled Worker" },
    ];
    expect(matchSponsor("Brit Ltd", rows).confidence).toBe("exact");
    expect(matchSponsor("Brit Software", rows).confidence).toBe("probable");
    expect(matchSponsor("Unrelated Co", rows).confidence).toBe("none");
    expect(parseCsvLine('"A, Ltd",London,"x ""y"""')).toEqual(["A, Ltd", "London", 'x "y"']);
  });
});

describe("commands", () => {
  it("parses the four example commands into explicit filters", () => {
    expect(parseCommand("Find paid junior Python or backend roles I can do from Rome.").filters).toMatchObject({ italy: "confirmed", paid: true, levels: ["junior"], keywords: ["python", "backend"] });
    expect(parseCommand("Show new internships from my five watchlist companies.").filters).toMatchObject({ watchlist: true, newWithinDays: 7, levels: ["intern"] });
    expect(parseCommand("Show UK graduate roles that explicitly offer sponsorship.").filters).toMatchObject({ uk: true, sponsorOffered: true, levels: ["graduate"] });
    const p = parseCommand("Prepare the three shortlisted roles with deadlines this week.");
    expect(p.intent).toBe("prepare");
    expect(p.filters).toMatchObject({ shortlisted: true, expiresWithinDays: 7, limit: 3 });
    expect(p.notice).toMatch(/not built yet/);
  });

  it("an Italy-confirmed search excludes the US-only remote role", () => {
    const now = "2026-11-22T12:00:00Z";
    const rows = [...him, ...rem, ...wwr.items].map((l, i) => {
      const f = sourceFacts(l, now);
      return { id: String(i), title: l.title, company: l.company, location: l.locationText, shortlisted: false, first_seen: now, ...f };
    });
    const hits = applyFilters(rows, parseCommand("Find python or backend roles I can do from Rome").filters, [], sponsorStance);
    expect(hits.map((h) => h.company)).toEqual(["Acme EU"]);
    expect(hits.some((h) => h.company === "US Only Corp")).toBe(false);
  });
});

describe("Remote OK", () => {
  const body = JSON.parse(fx("remoteok.json")) as unknown[];
  const jobs = body.slice(1) as Parameters<typeof fromRemoteOk>[0][];
  it("skips the legal notice, keeps attribution, and leaves unpublished salary Unknown", () => {
    const l = fromRemoteOk(jobs[0])!;
    expect(l.sourceSlug).toBe("remoteok");
    expect(l.discoveryUrl).toMatch(/^https:\/\/remoteok\.com\//);
    expect(l.salaryText).toBeNull();
    expect(fromRemoteOk(jobs[1])!.salaryText).toMatch(/USD 50000–70000/);
  });
  it("free-text location is never confirmation; US-only is excluded", () => {
    expect(elig(fromRemoteOk(jobs[0])!)).not.toBe("confirmed");
    expect(elig(fromRemoteOk(jobs[2])!)).toBe("excluded");
  });
  it("filters by saved interests", () => {
    expect(jobs.filter((j) => remoteOkMatches(j, ["python", "junior"])).length).toBe(2);
  });
  it("new sheet boards resolve by host", () => {
    expect(sourceForHost("www.wellfound.com")?.slug).toBe("wellfound");
    expect(sourceForHost("otta.com")?.slug).toBe("wttj");
    expect(sourceForHost("remoteok.com")?.slug).toBe("remoteok");
  });
});
