# DEVAN (kantimohanthy.com) — notes for Claude

## Jarvis toolkit
Before media, transcription, voice, SEO or notes work on any of Ujwal's projects (DEVAN, CosmoHub/ORVYRA,
kantimohanthy.dev, kantimohanthy.com), read `docs/JARVIS_TOOLKIT.md`. It lists the toolkit repos, what each is
for, the verified status of OpenWhisper, VoiceStudio, Open Higgsfield, OpenSEO and AppFlowy, and the standing
rules: pick the tool by outcome, re-verify availability in the current session, fall back and say what is
unverified, and ask before sending, publishing, spending credits, uploading private media or deleting anything.

## This repo
- Next.js 15 App Router + TypeScript + Tailwind v4, Supabase (Auth + Postgres with RLS), deployed on Vercel from `main`.
  This repo powers kantimohanthy.com; kantimohanthy.dev is a separate portfolio.
- Migrations in `supabase/migrations/` are additive and safe to re-run; apply them in the Supabase SQL editor.
- Discovery sources: `src/lib/discovery/` (registry, adapters, eligibility, dedupe). See README "Discovery sources".
- Tests: `npm test` (vitest fixtures). Build check:
  `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x DEVAN_OWNER_EMAIL=owner@example.com npx next build`
- Security rules for every change: no secrets in client code or `NEXT_PUBLIC_*`; RLS forced with owner-only
  per-operation policies; server-side ownership checks on every read/write.
