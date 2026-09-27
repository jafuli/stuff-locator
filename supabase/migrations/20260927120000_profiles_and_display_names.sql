-- profiles — a readable display name per user
--
-- items.added_by and items.last_moved_by are uuid references into
-- auth.users, and item detail was rendering them straight through: a real
-- user saw "Added by 7b1d8b20-b71e-4cfe-b429-176c7cb25f38". There was no
-- way to do better from the app. auth.users isn't exposed through
-- PostgREST, and this app deliberately holds no service-role key (see
-- src/server/db/server.ts), so nothing client- or server-side could read
-- a name out of it.
--
-- So: one row per user in a table the app *can* read, under RLS that only
-- lets you see people you actually share a household with. The Activity
-- feed ("Maayan moved spare keys") needs exactly the same lookup when it
-- comes off its fixtures, which is why this is a table rather than the
-- "You"/"Your partner" shortcut a two-person household would allow.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Non-empty by construction: the trigger below falls back rather than
  -- ever writing '', and this is what the UI renders directly.
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seeding
--
-- Sign-up collects an email and a password, nothing else, so the email's
-- local-part is the only human-readable thing available. Same rule
-- deriveHouseholdName already applies in src/server/services/household.ts
-- ("jane@example.com" -> "jane"), kept deliberately identical so a
-- household and its founding member don't disagree about what to call
-- them. Deriving something prettier (splitting "jane.doe" into "Jane Doe")
-- would be guessing at a real name, so it isn't done here; the column
-- exists so a person can set their own later.

create function public.profile_display_name_for(p_email text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(split_part(coalesce(p_email, ''), '@', 1)), ''), 'Someone');
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, public.profile_display_name_for(new.email))
  -- Defensive: a re-run or a race shouldn't fail the signup itself.
  -- Losing a profile row is recoverable; losing the account isn't.
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill everyone who signed up before this migration. Without it, every
-- existing item keeps rendering its raw uuid, since the trigger only fires
-- on new rows.
insert into public.profiles (user_id, display_name)
select id, public.profile_display_name_for(email)
from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
--
-- A display name is the one piece of personal data in this schema, so the
-- read rule is "people you actually share a household with", not "any
-- authenticated user".

-- SECURITY DEFINER for the same reason as is_household_member: a policy on
-- a table that queries household_members would otherwise re-trigger RLS on
-- household_members while that evaluation is still in flight. Read-only
-- predicate, never mutates.
create function public.shares_household_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

revoke all on function public.shares_household_with(uuid) from public, anon;
grant execute on function public.shares_household_with(uuid) to authenticated;

revoke all on function public.profile_display_name_for(text) from public, anon;

alter table public.profiles enable row level security;

-- New tables aren't auto-exposed to any PostgREST role without an explicit
-- GRANT — see supabase/config.toml's auto_expose_new_tables comment.
grant select, update on public.profiles to authenticated, service_role;

create policy "profiles are readable within a household"
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid() or public.shares_household_with(user_id));

-- No insert policy on purpose: rows come from the trigger, which is
-- SECURITY DEFINER and bypasses this. A user creating arbitrary profile
-- rows has no legitimate use.
create policy "you can rename yourself"
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
