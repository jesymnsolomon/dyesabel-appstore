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
-- Receipt line items (added with the receipt scanner): [{ "name": text, "qty": int, "price": number }]
alter table public.splitsy_expenses add column if not exists items jsonb not null default '[]'::jsonb;

-- Foreign-currency expenses (added with currency conversion): amount is stored in the
-- group's currency; these keep what was actually paid and the rate used.
alter table public.splitsy_expenses add column if not exists original_currency text;
alter table public.splitsy_expenses add column if not exists original_amount numeric(14,2);
alter table public.splitsy_expenses add column if not exists fx_rate numeric(18,8);

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
-- (dropped first so re-running this file never trips over an older version)
drop function if exists public.splitsy_invite_preview(text);
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
drop function if exists public.splitsy_join(text, uuid);
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

-- ============================================================
-- Superadmin dashboard
-- Make yourself the first superadmin (replace the email), run once:
--   insert into public.splitsy_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
-- After that you can add/remove other admins from the dashboard.
-- ============================================================
create table if not exists public.splitsy_admins (
  user_id uuid primary key references public.splitsy_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.splitsy_admins enable row level security;

create or replace function public.splitsy_is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from splitsy_admins where user_id = auth.uid());
$$;
grant execute on function public.splitsy_is_admin() to authenticated;

drop policy if exists "admins read" on public.splitsy_admins;
create policy "admins read" on public.splitsy_admins for select to authenticated
  using (public.splitsy_is_admin() or user_id = auth.uid());

-- Superadmins can see (and remove) everything
drop policy if exists "admin read groups" on public.splitsy_groups;
create policy "admin read groups" on public.splitsy_groups for select to authenticated using (public.splitsy_is_admin());
drop policy if exists "admin delete groups" on public.splitsy_groups;
create policy "admin delete groups" on public.splitsy_groups for delete to authenticated using (public.splitsy_is_admin());
drop policy if exists "admin read members" on public.splitsy_members;
create policy "admin read members" on public.splitsy_members for select to authenticated using (public.splitsy_is_admin());
drop policy if exists "admin read expenses" on public.splitsy_expenses;
create policy "admin read expenses" on public.splitsy_expenses for select to authenticated using (public.splitsy_is_admin());
drop policy if exists "admin delete expenses" on public.splitsy_expenses;
create policy "admin delete expenses" on public.splitsy_expenses for delete to authenticated using (public.splitsy_is_admin());

