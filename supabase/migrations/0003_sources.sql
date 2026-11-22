-- DEVAN discovery: sources, sync runs, per-source attributions, eligibility, shortlist,
-- UK sponsor checks and job history. Additive and safe to re-run.

-- ---------- jobs: discovery fields (existing rows untouched) ----------
alter table public.jobs add column if not exists requisition_key   text check (char_length(requisition_key) <= 300);
alter table public.jobs add column if not exists official_url      text check (official_url ~ '^https://');
alter table public.jobs add column if not exists shortlisted       boolean not null default false;
alter table public.jobs add column if not exists shortlisted_at    timestamptz;
alter table public.jobs add column if not exists eligibility       jsonb;
alter table public.jobs add column if not exists italy_status      text check (italy_status in ('confirmed','possible','excluded','unknown'));
alter table public.jobs add column if not exists compensation      text check (char_length(compensation) <= 300);
alter table public.jobs add column if not exists sponsorship       text check (char_length(sponsorship) <= 600);
alter table public.jobs add column if not exists experience_level  text check (char_length(experience_level) <= 60);
alter table public.jobs add column if not exists employment_type   text check (char_length(employment_type) <= 60);
alter table public.jobs add column if not exists description_excerpt text check (char_length(description_excerpt) <= 1500);
alter table public.jobs add column if not exists listing_expires_at timestamptz;
alter table public.jobs add column if not exists first_seen        timestamptz;
alter table public.jobs add column if not exists last_checked      timestamptz;
alter table public.jobs add column if not exists source_status     text check (source_status in ('open','not_in_latest_full_sync','closed'));
create unique index if not exists jobs_owner_reqkey_uniq on public.jobs (owner, requisition_key) where requisition_key is not null;
create index if not exists jobs_owner_italy_idx on public.jobs (owner, italy_status);

-- ---------- sources: runtime state for the versioned registry in code ----------
create table if not exists public.sources (
  owner            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9_-]{1,60}$'),
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_error       text check (char_length(last_error) <= 2000),
  probe            jsonb,
  careers_checked_on date,
  primary key (owner, slug)
);

create table if not exists public.source_runs (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_slug  text not null check (char_length(source_slug) <= 60),
  trigger      text not null default 'manual' check (trigger in ('manual','scheduled','url')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  complete     boolean not null default false,
  fetched      integer not null default 0,
  filtered_out integer not null default 0,
  new_unique   integer not null default 0,
  duplicates   integer not null default 0,
  errors       integer not null default 0,
  message      text check (char_length(message) <= 2000)
);
create index if not exists source_runs_owner_idx on public.source_runs (owner, source_slug, started_at desc);

-- one row per (source, external listing): keeps every attribution across refreshes
create table if not exists public.job_sources (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  source_slug    text not null check (char_length(source_slug) <= 60),
  external_id    text not null check (char_length(external_id) <= 300),
  discovery_url  text check (discovery_url ~ '^https://'),
  official_url   text check (official_url ~ '^https://'),
  original       jsonb,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);
create unique index if not exists job_sources_uniq on public.job_sources (owner, source_slug, external_id);
create index if not exists job_sources_job_idx on public.job_sources (owner, job_id);

-- UK Register of Licensed Sponsors lookups
create table if not exists public.uk_sponsor_checks (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  query_name     text not null check (char_length(query_name) <= 300),
  matched_name   text check (char_length(matched_name) <= 300),
  town           text check (char_length(town) <= 200),
  rating         text check (char_length(rating) <= 200),
  route          text check (char_length(route) <= 200),
  register_file  text check (char_length(register_file) <= 300),
  confidence     text not null check (confidence in ('exact','probable','none')),
  needs_review   boolean not null default false,
  candidates     jsonb,
  checked_at     timestamptz not null default now()
);
create index if not exists uk_sponsor_job_idx on public.uk_sponsor_checks (owner, job_id, checked_at desc);

-- history of status/shortlist changes and manual corrections
create table if not exists public.job_events (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  kind       text not null check (char_length(kind) <= 60),
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on public.job_events (owner, job_id, created_at desc);

-- ---------- RLS: owner-only, per operation ----------
do $$
declare t text;
begin
  foreach t in array array['sources','source_runs','job_sources','uk_sponsor_checks','job_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner = (select auth.uid()))', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
