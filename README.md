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
