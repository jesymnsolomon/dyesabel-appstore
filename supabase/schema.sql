-- ============================================================
-- Splitsy database schema (Supabase / Postgres)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run. All tables are prefixed `splitsy_` so other
-- apps on the same Supabase project won't collide.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.splitsy_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Friend',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.splitsy_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mascot text not null default 'buddy',
  currency text not null default 'PHP',
  invite_code text not null unique,
  created_by uuid not null default auth.uid() references public.splitsy_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.splitsy_members (
  group_id uuid not null references public.splitsy_groups(id) on delete cascade,
  user_id uuid not null references public.splitsy_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.splitsy_expenses (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                       -- human friendly unique id, e.g. SPL-7F3K9Q
  group_id uuid not null references public.splitsy_groups(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','settlement')),
  title text not null,
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount > 0),
  paid_by uuid not null references public.splitsy_profiles(id),
  splits jsonb not null default '[]'::jsonb,      -- [{ "user_id": uuid, "amount": number }]
  split_mode text not null default 'equal',
  payment_method text not null default 'cash' check (payment_method in ('cash','card')),
  channel text not null default 'in_person' check (channel in ('online','in_person')),
  place_name text,
  place_address text,
  lat double precision,
  lng double precision,
  photos text[] not null default '{}',
  note text,
  created_by uuid not null default auth.uid() references public.splitsy_profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists splitsy_expenses_group_idx on public.splitsy_expenses (group_id, created_at desc);

-- ---------- Helpers ----------
create or replace function public.splitsy_is_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from splitsy_members where group_id = gid and user_id = auth.uid());
$$;

-- Auto-create a profile when someone signs up
create or replace function public.splitsy_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into splitsy_profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Friend'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists splitsy_on_auth_user_created on auth.users;
create trigger splitsy_on_auth_user_created
  after insert on auth.users for each row execute function public.splitsy_handle_new_user();

-- The group creator automatically becomes a member
create or replace function public.splitsy_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into splitsy_members (group_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  return new;
end $$;
drop trigger if exists splitsy_group_created on public.splitsy_groups;
create trigger splitsy_group_created
  after insert on public.splitsy_groups for each row execute function public.splitsy_add_creator();

-- Invite preview (works even before signing in, so the join page can say "You're invited to …")
create or replace function public.splitsy_invite_preview(code text)
returns table (id uuid, name text, mascot text, member_count bigint, is_member boolean)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.mascot,
         (select count(*) from splitsy_members m where m.group_id = g.id),
         exists (select 1 from splitsy_members m where m.group_id = g.id and m.user_id = auth.uid())
  from splitsy_groups g
  where g.invite_code = upper(code);
$$;
grant execute on function public.splitsy_invite_preview(text) to anon, authenticated;

-- Join a group with its invite code
create or replace function public.splitsy_join(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into gid from splitsy_groups where invite_code = upper(code);
  if gid is null then raise exception 'That invite link is not valid'; end if;
  insert into splitsy_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;
grant execute on function public.splitsy_join(text) to authenticated;

-- ---------- Row Level Security ----------
alter table public.splitsy_profiles enable row level security;
alter table public.splitsy_groups   enable row level security;
alter table public.splitsy_members  enable row level security;
alter table public.splitsy_expenses enable row level security;

drop policy if exists "profiles readable" on public.splitsy_profiles;
create policy "profiles readable" on public.splitsy_profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.splitsy_profiles;
create policy "profiles insert own" on public.splitsy_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.splitsy_profiles;
create policy "profiles update own" on public.splitsy_profiles for update to authenticated using (id = auth.uid());

drop policy if exists "groups read" on public.splitsy_groups;
create policy "groups read" on public.splitsy_groups for select to authenticated
  using (created_by = auth.uid() or public.splitsy_is_member(id));
drop policy if exists "groups insert" on public.splitsy_groups;
create policy "groups insert" on public.splitsy_groups for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "groups update" on public.splitsy_groups;
create policy "groups update" on public.splitsy_groups for update to authenticated using (public.splitsy_is_member(id));

drop policy if exists "members read" on public.splitsy_members;
create policy "members read" on public.splitsy_members for select to authenticated using (public.splitsy_is_member(group_id));
drop policy if exists "members leave" on public.splitsy_members;
create policy "members leave" on public.splitsy_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "expenses read" on public.splitsy_expenses;
create policy "expenses read" on public.splitsy_expenses for select to authenticated using (public.splitsy_is_member(group_id));
drop policy if exists "expenses insert" on public.splitsy_expenses;
create policy "expenses insert" on public.splitsy_expenses for insert to authenticated
  with check (public.splitsy_is_member(group_id) and created_by = auth.uid());
drop policy if exists "expenses update" on public.splitsy_expenses;
create policy "expenses update" on public.splitsy_expenses for update to authenticated using (public.splitsy_is_member(group_id));
drop policy if exists "expenses delete" on public.splitsy_expenses;
create policy "expenses delete" on public.splitsy_expenses for delete to authenticated using (public.splitsy_is_member(group_id));

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public) values ('splitsy', 'splitsy', true)
on conflict (id) do nothing;

drop policy if exists "splitsy photos read" on storage.objects;
create policy "splitsy photos read" on storage.objects for select using (bucket_id = 'splitsy');
drop policy if exists "splitsy photos upload" on storage.objects;
create policy "splitsy photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'splitsy' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "splitsy photos update" on storage.objects;
create policy "splitsy photos update" on storage.objects for update to authenticated
  using (bucket_id = 'splitsy' and owner = auth.uid());

-- ---------- Realtime (live updates when friends add expenses) ----------
do $$ begin
  alter publication supabase_realtime add table public.splitsy_expenses;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.splitsy_members;
exception when duplicate_object then null; end $$;
