import { describe, expect, it } from "vitest";
import { fitScore } from "@/lib/fit";
import { pickNextMove } from "@/lib/next-move";

const now = Date.parse("2026-11-22T12:00:00Z");

describe("fit score", () => {
  it("ranks an Italy-open junior network role above a US-only senior role", () => {
    const good = fitScore({ title: "Junior Network Engineer", location: "Rome", italy_status: "confirmed", description_excerpt: "Linux, routing, Python scripting" }, now);
    const bad = fitScore({ title: "Senior Python Developer", italy_status: "excluded", description_excerpt: "Remote within the US" }, now);
    expect(good.score).toBeGreaterThan(60);
    expect(bad.score).toBeLessThan(10);
    expect(good.reasons.map((r) => r.label)).toEqual(expect.arrayContaining(["Open from Italy", "Networks / infra", "Entry level"]));
  });
  it("is bounded 0..100 and explains every point", () => {
    const f = fitScore({ title: "Staff ML Engineer", italy_status: "excluded" }, now);
    expect(f.score).toBe(0);
    expect(f.reasons.length).toBeGreaterThan(0);
  });
  it("treats hand-added Rome jobs as open from Italy", () => {
    expect(fitScore({ title: "Front Office Agent", location: "Roma" }, now).reasons[0].label).toBe("Open from Italy");
  });
});

describe("next move", () => {
  const jobs = [
    { id: "a", title: "Junior Network Engineer", company: "Ali", status: "to_apply", fit: 72 },
    { id: "b", title: "Backend Intern", company: "Acme", status: "to_apply", shortlisted: true, fit: 55 },
  ];
  it("puts a deadline closing tomorrow first", () => {
    const m = pickNextMove(jobs, [{ id: "o", name: "GovAI Fellowship", status: "To review", deadline_date: "2026-11-23", url: "https://x.org", category: "AI safety" }], now);
    expect(m.kind).toBe("deadline");
    expect(m.reason).toMatch(/tomorrow/);
  });
  it("treats imported status words as open, and today beats a shortlist", () => {
    const m = pickNextMove(jobs, [{ id: "o", name: "GovAI", status: "Open", deadline_date: "2026-11-22", url: null, category: "AI safety" }], now);
    expect(m.kind).toBe("deadline");
    expect(m.reason).toMatch(/closes today/);
  });
  it("ignores applied programmes, then prefers the shortlist over raw fit", () => {
    const m = pickNextMove(jobs, [{ id: "o", name: "GovAI", status: "Applied", deadline_date: "2026-11-23", url: null, category: "AI safety" }], now);
    expect(m).toMatchObject({ kind: "apply", jobId: "b" });
  });
  it("falls back to the best match, then to syncing", () => {
    expect(pickNextMove([jobs[0]], [], now)).toMatchObject({ kind: "review", jobId: "a" });
    expect(pickNextMove([], [], now).kind).toBe("clear");
  });
});
