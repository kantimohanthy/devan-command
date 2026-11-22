-- Masters, fellowships, scholarships, programmes (imported from the old kantimohanthy.com vault)
create table if not exists public.opportunities (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 300),
  type          text check (char_length(type) <= 120),
  category      text check (char_length(category) <= 120),
  eligibility   text check (char_length(eligibility) <= 4000),
  requirements  text check (char_length(requirements) <= 4000),
  deadline      text check (char_length(deadline) <= 200),
  deadline_date date,
  funding       text check (char_length(funding) <= 2000),
  status        text not null default 'To review' check (char_length(status) <= 60),
  url           text check (url ~ '^https://'),
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists opportunities_owner_deadline_idx on public.opportunities (owner, deadline_date);
create unique index if not exists opportunities_owner_name_uniq on public.opportunities (owner, name);

drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch before update on public.opportunities
  for each row execute function public.touch_updated_at();

alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;

drop policy if exists opportunities_select on public.opportunities;
drop policy if exists opportunities_insert on public.opportunities;
drop policy if exists opportunities_update on public.opportunities;
drop policy if exists opportunities_delete on public.opportunities;
create policy opportunities_select on public.opportunities for select to authenticated using (owner = (select auth.uid()));
create policy opportunities_insert on public.opportunities for insert to authenticated with check (owner = (select auth.uid()));
create policy opportunities_update on public.opportunities for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy opportunities_delete on public.opportunities for delete to authenticated using (owner = (select auth.uid()));

revoke all on public.opportunities from anon;
grant select, insert, update, delete on public.opportunities to authenticated;

-- extra job fields carried over from the old tracker
alter table public.jobs add column if not exists next_action text check (char_length(next_action) <= 500);
alter table public.jobs add column if not exists salary_min integer;
alter table public.jobs add column if not exists salary_max integer;
