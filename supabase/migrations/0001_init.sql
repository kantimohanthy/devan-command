-- DEVAN command center — initial schema
-- Every table is owned by one auth user. RLS is ON and every operation is
-- restricted to rows where owner = auth.uid(). The anon role gets nothing.

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type job_status as enum ('to_apply','in_progress','applied','interview','offer','rejected','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_mode as enum ('onsite','hybrid','remote');
exception when duplicate_object then null; end $$;

-- ---------- jobs ----------
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  company     text not null check (char_length(company) between 1 and 200),
  location    text check (char_length(location) <= 200),
  mode        work_mode not null default 'onsite',
  contract    text check (char_length(contract) <= 80),
  url         text check (url ~ '^https://'),
  posted      date,
  status      job_status not null default 'to_apply',
  fit         text check (fit in ('A','B','C')),
  cv_variant  text check (char_length(cv_variant) <= 80),
  notes       text check (char_length(notes) <= 5000),
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists jobs_owner_status_idx on public.jobs (owner, status);
create unique index if not exists jobs_owner_url_uniq on public.jobs (owner, url) where url is not null;

-- ---------- notes (DEVAN notepad) ----------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 20000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notes_owner_idx on public.notes (owner, created_at desc);

-- ---------- notifications ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('info','action','warning','success')),
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 2000),
  job_id     uuid references public.jobs(id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_owner_idx on public.notifications (owner, read_at, created_at desc);

-- ---------- answers bank (reused on every application form) ----------
create table if not exists public.answers (
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9_]{1,60}$'),
  value      text not null check (char_length(value) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.jobs          enable row level security;
alter table public.notes         enable row level security;
alter table public.notifications enable row level security;
alter table public.answers       enable row level security;

alter table public.jobs          force row level security;
alter table public.notes         force row level security;
alter table public.notifications force row level security;
alter table public.answers       force row level security;

-- one policy per operation, owner-only
do $$
declare t text;
begin
  foreach t in array array['jobs','notes','notifications','answers'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (owner = (select auth.uid()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (owner = (select auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (owner = (select auth.uid()))', t);
  end loop;
end $$;

-- anon gets nothing at all
revoke all on public.jobs, public.notes, public.notifications, public.answers from anon;
grant select, insert, update, delete on public.jobs, public.notes, public.notifications, public.answers to authenticated;
