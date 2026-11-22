# DEVAN — command center (kantimohanthy.com)

Private, single-user career assistant. Next.js 15 on Vercel + Supabase (Postgres + Auth).

## Phase 1 (this commit)
- Owner-only login (Supabase Auth, email allowlist via `DEVAN_OWNER_EMAIL`)
- Jobs tracker with statuses, swipe deck (right = open & mark in progress, left = skip)
- Notepad, in-site notifications, one-click import of the 42 jobs tracked on 21–22 Nov 2026
- DEVAN look: living orb, Major Mono wordmark, black / white / soft blue / maroon / volt yellow

## Setup (one time)
1. **Supabase** → SQL Editor → paste and run `supabase/migrations/0001_init.sql`.
2. **Supabase** → Authentication → Users → *Add user* with your email and a strong password (auto-confirm).
3. **Supabase** → Authentication → Providers/Sign In → **turn off "Allow new users to sign up"**.
4. **Vercel** → Import this repo → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API)
   - `DEVAN_OWNER_EMAIL` (your login email)
   - `ANTHROPIC_API_KEY` (server-only, used from Phase 4)
5. Deploy, open the site, sign in, press **Import my jobs**.
6. **Domain**: Vercel → Settings → Domains → add `kantimohanthy.com`, then set the DNS records Vercel shows in Cloudflare (DNS only / grey cloud).

## Security checklist
| Check | Status |
|---|---|
| No secrets in client code; only the public Supabase URL/anon key use `NEXT_PUBLIC_` | Verified in code |
| App never uses the Supabase service-role key | Verified in code |
| RLS enabled + forced on all tables, per-operation owner policies, anon revoked | In migration; verify in Supabase after running it |
| Every page/action re-checks the session server-side (`requireOwner`), not just middleware | Verified in code |
| Writes filter by `owner` as well as RLS (IDOR defence in depth) | Verified in code |
| Inputs validated with zod; links limited to `https://` | Verified in code |
| Sign-ups disabled in Supabase | **Manual step 3** |
| Two-account test (second user sees nothing / gets 404) | **Manual, after deploy** |
| Login rate limiting | Supabase Auth built-in limits; review in dashboard |

## Roadmap
2. Tailored CV + cover-letter generator on swipe-right
3. Scheduled job search (Crustdata/Apify) + Gmail status tracking + morning/midnight digests
4. DEVAN voice/chat assistant (Anthropic API, server-side)
5. Form-filler for company application sites

## Discovery sources (Phase 2a)

Registry: `src/lib/discovery/registry.ts` (versioned allowlist). Runtime state: `sources`, `source_runs`, `job_sources` (migration `0003_sources.sql`, additive, RLS forced).

| Source | Method | Status (22 Nov 2026) |
|---|---|---|
| Himalayas | Documented JSON API (search, page 1 per saved query) | Live-tested |
| We Work Remotely | Public RSS, engineering categories only | Live-tested |
| Remotive | Documented public API (software-dev), ≥6 h between syncs | Live-tested |
| Remote OK | Public JSON API, filtered to saved interests, ≥6 h between syncs | Fixture-tested; live sync from the deployment pending |
| HiringCafe | MCP `https://hiringcafe.com/api/mcp`, on-demand search only | Probe + search live-tested (no auth; tools `search_jobs`, `get_job_details`) |
| Neuralink, Unconventional AI, Figure, Colossal | Greenhouse Job Board API (one adapter) | Live-tested |
| Boom Supersonic | Moved to Rippling Recruiting; link import only (feed undocumented) | Link import live-tested |
| WTTJ, YC Jobs, Accel, Work in Startups, Flexa, Higherin, GRB, Milkround, Prospects, VisaJobs.uk, plus the remote-jobs sheet boards (LinkedIn, Wellfound, FlexJobs, NoDesk, Remote.co, Indeed, Toptal, Upwork, Remote Rocketship, Working Nomads, HN Who is Hiring, Jobgether, Startup.jobs, Underdog.io, 4 Day Week) | Link import (ATS API or schema.org JobPosting) | Fixture-tested parser; no automated access verified |
| UK sponsor register | GOV.UK Content API → register CSV, exact-name match or review | Live-tested |

Rules enforced in code: refreshes never touch status, shortlist, notes, fit, CV or history; matching is by source id → ATS requisition id → official URL, never company + title; partial or failed syncs never close jobs; "Confirmed open from Italy" needs explicit evidence.

Tests: `npm test` (vitest, fixtures in `tests/fixtures`).