-- Users with their email + last sign-in (emails live in auth.users, so this is admin-only)
create or replace function public.splitsy_admin_users()
returns table (id uuid, name text, avatar_url text, email text, created_at timestamptz, last_sign_in_at timestamptz, is_admin boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not splitsy_is_admin() then raise exception 'Superadmins only'; end if;
  return query
    select p.id, p.name, p.avatar_url, u.email::text, p.created_at, u.last_sign_in_at,
           exists (select 1 from splitsy_admins a where a.user_id = p.id)
    from splitsy_profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;
grant execute on function public.splitsy_admin_users() to authenticated;

-- Add or remove a superadmin
create or replace function public.splitsy_admin_set(target uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not splitsy_is_admin() then raise exception 'Superadmins only'; end if;
  if not make_admin and target = auth.uid() then raise exception 'You can’t remove your own superadmin access'; end if;
  if make_admin then
    insert into splitsy_admins (user_id) values (target) on conflict do nothing;
  else
    delete from splitsy_admins where user_id = target;
  end if;
end $$;
grant execute on function public.splitsy_admin_set(uuid, boolean) to authenticated;

-- ============================================================
-- Notifications
-- When someone adds a transaction (or settles up), everyone else in the
-- group gets a notification. Created by the database itself, so it works
-- no matter which phone added the bill.
-- ============================================================
create table if not exists public.splitsy_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.splitsy_profiles(id) on delete cascade,   -- who receives it
  actor_id uuid references public.splitsy_profiles(id) on delete set null,          -- who did it
  group_id uuid references public.splitsy_groups(id) on delete cascade,
  expense_id uuid references public.splitsy_expenses(id) on delete cascade,
  kind text not null default 'expense',          -- 'expense' | 'settlement'
  title text not null,
  body text not null,
  share numeric(14,2),                           -- the receiver's share of the bill
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists splitsy_notifications_user_idx on public.splitsy_notifications (user_id, created_at desc);
alter table public.splitsy_notifications enable row level security;

drop policy if exists "notifications read own" on public.splitsy_notifications;
create policy "notifications read own" on public.splitsy_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications update own" on public.splitsy_notifications;
create policy "notifications update own" on public.splitsy_notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists "notifications delete own" on public.splitsy_notifications;
create policy "notifications delete own" on public.splitsy_notifications for delete to authenticated using (user_id = auth.uid());

create or replace function public.splitsy_notify_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text;
  grp text;
  cur text;
  m record;
  my_share numeric;
  amt text;
begin
  select name into actor from splitsy_profiles where id = new.created_by;
  select name, currency into grp, cur from splitsy_groups where id = new.group_id;
  amt := cur || ' ' || to_char(new.amount, 'FM999,999,990.00');
  for m in select user_id from splitsy_members where group_id = new.group_id and user_id <> new.created_by loop
    select coalesce(sum((s->>'amount')::numeric), 0) into my_share
      from jsonb_array_elements(new.splits) s where s->>'user_id' = m.user_id::text;
    insert into splitsy_notifications (user_id, actor_id, group_id, expense_id, kind, title, body, share)
    values (
      m.user_id, new.created_by, new.group_id, new.id, new.kind,
      case when new.kind = 'settlement' then coalesce(actor, 'Someone') || ' settled up in ' || grp
           else coalesce(actor, 'Someone') || ' added ' || new.title end,
      case when new.kind = 'settlement' then new.title || ' · ' || amt
           else amt || ' in ' || grp end,
      nullif(my_share, 0)
    );
  end loop;
  return new;
end $$;
drop trigger if exists splitsy_expense_notify on public.splitsy_expenses;
create trigger splitsy_expense_notify
  after insert on public.splitsy_expenses for each row execute function public.splitsy_notify_expense();

do $$ begin
  alter publication supabase_realtime add table public.splitsy_notifications;
exception when duplicate_object then null; end $$;

-- Phone push notifications (Web Push). One row per phone/browser that turned them on.
create table if not exists public.splitsy_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.splitsy_profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.splitsy_push_subscriptions enable row level security;
drop policy if exists "push subs own" on public.splitsy_push_subscriptions;
create policy "push subs own" on public.splitsy_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Deleting a group: only the person who created it can delete it.
-- Members, bills and notifications are removed with it (on delete cascade).
-- ============================================================
drop policy if exists "groups delete own" on public.splitsy_groups;
create policy "groups delete own" on public.splitsy_groups for delete to authenticated using (created_by = auth.uid());

-- ============================================================
-- Placeholder members ("mock users")
-- The host can add people who aren't on Splitsy yet. When that person
-- joins with the invite link they can pick their placeholder, and all of
-- its bills, shares and receipt items move to their real account.
-- ============================================================
alter table public.splitsy_profiles add column if not exists is_placeholder boolean not null default false;
alter table public.splitsy_profiles add column if not exists created_by uuid;
-- placeholders aren't real sign-ins, so profiles no longer have to match an auth user
alter table public.splitsy_profiles drop constraint if exists splitsy_profiles_id_fkey;

create or replace function public.splitsy_add_placeholder(gid uuid, pname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid := gen_random_uuid();
begin
  if not exists (select 1 from splitsy_groups where id = gid and created_by = auth.uid()) then
    raise exception 'Only the group host can add people';
  end if;
  if coalesce(trim(pname), '') = '' then raise exception 'Please enter a name'; end if;
  insert into splitsy_profiles (id, name, is_placeholder, created_by) values (pid, left(trim(pname), 40), true, auth.uid());
  insert into splitsy_members (group_id, user_id) values (gid, pid);
  return pid;
end $$;
grant execute on function public.splitsy_add_placeholder(uuid, text) to authenticated;

create or replace function public.splitsy_remove_placeholder(gid uuid, pid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from splitsy_groups where id = gid and created_by = auth.uid()) then
    raise exception 'Only the group host can remove people';
  end if;
  if not exists (
    select 1 from splitsy_profiles p join splitsy_members m on m.user_id = p.id
    where p.id = pid and p.is_placeholder and m.group_id = gid
  ) then raise exception 'That person already joined'; end if;
  if exists (
    select 1 from splitsy_expenses where group_id = gid
      and (paid_by = pid or splits::text like '%' || pid::text || '%' or items::text like '%' || pid::text || '%')
  ) then
    raise exception 'They’re part of some bills. Remove them from those bills first.';
  end if;
  delete from splitsy_profiles where id = pid;
end $$;
grant execute on function public.splitsy_remove_placeholder(uuid, uuid) to authenticated;

-- Invite preview now also lists the placeholders someone can join as
drop function if exists public.splitsy_invite_preview(text);
create or replace function public.splitsy_invite_preview(code text)
returns table (id uuid, name text, mascot text, member_count bigint, is_member boolean, placeholders jsonb)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.mascot,
         (select count(*) from splitsy_members m where m.group_id = g.id),
         exists (select 1 from splitsy_members m where m.group_id = g.id and m.user_id = auth.uid()),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
           from splitsy_members m join splitsy_profiles p on p.id = m.user_id
           where m.group_id = g.id and p.is_placeholder
         ), '[]'::jsonb)
  from splitsy_groups g
  where g.invite_code = upper(code);
$$;
grant execute on function public.splitsy_invite_preview(text) to anon, authenticated;

-- Moves every bill, share and receipt item from a placeholder (src) to a real
-- member (dst) in one group, then removes the placeholder. If dst already had a
-- share in the same bill, the two shares are added together (never duplicated).
-- Internal helper: only called by the functions below, not by the app directly.
create or replace function public.splitsy_merge_profile(gid uuid, src uuid, dst uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s text := src::text; d text := dst::text;
begin
  perform set_config('splitsy.merging', '1', true); -- no "your share changed" notifications for a merge
  update splitsy_expenses set paid_by = dst where group_id = gid and paid_by = src;

  update splitsy_expenses e set splits = (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', q.uid, 'amount', q.amt) order by q.ord), '[]'::jsonb)
    from (
      select case when x.v->>'user_id' = s then d else x.v->>'user_id' end as uid,
             sum((x.v->>'amount')::numeric) as amt, min(x.o) as ord
      from jsonb_array_elements(e.splits) with ordinality as x(v, o)
      group by 1
    ) q
  )
  where e.group_id = gid and jsonb_typeof(e.splits) = 'array'
    and e.splits @> jsonb_build_array(jsonb_build_object('user_id', s));

  update splitsy_expenses e set items = (
    select coalesce(jsonb_agg(
      case when jsonb_typeof(y.it->'people') = 'array' and (y.it->'people') ? s then
        jsonb_set(y.it, '{people}', (
          select coalesce(jsonb_agg(z.pid order by z.ord), '[]'::jsonb)
          from (
            select case when p.v = s then d else p.v end as pid, min(p.o) as ord
            from jsonb_array_elements_text(y.it->'people') with ordinality as p(v, o)
            group by 1
          ) z
        ))
      else y.it end
      order by y.io), '[]'::jsonb)
    from jsonb_array_elements(e.items) with ordinality as y(it, io)
  )
  where e.group_id = gid and jsonb_typeof(e.items) = 'array' and e.items::text like '%' || s || '%';

  delete from splitsy_profiles where id = src; -- removes the placeholder's membership too
end $$;
revoke all on function public.splitsy_merge_profile(uuid, uuid, uuid) from public, anon, authenticated;

-- Join, optionally taking over a placeholder's records
drop function if exists public.splitsy_join(text);
create or replace function public.splitsy_join(code text, claim uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select id into gid from splitsy_groups where invite_code = upper(code);
  if gid is null then raise exception 'That invite link is not valid'; end if;

  if claim is not null then
    -- lock the placeholder so two people can't claim it at the same moment
    perform 1 from splitsy_profiles where id = claim for update;
    if not exists (
      select 1 from splitsy_profiles p join splitsy_members m on m.user_id = p.id
      where p.id = claim and p.is_placeholder and m.group_id = gid
    ) then
      raise exception 'Someone already joined as that person';
    end if;
  end if;

  insert into splitsy_members (group_id, user_id) values (gid, me) on conflict do nothing;
  if claim is not null then perform splitsy_merge_profile(gid, claim, me); end if;
  return gid;
end $$;
grant execute on function public.splitsy_join(text, uuid) to authenticated;

-- Host only: someone joined without picking their placeholder ("I'm new here").
-- Merge the placeholder into their real account afterwards.
create or replace function public.splitsy_merge_placeholder(gid uuid, pid uuid, target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from splitsy_groups where id = gid and created_by = auth.uid()) then
    raise exception 'Only the group host can do this';
  end if;
  perform 1 from splitsy_profiles where id = pid for update;
  if not exists (
    select 1 from splitsy_profiles p join splitsy_members m on m.user_id = p.id
    where p.id = pid and p.is_placeholder and m.group_id = gid
  ) then raise exception 'That person already joined'; end if;
  if not exists (
    select 1 from splitsy_profiles p join splitsy_members m on m.user_id = p.id
    where p.id = target and not p.is_placeholder and m.group_id = gid
  ) then raise exception 'Pick someone who has joined this group'; end if;
  perform splitsy_merge_profile(gid, pid, target);
end $$;
grant execute on function public.splitsy_merge_placeholder(uuid, uuid, uuid) to authenticated;

-- Nobody can turn their own account into a placeholder (or fake who created one)
-- from the app. Only the functions above set these columns.
create or replace function public.splitsy_protect_profile()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_placeholder := false;
      new.created_by := null;
    else
      new.is_placeholder := old.is_placeholder;
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists splitsy_profile_protect on public.splitsy_profiles;
create trigger splitsy_profile_protect before insert or update on public.splitsy_profiles
  for each row execute function public.splitsy_protect_profile();

-- Profiles no longer cascade from auth.users (placeholders have no sign-in), so
-- when an account is deleted, remove its profile too, unless it still appears in
-- bills (then the name stays so the group's history still makes sense).
create or replace function public.splitsy_handle_deleted_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    delete from splitsy_profiles where id = old.id;
  exception when foreign_key_violation then
    delete from splitsy_push_subscriptions where user_id = old.id;
  end;
  return old;
end $$;
drop trigger if exists splitsy_on_auth_user_deleted on auth.users;
create trigger splitsy_on_auth_user_deleted
  after delete on auth.users for each row execute function public.splitsy_handle_deleted_user();

-- Deleting a group also removes its placeholders
create or replace function public.splitsy_cleanup_placeholders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from splitsy_expenses where group_id = old.id; -- bills first, so placeholders can be removed
  delete from splitsy_profiles p using splitsy_members m
  where m.group_id = old.id and m.user_id = p.id and p.is_placeholder;
  return old;
end $$;
drop trigger if exists splitsy_group_cleanup on public.splitsy_groups;
create trigger splitsy_group_cleanup before delete on public.splitsy_groups for each row execute function public.splitsy_cleanup_placeholders();

-- Notifications skip placeholders (they can't sign in)
create or replace function public.splitsy_notify_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text;
  grp text;
  cur text;
  m record;
  my_share numeric;
  amt text;
begin
  select name into actor from splitsy_profiles where id = new.created_by;
  select name, currency into grp, cur from splitsy_groups where id = new.group_id;
  amt := cur || ' ' || to_char(new.amount, 'FM999,999,990.00');
  for m in
    select sm.user_id from splitsy_members sm join splitsy_profiles p on p.id = sm.user_id
    where sm.group_id = new.group_id and sm.user_id <> new.created_by and not p.is_placeholder
  loop
    select coalesce(sum((s->>'amount')::numeric), 0) into my_share
      from jsonb_array_elements(new.splits) s where s->>'user_id' = m.user_id::text;
    insert into splitsy_notifications (user_id, actor_id, group_id, expense_id, kind, title, body, share)
    values (
      m.user_id, new.created_by, new.group_id, new.id, new.kind,
      case when new.kind = 'settlement' then coalesce(actor, 'Someone') || ' settled up in ' || grp
           else coalesce(actor, 'Someone') || ' added ' || new.title end,
      case when new.kind = 'settlement' then new.title || ' · ' || amt
           else amt || ' in ' || grp end,
      nullif(my_share, 0)
    );
  end loop;
  return new;
end $$;

-- ============================================================
-- Notifications when a bill is edited
-- Only people whose share changed (added, removed or a different amount),
-- plus the old and new payer if who paid changed. One unread note per
-- person per bill: a newer edit replaces the older unread one.
-- ============================================================
create or replace function public.splitsy_notify_expense_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := coalesce(auth.uid(), new.created_by);
  actor text;
  grp text;
  cur text;
  payer text;
  m record;
  was numeric;
  now_share numeric;
  ttl text;
  bdy text;
  money text;
begin
  if coalesce(current_setting('splitsy.merging', true), '') = '1' then return new; end if;
  select name into actor from splitsy_profiles where id = actor_id;
  actor := coalesce(actor, 'Someone');
  select name, currency into grp, cur from splitsy_groups where id = new.group_id;
  select name into payer from splitsy_profiles where id = new.paid_by;
  money := cur || ' ' || to_char(new.amount, 'FM999,999,990.00');

  for m in
    select sm.user_id from splitsy_members sm join splitsy_profiles p on p.id = sm.user_id
    where sm.group_id = new.group_id and sm.user_id <> actor_id and not p.is_placeholder
  loop
    select coalesce(sum((x->>'amount')::numeric), 0) into was
      from jsonb_array_elements(case when jsonb_typeof(old.splits) = 'array' then old.splits else '[]'::jsonb end) x
      where x->>'user_id' = m.user_id::text;
    select coalesce(sum((x->>'amount')::numeric), 0) into now_share
      from jsonb_array_elements(case when jsonb_typeof(new.splits) = 'array' then new.splits else '[]'::jsonb end) x
      where x->>'user_id' = m.user_id::text;

    ttl := null;
    bdy := money || ' in ' || grp;
    if was = 0 and now_share <> 0 then
      ttl := actor || ' added you to ' || new.title;
    elsif was <> 0 and now_share = 0 then
      ttl := actor || ' removed you from ' || new.title;
      bdy := money || ' in ' || grp || ' · you no longer owe anything for it';
    elsif round(was, 2) <> round(now_share, 2) then
      ttl := actor || ' changed your share in ' || new.title;
      bdy := cur || ' ' || to_char(was, 'FM999,999,990.00') || ' → ' || cur || ' ' || to_char(now_share, 'FM999,999,990.00') || ' in ' || grp;
    end if;

    if old.paid_by is distinct from new.paid_by then
      if m.user_id = new.paid_by then
        ttl := coalesce(ttl, actor || ' set you as the payer of ' || new.title);
        if ttl not like '%payer%' then bdy := bdy || ' · you’re now the payer'; end if;
      elsif m.user_id = old.paid_by then
        ttl := coalesce(ttl, actor || ' changed who paid ' || new.title);
        bdy := bdy || ' · now paid by ' || coalesce(payer, 'someone else');
      end if;
    end if;

    if ttl is not null then
      delete from splitsy_notifications
        where user_id = m.user_id and expense_id = new.id and kind = 'edit' and read_at is null;
      insert into splitsy_notifications (user_id, actor_id, group_id, expense_id, kind, title, body, share)
      values (m.user_id, actor_id, new.group_id, new.id, 'edit', ttl, bdy, nullif(now_share, 0));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists splitsy_expense_edit_notify on public.splitsy_expenses;
create trigger splitsy_expense_edit_notify
  after update of splits, paid_by on public.splitsy_expenses
  for each row
  when (old.splits is distinct from new.splits or old.paid_by is distinct from new.paid_by)
  execute function public.splitsy_notify_expense_edit();

-- Tell the API about the new columns/functions right away
notify pgrst, 'reload schema';
